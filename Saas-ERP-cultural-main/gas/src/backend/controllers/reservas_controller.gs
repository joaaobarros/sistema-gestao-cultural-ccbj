/**
 * @file backend/controllers/reservas_controller.gs
 * @layer backend/controllers
 * @description Fachada oficial do domínio Reservas — único ponto de entrada via google.script.run.
 *
 * REGRA ARQUITETURAL:
 *   - O bridge (server_bridge_js.html) aponta APENAS para funções ctrl_reservas_*.
 *   - Nenhuma chamada frontend deve chamar mod_reservas.gs ou reserva_engine.gs diretamente.
 *   - Toda resposta é GasResponse: { ok, data, error, metadata }.
 *   - Validação de input ocorre aqui; lógica de negócio permanece nas engines/services.
 *
 * Fluxo:
 *   Frontend → ctrl_reservas_* → Engine/Service → Repository → DataGateway
 *
 * @depends shared/response.gs (GasResponse),
 *          modules/reservas/reserva_engine.gs (ReservaEngine),
 *          modules/reservas/mod_reservas.gs (funções públicas de reservas),
 *          backend/mod_admin.gs (obterEmailUsuario)
 */

// ═══════════════════════════════════════════════════════════════════
// LEITURA
// ═══════════════════════════════════════════════════════════════════

/**
 * Lista todas as reservas acessíveis ao usuário autenticado.
 */
function ctrl_reservas_listar() {
  return GasResponse.wrap(function () {
    return obterReservas();
  }, 'ctrl_reservas_listar');
}

/**
 * Verifica conflito de horário para um espaço antes de criar/editar reserva.
 * @param {string} sala
 * @param {string} data
 * @param {string} inicio
 * @param {string} termino
 * @param {string|null} idIgnorar — ID de reserva a ignorar (edição)
 */
function ctrl_reservas_verificar_conflito(sala, data, inicio, termino, idIgnorar) {
  return GasResponse.wrap(function () {
    if (!sala)    throw new Error('Parâmetro "sala" é obrigatório');
    if (!data)    throw new Error('Parâmetro "data" é obrigatório');
    if (!inicio)  throw new Error('Parâmetro "inicio" é obrigatório');
    if (!termino) throw new Error('Parâmetro "termino" é obrigatório');
    return verificarConflitoEspaco(sala, data, inicio, termino, idIgnorar || null);
  }, 'ctrl_reservas_verificar_conflito');
}

/**
 * Analisa disponibilidade real de espaço e itens para um payload de agendamento.
 * @param {Object} payload — { espacoId, data, inicio, fim, itens? }
 */
function ctrl_reservas_disponibilidade(payload) {
  return GasResponse.wrap(function () {
    if (!payload || typeof payload !== 'object') throw new Error('Payload de disponibilidade é obrigatório');
    return analisarDisponibilidadeReal(payload);
  }, 'ctrl_reservas_disponibilidade');
}

/**
 * Retorna disponibilidade de itens para um horário específico.
 * @param {string} data
 * @param {string} inicio
 * @param {string} termino
 * @param {string} idSala
 */
function ctrl_reservas_itens_disponibilidade(data, inicio, termino, idSala) {
  return GasResponse.wrap(function () {
    return obterDisponibilidadeItensPorHorario(data, inicio, termino, idSala);
  }, 'ctrl_reservas_itens_disponibilidade');
}

/**
 * Verifica se o usuário tem permissão para cancelar a reserva indicada.
 * @param {string} id
 * @param {string} emailFallback
 */
function ctrl_reservas_verificar_permissao_cancelamento(id, emailFallback) {
  return GasResponse.wrap(function () {
    if (!id) throw new Error('ID da reserva é obrigatório');
    var email = obterEmailUsuario(emailFallback || '');
    return verificarPermissaoCancelamento(id, email);
  }, 'ctrl_reservas_verificar_permissao_cancelamento');
}

// ═══════════════════════════════════════════════════════════════════
// ESCRITA — CRIAÇÃO / ATUALIZAÇÃO
// ═══════════════════════════════════════════════════════════════════

/**
 * Cria uma ou mais reservas (com suporte a datas múltiplas).
 * @param {Object}   dados — payload de reserva
 * @param {string[]} datas — lista de datas ISO
 */
function ctrl_reservas_criar(dados, datas) {
  return GasResponse.wrap(function () {
    if (!dados || typeof dados !== 'object') throw new Error('Payload de reserva inválido');
    return criarReservaController(dados, datas || []);
  }, 'ctrl_reservas_criar');
}

/**
 * Atualiza uma reserva existente.
 * @param {Object} dados — payload com id obrigatório
 */
function ctrl_reservas_atualizar(dados) {
  return GasResponse.wrap(function () {
    if (!dados || typeof dados !== 'object') throw new Error('Payload de atualização inválido');
    if (!dados.id) throw new Error('ID da reserva é obrigatório para atualização');
    return atualizarReservaController(dados);
  }, 'ctrl_reservas_atualizar');
}

// ═══════════════════════════════════════════════════════════════════
// ESCRITA — TRANSIÇÕES DE STATUS
// ═══════════════════════════════════════════════════════════════════

/**
 * Cancela uma reserva sem exigir justificativa.
 * @param {string} id
 * @param {string} emailFallback
 */
function ctrl_reservas_cancelar(id, emailFallback) {
  return GasResponse.wrap(function () {
    if (!id) throw new Error('ID da reserva é obrigatório');
    var email = obterEmailUsuario(emailFallback || '');
    return cancelarReserva(id, email);
  }, 'ctrl_reservas_cancelar');
}

/**
 * Cancela uma reserva com justificativa obrigatória.
 * @param {string} id
 * @param {string} emailFallback
 * @param {string} justificativa
 */
function ctrl_reservas_cancelar_justificado(id, emailFallback, justificativa) {
  return GasResponse.wrap(function () {
    if (!id) throw new Error('ID da reserva é obrigatório');
    if (!justificativa || !String(justificativa).trim()) throw new Error('Justificativa é obrigatória');
    var email = obterEmailUsuario(emailFallback || '');
    return cancelarReservaComJustificativa(id, email, justificativa);
  }, 'ctrl_reservas_cancelar_justificado');
}

/**
 * Habilita uma reserva confirmada (marcação operacional de uso efetivo).
 * @param {string} id
 * @param {string} emailFallback
 * @param {string} [obs]
 */
function ctrl_reservas_habilitar(id, emailFallback, obs) {
  return GasResponse.wrap(function () {
    if (!id) throw new Error('ID da reserva é obrigatório');
    var email = obterEmailUsuario(emailFallback || '');
    return habilitarReservaStatus(id, email, obs || '');
  }, 'ctrl_reservas_habilitar');
}
