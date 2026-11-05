const { getDB } = require('../config/database');
const COL = 'usoMensal';
const FATURAS = 'faturasAdicionais';

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function mesAnterior() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function getUsoMes(clientId, mes = mesAtual()) {
  let doc = await getDB().collection(COL).findOne({ clientId, mes });
  if (!doc) {
    doc = {
      clientId, mes,
      mensagensEnviadas: 0,
      mensagensExcedentes: 0,
      inputTokens: 0,
      outputTokens: 0,
      custoIA: 0,
      criadoEm: new Date()
    };
    await getDB().collection(COL).insertOne(doc);
  }
  return doc;
}

async function registrarMensagem(clientId, limiteMensagens) {
  const mes = mesAtual();
  const uso = await getUsoMes(clientId, mes);
  const excedeu = uso.mensagensEnviadas >= limiteMensagens;

  const inc = { mensagensEnviadas: 1 };
  if (excedeu) inc.mensagensExcedentes = 1;

  await getDB().collection(COL).updateOne(
    { clientId, mes },
    { $inc: inc, $setOnInsert: { clientId, mes } },
    { upsert: true }
  );

  return { excedeu, totalNoMes: uso.mensagensEnviadas + 1 };
}

async function registrarTokens(clientId, inputTokens, outputTokens, custo) {
  const mes = mesAtual();
  await getDB().collection(COL).updateOne(
    { clientId, mes },
    { $inc: { inputTokens, outputTokens, custoIA: custo }, $setOnInsert: { clientId, mes } },
    { upsert: true }
  );
}

async function fecharMesEGerarFatura(clientId, precoPorMensagemExcedente, mes = mesAnterior()) {
  const uso = await getUsoMes(clientId, mes);
  const valorAdicional = Math.round(uso.mensagensExcedentes * precoPorMensagemExcedente * 100) / 100;

  await getDB().collection(FATURAS).updateOne(
    { clientId, mes },
    {
      $set: {
        clientId, mes,
        mensagensExcedentes: uso.mensagensExcedentes,
        precoPorMensagemExcedente,
        valorAdicional,
        cobrado: false,
        geradoEm: new Date()
      }
    },
    { upsert: true }
  );

  return { mensagensExcedentes: uso.mensagensExcedentes, valorAdicional };
}

async function listarFaturasPendentes(clientId) {
  return await getDB().collection(FATURAS).find({ clientId, cobrado: false }).toArray();
}

async function marcarFaturaCobrada(clientId, mes) {
  await getDB().collection(FATURAS).updateOne({ clientId, mes }, { $set: { cobrado: true, cobradoEm: new Date() } });
}

module.exports = {
  mesAtual, mesAnterior, getUsoMes, registrarMensagem, registrarTokens,
  fecharMesEGerarFatura, listarFaturasPendentes, marcarFaturaCobrada
};
