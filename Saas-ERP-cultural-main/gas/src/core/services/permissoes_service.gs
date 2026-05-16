/**
 * @file core/services/permissoes_service.gs
 * @layer core/services
 * @description Façade oficial de permissões do sistema.
 *
 * Centraliza o acesso ao motor de permissões v2 (mod_permissoes_v2.gs) através
 * de uma API estável. Módulos novos devem usar PermissoesService em vez de
 * chamar as funções do motor diretamente.
 *
 * COMPATIBILIDADE: Os namespaces PermissoesV1, PermissoesV2 e Permissoes
 * são aliases que redirecionam para PermissoesService. Chamadas legadas
 * continuam funcionando sem alteração.
 *
 * USO:
 *   PermissoesService.pode(email, 'reservas', 'visualizar')  // → boolean
 *   PermissoesService.obterPerfil(email)                     // → 'admin' | 'gestor' | …
 *   PermissoesService.isAdmin(email)                         // → boolean
 *
 * @depends modules/auth/permissoes_v2_engine.gs (PermissoesV2Engine)
 */

var PermissoesService = (function () {

  // ──────────────────────────────────────────────
  // API principal
  // ──────────────────────────────────────────────

  function pode(email, modulo, acao) {
    if (!email || !modulo) return false;
    try {
      var perms = PermissoesV2Engine.obterPermissoes(email);
      if (!perms || !perms.permissoes_finais) return false;
      var mod = perms.permissoes_finais[modulo];
      if (!mod) return false;
      return !!mod[acao || 'visualizar'];
    } catch(e) {
      console.warn('[PermissoesService.pode]', e.message);
      return false;
    }
  }

  function obterPerfil(email) {
    if (!email) return 'visitante_controlado';
    try {
      var perms = PermissoesV2Engine.obterPermissoes(email);
      return (perms && perms.perfil_base) || 'visitante_controlado';
    } catch(e) {
      return 'visitante_controlado';
    }
  }

  function isAdmin(email) {
    var perfil = obterPerfil(email);
    return perfil === 'admin' || perfil === 'superadmin';
  }

  function isSuperAdmin(email) {
    return obterPerfil(email) === 'superadmin';
  }

  function obter(email) {
    try { return PermissoesV2Engine.obterPermissoes(email); } catch(e) { return null; }
  }

  function validarAcesso(email, modulo) {
    return pode(email, modulo, 'visualizar');
  }

  return {
    pode:          pode,
    obterPerfil:   obterPerfil,
    isAdmin:       isAdmin,
    isSuperAdmin:  isSuperAdmin,
    obter:         obter,
    validarAcesso: validarAcesso
  };

})();

// ══════════════════════════════════════════════════════════════
// FASE 4 — Núcleo de Compatibilidade
// Chamadas legadas PermissoesV1/V2/Permissoes redirecionam para
// PermissoesService. Não remover enquanto existir frontend legado.
// ══════════════════════════════════════════════════════════════

/**
 * Núcleo oficial de permissões. API única para novos módulos.
 */
var Permissoes = {
  pode:         function(email, modulo, acao)  { return PermissoesService.pode(email, modulo, acao); },
  validar:      function(email, modulo)         { return PermissoesService.validarAcesso(email, modulo); },
  obterPerfil:  function(email)                 { return PermissoesService.obterPerfil(email); },
  isAdmin:      function(email)                 { return PermissoesService.isAdmin(email); },
  isSuperAdmin: function(email)                 { return PermissoesService.isSuperAdmin(email); }
};

/** Adapter de compatibilidade — redireciona para PermissoesService. */
var PermissoesV1 = {
  validar:      function(email, modulo)         { return PermissoesService.validarAcesso(email, modulo); },
  pode:         function(email, modulo, acao)   { return PermissoesService.pode(email, modulo, acao); }
};

/** Adapter de compatibilidade — redireciona para PermissoesService. */
var PermissoesV2 = {
  validar:      function(email, modulo)         { return PermissoesService.validarAcesso(email, modulo); },
  pode:         function(email, modulo, acao)   { return PermissoesService.pode(email, modulo, acao); },
  obterPerfil:  function(email)                 { return PermissoesService.obterPerfil(email); }
};
