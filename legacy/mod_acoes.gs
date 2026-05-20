/**
 * @file mod_acoes.gs
 * @description Gestão de Ações Institucionais — núcleo integrador da plataforma.
 *              Ações são iniciativas (cursos, eventos, espetáculos, oficinas, projetos)
 *              às quais se vinculam reservas, contratos, chaves e demais recursos.
 *
 * ESTADOS DA AÇÃO (máquina de estados controlada):
 *   rascunho → planejamento → aprovado → em_execucao → concluido → arquivado
 *                                    ↕
 *                                  pausado
 *
 * ESTRUTURA DA ABA "Acoes" (planilha ESPACOS):
 *   id | nome | tipo | descricao | status | responsavel | equipe_json |
 *   data_inicio | data_fim | organizacao | criado_em | atualizado_em | criado_por
 *
 * ESTRUTURA DA ABA "AcoesRecursos" (planilha ESPACOS):
 *   acao_id | tipo_recurso | recurso_id | associado_em | email
 *
 * FUNÇÕES EXPOSTAS (via google.script.run):
 *   listarAcoes, obterAcao, criarAcao, atualizarAcao,
 *   mudarStatusAcao, associarRecursoAcao, obterRecursosDaAcao
 */

// ════════════════════════════════════════════════════════════════════
// CONSTANTES
// ════════════════════════════════════════════════════════════════════

var _ABA_ACOES     = 'Acoes';
var _ABA_RECURSOS  = 'AcoesRecursos';

var _ACOES_ESTADOS = ['rascunho','planejamento','aprovado','em_execucao','pausado','concluido','arquivado'];

var _ACOES_TRANSICOES_VALIDAS = {
  rascunho:    ['planejamento'],
  planejamento:['aprovado', 'rascunho'],
  aprovado:    ['em_execucao', 'planejamento'],
  em_execucao: ['pausado', 'concluido'],
  pausado:     ['em_execucao', 'arquivado'],
  concluido:   ['arquivado'],
  arquivado:   []
};

// Índices de coluna da aba Acoes (0-based)
var _COL_ACOES = {
  ID:           0,
  NOME:         1,
  TIPO:         2,
  DESCRICAO:    3,
  STATUS:       4,
  RESPONSAVEL:  5,
  EQUIPE:       6,
  DATA_INICIO:  7,
  DATA_FIM:     8,
  ORGANIZACAO:  9,
  CRIADO_EM:    10,
  ATUALIZADO_EM:11,
  CRIADO_POR:   12
};

var _TOTAL_COLS_ACOES = 13;

// ════════════════════════════════════════════════════════════════════
// CRUD — AÇÕES
// ════════════════════════════════════════════════════════════════════

/**
 * Cria uma nova Ação Institucional.
 * @param {Object} dados — { nome*, tipo*, descricao, responsavel*, dataInicio, dataFim, equipe[] }
 * @param {string} emailCriador
 * @returns {{ ok: boolean, id: string, erro?: string }}
 */
function criarAcao(dados, emailCriador) {
  try {
    _validarDadosAcao(dados);

    var sheet = _getSheet(_ABA_ACOES);
    if (!sheet) throw new Error('Aba Acoes não encontrada. Execute o Setup para criá-la.');

    var id    = _gerarIdAcao();
    var agora = new Date().toISOString();
    var org   = (typeof getOrgConfig === 'function') ? (getOrgConfig().nome || 'CCBJ') : 'CCBJ';

    sheet.appendRow([
      id,
      dados.nome.trim(),
      dados.tipo || 'outro',
      (dados.descricao || '').trim(),
      'rascunho',
      (dados.responsavel || emailCriador || '').trim(),
      JSON.stringify(dados.equipe || []),
      dados.dataInicio || '',
      dados.dataFim    || '',
      org,
      agora,
      agora,
      emailCriador || ''
    ]);

    registrarLog('ACAO_CRIADA', emailCriador || 'sistema', 'Ação criada: ' + dados.nome + ' (ID: ' + id + ')');

    return { ok: true, id: id };

  } catch (e) {
    console.error('[mod_acoes] criarAcao:', e.message);
    return { ok: false, erro: e.message };
  }
}

/**
 * Obtém uma Ação por ID.
 * @param {string} id
 * @returns {Object|null}
 */
function obterAcao(id) {
  try {
    var linha = _acoesEncontrarLinha(id);
    return linha ? _acoesLinhaParaObj(linha) : null;
  } catch (e) {
    console.error('[mod_acoes] obterAcao:', e.message);
    return null;
  }
}

/**
 * Lista Ações com filtros opcionais.
 * @param {Object} filtros — { status, tipo, responsavel }
 * @returns {Array<Object>}
 */
function listarAcoes(filtros) {
  filtros = filtros || {};
  try {
    var sheet = _getSheet(_ABA_ACOES);
    if (!sheet || sheet.getLastRow() < 2) return [];

    var dados = sheet.getRange(2, 1, sheet.getLastRow() - 1, _TOTAL_COLS_ACOES).getValues();

    return dados
      .filter(function(r) { return r[_COL_ACOES.ID]; })
      .filter(function(r) {
        if (filtros.status     && r[_COL_ACOES.STATUS]     !== filtros.status)     return false;
        if (filtros.tipo       && r[_COL_ACOES.TIPO]       !== filtros.tipo)       return false;
        if (filtros.responsavel && r[_COL_ACOES.RESPONSAVEL] !== filtros.responsavel) return false;
        return true;
      })
      .map(_acoesLinhaParaObj);

  } catch (e) {
    console.error('[mod_acoes] listarAcoes:', e.message);
    return [];
  }
}

/**
 * Atualiza campos de uma Ação (não altera status — use mudarStatusAcao).
 * @param {string} id
 * @param {Object} dados
 * @param {string} emailEditor
 * @returns {{ ok: boolean, erro?: string }}
 */
function atualizarAcao(id, dados, emailEditor) {
  try {
    var sheet  = _getSheet(_ABA_ACOES);
    var rowIdx = _acoesEncontrarIndice(id, sheet);
    if (rowIdx < 0) throw new Error('Ação não encontrada: ' + id);

    var range = sheet.getRange(rowIdx, 1, 1, _TOTAL_COLS_ACOES);
    var atual = range.getValues()[0];

    if (dados.nome)       atual[_COL_ACOES.NOME]        = dados.nome.trim();
    if (dados.tipo)       atual[_COL_ACOES.TIPO]         = dados.tipo;
    if (dados.descricao !== undefined) atual[_COL_ACOES.DESCRICAO] = dados.descricao;
    if (dados.responsavel) atual[_COL_ACOES.RESPONSAVEL] = dados.responsavel.trim();
    if (dados.equipe)      atual[_COL_ACOES.EQUIPE]      = JSON.stringify(dados.equipe);
    if (dados.dataInicio)  atual[_COL_ACOES.DATA_INICIO] = dados.dataInicio;
    if (dados.dataFim)     atual[_COL_ACOES.DATA_FIM]    = dados.dataFim;
    atual[_COL_ACOES.ATUALIZADO_EM] = new Date().toISOString();

    range.setValues([atual]);

    return { ok: true };

  } catch (e) {
    console.error('[mod_acoes] atualizarAcao:', e.message);
    return { ok: false, erro: e.message };
  }
}

// ════════════════════════════════════════════════════════════════════
// MÁQUINA DE ESTADOS
// ════════════════════════════════════════════════════════════════════

/**
 * Muda o status de uma Ação respeitando as transições válidas.
 * @param {string} id
 * @param {string} novoStatus
 * @param {string} emailResponsavel
 * @param {string} motivo
 * @returns {{ ok: boolean, erro?: string }}
 */
function mudarStatusAcao(id, novoStatus, emailResponsavel, motivo) {
  try {
    var sheet  = _getSheet(_ABA_ACOES);
    var rowIdx = _acoesEncontrarIndice(id, sheet);
    if (rowIdx < 0) throw new Error('Ação não encontrada: ' + id);

    var range      = sheet.getRange(rowIdx, 1, 1, _TOTAL_COLS_ACOES);
    var atual      = range.getValues()[0];
    var statusAt   = atual[_COL_ACOES.STATUS];
    var validos    = _ACOES_TRANSICOES_VALIDAS[statusAt] || [];

    if (validos.indexOf(novoStatus) < 0) {
      throw new Error(
        'Transição inválida: ' + statusAt + ' → ' + novoStatus +
        '. Permitidos: [' + validos.join(', ') + ']'
      );
    }

    atual[_COL_ACOES.STATUS]        = novoStatus;
    atual[_COL_ACOES.ATUALIZADO_EM] = new Date().toISOString();
    range.setValues([atual]);

    registrarLog(
      'ACAO_STATUS_ALTERADO',
      emailResponsavel || 'sistema',
      'Ação ' + id + ': ' + statusAt + ' → ' + novoStatus + (motivo ? ' (' + motivo + ')' : '')
    );

    return { ok: true };

  } catch (e) {
    console.error('[mod_acoes] mudarStatusAcao:', e.message);
    return { ok: false, erro: e.message };
  }
}

// ════════════════════════════════════════════════════════════════════
// ASSOCIAÇÃO DE RECURSOS (vínculo ação ↔ reservas / contratos / etc)
// ════════════════════════════════════════════════════════════════════

/**
 * Associa um recurso (reserva, contrato, chave…) a uma Ação — vínculo fraco e idempotente.
 * @param {string} acaoId
 * @param {string} tipo     — 'reserva' | 'contrato' | 'chave' | 'tarefa'
 * @param {string} recursoId
 * @param {string} email
 * @returns {{ ok: boolean, erro?: string }}
 */
function associarRecursoAcao(acaoId, tipo, recursoId, email) {
  try {
    var sheet = _getSheet(_ABA_RECURSOS);
    if (!sheet) throw new Error('Aba AcoesRecursos não encontrada. Execute o Setup.');

    // Idempotência: evita duplicatas
    if (sheet.getLastRow() > 1) {
      var existentes = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
      var jaExiste = existentes.some(function(r) {
        return String(r[0]) === String(acaoId) &&
               String(r[1]) === String(tipo)   &&
               String(r[2]) === String(recursoId);
      });
      if (jaExiste) return { ok: true };
    }

    sheet.appendRow([acaoId, tipo, recursoId, new Date().toISOString(), email || '']);
    return { ok: true };

  } catch (e) {
    console.error('[mod_acoes] associarRecursoAcao:', e.message);
    return { ok: false, erro: e.message };
  }
}

/**
 * Retorna todos os recursos vinculados a uma Ação.
 * @param {string} acaoId
 * @returns {Array<{ tipo, recursoId, associadoEm, email }>}
 */
function obterRecursosDaAcao(acaoId) {
  try {
    var sheet = _getSheet(_ABA_RECURSOS);
    if (!sheet || sheet.getLastRow() < 2) return [];

    return sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues()
      .filter(function(r) { return String(r[0]) === String(acaoId) && r[0]; })
      .map(function(r) {
        return { tipo: r[1], recursoId: String(r[2]), associadoEm: String(r[3]), email: r[4] };
      });

  } catch (e) {
    console.error('[mod_acoes] obterRecursosDaAcao:', e.message);
    return [];
  }
}

// ════════════════════════════════════════════════════════════════════
// HELPERS PRIVADOS
// ════════════════════════════════════════════════════════════════════

function _validarDadosAcao(dados) {
  if (!dados || !dados.nome || !dados.nome.trim()) throw new Error('Nome da ação é obrigatório.');
  if (!dados.tipo)        throw new Error('Tipo da ação é obrigatório.');
  if (!dados.responsavel) throw new Error('Responsável é obrigatório.');
}

function _gerarIdAcao() {
  return 'acao_' + new Date().getTime() + '_' + Math.random().toString(36).slice(2, 6);
}

function _acoesEncontrarLinha(id) {
  var sheet = _getSheet(_ABA_ACOES);
  if (!sheet || sheet.getLastRow() < 2) return null;
  var dados = sheet.getRange(2, 1, sheet.getLastRow() - 1, _TOTAL_COLS_ACOES).getValues();
  return dados.find(function(r) { return String(r[_COL_ACOES.ID]) === String(id); }) || null;
}

function _acoesEncontrarIndice(id, sheet) {
  if (!sheet || sheet.getLastRow() < 2) return -1;
  var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function _acoesLinhaParaObj(r) {
  var equipe = [];
  try { equipe = JSON.parse(r[_COL_ACOES.EQUIPE] || '[]'); } catch (_) {}
  return {
    id:           String(r[_COL_ACOES.ID]),
    nome:         r[_COL_ACOES.NOME],
    tipo:         r[_COL_ACOES.TIPO],
    descricao:    r[_COL_ACOES.DESCRICAO],
    status:       r[_COL_ACOES.STATUS],
    responsavel:  r[_COL_ACOES.RESPONSAVEL],
    equipe:       equipe,
    dataInicio:   r[_COL_ACOES.DATA_INICIO] ? String(r[_COL_ACOES.DATA_INICIO]).slice(0, 10) : '',
    dataFim:      r[_COL_ACOES.DATA_FIM]    ? String(r[_COL_ACOES.DATA_FIM]).slice(0, 10)    : '',
    organizacao:  r[_COL_ACOES.ORGANIZACAO],
    criadoEm:     String(r[_COL_ACOES.CRIADO_EM]),
    atualizadoEm: String(r[_COL_ACOES.ATUALIZADO_EM]),
    criadoPor:    r[_COL_ACOES.CRIADO_POR]
  };
}
