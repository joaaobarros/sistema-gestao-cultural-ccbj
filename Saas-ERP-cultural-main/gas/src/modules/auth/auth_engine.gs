/**
 * @file modules/auth/auth_engine.gs
 * @layer modules/auth
 * @description Motor de regras de negócio do domínio Auth.
 *
 * Centraliza validação de credenciais, gestão de sessões e permissões
 * de administração de usuários.
 *
 * REGRAS:
 *   - Credenciais são validadas via AuthRepository (spreadsheet).
 *   - Tokens de sessão delegam ao auth_session.gs (CacheService GAS).
 *   - AuditoriaService registra todo acesso e mutação.
 *   - NUNCA lançar stack trace para o frontend — apenas mensagens seguras.
 *
 * PROIBIDO:
 *   - Acessar CredenciaisUsuarios fora deste engine.
 *   - Alterar sessão fora dos métodos deste engine.
 *   - Retornar hash de senha ao chamador.
 *
 * @depends modules/auth/auth_repository.gs (AuthRepository),
 *          core/auth_session.gs (_hashSenha, _gerarTokenSessao, _resolverNivelAcesso,
 *                                _registrarLogSessao, PermissoesService),
 *          core/services/auditoria_service.gs (AuditoriaService)
 */

var AuthEngine = (function () {

  // ── Credenciais ──────────────────────────────────────────────────

  /**
   * Valida email + senha e retorna token de sessão em caso de sucesso.
   * @param {string} email
   * @param {string} senha
   * @returns {{ ok: boolean, token?: string, email?: string, nome?: string, nivel?: string, msg?: string }}
   */
  function login(email, senha) {
    if (!email || !senha) return { ok: false, msg: 'Email e senha são obrigatórios.' };
    var emailLimpo = String(email).trim().toLowerCase();

    try {
      var hash = _hashSenha(String(senha));
      var resultado = AuthRepository.obterPorEmail(emailLimpo);
      if (!resultado) {
        _auditarFalha('AUTH_FAILED', emailLimpo, 'Usuário não encontrado');
        return { ok: false, msg: 'Usuário não encontrado.' };
      }
      var user = resultado.row;

      if (!user.ativo) {
        _auditarFalha('AUTH_FAILED', emailLimpo, 'Usuário inativo');
        return { ok: false, msg: 'Usuário inativo. Contate o administrador.' };
      }
      if (user.senhaHash !== hash) {
        _auditarFalha('AUTH_FAILED', emailLimpo, 'Senha incorreta');
        return { ok: false, msg: 'Senha incorreta.' };
      }

      AuthRepository.registrarLogin(emailLimpo);
      var token = _gerarTokenSessao(emailLimpo);
      var nivel  = _resolverNivelAcesso(emailLimpo);
      _registrarLogSessao(emailLimpo, 'login_senha');
      try {
        if (typeof AuditoriaService !== 'undefined')
          AuditoriaService.registrarAcesso(emailLimpo, 'LOGIN_SENHA', 'auth');
      } catch(_) {}

      return { ok: true, token: token, email: emailLimpo, nome: user.nome, nivel: nivel };
    } catch(e) {
      console.warn('[AuthEngine.login] ' + e.message);
      return { ok: false, msg: 'Erro interno. Tente novamente.' };
    }
  }

  /**
   * Cria ou atualiza credencial de usuário (apenas admins).
   */
  function salvarUsuario(emailAdmin, emailAlvo, senhaPlain, nome, ativo) {
    if (!emailAdmin) return { ok: false, msg: 'Admin não identificado.' };
    var emailAdminLimpo = String(emailAdmin).trim().toLowerCase();
    var emailAlvoLimpo  = String(emailAlvo  || '').trim().toLowerCase();

    try {
      if (!PermissoesService.isAdmin(emailAdminLimpo))
        return { ok: false, msg: 'Apenas administradores podem gerenciar usuários.' };
    } catch(_) {}

    if (!emailAlvoLimpo || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailAlvoLimpo))
      return { ok: false, msg: 'Email inválido.' };

    try {
      var hash  = senhaPlain ? _hashSenha(String(senhaPlain)) : null;
      var isNovo = AuthRepository.salvar(emailAlvoLimpo, hash, nome, ativo);
      var evento = isNovo ? 'AUTH_USER_CREATED' : 'AUTH_USER_UPDATED';
      try {
        if (typeof AuditoriaService !== 'undefined')
          AuditoriaService.registrar(evento, 'auth',
            { admin: emailAdminLimpo, alvo: emailAlvoLimpo, ativo: ativo !== false });
      } catch(_) {}
      return { ok: true, msg: isNovo ? 'Usuário criado com sucesso.' : 'Usuário atualizado com sucesso.' };
    } catch(e) {
      console.warn('[AuthEngine.salvarUsuario] ' + e.message);
      return { ok: false, msg: e.message };
    }
  }

  /**
   * Lista credenciais sem expor hashes.
   */
  function listarUsuarios(emailAdmin) {
    try {
      var lista = AuthRepository.listar();
      return { ok: true, usuarios: lista.map(function(u) {
        return { email: u.email, nome: u.nome, ativo: u.ativo, criadoEm: u.criadoEm, ultimoLogin: u.ultimoLogin };
      })};
    } catch(e) {
      return { ok: false, msg: e.message };
    }
  }

  // ── Helpers privados ─────────────────────────────────────────────

  function _auditarFalha(evento, email, motivo) {
    try {
      if (typeof AuditoriaService !== 'undefined')
        AuditoriaService.warn(evento, 'auth', motivo, { email: email });
    } catch(_) {}
  }

  // ── API pública ───────────────────────────────────────────────────

  return {
    login:          login,
    salvarUsuario:  salvarUsuario,
    listarUsuarios: listarUsuarios
  };

})();
