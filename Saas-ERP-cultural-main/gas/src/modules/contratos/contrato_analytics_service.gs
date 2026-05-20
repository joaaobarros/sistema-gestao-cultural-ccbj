/**
 * @file modules/contratos/contrato_analytics_service.gs
 * @layer modules/contratos
 * @description Analytics comparativo de versões e timeline de contratos.
 *
 * Centraliza toda análise de versionamento:
 *   - Comparação simples e detalhada entre dois snapshots
 *   - Ranking de impacto por rubrica
 *   - Heatmap de alterações
 *   - Alertas automáticos (aumento crítico, rubrica crítica)
 *   - Dashboard comparativo (composição otimizada — único fetch de snapshots)
 *   - Timeline completa do contrato
 *
 * @depends modules/contratos/contrato_repository.gs (ContratoRepository)
 */

var ContratoAnalyticsService = (function () {

  // ── Helpers privados ─────────────────────────────────────────────

  function _obterSnapshot(idContrato, versao) {
    return ContratoRepository.obterSnapshotVersao(idContrato, versao);
  }

  function _mapaMetas() {
    var mapa = {};
    ContratoRepository.listarMetas().forEach(function(m) { mapa[m.id] = m.titulo; });
    return mapa;
  }

  function _mapaRubricas() {
    var mapa = {};
    ContratoRepository.listarRubricas().forEach(function(r) {
      mapa[r.id] = { nome: r.nome, idMeta: r.idMeta };
    });
    return mapa;
  }

  // ── Analytics privados (recebem diff pré-computado) ──────────────

  function _rankingFromDiff(diff) {
    var mapaMetas    = _mapaMetas();
    var mapaRubricas = _mapaRubricas();
    return diff.rubricas
      .sort(function(a, b) { return Math.abs(b.diferenca) - Math.abs(a.diferenca); })
      .map(function(r) {
        var rub        = mapaRubricas[r.idRubrica] || {};
        var nomeRubrica = rub.nome || 'Rubrica desconhecida';
        var nomeMeta    = mapaMetas[rub.idMeta] || 'Meta desconhecida';
        return {
          idRubrica:   r.idRubrica,
          nomeRubrica: nomeRubrica,
          nomeMeta:    nomeMeta,
          label:       nomeMeta + ' → ' + nomeRubrica,
          impacto:     r.diferenca,
          tipo:        r.tipo
        };
      });
  }

  function _heatmapFromDiff(diff) {
    var mapaMetas    = _mapaMetas();
    var mapaRubricas = _mapaRubricas();
    return diff.rubricas.map(function(r) {
      var rub        = mapaRubricas[r.idRubrica] || {};
      var intensidade = diff.resumo.totalAntes > 0
        ? Math.abs(r.diferenca) / diff.resumo.totalAntes
        : 0;
      return {
        idRubrica:   r.idRubrica,
        nomeMeta:    mapaMetas[rub.idMeta] || 'Meta desconhecida',
        nomeRubrica: rub.nome || 'Rubrica desconhecida',
        label:       (mapaMetas[rub.idMeta] || '') + ' → ' + (rub.nome || ''),
        intensidade: intensidade,
        tipo:        r.tipo
      };
    });
  }

  function _alertasFromDiff(diff) {
    var mapaMetas    = _mapaMetas();
    var mapaRubricas = _mapaRubricas();
    var alertas      = [];
    if (diff.resumo.totalAntes > 0) {
      var percentual = diff.resumo.diferenca / diff.resumo.totalAntes;
      if (percentual > 0.1) {
        alertas.push({ tipo: 'AUMENTO_CRITICO', mensagem: 'Contrato aumentou mais de 10%', percentual: percentual });
      }
    }
    diff.rubricas.forEach(function(r) {
      var rub      = mapaRubricas[r.idRubrica] || {};
      var nomeMeta = mapaMetas[rub.idMeta] || '';
      if (Math.abs(r.diferenca) > 5000) {
        alertas.push({ tipo: 'RUBRICA_CRITICA', label: nomeMeta + ' → ' + (rub.nome || ''), impacto: r.diferenca });
      }
    });
    return alertas;
  }

  // ── API pública ──────────────────────────────────────────────────

  /**
   * Comparação simples entre duas versões: retorna array de diffs por rubrica (nome → valor).
   */
  function compararVersoes(idContrato, v1, v2) {
    var snap1 = _obterSnapshot(idContrato, v1);
    var snap2 = _obterSnapshot(idContrato, v2);

    var resultado = { contrato: {}, metas: [], rubricas: [], memoria: [] };

    if (JSON.stringify(snap1.contrato) !== JSON.stringify(snap2.contrato)) {
      resultado.contrato = { antes: snap1.contrato, depois: snap2.contrato };
    }

    var mapaMeta1 = {};
    snap1.metas.forEach(function(m) { mapaMeta1[m[0]] = m; });
    var mapaMeta2 = {};
    snap2.metas.forEach(function(m) { mapaMeta2[m[0]] = m; });
    Object.keys(Object.assign({}, mapaMeta1, mapaMeta2)).forEach(function(id) {
      var m1 = mapaMeta1[id], m2 = mapaMeta2[id];
      if (JSON.stringify(m1) !== JSON.stringify(m2)) resultado.metas.push({ id: id, antes: m1, depois: m2 });
    });

    var mapaRub1 = {};
    snap1.rubricas.forEach(function(r) { mapaRub1[r[0]] = r; });
    var mapaRub2 = {};
    snap2.rubricas.forEach(function(r) { mapaRub2[r[0]] = r; });
    Object.keys(Object.assign({}, mapaRub1, mapaRub2)).forEach(function(id) {
      var r1 = mapaRub1[id], r2 = mapaRub2[id];
      if (JSON.stringify(r1) !== JSON.stringify(r2)) resultado.rubricas.push({ id: id, antes: r1, depois: r2 });
    });

    var mapaMem1 = {};
    snap1.memoria.forEach(function(m) { mapaMem1[m[0]] = m; });
    var mapaMem2 = {};
    snap2.memoria.forEach(function(m) { mapaMem2[m[0]] = m; });
    Object.keys(Object.assign({}, mapaMem1, mapaMem2)).forEach(function(id) {
      var m1 = mapaMem1[id], m2 = mapaMem2[id];
      if (JSON.stringify(m1) !== JSON.stringify(m2)) resultado.memoria.push({ id: id, antes: m1, depois: m2 });
    });

    return resultado;
  }

  /**
   * Comparação detalhada com totais financeiros por rubrica e resumo agregado.
   */
  function compararVersoesDetalhado(idContrato, v1, v2) {
    var snap1 = _obterSnapshot(idContrato, v1);
    var snap2 = _obterSnapshot(idContrato, v2);

    var resultado = { resumo: { totalAntes: 0, totalDepois: 0, diferenca: 0 }, rubricas: [], alteracoes: [] };

    function agruparMemoria(memoria) {
      var mapa = {};
      memoria.forEach(function(m, i) {
        if (i === 0) return;
        var idRub    = m[1];
        var subtotal = Number(m[6] || 0);
        if (!mapa[idRub]) mapa[idRub] = { total: 0, itens: [] };
        mapa[idRub].total += subtotal;
        mapa[idRub].itens.push(m);
      });
      return mapa;
    }

    var mem1 = agruparMemoria(snap1.memoria);
    var mem2 = agruparMemoria(snap2.memoria);
    var todasRubricas = Object.keys(Object.assign({}, mem1, mem2));

    todasRubricas.forEach(function(idRub) {
      var r1   = mem1[idRub] || { total: 0 };
      var r2   = mem2[idRub] || { total: 0 };
      var diff = r2.total - r1.total;
      if (diff !== 0) {
        resultado.rubricas.push({
          idRubrica: idRub,
          antes:     r1.total,
          depois:    r2.total,
          diferenca: diff,
          tipo:      diff > 0 ? 'AUMENTO' : 'REDUCAO'
        });
      }
      resultado.resumo.totalAntes  += r1.total;
      resultado.resumo.totalDepois += r2.total;
    });

    resultado.resumo.diferenca = resultado.resumo.totalDepois - resultado.resumo.totalAntes;
    return resultado;
  }

  /**
   * Ranking de rubricas ordenado por impacto absoluto.
   */
  function rankingImpacto(idContrato, v1, v2) {
    var diff = compararVersoesDetalhado(idContrato, v1, v2);
    return _rankingFromDiff(diff);
  }

  /**
   * Heatmap de alterações com intensidade relativa ao total anterior.
   */
  function heatmapAlteracoes(idContrato, v1, v2) {
    var diff = compararVersoesDetalhado(idContrato, v1, v2);
    return _heatmapFromDiff(diff);
  }

  /**
   * Alertas automáticos (aumento crítico > 10%, rubrica crítica > R$ 5.000).
   */
  function alertas(idContrato, v1, v2) {
    var diff = compararVersoesDetalhado(idContrato, v1, v2);
    return _alertasFromDiff(diff);
  }

  /**
   * Dashboard comparativo composto (único fetch de snapshots — otimizado).
   */
  function dashboard(idContrato, v1, v2) {
    var diff = compararVersoesDetalhado(idContrato, v1, v2);
    return {
      resumo:  diff.resumo,
      ranking: _rankingFromDiff(diff),
      heatmap: _heatmapFromDiff(diff),
      alertas: _alertasFromDiff(diff)
    };
  }

  /**
   * Timeline completa: uma entrada por par de versões adjacentes com impacto financeiro.
   */
  function timeline(idContrato) {
    var versoes = ContratoRepository.obterHistoricoContrato(idContrato)
      .sort(function(a, b) { return a.versao - b.versao; });

    var result = [];
    for (var i = 1; i < versoes.length; i++) {
      var anterior = versoes[i - 1];
      var atual    = versoes[i];
      try {
        var diff = compararVersoesDetalhado(idContrato, anterior.versao, atual.versao);
        result.push({
          de:      anterior.versao,
          para:    atual.versao,
          data:    atual.criadoEm,
          usuario: atual.criadoPor,
          impacto: diff.resumo.diferenca
        });
      } catch(e) {
        result.push({ de: anterior.versao, para: atual.versao, data: atual.criadoEm, usuario: atual.criadoPor, impacto: null });
      }
    }
    return result;
  }

  return {
    compararVersoes:          compararVersoes,
    compararVersoesDetalhado: compararVersoesDetalhado,
    rankingImpacto:           rankingImpacto,
    heatmapAlteracoes:        heatmapAlteracoes,
    alertas:                  alertas,
    dashboard:                dashboard,
    timeline:                 timeline
  };

})();
