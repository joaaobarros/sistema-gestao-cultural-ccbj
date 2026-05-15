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
 * @depends modules/rh/rh_repository.gs (RHRepository)
 *          core/services/auditoria_service.gs (AuditoriaService)
 */

var TIPO_RESCISAO = {
  PEDIDO_DEMISSAO:      'pedido_demissao',
  DISPENSA_SEM_JUSTA:   'dispensa_sem_justa',
  DISPENSA_COM_JUSTA:   'dispensa_com_justa',
  TERMINO_CONTRATO:     'termino_contrato',
  ACORDO:               'acordo',
  RESCISAO_INDIRETA:    'rescisao_indireta',
  OUTROS:               'outros'
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

  // ── Constantes tributárias (estimativas gerenciais — revisar anualmente) ──────
  var INSS_TABELA = [
    { ate: 1412.00,  aliq: 0.075 },
    { ate: 2666.68,  aliq: 0.09  },
    { ate: 4000.03,  aliq: 0.12  },
    { ate: 7786.02,  aliq: 0.14  }
  ];
  var FGTS_ALIQ        = 0.08;
  var MULTA_FGTS_ALIQ  = 0.40;
  var MULTA_ACORDO_ALIQ= 0.20;
  var ENCARGOS_ALIQ    = 0.2768; // INSS patronal + RAT + terceiros (estimativa)
  var AVISO_DIAS_BASE  = 30;

  // ── INSS progressivo ──────────────────────────────────────────────────────────
  function _calcINSS(salario) {
    var base = salario;
    var inss = 0;
    var prev = 0;
    for (var i = 0; i < INSS_TABELA.length; i++) {
      var faixa = INSS_TABELA[i];
      if (base <= 0) break;
      var teto = faixa.ate - prev;
      var tributavel = Math.min(base, teto);
      inss += tributavel * faixa.aliq;
      base -= tributavel;
      prev = faixa.ate;
    }
    return Math.round(inss * 100) / 100;
  }

  // ── Dias trabalhados no mês de desligamento ───────────────────────────────────
  function _diasNoMes(dataDesligamento) {
    var d = new Date(dataDesligamento + 'T12:00:00');
    return d.getDate();
  }

  // ── Meses completos entre duas datas ─────────────────────────────────────────
  function _mesesEntre(dataInicio, dataFim) {
    var ini = new Date(dataInicio + 'T12:00:00');
    var fim = new Date(dataFim   + 'T12:00:00');
    var meses = (fim.getFullYear() - ini.getFullYear()) * 12
              + (fim.getMonth()    - ini.getMonth());
    if (fim.getDate() >= ini.getDate()) meses += 1;
    return Math.max(0, meses);
  }

  // ── Aviso prévio proporcional (Lei 12.506/2011) ───────────────────────────────
  function _diasAvisoPrevio(dataAdmissao, dataDesligamento) {
    var meses = _mesesEntre(dataAdmissao, dataDesligamento);
    var anos  = Math.floor(meses / 12);
    return Math.min(AVISO_DIAS_BASE + anos * 3, 90);
  }

  // ── Férias vencidas + 1/3 ────────────────────────────────────────────────────
  function _feriasVencidas(dataAdmissao, dataDesligamento, salario) {
    // Período aquisitivo completo não gozado = 30 dias
    // Simplificação gerencial: verifica se há período vencido
    var meses = _mesesEntre(dataAdmissao, dataDesligamento);
    var periodosVencidos = Math.floor(meses / 12);
    if (periodosVencidos < 1) return 0;
    var base = salario * periodosVencidos;
    return Math.round(base * (1 + 1/3) * 100) / 100;
  }

  // ── Férias proporcionais + 1/3 ───────────────────────────────────────────────
  function _feriasProporcional(dataAdmissao, dataDesligamento, salario) {
    var mesesTotal = _mesesEntre(dataAdmissao, dataDesligamento);
    var mesesProp  = mesesTotal % 12;
    if (mesesProp === 0) return 0;
    var base = (salario / 12) * mesesProp;
    return Math.round(base * (1 + 1/3) * 100) / 100;
  }

  // ── 13º proporcional ──────────────────────────────────────────────────────────
  function _decimoTerceiroProporcional(dataDesligamento, salario) {
    var d    = new Date(dataDesligamento + 'T12:00:00');
    var meses= d.getMonth() + 1; // meses do ano corrente até desligamento
    return Math.round((salario / 12) * meses * 100) / 100;
  }

  // ── Saldo salarial ─────────────────────────────────────────────────────────────
  function _saldoSalarial(dataDesligamento, salario) {
    var dias     = _diasNoMes(dataDesligamento);
    var diasMes  = new Date(
      new Date(dataDesligamento + 'T12:00:00').getFullYear(),
      new Date(dataDesligamento + 'T12:00:00').getMonth() + 1,
      0
    ).getDate();
    return Math.round((salario / diasMes) * dias * 100) / 100;
  }

  // ── FGTS depositado (estimativa: 8% * salário * meses) ──────────────────────
  function _fgtsSaldo(dataAdmissao, dataDesligamento, salario) {
    var meses = _mesesEntre(dataAdmissao, dataDesligamento);
    return Math.round(salario * FGTS_ALIQ * meses * 100) / 100;
  }

  // ── Custo mensal total (salário + encargos + benefícios) ────────────────────
  function _custoMensal(salario, encargos, beneficios) {
    return Math.round((salario + encargos + beneficios) * 100) / 100;
  }

  // ── Verbas por tipo de rescisão ──────────────────────────────────────────────
  function _verbas(tipo, params) {
    var sal       = params.salarioBase;
    var admissao  = params.dataAdmissao;
    var deslig    = params.dataDesligamento;
    var fgtsSaldo = _fgtsSaldo(admissao, deslig, sal);
    var diasAP    = _diasAvisoPrevio(admissao, deslig);
    var indenAP   = Math.round((sal / 30) * diasAP * 100) / 100;

    var verbas = {
      saldoSalarial:          _saldoSalarial(deslig, sal),
      feriasVencidas:         _feriasVencidas(admissao, deslig, sal),
      feriasProporcional:     _feriasProporcional(admissao, deslig, sal),
      decimoTerceiro:         _decimoTerceiroProporcional(deslig, sal),
      avisoPrevioDias:        diasAP,
      avisoPrevioValor:       0,
      fgtsSaldo:              fgtsSaldo,
      multaFGTS:              0,
      outrasVerbas:           params.outrasVerbas || 0,
      descontos:              params.descontos    || 0
    };

    switch (tipo) {
      case TIPO_RESCISAO.DISPENSA_SEM_JUSTA:
        verbas.avisoPrevioValor = indenAP;
        verbas.multaFGTS        = Math.round(fgtsSaldo * MULTA_FGTS_ALIQ * 100) / 100;
        break;

      case TIPO_RESCISAO.RESCISAO_INDIRETA:
        verbas.avisoPrevioValor = indenAP;
        verbas.multaFGTS        = Math.round(fgtsSaldo * MULTA_FGTS_ALIQ * 100) / 100;
        break;

      case TIPO_RESCISAO.ACORDO:
        verbas.multaFGTS        = Math.round(fgtsSaldo * MULTA_ACORDO_ALIQ * 100) / 100;
        // aviso prévio: metade
        verbas.avisoPrevioValor = Math.round(indenAP * 0.5 * 100) / 100;
        break;

      case TIPO_RESCISAO.PEDIDO_DEMISSAO:
        // sem multa FGTS; trabalhador deve cumprir aviso ou pagar indenização
        verbas.avisoPrevioValor = 0;
        break;

      case TIPO_RESCISAO.DISPENSA_COM_JUSTA:
        // sem férias proporcionais, sem 13º proporcional, sem FGTS, sem aviso
        verbas.feriasProporcional = 0;
        verbas.decimoTerceiro     = 0;
        verbas.avisoPrevioValor   = 0;
        verbas.fgtsSaldo          = 0;
        break;

      case TIPO_RESCISAO.TERMINO_CONTRATO:
        verbas.multaFGTS          = Math.round(fgtsSaldo * MULTA_FGTS_ALIQ * 100) / 100;
        break;

      // OUTROS: sem regra específica
      default: break;
    }

    return verbas;
  }

  // ── Total líquido estimado ──────────────────────────────────────────────────
  function _totalRescisao(verbas) {
    return Math.round((
      verbas.saldoSalarial +
      verbas.feriasVencidas +
      verbas.feriasProporcional +
      verbas.decimoTerceiro +
      verbas.avisoPrevioValor +
      verbas.multaFGTS +
      verbas.outrasVerbas -
      verbas.descontos
    ) * 100) / 100;
  }

  // ── Previsão de vacância ──────────────────────────────────────────────────────
  function _previsaoVacancia(totalRescisao, custoMensal) {
    if (!custoMensal || custoMensal <= 0) return { meses: 0, dias: 0 };
    var mesesFloat = totalRescisao / custoMensal;
    var meses = Math.floor(mesesFloat);
    var dias  = Math.round((mesesFloat - meses) * 30);
    return { meses: meses, dias: dias, mesesFloat: Math.round(mesesFloat * 10) / 10 };
  }

  // ── API principal: calcular rescisão ─────────────────────────────────────────
  function calcular(params) {
    if (!params || !params.dataAdmissao || !params.dataDesligamento || !params.tipoRescisao)
      throw new Error('Parâmetros obrigatórios: dataAdmissao, dataDesligamento, tipoRescisao.');
    if (!params.salarioBase || params.salarioBase <= 0)
      throw new Error('Salário base é obrigatório.');

    var tipo     = params.tipoRescisao;
    var salario  = parseFloat(params.salarioBase);
    var benefVal = parseFloat(params.beneficios || 0);
    var encargos = Math.round(salario * ENCARGOS_ALIQ * 100) / 100;

    var verbas        = _verbas(tipo, Object.assign({}, params, { salarioBase: salario }));
    var total         = _totalRescisao(verbas);
    var custoMensal   = _custoMensal(salario, encargos, benefVal);
    var vacancia      = _previsaoVacancia(total, custoMensal);
    var inss          = _calcINSS(salario);
    var mesesServico  = _mesesEntre(params.dataAdmissao, params.dataDesligamento);

    return {
      tipoRescisao:    tipo,
      tipoLabel:       TIPO_RESCISAO_LABEL[tipo] || tipo,
      dataAdmissao:    params.dataAdmissao,
      dataDesligamento:params.dataDesligamento,
      mesesServico:    mesesServico,
      anosServico:     Math.floor(mesesServico / 12),
      salarioBase:     salario,
      beneficios:      benefVal,
      encargosPatronais: encargos,
      custoMensal:     custoMensal,
      inssDesconto:    inss,
      verbas:          verbas,
      totalRescisao:   total,
      vacanciaEstimada:vacancia,
      observacoes:     params.observacoes || '',
      geradoEm:        new Date().toISOString()
    };
  }

  // ── Persistência separada: simulação ≠ rescisão oficial ──────────────────────

  // SIMULAÇÃO — cálculo preliminar, projeção gerencial. NÃO é registro oficial.
  // Armazenado em rh_simulacoes_rescisao.json, nunca no histórico funcional.
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

  // OFICIAL — gerado automaticamente pelo registrarDesligamento do RHEngine.
  // Armazenado em rh_rescisoes.json, vinculado ao evento de desligamento.
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
