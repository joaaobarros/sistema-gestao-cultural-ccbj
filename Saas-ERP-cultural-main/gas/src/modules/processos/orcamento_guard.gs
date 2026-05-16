/**
 * @file modules/processos/orcamento_guard.gs
 * @layer modules
 * @description Guard de Controle Orçamentário — valida saldo e reserva orçamento
 *              antes de aprovar processos administrativo-financeiros.
 *
 *              PRINCÍPIO:
 *              NUNCA comprometer orçamento sem validação prévia.
 *              Toda contratação com valor > 0 deve:
 *              1. Verificar saldo disponível na rubrica
 *              2. Bloquear aprovação se não houver saldo
 *              3. Reservar orçamento após aprovação
 *              4. Liberar reserva se cancelado
 *
 *              INTEGRAÇÃO:
 *              - Lê rubricas de obterRubricas() (mod_relatorios.gs)
 *              - Persiste reservas em orcamento_reservas.json
 *              - Registra no EventBus: ORCAMENTO_RESERVADO, ORCAMENTO_LIBERADO
 *
 * @depends backend/mod_relatorios.gs (obterRubricas, obterContratoPorId)
 * @depends core/data_layer.gs (readJSON, writeJSON)
 * @depends core/event_bus_backend.gs (SystemEvents)
 * @depends core/logger.gs (Logger)
 */

var OrcamentoGuard = (function() {

  var _FILE = 'orcamento_reservas.json';

  // ── Persistência ────────────────────────────────────────────────────────────

  function _lerReservas() {
    try { return readJSON(_FILE) || []; }
    catch(e) {
      Logger.warn('[OrcamentoGuard] Falha ao ler reservas: ' + e.message);
      return [];
    }
  }

  function _salvarReservas(lista) {
    try { writeJSON(_FILE, lista); }
    catch(e) { Logger.warn('[OrcamentoGuard] Falha ao salvar reservas: ' + e.message); }
  }

  // ── Cálculo de saldo disponível ─────────────────────────────────────────────

  function _calcularSaldoRubrica(rubricaId) {
    var rubricas = [];
    try {
      rubricas = obterRubricas ? obterRubricas() : [];
    } catch(e) {
      Logger.warn('[OrcamentoGuard] Falha ao obter rubricas: ' + e.message);
      return null;
    }

    var rubrica = rubricas.find(function(r) {
      return r.id === rubricaId || r.nome === rubricaId;
    });
    if (!rubrica) return null;

    var valorRubrica = parseFloat(rubrica.valor) || 0;

    // Saldo comprometido: soma das reservas ativas para esta rubrica
    var reservas     = _lerReservas();
    var comprometido = reservas
      .filter(function(r) {
        return (r.rubricaId === rubricaId || r.rubricaNome === rubricaId) &&
               r.status === 'ativa';
      })
      .reduce(function(acc, r) { return acc + (parseFloat(r.valor) || 0); }, 0);

    // Valor já pago (executado) na rubrica
    var executado = parseFloat(rubrica.valorExecutado || rubrica.executado || 0);

    return {
      rubricaId:    rubrica.id,
      rubricaNome:  rubrica.nome,
      total:        valorRubrica,
      comprometido: comprometido,
      executado:    executado,
      disponivel:   valorRubrica - comprometido - executado
    };
  }

  // ── API Pública ─────────────────────────────────────────────────────────────

  return {

    /**
     * Verifica se há saldo disponível para o valor solicitado.
     * Retorna { ok, saldo, mensagem }
     */
    verificarSaldo: function(rubricaId, valor) {
      if (!rubricaId) {
        return { ok: true, saldo: null, mensagem: 'Sem rubrica vinculada — validação ignorada.' };
      }
      if (!valor || valor <= 0) {
        return { ok: true, saldo: null, mensagem: 'Valor zero — validação ignorada.' };
      }

      var saldo = _calcularSaldoRubrica(rubricaId);
      if (!saldo) {
        return {
          ok: false,
          saldo: null,
          mensagem: 'Rubrica "' + rubricaId + '" não encontrada. Verifique o financeiro.'
        };
      }

      if (saldo.disponivel < valor) {
        return {
          ok: false,
          saldo: saldo,
          mensagem: 'Saldo insuficiente na rubrica "' + saldo.rubricaNome + '". ' +
                    'Disponível: R$ ' + saldo.disponivel.toFixed(2) + ' | Solicitado: R$ ' + parseFloat(valor).toFixed(2)
        };
      }

      return { ok: true, saldo: saldo, mensagem: 'Saldo disponível.' };
    },

    /**
     * Reserva orçamento para um processo aprovado.
     * Cria entrada em orcamento_reservas.json.
     * @returns reserva criada
     */
    reservar: function(processoId, rubricaId, valor, descricao, emailAtor) {
      if (!rubricaId || !valor || valor <= 0) {
        Logger.info('[OrcamentoGuard] Reserva ignorada — sem rubrica ou valor zero.');
        return null;
      }

      // Verifica saldo antes de reservar
      var check = OrcamentoGuard.verificarSaldo(rubricaId, valor);
      if (!check.ok) throw new Error(check.mensagem);

      var reservas = _lerReservas();

      // Evita reserva duplicada para o mesmo processo
      var existente = reservas.find(function(r) {
        return r.processoId === processoId && r.status === 'ativa';
      });
      if (existente) {
        Logger.info('[OrcamentoGuard] Reserva já existe para processo ' + processoId);
        return existente;
      }

      var reserva = {
        id:           'RES-' + Date.now() + '-' + Math.random().toString(36).slice(2,6).toUpperCase(),
        processoId:   processoId,
        rubricaId:    rubricaId,
        rubricaNome:  (check.saldo || {}).rubricaNome || rubricaId,
        valor:        parseFloat(valor),
        descricao:    descricao || '',
        status:       'ativa',
        criadoEm:     new Date().toISOString(),
        criadoPor:    emailAtor || 'sistema',
        liberadoEm:   null,
        liberadoPor:  null,
        motivo:       null
      };

      reservas.push(reserva);
      _salvarReservas(reservas);

      try {
        SystemEvents.emit('ORCAMENTO_RESERVADO', {
          entidade:   'processo_institucional',
          entidadeId: processoId,
          usuario:    emailAtor || 'sistema',
          contexto:   { rubricaId: rubricaId, valor: valor, reservaId: reserva.id }
        });
      } catch(e) {
        Logger.warn('[OrcamentoGuard] Falha ao emitir ORCAMENTO_RESERVADO: ' + e.message);
      }

      Logger.info('[OrcamentoGuard] Reserva criada: ' + reserva.id + ' | R$ ' + valor + ' | Rubrica: ' + rubricaId);
      return reserva;
    },

    /**
     * Libera reserva orçamentária (cancelamento ou encerramento do processo).
     */
    liberar: function(processoId, motivo, emailAtor) {
      var reservas = _lerReservas();
      var encontrou = false;

      reservas = reservas.map(function(r) {
        if (r.processoId === processoId && r.status === 'ativa') {
          encontrou = true;
          return Object.assign({}, r, {
            status:      'liberada',
            liberadoEm:  new Date().toISOString(),
            liberadoPor: emailAtor || 'sistema',
            motivo:      motivo || ''
          });
        }
        return r;
      });

      if (encontrou) {
        _salvarReservas(reservas);
        try {
          SystemEvents.emit('ORCAMENTO_LIBERADO', {
            entidade:   'processo_institucional',
            entidadeId: processoId,
            usuario:    emailAtor || 'sistema',
            contexto:   { motivo: motivo }
          });
        } catch(e) {}
        Logger.info('[OrcamentoGuard] Reserva liberada para processo ' + processoId);
      }

      return { ok: true, liberou: encontrou };
    },

    /**
     * Converte reserva em pagamento executado (quando processo é encerrado/pago).
     */
    executar: function(processoId, emailAtor) {
      var reservas = _lerReservas();
      var encontrou = false;

      reservas = reservas.map(function(r) {
        if (r.processoId === processoId && r.status === 'ativa') {
          encontrou = true;
          return Object.assign({}, r, {
            status:      'executada',
            liberadoEm:  new Date().toISOString(),
            liberadoPor: emailAtor || 'sistema'
          });
        }
        return r;
      });

      if (encontrou) _salvarReservas(reservas);
      return { ok: true, executou: encontrou };
    },

    /**
     * Retorna saldo atual de uma rubrica (total, comprometido, disponível).
     */
    obterSaldo: function(rubricaId) {
      return _calcularSaldoRubrica(rubricaId);
    },

    /**
     * Lista todas as reservas ativas (para dashboard financeiro).
     */
    listarReservasAtivas: function() {
      return _lerReservas().filter(function(r) { return r.status === 'ativa'; });
    },

    /**
     * Retorna total comprometido por processo.
     */
    obterReservaDoProceso: function(processoId) {
      return _lerReservas().find(function(r) {
        return r.processoId === processoId && r.status === 'ativa';
      }) || null;
    },

    /**
     * Dashboard orçamentário: visão consolidada de comprometimento.
     */
    obterDashboardOrcamentario: function() {
      var reservas = _lerReservas();
      var ativas   = reservas.filter(function(r) { return r.status === 'ativa'; });
      var execut   = reservas.filter(function(r) { return r.status === 'executada'; });

      var totalComprometido = ativas.reduce(function(a, r) { return a + r.valor; }, 0);
      var totalExecutado    = execut.reduce(function(a, r) { return a + r.valor; }, 0);

      // Agrupamento por rubrica
      var porRubrica = {};
      ativas.forEach(function(r) {
        var k = r.rubricaNome || r.rubricaId;
        porRubrica[k] = porRubrica[k] || { rubricaNome: k, comprometido: 0, processos: 0 };
        porRubrica[k].comprometido += r.valor;
        porRubrica[k].processos++;
      });

      return {
        totalReservas:     ativas.length,
        totalComprometido: totalComprometido,
        totalExecutado:    totalExecutado,
        porRubrica:        Object.values(porRubrica),
        reservasAtivas:    ativas
      };
    }
  };
})();
