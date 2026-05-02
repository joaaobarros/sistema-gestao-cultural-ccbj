// ============================================================
// Código.gs — Controller principal
// Mantém: doGet, doPost, helpers globais, ChatService
// Todas as funções de domínio foram movidas para módulos.
// ============================================================

// ==============================
// CONFIG
// ==============================

const BASE_URL_FALLBACK =
  "https://script.google.com/macros/s/AKfycbzw2Gum2jte37SUmkEvbHUkwkxD_BRg51s_E7p3VUeODP2pIZUyO76yL5E2JuiuMUp1wg/exec";

function getBaseUrl() {
  try {
    return ScriptApp.getService().getUrl() || BASE_URL_FALLBACK;
  } catch (e) {
    return BASE_URL_FALLBACK;
  }
}


// ==============================
// HELPERS GLOBAIS
// ==============================

function sanitizarTexto(str) {
  return String(str || "")
    .replace(/[<>]/g, "")
    .substring(0, 5000);
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

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function gerarId(prefixo) {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefixo}-${timestamp}-${random}`;
}

function isMesmoDia(dataReserva) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const data = new Date(dataReserva);
  data.setHours(0, 0, 0, 0);
  return hoje.getTime() === data.getTime();
}

function _notificarCancelamentoMesmoDia({
  sala,
  nome,
  inicio,
  fim,
  emailAtual,
}) {
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

// ==============================
// doGet / doPost
// ==============================

function doGet(e) {
  const acao = e && e.parameter && e.parameter.acao;
  const id = e && e.parameter && e.parameter.id;

  if (acao && id) {
    if (acao === "aprovar") {
      try {
        const email = Session.getActiveUser().getEmail();
        aprovarSolicitacao(id, email);
        return HtmlService.createHtmlOutput(
          '<h2 style="font-family:sans-serif;color:green">✅ Solicitação aprovada com sucesso.</h2>',
        );
      } catch (e) {
        return HtmlService.createHtmlOutput(
          `<h2 style="font-family:sans-serif;color:red">Erro: ${e.message}</h2>`,
        );
      }
    }

    if (acao === "recusar") {
      return HtmlService.createHtmlOutput(`
        <!DOCTYPE html><html><body style="font-family:sans-serif;max-width:500px;margin:40px auto;padding:20px">
        <h2>❌ Recusar solicitação</h2>
        <form method="post">
          <input type="hidden" name="id" value="${id}">
          <label>Motivo da recusa:</label><br>
          <textarea name="justificativa" required rows="4" style="width:100%;margin-top:8px;padding:8px;border:1px solid #ccc;border-radius:4px"></textarea><br><br>
          <button type="submit" style="background:#dc2626;color:white;padding:10px 24px;border:none;border-radius:6px;cursor:pointer;font-size:14px">Confirmar Recusa</button>
        </form>
        </body></html>
      `);
    }
  }

  return HtmlService.createTemplateFromFile("Index")
    .evaluate()
    .setTitle("Sistema de Reservas — CCBJ")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    const id = e.parameter.id;
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
