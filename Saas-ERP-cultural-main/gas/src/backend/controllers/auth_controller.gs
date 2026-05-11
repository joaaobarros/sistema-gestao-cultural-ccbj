/**
 * @file backend/controllers/auth_controller.gs
 * @layer backend/controllers
 * @description Fachada oficial do domínio Auth.
 *
 * REGRA ARQUITETURAL:
 *   - A bridge aponta APENAS para funções ctrl_auth_*.
 *   - Toda resposta é GasResponse: { ok, data, error, metadata }.
 *   - Login e gestão de usuários passam por AuthEngine.
 *   - Sessões GAS (GSI + token) delegam a auth_session.gs diretamente.
 *
 * PROIBIDO:
 *   - Big bang: não remover as funções legadas de auth_session.gs.
 *   - Alterar contrato de login abruptamente.
 *   - Remover compatibilidade com o frontend existente antes de migração.
 *
 * @depends shared/response.gs (GasResponse),
 *          modules/auth/auth_engine.gs (AuthEngine),
 *          core/auth_session.gs (iniciarSessaoGAS, renovarSessaoGAS,
 *                                encerrarSessaoGAS, obterInfoAutenticacao,
 *                                solicitarCadastroExterno, listarSolicitacoesCadastroExterno,
 *                                aprovarCadastroExterno, recusarCadastroExterno)
 */

// ═══════════════════════════════════════════════════════════════════
// AUTENTICAÇÃO
// ═══════════════════════════════════════════════════════════════════

/**
 * Valida email + senha e retorna token de sessão.
 * @param {string} email
 * @param {string} senha
 */
function ctrl_auth_login(email, senha) {
  return GasResponse.wrap(function() {
    if (!email || !senha) throw new Error('Email e senha são obrigatórios.');
    var resultado = AuthEngine.login(email, senha);
    if (!resultado.ok) throw new Error(resultado.msg || 'Falha na autenticação.');
    return resultado;
  }, 'ctrl_auth_login');
}

/**
 * Retorna informações de autenticação do contexto atual.
 */
function ctrl_auth_info() {
  return GasResponse.wrap(function() {
    return obterInfoAutenticacao();
  }, 'ctrl_auth_info');
}

// ═══════════════════════════════════════════════════════════════════
// SESSÃO GAS (GSI / token)
// ═══════════════════════════════════════════════════════════════════

/**
 * Inicia sessão via JWT do Google Sign-In.
 * @param {string} jwtToken
 * @param {string} emailFallback
 */
function ctrl_auth_iniciar_sessao(jwtToken, emailFallback) {
  return GasResponse.wrap(function() {
    return iniciarSessaoGAS(jwtToken, emailFallback || '');
  }, 'ctrl_auth_iniciar_sessao');
}

/**
 * Renova sessão existente.
 * @param {string} sessaoId
 */
function ctrl_auth_renovar_sessao(sessaoId) {
  return GasResponse.wrap(function() {
    if (!sessaoId) throw new Error('ID de sessão é obrigatório.');
    return renovarSessaoGAS(sessaoId);
  }, 'ctrl_auth_renovar_sessao');
}

/**
 * Encerra sessão.
 * @param {string} sessaoId
 */
function ctrl_auth_encerrar_sessao(sessaoId) {
  return GasResponse.wrap(function() {
    if (!sessaoId) throw new Error('ID de sessão é obrigatório.');
    return encerrarSessaoGAS(sessaoId);
  }, 'ctrl_auth_encerrar_sessao');
}

// ═══════════════════════════════════════════════════════════════════
// GESTÃO DE USUÁRIOS (admin only)
// ═══════════════════════════════════════════════════════════════════

/**
 * Cria ou atualiza credencial de usuário.
 * @param {string} emailAdmin
 * @param {string} emailAlvo
 * @param {string|null} senha
 * @param {string} nome
 * @param {boolean} ativo
 */
function ctrl_auth_salvar_usuario(emailAdmin, emailAlvo, senha, nome, ativo) {
  return GasResponse.wrap(function() {
    if (!emailAdmin) throw new Error('Admin não identificado.');
    if (!emailAlvo)  throw new Error('Email do usuário é obrigatório.');
    var resultado = AuthEngine.salvarUsuario(emailAdmin, emailAlvo, senha, nome, ativo);
    if (!resultado.ok) throw new Error(resultado.msg);
    return resultado;
  }, 'ctrl_auth_salvar_usuario');
}

/**
 * Lista credenciais cadastradas (sem hashes).
 * @param {string} emailAdmin
 */
function ctrl_auth_listar_usuarios(emailAdmin) {
  return GasResponse.wrap(function() {
    return AuthEngine.listarUsuarios(emailAdmin || '');
  }, 'ctrl_auth_listar_usuarios');
}

// ═══════════════════════════════════════════════════════════════════
// CADASTRO EXTERNO (auto-cadastro com aprovação admin)
// ═══════════════════════════════════════════════════════════════════

/**
 * Solicita cadastro externo (usuários não-admin).
 */
function ctrl_auth_solicitar_cadastro(nome, email, senha) {
  return GasResponse.wrap(function() {
    if (!nome || !email || !senha) throw new Error('Nome, email e senha são obrigatórios.');
    return solicitarCadastroExterno(nome, email, senha);
  }, 'ctrl_auth_solicitar_cadastro');
}

/**
 * Lista solicitações pendentes de cadastro (admin).
 * @param {string} emailAdmin
 */
function ctrl_auth_listar_pendentes(emailAdmin) {
  return GasResponse.wrap(function() {
    if (!emailAdmin) throw new Error('Admin não identificado.');
    return listarSolicitacoesCadastroExterno(emailAdmin);
  }, 'ctrl_auth_listar_pendentes');
}

/**
 * Aprova cadastro externo pendente (admin).
 * @param {string} id
 * @param {string} emailAdmin
 */
function ctrl_auth_aprovar_cadastro(id, emailAdmin) {
  return GasResponse.wrap(function() {
    if (!id)         throw new Error('ID da solicitação é obrigatório.');
    if (!emailAdmin) throw new Error('Admin não identificado.');
    return aprovarCadastroExterno(id, emailAdmin);
  }, 'ctrl_auth_aprovar_cadastro');
}

/**
 * Recusa cadastro externo pendente (admin).
 * @param {string} id
 * @param {string} emailAdmin
 * @param {string} motivo
 */
function ctrl_auth_recusar_cadastro(id, emailAdmin, motivo) {
  return GasResponse.wrap(function() {
    if (!id)         throw new Error('ID da solicitação é obrigatório.');
    if (!emailAdmin) throw new Error('Admin não identificado.');
    return recusarCadastroExterno(id, emailAdmin, motivo || '');
  }, 'ctrl_auth_recusar_cadastro');
}
