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
  INSTITUCIONAL: 'INSTITUCIONAL',
  FSM:           'FSM',
  SEGURANCA:     'SEGURANCA',
  GOVERNANCA:    'GOVERNANCA'
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
      var resultado = _calcularDashboard(
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
   */
  function graficoReservas() {
    try {
      var resultado = _calcularGraficoReservas();
      resultado._tipo = METRICA_TIPO.OPERACIONAL;
      return resultado;
    } catch(e) {
      Logger.error('metrics_engine', 'graficoReservas', e.message);
      throw new Error('Erro ao calcular gráfico de reservas: ' + e.message);
    }
  }

  function obterDashboard(dataInicio, dataFim, filtroSala, filtroSetor) {
    return _calcularDashboard(dataInicio || null, dataFim || null, filtroSala || null, filtroSetor || null);
  }

  function obterGraficoReservas() {
    return _calcularGraficoReservas();
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

  // ── FSM ───────────────────────────────────────────────────────

  /**
   * Métricas de violações de FSM: transições inválidas por domínio.
   * Lê EventLog filtrando por tipo FSM_INVALID_TRANSITION.
   *
   * @param {Object} filtros - { dataInicio, dataFim }
   * @returns {Object} indicadores de saúde das FSMs
   */
  function fsm(filtros) {
    filtros = filtros || {};
    try {
      return _calcularMetricasFsm(filtros);
    } catch(e) {
      Logger.error('metrics_engine', 'fsm', e.message);
      return { _tipo: METRICA_TIPO.FSM, erro: e.message };
    }
  }

  /**
   * Métricas de segurança: falhas de autenticação, acessos negados.
   * Lê EventLog filtrando por tipos AUTH_FAILED e AUTH_FAILURE_TRACKED.
   *
   * @param {Object} filtros - { dataInicio, dataFim }
   * @returns {Object} indicadores de segurança
   */
  function seguranca(filtros) {
    filtros = filtros || {};
    try {
      return _calcularMetricasSeguranca(filtros);
    } catch(e) {
      Logger.error('metrics_engine', 'seguranca', e.message);
      return { _tipo: METRICA_TIPO.SEGURANCA, erro: e.message };
    }
  }

  /**
   * Métricas de governança: violações arquiteturais registradas.
   * Lê EventLog filtrando por tipos GOVERNANCE_VIOLATION e FSM_BYPASS_DETECTED.
   *
   * @param {Object} filtros - { dataInicio, dataFim }
   * @returns {Object} indicadores de conformidade arquitetural
   */
  function governanca(filtros) {
    filtros = filtros || {};
    try {
      return _calcularMetricasGovernanca(filtros);
    } catch(e) {
      Logger.error('metrics_engine', 'governanca', e.message);
      return { _tipo: METRICA_TIPO.GOVERNANCA, erro: e.message };
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

  function _calcularMetricasFsm(filtros) {
    var aba = _getSheet('EventLog');
    if (!aba || aba.getLastRow() < 2) return { _tipo: METRICA_TIPO.FSM, totalViolacoes: 0 };

    var dados = aba.getRange(2, 1, aba.getLastRow() - 1, 8).getValues();
    var fi = filtros.dataInicio ? new Date(filtros.dataInicio) : null;
    var ff = filtros.dataFim    ? new Date(filtros.dataFim)    : null;
    if (ff) ff.setHours(23, 59, 59, 999);

    var totalViolacoes = 0;
    var porDominio = {};
    var tiposViolacao = {};

    dados.forEach(function(r) {
      var tipo = String(r[1] || '');
      if (tipo !== 'FSM_INVALID_TRANSITION' && tipo !== 'FSM_BYPASS_DETECTED' && tipo !== 'FSM_STATE_UNKNOWN') return;
      var dt = r[6] instanceof Date ? r[6] : new Date(r[6]);
      if (isNaN(dt.getTime())) return;
      if (fi && dt < fi) return;
      if (ff && dt > ff) return;
      totalViolacoes++;
      var dominio = String(r[2] || 'desconhecido');
      porDominio[dominio] = (porDominio[dominio] || 0) + 1;
      tiposViolacao[tipo] = (tiposViolacao[tipo] || 0) + 1;
    });

    return {
      _tipo:          METRICA_TIPO.FSM,
      totalViolacoes: totalViolacoes,
      porDominio:     porDominio,
      tiposViolacao:  tiposViolacao,
      saudavel:       totalViolacoes === 0
    };
  }

  function _calcularMetricasSeguranca(filtros) {
    var aba = _getSheet('EventLog');
    if (!aba || aba.getLastRow() < 2) return { _tipo: METRICA_TIPO.SEGURANCA, totalFalhas: 0 };

    var dados = aba.getRange(2, 1, aba.getLastRow() - 1, 8).getValues();
    var fi = filtros.dataInicio ? new Date(filtros.dataInicio) : null;
    var ff = filtros.dataFim    ? new Date(filtros.dataFim)    : null;
    if (ff) ff.setHours(23, 59, 59, 999);

    var totalFalhas = 0;
    var falhasPorEmail = {};
    var motivos = {};

    dados.forEach(function(r) {
      var tipo = String(r[1] || '');
      if (tipo !== 'AUTH_FAILED' && tipo !== 'AUTH_FAILURE_TRACKED' && tipo !== 'ACCESS_DENIED') return;
      var dt = r[6] instanceof Date ? r[6] : new Date(r[6]);
      if (isNaN(dt.getTime())) return;
      if (fi && dt < fi) return;
      if (ff && dt > ff) return;
      totalFalhas++;
      var usuario = String(r[5] || 'desconhecido').toLowerCase().trim();
      falhasPorEmail[usuario] = (falhasPorEmail[usuario] || 0) + 1;
      motivos[tipo] = (motivos[tipo] || 0) + 1;
    });

    return {
      _tipo:          METRICA_TIPO.SEGURANCA,
      totalFalhas:    totalFalhas,
      usuariosAfetados: Object.keys(falhasPorEmail).length,
      falhasPorEmail: falhasPorEmail,
      motivos:        motivos
    };
  }

  function _calcularMetricasGovernanca(filtros) {
    var aba = _getSheet('EventLog');
    if (!aba || aba.getLastRow() < 2) return { _tipo: METRICA_TIPO.GOVERNANCA, totalViolacoes: 0 };

    var dados = aba.getRange(2, 1, aba.getLastRow() - 1, 8).getValues();
    var fi = filtros.dataInicio ? new Date(filtros.dataInicio) : null;
    var ff = filtros.dataFim    ? new Date(filtros.dataFim)    : null;
    if (ff) ff.setHours(23, 59, 59, 999);

    var totalViolacoes = 0;
    var porTipo = {};

    dados.forEach(function(r) {
      var tipo = String(r[1] || '');
      if (tipo.indexOf('GOVERNANCE') === -1 && tipo.indexOf('FSM') === -1 &&
          tipo.indexOf('ARCHITECTURAL') === -1) return;
      var dt = r[6] instanceof Date ? r[6] : new Date(r[6]);
      if (isNaN(dt.getTime())) return;
      if (fi && dt < fi) return;
      if (ff && dt > ff) return;
      totalViolacoes++;
      porTipo[tipo] = (porTipo[tipo] || 0) + 1;
    });

    return {
      _tipo:          METRICA_TIPO.GOVERNANCA,
      totalViolacoes: totalViolacoes,
      porTipo:        porTipo,
      conforme:       totalViolacoes === 0
    };
  }

  function _calcularMetricasInstitucionais(filtros) {
    try {
      var codip = CodipService.obterMetricas();
      return {
        _tipo: METRICA_TIPO.INSTITUCIONAL,
        codip: codip
      };
    } catch(e) {
      return { _tipo: METRICA_TIPO.INSTITUCIONAL, erro: e.message };
    }
  }

  // ── Dashboard operacional (absorvido de mod_metrics.gs) ──────────

  function _calcularDashboard(dataInicio, dataFim, filtroSala, filtroSetor) {
    const abaReservas = _getSheet('Reservas');
    const abaItens    = _getSheet('Itens');
    const abaLogs     = _getSheet('LogAcessos');
    const porDiaSemana = { 0:'Domingo',1:'Segunda',2:'Terça',3:'Quarta',4:'Quinta',5:'Sexta',6:'Sábado' };
    const contagemDias = {}, contagemMeses = {}, contagemHoras = {};
    const temposPorSala = {}, temposPorItem = {};

    const parseFiltro = (str) => {
      if (!str) return null;
      const p = str.split('-');
      if (p.length === 3) { const d = new Date(p[0], p[1]-1, p[2]); d.setHours(0,0,0,0); return d; }
      return null;
    };
    const filtroInicio  = parseFiltro(dataInicio);
    const filtroFim     = parseFiltro(dataFim);
    if (filtroFim) filtroFim.setHours(23,59,59,999);
    const filtroSalaStr  = String(filtroSala  || '').trim();
    const filtroSetorStr = String(filtroSetor || '').trim();

    const todasReservas = abaReservas && abaReservas.getLastRow() > 1
      ? abaReservas.getRange(2, 1, abaReservas.getLastRow()-1, 16).getValues() : [];

    const reservas = todasReservas.filter((r) => {
      if (filtroSalaStr  && String(r[4]).trim() !== filtroSalaStr)  return false;
      if (filtroSetorStr && String(r[9]).trim() !== filtroSetorStr) return false;
      if (!filtroInicio && !filtroFim) return true;
      try {
        const raw = r[1];
        let d = raw instanceof Date ? new Date(raw) : null;
        if (!d) {
          const str = String(raw||'').trim();
          if (str.includes('/')) { const p = str.split('/'); d = new Date(p[2],p[1]-1,p[0]); }
          else if (str.includes('-')) d = new Date(str);
        }
        if (!d || isNaN(d.getTime())) return true;
        d.setHours(0,0,0,0);
        if (filtroInicio && d < filtroInicio) return false;
        if (filtroFim    && d > filtroFim)    return false;
        return true;
      } catch(e) { return true; }
    });

    let total=0, confirmadas=0, canceladas=0;
    const porSala={}, porSetor={}, porTurno={}, porMes={};
    const cancelPorSala={}, cancelPorSetor={}, contagemItens={};

    reservas.forEach((r) => {
      total++;
      const status = String(r[13]||'').toUpperCase();
      const sala   = String(r[4] ||'Não informado');
      const setor  = String(r[9] ||'Não informado');
      const turno  = String(r[5] ||'Não informado');
      porSala[sala]   = (porSala[sala]   || 0) + 1;
      porSetor[setor] = (porSetor[setor] || 0) + 1;
      porTurno[turno] = (porTurno[turno] || 0) + 1;
      if (status === STATUS_RESERVA.CONFIRMADA) confirmadas++;
      if (status === STATUS_RESERVA.CANCELADA)  {
        canceladas++;
        cancelPorSala[sala]   = (cancelPorSala[sala]   || 0) + 1;
        cancelPorSetor[setor] = (cancelPorSetor[setor] || 0) + 1;
      }
      const itensStr = String(r[12]||'');
      if (itensStr && itensStr !== 'Nenhum') {
        itensStr.split(/[|]/).forEach((i) => {
          const semFixo = i.trim().replace(/\s*\(fixo\)\s*/gi,'');
          const p = semFixo.split('x '); const qtd = Number(p[0])||0; const nome = (p[1]||'').trim();
          if (nome && qtd > 0) contagemItens[nome] = (contagemItens[nome]||0) + qtd;
        });
      }
      try {
        const raw = r[1]; let dataObj = raw instanceof Date ? raw : null;
        if (!dataObj) { const s = String(raw||'').trim(); if (s.includes('/')) { const p=s.split('/'); dataObj=new Date(p[2],p[1]-1,p[0]); } }
        if (dataObj && !isNaN(dataObj.getTime())) {
          const chave = `${dataObj.getFullYear()}-${String(dataObj.getMonth()+1).padStart(2,'0')}`;
          porMes[chave] = (porMes[chave]||0) + 1;
          const nomeDia = porDiaSemana[dataObj.getDay()];
          const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
          const nomeMes  = MESES_PT[dataObj.getMonth()] + '/' + dataObj.getFullYear();
          contagemDias[nomeDia]  = (contagemDias[nomeDia]  ||0) + 1;
          contagemMeses[nomeMes] = (contagemMeses[nomeMes] ||0) + 1;
        }
      } catch(e) {}
      const _toMin = (v) => {
        if (v instanceof Date) return v.getHours()*60 + v.getMinutes();
        const s = String(v||'').trim(); if (!s.includes(':')) return null;
        const p = s.split(':'); return parseInt(p[0])*60 + parseInt(p[1]);
      };
      const iniH = _toMin(r[2]), terH = _toMin(r[3]);
      if (iniH !== null && terH !== null && terH > iniH) {
        for (let hh = Math.floor(iniH/60); hh < Math.ceil(terH/60); hh++) {
          const hStr = String(hh).padStart(2,'0') + 'h';
          contagemHoras[hStr] = (contagemHoras[hStr]||0) + 1;
        }
      }
      const mins = (iniH !== null && terH !== null && terH > iniH) ? terH - iniH : null;
      if (mins !== null) {
        const s = String(r[4]||'').trim();
        if (s) { if (!temposPorSala[s]) temposPorSala[s]=[]; temposPorSala[s].push(mins); }
        const itStr = String(r[12]||'');
        if (itStr && itStr !== 'Nenhum') {
          itStr.split(/[|]/).forEach((i) => {
            const nome = (i.trim().replace(/\s*\(fixo\)\s*/gi,'').split('x ')[1]||'').trim();
            if (nome) { if (!temposPorItem[nome]) temposPorItem[nome]=[]; temposPorItem[nome].push(mins); }
          });
        }
      }
    });

    const top5Salas  = Object.entries(porSala).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const top5Setores= Object.entries(porSetor).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const ultimos6Meses       = Object.entries(porMes).sort().slice(-6);
    const cancelamentosPorSala  = Object.entries(cancelPorSala).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const cancelamentosPorSetor = Object.entries(cancelPorSetor).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const topItens = Object.entries(contagemItens).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const ordemDias = ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];
    const diasSemana = ordemDias.map((d) => [d, contagemDias[d]||0]);
    const MESES_ORD  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const mesesAno = Object.entries(contagemMeses)
      .sort((a,b) => { const [mA,yA]=a[0].split('/'); const [mB,yB]=b[0].split('/'); return Number(yA)-Number(yB)||MESES_ORD.indexOf(mA)-MESES_ORD.indexOf(mB); })
      .filter(([,v]) => v > 0);
    const horasPico = Object.entries(contagemHoras).sort((a,b)=>parseInt(a[0])-parseInt(b[0]));
    const mediaMin  = (arr) => arr.length>0 ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : 0;
    const mediaOcupacaoPorSala = Object.entries(temposPorSala).map(([s,a])=>[s,mediaMin(a),a.length]).sort((a,b)=>b[2]-a[2]).slice(0,6);
    const mediaUsoItens        = Object.entries(temposPorItem).map(([n,a])=>[n,mediaMin(a),a.length]).sort((a,b)=>b[2]-a[2]).slice(0,6);

    let habilitadas=0;
    reservas.forEach((r) => { if (String(r[13]||'').toUpperCase()===STATUS_RESERVA.HABILITADA) habilitadas++; });

    let solPendentes=0, solAprovadas=0, solRecusadas=0;
    try {
      const abaSol = _getSheet('Solicitacoes');
      if (abaSol && abaSol.getLastRow()>1) {
        abaSol.getRange(2,1,abaSol.getLastRow()-1,9).getValues().forEach((r) => {
          const st = String(r[8]||'').toUpperCase();
          if (st==='PENDENTE') solPendentes++;
          else if (st==='APROVADO') solAprovadas++;
          else if (st==='RECUSADO') solRecusadas++;
        });
      }
    } catch(e) {}

    let itensDisponiveis=0, itensFixados=0;
    if (abaItens && abaItens.getLastRow()>1) {
      abaItens.getRange(2,1,abaItens.getLastRow()-1,5).getValues().forEach((i) => {
        itensDisponiveis += Number(i[3]||0);
        try { const mapa=JSON.parse(String(i[4]||'{}')); itensFixados+=Object.values(mapa).reduce((a,v)=>a+Number(v),0); } catch(e) {}
      });
    }

    let acessosUnicos30d=0;
    if (abaLogs && abaLogs.getLastRow()>1) {
      const logs = abaLogs.getRange(2,1,abaLogs.getLastRow()-1,3).getValues();
      const limite = new Date(); limite.setDate(limite.getDate()-30);
      const emailsVistos = new Set();
      logs.forEach((l) => { try { if (new Date(l[0]) >= limite) emailsVistos.add(l[1]); } catch(e) {} });
      acessosUnicos30d = emailsVistos.size;
    }

    let codip = { totalEstimado:0, totalReal:0, totalRegistros:0, taxaPresenca:0 };
    try {
      const abaCodip = _getSheet('RelatoriosCODIP');
      const dIObj = dataInicio ? new Date(dataInicio) : null;
      const dFObj = dataFim    ? new Date(dataFim)    : null;
      if (abaCodip && abaCodip.getLastRow()>1) {
        const dc = abaCodip.getRange(2,1,abaCodip.getLastRow()-1,34).getValues();
        dc.forEach((linha) => {
          const dr = new Date(linha[33]);
          if (dIObj && dr < dIObj) return;
          if (dFObj && dr > dFObj) return;
          codip.totalEstimado += Number(linha[13]||0);
          codip.totalReal     += Number(linha[13]||0);
        });
        codip.totalRegistros = dc.length;
        codip.taxaPresenca   = codip.totalEstimado>0 ? Math.round((codip.totalReal/codip.totalEstimado)*100) : 0;
      }
    } catch(e) { Logger.error('metrics_engine','_calcularDashboard codip',String(e)); }

    return {
      total, confirmadas, canceladas,
      taxaCancelamento: total>0 ? Math.round((canceladas/total)*100) : 0,
      porSalaTotal: porSala, porSetor, porTurno,
      top5Salas, top5Setores, ultimos6Meses,
      cancelamentosPorSala, cancelamentosPorSetor, topItens,
      itensDisponiveis, itensFixados, acessosUnicos30d,
      diasSemana, mesesAno, mediaOcupacaoPorSala, mediaUsoItens, horasPico,
      habilitadas, solPendentes, solAprovadas, solRecusadas, codip
    };
  }

  function _calcularGraficoReservas() {
    const aba = _getSheet('Reservas');
    if (!aba || aba.getLastRow()<2) return { labels:[], valores:[], tipo:'bar', titulo:'Reservas' };
    const dados = aba.getRange(2,1,aba.getLastRow()-1,16).getValues();
    const contagem = {};
    dados.forEach((r) => {
      if (String(r[13]||'').toUpperCase()===STATUS_RESERVA.CANCELADA) return;
      const sala = String(r[4]||'').trim();
      if (sala) contagem[sala] = (contagem[sala]||0) + 1;
    });
    const mapaSalas = obterMapaSalas();
    const sorted = Object.entries(contagem).sort((a,b)=>b[1]-a[1]).slice(0,8);
    return {
      labels:  sorted.map(([id])  => mapaSalas[id] || id),
      valores: sorted.map(([,v])  => v),
      tipo:    'bar',
      titulo:  'Reservas por Espaço'
    };
  }

  // ── API pública ───────────────────────────────────────────────

  return {
    operacional:          operacional,
    graficoReservas:      graficoReservas,
    obterDashboard:       obterDashboard,
    obterGraficoReservas: obterGraficoReservas,
    chaves:               chaves,
    usuarios:             usuarios,
    auditoria:            auditoria,
    performance:          performance,
    institucional:        institucional,
    fsm:                  fsm,
    seguranca:            seguranca,
    governanca:           governanca,
    dashboard:            dashboard,
    TIPO:                 METRICA_TIPO
  };

})();
