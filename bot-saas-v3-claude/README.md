# Bot de Atendimento WhatsApp — Multi-Tenant (Claude)

Recepcionista digital para WhatsApp usando **Claude (Anthropic)**, **WAME API** e **MongoDB Atlas**.
Um único servidor atende vários clientes (multi-tenant). O bot não vende no lugar do vendedor: ele
conversa, faz a anamnese, qualifica o lead e encaminha para a filial certa.

---

## Como funciona

1. A mensagem chega no webhook `/webhook/:clientId/:segredo` (o segredo é conferido com comparação em tempo constante).
2. `wameAdapter` converte o payload (formato Meta Cloud API) para um formato interno.
3. `mensagemBuffer` junta mensagens enviadas em sequência (debounce de 4 s) antes de chamar a IA.
4. `botService` monta o contexto, chama o Claude e interpreta as etiquetas da resposta:
   `[FILIAL:N]`, `[LEAD_PRONTO]`, `[HUMANO]`, `[NOME:x]`.
5. Quando o lead está pronto, a filial escolhida recebe um resumo curto no WhatsApp com o botão
   **Assumir Atendimento**, e o cliente recebe o link `wa.me` da loja.

## Funcionalidades

| Feature | Descrição |
|---------|-----------|
| Multi-tenant | Um servidor, N clientes, cada um com seu conhecimento, filiais e roteiro de anamnese |
| Anamnese configurável | O roteiro de perguntas é definido por cliente |
| Lead → filial | Notificação no WhatsApp da loja escolhida, com botão para assumir |
| Aviso de loja fechada | Resposta determinística (sem IA) quando a filial escolhida está fora do horário |
| Pedido de atendente humano | Avisa a(s) filial(is); o bot continua ativo |
| Alerta de lead sem resposta | Reavisa a filial após 30 minutos |
| Economia de IA | Cache de prompt (bloco fixo em cache, bloco variável fora), histórico curto no contexto, sem "thinking" |
| Opera 24h | Nunca bloqueia ao passar do limite do plano; só contabiliza o excedente |
| Relatórios semanais | Para o cliente (planos Pro/Enterprise) e para o dono do SaaS (tokens e custo por cliente) |
| Painel admin | Cadastro de clientes, leads, estatísticas e uso mensal |
| Segurança | `helmet`, rate limit, segredo no webhook, senha do admin por header, variáveis obrigatórias validadas na subida |
| Health check | `GET /health` |

---

## Requisitos

- Node.js 18 ou superior
- Uma conta no MongoDB Atlas
- Uma chave da API da Anthropic
- Uma instância da WAME API por número de WhatsApp de cliente

## Rodando localmente

```bash
cd bot-saas-v3-claude
npm install
cp .env.example .env     # preencha MONGODB_URI, CLAUDE_API_KEY e ADMIN_PASSWORD
npm start
```

`MONGODB_URI`, `CLAUDE_API_KEY` e `ADMIN_PASSWORD` são obrigatórias: sem elas o servidor não sobe.

## Variáveis de ambiente

Veja `.env.example` para a lista completa.

| Variável | Para que serve |
|----------|----------------|
| `MONGODB_URI` | String de conexão do MongoDB Atlas |
| `CLAUDE_API_KEY` | Chave da API da Anthropic |
| `CLAUDE_MODEL` | Modelo usado nas respostas |
| `CLAUDE_MAX_TOKENS` | Limite de tokens por resposta |
| `ADMIN_PASSWORD` | Senha do painel `/admin` |
| `PORT` | Porta do servidor |
| `RELATORIO_DIA` / `RELATORIO_HORA` | Quando enviar o relatório semanal |
| `OWNER_WAME_KEY` / `OWNER_WHATSAPP_NUMBER` | WhatsApp do dono do SaaS, usado para alertas e relatórios |
| `PRECO_INPUT_TOKEN_1K` / `PRECO_OUTPUT_TOKEN_1K` | Preço por 1.000 tokens, usado só para estimar custo |

Nunca versione o `.env`.

---

## Cadastrando um cliente

**Painel web:** acesse `https://SEU_SERVIDOR/admin`, entre com a senha do admin e preencha o formulário.

**Linha de comando:**

```bash
npm run create-client
```

**Exemplo pronto com dados fictícios:** `scripts/seedExemplo.js` mostra a estrutura completa de um
cliente (conhecimento, roteiro de anamnese e três filiais de exemplo).

```bash
npm run seed-exemplo
```

Para cadastrar um cliente real por script, copie esse arquivo para `scripts/seed.local.js`
(já está no `.gitignore`), troque os dados e rode `node scripts/seed.local.js`. Dados de clientes
reais e chaves não devem ir para o git.

## Configurando o webhook na WAME API

Na instância do cliente, configure o webhook (`PUT /{key}/instance`, campo `webhookMessage`,
com `webhookFormat: "meta"`):

```
https://SEU_SERVIDOR/webhook/ID_DO_CLIENTE/SEGREDO_DO_CLIENTE
```

A URL completa, com o segredo, aparece no painel admin e no terminal ao cadastrar o cliente.
Sem o segredo correto o webhook é recusado.

## Deploy no Render

1. Suba o código para um repositório GitHub (sem o `.env`).
2. Render → New Web Service → conecte o repositório.
3. **Root Directory:** `bot-saas-v3-claude`
4. **Build:** `npm install` | **Start:** `npm start`
5. Cadastre as variáveis do `.env.example` em Environment.

O Render faz deploy a cada push na branch configurada.

---

## Testes

```bash
npm test
```

Cobre helpers, planos, cálculo de custo, montagem do system prompt e o fluxo do `botService`.

### Teste de conversa local

```bash
npm run test-local
```

Simula um cliente conversando com o bot no terminal, usando o cliente `teste-local` (sem chave
da WAME API, então nada é enviado de verdade). Comandos: `/reset` reinicia a conversa, `/sair` encerra.

Se o cliente escolhido tiver uma chave WAME real cadastrada, o script exige que você digite
`mandar mensagem real` antes de continuar, para evitar envios acidentais.

### Roteiro de testes manuais

| Teste | Ação | Resultado esperado |
|-------|------|--------------------|
| Primeira vez | `oi` | Boas-vindas do bot |
| Anamnese | Pergunta aberta | O bot conduz as perguntas do roteiro |
| Escolha de filial | Cliente indica preferência | Detecta `[FILIAL:N]` |
| Loja fechada | Escolher filial fora do horário | Aviso fixo, sem IA |
| Lead pronto | Completar a anamnese | Resumo no WhatsApp da filial + botão Assumir |
| Pediu humano | `quero falar com atendente` | Avisa a filial, bot continua ativo |
| Áudio | Enviar áudio | Resposta fixa pedindo texto |
| Falha da API | Simular erro do Claude | Resposta de contingência |
| Passou do limite | Ultrapassar o limite mensal | Bot segue respondendo; mensagem contada como excedente |
| Botão assumir | Clicar em "Assumir Atendimento" | Lead marcado como em atendimento |

---

## Estrutura

```
bot-saas-v3-claude/
├── src/
│   ├── index.js              # servidor Express, segurança, cron
│   ├── config/               # banco e planos
│   ├── models/               # Client, Lead, Uso
│   ├── routes/               # webhook e admin
│   ├── services/             # botService, claudeService, wameAdapter, wameService,
│   │                         # mensagemBuffer, alertaService, relatorioService
│   ├── utils/                # helpers, systemPrompt, custoTokens
│   └── views/admin.html      # painel
├── scripts/                  # createClient, seedExemplo, testLocal
└── tests/                    # Jest
```

## Licença

MIT
