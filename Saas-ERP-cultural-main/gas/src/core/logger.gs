/**
 * @file core/logger.gs
 * @layer core
 * @description Logger centralizado do sistema. Interface uniforme para registro
 *              de operações, avisos e erros nos módulos backend.
 *
 * Delega para registrarLog() (utils.gs) e opcionalmente para SystemEvents.
 * Módulos devem usar Logger em vez de chamar registrarLog diretamente.
 *
 * USO:
 *   Logger.info('reservas', 'Reserva criada', { id, email });
 *   Logger.warn('permissoes', 'Acesso negado', { email, modulo });
 *   Logger.error('action_engine', 'Falha ao criar ação', e.message);
 */

var Logger = (function () {

  var NIVEIS = { INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' };

  function _log(nivel, modulo, mensagem, dados) {
    var texto = '[' + nivel + '][' + modulo + '] ' + mensagem;
    if (dados) {
      try { texto += ' | ' + JSON.stringify(dados); } catch (_) {}
    }

    // Grava na aba Logs via registrarLog (utils.gs)
    try {
      var email = '';
      try { email = Session.getActiveUser().getEmail() || ''; } catch (_) {}
      registrarLog(email, modulo, texto);
    } catch (e) {
      console.warn('[Logger] registrarLog indisponível:', e.message);
    }

    // Espelha no console do GAS para Stackdriver
    if (nivel === NIVEIS.ERROR) {
      console.error(texto);
    } else if (nivel === NIVEIS.WARN) {
      console.warn(texto);
    } else {
      console.log(texto);
    }
  }

  return {
    info:  function (modulo, mensagem, dados) { _log(NIVEIS.INFO,  modulo, mensagem, dados); },
    warn:  function (modulo, mensagem, dados) { _log(NIVEIS.WARN,  modulo, mensagem, dados); },
    error: function (modulo, mensagem, dados) { _log(NIVEIS.ERROR, modulo, mensagem, dados); }
  };

})();
