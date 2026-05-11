/**
 * @file backend/controllers/habilitacoes_controller.gs
 * @layer backend/controllers
 * @description Fachada oficial do domínio de Habilitações.
 *
 * REGRA ARQUITETURAL:
 *   - A bridge aponta APENAS para funções ctrl_hab_*.
 *   - Todo retorno é GasResponse: { ok, data, error, metadata }.
 *   - O motor real é HabilitacoesEngine → HabilitacoesRepository.
 *
 * @depends shared/response.gs (GasResponse),
 *          modules/programacao/habilitacoes_engine.gs (HabilitacoesEngine),
 *          modules/programacao/habilitacoes_repository.gs (HabilitacoesRepository),
 *          core/utils.gs (obterEmailUsuario),
 *          backend/mod_admin.gs (verificarPermissao)
 */

// ═══════════════════════════════════════════════════════════════
// LEITURA
// ═══════════════════════════════════════════════════════════════

/**
 * Lista todas as habilitações com métricas.
 * Exige perfil admin.
 * @param {string} emailFallback
 */
function ctrl_hab_listar(emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    verificarPermissao('admin', email);
    var dados = HabilitacoesRepository.listarTodos();
    return { dados: dados, metricas: HabilitacoesEngine.calcularMetricas(dados) };
  });
}

/**
 * Obtém uma habilitação pelo ID.
 * @param {string} id
 * @param {string} emailFallback
 */
function ctrl_hab_obter(id, emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    var hab = HabilitacoesRepository.obterPorId(id);
    if (!hab) throw new Error('Habilitação não encontrada: ' + id);
    return hab;
  });
}

/**
 * Retorna apenas métricas — para widgets de dashboard.
 * @param {string} emailFallback
 */
function ctrl_hab_metricas(emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    var dados = HabilitacoesRepository.listarTodos();
    return HabilitacoesEngine.calcularMetricas(dados);
  });
}

// ═══════════════════════════════════════════════════════════════
// ESCRITA
// ═══════════════════════════════════════════════════════════════

/**
 * Cria nova habilitação (qualquer usuário autenticado pode submeter).
 * @param {Object} dados — { proponente_nome, proponente_email, ... }
 * @param {string} emailFallback
 */
function ctrl_hab_criar(dados, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    var id = HabilitacoesEngine.submeter(dados, email);
    return { id: id };
  });
}

/**
 * Atualiza dados cadastrais de uma habilitação (sem mudar status).
 * @param {string} id
 * @param {Object} dados
 * @param {string} emailFallback
 */
function ctrl_hab_atualizar(id, dados, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    verificarPermissao('admin', email);
    HabilitacoesEngine.atualizarDados(id, dados, email);
    return { id: id };
  });
}

/**
 * Aplica transição de status via FSM oficial.
 * @param {string} id
 * @param {string} novoStatus — um dos STATUS_HABILITACAO.*
 * @param {string} observacao
 * @param {string} emailFallback
 */
function ctrl_hab_transicao(id, novoStatus, observacao, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    verificarPermissao('admin', email);
    return HabilitacoesEngine.aplicarTransicao(id, novoStatus, email, observacao || '');
  });
}
