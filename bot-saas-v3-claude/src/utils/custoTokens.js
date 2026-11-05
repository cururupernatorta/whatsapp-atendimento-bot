const PRECO_INPUT_POR_1K = parseFloat(process.env.PRECO_INPUT_TOKEN_1K || '0.015');
const PRECO_OUTPUT_POR_1K = parseFloat(process.env.PRECO_OUTPUT_TOKEN_1K || '0.075');

function calcularCusto(inputTokens = 0, outputTokens = 0) {
  const custoInput = (inputTokens / 1000) * PRECO_INPUT_POR_1K;
  const custoOutput = (outputTokens / 1000) * PRECO_OUTPUT_POR_1K;
  return Math.round((custoInput + custoOutput) * 1000000) / 1000000;
}

module.exports = { calcularCusto, PRECO_INPUT_POR_1K, PRECO_OUTPUT_POR_1K };
