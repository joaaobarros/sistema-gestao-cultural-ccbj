/**
 * @file mod_admin.gs
 * @description Módulo de administração: autenticação de usuários, controle de permissões,
 *              logs de auditoria, gerenciamento de configurações e fluxo de solicitações.
 * @layer backend
 * @responsibility Identificação do usuário via Session.getActiveUser();
 *                 registro de auditoria; obterDadosIniciais (entrypoint do boot frontend);
 *                 CRUD de espaços, itens, setores e administradores;
 *                 fluxo de aprovação/recusa de solicitações.
 * @dependencies utils.js (_getSheet, validarEmail, normalizarEmail, sanitizarTexto),
 *               Codigo.gs (gerarId, include), GmailApp, Session, LockService
 */

// ==============================
// EMAIL E SESSÃO
// ==============================

/**
 * Resolve o email do usuário chamante.
 * Em "Execute as: Me" + Workspace domain, Session.getActiveUser() retorna o email
 * real do usuário em chamadas google.script.run.
 *
 * NUNCA usar getEffectiveUser() como identidade — em "Execute as: Me" ele retorna
 * o email do DONO do script para todos os usuários, quebrando logs e permissões.
 */
function obterEmailUsuario(emailClienteFallback, sessaoId) {
  try {
    let email = '';
    try { email = Session.getActiveUser()?.getEmail() || ''; } catch(_) {}

    // Token de sessão gerado no login com senha ou GSI
    if ((!email || email.trim() === '') && sessaoId) {
      try {
        if (typeof _resolverEmailSessao === 'function') {
          email = _resolverEmailSessao(sessaoId) || '';
        }
      } catch(_) {}
    }

    if (!email || email.trim() === '') email = emailClienteFallback;
    if (!email || email.trim() === '')
      throw new Error('Email não identificado.');
    const emailLimpo = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo))
      throw new Error('Formato de email inválido: ' + emailLimpo);
    return emailLimpo;
  } catch (e) {
    Logger.error('admin', 'Erro ao obter email', e.message);
    throw new Error('Não foi possível identificar o usuário: ' + e.message);
  }
}

function obterPerfilUsuario(emailFallback)  { return UserProfileService.obterPerfil(emailFallback); }

function obterUrlLogout() {
  try {
    const appUrl = ScriptApp.getService().getUrl();
    return (
      "https://accounts.google.com/Logout?continue=" +
      encodeURIComponent(appUrl)
    );
  } catch (e) {
    return "https://accounts.google.com/logout";
  }
}

function obterEmailsSistema()              { return UserProfileService.obterEmailsSistema(); }

function resolverNomePorEmail(email) {
  try {
    const user = AdminDirectory.Users.get(email, {
      projection: "basic",
      viewType: "domain_public",
    });
    return user.name?.fullName || user.name?.givenName || email.split("@")[0];
  } catch (e) {
    try {
      const url =
        "https://people.googleapis.com/v1/people:searchDirectoryPeople?query=" +
        encodeURIComponent(email) +
        "&readMask=names&sources=DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE";
      const res = UrlFetchApp.fetch(url, {
        headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true,
      });
      const data = JSON.parse(res.getContentText());
      return data.people?.[0]?.names?.[0]?.displayName || email.split("@")[0];
    } catch (e2) {
      return email.split("@")[0];
    }
  }
}

// ==============================
// PERMISSÕES
// ==============================

function verificarPermissao(nivelNecessario, email) {
  const aba = _getSheet("Administradores");
  if (!aba || aba.getLastRow() < 2)
    throw new Error("Nenhum administrador configurado.");

  const dados = aba.getRange(2, 1, aba.getLastRow() - 1, 2).getValues();
  const usuario = String(email).toLowerCase().trim();

  for (let i = 0; i < dados.length; i++) {
    const emailPlanilha = String(dados[i][0]).toLowerCase().trim();
    const nivel = String(dados[i][1]).toLowerCase().trim();
    if (emailPlanilha === usuario) {
      if (nivel === nivelNecessario || nivel === "superadmin") return true;
    }
  }
  throw new Error("Permissão negada.");
}

function verificarDonoOuAdmin(emailDono, emailAtual) {
  const emailAtualLimpo = String(emailAtual || "")
    .toLowerCase()
    .trim();
  const emailDonoLimpo = String(emailDono || "")
    .toLowerCase()
    .trim();
  if (!emailAtualLimpo) throw new Error("Email do usuário não identificado.");
  if (emailAtualLimpo === emailDonoLimpo) return true;
  try {
    verificarPermissao("admin", emailAtualLimpo);
    return true;
  } catch (e) {
    throw new Error(
      "Acesso negado: apenas o responsável ou administrador pode realizar esta ação.",
    );
  }
}

// ==============================
// DADOS INICIAIS / CACHE
// ==============================

/**
 * Entrypoint principal do boot do frontend.
 * Identidade resolvida via Session.getActiveUser() (Workspace domain).
 */
// SETOR — delega a UserProfileService
function obterSetorUsuario(email)                              { return UserProfileService.obterSetor(email); }
function salvarSetorUsuario(emailAlvo, setor, emailSolicitante){ return UserProfileService.salvarSetor(emailAlvo, setor, emailSolicitante); }

// BOOT — delega a BootService
function obterDadosIniciais(emailClienteFallback, sessaoId) { return BootService.obter(emailClienteFallback, sessaoId); }
function limparCacheUsuario(emailUsuario)                    { return BootService.limparCache(emailUsuario); }

// ==============================
// LOGS
// ==============================

function registrarLog(
  acao,
  tipo,
  alvo,
  detalhes,
  dadosAntes,
  dadosDepois,
  emailUsuario,
) {
  try {
    const abaLogs = _getSheet("Logs");
    if (!abaLogs) return;

    const usuario =
      emailUsuario ||
      Session.getActiveUser()?.getEmail() ||
      "desconhecido@sistema";

    const formatarDados = (dados) => {
      if (dados === undefined || dados === null) return "";
      if (Array.isArray(dados)) {
        return dados
          .map((v) => (v === null || v === undefined ? "-" : String(v)))
          .join(" | ");
      }
      if (typeof dados === "object") {
        try {
          const json = JSON.stringify(dados);
          return json.length > 50000 ? json.substring(0, 50000) + "..." : json;
        } catch (e) {
          return String(dados);
        }
      }
      return String(dados);
    };

    abaLogs.appendRow([
      new Date().toISOString(),
      sanitizarTexto(String(usuario)),
      sanitizarTexto(String(acao || "")).toUpperCase(),
      sanitizarTexto(String(tipo || "")).toUpperCase(),
      sanitizarTexto(String(alvo || "")),
      sanitizarTexto(String(detalhes || "")),
      formatarDados(dadosAntes),
      formatarDados(dadosDepois),
    ]);

    // Espelha no AuditoriaStore para que a trilha estruturada seja alimentada
    try {
      var _tipoMap = {
        'RESERVA': 'reservas', 'ESPACO': 'espacos', 'SETOR': 'sistema',
        'USUARIO': 'sistema',  'ITEM': 'almoxarifado', 'CONTRATO': 'contratos',
        'CHAVE': 'chaves', 'ACAO': 'acoes', 'HABILITACAO': 'habilitacoes',
        'APROVACAO': 'aprovacoes', 'MODULO': 'gestao_modulos'
      };
      AuditoriaStore.registrar({
        tipo:         String(acao  || 'LOG_SISTEMA').toUpperCase(),
        modulo:       _tipoMap[String(tipo || '').toUpperCase()] || 'sistema',
        acao:         String(acao  || '').toLowerCase(),
        entidadeId:   String(alvo  || ''),
        entidadeTipo: String(tipo  || ''),
        usuario:      String(usuario || ''),
        resultado:    'sucesso',
        mensagem:     String(detalhes || acao || ''),
        antes:        dadosAntes  || null,
        depois:       dadosDepois || null
      });
    } catch (aeErr) {
      // falha silenciosa — não interrompe o registro principal
    }

  } catch (e) {
    Logger.error('admin', 'Erro ao registrar log', e.message);
  }
}

function obterLogs(emailUsuario) {
  try {
    verificarPermissao("superadmin", emailUsuario);
    const abaLogs = _getSheet("Logs");
    if (!abaLogs || abaLogs.getLastRow() < 2) return "[]";
    const dados = abaLogs
      .getRange(2, 1, abaLogs.getLastRow() - 1, 8)
      .getValues();
    return JSON.stringify(dados.reverse().map(function(r) {
      var d = r[0] instanceof Date ? r[0] : new Date(String(r[0]));
      var ts = isNaN(d.getTime()) ? String(r[0]) :
        ('0'+d.getDate()).slice(-2)+'/'+('0'+(d.getMonth()+1)).slice(-2)+'/'+d.getFullYear()+
        ' '+('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);
      return [ts].concat(Array.from(r).slice(1).map(String));
    }));
  } catch (e) {
    throw new Error(e.message);
  }
}

function registrarAcesso(emailUsuario, nivelAcesso) {
  try {
    const aba = _getSheet("LogAcessos");
    if (!aba) return;
    const cache = CacheService.getUserCache();
    const chaveAcesso = "acesso_" + emailUsuario.replace(/[^a-z0-9]/g, "_");
    if (cache.get(chaveAcesso)) return;
    cache.put(chaveAcesso, "1", 300);
    const nomeUsuario = emailUsuario.split("@")[0];
    aba.appendRow([
      new Date().toISOString(),
      emailUsuario,
      nomeUsuario,
      nivelAcesso || "usuário",
      "",
      "",
    ]);
  } catch (e) {
    Logger.error('admin', 'Erro ao registrar acesso', e.message);
  }
}

function obterLogAcessos(emailUsuario) {
  try {
    const email =
      emailUsuario ||
      Session.getActiveUser()?.getEmail();
    verificarPermissao("admin", email);
    const aba = _getSheet("LogAcessos");
    if (!aba || aba.getLastRow() < 2) return "[]";
    const dados = aba
      .getRange(2, 1, aba.getLastRow() - 1, 6)
      .getDisplayValues();
    return JSON.stringify(dados.reverse());
  } catch (e) {
    throw new Error(e.message);
  }
}

// ==============================
// ROLLBACK — delega a RollbackService
// ==============================

function rollbackAcaoPorIndice(emailAtual, indiceLog)      { return RollbackService.porIndice(emailAtual, indiceLog); }
function rollbackAcaoPorTimestamp(emailAtual, timestampStr) { return RollbackService.porTimestamp(emailAtual, timestampStr); }

// ==============================
// CONFIGURAÇÕES — delegam a ConfigService
// ==============================

function processarSalvarConfig(dados)                          { return ConfigService.salvar(dados); }
function removerRegistroGenerico(id, tipo, emailAtual)         { return ConfigService.remover(id, tipo, emailAtual); }
function obterDadosParaConfig(nomeAba)                         { return ConfigService.obterDados(nomeAba); }
function alternarQuantidadeItem(idItem, idSala, qtd, acao, em) { return ConfigService.alternarItem(idItem, idSala, qtd, acao, em); }

// ==============================
// SOLICITAÇÕES — delegam a AdminSolicitacoesService
// ==============================

function obterAdmins()                              { return AdminSolicitacoesService.obterAdmins(); }
function obterDonoEspaco(n, d, t)                   { return AdminSolicitacoesService.obterDonoEspaco(n, d, t); }
function notificarSolicitacao(s)                    { return AdminSolicitacoesService.notificarSolicitacao(s); }
function chat_criarSolicitacao(t, st, d, u, j)      { return AdminSolicitacoesService.criarSolicitacao(t, st, d, u, j); }
function listarSolicitacoesPendentes(email)         { return AdminSolicitacoesService.listarPendentes(email); }
function listarTodasSolicitacoes(email)             { return AdminSolicitacoesService.listarTodas(email); }
function aprovarSolicitacao(id, email)              { return AdminSolicitacoesService.aprovar(id, email); }
function recusarSolicitacao(id, just, email)        { return AdminSolicitacoesService.recusar(id, just, email); }



// ==============================
// VALIDAÇÕES E SEGURANÇA
// ==============================

function validarCamposObrigatorios(obj, campos) {
  if (!obj || typeof obj !== "object") throw new Error("Dados inválidos.");
  campos.forEach((campo) => {
    if (
      obj[campo] === undefined ||
      obj[campo] === null ||
      String(obj[campo]).trim() === ""
    ) {
      throw new Error("Campo obrigatório não preenchido: " + campo);
    }
  });
}

function validarReserva(dados) {
  if (
    !validarFormatoHora(dados.horaInicio) ||
    !validarFormatoHora(dados.horaTermino)
  ) {
    throw new Error("Formato de horário inválido. Use HH:MM (ex: 14:30).");
  }
  const ini = normalizarHora(dados.horaInicio);
  const ter = normalizarHora(dados.horaTermino);
  const INI_MIN = normalizarHora("08:00");
  const FIM_MAX = normalizarHora("21:30");
  if (ini === null || ter === null)
    throw new Error("Não foi possível processar os horários.");
  if (ini < INI_MIN || ini >= FIM_MAX)
    throw new Error("Horário de início deve estar entre 08:00 e 21:29.");
  if (ter > FIM_MAX)
    throw new Error("Horário de término não pode ultrapassar 21:30.");
  if (ter <= ini)
    throw new Error("Horário de término deve ser posterior ao início.");
  const nomeAcao = String(dados.nomeAcao || "").trim();
  if (nomeAcao.length < 3)
    throw new Error("Nome da ação deve ter no mínimo 3 caracteres.");
  if (nomeAcao.length > 100)
    throw new Error("Nome da ação não pode exceder 100 caracteres.");
  return true;
}

function limitarRequisicoes(chave, limite, intervaloMs) {
  const cache = CacheService.getUserCache();
  const agora = Date.now();
  let registros = [];
  try {
    registros = JSON.parse(cache.get(chave) || "[]");
  } catch (e) {
    registros = [];
  }
  registros = registros.filter((ts) => agora - ts < intervaloMs);
  if (registros.length >= limite) {
    const segundos = Math.ceil(intervaloMs / 1000);
    throw new Error(
      `Muitas ações em pouco tempo. Aguarde ${segundos} segundos antes de tentar novamente.`,
    );
  }
  registros.push(agora);
  cache.put(chave, JSON.stringify(registros), 60);
}

function detectarComportamentoSuspeito(acao) {
  const cache = CacheService.getUserCache();
  const chave = "suspeita_" + String(acao).toLowerCase().replace(/\s/g, "_");
  const agora = Date.now();
  const intervalo = 5000;
  let registros = [];
  try {
    registros = JSON.parse(cache.get(chave) || "[]");
  } catch (e) {
    registros = [];
  }
  registros = registros.filter((ts) => agora - ts < intervalo);
  registros.push(agora);
  cache.put(chave, JSON.stringify(registros), 30);
  if (registros.length > 2) {
    throw new Error(
      "Ação repetida muito rapidamente. Aguarde alguns segundos e tente novamente.",
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// APROVAÇÃO DE CADASTRO EXTERNO — delegam a CadastroExternoService
// ═══════════════════════════════════════════════════════════════

function listarSolicitacoesCadastroExterno(emailAdmin) { return CadastroExternoService.listar(emailAdmin); }
function aprovarCadastroExterno(id, emailAdmin)         { return CadastroExternoService.aprovar(id, emailAdmin); }
function recusarCadastroExterno(id, emailAdmin, motivo) { return CadastroExternoService.recusar(id, emailAdmin, motivo); }

// PREFERÊNCIAS — delegam a UserProfileService
function salvarPreferencia(chave, valor) { return UserProfileService.salvarPreferencia(chave, valor); }
function obterPreferencia(chave)         { return UserProfileService.obterPreferencia(chave); }
/**
 * Controller para salvar configurações globais do sistema via painel admin.
 * Requer nível superadmin.
 */
function salvarSistemaConfigAdmin(cfg, emailFallback) {
  const email = obterEmailUsuario(emailFallback || '');
  verificarPermissao('superadmin', email);
  return salvarSistemaConfig(cfg);
}

/**
 * Retorna as configurações globais do sistema (leitura pública autenticada).
 */
function obterSistemaConfigAdmin() {
  return { ok: true, config: getSistemaConfig() };
}
