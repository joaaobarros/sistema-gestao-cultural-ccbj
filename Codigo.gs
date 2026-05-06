/**
 * @file Codigo.gs
 * @description Ponto de entrada do servidor GAS. Define doGet/doPost e
 *              a função include() para composição de templates HTML.
 * @layer backend
 * @responsibility Roteamento HTTP, notificações de cancelamento,
 *                 stubs para funcionalidades em desenvolvimento.
 * @dependencies mod_admin.gs (aprovarSolicitacao, recusarSolicitacao),
 *               mod_reservas.gs (via helpers), utils.gs (gerarId, isMesmoDia)
 */

const BASE_URL_FALLBACK =
  "https://script.google.com/macros/s/AKfycbzw2Gum2jte37SUmkEvbHUkwkxD_BRg51s_E7p3VUeODP2pIZUyO76yL5E2JuiuMUp1wg/exec";

/**
 * ========================================
 * BLOCO: URL base e configuração de deployment
 * ========================================
 * @description Resolve a URL pública do webapp. Usa a URL dinâmica do ScriptApp quando
 *              disponível, ou cai no fallback hardcoded para ambientes de teste local.
 * @sideEffects Nenhum
 */
function getBaseUrl() {
  try {
    return ScriptApp.getService().getUrl() || BASE_URL_FALLBACK;
  } catch (e) {
    return BASE_URL_FALLBACK;
  }
}

/**
 * ========================================
 * BLOCO: Template helper
 * ========================================
 * @description include(): injeção de fragmentos HTML no template (usado por Index.html).
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function obterMapaSalas() {
  const sheet = _getSheet("Configuracoes");
  const mapa = {};
  if (sheet && sheet.getLastRow() > 1) {
    sheet
      .getRange(2, 1, sheet.getLastRow() - 1, 2)
      .getValues()
      .forEach((s) => {
        if (s[0] && s[1]) mapa[String(s[0]).trim()] = String(s[1]).trim();
      });
  }
  return mapa;
}

function _notificarCancelamentoMesmoDia({ sala, nome, inicio, fim, emailAtual }) {
  try {
    const abaAdmins = _getSheet("Administradores");
    if (!abaAdmins || abaAdmins.getLastRow() < 2) return;
    const admins = abaAdmins
      .getRange(2, 1, abaAdmins.getLastRow() - 1, 1)
      .getValues()
      .map((l) => String(l[0]).trim())
      .filter((e) => e.includes("@"));
    if (!admins.length) return;
    const mapaSalas = obterMapaSalas();
    const nomeSala = mapaSalas[String(sala).trim()] || sala;
    GmailApp.sendEmail(
      admins.join(","),
      `⚠️ Cancelamento no mesmo dia — CCBJ`,
      `Atenção: reserva cancelada no mesmo dia.\n\nSala: ${nomeSala}\nAção: ${nome}\nHorário: ${inicio} – ${fim}\nResponsável: ${emailAtual}\n\nVerifique se o espaço precisa de atenção.`,
    );
  } catch (e) {
    console.warn("Notificação de cancelamento falhou:", e.message);
  }
}

// Mantida para compatibilidade
function chat_enviarMensagem(texto) {
  console.log("[ALERTA INTERNO]", texto);
}

// Stubs EM_BREVE
function obterMetricasCODIP() {
  throw new Error("EM_BREVE");
}
function gerarDocumentoDownload() {
  throw new Error("EM_BREVE");
}

function testeVSCode() {
  Logger.log("funcionando");
}

/**
 * ========================================
 * BLOCO: Roteamento HTTP — doGet / doPost
 * ========================================
 * @description Ponto de entrada HTTP do webapp.
 *              doGet: se receber ?acao=aprovar&id=X → processa aprovação inline (email);
 *                     se receber ?acao=recusar&id=X → exibe formulário de justificativa;
 *                     sem parâmetros → renderiza o app principal (Index.html).
 *              doPost: processa o formulário de recusa enviado pelo doGet anterior.
 * @context Chamado pelo Google Apps Script a cada request HTTP externo
 * @sideEffects doGet(aprovar): chama aprovarSolicitacao, envia email
 *              doPost: chama recusarSolicitacao
 */
function doGet(e) {
  let email = '';

  try {
    email = Session.getActiveUser().getEmail() || '';
  } catch(e) {}

  if (!email) {
    var appUrl = '';
    try { appUrl = ScriptApp.getService().getUrl(); } catch(_) { appUrl = BASE_URL_FALLBACK; }
    var loginUrl = 'https://accounts.google.com/AccountChooser?continue=' + encodeURIComponent(appUrl);

    return HtmlService.createHtmlOutput(
      '<!DOCTYPE html><html><head>' +
      '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Sistema CCBJ — Login</title>' +
      '<style>' +
        'body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f1f5f9}' +
        '.card{background:#fff;border-radius:20px;padding:48px 36px;text-align:center;box-shadow:0 4px 32px rgba(0,0,0,.1);max-width:400px;width:90%}' +
        '.icon{font-size:52px;margin-bottom:20px}' +
        'h2{color:#1e293b;margin:0 0 12px;font-size:22px}' +
        'p{color:#64748b;margin:0 0 32px;line-height:1.6;font-size:15px}' +
        '.btn{display:inline-flex;align-items:center;gap:10px;background:#4285f4;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;font-size:15px}' +
        '.btn:hover{background:#3367d6}' +
        '.hint{margin-top:20px;font-size:12px;color:#94a3b8}' +
      '</style></head>' +
      '<body><div class="card">' +
        '<div class="icon">🔒</div>' +
        '<h2>Acesso Restrito</h2>' +
        '<p>Para acessar o Sistema CCBJ, faça login com sua conta Google institucional.</p>' +
        '<a class="btn" href="' + loginUrl + '">' +
          '<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">' +
            '<path fill="#fff" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.383 17.64 12.075 17.64 9.2z"/>' +
            '<path fill="#fff" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>' +
            '<path fill="#fff" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>' +
            '<path fill="#fff" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>' +
          '</svg>' +
          'Entrar com Google' +
        '</a>' +
        '<p class="hint">Após o login, retorne a esta página e recarregue.</p>' +
      '</div></body></html>'
    ).setTitle('Sistema CCBJ — Login');
  }

  const tmpl = HtmlService.createTemplateFromFile('Index');

  tmpl.emailInicial  = email;
  tmpl.sessaoInicial = ''; // não precisa mais

  return tmpl.evaluate()
    .setTitle("Sistema CCBJ")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

function doPost(e) {
  try {
    const id   = e.parameter.id;
    const just = (e.parameter.justificativa || "").trim();
    const email = Session.getActiveUser().getEmail();
    recusarSolicitacao(id, just, email);
    return HtmlService.createHtmlOutput(
      '<h2 style="font-family:sans-serif;color:#dc2626">❌ Solicitação recusada.</h2>',
    );
  } catch (err) {
    return HtmlService.createHtmlOutput(
      `<h2 style="font-family:sans-serif;color:red">Erro: ${err.message}</h2>`,
    );
  }
}