/**
 * @file backend/controllers/equipes_controller.gs
 * @layer backend/controllers
 * @description Fachada oficial do domínio Equipes.
 *
 * REGRA ARQUITETURAL:
 *   - A bridge aponta APENAS para funções ctrl_equipes_*.
 *   - Toda resposta é GasResponse: { ok, data, error, metadata }.
 *   - Toda mutação passa por EquipesEngine → EquipesRepository.
 *
 * @depends shared/response.gs (GasResponse),
 *          modules/equipes/equipes_engine.gs (EquipesEngine),
 *          backend/mod_admin.gs (obterEmailUsuario)
 */

// ═══════════════════════════════════════════════════════════════════
// LEITURA
// ═══════════════════════════════════════════════════════════════════

/** Lista todos os funcionários. */
function ctrl_equipes_listar(emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return EquipesEngine.listar();
  }, 'ctrl_equipes_listar');
}

/** Lista funcionários de uma função específica (responsáveis, turno, etc.). */
function ctrl_equipes_listar_por_funcao(funcao, emailFallback) {
  return GasResponse.wrap(function() {
    if (!funcao) throw new Error('Função é obrigatória.');
    obterEmailUsuario(emailFallback || '');
    return EquipesEngine.listarPorFuncao(funcao);
  }, 'ctrl_equipes_listar_por_funcao');
}

/** Lista todas as escalas. */
function ctrl_equipes_escalas(emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return EquipesEngine.listarEscalas();
  }, 'ctrl_equipes_escalas');
}

/** Lista avaliações. */
function ctrl_equipes_avaliacoes(emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return EquipesEngine.listarAvaliacoes();
  }, 'ctrl_equipes_avaliacoes');
}

/** Lista solicitações de férias. */
function ctrl_equipes_ferias(emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return EquipesEngine.listarFerias();
  }, 'ctrl_equipes_ferias');
}

/** Retorna métricas de eficiência da equipe. */
function ctrl_equipes_metricas(emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return EquipesEngine.obterMetricasEficiencia();
  }, 'ctrl_equipes_metricas');
}

// ═══════════════════════════════════════════════════════════════════
// MUTAÇÕES — FUNCIONÁRIOS
// ═══════════════════════════════════════════════════════════════════

/**
 * Cria ou atualiza funcionário.
 * @param {Object} dados
 * @param {string} emailFallback
 */
function ctrl_equipes_salvar(dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!dados || typeof dados !== 'object') throw new Error('Dados do funcionário são obrigatórios.');
    var email = obterEmailUsuario(emailFallback || '');
    var id = EquipesEngine.salvar(dados, email);
    return { id: id };
  }, 'ctrl_equipes_salvar');
}

/**
 * Remove funcionário.
 * @param {string} id
 * @param {string} emailFallback
 */
function ctrl_equipes_excluir(id, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID do funcionário é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    EquipesEngine.excluir(id, email);
    return { ok: true };
  }, 'ctrl_equipes_excluir');
}

// ═══════════════════════════════════════════════════════════════════
// MUTAÇÕES — ESCALAS
// ═══════════════════════════════════════════════════════════════════

/**
 * Cria ou atualiza escala.
 * @param {Object} dados
 * @param {string} emailFallback
 */
function ctrl_equipes_salvar_escala(dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!dados || typeof dados !== 'object') throw new Error('Dados da escala são obrigatórios.');
    var email = obterEmailUsuario(emailFallback || '');
    var id = EquipesEngine.salvarEscala(dados, email);
    return { id: id };
  }, 'ctrl_equipes_salvar_escala');
}

// ═══════════════════════════════════════════════════════════════════
// MUTAÇÕES — AVALIAÇÕES
// ═══════════════════════════════════════════════════════════════════

/**
 * Registra avaliação de desempenho.
 * @param {Object} dados
 * @param {string} emailFallback
 */
function ctrl_equipes_registrar_avaliacao(dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!dados || typeof dados !== 'object') throw new Error('Dados da avaliação são obrigatórios.');
    var email = obterEmailUsuario(emailFallback || '');
    var id = EquipesEngine.registrarAvaliacao(dados, email);
    return { id: id };
  }, 'ctrl_equipes_registrar_avaliacao');
}

// ═══════════════════════════════════════════════════════════════════
// MUTAÇÕES — FÉRIAS
// ═══════════════════════════════════════════════════════════════════

/**
 * Solicita férias para um colaborador.
 * @param {Object} dados
 * @param {string} emailFallback
 */
function ctrl_equipes_solicitar_ferias(dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!dados || typeof dados !== 'object') throw new Error('Dados das férias são obrigatórios.');
    var email = obterEmailUsuario(emailFallback || '');
    var id = EquipesEngine.solicitarFerias(dados, email);
    return { id: id };
  }, 'ctrl_equipes_solicitar_ferias');
}
