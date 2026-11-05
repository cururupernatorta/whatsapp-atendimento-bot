require('dotenv').config();
const readline = require('readline');
const { connectDB, getDB } = require('../src/config/database');
const { getClientById, createClient, updateClient } = require('../src/models/Client');
const { processarMensagem } = require('../src/services/botService');

const DEFAULT_CLIENT_ID = 'teste-local';
const TEST_CLIENT_ID = process.argv[2] || DEFAULT_CLIENT_ID;
const TEST_PHONE = '5500900000001';

// Edite estes dados à vontade — toda vez que rodar o script, o cliente de
// teste no banco é sincronizado com o que estiver aqui (não precisa apagar
// e recriar manualmente).
const CONFIG_CLIENTE_TESTE = {
  nomeEmpresa: 'Óticas Teste',
  nomeBot: 'Ana',
  descricao: 'Ótica com filiais na região. Vendemos óculos de grau, óculos de sol e lentes de contato, e fazemos exame de vista.',
  conhecimento: 'Aceita a maioria dos convênios. Prazo médio de entrega: 7 dias úteis.',
  roteiroAnamnese: [
    'Se já usa óculos de grau atualmente e se é multifocal (não perguntar sobre óculos de sol)',
    'Se já tem receita atualizada',
    'Motivo/urgência da visita (trocar grau, primeira vez, quebrou o atual, etc.)',
    'Preferência de produto, se mencionar (marca, tipo de lente, faixa de preço)',
    'Qual filial é mais conveniente'
  ],
  wameKey: '',
  lojas: {
    1: { nome: 'Óticas Teste — Centro', endereco: 'Rua Central, 100', horarioSegSex: '08:30-18:30', horarioSabado: '08:30-13:00', horarioDomingo: 'fechado', whatsapp: '5500900000101', link: 'https://wa.me/5500900000101' },
    2: { nome: 'Óticas Teste — Shopping', endereco: 'Av. Shopping, 500', horarioSegSex: '10:00-22:00', horarioSabado: '10:00-22:00', horarioDomingo: '14:00-20:00', whatsapp: '5500900000102', link: 'https://wa.me/5500900000102' }
  }
};

async function ensureTestClient() {
  const existente = await getClientById(TEST_CLIENT_ID);

  // Cliente diferente do padrão (ex: "empresa-exemplo") — usa o que já está
  // cadastrado no banco, sem sobrescrever com CONFIG_CLIENTE_TESTE.
  if (TEST_CLIENT_ID !== DEFAULT_CLIENT_ID) {
    if (!existente) {
      console.error(`❌ Cliente "${TEST_CLIENT_ID}" não encontrado no banco. Cadastre primeiro (ex: npm run seed-exemplo).`);
      process.exit(1);
    }
    return existente;
  }

  if (!existente) {
    console.log('Criando cliente de teste no banco (não usa WAME API de verdade)...\n');
    return createClient({ clientId: TEST_CLIENT_ID, ...CONFIG_CLIENTE_TESTE });
  }

  await updateClient(TEST_CLIENT_ID, CONFIG_CLIENTE_TESTE);
  return { ...existente, ...CONFIG_CLIENTE_TESTE };
}

async function resetConversa() {
  await getDB().collection('conversations').deleteOne({ key: `${TEST_CLIENT_ID}:${TEST_PHONE}` });
  console.log('(conversa reiniciada)\n');
}

async function confirmarEnvioReal(nomeEmpresa) {
  console.log(`\n🚨🚨🚨 ATENÇÃO — "${nomeEmpresa}" TEM UMA CHAVE WAME REAL CADASTRADA 🚨🚨🚨`);
  console.log(`Esse script simula uma mensagem CHEGANDO — sem chave, isso é só um`);
  console.log(`teste local. COM chave real, o bot vai responder de verdade pelo`);
  console.log(`WhatsApp conectado, mandando mensagem pro número ${TEST_PHONE}`);
  console.log(`(que pode ser uma pessoa real que nunca falou com vocês).\n`);

  const rlConfirm = readline.createInterface({ input: process.stdin, output: process.stdout });
  const resposta = await new Promise(r => rlConfirm.question('Digite exatamente "mandar mensagem real" pra continuar (qualquer outra coisa cancela): ', r));
  rlConfirm.close();

  if (resposta.trim() !== 'mandar mensagem real') {
    console.log('\nCancelado. Use o cliente de teste genérico (sem argumento) pra testar sem risco:');
    console.log('  npm run test-local\n');
    process.exit(0);
  }
  console.log('');
}

async function main() {
  await connectDB();
  const cliente = await ensureTestClient();

  if (cliente.wameKey) {
    await confirmarEnvioReal(cliente.nomeEmpresa);
  }

  console.log('═══ TESTE LOCAL DO BOT (sem WAME API) ═══');
  console.log(`Simulando um cliente conversando com "${cliente.nomeEmpresa}".`);
  console.log('Digite as mensagens como se fosse o cliente. As respostas do bot aparecem como [WAME MOCK].');
  console.log('Comandos: /reset (reinicia a conversa) | /sair\n');

  const sessaoExistente = await getDB().collection('conversations').findOne({ key: `${TEST_CLIENT_ID}:${TEST_PHONE}` });
  if (sessaoExistente && (sessaoExistente.historicoCompleto || []).length > 0) {
    console.log(`⚠️  Já existe uma conversa em andamento com esse cliente de teste (${sessaoExistente.historicoCompleto.length} mensagens, filial: ${sessaoExistente.lojaEscolhida?.nome || 'nenhuma ainda'}).`);
    console.log('   O bot vai continuar de onde parou. Digite /reset se quiser começar do zero.\n');
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'Você: ' });
  rl.prompt();

  let fila = Promise.resolve();
  let fechado = false;
  const prompt = () => { if (!fechado) rl.prompt(); };

  rl.on('line', (line) => {
    fila = fila.then(async () => {
      const texto = line.trim();

      if (texto === '/sair') { rl.close(); return; }
      if (texto === '/reset') { await resetConversa(); prompt(); return; }
      if (!texto) { prompt(); return; }

      const body = { phone: TEST_PHONE, fromMe: false, isGroup: false, text: { message: texto } };
      try {
        await processarMensagem(cliente, body);
      } catch (err) {
        console.error('Erro ao processar mensagem:', err.message);
      }
      prompt();
    });
  });

  rl.on('close', async () => {
    fechado = true;
    await fila;
    process.exit(0);
  });
}

main().catch(err => { console.error(err); process.exit(1); });
