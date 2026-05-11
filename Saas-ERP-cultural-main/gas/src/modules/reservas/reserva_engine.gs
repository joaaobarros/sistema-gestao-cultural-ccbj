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
  PENDENTE:     'pendente',
  CONFIRMADA:   'confirmada',
  CANCELADA:    'cancelada',
  RECUSADA:     'recusada',
  HABILITADA:   'habilitada',
  APROVADA:     'aprovada',
  EM_ANALISE:   'em_analise',
  ENCERRADA:    'encerrada'
};

// Transições de estado permitidas pelo motor
var _TRANSICOES_RESERVA = {
  pendente:   ['confirmada', 'cancelada', 'recusada', 'em_analise'],
  em_analise: ['aprovada', 'recusada', 'cancelada'],
  confirmada: ['cancelada', 'habilitada', 'encerrada'],
  aprovada:   ['cancelada', 'habilitada', 'encerrada'],
  habilitada: ['encerrada', 'cancelada'],
  cancelada:  [],
  recusada:   [],
  encerrada:  []
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
   * Aplica transição de status e emite evento correspondente.
   * @param {string} id - ID da reserva
   * @param {string} statusAtual
   * @param {string} novoStatus
   * @param {string} emailOperador
   * @param {string} [motivo]
   * @throws Error se transição não permitida
   */
  function aplicarTransicao(id, statusAtual, novoStatus, emailOperador, motivo) {
    if (!transicaoPermitida(statusAtual, novoStatus)) {
      throw new Error(
        'Transição de "' + statusAtual + '" para "' + novoStatus + '" não é permitida.'
      );
    }

    var eventoMap = {
      confirmada: 'RESERVATION_APPROVED',
      cancelada:  'RESERVATION_CANCELLED',
      recusada:   'RESERVATION_REJECTED',
      habilitada: 'RESERVATION_APPROVED',
      encerrada:  'RESERVATION_CANCELLED'
    };
    var tipoEvento = eventoMap[novoStatus] || 'RESERVATION_UPDATED';

    try {
      SystemEvents.emit(tipoEvento, {
        reservaId:     id,
        statusAnterior: statusAtual,
        novoStatus:    novoStatus,
        operador:      emailOperador,
        motivo:        motivo || '',
        timestamp:     new Date().toISOString()
      });
    } catch(e) {
      Logger.warn('reserva_engine', 'emit falhou em aplicarTransicao: ' + tipoEvento, e.message);
    }
  }

  // ── Aprovação / Rejeição ──────────────────────────────────

  /**
   * Aprova uma reserva pendente ou em análise.
   * Verifica permissão de admin antes de prosseguir.
   * @param {string} idReserva
   * @param {string} emailAdmin
   * @param {string} [observacao]
   */
  function aprovar(idReserva, emailAdmin, observacao) {
    if (typeof verificarPermissao === 'function') {
      try { verificarPermissao('admin', emailAdmin); } catch(e) {
        throw new Error('Permissão insuficiente para aprovar reservas.');
      }
    }
    aplicarTransicao(idReserva, STATUS_RESERVA.PENDENTE, STATUS_RESERVA.APROVADA, emailAdmin, observacao);
    Logger.info('reserva_engine', 'Reserva aprovada', { id: idReserva, admin: emailAdmin });
  }

  /**
   * Rejeita uma reserva pendente ou em análise.
   * @param {string} idReserva
   * @param {string} emailAdmin
   * @param {string} motivo
   */
  function rejeitar(idReserva, emailAdmin, motivo) {
    if (typeof verificarPermissao === 'function') {
      try { verificarPermissao('admin', emailAdmin); } catch(e) {
        throw new Error('Permissão insuficiente para rejeitar reservas.');
      }
    }
    aplicarTransicao(idReserva, STATUS_RESERVA.PENDENTE, STATUS_RESERVA.RECUSADA, emailAdmin, motivo);
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
