const express = require('express');
const router = express.Router();
const path = require('path');
const { getDB } = require('../config/database');
const { listClients, createClient, deleteClient, updateClient } = require('../models/Client');
const { listarLeads } = require('../models/Lead');
const { getUsoMes, listarFaturasPendentes } = require('../models/Uso');
const { PLANOS } = require('../config/planos');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function auth(req, res, next) {
  // Senha só por header/body — nunca por query string, pra não vazar em logs
  // de acesso do servidor (o painel já manda tudo via Authorization: Bearer).
  const pass = req.headers.authorization?.replace('Bearer ', '') || req.body.password;
  if (pass && pass === ADMIN_PASSWORD) return next();
  return res.status(401).json({ error: 'Não autorizado' });
}

router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/admin.html'));
});

router.get('/planos', auth, (req, res) => res.json(PLANOS));

router.get('/clients', auth, async (req, res) => {
  try { res.json(await listClients()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/clients', auth, async (req, res) => {
  try { const c = await createClient(req.body); res.json({ success: true, client: c }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/clients/:clientId', auth, async (req, res) => {
  try { await updateClient(req.params.clientId, req.body); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/clients/:clientId', auth, async (req, res) => {
  try { await deleteClient(req.params.clientId); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/stats', auth, async (req, res) => {
  try {
    const stats = await getDB().collection('stats').find().sort({ data: -1 }).limit(30).toArray();
    res.json(stats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/leads/:clientId', auth, async (req, res) => {
  try {
    const leads = await listarLeads(req.params.clientId, req.query.status);
    res.json(leads);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/uso/:clientId', auth, async (req, res) => {
  try {
    const uso = await getUsoMes(req.params.clientId);
    res.json(uso);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/faturas/:clientId', auth, async (req, res) => {
  try {
    const faturas = await listarFaturasPendentes(req.params.clientId);
    res.json(faturas);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
