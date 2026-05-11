/**
 * @file modules/rh/rh_repository.gs
 * @layer modules/rh
 * @description Repositório oficial do domínio RH.
 *
 * Encapsula TODO acesso a arquivos JSON do RH via DataLayer:
 * rh_cargos.json, rh_historico.json, rh_avaliacoes.json,
 * rh_ponto.json, rh_documentos.json, rh_folha.json, rh_social.json,
 * rh_pccs_params.json, rh_pccs_tabela.json, rh_pccs_cargos.json.
 *
 * @depends core/data_layer.gs (readJSON, writeJSON)
 */

var RHRepository = (function () {

  // ── Helpers genéricos ─────────────────────────────────────────────

  function _listar(arquivo) {
    return readJSON(arquivo) || [];
  }

  function _salvar(arquivo, dados, prefixo) {
    var lista  = _listar(arquivo);
    var isNovo = !dados.id;
    if (isNovo) {
      dados.id       = prefixo + '_' + Date.now();
      dados.criadoEm = new Date().toISOString();
      lista.push(dados);
    } else {
      var idx = lista.findIndex(function(x) { return x.id === dados.id; });
      if (idx >= 0) lista[idx] = dados;
      else lista.push(dados);
    }
    writeJSON(arquivo, lista);
    return { id: dados.id, isNovo: isNovo };
  }

  function _excluir(arquivo, id) {
    var lista = _listar(arquivo);
    writeJSON(arquivo, lista.filter(function(x) { return x.id !== id; }));
  }

  // ── Cargos ───────────────────────────────────────────────────────

  function listarCargos()       { return _listar('rh_cargos.json'); }
  function salvarCargo(d)       { return _salvar('rh_cargos.json', d, 'car'); }
  function excluirCargo(id)     { _excluir('rh_cargos.json', id); }

  // ── Histórico ────────────────────────────────────────────────────

  function listarHistorico(idColaborador) {
    var lista = _listar('rh_historico.json');
    if (idColaborador) lista = lista.filter(function(h) { return h.idColaborador === idColaborador; });
    return lista.sort(function(a, b) { return (b.dataEvento || '') < (a.dataEvento || '') ? -1 : 1; });
  }

  function salvarHistorico(d)   { return _salvar('rh_historico.json', d, 'hist'); }
  function excluirHistorico(id) { _excluir('rh_historico.json', id); }

  // ── Avaliações ───────────────────────────────────────────────────

  function listarAvaliacoes(idColaborador) {
    var lista = _listar('rh_avaliacoes.json');
    if (idColaborador) lista = lista.filter(function(a) { return a.idColaborador === idColaborador; });
    return lista;
  }

  function salvarAvaliacao(d)   { return _salvar('rh_avaliacoes.json', d, 'aval'); }
  function excluirAvaliacao(id) { _excluir('rh_avaliacoes.json', id); }

  // ── Ponto ────────────────────────────────────────────────────────

  function listarPonto(idColaborador, mes) {
    var lista = _listar('rh_ponto.json');
    if (idColaborador) lista = lista.filter(function(p) { return p.idColaborador === idColaborador; });
    if (mes)           lista = lista.filter(function(p) { return (p.mes || '').startsWith(mes); });
    return lista;
  }

  function salvarPonto(d)   { return _salvar('rh_ponto.json', d, 'ponto'); }
  function excluirPonto(id) { _excluir('rh_ponto.json', id); }

  // ── Documentos ───────────────────────────────────────────────────

  function listarDocumentos(idColaborador) {
    var lista = _listar('rh_documentos.json');
    if (idColaborador) lista = lista.filter(function(d) { return d.idColaborador === idColaborador; });
    return lista;
  }

  function salvarDocumento(d)   { return _salvar('rh_documentos.json', d, 'doc'); }
  function excluirDocumento(id) { _excluir('rh_documentos.json', id); }

  // ── Folha de pagamento ───────────────────────────────────────────

  function listarFolha(mes) {
    var lista = _listar('rh_folha.json');
    if (mes) lista = lista.filter(function(f) { return f.mes === mes; });
    return lista;
  }

  function salvarFolha(d)   { return _salvar('rh_folha.json', d, 'folha'); }

  // ── Perfil social ────────────────────────────────────────────────

  function obterPerfilSocial(idColaborador) {
    var lista = _listar('rh_social.json');
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].idColaborador === idColaborador) return lista[i];
    }
    return null;
  }

  function salvarPerfilSocial(d) { return _salvar('rh_social.json', d, 'soc'); }

  // ── PCCS ─────────────────────────────────────────────────────────

  function obterParametrosPCCS()        { return readJSON('rh_pccs_params.json') || {}; }
  function salvarParametrosPCCS(params) { writeJSON('rh_pccs_params.json', params); }

  function listarTabelaPCCS()           { return _listar('rh_pccs_tabela.json'); }
  function salvarTabelaRowPCCS(row)     { return _salvar('rh_pccs_tabela.json', row, 'pccs'); }

  function listarCargosPCCS()           { return _listar('rh_pccs_cargos.json'); }
  function salvarCargoPCCS(d)           { return _salvar('rh_pccs_cargos.json', d, 'pcargo'); }
  function excluirCargoPCCS(id)         { _excluir('rh_pccs_cargos.json', id); }

  // ── API pública ───────────────────────────────────────────────────

  return {
    listarCargos:        listarCargos,
    salvarCargo:         salvarCargo,
    excluirCargo:        excluirCargo,
    listarHistorico:     listarHistorico,
    salvarHistorico:     salvarHistorico,
    excluirHistorico:    excluirHistorico,
    listarAvaliacoes:    listarAvaliacoes,
    salvarAvaliacao:     salvarAvaliacao,
    excluirAvaliacao:    excluirAvaliacao,
    listarPonto:         listarPonto,
    salvarPonto:         salvarPonto,
    excluirPonto:        excluirPonto,
    listarDocumentos:    listarDocumentos,
    salvarDocumento:     salvarDocumento,
    excluirDocumento:    excluirDocumento,
    listarFolha:         listarFolha,
    salvarFolha:         salvarFolha,
    obterPerfilSocial:   obterPerfilSocial,
    salvarPerfilSocial:  salvarPerfilSocial,
    obterParametrosPCCS: obterParametrosPCCS,
    salvarParametrosPCCS:salvarParametrosPCCS,
    listarTabelaPCCS:    listarTabelaPCCS,
    salvarTabelaRowPCCS: salvarTabelaRowPCCS,
    listarCargosPCCS:    listarCargosPCCS,
    salvarCargoPCCS:     salvarCargoPCCS,
    excluirCargoPCCS:    excluirCargoPCCS
  };

})();
