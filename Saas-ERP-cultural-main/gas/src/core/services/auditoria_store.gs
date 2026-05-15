/**
 * @file core/services/auditoria_store.gs
 * @layer core/services
 * @description Persistência estruturada de eventos de auditoria operacional.
 *
 * Problema resolvido: AuditoriaService.registrar() chamava Logger.info() que NÃO
 * persiste na planilha (só WARN/ERROR persistem). Eventos críticos como ROLE_UPDATED,
 * RESERVATION_APPROVED, ACCESS_DENIED se perdiam no Stackdriver/console.
 *
 * Esta camada mantém auditoria_operacional.json no Drive com eventos classificados
 * por categoria, módulo, usuário e severidade — separado do Logger (aba Logs) e
 * do LogAcessos (registra logins).
 *
 * Schema do evento:
 *   id           — AUD_{timestamp}_{random6}
 *   timestamp    — ISO 8601
 *   categoria    — 'CRITICO' | 'OPERACIONAL'
 *   tipo         — constante SystemEventTypes
 *   modulo       — módulo de origem (ex: 'reservas', 'permissoes')
 *   acao         — ação executada (ex: 'criar', 'aprovar', 'excluir')
 *   entidadeId   — ID da entidade afetada
 *   entidadeTipo — tipo da entidade (ex: 'reserva', 'usuario')
 *   usuario      — email do ator (lowercase)
 *   resultado    — 'sucesso' | 'falha'
 *   mensagem     — descrição legível do evento
 *   antes        — snapshot do estado anterior (JSON, opcional)
 *   depois       — snapshot do estado posterior (JSON, opcional)
 *   contexto     — dados extras (IP, sessão, motivo, etc.)
 *
 * Categorias:
 *   CRITICO    — login, permissões, exclusões, aprovações, falhas auth, mudanças estruturais
 *   OPERACIONAL — mudanças de status, conclusões, movimentações de fluxo
 *   (eventos DEBUG nunca persistem — apenas Stackdriver/console via Logger)
 *
 * Limites: 2000 eventos (FIFO — mais recentes preservados)
 *
 * @depends DataLayer.gs (readJSON, writeJSON, modifyJSON)
 */

var AuditoriaStore = (function () {

  var _FILE = 'auditoria_operacional.json';
  var _MAX  = 2000;

  // Tipos que merecem categoria CRITICO — todos os demais são OPERACIONAL
  var _TIPOS_CRITICOS = {
    AUTH_FAILED: 1,              AUTH_FAILURE_TRACKED: 1,
    ACCESS_DENIED: 1,            ROLE_UPDATED: 1,
    PERMISSION_GRANTED: 1,       PERMISSION_REVOKED: 1,
    RESERVATION_APPROVED: 1,     RESERVATION_REJECTED: 1,
    RESERVATION_CANCELLED: 1,    CONTRACT_ARCHIVED: 1,
    FSM_INVALID_TRANSITION: 1,   FSM_BYPASS_DETECTED: 1,
    FSM_STATE_UNKNOWN: 1,        GOVERNANCE_VIOLATION: 1,
    ARCHITECTURAL_REGRESSION: 1, MUTATION_CRITICAL: 1,
    MODULE_ACTIVATED: 1,         MODULE_DEACTIVATED: 1,
    USER_CREATED: 1,             USER_UPDATED: 1,
    SESSION_STARTED: 1,          SYSTEM_ERROR: 1,
    ACTION_APPROVED: 1,          ACTION_ARCHIVED: 1,
    QUALIFICATION_APPROVED: 1,   QUALIFICATION_REJECTED: 1,
    QUALIFICATION_SUSPENDED: 1,  KEY_PROTOCOL_DELAYED: 1
  };

  function _categorizar(tipo) {
    return _TIPOS_CRITICOS[tipo] ? 'CRITICO' : 'OPERACIONAL';
  }

  function _gerarId() {
    return 'AUD_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  // ─────────────────────────────────────────────────────────────
  // ESCRITA
  // ─────────────────────────────────────────────────────────────

  /**
   * Registra um evento de auditoria de forma estruturada.
   * Falha silenciosa — nunca interrompe o fluxo principal.
   *
   * @param {Object} entrada
   *   @param {string}  entrada.tipo          — constante SystemEventTypes
   *   @param {string}  [entrada.modulo]      — módulo de origem
   *   @param {string}  [entrada.acao]        — ação executada
   *   @param {string}  [entrada.entidadeId]  — ID da entidade
   *   @param {string}  [entrada.entidadeTipo]— tipo da entidade
   *   @param {string}  [entrada.usuario]     — email do ator
   *   @param {string}  [entrada.resultado]   — 'sucesso' | 'falha'
   *   @param {string}  [entrada.mensagem]    — descrição legível
   *   @param {*}       [entrada.antes]       — snapshot anterior
   *   @param {*}       [entrada.depois]      — snapshot posterior
   *   @param {Object}  [entrada.contexto]    — dados extras
   *   @param {string}  [entrada.categoria]   — override de categoria
   */
  function registrar(entrada) {
    if (!entrada || !entrada.tipo) return;

    var evento = {
      id:           _gerarId(),
      timestamp:    new Date().toISOString(),
      categoria:    entrada.categoria || _categorizar(entrada.tipo),
      tipo:         entrada.tipo,
      modulo:       String(entrada.modulo       || 'sistema'),
      acao:         String(entrada.acao         || ''),
      entidadeId:   String(entrada.entidadeId   || ''),
      entidadeTipo: String(entrada.entidadeTipo || ''),
      usuario:      String(entrada.usuario      || '').toLowerCase().trim(),
      resultado:    String(entrada.resultado    || 'sucesso'),
      mensagem:     String(entrada.mensagem     || ''),
      antes:        entrada.antes   || null,
      depois:       entrada.depois  || null,
      contexto:     entrada.contexto || null
    };

    try {
      modifyJSON(_FILE, function (lista) {
        if (!Array.isArray(lista)) lista = [];
        lista.unshift(evento);
        if (lista.length > _MAX) lista = lista.slice(0, _MAX);
        return lista;
      });
    } catch (e) {
      console.warn('[AuditoriaStore] Falha ao persistir evento ' + entrada.tipo + ': ' + e.message);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // LEITURA / CONSULTA
  // ─────────────────────────────────────────────────────────────

  /**
   * Consulta eventos com filtros opcionais. Retorna sempre um array.
   *
   * @param {Object} [filtros]
   *   @param {string}  [filtros.categoria]  — 'CRITICO' | 'OPERACIONAL'
   *   @param {string}  [filtros.modulo]     — filtro exato de módulo
   *   @param {string}  [filtros.usuario]    — filtro parcial de email
   *   @param {string}  [filtros.tipo]       — filtro exato de tipo
   *   @param {string}  [filtros.resultado]  — 'sucesso' | 'falha'
   *   @param {string}  [filtros.busca]      — busca textual em múltiplos campos
   *   @param {string}  [filtros.de]         — ISO — eventos >= de
   *   @param {string}  [filtros.ate]        — ISO — eventos <= ate
   *   @param {number}  [filtros.limite]     — máximo de resultados (default 500)
   * @returns {Array}
   */
  function consultar(filtros) {
    try {
      var lista = readJSON(_FILE);
      if (!Array.isArray(lista)) return [];
      filtros = filtros || {};

      var resultado = lista.filter(function (ev) {
        if (filtros.categoria && ev.categoria !== filtros.categoria) return false;
        if (filtros.modulo    && ev.modulo    !== filtros.modulo)    return false;
        if (filtros.tipo      && ev.tipo      !== filtros.tipo)      return false;
        if (filtros.resultado && ev.resultado !== filtros.resultado) return false;

        if (filtros.usuario) {
          var uq = String(filtros.usuario).toLowerCase();
          if (!ev.usuario || ev.usuario.indexOf(uq) === -1) return false;
        }

        if (filtros.busca) {
          var q   = String(filtros.busca).toLowerCase();
          var txt = [
            ev.mensagem, ev.usuario, ev.entidadeId,
            ev.acao, ev.modulo, ev.tipo
          ].join(' ').toLowerCase();
          if (txt.indexOf(q) === -1) return false;
        }

        if (filtros.de  && ev.timestamp < filtros.de)  return false;
        if (filtros.ate && ev.timestamp > filtros.ate) return false;
        return true;
      });

      return resultado.slice(0, filtros.limite || 500);
    } catch (e) {
      console.warn('[AuditoriaStore.consultar] ' + e.message);
      return [];
    }
  }

  // ─────────────────────────────────────────────────────────────
  // ESTATÍSTICAS
  // ─────────────────────────────────────────────────────────────

  /**
   * Retorna estatísticas agregadas dos eventos persistidos.
   * @returns {Object} { total, criticos, operacionais, falhas, por_modulo, por_usuario, por_tipo }
   */
  function obterEstatisticas() {
    var vazio = { total: 0, criticos: 0, operacionais: 0, falhas: 0,
                  por_modulo: {}, por_usuario: {}, por_tipo: {} };
    try {
      var lista = readJSON(_FILE);
      if (!Array.isArray(lista) || !lista.length) return vazio;

      var stats = JSON.parse(JSON.stringify(vazio));
      stats.total = lista.length;

      lista.forEach(function (ev) {
        if (ev.categoria === 'CRITICO') stats.criticos++;
        else stats.operacionais++;
        if (ev.resultado === 'falha') stats.falhas++;

        stats.por_modulo[ev.modulo] = (stats.por_modulo[ev.modulo] || 0) + 1;
        if (ev.usuario) {
          stats.por_usuario[ev.usuario] = (stats.por_usuario[ev.usuario] || 0) + 1;
        }
        stats.por_tipo[ev.tipo] = (stats.por_tipo[ev.tipo] || 0) + 1;
      });

      return stats;
    } catch (e) {
      return vazio;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // UTILITÁRIO — módulos disponíveis para filtro
  // ─────────────────────────────────────────────────────────────

  /**
   * Retorna lista de módulos que possuem eventos registrados (para filtros de UI).
   * @returns {string[]}
   */
  function obterModulosAtivos() {
    try {
      var lista = readJSON(_FILE);
      if (!Array.isArray(lista)) return [];
      var set = {};
      lista.forEach(function (ev) { if (ev.modulo) set[ev.modulo] = true; });
      return Object.keys(set).sort();
    } catch (e) {
      return [];
    }
  }

  return {
    registrar:         registrar,
    consultar:         consultar,
    obterEstatisticas: obterEstatisticas,
    obterModulosAtivos: obterModulosAtivos
  };

})();
