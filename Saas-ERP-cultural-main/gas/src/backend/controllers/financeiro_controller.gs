/**
 * @file backend/controllers/financeiro_controller.gs
 * @layer backend/controllers
 * @description Fachada oficial do domínio Financeiro.
 *
 * REGRA ARQUITETURAL:
 *   - A bridge aponta APENAS para funções ctrl_fin_*.
 *   - Todo retorno é GasResponse: { ok, data, error, metadata }.
 *   - O motor real é modules/financeiro/mod_financeiro.gs.
 *
 * SEPARAÇÃO DE RESPONSABILIDADES:
 *   - Financeiro operacional: contratações, pagamentos, fluxo de caixa
 *   - Financeiro institucional: contratos (ctrl_contratos_*), indicadores (ctrl_contratos_salvar_indicador)
 *   - Separação plena de cálculos e repasses: FASE 5 avançada
 *
 * @depends shared/response.gs (GasResponse),
 *          modules/financeiro/mod_financeiro.gs,
 *          core/utils.gs (obterEmailUsuario)
 */

// ═══════════════════════════════════════════════════════════════
// CONTRATAÇÕES
// ═══════════════════════════════════════════════════════════════

function ctrl_fin_listar_contratacoes() {
  return GasResponse.wrap(function() {
    return obterContratacoes();
  });
}

function ctrl_fin_salvar_contratacao(dados, emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || ''); // garante identidade resolvida
    return salvarContratacao(dados);
  });
}

function ctrl_fin_excluir_contratacao(id, emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return excluirContratacao(id);
  });
}

// ═══════════════════════════════════════════════════════════════
// PAGAMENTOS
// ═══════════════════════════════════════════════════════════════

function ctrl_fin_listar_pagamentos() {
  return GasResponse.wrap(function() {
    return obterPagamentos();
  });
}

function ctrl_fin_registrar_pagamento(dados, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var resultado = registrarPagamento(dados);
    try {
      if (typeof AuditoriaService !== 'undefined' && AuditoriaService.registrar) {
        AuditoriaService.registrar({ acao: 'PAGAMENTO_REGISTRADO', entidade: 'financeiro',
          entidadeId: dados.id || '', usuario: email,
          detalhes: { valor: dados.valor, contratacao: dados.idContratacao } });
      }
    } catch(_) {}
    return resultado;
  });
}

// ═══════════════════════════════════════════════════════════════
// FLUXO DE CAIXA E INDICADORES
// ═══════════════════════════════════════════════════════════════

function ctrl_fin_fluxo_caixa() {
  return GasResponse.wrap(function() {
    return obterFluxoCaixa();
  });
}
