const cron = require('node-cron');
const { getDB } = require('../config/database');
const { listClients } = require('../models/Client');
const { getPlano } = require('../config/planos');
const { enviarWhatsApp } = require('./wameService');
const { formatarRelatorioCliente, formatarRelatorioAdmin } = require('../utils/helpers');
const { getUsoMes, mesAnterior, fecharMesEGerarFatura } = require('../models/Uso');

function iniciarCronJobs() {
  const dia = parseInt(process.env.RELATORIO_DIA || '0');
  const hora = parseInt(process.env.RELATORIO_HORA || '9');

  // IMPORTANTE: sem "timezone", o node-cron dispara no fuso do servidor (em
  // serviços como o Render, isso normalmente é UTC) — um relatório configurado
  // para "domingo às 9h" saía às 9h UTC = 6h em Brasília, 3h adiantado.
  const TZ = 'America/Sao_Paulo';

  cron.schedule(`0 ${hora} * * ${dia}`, async () => {
    console.log('[CRON] Gerando relatórios semanais...');
    await enviarRelatoriosSemanaisClientes();
    await enviarRelatorioSemanalAdmin();
  }, { timezone: TZ });

  cron.schedule('*/30 * * * *', async () => {
    await verificarLeadsNaoRespondidos();
  }, { timezone: TZ });

  cron.schedule('10 0 1 * *', async () => {
    console.log('[CRON] Fechando faturamento adicional do mês anterior...');
    await fecharFaturamentoMensal();
  }, { timezone: TZ });

  console.log(`[CRON] Relatórios agendados: toda ${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][dia]} às ${hora}h | Faturamento: dia 1 às 00h10`);
}

async function enviarRelatoriosSemanaisClientes() {
  const db = getDB();
  const clientes = await listClients();
  const hoje = new Date();
  const seteDiasAtras = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000);

  for (const c of clientes) {
    try {
      const plano = getPlano(c.plano);
      if (!plano.relatorioSemanal) continue;

      const stats = await db.collection('stats').find({
        clientId: c.clientId,
        data: { $gte: seteDiasAtras.toISOString().split('T')[0] }
      }).toArray();

      if (stats.length === 0) continue;

      const msg = formatarRelatorioCliente(stats, c);
      const primeiraLoja = Object.values(c.lojas || {})[0];
      if (primeiraLoja?.whatsapp) {
        await enviarWhatsApp(c.wameKey, primeiraLoja.whatsapp, msg);
      }
    } catch (err) {
      console.error(`[CRON ERRO] ${c.clientId}:`, err.message);
    }
  }
}

async function enviarRelatorioSemanalAdmin() {
  const ownerKey = process.env.OWNER_WAME_KEY;
  const ownerNumero = process.env.OWNER_WHATSAPP_NUMBER;
  if (!ownerKey || !ownerNumero) {
    console.warn('[CRON] OWNER_WAME_KEY / OWNER_WHATSAPP_NUMBER não configurados — relatório admin não enviado.');
    return;
  }

  const db = getDB();
  const clientes = await listClients();
  const hoje = new Date();
  const seteDiasAtras = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000);

  const linhas = [];
  let custoTotalSemana = 0;

  for (const c of clientes) {
    const stats = await db.collection('stats').find({
      clientId: c.clientId,
      data: { $gte: seteDiasAtras.toISOString().split('T')[0] }
    }).toArray();

    const msgs = stats.reduce((a, s) => a + (s.mensagensEnviadas || 0), 0);
    const inTok = stats.reduce((a, s) => a + (s.inputTokens || 0), 0);
    const outTok = stats.reduce((a, s) => a + (s.outputTokens || 0), 0);
    const custo = stats.reduce((a, s) => a + (s.custoIA || 0), 0);
    custoTotalSemana += custo;

    const uso = await getUsoMes(c.clientId);
    const excedenteAviso = uso.mensagensExcedentes > 0
      ? `\n⚠️ Excedentes no mês: ${uso.mensagensExcedentes} (valor estimado: R$ ${(uso.mensagensExcedentes * (c.precoPorMensagemExcedente || 0)).toFixed(2)})`
      : '';

    linhas.push(
`🏢 *${c.nomeEmpresa}* (${c.plano})
💬 Mensagens na semana: ${msgs}
🔤 Tokens: ${inTok.toLocaleString('pt-BR')} entrada + ${outTok.toLocaleString('pt-BR')} saída
💰 Custo de IA na semana: R$ ${custo.toFixed(2)}${excedenteAviso}`
    );
  }

  if (linhas.length === 0) return;

  const msg = formatarRelatorioAdmin(linhas, custoTotalSemana);
  await enviarWhatsApp(ownerKey, ownerNumero, msg);
  console.log('[CRON] Relatório semanal admin enviado.');
}

async function fecharFaturamentoMensal() {
  const clientes = await listClients();
  const mes = mesAnterior();
  const resultados = [];

  for (const c of clientes) {
    const { mensagensExcedentes, valorAdicional } = await fecharMesEGerarFatura(c.clientId, c.precoPorMensagemExcedente || 0, mes);
    if (mensagensExcedentes > 0) {
      resultados.push(`🏢 ${c.nomeEmpresa}: ${mensagensExcedentes} msgs excedentes → R$ ${valorAdicional.toFixed(2)} a cobrar`);
    }
  }

  if (resultados.length > 0) {
    const ownerKey = process.env.OWNER_WAME_KEY;
    const ownerNumero = process.env.OWNER_WHATSAPP_NUMBER;
    if (ownerKey && ownerNumero) {
      const msg = `🧾 *Faturamento adicional — ${mes}*\n\n${resultados.join('\n')}\n\nInclua esses valores na cobrança do mês seguinte de cada cliente.`;
      await enviarWhatsApp(ownerKey, ownerNumero, msg);
    }
  }
}

async function verificarLeadsNaoRespondidos() {
  const { leadNaoRespondido } = require('../models/Lead');
  const clientes = await listClients();

  for (const c of clientes) {
    try {
      const leads = await leadNaoRespondido(c.clientId, 30);
      for (const lead of leads) {
        const loja = c.lojas[lead.lojaKey];
        if (loja?.whatsapp) {
          const identificacao = lead.nomeCliente ? `${lead.nomeCliente} — ${lead.phone}` : lead.phone;
          const msg = `⏰ *LEAD AGUARDANDO — ${c.nomeEmpresa}*\n\n👤 ${identificacao}\n📋 ${lead.resumo?.substring(0, 100) || 'Ver detalhes'}\n\n⚠️ Este lead foi enviado há mais de 30 minutos e ainda não foi atendido.`;
          await enviarWhatsApp(c.wameKey, loja.whatsapp, msg);
        }
      }
    } catch (err) {
      console.error(`[CRON LEAD] ${c.clientId}:`, err.message);
    }
  }
}

module.exports = { iniciarCronJobs };
