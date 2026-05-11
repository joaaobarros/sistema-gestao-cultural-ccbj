/**
 * @file mod_habilitacoes.gs
 * @description Módulo de Habilitações — credenciamento de proponentes.
 * @layer backend
 * @responsibility Constantes, enums, helpers de schema e adapters de compatibilidade.
 *
 * ARQUITETURA:
 *   O motor real é HabilitacoesEngine (habilitacoes_engine.gs).
 *   O repositório é HabilitacoesRepository (habilitacoes_repository.gs).
 *   As funções abaixo existem como adapters de compatibilidade para callers legados.
 *   Toda nova lógica deve ser adicionada no engine, não aqui.
 *
 * FLUXO OFICIAL:
 *   Frontend → ctrl_hab_* (habilitacoes_controller.gs)
 *            → HabilitacoesEngine
 *            → HabilitacoesRepository
 *
 * ABAS:
 *   Habilitacoes (ACOES) — cadastro de proponentes e seu status de habilitação
 *
 * @depends modules/programacao/habilitacoes_engine.gs,
 *          modules/programacao/habilitacoes_repository.gs
 */

// ══════════════════════════════════════════════════════════════════
// BLOCO: Constantes e Enums (canônico — lidos pelo engine e pelo frontend)
// ══════════════════════════════════════════════════════════════════

// HAB_STATUS mantido como alias de STATUS_HABILITACAO para compatibilidade
var HAB_STATUS = {
  PENDENTE:    'pendente',
  EM_ANALISE:  'em_analise',
  HABILITADO:  'habilitado',
  REJEITADO:   'rejeitado',
  SUSPENSO:    'suspenso',
  CANCELADO:   'cancelado'
};

var HAB_TIPO_PROPONENTE = {
  GRUPO:           'grupo',
  PESSOA_FISICA:   'pessoa_fisica',
  PESSOA_JURIDICA: 'pessoa_juridica',
  COLETIVO:        'coletivo',
  INSTITUICAO:     'instituicao'
};

var HAB_AREA_CULTURAL = {
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

// HAB_COL: índices de coluna (0-indexed) — referência de schema para setup/migrations
var HAB_COL = {
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
// BLOCO: Adapters de compatibilidade
// Callers legados que chamam estas funções diretamente continuam funcionando.
// O canal oficial é habilitacoes_controller.gs → HabilitacoesEngine.
// ══════════════════════════════════════════════════════════════════

function listarHabilitacoes(emailFallback) {
  try {
    var email = obterEmailUsuario(emailFallback || '');
    verificarPermissao('admin', email);
    var dados = HabilitacoesRepository.listarTodos();
    return { ok: true, dados: dados, metricas: HabilitacoesEngine.calcularMetricas(dados) };
  } catch(e) {
    Logger.error('[habilitacoes] listarHabilitacoes: ' + e.message);
    return { ok: false, erro: e.message };
  }
}

function criarHabilitacao(dados, emailFallback) {
  try {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) return { ok: false, erro: 'Usuário não identificado.' };
    var id = HabilitacoesEngine.submeter(dados, email);
    return { ok: true, id: id };
  } catch(e) {
    Logger.error('[habilitacoes] criarHabilitacao: ' + e.message);
    return { ok: false, erro: e.message };
  }
}

function atualizarHabilitacao(id, dados, emailFallback) {
  try {
    var email = obterEmailUsuario(emailFallback || '');
    verificarPermissao('admin', email);
    HabilitacoesEngine.atualizarDados(id, dados, email);
    return { ok: true };
  } catch(e) {
    Logger.error('[habilitacoes] atualizarHabilitacao: ' + e.message);
    return { ok: false, erro: e.message };
  }
}

function mudarStatusHabilitacao(id, novoStatus, observacao, emailFallback) {
  try {
    var email = obterEmailUsuario(emailFallback || '');
    verificarPermissao('admin', email);
    var resultado = HabilitacoesEngine.aplicarTransicao(id, novoStatus, email, observacao || '');
    return { ok: true, resultado: resultado };
  } catch(e) {
    Logger.error('[habilitacoes] mudarStatusHabilitacao: ' + e.message);
    return { ok: false, erro: e.message };
  }
}

function obterMetricasHabilitacoes(emailFallback) {
  try {
    obterEmailUsuario(emailFallback || '');
    var dados = HabilitacoesRepository.listarTodos();
    return { ok: true, metricas: HabilitacoesEngine.calcularMetricas(dados) };
  } catch(e) {
    Logger.error('[habilitacoes] obterMetricasHabilitacoes: ' + e.message);
    return { ok: false, erro: e.message };
  }
}
