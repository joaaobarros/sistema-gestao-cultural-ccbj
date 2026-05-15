/**
 * @file modules/rh/escalas_engine.gs
 * @layer modules/rh
 * @description Motor de regras do Sistema de Escalas e Agendas Operacionais.
 *
 * FSM Escala:
 *   rascunho → publicada → arquivada
 *           ↘ cancelada (de qualquer estado não-final)
 *
 * FSM Troca:
 *   solicitada → aceita_colega → aprovada
 *             ↘ rejeitada_colega
 *                              ↘ rejeitada_gestor
 *
 * @depends modules/rh/escalas_repository.gs (EscalasRepository),
 *          core/services/auditoria_service.gs (AuditoriaService)
 */

var STATUS_ESCALA = {
  RASCUNHO:  'rascunho',
  PUBLICADA: 'publicada',
  CANCELADA: 'cancelada',
  ARQUIVADA: 'arquivada'
};

var STATUS_TURNO = {
  CONFIRMADO: 'confirmado',
  PENDENTE:   'pendente',
  TROCADO:    'trocado',
  CANCELADO:  'cancelado'
};

var STATUS_TROCA = {
  SOLICITADA:       'solicitada',
  ACEITA_COLEGA:    'aceita_colega',
  APROVADA:         'aprovada',
  REJEITADA_COLEGA: 'rejeitada_colega',
  REJEITADA_GESTOR: 'rejeitada_gestor',
  CANCELADA:        'cancelada'
};

var EscalasEngine = (function () {

  // ── Helpers internos ─────────────────────────────────────────────

  function _audit(evento, dados) {
    try {
      if (typeof AuditoriaService !== 'undefined')
        AuditoriaService.registrar(evento, 'escalas', dados || {});
    } catch(_) {}
  }

  function _gerarId(prefixo) {
    return typeof gerarId === 'function'
      ? gerarId(prefixo)
      : prefixo + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);
  }

  function _horaParaMin(hora) {
    if (!hora) return 0;
    var p = String(hora).split(':');
    return parseInt(p[0] || 0) * 60 + parseInt(p[1] || 0);
  }

  function _calcularTipoTurno(horaInicio, horaFim) {
    var ini = _horaParaMin(horaInicio);
    var fim = _horaParaMin(horaFim);
    if (ini < 720 && fim <= 720)  return 'MANHÃ';
    if (ini >= 720 && fim <= 1080) return 'TARDE';
    if (ini >= 1080)               return 'NOITE';
    if (ini < 720 && fim > 1080)   return 'INTEGRAL';
    return 'MISTO';
  }

  // ── Escalas ──────────────────────────────────────────────────────

  function listarEscalas(filtros) {
    return EscalasRepository.listarEscalas(filtros || null);
  }

  function obterEscala(id) {
    var e = EscalasRepository.obterEscala(id);
    if (!e) throw new Error('Escala não encontrada: ' + id);
    return e;
  }

  function criarEscala(dados, email) {
    if (!dados || !dados.titulo || !dados.titulo.trim())
      throw new Error('Título da escala é obrigatório.');
    dados.status     = STATUS_ESCALA.RASCUNHO;
    dados.turnos     = dados.turnos || [];
    dados.criadoPor  = email || '';
    var r = EscalasRepository.salvarEscala(dados);
    _audit('ESCALA_CRIADA', { id: r.id, titulo: dados.titulo, operador: email });
    return r.id;
  }

  function atualizarEscala(dados, email) {
    var existente = EscalasRepository.obterEscala(dados.id);
    if (!existente) throw new Error('Escala não encontrada.');
    if (existente.status === STATUS_ESCALA.CANCELADA)
      throw new Error('Não é possível editar uma escala cancelada.');
    dados.atualizadoEm  = new Date().toISOString();
    dados.atualizadoPor = email || '';
    EscalasRepository.salvarEscala(dados);
    _audit('ESCALA_ATUALIZADA', { id: dados.id, operador: email });
    return dados.id;
  }

  function publicarEscala(id, email) {
    var e = obterEscala(id);
    if (e.status !== STATUS_ESCALA.RASCUNHO)
      throw new Error('Apenas escalas em rascunho podem ser publicadas.');
    if (!e.turnos || e.turnos.length === 0)
      throw new Error('A escala precisa ter pelo menos um turno antes de ser publicada.');
    e.status      = STATUS_ESCALA.PUBLICADA;
    e.publicadoEm = new Date().toISOString();
    e.publicadoPor = email || '';
    EscalasRepository.salvarEscala(e);
    _audit('ESCALA_PUBLICADA', { id: id, titulo: e.titulo, operador: email });
    _notificarPublicacao(e, email);
    return { ok: true };
  }

  function cancelarEscala(id, motivo, email) {
    var e = obterEscala(id);
    if (e.status === STATUS_ESCALA.CANCELADA)
      throw new Error('Escala já está cancelada.');
    e.status            = STATUS_ESCALA.CANCELADA;
    e.canceladoEm       = new Date().toISOString();
    e.canceladoPor      = email || '';
    e.motivoCancelamento = motivo || '';
    EscalasRepository.salvarEscala(e);
    _audit('ESCALA_CANCELADA', { id: id, motivo: motivo, operador: email });
    return { ok: true };
  }

  function arquivarEscala(id, email) {
    var e = obterEscala(id);
    if (e.status !== STATUS_ESCALA.PUBLICADA)
      throw new Error('Apenas escalas publicadas podem ser arquivadas.');
    e.status      = STATUS_ESCALA.ARQUIVADA;
    e.arquivadoEm = new Date().toISOString();
    EscalasRepository.salvarEscala(e);
    _audit('ESCALA_ARQUIVADA', { id: id, operador: email });
    return { ok: true };
  }

  // ── Turnos ───────────────────────────────────────────────────────

  function adicionarTurno(idEscala, turnoData, email) {
    var e = obterEscala(idEscala);
    if (e.status === STATUS_ESCALA.CANCELADA)
      throw new Error('Não é possível adicionar turno a uma escala cancelada.');
    if (e.status === STATUS_ESCALA.ARQUIVADA)
      throw new Error('Não é possível adicionar turno a uma escala arquivada.');

    turnoData.id        = _gerarId('turno');
    turnoData.status    = STATUS_TURNO.CONFIRMADO;
    turnoData.criadoPor = email || '';
    turnoData.criadoEm  = new Date().toISOString();
    if (turnoData.horaInicio && turnoData.horaFim && !turnoData.tipoTurno) {
      turnoData.tipoTurno = _calcularTipoTurno(turnoData.horaInicio, turnoData.horaFim);
    }

    if (!e.turnos) e.turnos = [];
    e.turnos.push(turnoData);
    e.atualizadoEm = new Date().toISOString();
    EscalasRepository.salvarEscala(e);
    _audit('TURNO_ADICIONADO', {
      idEscala: idEscala, idTurno: turnoData.id,
      colaborador: turnoData.idColaborador, operador: email
    });
    return turnoData.id;
  }

  function atualizarTurno(idEscala, turnoData, email) {
    var e = obterEscala(idEscala);
    if (!e.turnos) throw new Error('Escala não possui turnos.');
    var idx = -1;
    for (var i = 0; i < e.turnos.length; i++) {
      if (e.turnos[i].id === turnoData.id) { idx = i; break; }
    }
    if (idx < 0) throw new Error('Turno não encontrado na escala.');
    if (turnoData.horaInicio && turnoData.horaFim && !turnoData.tipoTurno) {
      turnoData.tipoTurno = _calcularTipoTurno(turnoData.horaInicio, turnoData.horaFim);
    }
    e.turnos[idx]   = turnoData;
    e.atualizadoEm  = new Date().toISOString();
    EscalasRepository.salvarEscala(e);
    _audit('TURNO_ATUALIZADO', { idEscala: idEscala, idTurno: turnoData.id, operador: email });
    return turnoData.id;
  }

  function excluirTurno(idEscala, idTurno, email) {
    var e = obterEscala(idEscala);
    if (!e.turnos) throw new Error('Escala não possui turnos.');
    var antes = e.turnos.length;
    e.turnos = e.turnos.filter(function(t) { return t.id !== idTurno; });
    if (e.turnos.length === antes) throw new Error('Turno não encontrado na escala.');
    e.atualizadoEm = new Date().toISOString();
    EscalasRepository.salvarEscala(e);
    _audit('TURNO_EXCLUIDO', { idEscala: idEscala, idTurno: idTurno, operador: email });
  }

  function verificarConflito(turnoData) {
    if (!turnoData || !turnoData.idColaborador || !turnoData.dataInicio) {
      return { conflito: false };
    }
    var escalas = EscalasRepository.listarEscalas({ status: STATUS_ESCALA.PUBLICADA });
    for (var i = 0; i < escalas.length; i++) {
      var turnos = escalas[i].turnos || [];
      for (var j = 0; j < turnos.length; j++) {
        var t = turnos[j];
        if (t.idColaborador !== turnoData.idColaborador) continue;
        if (t.dataInicio !== turnoData.dataInicio) continue;
        if (t.status === STATUS_TURNO.CANCELADO) continue;
        if (t.id === turnoData.id) continue; // edição do próprio turno
        var exIni = _horaParaMin(t.horaInicio);
        var exFim = _horaParaMin(t.horaFim);
        var noIni = _horaParaMin(turnoData.horaInicio);
        var noFim = _horaParaMin(turnoData.horaFim);
        if (noIni < exFim && noFim > exIni) {
          return { conflito: true, turnoExistente: t, escalaNome: escalas[i].titulo };
        }
      }
    }
    return { conflito: false };
  }

  // ── Minha Escala ─────────────────────────────────────────────────

  function minhaEscala(idColaborador, mes) {
    var filtros = { idColaborador: idColaborador };
    if (mes) filtros.mes = mes;
    var escalas = EscalasRepository.listarEscalas(filtros)
      .filter(function(e) {
        return e.status === STATUS_ESCALA.PUBLICADA || e.status === STATUS_ESCALA.ARQUIVADA;
      });
    return escalas.map(function(e) {
      var copia = JSON.parse(JSON.stringify(e));
      copia.turnos = (copia.turnos || []).filter(function(t) {
        return t.idColaborador === idColaborador;
      });
      return copia;
    });
  }

  // ── Troca de Escala ──────────────────────────────────────────────

  function listarTrocas(filtros) {
    return EscalasRepository.listarTrocas(filtros || null);
  }

  function solicitarTroca(dados, email) {
    if (!dados.idEscala || !dados.idTurno || !dados.idSubstituto)
      throw new Error('idEscala, idTurno e idSubstituto são obrigatórios.');
    if (!dados.justificativa || dados.justificativa.trim().length < 10)
      throw new Error('Justificativa deve ter pelo menos 10 caracteres.');

    var escala = obterEscala(dados.idEscala);
    if (escala.status !== STATUS_ESCALA.PUBLICADA)
      throw new Error('Trocas só podem ser solicitadas em escalas publicadas.');

    var turno = null;
    (escala.turnos || []).forEach(function(t) { if (t.id === dados.idTurno) turno = t; });
    if (!turno) throw new Error('Turno não encontrado na escala.');
    if (turno.status === STATUS_TURNO.TROCADO)
      throw new Error('Este turno já foi objeto de uma troca aprovada.');

    var troca = {
      idEscala:           dados.idEscala,
      idTurno:            dados.idTurno,
      idSolicitante:      dados.idSolicitante || '',
      nomeSolicitante:    dados.nomeSolicitante || '',
      idSubstituto:       dados.idSubstituto,
      nomeSubstituto:     dados.nomeSubstituto || '',
      dataOriginal:       turno.dataInicio,
      dataNova:           dados.dataNova || turno.dataInicio,
      horaOriginalInicio: turno.horaInicio,
      horaOriginalFim:    turno.horaFim,
      horaNovainicio:     dados.horaNovainicio || turno.horaInicio,
      horaNovaFim:        dados.horaNovaFim    || turno.horaFim,
      justificativa:      dados.justificativa.trim(),
      status:             STATUS_TROCA.SOLICITADA,
      historico: [{ status: STATUS_TROCA.SOLICITADA, em: new Date().toISOString(), por: email }]
    };

    var r = EscalasRepository.salvarTroca(troca);
    _audit('TROCA_SOLICITADA', { idTroca: r.id, idEscala: dados.idEscala, operador: email });
    return r.id;
  }

  function responderTroca(idTroca, aceita, motivo, email) {
    var troca = EscalasRepository.obterTroca(idTroca);
    if (!troca) throw new Error('Troca não encontrada.');
    if (troca.status !== STATUS_TROCA.SOLICITADA)
      throw new Error('Esta troca não está mais aguardando resposta do colega.');
    troca.status              = aceita ? STATUS_TROCA.ACEITA_COLEGA : STATUS_TROCA.REJEITADA_COLEGA;
    troca.respostaColega      = motivo || '';
    troca.respondidoPorColega = email || '';
    troca.respondidoEm        = new Date().toISOString();
    troca.historico.push({ status: troca.status, em: new Date().toISOString(), por: email, motivo: motivo });
    EscalasRepository.salvarTroca(troca);
    _audit('TROCA_RESPONDIDA_COLEGA', { idTroca: idTroca, aceita: aceita, operador: email });
    return { ok: true };
  }

  function aprovarTroca(idTroca, aprovada, motivo, email) {
    var troca = EscalasRepository.obterTroca(idTroca);
    if (!troca) throw new Error('Troca não encontrada.');
    if (troca.status !== STATUS_TROCA.ACEITA_COLEGA)
      throw new Error('Esta troca não está aguardando aprovação do gestor/RH.');
    if (aprovada) {
      troca.status = STATUS_TROCA.APROVADA;
      _aplicarTroca(troca);
    } else {
      troca.status = STATUS_TROCA.REJEITADA_GESTOR;
    }
    troca.respostaGestor = motivo || '';
    troca.aprovadoPor    = email || '';
    troca.aprovadoEm     = new Date().toISOString();
    troca.historico.push({ status: troca.status, em: new Date().toISOString(), por: email, motivo: motivo });
    EscalasRepository.salvarTroca(troca);
    _audit('TROCA_DECISAO_GESTOR', { idTroca: idTroca, aprovada: aprovada, operador: email });
    return { ok: true };
  }

  function cancelarTroca(idTroca, email) {
    var troca = EscalasRepository.obterTroca(idTroca);
    if (!troca) throw new Error('Troca não encontrada.');
    if (troca.status !== STATUS_TROCA.SOLICITADA)
      throw new Error('Apenas trocas "solicitadas" podem ser canceladas pelo solicitante.');
    troca.status    = STATUS_TROCA.CANCELADA;
    troca.canceladoEm = new Date().toISOString();
    troca.historico.push({ status: STATUS_TROCA.CANCELADA, em: new Date().toISOString(), por: email });
    EscalasRepository.salvarTroca(troca);
    _audit('TROCA_CANCELADA', { idTroca: idTroca, operador: email });
    return { ok: true };
  }

  function _aplicarTroca(troca) {
    var escala = EscalasRepository.obterEscala(troca.idEscala);
    if (!escala || !escala.turnos) return;
    for (var i = 0; i < escala.turnos.length; i++) {
      var t = escala.turnos[i];
      if (t.id === troca.idTurno) {
        t.idColaboradorOriginal = t.idColaborador;
        t.nomeColaboradorOriginal = t.nomeColaborador;
        t.idColaborador  = troca.idSubstituto;
        t.nomeColaborador = troca.nomeSubstituto;
        t.status         = STATUS_TURNO.TROCADO;
        t.trocaId        = troca.id;
        t.trocaEm        = new Date().toISOString();
        break;
      }
    }
    escala.atualizadoEm = new Date().toISOString();
    EscalasRepository.salvarEscala(escala);
  }

  // ── Integração Google Calendar ────────────────────────────────────

  function sincronizarCalendar(idEscala, email) {
    var escala = obterEscala(idEscala);
    if (!escala.vinculoCalendar) return { ok: false, msg: 'Escala não está vinculada ao Google Calendar.' };

    try {
      var cal = CalendarApp.getDefaultCalendar();
      var count = 0;
      (escala.turnos || []).forEach(function(turno) {
        if (!turno.dataInicio || !turno.horaInicio || !turno.horaFim) return;
        var dp    = turno.dataInicio.split('-');
        var pi    = turno.horaInicio.split(':');
        var pf    = turno.horaFim.split(':');
        var ini   = new Date(+dp[0], +dp[1]-1, +dp[2], +pi[0], +pi[1]);
        var fim   = new Date(+dp[0], +dp[1]-1, +dp[2], +pf[0], +pf[1]);
        var titulo = '[ESCALA] ' + escala.titulo + ' — ' + (turno.nomeColaborador || '');
        var descr  = 'Setor: ' + (escala.setor || '') + '\nTurno: ' + turno.horaInicio + '–' + turno.horaFim;
        if (turno.calendarEventId) {
          try {
            var ev = cal.getEventById(turno.calendarEventId);
            if (ev) { ev.setTitle(titulo); ev.setDescription(descr); ev.setTime(ini, fim); }
            else    { var ne = cal.createEvent(titulo, ini, fim, {description: descr}); turno.calendarEventId = ne.getId(); }
          } catch(_) {
            var ne2 = cal.createEvent(titulo, ini, fim, {description: descr}); turno.calendarEventId = ne2.getId();
          }
        } else {
          var ne3 = cal.createEvent(titulo, ini, fim, {description: descr}); turno.calendarEventId = ne3.getId();
        }
        count++;
      });
      EscalasRepository.salvarEscala(escala);
      _audit('ESCALA_CALENDAR_SYNC', { idEscala: idEscala, eventos: count, operador: email });
      return { ok: true, eventos: count };
    } catch(err) {
      return { ok: false, msg: 'Erro ao sincronizar Calendar: ' + err.message };
    }
  }

  // ── Importação (Colabore/Fortes) ──────────────────────────────────

  function importarColabore(linhas, emailOperador) {
    if (!linhas || !linhas.length) throw new Error('Nenhum dado fornecido para importação.');

    var sucessos = 0, erros = [], ignorados = 0;
    var escala = {
      titulo:     'Importação Colabore — ' + new Date().toLocaleDateString('pt-BR'),
      tipo:       'importado',
      origem:     'colabore',
      status:     STATUS_ESCALA.PUBLICADA,
      turnos:     [],
      criadoPor:  emailOperador,
      publicadoEm: new Date().toISOString()
    };

    linhas.forEach(function(linha, idx) {
      if (idx === 0) return; // skip header
      try {
        var cols = Array.isArray(linha)
          ? linha
          : String(linha).split(',').map(function(c) { return c.trim().replace(/^"|"$/g,''); });
        if (cols.length < 3 || !cols[2]) { ignorados++; return; }

        // Colunas esperadas Colabore:
        // [0] CPF/Matrícula, [1] Nome, [2] Data, [3] Entrada, [4] Saída, [5] Situação
        var cpfMatricula = String(cols[0] || '').trim();
        var nome         = String(cols[1] || '').trim();
        var dataStr      = String(cols[2] || '').trim();
        var entrada      = String(cols[3] || '08:00').trim() || '08:00';
        var saida        = String(cols[4] || '17:00').trim() || '17:00';
        var situacao     = String(cols[5] || 'Presente').trim();

        // Normalizar data DD/MM/YYYY → YYYY-MM-DD
        var dataISO = dataStr;
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(dataStr)) {
          var dp = dataStr.split('/');
          dataISO = dp[2] + '-' + dp[1] + '-' + dp[0];
        } else if (/^\d{2}\/\d{2}\/\d{2}$/.test(dataStr)) {
          var dp2 = dataStr.split('/');
          dataISO = '20' + dp2[2] + '-' + dp2[1] + '-' + dp2[0];
        }

        var normHora = function(h) {
          var m = String(h).match(/^(\d{1,2}):(\d{2})/);
          return m ? m[1].padStart(2,'0') + ':' + m[2] : null;
        };
        var horaIni = normHora(entrada) || '08:00';
        var horaFim = normHora(saida)   || '17:00';

        // Tentar resolver colaborador por CPF ou nome
        var funcionarios = readJSON('funcionarios.json') || [];
        var colab = null;
        var cpfClean = cpfMatricula.replace(/\D/g,'');
        for (var fi = 0; fi < funcionarios.length; fi++) {
          var f = funcionarios[fi];
          if (!colab && cpfClean && (f.cpf||'').replace(/\D/g,'') === cpfClean) colab = f;
          if (!colab && nome && (f.nome||'').toLowerCase().trim() === nome.toLowerCase().trim()) colab = f;
        }

        var turno = {
          id:             _gerarId('turno'),
          idColaborador:  colab ? colab.id : cpfMatricula,
          nomeColaborador: colab ? colab.nome : nome,
          dataInicio:     dataISO,
          dataFim:        dataISO,
          horaInicio:     horaIni,
          horaFim:        horaFim,
          tipoTurno:      _calcularTipoTurno(horaIni, horaFim),
          situacao:       situacao,
          origem:         'colabore',
          status:         STATUS_TURNO.CONFIRMADO,
          criadoEm:       new Date().toISOString()
        };
        escala.turnos.push(turno);
        sucessos++;
      } catch(e) {
        erros.push({ linha: idx + 1, erro: e.message });
      }
    });

    if (sucessos === 0) throw new Error('Nenhum registro pôde ser importado. Verifique o formato do arquivo (esperado: CPF, Nome, Data, Entrada, Saída, Situação).');

    var r = EscalasRepository.salvarEscala(escala);
    var log = {
      tipo: 'colabore', escalaId: r.id,
      registros: linhas.length - 1, sucessos: sucessos, ignorados: ignorados, erros: erros,
      criadoPor: emailOperador
    };
    EscalasRepository.salvarLog(log);
    _audit('ESCALAS_IMPORTADAS', { escalaId: r.id, total: sucessos, operador: emailOperador });
    return { ok: true, escalaId: r.id, sucessos: sucessos, ignorados: ignorados, erros: erros };
  }

  // ── Exportação ───────────────────────────────────────────────────

  function exportarEscala(idEscala) {
    var escala = obterEscala(idEscala);
    var linhas = [['Colaborador', 'Data', 'Entrada', 'Saída', 'Turno', 'Setor', 'Status', 'Situação']];
    (escala.turnos || []).forEach(function(t) {
      linhas.push([
        t.nomeColaborador || t.idColaborador || '',
        t.dataInicio || '',
        t.horaInicio || '',
        t.horaFim || '',
        t.tipoTurno || _calcularTipoTurno(t.horaInicio, t.horaFim),
        escala.setor || '',
        t.status || '',
        t.situacao || ''
      ]);
    });
    return { titulo: escala.titulo, linhas: linhas, totalTurnos: escala.turnos ? escala.turnos.length : 0 };
  }

  // ── Notificações ─────────────────────────────────────────────────

  function _notificarPublicacao(escala, email) {
    try {
      var mapa = {};
      (escala.turnos || []).forEach(function(t) {
        if (t.idColaborador) mapa[t.idColaborador] = true;
      });
      var emails = [];
      var funcionarios = readJSON('funcionarios.json') || [];
      funcionarios.forEach(function(f) {
        if (mapa[f.id]) {
          var em = (f.emailInstitucional || f.email || '').trim();
          if (em) emails.push(em);
        }
      });
      if (emails.length > 0) {
        MailApp.sendEmail({
          to:      emails.join(','),
          subject: '[CCBJ Escalas] Nova escala publicada: ' + escala.titulo,
          body:    'Uma nova escala foi publicada: "' + escala.titulo + '".\n'
                 + 'Acesse o Sistema CCBJ para visualizar seus turnos.'
        });
      }
    } catch(_) {} // silencioso
  }

  // ── API pública ───────────────────────────────────────────────────

  return {
    listarEscalas:       listarEscalas,
    obterEscala:         obterEscala,
    criarEscala:         criarEscala,
    atualizarEscala:     atualizarEscala,
    publicarEscala:      publicarEscala,
    cancelarEscala:      cancelarEscala,
    arquivarEscala:      arquivarEscala,
    adicionarTurno:      adicionarTurno,
    atualizarTurno:      atualizarTurno,
    excluirTurno:        excluirTurno,
    verificarConflito:   verificarConflito,
    minhaEscala:         minhaEscala,
    listarTrocas:        listarTrocas,
    solicitarTroca:      solicitarTroca,
    responderTroca:      responderTroca,
    aprovarTroca:        aprovarTroca,
    cancelarTroca:       cancelarTroca,
    sincronizarCalendar: sincronizarCalendar,
    importarColabore:    importarColabore,
    exportarEscala:      exportarEscala
  };

})();
