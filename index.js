import express from 'express';
import fetch from 'node-fetch';

const app = express();
app.use(express.json());

// ── ENV ────────────────────────────────────────────────────────────
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PIPEFY_TOKEN = process.env.PIPEFY_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const PLAN_URL = process.env.PLAN_API_URL || 'https://planejamento.monofloor.cloud/api';
const KIRA_URL = process.env.KIRA_API_URL || 'https://cliente.monofloor.cloud/api';
const TG_API = `https://api.telegram.org/bot${TG_TOKEN}`;

const VITOR_CHAT_ID = process.env.VITOR_CHAT_ID; // Vitor's private chat for briefings
const PIPE_OE = 306410007;
const PIPE_OEC = 306446640;
const FASE_EXEC = 338741343;

// ── ACTIVE MODE — TRACKED GROUPS ───────────────────────────────────
// Groups are auto-registered when bot receives a message from them
const trackedGroups = {}; // { chatId: { name, lastActivity, lastMessage, registered } }

// ── KEYWORD DETECTION SYSTEM ───────────────────────────────────────

const KEYWORDS = {
  finalizado: {
    label: '✅ Obra Finalizada',
    gravidade: 'marco',
    palavras: [
      'finalizado', 'finalizamos', 'terminamos', 'obra concluída',
      'obra concluida', 'entregue', 'aprovado pelo cliente',
      'vistoria aprovada', 'tudo pronto', 'obra pronta',
      'concluído', 'concluido', 'finalizada', 'entrega realizada',
      'cliente aprovou', 'vistoria ok', 'aprovação ok',
    ],
    minMatch: 1,
    resposta: '✅ *Obra Finalizada detectada!*\nRegistrado automaticamente na timeline.',
  },
  pausa: {
    label: '⏸️ Obra Pausada',
    gravidade: 'alta',
    palavras: [
      'obra pausada', 'pausamos', 'paramos', 'parou a obra',
      'aguardando definição', 'sem previsão de retomada',
      'cliente pediu pausa', 'obra parada', 'interrompemos',
    ],
    minMatch: 1,
    resposta: '⏸️ *Pausa detectada!*\nRegistrado na timeline. Motivo será solicitado.',
  },
  sem_aplicador: {
    label: '🚫 Sem Aplicador',
    gravidade: 'alta',
    palavras: [
      'sem aplicador', 'não compareceu', 'nao compareceu',
      'não veio', 'nao veio', 'faltou', 'não foi', 'nao foi',
      'só um aplicador', 'so um aplicador', 'sozinho na obra',
      'sem equipe', 'não conseguiu ir', 'nao conseguiu ir',
      'problemas pessoais', 'aplicador faltou',
    ],
    minMatch: 1,
    resposta: '🚫 *Ausência de aplicador detectada!*\nDia registrado como perda operacional.',
  },
  qualidade: {
    label: '⚠️ Problema de Qualidade',
    gravidade: 'alta',
    palavras: [
      'desplacamento', 'desplacou', 'manchou', 'mancha',
      'bolha', 'trinca', 'trincou', 'irregular', 'defeito',
      'mal executado', 'retocar', 'retoque', 'reaplicar',
      'tela aparente', 'telas aparentes', 'falha', 'rachadura',
      'amassado', 'amassamento', 'infiltração', 'infiltrou',
      'espelhamento', 'rejunte aparente', 'soltou', 'descascou',
    ],
    minMatch: 1,
    resposta: '⚠️ *Problema de qualidade detectado!*\nRegistrado para análise.',
  },
  comunicacao: {
    label: '💬 Falha de Comunicação',
    gravidade: 'media',
    palavras: [
      'alinhou direto', 'combinou com o cliente', 'sem comunicar',
      'sem passar pela operação', 'não informou', 'nao informou',
      'sem devolutiva', 'sem resposta', 'não respondeu',
      'cliente pediu direto', 'repassou prazo direto',
      'sem registro no grupo',
    ],
    minMatch: 1,
    resposta: '💬 *Falha de comunicação detectada!*\nRegistrado como ocorrência de processo.',
  },
  cliente: {
    label: '👤 Impedimento do Cliente',
    gravidade: 'media',
    palavras: [
      'cliente não pôde', 'cliente nao pode', 'sem acesso',
      'obra fechada', 'remarcação', 'remarcar',
      'portaria não liberou', 'portaria nao liberou',
      'cliente viajou', 'indisponível', 'indisponivel',
      'mudou o escopo', 'aguardando aprovação do cliente',
    ],
    minMatch: 1,
    resposta: '👤 *Impedimento do cliente detectado!*\nRegistrado como causa externa.',
  },
  clima: {
    label: '🌧️ Clima / Ambiente',
    gravidade: 'media',
    palavras: [
      'chuva', 'chovendo', 'umidade alta', 'vazamento',
      'goteira', 'alagou', 'molhado', 'não secou', 'nao secou',
      'demora pra secar', 'umidade atrasando',
    ],
    minMatch: 1,
    resposta: '🌧️ *Condição climática detectada!*\nRegistrado como causa externa.',
  },
  material_extra: {
    label: '📦 Material Extra',
    gravidade: 'media',
    palavras: [
      'material extra', 'faltou material', 'acabou o material',
      'solicitar material', 'pedir material', 'produção extra',
      'material adicional', 'faltou massa', 'faltou verniz',
      'faltou primer', 'faltou selador',
    ],
    minMatch: 1,
    resposta: '📦 *Solicitação de material extra detectada!*\nRegistrado na timeline.',
  },
  diario: {
    label: '📸 Diário de Obra',
    gravidade: 'info',
    palavras: [
      'aplicamos hoje', 'executamos', 'primeira demão',
      'segunda demão', 'terceira demão', 'lixamento concluído',
      'selador aplicado', 'verniz aplicado', 'primer aplicado',
      'massa aplicada', 'diário de obra', 'diario de obra',
    ],
    minMatch: 1,
    resposta: null, // Diário não precisa de confirmação
  },
};

// ── STORAGE (in-memory — persists while Railway is up) ─────────────

const ocorrencias = {}; // { chatId: [{ tipo, msg, autor, data, keywords }] }
const obraStatus = {};  // { chatId: { statusReal, ultimoSinal, data } }
const diasRegistro = {}; // { chatId: { [date]: true } } — para detectar dias cegos

// ── DETECTION ENGINE ───────────────────────────────────────────────

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

  // Marcar dia com registro (para detecção de dia cego)
  const hoje = new Date().toISOString().split('T')[0];
  if (!diasRegistro[chatId]) diasRegistro[chatId] = {};
  diasRegistro[chatId][hoje] = true;

  return registro;
}

// ── TELEGRAM HELPERS ───────────────────────────────────────────────

async function sendMsg(chatId, text, opts = {}) {
  await fetch(`${TG_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', ...opts }),
  });
}

// ── PIPEFY HELPERS ─────────────────────────────────────────────────

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
  const fases = oe.data.pipe.phases.filter(p => p.cards_count > 15).map(p => `• *${p.name}*: ${p.cards_count} cards`);
  const oecFases = oec.data.pipe.phases.filter(p => p.cards_count > 10).map(p => `• *${p.name}*: ${p.cards_count} cards`);
  return { oe: fases, oec: oecFases };
}

// ── PLAN API HELPERS ───────────────────────────────────────────────

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

// ── AI HELPER ──────────────────────────────────────────────────────

async function ai(prompt) {
  if (!ANTHROPIC_KEY) return 'Chave Anthropic não configurada. Configure ANTHROPIC_API_KEY no Railway.';
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

// ── KIRA API HELPERS (cliente.monofloor.cloud) ────────────────────

async function kiraSearchProject(nome) {
  try {
    const r = await fetch(`${KIRA_URL}/projects?limit=500`);
    const d = await r.json();
    const projects = Array.isArray(d) ? d : (d.projects || []);
    const lower = nome.toLowerCase();
    return projects.filter(p => {
      const pName = (p.clienteNome || p.name || p.title || '').toLowerCase();
      return pName.includes(lower);
    });
  } catch (e) {
    console.error('[KIRA] Erro buscando projetos:', e.message);
    return [];
  }
}

async function kiraGetMessages(projectId, source = 'all', limit = 20) {
  try {
    const r = await fetch(`${KIRA_URL}/projects/${projectId}/messages?source=${source}&limit=${limit}`);
    if (!r.ok) return [];
    const d = await r.json();
    return d.messages || d || [];
  } catch { return []; }
}

async function kiraGetAlerts(projectId) {
  try {
    const r = await fetch(`${KIRA_URL}/projects/${projectId}/alerts`);
    if (!r.ok) return [];
    const d = await r.json();
    return d.alerts || d || [];
  } catch { return []; }
}

async function kiraGetOcorrencias(projectId) {
  try {
    const r = await fetch(`${KIRA_URL}/projects/${projectId}/ocorrencias`);
    if (!r.ok) return [];
    const d = await r.json();
    return d.ocorrencias || d || [];
  } catch { return []; }
}

async function kiraGetMateriais(projectId) {
  try {
    const r = await fetch(`${KIRA_URL}/projects/${projectId}/materiais`);
    if (!r.ok) return [];
    const d = await r.json();
    return d.materiais || d || [];
  } catch { return []; }
}

// ── COMMAND HANDLERS ───────────────────────────────────────────────

const commands = {
  '/obras': async (chatId) => {
    const obras = await getObrasExecucao();
    if (!obras.length) return sendMsg(chatId, 'Nenhuma obra em execução.');
    let msg = `🔨 *Obras em Execução* (${obras.length})\n\n`;
    obras.forEach(o => {
      const status = obraStatus[chatId]; // Check for telegram overrides
      const dias = o.age;
      const emoji = dias > (parseInt(o.prazo) || 30) ? '🔴' : dias > (parseInt(o.prazo) || 30) * 0.7 ? '🟡' : '🟢';
      msg += `${emoji} *${o.title}*\n   ${dias}d na fase | Prazo: ${o.prazo || '—'}d | ${o.tipo || 'NOVA'}\n\n`;
    });
    return sendMsg(chatId, msg);
  },

  '/gargalos': async (chatId) => {
    const g = await getGargalos();
    let msg = '🚧 *Gargalos Ativos*\n\n';
    if (g.oe.length) msg += '*OPERAÇÕES:*\n' + g.oe.join('\n') + '\n\n';
    if (g.oec.length) msg += '*CORES:*\n' + g.oec.join('\n');
    return sendMsg(chatId, msg || 'Nenhum gargalo crítico no momento.');
  },

  '/atrasadas': async (chatId) => {
    const obras = await getAtrasadas();
    if (!obras.length) return sendMsg(chatId, '✅ Nenhuma obra atrasada!');
    let msg = `🔴 *Obras Atrasadas* (${obras.length})\n\n`;
    obras.forEach(o => { msg += `• *${o.name || o.title}*\n`; });
    return sendMsg(chatId, msg);
  },

  '/aproveitamento': async (chatId) => {
    const a = await getAproveitamento();
    const emoji = a.pct >= 80 ? '🟢' : a.pct >= 60 ? '🟡' : '🔴';
    return sendMsg(chatId, `${emoji} *Aproveitamento: ${a.pct}%*\n\n${a.onTime} de ${a.total} obras no prazo.`);
  },

  '/alerta': async (chatId) => {
    const [g, a] = await Promise.all([getGargalos(), getAtrasadas()]);
    let msg = '🚨 *Painel de Alertas*\n\n';
    msg += `• ${a.length} obras atrasadas\n`;
    msg += `• ${g.oe.length + g.oec.length} gargalos ativos\n`;

    // Include telegram signals
    const signals = Object.entries(obraStatus).filter(([, v]) => v.statusReal === 'finalizado' || v.statusReal === 'pausa');
    if (signals.length) {
      msg += `\n✈️ *Sinais do Telegram:*\n`;
      signals.forEach(([, v]) => {
        const emoji = v.statusReal === 'finalizado' ? '✅' : '⏸️';
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
      found.slice(0, 5).forEach(p => { msg += `📋 *${p.name || p.title}*\nStatus: ${p.status || '—'}\n\n`; });
      return sendMsg(chatId, msg);
    } catch { return sendMsg(chatId, 'Erro ao consultar planejamento.'); }
  },

  '/mensagens': async (chatId, args) => {
    if (!args) return sendMsg(chatId, 'Use: /mensagens [nome do cliente]\nExemplo: /mensagens Christian Kort');
    try {
      const projects = await kiraSearchProject(args);
      if (!projects.length) return sendMsg(chatId, `Nenhuma obra encontrada para "${args}".`);
      const proj = projects[0];
      const projectId = proj.id || proj._id;
      const nome = proj.clienteNome || proj.name || proj.title || args;
      const msgs = await kiraGetMessages(projectId, 'all', 15);
      if (!msgs.length) return sendMsg(chatId, `📭 Nenhuma mensagem encontrada para *${nome}*.`);

      let resp = `💬 *Mensagens — ${nome}*\n`;
      resp += `📊 Últimas ${Math.min(msgs.length, 15)} mensagens:\n\n`;

      msgs.slice(0, 15).forEach(m => {
        const source = (m.source || m.tipo || '').toUpperCase().substring(0, 2);
        const badge = source === 'TE' ? '🔵' : source === 'WH' ? '🟢' : '⚪';
        const data = m.date || m.data || m.createdAt || '';
        const dataFmt = data ? new Date(data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
        const autor = m.author || m.autor || m.from || '';
        const texto = (m.content || m.text || m.mensagem || '').substring(0, 80);
        resp += `${badge} ${dataFmt} — *${autor}*\n${texto}\n\n`;
      });

      return sendMsg(chatId, resp);
    } catch (e) {
      console.error('[KIRA] Erro /mensagens:', e.message);
      return sendMsg(chatId, `Erro ao buscar mensagens: ${e.message}`);
    }
  },

  '/atividade': async (chatId, args) => {
    if (!args) return sendMsg(chatId, 'Use: /atividade [nome do cliente]\nExemplo: /atividade Sueli Higa');
    try {
      const projects = await kiraSearchProject(args);
      if (!projects.length) return sendMsg(chatId, `Nenhuma obra encontrada para "${args}".`);
      const proj = projects[0];
      const projectId = proj.id || proj._id;
      const nome = proj.clienteNome || proj.name || proj.title || args;

      const [alertas, ocs, materiais, msgs] = await Promise.all([
        kiraGetAlerts(projectId),
        kiraGetOcorrencias(projectId),
        kiraGetMateriais(projectId),
        kiraGetMessages(projectId, 'all', 5),
      ]);

      let resp = `📊 *Atividade — ${nome}*\n\n`;

      // Alertas
      if (alertas.length) {
        resp += `🚨 *${alertas.length} Alertas:*\n`;
        alertas.slice(0, 5).forEach(a => {
          const desc = a.message || a.descricao || a.title || JSON.stringify(a).substring(0, 60);
          resp += `• ${desc}\n`;
        });
        resp += '\n';
      }

      // Ocorrências
      if (ocs.length) {
        resp += `📋 *${ocs.length} Ocorrências:*\n`;
        ocs.slice(0, 5).forEach(o => {
          const desc = o.descricao || o.description || o.title || JSON.stringify(o).substring(0, 60);
          resp += `• ${desc}\n`;
        });
        resp += '\n';
      }

      // Materiais
      if (materiais.length) {
        resp += `📦 *${materiais.length} Materiais:*\n`;
        materiais.slice(0, 3).forEach(m => {
          const desc = m.nome || m.name || m.material || JSON.stringify(m).substring(0, 60);
          resp += `• ${desc}\n`;
        });
        resp += '\n';
      }

      // Últimas mensagens
      if (msgs.length) {
        resp += `💬 *Últimas mensagens:*\n`;
        msgs.slice(0, 3).forEach(m => {
          const texto = (m.content || m.text || m.mensagem || '').substring(0, 60);
          const autor = m.author || m.autor || m.from || '';
          resp += `• ${autor}: ${texto}\n`;
        });
      }

      if (!alertas.length && !ocs.length && !materiais.length && !msgs.length) {
        resp += '📭 Nenhum dado encontrado na KIRA para este projeto.';
      }

      return sendMsg(chatId, resp);
    } catch (e) {
      console.error('[KIRA] Erro /atividade:', e.message);
      return sendMsg(chatId, `Erro ao buscar atividade: ${e.message}`);
    }
  },

  '/ocorrencias': async (chatId) => {
    const ocs = ocorrencias[chatId];
    if (!ocs || !ocs.length) return sendMsg(chatId, '📋 Nenhuma ocorrência registrada neste grupo.');
    let msg = `📋 *Ocorrências Registradas* (${ocs.length})\n\n`;
    ocs.slice(-10).forEach(o => {
      const data = new Date(o.data).toLocaleDateString('pt-BR');
      msg += `${KEYWORDS[o.tipo]?.label || o.tipo} — ${data}\n_${o.mensagem.substring(0, 60)}_\n\n`;
    });
    return sendMsg(chatId, msg);
  },

  '/resumo': async (chatId) => {
    const ocs = ocorrencias[chatId] || [];
    const status = obraStatus[chatId];
    const dias = diasRegistro[chatId] || {};
    const totalDias = Object.keys(dias).length;

    let msg = '📊 *Resumo da Obra*\n\n';
    msg += `📅 Dias com registro: *${totalDias}*\n`;
    msg += `📋 Total ocorrências: *${ocs.length}*\n`;

    // Count by type
    const byType = {};
    ocs.forEach(o => { byType[o.tipo] = (byType[o.tipo] || 0) + 1; });
    Object.entries(byType).forEach(([tipo, count]) => {
      msg += `   ${KEYWORDS[tipo]?.label || tipo}: ${count}\n`;
    });

    if (status) {
      msg += `\n✈️ Status real: *${status.statusReal.toUpperCase()}*`;
    }
    return sendMsg(chatId, msg);
  },

  '/ajuda': async (chatId) => {
    return sendMsg(chatId, `🤖 *Teleagente Monofloor v2.2*\n\n` +
      `*Comandos:*\n` +
      `/obras — Obras em execução\n` +
      `/gargalos — Gargalos ativos\n` +
      `/atrasadas — Obras atrasadas\n` +
      `/aproveitamento — Taxa no prazo\n` +
      `/alerta — Painel de alertas\n` +
      `/status [nome] — Buscar obra\n\n` +
      `*KIRA (dados ao vivo):*\n` +
      `/mensagens [nome] — Mensagens TG/WA da obra\n` +
      `/atividade [nome] — Alertas, ocorrências e materiais\n\n` +
      `*Ocorrências e registro:*\n` +
      `/ocorrencias — Histórico do grupo\n` +
      `/resumo — Resumo da obra\n` +
      `/diario [texto] — Registrar diário\n` +
      `/ocorrencia [tipo] — Registrar evento\n` +
      `/finalizar — Marcar como concluída\n` +
      `/pausa [motivo] — Pausar obra\n` +
      `/retomar — Retomar obra\n\n` +
      `*Modo Ativo:*\n` +
      `/briefing — Disparar briefing agora\n` +
      `/digest — Disparar digest agora\n` +
      `/grupos — Ver grupos rastreados\n\n` +
      `🤖 Detecção automática ativa em grupos.`
    );
  },

  '/diario': async (chatId, args, from) => {
    if (!args) return sendMsg(chatId, 'Use: /diario [descrição do que foi executado hoje]');
    registrarOcorrencia(chatId, 'diario', args, from, ['diário manual']);
    return sendMsg(chatId, '📸 Diário registrado!');
  },

  '/ocorrencia': async (chatId, args, from) => {
    if (!args) return sendMsg(chatId, 'Use: /ocorrencia [tipo] [descrição]\nTipos: sem_aplicador, qualidade, comunicacao, cliente, clima, material');
    const parts = args.split(' ');
    const tipo = parts[0];
    const desc = parts.slice(1).join(' ') || 'Sem descrição';
    if (!KEYWORDS[tipo] && tipo !== 'material') return sendMsg(chatId, `Tipo "${tipo}" não reconhecido.\nTipos válidos: sem_aplicador, qualidade, comunicacao, cliente, clima, material`);
    const tipoFinal = tipo === 'material' ? 'material_extra' : tipo;
    registrarOcorrencia(chatId, tipoFinal, desc, from, ['comando manual']);
    return sendMsg(chatId, `${KEYWORDS[tipoFinal]?.label || tipo} registrado!`);
  },

  '/finalizar': async (chatId, args, from) => {
    registrarOcorrencia(chatId, 'finalizado', args || 'Obra finalizada via comando', from, ['comando /finalizar']);
    return sendMsg(chatId, '✅ *Obra marcada como FINALIZADA!*\n\n⚠️ Lembre de mover o card no Pipefy para "Obra Concluída".');
  },

  '/pausa': async (chatId, args, from) => {
    registrarOcorrencia(chatId, 'pausa', args || 'Obra pausada via comando', from, ['comando /pausa']);
    return sendMsg(chatId, '⏸️ *Obra marcada como PAUSADA!*\nMotivo: ' + (args || 'Não informado'));
  },

  '/retomar': async (chatId, args, from) => {
    if (obraStatus[chatId]?.statusReal === 'pausa') {
      delete obraStatus[chatId];
    }
    registrarOcorrencia(chatId, 'diario', 'Obra retomada' + (args ? ': ' + args : ''), from, ['comando /retomar']);
    return sendMsg(chatId, '▶️ *Obra RETOMADA!*');
  },

  '/semana': async (chatId) => {
    const [obras, atrasadas, aproveitamento] = await Promise.all([
      getObrasExecucao(),
      getAtrasadas(),
      getAproveitamento(),
    ]);
    const prompt = `Dados Monofloor esta semana:
- ${obras.length} obras em execução
- ${atrasadas.length} atrasadas
- Aproveitamento: ${aproveitamento.pct}%
Gere um resumo executivo semanal em português, direto e objetivo, com emojis.`;
    const resp = await ai(prompt);
    return sendMsg(chatId, resp);
  },

  '/briefing': async (chatId) => {
    await briefingMatinal();
    if (chatId !== parseInt(VITOR_CHAT_ID)) {
      return sendMsg(chatId, '🌅 Briefing disparado! Enviado para o chat do Vitor.');
    }
  },

  '/id': async (chatId) => {
    return sendMsg(chatId, `🆔 Seu Chat ID: \`${chatId}\`\n\nAdicione como VITOR_CHAT_ID no Railway para receber briefings.`);
  },

  '/digest': async (chatId) => {
    await digestDiario();
    if (chatId !== parseInt(VITOR_CHAT_ID)) {
      return sendMsg(chatId, '📊 Digest disparado! Enviado para o chat do Vitor.');
    }
  },

  '/grupos': async (chatId) => {
    const groups = Object.entries(trackedGroups);
    if (!groups.length) return sendMsg(chatId, 'Nenhum grupo rastreado ainda. O bot registra automaticamente ao receber mensagens em grupos.');
    let msg = `📡 *Grupos Rastreados* (${groups.length})\n\n`;
    groups.forEach(([id, g]) => {
      const lastAct = new Date(g.lastActivity).toLocaleString('pt-BR');
      msg += `• *${g.name}*\n  Última atividade: ${lastAct}\n\n`;
    });
    return sendMsg(chatId, msg);
  },
};

// ── WEBHOOK HANDLER ────────────────────────────────────────────────

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  try {
    const msg = req.body.message;
    if (!msg) return;

    const chatId = msg.chat.id;
    const text = msg.text || '';
    const from = msg.from?.first_name || 'Desconhecido';
    const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

    // ── AUTO-TRACK GROUPS ──
    if (isGroup) {
      trackedGroups[chatId] = {
        name: msg.chat.title || `Grupo ${chatId}`,
        lastActivity: new Date().toISOString(),
        lastMessage: text.substring(0, 100),
        registered: trackedGroups[chatId]?.registered || new Date().toISOString(),
      };
    }

    // ── COMMAND HANDLING ──
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

    // ── GROUP MESSAGE: KEYWORD DETECTION ──
    if (isGroup && text.length > 5) {
      const matches = detectKeywords(text);

      if (matches.length > 0) {
        const primary = matches[0]; // Highest priority match

        // Register the occurrence
        registrarOcorrencia(chatId, primary.tipo, text, from, primary.keywords);

        // Send confirmation (except for diários — too noisy)
        if (primary.resposta) {
          const kwList = primary.keywords.slice(0, 3).map(k => `\`${k}\``).join(', ');
          await sendMsg(chatId,
            `${primary.resposta}\n\n` +
            `👤 ${from}\n` +
            `🔑 Keywords: ${kwList}\n` +
            `📋 Total ocorrências: ${(ocorrencias[chatId] || []).length}`,
            { reply_to_message_id: msg.message_id }
          );
        }

        // If it's a finalization, add extra reminder
        if (primary.tipo === 'finalizado') {
          setTimeout(() => {
            sendMsg(chatId, '⚠️ *Lembrete:* Mova o card no Pipefy para "Obra Concluída" para sincronizar o status.');
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

    // ── PRIVATE MESSAGE: AI CHAT ──
    if (!isGroup && !text.startsWith('/')) {
      const resp = await ai(
        `Você é o Teleagente da Monofloor, assistente operacional. Monofloor é uma empresa de superfícies contínuas premium (compósito mineral + polímero). ` +
        `Vitor Gomes (Gerente de Qualidade) perguntou: "${text}". ` +
        `Responda direto em português, objetivo e com emojis quando apropriado.`
      );
      await sendMsg(chatId, resp);
    }
  } catch (err) {
    console.error('Webhook error:', err);
  }
});

// ── HEALTH CHECK + API ─────────────────────────────────────────────

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    bot: '@monofloor_op_bot',
    version: '2.2.0-kira',
    features: ['commands', 'keyword_detection', 'classification', 'ai_chat', 'proactive_briefing', 'dia_cego_detection', 'prazo_alerts', 'daily_digest', 'kira_messages', 'kira_activity'],
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

// ══════════════════════════════════════════════════════════════════
// MODO ATIVO — AÇÕES PROATIVAS DO BOT
// O bot toma iniciativa: briefings, alertas, follow-ups
// ══════════════════════════════════════════════════════════════════

// ── BRIEFING MATINAL (8h) ──────────────────────────────────────────
async function briefingMatinal() {
  if (!VITOR_CHAT_ID) return console.log('VITOR_CHAT_ID não configurado — briefing ignorado');
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

    let msg = `🌅 *Briefing Matinal — ${new Date().toLocaleDateString('pt-BR')}*\n\n`;
    msg += `🔨 *${obras.length}* obras em execução\n`;
    msg += `🔴 *${atrasadas.length}* além do prazo\n`;
    msg += `👁️ *${gruposSilenciosos.length}* grupos sem registro ontem\n`;

    if (sinais.length) {
      msg += `\n✈️ *Sinais Telegram pendentes:*\n`;
      sinais.forEach(([, v]) => {
        const emoji = v.statusReal === 'finalizado' ? '✅' : '⏸️';
        msg += `${emoji} ${v.ultimoSinal.mensagem.substring(0, 50)}...\n`;
      });
    }

    if (gruposSilenciosos.length) {
      msg += `\n👁️ *Grupos silenciosos ontem:*\n`;
      gruposSilenciosos.slice(0, 5).forEach(([, g]) => {
        msg += `• ${g.name}\n`;
      });
    }

    if (atrasadas.length) {
      msg += `\n🔴 *Obras além do prazo:*\n`;
      atrasadas.slice(0, 5).forEach(o => {
        msg += `• *${o.title}* — ${o.age}d na fase (prazo: ${o.prazo || '—'}d)\n`;
      });
    }

    msg += `\n_Próximo briefing amanhã às 8h._`;
    await sendMsg(VITOR_CHAT_ID, msg);
    console.log(`[ATIVO] Briefing matinal enviado — ${obras.length} obras, ${atrasadas.length} atrasadas`);
  } catch (e) { console.error('[ATIVO] Erro no briefing:', e.message); }
}

// ── DETECTOR DE DIA CEGO (20h) ─────────────────────────────────────
async function detectarDiasCegos() {
  const hoje = new Date().toISOString().split('T')[0];
  let alertados = 0;

  for (const [chatId, grupo] of Object.entries(trackedGroups)) {
    const dias = diasRegistro[chatId] || {};
    if (!dias[hoje]) {
      // Grupo ficou em silêncio o dia inteiro
      registrarOcorrencia(chatId, 'dia_cego', 'Nenhum registro detectado hoje (automático)', 'Teleagente', ['dia cego', 'silêncio']);

      await sendMsg(chatId,
        `👁️ *Dia sem registro detectado!*\n\n` +
        `Nenhuma mensagem foi registrada no grupo hoje.\n` +
        `Se a obra está ativa, como está o andamento?\n\n` +
        `_Registrado automaticamente como "dia cego"._`
      );
      alertados++;

      // Pausa entre mensagens para não ser rate-limited
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // Verificar silêncio de 2+ dias consecutivos
  for (const [chatId, grupo] of Object.entries(trackedGroups)) {
    const dias = diasRegistro[chatId] || {};
    const ontem = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (!dias[hoje] && !dias[ontem]) {
      await sendMsg(chatId,
        `🔇 *Silêncio prolongado — 2 dias sem registro*\n\n` +
        `Este grupo está sem atividade há 2 dias.\n` +
        `A obra está pausada? Use /pausa [motivo]\n` +
        `Ainda ativa? Envie um /diario com o status.`
      );
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`[ATIVO] Dia cego check — ${alertados} grupos alertados de ${Object.keys(trackedGroups).length}`);
}

// ── ALERTA DE PRAZO (diário) ───────────────────────────────────────
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
          `⏰ *Alerta de Prazo — 3 dias restantes*\n\n` +
          `A obra *${obra.title}* tem prazo previsto para ${prazoDate.toLocaleDateString('pt-BR')}.\n` +
          `Faltam *3 dias*. Status atual: ${obra.age}d na fase.`
        );
      } else if (diasRestantes === 1 && grupoMatch) {
        await sendMsg(grupoMatch[0],
          `🚨 *Prazo AMANHÃ!*\n\n` +
          `A obra *${obra.title}* precisa ser finalizada até amanhã (${prazoDate.toLocaleDateString('pt-BR')}).`
        );
      } else if (diasRestantes === 0 && grupoMatch) {
        await sendMsg(grupoMatch[0],
          `🔴 *PRAZO ESGOTADO HOJE!*\n\n` +
          `A obra *${obra.title}* deveria ter sido finalizada hoje.\n` +
          `Use /finalizar quando concluir ou /pausa se houver impedimento.`
        );
      }

      if (grupoMatch) await new Promise(r => setTimeout(r, 500));
    }

    console.log(`[ATIVO] Alerta de prazo — ${obras.length} obras verificadas`);
  } catch (e) { console.error('[ATIVO] Erro no alerta de prazo:', e.message); }
}

// ── DIGEST DIÁRIO (18h) ────────────────────────────────────────────
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
      await sendMsg(VITOR_CHAT_ID, `📊 *Digest Diário — ${new Date().toLocaleDateString('pt-BR')}*\n\nNenhuma ocorrência registrada hoje.`);
      return;
    }

    let msg = `📊 *Digest Diário — ${new Date().toLocaleDateString('pt-BR')}*\n\n`;
    msg += `📋 *${totalOcs}* ocorrências em *${gruposAtivos.length}* grupos\n\n`;

    msg += `*Por tipo:*\n`;
    for (const [tipo, count] of Object.entries(resumoPorTipo).sort((a, b) => b[1] - a[1])) {
      msg += `${KEYWORDS[tipo]?.label || tipo}: *${count}*\n`;
    }

    msg += `\n*Grupos ativos hoje:*\n`;
    gruposAtivos.slice(0, 8).forEach(g => { msg += `• ${g}\n`; });

    msg += `\n_Próximo digest amanhã às 18h._`;
    await sendMsg(VITOR_CHAT_ID, msg);
    console.log(`[ATIVO] Digest enviado — ${totalOcs} ocorrências`);
  } catch (e) { console.error('[ATIVO] Erro no digest:', e.message); }
}

// ── SCHEDULER ──────────────────────────────────────────────────────

function getBRTime() {
  // Horário de Brasília (UTC-3)
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

    // 08:00 — Briefing matinal (run between 08:00-08:04)
    if (h === 8 && m < 5) {
      briefingMatinal();
    }

    // 12:00 — Alerta de prazo (midday check)
    if (h === 12 && m < 5) {
      alertaPrazo();
    }

    // 18:00 — Digest diário
    if (h === 18 && m < 5) {
      digestDiario();
    }

    // 20:00 — Detector de dia cego
    if (h === 20 && m < 5) {
      detectarDiasCegos();
    }
  }, 5 * 60 * 1000); // Every 5 minutes

  console.log('[ATIVO] Schedulers iniciados — Briefing 8h | Prazo 12h | Digest 18h | Dia Cego 20h');
}

// API — tracked groups
app.get('/api/groups', (req, res) => {
  res.json(trackedGroups);
});

// ── START ──────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Teleagente v2.2 ATIVO + KIRA — port ${PORT}`);
  console.log(`Keywords: ${Object.values(KEYWORDS).reduce((s, k) => s + k.palavras.length, 0)} mapped`);
  console.log(`Types: ${Object.keys(KEYWORDS).length}`);
  console.log(`VITOR_CHAT_ID: ${VITOR_CHAT_ID ? 'configurado' : '⚠️ NÃO CONFIGURADO'}`);

  // Start proactive schedulers
  startSchedulers();

  // Run initial briefing 30s after boot (for testing)
  if (VITOR_CHAT_ID) {
    setTimeout(() => {
      sendMsg(VITOR_CHAT_ID,
        `🤖 *Teleagente v2.2 ATIVO — KIRA integrada*\n\n` +
        `Bot reiniciado e online.\n` +
        `Modo ativo habilitado:\n` +
        `• 🌅 Briefing matinal às 8h\n` +
        `• ⏰ Alerta de prazo às 12h\n` +
        `• 📊 Digest diário às 18h\n` +
        `• 👁️ Dia cego check às 20h\n\n` +
        `🆕 *Novos comandos KIRA:*\n` +
        `• /mensagens [nome] — msgs TG/WA\n` +
        `• /atividade [nome] — alertas + ocorrências\n\n` +
        `Grupos rastreados: ${Object.keys(trackedGroups).length}`
      );
    }, 30000);
  }
});
