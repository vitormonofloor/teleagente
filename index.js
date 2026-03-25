import express from 'express';
import fetch from 'node-fetch';
const app = express();
app.use(express.json());

const BOT_TOKEN    = process.env.TELEGRAM_BOT_TOKEN;
const PIPEFY_TOKEN = process.env.PIPEFY_TOKEN;
const ANTHROPIC_KEY= process.env.ANTHROPIC_API_KEY;
const PLAN_API     = process.env.PLAN_API_URL || 'https://planejamento.monofloor.cloud/api';
const PORT         = process.env.PORT || 3000;
const PIPE_OE  = '306410007';
const PIPE_OEC = '306446640';
const FASE_EXEC  = '338741343';

async function gql(query) {
  const r = await fetch('https://api.pipefy.com/graphql', {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+PIPEFY_TOKEN},
    body:JSON.stringify({query})
  });
  const d = await r.json();
  if(d.errors&&!d.data) throw new Error(d.errors[0]?.message);
  return d.data;
}

async function planApi(path) {
  try {
    const r = await fetch(PLAN_API+path,{headers:{'Accept':'application/json'}});
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

async function ai(prompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':ANTHROPIC_KEY,'anthropic-version':'2023-06-01'},
    body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:800,messages:[{role:'user',content:prompt}],
      system:'Voce e o Teleagente da Monofloor. Assistente operacional de Vitor Gomes. Responda em portugues, direto e analitico. Use emojis. Max 400 palavras.'})
  });
  const d=await r.json();
  return d.content?.[0]?.text||'Erro IA.';
}

function send(chatId,text) {
  return fetch('https://api.telegram.org/bot'+BOT_TOKEN+'/sendMessage',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({chat_id:chatId,text,parse_mode:'Markdown'})
  });
}

function esc(t){return String(t||'-').replace(/[_*[]()~`>#+=|{}.!-]/g,'\\$&');}

function cmdAjuda(){
  return `🏗 *Teleagente Monofloor*

Comandos:
📊 */obras* - obras em execucao
⌟ */atrasadas* - obras atrasadas
🔴 */gargalos* - G1-G4 Pipefy
📐 */aproveitamento* - prazos vs realizado
⚠️ */alerta* - atencao hoje
🔍 */status [nome]* - detalhes da obra
📋 */semana* - resumo semanal
❓ */ajuda* - esta mensagem

_Exemplo: /status Tally Feldman_`;
}

async function cmdObras(){
  try {
    const data = await gql(`{phase(id:"${FASE_EXEC}"){cards(first:30){edges{node{id title fields{name value}}}}}}`);
    const cards=data?.phase?.cards?.edges||[];
    if(!cards.length) return '🏠 Nenhuma obra em execucao.';
    const getF=(fields,name)=>fields.find(f=>f.name?.toLowerCase().includes(name.toLowerCase()))?.value||'-';
    let msg=`🏗 *Obras em Execucao* (${cards.length})\n\n`;
    cards.slice(0,15).forEach((e,i)=>{
      const c=e.node;
      msg+=`${i+1}\\. *${esc(c.title.replace(/\\(.*?\\)/g,'').trim().substring(0,35))}*\n`;
      msg+=`   📐 ${esc(getF(c.fields,'M² TOTAL'))}m² · 👤 ${esc(getF(c.fields,'CONSULTOR OPERACIONAL'))}\n`;
    });
    return msg;
  } catch(e){return '❌ Erro obras: '+e.message;}
}

async function cmdGargalos(){
  try {
    const data=await gql(`{oec:pipe(id:"${PIPE_OEC}"){phases{id name cards_count}} oe:pipe(id:"${PIPE_OE}"){phases{id name cards_count}}}`);
    const fp=(phases,kw)=>phases.find(p=>p.name.toLowerCase().includes(kw.toLowerCase()));
    const g1=fp(data?.oec?.phases||[],'solicitar');
    const g2=fp(data?.oe?.phases||[],'agend. vt');
    const g3=fp(data?.oe?.phases||[],'aguardando libera');
    const g4=fp(data?.oe?.phases||[],'pausada');
    const total=[g1,g2,g3,g4].reduce((s,g)=>s+(g?.cards_count||0),0);
    const fmt=(g,e,l)=>g?`${e} *${l}*: ${g.cards_count} cards\n`:'';
    return `🔴 *Gargalos Ativos* - ${total} cards\n\n`+
      fmt(g1,'🔴','G1 - Solicitar Coleta (OEC)')+
      fmt(g2,'🔴','G2 - Agend. VT Afericao')+
      fmt(g3,'⚠️','G3 - Aguardando Liberacao')+
      fmt(g4,'⚠️','G4 - Obra Pausada')+
      `\n_${new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}_`;
  } catch(e){return '❌ Erro gargalos: '+e.message;}
}

async function cmdAtrasadas(){
  try {
    const projects=await planApi('/projects?limit=500');
    if(!projects) return '❌ Banco indisponivel.';
    const hoje=new Date();
    const lista=projects
      .filter(p=>{const dp=p.estimativaPrazo?.dataPrevista;return dp&&new Date(dp)<hoje&&['em_execucao','aguardando_execucao'].includes(p.status);})
      .map(p=>({nome:p.cliente?.nome||'-',m2:p.projeto?.metragem||0,d:Math.floor((hoje-new Date(p.estimativaPrazo.dataPrevista))/86400000)}))
      .sort((a,b)=>b.d-a.d).slice(0,12);
    if(!lista.length) return '✅ Nenhuma obra atrasada!';
    let msg=`⌟ *Obras Atrasadas* (${lista.length})\n\n`;
    lista.forEach(o=>{
      const e=o.d>90?'🔴':o.d>30?'🟠':'🟡';
      msg+=`${e} *${esc(o.nome.substring(0,32))}*\n   📐 ${o.m2}m² · ⌟ ${o.d}d atrasada\n`;
    });
    return msg;
  } catch(e){return '❌ Erro: '+e.message;}
}

async function cmdAproveitamento(){
  try {
    const projects=await planApi('/projects?limit=500');
    if(!projects) return '❌ Banco indisponivel.';
    const emExec=projects.filter(p=>p.status==='em_execucao');
    const atr=projects.filter(p=>{const dp=p.estimativaPrazo?.dataPrevista;return dp&&new Date(dp)<new Date()&&p.status==='em_execucao';});
    const pct=emExec.length?Math.round((emExec.length-atr.length)/emExec.length*100):0;
    const prog=emExec.length?Math.round(emExec.reduce((s,p)=>s+(p.progress?.percentage||0),0)/emExec.length):0;
    const m2=Math.round(emExec.reduce((s,p)=>s+(p.projeto?.metragem||0),0));
    const e=pct>=80?'🟢':pct>=50?'🟡':'🔴';
    return `📐 *Aproveitamento*\n\n${e} *Prazos em dia:* ${pct}%\n   ✅ No prazo: ${emExec.length-atr.length} · ⚠️ Atrasadas: ${atr.length}\n\n🏗 *Em execucao:* ${emExec.length} obras · ${m2}m²\n   📈 Progresso medio: ${prog}%\n\n_${new Date().toLocaleDateString('pt-BR')}_`;
  } catch(e){return '❌ Erro: '+e.message;}
}

async function cmdAlerta(){
  try {
    const [gD,projects]=await Promise.all([
      gql(`{oe:pipe(id:"${PIPE_OE}"){phases{name cards_count}} oec:pipe(id:"${PIPE_OEC}"){phases{name cards_count}}}`).catch(()=>null),
      planApi('/projects?limit=500')
    ]);
    let alertas=[];
    if(gD){const g1=gD.oec?.phases?.find(p=>p.name.toLowerCase().includes('solicitar'));if(g1&&g1.cards_count>200)alertas.push('🔴 G1 critico: *'+g1.cards_count+' cards* parados');}
    if(projects){
      const hoje=new Date(),amanha=new Date();amanha.setDate(amanha.getDate()+1);
      const prox=projects.filter(p=>{const d=new Date(p.estimativaPrazo?.dataPrevista);return d>=hoje&&d<=amanha;});
      if(prox.length)alertas.push('⚡ *'+prox.length+' obra(s)* iniciam hoje/amanha');
      const crit=projects.filter(p=>p.status==='em_execucao'&&Math.floor((hoje-new Date(p.estimativaPrazo?.dataPrevista))/86400000)>90);
      if(crit.length)alertas.push('🔴 *'+crit.length+' obra(s)* com mais de 90d de atraso');
    }
    if(!alertas.length) return '✅ *Sem alertas criticos agora*\n\nOperacao dentro do esperado.';
    return '🚨 *Alertas Operacionais*\n\n'+alertas.join('\n')+`\n\n_${new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}_`;
  } catch(e){return '❌ Erro: '+e.message;}
}

async function cmdStatus(nome){
  if(!nome) return '❓ Use: `/status Nome do Cliente`';
  try {
    const projects=await planApi('/projects?limit=1037');
    if(!projects) return '❌ Banco indisponivel.';
    const nL=nome.toLowerCase();
    const proj=projects.find(p=>{const pN=(p.cliente?.nome||'').toLowerCase();return nL.split(' ').filter(w=>w.length>3).some(w=>pN.includes(w));});
    if(!proj) return `🔍 Obra *"${nome}"* nao encontrada. Tente parte do nome.`;
    const prg=proj.progress?.percentage||0;
    const e=prg>=80?'🟢':prg>=50?'🟡':'🔴';
    const st={em_execucao:'▶ Em execucao',aguardando_execucao:'⏳ Aguardando',pausado:'⏸ Pausada',finalizado:'✅ Finalizada',concluido:'✅ Concluida'}[proj.status]||proj.status;
    let dc='-';
    const de=proj.dataEntrada?.split(' ')[0];
    if(de){const p=de.split('/');if(p.length===3)dc=Math.floor((new Date()-new Date(p[2],p[1]-1,p[0]))/86400000)+'d';}
    return `🏗 *${esc(proj.cliente?.nome||nome)}*\n\n${e} *Progresso:* ${prg}%\n📍 *Status:* ${st}\n📐 *Metragem:* ${proj.projeto?.metragem||'-'}m²\n🎨 *Cor:* ${esc((proj.projeto?.cores||[]).join(', ')||'-')}\n⌟ *Prazo:* ${proj.estimativaPrazo?.diasTotal||'-'}d\n📅 *Dias em campo:* ${dc}\n\n[Ver no sistema ⇒](https://planejamento.monofloor.cloud/app/projeto/${proj.id})`;
  } catch(e){return '❌ Erro: '+e.message;}
}

async function cmdSemana(){
  try {
    const [gD,projects]=await Promise.all([
      gql(`{oec:pipe(id:"${PIPE_OEC}"){phases{name cards_count}} oe:pipe(id:"${PIPE_OE}"){phases{name cards_count}}}`).catch(()=>null),
      planApi('/projects?limit=500')
    ]);
    const emExec=projects?.filter(p=>p.status==='em_execucao')||[];
    const atr=projects?.filter(p=>{const dp=p.estimativaPrazo?.dataPrevista;return dp&&new Date(dp)<new Date()&&p.status==='em_execucao';})||[];
    const g1=gD?.oec?.phases?.find(p=>p.name.toLowerCase().includes('solicitar'));
    const prog=emExec.length?Math.round(emExec.reduce((s,p)=>s+(p.progress?.percentage||0),0)/emExec.length):0;
    const prompt=`Contexto Monofloor esta semana:
- Obras em execucao: ${emExec.length} (${Math.round(emExec.reduce((s,p)=>s+(p.projeto?.metragem||0),0))}m2)
- Progresso medio: ${prog}%
- Atrasadas: ${atr.length}
- G1: ${g1?.cards_count||'?'} cards parados
Gere resumo semanal executivo com: situacao geral, principal alerta, uma acao prioritaria 3 dias. Emojis. Max 250 palavras.`;
    return await ai(prompt);
  } catch(e){return '❌ Erro resumo: '+e.message;}
}

app.post('/webhook',async(req,res)=>{
  res.sendStatus(200);
  const msg=req.body?.message;
  if(!msg?.text)return;
  const chatId=msg.chat.id;
  const text=msg.text.trim();
  const [cmd,...args]=text.split(' ');
  const arg=args.join(' ').trim();
  console.log('[CMD]',cmd,'chat:',chatId,'arg:',arg);
  try {
    let resp;
    switch(cmd.toLowerCase()){
      case'/start':case'/ajuda':case'/help': resp=cmdAjuda();break;
      case'/obras': resp=await cmdObras();break;
      case'/gargalos': resp=await cmdGargalos();break;
      case'/atrasadas': resp=await cmdAtrasadas();break;
      case'/aproveitamento': resp=await cmdAproveitamento();break;
      case'/alerta': resp=await cmdAlerta();break;
      case'/status': resp=await cmdStatus(arg);break;
      case'/semana': resp=await cmdSemana();break;
      default: if(!text.startsWith('/')) resp=await ai('Vitor Gomes perguntou: "'+text+'". Responda direto em portugues sobre a operacao Monofloor.');
               else resp='❌ Comando nao reconhecido. Use */ajuda*';
    }
    await send(chatId,resp);
  } catch(e){ console.error('[ERROR]',e); await send(chatId,'❌ Erro interno: '+e.message); }
});

app.get('/',(req,res)=>res.json({status:'ok',service:'Teleagente Monofloor',version:'1.0.0-A',timestamp:new Date().toISOString()}));

app.listen(PORT,()=>{
  console.log('Teleagente rodando na porta '+PORT);
  if(!BOT_TOKEN) console.warn('TELEGRAM_BOT_TOKEN nao configurado');
  if(!PIPEFY_TOKEN) console.warn('PIPEFY_TOKEN nao configurado');
  if(!ANTHROPIC_KEY) console.warn('ANTHROPIC_API_KEY nao configurado');
});
