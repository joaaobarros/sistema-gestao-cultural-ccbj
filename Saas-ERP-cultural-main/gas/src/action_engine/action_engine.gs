/**
 * @file action_engine/action_engine.gs
 * @layer action_engine
 * @description Núcleo operacional do sistema. Define e gerencia a entidade Ação —
 *              unidade central de integração entre módulos.
 *
 * Uma Ação representa qualquer iniciativa executada pela organização:
 *   curso, oficina, espetáculo, evento, campanha, laboratório, projeto formativo,
 *   ação de difusão, atividade territorial.
 *
 * Todos os demais módulos (reservas, contratos, tarefas, comunicação, indicadores)
 * orbitam a Ação como núcleo integrador.
 *
 * Referências:
 *   docs/01_architecture/action_engine.md
 *   docs/00_vision/glossary.md (§1 Ação)
 *   docs/adr/0001-action-oriented-architecture.md
 *
 * ESTADOS DA AÇÃO (máquina de estados controlada):
 *   rascunho → planejamento → aprovado → em_execucao → concluido → arquivado
 *                                    ↕
 *                                  pausado
 *
 * EVENTOS EMITIDOS (via SystemEvents):
 *   ACTION_CREATED, ACTION_UPDATED, ACTION_STATUS_CHANGED, ACTION_APPROVED,
 *   ACTION_STARTED, ACTION_PAUSED, ACTION_COMPLETED, ACTION_ARCHIVED
 *
 * ESTRUTURA DA ABA "Acoes" (planilha ACOES):
 *   id | nome | tipo | descricao | status | responsavel | equipe_json |
 *   data_inicio | data_fim | organizacao | criado_em | atualizado_em | criado_por
 *
 * BRIDGE (server_bridge_js.html) — expor via GAS.acoes:
 *   criarAcao, obterAcao, listarAcoes, atualizarAcao,
 *   mudarStatusAcao, associarRecurso, obterRecursos
 */

// ════════════════════════════════════════════════════════════════════
// CONSTANTES E CONFIGURAÇÃO
// ════════════════════════════════════════════════════════════════════

var ACTION_ESTADOS = Object.freeze({
  RASCUNHO:    'rascunho',
  PLANEJAMENTO:'planejamento',
  APROVADO:    'aprovado',
  EM_EXECUCAO: 'em_execucao',
  PAUSADO:     'pausado',
  CONCLUIDO:   'concluido',
  ARQUIVADO:   'arquivado'
});

var ACTION_TIPOS = Object.freeze({
  CURSO:               'curso',
  OFICINA:             'oficina',
  ESPETACULO:          'espetaculo',
  EVENTO:              'evento',
  CAMPANHA:            'campanha',
  LABORATORIO:         'laboratorio',
  PROJETO_FORMATIVO:   'projeto_formativo',
  DIFUSAO:             'difusao',
  ATIVIDADE_TERRITORIAL:'atividade_territorial',
  OUTRO:               'outro'
});

// Transições válidas de estado
var _TRANSICOES_VALIDAS = {
  rascunho:    ['planejamento'],
  planejamento:['aprovado', 'rascunho'],
  aprovado:    ['em_execucao', 'planejamento'],
  em_execucao: ['pausado', 'concluido'],
  pausado:     ['em_execucao', 'arquivado'],
  concluido:   ['arquivado'],
  arquivado:   []
};

var ABA_ACOES      = 'Acoes';
var ABA_RECURSOS   = 'AcoesRecursos'; // tabela de associação ação ↔ recursos de outros módulos

// Índices das colunas da aba Acoes (0-based para arrays)
var COL_A = {
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

var TOTAL_COLUNAS_ACOES = 13;

// ════════════════════════════════════════════════════════════════════
// CRUD — AÇÕES
// ════════════════════════════════════════════════════════════════════

/**
 * Cria uma nova Ação.
 *
 * @param {Object} dados — { nome*, tipo*, descricao, responsavel*, dataInicio, dataFim, equipe[] }
 * @param {string} emailCriador
 * @returns {{ ok: boolean, id: string, erro?: string }}
 */
function criarAcao(dados, emailCriador) {
  var lock = obterLockComRetry();
  if (!lock) return { ok: false, erro: 'Sistema ocupado. Tente novamente.' };
  try {
    _validarDadosAcao(dados);

    var sheet = _getSheet(ABA_ACOES);
    if (!sheet) throw new Error('Aba Acoes não encontrada.');

    var id     = _gerarIdAcao();
    var agora  = new Date().toISOString();
    var org    = getOrgConfig().nome;

    sheet.appendRow([
      id,
      dados.nome.trim(),
      dados.tipo || ACTION_TIPOS.OUTRO,
      (dados.descricao || '').trim(),
      ACTION_ESTADOS.RASCUNHO,
      (dados.responsavel || emailCriador || '').trim(),
      JSON.stringify(dados.equipe || []),
      dados.dataInicio || '',
      dados.dataFim    || '',
      org,
      agora,
      agora,
      emailCriador || ''
    ]);

    SystemEvents.emit(SystemEventTypes.ACTION_CREATED, {
      entidade:   'acao',
      entidadeId: id,
      usuario:    emailCriador,
      origem:     'action_engine',
      contexto:   { nome: dados.nome, tipo: dados.tipo }
    });

    try {
      if (typeof AuditoriaService !== 'undefined' && AuditoriaService.registrar) {
        AuditoriaService.registrar({ acao: 'ACAO_CRIADA', entidade: 'acao', entidadeId: id, usuario: emailCriador, detalhes: { nome: dados.nome, tipo: dados.tipo } });
      }
    } catch(_) {}

    Logger.info('action_engine', 'Ação criada', { id: id, nome: dados.nome });

    return { ok: true, id: id };

  } catch (e) {
    Logger.error('action_engine', 'Erro ao criar ação', e.message);
    return { ok: false, erro: e.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Obtém uma Ação por ID.
 * @param {string} id
 * @returns {Object|null}
 */
function obterAcao(id) {
  try {
    var linha = _encontrarLinhaAcao(id);
    if (!linha) return null;
    return _linhaParaObjeto(linha);
  } catch (e) {
    Logger.error('action_engine', 'obterAcao', e.message);
    return null;
  }
}

/**
 * Lista Ações com filtros opcionais.
 * @param {Object} filtros — { status, tipo, responsavel, organizacao }
 * @returns {Array<Object>}
 */
function listarAcoes(filtros) {
  filtros = filtros || {};
  try {
    var sheet = _getSheet(ABA_ACOES);
    if (!sheet || sheet.getLastRow() < 2) return [];

    var dados = sheet.getRange(2, 1, sheet.getLastRow() - 1, TOTAL_COLUNAS_ACOES).getValues();

    return dados
      .filter(function (r) { return r[COL_A.ID]; })
      .filter(function (r) {
        if (filtros.status && r[COL_A.STATUS] !== filtros.status) return false;
        if (filtros.tipo   && r[COL_A.TIPO]   !== filtros.tipo)   return false;
        if (filtros.responsavel && r[COL_A.RESPONSAVEL] !== filtros.responsavel) return false;
        return true;
      })
      .map(_linhaParaObjeto);

  } catch (e) {
    Logger.error('action_engine', 'listarAcoes', e.message);
    return [];
  }
}

/**
 * Atualiza campos de uma Ação (não altera status — use mudarStatusAcao).
 * @param {string} id
 * @param {Object} dados — campos a atualizar
 * @param {string} emailEditor
 * @returns {{ ok: boolean, erro?: string }}
 */
function atualizarAcao(id, dados, emailEditor) {
  try {
    var sheet   = _getSheet(ABA_ACOES);
    var rowIdx  = _encontrarIndiceAcao(id, sheet);
    if (rowIdx < 0) throw new Error('Ação não encontrada: ' + id);

    var range   = sheet.getRange(rowIdx, 1, 1, TOTAL_COLUNAS_ACOES);
    var atual   = range.getValues()[0];

    if (dados.nome)        atual[COL_A.NOME]        = dados.nome.trim();
    if (dados.tipo)        atual[COL_A.TIPO]         = dados.tipo;
    if (dados.descricao !== undefined) atual[COL_A.DESCRICAO] = dados.descricao;
    if (dados.responsavel) atual[COL_A.RESPONSAVEL]  = dados.responsavel.trim();
    if (dados.equipe)      atual[COL_A.EQUIPE]        = JSON.stringify(dados.equipe);
    if (dados.dataInicio)  atual[COL_A.DATA_INICIO]   = dados.dataInicio;
    if (dados.dataFim)     atual[COL_A.DATA_FIM]      = dados.dataFim;
    atual[COL_A.ATUALIZADO_EM] = new Date().toISOString();

    range.setValues([atual]);

    SystemEvents.emit(SystemEventTypes.ACTION_UPDATED, {
      entidade: 'acao', entidadeId: id,
      usuario: emailEditor, origem: 'action_engine',
      contexto: dados
    });

    return { ok: true };

  } catch (e) {
    Logger.error('action_engine', 'atualizarAcao', e.message);
    return { ok: false, erro: e.message };
  }
}

// ════════════════════════════════════════════════════════════════════
// MÁQUINA DE ESTADOS
// ════════════════════════════════════════════════════════════════════

/**
 * Muda o status de uma Ação respeitando as transições válidas.
 *
 * @param {string} id
 * @param {string} novoStatus — um dos ACTION_ESTADOS
 * @param {string} emailResponsavel
 * @param {string} motivo — opcional, justificativa da transição
 * @returns {{ ok: boolean, erro?: string }}
 */
function mudarStatusAcao(id, novoStatus, emailResponsavel, motivo) {
  var lock = obterLockComRetry();
  if (!lock) return { ok: false, erro: 'Sistema ocupado. Tente novamente.' };
  try {
    var sheet  = _getSheet(ABA_ACOES);
    var rowIdx = _encontrarIndiceAcao(id, sheet);
    if (rowIdx < 0) throw new Error('Ação não encontrada: ' + id);

    var range    = sheet.getRange(rowIdx, 1, 1, TOTAL_COLUNAS_ACOES);
    var atual    = range.getValues()[0];
    var statusAtual = atual[COL_A.STATUS];

    var validos = _TRANSICOES_VALIDAS[statusAtual] || [];
    if (validos.indexOf(novoStatus) < 0) {
      throw new Error(
        'Transição inválida: ' + statusAtual + ' → ' + novoStatus +
        '. Permitido: [' + validos.join(', ') + ']'
      );
    }

    atual[COL_A.STATUS]        = novoStatus;
    atual[COL_A.ATUALIZADO_EM] = new Date().toISOString();
    range.setValues([atual]);

    var tipoEvento = _eventoParaStatus(novoStatus);
    SystemEvents.emit(tipoEvento, {
      entidade: 'acao', entidadeId: id,
      usuario: emailResponsavel, origem: 'action_engine',
      contexto: { statusAnterior: statusAtual, novoStatus: novoStatus, motivo: motivo || '' }
    });

    try {
      if (typeof AuditoriaService !== 'undefined' && AuditoriaService.registrar) {
        AuditoriaService.registrar({ acao: 'ACAO_STATUS_' + novoStatus.toUpperCase(), entidade: 'acao', entidadeId: id,
          usuario: emailResponsavel, detalhes: { de: statusAtual, para: novoStatus, motivo: motivo || '' } });
      }
    } catch(_) {}

    Logger.info('action_engine', 'Status alterado', { id: id, de: statusAtual, para: novoStatus });

    return { ok: true };

  } catch (e) {
    Logger.error('action_engine', 'mudarStatusAcao', e.message);
    return { ok: false, erro: e.message };
  } finally {
    lock.releaseLock();
  }
}

// ════════════════════════════════════════════════════════════════════
// INTEGRAÇÃO — ASSOCIAÇÃO DE RECURSOS
// ════════════════════════════════════════════════════════════════════

/**
 * Associa um recurso de outro módulo à Ação (vínculo fraco — sem dependência direta).
 *
 * @param {string} acaoId
 * @param {string} tipo     — 'reserva' | 'contrato' | 'tarefa' | 'chave' | 'relatorio'
 * @param {string} recursoId — ID do recurso no módulo de origem
 * @param {string} email
 * @returns {{ ok: boolean, erro?: string }}
 */
function associarRecurso(acaoId, tipo, recursoId, email) {
  try {
    var sheet = _getSheet(ABA_RECURSOS);
    if (!sheet) throw new Error('Aba AcoesRecursos não encontrada.');

    // Evita duplicatas
    if (sheet.getLastRow() > 1) {
      var dados = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
      var existe = dados.some(function (r) {
        return String(r[0]) === String(acaoId) &&
               String(r[1]) === String(tipo)   &&
               String(r[2]) === String(recursoId);
      });
      if (existe) return { ok: true }; // idempotente
    }

    sheet.appendRow([acaoId, tipo, recursoId, new Date().toISOString(), email || '']);

    return { ok: true };

  } catch (e) {
    Logger.error('action_engine', 'associarRecurso', e.message);
    return { ok: false, erro: e.message };
  }
}

/**
 * Retorna todos os recursos associados a uma Ação.
 * @param {string} acaoId
 * @returns {Array<{ tipo, recursoId, associadoEm, email }>}
 */
function obterRecursosDaAcao(acaoId) {
  try {
    var sheet = _getSheet(ABA_RECURSOS);
    if (!sheet || sheet.getLastRow() < 2) return [];
    var dados = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
    return dados
      .filter(function (r) { return String(r[0]) === String(acaoId); })
      .map(function (r) { return { tipo: r[1], recursoId: r[2], associadoEm: r[3], email: r[4] }; });
  } catch (e) {
    return [];
  }
}

// ════════════════════════════════════════════════════════════════════
// FUNÇÕES AUXILIARES PRIVADAS
// ════════════════════════════════════════════════════════════════════

function _validarDadosAcao(dados) {
  if (!dados || !dados.nome || !dados.nome.trim()) throw new Error('Nome da ação é obrigatório.');
  if (!dados.responsavel && !dados.nome) throw new Error('Responsável é obrigatório.');
}

function _gerarIdAcao() {
  return 'acao_' + new Date().getTime() + '_' + Math.random().toString(36).slice(2, 6);
}

function _encontrarLinhaAcao(id) {
  var sheet = _getSheet(ABA_ACOES);
  if (!sheet || sheet.getLastRow() < 2) return null;
  var dados = sheet.getRange(2, 1, sheet.getLastRow() - 1, TOTAL_COLUNAS_ACOES).getValues();
  var linha = dados.find(function (r) { return String(r[COL_A.ID]) === String(id); });
  return linha || null;
}

function _encontrarIndiceAcao(id, sheet) {
  if (!sheet || sheet.getLastRow() < 2) return -1;
  var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function _linhaParaObjeto(r) {
  var equipe = [];
  try { equipe = JSON.parse(r[COL_A.EQUIPE] || '[]'); } catch (_) {}
  return {
    id:           r[COL_A.ID],
    nome:         r[COL_A.NOME],
    tipo:         r[COL_A.TIPO],
    descricao:    r[COL_A.DESCRICAO],
    status:       r[COL_A.STATUS],
    responsavel:  r[COL_A.RESPONSAVEL],
    equipe:       equipe,
    dataInicio:   r[COL_A.DATA_INICIO] ? String(r[COL_A.DATA_INICIO]).slice(0, 10) : '',
    dataFim:      r[COL_A.DATA_FIM]    ? String(r[COL_A.DATA_FIM]).slice(0, 10)    : '',
    organizacao:  r[COL_A.ORGANIZACAO],
    criadoEm:     r[COL_A.CRIADO_EM],
    atualizadoEm: r[COL_A.ATUALIZADO_EM],
    criadoPor:    r[COL_A.CRIADO_POR]
  };
}

function _eventoParaStatus(status) {
  var mapa = {
    aprovado:    SystemEventTypes.ACTION_APPROVED,
    em_execucao: SystemEventTypes.ACTION_STARTED,
    pausado:     SystemEventTypes.ACTION_PAUSED,
    concluido:   SystemEventTypes.ACTION_COMPLETED,
    arquivado:   SystemEventTypes.ACTION_ARCHIVED
  };
  return mapa[status] || SystemEventTypes.ACTION_STATUS_CHANGED;
}

try { FsmGuardian.registrar('acoes', _TRANSICOES_VALIDAS); } catch(e) {
  console.warn('[action_engine] FsmGuardian.registrar: ' + e.message);
}
