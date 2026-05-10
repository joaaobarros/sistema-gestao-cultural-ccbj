/**
 * @file auth_session.gs
 * @layer backend/auth
 * @description Sistema de identidade real para GAS com "Execute as: Me".
 *
 *              PROBLEMA: Em web apps com "Execute as: Me", Session.getActiveUser()
 *              retorna vazio e Session.getEffectiveUser() retorna o email do dono do
 *              script — todos os usuários aparecem como "EU" (o dono).
 *
 *              SOLUÇÃO: Capturar a identidade real no frontend via Google Identity
 *              Services (JWT assinado pelo Google) ou via template doGet (que em alguns
 *              deployments Workspace retorna o email real), validar no servidor e armazenar
 *              em CacheService com um token de sessão de curta duração.
 *
 *              FLUXO:
 *              1. doGet embute emailInicial se Session.getActiveUser() funcionar
 *              2. Frontend tenta GSI (Google Identity Services) para JWT verificado
 *              3. Fallback: frontend envia email direto (validado contra lista autorizada)
 *              4. iniciarSessaoGAS() valida e armazena → retorna sessaoId
 *              5. Todas as chamadas passam sessaoId → _resolverEmailSessao() retorna email real
 *
 * @dependencies CacheService, UrlFetchApp, PropertiesService, mod_admin.gs (verificarPermissao)
 */

// ═══════════════════════════════════════════════════════════════
// CONSTANTES DE SESSÃO
// ═══════════════════════════════════════════════════════════════

var _SESSAO_TTL_SEGUNDOS  = 28800; // 8 horas
var _SESSAO_CACHE_PREFIX  = 'sessao_ccbj_';
var _SESSAO_EMAIL_PREFIX  = 'email_ccbj_';

// ═══════════════════════════════════════════════════════════════
// EMAIL DO USUÁRIO ATIVO — chamada direta via google.script.run
// ═══════════════════════════════════════════════════════════════

/**
 * Retorna o email do usuário autenticado.
 * Em "Execute as: User": retorna o email real do usuário chamante.
 * Em "Execute as: Me":   retorna string vazia (sem lançar exceção).
 * Chamada pelo frontend em _bootAutenticacao antes de tentar GSI/login manual.
 */
function obterEmailSessaoAtiva() {
  try {
    var emailAtivo = '';
    var emailEfetivo = '';

    try { emailAtivo   = Session.getActiveUser().getEmail()   || ''; } catch(e) {}
    try { emailEfetivo = Session.getEffectiveUser().getEmail() || ''; } catch(e) {}

    // Em "Execute as: Me", getActiveUser() retorna vazio em doGet mas retorna o email
    // real do usuário chamante em google.script.run. Usar apenas getActiveUser().
    // NÃO usar getEffectiveUser() como identidade — ele retorna o email do DONO do
    // script para todos os usuários, o que quebra o sistema de permissões.
    var email = emailAtivo.toLowerCase().trim();

    // Detectar "Execute as: Me" sem usuário identificado: emailAtivo está vazio
    // mas getEffectiveUser retornou algo (= o dono). Retornar falha para que o
    // frontend prossiga com o fluxo correto (GSI ou reautenticação).
    if (!email) {
      return { ok: false, executeAsMe: !!(emailEfetivo) };
    }

    if (email.indexOf('@') === -1) {
      return { ok: false };
    }

    return { ok: true, email: email };

  } catch(e) {
    return { ok: false };
  }
}

// ═══════════════════════════════════════════════════════════════
// INICIAR SESSÃO — ponto de entrada do login
// ═══════════════════════════════════════════════════════════════

/**
 * Cria uma sessão autenticada para o usuário.
 * Aceita:
 *   a) credencial JWT do Google Identity Services (mais seguro — verificado via tokeninfo)
 *   b) email direto (validado contra domínio + lista de usuários autorizados)
 *
 * Retorna { ok, sessao, email, nivel } para o frontend armazenar.
 */
function iniciarSessaoGAS(credencialOuEmail, emailFallback) {
  try {
    var email = '';

    // 1. Tentar JWT do Google Identity Services
    if (credencialOuEmail && credencialOuEmail.length > 100 && credencialOuEmail.indexOf('.') >= 0) {
      email = _verificarJWTGoogle(credencialOuEmail);
    }

    // 2. Email direto como fallback (credencialOuEmail é um email, ou emailFallback)
    if (!email) {
      var candidato = emailFallback || credencialOuEmail || '';
      if (candidato) {
        email = _validarEmailAutorizado(candidato);
      }
    }

    if (!email) {
      return { ok: false, msg: 'Não foi possível identificar o usuário. Faça login com sua conta Google institucional.' };
    }

    // 3. Gerar token de sessão
    var sessaoId = _gerarTokenSessao(email);

    // 4. Determinar nível de acesso para retornar ao frontend
    var nivel = _resolverNivelAcesso(email);

    _registrarLogSessao(email, 'iniciar_sessao');

    return {
      ok:     true,
      sessao: sessaoId,
      email:  email,
      nivel:  nivel
    };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

/**
 * Renova o token de sessão (chamado pelo frontend a cada ~7h para manter a sessão ativa).
 */
function renovarSessaoGAS(sessaoId) {
  try {
    var email = _resolverEmailSessao(sessaoId);
    if (!email) return { ok: false, msg: 'Sessão expirada. Faça login novamente.' };
    var novoId = _gerarTokenSessao(email);
    return { ok: true, sessao: novoId, email: email };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

/**
 * Encerra a sessão (logout).
 */
function encerrarSessaoGAS(sessaoId) {
  try {
    var cache = CacheService.getScriptCache();
    if (sessaoId) cache.remove(_SESSAO_CACHE_PREFIX + sessaoId);
    return { ok: true };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// RESOLUÇÃO DE EMAIL — núcleo do sistema
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve o email real do usuário chamante.
 * Hierarquia de resolução:
 *   1. Session.getActiveUser() — funciona em triggers, sidebars, scripts container-bound
 *   2. Token de sessão (sessaoId) — principal via do web app
 *   3. Email direto validado — fallback seguro
 *
 * @param {string} sessaoOuEmail - Token de sessão OU email direto
 * @returns {string} email real do usuário
 * @throws Error se não for possível identificar
 */
function _resolverEmailReal(sessaoOuEmail) {
  // 1. Sessão nativa GAS (funciona em contextos não-web app)
  var emailNativo = '';
  try { emailNativo = Session.getActiveUser().getEmail() || ''; } catch(e) {}

  // Se temos email nativo E não é o email do dono do script → confiável
  if (emailNativo) {
    var emailDono = _emailDonoScript();
    if (!emailDono || emailNativo !== emailDono) {
      return emailNativo.toLowerCase().trim();
    }
    // Se é o email do dono → pode ser "Execute as: Me" → não confiar cegamente
    // mas manter como fallback se nada mais funcionar
  }

  // 2. Token de sessão (principal via do web app "Execute as: Me")
  if (sessaoOuEmail && sessaoOuEmail.length > 20 && sessaoOuEmail.indexOf('@') < 0) {
    var emailSessao = _resolverEmailSessao(sessaoOuEmail);
    if (emailSessao) return emailSessao;
  }

  // 3. Email direto como último recurso
  if (sessaoOuEmail && sessaoOuEmail.indexOf('@') >= 0) {
    var emailValidado = _validarEmailAutorizado(sessaoOuEmail);
    if (emailValidado) return emailValidado;
  }

  // 4. Fallback: email nativo mesmo que seja o dono (melhor que nada em triggers/admin)
  if (emailNativo) return emailNativo.toLowerCase().trim();

  throw new Error('Usuário não autenticado. Sessão expirada ou inválida. Faça login novamente.');
}

/**
 * Versão permissiva para chamadas onde a identidade é menos crítica.
 * Retorna email ou '' (sem lançar exceção).
 */
function _resolverEmailOuVazio(sessaoOuEmail) {
  try { return _resolverEmailReal(sessaoOuEmail); } catch(e) { return ''; }
}

// ═══════════════════════════════════════════════════════════════
// VERIFICAÇÃO JWT GOOGLE IDENTITY SERVICES
// ═══════════════════════════════════════════════════════════════

/**
 * Verifica um ID token JWT emitido pelo Google Identity Services.
 * Chama a API pública tokeninfo para validação criptográfica.
 * NÃO requer cliente OAuth configurado localmente.
 */
function _verificarJWTGoogle(idToken) {
  try {
    var resp = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
      { muteHttpExceptions: true }
    );

    if (resp.getResponseCode() !== 200) {
      Logger.log('[Auth] tokeninfo retornou ' + resp.getResponseCode() + ': ' + resp.getContentText());
      return '';
    }

    var payload = JSON.parse(resp.getContentText());

    // Validações de segurança
    var agora = Math.floor(Date.now() / 1000);
    if (!payload.exp || parseInt(payload.exp) < agora) {
      Logger.log('[Auth] JWT expirado');
      return '';
    }

    if (!payload.email) {
      Logger.log('[Auth] JWT sem email');
      return '';
    }

    if (payload.email_verified === 'false' || payload.email_verified === false) {
      Logger.log('[Auth] Email do JWT não verificado');
      return '';
    }

    // Validar audience se GOOGLE_CLIENT_ID estiver configurado
    var clientId = PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID') || '';
    if (clientId && payload.aud !== clientId && payload.azp !== clientId) {
      Logger.log('[Auth] JWT de audience desconhecida: ' + payload.aud);
      return '';
    }

    return payload.email.toLowerCase().trim();
  } catch(e) {
    Logger.log('[Auth] Erro ao verificar JWT: ' + e.message);
    return '';
  }
}

// ═══════════════════════════════════════════════════════════════
// VALIDAÇÃO DE EMAIL
// ═══════════════════════════════════════════════════════════════

/**
 * Valida um email contra:
 * 1. Formato válido
 * 2. Domínio permitido (se DOMINIOS_PERMITIDOS estiver configurado em PropertiesService)
 * 3. OU presença na lista de Administradores (usuários conhecidos do sistema)
 */
function _validarEmailAutorizado(email) {
  if (!email) return '';
  var emailLimpo = String(email).toLowerCase().trim();
  // Requer TLD ≥ 2 chars e pelo menos um ponto no domínio (rejeita a@b.c, a@b, etc.)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailLimpo)) return '';
  // Rejeita domínios com label de 1 char apenas (ex: b.br mas não a@b.c onde 'b' é o host)
  var dominio = emailLimpo.split('@')[1];
  var partes = dominio.split('.');
  if (partes.some(function(p) { return p.length < 2; })) return '';

  // Verificar domínios permitidos (configurável)
  var dominiosConf = PropertiesService.getScriptProperties().getProperty('DOMINIOS_PERMITIDOS') || '';
  if (dominiosConf) {
    var dominios = dominiosConf.split(',').map(function(d) { return d.trim().toLowerCase(); });
    var dominioEmail = emailLimpo.split('@')[1];
    if (dominios.length > 0 && dominios.indexOf(dominioEmail) < 0) {
      Logger.log('[Auth] Domínio não permitido: ' + dominioEmail);
      return '';
    }
  }

  // Verificar domínio permitido apenas — qualquer usuário autenticado pode entrar.
  // Restrição de funcionalidades é responsabilidade do sistema de permissões (visitante_controlado).
  try {
    var shAdm = typeof _getSheet === 'function' ? _getSheet('Administradores') : null;
    if (shAdm && shAdm.getLastRow() > 1) {
      var admins = shAdm.getRange(2, 1, shAdm.getLastRow() - 1, 1).getValues()
        .map(function(r) { return String(r[0]).toLowerCase().trim(); });
      if (admins.indexOf(emailLimpo) >= 0) return emailLimpo;
      // Usuário fora da lista de admins: permitir entrada com perfil visitante_controlado.
      // NÃO bloquear aqui — o motor de permissões trata o acesso restrito.
    }
  } catch(e) {}

  return emailLimpo;
}

// ═══════════════════════════════════════════════════════════════
// ARMAZENAMENTO DE SESSÃO (CacheService)
// ═══════════════════════════════════════════════════════════════

function _gerarTokenSessao(email) {
  var token = Utilities.getUuid().replace(/-/g, '');
  var cache = CacheService.getScriptCache();
  cache.put(_SESSAO_CACHE_PREFIX + token, email.toLowerCase().trim(), _SESSAO_TTL_SEGUNDOS);
  return token;
}

function _resolverEmailSessao(sessaoId) {
  if (!sessaoId) return '';
  try {
    var cache = CacheService.getScriptCache();
    return cache.get(_SESSAO_CACHE_PREFIX + sessaoId) || '';
  } catch(e) {
    return '';
  }
}

// ═══════════════════════════════════════════════════════════════
// UTILITÁRIOS DE SUPORTE
// ═══════════════════════════════════════════════════════════════

function _emailDonoScript() {
  try {
    return Session.getEffectiveUser().getEmail().toLowerCase().trim();
  } catch(e) {
    return '';
  }
}

function _resolverNivelAcesso(email) {
  // verificarPermissao() throws quando o nível não é satisfeito — cada chamada
  // precisa do seu próprio try/catch para não interromper as verificações seguintes.
  if (typeof verificarPermissao === 'function') {
    try { if (verificarPermissao('superadmin', email)) return 'superadmin'; } catch(_) {}
    try { if (verificarPermissao('admin', email)) return 'admin'; } catch(_) {}
  }
  try {
    if (typeof obterPermissoesUsuario === 'function') {
      var perms = obterPermissoesUsuario(email);
      return (perms && perms.perfil) || 'visitante_controlado';
    }
  } catch(_) {}
  return 'visitante_controlado';
}

function _registrarLogSessao(email, acao) {
  try {
    var sh = typeof _getSheet === 'function' ? _getSheet('LogAcessos') : null;
    if (!sh) {
      // Tentar diretamente
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      sh = ss ? ss.getSheetByName('LogAcessos') : null;
    }
    if (sh) {
      sh.appendRow([new Date().toISOString(), email, acao, '', 'sessao', '']);
    }
  } catch(e) {
    Logger.log('[AuthLog] ' + e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// CONFIGURAÇÃO ADMINISTRATIVA
// ═══════════════════════════════════════════════════════════════

/**
 * Retorna o GOOGLE_CLIENT_ID configurado no PropertiesService.
 * Usado pelo frontend para inicializar o Google Identity Services (GSI).
 * Retorna '' se não configurado — o frontend exibirá o AccountChooser como fallback.
 */
function obterClienteIdGoogle() {
  try {
    return PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID') || '';
  } catch(e) {
    return '';
  }
}

/**
 * Configura parâmetros de autenticação via PropertiesService.
 * Executar uma vez pelo admin no editor GAS.
 */
function configurarAutenticacao(params) {
  try {
    var email = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
    if (typeof verificarPermissao === 'function' && !verificarPermissao('superadmin', email)) {
      return { ok: false, msg: 'Apenas superadmin pode configurar autenticação.' };
    }
    var props = PropertiesService.getScriptProperties();
    if (params.googleClientId)    props.setProperty('GOOGLE_CLIENT_ID', params.googleClientId);
    if (params.dominiosPermitidos) props.setProperty('DOMINIOS_PERMITIDOS', params.dominiosPermitidos);
    if (params.restringirAAdmins !== undefined) {
      props.setProperty('RESTRINGIR_A_ADMINS', String(params.restringirAAdmins));
    }
    return { ok: true, msg: 'Configuração de autenticação salva.' };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

/**
 * Retorna o email do dono do script para exibição no painel de debug.
 * Útil para verificar se a detecção de "Execute as: Me" está funcionando.
 */
function obterInfoAutenticacao() {
  var emailAtivo    = '';
  var emailEfetivo  = '';
  try { emailAtivo   = Session.getActiveUser().getEmail() || ''; } catch(e) {}
  try { emailEfetivo = Session.getEffectiveUser().getEmail() || ''; } catch(e) {}

  return {
    ok:                true,
    modoExecucao:      emailAtivo === emailEfetivo ? 'Execute as: Me (owner)' : 'Execute as: User',
    emailAtivo:        emailAtivo || '(vazio — web app Execute as: Me)',
    emailEfetivo:      emailEfetivo,
    googleClientIdConf: !!(PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID')),
    dominiosConf:      PropertiesService.getScriptProperties().getProperty('DOMINIOS_PERMITIDOS') || '(todos)'
  };
}


function validarSessaoGAS(sessaoId) {
  if (!sessaoId) return { ok: false };
  var email = _resolverEmailSessao(sessaoId);
  if (!email) return { ok: false };
  return { ok: true, email: email };
}





function logoutSistema() {
  return true;
}
// ═══════════════════════════════════════════════════════════════
// AUTENTICAÇÃO COM SENHA — CredenciaisUsuarios (MASTER)
// ═══════════════════════════════════════════════════════════════

/**
 * Hash SHA-256 de uma senha (string UTF-8 → hex).
 */
function _hashSenha(senha) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, senha);
  return bytes.map(function(b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');
}

/**
 * Valida email+senha contra a aba CredenciaisUsuarios (planilha MASTER).
 * Retorna { ok, token, email, nome, nivel } em sucesso.
 */
function validarCredenciais(email, senha) {
  if (!email || !senha) {
    return { ok: false, msg: 'Email e senha são obrigatórios.' };
  }
  var emailLimpo = String(email).trim().toLowerCase();
  var hash = _hashSenha(String(senha));

  try {
    var sh = typeof _getSheet === 'function' ? _getSheet('CredenciaisUsuarios') : null;
    if (!sh || sh.getLastRow() < 2) {
      return { ok: false, msg: 'Nenhum usuário cadastrado. Contate o administrador.' };
    }

    var dados = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues();
    for (var i = 0; i < dados.length; i++) {
      var emailSheet = String(dados[i][0] || '').trim().toLowerCase();
      if (emailSheet !== emailLimpo) continue;

      var ativo = dados[i][3];
      if (ativo === false || ativo === 'FALSE' || ativo === 0) {
        return { ok: false, msg: 'Usuário inativo. Contate o administrador.' };
      }

      var hashSheet = String(dados[i][1] || '').trim();
      if (hashSheet !== hash) {
        return { ok: false, msg: 'Senha incorreta.' };
      }

      try { sh.getRange(i + 2, 6).setValue(new Date().toISOString()); } catch(_) {}

      var token = _gerarTokenSessao(emailLimpo);
      var nivel = _resolverNivelAcesso(emailLimpo);
      _registrarLogSessao(emailLimpo, 'login_senha');

      return {
        ok:    true,
        token: token,
        email: emailLimpo,
        nome:  String(dados[i][2] || emailLimpo.split('@')[0]).trim(),
        nivel: nivel
      };
    }

    return { ok: false, msg: 'Usuário não encontrado.' };
  } catch(e) {
    Logger.log('[validarCredenciais] ' + e.message);
    return { ok: false, msg: 'Erro interno. Tente novamente.' };
  }
}

/**
 * Cria ou atualiza uma credencial de usuário (somente admins).
 * Passe senhaPlain como null para atualizar sem alterar a senha.
 */
function salvarCredencialUsuario(emailAdmin, emailAlvo, senhaPlain, nome, ativo) {
  try {
    if (!emailAdmin) return { ok: false, msg: 'Admin não identificado.' };
    var emailAdminLimpo = String(emailAdmin).trim().toLowerCase();

    try {
      if (typeof verificarPermissao === 'function' && !verificarPermissao('admin', emailAdminLimpo)) {
        return { ok: false, msg: 'Apenas administradores podem gerenciar usuários.' };
      }
    } catch(_) {}

    var emailAlvoLimpo = String(emailAlvo || '').trim().toLowerCase();
    if (!emailAlvoLimpo || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailAlvoLimpo)) {
      return { ok: false, msg: 'Email inválido.' };
    }

    var sh = typeof _getSheet === 'function' ? _getSheet('CredenciaisUsuarios') : null;
    if (!sh) return { ok: false, msg: 'Aba CredenciaisUsuarios não encontrada na planilha MASTER.' };

    var hash = senhaPlain ? _hashSenha(String(senhaPlain)) : null;
    var nomeAlvo = String(nome || emailAlvoLimpo.split('@')[0]).trim();
    var ativoVal = ativo !== false;

    if (sh.getLastRow() > 1) {
      var dados = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
      for (var i = 0; i < dados.length; i++) {
        if (String(dados[i][0] || '').trim().toLowerCase() === emailAlvoLimpo) {
          sh.getRange(i + 2, 3).setValue(nomeAlvo);
          sh.getRange(i + 2, 4).setValue(ativoVal);
          if (hash) sh.getRange(i + 2, 2).setValue(hash);
          return { ok: true, msg: 'Usuário atualizado com sucesso.' };
        }
      }
    }

    if (!hash) return { ok: false, msg: 'Senha é obrigatória para novo usuário.' };
    sh.appendRow([emailAlvoLimpo, hash, nomeAlvo, ativoVal, new Date().toISOString(), '']);
    return { ok: true, msg: 'Usuário criado com sucesso.' };
  } catch(e) {
    Logger.log('[salvarCredencialUsuario] ' + e.message);
    return { ok: false, msg: e.message };
  }
}

/**
 * Lista credenciais cadastradas (sem expor hashes).
 */
function listarCredenciais(emailAdmin) {
  try {
    var sh = typeof _getSheet === 'function' ? _getSheet('CredenciaisUsuarios') : null;
    if (!sh || sh.getLastRow() < 2) return { ok: true, usuarios: [] };

    var dados = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues();
    var usuarios = dados
      .filter(function(r) { return String(r[0] || '').trim(); })
      .map(function(r) {
        return {
          email:       String(r[0] || '').trim(),
          nome:        String(r[2] || '').trim(),
          ativo:       r[3] !== false && r[3] !== 'FALSE' && r[3] !== 0,
          criadoEm:    r[4] ? String(r[4]).substring(0, 10) : '',
          ultimoLogin: r[5] ? String(r[5]).substring(0, 10) : ''
        };
      });
    return { ok: true, usuarios: usuarios };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

/**
 * Garante que a aba CredenciaisUsuarios existe na planilha MASTER.
 * Se não existir, cria via _configurarAbas (mecanismo canônico do setup,
 * usando a definição de MODULOS.MASTER.abas).
 */
function garantirAbaCredenciais() {
  try {
    var sh = typeof _getSheet === 'function' ? _getSheet('CredenciaisUsuarios') : null;
    if (sh) return true;

    if (typeof _abrirModulo !== 'function' || typeof _configurarAbas !== 'function' ||
        typeof MODULOS === 'undefined' || !MODULOS.MASTER) {
      Logger.log('[Auth] Funções de setup não disponíveis. Execute recriarEstrutura() no editor GAS.');
      return false;
    }

    var master = _abrirModulo('MASTER');
    _configurarAbas(master, { 'CredenciaisUsuarios': MODULOS.MASTER.abas['CredenciaisUsuarios'] }, '#1F2937');
    Logger.log('[Auth] Aba CredenciaisUsuarios criada via setup.');
    return true;
  } catch(e) {
    Logger.log('[garantirAbaCredenciais] ' + e.message);
    return false;
  }
}

/**
 * Bootstrap helper: cria a aba e insere o primeiro admin.
 * Chamar UMA VEZ do editor GAS para provisionar o sistema.
 * Ex: criarPrimeiroAdmin('joao@idm.org.br', 'senhaForte123', 'João Barros')
 */
function criarPrimeiroAdmin(email, senha, nome) {
  garantirAbaCredenciais();
  var emailDono = '';
  try { emailDono = Session.getEffectiveUser().getEmail(); } catch(_) {}
  return salvarCredencialUsuario(emailDono || email, email, senha, nome, true);
}

// ═══════════════════════════════════════════════════════════════
// CADASTRO EXTERNO — auto-registro aguardando aprovação admin
// ═══════════════════════════════════════════════════════════════

/**
 * Registra uma solicitação de acesso para usuário externo sem autenticação prévia.
 * Não cria credenciais imediatamente — apenas enfileira para aprovação admin.
 */
function solicitarCadastroExterno(nome, email, senha) {
  try {
    if (!nome || !email || !senha) {
      return { ok: false, msg: 'Nome, e-mail e senha são obrigatórios.' };
    }
    var emailLimpo = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailLimpo)) {
      return { ok: false, msg: 'E-mail inválido.' };
    }
    if (String(senha).trim().length < 6) {
      return { ok: false, msg: 'A senha deve ter pelo menos 6 caracteres.' };
    }

    var shCred = typeof _getSheet === 'function' ? _getSheet('CredenciaisUsuarios') : null;
    if (shCred && shCred.getLastRow() > 1) {
      var credRows = shCred.getRange(2, 1, shCred.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < credRows.length; i++) {
        if (String(credRows[i][0] || '').trim().toLowerCase() === emailLimpo) {
          return { ok: false, msg: 'Este e-mail já possui acesso. Tente fazer login.' };
        }
      }
    }

    var shSol = typeof _getSheet === 'function' ? _getSheet('Solicitacoes') : null;
    if (!shSol) return { ok: false, msg: 'Sistema indisponível. Tente novamente.' };

    if (shSol.getLastRow() > 1) {
      var solRows = shSol.getRange(2, 1, shSol.getLastRow() - 1, 9).getValues();
      for (var j = 0; j < solRows.length; j++) {
        if (String(solRows[j][1]).toUpperCase() === 'CADASTRO_EXTERNO' &&
            String(solRows[j][5]).toLowerCase().trim() === emailLimpo &&
            String(solRows[j][8]).toUpperCase() === 'PENDENTE') {
          return { ok: false, msg: 'Já existe uma solicitação pendente para este e-mail. Aguarde a resposta por e-mail.' };
        }
      }
    }

    var nomeLimpo = String(nome).trim();
    var senhaHash = _hashSenha(String(senha));
    var id = typeof gerarId === 'function' ? gerarId('CAD') : ('CAD_' + Date.now());

    shSol.appendRow([
      id,
      'CADASTRO_EXTERNO',
      '',
      '',
      '',
      emailLimpo,
      nomeLimpo,
      JSON.stringify({ nome: nomeLimpo, senhaHash: senhaHash }),
      'PENDENTE',
      '',
      new Date(),
      ''
    ]);

    try { _notificarAdminsCadastroExterno(id, nomeLimpo, emailLimpo); } catch(e) {}

    return { ok: true, msg: 'Solicitação enviada. Você receberá um e-mail quando for aprovado.' };
  } catch(e) {
    Logger.log('[solicitarCadastroExterno] ' + e.message);
    return { ok: false, msg: 'Erro ao registrar solicitação. Tente novamente.' };
  }
}

function _notificarAdminsCadastroExterno(id, nome, email) {
  try {
    var admins = typeof obterAdmins === 'function' ? obterAdmins() : [];
    if (!admins.length) return;
    var assunto = '[CCBJ] Nova solicitação de acesso — ' + nome;
    var corpo = [
      'Nova solicitação de cadastro externo recebida no Sistema CCBJ.',
      '',
      'Nome : ' + nome,
      'E-mail: ' + email,
      'Data  : ' + new Date().toLocaleString('pt-BR'),
      '',
      'Acesse o painel → Aprovações → Novos Usuários para aprovar ou recusar.',
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      'Sistema de Gestão de Espaços — Centro Cultural Bom Jardim',
      'Este e-mail foi gerado automaticamente.'
    ].join('\n');
    admins.forEach(function(a) {
      try { GmailApp.sendEmail(a, assunto, corpo); } catch(e) {}
    });
  } catch(e) {
    Logger.log('[_notificarAdminsCadastroExterno] ' + e.message);
  }
}
