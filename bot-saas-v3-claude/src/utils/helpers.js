function formatarTelefone(phone) {
  return phone.replace(/^55/, '').replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-$3');
}

function horarioBrasil() {
  return new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function hojeBrasil() {
  return new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

// Horário padrão usado quando a filial não tem horário próprio configurado.
const HORARIO_PADRAO = { segSex: '08:30-18:30', sabado: '08:30-13:00', domingo: 'fechado' };

// "10:00-22:00" -> [10, 22] (horas decimais). "fechado"/vazio -> null (fechado nesse dia).
function parseFaixaHorario(txt) {
  if (!txt || /fechado/i.test(txt.trim())) return null;
  const m = txt.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return [parseInt(m[1]) + parseInt(m[2]) / 60, parseInt(m[3]) + parseInt(m[4]) / 60];
}

function filialEstaAberta(loja) {
  const agora = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
  const d = new Date(agora);
  const dia = d.getDay();
  const hd = d.getHours() + d.getMinutes() / 60;

  const txt = dia === 0 ? (loja.horarioDomingo || HORARIO_PADRAO.domingo)
    : dia === 6 ? (loja.horarioSabado || HORARIO_PADRAO.sabado)
    : (loja.horarioSegSex || HORARIO_PADRAO.segSex);

  const faixa = parseFaixaHorario(txt);
  if (!faixa) return false;
  return hd >= faixa[0] && hd < faixa[1];
}

function formatarFaixaHorario(txt) {
  if (/fechado/i.test(txt)) return 'fechado';
  const m = txt.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!m) return txt;
  const fmt = (h, mm) => mm === '00' ? `${parseInt(h)}h` : `${parseInt(h)}h${mm}`;
  return `${fmt(m[1], m[2])}-${fmt(m[3], m[4])}`;
}

function horarioFilial(loja) {
  const segSex = loja.horarioSegSex || HORARIO_PADRAO.segSex;
  const sabado = loja.horarioSabado || HORARIO_PADRAO.sabado;
  const domingo = loja.horarioDomingo || HORARIO_PADRAO.domingo;
  return `Seg-Sex ${formatarFaixaHorario(segSex)} | Sáb ${formatarFaixaHorario(sabado)} | Dom ${formatarFaixaHorario(domingo)}`;
}

function filiaisAbertas(lojas) {
  const abertas = [];
  for (const key of Object.keys(lojas || {})) {
    if (filialEstaAberta(lojas[key])) abertas.push({ key, ...lojas[key] });
  }
  return abertas;
}

function filialAleatoria(lojas) {
  const keys = Object.keys(lojas || {});
  if (keys.length === 0) return null;
  const k = keys[Math.floor(Math.random() * keys.length)];
  return { key: k, ...lojas[k] };
}

function filtrarMensagemSimples(message, nomeBot = 'Ana', nomeEmpresa = 'a empresa') {
  const norm = message.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // Só palavras SEM ambiguidade de significado, que nunca seriam a resposta
  // a uma pergunta do bot (ex: "sim"/"ok"/"certo" ficam de fora de propósito
  // — durante a anamnese, essas quase sempre são resposta a algo perguntado).
  const simples = ['oi','ola','e ai','obrigado','obrigada','obg','vlw','valeu','tchau','ate logo','falou','flw','bom dia','boa tarde','boa noite','👍','👏','🙏','😊','❤️','✅','🙂'];
  // IMPORTANTE: usar \p{Extended_Pictographic}, e não \p{Emoji} — a propriedade
  // \p{Emoji} do Unicode também classifica dígitos ASCII (0-9), "#" e "*" como
  // "emoji" (são usados nas sequências de keycap, tipo 2️⃣). Com \p{Emoji}, uma
  // resposta do cliente como "1", "2" ou "45" (ex: escolhendo uma filial por
  // número, ou informando quantidade/preço) era tratada como "mensagem simples"
  // e recebia uma resposta genérica em vez de ser processada de verdade.
  const soEmoji = message.trim().length > 0 && message.trim().length <= 5 && /^[\p{Extended_Pictographic}\s]+$/u.test(message);
  const isSimple = simples.includes(norm) || soEmoji;

  const respostas = {
    'bom dia': `Bom dia! 😊 Sou a ${nomeBot}, da ${nomeEmpresa}. Como posso ajudar?`,
    'boa tarde': `Boa tarde! 😊 Sou a ${nomeBot}, da ${nomeEmpresa}. Como posso ajudar?`,
    'boa noite': `Boa noite! 😊 Sou a ${nomeBot}, da ${nomeEmpresa}. Como posso ajudar?`,
    'oi': `Olá! Sou a ${nomeBot}, da ${nomeEmpresa}. Como posso te ajudar hoje? 😊`,
    'ola': `Olá! Sou a ${nomeBot}, da ${nomeEmpresa}. Como posso te ajudar hoje? 😊`,
    'obrigado': 'Disponha! Qualquer coisa é só chamar 😊',
    'obrigada': 'Disponha! Qualquer coisa é só chamar 😊',
    'obg': 'Disponha! 😊',
    'vlw': 'Disponha! 😊',
    'valeu': 'Disponha! 😊',
    'tchau': 'Até mais! Estamos por aqui se precisar 😊',
    'falou': 'Até mais! 😊',
    'flw': 'Até mais! 😊',
  };
  return { isSimple, fixedReply: respostas[norm] || 'Estou aqui! Como posso ajudar? 😊' };
}

function tratarTipoMensagem(tipo) {
  if (tipo === 'audio') return { isSimple: true, fixedReply: 'Recebi seu áudio! Pode me contar em texto o que você precisa? 😊' };
  if (tipo === 'imagem') return { isSimple: true, fixedReply: 'Recebi sua imagem! Pode me contar em texto o que você precisa? 😊' };
  if (tipo === 'figurinha') return { isSimple: true, fixedReply: null };
  // Mensagens sem texto reconhecível (localização, contato, documento, vídeo,
  // etc. — qualquer tipo que a Z-API mande sem "text" e sem cair em
  // audio/imagem/figurinha). Sem este caso, a mensagem virava uma string vazia
  // que "casava" por engano com a primeira pergunta do FAQ (''.includes(x) e
  // x.includes('') são sempre verdadeiros), respondendo qualquer coisa errada.
  if (tipo === 'vazio') return { isSimple: true, fixedReply: 'Recebi sua mensagem, mas não consegui identificar o conteúdo. Pode me contar em texto o que você precisa? 😊' };
  return null;
}

function trialExpirado(cliente) {
  if (!cliente.trialAte) return false;
  return new Date() > new Date(cliente.trialAte);
}

function formatarRelatorioCliente(stats, cliente) {
  const msgs = stats.reduce((a, s) => a + (s.mensagensEnviadas || 0), 0);
  const leads = stats.reduce((a, s) => a + (s.leadsGerados || 0), 0);
  const humanos = stats.reduce((a, s) => a + (s.pedidosHumano || 0), 0);
  return `📊 *Resumo da semana — ${cliente.nomeEmpresa}*

💬 Mensagens atendidas: ${msgs}
🆕 Leads enviados: ${leads}
🙋 Pedidos de humano: ${humanos}
⏱️ Bot ativo 24h — nenhuma mensagem perdida!

Continue assim! 🚀`;
}

function mensagemLinkFilial(loja) {
  return `Perfeito! Você pode continuar por aqui, ou se preferir falar direto com a filial *${loja.nome}*, clique aqui: ${loja.link}`;
}

function formatarRelatorioAdmin(linhasPorCliente, totalGeral) {
  let corpo = linhasPorCliente.join('\n\n');
  return `📊 *Relatório Semanal — Todos os Clientes*

${corpo}

━━━━━━━━━━━━━━
💰 *Custo total de IA na semana:* R$ ${totalGeral.toFixed(2)}`;
}

module.exports = {
  formatarTelefone, horarioBrasil, hojeBrasil,
  filialEstaAberta, horarioFilial, filiaisAbertas, filialAleatoria,
  filtrarMensagemSimples, tratarTipoMensagem, trialExpirado,
  formatarRelatorioCliente, formatarRelatorioAdmin, mensagemLinkFilial,
  HORARIO_PADRAO
};
