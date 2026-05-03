/**
 * @file utils.gs
 * @description Helpers globais compartilhados por todos os módulos backend.
 * @layer backend
 * @responsibility Geração de IDs únicos, comparação de datas e utilitários sem dependências externas.
 */

/**
 * ========================================
 * BLOCO: Helpers globais
 * ========================================
 */

function gerarId(prefixo) {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefixo}-${timestamp}-${random}`;
}

function isMesmoDia(dataReserva) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const data = new Date(dataReserva);
  data.setHours(0, 0, 0, 0);
  return hoje.getTime() === data.getTime();
}
