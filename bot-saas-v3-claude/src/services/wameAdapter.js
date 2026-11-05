// A WAME API manda o webhook no formato "Cloud API" da Meta (o mesmo padrão
// da API oficial do WhatsApp). O resto do bot (botService.js, mensagemBuffer.js,
// os testes) foi construído em cima de um formato interno mais simples
// ({ phone, fromMe, isGroup, text:{message}, audio, image, sticker, buttonId }),
// então esse adaptador só faz a tradução de um formato pro outro — nada da
// lógica de atendimento precisa saber que existe um "envelope" da Meta.
//
// Referência: https://wame.api.br/docs/webhooks (webhookFormat: "meta")
function normalizarPayload(body) {
  const value = body?.entry?.[0]?.changes?.[0]?.value;
  const msg = value?.messages?.[0];
  if (!msg) return null; // status de entrega/leitura, conexão etc. — nada a processar

  const normalizado = {
    phone: msg.from,
    fromMe: !!msg.from_me,
    isGroup: msg.chat_type === 'group'
  };

  switch (msg.type) {
    case 'text':
      normalizado.text = { message: msg.text?.body || '' };
      break;
    case 'audio':
      normalizado.audio = msg.audio || {};
      break;
    case 'image':
      normalizado.image = msg.image || {};
      break;
    case 'sticker':
      normalizado.sticker = msg.sticker || {};
      break;
    case 'interactive':
      if (msg.interactive?.type === 'button_reply') {
        normalizado.buttonId = msg.interactive.button_reply?.id;
      }
      normalizado.text = { message: '' };
      break;
    default:
      // documento, localização, vídeo, contato etc. — cai no "tipo vazio" do
      // bot (pede pra descrever em texto) em vez de quebrar o processamento.
      normalizado.text = { message: '' };
  }

  return normalizado;
}

module.exports = { normalizarPayload };
