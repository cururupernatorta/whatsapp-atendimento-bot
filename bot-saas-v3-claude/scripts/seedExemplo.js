require('dotenv').config();
const crypto = require('crypto');
const { connectDB } = require('../src/config/database');
const { getClientById, createClient, updateClient } = require('../src/models/Client');

const CLIENT_ID = 'empresa-exemplo';

// Exemplo de cadastro de um cliente. Todos os dados abaixo são FICTÍCIOS —
// copie este arquivo, troque pelos dados reais do seu cliente e rode
// `node scripts/<seu-arquivo>.js`. O cadastro no banco é sincronizado com o que
// estiver aqui a cada execução. Dados reais de clientes não devem ir pro git
// (copias locais tipo seed.local.js já estão no .gitignore).
const CONFIG = {
  nomeEmpresa: 'Ótica Exemplo',
  nomeBot: 'Ana',
  descricao: 'Rede de óticas com várias filiais. Vendemos óculos de grau, óculos de sol e lentes de contato, e fazemos exame de vista.',
  conhecimento: `HORÁRIOS DAS FILIAIS
- Centro e Bairro: Seg-Sex 8h30-18h30 | Sáb 8h30-13h | Dom fechado
- Shopping: Seg-Sáb 10h-22h | Dom 14h-20h

PRAZO DE ENTREGA (contado a partir do fechamento do pedido na loja)
- Lente multifocal: 12 dias úteis
- Lente de visão simples/monofocal: 8 dias úteis
- Lente de contato com astigmatismo: 5 dias úteis

FORMAS DE PAGAMENTO
- Pix, cartão de crédito e cartão de débito

Se o cliente perguntar algo que não está nessa lista, não invente — diga que o vendedor da filial confirma certinho.`,
  limites: '',
  roteiroAnamnese: [
    'Se já usa óculos de grau atualmente e se é multifocal (não perguntar sobre óculos de sol)',
    'Se já tem receita atualizada',
    'Motivo/urgência da visita (trocar grau, primeira vez, quebrou o atual, etc.)',
    'Preferência de produto, se mencionar (marca, tipo de lente, faixa de preço)',
    'Qual filial é mais conveniente'
  ],
  wameKey: '', // chave da WAME API desse número (nunca commitar a chave real)
  lojas: {
    1: {
      nome: 'Ótica Exemplo — Centro',
      endereco: 'Rua Exemplo, 100 - Centro',
      horarioSegSex: '08:30-18:30', horarioSabado: '08:30-13:00', horarioDomingo: 'fechado',
      whatsapp: '5500900000101', link: 'https://wa.me/5500900000101'
    },
    2: {
      nome: 'Ótica Exemplo — Shopping',
      endereco: 'Av. Exemplo, 500 - Shopping (Loja 12)',
      horarioSegSex: '10:00-22:00', horarioSabado: '10:00-22:00', horarioDomingo: '14:00-20:00',
      whatsapp: '5500900000102', link: 'https://wa.me/5500900000102'
    },
    3: {
      nome: 'Ótica Exemplo — Bairro',
      endereco: 'Rua Modelo, 250 - Jardim Exemplo',
      horarioSegSex: '08:30-18:30', horarioSabado: '08:30-13:00', horarioDomingo: 'fechado',
      whatsapp: '5500900000103', link: 'https://wa.me/5500900000103'
    }
  }
};

async function main() {
  await connectDB();
  const existente = await getClientById(CLIENT_ID);

  let cliente;
  if (!existente) {
    cliente = await createClient({ clientId: CLIENT_ID, ...CONFIG });
    console.log(`✅ Cliente "${CONFIG.nomeEmpresa}" criado com ${Object.keys(CONFIG.lojas).length} filiais.`);
  } else {
    // Clientes antigos podem não ter webhookSecret — gera um se faltar.
    const extras = existente.webhookSecret ? {} : { webhookSecret: crypto.randomBytes(16).toString('hex') };
    // Não apaga uma wameKey já cadastrada só porque este arquivo (versionado) a deixa vazia.
    const dados = { ...CONFIG };
    if (!dados.wameKey && existente.wameKey) delete dados.wameKey;
    await updateClient(CLIENT_ID, { ...dados, ...extras });
    cliente = { ...existente, ...dados, ...extras };
    console.log(`✅ Cliente "${CONFIG.nomeEmpresa}" atualizado com ${Object.keys(CONFIG.lojas).length} filiais.`);
  }

  console.log('🔗 Webhook (URL completa, com segredo — configure exatamente assim na WAME API):');
  console.log(`   https://SEU_SERVIDOR/webhook/${CLIENT_ID}/${cliente.webhookSecret}`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
