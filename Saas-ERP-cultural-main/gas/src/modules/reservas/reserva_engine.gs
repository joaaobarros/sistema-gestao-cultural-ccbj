/**
 * @file modules/reservas/reserva_engine.gs
 * @layer modules/reservas
 * @description Motor oficial de reservas — núcleo de regras de negócio.
 *
 * Centraliza toda a lógica de alto nível do domínio Reservas:
 *   - Status e transições de estado
 *   - Verificação de conflito (ponto único de entrada)
 *   - Validação temporal e de recursos
 *   - Orquestração de aprovação/cancelamento
 *   - Auditoria de eventos de reserva
 *
 * REGRA ARQUITETURAL:
 *   - Toda verificação de conflito DEVE passar por ReservaEngine.verificarConflito()
 *   - Nenhum módulo externo acessa ReservaRepository diretamente (usar ReservaService)
 *   - Toda transição de status emite um evento via SystemEvents
 *
 * @depends mod_reservas.gs (verificarConflitoEspaco, possuiConflitoReserva,
 *          ReservaRepository, ReservaService, _mensagemConflito),
 *          core/logger.gs, core/event_bus_backend.gs
 */

// ══════════════════════════════════════════════════════════════
// STATUS OFICIAIS DE RESERVA
// Única fonte de verdade para estados de reserva no sistema.
// ══════════════════════════════════════════════════════════════

var STATUS_RESERVA = {
  PENDENTE:     'PENDENTE',
  CONFIRMADA:   'CONFIRMADO',
  CANCELADA:    'CANCELADO',
  RECUSADA:     'RECUSADO',
  HABILITADA:   'HABILITADO',
  APROVADA:     'APROVADO',
  EM_ANALISE:   'EM_ANALISE',
  ENCERRADA:    'ENCERRADO'
};

// Transições de estado permitidas pelo motor
var _TRANSICOES_RESERVA = {
  'PENDENTE':   ['CONFIRMADO', 'CANCELADO', 'RECUSADO', 'EM_ANALISE'],
  'EM_ANALISE': ['APROVADO', 'RECUSADO', 'CANCELADO'],
  'CONFIRMADO': ['CANCELADO', 'HABILITADO', 'ENCERRADO'],
  'APROVADO':   ['CANCELADO', 'HABILITADO', 'ENCERRADO'],
  'HABILITADO': ['ENCERRADO', 'CANCELADO'],
  'CANCELADO':  [],
  'RECUSADO':   [],
  'ENCERRADO':  []
};

// ══════════════════════════════════════════════════════════════
// ReservaEngine — núcleo de orquestração
// ══════════════════════════════════════════════════════════════

var ReservaEngine = (function () {

  // ── Conflito ──────────────────────────────────────────────

  /**
   * Ponto único de entrada para verificação de conflito de horário.
   * Delega para possuiConflitoReserva (motor de baixo nível) e emite
   * evento CONFLICT_ATTEMPT quando um conflito é detectado.
   *
   * @param {Object} params - { espacoId, data, inicio, fim, reservaIgnoradaId, usuarioSolicitante }
   * @returns {{ conflito: boolean, existente?: Object, mensagem?: string }}
   */
  function verificarConflito(params) {
    try {
      var resultado = possuiConflitoReserva({
        data:               params.data,
        espacoId:           params.espacoId,
        inicio:             params.inicio,
        fim:                params.fim,
        reservaIgnoradaId:  params.reservaIgnoradaId,
        usuarioSolicitante: params.usuarioSolicitante
      });
      return resultado || { conflito: false };
    } catch(e) {
      Logger.error('reserva_engine', 'verificarConflito', e.message);
      return { conflito: false };
    }
  }

  /**
   * Verifica conflito e lança Error com mensagem padronizada se houver.
   * Uso: ReservaEngine.assertSemConflito(params) — usado nos controllers.
   */
  function assertSemConflito(params) {
    var resultado = verificarConflito(params);
    if (resultado && resultado.conflito) {
      throw new Error(
        typeof _mensagemConflito === 'function'
          ? _mensagemConflito(resultado)
          : 'Conflito de horário detectado. Verifique a disponibilidade.'
      );
    }
  }

  // ── Validação temporal ────────────────────────────────────

  /**
   * Valida que a reserva tem horário coerente (inicio < fim, data válida).
   * @param {string} data - 'YYYY-MM-DD' ou objeto Date
   * @param {string|number} inicio - hora de início
   * @param {string|number} fim - hora de término
   * @throws Error se inválido
   */
  function validarTemporalidade(data, inicio, fim) {
    if (!data) throw new Error('Data da reserva é obrigatória.');
    var inicioNorm = typeof normalizarHora === 'function' ? normalizarHora(inicio) : Number(inicio);
    var fimNorm    = typeof normalizarHora === 'function' ? normalizarHora(fim)    : Number(fim);
    if (isNaN(inicioNorm) || isNaN(fimNorm)) throw new Error('Horários inválidos.');
    if (inicioNorm >= fimNorm) throw new Error('Horário de início deve ser anterior ao horário de término.');
  }

  // ── Transições de estado ──────────────────────────────────

  /**
   * Verifica se a transição de status é permitida pelo motor.
   * @param {string} statusAtual
   * @param {string} novoStatus
   * @returns {boolean}
   */
  function transicaoPermitida(statusAtual, novoStatus) {
    var permitidas = _TRANSICOES_RESERVA[statusAtual] || [];
    return permitidas.indexOf(novoStatus) !== -1;
  }

  /**
   * Aplica transição de status: valida FSM, persiste e emite evento.
   * @param {string} id - ID da reserva
   * @param {string} statusAtual
   * @param {string} novoStatus
   * @param {string} emailOperador
   * @param {string} [motivo]
   * @throws Error se transição não permitida
   */
  function aplicarTransicao(id, statusAtual, novoStatus, emailOperador, motivo) {
    var atual = String(statusAtual || '').toUpperCase();
    var novo  = String(novoStatus  || '').toUpperCase();

    if (!transicaoPermitida(atual, novo)) {
      throw new Error(
        'Transição de "' + atual + '" para "' + novo + '" não é permitida.'
      );
    }

    // Persiste via repositório (disponível no escopo global GAS)
    if (typeof ReservaRepository !== 'undefined' &&
        typeof ReservaRepository.atualizarStatus === 'function') {
      ReservaRepository.atualizarStatus(id, novo);
    } else {
      Logger.warn('reserva_engine', 'ReservaRepository.atualizarStatus não disponível — status não persistido', { id: id });
    }

    var eventoMap = {
      'CONFIRMADO': 'RESERVATION_APPROVED',
      'APROVADO':   'RESERVATION_APPROVED',
      'CANCELADO':  'RESERVATION_CANCELLED',
      'RECUSADO':   'RESERVATION_REJECTED',
      'HABILITADO': 'RESERVATION_APPROVED',
      'ENCERRADO':  'RESERVATION_CANCELLED'
    };
    var tipoEvento = eventoMap[novo] || 'RESERVATION_UPDATED';

    try {
      SystemEvents.emit(tipoEvento, {
        reservaId:      id,
        statusAnterior: atual,
        novoStatus:     novo,
        operador:       emailOperador,
        motivo:         motivo || '',
        timestamp:      new Date().toISOString()
      });
    } catch(e) {
      Logger.warn('reserva_engine', 'emit falhou em aplicarTransicao: ' + tipoEvento, e.message);
    }

    // Registra transição no serviço de auditoria centralizado
    try {
      if (typeof AuditoriaService !== 'undefined') {
        AuditoriaService.registrar(tipoEvento, 'reserva_engine', {
          reservaId:      id,
          statusAnterior: atual,
          novoStatus:     novo,
          operador:       emailOperador,
          motivo:         motivo || ''
        });
      }
    } catch(e) {}
  }

  // ── Aprovação / Rejeição ──────────────────────────────────

  /**
   * Busca o status atual de uma reserva pelo ID (usa ReservaRepository se disponível).
   * @param {string} idReserva
   * @returns {string} status atual uppercase, ou STATUS_RESERVA.PENDENTE como fallback
   */
  function _obterStatusAtual(idReserva) {
    try {
      if (typeof ReservaRepository !== 'undefined' &&
          typeof ReservaRepository.buscarPorId === 'function') {
        var linha = ReservaRepository.buscarPorId(idReserva);
        if (linha) return String(linha[13] || STATUS_RESERVA.PENDENTE).toUpperCase();
      }
    } catch(e) {
      Logger.warn('reserva_engine', '_obterStatusAtual falhou, usando fallback', e.message);
    }
    return STATUS_RESERVA.PENDENTE;
  }

  /**
   * Aprova uma reserva pendente, em análise ou confirmada.
   * Busca o status atual no repositório antes de aplicar a transição.
   * @param {string} idReserva
   * @param {string} emailAdmin
   * @param {string} [observacao]
   */
  function aprovar(idReserva, emailAdmin, observacao) {
    if (!PermissoesService.isAdmin(emailAdmin)) {
      throw new Error('Permissão insuficiente para aprovar reservas.');
    }
    var statusAtual = _obterStatusAtual(idReserva);
    aplicarTransicao(idReserva, statusAtual, STATUS_RESERVA.APROVADA, emailAdmin, observacao);
    Logger.info('reserva_engine', 'Reserva aprovada', { id: idReserva, admin: emailAdmin });
  }

  /**
   * Rejeita/recusa uma reserva pendente ou em análise.
   * @param {string} idReserva
   * @param {string} emailAdmin
   * @param {string} motivo
   */
  function rejeitar(idReserva, emailAdmin, motivo) {
    if (!PermissoesService.isAdmin(emailAdmin)) {
      throw new Error('Permissão insuficiente para rejeitar reservas.');
    }
    var statusAtual = _obterStatusAtual(idReserva);
    aplicarTransicao(idReserva, statusAtual, STATUS_RESERVA.RECUSADA, emailAdmin, motivo);
    Logger.info('reserva_engine', 'Reserva rejeitada', { id: idReserva, admin: emailAdmin, motivo: motivo });
  }

  // ── API pública ───────────────────────────────────────────

  return {
    verificarConflito:   verificarConflito,
    assertSemConflito:   assertSemConflito,
    validarTemporalidade: validarTemporalidade,
    transicaoPermitida:  transicaoPermitida,
    aplicarTransicao:    aplicarTransicao,
    aprovar:             aprovar,
    rejeitar:            rejeitar,
    STATUS:              STATUS_RESERVA
  };

})();
