/**
 * @file modules/rh/rescisao_engine.gs
 * @layer modules/rh
 * @description Motor de cálculo de rescisão trabalhista (estimativa gerencial).
 *
 * NÃO é calculadora jurídica oficial — destina-se ao suporte gerencial/administrativo
 * para análise de impacto financeiro, previsão orçamentária e gestão de vacância.
 *
 * Fluxo: Controller → RHEngine.calcularRescisao → RescisaoEngine → RHRepository → DataLayer
 *
 * Quando idColaborador é informado, o motor usa o HistoricoFinanceiroEngine para:
 *   - FGTS real: segmentado por período salarial (não usa snapshot do salário atual)
 *   - Férias vencidas: usa salário vigente ao fim de cada período aquisitivo
 *   - Férias vencidas: desconta dias já gozados (consulta rh_ferias.json)
 *   - Custo médio de vacância: ponderado pelo histórico salarial real
 *
 * Sem idColaborador (modo legado/simulação), todos os cálculos usam salarioBase atual.
 *
 * @depends modules/rh/rh_repository.gs (RHRepository)
 *          modules/rh/rh_historico_engine.gs (HistoricoFinanceiroEngine)
 *          core/services/auditoria_service.gs (AuditoriaService)
 */

var TIPO_RESCISAO = {
  PEDIDO_DEMISSAO:    'pedido_demissao',
  DISPENSA_SEM_JUSTA: 'dispensa_sem_justa',
  DISPENSA_COM_JUSTA: 'dispensa_com_justa',
  TERMINO_CONTRATO:   'termino_contrato',
  ACORDO:             'acordo',
  RESCISAO_INDIRETA:  'rescisao_indireta',
  OUTROS:             'outros'
};

var TIPO_RESCISAO_LABEL = {
  pedido_demissao:    'Pedido de Demissão',
  dispensa_sem_justa: 'Dispensa sem Justa Causa',
  dispensa_com_justa: 'Dispensa com Justa Causa',
  termino_contrato:   'Término de Contrato',
  acordo:             'Rescisão por Acordo',
  rescisao_indireta:  'Rescisão Indireta',
  outros:             'Outros'
};

var RescisaoEngine = (function () {

  // ── Parâmetros fiscais via engine dinâmico ────────────────────────────────────
  // Todos os valores fiscais (INSS, FGTS, encargos, multas, aviso prévio) são lidos
  // de ParametrosFiscaisRH em tempo de cálculo, permitindo atualização anual sem
  // necessidade de alterar este arquivo.

  function _pf() {
    return ParametrosFiscaisRH.obter();
  }

  // ── INSS progressivo — delega ao engine de parâmetros ────────────────────────

  function _calcINSS(salario) {
    return ParametrosFiscaisRH.calcularINSS(salario);
  }

  // ── Utilitários de data ───────────────────────────────────────────────────────

  function _diasNoMes(dataDesligamento) {
    return new Date(dataDesligamento + 'T12:00:00').getDate();
  }

  // Meses de serviço entre duas datas (inclusivo: +1 quando fim.date >= ini.date).
  // Mantido para compatibilidade com aviso prévio e outras verbas.
  function _mesesEntre(dataInicio, dataFim) {
    var ini = new Date(dataInicio + 'T12:00:00');
    var fim = new Date(dataFim   + 'T12:00:00');
    var m   = (fim.getFullYear() - ini.getFullYear()) * 12
            + (fim.getMonth()    - ini.getMonth());
    if (fim.getDate() >= ini.getDate()) m += 1;
    return Math.max(0, m);
  }

  // ── Aviso prévio proporcional (Lei 12.506/2011) ───────────────────────────────

  function _diasAvisoPrevio(dataAdmissao, dataDesligamento) {
    var meses = _mesesEntre(dataAdmissao, dataDesligamento);
    var anos  = Math.floor(meses / 12);
    var pf    = _pf();
    var ap    = pf.avisoPrevio;
    return Math.min(ap.diasBase + anos * ap.diasPorAno, ap.maxDias);
  }

  // ── Saldo salarial (dias trabalhados no mês de desligamento) ─────────────────

  function _saldoSalarial(dataDesligamento, salario) {
    var d       = new Date(dataDesligamento + 'T12:00:00');
    var diasMes = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    var dias    = d.getDate();
    return Math.round((salario / diasMes) * dias * 100) / 100;
  }

  // ── FGTS estimado — fallback sem histórico (modo snapshot) ───────────────────

  function _fgtsSaldoSnapshot(dataAdmissao, dataDesligamento, salario) {
    var meses = _mesesEntre(dataAdmissao, dataDesligamento);
    var aliq  = _pf().fgts.aliquota;
    return Math.round(salario * aliq * meses * 100) / 100;
  }

  // ── Férias vencidas históricas ────────────────────────────────────────────────
  // Para cada período aquisitivo vencido:
  //   1. Desconta dias efetivamente gozados (de rh_ferias.json, quando idColaborador disponível)
  //   2. Usa salário vigente ao fim do período (HistoricoFinanceiroEngine, quando disponível)
  //   3. Aplica +1/3 constitucional
  //
  // Retorna: { valor: Number, detalhes: [...] }

  function _calcularFeriasVencidas(dataAdmissao, dataDesligamento, salario, idColaborador) {
    var meses           = _mesesEntre(dataAdmissao, dataDesligamento);
    var periodosVencidos = Math.floor(meses / 12);

    if (periodosVencidos < 1) return { valor: 0, detalhes: [] };

    // Carregar férias do colaborador para descontar dias já gozados
    var feriasList = [];
    if (idColaborador) {
      try {
        var all = readJSON('rh_ferias.json') || [];
        feriasList = all.filter(function (f) { return f.idColaborador === idColaborador; });
      } catch (_) {}
    }

    var valorTotal = 0;
    var detalhes   = [];

    for (var i = 0; i < periodosVencidos; i++) {
      // Dias efetivamente gozados neste período (busca por _periodoIdx ou periodoIdx)
      var gozados = feriasList
        .filter(function (f) {
          return (f._periodoIdx === i || f.periodoIdx === i)
            && (f.status === 'concluida' || f.status === 'em_gozo');
        })
        .reduce(function (acc, f) { return acc + (parseInt(f.diasGozados) || 0); }, 0);

      var diasDevidos = Math.max(0, 30 - gozados);

      // Salário histórico ao fim do período aquisitivo i
      var salPeriodo = salario; // fallback para salário atual
      if (idColaborador && typeof HistoricoFinanceiroEngine !== 'undefined') {
        salPeriodo = HistoricoFinanceiroEngine.resolverSalarioAoFimAquisitivo(
          idColaborador, dataAdmissao, i, salario);
      }

      var valorPeriodo = diasDevidos > 0
        ? Math.round(salPeriodo * (diasDevidos / 30) * (1 + 1 / 3) * 100) / 100
        : 0;

      valorTotal += valorPeriodo;
      detalhes.push({
        periodoIdx:  i,
        gozados:     gozados,
        diasDevidos: diasDevidos,
        salario:     salPeriodo,
        valor:       valorPeriodo
      });
    }

    return { valor: Math.round(valorTotal * 100) / 100, detalhes: detalhes };
  }

  // ── Férias proporcionais + 1/3 ────────────────────────────────────────────────
  // Usa salário do período corrente (data de desligamento), que é o salário atual.

  function _feriasProporcional(dataAdmissao, dataDesligamento, salario) {
    var mesesTotal = _mesesEntre(dataAdmissao, dataDesligamento);
    var mesesProp  = mesesTotal % 12;
    if (mesesProp === 0) return 0;
    return Math.round((salario / 12) * mesesProp * (1 + 1 / 3) * 100) / 100;
  }

  // ── 13º proporcional ──────────────────────────────────────────────────────────
  // Conta meses no ano corrente até o desligamento.
  // adiantamento13Pago: valor já pago antecipadamente (novembro ou antecipação), deduzido do bruto.

  function _decimoTerceiroProporcional(dataDesligamento, salario, adiantamento13Pago) {
    var d       = new Date(dataDesligamento + 'T12:00:00');
    var meses   = d.getMonth() + 1;
    var bruto   = Math.round((salario / 12) * meses * 100) / 100;
    var adiant  = parseFloat(adiantamento13Pago) || 0;
    return Math.max(0, Math.round((bruto - adiant) * 100) / 100);
  }

  // ── Custo mensal snapshot ─────────────────────────────────────────────────────

  function _custoMensalSnapshot(salario, encargos, beneficios) {
    return Math.round((salario + encargos + beneficios) * 100) / 100;
  }

  // ── Previsão de vacância ──────────────────────────────────────────────────────

  function _previsaoVacancia(totalRescisao, custoMensal) {
    if (!custoMensal || custoMensal <= 0) return { meses: 0, dias: 0, mesesFloat: 0 };
    var mesesFloat = totalRescisao / custoMensal;
    return {
      meses:      Math.floor(mesesFloat),
      dias:       Math.round((mesesFloat - Math.floor(mesesFloat)) * 30),
      mesesFloat: Math.round(mesesFloat * 10) / 10
    };
  }

  // ── Verbas por tipo de rescisão ───────────────────────────────────────────────
  // Recebe fgtsSaldo e feriasVencidas pré-calculados (históricos quando disponíveis).

  function _verbas(tipo, params, fgtsSaldo, feriasVencidas) {
    var sal       = params.salarioBase;
    var adm       = params.dataAdmissao;
    var deslig    = params.dataDesligamento;
    var adiant13  = params.adiantamento13Pago || 0;
    var diasAP    = _diasAvisoPrevio(adm, deslig);
    var indenAP   = Math.round((sal / 30) * diasAP * 100) / 100;
    var pf        = _pf();
    var multaSJ   = pf.rescisao.multaSemJusta;
    var multaAcrd = pf.rescisao.multaAcordo;

    var v = {
      saldoSalarial:          _saldoSalarial(deslig, sal),
      feriasVencidas:         feriasVencidas,
      feriasProporcional:     _feriasProporcional(adm, deslig, sal),
      decimoTerceiro:         _decimoTerceiroProporcional(deslig, sal, adiant13),
      adiantamento13Pago:     adiant13,
      avisoPrevioDias:        diasAP,
      avisoPrevioValor:       0,
      fgtsSaldo:              fgtsSaldo,
      multaFGTS:              0,
      outrasVerbas:           params.outrasVerbas || 0,
      descontos:              params.descontos    || 0
    };

    switch (tipo) {
      case TIPO_RESCISAO.DISPENSA_SEM_JUSTA:
        v.avisoPrevioValor = indenAP;
        v.multaFGTS        = Math.round(fgtsSaldo * multaSJ * 100) / 100;
        break;

      case TIPO_RESCISAO.RESCISAO_INDIRETA:
        v.avisoPrevioValor = indenAP;
        v.multaFGTS        = Math.round(fgtsSaldo * multaSJ * 100) / 100;
        break;

      case TIPO_RESCISAO.ACORDO:
        v.multaFGTS        = Math.round(fgtsSaldo * multaAcrd * 100) / 100;
        v.avisoPrevioValor = Math.round(indenAP * 0.5 * 100) / 100;
        break;

      case TIPO_RESCISAO.PEDIDO_DEMISSAO:
        v.avisoPrevioValor = 0;
        break;

      case TIPO_RESCISAO.DISPENSA_COM_JUSTA:
        // CLT art. 482: sem férias prop., sem 13º prop., sem FGTS, sem aviso
        v.feriasProporcional = 0;
        v.decimoTerceiro     = 0;
        v.avisoPrevioValor   = 0;
        v.fgtsSaldo          = 0;
        break;

      case TIPO_RESCISAO.TERMINO_CONTRATO:
        v.multaFGTS = Math.round(fgtsSaldo * multaSJ * 100) / 100;
        break;

      default: break;
    }

    return v;
  }

  // ── Total líquido estimado ────────────────────────────────────────────────────

  function _totalRescisao(v) {
    return Math.round((
      v.saldoSalarial +
      v.feriasVencidas +
      v.feriasProporcional +
      v.decimoTerceiro +
      v.avisoPrevioValor +
      v.multaFGTS +
      v.outrasVerbas -
      v.descontos
    ) * 100) / 100;
  }

  // ── API principal: calcular ───────────────────────────────────────────────────
  //
  // params obrigatórios: dataAdmissao, dataDesligamento, tipoRescisao, salarioBase
  // params opcionais:    idColaborador, beneficios, outrasVerbas, descontos,
  //                      adiantamento13Pago, adiantamento13DataPagamento, observacoes
  //
  // Quando idColaborador é fornecido, ativa modo histórico:
  //   - FGTS calculado por segmento salarial real
  //   - Férias vencidas com salário histórico + dias gozados descontados
  //   - Custo de vacância ponderado pelo histórico

  function calcular(params) {
    if (!params || !params.dataAdmissao || !params.dataDesligamento || !params.tipoRescisao)
      throw new Error('Parâmetros obrigatórios: dataAdmissao, dataDesligamento, tipoRescisao.');
    if (!params.salarioBase || params.salarioBase <= 0)
      throw new Error('Salário base é obrigatório e deve ser maior que zero.');

    var pf       = _pf();
    var tipo     = params.tipoRescisao;
    var salario  = parseFloat(params.salarioBase);
    var benefVal = parseFloat(params.beneficios || 0);
    var idColab  = params.idColaborador || null;
    var encargos = Math.round(salario * pf.encargos.patronalSemFGTS * 100) / 100;

    // ── FGTS: histórico real ou snapshot ────────────────────────────────────
    var fgtsSaldoResult;
    if (idColab && typeof HistoricoFinanceiroEngine !== 'undefined') {
      fgtsSaldoResult = HistoricoFinanceiroEngine.calcularFGTSHistorico(
        idColab, params.dataAdmissao, params.dataDesligamento, salario, pf.fgts.aliquota);
    } else {
      fgtsSaldoResult = {
        total:    _fgtsSaldoSnapshot(params.dataAdmissao, params.dataDesligamento, salario),
        detalhes: []
      };
    }

    // ── Férias vencidas: histórico real ou snapshot ──────────────────────────
    var feriasVencidasResult = _calcularFeriasVencidas(
      params.dataAdmissao, params.dataDesligamento, salario, idColab);

    // ── Custo mensal para vacância: histórico ponderado ou snapshot ──────────
    var custoMensalInfo;
    if (idColab && typeof HistoricoFinanceiroEngine !== 'undefined') {
      var hist = HistoricoFinanceiroEngine.calcularCustoMedioHistorico(
        idColab, params.dataAdmissao, params.dataDesligamento,
        salario, benefVal, pf.encargos.patronalSemFGTS);
      custoMensalInfo = { valor: hist.custoMedio, tipo: 'historico', detalhes: hist.detalhes };
    } else {
      custoMensalInfo = {
        valor:    _custoMensalSnapshot(salario, encargos, benefVal),
        tipo:     'snapshot',
        detalhes: []
      };
    }

    // ── Montar verbas ────────────────────────────────────────────────────────
    var verbas = _verbas(
      tipo, params,
      fgtsSaldoResult.total,
      feriasVencidasResult.valor
    );

    var total        = _totalRescisao(verbas);
    var vacancia     = _previsaoVacancia(total, custoMensalInfo.valor);
    var inss         = _calcINSS(salario);
    var mesesServico = _mesesEntre(params.dataAdmissao, params.dataDesligamento);

    return {
      tipoRescisao:               tipo,
      tipoLabel:                  TIPO_RESCISAO_LABEL[tipo] || tipo,
      dataAdmissao:               params.dataAdmissao,
      dataDesligamento:           params.dataDesligamento,
      mesesServico:               mesesServico,
      anosServico:                Math.floor(mesesServico / 12),
      salarioBase:                salario,
      beneficios:                 benefVal,
      encargosPatronais:          encargos,
      custoMensal:                custoMensalInfo.valor,
      custoMensalTipo:            custoMensalInfo.tipo,
      inssDesconto:               inss,
      adiantamento13Pago:         params.adiantamento13Pago || 0,
      adiantamento13DataPagamento: params.adiantamento13DataPagamento || null,
      verbas:                     verbas,
      totalRescisao:              total,
      vacanciaEstimada:           vacancia,
      observacoes:                params.observacoes || '',
      geradoEm:                   new Date().toISOString(),
      memoriaCalculo: {
        modoHistorico:          !!idColab,
        fgtsSaldoDetalhes:      fgtsSaldoResult.detalhes,
        feriasVencidasDetalhes: feriasVencidasResult.detalhes,
        custoMensalDetalhes:    custoMensalInfo.detalhes
      }
    };
  }

  // ── Persistência ──────────────────────────────────────────────────────────────

  function salvarSimulacao(calculo, idColaborador, email) {
    if (!calculo || !idColaborador) throw new Error('Cálculo e colaborador são obrigatórios.');
    var registro = Object.assign({}, calculo, {
      idColaborador: idColaborador,
      tipoRegistro:  'simulacao',
      criadoPor:     email || '',
      criadoEm:      new Date().toISOString()
    });
    return RHRepository.salvarSimulacaoRescisao(registro);
  }

  function salvarOficial(calculo, idColaborador, email) {
    if (!calculo || !idColaborador) throw new Error('Cálculo e colaborador são obrigatórios.');
    var registro = Object.assign({}, calculo, {
      idColaborador: idColaborador,
      tipoRegistro:  'oficial',
      criadoPor:     email || '',
      criadoEm:      new Date().toISOString()
    });
    return RHRepository.salvarRescisao(registro);
  }

  function listarSimulacoes(idColaborador) {
    return RHRepository.listarSimulacoesRescisao(idColaborador || null);
  }

  function listar(idColaborador) {
    return RHRepository.listarRescisoes(idColaborador || null);
  }

  function obter(id) {
    return RHRepository.obterRescisao(id);
  }

  // ── API pública ───────────────────────────────────────────────────────────────

  return {
    calcular:            calcular,
    salvarSimulacao:     salvarSimulacao,
    salvarOficial:       salvarOficial,
    listarSimulacoes:    listarSimulacoes,
    listar:              listar,
    obter:               obter,
    TIPO_RESCISAO:       TIPO_RESCISAO,
    TIPO_RESCISAO_LABEL: TIPO_RESCISAO_LABEL
  };

})();
