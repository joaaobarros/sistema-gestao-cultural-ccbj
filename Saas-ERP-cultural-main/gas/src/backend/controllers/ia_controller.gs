/**
 * @file backend/controllers/ia_controller.gs
 * @layer backend/controllers
 * @description Fachada oficial do domínio IA.
 *
 * REGRA ARQUITETURAL:
 *   - A bridge aponta APENAS para funções ctrl_ia_*.
 *   - Todo retorno é GasResponse: { ok, data, error, metadata }.
 *   - Os providers de IA (Gemini, outros) NÃO são chamados diretamente pelo frontend.
 *   - NÃO acoplar IA ao SpreadsheetApp fora de adapters específicos.
 *
 * LIMITES DE RESPONSABILIDADE:
 *   - Este controller é o adapter entre o frontend e os serviços de IA.
 *   - Os serviços reais estão em backend/mod_metrics.gs (Gemini API).
 *   - Toda chamada de IA registra na auditoria para rastreabilidade.
 *
 * @depends shared/response.gs (GasResponse),
 *          backend/mod_metrics.gs (perguntarIA, gerarRelatorioIA, analisarDashboardIA,
 *                                   sugerirReservaIAComDados),
 *          core/utils.gs (obterEmailUsuario)
 */

/**
 * Responde pergunta em linguagem natural sobre os dados do sistema.
 * @param {string} pergunta
 */
function ctrl_ia_perguntar(pergunta) {
  return GasResponse.wrap(function() {
    return perguntarIA(pergunta);
  });
}

/**
 * Gera relatório analítico baseado em filtros via IA.
 * @param {Object} filtros
 */
function ctrl_ia_gerar_relatorio(filtros) {
  return GasResponse.wrap(function() {
    return gerarRelatorioIA(filtros);
  });
}

/**
 * Analisa dados de dashboard e retorna insights via IA.
 * @param {Object} metricas
 */
function ctrl_ia_analisar_dashboard(metricas) {
  return GasResponse.wrap(function() {
    return analisarDashboardIA(metricas);
  });
}

/**
 * Sugere reserva com base em descrição textual — integração IA + reservas.
 * @param {string} descricao
 */
function ctrl_ia_sugerir_reserva(descricao) {
  return GasResponse.wrap(function() {
    return sugerirReservaIAComDados(descricao);
  });
}

/**
 * Chamada genérica de IA com prompt e contexto.
 * Migra GAS.ia.chamar → ctrl_ia_chamar.
 * @param {string} prompt
 * @param {Object} ctx
 */
function ctrl_ia_chamar(prompt, ctx) {
  return GasResponse.wrap(function() {
    if (!prompt) throw new Error('Prompt é obrigatório.');
    return chamarIA(prompt, ctx || {});
  }, 'ctrl_ia_chamar');
}

/**
 * Reescreve descrição de ação via IA.
 * Migra GAS.ia.reescreverDescricao → ctrl_ia_reescrever.
 * @param {string} texto
 * @param {string} setor
 */
function ctrl_ia_reescrever(texto, setor) {
  return GasResponse.wrap(function() {
    if (!texto) throw new Error('Texto é obrigatório.');
    return reescreverDescricaoAcaoIA(texto, setor || '');
  }, 'ctrl_ia_reescrever');
}
