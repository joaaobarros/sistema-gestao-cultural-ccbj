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
 * USO:
 *   AuditoriaService.registrar('RESERVATION_CREATED', 'reservas', { id, email });
 *   AuditoriaService.warn('CONFLICT_ATTEMPT', 'reservas', 'Conflito detectado', dados);
 *   AuditoriaService.erro('AUTH_FAILED', 'auth', 'Falha de autenticação', dados);
 *
 * @depends Logger (logger.gs), SystemEvents (event_bus_backend.gs),
 *          registrarLog (utils.gs), EventTypes (events_constants.gs)
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

  return {
    registrar:        registrar,
    warn:             warn,
    erro:             erro,
    registrarAcesso:  registrarAcesso
  };

})();
