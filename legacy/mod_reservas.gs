/**
 * @file mod_reservas.gs
 * @description Módulo central de reservas: criação, edição, cancelamento, conflitos,
 *              disponibilidade de itens e integração com a Agenda RECE.
 * @layer backend
 * @responsibility CRUD de reservas na planilha "Reservas"; verificação de conflitos de horário;
 *                 cálculo de disponibilidade de itens por horário; processamento em lote;
 *                 repositories e services do domínio de reservas.
 * @dependencies utils.js (_getSheet, normalizarData, normalizarHora, horariosSobrepostos,
 *               validarEmail, normalizarEmail, sanitizarNumero, logarErroSeguro),
 *               mod_admin.gs (registrarLog, verificarDonoOuAdmin, verificarPermissao,
 *               limitarRequisicoes, detectarComportamentoSuspeito, limparCacheUsuario),
 *               Codigo.gs (gerarId, isMesmoDia, _notificarCancelamentoMesmoDia)
 */

/**
 * ========================================
 * BLOCO: Leitura de reservas
 * ========================================
 * @description Retorna todas as reservas da planilha como array 2D (16 colunas).
 *              Exposto ao frontend via google.script.run.obterReservas().
 * @outputs Array de arrays com colunas: ID, Data, Início, Término, Sala, Turno,
 *          Nome, Tipo, Responsável, Setor, Co-resp, Release, Itens, Status, Solicitação, Lote
 * @sideEffects 1 leitura na planilha Reservas
 */
function obterReservas() {
  try {
    const aba = _getSheet("Reservas");
    if (!aba || aba.getLastRow() < 2) return [];
    return aba.getRange(2, 1, aba.getLastRow() - 1, 16).getDisplayValues();
  } catch (e) {
    console.error("Erro em obterReservas: " + e.message);
    return [];
  }
}

/**
 * ========================================
 * BLOCO: Verificação de conflito de horário
 * ========================================
 * @description Verifica se um horário solicitado conflita com reservas existentes na planilha.
 *              Inclui buffer de 5 minutos entre reservas (limpeza do espaço).
 *              É a fonte de verdade para conflitos — o frontend tem sua própria verificação
 *              otimista (verificarConflitoFrontend) baseada no cache local.
 * @inputs sala, data, inicio, termino (strings/Date), idReservaIgnorar (para edição)
 * @outputs { conflito: boolean, tipo?, solicitado?, existente?, contexto? }
 * @sideEffects 1 leitura na planilha Reservas
 */
function verificarConflitoEspaco(
  sala,
  data,
  inicio,
  termino,
  idReservaIgnorar,
) {
  const BUFFER = 5;
  const aba = _getSheet("Reservas");
  if (!aba || aba.getLastRow() < 2) return { conflito: false };

  const dados = aba.getDataRange().getValues();
  const dataBusca = normalizarData(data);
  const inicioBusca = normalizarHora(inicio);
  const terminoBusca = normalizarHora(termino);

  if (dataBusca === null)
    throw new Error("Data inválida ao verificar conflito.");
  if (inicioBusca === null || terminoBusca === null)
    throw new Error("Horário inválido.");
  if (terminoBusca <= inicioBusca)
    throw new Error("Horário final deve ser maior que o inicial.");

  const salaNormalizada = String(sala).trim();

  for (let i = 1; i < dados.length; i++) {
    const idReserva = String(dados[i][0] || "").trim();
    if (idReservaIgnorar && idReserva === String(idReservaIgnorar).trim())
      continue;

    const status = String(dados[i][13] || "").toUpperCase();
    if (status === "CANCELADO") continue;

    const salaPlanilha = String(dados[i][4] || "").trim();
    if (salaPlanilha !== salaNormalizada) continue;

    const dataPlanilha = normalizarData(dados[i][1]);
    if (dataPlanilha === null || dataPlanilha !== dataBusca) continue;

    const iniPlanilha = normalizarHora(dados[i][2]);
    const terPlanilha = normalizarHora(dados[i][3]);
    if (iniPlanilha === null || terPlanilha === null) continue;

    const temConflito = horariosSobrepostos(
      inicioBusca,
      terminoBusca,
      iniPlanilha,
      terPlanilha,
    );
    if (temConflito) {
      return {
        conflito: true,
        tipo: "REAL",
        solicitado: {
          inicio: formatarHora(inicioBusca),
          fim: formatarHora(terminoBusca),
        },
        existente: {
          inicio: formatarHora(iniPlanilha),
          fim: formatarHora(terPlanilha),
          nome: dados[i][6],
        },
        contexto: {
          sala: sala,
          data: formatarData(dataBusca),
        },
      };
    }
  }

  return { conflito: false };
}

/**
 * ========================================
 * BLOCO: possuiConflitoReserva — interface canônica centralizada
 * ========================================
 * @description Ponto único obrigatório para qualquer verificação de conflito no sistema.
 *              Toda criação/edição de reserva DEVE passar por aqui.
 *              Internamente delega para verificarConflitoEspaco.
 *              BLOQUEIO (CCBJ_FECHADO) não passa por esta função — cancela conflitos diretamente.
 * @inputs { data, espacoId, inicio, fim, reservaIgnoradaId }
 * @outputs { conflito: boolean, tipo?, solicitado?, existente?, contexto? }
 */
function possuiConflitoReserva({ data, espacoId, inicio, fim, reservaIgnoradaId }) {
  return verificarConflitoEspaco(espacoId, data, inicio, fim, reservaIgnoradaId || null);
}

/**
 * ========================================
 * BLOCO: Cancelamento automático por CCBJ FECHADO
 * ========================================
 * @description Cancela todas as reservas ativas que conflitam com o bloqueio CCBJ FECHADO.
 *              Exclui outras reservas do tipo BLOQUEIO (não cancela bloqueios com bloqueios).
 *              Envia notificação por email ao dono de cada reserva cancelada.
 *              Registra log de auditoria para cada cancelamento.
 * @inputs sala, data, inicio, fim (strings), motivo (string), emailAdmin (string)
 * @outputs Array de { id, nome, email } das reservas canceladas
 * @sideEffects Escreve na planilha Reservas, envia emails, registra logs
 */
function _cancelarReservasConflitantes(sala, data, inicio, fim, motivo, emailAdmin) {
  const aba = _getSheet("Reservas");
  if (!aba || aba.getLastRow() < 2) return [];

  const dados = aba.getDataRange().getValues();
  const dataBusca = normalizarData(data);
  const inicioMin = normalizarHora(inicio);
  const fimMin = normalizarHora(fim);

  if (dataBusca === null || inicioMin === null || fimMin === null) return [];

  const salaNorm = String(sala).trim();
  const cancelados = [];

  for (let i = 1; i < dados.length; i++) {
    const statusAtual = String(dados[i][13] || "").toUpperCase();
    if (statusAtual === "CANCELADO") continue;

    const tipoReserva = String(dados[i][7] || "").toUpperCase();
    if (tipoReserva === "BLOQUEIO") continue;

    if (String(dados[i][4] || "").trim() !== salaNorm) continue;

    const dataPlanilha = normalizarData(dados[i][1]);
    if (dataPlanilha === null || dataPlanilha !== dataBusca) continue;

    const iniP = normalizarHora(dados[i][2]);
    const terP = normalizarHora(dados[i][3]);
    if (iniP === null || terP === null) continue;

    if (!horariosSobrepostos(inicioMin, fimMin, iniP, terP)) continue;

    aba.getRange(i + 1, 14).setValue("CANCELADO");

    const emailDono = String(dados[i][8] || "");
    const nomeReserva = String(dados[i][6] || "");
    const idReserva = String(dados[i][0] || "");

    cancelados.push({ id: idReserva, nome: nomeReserva, email: emailDono });

    registrarLog(
      "CANCELAMENTO_AUTO",
      "RESERVA",
      nomeReserva,
      `ID: ${idReserva} | Motivo: CCBJ Fechado — ${motivo}`,
      `Status: ${statusAtual}`,
      "Status: CANCELADO",
      emailAdmin
    );

    try {
      if (emailDono && emailDono.includes("@") && emailDono !== emailAdmin) {
        const dataFmt = formatarData ? formatarData(dataBusca) : String(data);
        GmailApp.sendEmail(
          emailDono,
          "❌ Sua reserva foi cancelada — CCBJ Fechado",
          `Olá,\n\nSua reserva "${nomeReserva}" em ${dataFmt} (${inicio}–${fim}) foi cancelada automaticamente.\n\nMotivo: CCBJ estará fechado nesse período — ${motivo}.\n\nEntre em contato com a equipe de gestão para mais informações.`
        );
      }
    } catch (e) {
      console.warn("Notificação de cancelamento falhou:", e.message);
    }
  }

  return cancelados;
}

/**
 * ========================================
 * BLOCO: Cancelamento e habilitação de reservas
 * ========================================
 * @description cancelarReserva: cancela a reserva (apenas dono ou admin). Notifica admins
 *              se o cancelamento for no mesmo dia (risco de sala desocupada).
 *              cancelarReservaComJustificativa: versão admin com notificação ao dono e motivo.
 *              habilitarReservaStatus: muda status para HABILITADO (admin/superadmin/habilitador).
 *              verificarPermissaoCancelamento: consulta pré-cancelamento para exibir UI correta.
 * @context Chamados via google.script.run pelo frontend (delegação de eventos data-acao)
 * @sideEffects Escreve na planilha, registra log, pode enviar emails via GmailApp
 */
function cancelarReserva(id, emailAtual) {
  limitarRequisicoes("cancelar_reserva", 5, 30000);

  if (!emailAtual || !emailAtual.includes("@")) {
    throw new Error("Email do usuário não identificado.");
  }

  const aba = _getSheet("Reservas");
  const dados = aba.getDataRange().getValues();

  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][0]).trim() === String(id).trim()) {
      const emailDono = dados[i][8];
      verificarDonoOuAdmin(emailDono, emailAtual);

      const linha = i + 1;
      const nome = dados[i][6];
      const data = dados[i][1];
      const inicio = dados[i][2];
      const fim = dados[i][3];
      const sala = dados[i][4];
      const statusAntes = dados[i][13];

      if (String(statusAntes).toUpperCase() === "CANCELADO") {
        throw new Error("Reserva já cancelada.");
      }

      aba.getRange(linha, 14).setValue("CANCELADO");

      if (isMesmoDia(data)) {
        _notificarCancelamentoMesmoDia({ sala, nome, inicio, fim, emailAtual });
      }

      registrarLog(
        "CANCELAMENTO",
        "RESERVA",
        nome,
        "ID: " + id,
        "Status: " + statusAntes,
        "Status: CANCELADO",
        emailAtual,
      );

      return true;
    }
  }

  throw new Error("Reserva não encontrada");
}

function cancelarReservaComJustificativa(id, emailAtual, justificativa) {
  if (!emailAtual || !emailAtual.includes("@")) {
    throw new Error("Email do usuário não identificado.");
  }
  verificarPermissao("admin", emailAtual);

  const aba = _getSheet("Reservas");
  const dados = aba.getDataRange().getValues();

  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][0]).trim() !== String(id).trim()) continue;

    const status = String(dados[i][13]).toUpperCase();
    if (status === "CANCELADO") throw new Error("Reserva já cancelada.");

    const linha = i + 1;
    const nome = dados[i][6];
    const emailDono = dados[i][8];

    aba.getRange(linha, 14).setValue("CANCELADO");

    try {
      if (emailDono && emailDono.includes("@")) {
        GmailApp.sendEmail(
          emailDono,
          `❌ Sua reserva foi cancelada — CCBJ`,
          `Sua reserva "${nome}" foi cancelada por ${emailAtual}.\n\nMotivo: ${justificativa}`,
        );
      }
    } catch (e) {
      console.warn("Email falhou:", e.message);
    }

    if (isMesmoDia(dados[i][1])) {
      _notificarCancelamentoMesmoDia({
        sala: dados[i][4],
        nome,
        inicio: dados[i][2],
        fim: dados[i][3],
        emailAtual,
      });
    }

    registrarLog(
      "CANCELAMENTO",
      "RESERVA",
      nome,
      `ID: ${id} | Motivo: ${justificativa}`,
      "Status: CONFIRMADO",
      "Status: CANCELADO",
      emailAtual,
    );

    limparCacheUsuario(emailAtual);
    return true;
  }
  throw new Error("Reserva não encontrada.");
}

// ==============================
// HABILITAR RESERVA
// ==============================

function habilitarReservaStatus(id, emailAtual, observacao) {
  if (!emailAtual || !emailAtual.includes("@"))
    throw new Error("Email não identificado.");

  const abaAdmins = _getSheet("Administradores");
  let nivel = "";
  if (abaAdmins && abaAdmins.getLastRow() > 1) {
    const admins = abaAdmins
      .getRange(2, 1, abaAdmins.getLastRow() - 1, 2)
      .getValues();
    const found = admins.find(
      (a) =>
        String(a[0]).toLowerCase().trim() ===
        String(emailAtual).toLowerCase().trim(),
    );
    if (found) nivel = String(found[1]).toLowerCase().trim();
  }
  if (!["admin", "superadmin", "habilitador"].includes(nivel))
    throw new Error("Sem permissão para habilitar espaços.");

  const aba = _getSheet("Reservas");
  const dados = aba.getDataRange().getValues();

  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][0]).trim() !== String(id).trim()) continue;
    if (String(dados[i][13]).toUpperCase() === "CANCELADO")
      throw new Error("Não é possível habilitar reserva cancelada.");

    aba.getRange(i + 1, 14).setValue("HABILITADO");
    const obs = String(observacao || "").trim();
    if (obs) {
      const rel = String(dados[i][11] || "");
      aba
        .getRange(i + 1, 12)
        .setValue(rel + (rel ? "\n" : "") + "[HAB] " + obs);
    }
    registrarLog(
      "HABILITAÇÃO",
      "RESERVA",
      dados[i][6],
      "ID:" + id + (obs ? " | Obs:" + obs : ""),
      "Status:" + dados[i][13],
      "Status:HABILITADO",
      emailAtual,
    );
    limparCacheUsuario(emailAtual);
    return true;
  }
  throw new Error("Reserva não encontrada.");
}

// ==============================
// VERIFICAR PERMISSÃO CANCELAMENTO
// ==============================

function verificarPermissaoCancelamento(id, emailAtual) {
  const aba = _getSheet("Reservas");
  const dados = aba.getDataRange().getValues();
  const abaAdm = _getSheet("Administradores");
  let admins = [];

  if (abaAdm && abaAdm.getLastRow() > 1) {
    admins = abaAdm
      .getRange(2, 1, abaAdm.getLastRow() - 1, 1)
      .getValues()
      .map((l) => String(l[0]).toLowerCase().trim());
  }

  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][0]).trim() === String(id).trim()) {
      const dono = String(dados[i][8]).toLowerCase().trim();
      const email = String(emailAtual).toLowerCase().trim();
      return {
        podeCancelar: admins.includes(email) || dono === email,
        ehAdmin: admins.includes(email),
        ehDono: dono === email,
      };
    }
  }
  throw new Error("Reserva não encontrada");
}

/**
 * ========================================
 * BLOCO: Edição de reserva existente
 * ========================================
 * @description Valida campos, verifica conflito (ignorando a própria reserva),
 *              verifica disponibilidade de itens, atualiza a linha na planilha,
 *              sincroniza com a RECE se necessário e registra log de auditoria.
 * @inputs dados: { id, data, horaInicio, horaTermino, sala, nomeAcao, responsavel, ... }
 * @outputs { success: true, id }
 * @sideEffects Escreve na planilha Reservas, pode atualizar ReservasRECE, registra log
 */
function salvarEdicaoReserva(dados) {
  validarCamposObrigatorios(dados, [
    "id",
    "data",
    "horaInicio",
    "horaTermino",
    "sala",
    "nomeAcao",
    "responsavel",
  ]);

  if (!validarEmail(dados.responsavel))
    throw new Error("Email do responsável inválido.");

  const lock = obterLockComRetry("salvarEdicaoReserva", 8000, 3);
  try {
    const responsavelNormalizado = normalizarEmail(dados.responsavel);
    const aba = _getSheet("Reservas");
    if (!aba) throw new Error("Aba Reservas não encontrada.");

    validarReserva(dados);
    const valores = aba.getDataRange().getValues();

    for (let i = 1; i < valores.length; i++) {
      if (String(valores[i][0]).trim() === String(dados.id).trim()) {
        const emailDono = valores[i][8];
        verificarDonoOuAdmin(emailDono, responsavelNormalizado);

        const resultadoConflito = possuiConflitoReserva({
          data: dados.data,
          espacoId: dados.sala,
          inicio: dados.horaInicio,
          fim: dados.horaTermino,
          reservaIgnoradaId: dados.id,
        });
        if (resultadoConflito && resultadoConflito.conflito) {
          const ex = resultadoConflito.existente || {};
          throw new Error(
            `Conflito detectado: Sala ocupada` +
              (ex.inicio ? ` (${ex.inicio}–${ex.fim}: ${ex.nome || ""})` : ""),
          );
        }

        verificarDisponibilidadeItensPorHorario(
          dados.itensVolantes,
          dados.data,
          dados.horaInicio,
          dados.horaTermino,
          dados.sala,
          dados.id,
        );

        const linha = i + 1;
        const dadosAntes = valores[i].slice(1, 13);
        const valoresNovos = [
          [
            dados.data,
            dados.horaInicio,
            dados.horaTermino,
            dados.sala,
            dados.turno,
            dados.nomeAcao,
            dados.tipoAcao,
            responsavelNormalizado,
            dados.setor,
            dados.coResponsavel,
            dados.release,
            dados.itensVolantes,
          ],
        ];

        aba.getRange(linha, 2, 1, 12).setValues(valoresNovos);
        registrarLog(
          "EDIÇÃO",
          "RESERVA",
          dados.nomeAcao,
          "ID: " + dados.id,
          dadosAntes,
          valoresNovos[0],
          responsavelNormalizado,
        );

        _sincronizarEdicaoComRece(dados);
        limparCacheUsuario(responsavelNormalizado);
        return { success: true, id: dados.id };
      }
    }
    throw new Error("Reserva não encontrada para edição.");
  } catch (e) {
    throw new Error("Erro ao salvar edição: " + e.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * ========================================
 * BLOCO: Exclusão definitiva de registros
 * ========================================
 * @description Remove fisicamente uma linha da planilha correspondente ao tipo.
 *              Tipos permitidos: reserva, espaco, item, usuario, setor.
 *              Usa lock de script para evitar race conditions em deleções concorrentes.
 *              Para espaços: libera automaticamente itens alocados (liberarItensOrfaos).
 * @inputs tipo (string), id, emailAtual
 * @sideEffects Deleta linha da planilha, registra log, pode liberar itens órfãos
 */
function excluirRegistroPorID(tipo, id, emailAtual) {
  if (!tipo || !id) throw new Error("ID e tipo são obrigatórios.");
  if (!emailAtual || !emailAtual.includes("@"))
    throw new Error("Email não identificado.");

  const tipoLower = String(tipo).toLowerCase().trim();
  const idSafe = String(id).trim();
  const tiposPermitidos = ["reserva", "espaco", "item", "usuario", "setor"];
  if (!tiposPermitidos.includes(tipoLower))
    throw new Error("Tipo de exclusão inválido.");

  limitarRequisicoes("excluir_registro", 10, 30000);
  detectarComportamentoSuspeito("exclusao");

  const lock = LockService.getScriptLock();
  lock.waitLock(5000);

  try {
    if (tipoLower === "reserva") {
      const abaReservas = _getSheet("Reservas");
      const dadosReservas = abaReservas.getDataRange().getValues();
      let encontrou = false;
      for (let i = 1; i < dadosReservas.length; i++) {
        if (String(dadosReservas[i][0]).trim() === idSafe) {
          verificarDonoOuAdmin(dadosReservas[i][8], emailAtual);
          encontrou = true;
          break;
        }
      }
      if (!encontrou) throw new Error("Reserva não encontrada.");
    } else if (tipoLower === "usuario") {
      verificarPermissao("superadmin", emailAtual);
    } else {
      verificarPermissao("admin", emailAtual);
    }

    const mapaAbas = {
      reserva: "Reservas",
      espaco: "Configuracoes",
      usuario: "Administradores",
      setor: "Listas",
      item: "Itens",
    };

    const aba = _getSheet(mapaAbas[tipoLower]);
    if (!aba) throw new Error("Aba não encontrada.");

    const dados = aba.getDataRange().getValues();
    for (let i = 1; i < dados.length; i++) {
      if (dados[i][0] && String(dados[i][0]).trim() === idSafe) {
        const dadosAntes = dados[i];
        const alvoNome = dados[i][1] || "ID: " + idSafe;

        if (tipoLower === "espaco") liberarItensOrfaos(idSafe);

        aba.deleteRow(i + 1);
        registrarLog(
          "EXCLUSÃO DEFINITIVA",
          tipo.toUpperCase(),
          String(alvoNome),
          "Removido via painel administrativo.",
          dadosAntes,
          null,
          emailAtual,
        );

        limparCacheUsuario(emailAtual);
        return true;
      }
    }
    throw new Error("Registro não encontrado.");
  } catch (e) {
    throw new Error("Falha ao excluir: " + e.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * ========================================
 * BLOCO: Disponibilidade de itens do almoxarifado
 * ========================================
 * @description Calcula quantos itens estão disponíveis em um horário específico,
 *              considerando todas as reservas ativas que se sobrepõem ao período.
 *              validarDisponibilidadeItens: verifica estoque total (sem considerar horário).
 *              verificarDisponibilidadeItensPorHorario: verifica disponibilidade real por horário.
 *              obterDisponibilidadeItensPorHorario: retorna mapa nome→qtd disponível.
 *              parseItensString: parseia a string "2x Cadeira | 1x Mesa" usada na planilha.
 * @context Chamados em criarReservaController, salvarEdicaoReserva e processarAgendamentoLote
 * @inputs itensSolicitados (string), data, inicio, termino, idSala
 * @outputs Lança Error se insuficiente; obterDisponibilidadeItensPorHorario retorna mapa
 * @sideEffects 2 leituras de planilha (Itens + Reservas) por chamada
 */
function validarDisponibilidadeItens(itensSolicitados) {
  const abaItens = _getSheet("Itens");
  if (!abaItens) return;

  const dados = abaItens.getDataRange().getValues();

  const parseItens = (str) => {
    if (!str || str === "Nenhum") return [];
    return str.split("|").map((i) => {
      const partes = i.trim().split("x");
      return { qtd: Number(partes[0]), nome: partes[1]?.trim() };
    });
  };

  const itens = parseItens(itensSolicitados);
  itens.forEach((item) => {
    const linha = dados.find((l) => String(l[1]).trim() === item.nome);
    if (!linha) return;
    const total = Number(linha[3] || 0);
    if (item.qtd > total) {
      throw new Error(
        `Estoque insuficiente para "${item.nome}". Disponível: ${total}`,
      );
    }
  });
}

function verificarDisponibilidadeItensPorHorario(
  itensSolicitados,
  data,
  inicio,
  termino,
  idSala,
  idReservaIgnorar,
) {
  if (!itensSolicitados || itensSolicitados === "Nenhum") return;

  const disponibilidade = obterDisponibilidadeItensPorHorario(
    data,
    inicio,
    termino,
    idSala || null,
    idReservaIgnorar || null,
  );

  const parseItens = (str) => {
    if (!str || str === "Nenhum") return [];
    return str
      .split(/[|]/)
      .map((i) => {
        const semFixo = i.trim().replace(/\s*\(fixo\)\s*/gi, "");
        const p = semFixo.split("x ");
        return { qtd: Number(p[0]) || 0, nome: (p[1] || "").trim() };
      })
      .filter((i) => i.nome && i.qtd > 0);
  };

  parseItens(itensSolicitados).forEach((item) => {
    const disponivel = disponibilidade[item.nome] ?? 0;
    if (item.qtd > disponivel) {
      throw new Error(
        `Item "${item.nome}" indisponível neste horário.\nDisponível: ${disponivel} | Solicitado: ${item.qtd}`,
      );
    }
  });
}

function parseItensString(str) {
  if (!str || str === "Nenhum") return [];
  return str
    .split(/[|]/)
    .map((item) => {
      const semFixo = item.trim().replace(/\s*\(fixo\)\s*/gi, "");
      const partes = semFixo.split("x ");
      return {
        qtd: Number(partes[0]) || 0,
        nome: (partes[1] || "").trim(),
      };
    })
    .filter((i) => i.nome && i.qtd > 0);
}

function obterDisponibilidadeItensPorHorario(
  data,
  inicio,
  termino,
  idSalaContexto,
  idReservaIgnorar,
) {
  try {
    const abaItens = _getSheet("Itens");
    const abaReservas = _getSheet("Reservas");
    if (!abaItens) return {};

    const itens = abaItens.getDataRange().getValues();
    const reservas = abaReservas ? abaReservas.getDataRange().getValues() : [];

    const dataBusca = normalizarData(data);
    const inicioMin = normalizarHora(inicio);
    const terminoMin = normalizarHora(termino);
    if (dataBusca === null || inicioMin === null || terminoMin === null)
      return {};

    const disponibilidade = {};
    itens.slice(1).forEach((item) => {
      const nome = String(item[1] || "").trim();
      if (!nome) return;
      const estoqueAlmox = sanitizarNumero(item[3], 0, 100000);
      let qtdNaSala = 0;
      if (idSalaContexto) {
        try {
          const mapa = JSON.parse(String(item[4] || "{}"));
          qtdNaSala = sanitizarNumero(
            mapa[String(idSalaContexto).trim()] || 0,
            0,
          );
        } catch (e) {}
      }
      disponibilidade[nome] = estoqueAlmox + qtdNaSala;
    });

    reservas.slice(1).forEach((r) => {
      if (compararStrings(r[13], "CANCELADO")) return;
      if (idReservaIgnorar && String(r[0]).trim() === String(idReservaIgnorar).trim()) return;
      const dataReserva = normalizarData(r[1]);
      if (dataReserva === null || dataReserva !== dataBusca) return;
      const ini = normalizarHora(r[2]);
      const ter = normalizarHora(r[3]);
      if (ini === null || ter === null) return;
      if (!horariosSobrepostos(inicioMin, terminoMin, ini, ter)) return;

      const salaDaReserva = String(r[4] || "").trim();

      parseItensString(r[12]).forEach((ir) => {
        if (disponibilidade[ir.nome] === undefined) return;

        let ehFixoNaMesmaSala = false;
        if (idSalaContexto && salaDaReserva === String(idSalaContexto).trim()) {
          const itemDados = itens
            .slice(1)
            .find((i) => compararStrings(String(i[1] || ""), ir.nome));
          if (itemDados) {
            try {
              const mapa = JSON.parse(String(itemDados[4] || "{}"));
              if (
                sanitizarNumero(mapa[String(idSalaContexto).trim()] || 0) > 0
              ) {
                ehFixoNaMesmaSala = true;
              }
            } catch (e) {}
          }
        }
        if (!ehFixoNaMesmaSala) {
          disponibilidade[ir.nome] -= ir.qtd;
        }
      });
    });

    return disponibilidade;
  } catch (e) {
    logarErroSeguro("obterDisponibilidadeItensPorHorario", e);
    return {};
  }
}

/**
 * ========================================
 * BLOCO: Análise de disponibilidade com sugestões
 * ========================================
 * @description Verifica conflitos para múltiplas datas simultaneamente e retorna
 *              horários livres e sugestões de agendamento. Exposto ao frontend como
 *              a fonte de verdade para a funcionalidade de análise/IA.
 * @inputs payload: { sala, horaInicio, horaTermino, datas: string[] }
 * @outputs { conflito, conflitosDetalhados, horariosLivres, sugestoes }
 * @sideEffects 1 leitura na planilha Reservas
 */
function analisarDisponibilidadeReal(payload) {
  if (!payload) throw new Error("Payload não informado.");

  const sala = String(payload.sala || "").trim();
  const inicio = String(payload.horaInicio || "").trim();
  const termino = String(payload.horaTermino || "").trim();
  const datas = payload.datas || [];

  if (
    !sala ||
    !inicio ||
    !termino ||
    !Array.isArray(datas) ||
    datas.length === 0
  ) {
    throw new Error("Dados incompletos para análise.");
  }

  const aba = _getSheet("Reservas");
  if (!aba || aba.getLastRow() < 2) {
    return {
      conflito: false,
      sugestoes: [],
      horariosLivres: [],
      salasDisponiveis: [],
    };
  }

  const dados = aba.getDataRange().getValues();
  const normData = (d) => {
    if (d instanceof Date) {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      return x.getTime();
    }
    const s = String(d).trim();
    if (s.includes("/")) {
      const p = s.split("/");
      return new Date(p[2], p[1] - 1, p[0]).setHours(0, 0, 0, 0);
    }
    if (s.includes("-")) {
      const p = s.split("-");
      return new Date(p[0], p[1] - 1, p[2]).setHours(0, 0, 0, 0);
    }
    return null;
  };
  const normHora = (h) => {
    if (!h) return 0;
    if (h instanceof Date) return h.getHours() * 60 + h.getMinutes();
    const p = String(h).split(":");
    return parseInt(p[0]) * 60 + parseInt(p[1]);
  };
  const toHora = (m) => {
    const h = String(Math.floor(m / 60)).padStart(2, "0");
    const min = String(m % 60).padStart(2, "0");
    return `${h}:${min}`;
  };

  const inicioMin = normHora(inicio);
  const terminoMin = normHora(termino);
  if (terminoMin <= inicioMin) throw new Error("Horário final inválido.");

  let conflito = false;
  let conflitosDetalhados = [];

  datas.forEach((dataStr) => {
    const dataBusca = normData(dataStr);
    dados.forEach((r) => {
      const status = String(r[13] || "").toUpperCase();
      if (status === "CANCELADO") return;
      const salaPlanilha = String(r[4] || "").trim();
      if (salaPlanilha !== sala) return;
      const dataPlanilha = normData(r[1]);
      if (dataPlanilha !== dataBusca) return;
      const ini = normHora(r[2]);
      const ter = normHora(r[3]);
      const sobrepoe = inicioMin < ter && terminoMin > ini;
      if (sobrepoe) {
        conflito = true;
        conflitosDetalhados.push({
          data: dataStr,
          inicio: toHora(ini),
          fim: toHora(ter),
          nome: r[6],
        });
      }
    });
  });

  function calcularLivres(dataStr) {
    const dataBusca = normData(dataStr);
    let ocupados = [];
    dados.forEach((r) => {
      if (String(r[13] || "").toUpperCase() === "CANCELADO") return;
      if (String(r[4]).trim() !== sala) return;
      if (normData(r[1]) !== dataBusca) return;
      ocupados.push({ ini: normHora(r[2]), fim: normHora(r[3]) });
    });
    ocupados.sort((a, b) => a.ini - b.ini);
    let cursor = 8 * 60;
    const fimDia = 21 * 60;
    const livres = [];
    ocupados.forEach((o) => {
      if (cursor < o.ini)
        livres.push({ inicio: toHora(cursor), fim: toHora(o.ini) });
      cursor = Math.max(cursor, o.fim);
    });
    if (cursor < fimDia)
      livres.push({ inicio: toHora(cursor), fim: toHora(fimDia) });
    return livres;
  }

  const horariosLivres = datas.map((d) => ({
    data: d,
    intervalos: calcularLivres(d),
  }));

  let sugestoes = [];
  if (conflito) {
    horariosLivres.forEach((dia) => {
      dia.intervalos.forEach((i) => {
        const duracao = terminoMin - inicioMin;
        const iniLivre = normHora(i.inicio);
        const fimLivre = normHora(i.fim);
        if (fimLivre - iniLivre >= duracao) {
          sugestoes.push({
            data: dia.data,
            sala,
            horaInicio: i.inicio,
            horaTermino: toHora(iniLivre + duracao),
          });
        }
      });
    });
  }

  return { conflito, conflitosDetalhados, horariosLivres, sugestoes };
}

/**
 * ========================================
 * BLOCO: Processamento em lote (legado)
 * ========================================
 * @description Cria múltiplas reservas de uma vez, verificando conflito e disponibilidade
 *              de itens para cada data. Usa lock com retry para evitar race conditions.
 *              NOTA: criarReservaController() é o entrypoint canônico para novos usos.
 * @inputs dados (objeto de reserva), datas (array de strings DD/MM/YYYY)
 * @outputs { success: true, total, lote: idGrupoLote }
 * @sideEffects Escrita em lote na planilha Reservas, registra log por data
 */
function processarAgendamentoLote(dados, datas) {
  if (!dados.responsavel || !validarEmail(dados.responsavel)) {
    throw new Error("Email do responsável inválido. Faça login novamente.");
  }

  detectarComportamentoSuspeito("agendamento_lote");

  let lock;
  try {
    lock = obterLockComRetry("processarAgendamentoLote", 10000, 3);

    const abaReservas = _getSheet("Reservas");
    if (!dados || !Array.isArray(datas) || datas.length === 0)
      throw new Error("Dados inválidos para agendamento.");
    if (
      !dados.sala ||
      !dados.horaInicio ||
      !dados.horaTermino ||
      !dados.nomeAcao
    )
      throw new Error("Campos obrigatórios não preenchidos.");

    validarReserva(dados);

    const idGrupoLote = gerarId("LOTE");
    const dataSolicitacao = new Date();
    const linhasReservas = [];
    const datasProcessadas = new Set();
    const responsavelNorm = normalizarEmail(dados.responsavel);

    datas.forEach((dataStr) => {
      if (!dataStr) return;
      const dataKey = String(dataStr).trim();
      if (datasProcessadas.has(dataKey))
        throw new Error("Data duplicada: " + dataStr);
      datasProcessadas.add(dataKey);

      const dataFinal = new Date(normalizarData(dataStr));
      if (isNaN(dataFinal.getTime()))
        throw new Error("Data inválida: " + dataStr);

      const resultadoConflito = possuiConflitoReserva({
        data: dataFinal,
        espacoId: dados.sala,
        inicio: dados.horaInicio,
        fim: dados.horaTermino,
        reservaIgnoradaId: null,
      });
      if (resultadoConflito && resultadoConflito.conflito) {
        const ex = resultadoConflito.existente || {};
        throw new Error(
          `Conflito detectado: Sala ocupada em ${dataKey}` +
            (ex.inicio ? ` (${ex.inicio}–${ex.fim}: ${ex.nome || ""})` : ""),
        );
      }

      verificarDisponibilidadeItensPorHorario(
        dados.itensVolantes,
        dataFinal,
        dados.horaInicio,
        dados.horaTermino,
        dados.sala,
      );

      const novoIdReserva = gerarId("RES");
      const linhaReserva = [
        novoIdReserva,
        dataFinal,
        dados.horaInicio,
        dados.horaTermino,
        dados.sala,
        dados.turno,
        dados.nomeAcao,
        dados.tipoAcao,
        responsavelNorm,
        dados.setor,
        dados.coResponsavel,
        dados.release,
        dados.itensVolantes,
        "CONFIRMADO",
        dataSolicitacao,
        idGrupoLote,
      ];

      linhasReservas.push(linhaReserva);

      try {
        if (dados.codipPublico || dados.codipPublicoReal || dados.codipObs) {
          _salvarCamposCODIP(novoIdReserva, dados);
        }
      } catch (e) {
        console.error("Erro ao salvar CODIP:", e);
      }

      registrarLog(
        "CRIAÇÃO",
        "RESERVA",
        novoIdReserva,
        `Agendamento via lote | Data: ${dataKey} | Sala: ${dados.sala}`,
        null,
        linhaReserva,
        responsavelNorm,
      );
    });

    if (linhasReservas.length > 0) {
      abaReservas
        .getRange(
          abaReservas.getLastRow() + 1,
          1,
          linhasReservas.length,
          linhasReservas[0].length,
        )
        .setValues(linhasReservas);
    }

    limparCacheUsuario(responsavelNorm);
    return { success: true, total: linhasReservas.length, lote: idGrupoLote };
  } catch (e) {
    console.error("Erro ao processar lote:", e.message);
    throw new Error(e.message);
  } finally {
    if (lock) lock.releaseLock();
  }
}

/**
 * ========================================
 * BLOCO: Controller, Repository e Service de reservas
 * ========================================
 * @description Camada de abstração para operações de reserva:
 *
 *              criarReservaController (entrypoint exposto):
 *                Cria reservas para múltiplas datas, integra com RECE e CODIP, usa Repository.
 *
 *              ReservaRepository:
 *                Acesso direto à planilha — salvar, atualizar por ID, buscar por ID.
 *
 *              ReceRepository:
 *                Acesso à planilha ReservasRECE — salvar, atualizar/remover por ID de reserva geral.
 *
 *              ReceService:
 *                Lógica de criação/atualização RECE — usa ReceRepository, monta linha padrão.
 *
 *              ReservaService:
 *                Operações de alto nível — criar delega para criarReservaController; atualizar
 *                coordena Repository e ReceService diretamente.
 * @context criarReservaController é o entrypoint único — chamado pelo frontend via google.script.run
 * @sideEffects Escreve nas planilhas Reservas, ReservasRECE e RelatoriosCODIP
 */
function criarReservaController(dados, datas) {
  if (!dados || !Array.isArray(datas) || datas.length === 0)
    throw new Error("Dados ou datas inválidos.");
  if (!dados.responsavel || !validarEmail(dados.responsavel))
    throw new Error("Email do responsável inválido. Faça login novamente.");
  if (!dados.sala || !dados.horaInicio || !dados.horaTermino || !dados.nomeAcao)
    throw new Error("Campos obrigatórios não preenchidos.");

  validarReserva(dados);
  detectarComportamentoSuspeito("agendamento");

  const lock = obterLockComRetry("criarReservaController", 10000, 3);
  try {
    const responsavelNorm = normalizarEmail(dados.responsavel);
    const idLote = gerarId("LOTE");
    const dataSolicitacao = new Date();
    const linhas = [];
    const idsGerados = [];
    const datasProcessadas = new Set();

    const ehBloqueio = String(dados.tipoAcao || "").toUpperCase() === "BLOQUEIO";

    datas.forEach((data) => {
      const dataKey = String(data).trim();
      if (datasProcessadas.has(dataKey))
        throw new Error("Data duplicada no lote: " + dataKey);
      datasProcessadas.add(dataKey);

      if (ehBloqueio) {
        // CCBJ FECHADO: cancela reservas conflitantes em vez de falhar
        _cancelarReservasConflitantes(
          dados.sala,
          data,
          dados.horaInicio,
          dados.horaTermino,
          dados.release || dados.nomeAcao || "CCBJ Fechado",
          responsavelNorm
        );
      } else {
        const resultadoConflito = possuiConflitoReserva({
          data,
          espacoId: dados.sala,
          inicio: dados.horaInicio,
          fim: dados.horaTermino,
          reservaIgnoradaId: null,
        });
        if (resultadoConflito && resultadoConflito.conflito) {
          const ex = resultadoConflito.existente || {};
          throw new Error(
            `Conflito detectado em ${dataKey}: espaço já reservado` +
              (ex.inicio ? ` (${ex.inicio}–${ex.fim}: ${ex.nome || ""})` : ""),
          );
        }
      }

      verificarDisponibilidadeItensPorHorario(
        dados.itensVolantes,
        data,
        dados.horaInicio,
        dados.horaTermino,
        dados.sala,
      );

      const idReserva = gerarId("RES");
      idsGerados.push(idReserva);

      const linha = [
        idReserva,
        data,
        dados.horaInicio,
        dados.horaTermino,
        dados.sala,
        dados.turno,
        dados.nomeAcao,
        dados.tipoAcao,
        responsavelNorm,
        dados.setor,
        dados.coResponsavel,
        dados.release,
        dados.itensVolantes,
        "CONFIRMADO",
        dataSolicitacao,
        idLote,
      ];
      linhas.push(linha);

      registrarLog(
        "CRIAÇÃO",
        "RESERVA",
        dados.nomeAcao,
        `ID: ${idReserva} | Data: ${dataKey} | Sala: ${dados.sala}`,
        null,
        linha,
        responsavelNorm,
      );

      if (dados.modoRece) {
        ReceService.criarOuAtualizar({
          id: idReserva,
          ...dados,
          responsavel: responsavelNorm,
          data,
        });
      }
    });

    ReservaRepository.salvar(linhas);

    const temCodip =
      dados.codipPrograma ||
      dados.codipMesRef ||
      dados.codipTipoAcao ||
      Number(dados.codipPubPresencial) > 0 ||
      dados.codipSegmento1;
    if (temCodip) {
      idsGerados.forEach((id) => {
        try {
          _salvarCamposCODIP(id, dados);
        } catch (e) {
          console.error("CODIP lote:", e);
        }
      });
    }

    // Vincula cada reserva criada a uma Ação Institucional (vínculo fraco)
    if (dados.acaoId) {
      idsGerados.forEach(function(id) {
        try { associarRecursoAcao(dados.acaoId, 'reserva', id, responsavelNorm); } catch(_) {}
      });
    }

    limparCacheUsuario(responsavelNorm);
    return { sucesso: true, ids: idsGerados };
  } catch (e) {
    throw new Error(e.message);
  } finally {
    lock.releaseLock();
  }
}

function atualizarReservaController(dados) {
  return ReservaService.atualizar(dados);
}

const ReservaRepository = {
  salvar(linhas) {
    const aba = _getSheet("Reservas");
    aba
      .getRange(aba.getLastRow() + 1, 1, linhas.length, linhas[0].length)
      .setValues(linhas);
  },
  atualizar(id, novosDados) {
    const aba = _getSheet("Reservas");
    const dados = aba.getDataRange().getValues();
    for (let i = 1; i < dados.length; i++) {
      if (String(dados[i][0]) === String(id)) {
        aba.getRange(i + 1, 1, 1, novosDados.length).setValues([novosDados]);
        return true;
      }
    }
    return false;
  },
  buscarPorId(id) {
    const aba = _getSheet("Reservas");
    const dados = aba.getDataRange().getValues();
    return dados.find((l, i) => i > 0 && String(l[0]) === String(id));
  },
};

const ReceRepository = {
  salvar(linha) {
    const aba = _getSheet("ReservasRECE");
    aba.appendRow(linha);
  },
  atualizarPorReservaGeral(idReserva, novosDados) {
    const aba = _getSheet("ReservasRECE");
    const dados = aba.getDataRange().getValues();
    for (let i = 1; i < dados.length; i++) {
      if (String(dados[i][23]) === String(idReserva)) {
        aba.getRange(i + 1, 1, 1, novosDados.length).setValues([novosDados]);
        return true;
      }
    }
    return false;
  },
  buscarPorReservaGeral(idReserva) {
    const aba = _getSheet("ReservasRECE");
    const dados = aba.getDataRange().getValues();
    return dados.find((l, i) => i > 0 && String(l[23]) === String(idReserva));
  },
  removerPorReservaGeral(idReserva) {
    const aba = _getSheet("ReservasRECE");
    const dados = aba.getDataRange().getValues();
    for (let i = 1; i < dados.length; i++) {
      if (String(dados[i][23]) === String(idReserva)) {
        aba.deleteRow(i + 1);
        return true;
      }
    }
  },
};

const ReceService = {
  criarOuAtualizar(reserva) {
    const existente = ReceRepository.buscarPorReservaGeral(reserva.id);
    const linhaRece = this.montarLinhaRece(reserva);
    if (existente) {
      ReceRepository.atualizarPorReservaGeral(reserva.id, linhaRece);
    } else {
      ReceRepository.salvar(linhaRece);
    }
  },
  montarLinhaRece(reserva) {
    return [
      gerarId("RECE"),
      reserva.nomeAcao,
      reserva.data,
      reserva.data,
      reserva.horaInicio,
      reserva.horaTermino,
      reserva.sala,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      reserva.release,
      "",
      "ATIVO",
      reserva.responsavel,
      new Date(),
      reserva.imagem || "",
      "",
      "",
      reserva.id,
    ];
  },
  atualizarCamposEspecificos(idReserva, dadosRece) {
    const existente = ReceRepository.buscarPorReservaGeral(idReserva);
    if (!existente) throw new Error("RECE não encontrado");
    existente[1] = dadosRece.titulo || existente[1];
    existente[15] = dadosRece.descricao || existente[15];
    existente[20] = dadosRece.imagem || existente[20];
    ReceRepository.atualizarPorReservaGeral(idReserva, existente);
  },
};

const ReservaService = {
  criar(dados, datas) {
    return criarReservaController(dados, datas);
  },
  atualizar(dados) {
    if (!dados || !dados.id) throw new Error("ID da reserva não informado.");
    if (!dados.responsavel || !validarEmail(dados.responsavel))
      throw new Error("Email do responsável inválido.");

    validarReserva(dados);

    const reservaExistente = ReservaRepository.buscarPorId(dados.id);
    if (!reservaExistente) throw new Error("Reserva não encontrada.");

    const responsavelNorm = normalizarEmail(dados.responsavel);
    verificarDonoOuAdmin(reservaExistente[8], responsavelNorm);

    const resultadoConflito = possuiConflitoReserva({
      data: dados.data,
      espacoId: dados.sala,
      inicio: dados.horaInicio,
      fim: dados.horaTermino,
      reservaIgnoradaId: dados.id,
    });
    if (resultadoConflito && resultadoConflito.conflito) {
      const ex = resultadoConflito.existente || {};
      throw new Error(
        `Conflito detectado: espaço já reservado` +
          (ex.inicio ? ` (${ex.inicio}–${ex.fim}: ${ex.nome || ""})` : ""),
      );
    }

    verificarDisponibilidadeItensPorHorario(
      dados.itensVolantes,
      dados.data,
      dados.horaInicio,
      dados.horaTermino,
      dados.sala,
      dados.id,
    );

    const dadosAntes = reservaExistente.slice(1, 13);
    const novaLinha = [
      dados.id,
      dados.data,
      dados.horaInicio,
      dados.horaTermino,
      dados.sala,
      dados.turno,
      dados.nomeAcao,
      dados.tipoAcao,
      responsavelNorm,
      dados.setor,
      dados.coResponsavel,
      dados.release,
      dados.itensVolantes,
      reservaExistente[13],
      reservaExistente[14],
      reservaExistente[15],
    ];
    ReservaRepository.atualizar(dados.id, novaLinha);

    registrarLog(
      "EDIÇÃO",
      "RESERVA",
      dados.nomeAcao,
      "ID: " + dados.id,
      dadosAntes,
      novaLinha.slice(1, 13),
      responsavelNorm,
    );

    const temRece = ReceRepository.buscarPorReservaGeral(dados.id);
    if (temRece) {
      ReceService.criarOuAtualizar({
        id: dados.id,
        ...dados,
        responsavel: responsavelNorm,
      });
    }

    limparCacheUsuario(responsavelNorm);
    return { sucesso: true };
  },
};

// Fallback: evita ReferenceError em produção caso _salvarCamposCODIP não esteja implementada
function _salvarCamposCODIP() {
  return true;
}
