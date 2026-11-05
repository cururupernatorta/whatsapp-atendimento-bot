jest.mock('../src/config/database');
jest.mock('../src/services/wameService');
jest.mock('../src/services/claudeService');
jest.mock('../src/models/Lead');
jest.mock('../src/models/Uso');

const database = require('../src/config/database');
const wameService = require('../src/services/wameService');
const claudeService = require('../src/services/claudeService');
const LeadModel = require('../src/models/Lead');
const UsoModel = require('../src/models/Uso');
const { processarMensagem, processarBotao } = require('../src/services/botService');

// ---- Fake Mongo em memória, só o suficiente para os padrões usados no botService ----
function matches(doc, filter) {
  return Object.keys(filter).every(k => doc[k] === filter[k]);
}

function criarFakeDb() {
  const store = {};
  return {
    collection(name) {
      if (!store[name]) store[name] = [];
      return {
        findOne: async (filter) => store[name].find(d => matches(d, filter)) || null,
        insertOne: async (doc) => { store[name].push({ ...doc }); return { insertedId: 'id' }; },
        updateOne: async (filter, update, options = {}) => {
          let doc = store[name].find(d => matches(d, filter));
          if (!doc) {
            if (!options.upsert) return { matchedCount: 0 };
            doc = { ...filter };
            store[name].push(doc);
          }
          if (update.$setOnInsert) {
            for (const [k, v] of Object.entries(update.$setOnInsert)) {
              if (doc[k] === undefined) doc[k] = v;
            }
          }
          if (update.$inc) {
            for (const [k, v] of Object.entries(update.$inc)) {
              doc[k] = (doc[k] || 0) + v;
            }
          }
          if (update.$set) Object.assign(doc, update.$set);
          return { matchedCount: 1 };
        }
      };
    },
    _dump: () => store
  };
}

const CLIENTE_BASE = {
  clientId: 'oticas-teste',
  nomeEmpresa: 'Óticas Teste',
  nomeBot: 'Ana',
  wameKey: 'chave-teste',
  limiteMensagens: 3000,
  faq: [
    { pergunta: 'horario de funcionamento', resposta: 'Funcionamos Seg-Sex 8h30-18h30.' }
  ],
  lojas: {
    1: { nome: 'Óticas Teste — Centro', endereco: 'Rua Central, 100', whatsapp: '5500900000101', link: 'https://wa.me/5500900000101', horarioSegSex: '00:00-23:59', horarioSabado: '00:00-23:59', horarioDomingo: '00:00-23:59' }
  }
};

let fakeDb;

beforeEach(() => {
  jest.clearAllMocks();
  fakeDb = criarFakeDb();
  database.getDB.mockReturnValue(fakeDb);
  UsoModel.registrarMensagem.mockResolvedValue({ excedeu: false, totalNoMes: 1 });
  UsoModel.registrarTokens.mockResolvedValue();
  LeadModel.criarLead.mockResolvedValue();
  LeadModel.assumirLead.mockResolvedValue();
});

function bodyTexto(msg, phone = '5500900000001') {
  return { phone, fromMe: false, isGroup: false, text: { message: msg } };
}

describe('processarMensagem — primeiro contato', () => {
  test('primeira mensagem "oi" recebe boas-vindas e não aciona a Claude', async () => {
    await processarMensagem(CLIENTE_BASE, bodyTexto('oi'));

    expect(wameService.enviarWhatsApp).toHaveBeenCalledTimes(1);
    const [, , msg] = wameService.enviarWhatsApp.mock.calls[0];
    expect(msg).toContain('Ana');
    expect(msg).toContain('Óticas Teste');
    expect(claudeService.chamarClaude).not.toHaveBeenCalled();
    expect(UsoModel.registrarMensagem).toHaveBeenCalledTimes(1);
  });

  test('primeira mensagem com uma pergunta real vai direto pra Claude, sem boas-vindas em separado', async () => {
    claudeService.chamarClaude.mockResolvedValue({ texto: 'Claro, me conta mais!', usage: { input_tokens: 10, output_tokens: 5 } });

    await processarMensagem(CLIENTE_BASE, bodyTexto('Quero comprar óculos de sol'));

    // A apresentação entra na própria resposta da Claude (ver blocoPrimeiroContato
    // em systemPrompt.js) — não manda uma mensagem de boas-vindas separada antes,
    // pra não mandar duas mensagens seguidas pro cliente logo no primeiro contato.
    expect(wameService.enviarWhatsApp).toHaveBeenCalledTimes(1);
    expect(claudeService.chamarClaude).toHaveBeenCalledTimes(1);
  });
});

describe('processarMensagem — FAQ', () => {
  test('pergunta que bate com o FAQ responde na hora, sem custo de IA', async () => {
    const phone = '5500900000001';
    // simula sessão já existente (não é a primeira mensagem)
    await fakeDb.collection('conversations').insertOne({
      key: `oticas-teste:${phone}`, clientId: CLIENTE_BASE.clientId, phone,
      history: [], historicoCompleto: [], humanMode: false, leadNotificado: false,
      lojaEscolhida: null, primeiraVez: false, updatedAt: new Date()
    });

    await processarMensagem(CLIENTE_BASE, bodyTexto('Qual o horário de funcionamento?', phone));

    expect(wameService.enviarWhatsApp).toHaveBeenCalledWith('chave-teste', phone, CLIENTE_BASE.faq[0].resposta);
    expect(claudeService.chamarClaude).not.toHaveBeenCalled();
  });
});

describe('processarMensagem — tipos de mensagem não suportados', () => {
  test('áudio recebe resposta fixa pedindo texto', async () => {
    const phone = '5500900000001';
    await fakeDb.collection('conversations').insertOne({
      key: `oticas-teste:${phone}`, clientId: CLIENTE_BASE.clientId, phone,
      history: [], historicoCompleto: [], humanMode: false, leadNotificado: false,
      lojaEscolhida: null, primeiraVez: false, updatedAt: new Date()
    });

    await processarMensagem(CLIENTE_BASE, { phone, fromMe: false, isGroup: false, audio: {} });

    expect(wameService.enviarWhatsApp).toHaveBeenCalledTimes(1);
    expect(wameService.enviarWhatsApp.mock.calls[0][2]).toMatch(/áudio/i);
    expect(claudeService.chamarClaude).not.toHaveBeenCalled();
  });

  test('mensagem sem texto reconhecível (ex: localização) NÃO deve cair sozinha na primeira pergunta do FAQ', async () => {
    const phone = '5500900000001';
    await fakeDb.collection('conversations').insertOne({
      key: `oticas-teste:${phone}`, clientId: CLIENTE_BASE.clientId, phone,
      history: [], historicoCompleto: [], humanMode: false, leadNotificado: false,
      lojaEscolhida: null, primeiraVez: false, updatedAt: new Date()
    });

    // body sem "text", sem audio/image/sticker — como uma localização ou contato
    await processarMensagem(CLIENTE_BASE, { phone, fromMe: false, isGroup: false, location: { lat: 1, lng: 2 } });

    // Antes da correção, isso disparava a primeira resposta do FAQ por engano
    // (string vazia "casa" com qualquer pergunta cadastrada).
    const respostasEnviadas = wameService.enviarWhatsApp.mock.calls.map(c => c[2]);
    expect(respostasEnviadas).not.toContain(CLIENTE_BASE.faq[0].resposta);
    expect(claudeService.chamarClaude).not.toHaveBeenCalled();
  });
});

describe('processarMensagem — resposta numérica não deve virar "mensagem simples"', () => {
  test('cliente respondendo apenas "1" é processado normalmente pela Claude', async () => {
    const phone = '5500900000001';
    await fakeDb.collection('conversations').insertOne({
      key: `oticas-teste:${phone}`, clientId: CLIENTE_BASE.clientId, phone,
      history: [{ role: 'assistant', content: 'Qual filial prefere? 1) Centro' }],
      historicoCompleto: [], humanMode: false, leadNotificado: false,
      lojaEscolhida: null, primeiraVez: false, updatedAt: new Date()
    });
    claudeService.chamarClaude.mockResolvedValue({ texto: 'Perfeito, filial Centro! [FILIAL:1]', usage: { input_tokens: 5, output_tokens: 5 } });

    await processarMensagem(CLIENTE_BASE, bodyTexto('1', phone));

    expect(claudeService.chamarClaude).toHaveBeenCalledTimes(1);
    expect(wameService.enviarWhatsApp).toHaveBeenCalledWith('chave-teste', phone, 'Perfeito, filial Centro!');
  });
});

describe('processarMensagem — escolha de filial e lead pronto', () => {
  test('tag [FILIAL:N] é removida da resposta e gravada na sessão', async () => {
    const phone = '5500900000001';
    await fakeDb.collection('conversations').insertOne({
      key: `oticas-teste:${phone}`, clientId: CLIENTE_BASE.clientId, phone,
      history: [], historicoCompleto: [], humanMode: false, leadNotificado: false,
      lojaEscolhida: null, primeiraVez: false, updatedAt: new Date()
    });
    claudeService.chamarClaude.mockResolvedValue({ texto: 'Show, filial Centro então! [FILIAL:1]', usage: { input_tokens: 5, output_tokens: 5 } });

    await processarMensagem(CLIENTE_BASE, bodyTexto('Prefiro a filial do centro', phone));

    expect(wameService.enviarWhatsApp).toHaveBeenCalledWith('chave-teste', phone, 'Show, filial Centro então!');
    const sessao = await fakeDb.collection('conversations').findOne({ key: `oticas-teste:${phone}` });
    expect(sessao.lojaEscolhida.nome).toBe('Óticas Teste — Centro');
  });

  test('depois de já ter escolhido filial, o bot continua tirando dúvidas mas o prompt reforça que o vendedor da loja vai atender', async () => {
    const phone = '5500900000001';
    await fakeDb.collection('conversations').insertOne({
      key: `oticas-teste:${phone}`, clientId: CLIENTE_BASE.clientId, phone,
      history: [{ role: 'assistant', content: 'Show, filial Centro então!' }],
      historicoCompleto: [], humanMode: false, leadNotificado: true,
      lojaEscolhida: CLIENTE_BASE.lojas[1], primeiraVez: false, updatedAt: new Date()
    });
    claudeService.chamarClaude.mockResolvedValue({ texto: 'O prazo médio é de 7 dias úteis. O vendedor da Óticas Teste — Centro vai continuar com você a partir daqui! 😊', usage: { input_tokens: 5, output_tokens: 5 } });

    await processarMensagem(CLIENTE_BASE, bodyTexto('Quanto tempo demora pra ficar pronto?', phone));

    // o bot continuou processando a dúvida normalmente pela Claude...
    expect(claudeService.chamarClaude).toHaveBeenCalledTimes(1);
    const [systemPromptEnviado] = claudeService.chamarClaude.mock.calls[0];
    // systemPrompt agora é um array de blocos (cache de prompt) — junta pra checar o texto
    const textoPrompt = systemPromptEnviado.map(b => b.text).join('\n');
    // ...e o prompt do sistema instruiu a Claude a reforçar que o vendedor da loja atende
    expect(textoPrompt).toContain('CLIENTE JÁ ESCOLHEU FILIAL');
    expect(textoPrompt).toContain('Óticas Teste — Centro');
  });

  test('[LEAD_PRONTO] com filial já escolhida notifica a filial e envia o link', async () => {
    const phone = '5500900000001';
    await fakeDb.collection('conversations').insertOne({
      key: `oticas-teste:${phone}`, clientId: CLIENTE_BASE.clientId, phone,
      history: [{ role: 'user', content: 'quero óculos de grau' }],
      historicoCompleto: [{ role: 'user', content: 'quero óculos de grau' }],
      humanMode: false, leadNotificado: false,
      lojaEscolhida: CLIENTE_BASE.lojas[1], primeiraVez: false, updatedAt: new Date()
    });
    claudeService.chamarClaude.mockResolvedValue({ texto: 'Combinado! [LEAD_PRONTO]', usage: { input_tokens: 5, output_tokens: 5 } });
    claudeService.gerarResumoLead.mockResolvedValue({ texto: 'Resumo do lead', usage: { input_tokens: 3, output_tokens: 2 } });

    await processarMensagem(CLIENTE_BASE, bodyTexto('Pode ser', phone));

    expect(LeadModel.criarLead).toHaveBeenCalledTimes(1);
    expect(wameService.enviarBotao).toHaveBeenCalledTimes(1);
    // mensagem com o link direto da filial também deve ter sido enviada ao cliente
    const respostasEnviadas = wameService.enviarWhatsApp.mock.calls.map(c => c[2]);
    expect(respostasEnviadas.some(m => m.includes('https://wa.me/5500900000101'))).toBe(true);

    const sessao = await fakeDb.collection('conversations').findOne({ key: `oticas-teste:${phone}` });
    expect(sessao.leadNotificado).toBe(true);
  });
});

describe('processarMensagem — pedido de atendimento humano', () => {
  test('[HUMANO] notifica a filial e avisa o cliente, sem travar o bot', async () => {
    const phone = '5500900000001';
    await fakeDb.collection('conversations').insertOne({
      key: `oticas-teste:${phone}`, clientId: CLIENTE_BASE.clientId, phone,
      history: [], historicoCompleto: [], humanMode: false, leadNotificado: false,
      lojaEscolhida: CLIENTE_BASE.lojas[1], primeiraVez: false, updatedAt: new Date()
    });
    claudeService.chamarClaude.mockResolvedValue({ texto: 'Vou te transferir. [HUMANO]', usage: { input_tokens: 5, output_tokens: 5 } });

    await processarMensagem(CLIENTE_BASE, bodyTexto('Quero falar com atendente', phone));

    const destinatarios = wameService.enviarWhatsApp.mock.calls.map(c => c[1]);
    expect(destinatarios).toContain('5500900000101'); // filial avisada
    expect(destinatarios).toContain(phone); // cliente avisado
  });
});

describe('processarMensagem — trial expirado e falha da Claude', () => {
  test('cliente com trial expirado não chama a Claude', async () => {
    const cliente = { ...CLIENTE_BASE, trialAte: new Date(Date.now() - 60000).toISOString() };
    await processarMensagem(cliente, bodyTexto('oi'));

    expect(claudeService.chamarClaude).not.toHaveBeenCalled();
    expect(wameService.enviarWhatsApp.mock.calls[0][2]).toMatch(/teste encerrou/i);
    expect(UsoModel.registrarMensagem).not.toHaveBeenCalled();
  });

  test('erro na API da Claude envia mensagem de contingência e não derruba o processo', async () => {
    const phone = '5500900000001';
    await fakeDb.collection('conversations').insertOne({
      key: `oticas-teste:${phone}`, clientId: CLIENTE_BASE.clientId, phone,
      history: [], historicoCompleto: [], humanMode: false, leadNotificado: false,
      lojaEscolhida: null, primeiraVez: false, updatedAt: new Date()
    });
    claudeService.chamarClaude.mockRejectedValue(new Error('timeout'));

    await expect(processarMensagem(CLIENTE_BASE, bodyTexto('Preciso de ajuda urgente', phone))).resolves.not.toThrow();
    expect(wameService.enviarWhatsApp.mock.calls[0][2]).toMatch(/instabilidade técnica/i);
  });
});

describe('processarMensagem — modo humano ativo', () => {
  test('sessão com humanMode=true fica em silêncio', async () => {
    const phone = '5500900000001';
    await fakeDb.collection('conversations').insertOne({
      key: `oticas-teste:${phone}`, clientId: CLIENTE_BASE.clientId, phone,
      history: [], historicoCompleto: [], humanMode: true, leadNotificado: false,
      lojaEscolhida: null, primeiraVez: false, updatedAt: new Date()
    });

    await processarMensagem(CLIENTE_BASE, bodyTexto('Alguém aí?', phone));

    expect(wameService.enviarWhatsApp).not.toHaveBeenCalled();
    expect(claudeService.chamarClaude).not.toHaveBeenCalled();
  });
});

describe('processarBotao', () => {
  test('clique em "Assumir Atendimento" marca o lead e avisa o vendedor', async () => {
    await processarBotao(CLIENTE_BASE, { buttonId: `assumir_${CLIENTE_BASE.clientId}_5500900000001`, phone: '5500900000101' });

    expect(LeadModel.assumirLead).toHaveBeenCalledWith(CLIENTE_BASE.clientId, '5500900000001', '5500900000101');
    expect(wameService.enviarWhatsApp).toHaveBeenCalledTimes(1);
    expect(wameService.enviarWhatsApp.mock.calls[0][2]).toMatch(/Lead assumido/i);
  });

  test('ignora clientId de outro cliente (evita vazar lead entre tenants)', async () => {
    await processarBotao(CLIENTE_BASE, { buttonId: 'assumir_outro-cliente_5500900000001', phone: '5500900000101' });
    expect(LeadModel.assumirLead).not.toHaveBeenCalled();
  });
});
