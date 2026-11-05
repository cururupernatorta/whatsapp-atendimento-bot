const { getDB } = require('../config/database');
const { enviarWhatsApp, enviarBotao } = require('./wameService');
const { chamarClaude, gerarResumoLead } = require('./claudeService');
const { gerarSystemPrompt } = require('../utils/systemPrompt');
const { criarLead, assumirLead } = require('../models/Lead');
const { registrarMensagem, registrarTokens } = require('../models/Uso');
const { calcularCusto } = require('../utils/custoTokens');
const { alertarErroCritico } = require('./alertaService');
const {
  formatarTelefone, horarioBrasil, filialEstaAberta,
  horarioFilial, filiaisAbertas, filialAleatoria,
  filtrarMensagemSimples, tratarTipoMensagem, trialExpirado,
  mensagemLinkFilial
} = require('../utils/helpers');

const CONV = 'conversations';
const STATS = 'stats';
const SESSION_TTL = 24 * 60 * 60 * 1000;
const MAX_HISTORY = 8;
const MAX_HISTORICO_COMPLETO = 40;

async function getSession(clientId, phone) {
  const db = getDB();
  const key = `${clientId}:${phone}`;
  let s = await db.collection(CONV).findOne({ key });

  if (!s) {
    s = { key, clientId, phone, history: [], historicoCompleto: [], humanMode: false, leadNotificado: false, lojaEscolhida: null, nomeCliente: null, primeiraVez: true, createdAt: new Date(), updatedAt: new Date() };
    await db.collection(CONV).insertOne(s);
  }

  const agora = new Date();
  if (s.updatedAt && (agora - new Date(s.updatedAt)) > SESSION_TTL) {
    s.history = []; s.historicoCompleto = []; s.humanMode = false; s.leadNotificado = false; s.lojaEscolhida = null; s.nomeCliente = null; s.primeiraVez = false;
    await db.collection(CONV).updateOne({ key }, { $set: { history: [], historicoCompleto: [], humanMode: false, leadNotificado: false, lojaEscolhida: null, nomeCliente: null, primeiraVez: false, updatedAt: agora } });
  }
  return s;
}

async function updateSession(key, updates) {
  await getDB().collection(CONV).updateOne({ key }, { $set: { ...updates, updatedAt: new Date() } });
}

async function incrementStatsCampo(clientId, campo, valor = 1) {
  const hoje = new Date().toISOString().split('T')[0];
  await getDB().collection(STATS).updateOne(
    { clientId, data: hoje },
    { $inc: { [campo]: valor }, $setOnInsert: { clientId, data: hoje } },
    { upsert: true }
  );
}

async function registrarAtendimento(cliente, usage = null) {
  const { clientId, limiteMensagens } = cliente;

  await incrementStatsCampo(clientId, 'mensagensEnviadas');
  const { excedeu, totalNoMes } = await registrarMensagem(clientId, limiteMensagens || 8000);
  if (excedeu) {
    await incrementStatsCampo(clientId, 'mensagensExcedentes');
    console.log(`[LIMITE] ${clientId} passou do limite (${limiteMensagens}) — total no mês: ${totalNoMes}`);
  }

  if (usage) {
    const custo = calcularCusto(usage.input_tokens, usage.output_tokens);
    await incrementStatsCampo(clientId, 'inputTokens', usage.input_tokens || 0);
    await incrementStatsCampo(clientId, 'outputTokens', usage.output_tokens || 0);
    await incrementStatsCampo(clientId, 'custoIA', custo);
    await registrarTokens(clientId, usage.input_tokens || 0, usage.output_tokens || 0, custo);
  }

  return { excedeu };
}

async function processarMensagem(cliente, body) {
  const { clientId, wameKey, nomeEmpresa, nomeBot, lojas, faq } = cliente;

  if (body.fromMe) return;
  if (body.isGroup) return;

  const phone = body.phone;
  const key = `${clientId}:${phone}`;

  if (trialExpirado(cliente)) {
    await enviarWhatsApp(wameKey, phone,
      'Olá! Seu período de teste encerrou. Entre em contato com nossa equipe para ativar seu plano. 😊');
    return;
  }

  let tipo = 'texto';
  let message = body.text?.message || '';
  if (body.audio) { tipo = 'audio'; message = '[ÁUDIO]'; }
  else if (body.image) { tipo = 'imagem'; message = '[IMAGEM]'; }
  else if (body.sticker) { tipo = 'figurinha'; message = '[FIGURINHA]'; }
  else if (!message.trim()) { tipo = 'vazio'; message = ''; }

  console.log(`[${clientId}] ${phone} → ${tipo}: "${message.substring(0, 80)}"`);

  const session = await getSession(clientId, phone);

  if (session.humanMode) {
    console.log(`[HUMAN MODE] ${key} — silenciado`);
    await updateSession(key, { updatedAt: new Date() });
    return;
  }

  const primeiroContato = session.primeiraVez;
  if (primeiroContato) {
    // Mensagem só de saudação (sem pedido junto): responde com um "oi" curto e para por aqui.
    // Se já vier com conteúdo, não manda essa segunda mensagem — deixa a Ana se
    // apresentar e já responder tudo junto (ver blocoPrimeiroContato no prompt),
    // em vez de mandar duas mensagens seguidas pro cliente.
    if (message.toLowerCase().trim().match(/^(oi|ola|olá|bom dia|boa tarde|boa noite)$/)) {
      await enviarWhatsApp(wameKey, phone,
        `Oi! Sou a ${nomeBot}, da ${nomeEmpresa} 😊 Como posso te ajudar?`);
      await updateSession(key, { primeiraVez: false });
      await registrarAtendimento(cliente);
      return;
    }
    await updateSession(key, { primeiraVez: false });
  }
  // Prefixo de apresentação pra quando o 1º contato cai numa resposta fixa
  // (áudio, FAQ, mensagem "simples") em vez de ir pra IA — sem isso, o
  // cliente nunca fica sabendo com quem está falando.
  const introPrimeiroContato = primeiroContato ? `Oi! Sou a ${nomeBot}, da ${nomeEmpresa} 😊 ` : '';

  const tipoResult = tratarTipoMensagem(tipo);
  if (tipoResult) {
    if (tipoResult.fixedReply) {
      await enviarWhatsApp(wameKey, phone, introPrimeiroContato + tipoResult.fixedReply);
      await registrarAtendimento(cliente);
    }
    return;
  }

  if (faq && faq.length > 0 && message.trim()) {
    const perguntaNorm = message.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const match = faq.find(f => {
      const p = f.pergunta.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      return perguntaNorm.includes(p) || p.includes(perguntaNorm);
    });
    if (match) {
      await enviarWhatsApp(wameKey, phone, introPrimeiroContato + match.resposta);
      await registrarAtendimento(cliente);
      return;
    }
  }

  const simples = filtrarMensagemSimples(message, nomeBot, nomeEmpresa);
  if (simples.isSimple) {
    await enviarWhatsApp(wameKey, phone, introPrimeiroContato + simples.fixedReply);
    await registrarAtendimento(cliente);
    return;
  }

  let history = session.history || [];
  let historicoCompleto = session.historicoCompleto || [];
  history.push({ role: 'user', content: message });
  historicoCompleto.push({ role: 'user', content: message });
  if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
  if (historicoCompleto.length > MAX_HISTORICO_COMPLETO) historicoCompleto = historicoCompleto.slice(-MAX_HISTORICO_COMPLETO);

  const systemPrompt = gerarSystemPrompt(cliente, { lojaEscolhida: session.lojaEscolhida || null, primeiroContato });
  let rawReply, usage;
  try {
    const resposta = await chamarClaude(systemPrompt, history);
    rawReply = resposta.texto;
    usage = resposta.usage;
  } catch (err) {
    console.error(`[CLAUDE ERRO] ${key}:`, err.message);
    await enviarWhatsApp(wameKey, phone,
      'Oi! Estamos com uma instabilidade técnica no momento. Por favor, aguarde um momento ou ligue diretamente para uma de nossas filiais. 😊');
    await alertarErroCritico('Falha na Claude API', `Cliente: ${clientId}\nTelefone: ${phone}\nErro: ${err.message}`);
    return;
  }

  const filialMatch = rawReply.match(/\[FILIAL:(\d+)\]/);
  const filialNum = filialMatch ? filialMatch[1] : null;
  const lojaEscolhida = filialNum ? lojas[filialNum] : (session.lojaEscolhida || null);
  const leadPronto = /\[LEAD_PRONTO\]/.test(rawReply);
  const pedirHumano = /\[HUMANO\]/.test(rawReply);
  const nomeMatch = rawReply.match(/\[NOME:([^\]]+)\]/);
  const nomeCliente = nomeMatch ? nomeMatch[1].trim() : (session.nomeCliente || null);

  let reply = rawReply
    .replace(/\[FILIAL:\d+\]/g, '')
    .replace(/\[LEAD_PRONTO\]/g, '')
    .replace(/\[HUMANO\]/g, '')
    .replace(/\[NOME:[^\]]+\]/g, '')
    .trim();

  if (filialNum && lojas[filialNum]) {
    await updateSession(key, { lojaEscolhida: lojas[filialNum] });
  }
  if (nomeMatch && nomeCliente !== session.nomeCliente) {
    await updateSession(key, { nomeCliente });
  }

  // Aviso de horário é decidido pelo código com o horário real da filial, não
  // pela IA (o prompt não tem como saber se está aberta AGORA) — dispara toda
  // vez que uma filial é confirmada/escolhida e ela está fechada nesse momento.
  if (filialNum && lojaEscolhida && !filialEstaAberta(lojaEscolhida)) {
    reply += `\n\n💡 Nossa filial ${lojaEscolhida.nome} está fechada no momento. O horário é ${horarioFilial(lojaEscolhida)}. Assim que abrirmos, um vendedor entrará em contato!`;
  }

  history.push({ role: 'assistant', content: reply });
  historicoCompleto.push({ role: 'assistant', content: reply });
  if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
  if (historicoCompleto.length > MAX_HISTORICO_COMPLETO) historicoCompleto = historicoCompleto.slice(-MAX_HISTORICO_COMPLETO);

  await enviarWhatsApp(wameKey, phone, reply);
  await registrarAtendimento(cliente, usage);
  await updateSession(key, { history, historicoCompleto });

  if (pedirHumano) {
    await handleModoHumano(cliente, session, phone, lojaEscolhida, historicoCompleto, nomeCliente);
  }

  if (leadPronto && !session.leadNotificado && lojaEscolhida) {
    await notificarFilial(cliente, session, phone, lojaEscolhida, historicoCompleto, nomeCliente);
    if (lojaEscolhida.whatsapp && lojaEscolhida.link) {
      await enviarWhatsApp(wameKey, phone, mensagemLinkFilial(lojaEscolhida));
    }
    await updateSession(key, { leadNotificado: true });
  }

  console.log(`[${clientId}] ${phone} ← resposta enviada`);
}

async function handleModoHumano(cliente, session, phone, lojaEscolhida, history, nomeCliente) {
  const { clientId, wameKey, nomeEmpresa, lojas } = cliente;
  const key = `${clientId}:${phone}`;
  console.log(`[HUMANO] ${key}`);

  const phoneFormatado = formatarTelefone(phone);
  const identificacao = nomeCliente ? `${nomeCliente} — ${phoneFormatado}` : phoneFormatado;
  const historicoTexto = history.map(h => `${h.role === 'user' ? '👤 Cliente' : '🤖 Bot'}: ${h.content}`).join('\n');

  let filiaisNotificar = [];
  if (lojaEscolhida) {
    filiaisNotificar = [lojaEscolhida];
  } else {
    const abertas = filiaisAbertas(lojas);
    if (abertas.length > 0) filiaisNotificar = abertas;
    else {
      const aleatoria = filialAleatoria(lojas);
      if (aleatoria) filiaisNotificar = [aleatoria];
    }
  }

  for (const filial of filiaisNotificar) {
    if (!filial.whatsapp) continue;
    const msg =
`🙋 *ATENDIMENTO HUMANO — ${nomeEmpresa}*

👤 *Cliente:* ${identificacao}
🏪 *Filial:* ${lojaEscolhida ? lojaEscolhida.nome : 'Não informada'}
⏰ *Horário:* ${horarioBrasil()}

💬 *Últimas mensagens:*
${historicoTexto.length > 800 ? '…\n' + historicoTexto.slice(-800) : historicoTexto}

👉 Entre em contato pelo WhatsApp assim que possível.`;

    await enviarWhatsApp(wameKey, filial.whatsapp, msg);
    console.log(`[HUMANO] Aviso → ${filial.nome}`);
  }

  let msgCliente = 'Vou te transferir para um de nossos atendentes. ';
  if (lojaEscolhida) {
    if (filialEstaAberta(lojaEscolhida)) {
      msgCliente += `Um vendedor da filial ${lojaEscolhida.nome} vai entrar em contato em breve! 😊`;
    } else {
      msgCliente += `Nossa filial ${lojaEscolhida.nome} está fechada (${horarioFilial(lojaEscolhida)}). Assim que abrirmos, um vendedor entrará em contato! 😊`;
    }
  } else if (filiaisNotificar.length > 0 && filialEstaAberta(filiaisNotificar[0])) {
    msgCliente += 'Um de nossos vendedores vai entrar em contato em breve! 😊';
  } else {
    msgCliente += 'Nossas filiais estão fechadas no momento. Assim que abrirem, um vendedor entrará em contato! 😊';
  }
  await enviarWhatsApp(wameKey, phone, msgCliente);

  await incrementStatsCampo(clientId, 'pedidosHumano');
  console.log(`[HUMANO] ${key} — bot continua operando`);
}

async function notificarFilial(cliente, session, phone, lojaEscolhida, history, nomeCliente) {
  const { clientId, wameKey, nomeEmpresa, roteiroAnamnese } = cliente;
  const key = `${clientId}:${phone}`;

  if (!lojaEscolhida || !lojaEscolhida.whatsapp) {
    console.warn(`[LEAD] ${key} — sem filial/WhatsApp`);
    return;
  }

  const historicoTexto = history.map(h => `${h.role === 'user' ? '👤 Cliente' : '🤖 Bot'}: ${h.content}`).join('\n');
  // O resumo (abaixo) é o que importa pro vendedor; o histórico é só apoio —
  // limitado pra não estourar o tamanho de mensagem do WhatsApp em conversas longas.
  const historicoResumido = historicoTexto.length > 1500 ? '…\n' + historicoTexto.slice(-1500) : historicoTexto;

  try {
    const { texto: resumo, usage } = await gerarResumoLead(historicoTexto, roteiroAnamnese);
    if (usage) {
      const custo = calcularCusto(usage.input_tokens, usage.output_tokens);
      await incrementStatsCampo(clientId, 'inputTokens', usage.input_tokens || 0);
      await incrementStatsCampo(clientId, 'outputTokens', usage.output_tokens || 0);
      await incrementStatsCampo(clientId, 'custoIA', custo);
      await registrarTokens(clientId, usage.input_tokens || 0, usage.output_tokens || 0, custo);
    }

    const phoneFormatado = formatarTelefone(phone);
    const identificacao = nomeCliente ? `${nomeCliente} — ${phoneFormatado}` : phoneFormatado;
    const status = filialEstaAberta(lojaEscolhida) ? '🟢 ABERTA' : '🔴 FECHADA';

    const msg =
`🆕 *NOVO LEAD — ${nomeEmpresa}*

👤 *Cliente:* ${identificacao}
🏪 *Filial:* ${lojaEscolhida.nome}
📍 *Endereço:* ${lojaEscolhida.endereco}
⏰ *Horário:* ${horarioBrasil()}
${status} | ${horarioFilial(lojaEscolhida)}

📋 *Resumo:*
${resumo}

━━━━━━━━━━━━━━
💬 *Histórico:*
${historicoResumido}`;

    await criarLead(clientId, phone, Object.keys(cliente.lojas).find(k => cliente.lojas[k].whatsapp === lojaEscolhida.whatsapp) || '', lojaEscolhida.nome, resumo, historicoTexto, nomeCliente);

    await enviarBotao(wameKey, lojaEscolhida.whatsapp, msg, [
      { id: `assumir_${clientId}_${phone}`, label: '✅ Assumir Atendimento' }
    ]);

    await incrementStatsCampo(clientId, 'leadsGerados');
    console.log(`[LEAD] ${key} → ${lojaEscolhida.nome}`);
  } catch (err) {
    console.error(`[LEAD ERRO] ${key}:`, err.message);
  }
}

async function processarBotao(cliente, body) {
  const { clientId, wameKey, nomeEmpresa } = cliente;
  const buttonId = body.buttonId || '';
  const vendedorPhone = body.phone;

  if (!buttonId.startsWith('assumir_')) return;

  const parts = buttonId.split('_');
  if (parts.length < 3) return;
  const leadClientId = parts[1];
  const leadPhone = parts[2];

  if (leadClientId !== clientId) return;

  await assumirLead(clientId, leadPhone, vendedorPhone);

  const msg = `✅ *Lead assumido*\n\n👤 ${formatarTelefone(leadPhone)}\n🏪 ${nomeEmpresa}\n\nVendedor: ${formatarTelefone(vendedorPhone)}`;
  await enviarWhatsApp(wameKey, vendedorPhone, msg);

  console.log(`[BOTÃO] Lead ${leadPhone} assumido por ${vendedorPhone}`);
}

module.exports = { processarMensagem, processarBotao };
