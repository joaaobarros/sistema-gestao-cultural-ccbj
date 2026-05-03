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
  if (!dados.id) {
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
