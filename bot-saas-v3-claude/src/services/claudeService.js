const axios = require('axios');
const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';

async function chamarClaude(systemPrompt, messages, maxTokens) {
  const apiKey = process.env.CLAUDE_API_KEY;
  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
  const max_tokens = maxTokens || parseInt(process.env.CLAUDE_MAX_TOKENS || '400');

  const tentar = async () => {
    const res = await axios.post(`${ANTHROPIC_BASE}/messages`, {
      model,
      max_tokens,
      system: systemPrompt,
      messages,
      // Atendimento por WhatsApp não precisa de raciocínio estendido — é só
      // seguir o roteiro do prompt. "Pensamento" conta como token de saída
      // (mais caro) sem melhorar a resposta pra esse tipo de tarefa; medido
      // ~44% menos tokens de saída desligando, resposta idêntica em qualidade.
      thinking: { type: 'disabled' }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      timeout: 30000
    });

    const texto = (res.data.content || []).find(c => c.type === 'text')?.text || '';
    const usage = res.data.usage || { input_tokens: 0, output_tokens: 0 };
    return { texto, usage };
  };

  // 1 nova tentativa em caso de falha (timeout, instabilidade momentânea da
  // API) antes de desistir e cair na mensagem de contingência — evita que um
  // soluço passageiro derrube o atendimento do cliente sem necessidade.
  try {
    return await tentar();
  } catch (primeiroErro) {
    console.warn('[CLAUDE] 1ª tentativa falhou, tentando de novo:', primeiroErro.response?.data?.error?.message || primeiroErro.message);
    await new Promise(r => setTimeout(r, 800));
    try {
      return await tentar();
    } catch (err) {
      console.error('[CLAUDE ERRO]:', err.response?.data?.error?.message || err.message);
      throw err;
    }
  }
}

async function gerarResumoLead(historicoTexto, roteiroAnamnese) {
  const apiKey = process.env.CLAUDE_API_KEY;
  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
  const itens = (roteiroAnamnese && roteiroAnamnese.length > 0)
    ? roteiroAnamnese
    : ['O que o cliente procura', 'Detalhes relevantes do pedido', 'Preferência/urgência', 'Qual filial é mais conveniente'];
  const itensTexto = itens.map(i => `- ${i}`).join('\n');
  const prompt = `Você é assistente de vendas. Analise a conversa e liste, em rótulos BEM curtos (2-5 palavras cada, não frases), o que o cliente informou sobre cada ponto abaixo. Escreva "não informado" quando não houver nada sobre o item.

Exemplo de estilo (rótulo, não frase): "Já usa óculos: sim, multifocal" — não "O cliente relatou que já utiliza óculos de grau do tipo multifocal há alguns anos".

Pontos a cobrir:
${itensTexto}

Uma linha por ponto, sem saudações, sem texto extra antes ou depois da lista.

CONVERSA:
${historicoTexto}`;

  try {
    const res = await axios.post(`${ANTHROPIC_BASE}/messages`, {
      model,
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
      thinking: { type: 'disabled' }
    }, {
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      timeout: 30000
    });

    const texto = (res.data.content || []).find(c => c.type === 'text')?.text?.trim() || 'Resumo não disponível.';
    const usage = res.data.usage || { input_tokens: 0, output_tokens: 0 };
    return { texto, usage };
  } catch (err) {
    console.error('[CLAUDE RESUMO ERRO]:', err.message);
    return { texto: 'Resumo não disponível. Ver histórico acima.', usage: { input_tokens: 0, output_tokens: 0 } };
  }
}

module.exports = { chamarClaude, gerarResumoLead };
