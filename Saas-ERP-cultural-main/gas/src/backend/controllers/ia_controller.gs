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
 *   - Os serviços reais estão em core/services/ia_service.gs (IAService).
 *   - Toda chamada de IA registra na auditoria para rastreabilidade.
 *
 * @depends shared/response.gs (GasResponse),
 *          core/services/ia_service.gs (IAService),
 *          core/utils.gs (obterEmailUsuario)
 */

/**
 * Responde pergunta em linguagem natural sobre os dados do sistema.
 * @param {string} pergunta
 */
function ctrl_ia_perguntar(pergunta) {
  return GasResponse.wrap(function() {
    return IAService.perguntar(pergunta);
  });
}

function ctrl_ia_gerar_relatorio(filtros) {
  return GasResponse.wrap(function() {
    return IAService.gerarRelatorio(filtros);
  });
}

function ctrl_ia_analisar_dashboard(metricas) {
  return GasResponse.wrap(function() {
    return IAService.analisarDashboard(metricas);
  });
}

function ctrl_ia_sugerir_reserva(descricao) {
  return GasResponse.wrap(function() {
    return IAService.sugerirReservaComDados(descricao);
  });
}

function ctrl_ia_chamar(prompt, ctx) {
  return GasResponse.wrap(function() {
    if (!prompt) throw new Error('Prompt é obrigatório.');
    return IAService.chamar(prompt);
  }, 'ctrl_ia_chamar');
}

function ctrl_ia_reescrever(texto, setor) {
  return GasResponse.wrap(function() {
    if (!texto) throw new Error('Texto é obrigatório.');
    return IAService.reescreverDescricaoAcao(texto, setor || '');
  }, 'ctrl_ia_reescrever');
}
