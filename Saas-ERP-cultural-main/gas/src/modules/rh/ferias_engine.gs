/**
 * @file modules/rh/ferias_engine.gs
 * @layer modules/rh
 * @description Motor de gestão de férias do domínio RH.
 *
 * Responsabilidades:
 *   - FSM de status de férias com transições explícitas
 *   - Cálculo de período aquisitivo e concessivo por colaborador
 *   - Saldo de férias (dias acumulados – gozados)
 *   - Diferenciação OFICIAL (pagamento + gozo) vs ACORDO_PASSIVO (pagamento sem gozo efetivo)
 *   - Geração de alertas de risco (vencimento de período concessivo)
 *   - Histórico auditável de cada operação
 *
 * Visibilidade de dados:
 *   - Solicitações visíveis APENAS para: RH, gestor responsável, colaborador, superadmin
 *
 * @depends modules/rh/rh_repository.gs (RHRepository),
 *          core/services/auditoria_service.gs (AuditoriaService)
 */

// ── Enumerações públicas ──────────────────────────────────────────────────────

var STATUS_FERIAS = {
  SOLICITADA:       'solicitada',
  PENDENTE_AJUSTE:  'pendente_ajuste',
  APROVADA:         'aprovada',
  REPROVADA:        'reprovada',
  EM_GOZO:          'em_gozo',
  CONCLUIDA:        'concluida',
  CANCELADA:        'cancelada'
};

var TIPO_FERIAS = {
  OFICIAL:         'oficial',        // pagamento realizado + gozo efetivo
  ACORDO_PASSIVO:  'passivo'         // pagamento realizado mas gozo NÃO efetivo — saldo pendente
};

// ── FSM: transições permitidas por status ─────────────────────────────────────

var _TRANSICOES_FERIAS = {
  solicitada:       ['aprovada', 'reprovada', 'pendente_ajuste', 'cancelada'],
  pendente_ajuste:  ['solicitada', 'cancelada'],
  aprovada:         ['em_gozo', 'concluida', 'cancelada'],
  em_gozo:          ['concluida'],
  reprovada:        [],
  concluida:        [],
  cancelada:        []
};

// ── Motor ─────────────────────────────────────────────────────────────────────

var FeriasEngine = (function () {

  // ── Auditoria interna ───────────────────────────────────────────────────────

  function _audit(evento, dados) {
    try {
      if (typeof AuditoriaService !== 'undefined')
        AuditoriaService.registrar(evento, 'rh_ferias', dados || {});
    } catch (_) {}
  }

  // ── Validação de transição FSM ──────────────────────────────────────────────

  function _assertTransicao(statusAtual, novoStatus) {
    var permitidos = _TRANSICOES_FERIAS[statusAtual] || [];
    if (permitidos.indexOf(novoStatus) < 0)
      throw new Error('Transição inválida: ' + statusAtual + ' → ' + novoStatus);
  }

  // ── Registro de histórico interno na própria entidade férias ───────────────

  function _registrarHistoricoInterno(ferias, acao, operador, obs) {
    if (!ferias.historico) ferias.historico = [];
    ferias.historico.push({
      acao:       acao,
      operador:   operador || '',
      timestamp:  new Date().toISOString(),
      obs:        obs || '',
      statusAntes: ferias.status
    });
  }

  // ── Cálculo de período aquisitivo ───────────────────────────────────────────
  // Retorna o N-ésimo período aquisitivo do colaborador (base = dataAdmissao).
  // periodN = 0 (primeiro), 1 (segundo), etc.

  function calcularPeriodoAquisitivo(dataAdmissao, periodN) {
    if (!dataAdmissao) throw new Error('dataAdmissao é obrigatória para calcular período aquisitivo.');
    var n = periodN || 0;
    var base = new Date(dataAdmissao);
    var inicio = new Date(base);
    inicio.setFullYear(inicio.getFullYear() + n);
    var fim = new Date(inicio);
    fim.setFullYear(fim.getFullYear() + 1);
    fim.setDate(fim.getDate() - 1);
    return {
      periodo: n + 1,
      inicio:  _fmtData(inicio),
      fim:     _fmtData(fim)
    };
  }

  // Período concessivo: 12 meses após o fim do período aquisitivo

  function calcularPeriodoConcessivo(periodoAquisitivo) {
    if (!periodoAquisitivo || !periodoAquisitivo.fim)
      throw new Error('Período aquisitivo inválido.');
    var inicio = new Date(periodoAquisitivo.fim);
    inicio.setDate(inicio.getDate() + 1);
    var fim = new Date(inicio);
    fim.setFullYear(fim.getFullYear() + 1);
    fim.setDate(fim.getDate() - 1);
    return { inicio: _fmtData(inicio), fim: _fmtData(fim) };
  }

  // ── Cálculo de saldo ────────────────────────────────────────────────────────
  // Retorna { saldoAcumulado, diasGozados, saldoDisponivel, emRisco, vencido, diasParaVencimento }

  function calcularSaldo(idColaborador, dataAdmissao) {
    var todas = RHRepository.listarFerias(idColaborador) || [];
    var hoje  = new Date();
    var admDate = new Date(dataAdmissao + 'T12:00:00');

    // Mapear dias gozados por período aquisitivo (índice 0-based)
    var gozadosPorPeriodo = {};
    todas.forEach(function (f) {
      if ((f.status === STATUS_FERIAS.CONCLUIDA || f.status === STATUS_FERIAS.EM_GOZO) && f.diasGozados > 0) {
        var idx = f._periodoIdx || 0;
        gozadosPorPeriodo[idx] = (gozadosPorPeriodo[idx] || 0) + f.diasGozados;
      }
    });

    // Calcular períodos completos decorridos (anos reais de serviço, não diferença de ano calendário)
    var mesesDecorridos = (hoje.getFullYear() - admDate.getFullYear()) * 12
                        + (hoje.getMonth() - admDate.getMonth());
    if (hoje.getDate() < admDate.getDate()) mesesDecorridos -= 1;
    var periodosDecorridos = Math.max(0, Math.floor(mesesDecorridos / 12));
    var periodos = [];
    var totalSaldo = 0;

    for (var i = 0; i <= periodosDecorridos; i++) {
      var pa  = calcularPeriodoAquisitivo(dataAdmissao, i);
      var pc  = calcularPeriodoConcessivo(pa);
      var gozados = gozadosPorPeriodo[i] || 0;
      var saldo   = Math.max(0, 30 - gozados);
      var fimConc = new Date(pc.fim);
      var diasParaVenc = Math.floor((fimConc - hoje) / 86400000);
      var vencido = diasParaVenc < 0;
      var emRisco = !vencido && diasParaVenc <= 90;

      if (saldo > 0) totalSaldo += saldo;

      periodos.push({
        periodoIdx:             i,
        periodoAquisitivo:      pa,
        periodoConcessivo:      pc,
        diasDireito:            30,
        diasGozados:            gozados,
        saldo:                  saldo,
        diasParaVencimento:     diasParaVenc,
        vencido:                vencido,
        emRisco:                emRisco
      });
    }

    // Alertas pendentes por ACORDO_PASSIVO
    var acordosPendentes = todas.filter(function (f) {
      return f.tipo === TIPO_FERIAS.ACORDO_PASSIVO && (f.saldoDias || 0) > 0;
    });

    return {
      idColaborador:    idColaborador,
      totalSaldo:       totalSaldo,
      periodos:         periodos,
      acordosPendentes: acordosPendentes
    };
  }

  // ── CRUD de férias ─────────────────────────────────────────────────────────

  function listarFerias(idColaborador, emailSolicitante, nivelAcesso) {
    var todas = RHRepository.listarFerias(idColaborador) || [];
    // Filtro de visibilidade: RH/admin/superadmin veem tudo; outros só as próprias
    if (nivelAcesso !== 'superadmin' && nivelAcesso !== 'admin' && nivelAcesso !== 'rh') {
      todas = todas.filter(function (f) {
        return f.idColaborador === idColaborador
          || f.solicitadoPor === emailSolicitante
          || f.gestorEmail === emailSolicitante;
      });
    }
    return todas;
  }

  function solicitar(dados, email) {
    if (!dados.idColaborador) throw new Error('idColaborador é obrigatório.');
    if (!dados.periodoProposto || !dados.periodoProposto.inicio || !dados.periodoProposto.fim)
      throw new Error('Período proposto é obrigatório.');

    var dias = _calcularDias(dados.periodoProposto.inicio, dados.periodoProposto.fim);
    if (dias <= 0) throw new Error('Período de férias inválido.');
    if (dias > 30) throw new Error('Período máximo de férias é 30 dias.');

    var ferias = {
      tipo:            dados.tipo || TIPO_FERIAS.OFICIAL,
      status:          STATUS_FERIAS.SOLICITADA,
      idColaborador:   dados.idColaborador,
      _periodoIdx:     dados._periodoIdx || 0,
      periodoAquisitivo: dados.periodoAquisitivo || null,
      periodoConcessivo: dados.periodoConcessivo || null,
      periodoProposto: dados.periodoProposto,
      periodoAprovado: null,
      diasSolicitados: dias,
      diasAprovados:   0,
      diasGozados:     0,
      saldoDias:       0,
      pagamentoRealizado: dados.pagamentoRealizado || false,
      dataRetornoPrevista: dados.dataRetornoPrevista || null,
      solicitadoPor:   email || '',
      gestorEmail:     dados.gestorEmail || '',
      aprovadoPor:     null,
      observacaoRH:    dados.observacaoRH || '',
      observacaoGestor: dados.observacaoGestor || '',
      historico:       [],
      alertas:         [],
      criadoEm:        new Date().toISOString(),
      atualizadoEm:    new Date().toISOString()
    };

    _registrarHistoricoInterno(ferias, 'SOLICITADA', email, dados.observacaoGestor || '');

    var r = RHRepository.salvarFerias(ferias);
    _audit('RH_FERIAS_SOLICITADA', {
      id: r.id, colaborador: dados.idColaborador,
      periodo: dados.periodoProposto, operador: email
    });
    return r.id;
  }

  function aprovar(id, dadosAprovacao, email) {
    var ferias = _obterOuErro(id);
    _assertTransicao(ferias.status, STATUS_FERIAS.APROVADA);

    var periodoAprovado = dadosAprovacao.periodoAprovado || ferias.periodoProposto;
    var diasAprovados   = _calcularDias(periodoAprovado.inicio, periodoAprovado.fim);

    ferias.status         = STATUS_FERIAS.APROVADA;
    ferias.periodoAprovado = periodoAprovado;
    ferias.diasAprovados  = diasAprovados;
    ferias.aprovadoPor    = email || '';
    ferias.observacaoRH   = dadosAprovacao.observacaoRH || ferias.observacaoRH;
    ferias.atualizadoEm   = new Date().toISOString();

    _registrarHistoricoInterno(ferias, 'APROVADA', email, dadosAprovacao.observacaoRH || '');
    RHRepository.salvarFerias(ferias);
    _audit('RH_FERIAS_APROVADA', { id: id, diasAprovados: diasAprovados, operador: email });
    return { ok: true, diasAprovados: diasAprovados };
  }

  function reprovar(id, motivo, email) {
    var ferias = _obterOuErro(id);
    _assertTransicao(ferias.status, STATUS_FERIAS.REPROVADA);

    ferias.status       = STATUS_FERIAS.REPROVADA;
    ferias.aprovadoPor  = email || '';
    ferias.observacaoRH = motivo || '';
    ferias.atualizadoEm = new Date().toISOString();

    _registrarHistoricoInterno(ferias, 'REPROVADA', email, motivo || '');
    RHRepository.salvarFerias(ferias);
    _audit('RH_FERIAS_REPROVADA', { id: id, motivo: motivo, operador: email });
  }

  function solicitarAjuste(id, observacao, email) {
    var ferias = _obterOuErro(id);
    _assertTransicao(ferias.status, STATUS_FERIAS.PENDENTE_AJUSTE);

    ferias.status       = STATUS_FERIAS.PENDENTE_AJUSTE;
    ferias.observacaoRH = observacao || '';
    ferias.atualizadoEm = new Date().toISOString();

    _registrarHistoricoInterno(ferias, 'AJUSTE_SOLICITADO', email, observacao || '');
    RHRepository.salvarFerias(ferias);
    _audit('RH_FERIAS_AJUSTE_SOLICITADO', { id: id, operador: email });
  }

  function reenviarAposAjuste(id, novasDatas, email) {
    var ferias = _obterOuErro(id);
    _assertTransicao(ferias.status, STATUS_FERIAS.SOLICITADA);

    var dias = _calcularDias(novasDatas.inicio, novasDatas.fim);
    ferias.status           = STATUS_FERIAS.SOLICITADA;
    ferias.periodoProposto  = novasDatas;
    ferias.diasSolicitados  = dias;
    ferias.atualizadoEm     = new Date().toISOString();

    _registrarHistoricoInterno(ferias, 'REENVIADA_APOS_AJUSTE', email, '');
    RHRepository.salvarFerias(ferias);
    _audit('RH_FERIAS_REENVIADA', { id: id, novasDatas: novasDatas, operador: email });
  }

  function iniciarGozo(id, email) {
    var ferias = _obterOuErro(id);
    _assertTransicao(ferias.status, STATUS_FERIAS.EM_GOZO);

    ferias.status       = STATUS_FERIAS.EM_GOZO;
    ferias.inicioGozo   = new Date().toISOString();
    ferias.atualizadoEm = new Date().toISOString();

    _registrarHistoricoInterno(ferias, 'GOZO_INICIADO', email, '');
    RHRepository.salvarFerias(ferias);
    _audit('RH_FERIAS_EM_GOZO', { id: id, operador: email });
  }

  function concluir(id, dadosConclusao, email) {
    var ferias = _obterOuErro(id);
    _assertTransicao(ferias.status, STATUS_FERIAS.CONCLUIDA);

    var diasGozados  = dadosConclusao.diasGozados || ferias.diasAprovados || 0;
    var saldoDias    = Math.max(0, ferias.diasAprovados - diasGozados);
    var passivo      = saldoDias > 0 ? TIPO_FERIAS.ACORDO_PASSIVO : ferias.tipo;

    ferias.status       = STATUS_FERIAS.CONCLUIDA;
    ferias.diasGozados  = diasGozados;
    ferias.saldoDias    = saldoDias;
    ferias.dataRetornoReal = dadosConclusao.dataRetornoReal || null;
    ferias.tipo         = passivo;     // atualiza para PASSIVO se houver saldo residual
    ferias.pagamentoRealizado = true;
    ferias.atualizadoEm = new Date().toISOString();

    if (saldoDias > 0) {
      ferias.alertas = ferias.alertas || [];
      ferias.alertas.push({
        tipo: 'SALDO_PASSIVO',
        saldoDias: saldoDias,
        criadoEm: new Date().toISOString(),
        resolvido: false
      });
    }

    _registrarHistoricoInterno(ferias, 'CONCLUIDA', email,
      'Dias gozados: ' + diasGozados + '. Saldo: ' + saldoDias);
    RHRepository.salvarFerias(ferias);
    _audit('RH_FERIAS_CONCLUIDA', {
      id: id, diasGozados: diasGozados, saldoDias: saldoDias, operador: email
    });
    return { ok: true, saldoDias: saldoDias };
  }

  function cancelar(id, motivo, email) {
    var ferias = _obterOuErro(id);
    _assertTransicao(ferias.status, STATUS_FERIAS.CANCELADA);

    ferias.status       = STATUS_FERIAS.CANCELADA;
    ferias.observacaoRH = motivo || '';
    ferias.atualizadoEm = new Date().toISOString();

    _registrarHistoricoInterno(ferias, 'CANCELADA', email, motivo || '');
    RHRepository.salvarFerias(ferias);
    _audit('RH_FERIAS_CANCELADA', { id: id, motivo: motivo, operador: email });
  }

  // ── Alertas automáticos ────────────────────────────────────────────────────
  // Chamado por trigger diário (ou via controller de manutenção).

  function verificarAlertas() {
    var funcionarios = readJSON('funcionarios.json') || [];
    var alertas = [];

    funcionarios.forEach(function (f) {
      if (!f.dataAdmissao || f.status === 'Inativo') return;
      try {
        var saldo = calcularSaldo(f.id, f.dataAdmissao);
        saldo.periodos.forEach(function (p) {
          if ((p.vencido || p.emRisco) && p.saldo > 0) {
            alertas.push({
              idColaborador: f.id,
              nomeColaborador: f.nome || '',
              tipo:  p.vencido ? 'PERIODO_VENCIDO' : 'PERIODO_EM_RISCO',
              periodoConcessivo: p.periodoConcessivo,
              saldo: p.saldo,
              diasParaVencimento: p.diasParaVencimento,
              geradoEm: new Date().toISOString()
            });
          }
        });
        saldo.acordosPendentes.forEach(function (acordo) {
          alertas.push({
            idColaborador: f.id,
            nomeColaborador: f.nome || '',
            tipo: 'ACORDO_PASSIVO_PENDENTE',
            idFerias: acordo.id,
            saldoDias: acordo.saldoDias,
            geradoEm: new Date().toISOString()
          });
        });
      } catch (_) {}
    });

    writeJSON('rh_alertas_ferias.json', alertas);
    _audit('RH_ALERTAS_FERIAS_VERIFICADOS', { total: alertas.length });
    return alertas;
  }

  function listarAlertas() {
    return readJSON('rh_alertas_ferias.json') || [];
  }

  // ── Helpers privados ───────────────────────────────────────────────────────

  function _obterOuErro(id) {
    var lista = RHRepository.listarFerias(null);
    var ferias = null;
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].id === id) { ferias = lista[i]; break; }
    }
    if (!ferias) throw new Error('Férias não encontradas: ' + id);
    return ferias;
  }

  function _calcularDias(dataInicio, dataFim) {
    var a = new Date(dataInicio);
    var b = new Date(dataFim);
    return Math.round((b - a) / 86400000) + 1;
  }

  function _fmtData(d) {
    return d.getFullYear() + '-'
      + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
  }

  // ── API pública ───────────────────────────────────────────────────────────

  return {
    listarFerias:          listarFerias,
    solicitar:             solicitar,
    aprovar:               aprovar,
    reprovar:              reprovar,
    solicitarAjuste:       solicitarAjuste,
    reenviarAposAjuste:    reenviarAposAjuste,
    iniciarGozo:           iniciarGozo,
    concluir:              concluir,
    cancelar:              cancelar,
    calcularSaldo:         calcularSaldo,
    calcularPeriodoAquisitivo: calcularPeriodoAquisitivo,
    calcularPeriodoConcessivo: calcularPeriodoConcessivo,
    verificarAlertas:      verificarAlertas,
    listarAlertas:         listarAlertas,
    STATUS_FERIAS:         STATUS_FERIAS,
    TIPO_FERIAS:           TIPO_FERIAS
  };

})();
