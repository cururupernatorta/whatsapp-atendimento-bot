const { getDB } = require('../config/database');
const COL = 'leads';

async function criarLead(clientId, phone, lojaKey, lojaNome, resumo, historico, nomeCliente = null) {
  return await getDB().collection(COL).insertOne({
    clientId, phone, lojaKey, lojaNome, resumo, historico, nomeCliente,
    status: 'novo',
    atendente: null,
    assumidoEm: null,
    resolvidoEm: null,
    criadoEm: new Date()
  });
}

async function assumirLead(clientId, phone, atendente) {
  await getDB().collection(COL).updateOne(
    { clientId, phone, status: 'novo' },
    { $set: { status: 'em_atendimento', atendente, assumidoEm: new Date() } }
  );
}

async function listarLeads(clientId, status) {
  const filtro = { clientId };
  if (status) filtro.status = status;
  return await getDB().collection(COL).find(filtro).sort({ criadoEm: -1 }).limit(100).toArray();
}

async function leadNaoRespondido(clientId, minutos = 30) {
  const limite = new Date(Date.now() - minutos * 60 * 1000);
  return await getDB().collection(COL).find({
    clientId,
    status: 'novo',
    criadoEm: { $lt: limite }
  }).toArray();
}

module.exports = { criarLead, assumirLead, listarLeads, leadNaoRespondido };
