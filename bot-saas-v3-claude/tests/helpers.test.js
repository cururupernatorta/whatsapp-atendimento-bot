const {
  formatarTelefone, filialEstaAberta, horarioFilial, filiaisAbertas,
  filtrarMensagemSimples, tratarTipoMensagem, trialExpirado, mensagemLinkFilial
} = require('../src/utils/helpers');

describe('formatarTelefone', () => {
  test('remove o 55 e formata DDD + número', () => {
    expect(formatarTelefone('5500900000001')).toBe('(00) 90000-0001');
  });

  test('funciona com número de 8 dígitos (fixo)', () => {
    expect(formatarTelefone('550033221100')).toBe('(00) 3322-1100');
  });
});

describe('filtrarMensagemSimples', () => {
  test('reconhece saudação simples "oi"', () => {
    const r = filtrarMensagemSimples('oi', 'Ana', 'Óticas Teste');
    expect(r.isSimple).toBe(true);
    expect(r.fixedReply).toMatch(/Ana/);
  });

  test('reconhece emoji isolado como mensagem simples', () => {
    const r = filtrarMensagemSimples('👍');
    expect(r.isSimple).toBe(true);
  });

  test('NÃO trata uma resposta numérica simples (ex: "2") como mensagem simples', () => {
    // Bug: \p{Emoji} no unicode inclui dígitos ASCII (usados em sequências de
    // keycap, tipo 2️⃣), então "2" batia com o regex de "só emoji" e o bot
    // respondia com mensagem genérica em vez de processar a resposta do
    // cliente (ex: escolha de filial por número, quantidade, etc.)
    const r = filtrarMensagemSimples('2');
    expect(r.isSimple).toBe(false);
  });

  test('NÃO trata números de telefone/preço como mensagem simples', () => {
    expect(filtrarMensagemSimples('123').isSimple).toBe(false);
    expect(filtrarMensagemSimples('45999998888').isSimple).toBe(false);
  });

  test('uma frase normal não é tratada como simples', () => {
    const r = filtrarMensagemSimples('Quero saber sobre óculos de sol');
    expect(r.isSimple).toBe(false);
  });
});

describe('tratarTipoMensagem', () => {
  test('audio pede texto', () => {
    expect(tratarTipoMensagem('audio').fixedReply).toMatch(/áudio/i);
  });

  test('imagem pede texto', () => {
    expect(tratarTipoMensagem('imagem').fixedReply).toMatch(/imagem/i);
  });

  test('figurinha é ignorada (sem resposta)', () => {
    const r = tratarTipoMensagem('figurinha');
    expect(r.isSimple).toBe(true);
    expect(r.fixedReply).toBeNull();
  });

  test('tipo texto normal não é interceptado', () => {
    expect(tratarTipoMensagem('texto')).toBeNull();
  });
});

describe('trialExpirado', () => {
  test('sem trialAte nunca expira', () => {
    expect(trialExpirado({})).toBe(false);
  });

  test('data no passado = expirado', () => {
    expect(trialExpirado({ trialAte: new Date(Date.now() - 1000).toISOString() })).toBe(true);
  });

  test('data no futuro = não expirado', () => {
    expect(trialExpirado({ trialAte: new Date(Date.now() + 100000).toISOString() })).toBe(false);
  });
});

describe('horarioFilial / filialEstaAberta', () => {
  const loja = { horarioSegSex: '08:30-18:30', horarioSabado: '08:30-13:00', horarioDomingo: 'fechado' };

  test('formata a faixa de horário legível', () => {
    expect(horarioFilial(loja)).toBe('Seg-Sex 8h30-18h30 | Sáb 8h30-13h | Dom fechado');
  });

  test('filiaisAbertas nunca quebra com objeto de lojas vazio/indefinido', () => {
    expect(filiaisAbertas(undefined)).toEqual([]);
    expect(filiaisAbertas({})).toEqual([]);
  });

  test('filialEstaAberta retorna boolean mesmo com horário mal formatado', () => {
    expect(typeof filialEstaAberta({ horarioSegSex: 'texto invalido' })).toBe('boolean');
  });
});

describe('mensagemLinkFilial', () => {
  test('inclui nome e link da loja', () => {
    const msg = mensagemLinkFilial({ nome: 'Loja X', link: 'https://wa.me/123' });
    expect(msg).toContain('Loja X');
    expect(msg).toContain('https://wa.me/123');
  });
});
