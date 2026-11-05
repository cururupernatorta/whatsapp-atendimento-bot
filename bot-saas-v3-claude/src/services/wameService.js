const axios = require('axios');

// WAME API — diferente do Z-API, usa uma única chave por número (não
// instância + token separados). Docs: https://wame.api.br/docs
const WAME_BASE = 'https://us.api-wa.me';

function semCredenciais(key) {
  return !key;
}

function mockEnviar(tipo, phone, message, extra) {
  console.log(`\n[WAME MOCK] ${tipo} → ${phone}\n${message}${extra ? '\n' + extra : ''}\n`);
}

async function enviarWhatsApp(key, phone, message) {
  if (!message || !message.trim()) return;
  if (semCredenciais(key)) return mockEnviar('Texto', phone, message);
  const url = `${WAME_BASE}/${key}/message/text`;
  try {
    await axios.post(url, { to: phone, text: message, ia: false, provider: 'whatsapp' },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
    console.log(`[WAME] Texto → ${phone}`);
  } catch (err) {
    console.error(`[WAME ERRO] ${phone}:`, err.response?.data?.message || err.message);
  }
}

async function enviarBotao(key, phone, message, buttons) {
  if (!buttons || buttons.length === 0) return enviarWhatsApp(key, phone, message);
  if (semCredenciais(key)) return mockEnviar('Botão', phone, message, `Botões: ${buttons.map(b => b.label).join(', ')}`);
  const url = `${WAME_BASE}/${key}/message/button_reply`;
  try {
    await axios.post(url, {
      to: phone,
      text: message,
      buttons: buttons.map(b => ({ type: 'quick_reply', id: b.id, text: b.label }))
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
    console.log(`[WAME] Botão → ${phone}`);
  } catch (err) {
    console.error(`[WAME BOTÃO ERRO] ${phone}:`, err.response?.data?.message || err.message);
    await enviarWhatsApp(key, phone, message);
  }
}

module.exports = { enviarWhatsApp, enviarBotao };
