/**
 * @file core/services/auditoria_service.gs
 * @layer core/services
 * @description Façade oficial de auditoria do sistema.
 *
 * Combina três canais de persistência:
 *   1. AuditoriaStore  (auditoria_store.gs)   — JSON estruturado no Drive (PRINCIPAL)
 *   2. Logger          (logger.gs)             — Stackdriver + aba Logs (WARN/ERROR)
 *   3. SystemEvents    (event_bus_backend.gs)  — rastreabilidade assíncrona
 *
 * A integração com AuditoriaStore resolve o problema histórico: Logger.info() NÃO
 * persiste na planilha — eventos críticos como ROLE_UPDATED se perdiam no console.
 * Agora todo evento registrado aqui é persistido em auditoria_operacional.json.
 *
 * USO GERAL:
 *   AuditoriaService.registrar(SystemEventTypes.RESERVATION_CREATED, 'reservas', { id, email });
 *   AuditoriaService.warn(SystemEventTypes.CONFLICT_ATTEMPT, 'reservas', 'Conflito', dados);
 *   AuditoriaService.erro(SystemEventTypes.AUTH_FAILED, 'auth', 'Falha de auth', dados);
 *
 * USO ESPECIALIZADO:
 *   AuditoriaService.registrarFsmViolacao('reservas', 'PENDENTE', 'ENCERRADO', 'user@');
 *   AuditoriaService.registrarFalhaAuth('user@', 'senha_invalida', 'auth_session');
 *   AuditoriaService.registrarMutacaoCritica('chaves', 'PROT-001', 'cancelar', 'user@', ctx);
 *
 * @depends Logger (logger.gs), SystemEvents (event_bus_backend.gs),
 *          registrarLog (utils.gs), SystemEventTypes (events_constants.gs),
 *          AuditoriaStore (auditoria_store.gs)
 */

var AuditoriaService = (function () {

  // ─────────────────────────────────────────────────────────────
  // Helpers internos
  // ─────────────────────────────────────────────────────────────

  function _emitirEvento(tipo, modulo, dados) {
    try {
      if (typeof SystemEvents !== 'undefined' && typeof SystemEvents.emit === 'function') {
        SystemEvents.emit(tipo, dados);
      }
    } catch (e) {
      console.warn('[AuditoriaService] emit falhou: ' + tipo + ': ' + e.message);
    }
  }

  /**
   * Persiste no AuditoriaStore (falha silenciosa — nunca interrompe o fluxo).
   * Extrai campos padronizados a partir dos dados brutos enviados pelos módulos.
   */
  function _persistir(tipo, modulo, dados, resultado) {
    try {
      if (typeof AuditoriaStore === 'undefined') return;
      AuditoriaStore.registrar({
        tipo:         tipo,
        modulo:       modulo,
        acao:         (dados && (dados.operacao || dados.acao || dados.action)) || '',
        entidadeId:   (dados && (dados.entidadeId || dados.id || dados.reservaId || dados.contratoId)) || '',
        entidadeTipo: (dados && (dados.entidade   || dados.entidadeTipo || dados.tipo)) || '',
        usuario:      (dados && (dados.usuario    || dados.email || dados.ator)) || '',
        resultado:    resultado || 'sucesso',
        mensagem:     (dados && (dados.msg || dados.mensagem)) || tipo,
        contexto:     dados || null
      });
    } catch (e) {
      console.warn('[AuditoriaService._persistir] ' + e.message);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // API pública — métodos gerais
  // ─────────────────────────────────────────────────────────────

  /**
   * Registra evento informacional com auditoria completa (Logger + SystemEvents + AuditoriaStore).
   * @param {string} tipoEvento — constante SystemEventTypes
   * @param {string} modulo     — módulo de origem
   * @param {Object} dados      — payload do evento
   */
  function registrar(tipoEvento, modulo, dados) {
    try { Logger.info(modulo, tipoEvento, dados); } catch (e) {}
    _emitirEvento(tipoEvento, modulo, dados);
    _persistir(tipoEvento, modulo, dados, 'sucesso');
  }

  /**
   * Registra aviso de auditoria.
   * @param {string} tipoEvento
   * @param {string} modulo
   * @param {string} mensagem
   * @param {Object} dados
   */
  function warn(tipoEvento, modulo, mensagem, dados) {
    try { Logger.warn(modulo, mensagem, dados); } catch (e) {}
    var payload = typeof Object.assign === 'function'
      ? Object.assign({ msg: mensagem }, dados || {})
      : (dados || { msg: mensagem });
    _emitirEvento(tipoEvento, modulo, payload);
    _persistir(tipoEvento, modulo, payload, 'aviso');
  }

  /**
   * Registra erro de auditoria.
   * @param {string} tipoEvento
   * @param {string} modulo
   * @param {string} mensagem
   * @param {Object} dados
   */
  function erro(tipoEvento, modulo, mensagem, dados) {
    try { Logger.error(modulo, mensagem, dados); } catch (e) {}
    var payload = typeof Object.assign === 'function'
      ? Object.assign({ msg: mensagem }, dados || {})
      : (dados || { msg: mensagem });
    _emitirEvento(tipoEvento, modulo, payload);
    _persistir(tipoEvento, modulo, payload, 'falha');
  }

  /**
   * Registra acesso de usuário (Login, Logout, SessionStart).
   * @param {string} email
   * @param {string} acao  — ex: 'login', 'logout', 'session_start'
   * @param {string} modulo
   */
  function registrarAcesso(email, acao, modulo) {
    try {
      Logger.info(modulo || 'auth', acao, { email: email });
      if (typeof registrarLog === 'function') {
        registrarLog(email, modulo || 'auth', acao);
      }
    } catch (e) {
      console.warn('[AuditoriaService.registrarAcesso] ' + e.message);
    }
    _persistir(
      acao === 'login' ? 'SESSION_STARTED' : (acao || 'AUTH_EVENT'),
      modulo || 'auth',
      { email: email, acao: acao },
      'sucesso'
    );
  }

  // ─────────────────────────────────────────────────────────────
  // API pública — métodos especializados (observabilidade)
  // ─────────────────────────────────────────────────────────────

  /**
   * Registra tentativa de transição FSM inválida.
   * @param {string} dominio       — ex: 'reservas', 'chaves'
   * @param {string} estadoAtual   — estado de origem
   * @param {string} estadoTentado — estado de destino rejeitado
   * @param {string} ator          — email do usuário ou 'sistema'
   * @param {string} [entidadeId]  — ID da entidade afetada
   */
  function registrarFsmViolacao(dominio, estadoAtual, estadoTentado, ator, entidadeId) {
    var dados = {
      dominio:       dominio,
      estadoAtual:   estadoAtual,
      estadoTentado: estadoTentado,
      ator:          ator || 'sistema',
      entidadeId:    entidadeId || ''
    };
    try {
      Logger.warn(dominio, 'FSM_INVALID_TRANSITION',
        estadoAtual + ' → ' + estadoTentado + ' rejeitado', dados);
    } catch (e) {}
    _emitirEvento(SystemEventTypes.FSM_INVALID_TRANSITION, dominio, dados);
    try {
      AuditoriaStore.registrar({
        tipo: 'FSM_INVALID_TRANSITION', modulo: dominio,
        acao: 'transicao_invalida', entidadeId: entidadeId || '',
        usuario: ator, resultado: 'falha',
        mensagem: 'FSM: ' + estadoAtual + ' → ' + estadoTentado + ' rejeitado',
        contexto: dados
      });
    } catch (e) {}
  }

  /**
   * Registra falha de autenticação rastreável.
   * @param {string} email  — e-mail que tentou autenticar
   * @param {string} motivo — ex: 'senha_invalida', 'sessao_expirada'
   * @param {string} origem — módulo/função onde ocorreu
   */
  function registrarFalhaAuth(email, motivo, origem) {
    var dados = { email: email, motivo: motivo, origem: origem };
    try { Logger.warn('auth', 'AUTH_FAILURE', email + ' | ' + motivo, dados); } catch (e) {}
    _emitirEvento(SystemEventTypes.AUTH_FAILURE_TRACKED, 'auth', dados);
    try {
      AuditoriaStore.registrar({
        tipo: 'AUTH_FAILURE_TRACKED', modulo: 'auth',
        acao: 'autenticacao_falhou', usuario: email,
        resultado: 'falha',
        mensagem: 'Falha de autenticação: ' + motivo + ' (via ' + origem + ')',
        contexto: dados
      });
    } catch (e) {}
  }

  /**
   * Registra mutação crítica de domínio para observabilidade e auditoria forte.
   * Deve ser chamado em qualquer operação que altere status, arquive ou exclua entidades.
   * @param {string}  dominio    — ex: 'reservas', 'contratos', 'chaves'
   * @param {string}  entidadeId — ID da entidade mutada
   * @param {string}  operacao   — ex: 'cancelar', 'aprovar', 'arquivar', 'excluir'
   * @param {string}  ator       — email do responsável
   * @param {Object}  [contexto] — dados extras opcionais (antes/depois)
   */
  function registrarMutacaoCritica(dominio, entidadeId, operacao, ator, contexto) {
    var dados = typeof Object.assign === 'function'
      ? Object.assign({ dominio: dominio, entidadeId: entidadeId, operacao: operacao, ator: ator }, contexto || {})
      : { dominio: dominio, entidadeId: entidadeId, operacao: operacao, ator: ator };
    try {
      Logger.warn(dominio, 'MUTATION_CRITICAL',
        operacao + ' em ' + entidadeId + ' por ' + ator, dados);
    } catch (e) {}
    _emitirEvento(SystemEventTypes.MUTATION_CRITICAL, dominio, dados);
    try {
      AuditoriaStore.registrar({
        tipo: 'MUTATION_CRITICAL', modulo: dominio,
        acao: operacao, entidadeId: entidadeId,
        entidadeTipo: dominio, usuario: ator,
        resultado: 'sucesso',
        mensagem: operacao + ' em ' + entidadeId + ' por ' + ator,
        antes:  contexto && contexto.antes  || null,
        depois: contexto && contexto.depois || null,
        contexto: dados
      });
    } catch (e) {}
  }

  /**
   * Registra evento de governança arquitetural (para uso interno do sistema).
   * @param {string} tipo      — SystemEventTypes.GOVERNANCE_VIOLATION ou similar
   * @param {string} descricao — descrição da violação detectada
   * @param {Object} [dados]   — contexto adicional
   */
  function registrarViolacaoArquitetural(tipo, descricao, dados) {
    try { Logger.error('governance', tipo, descricao, dados); } catch (e) {}
    _emitirEvento(
      tipo || SystemEventTypes.GOVERNANCE_VIOLATION,
      'governance',
      typeof Object.assign === 'function' ? Object.assign({ descricao: descricao }, dados || {}) : dados
    );
    try {
      AuditoriaStore.registrar({
        tipo: tipo || 'GOVERNANCE_VIOLATION', modulo: 'governance',
        acao: 'violacao_detectada', resultado: 'falha',
        mensagem: descricao,
        contexto: dados || null
      });
    } catch (e) {}
  }

  return {
    registrar:                    registrar,
    warn:                         warn,
    erro:                         erro,
    registrarAcesso:              registrarAcesso,
    registrarFsmViolacao:         registrarFsmViolacao,
    registrarFalhaAuth:           registrarFalhaAuth,
    registrarMutacaoCritica:      registrarMutacaoCritica,
    registrarViolacaoArquitetural: registrarViolacaoArquitetural
  };

})();
