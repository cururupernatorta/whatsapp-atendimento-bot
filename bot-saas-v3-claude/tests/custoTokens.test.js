describe('calcularCusto', () => {
  beforeEach(() => jest.resetModules());

  test('calcula custo com os preços padrão do .env.example', () => {
    process.env.PRECO_INPUT_TOKEN_1K = '0.015';
    process.env.PRECO_OUTPUT_TOKEN_1K = '0.075';
    const { calcularCusto } = require('../src/utils/custoTokens');
    // 600 input + 180 output tokens, conforme premissa usada no README/planos.js
    const custo = calcularCusto(600, 180);
    expect(custo).toBeCloseTo(0.6 * 0.015 + 0.18 * 0.075, 6);
  });

  test('sem tokens retorna custo zero', () => {
    const { calcularCusto } = require('../src/utils/custoTokens');
    expect(calcularCusto()).toBe(0);
    expect(calcularCusto(0, 0)).toBe(0);
  });

  test('nunca retorna valor negativo para entradas válidas', () => {
    const { calcularCusto } = require('../src/utils/custoTokens');
    expect(calcularCusto(1000, 1000)).toBeGreaterThan(0);
  });
});
