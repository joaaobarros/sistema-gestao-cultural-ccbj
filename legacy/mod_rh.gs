/**
 * @file mod_rh.gs
 * @layer backend/modules
 * @description Módulo RH expandido: cargos, histórico, avaliações, ponto, documentos,
 *              folha de pagamento, simulações e perfil social/demográfico.
 *              Dados persistidos em Drive JSON via DataLayer.gs.
 */

// ── Cargos ──────────────────────────────────────────────────────────────────

function obterCargosRH() {
  return readJSON('rh_cargos.json') || [];
}

function salvarCargoRH(dados) {
  var lista = readJSON('rh_cargos.json') || [];
  if (!dados.id) {
    dados.id = 'car_' + Date.now();
    dados.criadoEm = new Date().toISOString();
    lista.push(dados);
  } else {
    var i = lista.findIndex(function(c) { return c.id === dados.id; });
    if (i >= 0) lista[i] = dados;
    else lista.push(dados);
  }
  writeJSON('rh_cargos.json', lista);
  return { ok: true, id: dados.id };
}

function excluirCargoRH(id) {
  var lista = readJSON('rh_cargos.json') || [];
  writeJSON('rh_cargos.json', lista.filter(function(c) { return c.id !== id; }));
  return { ok: true };
}

// ── Histórico do colaborador ─────────────────────────────────────────────────

function obterHistoricoRH(idColaborador) {
  var lista = readJSON('rh_historico.json') || [];
  if (idColaborador) lista = lista.filter(function(h) { return h.idColaborador === idColaborador; });
  return lista.sort(function(a, b) { return (b.dataEvento || '') < (a.dataEvento || '') ? -1 : 1; });
}

function registrarEventoRH(dados) {
  var lista = readJSON('rh_historico.json') || [];
  dados.id = 'hist_' + Date.now();
  dados.criadoEm = new Date().toISOString();
  if (!dados.registradoPor) dados.registradoPor = Session.getActiveUser().getEmail();
  lista.push(dados);
  writeJSON('rh_historico.json', lista);
  return { ok: true, id: dados.id };
}

function excluirEventoRH(id) {
  var lista = readJSON('rh_historico.json') || [];
  writeJSON('rh_historico.json', lista.filter(function(h) { return h.id !== id; }));
  return { ok: true };
}

// ── Avaliações de desempenho ─────────────────────────────────────────────────

function obterAvaliacoesRH(idColaborador) {
  var lista = readJSON('rh_avaliacoes.json') || [];
  if (idColaborador) lista = lista.filter(function(a) { return a.idColaborador === idColaborador; });
  return lista;
}

function salvarAvaliacaoRH(dados) {
  var lista = readJSON('rh_avaliacoes.json') || [];
  if (!dados.id) {
    dados.id = 'aval_' + Date.now();
    dados.criadoEm = new Date().toISOString();
    if (!dados.avaliador) dados.avaliador = Session.getActiveUser().getEmail();
    lista.push(dados);
  } else {
    var i = lista.findIndex(function(a) { return a.id === dados.id; });
    if (i >= 0) lista[i] = dados;
    else lista.push(dados);
  }
  writeJSON('rh_avaliacoes.json', lista);
  return { ok: true, id: dados.id };
}

function excluirAvaliacaoRH(id) {
  var lista = readJSON('rh_avaliacoes.json') || [];
  writeJSON('rh_avaliacoes.json', lista.filter(function(a) { return a.id !== id; }));
  return { ok: true };
}

// ── Controle de presença / ponto ─────────────────────────────────────────────

function obterPontoRH(idColaborador, mes) {
  var lista = readJSON('rh_ponto.json') || [];
  if (idColaborador) lista = lista.filter(function(p) { return p.idColaborador === idColaborador; });
  if (mes) lista = lista.filter(function(p) { return (p.data || '').startsWith(mes); });
  return lista;
}

function registrarPontoRH(dados) {
  var lista = readJSON('rh_ponto.json') || [];
  if (!dados.id) {
    dados.id = 'pont_' + Date.now();
    dados.criadoEm = new Date().toISOString();
    lista.push(dados);
  } else {
    var i = lista.findIndex(function(p) { return p.id === dados.id; });
    if (i >= 0) lista[i] = dados;
    else lista.push(dados);
  }
  writeJSON('rh_ponto.json', lista);
  return { ok: true, id: dados.id };
}

function excluirPontoRH(id) {
  var lista = readJSON('rh_ponto.json') || [];
  writeJSON('rh_ponto.json', lista.filter(function(p) { return p.id !== id; }));
  return { ok: true };
}

// ── Documentos ───────────────────────────────────────────────────────────────

function obterDocumentosRH(idColaborador) {
  var lista = readJSON('rh_documentos.json') || [];
  if (idColaborador) lista = lista.filter(function(d) { return d.idColaborador === idColaborador; });
  return lista;
}

function salvarDocumentoRH(dados) {
  var lista = readJSON('rh_documentos.json') || [];
  if (!dados.id) {
    dados.id = 'doc_' + Date.now();
    dados.criadoEm = new Date().toISOString();
    lista.push(dados);
  } else {
    var i = lista.findIndex(function(d) { return d.id === dados.id; });
    if (i >= 0) lista[i] = dados;
    else lista.push(dados);
  }
  writeJSON('rh_documentos.json', lista);
  return { ok: true, id: dados.id };
}

function excluirDocumentoRH(id) {
  var lista = readJSON('rh_documentos.json') || [];
  writeJSON('rh_documentos.json', lista.filter(function(d) { return d.id !== id; }));
  return { ok: true };
}

// ── Folha de pagamento ────────────────────────────────────────────────────────

function obterFolhaRH(mes) {
  var lista = readJSON('rh_folha.json') || [];
  if (mes) lista = lista.filter(function(f) { return f.mes === mes; });
  return lista;
}

function salvarFolhaRH(dados) {
  var lista = readJSON('rh_folha.json') || [];
  if (!dados.id) {
    dados.id = 'folha_' + Date.now();
    dados.criadoEm = new Date().toISOString();
    lista.push(dados);
  } else {
    var i = lista.findIndex(function(f) { return f.id === dados.id; });
    if (i >= 0) lista[i] = dados;
    else lista.push(dados);
  }
  writeJSON('rh_folha.json', lista);
  return { ok: true, id: dados.id };
}

function simularFolhaRH(dados) {
  var salario = parseFloat(dados.salarioBase) || 0;
  var vinculo = dados.vinculo || 'CLT';
  var beneficios = parseFloat(dados.beneficios) || 0;
  var adicional = parseFloat(dados.adicional) || 0;

  var res = {
    salarioBase: salario, beneficios: beneficios, adicional: adicional,
    inss: 0, irrf: 0, fgts: 0, encargosPatronais: 0,
    provisao13: 0, provisaoFerias: 0, descontoTotal: 0,
    custoTotal: 0, liquidoColaborador: 0
  };

  if (vinculo === 'CLT') {
    var bruto = salario + adicional;

    var inss = 0;
    if (bruto <= 1412.00)       inss = bruto * 0.075;
    else if (bruto <= 2666.68)  inss = 105.90 + (bruto - 1412.00) * 0.09;
    else if (bruto <= 4000.03)  inss = 105.90 + 113.40 + (bruto - 2666.68) * 0.12;
    else if (bruto <= 7786.02)  inss = 105.90 + 113.40 + 160.00 + (bruto - 4000.03) * 0.14;
    else                         inss = 908.86;
    inss = Math.round(inss * 100) / 100;

    var baseIRRF = bruto - inss;
    var irrf = 0;
    if (baseIRRF > 5855.60)      irrf = baseIRRF * 0.275 - 869.36;
    else if (baseIRRF > 4664.68) irrf = baseIRRF * 0.225 - 636.13;
    else if (baseIRRF > 3751.05) irrf = baseIRRF * 0.15  - 354.80;
    else if (baseIRRF > 2824.00) irrf = baseIRRF * 0.075 - 142.80;
    irrf = Math.max(0, Math.round(irrf * 100) / 100);

    var fgts     = Math.round(bruto * 0.08 * 100) / 100;
    var encargos = Math.round(bruto * 0.348 * 100) / 100;
    var prov13   = Math.round((bruto / 12) * 100) / 100;
    var provFer  = Math.round((bruto * 4 / 3 / 12) * 100) / 100;

    res.inss = inss; res.irrf = irrf; res.fgts = fgts;
    res.encargosPatronais = encargos;
    res.provisao13 = prov13; res.provisaoFerias = provFer;
    res.descontoTotal = Math.round((inss + irrf) * 100) / 100;
    res.liquidoColaborador = Math.round((bruto - inss - irrf + beneficios) * 100) / 100;
    res.custoTotal = Math.round((bruto + encargos + prov13 + provFer + beneficios) * 100) / 100;
  } else if (vinculo === 'PJ') {
    res.liquidoColaborador = Math.round((salario + adicional + beneficios) * 100) / 100;
    res.custoTotal = res.liquidoColaborador;
  } else {
    res.liquidoColaborador = Math.round((salario + beneficios) * 100) / 100;
    res.custoTotal = res.liquidoColaborador;
  }

  return res;
}

// ── Perfil social e demográfico ───────────────────────────────────────────────

function obterPerfilSocialRH(idColaborador) {
  var lista = readJSON('rh_perfil_social.json') || [];
  if (idColaborador) {
    return lista.find(function(p) { return p.idColaborador === idColaborador; }) || null;
  }
  return lista;
}

function salvarPerfilSocialRH(dados) {
  var lista = readJSON('rh_perfil_social.json') || [];
  var i = lista.findIndex(function(p) { return p.idColaborador === dados.idColaborador; });
  dados.atualizadoEm = new Date().toISOString();
  if (i >= 0) lista[i] = dados;
  else lista.push(dados);
  writeJSON('rh_perfil_social.json', lista);
  return { ok: true };
}

// ── Indicadores e KPIs ───────────────────────────────────────────────────────

function obterIndicadoresRH() {
  var funcionarios = readJSON('funcionarios.json') || [];
  var historico    = readJSON('rh_historico.json') || [];
  var folha        = readJSON('rh_folha.json') || [];
  var anoAtual     = new Date().getFullYear();
  var d            = new Date();
  var mesFolha     = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');

  var total = funcionarios.length;
  var ativos = 0, emFerias = 0, afastados = 0, inativos = 0;
  var porSetor = {}, porVinculo = {};

  funcionarios.forEach(function(f) {
    var st = f.status || 'Ativo';
    if (st === 'Ativo') ativos++;
    else if (st === 'Férias') emFerias++;
    else if (st === 'Afastado') afastados++;
    else inativos++;
    var setor = f.setor || 'Não informado';
    porSetor[setor] = (porSetor[setor] || 0) + 1;
    var v = f.vinculo || 'Não informado';
    porVinculo[v] = (porVinculo[v] || 0) + 1;
  });

  var desligAno = historico.filter(function(h) {
    return h.tipo === 'desligamento' && String(h.dataEvento || '').startsWith(String(anoAtual));
  }).length;
  var admAno = historico.filter(function(h) {
    return h.tipo === 'admissao' && String(h.dataEvento || '').startsWith(String(anoAtual));
  }).length;

  var mediaAtivos = Math.max(total, 1);
  var turnover = Math.round((desligAno / mediaAtivos) * 100);

  var folhaMes = folha.filter(function(f) { return f.mes === mesFolha; });
  var custoFolha = folhaMes.reduce(function(acc, f) { return acc + (parseFloat(f.custoTotal) || 0); }, 0);

  return {
    total: total, ativos: ativos, emFerias: emFerias,
    afastados: afastados, inativos: inativos,
    porSetor: porSetor, porVinculo: porVinculo,
    turnover: turnover, admissoesAno: admAno, desligamentosAno: desligAno,
    custoFolhaMes: Math.round(custoFolha * 100) / 100
  };
}

function obterDiversidadeRH() {
  var perfis = readJSON('rh_perfil_social.json') || [];
  var total  = perfis.length;

  if (total === 0) return { total: 0, racaCor: {}, genero: {}, escolaridade: {}, pcd: 0, pctPcd: 0, porEstado: {} };

  var racaCor = {}, genero = {}, escolaridade = {}, porEstado = {};
  var pcd = 0;

  perfis.forEach(function(p) {
    var r = p.racaCor || 'Não declarado';
    racaCor[r] = (racaCor[r] || 0) + 1;
    var g = p.genero || 'Não declarado';
    genero[g] = (genero[g] || 0) + 1;
    var e = p.escolaridade || 'Não informado';
    escolaridade[e] = (escolaridade[e] || 0) + 1;
    var est = p.estado || 'Não informado';
    porEstado[est] = (porEstado[est] || 0) + 1;
    if (p.pcd && p.pcd !== 'Não' && p.pcd !== 'Prefiro não declarar') pcd++;
  });

  return {
    total: total, racaCor: racaCor, genero: genero,
    escolaridade: escolaridade, pcd: pcd,
    pctPcd: Math.round((pcd / total) * 100),
    porEstado: porEstado
  };
}
