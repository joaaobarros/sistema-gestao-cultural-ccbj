/**
 * @file modules/contratos/contratos_engine.gs
 * @layer modules/contratos
 * @description Motor oficial do domínio Contratos.
 *
 * Centraliza regras de negócio de contratos institucionais:
 *   - STATUS_CONTRATO — enum canônico de estados
 *   - FSM oficial de transições de status
 *   - Orquestração de mudança de status com evento + auditoria
 *
 * NOTA: CRUD de contratos, metas, rubricas e indicadores em ContratoRepository
 * (modules/contratos/contrato_repository.gs) — migração concluída na Fase 5.
 * Este engine governa transições de status e emite eventos de domínio.
 *
 * @depends core/event_bus_backend.gs (SystemEvents),
 *          core/events_constants.gs (SystemEventTypes),
 *          core/services/auditoria_service.gs (AuditoriaService),
 *          modules/contratos/contrato_repository.gs (ContratoRepository)
 */

// ══════════════════════════════════════════════════════════════
// STATUS CANÔNICO DE CONTRATO
// Única fonte de verdade — valores alinhados com os dados existentes.
// ══════════════════════════════════════════════════════════════

var STATUS_CONTRATO = Object.freeze({
  ATIVO:     'Ativo',
  ENCERRADO: 'Encerrado',
  SUSPENSO:  'Suspenso'
});

// FSM oficial de contratos
var _TRANSICOES_CONTRATO = Object.freeze({
  'Ativo':     ['Suspenso', 'Encerrado'],
  'Suspenso':  ['Ativo', 'Encerrado'],
  'Encerrado': []  // terminal
});

// ══════════════════════════════════════════════════════════════
// ContratosEngine
// ══════════════════════════════════════════════════════════════

var ContratosEngine = (function () {

  function _assertTransicaoValida(statusAtual, novoStatus) {
    var permitidos = _TRANSICOES_CONTRATO[statusAtual] || [];
    if (permitidos.indexOf(novoStatus) === -1) {
      throw new Error(
        'Transição inválida: "' + statusAtual + '" → "' + novoStatus + '". ' +
        'Permitidas: [' + permitidos.join(', ') + ']'
      );
    }
  }

  function _emitirEvento(novoStatus, id, email, contexto) {
    try {
      var tipo = novoStatus === STATUS_CONTRATO.ENCERRADO
        ? SystemEventTypes.CONTRACT_EXPIRED
        : SystemEventTypes.CONTRACT_UPDATED;
      SystemEvents.emit(tipo, {
        entidade: 'contrato', entidadeId: id,
        usuario: email, origem: 'contratos_engine',
        contexto: contexto || {}
      });
    } catch(e) {
      console.warn('[ContratosEngine] emit falhou:', e.message);
    }
  }

  function _registrarAuditoria(acao, id, email, contexto) {
    try {
      if (typeof AuditoriaService !== 'undefined' && AuditoriaService.registrar) {
        AuditoriaService.registrar({ acao: acao, entidade: 'contrato', entidadeId: id, usuario: email, detalhes: contexto });
      } else {
        registrarLog('CONTRATO_' + acao.toUpperCase(), email, id, contexto);
      }
    } catch(e) {
      console.warn('[ContratosEngine] auditoria falhou:', e.message);
    }
  }

  /**
   * Aplica transição de status com FSM + evento + auditoria.
   * @param {string} id — ID do contrato
   * @param {string} novoStatus — um dos STATUS_CONTRATO.*
   * @param {string} email — email do responsável
   */
  function aplicarTransicao(id, novoStatus, email) {
    var contrato = ContratoRepository.buscarPorId(id);
    if (!contrato) throw new Error('Contrato não encontrado: ' + id);

    var statusAtual = contrato.status || STATUS_CONTRATO.ATIVO;
    _assertTransicaoValida(statusAtual, novoStatus);

    ContratoRepository.salvar(Object.assign({}, contrato, { status: novoStatus }), email);

    var ctx = { de: statusAtual, para: novoStatus };
    _emitirEvento(novoStatus, id, email, ctx);
    _registrarAuditoria('STATUS_' + novoStatus.toUpperCase(), id, email, ctx);

    return { id: id, statusAnterior: statusAtual, statusNovo: novoStatus };
  }

  /**
   * Registra criação de contrato com auditoria e evento.
   * Delega o CRUD para ContratoRepository.salvar().
   */
  function registrarCriacao(id, dados, email) {
    try {
      SystemEvents.emit(SystemEventTypes.CONTRACT_CREATED, {
        entidade: 'contrato', entidadeId: id,
        usuario: email, origem: 'contratos_engine',
        contexto: { nome: dados.nome, numero: dados.numero }
      });
      _registrarAuditoria('CRIADO', id, email, { nome: dados.nome, numero: dados.numero });
    } catch(e) {
      console.warn('[ContratosEngine] registrarCriacao falhou:', e.message);
    }
  }

  /**
   * Registra atualização com auditoria e evento.
   */
  function registrarAtualizacao(id, dados, email) {
    try {
      SystemEvents.emit(SystemEventTypes.CONTRACT_UPDATED, {
        entidade: 'contrato', entidadeId: id,
        usuario: email, origem: 'contratos_engine',
        contexto: { campos: Object.keys(dados) }
      });
      _registrarAuditoria('ATUALIZADO', id, email, { campos: Object.keys(dados) });
    } catch(e) {
      console.warn('[ContratosEngine] registrarAtualizacao falhou:', e.message);
    }
  }

  return {
    aplicarTransicao:    aplicarTransicao,
    registrarCriacao:    registrarCriacao,
    registrarAtualizacao:registrarAtualizacao
  };

})();

try { FsmGuardian.registrar('contratos', _TRANSICOES_CONTRATO); } catch(e) {
  console.warn('[contratos_engine] FsmGuardian.registrar: ' + e.message);
}
