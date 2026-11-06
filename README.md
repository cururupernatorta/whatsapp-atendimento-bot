# WhatsApp Customer-Service Bot (multi-tenant, Claude)

A multi-tenant WhatsApp receptionist for businesses with several branches. It talks to the customer, runs a configurable intake questionnaire, picks the right branch, and hands the qualified lead to a human at that branch with a short summary. It does not sell on behalf of the staff.

Built with **Node.js / Express**, **MongoDB Atlas**, the **Anthropic Claude API**, and a WhatsApp gateway (**WAME API**).

> The application lives in [`bot-saas-v3-claude/`](bot-saas-v3-claude/). Its own README (in Portuguese) has the full setup guide.

## How it works

```
WhatsApp ──▶ gateway webhook ──▶ /webhook/:clientId/:secret
                                     │  secret checked (timing-safe)
                                     ▼
                              wameAdapter  (gateway payload → internal message)
                                     ▼
                              messageBuffer (4 s debounce, merges rapid messages)
                                     ▼
                              botService ──▶ Claude API (cached system prompt)
                                     │
                    ┌────────────────┴─────────────────┐
                    ▼                                  ▼
          reply to the customer             lead summary + "take over"
                                            button sent to the branch
```

The model signals state with short tags in its reply (`[FILIAL:N]`, `[LEAD_PRONTO]`, `[HUMANO]`, `[NOME:x]`). `botService` strips them before anything reaches the customer and acts on them.

## Features

- **Multi-tenant:** one server, many clients. Each client has its own knowledge base, branches, opening hours and intake script.
- **Configurable intake:** the list of questions to ask before a lead is considered ready is defined per client.
- **Lead hand-off:** the chosen branch gets a concise summary on WhatsApp with a button to take over the conversation; the customer gets a `wa.me` link to that branch.
- **Deterministic closed-branch notice:** outside opening hours the reply is fixed text, with no model call.
- **Human escalation:** the customer can ask for a person at any time; the bot notifies the branch and stays active.
- **Unanswered-lead alert:** the branch is reminded after 30 minutes.
- **Cost control:** prompt caching (stable block cached, per-conversation block not), short model context window, extended thinking disabled, per-client usage and token cost tracking.
- **Plans and quotas:** monthly message limits per plan. The bot never stops answering at the limit; it counts overage for billing.
- **Reports:** weekly summary for clients and for the operator.
- **Admin panel:** register clients, inspect leads, usage statistics.

## Security notes

- No secrets in the repository. Configuration comes from environment variables; the server refuses to start if `MONGODB_URI`, `CLAUDE_API_KEY` or `ADMIN_PASSWORD` is missing.
- The webhook URL carries a per-client secret, compared with `crypto.timingSafeEqual`. Requests with a wrong secret are rejected.
- `helmet` security headers and `express-rate-limit` on the webhook and admin routes.
- Admin API requires a bearer password; the admin UI is served from the same origin under a CSP.
- Test tooling refuses to send real messages unless you type an explicit confirmation when the target client has a live gateway key.

## WhatsApp transport

All gateway-specific code is isolated in `wameAdapter.js` (incoming payloads) and `wameService.js` (outgoing messages). The bot logic only sees a small internal message format, so the transport can be replaced (for example with the official WhatsApp Business Cloud API) without touching the conversation logic.

## Quick start

```bash
cd bot-saas-v3-claude
npm install
cp .env.example .env      # set MONGODB_URI, CLAUDE_API_KEY, ADMIN_PASSWORD
npm start
```

Useful scripts:

| Command | Purpose |
|---------|---------|
| `npm test` | Run the Jest suite |
| `npm run test-local` | Chat with the bot in the terminal against a local test client (nothing is sent over WhatsApp) |
| `npm run seed-exemplo` | Create an example client with fictional branches |
| `npm run create-client` | Interactive client registration |

## Tech stack

Node.js 18+, Express, MongoDB, Anthropic Claude API, helmet, express-rate-limit, node-cron, Jest.

## License

MIT
