// ═══════════════════════════════════════════════════════════════
//  TELEAGENTE — Monofloor · Agente Operacional no Telegram
//  Versão B — Linguagem Natural + Dados ao Vivo
// ═══════════════════════════════════════════════════════════════

import express from 'express';
import fetch from 'node-fetch';
const app = express();
app.use(express.json());

const BOT_TOKEN    = process.env.TELEGRAM_BOT_TOKEN;
const PIPEFY_TOKEN = process.env.PIPEFY_TOKEN;
const ANTHROPIC_KEY= process.env.ANTHROPIC_API_KEY;
const PLAN_API     = process.env.PLAN_API_URL || 'https://planejamento.monofloor.cloud/api';
const PORT         = process.env.PORT || 3000;
const PIPE_OE='306410007', PIPE_OEC='306446640', FASE_EXEC='338741343', FASE_PAUSA='338994841';

async function gql(query) {
  const r = await fetch('https://api.pipefy.com/graphql', {
    method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+PIPEFY_TOKEN},
    body:JSON.stringify({query})
  });
  const d=await r.json();
  if(d.errors&&!d.data) throw new Error(d.errors[0]?.message);
  return d.data;
}

async function planApi(path) {
  try { const r=await fetch(PLAN_API+path,{headers:{'Accept':'application/json'}}); return r.ok?await r.json():null; }
  catch { return null; }
}

function send(chatId,text) {
  return fetch('https://api.telegram.org/bot'+BOT_TOKEN+'/sendMessage',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({chat_id:chatId,text,parse_mode:'Markdown'})
  });
}
function esc(t){return String(t||'—').replace(/[_*[\]()~`>#+=|{}.!-]/g,'\\$&');}
function hj(){return new Date();}
function diasAtraso(s){if(!s)return null;return Math.floor((hj()-new Date(s))/86400000);}

async function buscarObrasPausadas() {
  const [pip,plan]=await Promise.all([
    gql('{phase(id:"'+FASE_PAUSA+'"){cards(first:50){edges{node{id title fields{name value}}}}}}').catch(()=>null),
    planApi('/projects?limit=500').catch(()=>null)
  ]);
  const gf=(fields,name)=>fields?.find(f=>f.name?.toLowerCase().includes(name.toLowerCase()))?.value||null;
  const pipPaus=(pip?.phase?.cards?.edges||[]).map(e=>({
    nome:e.node.title.replace(/\(.*?\)/g,'').trim(),
    m2:gf(e.node.fields,'M²')||gf(e.node.fields,'metragem')||'?',
    consultor:gf(e.node.fields,'CONSULTOR')||'?',
    motivo:gf(e.node.fields,'motivo'),fonte:'Pipefy'
  }));
  const planPaus=(plan||[]).filter(p=>p.status==='pausado'||p.status==='pausada'||p.pipefyFase?.toLowerCase().includes('paus')).map(p=>({
    nome:p.cliente?.nome||'—',m2:p.projeto?.metragem||'?',
    consultor:p.consultor||p.responsavel||'?',cidade:p.projeto?.cidade||null,
    motivo:p.motivoPausa||null,diasPausada:p.dataPausa?diasAtraso(p.dataPausa):null,fonte:'Banco'
  }));
  const todas=[...planPaus];
  pipPaus.forEach(pp=>{if(!todas.some(p=>p.nome.toLowerCase().includes(pp.nome.toLowerCase().substring(0,10))))todas.push(pp);});
  return todas;
}

async function buscarObrasEmExecucao() {
  const data=await gql('{phase(id:"'+FASE_EXEC+'"){cards(first:50){edges{node{id title fields{name value}}}}}}');
  const gf=(fields,name)=>fields?.find(f=>f.name?.toLowerCase().includes(name.toLowerCase()))?.value||'—';
  return (data?.phase?.cards?.edges||[]).map(e=>({
    nome:e.node.title.replace(/\(.*?\)/g,'').trim(),
    m2:gf(e.node.fields,'M²'),consultor:gf(e.node.fields,'CONSULTOR OPERACIONAL')
  }));
}

async function buscarGargalos() {
  const data=await gql('{oec:pipe(id:"'+PIPE_OEC+'"){phases{id name cards_count}} oe:pipe(id:"'+PIPE_OE+'"){phases{id name cards_count}}}');
  const fp=(phases,kw)=>phases?.find(p=>p.name.toLowerCase().includes(kw.toLowerCase()));
  return {g1:fp(data?.oec?.phases,'solicitar'),g2:fp(data?.oe?.phases,'agend. vt'),g3:fp(data?.oe?.phases,'aguardando libera'),g4:fp(data?.oe?.phases,'pausada')};
}

async function buscarObrasAtrasadas() {
  const projects=await planApi('/projects?limit=500');
  if(!projects)return[];
  return projects.filter(p=>{const dp=p.estimativaPrazo?.dataPrevista;return dp&&new Date(dp)<hj()&&['em_execucao','aguardando_execucao'].includes(p.status);})
    .map(p=>({nome:p.cliente?.nome||'—',m2:p.projeto?.metragem||0,diasAtraso:Math.floor((hj()-new Date(p.estimativaPrazo.dataPrevista))/86400000),consultor:p.consultor||p.responsavel||'?',cidade:p.projeto?.cidade||null}))
    .sort((a,b)=>b.diasAtraso-a.diasAtraso);
}

async function processarMensagemNatural(texto) {
  const t=texto.toLowerCase();
  const intencoes={
    pausadas:/paus(ada|ado|adas|ados)|parou|parada|paralisa/i.test(texto),
    execucao:/execu(cao|ção|tando)|andamento|campo|rodando/i.test(texto),
    atrasadas:/atrasa(da|do|das|dos)|prazo|pendente/i.test(texto),
    gargalos:/gargal|trava(do|da)|acumul/i.test(texto),
    alerta:/alerta|urgente|critico|crítico|atenção|atencao/i.test(texto),
    semana:/semana|resumo|balanço|overview/i.test(texto),
  };
  const dadosColetados={};
  const promessas=[];
  if(intencoes.pausadas) promessas.push(buscarObrasPausadas().then(d=>{dadosColetados.pausadas=d;}));
  if(intencoes.execucao||intencoes.semana) promessas.push(buscarObrasEmExecucao().then(d=>{dadosColetados.emExecucao=d;}));
  if(intencoes.atrasadas||intencoes.semana||intencoes.alerta) promessas.push(buscarObrasAtrasadas().then(d=>{dadosColetados.atrasadas=d;}));
  if(intencoes.gargalos||intencoes.semana||intencoes.alerta) promessas.push(buscarGargalos().then(d=>{dadosColetados.gargalos=d;}));
  if(!Object.values(intencoes).some(Boolean)){
    promessas.push(buscarGargalos().then(d=>{dadosColetados.gargalos=d;}));
    promessas.push(buscarObrasEmExecucao().then(d=>{dadosColetados.emExecucao=d;}));
  }
  await Promise.all(promessas.map(p=>p.catch(e=>console.error('Erro coleta:',e.message))));
  let ctx='Data atual: '+new Date().toLocaleDateString('pt-BR')+'\n\n';
  if(dadosColetados.pausadas!==undefined){
    if(!dadosColetados.pausadas.length) ctx+='OBRAS PAUSADAS: Nenhuma obra pausada no momento.\n\n';
    else {
      ctx+='OBRAS PAUSADAS ('+dadosColetados.pausadas.length+' obras):\n';
      dadosColetados.pausadas.forEach((o,i)=>{
        ctx+=(i+1)+'. '+o.nome;
        if(o.m2&&o.m2!=='?') ctx+=' | '+o.m2+'m²';
        if(o.consultor&&o.consultor!=='?') ctx+=' | Consultor: '+o.consultor;
        if(o.cidade) ctx+=' | '+o.cidade;
        if(o.motivo) ctx+=' | Motivo: '+o.motivo;
        if(o.diasPausada) ctx+=' | '+o.diasPausada+'d pausada';
        ctx+='\n';
      });
      ctx+='\n';
    }
  }
  if(dadosColetados.emExecucao!==undefined){
    ctx+='OBRAS EM EXECUÇÃO ('+dadosColetados.emExecucao.length+'):\n';
    dadosColetados.emExecucao.forEach((o,i)=>{ctx+=(i+1)+'. '+o.nome+' | '+o.m2+'m² | '+o.consultor+'\n';});
    ctx+='\n';
  }
  if(dadosColetados.atrasadas!==undefined){
    ctx+='OBRAS ATRASADAS ('+dadosColetados.atrasadas.length+' total):\n';
    dadosColetados.atrasadas.slice(0,10).forEach((o,i)=>{ctx+=(i+1)+'. '+o.nome+' | '+o.m2+'m² | '+o.diasAtraso+'d de atraso | '+o.consultor+'\n';});
    ctx+='\n';
  }
  if(dadosColetados.gargalos!==undefined){
    const g=dadosColetados.gargalos;
    ctx+='GARGALOS PIPEFY:\n';
    if(g.g1) ctx+='G1 (Solicitar Coleta OEC): '+g.g1.cards_count+' cards\n';
    if(g.g2) ctx+='G2 (Agend. VT Aferição): '+g.g2.cards_count+' cards\n';
    if(g.g3) ctx+='G3 (Aguardando Liberação): '+g.g3.cards_count+' cards\n';
    if(g.g4) ctx+='G4 (Obra Pausada): '+g.g4.cards_count+' cards\n';
    ctx+='\n';
  }
  return ctx;
}

async function claudeAI(mensagemUsuario, contextoOperacional) {
  const r=await fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':ANTHROPIC_KEY,'anthropic-version':'2023-06-01'},
    body:JSON.stringify({
      model:'claude-sonnet-4-20250514',max_tokens:1000,
      system:'Você é o Teleagente da Monofloor. Assistente operacional de Vitor Gomes (Gerente de Qualidade).\n\nREGRAS IMPORTANTES:\n- Você recebe DADOS REAIS e AO VIVO no contexto\n- Responda com base EXATAMENTE nos dados fornecidos\n- Se dados mostram 0 obras pausadas, diga isso claramente\n- Se há obras pausadas, liste TODAS com detalhes\n- Use emojis para facilitar leitura no Telegram\n- Seja direto e analítico\n- Máximo 400 palavras\n- Responda em português',
      messages:[{role:'user',content:'DADOS AO VIVO DA OPERAÇÃO (buscados agora em tempo real):\n'+contextoOperacional+'\n\nPERGUNTA DO VITOR: '+mensagemUsuario}]
    })
  });
  const d=await r.json();
  return d.content?.[0]?.text||'Erro ao consultar IA.';
}

function cmdAjuda(){
  return '🏗 *Teleagente Monofloor* · Versão Inteligente\n\nPode me perguntar em linguagem natural:\n• "Quais obras estão pausadas?"\n• "Me mostra as obras atrasadas"\n• "O que precisa de atenção hoje?"\n\nOu use os atalhos:\n📊 */obras* — em execução agora\n⏸ */pausadas* — obras pausadas\n⌟ */atrasadas* — maiores atrasos\n🔴 */gargalos* — G1–G4 Pipefy\n📐 */aproveitamento* — prazos vs realizado\n⚠️ */alerta* — atenção hoje\n🔍 */status [nome]* — detalhe da obra\n📋 */semana* — resumo semanal\n❓ */ajuda* — esta mensagem';
}

async function cmdObras(){
  try {
    const obras=await buscarObrasEmExecucao();
    if(!obras.length)return '🏠 Nenhuma obra em execução no Pipefy agora.';
    let msg='🏗 *Obras em Execução* ('+obras.length+')\n\n';
    obras.slice(0,15).forEach((o,i)=>{msg+=(i+1)+'\\.  *'+esc(o.nome.substring(0,35))+'*\n   📐 '+esc(o.m2)+'m² · 👤 '+esc(o.consultor)+'\n';});
    return msg;
  } catch(e){return '❌ Erro: '+e.message;}
}

async function cmdPausadas(){
  try {
    const obras=await buscarObrasPausadas();
    if(!obras.length)return '✅ Nenhuma obra pausada no momento.';
    let msg='⏸ *Obras Pausadas* ('+obras.length+')\n\n';
    obras.forEach((o,i)=>{
      msg+=(i+1)+'\\.  *'+esc(o.nome.substring(0,35))+'*\n';
      if(o.m2&&o.m2!=='?')msg+='   📐 '+o.m2+'m²';
      if(o.consultor&&o.consultor!=='?')msg+=' · 👤 '+esc(o.consultor);
      if(o.cidade)msg+=' · 📍 '+esc(o.cidade);
      msg+='\n';
      if(o.motivo)msg+='   ⚠️ _'+esc(o.motivo)+'_\n';
      if(o.diasPausada)msg+='   ⌟ '+o.diasPausada+' dias pausada\n';
    });
    return msg;
  } catch(e){return '❌ Erro: '+e.message;}
}

async function cmdGargalos(){
  try {
    const g=await buscarGargalos();
    const total=[g.g1,g.g2,g.g3,g.g4].reduce((s,x)=>s+(x?.cards_count||0),0);
    const fmt=(x,e,l)=>x?e+' *'+l+'*: '+x.cards_count+' cards\n':'';
    return '🔴 *Gargalos Ativos* — '+total+' cards\n\n'+
      fmt(g.g1,'🔴','G1 — Solicitar Coleta (OEC)')+
      fmt(g.g2,'🔴','G2 — Agend. VT Aferição')+
      fmt(g.g3,'⚠️','G3 — Aguardando Liberação')+
      fmt(g.g4,'⚠️','G4 — Obra Pausada')+
      '\n_'+new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})+'_';
  } catch(e){return '❌ Erro: '+e.message;}
}

async function cmdAtrasadas(){
  try {
    const lista=await buscarObrasAtrasadas();
    if(!lista.length)return '✅ Nenhuma obra atrasada!';
    let msg='⌟ *Obras Atrasadas* ('+lista.length+')\n\n';
    lista.slice(0,12).forEach(o=>{
      const e=o.diasAtraso>90?'🔴':o.diasAtraso>30?'🟠':'🟡';
      msg+=e+' *'+esc(o.nome.substring(0,32))+'*\n   📐 '+o.m2+'m² · ⌟ '+o.diasAtraso+'d · 👤 '+esc(o.consultor)+'\n';
    });
    return msg;
  } catch(e){return '❌ Erro: '+e.message;}
}

async function cmdAproveitamento(){
  try {
    const projects=await planApi('/projects?limit=500');
    if(!projects)return '❌ Banco indisponível.';
    const emExec=projects.filter(p=>p.status==='em_execucao');
    const atr=projects.filter(p=>{const dp=p.estimativaPrazo?.dataPrevista;return dp&&new Date(dp)<hj()&&p.status==='em_execucao';});
    const pct=emExec.length?Math.round((emExec.length-atr.length)/emExec.length*100):0;
    const prog=emExec.length?Math.round(emExec.reduce((s,p)=>s+(p.progress?.percentage||0),0)/emExec.length):0;
    const m2=Math.round(emExec.reduce((s,p)=>s+(p.projeto?.metragem||0),0));
    const e=pct>=80?'🟢':pct>=50?'🟡':'🔴';
    return '📐 *Aproveitamento*\n\n'+e+' *Prazos em dia:* '+pct+'%\n   ✅ No prazo: '+(emExec.length-atr.length)+' · ⚠️ Atrasadas: '+atr.length+'\n\n🏗 *Em execução:* '+emExec.length+' obras · '+m2+'m²\n   📈 Progresso médio: '+prog+'%\n\n_'+new Date().toLocaleDateString('pt-BR')+'_';
  } catch(e){return '❌ Erro: '+e.message;}
}

async function cmdStatus(nome){
  if(!nome)return '❓ Use: `/status Nome do Cliente`\nEx: `/status Tally Feldman`';
  try {
    const projects=await planApi('/projects?limit=1037');
    if(!projects)return '❌ Banco indisponível.';
    const nL=nome.toLowerCase();
    const proj=projects.find(p=>{const pN=(p.cliente?.nome||'').toLowerCase();return nL.split(' ').filter(w=>w.length>3).some(w=>pN.includes(w));});
    if(!proj)return '🔍 Obra *"'+nome+'"* não encontrada. Tente parte do nome.';
    const prg=proj.progress?.percentage||0;
    const e=prg>=80?'🟢':prg>=50?'🟡':'🔴';
    const st={em_execucao:'▶ Em execução',pausado:'⏸ Pausada',finalizado:'✅ Finalizada'}[proj.status]||proj.status;
    let dc='—';
    const de=proj.dataEntrada?.split(' ')[0];
    if(de){const p=de.split('/');if(p.length===3)dc=Math.floor((hj()-new Date(p[2],p[1]-1,p[0]))/86400000)+'d';}
    return '🏗 *'+esc(proj.cliente?.nome||nome)+'*\n\n'+e+' *Progresso:* '+prg+'%\n📍 *Status:* '+st+'\n📐 *Metragem:* '+(proj.projeto?.metragem||'—')+'m²\n🎨 *Cor:* '+esc((proj.projeto?.cores||[]).join(', ')||'—')+'\n📅 *Dias em campo:* '+dc+'\n📍 *Cidade:* '+esc(proj.projeto?.cidade||'—')+'\n\n[Ver no sistema ⇒](https://planejamento.monofloor.cloud/app/projeto/'+proj.id+')';
  } catch(e){return '❌ Erro: '+e.message;}
}

async function cmdAlerta(){
  try {
    const ctx=await processarMensagemNatural('alerta urgente critico atrasadas gargalos pausadas');
    if(!ANTHROPIC_KEY||ANTHROPIC_KEY.includes('SUBSTITUIR')){
      const g=await buscarGargalos();const atr=await buscarObrasAtrasadas();
      let msg='🚨 *Alertas*\n\n';
      if(g.g1?.cards_count>200)msg+='🔴 G1 crítico: *'+g.g1.cards_count+' cards*\n';
      const crit=atr.filter(o=>o.diasAtraso>90);
      if(crit.length)msg+='🔴 *'+crit.length+' obra(s)* com +90d de atraso\n';
      return msg||'✅ Sem alertas críticos agora.';
    }
    return await claudeAI('O que precisa de atenção urgente na operação hoje?',ctx);
  } catch(e){return '❌ Erro: '+e.message;}
}

async function cmdSemana(){
  try {
    const ctx=await processarMensagemNatural('resumo semanal gargalos atrasadas execucao');
    if(!ANTHROPIC_KEY||ANTHROPIC_KEY.includes('SUBSTITUIR'))return '⚠️ Configure ANTHROPIC_API_KEY no Railway para o resumo semanal.\n\nUse `/aproveitamento` para dados estruturados.';
    return await claudeAI('Gere um resumo semanal executivo da operação para Vitor Gomes com: situação geral, principal alerta e uma ação prioritária para os próximos 3 dias. Use emojis. Máximo 250 palavras.',ctx);
  } catch(e){return '❌ Erro: '+e.message;}
}

app.post('/webhook',async(req,res)=>{
  res.sendStatus(200);
  const msg=req.body?.message;
  if(!msg?.text)return;
  const chatId=msg.chat.id,text=msg.text.trim();
  const [cmd,...args]=text.split(' ');const arg=args.join(' ').trim();
  console.log('[MSG] "'+text+'" | chat: '+chatId);
  try {
    let resposta;
    switch(cmd.toLowerCase()){
      case'/start':case'/ajuda':case'/help': resposta=cmdAjuda();break;
      case'/obras': resposta=await cmdObras();break;
      case'/pausadas': resposta=await cmdPausadas();break;
      case'/gargalos': resposta=await cmdGargalos();break;
      case'/atrasadas': resposta=await cmdAtrasadas();break;
      case'/aproveitamento': resposta=await cmdAproveitamento();break;
      case'/alerta': resposta=await cmdAlerta();break;
      case'/status': resposta=await cmdStatus(arg);break;
      case'/semana': resposta=await cmdSemana();break;
      default:
        if(!text.startsWith('/')){
          if(!ANTHROPIC_KEY||ANTHROPIC_KEY.includes('SUBSTITUIR')){
            resposta='⚠️ Para respostas inteligentes, configure a ANTHROPIC_API_KEY no Railway.\n\nUse */ajuda* para ver os comandos.';
          } else {
            const ctx=await processarMensagemNatural(text);
            resposta=await claudeAI(text,ctx);
          }
        } else {
          resposta='❌ Comando não reconhecido. Use */ajuda*';
        }
    }
    await send(chatId,resposta);
  } catch(e){console.error('[ERROR]',e.message);await send(chatId,'❌ Erro interno: '+e.message);}
});

app.get('/',(req,res)=>res.json({status:'ok',service:'Teleagente Monofloor',version:'2.0.0-B',timestamp:new Date().toISOString()}));

app.listen(PORT,()=>{
  console.log('🤖 Teleagente v2.0 rodando na porta '+PORT);
  if(!BOT_TOKEN)console.warn('⚠️ TELEGRAM_BOT_TOKEN não configurado');
  if(!PIPEFY_TOKEN)console.warn('⚠️ PIPEFY_TOKEN não configurado');
  if(!ANTHROPIC_KEY||ANTHROPIC_KEY.includes('SUBSTITUIR'))console.warn('⚠️ ANTHROPIC_API_KEY não configurado');
});