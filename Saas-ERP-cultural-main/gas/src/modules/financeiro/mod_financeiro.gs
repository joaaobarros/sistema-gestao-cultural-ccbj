/**
 * @file mod_financeiro.gs
 * @layer backend/modules
 * @description Contratações e pagamentos operacionais.
 *              Nota: contratos de projetos (metas/rubricas) estão em mod_relatorios.gs.
 *              Dados persistidos em Drive JSON via DataLayer.gs.
 */

// ── Contratações ─────────────────────────────────────────

function obterContratacoes() {
  return readJSON('contratacoes.json');
}

function salvarContratacao(dados) {
  var lista = readJSON('contratacoes.json');
  var isNovo = !dados.id;
  if (isNovo) {
    dados.id = 'ctt_' + Date.now();
    dados.criadoEm = new Date().toISOString();
    lista.push(dados);
  } else {
    var encontrado = false;
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].id === dados.id) { lista[i] = dados; encontrado = true; break; }
    }
    if (!encontrado) lista.push(dados);
  }
  writeJSON('contratacoes.json', lista);
  try {
    SystemEvents.emit(
      isNovo ? SystemEventTypes.CONTRACT_CREATED : SystemEventTypes.CONTRACT_UPDATED,
      { entidade: 'contratacao', entidadeId: dados.id,
        usuario: dados.email || dados.responsavel || '',
        origem: 'mod_financeiro',
        contexto: { nome: dados.nome || dados.descricao || null, valor: dados.valor || null }
      }
    );
  } catch(_) {}
  return { ok: true, id: dados.id };
}

function excluirContratacao(id) {
  var lista = readJSON('contratacoes.json');
  writeJSON('contratacoes.json', lista.filter(function(c) { return c.id !== id; }));
  return { ok: true };
}

// ── Pagamentos ───────────────────────────────────────────

function obterPagamentos() {
  return readJSON('pagamentos.json');
}

function registrarPagamento(dados) {
  var lista = readJSON('pagamentos.json');
  dados.id = 'pag_' + Date.now();
  dados.criadoEm = new Date().toISOString();
  lista.push(dados);
  writeJSON('pagamentos.json', lista);
  try {
    SystemEvents.emit(SystemEventTypes.PAYMENT_REGISTERED, {
      entidade: 'pagamento', entidadeId: dados.id,
      usuario: dados.email || dados.responsavel || '',
      origem: 'mod_financeiro',
      contexto: { valor: dados.valor || null, descricao: dados.descricao || null,
                  contratacaoId: dados.contratacaoId || null }
    });
  } catch(_) {}
  return { ok: true, id: dados.id };
}

function excluirPagamento(id) {
  var lista = readJSON('pagamentos.json');
  writeJSON('pagamentos.json', lista.filter(function(p) { return p.id !== id; }));
  return { ok: true };
}

// ── Fluxo de Caixa ───────────────────────────────────────

function obterFluxoCaixa() {
  var pagamentos = readJSON('pagamentos.json');
  var totalSaidas = pagamentos.reduce(function(s, p) { return s + (Number(p.valor) || 0); }, 0);

  var contratacoes = readJSON('contratacoes.json');
  var totalContratado = contratacoes.reduce(function(s, c) { return s + (Number(c.valor) || 0); }, 0);

  return {
    totalSaidas: totalSaidas,
    totalContratado: totalContratado,
    saldo: totalContratado - totalSaidas,
    pagamentos: pagamentos,
    totalPagamentos: pagamentos.length
  };
}

function compararContratoRH(idContrato) {

  var contratos = obterContratacoes(); // você já tem isso
  var contrato = contratos.find(c => c.id === idContrato);

  if (!contrato) return null;

  var planejado = Number(contrato.orcamentoRH || 0);
  var real = calcularCustoContrato(idContrato);

  return {
    planejado: planejado,
    real: real,
    diferenca: real - planejado,
    percentual: planejado ? ((real - planejado) / planejado) * 100 : 0
  };
}

function compararMetaRH(idContrato) {

  var contratos = obterContratacoes();
  var contrato = contratos.find(c => c.id === idContrato);

  var planejado = {};
  try {
    planejado = JSON.parse(contrato.orcamentoPorMeta || '{}');
  } catch(e){}

  var real = calcularCustoPorMeta();

  var resultado = {};

  Object.keys(real).forEach(function(meta){

    resultado[meta] = {
      planejado: planejado[meta] || 0,
      real: real[meta] || 0,
      diferenca: (real[meta] || 0) - (planejado[meta] || 0)
    };

  });

  return resultado;
}

// =====================================================
// RH + CONTRATOS — CONSOLIDAÇÃO FINANCEIRA
// =====================================================

function obterResumoFinanceiroContrato(idContrato) {

  // custo real vindo do RH
  var custoReal = calcularCustoContrato(idContrato);

  // dados do contrato
  var contratos = obterContratacoes();
  var contrato = contratos.find(function(c){
    return c.id === idContrato;
  });

  if (!contrato) return null;

  var planejado = Number(contrato.orcamentoRH || 0);

  return {
    contrato: contrato.nome || '',
    planejado: planejado,
    real: custoReal,
    diferenca: custoReal - planejado,
    percentual: planejado
      ? ((custoReal - planejado) / planejado) * 100
      : 0
  };
}


function _getParametroRH(chave) {
  var aba = _abrirAba('EQUIPES', 'ParametrosRH');
  var dados = aba.getDataRange().getValues();

  for (var i = 1; i < dados.length; i++) {
    if (dados[i][0] === chave) {
      return Number(dados[i][1]) || 0;
    }
  }

  return 0;
}

function calcularCustoVinculo(v) {

  // =========================
  // PARÂMETROS
  // =========================
  var meses = _getParametroRH('meses_contrato') || 12;
  var reajuste = _getParametroRH('reajuste_percentual') || 0;

  var vtA = _getParametroRH('vale_transporte_A');
  var vtE = _getParametroRH('vale_transporte_E');

  var va = _getParametroRH('vale_alimentacao');
  var descVA = _getParametroRH('desconto_vale_alimentacao');

  // =========================
  // SALÁRIO
  // =========================
  var salario = Number(v.salarioBase || 0);

  var reajusteValor = salario * reajuste;
  var salarioAjustado = salario + reajusteValor;

  // =========================
  // ENCARGOS
  // =========================
  var inssPatronal = salarioAjustado * 0.20;
  var sistemaS = salarioAjustado * 0.066;
  var fgts = salarioAjustado * 0.08;
  var pis = salarioAjustado * 0.01;

  var totalEncargos = inssPatronal + sistemaS + fgts + pis;

  // =========================
  // BENEFÍCIOS
  // =========================
  var valeTransporte = vtA * 2 * 22;
  var descontoVT = salarioAjustado * 0.06;

  var valeAlimentacao = va * 22;
  var descontoAlimentacao = descVA * 22;

  var planoSaude = Number(v.planoSaude || 0);
  var descontoPlano = planoSaude * 0.30;

  var totalBeneficios =
    valeTransporte - descontoVT +
    valeAlimentacao - descontoAlimentacao +
    planoSaude - descontoPlano;

  // =========================
  // PROVISÕES
  // =========================
  var ferias = salarioAjustado * (1 + 1/3) / 12;
  var decimoTerceiro = salarioAjustado / 12;
  var fgtsRescisao = fgts * 0.40;

  var totalProvisoes = ferias + decimoTerceiro + fgtsRescisao;

  // =========================
  // TOTAL
  // =========================
  var custoMensal =
    salarioAjustado +
    totalEncargos +
    totalBeneficios +
    totalProvisoes;

  var custoContrato = custoMensal * meses;

  return {
    salarioAjustado: salarioAjustado,
    encargos: totalEncargos,
    beneficios: totalBeneficios,
    provisoes: totalProvisoes,
    custoMensal: custoMensal,
    custoContrato: custoContrato
  };
}

function atualizarCalculoVinculos() {

  var aba = _abrirAba('EQUIPES', 'Vinculos');
  var dados = aba.getDataRange().getValues();
  var headers = dados[0];

  var idx = {};
  headers.forEach(function(h, i){ idx[h] = i; });

  for (var i = 1; i < dados.length; i++) {

    var row = dados[i];

    var vinculo = {
      salarioBase: row[idx['Salário Base']],
      planoSaude: row[idx['Plano Saúde']]
    };

    var calc = calcularCustoVinculo(vinculo);

    row[idx['Salário Ajustado']] = calc.salarioAjustado;
    row[idx['INSS']] = calc.encargos;
    row[idx['TOTAL BENEFÍCIOS MENSAIS (V)']] = calc.beneficios;
    row[idx['TOTAL PROVISÕES MENSAIS (VI)']] = calc.provisoes;
    row[idx['Custo Total Mensal']] = calc.custoMensal;
    row[idx['Custo Total Contrato']] = calc.custoContrato;

  }

  aba.getRange(2,1,dados.length-1,dados[0].length)
     .setValues(dados.slice(1));

  return { ok: true };
}

function calcularCustoPorMeta() {

  var aba = _abrirAba('EQUIPES', 'Vinculos');
  var dados = aba.getDataRange().getValues();
  var headers = dados[0];

  var idx = {};
  headers.forEach(function(h,i){ idx[h]=i });

  var resultado = {};

  for (var i = 1; i < dados.length; i++) {

    var row = dados[i];

    var meta = row[idx['Meta']] || 'Sem meta';
    var custo = Number(row[idx['Custo Total Mensal']] || 0);
    var perc = Number(row[idx['Percentual Alocação']] || 100) / 100;

    var valor = custo * perc;

    if (!resultado[meta]) resultado[meta] = 0;
    resultado[meta] += valor;
  }

  return resultado;
}

function calcularCustoPorPrograma() {

  var aba = _abrirAba('EQUIPES', 'Vinculos');
  var dados = aba.getDataRange().getValues();
  var headers = dados[0];

  var idx = {};
  headers.forEach(function(h,i){ idx[h]=i });

  var resultado = {};

  for (var i = 1; i < dados.length; i++) {

    var row = dados[i];

    var programa = row[idx['Programa (Projeto)']] || 'Sem programa';
    var custo = Number(row[idx['Custo Total Mensal']] || 0);

    if (!resultado[programa]) resultado[programa] = 0;
    resultado[programa] += custo;
  }

  return resultado;
}

function simularCenarioRH(ajustes) {

  var aba = _abrirAba('EQUIPES', 'Vinculos');
  var dados = aba.getDataRange().getValues();
  var headers = dados[0];

  var idx = {};
  headers.forEach(function(h,i){ idx[h]=i });

  var total = 0;

  for (var i = 1; i < dados.length; i++) {

    var row = dados[i];

    var salario = Number(row[idx['Salário Base']] || 0);

    // aplica ajuste
    if (ajustes.reajuste) {
      salario = salario * (1 + ajustes.reajuste);
    }

    var calc = calcularCustoVinculo({
      salarioBase: salario,
      planoSaude: row[idx['Plano Saúde']]
    });

    total += calc.custoMensal;
  }

  return {
    custoMensal: total,
    custoContrato: total * (_getParametroRH('meses_contrato') || 12)
  };
}

function gerarResumoRH() {

  return {
    porMeta: calcularCustoPorMeta(),
    porPrograma: calcularCustoPorPrograma(),
    total: simularCenarioRH({})
  };

}

function calcularCustoContrato(idContrato) {

  var aba = _abrirAba('EQUIPES', 'Vinculos');
  var dados = aba.getDataRange().getValues();
  var headers = dados[0];

  var idx = {};
  headers.forEach(function(h,i){ idx[h]=i });

  var total = 0;

  for (var i = 1; i < dados.length; i++) {

    var row = dados[i];

    if (row[idx['ID Contrato']] !== idContrato) continue;

    total += Number(row[idx['Custo Total Mensal']] || 0);
  }

  return total;
}

function obterResumoFinanceiroPorMeta(idContrato) {

  var comparacao = compararMetaRH(idContrato);

  var totalPlanejado = 0;
  var totalReal = 0;

  Object.keys(comparacao).forEach(function(meta){

    totalPlanejado += comparacao[meta].planejado;
    totalReal += comparacao[meta].real;

  });

  return {
    metas: comparacao,
    totalPlanejado: totalPlanejado,
    totalReal: totalReal,
    diferenca: totalReal - totalPlanejado
  };
}

function gerarFluxoRH(idContrato) {

  var vinculos = _abrirAba('EQUIPES', 'Vinculos')
    .getDataRange().getValues();

  var headers = vinculos[0];
  var idx = {};
  headers.forEach((h,i)=>idx[h]=i);

  var resultado = [];

  vinculos.slice(1).forEach(function(row){

    if (row[idx['ID Contrato']] !== idContrato) return;

    var inicio = new Date(row[idx['Data Início']]);
    var fim = row[idx['Data Fim']] ? new Date(row[idx['Data Fim']]) : null;

    var custo = Number(row[idx['Custo Total Mensal']] || 0);

    var data = new Date(inicio);

    while (!fim || data <= fim) {

      var mes = data.toISOString().slice(0,7);

      resultado.push({
        idVinculo: row[idx['ID']],
        mes: mes,
        custo: custo,
        status: 'ativo'
      });

      data.setMonth(data.getMonth() + 1);

      if (!fim && resultado.length > 60) break; // segurança
    }

  });

  return resultado;
}

function simularDemissao(idVinculo, dataDemissao) {

  var aba = _abrirAba('EQUIPES', 'Vinculos');
  var dados = aba.getDataRange().getValues();
  var headers = dados[0];

  var idx = {};
  headers.forEach((h,i)=>idx[h]=i);

  var row = dados.find(r => r[idx['ID']] === idVinculo);
  if (!row) return null;

  var custoMensal = Number(row[idx['Custo Total Mensal']] || 0);
  var salario = Number(row[idx['Salário Ajustado']] || row[idx['Salário Base']] || 0);

  // custo rescisório estimado sobre salário (não custo total)
  var fgts = salario * 0.08;
  var multa = fgts * 0.40;
  var aviso = salario;

  var custoDemissao = multa + aviso;

  return {
    custoDemissao: custoDemissao,
    economiaMensal: custoMensal,
    mesesParaRecuperar: custoDemissao / custoMensal
  };
}

function calcularSaldoMensal(idContrato, orcamentoMensal) {

  var fluxo = gerarFluxoRH(idContrato);

  var mapa = {};

  fluxo.forEach(function(f){
    if (!mapa[f.mes]) mapa[f.mes] = 0;
    mapa[f.mes] += f.custo;
  });

  var resultado = [];

  Object.keys(mapa).sort().forEach(function(mes){

    var gasto = mapa[mes];
    var saldo = orcamentoMensal - gasto;

    resultado.push({
      mes: mes,
      gasto: gasto,
      saldo: saldo
    });

  });

  return resultado;
}