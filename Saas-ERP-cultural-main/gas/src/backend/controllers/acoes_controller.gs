/**
 * @file backend/controllers/acoes_controller.gs
 * @layer backend/controllers
 * @description Fachada oficial do domínio de Ações Institucionais.
 *
 * REGRA ARQUITETURAL:
 *   - A bridge aponta APENAS para funções ctrl_acoes_*.
 *   - Todo retorno é GasResponse: { ok, data, error, metadata }.
 *   - O motor real é action_engine.gs (criarAcao, mudarStatusAcao, ...).
 *
 * @depends shared/response.gs (GasResponse),
 *          action_engine/action_engine.gs,
 *          core/utils.gs (obterEmailUsuario)
 */

// ═══════════════════════════════════════════════════════════════
// LEITURA
// ═══════════════════════════════════════════════════════════════

/**
 * Lista Ações com filtros opcionais.
 * @param {Object} filtros — { status, tipo, responsavel }
 */
function ctrl_acoes_listar(filtros) {
  return GasResponse.wrap(function() {
    return listarAcoes(filtros || {});
  });
}

/**
 * Obtém uma Ação pelo ID.
 * @param {string} id
 */
function ctrl_acoes_obter(id) {
  return GasResponse.wrap(function() {
    var acao = obterAcao(id);
    if (!acao) throw new Error('Ação não encontrada: ' + id);
    return acao;
  });
}

/**
 * Retorna recursos associados a uma Ação.
 * @param {string} acaoId
 */
function ctrl_acoes_obter_recursos(acaoId) {
  return GasResponse.wrap(function() {
    return obterRecursosDaAcao(acaoId);
  });
}

// ═══════════════════════════════════════════════════════════════
// ESCRITA
// ═══════════════════════════════════════════════════════════════

/**
 * Cria nova Ação.
 * @param {Object} dados — { nome, tipo, descricao, responsavel, dataInicio, dataFim, equipe[] }
 * @param {string} emailFallback
 */
function ctrl_acoes_criar(dados, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    var resultado = criarAcao(dados, email);
    if (!resultado.ok) throw new Error(resultado.erro || 'Erro ao criar ação.');
    return resultado;
  });
}

/**
 * Atualiza dados de uma Ação (sem mudar status).
 * @param {string} id
 * @param {Object} dados
 * @param {string} emailFallback
 */
function ctrl_acoes_atualizar(id, dados, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var resultado = atualizarAcao(id, dados, email);
    if (!resultado.ok) throw new Error(resultado.erro || 'Erro ao atualizar ação.');
    return resultado;
  });
}

/**
 * Transição de status via FSM oficial.
 * @param {string} id
 * @param {string} novoStatus — um dos ACTION_ESTADOS.*
 * @param {string} emailFallback
 * @param {string} motivo
 */
function ctrl_acoes_mudar_status(id, novoStatus, emailFallback, motivo) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var resultado = mudarStatusAcao(id, novoStatus, email, motivo || '');
    if (!resultado.ok) throw new Error(resultado.erro || 'Erro na transição de status.');
    return resultado;
  });
}

/**
 * Associa um recurso externo a uma Ação (reserva, contrato, tarefa…).
 * @param {string} acaoId
 * @param {string} tipo — 'reserva' | 'contrato' | 'tarefa' | 'chave' | 'relatorio'
 * @param {string} recursoId
 * @param {string} emailFallback
 */
function ctrl_acoes_associar_recurso(acaoId, tipo, recursoId, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var resultado = associarRecurso(acaoId, tipo, recursoId, email);
    if (!resultado.ok) throw new Error(resultado.erro || 'Erro ao associar recurso.');
    return resultado;
  });
}
