const { gerarSystemPrompt } = require('../src/utils/systemPrompt');

const CLIENTE = {
  nomeBot: 'Ana',
  nomeEmpresa: 'Óticas Teste',
  descricao: 'Rede de óticas.',
  conhecimento: 'Prazo médio de 7 dias.',
  limites: '',
  lojas: { 1: { nome: 'Óticas Teste — Centro' } },
  faq: []
};

// gerarSystemPrompt agora retorna um array de blocos (pra permitir prompt
// caching — só o bloco fixo leva cache_control) em vez de uma string só.
// Os testes continuam checando o texto, então junta tudo pra comparar.
function textoCompleto(prompt) {
  return prompt.map(b => b.text).join('\n');
}

describe('gerarSystemPrompt', () => {
  test('retorna o bloco fixo com cache_control (TTL de 1h), pra aproveitar o cache de prompt da Anthropic', () => {
    const prompt = gerarSystemPrompt(CLIENTE);
    expect(prompt[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
  });

  test('sem filial escolhida, não inclui o bloco de reforço de vendedor (nem bloco variável)', () => {
    const prompt = gerarSystemPrompt(CLIENTE);
    expect(textoCompleto(prompt)).not.toContain('CLIENTE JÁ ESCOLHEU FILIAL');
    expect(prompt.length).toBe(1);
  });

  test('com filial já escolhida, instrui a continuar ajudando e sempre reforçar o vendedor', () => {
    const prompt = gerarSystemPrompt(CLIENTE, { lojaEscolhida: { nome: 'Óticas Teste — Centro' } });
    const texto = textoCompleto(prompt);

    expect(texto).toContain('CLIENTE JÁ ESCOLHEU FILIAL');
    expect(texto).toContain('Óticas Teste — Centro');
    // instrução central: continuar tirando dúvidas...
    expect(texto).toMatch(/continue tirando as dúvidas/i);
    // ...mas sempre deixando claro que quem fecha é o vendedor da loja
    expect(texto).toMatch(/vendedor/i);
    // o bloco variável não deve levar cache_control (muda a cada chamada)
    expect(prompt[1].cache_control).toBeUndefined();
  });

  test('objetivo deixa claro que o atendimento continua após o lead pronto', () => {
    const prompt = gerarSystemPrompt(CLIENTE);
    expect(textoCompleto(prompt)).toMatch(/continue à disposição/i);
  });
});
