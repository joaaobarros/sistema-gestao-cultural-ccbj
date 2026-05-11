/**
 * @file core/services/metrics_engine.gs
 * @layer core/services
 * @description Infraestrutura oficial de métricas — ponto único de acesso a todos os indicadores.
 *
 * Categorias de métricas:
 *   OPERACIONAL  — ocupação de salas, reservas, conflitos, cancelamentos
 *   CHAVES       — protocolos, atrasos, devoluções, transferências
 *   USUARIOS     — acessos, novos cadastros, distribuição por setor
 *   AUDITORIA    — eventos registrados, operadores ativos, anomalias
 *   PERFORMANCE  — tempo médio de resposta de processos, taxa de habilitação
 *   INSTITUCIONAL — indicadores macro (CODIP, escuta, financeiro)
 *
 * REGRA ARQUITETURAL:
 *   - Todo dashboard e relatório deve obter dados via MetricsEngine
 *   - Cálculos não devem ser duplicados entre módulos
 *   - MetricsEngine NÃO persiste — apenas lê e agrega
 *
 * @depends mod_metrics.gs (obterMetricasDashboard, obterDadosGraficoReservas),
 *          modules/chaves/mod_chaves.gs (chaves_obterIndicadores),
 *          core/utils.gs (_getSheet), core/logger.gs
 */

// ══════════════════════════════════════════════════════════════════
// Tipos de métricas — enum oficial
// ══════════════════════════════════════════════════════════════════

var METRICA_TIPO = {
  OPERACIONAL:   'OPERACIONAL',
  CHAVES:        'CHAVES',
  USUARIOS:      'USUARIOS',
  AUDITORIA:     'AUDITORIA',
  PERFORMANCE:   'PERFORMANCE',
  INSTITUCIONAL: 'INSTITUCIONAL'
};

// ══════════════════════════════════════════════════════════════════
// MetricsEngine — agregador oficial de indicadores
// ══════════════════════════════════════════════════════════════════

var MetricsEngine = (function () {

  // ── Operacional ───────────────────────────────────────────────

  /**
   * Métricas operacionais de reservas: ocupação, status, conflitos, cancelamentos.
   * Delega para obterMetricasDashboard (mod_metrics.gs) com interface padronizada.
   *
   * @param {Object} filtros - { dataInicio, dataFim, sala, setor }
   * @returns {Object} payload de métricas operacionais
   */
  function operacional(filtros) {
    filtros = filtros || {};
    try {
      var resultado = obterMetricasDashboard(
        filtros.dataInicio || null,
        filtros.dataFim    || null,
        filtros.sala       || null,
        filtros.setor      || null
      );
      resultado._tipo = METRICA_TIPO.OPERACIONAL;
      return resultado;
    } catch(e) {
      Logger.error('metrics_engine', 'operacional', e.message);
      throw new Error('Erro ao calcular métricas operacionais: ' + e.message);
    }
  }

  /**
   * Dados para gráfico de linha de reservas ao longo do tempo.
   * Delega para obterDadosGraficoReservas (mod_metrics.gs).
   *
   * @returns {Object} séries temporais de reservas
   */
  function graficoReservas() {
    try {
      var resultado = obterDadosGraficoReservas();
      resultado._tipo = METRICA_TIPO.OPERACIONAL;
      return resultado;
    } catch(e) {
      Logger.error('metrics_engine', 'graficoReservas', e.message);
      throw new Error('Erro ao calcular gráfico de reservas: ' + e.message);
    }
  }

  // ── Chaves ────────────────────────────────────────────────────

  /**
   * Métricas do domínio de chaves: protocolos ativos, atrasados, tempo médio.
   * Delega para chaves_obterIndicadores (mod_chaves.gs).
   *
   * @param {string} emailAtual
   * @returns {Object} indicadores de chaves
   */
  function chaves(emailAtual) {
    try {
      var resultado = chaves_obterIndicadores(emailAtual || '');
      resultado._tipo = METRICA_TIPO.CHAVES;
      return resultado;
    } catch(e) {
      Logger.error('metrics_engine', 'chaves', e.message);
      throw new Error('Erro ao calcular métricas de chaves: ' + e.message);
    }
  }

  // ── Usuários ──────────────────────────────────────────────────

  /**
   * Métricas de uso por usuários: novos cadastros, acessos, distribuição.
   * @param {Object} filtros - { dataInicio, dataFim }
   * @returns {Object} indicadores de usuários
   */
  function usuarios(filtros) {
    filtros = filtros || {};
    try {
      return _calcularMetricasUsuarios(filtros);
    } catch(e) {
      Logger.error('metrics_engine', 'usuarios', e.message);
      throw new Error('Erro ao calcular métricas de usuários: ' + e.message);
    }
  }

  // ── Auditoria ─────────────────────────────────────────────────

  /**
   * Métricas de auditoria: eventos emitidos, operadores, anomalias.
   * @param {Object} filtros - { dataInicio, dataFim, tipo }
   * @returns {Object} indicadores de auditoria
   */
  function auditoria(filtros) {
    filtros = filtros || {};
    try {
      return _calcularMetricasAuditoria(filtros);
    } catch(e) {
      Logger.error('metrics_engine', 'auditoria', e.message);
      throw new Error('Erro ao calcular métricas de auditoria: ' + e.message);
    }
  }

  // ── Performance ───────────────────────────────────────────────

  /**
   * Métricas de performance de processos: tempo médio de aprovação, taxa de habilitação.
   * @param {Object} filtros - { dataInicio, dataFim }
   * @returns {Object} indicadores de performance
   */
  function performance(filtros) {
    filtros = filtros || {};
    try {
      return _calcularMetricasPerformance(filtros);
    } catch(e) {
      Logger.error('metrics_engine', 'performance', e.message);
      throw new Error('Erro ao calcular métricas de performance: ' + e.message);
    }
  }

  // ── Institucional ─────────────────────────────────────────────

  /**
   * Métricas institucionais macro: CODIP, público, financeiro, escuta.
   * @param {Object} filtros - { dataInicio, dataFim }
   * @returns {Object} indicadores institucionais
   */
  function institucional(filtros) {
    filtros = filtros || {};
    try {
      return _calcularMetricasInstitucionais(filtros);
    } catch(e) {
      Logger.error('metrics_engine', 'institucional', e.message);
      throw new Error('Erro ao calcular métricas institucionais: ' + e.message);
    }
  }

  // ── Consolidado (dashboard) ───────────────────────────────────

  /**
   * Retorna todas as métricas necessárias para o dashboard principal.
   * Agrega OPERACIONAL + CHAVES em uma chamada única.
   *
   * @param {Object} filtros - { dataInicio, dataFim, sala, setor, emailAtual }
   * @returns {Object} payload completo para o dashboard
   */
  function dashboard(filtros) {
    filtros = filtros || {};
    var resultado = { ok: true, timestamp: new Date().toISOString() };

    try {
      resultado.operacional = operacional({
        dataInicio: filtros.dataInicio,
        dataFim:    filtros.dataFim,
        sala:       filtros.sala,
        setor:      filtros.setor
      });
    } catch(e) {
      resultado.operacional = { erro: e.message };
    }

    try {
      resultado.chaves = chaves(filtros.emailAtual || '');
    } catch(e) {
      resultado.chaves = { erro: e.message };
    }

    return resultado;
  }

  // ── Implementações internas ───────────────────────────────────

  function _calcularMetricasUsuarios(filtros) {
    var aba = _getSheet('LogAcessos');
    if (!aba || aba.getLastRow() < 2) return { _tipo: METRICA_TIPO.USUARIOS, total: 0, novos: 0 };

    var dados = aba.getRange(2, 1, aba.getLastRow() - 1, 5).getValues();
    var fi = filtros.dataInicio ? new Date(filtros.dataInicio) : null;
    var ff = filtros.dataFim    ? new Date(filtros.dataFim)    : null;
    if (ff) ff.setHours(23, 59, 59, 999);

    var emails = new Set();
    var emailsNovos = new Set();
    var totalAcessos = 0;

    dados.forEach(function(r) {
      var dt = r[0] instanceof Date ? r[0] : new Date(r[0]);
      if (isNaN(dt.getTime())) return;
      if (fi && dt < fi) return;
      if (ff && dt > ff) return;
      var email = String(r[1] || '').toLowerCase().trim();
      if (!email) return;
      totalAcessos++;
      emails.add(email);
    });

    return {
      _tipo:        METRICA_TIPO.USUARIOS,
      totalAcessos: totalAcessos,
      usuariosUnicos: emails.size
    };
  }

  function _calcularMetricasAuditoria(filtros) {
    var aba = _getSheet('EventLog');
    if (!aba || aba.getLastRow() < 2) return { _tipo: METRICA_TIPO.AUDITORIA, totalEventos: 0 };

    var dados = aba.getRange(2, 1, aba.getLastRow() - 1, 8).getValues();
    var fi = filtros.dataInicio ? new Date(filtros.dataInicio) : null;
    var ff = filtros.dataFim    ? new Date(filtros.dataFim)    : null;
    if (ff) ff.setHours(23, 59, 59, 999);

    var contagemTipo = {};
    var operadores = new Set();
    var total = 0;

    dados.forEach(function(r) {
      var dt = r[6] instanceof Date ? r[6] : new Date(r[6]);
      if (isNaN(dt.getTime())) return;
      if (fi && dt < fi) return;
      if (ff && dt > ff) return;
      total++;
      var tipo = String(r[1] || 'DESCONHECIDO');
      contagemTipo[tipo] = (contagemTipo[tipo] || 0) + 1;
      var op = String(r[5] || '').toLowerCase().trim();
      if (op) operadores.add(op);
    });

    return {
      _tipo:          METRICA_TIPO.AUDITORIA,
      totalEventos:   total,
      operadoresUnicos: operadores.size,
      distribuicaoTipo: contagemTipo
    };
  }

  function _calcularMetricasPerformance(filtros) {
    var aba = _getSheet('Reservas');
    if (!aba || aba.getLastRow() < 2) return { _tipo: METRICA_TIPO.PERFORMANCE };

    var dados = aba.getRange(2, 1, aba.getLastRow() - 1, 16).getValues();
    var fi = filtros.dataInicio ? new Date(filtros.dataInicio) : null;
    var ff = filtros.dataFim    ? new Date(filtros.dataFim)    : null;
    if (ff) ff.setHours(23, 59, 59, 999);

    var confirmadas = 0, habilitadas = 0, canceladas = 0, total = 0;

    dados.forEach(function(r) {
      var dtSol = r[14] instanceof Date ? r[14] : new Date(r[14]);
      if (isNaN(dtSol.getTime())) return;
      if (fi && dtSol < fi) return;
      if (ff && dtSol > ff) return;
      total++;
      var status = String(r[13] || '').toUpperCase();
      if (status === 'CONFIRMADO' || status === 'APROVADO') confirmadas++;
      if (status === 'HABILITADO') habilitadas++;
      if (status === 'CANCELADO')  canceladas++;
    });

    return {
      _tipo:          METRICA_TIPO.PERFORMANCE,
      totalReservas:  total,
      confirmadas:    confirmadas,
      habilitadas:    habilitadas,
      canceladas:     canceladas,
      taxaHabilitacao: total > 0 ? Math.round(habilitadas / total * 1000) / 10 : 0,
      taxaCancelamento: total > 0 ? Math.round(canceladas / total * 1000) / 10 : 0
    };
  }

  function _calcularMetricasInstitucionais(filtros) {
    try {
      var codip = typeof obterMetricasCODIP === 'function' ? obterMetricasCODIP() : null;
      return {
        _tipo: METRICA_TIPO.INSTITUCIONAL,
        codip: codip
      };
    } catch(e) {
      return { _tipo: METRICA_TIPO.INSTITUCIONAL, erro: e.message };
    }
  }

  // ── API pública ───────────────────────────────────────────────

  return {
    operacional:   operacional,
    graficoReservas: graficoReservas,
    chaves:        chaves,
    usuarios:      usuarios,
    auditoria:     auditoria,
    performance:   performance,
    institucional: institucional,
    dashboard:     dashboard,
    TIPO:          METRICA_TIPO
  };

})();
