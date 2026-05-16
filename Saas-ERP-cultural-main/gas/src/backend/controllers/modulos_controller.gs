/**
 * @file backend/controllers/modulos_controller.gs
 * @layer backend/controllers
 * @description Fachada oficial do domínio Módulos (gestão de módulos do sistema).
 *
 * REGRA ARQUITETURAL:
 *   - A bridge aponta APENAS para funções ctrl_modulos_*.
 *   - Toda resposta é GasResponse: { ok, data, error, metadata }.
 *
 * @depends shared/response.gs (GasResponse),
 *          modules/admin/modulos_registry_service.gs (ModulosRegistryService),
 *          backend/mod_admin.gs (obterEmailUsuario)
 */

function ctrl_modulos_status(emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return ModulosRegistryService.obterStatus();
  }, 'ctrl_modulos_status');
}

function ctrl_modulos_registro(emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    return ModulosRegistryService.obterRegistro(email);
  }, 'ctrl_modulos_registro');
}

function ctrl_modulos_alterar_status(moduleId, ativo, emailFallback) {
  return GasResponse.wrap(function() {
    if (!moduleId) throw new Error('moduleId é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    return ModulosRegistryService.alterarStatus(moduleId, ativo, email);
  }, 'ctrl_modulos_alterar_status');
}

function ctrl_modulos_resetar(emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    return ModulosRegistryService.resetar(email);
  }, 'ctrl_modulos_resetar');
}

function ctrl_modulos_toggle_superadmin(moduleId, valor, emailFallback) {
  return GasResponse.wrap(function() {
    if (!moduleId) throw new Error('moduleId é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    return ModulosRegistryService.toggleSuperadmin(moduleId, valor, email);
  }, 'ctrl_modulos_toggle_superadmin');
}

function ctrl_modulos_salvar_lote(alteracoes, emailFallback) {
  return GasResponse.wrap(function() {
    if (!Array.isArray(alteracoes)) throw new Error('alteracoes deve ser um array.');
    var email = obterEmailUsuario(emailFallback || '');
    return ModulosRegistryService.salvarLote(alteracoes, email);
  }, 'ctrl_modulos_salvar_lote');
}
