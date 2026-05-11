/**
 * @file mod_equipes.gs
 * @layer backend/modules
 * @description Gestão de equipes: colaboradores, funções, substituições, escalas,
 *              férias e métricas de eficiência.
 *              Dados persistidos em Drive JSON via DataLayer.gs.
 *
 * PRINCÍPIO:
 * Pessoa ≠ Função ≠ Setor
 * Permite flexibilidade total de operação.
 */

// =====================================================
// COLABORADORES (BASE PRINCIPAL)
// =====================================================

function obterFuncionarios() {
  return readJSON('funcionarios.json') || [];
}

function salvarFuncionario(dados) {
  var lista = readJSON('funcionarios.json') || [];
  var isNovo = !dados.id;

  if (isNovo) {
    dados.id = 'fun_' + Date.now();
    dados.criadoEm = new Date().toISOString();
    dados.ativo = dados.ativo !== false;
    lista.push(dados);
  } else {
    var i = lista.findIndex(function(f){ return f.id === dados.id; });
    if (i >= 0) lista[i] = dados;
    else lista.push(dados);
  }

  writeJSON('funcionarios.json', lista);
  try {
    if (typeof AuditoriaService !== 'undefined')
      AuditoriaService.registrar(isNovo ? 'EQUIPE_FUNCIONARIO_CRIADO' : 'EQUIPE_FUNCIONARIO_ATUALIZADO',
        'equipes', { id: dados.id, nome: dados.nome || '', email: dados.email_institucional || '' });
  } catch(_) {}
  return { ok: true, id: dados.id };
}

function excluirFuncionario(id) {
  var lista = readJSON('funcionarios.json') || [];
  writeJSON('funcionarios.json', lista.filter(function(f) { return f.id !== id; }));
  try {
    if (typeof AuditoriaService !== 'undefined')
      AuditoriaService.registrar('EQUIPE_FUNCIONARIO_EXCLUIDO', 'equipes', { id: id });
  } catch(_) {}
  return { ok: true };
}

// =====================================================
// FUNÇÃO CENTRAL DO SISTEMA (RESPONSÁVEIS)
// =====================================================

function obterResponsaveisPorTipo(tipo) {

  var equipe = readJSON('funcionarios.json') || [];
  var hoje = new Date().toISOString().slice(0,10);

  var responsaveis = [];

  equipe.forEach(function(p){

    if (!p.ativo) return;

    var funcoes = p.funcoes || [];
    var substituicoes = p.substituicoes || [];

    // 1. função direta
    var temFuncao = funcoes.some(function(f){
      return f.tipo === tipo && f.ativo !== false;
    });

    // 2. substituição ativa
    var substituindo = substituicoes.some(function(s){
      return s.tipo === tipo &&
             (!s.inicio || s.inicio <= hoje) &&
             (!s.fim || s.fim >= hoje);
    });

    if (temFuncao || substituindo) {
      if (p.email_institucional) {
        responsaveis.push(p.email_institucional);
      }
    }

  });

  return responsaveis;
}

// =====================================================
// ESCALAS
// =====================================================

function obterEscalas() {
  return readJSON('escalas.json') || [];
}

function salvarEscala(dados) {
  var lista = readJSON('escalas.json') || [];

  if (!dados.id) {
    dados.id = 'esc_' + Date.now();
    dados.criadoEm = new Date().toISOString();
    lista.push(dados);
  } else {
    var i = lista.findIndex(function(e){ return e.id === dados.id; });
    if (i >= 0) lista[i] = dados;
    else lista.push(dados);
  }

  writeJSON('escalas.json', lista);
  return { ok: true, id: dados.id };
}

// =====================================================
// AVALIAÇÕES
// =====================================================

function obterAvaliacoes() {
  return readJSON('avaliacoes.json') || [];
}

function registrarAvaliacao(dados) {
  var lista = readJSON('avaliacoes.json') || [];

  dados.id = 'aval_' + Date.now();
  dados.criadoEm = new Date().toISOString();

  lista.push(dados);
  writeJSON('avaliacoes.json', lista);

  return { ok: true, id: dados.id };
}

// =====================================================
// FÉRIAS
// =====================================================

function obterFerias() {
  return readJSON('ferias.json') || [];
}

function solicitarFerias(dados) {
  var lista = readJSON('ferias.json') || [];

  dados.id = 'fer_' + Date.now();
  dados.criadoEm = new Date().toISOString();
  dados.status = 'Pendente';

  lista.push(dados);
  writeJSON('ferias.json', lista);

  return { ok: true, id: dados.id };
}

// =====================================================
// EFICIÊNCIA (mantido)
// =====================================================

function obterMetricasEficiencia() {

  var reservas = [];
  try { reservas = obterReservas(); } catch(e) { reservas = []; }

  var total = reservas.length;
  var confirmadas = 0, canceladas = 0;
  var porSala = {}, porMes = {};

  reservas.forEach(function(r) {

    var s = String(r.status || '').toLowerCase();

    if (s === 'cancelado' || s === 'cancelada') canceladas++;
    else confirmadas++;

    if (r.sala) {
      porSala[r.sala] = (porSala[r.sala] || 0) + 1;
    }

    var mes = '';
    if (r.data) {
      try { mes = String(r.data).substring(0, 7); } catch(e) {}
    }

    if (mes) {
      porMes[mes] = (porMes[mes] || 0) + 1;
    }

  });

  var salasList = Object.keys(porSala).map(function(sala) {
    return {
      sala: sala,
      total: porSala[sala],
      pct: total > 0 ? Math.round(porSala[sala] / total * 100) : 0
    };
  }).sort(function(a, b) {
    return b.total - a.total;
  });

  var mesesList = Object.keys(porMes).sort().map(function(mes) {
    return {
      mes: mes,
      total: porMes[mes]
    };
  });

  return {
    total: total,
    confirmadas: confirmadas,
    canceladas: canceladas,
    taxaCancelamento: total > 0 ? Math.round(canceladas / total * 100) : 0,
    porSala: salasList,
    porMes: mesesList
  };
}

function listarEquipePorFuncao(funcao) {

  var aba = _abrirAba('EQUIPES', 'Funcionarios');
  var dados = aba.getDataRange().getValues();
  var headers = dados[0];

  var idx = {};
  headers.forEach(function(h,i){ idx[h]=i });

  var lista = [];

  for (var i = 1; i < dados.length; i++) {

    var row = dados[i];

    var status = String(row[idx['Status']] || '').toLowerCase();
    if (status !== 'ativo') continue;

    var email = row[idx['Email Institucional']];
    var nome  = row[idx['Nome']];

    if (!email) continue;

    var funcoes = [];
    try {
      funcoes = JSON.parse(row[idx['Funcoes']] || '[]');
    } catch(e){}

    var pertence = funcoes.some(function(f){
      return f.tipo === funcao && f.ativo !== false;
    });

    if (pertence) {
      lista.push({
        nome: nome,
        email: email
      });
    }

  }

  return lista;
}