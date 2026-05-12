/**
 * @file core/services/fsm_guardian.gs
 * @layer core/services
 * @description Enforcement centralizado de Máquinas de Estado Finito (FSM).
 *
 * O FsmGuardian é o árbitro único de todas as transições de estado do sistema.
 * Todo engine com FSM deve registrar sua máquina de estados aqui e delegar
 * a validação de transições antes de persistir qualquer mudança de status.
 *
 * PRINCÍPIO:
 *   Nenhum domínio crítico pode mutar status arbitrariamente.
 *   Toda transição DEVE ser validada pelo FsmGuardian antes de ocorrer.
 *
 * DOMÍNIOS REGISTRADOS:
 *   - reservas     → STATUS_RESERVA / _TRANSICOES_RESERVA (reserva_engine.gs)
 *   - chaves       → CHV_STATUS_PROTOCOLO / _TRANSICOES_CHAVE (chave_engine.gs)
 *   - habilitacoes → STATUS_HABILITACAO / _TRANSICOES_HAB (habilitacoes_engine.gs)
 *   - acoes        → STATUS_ACAO / _TRANSICOES_ACAO (action_engine.gs)
 *   - contratos    → STATUS_CONTRATO / _TRANSICOES_CONTRATO (contratos_engine.gs)
 *
 * USO:
 *   // Registrar FSM de um domínio (feito no engine na inicialização):
 *   FsmGuardian.registrar('reservas', _TRANSICOES_RESERVA);
 *
 *   // Validar antes de aplicar transição:
 *   FsmGuardian.validar('reservas', 'PENDENTE', 'CONFIRMADO');  // → true
 *   FsmGuardian.validar('reservas', 'CANCELADO', 'PENDENTE');   // → false + evento
 *
 *   // Assertar (lança exceção se inválida):
 *   FsmGuardian.assertValida('reservas', estadoAtual, novoStatus, entidadeId, ator);
 *
 * @depends SystemEventTypes (events_constants.gs), AuditoriaService (auditoria_service.gs),
 *          Logger (logger.gs)
 */

var FsmGuardian = (function () {

  // Registro central de FSMs: { dominio → { estadoOrigem: [estadosDestino] } }
  var _fsms = {};

  // ─── Registro ─────────────────────────────────────────────────────────────

  /**
   * Registra (ou substitui) a FSM de um domínio.
   * Deve ser chamado no topo do *_engine.gs correspondente.
   *
   * @param {string} dominio     — identificador único do domínio (ex: 'reservas')
   * @param {Object} transicoes  — mapa { estadoOrigem: [estadosDestino] }
   */
  function registrar(dominio, transicoes) {
    if (!dominio || !transicoes || typeof transicoes !== 'object') {
      Logger.warn('fsm_guardian', 'registrar', 'Domínio ou transições inválidos: ' + dominio);
      return;
    }
    _fsms[dominio] = transicoes;
  }

  // ─── Validação ────────────────────────────────────────────────────────────

  /**
   * Verifica se uma transição é válida para o domínio informado.
   * Não lança exceção — retorna boolean e emite evento de violação se inválida.
   *
   * @param {string} dominio      — domínio registrado
   * @param {string} estadoAtual  — estado de origem
   * @param {string} novoStatus   — estado de destino
   * @param {string} [ator]       — e-mail do responsável (para auditoria)
   * @param {string} [entidadeId] — ID da entidade (para auditoria)
   * @returns {boolean} true se a transição é permitida
   */
  function validar(dominio, estadoAtual, novoStatus, ator, entidadeId) {
    var resultado = _checarTransicao(dominio, estadoAtual, novoStatus);
    if (!resultado.valida) {
      _registrarViolacao(dominio, estadoAtual, novoStatus, resultado.motivo, ator, entidadeId);
    }
    return resultado.valida;
  }

  /**
   * Garante que a transição é válida — lança Error se não for.
   * Use este método antes de persistir qualquer mudança de status em engines.
   *
   * @param {string} dominio
   * @param {string} estadoAtual
   * @param {string} novoStatus
   * @param {string} [entidadeId]
   * @param {string} [ator]
   * @throws {Error} se a transição for inválida segundo a FSM do domínio
   */
  function assertValida(dominio, estadoAtual, novoStatus, entidadeId, ator) {
    var resultado = _checarTransicao(dominio, estadoAtual, novoStatus);
    if (!resultado.valida) {
      _registrarViolacao(dominio, estadoAtual, novoStatus, resultado.motivo, ator, entidadeId);
      throw new Error(
        '[FsmGuardian] Transição inválida em "' + dominio + '": ' +
        estadoAtual + ' → ' + novoStatus + '. ' + resultado.motivo
      );
    }
  }

  /**
   * Lista os estados de destino válidos a partir de um estado de origem.
   *
   * @param {string} dominio
   * @param {string} estadoAtual
   * @returns {string[]} lista de transições permitidas (vazia se nenhuma ou estado inválido)
   */
  function transicoesPermitidas(dominio, estadoAtual) {
    var fsm = _fsms[dominio];
    if (!fsm) return [];
    return fsm[estadoAtual] || [];
  }

  /**
   * Lista todos os domínios registrados.
   * @returns {string[]}
   */
  function dominiosRegistrados() {
    return Object.keys(_fsms);
  }

  /**
   * Retorna o mapa de transições de um domínio (readonly).
   * @param {string} dominio
   * @returns {Object|null}
   */
  function obterFsm(dominio) {
    return _fsms[dominio] || null;
  }

  // ─── Internos ─────────────────────────────────────────────────────────────

  function _checarTransicao(dominio, estadoAtual, novoStatus) {
    var fsm = _fsms[dominio];

    if (!fsm) {
      return {
        valida: false,
        motivo: 'Domínio "' + dominio + '" não registrado no FsmGuardian.'
      };
    }

    if (!fsm.hasOwnProperty(estadoAtual)) {
      return {
        valida: false,
        motivo: 'Estado de origem "' + estadoAtual + '" desconhecido na FSM de "' + dominio + '".'
      };
    }

    var permitidas = fsm[estadoAtual] || [];
    if (permitidas.indexOf(novoStatus) === -1) {
      var listaPermitidas = permitidas.length > 0
        ? permitidas.join(', ')
        : '(nenhuma — estado terminal)';
      return {
        valida: false,
        motivo: 'Transição ' + estadoAtual + ' → ' + novoStatus +
          ' não permitida. Válidas: ' + listaPermitidas
      };
    }

    return { valida: true, motivo: '' };
  }

  function _registrarViolacao(dominio, estadoAtual, novoStatus, motivo, ator, entidadeId) {
    try {
      Logger.warn('fsm_guardian', 'FSM_INVALID_TRANSITION',
        dominio + ': ' + estadoAtual + ' → ' + novoStatus, { motivo: motivo });
    } catch(e) {}

    try {
      if (typeof AuditoriaService !== 'undefined' &&
          typeof AuditoriaService.registrarFsmViolacao === 'function') {
        AuditoriaService.registrarFsmViolacao(
          dominio, estadoAtual, novoStatus, ator || 'sistema', entidadeId || ''
        );
      }
    } catch(e) {
      console.warn('[FsmGuardian] AuditoriaService indisponível: ' + e.message);
    }
  }

  // ─── API pública ──────────────────────────────────────────────────────────

  return {
    registrar:             registrar,
    validar:               validar,
    assertValida:          assertValida,
    transicoesPermitidas:  transicoesPermitidas,
    dominiosRegistrados:   dominiosRegistrados,
    obterFsm:              obterFsm
  };

})();
