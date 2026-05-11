/**
 * @file modules/chaves/chave_engine.gs
 * @layer modules/chaves
 * @description Motor oficial do domínio Chaves — núcleo de regras de negócio.
 *
 * Centraliza toda a lógica de alto nível do domínio Protocolo de Chaves:
 *   - Máquina de estados de protocolos (FSM)
 *   - Verificação de disponibilidade de chaves
 *   - Orquestração de transições (retirada, devolução, transferência)
 *   - Registro automático de histórico imutável
 *   - Auditoria de eventos via AuditoriaService + SystemEvents
 *
 * REGRA ARQUITETURAL:
 *   - Toda transição de status de protocolo DEVE passar por KeyEngine.aplicarTransicao()
 *   - Nenhum módulo externo altera aba ProtocolosChaves diretamente para mudar status
 *   - Toda movimentação emite evento via SystemEvents
 *   - O histórico (HistoricoChaves) é escrito exclusivamente por KeyEngine
 *
 * NOTA: Os enums CHV_STATUS_CHAVE, CHV_STATUS_PROTOCOLO, CHV_COL, PROT_COL e HIST_COL
 *       são definidos em mod_chaves.gs e compartilhados via escopo global GAS.
 *
 * @depends modules/chaves/chaves_repository.gs (ChavesRepository),
 *          mod_chaves.gs (CHV_STATUS_PROTOCOLO, CHV_STATUS_CHAVE, PROT_COL, HIST_COL, CHV_COL),
 *          core/logger.gs, core/event_bus_backend.gs, core/services/auditoria_service.gs,
 *          core/utils.gs (_getSheet, gerarId, obterLockComRetry)
 */

// ══════════════════════════════════════════════════════════════════
// FSM — Transições permitidas entre estados de protocolo
// Cada chave é uma lista de estados-alvo válidos.
// ══════════════════════════════════════════════════════════════════

var _TRANSICOES_CHAVE = {
  'SOLICITADA':                    ['AGUARDANDO_CONFIRMACAO_USUARIO', 'NEGADA', 'CANCELADA'],
  'AGUARDANDO_CONFIRMACAO_USUARIO': ['RETIRADA', 'NEGADA', 'CANCELADA'],
  'AGUARDANDO_CONFIRMACAO_INFRA':   ['DEVOLVIDA', 'CANCELADA'],
  // DEVOLVIDA e TRANSFERIDA diretas: caminhos operacionais (infra, sem etapa intermediária)
  'RETIRADA':                      ['AGUARDANDO_CONFIRMACAO_INFRA', 'TRANSFERENCIA_PENDENTE', 'ATRASADA', 'DEVOLVIDA', 'TRANSFERIDA'],
  'ATRASADA':                      ['AGUARDANDO_CONFIRMACAO_INFRA', 'TRANSFERENCIA_PENDENTE', 'DEVOLVIDA', 'TRANSFERIDA'],
  'TRANSFERENCIA_PENDENTE':        ['TRANSFERIDA', 'RETIRADA'],
  'TRANSFERIDA':                   ['AGUARDANDO_CONFIRMACAO_INFRA', 'ATRASADA', 'DEVOLVIDA', 'TRANSFERIDA'],
  'DEVOLVIDA':                     [],
  'NEGADA':                        [],
  'CANCELADA':                     []
};

// ══════════════════════════════════════════════════════════════════
// KeyEngine — núcleo de orquestração do domínio Chaves
// ══════════════════════════════════════════════════════════════════

var KeyEngine = (function () {

  // ── FSM ──────────────────────────────────────────────────────

  /**
   * Verifica se a transição de status é válida segundo a FSM oficial.
   * @param {string} statusAtual
   * @param {string} novoStatus
   * @returns {boolean}
   */
  function transicaoPermitida(statusAtual, novoStatus) {
    var permitidas = _TRANSICOES_CHAVE[String(statusAtual).toUpperCase()] || [];
    return permitidas.indexOf(String(novoStatus).toUpperCase()) !== -1;
  }

  /**
   * Aplica transição de status do protocolo: valida FSM, persiste e emite evento.
   * Registra histórico imutável e notifica AuditoriaService.
   *
   * @param {string} protocoloId
   * @param {string} statusAtual
   * @param {string} novoStatus
   * @param {string} emailOperador
   * @param {string} [observacao]
   * @param {Object} [camposExtras] - campos adicionais a persistir na linha (ex: dtRetirada, responsavelId)
   * @param {string} [acao] - identificador da ação para o histórico (ex: 'ENTREGA_APROVADA_INFRA')
   * @param {string} [chaveId] - ID da chave associada ao protocolo
   * @throws Error se transição não permitida
   */
  function aplicarTransicao(protocoloId, statusAtual, novoStatus, emailOperador, observacao, camposExtras, acao, chaveId) {
    var atual = String(statusAtual || '').toUpperCase();
    var novo  = String(novoStatus  || '').toUpperCase();

    if (!transicaoPermitida(atual, novo)) {
      throw new Error(
        'Transição de protocolo de "' + atual + '" para "' + novo + '" não é permitida.'
      );
    }

    // Persiste o novo status + campos extras na linha do protocolo
    _atualizarStatusProtocolo(protocoloId, novo, camposExtras);

    // Registra histórico imutável
    var acaoHistorico = acao || (novo === 'DEVOLVIDA' ? 'DEVOLUCAO' : novo);
    _registrarHistorico(protocoloId, chaveId || null, acaoHistorico,
      emailOperador, atual, novo, observacao || '');

    // Emite evento de domínio
    var tipoEvento = _eventoParaStatus(novo);
    try {
      if (typeof SystemEvents !== 'undefined') {
        SystemEvents.emit(tipoEvento, {
          entidade:       'protocolo_chave',
          entidadeId:     protocoloId,
          usuario:        emailOperador,
          origem:         'chave_engine',
          statusAnterior: atual,
          novoStatus:     novo,
          observacao:     observacao || '',
          timestamp:      new Date().toISOString()
        });
      }
    } catch(e) {
      Logger.warn('chave_engine', 'emit falhou: ' + tipoEvento, e.message);
    }

    // Auditoria centralizada
    try {
      if (typeof AuditoriaService !== 'undefined') {
        AuditoriaService.registrar(tipoEvento, 'chaves', {
          protocoloId:    protocoloId,
          statusAnterior: atual,
          novoStatus:     novo,
          operador:       emailOperador,
          observacao:     observacao || ''
        });
      }
    } catch(e) {}
  }

  // ── Disponibilidade ───────────────────────────────────────────

  /**
   * Verifica se uma chave está disponível para retirada.
   * Delega leitura ao ChavesRepository.
   *
   * @param {string} chaveId
   * @returns {{ disponivel: boolean, motivo?: string, protocolo?: Object }}
   */
  function verificarDisponibilidade(chaveId) {
    try {
      var chave = ChavesRepository.obterChavePorId(chaveId);
      if (!chave) return { disponivel: false, motivo: 'Chave não encontrada.' };

      if (chave.status !== CHV_STATUS_CHAVE.DISPONIVEL) {
        return { disponivel: false, motivo: 'Chave com status: ' + chave.status };
      }

      var protocoloAtivo = ChavesRepository.buscarProtocoloAtivoPorChave(chaveId,
        [CHV_STATUS_PROTOCOLO.RETIRADA, CHV_STATUS_PROTOCOLO.ATRASADA,
         CHV_STATUS_PROTOCOLO.TRANSFERENCIA_PENDENTE]);
      if (protocoloAtivo) {
        return {
          disponivel: false,
          motivo:     'Chave em uso — protocolo: ' + protocoloAtivo.id,
          protocolo:  protocoloAtivo
        };
      }

      return { disponivel: true };
    } catch(e) {
      Logger.error('chave_engine', 'verificarDisponibilidade', e.message);
      return { disponivel: false, motivo: 'Erro interno: ' + e.message };
    }
  }

  /**
   * Lança Error se a chave não estiver disponível.
   * @param {string} chaveId
   */
  function assertDisponivel(chaveId) {
    var resultado = verificarDisponibilidade(chaveId);
    if (!resultado.disponivel) {
      throw new Error('Chave indisponível: ' + (resultado.motivo || 'motivo desconhecido'));
    }
  }

  // ── Helpers internos ──────────────────────────────────────────

  function _eventoParaStatus(status) {
    var mapa = {
      'RETIRADA':                   'KEY_PROTOCOL_RETRIEVED',
      'DEVOLVIDA':                  'KEY_PROTOCOL_RETURNED',
      'TRANSFERIDA':                'KEY_PROTOCOL_TRANSFERRED',
      'ATRASADA':                   'KEY_PROTOCOL_DELAYED',
      'NEGADA':                     'KEY_PROTOCOL_DENIED',
      'CANCELADA':                  'KEY_PROTOCOL_CANCELLED',
      'AGUARDANDO_CONFIRMACAO_INFRA': 'KEY_PROTOCOL_PENDING_INFRA'
    };
    return mapa[status] || 'KEY_PROTOCOL_UPDATED';
  }

  /**
   * Atualiza o STATUS e campos extras na linha do protocolo — delega ao ChavesRepository.
   * @param {string} protocoloId
   * @param {string} novoStatus
   * @param {Object} [camposExtras] - mapa { indiceColuna: valor }
   */
  function _atualizarStatusProtocolo(protocoloId, novoStatus, camposExtras) {
    ChavesRepository.atualizarStatusProtocolo(protocoloId, novoStatus, camposExtras);
  }

  /**
   * Registra uma linha no histórico imutável — delega ao ChavesRepository.
   */
  function _registrarHistorico(protocoloId, chaveId, acao, emailOperador,
                                statusAnterior, statusNovo, observacoes) {
    try {
      ChavesRepository.appendHistorico({
        protocoloId:    protocoloId,
        chaveId:        chaveId || '',
        acao:           acao,
        usuarioId:      emailOperador,
        usuarioNome:    '',
        statusAnterior: statusAnterior,
        statusNovo:     statusNovo,
        observacoes:    observacoes || '',
        agente:         'chave_engine'
      });
    } catch(e) {
      Logger.warn('chave_engine', '_registrarHistorico falhou', e.message);
    }
  }

  // ── API pública ───────────────────────────────────────────────

  return {
    transicaoPermitida:       transicaoPermitida,
    aplicarTransicao:         aplicarTransicao,
    verificarDisponibilidade: verificarDisponibilidade,
    assertDisponivel:         assertDisponivel,
    STATUS_PROTOCOLO:         CHV_STATUS_PROTOCOLO,
    STATUS_CHAVE:             CHV_STATUS_CHAVE
  };

})();
