/**
 * @file core/services/auditoria_service.gs
 * @layer core/services
 * @description Façade oficial de auditoria do sistema.
 *
 * Centraliza o registro de eventos de auditoria combinando:
 *   - SystemEvents.emit (event_bus_backend.gs) — para rastreabilidade assíncrona
 *   - Logger.info/warn/error (logger.gs) — para Stackdriver e planilha de logs
 *   - registrarLog (utils.gs) — para LogAcessos na planilha
 *
 * Módulos novos devem usar AuditoriaService em vez de chamar
 * SystemEvents.emit + Logger diretamente em cada ponto.
 *
 * USO GERAL:
 *   AuditoriaService.registrar(SystemEventTypes.RESERVATION_CREATED, 'reservas', { id, email });
 *   AuditoriaService.warn(SystemEventTypes.CONFLICT_ATTEMPT, 'reservas', 'Conflito', dados);
 *   AuditoriaService.erro(SystemEventTypes.AUTH_FAILED, 'auth', 'Falha de auth', dados);
 *
 * USO ESPECIALIZADO (FASE 3 — Observabilidade):
 *   AuditoriaService.registrarFsmViolacao('reservas', 'PENDENTE', 'ENCERRADO', 'user@');
 *   AuditoriaService.registrarFalhaAuth('user@', 'senha_invalida', 'auth_session');
 *   AuditoriaService.registrarMutacaoCritica('chaves', 'PROT-001', 'cancelar', 'user@');
 *
 * @depends Logger (logger.gs), SystemEvents (event_bus_backend.gs),
 *          registrarLog (utils.gs), SystemEventTypes (events_constants.gs)
 */

var AuditoriaService = (function () {

  function _emitirEvento(tipo, modulo, dados) {
    try {
      if (typeof SystemEvents !== 'undefined' && typeof SystemEvents.emit === 'function') {
        SystemEvents.emit(tipo, dados);
      }
    } catch(e) {
      console.warn('[AuditoriaService] emit falhou: ' + tipo + ': ' + e.message);
    }
  }

  /**
   * Registra evento informacional com auditoria completa (Logger + SystemEvents).
   */
  function registrar(tipoEvento, modulo, dados) {
    try {
      Logger.info(modulo, tipoEvento, dados);
    } catch(e) {}
    _emitirEvento(tipoEvento, modulo, dados);
  }

  /**
   * Registra aviso de auditoria.
   */
  function warn(tipoEvento, modulo, mensagem, dados) {
    try {
      Logger.warn(modulo, mensagem, dados);
    } catch(e) {}
    _emitirEvento(tipoEvento, modulo, Object.assign ? Object.assign({ msg: mensagem }, dados || {}) : dados);
  }

  /**
   * Registra erro de auditoria.
   */
  function erro(tipoEvento, modulo, mensagem, dados) {
    try {
      Logger.error(modulo, mensagem, dados);
    } catch(e) {}
    _emitirEvento(tipoEvento, modulo, Object.assign ? Object.assign({ msg: mensagem }, dados || {}) : dados);
  }

  /**
   * Registra acesso de usuário (Login, Logout, SessionStart).
   */
  function registrarAcesso(email, acao, modulo) {
    try {
      Logger.info(modulo || 'auth', acao, { email: email });
      if (typeof registrarLog === 'function') {
        registrarLog(email, modulo || 'auth', acao);
      }
    } catch(e) {
      console.warn('[AuditoriaService.registrarAcesso] ' + e.message);
    }
  }

  // ── FASE 3 — Métodos especializados de observabilidade ────────

  /**
   * Registra tentativa de transição FSM inválida.
   * Emite FSM_INVALID_TRANSITION e loga como warning de governança.
   *
   * @param {string} dominio       — ex: 'reservas', 'chaves'
   * @param {string} estadoAtual   — estado de origem da transição
   * @param {string} estadoTentado — estado de destino rejeitado
   * @param {string} ator          — email do usuário ou 'sistema'
   * @param {string} entidadeId    — ID da entidade afetada
   */
  function registrarFsmViolacao(dominio, estadoAtual, estadoTentado, ator, entidadeId) {
    var dados = {
      dominio:       dominio,
      estadoAtual:   estadoAtual,
      estadoTentado: estadoTentado,
      ator:          ator || 'sistema',
      entidadeId:    entidadeId || ''
    };
    try {
      Logger.warn(dominio, 'FSM_INVALID_TRANSITION',
        estadoAtual + ' → ' + estadoTentado + ' rejeitado', dados);
    } catch(e) {}
    _emitirEvento(SystemEventTypes.FSM_INVALID_TRANSITION, dominio, dados);
  }

  /**
   * Registra falha de autenticação rastreável.
   * Emite AUTH_FAILURE_TRACKED e loga como warning de segurança.
   *
   * @param {string} email   — e-mail que tentou autenticar
   * @param {string} motivo  — ex: 'senha_invalida', 'sessao_expirada', 'usuario_inativo'
   * @param {string} origem  — módulo/função onde a falha ocorreu
   */
  function registrarFalhaAuth(email, motivo, origem) {
    var dados = { email: email, motivo: motivo, origem: origem };
    try {
      Logger.warn('auth', 'AUTH_FAILURE', email + ' | ' + motivo, dados);
    } catch(e) {}
    _emitirEvento(SystemEventTypes.AUTH_FAILURE_TRACKED, 'auth', dados);
  }

  /**
   * Registra mutação crítica de domínio para observabilidade e auditoria forte.
   * Deve ser chamado em qualquer operação que altere status, arquive ou exclua entidades.
   *
   * @param {string} dominio     — ex: 'reservas', 'contratos', 'chaves'
   * @param {string} entidadeId  — ID da entidade mutada
   * @param {string} operacao    — ex: 'cancelar', 'aprovar', 'arquivar', 'excluir'
   * @param {string} ator        — email do responsável pela mutação
   * @param {Object} [contexto]  — dados extras opcionais
   */
  function registrarMutacaoCritica(dominio, entidadeId, operacao, ator, contexto) {
    var dados = Object.assign ? Object.assign(
      { dominio: dominio, entidadeId: entidadeId, operacao: operacao, ator: ator },
      contexto || {}
    ) : { dominio: dominio, entidadeId: entidadeId, operacao: operacao, ator: ator };
    try {
      Logger.warn(dominio, 'MUTATION_CRITICAL',
        operacao + ' em ' + entidadeId + ' por ' + ator, dados);
    } catch(e) {}
    _emitirEvento(SystemEventTypes.MUTATION_CRITICAL, dominio, dados);
  }

  /**
   * Registra evento de governança arquitetural (para uso interno do sistema).
   * Usado pelo FsmGuardian e pelo governance layer para rastrear violações.
   *
   * @param {string} tipo      — SystemEventTypes.GOVERNANCE_VIOLATION ou similar
   * @param {string} descricao — descrição da violação detectada
   * @param {Object} [dados]   — contexto adicional
   */
  function registrarViolacaoArquitetural(tipo, descricao, dados) {
    try {
      Logger.error('governance', tipo, descricao, dados);
    } catch(e) {}
    _emitirEvento(tipo || SystemEventTypes.GOVERNANCE_VIOLATION, 'governance',
      Object.assign ? Object.assign({ descricao: descricao }, dados || {}) : dados);
  }

  return {
    registrar:                   registrar,
    warn:                        warn,
    erro:                        erro,
    registrarAcesso:             registrarAcesso,
    registrarFsmViolacao:        registrarFsmViolacao,
    registrarFalhaAuth:          registrarFalhaAuth,
    registrarMutacaoCritica:     registrarMutacaoCritica,
    registrarViolacaoArquitetural: registrarViolacaoArquitetural
  };

})();
