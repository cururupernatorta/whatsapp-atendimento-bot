require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { connectDB } = require('./config/database');
const { iniciarCronJobs } = require('./services/relatorioService');
const webhookRoutes = require('./routes/webhook');
const adminRoutes = require('./routes/admin');

// Falha rápido e com mensagem clara em vez de rodar com uma senha adivinhável
// ou travar mais na frente com um erro confuso.
const OBRIGATORIAS = ['MONGODB_URI', 'CLAUDE_API_KEY', 'ADMIN_PASSWORD'];
const faltando = OBRIGATORIAS.filter(v => !process.env[v]);
if (faltando.length > 0) {
  console.error(`❌ Variáveis de ambiente obrigatórias não configuradas: ${faltando.join(', ')}`);
  console.error('   Configure o .env (veja .env.example) antes de iniciar o servidor.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
// O painel admin (admin.html) é uma página só, com <script> e onclick="..."
// inline — o CSP padrão do helmet bloqueia isso silenciosamente (sem erro
// visível pro usuário, só no console do navegador). Libera inline scripts
// pra essa página continuar funcionando; os outros cabeçalhos de segurança
// do helmet (X-Frame-Options, HSTS etc.) continuam ativos normalmente.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'script-src': ["'self'", "'unsafe-inline'"],
      'script-src-attr': ["'self'", "'unsafe-inline'"]
    }
  }
}));
app.use(express.json({ limit: '10mb' }));

app.use('/webhook', rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false }));
app.use('/admin', rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false }));
app.use('/api/admin', rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false }));

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Bot SaaS v3 (Claude Edition)', version: '3.1.0', timestamp: new Date().toISOString() });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

app.use('/webhook', webhookRoutes);
app.use('/admin', adminRoutes);
app.use('/api/admin', adminRoutes);

async function start() {
  await connectDB();
  iniciarCronJobs();
  app.listen(PORT, () => {
    console.log(`🚀 Servidor na porta ${PORT}`);
    console.log(`📊 Painel: http://localhost:${PORT}/admin`);
    console.log(`💓 Health: http://localhost:${PORT}/health`);
  });
}

start();
