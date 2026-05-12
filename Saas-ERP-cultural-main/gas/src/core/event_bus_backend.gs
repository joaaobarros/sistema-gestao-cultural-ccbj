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
 * SCHEMA CANÔNICO DO EVENTO (persistido em EventLog):
 *   Colunas: [id, tipo, origem, entidade, entidade_id, usuario, timestamp, contexto_json]
 *
 * Payload obrigatório de emit():
 *   {
 *     entidade:   string  — ex: 'reserva', 'protocolo_chave'
 *     entidadeId: string  — ID da entidade afetada
 *     usuario:    string  — e-mail do ator (obrigatório; fallback: Session ou 'sistema')
 *     origem:     string  — módulo/função de origem (obrigatório)
 *     contexto:   Object  — dados extras opcionais (payload livre)
 *   }
 *
 * Campos governados (nunca podem ser omitidos sem fallback):
 *   tipo, entidade, entidadeId, usuario, origem, timestamp
 *
 * USO:
 *   SystemEvents.emit(SystemEventTypes.RESERVATION_CREATED, {
 *     entidade:   'reserva',
 *     entidadeId: id,
 *     usuario:    email,
 *     origem:     'ctrl_reservas_criar',
 *     contexto:   { sala, data }
 *   });
 */

var SystemEvents = (function () {

  var ABA_EVENTO_LOG = 'EventLog';

  // Campos obrigatórios validados antes da persistência.
  var CAMPOS_OBRIGATORIOS = ['entidade', 'entidadeId', 'usuario', 'origem'];

  // ────────────────────────────────────────────────────────────────────
  // GOVERNANÇA: normalização e validação de payload
  // ────────────────────────────────────────────────────────────────────

  /**
   * Normaliza o payload de entrada garantindo todos os campos canônicos.
   * Suporta aliases modernos: actor→usuario, module→origem, payload→contexto.
   * Campos críticos ausentes geram console.warn (não bloqueiam — backward-compat).
   *
   * SCHEMA CANÔNICO (todos os campos aceitos):
   *   { entidade, entidadeId, usuario, origem,         — nomes originais
   *     actor,    entityId,   module,  payload, metadata } — aliases modernos
   *
   * @param {string} tipo
   * @param {Object} payload
   * @returns {{ id, tipo, origem, entidade, entidadeId, usuario, timestamp, contexto }}
   */
  function _normalizar(tipo, payload) {
    payload = payload || {};

    // Suporte a aliases modernos (FASE 5 — Governança de Eventos)
    var entidade   = payload.entidade   || payload.entity      || '';
    var entidadeId = payload.entidadeId || payload.entityId    || '';
    var usuario    = payload.usuario    || payload.actor       || _emailAtual();
    var origem     = payload.origem     || payload.module      || _detectarOrigem();
    var contexto   = payload.contexto   || payload.payload     || {};
    if (payload.metadata && typeof payload.metadata === 'object') {
      contexto = Object.assign ? Object.assign({}, contexto, { _meta: payload.metadata }) : contexto;
    }

    // Aviso de governança: campos críticos ausentes registrados no console.
    // Não bloqueiam — mantemos backward-compatibility com emissores existentes.
    if (!entidade) {
      console.warn('[SystemEvents] GOVERNANÇA: evento "' + tipo + '" sem "entidade". Auditoria incompleta.');
    }
    if (!entidadeId) {
      console.warn('[SystemEvents] GOVERNANÇA: evento "' + tipo + '" sem "entidadeId". Rastreabilidade prejudicada.');
    }
    if (!payload.usuario && !payload.actor) {
      console.warn('[SystemEvents] GOVERNANÇA: evento "' + tipo + '" sem "usuario". Usando fallback: ' + usuario);
    }
    if (!payload.origem && !payload.module) {
      console.warn('[SystemEvents] GOVERNANÇA: evento "' + tipo + '" sem "origem". Detecção auto: ' + origem);
    }

    return {
      id:        _gerarIdEvento(),
      tipo:      tipo,
      origem:    origem,
      entidade:  entidade,
      entidadeId:entidadeId,
      usuario:   usuario,
      timestamp: new Date().toISOString(),
      contexto:  JSON.stringify(contexto)
    };
  }

  /**
   * Valida um payload antes de emissão sem persistir.
   * Útil para pré-validação em engines e controllers.
   *
   * @param {string} tipo
   * @param {Object} payload
   * @returns {{ valido: boolean, campos_faltantes: string[], avisos: string[] }}
   */
  function validarSchema(tipo, payload) {
    payload = payload || {};
    var faltando = [];
    var avisos = [];

    if (!tipo) faltando.push('tipo');

    var entidade   = payload.entidade   || payload.entity      || '';
    var entidadeId = payload.entidadeId || payload.entityId    || '';
    var usuario    = payload.usuario    || payload.actor       || '';
    var origem     = payload.origem     || payload.module      || '';

    if (!entidade)   faltando.push('entidade');
    if (!entidadeId) faltando.push('entidadeId');
    if (!usuario)    faltando.push('usuario/actor');
    if (!origem)     avisos.push('origem/module ausente (será detectada automaticamente)');

    var tiposConhecidos = typeof SystemEventTypes !== 'undefined'
      ? Object.values(SystemEventTypes)
      : [];
    if (tiposConhecidos.length > 0 && tipo && tiposConhecidos.indexOf(tipo) < 0) {
      faltando.push('tipo inválido: "' + tipo + '" não está em SystemEventTypes');
    }

    return {
      valido:           faltando.length === 0,
      campos_faltantes: faltando,
      avisos:           avisos
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // EMISSÃO DE EVENTO
  // ────────────────────────────────────────────────────────────────────

  /**
   * Emite um evento de sistema, gravando-o no EventLog.
   *
   * @param {string} tipo    — constante de SystemEventTypes
   * @param {Object} payload — { entidade, entidadeId, usuario, origem, contexto }
   */
  function emit(tipo, payload) {
    if (!tipo) return;

    var evt = _normalizar(tipo, payload);

    try {
      var sheet = _getSheet(ABA_EVENTO_LOG);
      if (!sheet) return;
      sheet.appendRow([
        evt.id, evt.tipo, evt.origem, evt.entidade,
        evt.entidadeId, evt.usuario, evt.timestamp, evt.contexto
      ]);
    } catch (e) {
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
      return linhas.reverse().map(_mapearEvento);
    } catch (e) {
      console.warn('[SystemEvents] getRecentes falhou:', e.message);
      return [];
    }
  }

  /**
   * Retorna eventos de uma entidade específica.
   * @param {string} entidade    — ex: 'reserva', 'protocolo_chave'
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
        .map(_mapearEvento);
    } catch (e) {
      return [];
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // FASE 4 — AUDITORIA DE INTEGRIDADE DO EVENTLOG
  // ────────────────────────────────────────────────────────────────────

  /**
   * Audita integridade do EventLog: detecta payloads incompletos, timestamps inválidos,
   * eventos sem usuário, sem origem, contextos vazios e formatos divergentes.
   *
   * Uso: SystemEvents.validarIntegridade() — executar manualmente ou via trigger de diagnóstico.
   *
   * @returns {Object} relatório com contagens e lista de anomalias
   */
  function validarIntegridade() {
    var relatorio = {
      total:              0,
      semEntidade:        0,
      semEntidadeId:      0,
      semUsuario:         0,
      semOrigem:          0,
      timestampInvalido:  0,
      contextoVazio:      0,
      tipoInvalido:       0,
      anomalias:          []
    };

    try {
      var sheet = _getSheet(ABA_EVENTO_LOG);
      if (!sheet || sheet.getLastRow() < 2) {
        relatorio.anomalias.push({ linha: 0, problema: 'EventLog vazio ou inexistente' });
        return relatorio;
      }

      var dados = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
      relatorio.total = dados.length;

      var tiposConhecidos = typeof SystemEventTypes !== 'undefined'
        ? Object.values(SystemEventTypes)
        : [];

      dados.forEach(function (r, idx) {
        var linha      = idx + 2;
        var id         = String(r[0] || '');
        var tipo       = String(r[1] || '');
        var origem     = String(r[2] || '');
        var entidade   = String(r[3] || '');
        var entidadeId = String(r[4] || '');
        var usuario    = String(r[5] || '');
        var timestamp  = r[6];
        var contexto   = String(r[7] || '');

        if (!entidade)   { relatorio.semEntidade++;   relatorio.anomalias.push({ linha: linha, id: id, problema: 'entidade ausente', tipo: tipo }); }
        if (!entidadeId) { relatorio.semEntidadeId++; relatorio.anomalias.push({ linha: linha, id: id, problema: 'entidadeId ausente', tipo: tipo }); }

        if (!usuario || usuario === 'undefined') {
          relatorio.semUsuario++;
          relatorio.anomalias.push({ linha: linha, id: id, problema: 'usuario ausente', tipo: tipo });
        }

        if (!origem || origem === 'sistema') {
          relatorio.semOrigem++;
          // sem origem é aviso leve — apenas conta, não adiciona à lista de anomalias críticas
        }

        var tsValido = timestamp instanceof Date ? !isNaN(timestamp.getTime()) : false;
        if (!tsValido) {
          relatorio.timestampInvalido++;
          relatorio.anomalias.push({ linha: linha, id: id, problema: 'timestamp inválido: ' + timestamp, tipo: tipo });
        }

        if (!contexto || contexto === '{}' || contexto === '') {
          relatorio.contextoVazio++;
          // contexto vazio é aviso, não anomalia crítica
        }

        if (tiposConhecidos.length > 0 && tipo && tiposConhecidos.indexOf(tipo) < 0) {
          relatorio.tipoInvalido++;
          relatorio.anomalias.push({ linha: linha, id: id, problema: 'tipo desconhecido: ' + tipo, tipo: tipo });
        }
      });

      Logger.info('event_bus_backend', 'validarIntegridade',
        'Total: ' + relatorio.total +
        ' | semEntidade: ' + relatorio.semEntidade +
        ' | semUsuario: '  + relatorio.semUsuario +
        ' | semOrigem: '   + relatorio.semOrigem +
        ' | tsInvalido: '  + relatorio.timestampInvalido
      );
    } catch (e) {
      relatorio.anomalias.push({ linha: 0, problema: 'Erro ao auditar EventLog: ' + e.message });
    }

    return relatorio;
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
      if (!sheet) return;
      sheet.appendRow(['id', 'tipo', 'origem', 'entidade', 'entidade_id', 'usuario', 'timestamp', 'contexto']);
      sheet.getRange(1, 1, 1, 8).setFontWeight('bold');
    } catch (e) {
      console.warn('[SystemEvents] garantirAbaEventLog:', e.message);
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

  function _mapearEvento(r) {
    return {
      id:         r[0],
      tipo:       r[1],
      origem:     r[2],
      entidade:   r[3],
      entidadeId: r[4],
      usuario:    r[5],
      timestamp:  r[6],
      contexto:   _parseContexto(r[7])
    };
  }

  return {
    emit:                  emit,
    validarSchema:         validarSchema,
    getRecentes:           getRecentes,
    getEventosPorEntidade: getEventosPorEntidade,
    validarIntegridade:    validarIntegridade,
    garantirAbaEventLog:   garantirAbaEventLog
  };

})();
