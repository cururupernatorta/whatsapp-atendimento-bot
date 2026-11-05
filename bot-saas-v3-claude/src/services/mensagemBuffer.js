const { processarMensagem } = require('./botService');

// No WhatsApp é comum o cliente mandar em 2-3 balõezinhos seguidos o que seria
// uma única mensagem ("oi" / "queria um orçamento" / "de óculos de sol").
// Sem isso, o bot responderia a cada balão isoladamente (parece robótico e
// picotado) e, pior, duas mensagens quase simultâneas podem disparar duas
// chamadas concorrentes de processarMensagem pro mesmo cliente, cada uma sem
// ver a mensagem que a outra acabou de adicionar na sessão (uma pisa na outra).
// Aqui, mensagens de texto próximas no tempo são agrupadas numa só antes de
// seguir pro processamento de verdade.
const BUFFER_DELAY_MS = 4000;
const RETRY_DELAY_MS = 1000;

const buffers = new Map(); // key -> { textos: [], body, timer }
const emProcessamento = new Set();

function agendarProcessamento(cliente, body) {
  const temTexto = !body.audio && !body.image && !body.sticker && !!(body.text && body.text.message && body.text.message.trim());
  if (!temTexto || body.fromMe || body.isGroup) {
    processarMensagem(cliente, body).catch(err => console.error(`[WEBHOOK ERRO] ${cliente.clientId}:`, err.message));
    return;
  }

  const key = `${cliente.clientId}:${body.phone}`;
  let buf = buffers.get(key);
  if (!buf) {
    buf = { textos: [], body: null, timer: null };
    buffers.set(key, buf);
  }
  buf.textos.push(body.text.message.trim());
  buf.body = body;
  clearTimeout(buf.timer);
  buf.timer = setTimeout(() => disparar(cliente, key), BUFFER_DELAY_MS);
}

function disparar(cliente, key) {
  if (emProcessamento.has(key)) {
    // já tem uma resposta sendo gerada pra esse cliente — tenta de novo logo
    // em seguida em vez de processar por cima (evita a mesma condição de corrida).
    const buf = buffers.get(key);
    if (buf) buf.timer = setTimeout(() => disparar(cliente, key), RETRY_DELAY_MS);
    return;
  }

  const buf = buffers.get(key);
  if (!buf) return;
  buffers.delete(key);
  emProcessamento.add(key);

  const mensagemUnificada = buf.textos.join('\n');
  const bodyFinal = { ...buf.body, text: { ...buf.body.text, message: mensagemUnificada } };

  processarMensagem(cliente, bodyFinal)
    .catch(err => console.error(`[WEBHOOK ERRO] ${cliente.clientId}:`, err.message))
    .finally(() => emProcessamento.delete(key));
}

module.exports = { agendarProcessamento };
