/**
 * @file core/event_bus_backend.gs
 * @layer core
 * @description Sistema de eventos do backend. Emite, registra e consulta eventos
 *              operacionais, institucionais e de sistema.
 *
 * Princípio: módulos NÃO devem depender diretamente entre si.
 * Integrações ocorrem via eventos rastreáveis e via Action Engine.
 *
 * Referência: docs/01_architecture/event_model.md
 *
 * USO:
 *   SystemEvents.emit(SystemEventTypes.RESERVATION_CREATED, {
 *     entidade: 'reserva',
 *     entidadeId: id,
 *     usuario: email,
 *     contexto: { sala, data }
 *   });
 *
 * ESTRUTURA DO EVENTO (gravado em EventLog):
 *   [id, tipo, origem, entidade, entidade_id, usuario, timestamp, contexto_json]
 */

var SystemEvents = (function () {

  var ABA_EVENTO_LOG = 'EventLog';

  // ────────────────────────────────────────────────────────────────────
  // EMISSÃO DE EVENTO
  // ────────────────────────────────────────────────────────────────────

  /**
   * Emite um evento de sistema, gravando-o no EventLog.
   *
   * @param {string} tipo        — uma das constantes em SystemEventTypes
   * @param {Object} payload     — { entidade, entidadeId, usuario, origem, contexto }
   */
  function emit(tipo, payload) {
    if (!tipo) return;

    payload = payload || {};

    var id        = _gerarIdEvento();
    var origem    = payload.origem    || _detectarOrigem();
    var entidade  = payload.entidade  || '';
    var entIdade  = payload.entidadeId || '';
    var usuario   = payload.usuario   || _emailAtual();
    var timestamp = new Date().toISOString();
    var contexto  = JSON.stringify(payload.contexto || {});

    try {
      var sheet = _getSheet(ABA_EVENTO_LOG);
      if (!sheet) return;
      sheet.appendRow([id, tipo, origem, entidade, entIdade, usuario, timestamp, contexto]);
    } catch (e) {
      // Falha silenciosa: logging não deve interromper operação
      console.warn('[SystemEvents] emit falhou para ' + tipo + ':', e.message);
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // CONSULTA
  // ────────────────────────────────────────────────────────────────────

  /**
   * Retorna os últimos N eventos do EventLog.
   * @param {number} n — quantidade (padrão 50)
   * @returns {Array<Object>}
   */
  function getRecentes(n) {
    n = n || 50;
    try {
      var sheet = _getSheet(ABA_EVENTO_LOG);
      if (!sheet || sheet.getLastRow() < 2) return [];
      var ultima = sheet.getLastRow();
      var inicio = Math.max(2, ultima - n + 1);
      var linhas = sheet.getRange(inicio, 1, ultima - inicio + 1, 8).getValues();
      return linhas.reverse().map(function (r) {
        return {
          id:        r[0],
          tipo:      r[1],
          origem:    r[2],
          entidade:  r[3],
          entidadeId:r[4],
          usuario:   r[5],
          timestamp: r[6],
          contexto:  _parseContexto(r[7])
        };
      });
    } catch (e) {
      console.warn('[SystemEvents] getRecentes falhou:', e.message);
      return [];
    }
  }

  /**
   * Retorna eventos de uma entidade específica.
   * @param {string} entidade    — ex: 'acao', 'reserva'
   * @param {string} entidadeId  — ID da entidade
   * @returns {Array<Object>}
   */
  function getEventosPorEntidade(entidade, entidadeId) {
    try {
      var sheet = _getSheet(ABA_EVENTO_LOG);
      if (!sheet || sheet.getLastRow() < 2) return [];
      var dados = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
      return dados
        .filter(function (r) { return r[3] === entidade && String(r[4]) === String(entidadeId); })
        .map(function (r) {
          return {
            id: r[0], tipo: r[1], origem: r[2],
            entidade: r[3], entidadeId: r[4],
            usuario: r[5], timestamp: r[6],
            contexto: _parseContexto(r[7])
          };
        });
    } catch (e) {
      return [];
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // PRIVADOS
  // ────────────────────────────────────────────────────────────────────

  function _gerarIdEvento() {
    return 'evt_' + new Date().getTime() + '_' + Math.random().toString(36).slice(2, 7);
  }

  function _emailAtual() {
    try { return Session.getActiveUser().getEmail() || 'sistema'; } catch (e) { return 'sistema'; }
  }

  function _detectarOrigem() {
    // Tenta inferir o módulo a partir da call stack (melhor esforço)
    try {
      throw new Error();
    } catch (e) {
      var stack = (e.stack || '').split('\n');
      for (var i = 0; i < stack.length; i++) {
        var linha = stack[i];
        if (linha && linha.indexOf('event_bus_backend') < 0 && linha.indexOf('at emit') < 0) {
          var match = linha.match(/at\s+(\w+)/);
          if (match) return match[1];
        }
      }
    }
    return 'sistema';
  }

  function _parseContexto(raw) {
    if (!raw) return {};
    try { return JSON.parse(raw); } catch (e) { return { raw: raw }; }
  }

  // ────────────────────────────────────────────────────────────────────
  // SETUP DA ABA EventLog
  // ────────────────────────────────────────────────────────────────────

  /**
   * Garante que a aba EventLog existe na planilha MASTER com cabeçalhos corretos.
   * Chamado por setup.gs durante inicialização.
   */
  function garantirAbaEventLog() {
    try {
      var sheet = _getSheet(ABA_EVENTO_LOG);
      if (sheet && sheet.getLastRow() >= 1) return;
      if (!sheet) {
        // Se _getSheet retornou null, tenta criar via SpreadsheetApp diretamente
        return;
      }
      sheet.appendRow(['id', 'tipo', 'origem', 'entidade', 'entidade_id', 'usuario', 'timestamp', 'contexto']);
      sheet.getRange(1, 1, 1, 8).setFontWeight('bold');
    } catch (e) {
      console.warn('[SystemEvents] garantirAbaEventLog:', e.message);
    }
  }

  return {
    emit:                 emit,
    getRecentes:          getRecentes,
    getEventosPorEntidade:getEventosPorEntidade,
    garantirAbaEventLog:  garantirAbaEventLog
  };

})();
