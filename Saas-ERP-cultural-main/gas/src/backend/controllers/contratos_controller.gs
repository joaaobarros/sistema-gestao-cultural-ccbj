/**
 * @file backend/controllers/contratos_controller.gs
 * @layer backend/controllers
 * @description Fachada oficial do domínio de Contratos.
 *
 * REGRA ARQUITETURAL:
 *   - A bridge aponta APENAS para funções ctrl_contratos_*.
 *   - Todo retorno é GasResponse: { ok, data, error, metadata }.
 *   - Motor de status: ContratosEngine (contratos_engine.gs).
 *   - CRUD: ContratoRepository (modules/contratos/contrato_repository.gs).
 *
 * @depends shared/response.gs (GasResponse),
 *          modules/contratos/contratos_engine.gs (ContratosEngine),
 *          modules/contratos/contrato_repository.gs (ContratoRepository),
 *          modules/contratos/contrato_analytics_service.gs (ContratoAnalyticsService),
 *          core/utils.gs (obterEmailUsuario)
 */

// ═══════════════════════════════════════════════════════════════
// LEITURA
// ═══════════════════════════════════════════════════════════════

function ctrl_contratos_listar() {
  return GasResponse.wrap(function() {
    return ContratoRepository.listar();
  });
}

function ctrl_contratos_dados() {
  return GasResponse.wrap(function() {
    return ContratoRepository.obterDados();
  });
}

function ctrl_contratos_memorias_rubrica(idRubrica) {
  return GasResponse.wrap(function() {
    return ContratoRepository.obterMemoriaRubrica(idRubrica);
  });
}

function ctrl_contratos_historico_rubrica(idRubrica) {
  return GasResponse.wrap(function() {
    return ContratoRepository.obterHistoricoRubrica(idRubrica);
  });
}

function ctrl_contratos_comparativo(idContrato, v1, v2) {
  return GasResponse.wrap(function() {
    return ContratoAnalyticsService.dashboard(idContrato, v1, v2);
  });
}

// ═══════════════════════════════════════════════════════════════
// CONTRATOS — ESCRITA
// ═══════════════════════════════════════════════════════════════

function ctrl_contratos_salvar(dados, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var ok = ContratoRepository.salvar(dados, email);
    if (!ok) throw new Error('Erro ao salvar contrato.');
    try {
      if (typeof AuditoriaService !== 'undefined' && AuditoriaService.registrar) {
        var acao = dados.id ? 'CONTRATO_ATUALIZADO' : 'CONTRATO_CRIADO';
        AuditoriaService.registrar({ acao: acao, entidade: 'contrato', entidadeId: dados.id || '', usuario: email, detalhes: { nome: dados.nome } });
      }
    } catch(_) {}
    return { ok: true };
  });
}

function ctrl_contratos_excluir(id, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var ok = ContratoRepository.excluir(id, email);
    if (!ok) throw new Error('Erro ao excluir contrato.');
    return { ok: true };
  });
}

/**
 * Transição de status via FSM oficial.
 * @param {string} id
 * @param {string} novoStatus — um dos STATUS_CONTRATO.*
 * @param {string} emailFallback
 */
function ctrl_contratos_status(id, novoStatus, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    return ContratosEngine.aplicarTransicao(id, novoStatus, email);
  });
}

// ═══════════════════════════════════════════════════════════════
// METAS
// ═══════════════════════════════════════════════════════════════

function ctrl_contratos_salvar_meta(dados, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    return ContratoRepository.salvarMeta(dados, email);
  });
}

function ctrl_contratos_excluir_meta(id, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    return ContratoRepository.excluirMeta(id, email);
  });
}

// ═══════════════════════════════════════════════════════════════
// RUBRICAS
// ═══════════════════════════════════════════════════════════════

function ctrl_contratos_salvar_rubrica(dados, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    return ContratoRepository.salvarRubrica(dados, email);
  });
}

function ctrl_contratos_excluir_rubrica(id, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    return ContratoRepository.excluirRubrica(id, email);
  });
}

// ═══════════════════════════════════════════════════════════════
// INDICADORES
// ═══════════════════════════════════════════════════════════════

function ctrl_contratos_salvar_indicador(dados, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    return ContratoRepository.salvarIndicador(dados, email);
  });
}

function ctrl_contratos_excluir_indicador(id, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    return ContratoRepository.excluirIndicador(id, email);
  });
}
