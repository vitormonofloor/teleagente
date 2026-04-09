const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

// ââ ENV ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PIPEFY_TOKEN = process.env.PIPEFY_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const PLAN_URL = process.env.PLAN_API_URL || 'https://planejamento.monofloor.cloud/api';
const TG_API = `https://api.telegram.org/bot${TG_TOKEN}`;

const VITOR_CHAT_ID = process.env.VITOR_CHAT_ID; // Vitor's private chat for briefings
const PIPE_OE = 306410007;
const PIPE_OEC = 306446640;
const FASE_EXEC = 338741343;

// ââ ACTIVE MODE â TRACKED GROUPS âââââââââââââââââââââââââââââââââââ
// Groups are auto-registered when bot receives a message from them
const trackedGroups = {}; // { chatId: { name, lastActivity, lastMessage, registered } }

// ââ KEYWORD DETECTION SYSTEM âââââââââââââââââââââââââââââââââââââââ

const KEYWORDS = {
  finalizado: {
    label: 'â Obra Finalizada',
    gravidade: 'marco',
    palavras: [
      'finalizado', 'finalizamos', 'terminamos', 'obra concluÃ­da',
      'obra concluida', 'entregue', 'aprovado pelo cliente',
      'vistoria aprovada', 'tudo pronto', 'obra pronta',
      'concluÃ­do', 'concluido', 'finalizada', 'entrega realizada',
      'cliente aprovou', 'vistoria ok', 'aprovaÃ§Ã£o ok',
    ],
    minMatch: 1,
    resposta: 'â *Obra Finalizada detectada!*\nRegistrado automaticamente na timeline.',
  },
  pausa: {
    label: 'â¸ï¸ Obra Pausada',
    gravidade: 'alta',
    palavras: [
      'obra pausada', 'pausamos', 'paramos', 'parou a obra',
      'aguardando definiÃ§Ã£o', 'sem previsÃ£o de retomada',
      'cliente pediu pausa', 'obra parada', 'interrompemos',
    ],
    minMatch: 1,
    resposta: 'â¸ï¸ *Pausa detectada!*\nRegistrado na timeline. Motivo serÃ¡ solicitado.',
  },
  sem_aplicador: {
    label: 'ð« Sem Aplicador',
    gravidade: 'alta',
    palavras: [
      'sem aplicador', 'nÃ£o compareceu', 'nao compareceu',
      'nÃ£o veio', 'nao veio', 'faltou', 'nÃ£o foi', 'nao foi',
      'sÃ³ um aplicador', 'so um aplicador', 'sozinho na obra',
      'sem equipe', 'nÃ£o conseguiu ir', 'nao conseguiu ir',
      'problemas pessoais', 'aplicador faltou',
    ],
    minMatch: 1,
    resposta: 'ð« *AusÃªncia de aplicador detectada!*\nDia registrado como perda operacional.',
  },
  qualidade: {
    label: 'â ï¸ Problema de Qualidade',
    gravidade: 'alta',
    palavras: [
      'desplacamento', 'desplacou', 'manchou', 'mancha',
      'bolha', 'trinca', 'trincou', 'irregular', 'defeito',
      'mal executado', 'retocar', 'retoque', 'reaplicar',
      'tela aparente', 'telas aparentes', 'falha', 'rachadura',
      'amassado', 'amassamento', 'infiltraÃ§Ã£o', 'infiltrou',
      'espelhamento', 'rejunte aparente', 'soltou', 'descascou',
    ],
    minMatch: 1,
    resposta: 'â ï¸ *Problema de qualidade detectado!*\nRegistrado para anÃ¡lise.',
  },
  comunicacao: {
    label: 'ð¬ Falha de ComunicaÃ§Ã£o',
    gravidade: 'media',
    palavras: [
      'alinhou direto', 'combinou com o cliente', 'sem comunicar',
      'sem passar pela operaÃ§Ã£o', 'nÃ£o informou', 'nao informou',
      'sem devolutiva', 'sem resposta', 'nÃ£o respondeu',
      'cliente pediu direto', 'repassou prazo direto',
      'sem registro no grupo',
    ],
    minMatch: 1,
    resposta: 'ð¬ *Falha de comunicaÃ§Ã£o detectada!*\nRegistrado como ocorrÃªncia de processo.',
  },
  cliente: {
    label: 'ð¤ Impedimento do Cliente',
    gravidade: 'media',
    palavras: [
      'cliente nÃ£o pÃ´de', 'cliente nao pode', 'sem acesso',
      'obra fechada', 'remarcaÃ§Ã£o', 'remarcar',
      'portaria nÃ£o liberou', 'portaria nao liberou',
      'cliente viajou', 'indisponÃ­vel', 'indisponivel',
      'mudou o escopo', 'aguardando aprovaÃ§Ã£o do cliente',
    ],
    minMatch: 1,
    resposta: 'ð¤ *Impedimento do cliente detectado!*\nRegistrado como causa externa.',
  },
  clima: {
    label: 'ð§ï¸ Clima / Ambiente',
    gravidade: 'media',
    palavras: [
      'chuva', 'chovendo', 'umidade alta', 'vazamento',
      'goteira', 'alagou', 'molhado', 'nÃ£o secou', 'nao secou',
      'demora pra secar', 'umidade atrasando',
    ],
    minMatch: 1,
    resposta: 'ð§ï¸ *CondiÃ§Ã£o climÃ¡tica detectada!*\nRegistrado como causa externa.',
  },
  material_extra: {
    label: 'ð¦ Material Extra',
    gravidade: 'media',
    palavras: [
      'material extra', 'faltou material', 'acabou o material',
      'solicitar material', 'pedir material', 'produÃ§Ã£o extra',
      'material adicional', 'faltou massa', 'faltou verniz',
      'faltou primer', 'faltou selador',
    ],
    minMatch: 1,
    resposta: 'ð¦ *SolicitaÃ§Ã£o de material extra detectada!*\nRegistrado na timeline.',
  },
  diario: {
    label: 'ð¸ DiÃ¡rio de Obra',
    gravidade: 'info',
    palavras: [
      'aplicamos hoje', 'executamos', 'primeira demÃ£o',
      'segunda demÃ£o', 'terceira demÃ£o', 'lixamento concluÃ­do',
      'selador aplicado', 'verniz aplicado', 'primer aplicado',
      'massa aplicada', 'diÃ¡rio de obra', 'diario de obra',
    ],
    minMatch: 1,
    resposta: null, // DiÃ¡rio nÃ£o precisa de confirmaÃ§Ã£o
  },
};

// ââ STORAGE (in-memory â persists while Railway is up) âââââââââââââ

const ocorrencias = {}; // { chatId: [{ tipo, msg, autor, data, keywords }] }
const obraStatus = {};  // { chatId: { statusReal, ultimoSinal, data } }
const diasRegistro = {}; // { chatId: { [date]: true } } â para detectar dias cegos

// ââ DETECTION ENGINE âââââââââââââââââââââââââââââââââââââââââââââââ

function detectKeywords(text) {
  if (!text) return [];
  const lower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const textNorm = text.toLowerCase();
  const matches = [];

  for (const [tipo, config] of Object.entries(KEYWORDS)) {
    const found = config.palavras.filter(kw => {
      const kwNorm = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return lower.includes(kwNorm) || textNorm.includes(kw);
    });

    if (found.length >= config.minMatch) {
      matches.push({ tipo, label: config.label, gravidade: config.gravidade, keywords: found, resposta: config.resposta });
    }
  }

  // Priorizar: finalizado > pausa > sem_aplicador > qualidade > outros > diario
  const prioOrder = ['finalizado', 'pausa', 'sem_aplicador', 'qualidade', 'comunicacao', 'cliente', 'clima', 'material_extra', 'diario'];
  matches.sort((a, b) => prioOrder.indexOf(a.tipo) - prioOrder.indexOf(b.tipo));

  return matches;
}

function registrarOcorrencia(chatId, tipo, mensagem, autor, keywords) {
  if (!ocorrencias[chatId]) ocorrencias[chatId] = [];
  const registro = {
    tipo,
    mensagem: mensagem.substring(0, 200),
    autor,
    data: new Date().toISOString(),
    keywords,
  };
  ocorrencias[chatId].push(registro);

  // Atualizar status real da obra se for sinal forte
  if (['finalizado', 'pausa'].includes(tipo)) {
    obraStatus[chatId] = {
      statusReal: tipo,
      ultimoSinal: registro,
      data: registro.data,
    };
  }

  // Marcar dia com registro (para detecÃ§Ã£o de dia cego)
  const hoje = new Date().toISOString().split('T')[0];
  if (!diasRegistro[chatId]) diasRegistro[chatId] = {};
  diasRegistro[chatId][hoje] = true;

  return registro;
}

// ââ TELEGRAM HELPERS âââââââââââââââââââââââââââââââââââââââââââââââ

async function sendMsg(chatId, text, opts = {}) {
  await fetch(`${TG_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', ...opts }),
  });
}

// ââ PIPEFY HELPERS âââââââââââââââââââââââââââââââââââââââââââââââââ

async function pipefyQuery(query) {
  const r = await fetch('https://api.pipefy.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${PIPEFY_TOKEN}` },
    body: JSON.stringify({ query }),
  });
  return r.json();
}

async function getObrasExecucao() {
  const d = await pipefyQuery(`{ phase(id: ${FASE_EXEC}) { cards(first: 30) { edges { node { title due_date current_phase_age fields { name value } } } } } }`);
  return d.data.phase.cards.edges.map(e => {
    const n = e.node;
    const gf = (k) => { const f = n.fields.find(x => x.name.toLowerCase().startsWith(k)); return f ? f.value : null; };
    return { title: n.title, due: n.due_date, age: Math.round(n.current_phase_age / 86400), prazo: gf('prazo'), tipo: gf('tipo') };
  });
}

async function getGargalos() {
  const [oe, oec] = await Promise.all([
    pipefyQuery(`{ pipe(id: ${PIPE_OE}) { phases { name cards_count } } }`),
    pipefyQuery(`{ pipe(id: ${PIPE_OEC}) { phases { name cards_count } } }`),
  ]);
  const fases = oe.data.pipe.phases.filter(p => p.cards_count > 15).map(p => `â¢ *${p.name}*: ${p.cards_count} cards`);
  const oecFases = oec.data.pipe.phases.filter(p => p.cards_count > 10).map(p => `â¢ *${p.name}*: ${p.cards_count} cards`);
  return { oe: fases, oec: oecFases };
}

// ââ PLAN API HELPERS âââââââââââââââââââââââââââââââââââââââââââââââ

async function getAtrasadas() {
  try {
    const r = await fetch(`${PLAN_URL}/projects?limit=500`);
    const d = await r.json();
    const projects = d.projects || d || [];
    return projects.filter(p => p.status === 'delayed' || p.delayed).slice(0, 15);
  } catch { return []; }
}

async function getAproveitamento() {
  try {
    const r = await fetch(`${PLAN_URL}/projects?limit=500`);
    const d = await r.json();
    const projects = d.projects || d || [];
    const total = projects.length;
    const onTime = projects.filter(p => !p.delayed && p.status !== 'delayed').length;
    return { total, onTime, pct: total > 0 ? ((onTime / total) * 100).toFixed(1) : 0 };
  } catch { return { total: 0, onTime: 0, pct: 0 }; }
}

// ââ AI HELPER ââââââââââââââââââââââââââââââââââââââââââââââââââââââ

async function ai(prompt) {
  if (!ANTHROPIC_KEY) return 'Chave Anthropic nÃ£o configurada. Configure ANTHROPIC_API_KEY no Railway.';
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] }),
    });
    const d = await r.json();
    return d.content?.[0]?.text || 'Sem resposta da IA.';
  } catch (e) { return `Erro IA: ${e.message}`; }
}

// ââ COMMAND HANDLERS âââââââââââââââââââââââââââââââââââââââââââââââ

const commands = {
  '/obras': async (chatId) => {
    const obras = await getObrasExecucao();
    if (!obras.length) return sendMsg(chatId, 'Nenhuma obra em execuÃ§Ã£o.');
    let msg = `ð¨ *Obras em ExecuÃ§Ã£o* (${obras.length})\n\n`;
    obras.forEach(o => {
      const status = obraStatus[chatId]; // Check for telegram overrides
      const dias = o.age;
      const emoji = dias > (parseInt(o.prazo) || 30) ? 'ð´' : dias > (parseInt(o.prazo) || 30) * 0.7 ? 'ð¡' : 'ð¢';
      msg += `${emoji} *${o.title}*\n   ${dias}d na fase | Prazo: ${o.prazo || 'â'}d | ${o.tipo || 'NOVA'}\n\n`;
    });
    return sendMsg(chatId, msg);
  },

  '/gargalos': async (chatId) => {
    const g = await getGargalos();
    let msg = 'ð§ *Gargalos Ativos*\n\n';
    if (g.oe.length) msg += '*OPERAÃÃES:*\n' + g.oe.join('\n') + '\n\n';
    if (g.oec.length) msg += '*CORES:*\n' + g.oec.join('\n');
    return sendMsg(chatId, msg || 'Nenhum gargalo crÃ­tico no momento.');
  },

  '/atrasadas': async (chatId) => {
    const obras = await getAtrasadas();
    if (!obras.length) return sendMsg(chatId, 'â Nenhuma obra atrasada!');
    let msg = `ð´ *Obras Atrasadas* (${obras.length})\n\n`;
    obras.forEach(o => { msg += `â¢ *${o.name || o.title}*\n`; });
    return sendMsg(chatId, msg);
  },

  '/aproveitamento': async (chatId) => {
    const a = await getAproveitamento();
    const emoji = a.pct >= 80 ? 'ð¢' : a.pct >= 60 ? 'ð¡' : 'ð´';
    return sendMsg(chatId, `${emoji} *Aproveitamento: ${a.pct}%*\n\n${a.onTime} de ${a.total} obras no prazo.`);
  },

  '/alerta': async (chatId) => {
    const [g, a] = await Promise.all([getGargalos(), getAtrasadas()]);
    let msg = 'ð¨ *Painel de Alertas*\n\n';
    msg += `â¢ ${a.length} obras atrasadas\n`;
    msg += `â¢ ${g.oe.length + g.oec.length} gargalos ativos\n`;

    // Include telegram signals
    const signals = Object.entries(obraStatus).filter(([, v]) => v.statusReal === 'finalizado' || v.statusReal === 'pausa');
    if (signals.length) {
      msg += `\nâï¸ *Sinais do Telegram:*\n`;
      signals.forEach(([, v]) => {
        const emoji = v.statusReal === 'finalizado' ? 'â' : 'â¸ï¸';
        msg += `${emoji} ${v.ultimoSinal.mensagem.substring(0, 60)}...\n`;
      });
    }
    return sendMsg(chatId, msg);
  },

  '/status': async (chatId, args) => {
    if (!args) return sendMsg(chatId, 'Use: /status [nome do cliente]');
    try {
      const r = await fetch(`${PLAN_URL}/projects?limit=500`);
      const d = await r.json();
      const projects = d.projects || d || [];
      const found = projects.filter(p => (p.name || p.title || '').toLowerCase().includes(args.toLowerCase()));
      if (!found.length) return sendMsg(chatId, `Nenhuma obra encontrada para "${args}".`);
      let msg = '';
      found.slice(0, 5).forEach(p => { msg += `ð *${p.name || p.title}*\nStatus: ${p.status || 'â'}\n\n`; });
      return sendMsg(chatId, msg);
    } catch { return sendMsg(chatId, 'Erro ao consultar planejamento.'); }
  },

  '/ocorrencias': async (chatId) => {
    const ocs = ocorrencias[chatId];
    if (!ocs || !ocs.length) return sendMsg(chatId, 'ð Nenhuma ocorrÃªncia registrada neste grupo.');
    let msg = `ð *OcorrÃªncias Registradas* (${ocs.length})\n\n`;
    ocs.slice(-10).forEach(o => {
      const data = new Date(o.data).toLocaleDateString('pt-BR');
      msg += `${KEYWORDS[o.tipo]?.label || o.tipo} â ${data}\n_${o.mensagem.substring(0, 60)}_\n\n`;
    });
    return sendMsg(chatId, msg);
  },

  '/resumo': async (chatId) => {
    const ocs = ocorrencias[chatId] || [];
    const status = obraStatus[chatId];
    const dias = diasRegistro[chatId] || {};
    const totalDias = Object.keys(dias).length;

    let msg = 'ð *Resumo da Obra*\n\n';
    msg += `ð Dias com registro: *${totalDias}*\n`;
    msg += `ð Total ocorrÃªncias: *${ocs.length}*\n`;

    // Count by type
    const byType = {};
    ocs.forEach(o => { byType[o.tipo] = (byType[o.tipo] || 0) + 1; });
    Object.entries(byType).forEach(([tipo, count]) => {
      msg += `   ${KEYWORDS[tipo]?.label || tipo}: ${count}\n`;
    });

    if (status) {
      msg += `\nâï¸ Status real: *${status.statusReal.toUpperCase()}*`;
    }
    return sendMsg(chatId, msg);
  },

  '/ajuda': async (chatId) => {
    return sendMsg(chatId, `ð¤ *Teleagente Monofloor*\n\n` +
      `*Comandos:*\n` +
      `/obras â Obras em execuÃ§Ã£o\n` +
      `/gargalos â Gargalos ativos\n` +
      `/atrasadas â Obras atrasadas\n` +
      `/aproveitamento â Taxa no prazo\n` +
      `/alerta â Painel de alertas\n` +
      `/status [nome] â Buscar obra\n` +
      `/ocorrencias â HistÃ³rico do grupo\n` +
      `/resumo â Resumo da obra\n\n` +
      `*ClassificaÃ§Ã£o manual:*\n` +
      `/diario [texto] â Registrar diÃ¡rio\n` +
      `/ocorrencia [tipo] â Registrar evento\n` +
      `/finalizar â Marcar como concluÃ­da\n` +
      `/pausa [motivo] â Pausar obra\n` +
      `/retomar â Retomar obra\n\n` +
      `*Modo Ativo (proativo):*\n` +
      `/briefing â Disparar briefing matinal agora\n` +
      `/digest â Disparar digest diÃ¡rio agora\n` +
      `/grupos â Ver grupos rastreados\n\n` +
      `*Tipos de ocorrÃªncia:*\n` +
      `sem\\_aplicador, qualidade, comunicacao, cliente, clima, material\n\n` +
      `ð¤ DetecÃ§Ã£o automÃ¡tica ativa em grupos de obra.`
    );
  },

  '/diario': async (chatId, args, from) => {
    if (!args) return sendMsg(chatId, 'Use: /diario [descriÃ§Ã£o do que foi executado hoje]');
    registrarOcorrencia(chatId, 'diario', args, from, ['diÃ¡rio manual']);
    return sendMsg(chatId, 'ð¸ DiÃ¡rio registrado!');
  },

  '/ocorrencia': async (chatId, args, from) => {
    if (!args) return sendMsg(chatId, 'Use: /ocorrencia [tipo] [descriÃ§Ã£o]\nTipos: sem_aplicador, qualidade, comunicacao, cliente, clima, material');
    const parts = args.split(' ');
    const tipo = parts[0];
    const desc = parts.slice(1).join(' ') || 'Sem descriÃ§Ã£o';
    if (!KEYWORDS[tipo] && tipo !== 'material') return sendMsg(chatId, `Tipo "${tipo}" nÃ£o reconhecido.\nTipos vÃ¡lidos: sem_aplicador, qualidade, comunicacao, cliente, clima, material`);
    const tipoFinal = tipo === 'material' ? 'material_extra' : tipo;
    registrarOcorrencia(chatId, tipoFinal, desc, from, ['comando manual']);
    return sendMsg(chatId, `${KEYWORDS[tipoFinal]?.label || tipo} registrado!`);
  },

  '/finalizar': async (chatId, args, from) => {
    registrarOcorrencia(chatId, 'finalizado', args || 'Obra finalizada via comando', from, ['comando /finalizar']);
    return sendMsg(chatId, 'â *Obra marcada como FINALIZADA!*\n\nâ ï¸ Lembre de mover o card no Pipefy para "Obra ConcluÃ­da".');
  },

  '/pausa': async (chatId, args, from) => {
    registrarOcorrencia(chatId, 'pausa', args || 'Obra pausada via comando', from, ['comando /pausa']);
    return sendMsg(chatId, 'â¸ï¸ *Obra marcada como PAUSADA!*\nMotivo: ' + (args || 'NÃ£o informado'));
  },

  '/retomar': async (chatId, args, from) => {
    if (obraStatus[chatId]?.statusReal === 'pausa') {
      delete obraStatus[chatId];
    }
    registrarOcorrencia(chatId, 'diario', 'Obra retomada' + (args ? ': ' + args : ''), from, ['comando /retomar']);
    return sendMsg(chatId, 'â¶ï¸ *Obra RETOMADA!*');
  },

  '/semana': async (chatId) => {
    const [obras, atrasadas, aproveitamento] = await Promise.all([
      getObrasExecucao(),
      getAtrasadas(),
      getAproveitamento(),
    ]);
    const prompt = `Dados Monofloor esta semana:
- ${obras.length} obras em execuÃ§Ã£o
- ${atrasadas.length} atrasadas
- Aproveitamento: ${aproveitamento.pct}%
Gere um resumo executivo semanal em portuguÃªs, direto e objetivo, com emojis.`;
    const resp = await ai(prompt);
    return sendMsg(chatId, resp);
  },

  '/briefing': async (chatId) => {
    await briefingMatinal();
    if (chatId !== parseInt(VITOR_CHAT_ID)) {
      return sendMsg(chatId, 'ð Briefing disparado! Enviado para o chat do Vitor.');
    }
  },

  '/id': async (chatId) => {
    return sendMsg(chatId, `ð Seu Chat ID: \`${chatId}\`\n\nAdicione como VITOR_CHAT_ID no Railway para receber briefings.`);
  },

  '/digest': async (chatId) => {
    await digestDiario();
    if (chatId !== parseInt(VITOR_CHAT_ID)) {
      return sendMsg(chatId, 'ð Digest disparado! Enviado para o chat do Vitor.');
    }
  },

  '/grupos': async (chatId) => {
    const groups = Object.entries(trackedGroups);
    if (!groups.length) return sendMsg(chatId, 'Nenhum grupo rastreado ainda. O bot registra automaticamente ao receber mensagens em grupos.');
    let msg = `ð¡ *Grupos Rastreados* (${groups.length})\n\n`;
    groups.forEach(([id, g]) => {
      const lastAct = new Date(g.lastActivity).toLocaleString('pt-BR');
      msg += `â¢ *${g.name}*\n  Ãltima atividade: ${lastAct}\n\n`;
    });
    return sendMsg(chatId, msg);
  },
};

// ââ WEBHOOK HANDLER ââââââââââââââââââââââââââââââââââââââââââââââââ

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  try {
    const msg = req.body.message;
    if (!msg) return;

    const chatId = msg.chat.id;
    const text = msg.text || '';
    const from = msg.from?.first_name || 'Desconhecido';
    const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

    // ââ AUTO-TRACK GROUPS ââ
    if (isGroup) {
      trackedGroups[chatId] = {
        name: msg.chat.title || `Grupo ${chatId}`,
        lastActivity: new Date().toISOString(),
        lastMessage: text.substring(0, 100),
        registered: trackedGroups[chatId]?.registered || new Date().toISOString(),
      };
    }

    // ââ COMMAND HANDLING ââ
    if (text.startsWith('/')) {
      const parts = text.split(' ');
      const cmd = parts[0].split('@')[0].toLowerCase(); // Remove @botname
      const args = parts.slice(1).join(' ');
      const handler = commands[cmd];
      if (handler) {
        await handler(chatId, args, from);
      }
      return;
    }

    // ââ GROUP MESSAGE: KEYWORD DETECTION ââ
    if (isGroup && text.length > 5) {
      const matches = detectKeywords(text);

      if (matches.length > 0) {
        const primary = matches[0]; // Highest priority match

        // Register the occurrence
        registrarOcorrencia(chatId, primary.tipo, text, from, primary.keywords);

        // Send confirmation (except for diÃ¡rios â too noisy)
        if (primary.resposta) {
          const kwList = primary.keywords.slice(0, 3).map(k => `\`${k}\``).join(', ');
          await sendMsg(chatId,
            `${primary.resposta}\n\n` +
            `ð¤ ${from}\n` +
            `ð Keywords: ${kwList}\n` +
            `ð Total ocorrÃªncias: ${(ocorrencias[chatId] || []).length}`,
            { reply_to_message_id: msg.message_id }
          );
        }

        // If it's a finalization, add extra reminder
        if (primary.tipo === 'finalizado') {
          setTimeout(() => {
            sendMsg(chatId, 'â ï¸ *Lembrete:* Mova o card no Pipefy para "Obra ConcluÃ­da" para sincronizar o status.');
          }, 3000);
        }
      } else {
        // Mark day as having activity (even without keyword match)
        const hoje = new Date().toISOString().split('T')[0];
        if (!diasRegistro[chatId]) diasRegistro[chatId] = {};
        diasRegistro[chatId][hoje] = true;
      }
      return;
    }

    // ââ PRIVATE MESSAGE: AI CHAT ââ
    if (!isGroup && !text.startsWith('/')) {
      const resp = await ai(
        `VocÃª Ã© o Teleagente da Monofloor, assistente operacional de piso de concreto polido. ` +
        `Vitor Gomes (Gerente de Qualidade) perguntou: "${text}". ` +
        `Responda direto em portuguÃªs, objetivo e com emojis quando apropriado.`
      );
      await sendMsg(chatId, resp);
    }
  } catch (err) {
    console.error('Webhook error:', err);
  }
});

// ââ HEALTH CHECK + API âââââââââââââââââââââââââââââââââââââââââââââ

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    bot: '@monofloor_op_bot',
    version: '2.1.0-ativo',
    features: ['commands', 'keyword_detection', 'classification', 'ai_chat', 'proactive_briefing', 'dia_cego_detection', 'prazo_alerts', 'daily_digest'],
    ocorrencias: Object.keys(ocorrencias).length + ' groups tracked',
    sinais: Object.keys(obraStatus).length + ' status overrides',
  });
});

// API endpoint for the portal to consume
app.get('/api/ocorrencias', (req, res) => {
  res.json(ocorrencias);
});

app.get('/api/status', (req, res) => {
  res.json(obraStatus);
});

app.get('/api/dias', (req, res) => {
  res.json(diasRegistro);
});

// ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// MODO ATIVO â AÃÃES PROATIVAS DO BOT
// O bot toma iniciativa: briefings, alertas, follow-ups
// ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

// ââ BRIEFING MATINAL (8h) ââââââââââââââââââââââââââââââââââââââââââ
async function briefingMatinal() {
  if (!VITOR_CHAT_ID) return console.log('VITOR_CHAT_ID nÃ£o configurado â briefing ignorado');
  try {
    const obras = await getObrasExecucao();
    const hoje = new Date().toISOString().split('T')[0];
    const ontem = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Dias cegos de ontem
    const gruposSilenciosos = Object.entries(trackedGroups).filter(([chatId]) => {
      const dias = diasRegistro[chatId] || {};
      return !dias[ontem];
    });

    // Obras atrasadas (prazo estourado)
    const atrasadas = obras.filter(o => {
      if (!o.due) return false;
      return new Date(o.due) < new Date();
    });

    // Sinais do Telegram
    const sinais = Object.entries(obraStatus);

    let msg = `ð *Briefing Matinal â ${new Date().toLocaleDateString('pt-BR')}*\n\n`;
    msg += `ð¨ *${obras.length}* obras em execuÃ§Ã£o\n`;
    msg += `ð´ *${atrasadas.length}* alÃ©m do prazo\n`;
    msg += `ðï¸ *${gruposSilenciosos.length}* grupos sem registro ontem\n`;

    if (sinais.length) {
      msg += `\nâï¸ *Sinais Telegram pendentes:*\n`;
      sinais.forEach(([, v]) => {
        const emoji = v.statusReal === 'finalizado' ? 'â' : 'â¸ï¸';
        msg += `${emoji} ${v.ultimoSinal.mensagem.substring(0, 50)}...\n`;
      });
    }

    if (gruposSilenciosos.length) {
      msg += `\nðï¸ *Grupos silenciosos ontem:*\n`;
      gruposSilenciosos.slice(0, 5).forEach(([, g]) => {
        msg += `â¢ ${g.name}\n`;
      });
    }

    if (atrasadas.length) {
      msg += `\nð´ *Obras alÃ©m do prazo:*\n`;
      atrasadas.slice(0, 5).forEach(o => {
        msg += `â¢ *${o.title}* â ${o.age}d na fase (prazo: ${o.prazo || 'â'}d)\n`;
      });
    }

    msg += `\n_PrÃ³ximo briefing amanhÃ£ Ã s 8h._`;
    await sendMsg(VITOR_CHAT_ID, msg);
    console.log(`[ATIVO] Briefing matinal enviado â ${obras.length} obras, ${atrasadas.length} atrasadas`);
  } catch (e) { console.error('[ATIVO] Erro no briefing:', e.message); }
}

// ââ DETECTOR DE DIA CEGO (20h) âââââââââââââââââââââââââââââââââââââ
async function detectarDiasCegos() {
  const hoje = new Date().toISOString().split('T')[0];
  let alertados = 0;

  for (const [chatId, grupo] of Object.entries(trackedGroups)) {
    const dias = diasRegistro[chatId] || {};
    if (!dias[hoje]) {
      // Grupo ficou em silÃªncio o dia inteiro
      registrarOcorrencia(chatId, 'dia_cego', 'Nenhum registro detectado hoje (automÃ¡tico)', 'Teleagente', ['dia cego', 'silÃªncio']);

      await sendMsg(chatId,
        `ðï¸ *Dia sem registro detectado!*\n\n` +
        `Nenhuma mensagem foi registrada no grupo hoje.\n` +
        `Se a obra estÃ¡ ativa, como estÃ¡ o andamento?\n\n` +
        `_Registrado automaticamente como "dia cego"._`
      );
      alertados++;

      // Pausa entre mensagens para nÃ£o ser rate-limited
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // Verificar silÃªncio de 2+ dias consecutivos
  for (const [chatId, grupo] of Object.entries(trackedGroups)) {
    const dias = diasRegistro[chatId] || {};
    const ontem = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (!dias[hoje] && !dias[ontem]) {
      await sendMsg(chatId,
        `ð *SilÃªncio prolongado â 2 dias sem registro*\n\n` +
        `Este grupo estÃ¡ sem atividade hÃ¡ 2 dias.\n` +
        `A obra estÃ¡ pausada? Use /pausa [motivo]\n` +
        `Ainda ativa? Envie um /diario com o status.`
      );
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`[ATIVO] Dia cego check â ${alertados} grupos alertados de ${Object.keys(trackedGroups).length}`);
}

// ââ ALERTA DE PRAZO (diÃ¡rio) âââââââââââââââââââââââââââââââââââââââ
async function alertaPrazo() {
  try {
    const obras = await getObrasExecucao();
    const hoje = new Date();

    for (const obra of obras) {
      if (!obra.due) continue;
      const prazoDate = new Date(obra.due);
      const diasRestantes = Math.round((prazoDate - hoje) / 86400000);

      // Encontrar grupo correspondente pelo nome
      const grupoMatch = Object.entries(trackedGroups).find(([, g]) =>
        g.name.toLowerCase().includes(obra.title.toLowerCase().substring(0, 15))
      );

      if (diasRestantes === 3 && grupoMatch) {
        await sendMsg(grupoMatch[0],
          `â° *Alerta de Prazo â 3 dias restantes*\n\n` +
          `A obra *${obra.title}* tem prazo previsto para ${prazoDate.toLocaleDateString('pt-BR')}.\n` +
          `Faltam *3 dias*. Status atual: ${obra.age}d na fase.`
        );
      } else if (diasRestantes === 1 && grupoMatch) {
        await sendMsg(grupoMatch[0],
          `ð¨ *Prazo AMANHÃ!*\n\n` +
          `A obra *${obra.title}* precisa ser finalizada atÃ© amanhÃ£ (${prazoDate.toLocaleDateString('pt-BR')}).`
        );
      } else if (diasRestantes === 0 && grupoMatch) {
        await sendMsg(grupoMatch[0],
          `ð´ *PRAZO ESGOTADO HOJE!*\n\n` +
          `A obra *${obra.title}* deveria ter sido finalizada hoje.\n` +
          `Use /finalizar quando concluir ou /pausa se houver impedimento.`
        );
      }

      if (grupoMatch) await new Promise(r => setTimeout(r, 500));
    }

    console.log(`[ATIVO] Alerta de prazo â ${obras.length} obras verificadas`);
  } catch (e) { console.error('[ATIVO] Erro no alerta de prazo:', e.message); }
}

// ââ DIGEST DIÃRIO (18h) ââââââââââââââââââââââââââââââââââââââââââââ
async function digestDiario() {
  if (!VITOR_CHAT_ID) return;
  try {
    const hoje = new Date().toISOString().split('T')[0];
    let totalOcs = 0;
    const resumoPorTipo = {};
    const gruposAtivos = [];

    for (const [chatId, ocs] of Object.entries(ocorrencias)) {
      const ocsHoje = ocs.filter(o => o.data.startsWith(hoje));
      if (ocsHoje.length > 0) {
        totalOcs += ocsHoje.length;
        gruposAtivos.push(trackedGroups[chatId]?.name || chatId);
        ocsHoje.forEach(o => { resumoPorTipo[o.tipo] = (resumoPorTipo[o.tipo] || 0) + 1; });
      }
    }

    if (totalOcs === 0) {
      await sendMsg(VITOR_CHAT_ID, `ð *Digest DiÃ¡rio â ${new Date().toLocaleDateString('pt-BR')}*\n\nNenhuma ocorrÃªncia registrada hoje.`);
      return;
    }

    let msg = `ð *Digest DiÃ¡rio â ${new Date().toLocaleDateString('pt-BR')}*\n\n`;
    msg += `ð *${totalOcs}* ocorrÃªncias em *${gruposAtivos.length}* grupos\n\n`;

    msg += `*Por tipo:*\n`;
    for (const [tipo, count] of Object.entries(resumoPorTipo).sort((a, b) => b[1] - a[1])) {
      msg += `${KEYWORDS[tipo]?.label || tipo}: *${count}*\n`;
    }

    msg += `\n*Grupos ativos hoje:*\n`;
    gruposAtivos.slice(0, 8).forEach(g => { msg += `â¢ ${g}\n`; });

    msg += `\n_PrÃ³ximo digest amanhÃ£ Ã s 18h._`;
    await sendMsg(VITOR_CHAT_ID, msg);
    console.log(`[ATIVO] Digest enviado â ${totalOcs} ocorrÃªncias`);
  } catch (e) { console.error('[ATIVO] Erro no digest:', e.message); }
}

// ââ SCHEDULER ââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function getBRTime() {
  // HorÃ¡rio de BrasÃ­lia (UTC-3)
  const now = new Date();
  const utcOffset = now.getTimezoneOffset() * 60000;
  const brOffset = -3 * 3600000;
  return new Date(now.getTime() + utcOffset + brOffset);
}

function startSchedulers() {
  // Check every 5 minutes if it's time to run a task
  setInterval(() => {
    const br = getBRTime();
    const h = br.getHours();
    const m = br.getMinutes();

    // 08:00 â Briefing matinal (run between 08:00-08:04)
    if (h === 8 && m < 5) {
      briefingMatinal();
    }

    // 12:00 â Alerta de prazo (midday check)
    if (h === 12 && m < 5) {
      alertaPrazo();
    }

    // 18:00 â Digest diÃ¡rio
    if (h === 18 && m < 5) {
      digestDiario();
    }

    // 20:00 â Detector de dia cego
    if (h === 20 && m < 5) {
      detectarDiasCegos();
    }
  }, 5 * 60 * 1000); // Every 5 minutes

  console.log('[ATIVO] Schedulers iniciados â Briefing 8h | Prazo 12h | Digest 18h | Dia Cego 20h');
}

// API â tracked groups
app.get('/api/groups', (req, res) => {
  res.json(trackedGroups);
});

// ââ START ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

// Deploy forced: 2026-04-09T15:36:52.244Z
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Teleagente v2.1 ATIVO â port ${PORT}`);
  console.log(`Keywords: ${Object.values(KEYWORDS).reduce((s, k) => s + k.palavras.length, 0)} mapped`);
  console.log(`Types: ${Object.keys(KEYWORDS).length}`);
  console.log(`VITOR_CHAT_ID: ${VITOR_CHAT_ID ? 'configurado' : 'â ï¸ NÃO CONFIGURADO'}`);

  // Start proactive schedulers
  startSchedulers();

  // Run initial briefing 30s after boot (for testing)
  if (VITOR_CHAT_ID) {
    setTimeout(() => {
      sendMsg(VITOR_CHAT_ID,
        `ð¤ *Teleagente v2.1 ATIVO*\n\n` +
        `Bot reiniciado e online.\n` +
        `Modo ativo habilitado:\n` +
        `â¢ ð Briefing matinal Ã s 8h\n` +
        `â¢ â° Alerta de prazo Ã s 12h\n` +
        `â¢ ð Digest diÃ¡rio Ã s 18h\n` +
        `â¢ ðï¸ Dia cego check Ã s 20h\n\n` +
        `Grupos rastreados: ${Object.keys(trackedGroups).length}`
      );
    }, 30000);
  }
});
