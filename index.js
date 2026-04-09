import express from 'express';
import fetch from 'node-fetch';

const app = express();
app.use(express.json());

// Ã¢ÂÂÃ¢ÂÂ ENV Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PIPEFY_TOKEN = process.env.PIPEFY_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const PLAN_URL = process.env.PLAN_API_URL || 'https://planejamento.monofloor.cloud/api';
const TG_API = `https://api.telegram.org/bot${TG_TOKEN}`;

const VITOR_CHAT_ID = process.env.VITOR_CHAT_ID; // Vitor's private chat for briefings
const PIPE_OE = 306410007;
const PIPE_OEC = 306446640;
const FASE_EXEC = 338741343;

// Ã¢ÂÂÃ¢ÂÂ ACTIVE MODE Ã¢ÂÂ TRACKED GROUPS Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
// Groups are auto-registered when bot receives a message from them
const trackedGroups = {}; // { chatId: { name, lastActivity, lastMessage, registered } }

// Ã¢ÂÂÃ¢ÂÂ KEYWORD DETECTION SYSTEM Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

const KEYWORDS = {
  finalizado: {
    label: 'Ã¢ÂÂ Obra Finalizada',
    gravidade: 'marco',
    palavras: [
      'finalizado', 'finalizamos', 'terminamos', 'obra concluÃÂ­da',
      'obra concluida', 'entregue', 'aprovado pelo cliente',
      'vistoria aprovada', 'tudo pronto', 'obra pronta',
      'concluÃÂ­do', 'concluido', 'finalizada', 'entrega realizada',
      'cliente aprovou', 'vistoria ok', 'aprovaÃÂ§ÃÂ£o ok',
    ],
    minMatch: 1,
    resposta: 'Ã¢ÂÂ *Obra Finalizada detectada!*\nRegistrado automaticamente na timeline.',
  },
  pausa: {
    label: 'Ã¢ÂÂ¸Ã¯Â¸Â Obra Pausada',
    gravidade: 'alta',
    palavras: [
      'obra pausada', 'pausamos', 'paramos', 'parou a obra',
      'aguardando definiÃÂ§ÃÂ£o', 'sem previsÃÂ£o de retomada',
      'cliente pediu pausa', 'obra parada', 'interrompemos',
    ],
    minMatch: 1,
    resposta: 'Ã¢ÂÂ¸Ã¯Â¸Â *Pausa detectada!*\nRegistrado na timeline. Motivo serÃÂ¡ solicitado.',
  },
  sem_aplicador: {
    label: 'Ã°ÂÂÂ« Sem Aplicador',
    gravidade: 'alta',
    palavras: [
      'sem aplicador', 'nÃÂ£o compareceu', 'nao compareceu',
      'nÃÂ£o veio', 'nao veio', 'faltou', 'nÃÂ£o foi', 'nao foi',
      'sÃÂ³ um aplicador', 'so um aplicador', 'sozinho na obra',
      'sem equipe', 'nÃÂ£o conseguiu ir', 'nao conseguiu ir',
      'problemas pessoais', 'aplicador faltou',
    ],
    minMatch: 1,
    resposta: 'Ã°ÂÂÂ« *AusÃÂªncia de aplicador detectada!*\nDia registrado como perda operacional.',
  },
  qualidade: {
    label: 'Ã¢ÂÂ Ã¯Â¸Â Problema de Qualidade',
    gravidade: 'alta',
    palavras: [
      'desplacamento', 'desplacou', 'manchou', 'mancha',
      'bolha', 'trinca', 'trincou', 'irregular', 'defeito',
      'mal executado', 'retocar', 'retoque', 'reaplicar',
      'tela aparente', 'telas aparentes', 'falha', 'rachadura',
      'amassado', 'amassamento', 'infiltraÃÂ§ÃÂ£o', 'infiltrou',
      'espelhamento', 'rejunte aparente', 'soltou', 'descascou',
    ],
    minMatch: 1,
    resposta: 'Ã¢ÂÂ Ã¯Â¸Â *Problema de qualidade detectado!*\nRegistrado para anÃÂ¡lise.',
  },
  comunicacao: {
    label: 'Ã°ÂÂÂ¬ Falha de ComunicaÃÂ§ÃÂ£o',
    gravidade: 'media',
    palavras: [
      'alinhou direto', 'combinou com o cliente', 'sem comunicar',
      'sem passar pela operaÃÂ§ÃÂ£o', 'nÃÂ£o informou', 'nao informou',
      'sem devolutiva', 'sem resposta', 'nÃÂ£o respondeu',
      'cliente pediu direto', 'repassou prazo direto',
      'sem registro no grupo',
    ],
    minMatch: 1,
    resposta: 'Ã°ÂÂÂ¬ *Falha de comunicaÃÂ§ÃÂ£o detectada!*\nRegistrado como ocorrÃÂªncia de processo.',
  },
  cliente: {
    label: 'Ã°ÂÂÂ¤ Impedimento do Cliente',
    gravidade: 'media',
    palavras: [
      'cliente nÃÂ£o pÃÂ´de', 'cliente nao pode', 'sem acesso',
      'obra fechada', 'remarcaÃÂ§ÃÂ£o', 'remarcar',
      'portaria nÃÂ£o liberou', 'portaria nao liberou',
      'cliente viajou', 'indisponÃÂ­vel', 'indisponivel',
      'mudou o escopo', 'aguardando aprovaÃÂ§ÃÂ£o do cliente',
    ],
    minMatch: 1,
    resposta: 'Ã°ÂÂÂ¤ *Impedimento do cliente detectado!*\nRegistrado como causa externa.',
  },
  clima: {
    label: 'Ã°ÂÂÂ§Ã¯Â¸Â Clima / Ambiente',
    gravidade: 'media',
    palavras: [
      'chuva', 'chovendo', 'umidade alta', 'vazamento',
      'goteira', 'alagou', 'molhado', 'nÃÂ£o secou', 'nao secou',
      'demora pra secar', 'umidade atrasando',
    ],
    minMatch: 1,
    resposta: 'Ã°ÂÂÂ§Ã¯Â¸Â *CondiÃÂ§ÃÂ£o climÃÂ¡tica detectada!*\nRegistrado como causa externa.',
  },
  material_extra: {
    label: 'Ã°ÂÂÂ¦ Material Extra',
    gravidade: 'media',
    palavras: [
      'material extra', 'faltou material', 'acabou o material',
      'solicitar material', 'pedir material', 'produÃÂ§ÃÂ£o extra',
      'material adicional', 'faltou massa', 'faltou verniz',
      'faltou primer', 'faltou selador',
    ],
    minMatch: 1,
    resposta: 'Ã°ÂÂÂ¦ *SolicitaÃÂ§ÃÂ£o de material extra detectada!*\nRegistrado na timeline.',
  },
  diario: {
    label: 'Ã°ÂÂÂ¸ DiÃÂ¡rio de Obra',
    gravidade: 'info',
    palavras: [
      'aplicamos hoje', 'executamos', 'primeira demÃÂ£o',
      'segunda demÃÂ£o', 'terceira demÃÂ£o', 'lixamento concluÃÂ­do',
      'selador aplicado', 'verniz aplicado', 'primer aplicado',
      'massa aplicada', 'diÃÂ¡rio de obra', 'diario de obra',
    ],
    minMatch: 1,
    resposta: null, // DiÃÂ¡rio nÃÂ£o precisa de confirmaÃÂ§ÃÂ£o
  },
};

// Ã¢ÂÂÃ¢ÂÂ STORAGE (in-memory Ã¢ÂÂ persists while Railway is up) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

const ocorrencias = {}; // { chatId: [{ tipo, msg, autor, data, keywords }] }
const obraStatus = {};  // { chatId: { statusReal, ultimoSinal, data } }
const diasRegistro = {}; // { chatId: { [date]: true } } Ã¢ÂÂ para detectar dias cegos

// Ã¢ÂÂÃ¢ÂÂ DETECTION ENGINE Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

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

  // Marcar dia com registro (para detecÃÂ§ÃÂ£o de dia cego)
  const hoje = new Date().toISOString().split('T')[0];
  if (!diasRegistro[chatId]) diasRegistro[chatId] = {};
  diasRegistro[chatId][hoje] = true;

  return registro;
}

// Ã¢ÂÂÃ¢ÂÂ TELEGRAM HELPERS Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

async function sendMsg(chatId, text, opts = {}) {
  await fetch(`${TG_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', ...opts }),
  });
}

// Ã¢ÂÂÃ¢ÂÂ PIPEFY HELPERS Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

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
  const fases = oe.data.pipe.phases.filter(p => p.cards_count > 15).map(p => `Ã¢ÂÂ¢ *${p.name}*: ${p.cards_count} cards`);
  const oecFases = oec.data.pipe.phases.filter(p => p.cards_count > 10).map(p => `Ã¢ÂÂ¢ *${p.name}*: ${p.cards_count} cards`);
  return { oe: fases, oec: oecFases };
}

// Ã¢ÂÂÃ¢ÂÂ PLAN API HELPERS Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

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

// Ã¢ÂÂÃ¢ÂÂ AI HELPER Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

async function ai(prompt) {
  if (!ANTHROPIC_KEY) return 'Chave Anthropic nÃÂ£o configurada. Configure ANTHROPIC_API_KEY no Railway.';
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

// Ã¢ÂÂÃ¢ÂÂ COMMAND HANDLERS Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

const commands = {
  '/obras': async (chatId) => {
    const obras = await getObrasExecucao();
    if (!obras.length) return sendMsg(chatId, 'Nenhuma obra em execuÃÂ§ÃÂ£o.');
    let msg = `Ã°ÂÂÂ¨ *Obras em ExecuÃÂ§ÃÂ£o* (${obras.length})\n\n`;
    obras.forEach(o => {
      const status = obraStatus[chatId]; // Check for telegram overrides
      const dias = o.age;
      const emoji = dias > (parseInt(o.prazo) || 30) ? 'Ã°ÂÂÂ´' : dias > (parseInt(o.prazo) || 30) * 0.7 ? 'Ã°ÂÂÂ¡' : 'Ã°ÂÂÂ¢';
      msg += `${emoji} *${o.title}*\n   ${dias}d na fase | Prazo: ${o.prazo || 'Ã¢ÂÂ'}d | ${o.tipo || 'NOVA'}\n\n`;
    });
    return sendMsg(chatId, msg);
  },

  '/gargalos': async (chatId) => {
    const g = await getGargalos();
    let msg = 'Ã°ÂÂÂ§ *Gargalos Ativos*\n\n';
    if (g.oe.length) msg += '*OPERAÃÂÃÂES:*\n' + g.oe.join('\n') + '\n\n';
    if (g.oec.length) msg += '*CORES:*\n' + g.oec.join('\n');
    return sendMsg(chatId, msg || 'Nenhum gargalo crÃÂ­tico no momento.');
  },

  '/atrasadas': async (chatId) => {
    const obras = await getAtrasadas();
    if (!obras.length) return sendMsg(chatId, 'Ã¢ÂÂ Nenhuma obra atrasada!');
    let msg = `Ã°ÂÂÂ´ *Obras Atrasadas* (${obras.length})\n\n`;
    obras.forEach(o => { msg += `Ã¢ÂÂ¢ *${o.name || o.title}*\n`; });
    return sendMsg(chatId, msg);
  },

  '/aproveitamento': async (chatId) => {
    const a = await getAproveitamento();
    const emoji = a.pct >= 80 ? 'Ã°ÂÂÂ¢' : a.pct >= 60 ? 'Ã°ÂÂÂ¡' : 'Ã°ÂÂÂ´';
    return sendMsg(chatId, `${emoji} *Aproveitamento: ${a.pct}%*\n\n${a.onTime} de ${a.total} obras no prazo.`);
  },

  '/alerta': async (chatId) => {
    const [g, a] = await Promise.all([getGargalos(), getAtrasadas()]);
    let msg = 'Ã°ÂÂÂ¨ *Painel de Alertas*\n\n';
    msg += `Ã¢ÂÂ¢ ${a.length} obras atrasadas\n`;
    msg += `Ã¢ÂÂ¢ ${g.oe.length + g.oec.length} gargalos ativos\n`;

    // Include telegram signals
    const signals = Object.entries(obraStatus).filter(([, v]) => v.statusReal === 'finalizado' || v.statusReal === 'pausa');
    if (signals.length) {
      msg += `\nÃ¢ÂÂÃ¯Â¸Â *Sinais do Telegram:*\n`;
      signals.forEach(([, v]) => {
        const emoji = v.statusReal === 'finalizado' ? 'Ã¢ÂÂ' : 'Ã¢ÂÂ¸Ã¯Â¸Â';
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
      found.slice(0, 5).forEach(p => { msg += `Ã°ÂÂÂ *${p.name || p.title}*\nStatus: ${p.status || 'Ã¢ÂÂ'}\n\n`; });
      return sendMsg(chatId, msg);
    } catch { return sendMsg(chatId, 'Erro ao consultar planejamento.'); }
  },

  '/ocorrencias': async (chatId) => {
    const ocs = ocorrencias[chatId];
    if (!ocs || !ocs.length) return sendMsg(chatId, 'Ã°ÂÂÂ Nenhuma ocorrÃÂªncia registrada neste grupo.');
    let msg = `Ã°ÂÂÂ *OcorrÃÂªncias Registradas* (${ocs.length})\n\n`;
    ocs.slice(-10).forEach(o => {
      const data = new Date(o.data).toLocaleDateString('pt-BR');
      msg += `${KEYWORDS[o.tipo]?.label || o.tipo} Ã¢ÂÂ ${data}\n_${o.mensagem.substring(0, 60)}_\n\n`;
    });
    return sendMsg(chatId, msg);
  },

  '/resumo': async (chatId) => {
    const ocs = ocorrencias[chatId] || [];
    const status = obraStatus[chatId];
    const dias = diasRegistro[chatId] || {};
    const totalDias = Object.keys(dias).length;

    let msg = 'Ã°ÂÂÂ *Resumo da Obra*\n\n';
    msg += `Ã°ÂÂÂ Dias com registro: *${totalDias}*\n`;
    msg += `Ã°ÂÂÂ Total ocorrÃÂªncias: *${ocs.length}*\n`;

    // Count by type
    const byType = {};
    ocs.forEach(o => { byType[o.tipo] = (byType[o.tipo] || 0) + 1; });
    Object.entries(byType).forEach(([tipo, count]) => {
      msg += `   ${KEYWORDS[tipo]?.label || tipo}: ${count}\n`;
    });

    if (status) {
      msg += `\nÃ¢ÂÂÃ¯Â¸Â Status real: *${status.statusReal.toUpperCase()}*`;
    }
    return sendMsg(chatId, msg);
  },

  '/ajuda': async (chatId) => {
    return sendMsg(chatId, `Ã°ÂÂ¤Â *Teleagente Monofloor*\n\n` +
      `*Comandos:*\n` +
      `/obras Ã¢ÂÂ Obras em execuÃÂ§ÃÂ£o\n` +
      `/gargalos Ã¢ÂÂ Gargalos ativos\n` +
      `/atrasadas Ã¢ÂÂ Obras atrasadas\n` +
      `/aproveitamento Ã¢ÂÂ Taxa no prazo\n` +
      `/alerta Ã¢ÂÂ Painel de alertas\n` +
      `/status [nome] Ã¢ÂÂ Buscar obra\n` +
      `/ocorrencias Ã¢ÂÂ HistÃÂ³rico do grupo\n` +
      `/resumo Ã¢ÂÂ Resumo da obra\n\n` +
      `*ClassificaÃÂ§ÃÂ£o manual:*\n` +
      `/diario [texto] Ã¢ÂÂ Registrar diÃÂ¡rio\n` +
      `/ocorrencia [tipo] Ã¢ÂÂ Registrar evento\n` +
      `/finalizar Ã¢ÂÂ Marcar como concluÃÂ­da\n` +
      `/pausa [motivo] Ã¢ÂÂ Pausar obra\n` +
      `/retomar Ã¢ÂÂ Retomar obra\n\n` +
      `*Modo Ativo (proativo):*\n` +
      `/briefing Ã¢ÂÂ Disparar briefing matinal agora\n` +
      `/digest Ã¢ÂÂ Disparar digest diÃÂ¡rio agora\n` +
      `/grupos Ã¢ÂÂ Ver grupos rastreados\n\n` +
      `*Tipos de ocorrÃÂªncia:*\n` +
      `sem\\_aplicador, qualidade, comunicacao, cliente, clima, material\n\n` +
      `Ã°ÂÂ¤Â DetecÃÂ§ÃÂ£o automÃÂ¡tica ativa em grupos de obra.`
    );
  },

  '/diario': async (chatId, args, from) => {
    if (!args) return sendMsg(chatId, 'Use: /diario [descriÃÂ§ÃÂ£o do que foi executado hoje]');
    registrarOcorrencia(chatId, 'diario', args, from, ['diÃÂ¡rio manual']);
    return sendMsg(chatId, 'Ã°ÂÂÂ¸ DiÃÂ¡rio registrado!');
  },

  '/ocorrencia': async (chatId, args, from) => {
    if (!args) return sendMsg(chatId, 'Use: /ocorrencia [tipo] [descriÃÂ§ÃÂ£o]\nTipos: sem_aplicador, qualidade, comunicacao, cliente, clima, material');
    const parts = args.split(' ');
    const tipo = parts[0];
    const desc = parts.slice(1).join(' ') || 'Sem descriÃÂ§ÃÂ£o';
    if (!KEYWORDS[tipo] && tipo !== 'material') return sendMsg(chatId, `Tipo "${tipo}" nÃÂ£o reconhecido.\nTipos vÃÂ¡lidos: sem_aplicador, qualidade, comunicacao, cliente, clima, material`);
    const tipoFinal = tipo === 'material' ? 'material_extra' : tipo;
    registrarOcorrencia(chatId, tipoFinal, desc, from, ['comando manual']);
    return sendMsg(chatId, `${KEYWORDS[tipoFinal]?.label || tipo} registrado!`);
  },

  '/finalizar': async (chatId, args, from) => {
    registrarOcorrencia(chatId, 'finalizado', args || 'Obra finalizada via comando', from, ['comando /finalizar']);
    return sendMsg(chatId, 'Ã¢ÂÂ *Obra marcada como FINALIZADA!*\n\nÃ¢ÂÂ Ã¯Â¸Â Lembre de mover o card no Pipefy para "Obra ConcluÃÂ­da".');
  },

  '/pausa': async (chatId, args, from) => {
    registrarOcorrencia(chatId, 'pausa', args || 'Obra pausada via comando', from, ['comando /pausa']);
    return sendMsg(chatId, 'Ã¢ÂÂ¸Ã¯Â¸Â *Obra marcada como PAUSADA!*\nMotivo: ' + (args || 'NÃÂ£o informado'));
  },

  '/retomar': async (chatId, args, from) => {
    if (obraStatus[chatId]?.statusReal === 'pausa') {
      delete obraStatus[chatId];
    }
    registrarOcorrencia(chatId, 'diario', 'Obra retomada' + (args ? ': ' + args : ''), from, ['comando /retomar']);
    return sendMsg(chatId, 'Ã¢ÂÂ¶Ã¯Â¸Â *Obra RETOMADA!*');
  },

  '/semana': async (chatId) => {
    const [obras, atrasadas, aproveitamento] = await Promise.all([
      getObrasExecucao(),
      getAtrasadas(),
      getAproveitamento(),
    ]);
    const prompt = `Dados Monofloor esta semana:
- ${obras.length} obras em execuÃÂ§ÃÂ£o
- ${atrasadas.length} atrasadas
- Aproveitamento: ${aproveitamento.pct}%
Gere um resumo executivo semanal em portuguÃÂªs, direto e objetivo, com emojis.`;
    const resp = await ai(prompt);
    return sendMsg(chatId, resp);
  },

  '/briefing': async (chatId) => {
    await briefingMatinal();
    if (chatId !== parseInt(VITOR_CHAT_ID)) {
      return sendMsg(chatId, 'Ã°ÂÂÂ Briefing disparado! Enviado para o chat do Vitor.');
    }
  },

  '/id': async (chatId) => {
    return sendMsg(chatId, `Ã°ÂÂÂ Seu Chat ID: \`${chatId}\`\n\nAdicione como VITOR_CHAT_ID no Railway para receber briefings.`);
  },

  '/digest': async (chatId) => {
    await digestDiario();
    if (chatId !== parseInt(VITOR_CHAT_ID)) {
      return sendMsg(chatId, 'Ã°ÂÂÂ Digest disparado! Enviado para o chat do Vitor.');
    }
  },

  '/grupos': async (chatId) => {
    const groups = Object.entries(trackedGroups);
    if (!groups.length) return sendMsg(chatId, 'Nenhum grupo rastreado ainda. O bot registra automaticamente ao receber mensagens em grupos.');
    let msg = `Ã°ÂÂÂ¡ *Grupos Rastreados* (${groups.length})\n\n`;
    groups.forEach(([id, g]) => {
      const lastAct = new Date(g.lastActivity).toLocaleString('pt-BR');
      msg += `Ã¢ÂÂ¢ *${g.name}*\n  ÃÂltima atividade: ${lastAct}\n\n`;
    });
    return sendMsg(chatId, msg);
  },
};

// Ã¢ÂÂÃ¢ÂÂ WEBHOOK HANDLER Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  try {
    const msg = req.body.message;
    if (!msg) return;

    const chatId = msg.chat.id;
    const text = msg.text || '';
    const from = msg.from?.first_name || 'Desconhecido';
    const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

    // Ã¢ÂÂÃ¢ÂÂ AUTO-TRACK GROUPS Ã¢ÂÂÃ¢ÂÂ
    if (isGroup) {
      trackedGroups[chatId] = {
        name: msg.chat.title || `Grupo ${chatId}`,
        lastActivity: new Date().toISOString(),
        lastMessage: text.substring(0, 100),
        registered: trackedGroups[chatId]?.registered || new Date().toISOString(),
      };
    }

    // Ã¢ÂÂÃ¢ÂÂ COMMAND HANDLING Ã¢ÂÂÃ¢ÂÂ
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

    // Ã¢ÂÂÃ¢ÂÂ GROUP MESSAGE: KEYWORD DETECTION Ã¢ÂÂÃ¢ÂÂ
    if (isGroup && text.length > 5) {
      const matches = detectKeywords(text);

      if (matches.length > 0) {
        const primary = matches[0]; // Highest priority match

        // Register the occurrence
        registrarOcorrencia(chatId, primary.tipo, text, from, primary.keywords);

        // Send confirmation (except for diÃÂ¡rios Ã¢ÂÂ too noisy)
        if (primary.resposta) {
          const kwList = primary.keywords.slice(0, 3).map(k => `\`${k}\``).join(', ');
          await sendMsg(chatId,
            `${primary.resposta}\n\n` +
            `Ã°ÂÂÂ¤ ${from}\n` +
            `Ã°ÂÂÂ Keywords: ${kwList}\n` +
            `Ã°ÂÂÂ Total ocorrÃÂªncias: ${(ocorrencias[chatId] || []).length}`,
            { reply_to_message_id: msg.message_id }
          );
        }

        // If it's a finalization, add extra reminder
        if (primary.tipo === 'finalizado') {
          setTimeout(() => {
            sendMsg(chatId, 'Ã¢ÂÂ Ã¯Â¸Â *Lembrete:* Mova o card no Pipefy para "Obra ConcluÃÂ­da" para sincronizar o status.');
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

    // Ã¢ÂÂÃ¢ÂÂ PRIVATE MESSAGE: AI CHAT Ã¢ÂÂÃ¢ÂÂ
    if (!isGroup && !text.startsWith('/')) {
      const resp = await ai(
        `VocÃÂª ÃÂ© o Teleagente da Monofloor, assistente operacional de piso de concreto polido. ` +
        `Vitor Gomes (Gerente de Qualidade) perguntou: "${text}". ` +
        `Responda direto em portuguÃÂªs, objetivo e com emojis quando apropriado.`
      );
      await sendMsg(chatId, resp);
    }
  } catch (err) {
    console.error('Webhook error:', err);
  }
});

// Ã¢ÂÂÃ¢ÂÂ HEALTH CHECK + API Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

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

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
// MODO ATIVO Ã¢ÂÂ AÃÂÃÂES PROATIVAS DO BOT
// O bot toma iniciativa: briefings, alertas, follow-ups
// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

// Ã¢ÂÂÃ¢ÂÂ BRIEFING MATINAL (8h) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
async function briefingMatinal() {
  if (!VITOR_CHAT_ID) return console.log('VITOR_CHAT_ID nÃÂ£o configurado Ã¢ÂÂ briefing ignorado');
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

    let msg = `Ã°ÂÂÂ *Briefing Matinal Ã¢ÂÂ ${new Date().toLocaleDateString('pt-BR')}*\n\n`;
    msg += `Ã°ÂÂÂ¨ *${obras.length}* obras em execuÃÂ§ÃÂ£o\n`;
    msg += `Ã°ÂÂÂ´ *${atrasadas.length}* alÃÂ©m do prazo\n`;
    msg += `Ã°ÂÂÂÃ¯Â¸Â *${gruposSilenciosos.length}* grupos sem registro ontem\n`;

    if (sinais.length) {
      msg += `\nÃ¢ÂÂÃ¯Â¸Â *Sinais Telegram pendentes:*\n`;
      sinais.forEach(([, v]) => {
        const emoji = v.statusReal === 'finalizado' ? 'Ã¢ÂÂ' : 'Ã¢ÂÂ¸Ã¯Â¸Â';
        msg += `${emoji} ${v.ultimoSinal.mensagem.substring(0, 50)}...\n`;
      });
    }

    if (gruposSilenciosos.length) {
      msg += `\nÃ°ÂÂÂÃ¯Â¸Â *Grupos silenciosos ontem:*\n`;
      gruposSilenciosos.slice(0, 5).forEach(([, g]) => {
        msg += `Ã¢ÂÂ¢ ${g.name}\n`;
      });
    }

    if (atrasadas.length) {
      msg += `\nÃ°ÂÂÂ´ *Obras alÃÂ©m do prazo:*\n`;
      atrasadas.slice(0, 5).forEach(o => {
        msg += `Ã¢ÂÂ¢ *${o.title}* Ã¢ÂÂ ${o.age}d na fase (prazo: ${o.prazo || 'Ã¢ÂÂ'}d)\n`;
      });
    }

    msg += `\n_PrÃÂ³ximo briefing amanhÃÂ£ ÃÂ s 8h._`;
    await sendMsg(VITOR_CHAT_ID, msg);
    console.log(`[ATIVO] Briefing matinal enviado Ã¢ÂÂ ${obras.length} obras, ${atrasadas.length} atrasadas`);
  } catch (e) { console.error('[ATIVO] Erro no briefing:', e.message); }
}

// Ã¢ÂÂÃ¢ÂÂ DETECTOR DE DIA CEGO (20h) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
async function detectarDiasCegos() {
  const hoje = new Date().toISOString().split('T')[0];
  let alertados = 0;

  for (const [chatId, grupo] of Object.entries(trackedGroups)) {
    const dias = diasRegistro[chatId] || {};
    if (!dias[hoje]) {
      // Grupo ficou em silÃÂªncio o dia inteiro
      registrarOcorrencia(chatId, 'dia_cego', 'Nenhum registro detectado hoje (automÃÂ¡tico)', 'Teleagente', ['dia cego', 'silÃÂªncio']);

      await sendMsg(chatId,
        `Ã°ÂÂÂÃ¯Â¸Â *Dia sem registro detectado!*\n\n` +
        `Nenhuma mensagem foi registrada no grupo hoje.\n` +
        `Se a obra estÃÂ¡ ativa, como estÃÂ¡ o andamento?\n\n` +
        `_Registrado automaticamente como "dia cego"._`
      );
      alertados++;

      // Pausa entre mensagens para nÃÂ£o ser rate-limited
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // Verificar silÃÂªncio de 2+ dias consecutivos
  for (const [chatId, grupo] of Object.entries(trackedGroups)) {
    const dias = diasRegistro[chatId] || {};
    const ontem = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (!dias[hoje] && !dias[ontem]) {
      await sendMsg(chatId,
        `Ã°ÂÂÂ *SilÃÂªncio prolongado Ã¢ÂÂ 2 dias sem registro*\n\n` +
        `Este grupo estÃÂ¡ sem atividade hÃÂ¡ 2 dias.\n` +
        `A obra estÃÂ¡ pausada? Use /pausa [motivo]\n` +
        `Ainda ativa? Envie um /diario com o status.`
      );
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`[ATIVO] Dia cego check Ã¢ÂÂ ${alertados} grupos alertados de ${Object.keys(trackedGroups).length}`);
}

// Ã¢ÂÂÃ¢ÂÂ ALERTA DE PRAZO (diÃÂ¡rio) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
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
          `Ã¢ÂÂ° *Alerta de Prazo Ã¢ÂÂ 3 dias restantes*\n\n` +
          `A obra *${obra.title}* tem prazo previsto para ${prazoDate.toLocaleDateString('pt-BR')}.\n` +
          `Faltam *3 dias*. Status atual: ${obra.age}d na fase.`
        );
      } else if (diasRestantes === 1 && grupoMatch) {
        await sendMsg(grupoMatch[0],
          `Ã°ÂÂÂ¨ *Prazo AMANHÃÂ!*\n\n` +
          `A obra *${obra.title}* precisa ser finalizada atÃÂ© amanhÃÂ£ (${prazoDate.toLocaleDateString('pt-BR')}).`
        );
      } else if (diasRestantes === 0 && grupoMatch) {
        await sendMsg(grupoMatch[0],
          `Ã°ÂÂÂ´ *PRAZO ESGOTADO HOJE!*\n\n` +
          `A obra *${obra.title}* deveria ter sido finalizada hoje.\n` +
          `Use /finalizar quando concluir ou /pausa se houver impedimento.`
        );
      }

      if (grupoMatch) await new Promise(r => setTimeout(r, 500));
    }

    console.log(`[ATIVO] Alerta de prazo Ã¢ÂÂ ${obras.length} obras verificadas`);
  } catch (e) { console.error('[ATIVO] Erro no alerta de prazo:', e.message); }
}

// Ã¢ÂÂÃ¢ÂÂ DIGEST DIÃÂRIO (18h) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
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
      await sendMsg(VITOR_CHAT_ID, `Ã°ÂÂÂ *Digest DiÃÂ¡rio Ã¢ÂÂ ${new Date().toLocaleDateString('pt-BR')}*\n\nNenhuma ocorrÃÂªncia registrada hoje.`);
      return;
    }

    let msg = `Ã°ÂÂÂ *Digest DiÃÂ¡rio Ã¢ÂÂ ${new Date().toLocaleDateString('pt-BR')}*\n\n`;
    msg += `Ã°ÂÂÂ *${totalOcs}* ocorrÃÂªncias em *${gruposAtivos.length}* grupos\n\n`;

    msg += `*Por tipo:*\n`;
    for (const [tipo, count] of Object.entries(resumoPorTipo).sort((a, b) => b[1] - a[1])) {
      msg += `${KEYWORDS[tipo]?.label || tipo}: *${count}*\n`;
    }

    msg += `\n*Grupos ativos hoje:*\n`;
    gruposAtivos.slice(0, 8).forEach(g => { msg += `Ã¢ÂÂ¢ ${g}\n`; });

    msg += `\n_PrÃÂ³ximo digest amanhÃÂ£ ÃÂ s 18h._`;
    await sendMsg(VITOR_CHAT_ID, msg);
    console.log(`[ATIVO] Digest enviado Ã¢ÂÂ ${totalOcs} ocorrÃÂªncias`);
  } catch (e) { console.error('[ATIVO] Erro no digest:', e.message); }
}

// Ã¢ÂÂÃ¢ÂÂ SCHEDULER Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

function getBRTime() {
  // HorÃÂ¡rio de BrasÃÂ­lia (UTC-3)
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

    // 08:00 Ã¢ÂÂ Briefing matinal (run between 08:00-08:04)
    if (h === 8 && m < 5) {
      briefingMatinal();
    }

    // 12:00 Ã¢ÂÂ Alerta de prazo (midday check)
    if (h === 12 && m < 5) {
      alertaPrazo();
    }

    // 18:00 Ã¢ÂÂ Digest diÃÂ¡rio
    if (h === 18 && m < 5) {
      digestDiario();
    }

    // 20:00 Ã¢ÂÂ Detector de dia cego
    if (h === 20 && m < 5) {
      detectarDiasCegos();
    }
  }, 5 * 60 * 1000); // Every 5 minutes

  console.log('[ATIVO] Schedulers iniciados Ã¢ÂÂ Briefing 8h | Prazo 12h | Digest 18h | Dia Cego 20h');
}

// API Ã¢ÂÂ tracked groups
app.get('/api/groups', (req, res) => {
  res.json(trackedGroups);
});

// Ã¢ÂÂÃ¢ÂÂ START Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

// Deploy forced: 2026-04-09T15:36:52.244Z
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Teleagente v2.1 ATIVO Ã¢ÂÂ port ${PORT}`);
  console.log(`Keywords: ${Object.values(KEYWORDS).reduce((s, k) => s + k.palavras.length, 0)} mapped`);
  console.log(`Types: ${Object.keys(KEYWORDS).length}`);
  console.log(`VITOR_CHAT_ID: ${VITOR_CHAT_ID ? 'configurado' : 'Ã¢ÂÂ Ã¯Â¸Â NÃÂO CONFIGURADO'}`);

  // Start proactive schedulers
  startSchedulers();

  // Run initial briefing 30s after boot (for testing)
  if (VITOR_CHAT_ID) {
    setTimeout(() => {
      sendMsg(VITOR_CHAT_ID,
        `Ã°ÂÂ¤Â *Teleagente v2.1 ATIVO*\n\n` +
        `Bot reiniciado e online.\n` +
        `Modo ativo habilitado:\n` +
        `Ã¢ÂÂ¢ Ã°ÂÂÂ Briefing matinal ÃÂ s 8h\n` +
        `Ã¢ÂÂ¢ Ã¢ÂÂ° Alerta de prazo ÃÂ s 12h\n` +
        `Ã¢ÂÂ¢ Ã°ÂÂÂ Digest diÃÂ¡rio ÃÂ s 18h\n` +
        `Ã¢ÂÂ¢ Ã°ÂÂÂÃ¯Â¸Â Dia cego check ÃÂ s 20h\n\n` +
        `Grupos rastreados: ${Object.keys(trackedGroups).length}`
      );
    }, 30000);
  }
});
