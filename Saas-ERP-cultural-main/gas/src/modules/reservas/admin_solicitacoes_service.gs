/**
 * @file modules/reservas/admin_solicitacoes_service.gs
 * @layer modules/reservas
 * @description Serviço de aprovação de solicitações de reserva (fluxo Admin).
 *
 * Gerencia o ciclo de vida de solicitações internas de reserva, alteração e
 * cancelamento, submetidas por usuários e aprovadas/recusadas por admins
 * ou donos de espaço.
 *
 * @depends core/utils.gs (_getSheet, gerarId, registrarLog, limparCacheUsuario, obterEmailUsuario),
 *          modules/reservas/reserva_engine.gs (criarReservaController, atualizarReservaController, cancelarReserva),
 *          core/event_bus_backend.gs (SystemEvents),
 *          core/events_constants.gs (SystemEventTypes),
 *          GmailApp, LockService, Utilities
 */

var AdminSolicitacoesService = (function () {

  // ── Helpers de acesso ────────────────────────────────────────────

  function obterAdmins() {
    var aba = _getSheet('Administradores');
    if (!aba || aba.getLastRow() < 2) return [];
    return aba
      .getRange(2, 1, aba.getLastRow() - 1, 1)
      .getValues()
      .map(function(l) { return String(l[0]).toLowerCase().trim(); })
      .filter(function(e) { return e.includes('@'); });
  }

  function obterDonoEspaco(nomeOuIdEspaco, diaSemana, turno) {
    var aba = _getSheet('Configuracoes');
    if (!aba || aba.getLastRow() < 2) return null;
    var dados = aba.getDataRange().getValues();
    for (var i = 1; i < dados.length; i++) {
      var id   = String(dados[i][0] || '').trim();
      var nome = String(dados[i][1] || '').toLowerCase().trim();
      var alvo = String(nomeOuIdEspaco || '').toLowerCase().trim();
      if (id !== nomeOuIdEspaco && nome !== alvo) continue;

      var rawDono = String(dados[i][4] || '').trim();
      if (!rawDono) return null;
      try {
        var arr   = JSON.parse(rawDono);
        var lista = Array.isArray(arr) ? arr : [arr];
        if (diaSemana !== undefined && diaSemana !== null) {
          var porDia = lista.filter(function(d) {
            return Array.isArray(d.dias) && d.dias.includes(diaSemana);
          });
          if (porDia.length) lista = porDia;
        }
        if (turno && lista.length) {
          var porTurno = lista.filter(function(d) {
            return !d.turnos || !d.turnos.length || d.turnos.includes(turno);
          });
          if (porTurno.length) lista = porTurno;
        }
        return lista.map(function(d) { return d.email || d; }).join(',');
      } catch (e) {
        return rawDono;
      }
    }
    return null;
  }

  // ── Notificação ──────────────────────────────────────────────────

  function notificarSolicitacao(s) {
    try {
      var diaSemana = s.diaSemana !== undefined ? s.diaSemana : null;
      var dono      = obterDonoEspaco(s.sala, diaSemana, s.turno || null);
      var admins    = obterAdmins();
      var dest      = admins.slice();
      if (dono) dest.unshift(dono);
      dest = dest.filter(function(e, i, a) { return Boolean(e) && a.indexOf(e) === i; });
      if (!dest.length) return;

      var configSheet = _getSheet('Configuracoes');
      var nomeSala    = s.sala || '—';
      if (configSheet && configSheet.getLastRow() > 1) {
        var cfgDados = configSheet.getDataRange().getValues();
        for (var i = 1; i < cfgDados.length; i++) {
          if (String(cfgDados[i][0]).trim() === String(s.sala).trim()) {
            nomeSala = String(cfgDados[i][1]).trim();
            break;
          }
        }
      }

      var base   = getBaseUrl();
      var assunto = '🔔 Nova solicitação de reserva — ' + nomeSala + ' — CCBJ';

      dest.forEach(function(email) {
        var ehDono = email.toLowerCase().trim() === String(dono || '').toLowerCase().trim();
        var papel  = ehDono ? '👤 Responsável pelo espaço' : '🛡️ Administrador do sistema';
        var corpo  = [
          'Olá,', '',
          'Você está recebendo esta notificação como: ' + papel, '',
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          '📌 NOVA SOLICITAÇÃO DE RESERVA — CCBJ',
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', '',
          '🏛️ Espaço solicitado : ' + nomeSala,
          '📋 Tipo               : ' + s.tipo + ' / ' + s.subtipo,
          '👤 Solicitante        : ' + s.usuario,
          '📩 Destinatário       : ' + email,
          '📅 Data da solicitação: ' + new Date().toLocaleString('pt-BR'), '',
          '💬 Justificativa:',
          '"' + s.justificativa + '"', '',
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          'Ações disponíveis:', '',
          '✅ Aprovar : ' + base + '?acao=aprovar&id=' + s.id,
          '❌ Recusar : ' + base + '?acao=recusar&id=' + s.id, '',
          'Ou acesse o painel de Aprovações no sistema CCBJ.',
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
        ].join('\n');
        try { GmailApp.sendEmail(email, assunto, corpo); } catch(e) {}
      });
    } catch (e) {
      console.warn('[AdminSolicitacoesService.notificarSolicitacao] ' + e.message);
    }
  }

  // ── CRUD ─────────────────────────────────────────────────────────

  function criarSolicitacao(tipo, subtipo, dados, usuario, justificativa) {
    if (!justificativa || String(justificativa).trim().length < 10)
      throw new Error('Justificativa obrigatória (mínimo 10 caracteres).');
    if (!usuario || !usuario.includes('@'))
      throw new Error('Usuário não identificado.');

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var aba = _getSheet('Solicitacoes');
      if (!aba) throw new Error("Aba 'Solicitacoes' não encontrada. Execute o Setup.");

      var id   = gerarId('SOL');
      var sala = String((dados && dados.sala) || '').trim();

      var diaSemana = null;
      try {
        var datas   = (dados && dados.datas) || [];
        var dataStr = datas.length > 0 ? datas[0] : ((dados && dados.dados && dados.dados.data) || '');
        if (dataStr) {
          var p = String(dataStr).split('/');
          if (p.length === 3) diaSemana = new Date(p[2], p[1] - 1, p[0]).getDay();
        }
      } catch(e) {}

      var turno = null;
      try {
        var horaIni = (dados && dados.dados && (dados.dados.horaInicio || dados.dados.turno)) || '';
        if (dados && dados.dados && dados.dados.turno) {
          turno = String(dados.dados.turno).toUpperCase();
        } else if (horaIni) {
          var h = parseInt(String(horaIni).split(':')[0]);
          if (!isNaN(h)) turno = h < 12 ? 'MANHA' : h < 18 ? 'TARDE' : 'NOITE';
        }
      } catch(e) {}

      var linha = [
        id,
        String(tipo || '').toUpperCase(),
        String(subtipo || '').toUpperCase(),
        (dados && dados.idReserva) || (dados && dados.dados && dados.dados.id) || '',
        sala,
        String(usuario).toLowerCase().trim(),
        String(justificativa).trim(),
        JSON.stringify(dados || {}),
        'PENDENTE', '', new Date(), ''
      ];

      aba.appendRow(linha);
      limparCacheUsuario(usuario);

      try {
        notificarSolicitacao({ id: id, tipo: tipo, subtipo: subtipo, sala: sala, usuario: usuario, justificativa: justificativa, diaSemana: diaSemana, turno: turno });
      } catch(e) {
        console.warn('[AdminSolicitacoesService] notificação falhou: ' + e.message);
      }

      return { success: true, id: id };
    } finally {
      lock.releaseLock();
    }
  }

  function listarPendentes(emailUsuario) {
    var aba = _getSheet('Solicitacoes');
    if (!aba || aba.getLastRow() < 2) return [];

    var dados  = aba.getRange(2, 1, aba.getLastRow() - 1, 12).getDisplayValues();
    var admins = obterAdmins();
    var email  = String(emailUsuario || '').toLowerCase().trim();
    var isAdmin = admins.includes(email);

    var configSheet = _getSheet('Configuracoes');
    var salasComoResponsavel = {};
    if (configSheet && configSheet.getLastRow() > 1) {
      configSheet.getRange(2, 1, configSheet.getLastRow() - 1, 5).getValues()
        .forEach(function(row) {
          var rawDono = String(row[4] || '').trim();
          if (!rawDono) return;
          var emails = [];
          try {
            var arr = JSON.parse(rawDono);
            var lista = Array.isArray(arr) ? arr : [arr];
            emails = lista.map(function(d) { return String(d.email || d || '').toLowerCase().trim(); });
          } catch(e) { emails = [rawDono.toLowerCase().trim()]; }
          if (emails.indexOf(email) >= 0) salasComoResponsavel[String(row[0]).trim()] = true;
        });
    }

    return dados.filter(function(r) {
      if (!r[0]) return false;
      if (String(r[1]).toUpperCase() === 'CADASTRO_EXTERNO') return false;
      if (isAdmin) return true;
      if (salasComoResponsavel[String(r[4]).trim()]) return true;
      return String(r[5]).toLowerCase().trim() === email && String(r[8]).toUpperCase() === 'PENDENTE';
    }).map(function(r) {
      return { id: r[0], tipo: r[1], subtipo: r[2], idReserva: r[3], sala: r[4],
        usuario: r[5], justificativa: r[6], status: r[8],
        aprovador: r[9], dataSolicitacao: r[10], dataAcao: r[11] };
    });
  }

  function listarTodas(emailUsuario) {
    var admins = obterAdmins();
    var emailL = String(emailUsuario || '').toLowerCase().trim();
    var isAdm  = admins.indexOf(emailL) >= 0;
    if (!isAdm) {
      var configS = _getSheet('Configuracoes');
      var ehDono  = false;
      if (configS && configS.getLastRow() > 1) {
        configS.getRange(2, 1, configS.getLastRow() - 1, 5).getValues()
          .forEach(function(row) {
            if (ehDono) return;
            var raw = String(row[4] || '').trim();
            if (!raw) return;
            var emails = [];
            try {
              var a = JSON.parse(raw);
              emails = (Array.isArray(a) ? a : [a]).map(function(d) { return String(d.email || d || '').toLowerCase().trim(); });
            } catch(e) { emails = [raw.toLowerCase().trim()]; }
            if (emails.indexOf(emailL) >= 0) ehDono = true;
          });
      }
      if (!ehDono) throw new Error('Acesso negado.');
    }

    var aba = _getSheet('Solicitacoes');
    if (!aba || aba.getLastRow() < 2) return [];
    return aba.getRange(2, 1, aba.getLastRow() - 1, 12).getDisplayValues()
      .filter(function(r) { return r[0] && String(r[1]).toUpperCase() !== 'CADASTRO_EXTERNO'; })
      .map(function(r) {
        return { id: r[0], tipo: r[1], subtipo: r[2], idReserva: r[3], sala: r[4],
          usuario: r[5], justificativa: r[6], status: r[8],
          aprovador: r[9], dataSolicitacao: r[10], dataAcao: r[11] };
      }).reverse();
  }

  function aprovar(id, emailAprovador) {
    if (!emailAprovador || !emailAprovador.includes('@'))
      emailAprovador = obterEmailUsuario('');

    var admins    = obterAdmins();
    var emailLimpo = emailAprovador.toLowerCase().trim();
    var isAdmin    = admins.indexOf(emailLimpo) >= 0;
    var isDonoEspaco = false;

    if (!isAdmin) {
      var abaSol = _getSheet('Solicitacoes');
      if (abaSol) {
        var linhasSol = abaSol.getDataRange().getValues();
        for (var i = 1; i < linhasSol.length; i++) {
          if (String(linhasSol[i][0]).trim() === String(id).trim()) {
            var salaId = String(linhasSol[i][4]).trim();
            var dS = null;
            try {
              var pyld = JSON.parse(linhasSol[i][7] || '{}');
              var dt   = (pyld.datas || []);
              var dStr = dt.length > 0 ? dt[0] : ((pyld.dados && pyld.dados.data) || '');
              if (dStr) { var pts = dStr.split('/'); if (pts.length === 3) dS = new Date(pts[2], pts[1] - 1, pts[0]).getDay(); }
            } catch(e) {}
            var donosStr  = obterDonoEspaco(salaId, dS) || '';
            var listaEmails = donosStr.split(',').map(function(e) { return e.toLowerCase().trim(); });
            if (listaEmails.indexOf(emailLimpo) >= 0) isDonoEspaco = true;
            break;
          }
        }
      }
    }
    if (!isAdmin && !isDonoEspaco)
      throw new Error('Acesso negado: apenas o responsável pelo espaço ou administrador pode aprovar.');

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var aba   = _getSheet('Solicitacoes');
      var dados = aba.getDataRange().getValues();
      var linha = -1, sol = null;
      for (var j = 1; j < dados.length; j++) {
        if (String(dados[j][0]).trim() === String(id).trim()) { sol = dados[j]; linha = j; break; }
      }
      if (!sol) throw new Error('Solicitação não encontrada.');

      var status = String(sol[8]).toUpperCase();
      if (status === 'APROVADO') throw new Error('Solicitação já aprovada.');
      if (status === 'RECUSADO') throw new Error('Solicitação já recusada.');

      var payload = {};
      try { payload = JSON.parse(sol[7] || '{}'); } catch(e) {}
      var tipo = String(sol[1]).toUpperCase();

      if (tipo === 'RESERVA') {
        var d  = payload.dados || payload;
        var dt2 = payload.datas || payload.datasAgendadas || (d.data ? [d.data] : []);
        if (!d || !d.nomeAcao) throw new Error('Payload inválido para reserva.');
        criarReservaController(d, dt2);
      } else if (tipo === 'ALTERACAO') {
        var da = payload.dados || payload;
        if (!da || !da.id) throw new Error('Payload inválido para alteração.');
        atualizarReservaController(da);
      } else if (tipo === 'CANCELAMENTO') {
        var idRes = payload.idReserva || payload.id || sol[3];
        if (!idRes) throw new Error('ID da reserva não encontrado.');
        cancelarReserva(idRes, emailAprovador);
      }

      aba.getRange(linha + 1, 9).setValue('APROVADO');
      aba.getRange(linha + 1, 10).setValue(emailAprovador);
      aba.getRange(linha + 1, 12).setValue(new Date());

      registrarLog('APROVAÇÃO', 'SOLICITAÇÃO', id,
        'Tipo: ' + tipo + ' | Aprovador: ' + emailAprovador,
        'PENDENTE', 'APROVADO', emailAprovador);

      try {
        var solicitante = String(sol[5] || '');
        if (solicitante.includes('@'))
          GmailApp.sendEmail(solicitante, '✅ Sua solicitação foi aprovada — CCBJ',
            'Sua solicitação (' + tipo + ') foi aprovada por ' + emailAprovador + '.');
      } catch(e) {}

      limparCacheUsuario(emailAprovador);
      SystemEvents.emit(SystemEventTypes.RESERVATION_APPROVED, {
        entidade: 'reserva', entidadeId: id, usuario: emailAprovador, origem: 'admin_solicitacoes_service'
      });

      return { success: true };
    } finally { lock.releaseLock(); }
  }

  function recusar(id, justificativa, emailAprovador) {
    if (!emailAprovador || !emailAprovador.includes('@'))
      emailAprovador = obterEmailUsuario('');

    var admins     = obterAdmins();
    var emailLimpoR = emailAprovador.toLowerCase().trim();
    var isAdminR    = admins.indexOf(emailLimpoR) >= 0;
    var isDonoR     = false;

    if (!isAdminR) {
      var abaSolR = _getSheet('Solicitacoes');
      if (abaSolR) {
        var linhsR = abaSolR.getDataRange().getValues();
        for (var i = 1; i < linhsR.length; i++) {
          if (String(linhsR[i][0]).trim() === String(id).trim()) {
            var salaIdR = String(linhsR[i][4]).trim();
            var dsR = null;
            try {
              var pyR  = JSON.parse(linhsR[i][7] || '{}');
              var dtR  = pyR.datas || [];
              var dsStr = dtR.length > 0 ? dtR[0] : ((pyR.dados && pyR.dados.data) || '');
              if (dsStr) { var psR = dsStr.split('/'); if (psR.length === 3) dsR = new Date(psR[2], psR[1] - 1, psR[0]).getDay(); }
            } catch(e) {}
            var donosR    = obterDonoEspaco(salaIdR, dsR) || '';
            var listaEmailsR = donosR.split(',').map(function(e) { return e.toLowerCase().trim(); });
            if (listaEmailsR.indexOf(emailLimpoR) >= 0) isDonoR = true;
            break;
          }
        }
      }
    }
    if (!isAdminR && !isDonoR)
      throw new Error('Acesso negado: apenas o responsável pelo espaço ou administrador pode recusar.');
    if (!justificativa || String(justificativa).trim().length < 5)
      throw new Error('Justificativa obrigatória (mínimo 5 caracteres).');

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var aba   = _getSheet('Solicitacoes');
      var dados = aba.getDataRange().getValues();
      var linha = -1, sol = null;
      for (var j = 1; j < dados.length; j++) {
        if (String(dados[j][0]).trim() === String(id).trim()) { sol = dados[j]; linha = j; break; }
      }
      if (!sol) throw new Error('Solicitação não encontrada.');

      var st = String(sol[8]).toUpperCase();
      if (st !== 'PENDENTE') throw new Error('Solicitação já ' + st.toLowerCase() + '.');

      aba.getRange(linha + 1, 9).setValue('RECUSADO');
      aba.getRange(linha + 1, 10).setValue(emailAprovador);
      aba.getRange(linha + 1, 12).setValue(new Date());
      aba.getRange(linha + 1, 7).setValue(String(sol[6] || '') + ' | RECUSA: ' + String(justificativa).trim());

      registrarLog('RECUSA', 'SOLICITAÇÃO', id,
        'Motivo: ' + justificativa + ' | Recusador: ' + emailAprovador,
        'PENDENTE', 'RECUSADO', emailAprovador);

      try {
        var sol5 = String(sol[5] || '');
        if (sol5.includes('@'))
          GmailApp.sendEmail(sol5, '❌ Sua solicitação foi recusada — CCBJ',
            'Sua solicitação (' + sol[1] + ') foi recusada.\nMotivo: ' + justificativa);
      } catch(e) {}

      limparCacheUsuario(emailAprovador);
      SystemEvents.emit(SystemEventTypes.RESERVATION_REJECTED, {
        entidade: 'reserva', entidadeId: id, usuario: emailAprovador,
        origem: 'admin_solicitacoes_service', contexto: { motivo: justificativa }
      });

      return { success: true };
    } finally { lock.releaseLock(); }
  }

  return {
    obterAdmins:         obterAdmins,
    obterDonoEspaco:     obterDonoEspaco,
    notificarSolicitacao:notificarSolicitacao,
    criarSolicitacao:    criarSolicitacao,
    listarPendentes:     listarPendentes,
    listarTodas:         listarTodas,
    aprovar:             aprovar,
    recusar:             recusar
  };

})();
