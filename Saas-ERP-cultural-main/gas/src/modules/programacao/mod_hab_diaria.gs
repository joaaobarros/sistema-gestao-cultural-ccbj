/**
 * @file mod_hab_diaria.gs
 * @description Habilitação diária de espaços: check-in operacional antes de cada
 *              evento, com rastreamento de pontualidade e relatório de eficiência.
 * @layer backend
 * @responsibility Registro de habilitações por reserva; relatório diário com cálculo
 *                 de atraso; auditoria de quem habilitou cada espaço e quando.
 * @dependencies utils.gs (_getSheet, normalizarData), Codigo.gs (gerarId),
 *               mod_admin.gs (obterEmailUsuario, registrarLog)
 */

/**
 * ========================================
 * BLOCO: Constantes
 * ========================================
 */
var HAB_DIARIA_COL = {
  ID:               0,
  RESERVA_ID:       1,
  SALA_ID:          2,
  DATA:             3,
  HORA_EVENTO:      4,
  HORA_HABILITACAO: 5,
  RESPONSAVEL:      6,
  RESPONSAVEL_NOME: 7,
  OBSERVACAO:       8,
  CRIADO_EM:        9
};

/**
 * ========================================
 * BLOCO: Registro de habilitação
 * ========================================
 * @description Registra que um espaço foi habilitado (preparado/liberado) para
 *              receber o evento de uma reserva específica.
 *              Se já existe habilitação para a reserva, sobrescreve a linha existente
 *              (re-habilitação com novo timestamp).
 * @inputs dados: { reservaId, salaId, data, horaEvento, horaHabilitacao?, observacao? }
 * @outputs { ok, id } ou { ok: false, erro }
 */
function registrarHabilitacaoDiaria(dados, emailFallback) {
  try {
    var email = obterEmailUsuario(emailFallback);
    if (!email) throw new Error('Usuário não identificado.');
    if (!dados || !dados.reservaId) throw new Error('reservaId obrigatório.');

    var aba = _getSheet('HabDiaria');
    if (!aba) throw new Error('Aba HabDiaria não encontrada. Execute o setup do sistema.');

    var agora = new Date();
    var tz = 'America/Fortaleza';
    var horaHab = dados.horaHabilitacao ||
                  Utilities.formatDate(agora, tz, 'HH:mm');
    var dataBR  = dados.data ||
                  Utilities.formatDate(agora, tz, 'dd/MM/yyyy');
    var respNome = dados.responsavelNome ||
                   (email.indexOf('@') > -1 ? email.split('@')[0] : email);

    // Se já existe habilitação para esta reserva hoje, sobrescreve
    var existente = _habDiariaEncontrarLinha(aba, dados.reservaId);
    if (existente > 0) {
      aba.getRange(existente, HAB_DIARIA_COL.HORA_HABILITACAO + 1).setValue(horaHab);
      aba.getRange(existente, HAB_DIARIA_COL.RESPONSAVEL + 1).setValue(email);
      aba.getRange(existente, HAB_DIARIA_COL.RESPONSAVEL_NOME + 1).setValue(respNome);
      aba.getRange(existente, HAB_DIARIA_COL.OBSERVACAO + 1).setValue(dados.observacao || '');
      aba.getRange(existente, HAB_DIARIA_COL.CRIADO_EM + 1).setValue(agora.toISOString());
      var idExist = aba.getRange(existente, 1).getValue();
      registrarLog(email, 'HAB_DIARIA_ATUALIZADA', 'HabDiaria:' + idExist, dados.reservaId);
      return { ok: true, id: String(idExist), atualizado: true };
    }

    var id = gerarId('HD');
    aba.appendRow([
      id,
      dados.reservaId,
      dados.salaId || '',
      dataBR,
      dados.horaEvento || '',
      horaHab,
      email,
      respNome,
      dados.observacao || '',
      agora.toISOString()
    ]);

    registrarLog(email, 'HAB_DIARIA_REGISTRADA', 'HabDiaria:' + id, dados.reservaId);
    return { ok: true, id: id, atualizado: false };
  } catch (e) {
    Logger.error('habDiaria', 'Erro em registrarHabilitacaoDiaria', e.message);
    return { ok: false, erro: e.message };
  }
}

/**
 * ========================================
 * BLOCO: Relatório diário
 * ========================================
 * @description Retorna todas as reservas do dia (não canceladas) cruzadas com os
 *              registros de habilitação. Calcula atraso em minutos para cada item.
 * @inputs dataISO: "YYYY-MM-DD" (string)
 * @outputs { ok, data, itens: [{ reservaId, salaId, evento, tipo, setor,
 *            horaInicio, horaTermino, turno, reservaStatus,
 *            habilitacao: { id, horaHabilitacao, responsavel, responsavelNome, observacao } | null,
 *            status: 'pendente'|'no_prazo'|'atrasado', atrasoMin: number|null }] }
 */
function obterRelatorioDiario(dataISO, emailFallback) {
  try {
    obterEmailUsuario(emailFallback); // validar autenticação

    // Converte "YYYY-MM-DD" → "DD/MM/YYYY" para comparar com a planilha
    var parts = String(dataISO || '').split('-');
    if (parts.length !== 3) throw new Error('Formato de data inválido. Use YYYY-MM-DD.');
    var dataBR = parts[2] + '/' + parts[1] + '/' + parts[0];

    // Reservas do dia
    var abaRes = _getSheet('Reservas');
    var reservas = [];
    if (abaRes && abaRes.getLastRow() > 1) {
      var rowsRes = abaRes.getRange(2, 1, abaRes.getLastRow() - 1, 16).getDisplayValues();
      rowsRes.forEach(function (r) {
        if (String(r[13]).toUpperCase() === 'CANCELADO') return;
        if (String(r[1]).trim() !== dataBR) return;
        reservas.push({
          id:          String(r[0]).trim(),
          data:        String(r[1]).trim(),
          horaInicio:  String(r[2]).trim(),
          horaTermino: String(r[3]).trim(),
          salaId:      String(r[4]).trim(),
          turno:       String(r[5]).trim(),
          nome:        String(r[6]).trim(),
          tipo:        String(r[7]).trim(),
          setor:       String(r[9]).trim(),
          reservaStatus: String(r[13]).trim()
        });
      });
    }

    // Ordena por horário de início
    reservas.sort(function (a, b) {
      return _habDiariaHoraMin(a.horaInicio) - _habDiariaHoraMin(b.horaInicio);
    });

    // Habilitações do dia → mapa reservaId → última habilitação
    var abaHab = _getSheet('HabDiaria');
    var habMap = {};
    if (abaHab && abaHab.getLastRow() > 1) {
      var rowsHab = abaHab.getRange(2, 1, abaHab.getLastRow() - 1, 10).getDisplayValues();
      rowsHab.forEach(function (h) {
        if (String(h[HAB_DIARIA_COL.DATA]).trim() !== dataBR) return;
        var rid = String(h[HAB_DIARIA_COL.RESERVA_ID]).trim();
        // Mantém a última ocorrência (mais recente por posição na planilha)
        habMap[rid] = {
          id:              String(h[HAB_DIARIA_COL.ID]).trim(),
          horaHabilitacao: String(h[HAB_DIARIA_COL.HORA_HABILITACAO]).trim(),
          responsavel:     String(h[HAB_DIARIA_COL.RESPONSAVEL]).trim(),
          responsavelNome: String(h[HAB_DIARIA_COL.RESPONSAVEL_NOME]).trim(),
          observacao:      String(h[HAB_DIARIA_COL.OBSERVACAO]).trim()
        };
      });
    }

    // Monta itens com status calculado
    var itens = reservas.map(function (r) {
      var hab = habMap[r.id] || null;
      var status = 'pendente';
      var atrasoMin = null;

      if (hab) {
        var eventoMin = _habDiariaHoraMin(r.horaInicio);
        var habMin    = _habDiariaHoraMin(hab.horaHabilitacao);
        if (eventoMin !== null && habMin !== null) {
          atrasoMin = habMin - eventoMin; // negativo = adiantado, positivo = atrasado
          status    = atrasoMin <= 0 ? 'no_prazo' : 'atrasado';
        } else {
          status = 'habilitado';
        }
      }

      return {
        reservaId:     r.id,
        salaId:        r.salaId,
        evento:        r.nome,
        tipo:          r.tipo,
        setor:         r.setor,
        horaInicio:    r.horaInicio,
        horaTermino:   r.horaTermino,
        turno:         r.turno,
        reservaStatus: r.reservaStatus,
        habilitacao:   hab,
        status:        status,
        atrasoMin:     atrasoMin
      };
    });

    return { ok: true, data: dataISO, dataBR: dataBR, itens: itens };
  } catch (e) {
    Logger.error('habDiaria', 'Erro em obterRelatorioDiario', e.message);
    return { ok: false, erro: e.message };
  }
}

/**
 * ========================================
 * BLOCO: Helpers privados
 * ========================================
 */

function _habDiariaHoraMin(hora) {
  if (!hora || typeof hora !== 'string') return null;
  var p = hora.split(':');
  if (p.length < 2) return null;
  var h = parseInt(p[0], 10);
  var m = parseInt(p[1], 10);
  return (isNaN(h) || isNaN(m)) ? null : h * 60 + m;
}

// Retorna o número da linha (1-indexed) da habilitação existente para uma reserva,
// ou -1 se não encontrada.
function _habDiariaEncontrarLinha(aba, reservaId) {
  if (!aba || aba.getLastRow() < 2) return -1;
  var dados = aba.getRange(2, HAB_DIARIA_COL.RESERVA_ID + 1, aba.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < dados.length; i++) {
    if (String(dados[i][0]).trim() === String(reservaId).trim()) {
      return i + 2; // +2: header row + 0-indexed offset
    }
  }
  return -1;
}
