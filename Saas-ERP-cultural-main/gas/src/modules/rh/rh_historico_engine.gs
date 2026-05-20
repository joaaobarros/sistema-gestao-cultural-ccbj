/**
 * @file modules/rh/rh_historico_engine.gs
 * @layer modules/rh
 * @description Engine temporal para reconstrução de trajetória financeira e funcional.
 *
 * Resolve salário, benefícios e cargo vigentes em qualquer data histórica,
 * a partir de eventos registrados em rh_historico.json.
 *
 * Fonte de verdade temporal para:
 *   - FGTS acumulado histórico (segmentado por período salarial)
 *   - Salário vigente em qualquer data passada
 *   - Salário ao fim de cada período aquisitivo de férias
 *   - Custo médio mensal efetivo para cálculo de vacância
 *   - Cargo vigente em qualquer data
 *
 * Tipos de eventos considerados (rh_historico.json):
 *   - alteracaoSalarial: campos salarioAnterior + salarioNovo
 *   - promocao, progressao, reajuste: mesmos campos acima
 *   - alteracaoCargo: campos cargoAnterior + cargoNovo
 *
 * @depends core/data_layer.gs (readJSON)
 */

var HistoricoFinanceiroEngine = (function () {

  var _TIPOS_SALARIAL = ['alteracaoSalarial', 'promocao', 'progressao', 'reajuste'];
  var _TIPOS_CARGO    = ['alteracaoCargo', 'promocao', 'progressao', 'transferencia'];

  // ── Timeline salarial ─────────────────────────────────────────────────────
  // Constrói array de { dataInicio, dataFim|null, salario } ordenado por data.
  // Se não há eventos salariais no histórico, retorna período único com salarioAtual.
  // dataFim: null indica que o período vai até a data de desligamento (período corrente).

  function construirTimelineSalarial(idColaborador, dataAdmissao, salarioAtual) {
    var historico = _historicoFiltrado(idColaborador);
    var eventos   = historico
      .filter(function (h) {
        return _TIPOS_SALARIAL.indexOf(h.tipo) >= 0 && h.salarioNovo;
      })
      .sort(function (a, b) {
        return (a.dataEvento || '') > (b.dataEvento || '') ? 1 : -1;
      });

    if (eventos.length === 0) {
      return [{ dataInicio: dataAdmissao, dataFim: null, salario: parseFloat(salarioAtual) || 0 }];
    }

    // Salário inicial = salarioAnterior do 1º evento (ou salarioAtual se ausente)
    var salIni = parseFloat(eventos[0].salarioAnterior || salarioAtual) || 0;
    var timeline = [];
    var periodo  = { dataInicio: dataAdmissao, dataFim: eventos[0].dataEvento, salario: salIni };

    for (var i = 0; i < eventos.length; i++) {
      timeline.push(periodo);
      periodo = {
        dataInicio: eventos[i].dataEvento,
        dataFim:    i + 1 < eventos.length ? eventos[i + 1].dataEvento : null,
        salario:    parseFloat(eventos[i].salarioNovo) || 0
      };
    }
    timeline.push(periodo);
    return timeline;
  }

  // ── Resolve salário vigente em uma data ISO ───────────────────────────────

  function resolverSalarioNaData(idColaborador, dataISO, salarioAtual, dataAdmissao) {
    var timeline = construirTimelineSalarial(idColaborador, dataAdmissao, salarioAtual);
    for (var i = 0; i < timeline.length; i++) {
      var p   = timeline[i];
      var ini = p.dataInicio || '0000-00-00';
      var fim = p.dataFim    || '9999-12-31';
      if (dataISO >= ini && dataISO < fim) return p.salario;
    }
    return timeline.length > 0
      ? timeline[timeline.length - 1].salario
      : (parseFloat(salarioAtual) || 0);
  }

  // ── Resolve salário ao fim do N-ésimo período aquisitivo (0-based) ────────
  // Usado para calcular férias vencidas com o salário correto de cada período.

  function resolverSalarioAoFimAquisitivo(idColaborador, dataAdmissao, periodoN, salarioAtual) {
    var fimPA = _fimPeriodoAquisitivo(dataAdmissao, periodoN);
    return resolverSalarioNaData(idColaborador, fimPA, salarioAtual, dataAdmissao);
  }

  // ── FGTS histórico: soma 8% × salário × meses por segmento salarial ──────
  // Cada alteração salarial cria um novo segmento; o FGTS é calculado
  // proporcionalmente a cada salário dentro do seu período de vigência.
  //
  // Retorna: { total: Number, detalhes: [{ dataInicio, dataFim, salario, meses, fgts }] }

  function calcularFGTSHistorico(idColaborador, dataAdmissao, dataDesligamento, salarioAtual, fgtsAliq) {
    var aliq     = fgtsAliq || 0.08;
    var timeline = construirTimelineSalarial(idColaborador, dataAdmissao, salarioAtual);
    var total    = 0;
    var detalhes = [];

    for (var i = 0; i < timeline.length; i++) {
      var p   = timeline[i];
      var ini = _max(p.dataInicio || dataAdmissao, dataAdmissao);
      var fim = _min(p.dataFim    || dataDesligamento, dataDesligamento);
      if (ini >= fim) continue;

      var meses = _mesesNoIntervalo(ini, fim);
      if (meses <= 0) continue;

      var fgts = Math.round(p.salario * aliq * meses * 100) / 100;
      total   += fgts;
      detalhes.push({
        dataInicio: ini, dataFim: fim,
        salario: p.salario, meses: meses, fgts: fgts
      });
    }

    return { total: Math.round(total * 100) / 100, detalhes: detalhes };
  }

  // ── Custo médio mensal histórico ponderado por período ────────────────────
  // Usado para o cálculo de vacância: custo real ≠ custo do salário atual.
  // custo_mensal_periodo = salario + encargos_patronais + beneficios
  // Retorna o custo médio ponderado pelo tempo em cada salário.
  //
  // Retorna: { custoMedio, totalMeses, totalCusto, detalhes }

  function calcularCustoMedioHistorico(idColaborador, dataAdmissao, dataDesligamento,
                                        salarioAtual, beneficiosAtuais, encargosAliq) {
    var aliqEnc  = encargosAliq || 0.2768;
    var benef    = parseFloat(beneficiosAtuais) || 0;
    var timeline = construirTimelineSalarial(idColaborador, dataAdmissao, salarioAtual);
    var totalCusto = 0;
    var totalMeses = 0;
    var detalhes   = [];

    for (var i = 0; i < timeline.length; i++) {
      var p   = timeline[i];
      var ini = _max(p.dataInicio || dataAdmissao, dataAdmissao);
      var fim = _min(p.dataFim    || dataDesligamento, dataDesligamento);
      if (ini >= fim) continue;

      var meses    = _mesesNoIntervalo(ini, fim);
      if (meses <= 0) continue;

      var enc      = Math.round(p.salario * aliqEnc * 100) / 100;
      var custoMes = Math.round((p.salario + enc + benef) * 100) / 100;
      var custoTot = Math.round(custoMes * meses * 100) / 100;

      totalCusto += custoTot;
      totalMeses += meses;
      detalhes.push({
        dataInicio: ini, dataFim: fim,
        salario: p.salario, encargos: enc,
        custoMensal: custoMes, meses: meses, custoTotal: custoTot
      });
    }

    var custoMedio = totalMeses > 0
      ? Math.round((totalCusto / totalMeses) * 100) / 100
      : 0;
    return {
      custoMedio:  custoMedio,
      totalMeses:  totalMeses,
      totalCusto:  Math.round(totalCusto * 100) / 100,
      detalhes:    detalhes
    };
  }

  // ── Resolve cargo vigente em uma data ─────────────────────────────────────

  function resolverCargoNaData(idColaborador, dataISO) {
    var historico = _historicoFiltrado(idColaborador);
    var maiorData = '';
    var cargo     = null;
    historico.forEach(function (h) {
      if (_TIPOS_CARGO.indexOf(h.tipo) >= 0 && h.cargoNovo
          && (h.dataEvento || '') <= dataISO
          && (h.dataEvento || '') >= maiorData) {
        maiorData = h.dataEvento || '';
        cargo     = h.cargoNovo;
      }
    });
    return cargo;
  }

  // ── Resolve setor vigente em uma data ─────────────────────────────────────

  function resolverSetorNaData(idColaborador, dataISO) {
    var historico = _historicoFiltrado(idColaborador);
    var maiorData = '';
    var setor     = null;
    historico.forEach(function (h) {
      if (h.setorNovo && (h.dataEvento || '') <= dataISO
          && (h.dataEvento || '') >= maiorData) {
        maiorData = h.dataEvento || '';
        setor     = h.setorNovo;
      }
    });
    return setor;
  }

  // ── Helpers privados ──────────────────────────────────────────────────────

  function _historicoFiltrado(idColaborador) {
    var lista = readJSON('rh_historico.json') || [];
    return lista.filter(function (h) { return h.idColaborador === idColaborador; });
  }

  // Conta meses completos dentro do intervalo [dataInicio, dataFim).
  // Usa a mesma lógica de +1 quando fim.date >= ini.date para manter
  // consistência com a contagem de meses de serviço do rescisao_engine.
  function _mesesNoIntervalo(dataInicio, dataFim) {
    var ini = new Date(dataInicio + 'T12:00:00');
    var fim = new Date(dataFim   + 'T12:00:00');
    var m   = (fim.getFullYear() - ini.getFullYear()) * 12
            + (fim.getMonth()    - ini.getMonth());
    if (fim.getDate() >= ini.getDate()) m += 1;
    return Math.max(0, m);
  }

  // Data ISO do último dia do N-ésimo período aquisitivo (0-based)
  function _fimPeriodoAquisitivo(dataAdmissao, n) {
    var d = new Date(dataAdmissao + 'T12:00:00');
    d.setFullYear(d.getFullYear() + n + 1);
    d.setDate(d.getDate() - 1);
    return d.getFullYear() + '-'
      + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
  }

  function _max(a, b) { return a > b ? a : b; }
  function _min(a, b) { return a < b ? a : b; }

  // ── API pública ───────────────────────────────────────────────────────────

  return {
    construirTimelineSalarial:      construirTimelineSalarial,
    resolverSalarioNaData:          resolverSalarioNaData,
    resolverSalarioAoFimAquisitivo: resolverSalarioAoFimAquisitivo,
    calcularFGTSHistorico:          calcularFGTSHistorico,
    calcularCustoMedioHistorico:    calcularCustoMedioHistorico,
    resolverCargoNaData:            resolverCargoNaData,
    resolverSetorNaData:            resolverSetorNaData
  };

})();
