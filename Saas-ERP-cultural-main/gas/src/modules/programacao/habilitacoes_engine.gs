/**
 * @file modules/programacao/habilitacoes_engine.gs
 * @layer modules/programacao
 * @description Motor oficial do domínio Habilitações.
 *
 * Centraliza toda lógica de negócio do credenciamento de proponentes:
 *   - STATUS_HABILITACAO — enum canônico de estados
 *   - FSM oficial de transições
 *   - Orquestração: submissão, análise, aprovação, rejeição, suspensão,
 *     reabilitação, cancelamento
 *   - Persistência via HabilitacoesRepository
 *   - Emissão de eventos via SystemEvents
 *   - Auditoria via AuditoriaService
 *
 * REGRA ARQUITETURAL:
 *   - Toda transição de status DEVE passar por HabilitacoesEngine.aplicarTransicao()
 *   - Nenhum módulo externo chama HabilitacoesRepository diretamente
 *   - Toda transição emite evento e registra auditoria
 *
 * @depends modules/programacao/habilitacoes_repository.gs (HabilitacoesRepository),
 *          core/event_bus_backend.gs (SystemEvents),
 *          core/events_constants.gs (SystemEventTypes),
 *          core/services/auditoria_service.gs (AuditoriaService),
 *          core/utils.gs (obterLockComRetry, registrarLog)
 */

// ══════════════════════════════════════════════════════════════
// STATUS CANÔNICO DE HABILITAÇÃO
// Única fonte de verdade para estados de habilitação no sistema.
// Valores mantidos em lowercase para compatibilidade com dados existentes.
// ══════════════════════════════════════════════════════════════

var STATUS_HABILITACAO = Object.freeze({
  PENDENTE:   'pendente',
  EM_ANALISE: 'em_analise',
  HABILITADO: 'habilitado',
  REJEITADO:  'rejeitado',
  SUSPENSO:   'suspenso',
  CANCELADO:  'cancelado'
});

// FSM oficial — transições permitidas por status atual
var _TRANSICOES_HABILITACAO = Object.freeze({
  'pendente':   ['em_analise', 'rejeitado', 'cancelado'],
  'em_analise': ['habilitado', 'rejeitado', 'cancelado'],
  'habilitado': ['suspenso',   'cancelado'],
  'suspenso':   ['habilitado', 'rejeitado', 'cancelado'],
  'rejeitado':  ['pendente'],   // reabertura possível
  'cancelado':  []              // terminal
});

// Mapa status → evento SystemEventTypes
var _HAB_STATUS_EVENTO = {
  'em_analise': 'QUALIFICATION_ANALYSIS_STARTED',
  'habilitado': 'QUALIFICATION_APPROVED',
  'rejeitado':  'QUALIFICATION_REJECTED',
  'suspenso':   'QUALIFICATION_SUSPENDED',
  'cancelado':  'QUALIFICATION_CANCELLED',
  'pendente':   'QUALIFICATION_SUBMITTED'
};

// ══════════════════════════════════════════════════════════════
// HabilitacoesEngine
// ══════════════════════════════════════════════════════════════

var HabilitacoesEngine = (function () {

  // ── Helpers internos ────────────────────────────────────────

  function _assertTransicaoValida(statusAtual, novoStatus) {
    var permitidos = _TRANSICOES_HABILITACAO[statusAtual] || [];
    if (permitidos.indexOf(novoStatus) === -1) {
      throw new Error(
        'Transição inválida: "' + statusAtual + '" → "' + novoStatus + '". ' +
        'Permitidas: [' + permitidos.join(', ') + ']'
      );
    }
  }

  function _emitirEvento(novoStatus, id, email, contexto) {
    try {
      var tipo = SystemEventTypes[_HAB_STATUS_EVENTO[novoStatus]];
      if (!tipo) return;
      SystemEvents.emit(tipo, {
        entidade:   'habilitacao',
        entidadeId: id,
        usuario:    email,
        origem:     'habilitacoes_engine',
        contexto:   contexto || {}
      });
    } catch(e) {
      console.warn('[HabilitacoesEngine] emit falhou:', e.message);
    }
  }

  function _registrarAuditoria(acao, id, email, contexto) {
    try {
      if (typeof AuditoriaService !== 'undefined' && AuditoriaService.registrar) {
        AuditoriaService.registrar({ acao: acao, entidade: 'habilitacao', entidadeId: id, usuario: email, detalhes: contexto });
      } else {
        registrarLog('HABILITACAO_' + acao.toUpperCase(), email, id, contexto);
      }
    } catch(e) {
      console.warn('[HabilitacoesEngine] auditoria falhou:', e.message);
    }
  }

  // ── API principal ────────────────────────────────────────────

  /**
   * Transição genérica de status — FSM + persistência + evento + auditoria.
   * Ponto único de mutação de status no domínio.
   */
  function aplicarTransicao(id, novoStatus, email, observacao) {
    var hab = HabilitacoesRepository.obterPorId(id);
    if (!hab) throw new Error('Habilitação não encontrada: ' + id);

    _assertTransicaoValida(hab.status, novoStatus);

    HabilitacoesRepository.atualizarStatus(id, novoStatus, email, observacao || '');

    var ctx = { de: hab.status, para: novoStatus, observacao: observacao || '' };
    _emitirEvento(novoStatus, id, email, ctx);
    _registrarAuditoria(novoStatus, id, email, ctx);

    return { id: id, statusAnterior: hab.status, statusNovo: novoStatus };
  }

  /**
   * Submete nova habilitação — persiste + emite QUALIFICATION_SUBMITTED.
   */
  function submeter(dados, email) {
    var lock = obterLockComRetry();
    if (!lock) throw new Error('Sistema ocupado. Tente novamente.');
    try {
      var id = HabilitacoesRepository.criar(dados, email);
      _emitirEvento('pendente', id, email, { nome: dados.proponente_nome });
      _registrarAuditoria('submetida', id, email, { nome: dados.proponente_nome });
      return id;
    } finally {
      lock.releaseLock();
    }
  }

  /**
   * Atualiza dados cadastrais de uma habilitação (sem mudar status).
   */
  function atualizarDados(id, campos, email) {
    var lock = obterLockComRetry();
    if (!lock) throw new Error('Sistema ocupado. Tente novamente.');
    try {
      HabilitacoesRepository.atualizar(id, campos);
      _emitirEvento('pendente', id, email, { campos: Object.keys(campos) });
      _registrarAuditoria('atualizada', id, email, { campos: Object.keys(campos) });

      try {
        var tipo = SystemEventTypes.QUALIFICATION_UPDATED;
        if (tipo) SystemEvents.emit(tipo, { entidade: 'habilitacao', entidadeId: id, usuario: email });
      } catch(e) {}
    } finally {
      lock.releaseLock();
    }
  }

  // ── Ações semânticas (conveniences sobre aplicarTransicao) ───

  function iniciarAnalise(id, email, obs) {
    var lock = obterLockComRetry();
    if (!lock) throw new Error('Sistema ocupado. Tente novamente.');
    try { return aplicarTransicao(id, STATUS_HABILITACAO.EM_ANALISE, email, obs); }
    finally { lock.releaseLock(); }
  }

  function habilitar(id, email, obs) {
    var lock = obterLockComRetry();
    if (!lock) throw new Error('Sistema ocupado. Tente novamente.');
    try { return aplicarTransicao(id, STATUS_HABILITACAO.HABILITADO, email, obs); }
    finally { lock.releaseLock(); }
  }

  function rejeitar(id, email, obs) {
    var lock = obterLockComRetry();
    if (!lock) throw new Error('Sistema ocupado. Tente novamente.');
    try { return aplicarTransicao(id, STATUS_HABILITACAO.REJEITADO, email, obs); }
    finally { lock.releaseLock(); }
  }

  function suspender(id, email, obs) {
    var lock = obterLockComRetry();
    if (!lock) throw new Error('Sistema ocupado. Tente novamente.');
    try { return aplicarTransicao(id, STATUS_HABILITACAO.SUSPENSO, email, obs); }
    finally { lock.releaseLock(); }
  }

  function reabilitar(id, email, obs) {
    var lock = obterLockComRetry();
    if (!lock) throw new Error('Sistema ocupado. Tente novamente.');
    try { return aplicarTransicao(id, STATUS_HABILITACAO.HABILITADO, email, obs); }
    finally { lock.releaseLock(); }
  }

  function cancelar(id, email, obs) {
    var lock = obterLockComRetry();
    if (!lock) throw new Error('Sistema ocupado. Tente novamente.');
    try { return aplicarTransicao(id, STATUS_HABILITACAO.CANCELADO, email, obs); }
    finally { lock.releaseLock(); }
  }

  // ── Métricas ─────────────────────────────────────────────────

  function calcularMetricas(dados) {
    var m = { total: 0, pendente: 0, em_analise: 0, habilitado: 0, rejeitado: 0, suspenso: 0, cancelado: 0, taxa_aprovacao: 0 };
    m.total = dados.length;
    dados.forEach(function(d) { if (m[d.status] !== undefined) m[d.status]++; });
    var analisados = m.habilitado + m.rejeitado;
    m.taxa_aprovacao = analisados > 0 ? Math.round((m.habilitado / analisados) * 100) : 0;
    return m;
  }

  return {
    aplicarTransicao: aplicarTransicao,
    submeter:         submeter,
    atualizarDados:   atualizarDados,
    iniciarAnalise:   iniciarAnalise,
    habilitar:        habilitar,
    rejeitar:         rejeitar,
    suspender:        suspender,
    reabilitar:       reabilitar,
    cancelar:         cancelar,
    calcularMetricas: calcularMetricas
  };

})();

try { FsmGuardian.registrar('habilitacoes', _TRANSICOES_HABILITACAO); } catch(e) {
  console.warn('[habilitacoes_engine] FsmGuardian.registrar: ' + e.message);
}
