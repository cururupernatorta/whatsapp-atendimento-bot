const { PLANOS, getPlano } = require('../src/config/planos');

describe('getPlano', () => {
  test('retorna o plano correto para cada id', () => {
    expect(getPlano('start')).toBe(PLANOS.start);
    expect(getPlano('pro')).toBe(PLANOS.pro);
    expect(getPlano('enterprise')).toBe(PLANOS.enterprise);
  });

  test('cai para "pro" quando o id do plano é desconhecido/indefinido', () => {
    expect(getPlano('inexistente')).toBe(PLANOS.pro);
    expect(getPlano(undefined)).toBe(PLANOS.pro);
  });

  test('todo plano define limite de mensagens e preço do excedente', () => {
    for (const plano of Object.values(PLANOS)) {
      expect(plano.limiteMensagens).toBeGreaterThan(0);
      expect(plano.precoPorMensagemExcedente).toBeGreaterThanOrEqual(0);
    }
  });
});
