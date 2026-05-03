/**
 * @file mod_pessoal.gs
 * @layer backend/modules
 * @description Tarefas, processos e atendimentos de balcão.
 *              Dados persistidos em Drive JSON via DataLayer.gs.
 */

// ── Tarefas ─────────────────────────────────────────────

function obterTarefas() {
  return readJSON('tarefas.json');
}

function salvarTarefa(dados) {
  var lista = readJSON('tarefas.json');
  if (!dados.id) {
    dados.id = 'tar_' + Date.now();
    dados.criadoEm = new Date().toISOString();
    lista.push(dados);
  } else {
    var encontrado = false;
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].id === dados.id) { lista[i] = dados; encontrado = true; break; }
    }
    if (!encontrado) lista.push(dados);
  }
  writeJSON('tarefas.json', lista);
  return { ok: true, id: dados.id };
}

function excluirTarefa(id) {
  var lista = readJSON('tarefas.json');
  writeJSON('tarefas.json', lista.filter(function(t) { return t.id !== id; }));
  return { ok: true };
}

// ── Processos ────────────────────────────────────────────

function obterProcessos() {
  return readJSON('processos.json');
}

function salvarProcesso(dados) {
  var lista = readJSON('processos.json');
  if (!dados.id) {
    dados.id = 'proc_' + Date.now();
    dados.criadoEm = new Date().toISOString();
    lista.push(dados);
  } else {
    var encontrado = false;
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].id === dados.id) { lista[i] = dados; encontrado = true; break; }
    }
    if (!encontrado) lista.push(dados);
  }
  writeJSON('processos.json', lista);
  return { ok: true, id: dados.id };
}

function excluirProcesso(id) {
  var lista = readJSON('processos.json');
  writeJSON('processos.json', lista.filter(function(p) { return p.id !== id; }));
  return { ok: true };
}

// ── Atendimentos (Balcão) ────────────────────────────────

function obterAtendimentos() {
  return readJSON('atendimentos.json');
}

function salvarAtendimento(dados) {
  var lista = readJSON('atendimentos.json');
  if (!dados.id) {
    dados.id = 'ate_' + Date.now();
    dados.criadoEm = new Date().toISOString();
    dados.status = dados.status || 'Aberto';
    lista.push(dados);
  } else {
    var encontrado = false;
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].id === dados.id) { lista[i] = dados; encontrado = true; break; }
    }
    if (!encontrado) lista.push(dados);
  }
  writeJSON('atendimentos.json', lista);
  return { ok: true, id: dados.id };
}

function excluirAtendimento(id) {
  var lista = readJSON('atendimentos.json');
  writeJSON('atendimentos.json', lista.filter(function(a) { return a.id !== id; }));
  return { ok: true };
}

// ── Demandas (legado, mantido) ───────────────────────────

function obterDemandas() {
  return readJSON('demandas.json');
}

function registrarDemanda(dados) {
  var lista = readJSON('demandas.json');
  dados.id = 'dem_' + Date.now();
  dados.criadoEm = new Date().toISOString();
  lista.push(dados);
  writeJSON('demandas.json', lista);
  return { ok: true, id: dados.id };
}
