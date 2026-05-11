/**
 * @file modules/programacao/habilitacoes_repository.gs
 * @layer modules/programacao
 * @description Repositório oficial do domínio Habilitações.
 *
 * Encapsula TODO acesso à aba "Habilitacoes" na planilha ACOES.
 * Nenhum outro módulo deve ler ou escrever nessa aba diretamente.
 *
 * @depends core/utils.gs (_getSheet, gerarId)
 */

var HabilitacoesRepository = (function () {

  var ABA = 'Habilitacoes';

  // Índices de coluna (0-based), espelham HAB_COL de mod_habilitacoes.gs
  var C = {
    ID:                  0,
    PROPONENTE_NOME:     1,
    PROPONENTE_EMAIL:    2,
    PROPONENTE_TIPO:     3,
    AREA_CULTURAL:       4,
    DESCRICAO:           5,
    STATUS:              6,
    DATA_ENVIO:          7,
    DATA_ANALISE:        8,
    RESPONSAVEL_ANALISE: 9,
    OBSERVACOES:         10,
    DOCUMENTOS:          11,
    CRIADO_POR:          12,
    CRIADO_EM:           13,
    ATUALIZADO_EM:       14
  };

  var N_COLUNAS = 15;

  function _sheet() {
    return _getSheet(ABA);
  }

  function _rowToObj(row) {
    return {
      id:                 row[C.ID],
      proponente_nome:    row[C.PROPONENTE_NOME],
      proponente_email:   row[C.PROPONENTE_EMAIL],
      proponente_tipo:    row[C.PROPONENTE_TIPO],
      area_cultural:      row[C.AREA_CULTURAL],
      descricao:          row[C.DESCRICAO],
      status:             row[C.STATUS],
      data_envio:         row[C.DATA_ENVIO]          ? String(row[C.DATA_ENVIO])          : '',
      data_analise:       row[C.DATA_ANALISE]         ? String(row[C.DATA_ANALISE])         : '',
      responsavel_analise:row[C.RESPONSAVEL_ANALISE],
      observacoes:        row[C.OBSERVACOES],
      documentos:         row[C.DOCUMENTOS],
      criado_por:         row[C.CRIADO_POR],
      criado_em:          row[C.CRIADO_EM]            ? String(row[C.CRIADO_EM])            : '',
      atualizado_em:      row[C.ATUALIZADO_EM]        ? String(row[C.ATUALIZADO_EM])        : ''
    };
  }

  // ── Leitura ─────────────────────────────────────────────────

  function listarTodos() {
    var sheet  = _sheet();
    var ultima = sheet.getLastRow();
    if (ultima < 2) return [];
    return sheet.getRange(2, 1, ultima - 1, N_COLUNAS).getValues()
      .filter(function(r) { return r[C.ID]; })
      .map(_rowToObj);
  }

  function obterPorId(id) {
    var sheet  = _sheet();
    var ultima = sheet.getLastRow();
    if (ultima < 2) return null;
    var rows = sheet.getRange(2, 1, ultima - 1, N_COLUNAS).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][C.ID] === id) return _rowToObj(rows[i]);
    }
    return null;
  }

  // ── Escrita ──────────────────────────────────────────────────

  function criar(dados, email) {
    var id    = gerarId('HAB');
    var agora = new Date().toISOString();
    _sheet().appendRow([
      id,
      dados.proponente_nome    || '',
      dados.proponente_email   || '',
      dados.proponente_tipo    || 'grupo',
      dados.area_cultural      || 'outro',
      dados.descricao          || '',
      'pendente',
      agora,   // data_envio
      '',       // data_analise
      '',       // responsavel_analise
      dados.observacoes        || '',
      dados.documentos         || '',
      email,
      agora,   // criado_em
      agora    // atualizado_em
    ]);
    return id;
  }

  function atualizar(id, campos) {
    var sheet  = _sheet();
    var ultima = sheet.getLastRow();
    if (ultima < 2) throw new Error('Habilitação não encontrada: ' + id);
    var ids = sheet.getRange(2, 1, ultima - 1, 1).getValues().map(function(r) { return r[0]; });
    var idx = ids.indexOf(id);
    if (idx === -1) throw new Error('Habilitação não encontrada: ' + id);
    var linha = idx + 2;
    var agora = new Date().toISOString();
    if (campos.proponente_nome    !== undefined) sheet.getRange(linha, C.PROPONENTE_NOME    + 1).setValue(campos.proponente_nome);
    if (campos.proponente_email   !== undefined) sheet.getRange(linha, C.PROPONENTE_EMAIL   + 1).setValue(campos.proponente_email);
    if (campos.proponente_tipo    !== undefined) sheet.getRange(linha, C.PROPONENTE_TIPO    + 1).setValue(campos.proponente_tipo);
    if (campos.area_cultural      !== undefined) sheet.getRange(linha, C.AREA_CULTURAL      + 1).setValue(campos.area_cultural);
    if (campos.descricao          !== undefined) sheet.getRange(linha, C.DESCRICAO          + 1).setValue(campos.descricao);
    if (campos.observacoes        !== undefined) sheet.getRange(linha, C.OBSERVACOES        + 1).setValue(campos.observacoes);
    if (campos.documentos         !== undefined) sheet.getRange(linha, C.DOCUMENTOS         + 1).setValue(campos.documentos);
    sheet.getRange(linha, C.ATUALIZADO_EM + 1).setValue(agora);
  }

  function atualizarStatus(id, novoStatus, analista, observacao) {
    var sheet  = _sheet();
    var ultima = sheet.getLastRow();
    if (ultima < 2) throw new Error('Habilitação não encontrada: ' + id);
    var ids = sheet.getRange(2, 1, ultima - 1, 1).getValues().map(function(r) { return r[0]; });
    var idx = ids.indexOf(id);
    if (idx === -1) throw new Error('Habilitação não encontrada: ' + id);
    var linha = idx + 2;
    var agora = new Date().toISOString();
    sheet.getRange(linha, C.STATUS              + 1).setValue(novoStatus);
    sheet.getRange(linha, C.DATA_ANALISE        + 1).setValue(agora);
    sheet.getRange(linha, C.RESPONSAVEL_ANALISE + 1).setValue(analista || '');
    sheet.getRange(linha, C.ATUALIZADO_EM       + 1).setValue(agora);
    if (observacao) sheet.getRange(linha, C.OBSERVACOES + 1).setValue(observacao);
  }

  return {
    listarTodos:    listarTodos,
    obterPorId:     obterPorId,
    criar:          criar,
    atualizar:      atualizar,
    atualizarStatus:atualizarStatus
  };

})();
