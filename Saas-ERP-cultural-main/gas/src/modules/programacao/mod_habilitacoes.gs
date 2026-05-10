/**
 * @file mod_habilitacoes.gs
 * @description Módulo de Habilitações — gerencia o processo de qualificação/credenciamento
 *              de proponentes (grupos, artistas, coletivos, organizações) para participação
 *              em programas e uso dos espaços do CCBJ.
 * @layer backend
 * @responsibility CRUD de habilitações, fluxo de análise, métricas para relatório.
 * @dependencies utils.gs (_getSheet, gerarId, obterLockComRetry),
 *               mod_admin.gs (obterEmailUsuario, verificarPermissao, registrarLog)
 *
 * ABAS:
 *   Habilitacoes  (ACOES) — cadastro de proponentes e seu status de habilitação
 *
 * FLUXO:
 *   pendente → em_analise → habilitado | rejeitado
 *   habilitado ↔ suspenso (reversível por admin)
 */

// ══════════════════════════════════════════════════════════════════
// BLOCO: Constantes e Enums
// ══════════════════════════════════════════════════════════════════

const HAB_STATUS = {
  PENDENTE:    'pendente',
  EM_ANALISE:  'em_analise',
  HABILITADO:  'habilitado',
  REJEITADO:   'rejeitado',
  SUSPENSO:    'suspenso'
};

const HAB_TIPO_PROPONENTE = {
  GRUPO:           'grupo',
  PESSOA_FISICA:   'pessoa_fisica',
  PESSOA_JURIDICA: 'pessoa_juridica',
  COLETIVO:        'coletivo',
  INSTITUICAO:     'instituicao'
};

const HAB_AREA_CULTURAL = {
  TEATRO:         'teatro',
  DANCA:          'danca',
  MUSICA:         'musica',
  ARTES_VISUAIS:  'artes_visuais',
  LITERATURA:     'literatura',
  CIRCO:          'circo',
  AUDIOVISUAL:    'audiovisual',
  PATRIMONIO:     'patrimonio',
  CULTURA_POPULAR:'cultura_popular',
  OUTRO:          'outro'
};

// Colunas da aba Habilitacoes (0-indexed)
const HAB_COL = {
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

// ══════════════════════════════════════════════════════════════════
// BLOCO: Helpers internos
// ══════════════════════════════════════════════════════════════════

function _habRow2Obj(row) {
  return {
    id:                 row[HAB_COL.ID],
    proponente_nome:    row[HAB_COL.PROPONENTE_NOME],
    proponente_email:   row[HAB_COL.PROPONENTE_EMAIL],
    proponente_tipo:    row[HAB_COL.PROPONENTE_TIPO],
    area_cultural:      row[HAB_COL.AREA_CULTURAL],
    descricao:          row[HAB_COL.DESCRICAO],
    status:             row[HAB_COL.STATUS],
    data_envio:         row[HAB_COL.DATA_ENVIO]     ? String(row[HAB_COL.DATA_ENVIO])     : '',
    data_analise:       row[HAB_COL.DATA_ANALISE]    ? String(row[HAB_COL.DATA_ANALISE])    : '',
    responsavel_analise:row[HAB_COL.RESPONSAVEL_ANALISE],
    observacoes:        row[HAB_COL.OBSERVACOES],
    documentos:         row[HAB_COL.DOCUMENTOS],
    criado_por:         row[HAB_COL.CRIADO_POR],
    criado_em:          row[HAB_COL.CRIADO_EM]       ? String(row[HAB_COL.CRIADO_EM])       : '',
    atualizado_em:      row[HAB_COL.ATUALIZADO_EM]   ? String(row[HAB_COL.ATUALIZADO_EM])   : ''
  };
}

function _habGetSheet() {
  return _getSheet('Habilitacoes');
}

// ══════════════════════════════════════════════════════════════════
// BLOCO: Listar habilitações
// ══════════════════════════════════════════════════════════════════

/**
 * Lista todas as habilitações cadastradas.
 * @param {string} [emailFallback]
 * @returns {{ ok: boolean, dados: Object[], metricas: Object }}
 */
function listarHabilitacoes(emailFallback) {
  try {
    verificarPermissao('visualizar', emailFallback);
    var sheet = _habGetSheet();
    var ultima = sheet.getLastRow();
    if (ultima < 2) return { ok: true, dados: [], metricas: _habMetricasVazias() };

    var rows = sheet.getRange(2, 1, ultima - 1, 15).getValues();
    var dados = rows
      .filter(function(r) { return r[HAB_COL.ID]; })
      .map(_habRow2Obj);

    return { ok: true, dados: dados, metricas: _habCalcularMetricas(dados) };
  } catch (e) {
    Logger.error('[habilitacoes] listarHabilitacoes: ' + e.message);
    return { ok: false, erro: e.message };
  }
}

// ══════════════════════════════════════════════════════════════════
// BLOCO: Criar habilitação
// ══════════════════════════════════════════════════════════════════

/**
 * Cria um novo registro de habilitação.
 * @param {Object} dados
 * @param {string} [emailFallback]
 * @returns {{ ok: boolean, id: string }}
 */
function criarHabilitacao(dados, emailFallback) {
  var lock = obterLockComRetry();
  if (!lock) return { ok: false, erro: 'Sistema ocupado. Tente novamente.' };

  try {
    var email = obterEmailUsuario(emailFallback);
    var id    = gerarId('HAB');
    var agora = new Date().toISOString();

    var sheet = _habGetSheet();
    sheet.appendRow([
      id,
      dados.proponente_nome    || '',
      dados.proponente_email   || '',
      dados.proponente_tipo    || HAB_TIPO_PROPONENTE.GRUPO,
      dados.area_cultural      || HAB_AREA_CULTURAL.OUTRO,
      dados.descricao          || '',
      HAB_STATUS.PENDENTE,
      agora,   // data_envio
      '',       // data_analise
      '',       // responsavel_analise
      dados.observacoes        || '',
      dados.documentos         || '',
      email,
      agora,
      agora
    ]);

    registrarLog('HABILITACAO_CRIADA', email, id, { nome: dados.proponente_nome });
    return { ok: true, id: id };
  } catch (e) {
    Logger.error('[habilitacoes] criarHabilitacao: ' + e.message);
    return { ok: false, erro: e.message };
  } finally {
    lock.releaseLock();
  }
}

// ══════════════════════════════════════════════════════════════════
// BLOCO: Atualizar habilitação
// ══════════════════════════════════════════════════════════════════

/**
 * Atualiza os dados cadastrais de uma habilitação (não muda status).
 * @param {string} id
 * @param {Object} dados
 * @param {string} [emailFallback]
 * @returns {{ ok: boolean }}
 */
function atualizarHabilitacao(id, dados, emailFallback) {
  var lock = obterLockComRetry();
  if (!lock) return { ok: false, erro: 'Sistema ocupado. Tente novamente.' };

  try {
    var email = obterEmailUsuario(emailFallback);
    verificarPermissao('editar', email);

    var sheet = _habGetSheet();
    var ultima = sheet.getLastRow();
    if (ultima < 2) return { ok: false, erro: 'Habilitação não encontrada.' };

    var ids = sheet.getRange(2, 1, ultima - 1, 1).getValues().map(function(r) { return r[0]; });
    var idx = ids.indexOf(id);
    if (idx === -1) return { ok: false, erro: 'Habilitação não encontrada.' };

    var linha = idx + 2;
    var agora = new Date().toISOString();

    if (dados.proponente_nome    !== undefined) sheet.getRange(linha, HAB_COL.PROPONENTE_NOME    + 1).setValue(dados.proponente_nome);
    if (dados.proponente_email   !== undefined) sheet.getRange(linha, HAB_COL.PROPONENTE_EMAIL   + 1).setValue(dados.proponente_email);
    if (dados.proponente_tipo    !== undefined) sheet.getRange(linha, HAB_COL.PROPONENTE_TIPO    + 1).setValue(dados.proponente_tipo);
    if (dados.area_cultural      !== undefined) sheet.getRange(linha, HAB_COL.AREA_CULTURAL      + 1).setValue(dados.area_cultural);
    if (dados.descricao          !== undefined) sheet.getRange(linha, HAB_COL.DESCRICAO          + 1).setValue(dados.descricao);
    if (dados.observacoes        !== undefined) sheet.getRange(linha, HAB_COL.OBSERVACOES        + 1).setValue(dados.observacoes);
    if (dados.documentos         !== undefined) sheet.getRange(linha, HAB_COL.DOCUMENTOS         + 1).setValue(dados.documentos);
    sheet.getRange(linha, HAB_COL.ATUALIZADO_EM + 1).setValue(agora);

    registrarLog('HABILITACAO_ATUALIZADA', email, id, { nome: dados.proponente_nome });
    return { ok: true };
  } catch (e) {
    Logger.error('[habilitacoes] atualizarHabilitacao: ' + e.message);
    return { ok: false, erro: e.message };
  } finally {
    lock.releaseLock();
  }
}

// ══════════════════════════════════════════════════════════════════
// BLOCO: Mudar status de habilitação
// ══════════════════════════════════════════════════════════════════

/**
 * Transita o status de uma habilitação.
 * Transições válidas:
 *   pendente    → em_analise | rejeitado
 *   em_analise  → habilitado | rejeitado
 *   habilitado  → suspenso
 *   suspenso    → habilitado | rejeitado
 * @param {string} id
 * @param {string} novoStatus
 * @param {string} [observacao]
 * @param {string} [emailFallback]
 * @returns {{ ok: boolean }}
 */
function mudarStatusHabilitacao(id, novoStatus, observacao, emailFallback) {
  var lock = obterLockComRetry();
  if (!lock) return { ok: false, erro: 'Sistema ocupado. Tente novamente.' };

  try {
    var email = obterEmailUsuario(emailFallback);
    verificarPermissao('editar', email);

    var sheet = _habGetSheet();
    var ultima = sheet.getLastRow();
    if (ultima < 2) return { ok: false, erro: 'Habilitação não encontrada.' };

    var ids     = sheet.getRange(2, 1, ultima - 1, 1).getValues().map(function(r) { return r[0]; });
    var statuses= sheet.getRange(2, HAB_COL.STATUS + 1, ultima - 1, 1).getValues().map(function(r) { return r[0]; });
    var idx = ids.indexOf(id);
    if (idx === -1) return { ok: false, erro: 'Habilitação não encontrada.' };

    var statusAtual = statuses[idx];
    var linha = idx + 2;
    var agora = new Date().toISOString();

    // Validação de transição
    var transicoesValidas = {
      'pendente':   ['em_analise', 'rejeitado'],
      'em_analise': ['habilitado', 'rejeitado'],
      'habilitado': ['suspenso'],
      'suspenso':   ['habilitado', 'rejeitado'],
      'rejeitado':  ['pendente']
    };
    var permitidos = transicoesValidas[statusAtual] || [];
    if (permitidos.indexOf(novoStatus) === -1) {
      return { ok: false, erro: 'Transição de "' + statusAtual + '" para "' + novoStatus + '" não é permitida.' };
    }

    sheet.getRange(linha, HAB_COL.STATUS              + 1).setValue(novoStatus);
    sheet.getRange(linha, HAB_COL.DATA_ANALISE        + 1).setValue(agora);
    sheet.getRange(linha, HAB_COL.RESPONSAVEL_ANALISE + 1).setValue(email);
    sheet.getRange(linha, HAB_COL.ATUALIZADO_EM       + 1).setValue(agora);
    if (observacao) sheet.getRange(linha, HAB_COL.OBSERVACOES + 1).setValue(observacao);

    registrarLog('HABILITACAO_STATUS_' + novoStatus.toUpperCase(), email, id, { de: statusAtual, para: novoStatus });
    return { ok: true };
  } catch (e) {
    Logger.error('[habilitacoes] mudarStatusHabilitacao: ' + e.message);
    return { ok: false, erro: e.message };
  } finally {
    lock.releaseLock();
  }
}

// ══════════════════════════════════════════════════════════════════
// BLOCO: Métricas
// ══════════════════════════════════════════════════════════════════

function _habMetricasVazias() {
  return { total: 0, pendente: 0, em_analise: 0, habilitado: 0, rejeitado: 0, suspenso: 0, taxa_aprovacao: 0 };
}

function _habCalcularMetricas(dados) {
  var m = _habMetricasVazias();
  m.total = dados.length;
  dados.forEach(function(d) {
    if (m[d.status] !== undefined) m[d.status]++;
  });
  var analisados = m.habilitado + m.rejeitado;
  m.taxa_aprovacao = analisados > 0 ? Math.round((m.habilitado / analisados) * 100) : 0;
  return m;
}

/**
 * Retorna apenas as métricas (sem lista completa) — para widgets de dashboard.
 * @param {string} [emailFallback]
 * @returns {{ ok: boolean, metricas: Object }}
 */
function obterMetricasHabilitacoes(emailFallback) {
  try {
    verificarPermissao('visualizar', emailFallback);
    var sheet = _habGetSheet();
    var ultima = sheet.getLastRow();
    if (ultima < 2) return { ok: true, metricas: _habMetricasVazias() };

    var rows = sheet.getRange(2, 1, ultima - 1, 15).getValues();
    var dados = rows.filter(function(r) { return r[HAB_COL.ID]; }).map(_habRow2Obj);
    return { ok: true, metricas: _habCalcularMetricas(dados) };
  } catch (e) {
    Logger.error('[habilitacoes] obterMetricasHabilitacoes: ' + e.message);
    return { ok: false, erro: e.message };
  }
}
