/**
 * @file mod_equipes.gs
 * @layer backend/modules
 * @description Gestão de equipes: colaboradores, escalas, férias e métricas de eficiência.
 *              Dados persistidos em Drive JSON via DataLayer.gs.
 */

// ── Colaboradores ────────────────────────────────────────

function obterFuncionarios() {
  return readJSON('funcionarios.json');
}

function salvarFuncionario(dados) {
  var lista = readJSON('funcionarios.json');
  if (!dados.id) {
    dados.id = 'fun_' + Date.now();
    dados.criadoEm = new Date().toISOString();
    lista.push(dados);
  } else {
    var encontrado = false;
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].id === dados.id) { lista[i] = dados; encontrado = true; break; }
    }
    if (!encontrado) lista.push(dados);
  }
  writeJSON('funcionarios.json', lista);
  return { ok: true, id: dados.id };
}

function excluirFuncionario(id) {
  var lista = readJSON('funcionarios.json');
  writeJSON('funcionarios.json', lista.filter(function(f) { return f.id !== id; }));
  return { ok: true };
}

// ── Escalas ──────────────────────────────────────────────

function obterEscalas() {
  return readJSON('escalas.json');
}

function salvarEscala(dados) {
  var lista = readJSON('escalas.json');
  if (!dados.id) {
    dados.id = 'esc_' + Date.now();
    dados.criadoEm = new Date().toISOString();
    lista.push(dados);
  } else {
    var encontrado = false;
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].id === dados.id) { lista[i] = dados; encontrado = true; break; }
    }
    if (!encontrado) lista.push(dados);
  }
  writeJSON('escalas.json', lista);
  return { ok: true, id: dados.id };
}

// ── Avaliações ───────────────────────────────────────────

function obterAvaliacoes() {
  return readJSON('avaliacoes.json');
}

function registrarAvaliacao(dados) {
  var lista = readJSON('avaliacoes.json');
  dados.id = 'aval_' + Date.now();
  dados.criadoEm = new Date().toISOString();
  lista.push(dados);
  writeJSON('avaliacoes.json', lista);
  return { ok: true, id: dados.id };
}

// ── Férias ───────────────────────────────────────────────

function obterFerias() {
  return readJSON('ferias.json');
}

function solicitarFerias(dados) {
  var lista = readJSON('ferias.json');
  dados.id = 'fer_' + Date.now();
  dados.criadoEm = new Date().toISOString();
  dados.status = 'Pendente';
  lista.push(dados);
  writeJSON('ferias.json', lista);
  return { ok: true, id: dados.id };
}

// ── Eficiência ───────────────────────────────────────────

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

    if (r.sala) porSala[r.sala] = (porSala[r.sala] || 0) + 1;

    var mes = '';
    if (r.data) {
      try { mes = String(r.data).substring(0, 7); } catch(e) {}
    }
    if (mes) porMes[mes] = (porMes[mes] || 0) + 1;
  });

  var salasList = Object.keys(porSala).map(function(sala) {
    return { sala: sala, total: porSala[sala],
             pct: total > 0 ? Math.round(porSala[sala] / total * 100) : 0 };
  }).sort(function(a, b) { return b.total - a.total; });

  var mesesList = Object.keys(porMes).sort().map(function(mes) {
    return { mes: mes, total: porMes[mes] };
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
