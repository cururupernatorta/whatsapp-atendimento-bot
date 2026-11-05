const { enviarWhatsApp } = require('./wameService');

// Alerta crítico simples via WhatsApp pro dono do sistema, usando a chave
// WAME PRÓPRIA (OWNER_WAME_KEY, já configurada pros relatórios semanais) —
// não depende da WAME API de nenhum cliente, então funciona mesmo se o Mongo
// ou um cliente específico estiver com problema. Sem serviço de monitoramento
// externo configurado, isso é o alerta possível hoje.
const THROTTLE_MS = 30 * 60 * 1000; // no máximo 1 alerta do mesmo tipo a cada 30min
const ultimoAlerta = new Map();

async function alertarErroCritico(titulo, detalhe) {
  const key = process.env.OWNER_WAME_KEY;
  const numero = process.env.OWNER_WHATSAPP_NUMBER;
  if (!key || !numero) {
    console.warn('[ALERTA] OWNER_WAME_KEY/OWNER_WHATSAPP_NUMBER não configurados — alerta não enviado:', titulo);
    return;
  }

  const agora = Date.now();
  const ultimaVez = ultimoAlerta.get(titulo) || 0;
  if (agora - ultimaVez < THROTTLE_MS) return;
  ultimoAlerta.set(titulo, agora);

  const msg = `🚨 *${titulo}*\n\n${detalhe}\n\n⏰ ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
  try {
    await enviarWhatsApp(key, numero, msg);
  } catch (err) {
    console.error('[ALERTA ERRO] Não consegui enviar o alerta:', err.message);
  }
}

module.exports = { alertarErroCritico };
