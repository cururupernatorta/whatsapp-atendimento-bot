const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGODB_URI;
let db = null;

async function connectDB() {
  if (db) return db;
  try {
    const client = new MongoClient(uri);
    await client.connect();
    db = client.db('botsaas');
    console.log('✅ MongoDB conectado');
    return db;
  } catch (err) {
    console.error('❌ MongoDB:', err.message);
    // Alerta usa direto as credenciais Z-API do dono (env), não depende do
    // Mongo estar de pé — é justamente o cenário que ele existe pra cobrir.
    const { alertarErroCritico } = require('../services/alertaService');
    await alertarErroCritico('Servidor não conseguiu conectar ao MongoDB', `Erro: ${err.message}\nO servidor não vai iniciar até isso ser resolvido.`);
    process.exit(1);
  }
}

function getDB() {
  if (!db) throw new Error('DB não conectado');
  return db;
}

module.exports = { connectDB, getDB };
