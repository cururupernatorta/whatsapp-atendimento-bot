require('dotenv').config();
const readline = require('readline');
const { connectDB } = require('../src/config/database');
const { createClient } = require('../src/models/Client');
const { getPlano } = require('../src/config/planos');
const { HORARIO_PADRAO } = require('../src/utils/helpers');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(r => rl.question(q, r));

async function main() {
  await connectDB();
  console.log('═══ CADASTRO DE CLIENTE ═══\n');
  console.log('💡 Dica: preencha a "Ficha de Cadastro de Cliente" (Word) com o cliente e use os dados dela aqui.\n');

  const clientId = await ask('ID (ex: minha-empresa): ');
  const nomeEmpresa = await ask('Nome da empresa: ');
  const nomeBot = await ask('Nome do bot [Ana]: ') || 'Ana';
  const wameKey = await ask('Chave da WAME API: ');
  const planoId = (await ask('Plano [start/pro/enterprise] (padrão: pro): ')) || 'pro';
  const plano = getPlano(planoId);

  const limiteInput = await ask(`Limite mensagens/mês [${plano.limiteMensagens}]: `);
  const limiteMensagens = limiteInput ? parseInt(limiteInput) : plano.limiteMensagens;

  const precoExcedenteInput = await ask(`Preço por mensagem excedente (R$) [${plano.precoPorMensagemExcedente}]: `);
  const precoPorMensagemExcedente = precoExcedenteInput ? parseFloat(precoExcedenteInput) : plano.precoPorMensagemExcedente;

  const descricao = await ask('Descrição: ');
  const conhecimento = await ask('Conhecimento (ou Enter): ');
  const limites = await ask('Limites (ou Enter): ');

  console.log('\nRoteiro de anamnese — o que o bot deve perguntar/coletar antes de considerar o lead pronto.');
  console.log('Digite um item por linha. Enter em branco = usar roteiro padrão.');
  const roteiroAnamnese = [];
  let r = 1;
  while (true) {
    const item = await ask(`  Item ${r} (Enter=parar): `);
    if (!item.trim()) break;
    roteiroAnamnese.push(item.trim());
    r++;
  }

  const lojas = {};
  let i = 1;
  while (true) {
    const nome = await ask(`
Filial ${i} — Nome (Enter=parar): `);
    if (!nome.trim()) break;
    const endereco = await ask('  Endereço: ');
    const horarioSegSex = (await ask(`  Horário Seg-Sex (ex: 08:30-18:30) [${HORARIO_PADRAO.segSex}]: `)) || HORARIO_PADRAO.segSex;
    const horarioSabado = (await ask(`  Horário Sábado (ou "fechado") [${HORARIO_PADRAO.sabado}]: `)) || HORARIO_PADRAO.sabado;
    const horarioDomingo = (await ask(`  Horário Domingo (ou "fechado") [${HORARIO_PADRAO.domingo}]: `)) || HORARIO_PADRAO.domingo;
    const whatsapp = await ask('  WhatsApp (com DDI): ');
    lojas[i] = { nome: `${nomeEmpresa} — ${nome}`, endereco, horarioSegSex, horarioSabado, horarioDomingo, whatsapp, link: whatsapp ? `https://wa.me/${whatsapp}` : '' };
    i++;
  }

  const criado = await createClient({
    clientId, nomeEmpresa, nomeBot, wameKey,
    plano: planoId, limiteMensagens, precoPorMensagemExcedente,
    descricao, conhecimento, limites,
    roteiroAnamnese: roteiroAnamnese.length > 0 ? roteiroAnamnese : undefined,
    lojas
  });

  console.log(`
✅ "${nomeEmpresa}" criado!`);
  console.log(`🔗 Webhook (URL completa, com segredo — configure exatamente assim na WAME API):`);
  console.log(`   https://SEU_SERVIDOR/webhook/${clientId}/${criado.webhookSecret}`);
  console.log(`📊 Plano: ${planoId} | Limite: ${limiteMensagens} msgs/mês | Excedente: R$ ${precoPorMensagemExcedente}/msg`);
  rl.close(); process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
