/**
 * @file core/services/usuarios_service.gs
 * @layer core/services
 * @description Façade oficial de gerenciamento de usuários do sistema.
 *
 * Centraliza acesso a dados de usuários dispersos em:
 *   - obterEmailUsuario (mod_admin.gs) — identidade da sessão ativa
 *   - sincronizarUsuariosSistema (mod_permissoes_v2.gs) — sync de usuários
 *   - obterUsuariosSistema (mod_permissoes_v2.gs) — lista de usuários
 *   - listarCredenciais (auth_session.gs) — credenciais cadastradas
 *
 * USO:
 *   UsuariosService.emailAtivo(fallback)    // email do usuário chamante
 *   UsuariosService.listar()                // todos os usuários do sistema
 *   UsuariosService.sincronizar()           // sincroniza LogAcessos + Reservas + Admins
 *
 * @depends mod_admin.gs, mod_permissoes_v2.gs, auth_session.gs
 */

var UsuariosService = (function () {

  /**
   * Retorna o email do usuário da sessão ativa.
   * Hierarquia: Session.getActiveUser() → emailFallback → ''.
   */
  function emailAtivo(emailFallback) {
    try {
      if (typeof obterEmailUsuario === 'function') {
        return obterEmailUsuario(emailFallback || '') || emailFallback || '';
      }
      var email = '';
      try { email = Session.getActiveUser().getEmail() || ''; } catch(_) {}
      return email || emailFallback || '';
    } catch(e) {
      return emailFallback || '';
    }
  }

  /**
   * Lista todos os usuários do sistema (usuarios_sistema.json).
   */
  function listar() {
    try {
      if (typeof obterUsuariosSistema === 'function') return obterUsuariosSistema();
      return [];
    } catch(e) {
      console.warn('[UsuariosService.listar] ' + e.message);
      return [];
    }
  }

  /**
   * Sincroniza usuários do sistema (LogAcessos + Reservas + Administradores).
   */
  function sincronizar() {
    try {
      if (typeof sincronizarUsuariosSistema === 'function') return sincronizarUsuariosSistema();
    } catch(e) {
      Logger.error('usuarios_service', 'sincronizar', e.message);
    }
  }

  /**
   * Retorna dados completos do usuário (perfil v2).
   */
  function obterDados(email) {
    try {
      if (typeof obterPermissoesUsuarioV2 === 'function') return obterPermissoesUsuarioV2(email);
      return null;
    } catch(e) {
      return null;
    }
  }

  return {
    emailAtivo:  emailAtivo,
    listar:      listar,
    sincronizar: sincronizar,
    obterDados:  obterDados
  };

})();
