/**
 * PLANOS — fonte única de verdade para limites por plano.
 *
 * Os valores abaixo são EXEMPLOS: ajuste os limites e o preço por mensagem
 * excedente conforme o seu modelo comercial. O preço de cada cliente fica
 * salvo no cadastro dele (campo precoPorMensagemExcedente) e pode ser
 * alterado individualmente no painel admin.
 */

const PLANOS = {
  start: {
    nome: 'Start',
    limiteMensagens: 3000,
    precoPorMensagemExcedente: 0.10,
    relatorioSemanal: false
  },
  pro: {
    nome: 'Pro',
    limiteMensagens: 8000,
    precoPorMensagemExcedente: 0.10,
    relatorioSemanal: true
  },
  enterprise: {
    nome: 'Enterprise',
    limiteMensagens: 20000,
    precoPorMensagemExcedente: 0.10,
    relatorioSemanal: true
  }
};

function getPlano(planoId) {
  return PLANOS[planoId] || PLANOS.pro;
}

module.exports = { PLANOS, getPlano };
