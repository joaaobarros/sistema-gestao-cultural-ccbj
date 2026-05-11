/**
 * @file backend/controllers/escuta_controller.gs
 * @layer backend/controllers
 * @description Fachada oficial do domínio Escuta Institucional.
 *
 * REGRA ARQUITETURAL:
 *   - A bridge aponta APENAS para funções ctrl_escuta_*.
 *   - Todo retorno é GasResponse: { ok, data, error, metadata }.
 *   - O motor real é modules/escuta/mod_escuta.gs.
 *   - Permissões verificadas via PermissoesService (não verificarPermissao direto).
 *
 * @depends shared/response.gs (GasResponse),
 *          modules/escuta/mod_escuta.gs,
 *          core/services/permissoes_service.gs (PermissoesService),
 *          core/utils.gs (obterEmailUsuario)
 */

// ═══════════════════════════════════════════════════════════════
// LEITURA
// ═══════════════════════════════════════════════════════════════

function ctrl_escuta_dados() {
  return GasResponse.wrap(function() { return obterDadosEscuta(); });
}

function ctrl_escuta_pergunta_pulse() {
  return GasResponse.wrap(function() { return obterPerguntaPulse(); });
}

function ctrl_escuta_dashboard(filtros) {
  return GasResponse.wrap(function() { return obterDashboardEscuta(filtros); });
}

function ctrl_escuta_alertas() {
  return GasResponse.wrap(function() { return obterAlertasEscuta(); });
}

function ctrl_escuta_pesquisas() {
  return GasResponse.wrap(function() { return obterPesquisasEscuta(); });
}

function ctrl_escuta_banco() {
  return GasResponse.wrap(function() { return obterBancoPesquisas(); });
}

function ctrl_escuta_config() {
  return GasResponse.wrap(function() { return obterConfiguracaoEscuta(); });
}

function ctrl_escuta_perguntas() {
  return GasResponse.wrap(function() { return obterPerguntasEscuta(); });
}

function ctrl_escuta_perfil() {
  return GasResponse.wrap(function() { return obterPerfilAnaliticoEscuta(); });
}

function ctrl_escuta_feedback() {
  return GasResponse.wrap(function() { return obterFeedbackEscuta(); });
}

function ctrl_escuta_saturacao() {
  return GasResponse.wrap(function() { return obterSaturacaoEscuta(); });
}

function ctrl_escuta_governanca() {
  return GasResponse.wrap(function() { return obterGovernancaEscuta(); });
}

function ctrl_escuta_mapa(periodo) {
  return GasResponse.wrap(function() { return obterMapaDadosEscuta(periodo); });
}

function ctrl_escuta_manual(secao) {
  return GasResponse.wrap(function() { return obterManualEscuta(secao); });
}

// ═══════════════════════════════════════════════════════════════
// ESCRITA
// ═══════════════════════════════════════════════════════════════

function ctrl_escuta_responder_pulse(dados) {
  return GasResponse.wrap(function() {
    if (dados && !dados.sessao) dados.sessao = '';
    return registrarRespostaPulse(dados);
  });
}

function ctrl_escuta_registrar_espontanea(dados) {
  return GasResponse.wrap(function() {
    if (dados && !dados.sessao) dados.sessao = '';
    return registrarEscutaEspontanea(dados);
  });
}

function ctrl_escuta_resolver_alerta(id, acao, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    return resolverAlertaEscuta(id, acao, email);
  });
}

function ctrl_escuta_salvar_pesquisa(dados) {
  return GasResponse.wrap(function() {
    return salvarPesquisaEscuta(dados);
  });
}

function ctrl_escuta_excluir_pesquisa(id, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    return excluirPesquisaEscuta(id, email);
  });
}

function ctrl_escuta_salvar_template(dados) {
  return GasResponse.wrap(function() { return salvarTemplateBancoPesquisas(dados); });
}

function ctrl_escuta_salvar_config(cfg) {
  return GasResponse.wrap(function() { return salvarConfiguracaoEscuta(cfg); });
}

function ctrl_escuta_atualizar_pergunta(id, controle) {
  return GasResponse.wrap(function() { return atualizarPerguntaEscuta(id, controle); });
}

function ctrl_escuta_salvar_perfil(dados) {
  return GasResponse.wrap(function() { return salvarPerfilAnaliticoEscuta(dados); });
}

// ═══════════════════════════════════════════════════════════════
// ANÁLISE E MOTOR METODOLÓGICO
// ═══════════════════════════════════════════════════════════════

function ctrl_escuta_gerar_relatorio(tipo, params) {
  return GasResponse.wrap(function() { return gerarRelatorioEscuta(tipo, params); });
}

function ctrl_escuta_simular_impacto(pesquisa) {
  return GasResponse.wrap(function() { return simularImpactoPesquisa(pesquisa); });
}

function ctrl_escuta_construir_fluxo(etapa, dados) {
  return GasResponse.wrap(function() { return construirFluxoPesquisa(etapa, dados); });
}

function ctrl_escuta_normalizar_pesquisa(pesquisa) {
  return GasResponse.wrap(function() { return normalizarPesquisaEscuta(pesquisa); });
}

function ctrl_escuta_sugerir_parametros(objetivo, publico) {
  return GasResponse.wrap(function() { return sugerirParametrosPesquisa(objetivo, publico); });
}

function ctrl_escuta_definir_total_colab(total) {
  return GasResponse.wrap(function() { return definirTotalColaboradoresEscuta(total); });
}
