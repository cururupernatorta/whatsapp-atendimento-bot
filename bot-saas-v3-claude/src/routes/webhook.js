const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const { getClientById } = require('../models/Client');
const { processarBotao } = require('../services/botService');
const { agendarProcessamento } = require('../services/mensagemBuffer');
const { normalizarPayload } = require('../services/wameAdapter');

function segredoValido(recebido, esperado) {
  if (!recebido || !esperado) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

router.post('/:clientId/:secret', async (req, res) => {
  const { clientId, secret } = req.params;
  try {
    const cliente = await getClientById(clientId);
    if (!cliente) {
      console.warn(`[WEBHOOK] Cliente não encontrado: ${clientId}`);
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    if (!segredoValido(secret, cliente.webhookSecret)) {
      console.warn(`[WEBHOOK] Segredo inválido pra ${clientId} (IP ${req.ip})`);
      return res.status(401).json({ error: 'Não autorizado' });
    }

    const body = normalizarPayload(req.body);
    if (!body) return res.status(200).json({ received: true }); // status de entrega/leitura etc.

    if (body.buttonId) {
      processarBotao(cliente, body).catch(err => console.error('[BOTÃO ERRO]:', err.message));
      return res.status(200).json({ received: true });
    }

    agendarProcessamento(cliente, body);

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[WEBHOOK ERRO]:', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
