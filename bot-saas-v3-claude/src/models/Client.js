const crypto = require('crypto');
const { getDB } = require('../config/database');
const { getPlano } = require('../config/planos');
const COL = 'clients';

async function getClientById(clientId) {
  return await getDB().collection(COL).findOne({ clientId, ativo: true });
}

async function createClient(data) {
  const plano = getPlano(data.plano || 'pro');

  const doc = {
    clientId: data.clientId,
    nomeEmpresa: data.nomeEmpresa,
    nomeBot: data.nomeBot || 'Ana',
    nicho: data.nicho || 'geral',
    descricao: data.descricao || '',
    conhecimento: data.conhecimento || '',
    limites: data.limites || '',
    roteiroAnamnese: data.roteiroAnamnese || [
      'O que o cliente procura',
      'Detalhes relevantes do pedido',
      'Preferência/urgência',
      'Qual filial é mais conveniente'
    ],
    faq: data.faq || [],
    // Chave da WAME API pra esse número (uma só, ao contrário do Z-API que
    // usava instância + token separados).
    wameKey: data.wameKey,
    // Segredo próprio da URL do webhook desse cliente — sem ele, qualquer um
    // que descubra "/webhook/clientId" conseguiria mandar mensagens falsas
    // pro bot (gerando custo de IA e leads falsos pras filiais). Configurado
    // como parte da URL do webhook na WAME API, não fica visível pro cliente final.
    webhookSecret: data.webhookSecret || crypto.randomBytes(16).toString('hex'),
    lojas: data.lojas || {},
    horarioComercial: data.horarioComercial || {
      segSex: { inicio: '08:30', fim: '18:30' },
      sabado: { inicio: '08:30', fim: '13:00' },
      domingo: null
    },
    mensagemForaHorario: data.mensagemForaHorario ||
      'Oi! No momento estamos fora do horário. Assim que reabrirmos, respondemos você! 😊',

    plano: data.plano || 'pro',
    limiteMensagens: data.limiteMensagens ?? plano.limiteMensagens,
    precoMensal: data.precoMensal ?? null,
    precoPorMensagemExcedente: data.precoPorMensagemExcedente ?? plano.precoPorMensagemExcedente,

    trialAte: data.trialAte || null,
    ativo: true,
    criadoEm: new Date()
  };
  await getDB().collection(COL).insertOne(doc);
  return doc;
}

async function listClients() {
  return await getDB().collection(COL).find({ ativo: true }).toArray();
}

async function updateClient(clientId, updates) {
  await getDB().collection(COL).updateOne(
    { clientId },
    { $set: { ...updates, atualizadoEm: new Date() } }
  );
}

async function deleteClient(clientId) {
  await getDB().collection(COL).updateOne(
    { clientId },
    { $set: { ativo: false, atualizadoEm: new Date() } }
  );
}

module.exports = { getClientById, createClient, listClients, updateClient, deleteClient };
