/**
 * @file backend/controllers/permissoes_controller.gs
 * @layer backend/controllers
 * @description Fachada oficial do domínio de permissões.
 *
 * REGRA ARQUITETURAL:
 *   - A bridge aponta APENAS para funções ctrl_permissoes_*.
 *   - Todo retorno é GasResponse: { ok, data, error, metadata }.
 *
 * @depends shared/response.gs (GasResponse),
 *          modules/auth/permissoes_v2_engine.gs (PermissoesV2Engine),
 *          core/services/permissoes_service.gs (PermissoesService)
 */

// ═══════════════════════════════════════════════════════════════
// LEITURA
// ═══════════════════════════════════════════════════════════════

/**
 * Lista todas as permissões e usuários do sistema.
 * Exige perfil admin ou superadmin.
 * @param {string} emailFallback — email do solicitante (capturado no doGet)
 */
function ctrl_permissoes_listar(emailFallback) {
  return GasResponse.wrap(function() {
    return PermissoesV2Engine.listar(emailFallback || '');
  });
}

/**
 * Obtém permissões consolidadas de um usuário específico.
 * @param {string} email
 */
function ctrl_permissoes_obter(email) {
  return GasResponse.wrap(function() {
    return PermissoesV2Engine.obterPermissoes(email || '');
  });
}

/**
 * Retorna lista de usuários sincronizados (sem permissões).
 */
function ctrl_permissoes_usuarios() {
  return GasResponse.wrap(function() {
    return PermissoesV2Engine.obterUsuarios();
  });
}

/**
 * Calcula permissões automáticas a partir de origem e perfil_base.
 * @param {Object} origem — { cargo, funcoes, setores, donos_espaco }
 * @param {string} perfil — perfil_base do usuário
 */
function ctrl_permissoes_calcular_auto(origem, perfil) {
  return GasResponse.wrap(function() {
    return PermissoesV2Engine.calcularAutomaticas(origem || {}, perfil || 'visitante_controlado');
  });
}

// ═══════════════════════════════════════════════════════════════
// ESCRITA
// ═══════════════════════════════════════════════════════════════

/**
 * Salva permissões de um usuário (exige admin ou superadmin).
 * @param {Object} dados — { email, perfil_base, origem, permissoes_manuais, emailEditor }
 */
function ctrl_permissoes_salvar(dados) {
  return GasResponse.wrap(function() {
    return PermissoesV2Engine.salvarPermissoes(dados);
  });
}

/**
 * Sincroniza lista de usuários do sistema a partir das fontes (LogAcessos, Administradores, Reservas).
 */
function ctrl_permissoes_sincronizar() {
  return GasResponse.wrap(function() {
    return PermissoesV2Engine.sincronizarUsuarios();
  });
}

// ═══════════════════════════════════════════════════════════════
// AUDITORIA
// ═══════════════════════════════════════════════════════════════

/**
 * Retorna log de auditoria de permissões (exige admin ou superadmin).
 */
function ctrl_permissoes_auditoria() {
  return GasResponse.wrap(function() {
    return PermissoesV2Engine.obterAuditoria();
  });
}
