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
    return HtmlService.createHtmlOutput(`
      <h2 style="font-family:sans-serif;text-align:center;margin-top:60px">
        🔒 Você precisa estar logado no Google
      </h2>
    `);
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