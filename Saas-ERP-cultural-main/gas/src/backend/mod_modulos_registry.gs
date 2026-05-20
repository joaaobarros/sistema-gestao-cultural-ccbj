/**
 * @file mod_modulos_registry.gs
 * @layer backend
 * @description Delegadores globais para ModulosRegistryService.
 *              Toda a lógica vive em modules/admin/modulos_registry_service.gs.
 *
 * @depends modules/admin/modulos_registry_service.gs (ModulosRegistryService)
 */

function modulos_obterStatus()                                      { return ModulosRegistryService.obterStatus(); }
function modulos_obterRegistro(emailFallback)                       { return ModulosRegistryService.obterRegistro(emailFallback); }
function modulos_alterarStatus(moduleId, ativo, emailFallback)      { return ModulosRegistryService.alterarStatus(moduleId, ativo, emailFallback); }
function modulos_salvarLote(alteracoes, emailFallback)              { return ModulosRegistryService.salvarLote(alteracoes, emailFallback); }
function modulos_toggleSuperadmin(moduleId, valor, emailFallback)   { return ModulosRegistryService.toggleSuperadmin(moduleId, valor, emailFallback); }
function modulos_resetar(emailFallback)                             { return ModulosRegistryService.resetar(emailFallback); }
