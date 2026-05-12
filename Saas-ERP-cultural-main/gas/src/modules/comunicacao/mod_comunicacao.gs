/**
 * @file mod_comunicacao.gs
 * @layer backend/modules
 * @description Serviços de comunicação: agenda RECE, envio de convites Google Calendar e upload de imagens para o Drive.
 * @responsibility Entrypoints: obterReservasRece, cancelarReservaRece, excluirReservaRece,
 *                enviarConvitesCalendar, uploadImagemRece.
 * @dependencies utils.js (_getSheet, gerarId), DataLayer.js (uploadDrive), Google Calendar API.
 */
// ============================================================
// mod_comunicacao.gs
// Agenda RECE, convites, upload de imagem
// ============================================================

function salvarReservaRece(dados) {
  if (!dados.responsavel || !validarEmail(dados.responsavel)) {
    throw new Error("Email do responsável inválido.");
  }

  let lock;
  try {
    lock = obterLockComRetry("salvarReservaRece", 10000, 3);

    const aba = _getSheet("ReservasRECE");
    if (!aba)
      throw new Error("Aba ReservasRECE não encontrada. Execute o Setup.");

    if (
      !dados.titulo ||
      !dados.dataInicio ||
      !dados.horaInicio ||
      !dados.horaTermino
    ) {
      throw new Error("Preencha todos os campos obrigatórios da Agenda RECE.");
    }

    const id = dados.id ? String(dados.id).trim() : null;
    const dataSolicitacao = new Date();
    const responsavel = normalizarEmail(dados.responsavel);
    const dataTermino =
      dados.dataTermino && String(dados.dataTermino).trim()
        ? String(dados.dataTermino).trim()
        : String(dados.dataInicio).trim();

    const linha = [
      id || gerarId("REC"),
      dados.titulo,
      dados.dataInicio,
      dataTermino,
      dados.horaInicio,
      dados.horaTermino,
      dados.espaco || "",
      dados.categorias || "",
      dados.parceiros || "",
      dados.acessibilidades || "",
      dados.classificacao || "",
      dados.publicoAlvo || "",
      dados.artista || "",
      dados.linkInscricao || "",
      dados.acesso || "",
      dados.descricao || "",
      dados.observacoes || "",
      "CONFIRMADO",
      responsavel,
      dataSolicitacao,
      dados.imagemUrl || "",
      dados.convidadosInternos || "",
      dados.eventoInstitucional ? "SIM" : "",
      dados.convidadosExternos || "",
      dados.idReservaGeral || "",
    ];

    if (id) {
      const dados_ = aba.getDataRange().getValues();
      for (let i = 1; i < dados_.length; i++) {
        if (String(dados_[i][0]).trim() === id) {
          aba.getRange(i + 1, 1, 1, linha.length).setValues([linha]);
          registrarLog(
            "EDIÇÃO",
            "RECE",
            dados.titulo,
            "ID: " + id,
            dados_[i],
            linha,
            responsavel,
          );
          limparCacheUsuario(responsavel);
          return { success: true, id };
        }
      }
      throw new Error("Registro RECE não encontrado para edição.");
    } else {
      aba.appendRow(linha);
      registrarLog(
        "CRIAÇÃO",
        "RECE",
        dados.titulo,
        "Criado via formulário.",
        null,
        linha,
        responsavel,
      );
      limparCacheUsuario(responsavel);
      return { success: true, id: linha[0] };
    }
  } catch (e) {
    throw new Error(e.message);
  } finally {
    if (lock) lock.releaseLock();
  }
}

function obterReservasRece() {
  try {
    const aba = _getSheet("ReservasRECE");
    if (!aba || aba.getLastRow() < 2) return [];
    return aba.getRange(2, 1, aba.getLastRow() - 1, 25).getDisplayValues();
  } catch (e) {
    Logger.error('comunicacao', 'obterReservasRece', e.message);
    return [];
  }
}

function cancelarReservaRece(id, emailAtual) {
  try {
    if (!emailAtual) throw new Error("Email não identificado.");
    const aba = _getSheet("ReservasRECE");
    const dados = aba.getDataRange().getValues();
    for (let i = 1; i < dados.length; i++) {
      if (String(dados[i][0]).trim() === id) {
        const ehComunicacao = verificarPermissaoRece(emailAtual);
        if (!ehComunicacao) verificarDonoOuAdmin(dados[i][18], emailAtual);
        aba.getRange(i + 1, 18).setValue("CANCELADO");
        registrarLog(
          "CANCELAMENTO",
          "RECE",
          dados[i][1],
          "ID: " + id,
          "CONFIRMADO",
          "CANCELADO",
          emailAtual,
        );
        return true;
      }
    }
    return false;
  } catch (e) {
    throw new Error(e.message);
  }
}

function excluirReservaRece(id, emailAtual) {
  try {
    verificarPermissao("admin", emailAtual);
    const aba = _getSheet("ReservasRECE");
    const dados = aba.getDataRange().getValues();
    for (let i = 1; i < dados.length; i++) {
      if (String(dados[i][0]).trim() === id) {
        registrarLog(
          "EXCLUSÃO",
          "RECE",
          dados[i][1],
          "ID: " + id,
          dados[i],
          null,
          emailAtual,
        );
        aba.deleteRow(i + 1);
        limparCacheUsuario(emailAtual);
        return true;
      }
    }
    throw new Error("Registro não encontrado.");
  } catch (e) {
    throw new Error(e.message);
  }
}

function uploadImagemRece(base64Data, mimeType, nomeArquivo) {
  try {
    const bytes = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(bytes, mimeType, nomeArquivo);
    let folder;
    const it = DriveApp.getFoldersByName("CCBJ_RECE_Imagens");
    folder = it.hasNext()
      ? it.next()
      : DriveApp.createFolder("CCBJ_RECE_Imagens");
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return {
      success: true,
      url: `https://drive.google.com/thumbnail?id=${file.getId()}&sz=w400`,
    };
  } catch (e) {
    return { success: false, erro: e.message };
  }
}

function enviarConvitesCalendar(dados) {
  try {
    const parseDateTime = (dataStr, horaStr) => {
      const p = String(dataStr).split("/");
      const [hh, mm] = String(horaStr).split(":").map(Number);
      return new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]), hh, mm, 0);
    };
    const inicio = parseDateTime(dados.dataInicio, dados.horaInicio);
    const fim = parseDateTime(dados.dataInicio, dados.horaTermino);
    CalendarApp.createEvent(dados.titulo, inicio, fim, {
      description: `${dados.descricao || ""}\n\nLocal: ${dados.espaco || ""}`,
      guests: dados.emails.join(","),
      sendInvites: true,
    });
    return { success: true };
  } catch (e) {
    return { success: false, erro: e.message };
  }
}

function enviarConviteEmailInstitucional(dados) {
  try {
    dados.emails.forEach((email) => {
      if (!email || !String(email).includes("@")) return;
      GmailApp.sendEmail({
        to: String(email).trim(),
        subject: `Convite Institucional — ${dados.titulo}`,
        htmlBody: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <div style="background:#4C1D95;padding:24px 32px;color:white;">
              <img src="https://ccbj.org.br/wp-content/themes/CCBJ/assets/images/logo.png" style="height:40px;filter:brightness(0)invert(1);opacity:0.9;" alt="CCBJ">
              <h2 style="margin:12px 0 0;font-size:18px;">Convite Institucional</h2>
            </div>
            <div style="padding:32px;background:#f8fafc;">
              <div style="white-space:pre-line;color:#334155;line-height:1.7;font-size:14px;">${sanitizarTexto(dados.texto)}</div>
            </div>
            <div style="padding:16px 32px;background:#f1f5f9;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#64748b;">
                <strong style="color:#4C1D95;">${sanitizarTexto(dados.titulo)}</strong><br>
                📅 ${sanitizarTexto(dados.dataInicio)} &nbsp; ⏰ ${sanitizarTexto(dados.horaInicio)}<br>
                📍 ${sanitizarTexto(dados.espaco || "CCBJ — Centro Cultural Bom Jardim")}
              </p>
            </div>
          </div>`,
      });
    });
    return { success: true };
  } catch (e) {
    return { success: false, erro: e.message };
  }
}
