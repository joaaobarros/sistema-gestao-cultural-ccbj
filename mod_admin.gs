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
    console.error('Erro ao obter email:', e.message);
    throw new Error('Não foi possível identificar o usuário: ' + e.message);
  }
}

function obterPerfilUsuario(emailFallback) {
  try {
    const email = obterEmailUsuario(emailFallback || "");
    let nome = email.split("@")[0];
    let foto = null;
    try {
      const url =
        "https://people.googleapis.com/v1/people/me?personFields=names,photos";
      const res = UrlFetchApp.fetch(url, {
        headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true,
      });
      const data = JSON.parse(res.getContentText());
      nome = data.names?.[0]?.displayName || nome;
      foto = data.photos?.[0]?.url || null;
    } catch (e) {}
    return { email, nome, foto };
  } catch (e) {
    throw new Error(e.message);
  }
}

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

function obterEmailsSistema() {
  try {
    const emails = new Set();
    const abaAdmins = _getSheet("Administradores");
    if (abaAdmins && abaAdmins.getLastRow() > 1) {
      abaAdmins
        .getRange(2, 1, abaAdmins.getLastRow() - 1, 1)
        .getValues()
        .forEach((r) => {
          if (r[0] && String(r[0]).includes("@"))
            emails.add(String(r[0]).trim().toLowerCase());
        });
    }
    const abaLog = _getSheet("LogAcessos");
    if (abaLog && abaLog.getLastRow() > 1) {
      abaLog
        .getRange(2, 1, abaLog.getLastRow() - 1, 2)
        .getValues()
        .forEach((r) => {
          if (r[1] && String(r[1]).includes("@"))
            emails.add(String(r[1]).trim().toLowerCase());
        });
    }
    const abaRes = _getSheet("Reservas");
    if (abaRes && abaRes.getLastRow() > 1) {
      abaRes
        .getRange(2, 9, abaRes.getLastRow() - 1, 1)
        .getValues()
        .forEach((r) => {
          if (r[0] && String(r[0]).includes("@"))
            emails.add(String(r[0]).trim().toLowerCase());
        });
    }
    return Array.from(emails).sort();
  } catch (e) {
    return [];
  }
}

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
function obterDadosIniciais(emailClienteFallback, sessaoId) {
  try {
    const emailUsuario = obterEmailUsuario(emailClienteFallback || "", sessaoId || "");
    const cache    = CacheService.getScriptCache();
    const cacheKey = "dados_iniciais_" + emailUsuario.replace(/[^a-z0-9]/g, "_");
    const cacheExist = cache.get(cacheKey);

    if (cacheExist) {
      const dadosCache = JSON.parse(cacheExist);
      dadosCache.usuarioEmail = emailUsuario;
      return dadosCache;
    }

    const abaAdmins = _getSheet("Administradores");
    let listaAdminsCompleta = [];
    let nivelAcesso = "usuário";
    let indiceAdmins = {};

    if (abaAdmins && abaAdmins.getLastRow() > 1) {
      listaAdminsCompleta = abaAdmins
        .getRange(2, 1, abaAdmins.getLastRow() - 1, 2)
        .getValues();
      indiceAdmins = criarIndiceAdmins(listaAdminsCompleta);
      const adminInfo = indiceAdmins[emailUsuario];
      if (adminInfo) nivelAcesso = adminInfo.nivel;
    }

    registrarAcesso(emailUsuario, nivelAcesso);

    const configSheet = _getSheet("Configuracoes");
    let salasFull = [];
    let indiceSalas = {};
    const mapaSalasObj = {};

    if (configSheet && configSheet.getLastRow() > 1) {
      salasFull = configSheet
        .getRange(2, 1, configSheet.getLastRow() - 1, 5)
        .getValues();
      indiceSalas = criarIndiceSalas(salasFull);
      salasFull.forEach((s) => {
        const id = String(s[0]).trim();
        const nome = String(s[1]).trim();
        if (id && nome) mapaSalasObj[id] = nome;
      });
    }

    const itensSheet = _getSheet("Itens");
    let listaItens = [];
    let indiceItens = {};
    if (itensSheet && itensSheet.getLastRow() > 1) {
      listaItens = itensSheet
        .getRange(2, 1, itensSheet.getLastRow() - 1, 6)
        .getValues();
      indiceItens = criarIndiceItens(listaItens);
    }

    const setoresSheet = _getSheet("Listas");
    let setores = [];
    if (setoresSheet && setoresSheet.getLastRow() > 1) {
      setores = setoresSheet
        .getRange(2, 1, setoresSheet.getLastRow() - 1, 1)
        .getValues()
        .map((s) => s[0]);
    }

    const mapaNomes = {};
    listaAdminsCompleta.forEach((a) => {
      const em = String(a[0] || "").trim();
      if (em && validarEmail(em)) {
        try {
          mapaNomes[em] = resolverNomePorEmail(em);
        } catch (e) {
          mapaNomes[em] = em.split("@")[0];
        }
      }
    });

    const resultado = {
      usuarioEmail: emailUsuario,
      isAdmin: nivelAcesso === "admin" || nivelAcesso === "superadmin",
      isSuperadmin: nivelAcesso === "superadmin",
      isComunicacao:
        nivelAcesso === "comunicação" || nivelAcesso === "comunicacao",
      isHabilitador: nivelAcesso === "habilitador",
      salas: salasFull,
      mapaSalas: mapaSalasObj,
      setores,
      administradores: listaAdminsCompleta,
      listaItens,
      mapaNomes,
      _indiceAdmins: indiceAdmins,
      _indiceSalas: indiceSalas,
      _indiceItens: indiceItens,
      timestamp: new Date().getTime(),
    };

    cache.put(cacheKey, JSON.stringify(resultado), 60);
    console.log("Dados iniciais enviados para:", emailUsuario);
    return resultado;
  } catch (e) {
    console.error("Erro em obterDadosIniciais:", e.message, e.stack);
    throw new Error("Erro ao carregar dados: " + e.message);
  }
}

function limparCacheUsuario(emailUsuario) {
  // Cache armazenado em ScriptCache (não UserCache) — usar a mesma instância para limpar.
  const cache = CacheService.getScriptCache();
  if (emailUsuario && String(emailUsuario).includes("@")) {
    const chave =
      "dados_iniciais_" +
      emailUsuario
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_");
    cache.remove(chave);
  }
}

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
      new Date(),
      sanitizarTexto(String(usuario)),
      sanitizarTexto(String(acao || "")).toUpperCase(),
      sanitizarTexto(String(tipo || "")).toUpperCase(),
      sanitizarTexto(String(alvo || "")),
      sanitizarTexto(String(detalhes || "")),
      formatarDados(dadosAntes),
      formatarDados(dadosDepois),
    ]);
  } catch (e) {
    console.error("Erro ao registrar log:", e.message);
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
      new Date(),
      emailUsuario,
      nomeUsuario,
      nivelAcesso || "usuário",
      "",
      "",
    ]);
  } catch (e) {
    console.error("Erro ao registrar acesso:", e.message);
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
// ROLLBACK
// ==============================

function rollbackAcaoPorIndice(emailAtual, indiceLog) {
  verificarPermissao("superadmin", emailAtual);
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const abaLogs = _getSheet("Logs");
    if (!abaLogs || abaLogs.getLastRow() < 2)
      throw new Error("Nenhum log disponível.");

    const linhaAlvo = abaLogs.getLastRow() - indiceLog;
    if (linhaAlvo < 2) throw new Error("Índice de log inválido.");

    const log = abaLogs.getRange(linhaAlvo, 1, 1, 8).getValues()[0];
    return _executarRollback(log, emailAtual);
  } catch (e) {
    throw new Error("Erro no rollback: " + e.message);
  } finally {
    lock.releaseLock();
  }
}

function rollbackAcaoPorTimestamp(emailAtual, timestampStr) {
  verificarPermissao("superadmin", emailAtual);
  if (!timestampStr || String(timestampStr).trim() === "")
    throw new Error("Timestamp inválido para rollback.");

  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const abaLogs = _getSheet("Logs");
    if (!abaLogs || abaLogs.getLastRow() < 2)
      throw new Error("Nenhum log disponível.");

    const dados = abaLogs
      .getRange(2, 1, abaLogs.getLastRow() - 1, 8)
      .getDisplayValues();
    let linhaAlvo = -1;
    for (let i = 0; i < dados.length; i++) {
      if (String(dados[i][0]).trim() === String(timestampStr).trim()) {
        linhaAlvo = i;
        break;
      }
    }
    if (linhaAlvo === -1)
      throw new Error("Entrada de log não encontrada: " + timestampStr);

    return _executarRollback(
      dados[linhaAlvo],
      emailAtual,
      "Ref: " + timestampStr,
    );
  } catch (e) {
    throw new Error("Erro no rollback: " + e.message);
  } finally {
    lock.releaseLock();
  }
}

function _executarRollback(log, emailAtual, refExtra) {
  const acao = String(log[2] || "").toUpperCase();
  const tipo = String(log[3] || "").toUpperCase();
  const alvo = String(log[4] || "");
  const antesRaw = String(log[6] || "").trim();
  const depoisRaw = String(log[7] || "").trim();

  const parsearDados = (raw) => {
    if (!raw || raw === "") return null;
    return raw.split(" | ").map((v) => (v === "-" ? "" : v));
  };

  const dadosAntes = parsearDados(antesRaw);
  const dadosDepois = parsearDados(depoisRaw);

  const mapaAbas = {
    RESERVA: "Reservas",
    ESPACO: "Configuracoes",
    ESPAÇO: "Configuracoes",
    ITEM: "Itens",
    ADMIN: "Administradores",
    USUARIO: "Administradores",
    SETOR: "Listas",
    RECE: "ReservasRECE",
  };

  const abaNome = mapaAbas[tipo];
  if (!abaNome) throw new Error("Tipo desconhecido para rollback: " + tipo);

  const aba = _getSheet(abaNome);
  if (!aba) throw new Error("Aba não encontrada: " + abaNome);

  if (acao.includes("EXCLUSÃO")) {
    if (!dadosAntes) throw new Error("Sem dados anteriores para restaurar.");
    aba.appendRow(dadosAntes);
    registrarLog(
      "ROLLBACK",
      tipo,
      alvo,
      "Restauração após exclusão." + (refExtra ? " " + refExtra : ""),
      null,
      dadosAntes,
      emailAtual,
    );
  } else if (acao.includes("EDIÇÃO")) {
    if (!dadosAntes) throw new Error("Sem dados anteriores para reverter.");
    const id = String(dadosAntes[0]).trim();
    const registros = aba.getDataRange().getValues();
    let revertido = false;
    for (let i = 1; i < registros.length; i++) {
      if (String(registros[i][0]).trim() === id) {
        aba.getRange(i + 1, 1, 1, dadosAntes.length).setValues([dadosAntes]);
        revertido = true;
        break;
      }
    }
    if (!revertido) throw new Error("Registro não encontrado: " + id);
    registrarLog(
      "ROLLBACK",
      tipo,
      alvo,
      "Reversão de edição." + (refExtra ? " " + refExtra : ""),
      dadosDepois,
      dadosAntes,
      emailAtual,
    );
  } else if (acao.includes("CRIAÇÃO") || acao.includes("AGENDAMENTO")) {
    if (!dadosDepois) throw new Error("Sem dados do registro criado.");
    const id = String(dadosDepois[0]).trim();
    const registros = aba.getDataRange().getValues();
    let removido = false;
    for (let i = 1; i < registros.length; i++) {
      if (String(registros[i][0]).trim() === id) {
        aba.deleteRow(i + 1);
        removido = true;
        break;
      }
    }
    if (!removido) throw new Error("Registro não encontrado: " + id);
    registrarLog(
      "ROLLBACK",
      tipo,
      alvo,
      "Remoção após criação." + (refExtra ? " " + refExtra : ""),
      dadosDepois,
      null,
      emailAtual,
    );
  } else {
    throw new Error("Ação '" + acao + "' não é reversível.");
  }

  limparCacheUsuario(emailAtual);
  return { success: true };
}

// ==============================
// CONFIGURAÇÕES
// ==============================

function processarSalvarConfig(dados) {
  try {
    limitarRequisicoes("salvar_config", 10, 30000);
    if (!dados.emailAtual || !dados.emailAtual.includes("@"))
      throw new Error("Email do usuário não identificado.");
    validarCamposObrigatorios(dados, ["tipo"]);

    const tipo = String(dados.tipo || "")
      .toLowerCase()
      .trim();
    if (tipo === "espaco")
      validarCamposObrigatorios(dados, ["nome", "capacidade"]);
    if (tipo === "item")
      validarCamposObrigatorios(dados, ["nome", "categoria", "qtd"]);
    if (tipo === "usuario")
      validarCamposObrigatorios(dados, ["email", "nivel"]);
    if (tipo === "setor") validarCamposObrigatorios(dados, ["nome"]);

    if (tipo === "usuario") verificarPermissao("superadmin", dados.emailAtual);
    else verificarPermissao("admin", dados.emailAtual);

    const id = dados.id ? String(dados.id).trim() : null;
    const nome = String(dados.nome || "")
      .toUpperCase()
      .trim();

    const mapeamento = {
      espaco: { aba: "Configuracoes" },
      item: { aba: "Itens" },
      usuario: { aba: "Administradores" },
      setor: { aba: "Listas" },
    };

    const config = mapeamento[tipo];
    if (!config) throw new Error("Tipo inválido: " + tipo);

    const aba = _getSheet(config.aba);
    const data = aba.getDataRange().getValues();

    if (id) {
      for (let i = 0; i < data.length; i++) {
        if (String(data[i][0]).trim() === id) {
          const linha = i + 1;
          const dadosAntes = data[i];
          let dadosDepois = [];

          if (tipo === "espaco") {
            const emailEsp = String(dados.emailEspaco || "")
              .toLowerCase()
              .trim();
            dadosDepois = [
              id,
              nome,
              Number(dados.capacidade),
              data[i][3] || "",
              emailEsp,
            ];
            aba
              .getRange(linha, 2, 1, 2)
              .setValues([[nome, Number(dados.capacidade)]]);
            aba.getRange(linha, 5).setValue(emailEsp);
          } else if (tipo === "item") {
            dadosDepois = [id, nome, dados.categoria, Number(dados.qtd)];
            aba
              .getRange(linha, 2, 1, 3)
              .setValues([[nome, dados.categoria, Number(dados.qtd)]]);
          } else if (tipo === "usuario") {
            dadosDepois = [id, dados.nivel];
            aba.getRange(linha, 2).setValue(dados.nivel);
          } else if (tipo === "setor") {
            dadosDepois = [nome];
            aba.getRange(linha, 1).setValue(nome);
          }

          registrarLog(
            "EDIÇÃO",
            tipo.toUpperCase(),
            nome,
            "Editado via painel Admin.",
            dadosAntes,
            dadosDepois,
            dados.emailAtual,
          );
          limparCacheUsuario(dados.emailAtual);
          return obterDadosIniciais(dados.emailAtual);
        }
      }
    }

    let novaLinha = [];
    if (tipo === "espaco")
      novaLinha = [
        gerarId("SAL"),
        nome,
        Number(dados.capacidade),
        "",
        String(dados.emailEspaco || "")
          .toLowerCase()
          .trim(),
      ];
    else if (tipo === "item")
      novaLinha = [
        gerarId("ITM"),
        nome,
        dados.categoria,
        Number(dados.qtd),
        "{}",
        "DISPONÍVEL",
      ];
    else if (tipo === "usuario")
      novaLinha = [dados.email.toLowerCase(), dados.nivel];
    else if (tipo === "setor") novaLinha = [nome];

    aba.appendRow(novaLinha);
    registrarLog(
      "CRIAÇÃO",
      tipo.toUpperCase(),
      nome || dados.email,
      "Criado via painel Admin.",
      null,
      novaLinha,
      dados.emailAtual,
    );
    limparCacheUsuario(dados.emailAtual);
    return obterDadosIniciais(dados.emailAtual);
  } catch (error) {
    throw new Error("Erro no servidor: " + error.message);
  }
}

function removerRegistroGenerico(id, tipo, emailAtual) {
  try {
    if (tipo === "usuario") verificarPermissao("superadmin", emailAtual);
    else verificarPermissao("admin", emailAtual);

    const mapaAbas = {
      setor: "Listas",
      usuario: "Administradores",
      espaco: "Configuracoes",
      item: "Itens",
    };
    const sheet = _getSheet(mapaAbas[tipo]);
    const dados = sheet.getDataRange().getValues();

    for (let i = dados.length - 1; i >= 1; i--) {
      if (String(dados[i][0]).trim() === String(id).trim()) {
        registrarLog(
          "EXCLUSÃO",
          tipo.toUpperCase(),
          String(id),
          "Removido via painel Admin.",
          dados[i],
          null,
          emailAtual,
        );
        sheet.deleteRow(i + 1);
        break;
      }
    }

    limparCacheUsuario(emailAtual);
    return obterDadosIniciais(emailAtual);
  } catch (e) {
    throw new Error(e.message);
  }
}

function obterDadosParaConfig(nomeAba) {
  try {
    const aba = _getSheet(nomeAba);
    if (!aba || aba.getLastRow() < 2) return [];
    return aba
      .getRange(2, 1, aba.getLastRow() - 1, aba.getLastColumn())
      .getValues();
  } catch (e) {
    console.error("Erro ao buscar dados: " + e.message);
    return [];
  }
}

function alternarQuantidadeItem(idItem, idSala, quantidade, acao, emailAtual) {
  try {
    verificarPermissao("admin", emailAtual);
    const abaItens = _getSheet("Itens");
    const dados = abaItens.getDataRange().getValues();

    for (let i = 1; i < dados.length; i++) {
      if (String(dados[i][0]).trim() === String(idItem).trim()) {
        let qtdAtualEstoque = Number(dados[i][3]);
        let mapaAlocacao = {};
        try {
          mapaAlocacao = JSON.parse(String(dados[i][4] || "{}"));
        } catch (e) {
          mapaAlocacao = {};
        }

        if (acao === "fixar") {
          if (qtdAtualEstoque < quantidade)
            throw new Error("Estoque insuficiente no almoxarifado!");
          abaItens.getRange(i + 1, 4).setValue(qtdAtualEstoque - quantidade);
          mapaAlocacao[idSala] = (mapaAlocacao[idSala] || 0) + quantidade;
        } else {
          let qtdNaSala = mapaAlocacao[idSala] || 0;
          if (qtdNaSala < quantidade)
            throw new Error("Quantidade na sala insuficiente para liberar!");
          abaItens.getRange(i + 1, 4).setValue(qtdAtualEstoque + quantidade);
          mapaAlocacao[idSala] -= quantidade;
          if (mapaAlocacao[idSala] <= 0) delete mapaAlocacao[idSala];
        }

        abaItens.getRange(i + 1, 5).setValue(JSON.stringify(mapaAlocacao));
        limparCacheUsuario(emailAtual);
        return { success: true };
      }
    }
    throw new Error("Item não encontrado!");
  } catch (e) {
    throw new Error(e.message);
  }
}

// ==============================
// SOLICITAÇÕES
// ==============================

function obterAdmins() {
  const aba = _getSheet("Administradores");
  if (!aba || aba.getLastRow() < 2) return [];
  return aba
    .getRange(2, 1, aba.getLastRow() - 1, 1)
    .getValues()
    .map((l) => String(l[0]).toLowerCase().trim())
    .filter((e) => e.includes("@"));
}

function obterDonoEspaco(nomeOuIdEspaco, diaSemana) {
  const aba = _getSheet("Configuracoes");
  if (!aba || aba.getLastRow() < 2) return null;
  const dados = aba.getDataRange().getValues();
  for (let i = 1; i < dados.length; i++) {
    const id = String(dados[i][0] || "").trim();
    const nome = String(dados[i][1] || "")
      .toLowerCase()
      .trim();
    const alvo = String(nomeOuIdEspaco || "")
      .toLowerCase()
      .trim();
    if (id !== nomeOuIdEspaco && nome !== alvo) continue;

    const rawDono = String(dados[i][4] || "").trim();
    if (!rawDono) return null;

    try {
      const arr = JSON.parse(rawDono);
      const lista = Array.isArray(arr) ? arr : [arr];
      if (diaSemana !== undefined && diaSemana !== null) {
        const filtrados = lista.filter(
          (d) => Array.isArray(d.dias) && d.dias.includes(diaSemana),
        );
        if (filtrados.length) return filtrados.map((d) => d.email).join(",");
      }
      return lista.map((d) => d.email || d).join(",");
    } catch (e) {
      return rawDono;
    }
  }
  return null;
}

function notificarSolicitacao(s) {
  try {
    const diaSemana = s.diaSemana !== undefined ? s.diaSemana : null;
    const dono = obterDonoEspaco(s.sala, diaSemana);
    const admins = obterAdmins();
    const dest = [...new Set([dono, ...admins].filter(Boolean))];
    if (!dest.length) return;

    const configSheet = _getSheet("Configuracoes");
    let nomeSala = s.sala || "—";
    if (configSheet && configSheet.getLastRow() > 1) {
      const dados = configSheet.getDataRange().getValues();
      for (let i = 1; i < dados.length; i++) {
        if (String(dados[i][0]).trim() === String(s.sala).trim()) {
          nomeSala = String(dados[i][1]).trim();
          break;
        }
      }
    }

    const base = getBaseUrl();
    const assunto = `🔔 Nova solicitação de reserva — ${nomeSala} — CCBJ`;

    dest.forEach((email) => {
      const ehDono =
        email.toLowerCase().trim() === (dono || "").toLowerCase().trim();
      const papel = ehDono
        ? "👤 Responsável pelo espaço"
        : "🛡️ Administrador do sistema";
      const corpo = `
Olá,

Você está recebendo esta notificação como: ${papel}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 NOVA SOLICITAÇÃO DE RESERVA — CCBJ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🏛️ Espaço solicitado : ${nomeSala}
📋 Tipo               : ${s.tipo} / ${s.subtipo}
👤 Solicitante        : ${s.usuario}
📩 Destinatário       : ${email}
📅 Data da solicitação: ${new Date().toLocaleString("pt-BR")}

💬 Justificativa:
"${s.justificativa}"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ações disponíveis:

✅ Aprovar : ${base}?acao=aprovar&id=${s.id}
❌ Recusar : ${base}?acao=recusar&id=${s.id}

Ou acesse o painel de Aprovações no sistema CCBJ.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Este e-mail foi gerado automaticamente pelo Sistema de Gestão de Espaços do CCBJ.
      `.trim();
      GmailApp.sendEmail(email, assunto, corpo);
    });
  } catch (e) {
    console.error("Erro ao notificar:", e.message);
  }
}

function chat_criarSolicitacao(tipo, subtipo, dados, usuario, justificativa) {
  if (!justificativa || String(justificativa).trim().length < 10) {
    throw new Error("Justificativa obrigatória (mínimo 10 caracteres).");
  }
  if (!usuario || !usuario.includes("@")) {
    throw new Error("Usuário não identificado.");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const aba = _getSheet("Solicitacoes");
    if (!aba)
      throw new Error("Aba 'Solicitacoes' não encontrada. Execute o Setup.");

    const id = gerarId("SOL");
    const sala = String(dados?.sala || "").trim();

    let diaSemana = null;
    try {
      const datas = dados?.datas || [];
      const dataStr = datas.length > 0 ? datas[0] : dados?.dados?.data || "";
      if (dataStr) {
        const p = String(dataStr).split("/");
        if (p.length === 3) diaSemana = new Date(p[2], p[1] - 1, p[0]).getDay();
      }
    } catch (e) {}

    const linha = [
      id,
      String(tipo || "").toUpperCase(),
      String(subtipo || "").toUpperCase(),
      (dados && dados.idReserva) ||
        (dados && dados.dados && dados.dados.id) ||
        "",
      sala,
      String(usuario).toLowerCase().trim(),
      String(justificativa).trim(),
      JSON.stringify(dados || {}),
      "PENDENTE",
      "",
      new Date(),
      "",
    ];

    aba.appendRow(linha);
    limparCacheUsuario(usuario);

    try {
      notificarSolicitacao({
        id,
        tipo,
        subtipo,
        sala,
        usuario,
        justificativa,
        diaSemana,
      });
    } catch (e) {
      console.warn("Notificação falhou (não crítico):", e.message);
    }

    return { success: true, id };
  } finally {
    lock.releaseLock();
  }
}

function listarSolicitacoesPendentes(emailUsuario) {
  const aba = _getSheet("Solicitacoes");
  if (!aba || aba.getLastRow() < 2) return [];

  const dados = aba.getRange(2, 1, aba.getLastRow() - 1, 12).getDisplayValues();
  const admins = obterAdmins();
  const email = String(emailUsuario || "")
    .toLowerCase()
    .trim();
  const isAdmin = admins.includes(email);

  const configSheet = _getSheet("Configuracoes");
  const salasComoResponsavel = new Set();
  if (configSheet && configSheet.getLastRow() > 1) {
    configSheet
      .getRange(2, 1, configSheet.getLastRow() - 1, 5)
      .getValues()
      .forEach(function (row) {
        const rawDono = String(row[4] || "").trim();
        if (!rawDono) return;
        let emails = [];
        try {
          const arr = JSON.parse(rawDono);
          const lista = Array.isArray(arr) ? arr : [arr];
          emails = lista.map(function (d) {
            return String(d.email || d || "")
              .toLowerCase()
              .trim();
          });
        } catch (e) {
          emails = [rawDono.toLowerCase().trim()];
        }
        if (emails.includes(email))
          salasComoResponsavel.add(String(row[0]).trim());
      });
  }

  return dados
    .filter((r) => {
      if (!r[0]) return false;
      if (String(r[1]).toUpperCase() === 'CADASTRO_EXTERNO') return false;
      if (isAdmin) return true;
      if (salasComoResponsavel.has(String(r[4]).trim())) return true;
      const status = String(r[8]).toUpperCase();
      return (
        String(r[5]).toLowerCase().trim() === email && status === "PENDENTE"
      );
    })
    .map((r) => ({
      id: r[0],
      tipo: r[1],
      subtipo: r[2],
      idReserva: r[3],
      sala: r[4],
      usuario: r[5],
      justificativa: r[6],
      status: r[8],
      aprovador: r[9],
      dataSolicitacao: r[10],
      dataAcao: r[11],
    }));
}

function listarTodasSolicitacoes(emailUsuario) {
  const admins = obterAdmins();
  const emailL = String(emailUsuario || "")
    .toLowerCase()
    .trim();
  const isAdm = admins.includes(emailL);
  if (!isAdm) {
    const configS = _getSheet("Configuracoes");
    let ehDono = false;
    if (configS && configS.getLastRow() > 1) {
      configS
        .getRange(2, 1, configS.getLastRow() - 1, 5)
        .getValues()
        .forEach(function (row) {
          if (ehDono) return;
          const raw = String(row[4] || "").trim();
          if (!raw) return;
          let emails = [];
          try {
            const a = JSON.parse(raw);
            emails = (Array.isArray(a) ? a : [a]).map(function (d) {
              return String(d.email || d || "")
                .toLowerCase()
                .trim();
            });
          } catch (e) {
            emails = [raw.toLowerCase().trim()];
          }
          if (emails.includes(emailL)) ehDono = true;
        });
    }
    if (!ehDono) throw new Error("Acesso negado.");
  }

  const aba = _getSheet("Solicitacoes");
  if (!aba || aba.getLastRow() < 2) return [];

  return aba
    .getRange(2, 1, aba.getLastRow() - 1, 12)
    .getDisplayValues()
    .filter((r) => r[0] && String(r[1]).toUpperCase() !== 'CADASTRO_EXTERNO')
    .map((r) => ({
      id: r[0],
      tipo: r[1],
      subtipo: r[2],
      idReserva: r[3],
      sala: r[4],
      usuario: r[5],
      justificativa: r[6],
      status: r[8],
      aprovador: r[9],
      dataSolicitacao: r[10],
      dataAcao: r[11],
    }))
    .reverse();
}

function aprovarSolicitacao(id, emailAprovador) {
  if (!emailAprovador || !emailAprovador.includes("@")) {
    emailAprovador = obterEmailUsuario("");
  }

  const admins = obterAdmins();
  const emailLimpo = emailAprovador.toLowerCase().trim();
  const isAdmin = admins.includes(emailLimpo);

  let isDonoEspaco = false;
  if (!isAdmin) {
    const abaSol = _getSheet("Solicitacoes");
    if (abaSol) {
      const linhasSol = abaSol.getDataRange().getValues();
      for (let i = 1; i < linhasSol.length; i++) {
        if (String(linhasSol[i][0]).trim() === String(id).trim()) {
          const salaId = String(linhasSol[i][4]).trim();
          let diaSemana = null;
          try {
            const payload = JSON.parse(linhasSol[i][7] || "{}");
            const datas = payload.datas || [];
            const dataStr =
              datas.length > 0 ? datas[0] : payload.dados?.data || "";
            if (dataStr) {
              const p = String(dataStr).split("/");
              if (p.length === 3)
                diaSemana = new Date(p[2], p[1] - 1, p[0]).getDay();
            }
          } catch (e) {}
          const donosStr = obterDonoEspaco(salaId, diaSemana) || "";
          const listaEmails = donosStr
            .split(",")
            .map((e) => e.toLowerCase().trim());
          if (listaEmails.includes(emailLimpo)) isDonoEspaco = true;
          break;
        }
      }
    }
  }

  if (!isAdmin && !isDonoEspaco) {
    throw new Error(
      "Acesso negado: apenas o responsável pelo espaço ou administrador pode aprovar.",
    );
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const aba = _getSheet("Solicitacoes");
    const dados = aba.getDataRange().getValues();
    let linha = -1,
      sol = null;
    for (let i = 1; i < dados.length; i++) {
      if (String(dados[i][0]).trim() === String(id).trim()) {
        sol = dados[i];
        linha = i;
        break;
      }
    }
    if (!sol) throw new Error("Solicitação não encontrada.");

    const status = String(sol[8]).toUpperCase();
    if (status === "APROVADO") throw new Error("Solicitação já aprovada.");
    if (status === "RECUSADO") throw new Error("Solicitação já recusada.");

    let payload = {};
    try {
      payload = JSON.parse(sol[7] || "{}");
    } catch (e) {}

    const tipo = String(sol[1]).toUpperCase();

    if (tipo === "RESERVA") {
      const d = payload.dados || payload;
      const dt =
        payload.datas || payload.datasAgendadas || [d.data].filter(Boolean);
      if (!d || !d.nomeAcao) throw new Error("Payload inválido para reserva.");
      criarReservaController(d, dt);
    } else if (tipo === "ALTERACAO") {
      const d = payload.dados || payload;
      if (!d || !d.id) throw new Error("Payload inválido para alteração.");
      atualizarReservaController(d);
    } else if (tipo === "CANCELAMENTO") {
      const idRes = payload.idReserva || payload.id || sol[3];
      if (!idRes) throw new Error("ID da reserva não encontrado.");
      cancelarReserva(idRes, emailAprovador);
    }

    aba.getRange(linha + 1, 9).setValue("APROVADO");
    aba.getRange(linha + 1, 10).setValue(emailAprovador);
    aba.getRange(linha + 1, 12).setValue(new Date());

    registrarLog(
      "APROVAÇÃO",
      "SOLICITAÇÃO",
      id,
      `Tipo: ${tipo} | Aprovador: ${emailAprovador}`,
      "PENDENTE",
      "APROVADO",
      emailAprovador,
    );

    try {
      const solicitante = String(sol[5] || "");
      if (solicitante.includes("@")) {
        GmailApp.sendEmail(
          solicitante,
          `✅ Sua solicitação foi aprovada — CCBJ`,
          `Sua solicitação (${tipo}) foi aprovada por ${emailAprovador}.`,
        );
      }
    } catch (e) {}

    limparCacheUsuario(emailAprovador);
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

function recusarSolicitacao(id, justificativa, emailAprovador) {
  if (!emailAprovador || !emailAprovador.includes("@")) {
    emailAprovador = obterEmailUsuario("");
  }

  const admins = obterAdmins();
  const emailLimpoR = emailAprovador.toLowerCase().trim();
  const isAdminR = admins.includes(emailLimpoR);

  let isDonoEspacoR = false;
  if (!isAdminR) {
    const abaSolR = _getSheet("Solicitacoes");
    if (abaSolR) {
      const linhasSolR = abaSolR.getDataRange().getValues();
      for (let i = 1; i < linhasSolR.length; i++) {
        if (String(linhasSolR[i][0]).trim() === String(id).trim()) {
          const salaIdR = String(linhasSolR[i][4]).trim();
          let diaSemanaR = null;
          try {
            const payloadR = JSON.parse(linhasSolR[i][7] || "{}");
            const datasR = payloadR.datas || [];
            const dataStrR =
              datasR.length > 0 ? datasR[0] : payloadR.dados?.data || "";
            if (dataStrR) {
              const p = String(dataStrR).split("/");
              if (p.length === 3)
                diaSemanaR = new Date(p[2], p[1] - 1, p[0]).getDay();
            }
          } catch (e) {}
          const donosStrR = obterDonoEspaco(salaIdR, diaSemanaR) || "";
          const listaEmailsR = donosStrR
            .split(",")
            .map((e) => e.toLowerCase().trim());
          if (listaEmailsR.includes(emailLimpoR)) isDonoEspacoR = true;
          break;
        }
      }
    }
  }

  if (!isAdminR && !isDonoEspacoR) {
    throw new Error(
      "Acesso negado: apenas o responsável pelo espaço ou administrador pode recusar.",
    );
  }

  if (!justificativa || String(justificativa).trim().length < 5) {
    throw new Error("Justificativa obrigatória (mínimo 5 caracteres).");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const aba = _getSheet("Solicitacoes");
    const dados = aba.getDataRange().getValues();
    let linha = -1,
      sol = null;
    for (let i = 1; i < dados.length; i++) {
      if (String(dados[i][0]).trim() === String(id).trim()) {
        sol = dados[i];
        linha = i;
        break;
      }
    }
    if (!sol) throw new Error("Solicitação não encontrada.");

    const status = String(sol[8]).toUpperCase();
    if (status !== "PENDENTE")
      throw new Error(`Solicitação já ${status.toLowerCase()}.`);

    aba.getRange(linha + 1, 9).setValue("RECUSADO");
    aba.getRange(linha + 1, 10).setValue(emailAprovador);
    aba.getRange(linha + 1, 12).setValue(new Date());
    const justAtual = String(sol[6] || "");
    aba
      .getRange(linha + 1, 7)
      .setValue(justAtual + " | RECUSA: " + justificativa.trim());

    registrarLog(
      "RECUSA",
      "SOLICITAÇÃO",
      id,
      `Motivo: ${justificativa} | Recusador: ${emailAprovador}`,
      "PENDENTE",
      "RECUSADO",
      emailAprovador,
    );

    try {
      const solicitante = String(sol[5] || "");
      if (solicitante.includes("@")) {
        GmailApp.sendEmail(
          solicitante,
          `❌ Sua solicitação foi recusada — CCBJ`,
          `Sua solicitação (${sol[1]}) foi recusada.\nMotivo: ${justificativa}`,
        );
      }
    } catch (e) {}

    limparCacheUsuario(emailAprovador);
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

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
// APROVAÇÃO DE CADASTRO EXTERNO
// ═══════════════════════════════════════════════════════════════

function listarSolicitacoesCadastroExterno(emailAdmin) {
  try {
    var emailL = String(emailAdmin || '').toLowerCase().trim();
    var admins = obterAdmins();
    if (!admins.includes(emailL)) return { ok: false, msg: 'Acesso negado.' };

    var sh = _getSheet('Solicitacoes');
    if (!sh || sh.getLastRow() < 2) return { ok: true, solicitacoes: [] };

    var dados = sh.getRange(2, 1, sh.getLastRow() - 1, 12).getDisplayValues();
    var result = dados
      .filter(function(r) { return r[0] && String(r[1]).toUpperCase() === 'CADASTRO_EXTERNO'; })
      .map(function(r) {
        var payload = {};
        try { payload = JSON.parse(r[7] || '{}'); } catch(e) {}
        return {
          id: r[0],
          nome: payload.nome || r[6] || '',
          email: r[5],
          status: r[8],
          aprovador: r[9],
          dataSolicitacao: r[10],
          dataAcao: r[11]
        };
      });

    return { ok: true, solicitacoes: result };
  } catch(e) {
    Logger.log('[listarSolicitacoesCadastroExterno] ' + e.message);
    return { ok: false, msg: e.message };
  }
}

function aprovarCadastroExterno(id, emailAdmin) {
  try {
    var emailL = String(emailAdmin || '').toLowerCase().trim();
    var admins = obterAdmins();
    if (!admins.includes(emailL)) return { ok: false, msg: 'Acesso negado.' };

    var sh = _getSheet('Solicitacoes');
    if (!sh) return { ok: false, msg: 'Aba Solicitacoes não encontrada.' };

    var dados = sh.getRange(2, 1, sh.getLastRow() - 1, 12).getValues();
    var linhaIdx = -1;
    var sol = null;

    for (var i = 0; i < dados.length; i++) {
      if (String(dados[i][0]).trim() === String(id).trim()) {
        linhaIdx = i + 2;
        sol = dados[i];
        break;
      }
    }

    if (linhaIdx < 0 || !sol) return { ok: false, msg: 'Solicitação não encontrada.' };
    if (String(sol[8]).toUpperCase() !== 'PENDENTE') return { ok: false, msg: 'Solicitação já processada.' };

    var payload = {};
    try { payload = JSON.parse(String(sol[7] || '{}')); } catch(e) {}

    var emailAlvo = String(sol[5]).toLowerCase().trim();
    var nome = payload.nome || String(sol[6]).trim();
    var senhaHash = payload.senhaHash || '';

    if (!emailAlvo || !senhaHash) return { ok: false, msg: 'Dados da solicitação incompletos.' };

    var shCred = _getSheet('CredenciaisUsuarios');
    if (!shCred) return { ok: false, msg: 'Aba CredenciaisUsuarios não encontrada.' };

    var jaExiste = false;
    if (shCred.getLastRow() > 1) {
      var credDados = shCred.getRange(2, 1, shCred.getLastRow() - 1, 4).getValues();
      for (var j = 0; j < credDados.length; j++) {
        if (String(credDados[j][0] || '').toLowerCase().trim() === emailAlvo) {
          jaExiste = true;
          shCred.getRange(j + 2, 2).setValue(senhaHash);
          shCred.getRange(j + 2, 3).setValue(nome);
          shCred.getRange(j + 2, 4).setValue(true);
          break;
        }
      }
    }
    if (!jaExiste) {
      shCred.appendRow([emailAlvo, senhaHash, nome, true, new Date().toISOString(), '']);
    }

    sh.getRange(linhaIdx, 9).setValue('APROVADO');
    sh.getRange(linhaIdx, 10).setValue(emailAdmin);
    sh.getRange(linhaIdx, 12).setValue(new Date().toLocaleString('pt-BR'));

    try { _enviarEmailAprovacaoCadastro(emailAlvo, nome); } catch(e) {}

    return { ok: true, msg: 'Usuário aprovado com sucesso.', emailAlvo: emailAlvo };
  } catch(e) {
    Logger.log('[aprovarCadastroExterno] ' + e.message);
    return { ok: false, msg: e.message };
  }
}

function recusarCadastroExterno(id, emailAdmin, motivo) {
  try {
    var emailL = String(emailAdmin || '').toLowerCase().trim();
    var admins = obterAdmins();
    if (!admins.includes(emailL)) return { ok: false, msg: 'Acesso negado.' };

    var sh = _getSheet('Solicitacoes');
    if (!sh) return { ok: false, msg: 'Aba Solicitacoes não encontrada.' };

    var dados = sh.getRange(2, 1, sh.getLastRow() - 1, 12).getValues();
    var linhaIdx = -1;
    var sol = null;

    for (var i = 0; i < dados.length; i++) {
      if (String(dados[i][0]).trim() === String(id).trim()) {
        linhaIdx = i + 2;
        sol = dados[i];
        break;
      }
    }

    if (linhaIdx < 0 || !sol) return { ok: false, msg: 'Solicitação não encontrada.' };
    if (String(sol[8]).toUpperCase() !== 'PENDENTE') return { ok: false, msg: 'Solicitação já processada.' };

    var payload = {};
    try { payload = JSON.parse(String(sol[7] || '{}')); } catch(e) {}
    var emailAlvo = String(sol[5]).toLowerCase().trim();
    var nome = payload.nome || String(sol[6]).trim();
    payload.motivoRecusa = String(motivo || '').trim();

    sh.getRange(linhaIdx, 8).setValue(JSON.stringify(payload));
    sh.getRange(linhaIdx, 9).setValue('RECUSADO');
    sh.getRange(linhaIdx, 10).setValue(emailAdmin);
    sh.getRange(linhaIdx, 12).setValue(new Date().toLocaleString('pt-BR'));

    try { _enviarEmailRecusaCadastro(emailAlvo, nome, motivo); } catch(e) {}

    return { ok: true, msg: 'Solicitação recusada.' };
  } catch(e) {
    Logger.log('[recusarCadastroExterno] ' + e.message);
    return { ok: false, msg: e.message };
  }
}

function _enviarEmailAprovacaoCadastro(emailAlvo, nome) {
  try {
    var webAppUrl = '';
    try { webAppUrl = PropertiesService.getScriptProperties().getProperty('WEBAPP_URL') || ''; } catch(e) {}
    var assunto = 'Acesso ao Sistema CCBJ aprovado — Bem-vindo(a)!';
    var corpo = [
      'Olá, ' + nome + '!',
      '',
      'Sua solicitação de acesso ao Sistema de Gestão de Espaços do CCBJ foi aprovada.',
      '',
      'Você já pode fazer login com seu e-mail e a senha que cadastrou.',
      webAppUrl ? 'Acesse: ' + webAppUrl : 'Acesse o sistema pelo link fornecido pelo administrador.',
      '',
      'Se precisar de ajuda, entre em contato com a equipe do CCBJ.',
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      'Centro Cultural Bom Jardim — Sistema de Gestão de Espaços',
      'Este e-mail foi gerado automaticamente.'
    ].join('\n');
    GmailApp.sendEmail(emailAlvo, assunto, corpo);
  } catch(e) {
    Logger.log('[_enviarEmailAprovacaoCadastro] ' + e.message);
  }
}

function _enviarEmailRecusaCadastro(emailAlvo, nome, motivo) {
  try {
    var assunto = 'Solicitação de acesso ao Sistema CCBJ — Resposta';
    var corpo = [
      'Olá, ' + nome + '!',
      '',
      'Sua solicitação de acesso ao Sistema de Gestão de Espaços do CCBJ foi analisada.',
      '',
      'Infelizmente, não foi possível aprovar seu cadastro neste momento.',
      motivo ? ('\nMotivo informado:\n"' + String(motivo).trim() + '"\n') : '',
      'Se acredita que houve um engano, entre em contato diretamente com a equipe do CCBJ.',
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      'Centro Cultural Bom Jardim — Sistema de Gestão de Espaços',
      'Este e-mail foi gerado automaticamente.'
    ].join('\n');
    GmailApp.sendEmail(emailAlvo, assunto, corpo);
  } catch(e) {
    Logger.log('[_enviarEmailRecusaCadastro] ' + e.message);
  }
}

function salvarPreferencia(chave, valor) {
  var email = Session.getActiveUser().getEmail();
  if (!email || !chave) return;
  var aba = _getSheet('PreferenciasUsuarios');
  if (!aba) return;
  var dados = aba.getLastRow() > 1 ? aba.getDataRange().getValues() : [[]];
  for (var i = 1; i < dados.length; i++) {
    if (String(dados[i][0]).toLowerCase() === email.toLowerCase() && dados[i][1] === chave) {
      aba.getRange(i + 1, 3).setValue(valor);
      aba.getRange(i + 1, 4).setValue(new Date().toISOString());
      return;
    }
  }
  aba.appendRow([email, chave, valor, new Date().toISOString()]);
}

function obterPreferencia(chave) {
  var email = Session.getActiveUser().getEmail();
  if (!email || !chave) return null;
  var aba = _getSheet('PreferenciasUsuarios');
  if (!aba || aba.getLastRow() < 2) return null;
  var dados = aba.getDataRange().getValues();
  for (var i = 1; i < dados.length; i++) {
    if (String(dados[i][0]).toLowerCase() === email.toLowerCase() && dados[i][1] === chave) {
      return String(dados[i][2] || '') || null;
    }
  }
  return null;
}