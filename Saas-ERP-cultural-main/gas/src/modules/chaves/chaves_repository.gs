/**
 * @file modules/chaves/chaves_repository.gs
 * @layer modules/chaves
 * @description Repositório oficial do domínio Chaves.
 *
 * Encapsula TODO acesso às abas Chaves, ProtocolosChaves e HistoricoChaves.
 * Nenhum outro módulo deve ler ou escrever nessas abas diretamente.
 *
 * REGRA ARQUITETURAL:
 *   - mod_chaves.gs e chave_engine.gs delegam toda I/O a este repositório.
 *   - SpreadsheetApp NÃO é chamado fora deste arquivo para o domínio Chaves.
 *   - Toda escrita usa lock externo (obterLockComRetry) via chamador, não aqui.
 *
 * @depends core/utils.gs (_getSheet, gerarId),
 *          modules/chaves/mod_chaves.gs (CHV_COL, PROT_COL, HIST_COL — enums de coluna)
 */

var ChavesRepository = (function () {

  // ── Helpers de acesso ─────────────────────────────────────────────

  function _abaChaves()     { return _getSheet('Chaves'); }
  function _abaProtocolos() { return _getSheet('ProtocolosChaves'); }
  function _abaHistorico()  { return _getSheet('HistoricoChaves'); }

  // ══════════════════════════════════════════════════════════════════
  // CHAVES FÍSICAS
  // ══════════════════════════════════════════════════════════════════

  function _rowToChave(r) {
    if (!r || !r[CHV_COL.ID]) return null;
    return {
      id:                String(r[CHV_COL.ID] || ''),
      espacoId:          String(r[CHV_COL.ESPACO_ID] || ''),
      codigoPatrimonial: String(r[CHV_COL.CODIGO_PATRIMONIAL] || ''),
      tipo:              String(r[CHV_COL.TIPO] || ''),
      status:            String(r[CHV_COL.STATUS] || ''),
      ativa:             String(r[CHV_COL.ATIVA]).toLowerCase() !== 'false',
      observacoes:       String(r[CHV_COL.OBSERVACOES] || ''),
      criadaEm:          r[CHV_COL.CRIADA_EM]      ? String(r[CHV_COL.CRIADA_EM])      : '',
      atualizadaEm:      r[CHV_COL.ATUALIZADA_EM]  ? String(r[CHV_COL.ATUALIZADA_EM])  : ''
    };
  }

  function listarChaves() {
    var aba = _abaChaves();
    if (!aba || aba.getLastRow() < 2) return [];
    return aba.getRange(2, 1, aba.getLastRow() - 1, 9).getValues()
      .map(_rowToChave).filter(Boolean);
  }

  function obterChavePorId(id) {
    var aba = _abaChaves();
    if (!aba || aba.getLastRow() < 2) return null;
    var rows = aba.getRange(2, 1, aba.getLastRow() - 1, 9).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][CHV_COL.ID]).trim() === String(id).trim())
        return _rowToChave(rows[i]);
    }
    return null;
  }

  /** @returns {{ linha: number, dados: Array }} ou null */
  function _encontrarLinhaChave(id) {
    var aba = _abaChaves();
    if (!aba || aba.getLastRow() < 2) return null;
    var rows = aba.getRange(2, 1, aba.getLastRow() - 1, 9).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][CHV_COL.ID]).trim() === String(id).trim())
        return { linha: i + 2, dados: rows[i] };
    }
    return null;
  }

  function criarChave(dados) {
    var id   = gerarId('CHV');
    var agora = new Date().toISOString();
    _abaChaves().appendRow([
      id,
      dados.espacoId          || '',
      dados.codigoPatrimonial || '',
      dados.tipo              || CHV_TIPO_CHAVE.COMUM,
      dados.status            || CHV_STATUS_CHAVE.DISPONIVEL,
      true,
      dados.observacoes       || '',
      agora,
      agora
    ]);
    return id;
  }

  function atualizarChave(id, campos) {
    var r = _encontrarLinhaChave(id);
    if (!r) throw new Error('Chave não encontrada: ' + id);
    var aba  = _abaChaves();
    var agora = new Date().toISOString();
    if (campos.codigoPatrimonial !== undefined) aba.getRange(r.linha, CHV_COL.CODIGO_PATRIMONIAL + 1).setValue(campos.codigoPatrimonial);
    if (campos.tipo              !== undefined) aba.getRange(r.linha, CHV_COL.TIPO              + 1).setValue(campos.tipo);
    if (campos.observacoes       !== undefined) aba.getRange(r.linha, CHV_COL.OBSERVACOES       + 1).setValue(campos.observacoes);
    if (campos.ativa             !== undefined) aba.getRange(r.linha, CHV_COL.ATIVA             + 1).setValue(campos.ativa);
    aba.getRange(r.linha, CHV_COL.ATUALIZADA_EM + 1).setValue(agora);
  }

  function atualizarStatusChave(id, novoStatus) {
    var r = _encontrarLinhaChave(id);
    if (!r) throw new Error('Chave não encontrada para atualizar status: ' + id);
    var aba  = _abaChaves();
    var agora = new Date().toISOString();
    aba.getRange(r.linha, CHV_COL.STATUS       + 1).setValue(novoStatus);
    aba.getRange(r.linha, CHV_COL.ATUALIZADA_EM + 1).setValue(agora);
  }

  // ══════════════════════════════════════════════════════════════════
  // PROTOCOLOS
  // ══════════════════════════════════════════════════════════════════

  function _rowToProtocolo(r) {
    if (!r || !r[PROT_COL.ID]) return null;
    return {
      id:                      String(r[PROT_COL.ID] || ''),
      chaveId:                 String(r[PROT_COL.CHAVE_ID] || ''),
      espacoId:                String(r[PROT_COL.ESPACO_ID] || ''),
      responsavelId:           String(r[PROT_COL.RESPONSAVEL_ATUAL_ID] || ''),
      responsavelNome:         String(r[PROT_COL.RESPONSAVEL_ATUAL_NOME] || ''),
      solicitanteId:           String(r[PROT_COL.SOLICITANTE_ID] || ''),
      solicitanteNome:         String(r[PROT_COL.SOLICITANTE_NOME] || ''),
      setorId:                 String(r[PROT_COL.SETOR_ID] || ''),
      setorNome:               String(r[PROT_COL.SETOR_NOME] || ''),
      dtSolicitacao:           r[PROT_COL.DT_SOLICITACAO]       ? String(r[PROT_COL.DT_SOLICITACAO])       : '',
      dtRetirada:              r[PROT_COL.DT_RETIRADA]          ? String(r[PROT_COL.DT_RETIRADA])          : '',
      dtPrevistaDev:           r[PROT_COL.DT_PREVISTA_DEVOLUCAO]? String(r[PROT_COL.DT_PREVISTA_DEVOLUCAO]): '',
      dtDevolucao:             r[PROT_COL.DT_DEVOLUCAO]         ? String(r[PROT_COL.DT_DEVOLUCAO])         : '',
      status:                  String(r[PROT_COL.STATUS] || ''),
      observacoes:             String(r[PROT_COL.OBSERVACOES] || ''),
      entreguePorId:           String(r[PROT_COL.ENTREGUE_POR_ID]    || ''),
      entreguePorNome:         String(r[PROT_COL.ENTREGUE_POR_NOME]  || ''),
      recebidoPorId:           String(r[PROT_COL.RECEBIDO_POR_ID]    || ''),
      recebidoPorNome:         String(r[PROT_COL.RECEBIDO_POR_NOME]  || ''),
      devRecebidaPorId:        String(r[PROT_COL.DEVOLUCAO_RECEBIDA_POR_ID]   || ''),
      devRecebidaPorNome:      String(r[PROT_COL.DEVOLUCAO_RECEBIDA_POR_NOME] || ''),
      reservaVinculadaId:      String(r[PROT_COL.RESERVA_VINCULADA_ID] || ''),
      origem:                  String(r[PROT_COL.ORIGEM] || ''),
      transferenciaDestinoId:  String(r[PROT_COL.TRANSFERENCIA_DESTINO_ID]   || ''),
      transferenciaDestinoNome:String(r[PROT_COL.TRANSFERENCIA_DESTINO_NOME] || '')
    };
  }

  function listarProtocolos() {
    var aba = _abaProtocolos();
    if (!aba || aba.getLastRow() < 2) return [];
    var numCols = Math.min(aba.getLastColumn(), 25);
    return aba.getRange(2, 1, aba.getLastRow() - 1, numCols).getValues()
      .map(_rowToProtocolo).filter(Boolean);
  }

  function obterProtocoloPorId(id) {
    var aba = _abaProtocolos();
    if (!aba || aba.getLastRow() < 2) return null;
    var numCols = Math.min(aba.getLastColumn(), 25);
    var rows = aba.getRange(2, 1, aba.getLastRow() - 1, numCols).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][PROT_COL.ID]).trim() === String(id).trim())
        return _rowToProtocolo(rows[i]);
    }
    return null;
  }

  /** @returns {{ linha: number, dados: Array }} ou null */
  function _encontrarLinhaProtocolo(id) {
    var aba = _abaProtocolos();
    if (!aba || aba.getLastRow() < 2) return null;
    var numCols = Math.min(aba.getLastColumn(), 25);
    var rows = aba.getRange(2, 1, aba.getLastRow() - 1, numCols).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][PROT_COL.ID]).trim() === String(id).trim())
        return { linha: i + 2, dados: rows[i] };
    }
    return null;
  }

  function criarProtocolo(dados) {
    var id    = gerarId('PROT');
    var agora = new Date().toISOString();
    _abaProtocolos().appendRow([
      id,
      dados.chaveId                   || '',
      dados.espacoId                  || '',
      dados.responsavelId             || '',
      dados.responsavelNome           || '',
      dados.solicitanteId             || '',
      dados.solicitanteNome           || '',
      dados.setorId                   || '',
      dados.setorNome                 || '',
      agora,                              // DT_SOLICITACAO
      '',                                 // DT_RETIRADA
      dados.dtPrevistaDevolucao       || '',
      '',                                 // DT_DEVOLUCAO
      dados.status                    || CHV_STATUS_PROTOCOLO.SOLICITADA,
      dados.observacoes               || '',
      '',                                 // ENTREGUE_POR_ID
      '',                                 // ENTREGUE_POR_NOME
      '',                                 // RECEBIDO_POR_ID
      '',                                 // RECEBIDO_POR_NOME
      '',                                 // DEV_RECEBIDA_POR_ID
      '',                                 // DEV_RECEBIDA_POR_NOME
      dados.reservaVinculadaId        || '',
      dados.origem                    || 'SISTEMA',
      '',                                 // TRANSFERENCIA_DESTINO_ID
      ''                                  // TRANSFERENCIA_DESTINO_NOME
    ]);
    return id;
  }

  /**
   * Atualiza status + campos extras na linha do protocolo.
   * @param {string} protocoloId
   * @param {string} novoStatus
   * @param {Object} [camposExtras] — mapa { PROT_COL.CAMPO: valor }
   */
  function atualizarStatusProtocolo(protocoloId, novoStatus, camposExtras) {
    var r = _encontrarLinhaProtocolo(protocoloId);
    if (!r) throw new Error('[ChavesRepository] Protocolo não encontrado: ' + protocoloId);
    var aba = _abaProtocolos();
    aba.getRange(r.linha, PROT_COL.STATUS + 1).setValue(novoStatus);
    if (camposExtras) {
      var cols = Object.keys(camposExtras);
      for (var i = 0; i < cols.length; i++) {
        aba.getRange(r.linha, Number(cols[i]) + 1).setValue(camposExtras[cols[i]]);
      }
    }
  }

  /**
   * Busca o primeiro protocolo com status ativo para a chave indicada.
   * @param {string} chaveId
   * @param {string[]} [statusAtivos]
   * @returns {Object|null}
   */
  function buscarProtocoloAtivoPorChave(chaveId, statusAtivos) {
    var ATIVOS = statusAtivos || [
      CHV_STATUS_PROTOCOLO.RETIRADA,
      CHV_STATUS_PROTOCOLO.ATRASADA,
      CHV_STATUS_PROTOCOLO.TRANSFERENCIA_PENDENTE,
      CHV_STATUS_PROTOCOLO.SOLICITADA,
      CHV_STATUS_PROTOCOLO.AGUARDANDO_CONFIRMACAO_USUARIO,
      CHV_STATUS_PROTOCOLO.AGUARDANDO_CONFIRMACAO_INFRA,
      CHV_STATUS_PROTOCOLO.TRANSFERIDA
    ];
    var aba = _abaProtocolos();
    if (!aba || aba.getLastRow() < 2) return null;
    var numCols = Math.min(aba.getLastColumn(), 25);
    var rows = aba.getRange(2, 1, aba.getLastRow() - 1, numCols).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][PROT_COL.CHAVE_ID]).trim() !== String(chaveId).trim()) continue;
      var status = String(rows[i][PROT_COL.STATUS] || '').toUpperCase();
      if (ATIVOS.indexOf(status) !== -1) return _rowToProtocolo(rows[i]);
    }
    return null;
  }

  // ══════════════════════════════════════════════════════════════════
  // HISTÓRICO (imutável)
  // ══════════════════════════════════════════════════════════════════

  function appendHistorico(reg) {
    var aba = _abaHistorico();
    if (!aba) return;
    var id = gerarId('HCH');
    aba.appendRow([
      id,
      reg.protocoloId     || '',
      reg.chaveId         || '',
      new Date().toISOString(),
      reg.acao            || '',
      reg.usuarioId       || '',
      reg.usuarioNome     || '',
      reg.statusAnterior  || '',
      reg.statusNovo      || '',
      reg.observacoes     || '',
      reg.agente          || 'SISTEMA'
    ]);
    return id;
  }

  function listarHistorico(filtros) {
    var aba = _abaHistorico();
    if (!aba || aba.getLastRow() < 2) return [];
    var rows = aba.getRange(2, 1, aba.getLastRow() - 1, 11).getValues();
    var lista = rows.map(function(r) {
      return {
        id:             String(r[HIST_COL.ID] || ''),
        protocoloId:    String(r[HIST_COL.PROTOCOLO_ID] || ''),
        chaveId:        String(r[HIST_COL.CHAVE_ID] || ''),
        dtHora:         r[HIST_COL.DT_HORA]         ? String(r[HIST_COL.DT_HORA])         : '',
        acao:           String(r[HIST_COL.ACAO] || ''),
        usuarioId:      String(r[HIST_COL.USUARIO_ID] || ''),
        usuarioNome:    String(r[HIST_COL.USUARIO_NOME] || ''),
        statusAnterior: String(r[HIST_COL.STATUS_ANTERIOR] || ''),
        statusNovo:     String(r[HIST_COL.STATUS_NOVO] || ''),
        observacoes:    String(r[HIST_COL.OBSERVACOES] || ''),
        agente:         String(r[HIST_COL.AGENTE] || '')
      };
    }).filter(function(h) { return h.id; });

    if (filtros) {
      if (filtros.protocoloId) lista = lista.filter(function(h) { return h.protocoloId === filtros.protocoloId; });
      if (filtros.chaveId)     lista = lista.filter(function(h) { return h.chaveId     === filtros.chaveId; });
      if (filtros.usuarioId)   lista = lista.filter(function(h) { return h.usuarioId   === filtros.usuarioId; });
    }
    lista.sort(function(a, b) { return new Date(b.dtHora) - new Date(a.dtHora); });
    return lista;
  }

  // ── API pública ───────────────────────────────────────────────────

  return {
    // Chaves físicas
    listarChaves:             listarChaves,
    obterChavePorId:          obterChavePorId,
    criarChave:               criarChave,
    atualizarChave:           atualizarChave,
    atualizarStatusChave:     atualizarStatusChave,
    // Protocolos
    listarProtocolos:         listarProtocolos,
    obterProtocoloPorId:      obterProtocoloPorId,
    criarProtocolo:           criarProtocolo,
    atualizarStatusProtocolo: atualizarStatusProtocolo,
    buscarProtocoloAtivoPorChave: buscarProtocoloAtivoPorChave,
    // Histórico
    appendHistorico:          appendHistorico,
    listarHistorico:          listarHistorico
  };

})();
