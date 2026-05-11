/**
 * @file backend/controllers/rh_controller.gs
 * @layer backend/controllers
 * @description Fachada oficial do domínio RH.
 *
 * REGRA ARQUITETURAL:
 *   - A bridge aponta APENAS para funções ctrl_rh_*.
 *   - Toda resposta é GasResponse: { ok, data, error, metadata }.
 *   - Toda mutação passa por RHEngine → RHRepository.
 *
 * @depends shared/response.gs (GasResponse),
 *          modules/rh/rh_engine.gs (RHEngine),
 *          backend/mod_admin.gs (obterEmailUsuario)
 */

// ═══════════════════════════════════════════════════════════════════
// CARGOS
// ═══════════════════════════════════════════════════════════════════

function ctrl_rh_listar_cargos(emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return RHEngine.listarCargos();
  }, 'ctrl_rh_listar_cargos');
}

function ctrl_rh_salvar_cargo(dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!dados || typeof dados !== 'object') throw new Error('Dados do cargo são obrigatórios.');
    var email = obterEmailUsuario(emailFallback || '');
    return { id: RHEngine.salvarCargo(dados, email) };
  }, 'ctrl_rh_salvar_cargo');
}

function ctrl_rh_excluir_cargo(id, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID do cargo é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    RHEngine.excluirCargo(id, email);
    return { ok: true };
  }, 'ctrl_rh_excluir_cargo');
}

// ═══════════════════════════════════════════════════════════════════
// HISTÓRICO
// ═══════════════════════════════════════════════════════════════════

function ctrl_rh_historico(idColaborador, emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return RHEngine.listarHistorico(idColaborador || null);
  }, 'ctrl_rh_historico');
}

function ctrl_rh_registrar_evento(dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!dados || typeof dados !== 'object') throw new Error('Dados do evento são obrigatórios.');
    var email = obterEmailUsuario(emailFallback || '');
    return { id: RHEngine.registrarEvento(dados, email) };
  }, 'ctrl_rh_registrar_evento');
}

function ctrl_rh_excluir_evento(id, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID do evento é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    RHEngine.excluirEvento(id, email);
    return { ok: true };
  }, 'ctrl_rh_excluir_evento');
}

// ═══════════════════════════════════════════════════════════════════
// AVALIAÇÕES
// ═══════════════════════════════════════════════════════════════════

function ctrl_rh_avaliacoes(idColaborador, emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return RHEngine.listarAvaliacoes(idColaborador || null);
  }, 'ctrl_rh_avaliacoes');
}

function ctrl_rh_salvar_avaliacao(dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!dados || typeof dados !== 'object') throw new Error('Dados da avaliação são obrigatórios.');
    var email = obterEmailUsuario(emailFallback || '');
    return { id: RHEngine.salvarAvaliacao(dados, email) };
  }, 'ctrl_rh_salvar_avaliacao');
}

function ctrl_rh_excluir_avaliacao(id, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID da avaliação é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    RHEngine.excluirAvaliacao(id, email);
    return { ok: true };
  }, 'ctrl_rh_excluir_avaliacao');
}

// ═══════════════════════════════════════════════════════════════════
// PONTO
// ═══════════════════════════════════════════════════════════════════

function ctrl_rh_ponto(idColaborador, mes, emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return RHEngine.listarPonto(idColaborador || null, mes || null);
  }, 'ctrl_rh_ponto');
}

function ctrl_rh_registrar_ponto(dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!dados || typeof dados !== 'object') throw new Error('Dados do ponto são obrigatórios.');
    var email = obterEmailUsuario(emailFallback || '');
    return { id: RHEngine.registrarPonto(dados, email) };
  }, 'ctrl_rh_registrar_ponto');
}

function ctrl_rh_excluir_ponto(id, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID do ponto é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    RHEngine.excluirPonto(id, email);
    return { ok: true };
  }, 'ctrl_rh_excluir_ponto');
}

// ═══════════════════════════════════════════════════════════════════
// DOCUMENTOS
// ═══════════════════════════════════════════════════════════════════

function ctrl_rh_documentos(idColaborador, emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return RHEngine.listarDocumentos(idColaborador || null);
  }, 'ctrl_rh_documentos');
}

function ctrl_rh_salvar_documento(dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!dados || typeof dados !== 'object') throw new Error('Dados do documento são obrigatórios.');
    var email = obterEmailUsuario(emailFallback || '');
    return { id: RHEngine.salvarDocumento(dados, email) };
  }, 'ctrl_rh_salvar_documento');
}

function ctrl_rh_excluir_documento(id, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID do documento é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    RHEngine.excluirDocumento(id, email);
    return { ok: true };
  }, 'ctrl_rh_excluir_documento');
}

// ═══════════════════════════════════════════════════════════════════
// FOLHA
// ═══════════════════════════════════════════════════════════════════

function ctrl_rh_folha(mes, emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return RHEngine.listarFolha(mes || null);
  }, 'ctrl_rh_folha');
}

function ctrl_rh_salvar_folha(dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!dados || typeof dados !== 'object') throw new Error('Dados da folha são obrigatórios.');
    var email = obterEmailUsuario(emailFallback || '');
    return { id: RHEngine.salvarFolha(dados, email) };
  }, 'ctrl_rh_salvar_folha');
}

function ctrl_rh_simular_folha(dados, emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return RHEngine.simularFolha(dados || {});
  }, 'ctrl_rh_simular_folha');
}

// ═══════════════════════════════════════════════════════════════════
// PERFIL SOCIAL
// ═══════════════════════════════════════════════════════════════════

function ctrl_rh_perfil_social(idColaborador, emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return RHEngine.obterPerfilSocial(idColaborador || '');
  }, 'ctrl_rh_perfil_social');
}

function ctrl_rh_salvar_perfil_social(dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!dados || typeof dados !== 'object') throw new Error('Dados do perfil são obrigatórios.');
    var email = obterEmailUsuario(emailFallback || '');
    return { id: RHEngine.salvarPerfilSocial(dados, email) };
  }, 'ctrl_rh_salvar_perfil_social');
}

// ═══════════════════════════════════════════════════════════════════
// INDICADORES E DIVERSIDADE
// ═══════════════════════════════════════════════════════════════════

function ctrl_rh_indicadores(emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return RHEngine.obterIndicadores();
  }, 'ctrl_rh_indicadores');
}

function ctrl_rh_diversidade(emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return RHEngine.obterDiversidade();
  }, 'ctrl_rh_diversidade');
}

// ═══════════════════════════════════════════════════════════════════
// PCCS
// ═══════════════════════════════════════════════════════════════════

function ctrl_rh_pccs(emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return RHEngine.obterPCCSCompleto();
  }, 'ctrl_rh_pccs');
}

function ctrl_rh_salvar_params_pccs(params, emailFallback) {
  return GasResponse.wrap(function() {
    if (!params || typeof params !== 'object') throw new Error('Parâmetros PCCS são obrigatórios.');
    var email = obterEmailUsuario(emailFallback || '');
    RHEngine.salvarParametrosPCCS(params, email);
    return { ok: true };
  }, 'ctrl_rh_salvar_params_pccs');
}

function ctrl_rh_aplicar_reajuste_pccs(percentual, emailFallback) {
  return GasResponse.wrap(function() {
    if (percentual === undefined || percentual === null) throw new Error('Percentual é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    return RHEngine.aplicarReajuste(percentual, email);
  }, 'ctrl_rh_aplicar_reajuste_pccs');
}

function ctrl_rh_salvar_tabela_pccs(row, emailFallback) {
  return GasResponse.wrap(function() {
    if (!row || typeof row !== 'object') throw new Error('Dados da linha são obrigatórios.');
    var email = obterEmailUsuario(emailFallback || '');
    return { id: RHEngine.salvarTabelaRow(row, email) };
  }, 'ctrl_rh_salvar_tabela_pccs');
}

function ctrl_rh_cargos_pccs(emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return RHEngine.listarCargosPCCS();
  }, 'ctrl_rh_cargos_pccs');
}

function ctrl_rh_salvar_cargo_pccs(dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!dados || typeof dados !== 'object') throw new Error('Dados do cargo PCCS são obrigatórios.');
    var email = obterEmailUsuario(emailFallback || '');
    return { id: RHEngine.salvarCargoPCCS(dados, email) };
  }, 'ctrl_rh_salvar_cargo_pccs');
}

function ctrl_rh_excluir_cargo_pccs(id, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID do cargo PCCS é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    RHEngine.excluirCargoPCCS(id, email);
    return { ok: true };
  }, 'ctrl_rh_excluir_cargo_pccs');
}
