/**
 * @file Codigo.gs
 * @description Ponto de entrada do servidor GAS. Define doGet/doPost e
 *              a função include() para composição de templates HTML.
 * @layer backend
 * @responsibility Roteamento HTTP, notificações de cancelamento.
 * @dependencies mod_admin.gs (aprovarSolicitacao, recusarSolicitacao),
 *               mod_reservas.gs (via helpers), utils.js (gerarId, isMesmoDia)
 */

/**
 * ========================================
 * BLOCO: URL base
 * ========================================
 */
function getBaseUrl() {
  try {
    return ScriptApp.getService().getUrl() || '';
  } catch (e) {
    return '';
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

function _escapeHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
    Logger.warn('router', 'Notificação de cancelamento falhou', e.message);
  }
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
  const acao  = e && e.parameter && e.parameter.acao;
  const id    = e && e.parameter && e.parameter.id;
  const secao = e && e.parameter && e.parameter.secao;

  // ── Formulário externo de Cessão de Pauta ──────────────────────────────────
  if (secao === 'pauta') {
    const tmplPauta = HtmlService.createTemplateFromFile('pauta_form');
    tmplPauta.appUrl = getBaseUrl();
    return tmplPauta.evaluate()
      .setTitle('Solicitação de Pauta — ' + (getOrgConfig().nomeCompleto || 'CCBJ'))
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // ── Consulta pública de pauta por protocolo ────────────────────────────────
  if (secao === 'pauta_status') {
    const protocolo = e.parameter.protocolo || '';
    const emailSol  = e.parameter.email     || '';
    let dadosPauta  = null;
    let erro        = '';
    try {
      if (protocolo) {
        dadosPauta = PautaExternaEngine.consultarPublico(protocolo, emailSol);
      }
    } catch(err) { erro = err.message; }

    const statusLabel = dadosPauta ? (dadosPauta.statusLabel || dadosPauta.status) : '';
    const corStatus   = {
      'Recebida': '#f59e0b', 'Em Análise': '#3b82f6', 'Aguard. Ajuste': '#f97316',
      'Aprovada': '#22c55e', 'Parcialmente Aprovada': '#84cc16',
      'Indeferida': '#ef4444', 'Cancelada': '#6b7280', 'Concluída': '#10b981'
    }[statusLabel] || '#6b7280';

    return HtmlService.createHtmlOutput(
      '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Acompanhamento de Pauta</title>' +
      '<style>body{font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px;color:#1e293b}' +
      'h1{color:#7c3aed;font-size:1.5rem}h2{font-size:1.1rem;color:#334155}' +
      '.card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-top:16px}' +
      '.badge{display:inline-block;padding:4px 12px;border-radius:9999px;font-size:.8rem;font-weight:700;color:#fff}' +
      'form input{width:100%;padding:10px;border:1.5px solid #e2e8f0;border-radius:8px;margin-top:6px;font-size:14px}' +
      'form button{background:#7c3aed;color:#fff;padding:10px 24px;border:none;border-radius:8px;cursor:pointer;font-size:14px;margin-top:10px}</style></head>' +
      '<body><h1>Centro Cultural Bom Jardim</h1><h2>Acompanhamento de Pauta</h2>' +
      (erro ? '<div class="card" style="border-color:#fca5a5;background:#fef2f2"><p style="color:#dc2626">⚠️ ' + _escapeHtml(erro) + '</p></div>' : '') +
      (!dadosPauta && !erro ? '<form method="GET"><input type="hidden" name="secao" value="pauta_status">' +
        '<label>Protocolo:</label><input name="protocolo" placeholder="PAUTA-2024-0001" required>' +
        '<label style="margin-top:10px;display:block">E-mail do solicitante:</label><input name="email" type="email" required>' +
        '<button type="submit">Consultar</button></form>' : '') +
      (dadosPauta ? '<div class="card"><p><strong>Protocolo:</strong> ' + _escapeHtml(dadosPauta.protocolo) + '</p>' +
        '<p><strong>Proposta:</strong> ' + _escapeHtml(dadosPauta.proposta) + '</p>' +
        '<p><strong>Status:</strong> <span class="badge" style="background:' + corStatus + '">' + _escapeHtml(statusLabel) + '</span></p>' +
        (dadosPauta.parecer ? '<p><strong>Parecer:</strong> ' + _escapeHtml(dadosPauta.parecer) + '</p>' : '') +
        '<p style="color:#94a3b8;font-size:.8rem">Recebida em: ' + (dadosPauta.criadoEm ? new Date(dadosPauta.criadoEm).toLocaleDateString('pt-BR') : '-') + '</p>' +
        '</div>' : '') +
      '</body></html>'
    );
  }

  // Fluxo de aprovação/recusa por email (links enviados por notificação)
  if (acao && id) {
    if (acao === 'aprovar') {
      try {
        const email = Session.getActiveUser().getEmail();
        aprovarSolicitacao(id, email);
        return HtmlService.createHtmlOutput(
          '<h2 style="font-family:sans-serif;color:green">✅ Solicitação aprovada com sucesso.</h2>'
        );
      } catch (err) {
        return HtmlService.createHtmlOutput(
          '<h2 style="font-family:sans-serif;color:red">Erro: ' + err.message + '</h2>'
        );
      }
    }
    if (acao === 'recusar') {
      return HtmlService.createHtmlOutput(
        '<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:500px;margin:40px auto;padding:20px">' +
        '<h2>❌ Recusar solicitação</h2>' +
        '<form method="post">' +
          '<input type="hidden" name="id" value="' + id + '">' +
          '<label>Motivo da recusa:</label><br>' +
          '<textarea name="justificativa" required rows="4" style="width:100%;margin-top:8px;padding:8px;border:1px solid #ccc;border-radius:4px"></textarea><br><br>' +
          '<button type="submit" style="background:#dc2626;color:white;padding:10px 24px;border:none;border-radius:6px;cursor:pointer;font-size:14px">Confirmar Recusa</button>' +
        '</form></body></html>'
      );
    }
  }

  // Identidade: captura email quando disponível (otimização).
  // A identidade real é sempre garantida pelo backend via google.script.run
  // (Session.getActiveUser() funciona em chamadas GAS mesmo em "Execute as: Me").
  // NÃO bloquear o carregamento do app se email estiver vazio.
  let emailInicial = '';
  try { emailInicial = Session.getActiveUser().getEmail() || ''; } catch(_) {}

  const tmpl = HtmlService.createTemplateFromFile('Index');
  tmpl.emailInicial = emailInicial;
  tmpl.appUrl       = getBaseUrl();

  return tmpl.evaluate()
    .setTitle(getOrgConfig().titulo)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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