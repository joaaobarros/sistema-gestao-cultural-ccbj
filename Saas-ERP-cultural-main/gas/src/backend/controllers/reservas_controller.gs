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
 * REGRA: usa possuiConflitoReserva() (não verificarConflitoEspaco diretamente)
 * para garantir auditoria via SystemEvents em toda tentativa de conflito.
 * @param {string} sala         — ID do espaço (contrato canônico)
 * @param {string} data         — data ISO ou DD/MM/YYYY
 * @param {string} inicio       — hora de início HH:MM
 * @param {string} termino      — hora de término HH:MM
 * @param {string|null} idIgnorar — ID de reserva a ignorar (edição)
 */
function ctrl_reservas_verificar_conflito(sala, data, inicio, termino, idIgnorar) {
  return GasResponse.wrap(function () {
    if (!sala)    throw new Error('Parâmetro "sala" é obrigatório');
    if (!data)    throw new Error('Parâmetro "data" é obrigatório');
    if (!inicio)  throw new Error('Parâmetro "inicio" é obrigatório');
    if (!termino) throw new Error('Parâmetro "termino" é obrigatório');
    // Roteado via possuiConflitoReserva → emite SystemEvent CONFLICT_DETECTED para auditoria
    return possuiConflitoReserva({
      espacoId:          sala,
      data:              data,
      inicio:            inicio,
      fim:               termino,
      reservaIgnoradaId: idIgnorar || null
    });
  }, 'ctrl_reservas_verificar_conflito');
}

/**
 * Analisa disponibilidade real de espaço para um ou mais dias.
 *
 * CONTRATO CANÔNICO (formato oficial):
 *   { sala: string, horaInicio: string, horaTermino: string, datas: string[] }
 *
 * COMPATIBILIDADE RETROATIVA (formato legado — aceito temporariamente):
 *   { espacoId: string, inicio: string, fim: string, data: string }
 *   Os campos legados são normalizados para o contrato canônico antes de
 *   repassar para analisarDisponibilidadeReal(). Uso do formato legado
 *   é registrado em log de auditoria para rastreio de migração.
 *
 * @param {Object} payload — contrato canônico: { sala, horaInicio, horaTermino, datas }
 */
function ctrl_reservas_disponibilidade(payload) {
  return GasResponse.wrap(function () {
    if (!payload || typeof payload !== 'object') {
      throw new Error('[ctrl_reservas_disponibilidade] Payload de disponibilidade é obrigatório');
    }

    // ── Adapter de compatibilidade retroativa ────────────────────────────────
    // Normaliza formato legado { espacoId, inicio, fim, data } → canônico
    const sala    = String(payload.sala    || payload.espacoId || '').trim();
    const inicio  = String(payload.horaInicio || payload.inicio || '').trim();
    const termino = String(payload.horaTermino || payload.fim   || '').trim();
    const datas   = payload.datas || (payload.data ? [payload.data] : []);

    const usouFormatoLegado = !payload.sala || !payload.horaInicio || !payload.horaTermino;
    if (usouFormatoLegado) {
      Logger.warn(
        'ctrl_reservas_disponibilidade',
        '[LEGADO] Payload recebido em formato antigo {espacoId/inicio/fim/data}. ' +
        'Migre para {sala, horaInicio, horaTermino, datas}.',
        { payload: JSON.stringify(payload) }
      );
    }

    // ── Hardening: rejeita payload incompleto antes de chegar na engine ──────
    if (!sala)               throw new Error('[ctrl_reservas_disponibilidade] Campo "sala" (ou "espacoId") é obrigatório');
    if (!inicio)             throw new Error('[ctrl_reservas_disponibilidade] Campo "horaInicio" (ou "inicio") é obrigatório');
    if (!termino)            throw new Error('[ctrl_reservas_disponibilidade] Campo "horaTermino" (ou "fim") é obrigatório');
    if (!Array.isArray(datas) || datas.length === 0) {
      throw new Error('[ctrl_reservas_disponibilidade] Campo "datas" (ou "data") é obrigatório e não pode ser vazio');
    }

    // ── Repassa payload normalizado para a engine ────────────────────────────
    return analisarDisponibilidadeReal({
      sala:        sala,
      horaInicio:  inicio,
      horaTermino: termino,
      datas:       datas
    });
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
