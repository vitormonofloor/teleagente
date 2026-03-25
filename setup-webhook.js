#!/usr/bin/env node
// ═══════════════════════════════════════════════════════
//  setup-webhook.js — Registra o webhook no Telegram
//  Execute UMA VEZ após o deploy no Railway:
//  node setup-webhook.js
// ═══════════════════════════════════════════════════════

const BOT_TOKEN  = process.env.TELEGRAM_BOT_TOKEN || process.argv[2];
const WEBHOOK_URL = process.env.WEBHOOK_URL || process.argv[3];

if (!BOT_TOKEN || !WEBHOOK_URL) {
  console.error('Uso: TELEGHAM_BOT_TOKEN=xxx WEBHOOK_URL=https://seu-app.railway.app/webhook node setup-webhook.js');
  process.exit(1);
}

async function setup() {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`);
  console.log('✓ Webhook antigo removido');
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: WEBHOOK_URL, allowed_updates: ['message'] }),
  });
  const d = await r.json();
  console.log(d.ok ? '℅ Webhook registrado!' : '★ Erro: ' + d.description);
}
setup().catch(console.error);
