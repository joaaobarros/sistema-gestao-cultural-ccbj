/**
 * @file modules/equipes/equipes_repository.gs
 * @layer modules/equipes
 * @description Repositório oficial do domínio Equipes.
 *
 * Encapsula TODO acesso a funcionarios.json, escalas.json, avaliacoes.json,
 * ferias.json via DataLayer. Nenhum outro módulo acessa esses arquivos diretamente.
 *
 * @depends core/data_layer.gs (readJSON, writeJSON)
 */

var EquipesRepository = (function () {

  // ── Funcionários ─────────────────────────────────────────────────

  function listarFuncionarios() {
    return readJSON('funcionarios.json') || [];
  }

  function obterFuncionarioPorId(id) {
    var lista = listarFuncionarios();
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].id === id) return lista[i];
    }
    return null;
  }

  function salvarFuncionario(dados) {
    var lista  = listarFuncionarios();
    var isNovo = !dados.id;
    if (isNovo) {
      dados.id       = 'fun_' + Date.now();
      dados.criadoEm = new Date().toISOString();
      dados.ativo    = dados.ativo !== false;
      lista.push(dados);
    } else {
      var idx = lista.findIndex(function(f) { return f.id === dados.id; });
      if (idx >= 0) lista[idx] = dados;
      else lista.push(dados);
    }
    writeJSON('funcionarios.json', lista);
    return { id: dados.id, isNovo: isNovo };
  }

  function excluirFuncionario(id) {
    var lista = listarFuncionarios();
    writeJSON('funcionarios.json', lista.filter(function(f) { return f.id !== id; }));
  }

  // ── Escalas ──────────────────────────────────────────────────────

  function listarEscalas() {
    return readJSON('escalas.json') || [];
  }

  function salvarEscala(dados) {
    var lista  = listarEscalas();
    var isNovo = !dados.id;
    if (isNovo) {
      dados.id       = 'esc_' + Date.now();
      dados.criadoEm = new Date().toISOString();
      lista.push(dados);
    } else {
      var idx = lista.findIndex(function(e) { return e.id === dados.id; });
      if (idx >= 0) lista[idx] = dados;
      else lista.push(dados);
    }
    writeJSON('escalas.json', lista);
    return { id: dados.id, isNovo: isNovo };
  }

  // ── Avaliações ───────────────────────────────────────────────────

  function listarAvaliacoes() {
    return readJSON('avaliacoes.json') || [];
  }

  function salvarAvaliacao(dados) {
    var lista  = listarAvaliacoes();
    var isNovo = !dados.id;
    if (isNovo) {
      dados.id       = 'aval_' + Date.now();
      dados.criadoEm = new Date().toISOString();
      lista.push(dados);
    } else {
      var idx = lista.findIndex(function(a) { return a.id === dados.id; });
      if (idx >= 0) lista[idx] = dados;
      else lista.push(dados);
    }
    writeJSON('avaliacoes.json', lista);
    return { id: dados.id, isNovo: isNovo };
  }

  // ── Férias ───────────────────────────────────────────────────────

  function listarFerias() {
    return readJSON('ferias.json') || [];
  }

  function salvarFerias(dados) {
    var lista  = listarFerias();
    var isNovo = !dados.id;
    if (isNovo) {
      dados.id       = 'fer_' + Date.now();
      dados.criadoEm = new Date().toISOString();
      dados.status   = dados.status || 'PENDENTE';
      lista.push(dados);
    } else {
      var idx = lista.findIndex(function(f) { return f.id === dados.id; });
      if (idx >= 0) lista[idx] = dados;
      else lista.push(dados);
    }
    writeJSON('ferias.json', lista);
    return { id: dados.id, isNovo: isNovo };
  }

  // ── API pública ───────────────────────────────────────────────────

  return {
    listarFuncionarios:   listarFuncionarios,
    obterFuncionarioPorId:obterFuncionarioPorId,
    salvarFuncionario:    salvarFuncionario,
    excluirFuncionario:   excluirFuncionario,
    listarEscalas:        listarEscalas,
    salvarEscala:         salvarEscala,
    listarAvaliacoes:     listarAvaliacoes,
    salvarAvaliacao:      salvarAvaliacao,
    listarFerias:         listarFerias,
    salvarFerias:         salvarFerias
  };

})();
