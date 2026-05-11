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
  var lista  = readJSON('rh_cargos.json') || [];
  var isNovo = !dados.id;
  if (isNovo) {
    dados.id = 'car_' + Date.now();
    dados.criadoEm = new Date().toISOString();
    lista.push(dados);
  } else {
    var i = lista.findIndex(function(c) { return c.id === dados.id; });
    if (i >= 0) lista[i] = dados;
    else lista.push(dados);
  }
  writeJSON('rh_cargos.json', lista);
  try {
    if (typeof AuditoriaService !== 'undefined')
      AuditoriaService.registrar(isNovo ? 'RH_CARGO_CRIADO' : 'RH_CARGO_ATUALIZADO',
        'rh', { id: dados.id, nome: dados.nome || '' });
  } catch(_) {}
  return { ok: true, id: dados.id };
}

function excluirCargoRH(id) {
  var lista = readJSON('rh_cargos.json') || [];
  writeJSON('rh_cargos.json', lista.filter(function(c) { return c.id !== id; }));
  try {
    if (typeof AuditoriaService !== 'undefined')
      AuditoriaService.registrar('RH_CARGO_EXCLUIDO', 'rh', { id: id });
  } catch(_) {}
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
  try {
    if (typeof AuditoriaService !== 'undefined')
      AuditoriaService.registrar('RH_EVENTO_REGISTRADO', 'rh',
        { id: dados.id, tipo: dados.tipo || '', colaborador: dados.idColaborador || '', registrador: dados.registradoPor });
  } catch(_) {}
  return { ok: true, id: dados.id };
}

function excluirEventoRH(id) {
  var lista = readJSON('rh_historico.json') || [];
  writeJSON('rh_historico.json', lista.filter(function(h) { return h.id !== id; }));
  try {
    if (typeof AuditoriaService !== 'undefined')
      AuditoriaService.registrar('RH_EVENTO_EXCLUIDO', 'rh', { id: id });
  } catch(_) {}
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

// ── PCCS — Plano de Cargos, Carreiras e Salários ────────────────────────────

var _PCCS_FILE = 'rh_pccs.json';

function _pccsTabela() {
  return [
    {tipo:'FIXA',classe:'PISO',grupo:'Administrativo',pontosMin:null,pontosMax:null,
     valorBase:1747.16,steps:[1747.16,1747.16,1747.16,1747.16,1747.16]},
    {tipo:'FIXA',classe:'A',grupo:'Administrativo',pontosMin:100,pontosMax:121,
     valorBase:1711.07,steps:[1796.62,1931.37,2076.22,2231.94,2399.34]},
    {tipo:'FIXA',classe:'B',grupo:'Administrativo',pontosMin:122,pontosMax:146,
     valorBase:2114.11,steps:[2219.82,2386.30,2565.27,2757.67,2964.50]},
    {tipo:'FIXA',classe:'C',grupo:'Administrativo',pontosMin:147,pontosMax:177,
     valorBase:2601.42,steps:[2731.49,2936.35,3156.58,3393.32,3647.82]},
    {tipo:'FIXA',classe:'D',grupo:'Administrativo',pontosMin:178,pontosMax:214,
     valorBase:3190.65,steps:[3350.18,3601.45,3871.55,4161.92,4474.07]},
    {tipo:'FIXA',classe:'E',grupo:'Administrativo',pontosMin:215,pontosMax:258,
     valorBase:3903.09,steps:[4098.24,4405.61,4736.03,5091.24,5473.08]},
    {tipo:'FIXA',classe:'F',grupo:'Administrativo',pontosMin:259,pontosMax:312,
     valorBase:4764.53,steps:[5002.76,5377.96,5781.31,6214.91,6681.03]},
    {tipo:'FIXA',classe:'G',grupo:'Administrativo',pontosMin:313,pontosMax:378,
     valorBase:5806.11,steps:[6096.42,6553.65,7045.17,7573.56,8141.57]},
    {tipo:'FIXA',classe:'H',grupo:'Administrativo',pontosMin:379,pontosMax:457,
     valorBase:7065.50,steps:[7418.78,7975.18,8573.32,9216.32,9907.55]},
    {tipo:'FIXA',classe:'I',grupo:'Administrativo',pontosMin:458,pontosMax:552,
     valorBase:8588.26,steps:[9017.67,9694.00,10421.05,11202.63,12042.82]},
    {tipo:'FIXA',classe:'J',grupo:'Administrativo',pontosMin:553,pontosMax:668,
     valorBase:10429.47,steps:[10950.94,11772.26,12655.18,13604.32,14624.65]},
    {tipo:'FIXA',classe:'K',grupo:'Administrativo',pontosMin:669,pontosMax:808,
     valorBase:12655.71,steps:[13288.50,14285.13,15356.52,16508.26,17746.38]},
    {tipo:'FIXA',classe:'L',grupo:'Administrativo',pontosMin:809,pontosMax:976,
     valorBase:15347.51,steps:[16114.89,17323.50,18622.76,20019.47,21520.93]},
    {tipo:'FIXA',classe:'M',grupo:'Administrativo',pontosMin:977,pontosMax:1181,
     valorBase:18602.23,steps:[19532.34,20997.27,22572.06,24264.97,26084.84]},
    {tipo:'FIXA',classe:'N',grupo:'Administrativo',pontosMin:1182,pontosMax:1428,
     valorBase:22537.58,steps:[23664.46,25439.29,27347.24,29398.28,31603.15]},
    {tipo:'FIXA',classe:'O',grupo:'Administrativo',pontosMin:1429,pontosMax:1726,
     valorBase:27295.89,steps:[28660.68,30810.24,33121.00,35605.08,38275.46]},
    {tipo:'FIXA',classe:'P',grupo:'Administrativo',pontosMin:1727,pontosMax:2087,
     valorBase:33049.27,steps:[34701.73,37304.36,40102.19,43109.86,46343.09]},
    {tipo:'FIXA',classe:'Q',grupo:'Administrativo',pontosMin:2088,pontosMax:2523,
     valorBase:40005.82,steps:[42006.11,45156.57,48543.31,52184.06,56097.86]},
    {tipo:'ORIENTADOR',classe:'F',grupo:'Gestão Tática',pontosMin:259,pontosMax:312,
     valorBase:4764.53,steps:[5002.76,5377.96,5781.31,6214.91,6681.03]},
    {tipo:'ORIENTADOR',classe:'G',grupo:'Gestão Tática',pontosMin:313,pontosMax:378,
     valorBase:5806.11,steps:[6096.42,6553.65,7045.17,7573.56,8141.57]},
    {tipo:'ORIENTADOR',classe:'H',grupo:'Gestão Tática',pontosMin:379,pontosMax:457,
     valorBase:7065.50,steps:[7418.78,7975.18,8573.32,9216.32,9907.55]},
    {tipo:'ORIENTADOR',classe:'I',grupo:'Gestão Tática',pontosMin:458,pontosMax:552,
     valorBase:8588.26,steps:[9017.67,9694.00,10421.05,11202.63,12042.82]},
    {tipo:'ORIENTADOR',classe:'J',grupo:'Gestão Tática',pontosMin:553,pontosMax:668,
     valorBase:10429.47,steps:[10950.94,11772.26,12655.18,13604.32,14624.65]},
    {tipo:'ORIENTADOR',classe:'K',grupo:'Gestão Tática',pontosMin:669,pontosMax:808,
     valorBase:12655.71,steps:[13288.50,14285.13,15356.52,16508.26,17746.38]},
    {tipo:'ORIENTADOR',classe:'L',grupo:'Gestão Tática',pontosMin:809,pontosMax:976,
     valorBase:15347.51,steps:[16114.89,17323.50,18622.76,20019.47,21520.93]},
    {tipo:'ORIENTADOR',classe:'M',grupo:'Gestão Tática',pontosMin:977,pontosMax:1181,
     valorBase:18602.23,steps:[19532.34,20997.27,22572.06,24264.97,26084.84]},
    {tipo:'ORIENTADOR',classe:'N',grupo:'Gestão Tática',pontosMin:1182,pontosMax:1428,
     valorBase:22537.58,steps:[23664.46,25439.29,27347.24,29398.28,31603.15]},
    {tipo:'ORIENTADOR',classe:'O',grupo:'Gestão Tática',pontosMin:1429,pontosMax:1726,
     valorBase:27295.89,steps:[28660.68,30810.24,33121.00,35605.08,38275.46]},
    {tipo:'ORIENTADOR',classe:'P',grupo:'Gestão Tática',pontosMin:1727,pontosMax:2087,
     valorBase:33049.27,steps:[34701.73,37304.36,40102.19,43109.86,46343.09]},
    {tipo:'ORIENTADOR',classe:'Q',grupo:'Gestão Tática',pontosMin:2088,pontosMax:2523,
     valorBase:40005.82,steps:[42006.11,45156.57,48543.31,52184.06,56097.86]}
  ];
}

function _pccsCargosDefault() {
  var rows = [
    // [area, nome, classe, tipoClasse, grupo]
    ['Gestão Estratégica','Diretor Presidente','O','ORIENTADOR','Gestão Estratégica'],
    ['Gestão Estratégica','Diretor Administrativo-Financeiro','M','ORIENTADOR','Gestão Estratégica'],
    ['Gestão Estratégica','Diretor de Ação Cultural','M','ORIENTADOR','Gestão Estratégica'],
    ['Gestão Estratégica','Diretor de Formação','M','ORIENTADOR','Gestão Estratégica'],
    ['Gestão Estratégica','Superintendente','L','ORIENTADOR','Gestão Estratégica'],
    ['Gestão Estratégica','Gerente Executivo II','J','ORIENTADOR','Gestão Estratégica'],
    ['Gestão Estratégica','Gerente Executivo I','I','ORIENTADOR','Gestão Estratégica'],
    ['Gestão Estratégica','Assessor de Governança','J','ORIENTADOR','Assessoramento'],
    ['Gestão Estratégica','Assessor de Gestão Cultural e Artística','J','ORIENTADOR','Assessoramento'],
    ['Gestão Estratégica','Assessor de Gestão Executiva III','J','ORIENTADOR','Assessoramento'],
    ['Gestão Estratégica','Assessor de Gestão Executiva II','I','ORIENTADOR','Assessoramento'],
    ['Gestão Estratégica','Assessor de Gestão Executiva I','H','ORIENTADOR','Assessoramento'],
    ['Gestão Estratégica','Assessor de Diretoria','G','ORIENTADOR','Assessoramento'],
    ['Comunicação e Marketing','Gerente de Comunicação e Marketing','I','ORIENTADOR','Gestão Tática'],
    ['Comunicação e Marketing','Coordenador de Marketing e Projetos','H','ORIENTADOR','Gestão Tática'],
    ['Comunicação e Marketing','Assessor de Marketing e Projetos','G','ORIENTADOR','Assessoramento'],
    ['Comunicação e Marketing','Analista de Marketing e Projetos','F','FIXA','Administrativo'],
    ['Comunicação e Marketing','Assistente de Marketing e Projetos','D','FIXA','Administrativo'],
    ['Comunicação e Marketing','Coordenador de Comunicação','H','ORIENTADOR','Gestão Tática'],
    ['Comunicação e Marketing','Assessor de Comunicação','G','ORIENTADOR','Assessoramento'],
    ['Comunicação e Marketing','Analista de Comunicação III','F','FIXA','Administrativo'],
    ['Comunicação e Marketing','Analista de Comunicação II','E','FIXA','Administrativo'],
    ['Comunicação e Marketing','Analista de Comunicação I','D','FIXA','Administrativo'],
    ['Comunicação e Marketing','Assistente de Comunicação','C','FIXA','Administrativo'],
    ['Inovação e TI','Gerente de Inovação e TI','J','ORIENTADOR','Gestão Tática'],
    ['Inovação e TI','Coordenador de Inovação','H','ORIENTADOR','Gestão Tática'],
    ['Inovação e TI','Assessor de Inovação','G','ORIENTADOR','Assessoramento'],
    ['Inovação e TI','Analista de Processos e Requisitos','D','FIXA','Administrativo'],
    ['Inovação e TI','Coordenador de Infraestrutura e Serviços de TI','I','ORIENTADOR','Gestão Tática'],
    ['Inovação e TI','Analista de Suporte em TI II','E','FIXA','Administrativo'],
    ['Inovação e TI','Analista de Suporte em TI I','D','FIXA','Administrativo'],
    ['Inovação e TI','Assistente de TI','C','FIXA','Administrativo'],
    ['Monitoramento e Controle','Gerente de Monitoramento e Controle','J','ORIENTADOR','Gestão Tática'],
    ['Monitoramento e Controle','Coordenador de Monitoramento','H','ORIENTADOR','Gestão Tática'],
    ['Monitoramento e Controle','Analista de Monitoramento','D','FIXA','Administrativo'],
    ['Monitoramento e Controle','Assistente de Monitoramento','C','FIXA','Administrativo'],
    ['Monitoramento e Controle','Coordenador de Prestação de Contas','H','ORIENTADOR','Gestão Tática'],
    ['Monitoramento e Controle','Supervisor de Prestação de Contas','E','FIXA','Administrativo'],
    ['Monitoramento e Controle','Analista de Prestação de Contas','D','FIXA','Administrativo'],
    ['Monitoramento e Controle','Assistente de Prestação de Contas','C','FIXA','Administrativo'],
    ['Administrativo Financeiro','Gerente Administrativo-Financeiro','J','ORIENTADOR','Gestão Tática'],
    ['Administrativo Financeiro','Coordenador de Compras','H','ORIENTADOR','Gestão Tática'],
    ['Administrativo Financeiro','Supervisor de Compras','F','FIXA','Administrativo'],
    ['Administrativo Financeiro','Analista de Compras','D','FIXA','Administrativo'],
    ['Administrativo Financeiro','Assistente de Compras','C','FIXA','Administrativo'],
    ['Administrativo Financeiro','Coordenador de Contratos','H','ORIENTADOR','Gestão Tática'],
    ['Administrativo Financeiro','Analista de Contratos','E','FIXA','Administrativo'],
    ['Administrativo Financeiro','Coordenador de Controle Interno','H','ORIENTADOR','Gestão Tática'],
    ['Administrativo Financeiro','Analista de Controle Interno','D','FIXA','Administrativo'],
    ['Administrativo Financeiro','Assistente de Controle Interno','B','FIXA','Administrativo'],
    ['Administrativo Financeiro','Coordenador Financeiro','H','ORIENTADOR','Gestão Tática'],
    ['Administrativo Financeiro','Supervisor Financeiro','F','FIXA','Administrativo'],
    ['Administrativo Financeiro','Analista Financeiro','D','FIXA','Administrativo'],
    ['Administrativo Financeiro','Coordenador de Tesouraria','H','ORIENTADOR','Gestão Tática'],
    ['Administrativo Financeiro','Analista de Tesouraria','E','FIXA','Administrativo'],
    ['Administrativo Financeiro','Assistente de Tesouraria','D','FIXA','Administrativo'],
    ['Administrativo Financeiro','Auxiliar de Tesouraria','A','FIXA','Administrativo'],
    ['Administrativo Financeiro','Coordenador Administrativo-Financeiro','H','ORIENTADOR','Gestão Tática'],
    ['Administrativo Financeiro','Supervisor Administrativo-Financeiro','F','FIXA','Administrativo'],
    ['Administrativo Financeiro','Analista Administrativo III','E','FIXA','Administrativo'],
    ['Administrativo Financeiro','Analista Administrativo II','D','FIXA','Administrativo'],
    ['Administrativo Financeiro','Analista Administrativo I','C','FIXA','Administrativo'],
    ['Administrativo Financeiro','Secretário','D','FIXA','Administrativo'],
    ['Administrativo Financeiro','Assistente Administrativo','A','FIXA','Administrativo'],
    ['Administrativo Financeiro','Auxiliar Administrativo','PISO','FIXA','Administrativo'],
    ['Segurança e Infraestrutura','Gerente Segurança e Infraestrutura','I','ORIENTADOR','Gestão Tática'],
    ['Segurança e Infraestrutura','Coordenador de Infraestrutura','H','ORIENTADOR','Gestão Tática'],
    ['Segurança e Infraestrutura','Supervisor de Infraestrutura','E','FIXA','Administrativo'],
    ['Segurança e Infraestrutura','Especialista de Infraestrutura','F','FIXA','Administrativo'],
    ['Segurança e Infraestrutura','Técnico de Infraestrutura','E','FIXA','Administrativo'],
    ['Segurança e Infraestrutura','Técnico de Segurança do Trabalho','D','FIXA','Administrativo'],
    ['Segurança e Infraestrutura','Técnico de Conservação e Manutenção','C','FIXA','Administrativo'],
    ['Segurança e Infraestrutura','Assistente de Infraestrutura','D','FIXA','Administrativo'],
    ['Segurança e Infraestrutura','Assistente de Conservação e Manutenção','B','FIXA','Administrativo'],
    ['Segurança e Infraestrutura','Eletricista','B','FIXA','Administrativo'],
    ['Segurança e Infraestrutura','Auxiliar de Serviços Gerais','PISO','FIXA','Administrativo'],
    ['Segurança e Infraestrutura','Jardineiro','PISO','FIXA','Administrativo'],
    ['Gestão de Pessoas','Gerente de Pessoas','I','ORIENTADOR','Gestão Tática'],
    ['Gestão de Pessoas','Coordenador de Desenvolvimento Humano','G','ORIENTADOR','Gestão Tática'],
    ['Gestão de Pessoas','Analista de Desenvolvimento Humano','D','FIXA','Administrativo'],
    ['Gestão de Pessoas','Psicóloga Organizacional','D','FIXA','Administrativo'],
    ['Gestão de Pessoas','Assistente de Desenvolvimento Humano','B','FIXA','Administrativo'],
    ['Gestão de Pessoas','Coordenador de Departamento Pessoal','G','ORIENTADOR','Gestão Tática'],
    ['Gestão de Pessoas','Supervisor de Departamento Pessoal','E','FIXA','Administrativo'],
    ['Gestão de Pessoas','Analista de Departamento Pessoal','D','FIXA','Administrativo'],
    ['Gestão de Pessoas','Assistente de Departamento Pessoal','B','FIXA','Administrativo'],
    ['Articulação e Cidadania','Gerente de Articulação Institucional','I','ORIENTADOR','Gestão Tática'],
    ['Articulação e Cidadania','Assessor de Articulação','H','ORIENTADOR','Assessoramento'],
    ['Articulação e Cidadania','Assessor de Cidadania Cultural','H','ORIENTADOR','Assessoramento'],
    ['Articulação e Cidadania','Coordenador de Cidadania Cultural','H','ORIENTADOR','Gestão Tática'],
    ['Articulação e Cidadania','Coordenador de Direitos Humanos','H','ORIENTADOR','Gestão Tática'],
    ['Articulação e Cidadania','Supervisor de Cidadania Cultural','F','FIXA','Operacional'],
    ['Articulação e Cidadania','Assistente Social','D','FIXA','Operacional'],
    ['Articulação e Cidadania','Técnico de Cidadania Cultural','D','FIXA','Operacional'],
    ['Articulação e Cidadania','Psicólogo Social','D','FIXA','Operacional'],
    ['Articulação e Cidadania','Educador Social','C','FIXA','Operacional'],
    ['Articulação e Cidadania','Articulador Comunitário','C','FIXA','Operacional'],
    ['Ação Cultural e Produção','Gerente de Ação Cultural','I','ORIENTADOR','Gestão Tática'],
    ['Ação Cultural e Produção','Coordenador de Ação Cultural','H','ORIENTADOR','Gestão Tática'],
    ['Ação Cultural e Produção','Supervisor de Ação Cultural','F','FIXA','Operacional'],
    ['Ação Cultural e Produção','Assistente de Ação Cultural','C','FIXA','Operacional'],
    ['Ação Cultural e Produção','Auxiliar de Ação Cultural','A','FIXA','Operacional'],
    ['Ação Cultural e Produção','Coordenador de Produção','H','ORIENTADOR','Gestão Tática'],
    ['Ação Cultural e Produção','Supervisor de Produção','F','FIXA','Operacional'],
    ['Ação Cultural e Produção','Produtor Cultural','D','FIXA','Operacional'],
    ['Ação Cultural e Produção','Assistente de Produção','B','FIXA','Operacional'],
    ['Áreas Técnicas','Coordenador Técnico','H','ORIENTADOR','Gestão Tática'],
    ['Áreas Técnicas','Produtor Audiovisual','F','FIXA','Operacional'],
    ['Áreas Técnicas','Produtor de Palco','F','FIXA','Operacional'],
    ['Áreas Técnicas','Técnico de Teatro','E','FIXA','Operacional'],
    ['Áreas Técnicas','Editor de TV e Vídeo','E','FIXA','Operacional'],
    ['Áreas Técnicas','Técnico de Audiovisual','D','FIXA','Operacional'],
    ['Áreas Técnicas','Técnico de Cinema','D','FIXA','Operacional'],
    ['Áreas Técnicas','Técnico de Som','D','FIXA','Operacional'],
    ['Áreas Técnicas','Técnico de Luz','D','FIXA','Operacional'],
    ['Áreas Técnicas','Técnico de Palco','D','FIXA','Operacional'],
    ['Áreas Técnicas','Assistente de Técnica','C','FIXA','Operacional'],
    ['Áreas Técnicas','Auxiliar Técnico','B','FIXA','Operacional'],
    ['Áreas Técnicas','Planetarista','B','FIXA','Operacional'],
    ['Áreas Técnicas','Projecionista','B','FIXA','Operacional'],
    ['Áreas Técnicas','Camareiro','A','FIXA','Operacional'],
    ['Formação e Ação Educativa','Gerente de Formação','I','ORIENTADOR','Gestão Tática'],
    ['Formação e Ação Educativa','Coordenador de Programa de Laboratórios','I','ORIENTADOR','Gestão Tática'],
    ['Formação e Ação Educativa','Coordenador de Pesquisa e Desenvolvimento','I','ORIENTADOR','Gestão Tática'],
    ['Formação e Ação Educativa','Coordenador de Formação III','I','ORIENTADOR','Gestão Tática'],
    ['Formação e Ação Educativa','Coordenador de Formação II','H','ORIENTADOR','Gestão Tática'],
    ['Formação e Ação Educativa','Coordenador Pedagógico','G','ORIENTADOR','Gestão Tática'],
    ['Formação e Ação Educativa','Coordenador de Formação I','F','ORIENTADOR','Gestão Tática'],
    ['Formação e Ação Educativa','Coordenador de Formação em Artes Visuais','H','ORIENTADOR','Gestão Tática'],
    ['Formação e Ação Educativa','Coordenador de Formação em Audiovisual II','H','ORIENTADOR','Gestão Tática'],
    ['Formação e Ação Educativa','Coordenador de Formação em Audiovisual I','F','ORIENTADOR','Gestão Tática'],
    ['Formação e Ação Educativa','Coordenador de Formação em Cinema','H','ORIENTADOR','Gestão Tática'],
    ['Formação e Ação Educativa','Coordenador de Formação Patrimonial','G','ORIENTADOR','Gestão Tática'],
    ['Formação e Ação Educativa','Coordenador de Formação em Cultura Digital','F','ORIENTADOR','Gestão Tática'],
    ['Formação e Ação Educativa','Coordenador de Formação em Dança II','H','ORIENTADOR','Gestão Tática'],
    ['Formação e Ação Educativa','Coordenador de Formação em Dança I','F','ORIENTADOR','Gestão Tática'],
    ['Formação e Ação Educativa','Coordenador de Formação em Música II','H','ORIENTADOR','Gestão Tática'],
    ['Formação e Ação Educativa','Coordenador de Formação em Música I','F','ORIENTADOR','Gestão Tática'],
    ['Formação e Ação Educativa','Coordenador de Formação em Teatro II','H','ORIENTADOR','Gestão Tática'],
    ['Formação e Ação Educativa','Coordenador de Formação em Teatro I','F','ORIENTADOR','Gestão Tática'],
    ['Formação e Ação Educativa','Secretaria Escolar','E','FIXA','Operacional'],
    ['Formação e Ação Educativa','Supervisor Pedagógico II','F','FIXA','Operacional'],
    ['Formação e Ação Educativa','Supervisor Pedagógico I','D','FIXA','Operacional'],
    ['Formação e Ação Educativa','Analista de Formação','E','FIXA','Operacional'],
    ['Formação e Ação Educativa','Assistente de Formação','D','FIXA','Operacional'],
    ['Formação e Ação Educativa','Professor de Música','C','FIXA','Operacional'],
    ['Formação e Ação Educativa','Professor de Dança','C','FIXA','Operacional'],
    ['Formação e Ação Educativa','Professor de Teatro','C','FIXA','Operacional'],
    ['Formação e Ação Educativa','Professor de Cultura Digital','C','FIXA','Operacional'],
    ['Formação e Ação Educativa','Professor de Audiovisual','C','FIXA','Operacional'],
    ['Formação e Ação Educativa','Auxiliar Pedagógico','A','FIXA','Operacional'],
    ['Formação e Ação Educativa','Atendente Escolar','PISO','FIXA','Operacional'],
    ['Formação e Ação Educativa','Coordenador de Ação Educativa','G','ORIENTADOR','Gestão Tática'],
    ['Formação e Ação Educativa','Assessor de Ação Educativa','F','ORIENTADOR','Operacional'],
    ['Formação e Ação Educativa','Supervisor de Ação Educativa','E','FIXA','Operacional'],
    ['Formação e Ação Educativa','Mediador Cultural II','D','FIXA','Operacional'],
    ['Formação e Ação Educativa','Mediador Cultural I','C','FIXA','Operacional'],
    ['Formação e Ação Educativa','Mediador Ambiental','C','FIXA','Operacional'],
    ['Formação e Ação Educativa','Assistente de Ação Educativa','B','FIXA','Operacional'],
    ['Operação','Coordenador de Operação','H','ORIENTADOR','Gestão Tática'],
    ['Operação','Supervisor de Operação','E','FIXA','Operacional'],
    ['Operação','Supervisor de Bilheteria','E','FIXA','Operacional'],
    ['Operação','Recepcionista Bilíngue','D','FIXA','Operacional'],
    ['Operação','Técnico de Operação','D','FIXA','Operacional'],
    ['Operação','Assistente de Operação','C','FIXA','Operacional'],
    ['Operação','Auxiliar de Operação','A','FIXA','Operacional'],
    ['Operação','Bilheteiro','A','FIXA','Operacional'],
    ['Operação','Recepcionista','PISO','FIXA','Operacional'],
    ['Acervo e Patrimônio','Gerente de Museu','J','ORIENTADOR','Gestão Tática'],
    ['Acervo e Patrimônio','Coordenador de Museu','H','ORIENTADOR','Gestão Tática'],
    ['Acervo e Patrimônio','Coordenador de Conservação e Restauro','G','ORIENTADOR','Gestão Tática'],
    ['Acervo e Patrimônio','Coordenador de Pesquisa e Acervo','H','ORIENTADOR','Gestão Tática'],
    ['Acervo e Patrimônio','Supervisor de Museu','F','FIXA','Operacional'],
    ['Acervo e Patrimônio','Supervisor de Conservação e Restauro','F','FIXA','Operacional'],
    ['Acervo e Patrimônio','Supervisor de Pesquisa e Acervo','F','FIXA','Operacional'],
    ['Acervo e Patrimônio','Bibliotecário II','F','FIXA','Operacional'],
    ['Acervo e Patrimônio','Bibliotecário I','D','FIXA','Operacional'],
    ['Acervo e Patrimônio','Restaurador','F','FIXA','Operacional'],
    ['Acervo e Patrimônio','Museólogo','G','FIXA','Operacional'],
    ['Acervo e Patrimônio','Técnico de Conservação e Restauro','D','FIXA','Operacional'],
    ['Acervo e Patrimônio','Técnico de Pesquisa e Acervo','D','FIXA','Operacional'],
    ['Acervo e Patrimônio','Assistente de Pesquisa e Acervo','C','FIXA','Operacional'],
    ['Acervo e Patrimônio','Técnico de Biblioteca','B','FIXA','Operacional'],
    ['Acervo e Patrimônio','Atendente de Biblioteca','A','FIXA','Operacional'],
    ['Cinema e Audiovisual','Coordenador de Planetário','H','ORIENTADOR','Gestão Tática'],
    ['Cinema e Audiovisual','Coordenador de Audiovisual','H','ORIENTADOR','Gestão Tática'],
    ['Cinema e Audiovisual','Coordenador de Cinema','H','ORIENTADOR','Gestão Tática'],
    ['Cinema e Audiovisual','Supervisor de Cinema','F','FIXA','Operacional'],
    ['Cinema e Audiovisual','Supervisor de Teatro','F','FIXA','Operacional'],
    ['Esporte','Coordenador de Esporte e Lazer','H','ORIENTADOR','Gestão Tática'],
    ['Esporte','Educador Esportivo','F','FIXA','Operacional'],
    ['Esporte','Técnico Esportivo','E','FIXA','Operacional'],
    ['Esporte','Assistente Esportivo','D','FIXA','Operacional'],
    ['Esporte','Auxiliar Esportivo','B','FIXA','Operacional'],
    ['Gastronomia','Supervisor de Cozinha','F','FIXA','Operacional'],
    ['Gastronomia','Técnico de Cozinha','E','FIXA','Operacional'],
    ['Gastronomia','Nutricionista','D','FIXA','Operacional'],
    ['Gastronomia','Assistente de Cozinha','D','FIXA','Operacional'],
    ['Gastronomia','Auxiliar de Cozinha','B','FIXA','Operacional'],
    ['Gastronomia','Horticultor','B','FIXA','Operacional'],
    ['Gastronomia','Auxiliar de Estoque','A','FIXA','Operacional']
  ];
  return rows.map(function(r, i) {
    var n = String(i + 1);
    while (n.length < 3) n = '0' + n;
    return { id: 'pccs_' + n, area: r[0], nome: r[1], classe: r[2], tipoClasse: r[3], grupo: r[4], ativo: true };
  });
}

function obterPCCS() {
  var d = readJSON(_PCCS_FILE);
  if (!d || !d.tabelaSalarial || !d.tabelaSalarial.length) {
    d = {
      parametros: {
        crescimentoStep: 0.075,
        amplitudeFaixa: 0.3355,
        crescimentoMedioClasse: 0.2178,
        pisoFaixaFixa: 1747.16,
        pisoOrientador: 1584.74,
        anoReferencia: 2025,
        atualizadoEm: new Date().toISOString()
      },
      tabelaSalarial: _pccsTabela(),
      cargos: _pccsCargosDefault()
    };
    writeJSON(_PCCS_FILE, d);
  }
  return d;
}

function salvarParametrosPCCS(params) {
  var d = obterPCCS();
  var p = d.parametros || {};
  Object.keys(params).forEach(function(k) { p[k] = params[k]; });
  p.atualizadoEm = new Date().toISOString();
  d.parametros = p;
  writeJSON(_PCCS_FILE, d);
  return { ok: true };
}

function aplicarReajustePCCS(percentual) {
  var pct = parseFloat(percentual);
  if (isNaN(pct) || pct <= 0) return { ok: false, msg: 'Percentual inválido' };
  var fator = 1 + pct / 100;
  var d = obterPCCS();
  d.tabelaSalarial = d.tabelaSalarial.map(function(row) {
    var r = JSON.parse(JSON.stringify(row));
    r.steps = r.steps.map(function(v) { return Math.round(v * fator * 100) / 100; });
    if (r.valorBase) r.valorBase = Math.round(r.valorBase * fator * 100) / 100;
    return r;
  });
  d.parametros = d.parametros || {};
  d.parametros.ultimoReajuste = pct;
  d.parametros.ultimoReajusteEm = new Date().toISOString();
  d.parametros.atualizadoEm = new Date().toISOString();
  writeJSON(_PCCS_FILE, d);
  return { ok: true };
}

function salvarTabelaRowPCCS(rowData) {
  var d = obterPCCS();
  var idx = -1;
  for (var i = 0; i < d.tabelaSalarial.length; i++) {
    if (d.tabelaSalarial[i].tipo === rowData.tipo && d.tabelaSalarial[i].classe === rowData.classe) {
      idx = i; break;
    }
  }
  if (idx >= 0) d.tabelaSalarial[idx] = rowData;
  else d.tabelaSalarial.push(rowData);
  writeJSON(_PCCS_FILE, d);
  return { ok: true };
}

function obterCargosPCCS() {
  var d = obterPCCS();
  return (d.cargos || []).filter(function(c) { return c.ativo !== false; });
}

function salvarCargoPCCS(dados) {
  var d = obterPCCS();
  if (!d.cargos) d.cargos = [];
  if (!dados.id) {
    dados.id = 'pccs_' + Date.now();
    dados.criadoEm = new Date().toISOString();
    d.cargos.push(dados);
  } else {
    var idx = -1;
    for (var i = 0; i < d.cargos.length; i++) {
      if (d.cargos[i].id === dados.id) { idx = i; break; }
    }
    if (idx >= 0) d.cargos[idx] = dados;
    else d.cargos.push(dados);
  }
  writeJSON(_PCCS_FILE, d);
  return { ok: true, id: dados.id };
}

function excluirCargoPCCS(id) {
  var d = obterPCCS();
  d.cargos = (d.cargos || []).filter(function(c) { return c.id !== id; });
  writeJSON(_PCCS_FILE, d);
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
