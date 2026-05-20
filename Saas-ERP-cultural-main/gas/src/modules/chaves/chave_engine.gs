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
 * @depends modules/chaves/chaves_repository.gs (ChavesRepository),
 *          core/logger.gs, core/event_bus_backend.gs, core/services/auditoria_service.gs,
 *          core/utils.gs (_getSheet, gerarId, obterLockComRetry)
 */

// ══════════════════════════════════════════════════════════════════
// Constantes do domínio Chaves — definidas aqui (carregado primeiro)
// e reutilizadas por mod_chaves.gs e chaves_repository.gs
// ══════════════════════════════════════════════════════════════════

const CHV_STATUS_CHAVE = {
  DISPONIVEL: 'DISPONIVEL',
  EM_USO:     'EM_USO',
  MANUTENCAO: 'MANUTENCAO',
  BLOQUEADA:  'BLOQUEADA',
  EXTRAVIADA: 'EXTRAVIADA'
};

const CHV_TIPO_CHAVE = {
  COMUM:   'CHAVE COMUM',
  RESERVA: 'CHAVE RESERVA'
};

const CHV_STATUS_PROTOCOLO = {
  SOLICITADA:                     'SOLICITADA',
  AGUARDANDO_CONFIRMACAO_USUARIO: 'AGUARDANDO_CONFIRMACAO_USUARIO',
  AGUARDANDO_CONFIRMACAO_INFRA:   'AGUARDANDO_CONFIRMACAO_INFRA',
  RETIRADA:                       'RETIRADA',
  DEVOLVIDA:                      'DEVOLVIDA',
  ATRASADA:                       'ATRASADA',
  CANCELADA:                      'CANCELADA',
  NEGADA:                         'NEGADA',
  TRANSFERENCIA_PENDENTE:         'TRANSFERENCIA_PENDENTE',
  TRANSFERIDA:                    'TRANSFERIDA'
};

// Colunas da aba Chaves (0-indexed)
const CHV_COL = {
  ID: 0, ESPACO_ID: 1, CODIGO_PATRIMONIAL: 2, TIPO: 3,
  STATUS: 4, ATIVA: 5, OBSERVACOES: 6, CRIADA_EM: 7, ATUALIZADA_EM: 8
};

// Colunas da aba ProtocolosChaves (0-indexed)
const PROT_COL = {
  ID: 0, CHAVE_ID: 1, ESPACO_ID: 2,
  RESPONSAVEL_ATUAL_ID: 3, RESPONSAVEL_ATUAL_NOME: 4,
  SOLICITANTE_ID: 5, SOLICITANTE_NOME: 6,
  SETOR_ID: 7, SETOR_NOME: 8,
  DT_SOLICITACAO: 9, DT_RETIRADA: 10, DT_PREVISTA_DEVOLUCAO: 11, DT_DEVOLUCAO: 12,
  STATUS: 13, OBSERVACOES: 14,
  ENTREGUE_POR_ID: 15, ENTREGUE_POR_NOME: 16,
  RECEBIDO_POR_ID: 17, RECEBIDO_POR_NOME: 18,
  DEVOLUCAO_RECEBIDA_POR_ID: 19, DEVOLUCAO_RECEBIDA_POR_NOME: 20,
  RESERVA_VINCULADA_ID: 21, ORIGEM: 22,
  TRANSFERENCIA_DESTINO_ID: 23, TRANSFERENCIA_DESTINO_NOME: 24
};

// Colunas da aba HistoricoChaves (0-indexed)
const HIST_COL = {
  ID: 0, PROTOCOLO_ID: 1, CHAVE_ID: 2, DT_HORA: 3,
  ACAO: 4, USUARIO_ID: 5, USUARIO_NOME: 6,
  STATUS_ANTERIOR: 7, STATUS_NOVO: 8,
  OBSERVACOES: 9, AGENTE: 10
};

// Colunas expandidas de Configuracoes (0-indexed)
const CONF_COL = {
  ID: 0, NOME: 1, CAPACIDADE: 2, RESUMO_ITENS: 3, EMAIL_RESPONSAVEL: 4,
  POSSUI_CHAVES: 5, QTD_USO_COMUM: 6, QTD_RESERVA: 7,
  ACEITA_RESERVA: 8, EXIGE_PROTOCOLO: 9, LOCALIZACAO_CHAVE: 10, OBS_INTERNAS: 11,
  SETOR_RESPONSAVEL: 12
};

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

try { FsmGuardian.registrar('chaves', _TRANSICOES_CHAVE); } catch(e) {
  console.warn('[chave_engine] FsmGuardian.registrar: ' + e.message);
}
