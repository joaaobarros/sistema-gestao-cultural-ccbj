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
    var email = '';

    try {
      email = Session.getActiveUser().getEmail();
    } catch(e) {}

    if (!email) {
      try {
        email = Session.getEffectiveUser().getEmail();
      } catch(e) {}
    }

    email = String(email || '').toLowerCase().trim();

    if (!email || email.indexOf('@') === -1) {
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

  // Verificar lista de usuários conhecidos (Administradores + Funcionários)
  // Esta verificação é opcional — se não houver lista, aceitar qualquer domínio válido
  try {
    var shAdm = typeof _getSheet === 'function' ? _getSheet('Administradores') : null;
    if (shAdm && shAdm.getLastRow() > 1) {
      var admins = shAdm.getRange(2, 1, shAdm.getLastRow() - 1, 1).getValues()
        .map(function(r) { return String(r[0]).toLowerCase().trim(); });
      if (admins.indexOf(emailLimpo) >= 0) return emailLimpo;
      // Se há lista mas o email não está nela → negar apenas se RESTRINGIR_A_ADMINS=true
      var restringir = PropertiesService.getScriptProperties().getProperty('RESTRINGIR_A_ADMINS') || 'false';
      if (restringir === 'true') return '';
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
  try {
    if (typeof verificarPermissao === 'function') {
      if (verificarPermissao('superadmin', email)) return 'superadmin';
      if (verificarPermissao('admin', email)) return 'admin';
    }
    if (typeof obterPermissoesUsuario === 'function') {
      var perms = obterPermissoesUsuario(email);
      return perms.perfil || 'usuario';
    }
    return 'usuario';
  } catch(e) {
    return 'usuario';
  }
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
  if (!sessaoId) return { ok:false };

  var cache = CacheService.getScriptCache();
  var data = cache.get(sessaoId);

  if (!data) return { ok:false };

  var obj = JSON.parse(data);

  return {
    ok: true,
    email: obj.email
  };
}





function logoutSistema() {
  return true;
}