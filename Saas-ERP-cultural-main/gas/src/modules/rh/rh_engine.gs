/**
 * @file modules/rh/rh_engine.gs
 * @layer modules/rh
 * @description Motor de regras de negócio do domínio RH.
 *
 * Fluxo obrigatório:
 *   Controller → RHEngine → RHRepository → DataLayer
 *
 * Centraliza validações, estados oficiais e auditoria de:
 * cargos, histórico, avaliações, ponto, documentos, folha, PCCS.
 *
 * @depends modules/rh/rh_repository.gs (RHRepository),
 *          core/services/auditoria_service.gs (AuditoriaService),
 *          modules/rh/mod_rh.gs (obterIndicadoresRH, obterDiversidadeRH,
 *                                simularFolhaRH, aplicarReajustePCCS, obterPCCS)
 */

var STATUS_VINCULO = {
  ATIVO:      'ativo',
  INATIVO:    'inativo',
  AFASTADO:   'afastado',
  DESLIGADO:  'desligado',
  FERIAS:     'ferias'
};

var RHEngine = (function () {

  function _audit(evento, dados) {
    try {
      if (typeof AuditoriaService !== 'undefined')
        AuditoriaService.registrar(evento, 'rh', dados || {});
    } catch(_) {}
  }

  // ── Cargos ───────────────────────────────────────────────────────

  function listarCargos()     { return RHRepository.listarCargos(); }

  function salvarCargo(dados, email) {
    if (!dados || typeof dados !== 'object') throw new Error('Dados do cargo são obrigatórios.');
    var r = RHRepository.salvarCargo(dados);
    _audit(r.isNovo ? 'RH_CARGO_CRIADO' : 'RH_CARGO_ATUALIZADO',
      { id: r.id, nome: dados.nome || '', operador: email || '' });
    return r.id;
  }

  function excluirCargo(id, email) {
    if (!id) throw new Error('ID do cargo é obrigatório.');
    RHRepository.excluirCargo(id);
    _audit('RH_CARGO_EXCLUIDO', { id: id, operador: email || '' });
  }

  // ── Histórico ────────────────────────────────────────────────────

  function listarHistorico(idColaborador) {
    return RHRepository.listarHistorico(idColaborador || null);
  }

  function registrarEvento(dados, email) {
    if (!dados || typeof dados !== 'object') throw new Error('Dados do evento são obrigatórios.');
    if (!dados.registradoPor) dados.registradoPor = email || '';
    var r = RHRepository.salvarHistorico(dados);
    _audit('RH_EVENTO_REGISTRADO', { id: r.id, tipo: dados.tipo || '', colaborador: dados.idColaborador || '', operador: email || '' });
    return r.id;
  }

  function excluirEvento(id, email) {
    if (!id) throw new Error('ID do evento é obrigatório.');
    RHRepository.excluirHistorico(id);
    _audit('RH_EVENTO_EXCLUIDO', { id: id, operador: email || '' });
  }

  // ── Avaliações ───────────────────────────────────────────────────

  function listarAvaliacoes(idColaborador) {
    return RHRepository.listarAvaliacoes(idColaborador || null);
  }

  function salvarAvaliacao(dados, email) {
    if (!dados || typeof dados !== 'object') throw new Error('Dados da avaliação são obrigatórios.');
    if (!dados.avaliador) dados.avaliador = email || '';
    var r = RHRepository.salvarAvaliacao(dados);
    _audit(r.isNovo ? 'RH_AVALIACAO_CRIADA' : 'RH_AVALIACAO_ATUALIZADA',
      { id: r.id, colaborador: dados.idColaborador || '', avaliador: dados.avaliador });
    return r.id;
  }

  function excluirAvaliacao(id, email) {
    if (!id) throw new Error('ID da avaliação é obrigatório.');
    RHRepository.excluirAvaliacao(id);
    _audit('RH_AVALIACAO_EXCLUIDA', { id: id, operador: email || '' });
  }

  // ── Ponto ────────────────────────────────────────────────────────

  function listarPonto(idColaborador, mes) {
    return RHRepository.listarPonto(idColaborador || null, mes || null);
  }

  function registrarPonto(dados, email) {
    if (!dados || typeof dados !== 'object') throw new Error('Dados do ponto são obrigatórios.');
    var r = RHRepository.salvarPonto(dados);
    _audit('RH_PONTO_REGISTRADO', { id: r.id, colaborador: dados.idColaborador || '', operador: email || '' });
    return r.id;
  }

  function excluirPonto(id, email) {
    if (!id) throw new Error('ID do ponto é obrigatório.');
    RHRepository.excluirPonto(id);
    _audit('RH_PONTO_EXCLUIDO', { id: id, operador: email || '' });
  }

  // ── Documentos ───────────────────────────────────────────────────

  function listarDocumentos(idColaborador) {
    return RHRepository.listarDocumentos(idColaborador || null);
  }

  function salvarDocumento(dados, email) {
    if (!dados || typeof dados !== 'object') throw new Error('Dados do documento são obrigatórios.');
    var r = RHRepository.salvarDocumento(dados);
    _audit(r.isNovo ? 'RH_DOCUMENTO_CRIADO' : 'RH_DOCUMENTO_ATUALIZADO',
      { id: r.id, tipo: dados.tipo || '', colaborador: dados.idColaborador || '', operador: email || '' });
    return r.id;
  }

  function excluirDocumento(id, email) {
    if (!id) throw new Error('ID do documento é obrigatório.');
    RHRepository.excluirDocumento(id);
    _audit('RH_DOCUMENTO_EXCLUIDO', { id: id, operador: email || '' });
  }

  // ── Folha ────────────────────────────────────────────────────────

  function listarFolha(mes)   { return RHRepository.listarFolha(mes || null); }

  function salvarFolha(dados, email) {
    if (!dados || typeof dados !== 'object') throw new Error('Dados da folha são obrigatórios.');
    var r = RHRepository.salvarFolha(dados);
    _audit(r.isNovo ? 'RH_FOLHA_CRIADA' : 'RH_FOLHA_ATUALIZADA',
      { id: r.id, mes: dados.mes || '', operador: email || '' });
    return r.id;
  }

  // ── Perfil social ────────────────────────────────────────────────

  function obterPerfilSocial(id) { return RHRepository.obterPerfilSocial(id); }

  function salvarPerfilSocial(dados, email) {
    if (!dados || typeof dados !== 'object') throw new Error('Dados do perfil são obrigatórios.');
    var r = RHRepository.salvarPerfilSocial(dados);
    _audit('RH_PERFIL_SOCIAL_ATUALIZADO', { id: r.id, colaborador: dados.idColaborador || '', operador: email || '' });
    return r.id;
  }

  // ── Indicadores e diversidade — delegam ao mod_rh.gs ────────────

  function obterIndicadores() {
    return typeof obterIndicadoresRH === 'function' ? obterIndicadoresRH() : {};
  }

  function obterDiversidade() {
    return typeof obterDiversidadeRH === 'function' ? obterDiversidadeRH() : {};
  }

  // ── PCCS ─────────────────────────────────────────────────────────

  function obterPCCSCompleto() {
    return typeof obterPCCS === 'function' ? obterPCCS() : {
      parametros: RHRepository.obterParametrosPCCS(),
      tabela:     RHRepository.listarTabelaPCCS(),
      cargos:     RHRepository.listarCargosPCCS()
    };
  }

  function salvarParametrosPCCS(params, email) {
    if (!params || typeof params !== 'object') throw new Error('Parâmetros PCCS são obrigatórios.');
    RHRepository.salvarParametrosPCCS(params);
    _audit('RH_PCCS_PARAMS_ATUALIZADOS', { operador: email || '' });
  }

  function aplicarReajuste(percentual, email) {
    if (percentual === undefined || percentual === null) throw new Error('Percentual é obrigatório.');
    var resultado = typeof aplicarReajustePCCS === 'function' ? aplicarReajustePCCS(percentual) : null;
    _audit('RH_PCCS_REAJUSTE_APLICADO', { percentual: percentual, operador: email || '' });
    return resultado;
  }

  function salvarTabelaRow(row, email) {
    if (!row || typeof row !== 'object') throw new Error('Dados da tabela são obrigatórios.');
    var r = RHRepository.salvarTabelaRowPCCS(row);
    _audit('RH_PCCS_TABELA_ATUALIZADA', { id: r.id, operador: email || '' });
    return r.id;
  }

  function listarCargosPCCS()       { return RHRepository.listarCargosPCCS(); }

  function salvarCargoPCCS(d, email) {
    if (!d || typeof d !== 'object') throw new Error('Dados do cargo PCCS são obrigatórios.');
    var r = RHRepository.salvarCargoPCCS(d);
    _audit(r.isNovo ? 'RH_PCCS_CARGO_CRIADO' : 'RH_PCCS_CARGO_ATUALIZADO',
      { id: r.id, operador: email || '' });
    return r.id;
  }

  function excluirCargoPCCS(id, email) {
    if (!id) throw new Error('ID do cargo PCCS é obrigatório.');
    RHRepository.excluirCargoPCCS(id);
    _audit('RH_PCCS_CARGO_EXCLUIDO', { id: id, operador: email || '' });
  }

  function simularFolha(dados) {
    return typeof simularFolhaRH === 'function' ? simularFolhaRH(dados) : {};
  }

  // ── API pública ───────────────────────────────────────────────────

  return {
    listarCargos:        listarCargos,
    salvarCargo:         salvarCargo,
    excluirCargo:        excluirCargo,
    listarHistorico:     listarHistorico,
    registrarEvento:     registrarEvento,
    excluirEvento:       excluirEvento,
    listarAvaliacoes:    listarAvaliacoes,
    salvarAvaliacao:     salvarAvaliacao,
    excluirAvaliacao:    excluirAvaliacao,
    listarPonto:         listarPonto,
    registrarPonto:      registrarPonto,
    excluirPonto:        excluirPonto,
    listarDocumentos:    listarDocumentos,
    salvarDocumento:     salvarDocumento,
    excluirDocumento:    excluirDocumento,
    listarFolha:         listarFolha,
    salvarFolha:         salvarFolha,
    obterPerfilSocial:   obterPerfilSocial,
    salvarPerfilSocial:  salvarPerfilSocial,
    obterIndicadores:    obterIndicadores,
    obterDiversidade:    obterDiversidade,
    obterPCCSCompleto:   obterPCCSCompleto,
    salvarParametrosPCCS:salvarParametrosPCCS,
    aplicarReajuste:     aplicarReajuste,
    salvarTabelaRow:     salvarTabelaRow,
    listarCargosPCCS:    listarCargosPCCS,
    salvarCargoPCCS:     salvarCargoPCCS,
    excluirCargoPCCS:    excluirCargoPCCS,
    simularFolha:        simularFolha,
    STATUS_VINCULO:      STATUS_VINCULO
  };

})();
