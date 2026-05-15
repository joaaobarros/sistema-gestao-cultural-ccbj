/**
 * @file mod_escuta.gs
 * @layer backend
 * @description Sistema de Escuta Institucional Contínua — backend Google Apps Script.
 *              Gerencia pesquisas pulse adaptativas, escuta espontânea, banco de pesquisas,
 *              pesquisas personalizadas, indicadores de clima organizacional, detecção de
 *              risco psicossocial (NR-1), alertas institucionais, governança metodológica
 *              e geração de relatórios.
 * @dependencies SpreadsheetApp, PropertiesService, LockService, CacheService,
 *               mod_permissoes_v2.gs (podeEditar, podeExcluir, podeAcessarModulo), utils.js (_getSheet — opcional)
 * @version 2.0 — assíncrono, permissões, LockService, PropertiesService, governança
 */

// ═══════════════════════════════════════════════════════════════
// CONFIGURAÇÃO E CONSTANTES
// ═══════════════════════════════════════════════════════════════

var _ESCUTA_SHEETS = {
  PERGUNTAS:        'EscutaPerguntas',
  RESPOSTAS:        'EscutaRespostas',
  ESPONTANEA:       'EscutaEspontanea',
  PESQUISAS:        'EscutaPesquisas',
  BANCO_PESQUISAS:  'EscutaTemplates',
  ALERTAS:          'EscutaAlertas',
  SATURACAO:        'EscutaSaturacao',
  PERFIL_ANALITICO: 'EscutaPerfis',
  ACOES:            'EscutaAcoes',
  CONFIG:           'EscutaConfig',
  LOGS:             'LogsEscuta'
};

var _ESCUTA_TURNOS = [
  { nome: 'manha', inicio: 7,  fim: 14 },
  { nome: 'tarde', inicio: 14, fim: 18 },
  { nome: 'noite', inicio: 18, fim: 23 }
];

var _ESCUTA_DIMENSOES = [
  'energia', 'carga', 'clareza', 'apoio',
  'autonomia', 'cultura', 'lideranca', 'risco_psicossocial'
];

var _ESCUTA_DIMENSOES_INVERTIDAS = ['carga', 'risco_psicossocial'];

var _ESCUTA_DEFAULTS = {
  META_FACTOR:                0.25,
  META_MIN:                   10,
  META_MAX:                   25,
  LIMITE_DIA:                 3,
  ANTI_SPAM_HORAS:            4,
  CONFIANCA_MINIMA:           0.15,
  CONFIANCA_REPRESENTATIVA:   0.35,
  GRUPO_MINIMO:               5,
  PERIODO_TENDENCIA:          3,
  TOTAL_COLABORADORES_PADRAO: 20,
  CACHE_TTL_GOVERNANCA:       300,
  CACHE_TTL_DADOS:            60
};

// Dimensões que compõem o Clima Geral (excluem carga e risco_psicossocial)
var _ESCUTA_DIMENSOES_CLIMA_GERAL = ['energia', 'clareza', 'apoio', 'autonomia', 'cultura', 'lideranca'];

// Cache de execução (escopo de uma única chamada GAS — não persiste entre execuções)
var _escutaExecCache = {};

// ═══════════════════════════════════════════════════════════════
// BANCO DE PERGUNTAS PADRÃO (HARDCODED — 24 QUESTÕES / 8 DIMENSÕES)
// ═══════════════════════════════════════════════════════════════

var _BANCO_PERGUNTAS_PADRAO = [
  // ENERGIA
  { id: 'E01', dimensao: 'energia', texto: 'Como está seu nível de energia hoje?',
    tipo: 'escala', tipoTempo: 'instantanea', peso: 1.0, ativa: true, padrao: true },
  { id: 'E02', dimensao: 'energia', texto: 'Você se sente revigorado(a) para as atividades do dia?',
    tipo: 'emoji',  tipoTempo: 'acumulativa', peso: 0.9, ativa: true, padrao: true },
  { id: 'E03', dimensao: 'energia', texto: 'Ao fim do expediente, como está seu nível de energia?',
    tipo: 'escala', tipoTempo: 'final',       peso: 1.1, ativa: true, padrao: true },
  // CARGA
  { id: 'C01', dimensao: 'carga', texto: 'Como você avalia sua carga de trabalho agora?',
    tipo: 'escala', tipoTempo: 'instantanea', peso: 1.0, ativa: true, padrao: true },
  { id: 'C02', dimensao: 'carga', texto: 'Você consegue concluir suas tarefas no tempo disponível?',
    tipo: 'emoji',  tipoTempo: 'acumulativa', peso: 0.9, ativa: true, padrao: true },
  { id: 'C03', dimensao: 'carga', texto: 'Como foi a carga de trabalho hoje, no geral?',
    tipo: 'escala', tipoTempo: 'final',       peso: 1.1, ativa: true, padrao: true },
  // CLAREZA
  { id: 'CL01', dimensao: 'clareza', texto: 'Você tem clareza sobre o que é esperado de você hoje?',
    tipo: 'escala', tipoTempo: 'instantanea', peso: 1.0, ativa: true, padrao: true },
  { id: 'CL02', dimensao: 'clareza', texto: 'As instruções e objetivos do seu trabalho estão claros?',
    tipo: 'emoji',  tipoTempo: 'acumulativa', peso: 0.9, ativa: true, padrao: true },
  { id: 'CL03', dimensao: 'clareza', texto: 'Você terminou o dia sabendo o que precisa fazer amanhã?',
    tipo: 'escala', tipoTempo: 'final',       peso: 1.0, ativa: true, padrao: true },
  // APOIO
  { id: 'AP01', dimensao: 'apoio', texto: 'Você se sente apoiado(a) pela sua equipe hoje?',
    tipo: 'escala', tipoTempo: 'instantanea', peso: 1.0, ativa: true, padrao: true },
  { id: 'AP02', dimensao: 'apoio', texto: 'Quando precisa de ajuda, consegue obtê-la facilmente?',
    tipo: 'emoji',  tipoTempo: 'acumulativa', peso: 0.9, ativa: true, padrao: true },
  { id: 'AP03', dimensao: 'apoio', texto: 'Como foi o suporte recebido da sua liderança hoje?',
    tipo: 'escala', tipoTempo: 'final',       peso: 1.1, ativa: true, padrao: true },
  // AUTONOMIA
  { id: 'AU01', dimensao: 'autonomia', texto: 'Você tem autonomia para tomar decisões no seu trabalho?',
    tipo: 'escala', tipoTempo: 'instantanea', peso: 1.0, ativa: true, padrao: true },
  { id: 'AU02', dimensao: 'autonomia', texto: 'Você se sente livre para organizar seu próprio trabalho?',
    tipo: 'emoji',  tipoTempo: 'acumulativa', peso: 0.9, ativa: true, padrao: true },
  { id: 'AU03', dimensao: 'autonomia', texto: 'O quanto você pôde tomar decisões independentes hoje?',
    tipo: 'escala', tipoTempo: 'final',       peso: 1.0, ativa: true, padrao: true },
  // CULTURA
  { id: 'CU01', dimensao: 'cultura', texto: 'Você se sente respeitado(a) no ambiente de trabalho?',
    tipo: 'escala', tipoTempo: 'instantanea', peso: 1.2, ativa: true, padrao: true },
  { id: 'CU02', dimensao: 'cultura', texto: 'O ambiente do CCBJ reflete os valores que você acredita?',
    tipo: 'emoji',  tipoTempo: 'acumulativa', peso: 1.0, ativa: true, padrao: true },
  { id: 'CU03', dimensao: 'cultura', texto: 'Como você avalia o clima organizacional hoje?',
    tipo: 'escala', tipoTempo: 'final',       peso: 1.1, ativa: true, padrao: true },
  // LIDERANÇA
  { id: 'L01', dimensao: 'lideranca', texto: 'Sua liderança reconhece seu trabalho adequadamente?',
    tipo: 'escala', tipoTempo: 'acumulativa', peso: 1.0, ativa: true, padrao: true },
  { id: 'L02', dimensao: 'lideranca', texto: 'Você se sente ouvido(a) pela sua liderança?',
    tipo: 'emoji',  tipoTempo: 'acumulativa', peso: 1.1, ativa: true, padrao: true },
  { id: 'L03', dimensao: 'lideranca', texto: 'A comunicação da sua liderança é clara e respeitosa?',
    tipo: 'escala', tipoTempo: 'final',       peso: 1.0, ativa: true, padrao: true },
  // RISCO PSICOSSOCIAL (NR-1)
  { id: 'RP01', dimensao: 'risco_psicossocial',
    texto: 'Com que frequência você se sente sobrecarregado(a) a ponto de afetar seu bem-estar?',
    tipo: 'escala', tipoTempo: 'acumulativa', peso: 1.5, ativa: true, padrao: true },
  { id: 'RP02', dimensao: 'risco_psicossocial',
    texto: 'Situações de trabalho afetam negativamente sua saúde física ou emocional?',
    tipo: 'escala', tipoTempo: 'acumulativa', peso: 1.5, ativa: true, padrao: true },
  { id: 'RP03', dimensao: 'risco_psicossocial',
    texto: 'Você se sente seguro(a) para expressar preocupações sem medo de retaliação?',
    tipo: 'escala', tipoTempo: 'final',       peso: 1.3, ativa: true, padrao: true }
];

// ═══════════════════════════════════════════════════════════════
// HELPERS — SHEETS (COM INTEGRAÇÃO _getSheet)
// ═══════════════════════════════════════════════════════════════

/**
 * Retorna a aba solicitada via data layer centralizado (_getSheet).
 * Não acessa SpreadsheetApp diretamente — toda resolução de planilha
 * passa pelo ABA_PARA_MODULO em utils.gs.
 */
function _escutaSheet(nome) {
  try {
    return _getSheet(nome) || null;
  } catch(e) {
    Logger.error('escuta', '_escutaSheet("' + nome + '")', e.message);
    return null;
  }
}

function _escutaInicializarCabecalhos(sh, nome) {
  var cabecalhos = {
    EscutaPerguntas:    ['id','ativa','texto','peso'],
    EscutaRespostas:    ['id','perguntaId','emailHash','email','resposta','dimensao','tipo',
                         'tipoTempo','timestamp','turno','progressoTurno','periodo','setor',
                         'anonimo','sourcePesquisaId'],
    EscutaEspontanea:   ['id','emailHash','email','categoria','texto','sentimento',
                         'anonimo','timestamp','setor'],
    EscutaPesquisas:    ['id','titulo','perguntas','criadoPor','periodoInicio','periodoFim',
                         'status','prioridade','criadoEm','direcionamento',
                         'padrao','elegibilidade','regras_saturacao'],
    EscutaTemplates:    ['id','titulo','descricao','perguntas','tema','criadoPor','criadoEm'],
    EscutaAlertas:      ['id','tipo','dimensao','nivel','descricao','dados','timestamp',
                         'status','responsavel','acao','resolvidoEm'],
    EscutaSaturacao:    ['periodo','dimensao','coletados','meta','saturado'],
    EscutaPerfis:       ['email','genero','raca','orientacaoSexual','faixaSalarial','vinculo',
                         'nivel','tempoCasa','regiao','distancia','atualizadoEm'],
    EscutaAcoes:        ['id','alertaId','descricao','responsavel','prazo','status',
                         'criadoEm','concluidoEm'],
    EscutaConfig:       ['chave','valor','atualizadoEm'],
    LogsEscuta:         ['timestamp','email','acao','dados']
  };
  var cols = cabecalhos[nome];
  if (cols) sh.appendRow(cols);
}

function _escutaID() {
  return 'ESC-' + new Date().getTime() + '-' + Math.random().toString(36).substr(2, 6).toUpperCase();
}

/**
 * Hash djb2 em base36 para anonimização. Estrutura preparada para
 * migração futura a hash com salt (substituir str por str + salt).
 */
function _escutaEmailHash(email) {
  var str = email.toLowerCase().trim();
  // Para adicionar salt no futuro: str = str + PropertiesService.getScriptProperties().getProperty('ESCUTA_HASH_SALT') || '';
  var hash = 0;
  for (var i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return 'U' + Math.abs(hash).toString(36).toUpperCase();
}

function _escutaSheetToArray(sh) {
  if (!sh) return [];
  try {
    var data = sh.getDataRange().getValues();
    if (data.length < 2) return [];
    var headers = data[0];
    return data.slice(1).map(function(row) {
      var obj = {};
      headers.forEach(function(h, i) { obj[h] = row[i]; });
      return obj;
    });
  } catch(e) {
    console.warn('[Escuta] _escutaSheetToArray: ' + e.message);
    return [];
  }
}

function _escutaPeriodoAtual() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function _escutaDataHoje() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Cache de leitura de aba (escopo de execução — reset automático a cada chamada GAS)
function _escutaLerSheet(nome) {
  if (_escutaExecCache[nome]) return _escutaExecCache[nome];
  var dados = _escutaSheetToArray(_escutaSheet(nome));
  _escutaExecCache[nome] = dados;
  return dados;
}

function _escutaInvalidarCacheSheet(nome) {
  if (nome) delete _escutaExecCache[nome];
  else _escutaExecCache = {};
}

// ═══════════════════════════════════════════════════════════════
// SISTEMA TEMPORAL — TURNOS E PROGRESSO
// ═══════════════════════════════════════════════════════════════

function _escutaTurnoAtual() {
  var agora = new Date();
  var hora  = agora.getHours() + agora.getMinutes() / 60;
  for (var i = 0; i < _ESCUTA_TURNOS.length; i++) {
    var t = _ESCUTA_TURNOS[i];
    if (hora >= t.inicio && hora < t.fim) return t;
  }
  return _ESCUTA_TURNOS[0];
}

function _escutaProgressoTurno() {
  var agora = new Date();
  var hora  = agora.getHours() + agora.getMinutes() / 60;
  var turno = _escutaTurnoAtual();
  var prog  = (hora - turno.inicio) / (turno.fim - turno.inicio);
  return Math.max(0, Math.min(1, prog));
}

function _escutaPerguntaValidaTemporalmente(tipoTempo) {
  var prog = _escutaProgressoTurno();
  if (tipoTempo === 'instantanea') return true;
  if (tipoTempo === 'acumulativa') return prog >= 0.50;
  if (tipoTempo === 'final')       return prog >= 0.75;
  return false;
}

function _escutaMomentoPropicio() {
  var prog = _escutaProgressoTurno();
  return prog >= 0.10 && prog <= 0.95;
}

// ═══════════════════════════════════════════════════════════════
// TOTAL DE COLABORADORES — PropertiesService (sem dependência de aba)
// ═══════════════════════════════════════════════════════════════

function _escutaTotalColaboradores() {
  try {
    var total = parseInt(
      PropertiesService.getScriptProperties().getProperty('TOTAL_COLABORADORES') || '0'
    );
    return total > 0 ? total : _ESCUTA_DEFAULTS.TOTAL_COLABORADORES_PADRAO;
  } catch(e) {
    return _ESCUTA_DEFAULTS.TOTAL_COLABORADORES_PADRAO;
  }
}

function definirTotalColaboradoresEscuta(total) {
  try {
    var email = obterEmailUsuario('');
    if (!verificarPermissaoEscuta(email, 'editar')) {
      return { ok: false, msg: 'Permissão negada.' };
    }
    PropertiesService.getScriptProperties().setProperty('TOTAL_COLABORADORES', String(parseInt(total) || 0));
    _escutaLog('definirTotalColaboradores', email, { total: total });
    return { ok: true };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// SEGURANÇA — PERMISSÕES
// ═══════════════════════════════════════════════════════════════

/**
 * Verifica permissão de escuta para ação crítica via PermissoesService (núcleo oficial).
 * Ações: 'visualizar', 'editar', 'excluir'
 */
function verificarPermissaoEscuta(email, acao) {
  if (!email) return false;
  try {
    return PermissoesService.pode(email, 'escuta', acao || 'visualizar');
  } catch(e) {
    console.warn('[EscutaPermissao] ' + e.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// CONFIGURAÇÃO DO SISTEMA
// ═══════════════════════════════════════════════════════════════

function obterConfiguracaoEscuta() {
  try {
    var sh   = _escutaSheet(_ESCUTA_SHEETS.CONFIG);
    var rows = _escutaSheetToArray(sh);
    var cfg  = {};
    rows.forEach(function(r) { if (r.chave) cfg[r.chave] = r.valor; });

    var defaults = {
      ativo:              'true',
      ativoEspontanea:    'true',
      ativoPadrao:        'true',
      ativoPersonalizado: 'true',
      limiteDia:          String(_ESCUTA_DEFAULTS.LIMITE_DIA),
      antiSpamHoras:      String(_ESCUTA_DEFAULTS.ANTI_SPAM_HORAS),
      confiancaMinima:    String(_ESCUTA_DEFAULTS.CONFIANCA_MINIMA),
      grupoMinimo:        String(_ESCUTA_DEFAULTS.GRUPO_MINIMO),
      metaFactor:         String(_ESCUTA_DEFAULTS.META_FACTOR)
    };
    Object.keys(defaults).forEach(function(k) {
      if (!(k in cfg)) cfg[k] = defaults[k];
    });
    return { ok: true, dados: cfg };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

function salvarConfiguracaoEscuta(configs) {
  try {
    var email = obterEmailUsuario('');
    if (!verificarPermissaoEscuta(email, 'editar')) return { ok: false, msg: 'Permissão negada.' };

    var sh    = _escutaSheet(_ESCUTA_SHEETS.CONFIG);
    var rows  = _escutaSheetToArray(sh);
    var agora = new Date().toISOString();

    Object.keys(configs).forEach(function(chave) {
      var idx = rows.findIndex(function(r) { return r.chave === chave; });
      if (idx >= 0) {
        var rowNum = idx + 2;
        sh.getRange(rowNum, 2).setValue(String(configs[chave]));
        sh.getRange(rowNum, 3).setValue(agora);
      } else {
        sh.appendRow([chave, String(configs[chave]), agora]);
      }
    });

    _escutaLog('salvarConfig', email, configs);
    return { ok: true };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

function _escutaCfg(chave) {
  var res = obterConfiguracaoEscuta();
  return res.ok ? res.dados[chave] : null;
}

// ═══════════════════════════════════════════════════════════════
// BANCO DE PERGUNTAS — GESTÃO
// ═══════════════════════════════════════════════════════════════

function obterPerguntasEscuta() {
  try {
    var sh   = _escutaSheet(_ESCUTA_SHEETS.PERGUNTAS);
    var rows = _escutaSheetToArray(sh);

    var overrides = {};
    rows.forEach(function(r) { if (r.id) overrides[r.id] = r; });

    var perguntas = _BANCO_PERGUNTAS_PADRAO.map(function(p) {
      if (overrides[p.id]) {
        return Object.assign({}, p, {
          ativa: overrides[p.id].ativa === 'false' ? false : Boolean(overrides[p.id].ativa !== false),
          texto: overrides[p.id].texto || p.texto,
          peso:  parseFloat(overrides[p.id].peso) || p.peso
        });
      }
      return Object.assign({}, p);
    });

    return { ok: true, dados: perguntas };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

function atualizarPerguntaEscuta(id, campos) {
  try {
    var email = obterEmailUsuario('');
    if (!verificarPermissaoEscuta(email, 'editar')) return { ok: false, msg: 'Permissão negada.' };

    var sh    = _escutaSheet(_ESCUTA_SHEETS.PERGUNTAS);
    var rows  = _escutaSheetToArray(sh);
    var idx   = rows.findIndex(function(r) { return r.id === id; });

    if (idx >= 0) {
      if ('ativa' in campos) sh.getRange(idx + 2, 2).setValue(String(campos.ativa));
    } else {
      sh.appendRow([id, String(campos.ativa !== undefined ? campos.ativa : true),
                    campos.texto || '', campos.peso || 1.0]);
    }
    _escutaLog('atualizarPergunta', email, { id: id, campos: campos });
    return { ok: true };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// SATURAÇÃO
// ═══════════════════════════════════════════════════════════════

function _escutaMetaDimensao() {
  var total = _escutaTotalColaboradores();
  var cfg   = obterConfiguracaoEscuta().dados || {};
  var fator = parseFloat(cfg.metaFactor) || _ESCUTA_DEFAULTS.META_FACTOR;
  return Math.max(_ESCUTA_DEFAULTS.META_MIN, Math.min(_ESCUTA_DEFAULTS.META_MAX, Math.round(total * fator)));
}

function _escutaVerificarSaturacao(dimensao, periodo) {
  periodo  = periodo || _escutaPeriodoAtual();
  var rows = _escutaLerSheet(_ESCUTA_SHEETS.SATURACAO);
  var reg  = rows.find(function(r) { return r.periodo === periodo && r.dimensao === dimensao; });
  if (!reg) return false;
  return reg.saturado === 'true' || reg.saturado === true;
}

function _escutaIncrementarSaturacao(dimensao, periodo) {
  periodo  = periodo || _escutaPeriodoAtual();
  var meta = _escutaMetaDimensao();
  var sh   = _escutaSheet(_ESCUTA_SHEETS.SATURACAO);
  var rows = _escutaSheetToArray(sh);
  var idx  = rows.findIndex(function(r) { return r.periodo === periodo && r.dimensao === dimensao; });

  if (idx >= 0) {
    var coletados = parseInt(rows[idx].coletados || 0) + 1;
    sh.getRange(idx + 2, 3).setValue(coletados);
    sh.getRange(idx + 2, 4).setValue(meta);
    sh.getRange(idx + 2, 5).setValue(String(coletados >= meta));
  } else {
    sh.appendRow([periodo, dimensao, 1, meta, String(1 >= meta)]);
  }
  _escutaInvalidarCacheSheet(_ESCUTA_SHEETS.SATURACAO);
}

function obterSaturacaoEscuta() {
  try {
    var periodo = _escutaPeriodoAtual();
    var rows    = _escutaLerSheet(_ESCUTA_SHEETS.SATURACAO);
    var atual   = rows.filter(function(r) { return r.periodo === periodo; });
    return { ok: true, dados: atual, meta: _escutaMetaDimensao() };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// PULSE — SELEÇÃO DE PERGUNTA
// ═══════════════════════════════════════════════════════════════

function obterPerguntaPulse() {
  try {
    var email = obterEmailUsuario('');
    var cfg   = obterConfiguracaoEscuta().dados || {};

    if (cfg.ativo === 'false') return { ok: true, pergunta: null, motivo: 'sistema_inativo' };

    if (cfg.ativoPadrao === 'false') {
      var pessoal = _escutaObterPesquisaPersonalizadaAtiva();
      if (!pessoal) return { ok: true, pergunta: null, motivo: 'padrao_inativo' };
    }

    var pesquisaPersonalizada = _escutaObterPesquisaPersonalizadaAtiva(email);
    if (pesquisaPersonalizada && cfg.ativoPersonalizado !== 'false') {
      var pergPersonal = _escutaProximaPerguntaPesquisa(pesquisaPersonalizada, email);
      if (pergPersonal) return { ok: true, pergunta: pergPersonal, sourcePesquisaId: pesquisaPersonalizada.id };
    }

    if (!_escutaMomentoPropicio()) return { ok: true, pergunta: null, motivo: 'momento_impropicio' };

    var hoje = _escutaDataHoje();
    var resp = _escutaLerSheet(_ESCUTA_SHEETS.RESPOSTAS);
    var hashU = _escutaEmailHash(email);
    var respostasHoje = resp.filter(function(r) {
      return r.emailHash === hashU && String(r.timestamp).startsWith(hoje);
    });
    var limite = parseInt(cfg.limiteDia) || _ESCUTA_DEFAULTS.LIMITE_DIA;
    if (respostasHoje.length >= limite) return { ok: true, pergunta: null, motivo: 'limite_dia' };

    var antiSpam = parseFloat(cfg.antiSpamHoras) || _ESCUTA_DEFAULTS.ANTI_SPAM_HORAS;
    if (respostasHoje.length > 0) {
      var ultima = respostasHoje.sort(function(a, b) {
        return new Date(b.timestamp) - new Date(a.timestamp);
      })[0];
      var diffH = (new Date() - new Date(ultima.timestamp)) / 3600000;
      if (diffH < antiSpam) return { ok: true, pergunta: null, motivo: 'anti_spam' };
    }

    var todasPerguntas = obterPerguntasEscuta().dados || [];
    var perguntas = todasPerguntas.filter(function(p) {
      return p.ativa !== false && p.ativa !== 'false' && p.padrao;
    });

    perguntas = perguntas.filter(function(p) {
      return _escutaPerguntaValidaTemporalmente(p.tipoTempo);
    });

    var periodo = _escutaPeriodoAtual();
    perguntas = perguntas.filter(function(p) {
      return !_escutaVerificarSaturacao(p.dimensao, periodo);
    });

    var idsRespondidos = {};
    resp.filter(function(r) {
      return r.emailHash === hashU && (new Date() - new Date(r.timestamp)) < 172800000;
    }).forEach(function(r) { idsRespondidos[r.perguntaId] = true; });
    perguntas = perguntas.filter(function(p) { return !idsRespondidos[p.id]; });

    if (!perguntas.length) return { ok: true, pergunta: null, motivo: 'sem_perguntas' };

    var contagemPorDimensao = {};
    _ESCUTA_DIMENSOES.forEach(function(d) { contagemPorDimensao[d] = 0; });
    resp.filter(function(r) {
      return String(r.timestamp).startsWith(periodo.substring(0, 7));
    }).forEach(function(r) {
      if (contagemPorDimensao[r.dimensao] !== undefined) contagemPorDimensao[r.dimensao]++;
    });

    perguntas.sort(function(a, b) {
      return (contagemPorDimensao[a.dimensao] || 0) - (contagemPorDimensao[b.dimensao] || 0);
    });

    return {
      ok: true,
      pergunta:  perguntas[0],
      turno:     _escutaTurnoAtual().nome,
      progresso: _escutaProgressoTurno()
    };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

function _escutaObterPesquisaPersonalizadaAtiva(email) {
  var hoje = _escutaDataHoje();
  var rows = _escutaLerSheet(_ESCUTA_SHEETS.PESQUISAS);
  var ativas = rows.filter(function(r) {
    return r.status === 'ativo' &&
      (String(r.periodoInicio) <= hoje) &&
      (String(r.periodoFim)    >= hoje);
  });
  if (!ativas.length) return null;

  var perfilEmail = email ? _escutaObterPerfilPorEmail(email) : null;
  ativas = ativas.filter(function(r) {
    try { r.direcionamento = JSON.parse(r.direcionamento || 'null'); } catch(e) { r.direcionamento = null; }
    if (!r.direcionamento) return true;
    return _escutaUsuarioElegivel(email, perfilEmail, r.direcionamento);
  });

  if (!ativas.length) return null;

  ativas.sort(function(a, b) {
    var pA = (parseFloat(a.prioridade) || 1) + (a.direcionamento ? 100 : 0);
    var pB = (parseFloat(b.prioridade) || 1) + (b.direcionamento ? 100 : 0);
    return pB - pA;
  });

  var p = ativas[0];
  try { p.perguntas = JSON.parse(p.perguntas); } catch(e) { p.perguntas = []; }
  return p;
}

function _escutaObterPerfilPorEmail(email) {
  var rows = _escutaLerSheet(_ESCUTA_SHEETS.PERFIL_ANALITICO);
  return rows.find(function(r) { return r.email === email; }) || null;
}

function _escutaUsuarioElegivel(email, perfil, direcionamento) {
  if (!direcionamento) return true;

  if (direcionamento.usuarios && direcionamento.usuarios.length > 0) {
    return direcionamento.usuarios.indexOf(email) >= 0;
  }

  if (!perfil) return false;

  function _match(campo, valorPerfil) {
    if (!direcionamento[campo] || !direcionamento[campo].length) return true;
    return direcionamento[campo].indexOf(valorPerfil || '') >= 0;
  }

  return _match('setores',       perfil.setor         || '') &&
         _match('nivelFuncao',   perfil.nivel         || '') &&
         _match('vinculo',       perfil.vinculo       || '') &&
         _match('faixaSalarial', perfil.faixaSalarial || '') &&
         _match('tempoCasa',     perfil.tempoCasa     || '') &&
         _match('regioes',       perfil.regiao        || '');
}

function _escutaProximaPerguntaPesquisa(pesquisa, email) {
  var hashU = _escutaEmailHash(email);
  var resp  = _escutaLerSheet(_ESCUTA_SHEETS.RESPOSTAS);
  var respondidas = {};
  resp.filter(function(r) {
    return r.emailHash === hashU && r.sourcePesquisaId === pesquisa.id;
  }).forEach(function(r) { respondidas[r.perguntaId] = true; });

  var pendentes = (pesquisa.perguntas || []).filter(function(p) {
    return !respondidas[p.id] && p.ativa !== false && p.ativa !== 'false' &&
      _escutaPerguntaValidaTemporalmente(p.tipoTempo || 'instantanea');
  });
  return pendentes.length ? pendentes[0] : null;
}

// ═══════════════════════════════════════════════════════════════
// REGISTRAR RESPOSTA PULSE — LEVE E RÁPIDO (sem alertas síncronos)
// ═══════════════════════════════════════════════════════════════

function registrarRespostaPulse(dados) {
  var lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(5000)) return { ok: false, msg: 'Sistema ocupado. Tente novamente.' };

    var email = typeof _resolverEmailReal === 'function'
      ? _resolverEmailReal(dados.sessao || dados.email || '')
      : obterEmailUsuario('');
    var cfg   = obterConfiguracaoEscuta().dados || {};
    if (cfg.ativo === 'false') return { ok: false, msg: 'Sistema inativo.' };
    if (cfg.ativoPadrao === 'false' && !dados.sourcePesquisaId) return { ok: false, msg: 'Pesquisas padrão inativas.' };

    var sh    = _escutaSheet(_ESCUTA_SHEETS.RESPOSTAS);
    var turno = _escutaTurnoAtual();
    var agora = new Date();
    var hashU = _escutaEmailHash(email);
    var id    = _escutaID();

    sh.appendRow([
      id,
      dados.perguntaId   || '',
      hashU,
      dados.anonimo ? '' : email,
      dados.resposta,
      dados.dimensao     || '',
      dados.tipo         || '',
      dados.tipoTempo    || '',
      agora.toISOString(),
      turno.nome,
      _escutaProgressoTurno().toFixed(3),
      _escutaPeriodoAtual(),
      dados.setor        || '',
      dados.anonimo ? 'true' : 'false',
      dados.sourcePesquisaId || ''
    ]);

    _escutaIncrementarSaturacao(dados.dimensao, _escutaPeriodoAtual());
    _escutaInvalidarCacheSheet(_ESCUTA_SHEETS.RESPOSTAS);
    // Alertas processados de forma assíncrona via trigger temporal — não aqui

    return { ok: true, id: id };
  } catch(e) {
    return { ok: false, msg: e.message };
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}

// ═══════════════════════════════════════════════════════════════
// ESCUTA ESPONTÂNEA
// ═══════════════════════════════════════════════════════════════

function registrarEscutaEspontanea(dados) {
  try {
    var email = typeof _resolverEmailReal === 'function'
      ? _resolverEmailReal(dados.sessao || dados.email || '')
      : obterEmailUsuario('');
    var cfg   = obterConfiguracaoEscuta().dados || {};
    if (cfg.ativo === 'false' || cfg.ativoEspontanea === 'false') {
      return { ok: false, msg: 'Escuta espontânea inativa.' };
    }

    var sh        = _escutaSheet(_ESCUTA_SHEETS.ESPONTANEA);
    var hashU     = _escutaEmailHash(email);
    var id        = _escutaID();
    var sentimento = _escutaAnalisarSentimento(dados.texto || '');

    sh.appendRow([
      id,
      hashU,
      dados.anonimo ? '' : email,
      dados.categoria || '',
      dados.texto     || '',
      sentimento,
      dados.anonimo ? 'true' : 'false',
      new Date().toISOString(),
      dados.setor || ''
    ]);
    _escutaInvalidarCacheSheet(_ESCUTA_SHEETS.ESPONTANEA);

    return { ok: true, id: id };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

function _escutaAnalisarSentimento(texto) {
  if (!texto) return 'neutro';
  var t   = texto.toLowerCase();
  var pos = ['bom','ótimo','ótima','excelente','feliz','satisfeito','satisfeita','positivo',
             'grato','grata','amo','adoro','maravilhoso','maravilhosa','alegre','motivado','motivada'];
  var neg = ['ruim','péssimo','péssima','difícil','sobrecarregado','sobrecarregada','cansado',
             'cansada','triste','frustrado','frustrada','ansioso','ansiosa','estressado',
             'estressada','injusto','injusta','problema','assédio','conflito','negativo'];
  var pScore = pos.filter(function(w) { return t.indexOf(w) >= 0; }).length;
  var nScore = neg.filter(function(w) { return t.indexOf(w) >= 0; }).length;
  if (pScore > nScore) return 'positivo';
  if (nScore > pScore) return 'negativo';
  return 'neutro';
}

// ═══════════════════════════════════════════════════════════════
// PADRONIZAÇÃO E VALIDAÇÃO DE PESQUISAS
// ═══════════════════════════════════════════════════════════════

/**
 * Normaliza uma pesquisa antes de salvar.
 * Padrão: auto-configura completamente (sem configuração manual).
 * Custom: valida campos obrigatórios e bloqueia se incompleto.
 */
function normalizarPesquisaEscuta(pesquisa) {
  var erros = [];

  if (pesquisa.padrao) {
    // Pesquisas padrão: todos os parâmetros são derivados do banco hardcoded
    pesquisa.elegibilidade    = 'todos';
    pesquisa.prioridade       = 1;
    pesquisa.regras_saturacao = 'automatica';
    pesquisa.perguntas = (pesquisa.perguntas || []).map(function(p) {
      var ref = _BANCO_PERGUNTAS_PADRAO.find(function(b) { return b.id === p.id; });
      if (ref) return Object.assign({}, ref, { ativa: p.ativa !== false });
      return p;
    });
    if (!pesquisa.perguntas.length) erros.push('Pesquisa padrão sem perguntas referenciadas do banco.');
    return { ok: erros.length === 0, pesquisa: pesquisa, erros: erros };
  }

  // Pesquisas custom: campos obrigatórios
  if (!pesquisa.titulo)       erros.push('Título obrigatório.');
  if (!pesquisa.prioridade)   erros.push('Prioridade obrigatória para pesquisa customizada.');
  if (!pesquisa.elegibilidade) erros.push('Elegibilidade obrigatória para pesquisa customizada.');
  if (!pesquisa.perguntas || pesquisa.perguntas.length === 0) {
    erros.push('Pesquisa sem perguntas.');
  } else {
    pesquisa.perguntas.forEach(function(p, i) {
      var n = 'Pergunta ' + (i + 1) + ':';
      if (!p.dimensao)  erros.push(n + ' dimensão obrigatória.');
      if (!p.tipoTempo) erros.push(n + ' tipoTempo obrigatório.');
      if (!p.peso)      erros.push(n + ' peso obrigatório.');
      if (p.dimensao && _ESCUTA_DIMENSOES.indexOf(p.dimensao) < 0) {
        erros.push(n + ' dimensão "' + p.dimensao + '" inválida.');
      }
      if (p.tipoTempo && ['instantanea','acumulativa','final'].indexOf(p.tipoTempo) < 0) {
        erros.push(n + ' tipoTempo "' + p.tipoTempo + '" inválido.');
      }
    });
  }

  if (erros.length > 0) return { ok: false, pesquisa: null, erros: erros };

  // Defaults opcionais
  pesquisa.regras_saturacao = pesquisa.regras_saturacao || 'padrao';

  return { ok: true, pesquisa: pesquisa, erros: [] };
}

/**
 * Sugere parâmetros para uma pesquisa custom com base no objetivo informado.
 * Usado pelo construtor guiado (etapa 3+).
 */
function sugerirParametrosPesquisa(objetivo, publico) {
  var mapa = {
    'burnout':       { dimensoes: ['energia','carga','risco_psicossocial'], tipoTempo: 'acumulativa' },
    'clima':         { dimensoes: ['cultura','apoio','lideranca'],          tipoTempo: 'final'       },
    'autonomia':     { dimensoes: ['autonomia','clareza'],                  tipoTempo: 'acumulativa' },
    'liderança':     { dimensoes: ['lideranca','apoio','clareza'],          tipoTempo: 'final'       },
    'sobrecarga':    { dimensoes: ['carga','energia'],                      tipoTempo: 'instantanea' },
    'psicossocial':  { dimensoes: ['risco_psicossocial'],                   tipoTempo: 'acumulativa' }
  };

  var sugestao = null;
  Object.keys(mapa).forEach(function(k) {
    if (objetivo && objetivo.toLowerCase().indexOf(k) >= 0) {
      sugestao = mapa[k];
    }
  });

  if (!sugestao) sugestao = { dimensoes: ['energia','carga','apoio'], tipoTempo: 'acumulativa' };

  // Filtra perguntas do banco compatíveis com as dimensões sugeridas
  var perguntasSugeridas = _BANCO_PERGUNTAS_PADRAO.filter(function(p) {
    return sugestao.dimensoes.indexOf(p.dimensao) >= 0 &&
           p.tipoTempo === sugestao.tipoTempo;
  });

  return {
    ok: true,
    sugestao: {
      dimensoes:         sugestao.dimensoes,
      tipoTempo:         sugestao.tipoTempo,
      perguntas:         perguntasSugeridas,
      prioridade:        1,
      elegibilidade:     publico || 'todos',
      regras_saturacao:  'padrao'
    }
  };
}

// ═══════════════════════════════════════════════════════════════
// PESQUISAS PERSONALIZADAS
// ═══════════════════════════════════════════════════════════════

function obterPesquisasEscuta() {
  try {
    var rows = _escutaLerSheet(_ESCUTA_SHEETS.PESQUISAS);
    rows.forEach(function(r) {
      try { r.perguntas = JSON.parse(r.perguntas); } catch(e) { r.perguntas = []; }
    });
    return { ok: true, dados: rows };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

function salvarPesquisaEscuta(dados) {
  var lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(8000)) return { ok: false, msg: 'Sistema ocupado. Tente novamente.' };

    var email = typeof _resolverEmailReal === 'function'
      ? _resolverEmailReal(dados.sessao || dados.email || '')
      : obterEmailUsuario('');
    if (!verificarPermissaoEscuta(email, 'editar')) return { ok: false, msg: 'Permissão negada.' };

    // Normalizar e validar antes de salvar
    var norm = normalizarPesquisaEscuta(dados);
    if (!norm.ok) return { ok: false, msg: norm.erros.join(' | '), erros: norm.erros };
    dados = norm.pesquisa;

    var sh = _escutaSheet(_ESCUTA_SHEETS.PESQUISAS);

    if (dados.id) {
      var rows = _escutaSheetToArray(sh);
      var idx  = rows.findIndex(function(r) { return r.id === dados.id; });
      if (idx >= 0) {
        var row = idx + 2;
        sh.getRange(row, 2).setValue(dados.titulo        || '');
        sh.getRange(row, 3).setValue(JSON.stringify(dados.perguntas || []));
        sh.getRange(row, 4).setValue(dados.criadoPor     || email);
        sh.getRange(row, 5).setValue(dados.periodoInicio || '');
        sh.getRange(row, 6).setValue(dados.periodoFim    || '');
        sh.getRange(row, 7).setValue(dados.status        || 'ativo');
        sh.getRange(row, 8).setValue(dados.prioridade    || 1);
        _escutaInvalidarCacheSheet(_ESCUTA_SHEETS.PESQUISAS);
        return { ok: true };
      }
    }

    var id = _escutaID();
    sh.appendRow([
      id,
      dados.titulo        || '',
      JSON.stringify(dados.perguntas || []),
      email,
      dados.periodoInicio || '',
      dados.periodoFim    || '',
      dados.status        || 'ativo',
      dados.prioridade    || 1,
      new Date().toISOString(),
      JSON.stringify(dados.direcionamento || null),
      dados.padrao        ? 'true' : 'false',
      dados.elegibilidade || 'todos',
      dados.regras_saturacao || 'padrao'
    ]);

    _escutaLog('salvarPesquisa', email, { id: id, titulo: dados.titulo });
    _escutaInvalidarCacheSheet(_ESCUTA_SHEETS.PESQUISAS);
    return { ok: true, id: id };
  } catch(e) {
    return { ok: false, msg: e.message };
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}

function excluirPesquisaEscuta(id, sessaoOuEmail) {
  try {
    var email = typeof _resolverEmailReal === 'function'
      ? _resolverEmailReal(sessaoOuEmail || '')
      : obterEmailUsuario('');
    if (!verificarPermissaoEscuta(email, 'excluir')) return { ok: false, msg: 'Permissão negada.' };

    var sh   = _escutaSheet(_ESCUTA_SHEETS.PESQUISAS);
    var rows = _escutaSheetToArray(sh);
    var idx  = rows.findIndex(function(r) { return r.id === id; });
    if (idx < 0) return { ok: false, msg: 'Pesquisa não encontrada.' };

    sh.deleteRow(idx + 2);
    _escutaLog('excluirPesquisa', email, { id: id });
    _escutaInvalidarCacheSheet(_ESCUTA_SHEETS.PESQUISAS);
    return { ok: true };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// BANCO DE PESQUISAS (TEMPLATES)
// ═══════════════════════════════════════════════════════════════

function obterBancoPesquisas() {
  try {
    var rows = _escutaLerSheet(_ESCUTA_SHEETS.BANCO_PESQUISAS);
    rows.forEach(function(r) {
      try { r.perguntas = JSON.parse(r.perguntas); } catch(e) { r.perguntas = []; }
    });
    return { ok: true, dados: rows };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

function salvarTemplateBancoPesquisas(dados) {
  try {
    var email = obterEmailUsuario('');
    if (!verificarPermissaoEscuta(email, 'editar')) return { ok: false, msg: 'Permissão negada.' };

    var sh = _escutaSheet(_ESCUTA_SHEETS.BANCO_PESQUISAS);
    var id = dados.id || _escutaID();

    if (dados.id) {
      var rows = _escutaSheetToArray(sh);
      var idx  = rows.findIndex(function(r) { return r.id === dados.id; });
      if (idx >= 0) {
        sh.getRange(idx + 2, 2).setValue(dados.titulo    || '');
        sh.getRange(idx + 2, 3).setValue(dados.descricao || '');
        sh.getRange(idx + 2, 4).setValue(JSON.stringify(dados.perguntas || []));
        sh.getRange(idx + 2, 5).setValue(dados.tema      || '');
        _escutaInvalidarCacheSheet(_ESCUTA_SHEETS.BANCO_PESQUISAS);
        return { ok: true };
      }
    }

    sh.appendRow([id, dados.titulo || '', dados.descricao || '',
                  JSON.stringify(dados.perguntas || []), dados.tema || '',
                  email, new Date().toISOString()]);
    _escutaInvalidarCacheSheet(_ESCUTA_SHEETS.BANCO_PESQUISAS);
    return { ok: true, id: id };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// INDICADORES E DASHBOARD
// ═══════════════════════════════════════════════════════════════

function obterDashboardEscuta(filtros) {
  try {
    filtros = filtros || {};
    var periodo  = filtros.periodo  || _escutaPeriodoAtual();
    var setor    = filtros.setor    || '';
    var modo     = filtros.modo     || 'geral';

    // Leituras consolidadas via cache de execução
    var respostas   = _escutaLerSheet(_ESCUTA_SHEETS.RESPOSTAS);
    var espontaneas = _escutaLerSheet(_ESCUTA_SHEETS.ESPONTANEA);
    var alertas     = _escutaLerSheet(_ESCUTA_SHEETS.ALERTAS);

    var respPeriodo = respostas.filter(function(r) {
      return String(r.periodo) === periodo && (!setor || r.setor === setor);
    });

    var indicadores  = _escutaCalcIndicadores(respPeriodo);
    var saturacao    = obterSaturacaoEscuta().dados || [];
    var tendencia    = _escutaCalcTendencia(respostas, periodo);
    var espPeriodo   = espontaneas.filter(function(e) {
      return String(e.timestamp).startsWith(periodo.substring(0, 7));
    });
    var resumoEsp    = _escutaResumoEspontanea(espPeriodo);
    var alertasAtivos = alertas.filter(function(a) { return a.status === 'ativo'; });

    var cfg         = obterConfiguracaoEscuta().dados || {};
    var grupoMinimo = parseInt(cfg.grupoMinimo) || _ESCUTA_DEFAULTS.GRUPO_MINIMO;
    var uniqueHash  = {};
    respPeriodo.forEach(function(r) { uniqueHash[r.emailHash] = true; });
    var nParticipantes = Object.keys(uniqueHash).length;

    var confianca = _escutaCalcConfianca(nParticipantes);

    var estratificado = null;
    if (modo === 'estratificado' && nParticipantes >= grupoMinimo) {
      estratificado = _escutaCalcEstratificado(respPeriodo);
    }

    return {
      ok: true,
      dados: {
        periodo:            periodo,
        indicadores:        indicadores,
        confianca:          confianca,
        totalParticipantes: nParticipantes,
        saturacao:          saturacao,
        tendencia:          tendencia,
        resumoEspontanea:   resumoEsp,
        alertasAtivos:      alertasAtivos.length,
        estratificado:      estratificado,
        grupoMinimo:        grupoMinimo,
        bloqueado:          nParticipantes < grupoMinimo
      }
    };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

function _escutaCalcIndicadores(respostas) {
  var porDimensao = {};
  _ESCUTA_DIMENSOES.forEach(function(d) { porDimensao[d] = { vals: [], pesos: [] }; });

  respostas.forEach(function(r) {
    if (!r.dimensao || !porDimensao[r.dimensao]) return;
    var val  = parseFloat(r.resposta);
    var peso = parseFloat(r.peso) || 1.0;
    if (isNaN(val)) return;
    if (_ESCUTA_DIMENSOES_INVERTIDAS.indexOf(r.dimensao) >= 0) val = 6 - val;
    porDimensao[r.dimensao].vals.push(val * peso);
    porDimensao[r.dimensao].pesos.push(peso);
  });

  var resultado = {};
  _ESCUTA_DIMENSOES.forEach(function(d) {
    var entry    = porDimensao[d];
    var somaPeso = entry.pesos.reduce(function(s, p) { return s + p; }, 0);
    var media    = somaPeso > 0
      ? entry.vals.reduce(function(s, v) { return s + v; }, 0) / somaPeso
      : null;
    resultado[d] = {
      media: media !== null ? parseFloat(media.toFixed(3)) : null,
      n:     entry.vals.length,
      nivel: media !== null ? _escutaNivelClimatico(media) : 'sem_dados'
    };
  });

  var valsGeral = [];
  _ESCUTA_DIMENSOES_CLIMA_GERAL.forEach(function(d) {
    if (resultado[d].media !== null) valsGeral.push(resultado[d].media);
  });
  resultado._climaGeral = {
    media: valsGeral.length ? parseFloat(_escutaMedia(valsGeral).toFixed(3)) : null,
    nivel: valsGeral.length ? _escutaNivelClimatico(_escutaMedia(valsGeral)) : 'sem_dados'
  };

  return resultado;
}

function _escutaMedia(arr) {
  if (!arr.length) return null;
  return arr.reduce(function(s, v) { return s + v; }, 0) / arr.length;
}

function _escutaNivelClimatico(media) {
  if (media === null || media === undefined) return 'sem_dados';
  if (media >= 4.5) return 'excelente';
  if (media >= 3.5) return 'bom';
  if (media >= 2.5) return 'regular';
  if (media >= 1.5) return 'baixo';
  return 'critico';
}

function _escutaCalcConfianca(participantes) {
  var total   = _escutaTotalColaboradores();
  var cfg     = obterConfiguracaoEscuta().dados || {};
  var minConf = parseFloat(cfg.confiancaMinima) || _ESCUTA_DEFAULTS.CONFIANCA_MINIMA;
  var taxa    = participantes / total;
  return {
    taxa:          parseFloat(taxa.toFixed(3)),
    participantes: participantes,
    total:         total,
    suficiente:    taxa >= minConf,
    representativa: taxa >= _ESCUTA_DEFAULTS.CONFIANCA_REPRESENTATIVA,
    percentual:    Math.round(taxa * 100)
  };
}

function _escutaCalcTendencia(respostas, periodoAtual) {
  var periodos = [];
  var d = new Date(periodoAtual + '-01');
  for (var i = 0; i < _ESCUTA_DEFAULTS.PERIODO_TENDENCIA; i++) {
    var p = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    periodos.unshift(p);
    d.setMonth(d.getMonth() - 1);
  }
  return periodos.map(function(p) {
    var r   = respostas.filter(function(x) { return String(x.periodo) === p; });
    var ind = _escutaCalcIndicadores(r);
    return { periodo: p, climaGeral: ind._climaGeral.media, n: r.length };
  });
}

function _escutaResumoEspontanea(espontaneas) {
  var cats  = {};
  var sents = { positivo: 0, negativo: 0, neutro: 0 };
  espontaneas.forEach(function(e) {
    if (e.categoria) cats[e.categoria] = (cats[e.categoria] || 0) + 1;
    if (e.sentimento in sents) sents[e.sentimento]++;
  });
  return { categorias: cats, sentimentos: sents, total: espontaneas.length };
}

function _escutaCalcEstratificado(respostas) {
  var cfg     = obterConfiguracaoEscuta().dados || {};
  var gmin    = parseInt(cfg.grupoMinimo) || _ESCUTA_DEFAULTS.GRUPO_MINIMO;
  var perfis  = _escutaLerSheet(_ESCUTA_SHEETS.PERFIL_ANALITICO);
  var perfilPorHash = {};
  perfis.forEach(function(p) { perfilPorHash[_escutaEmailHash(p.email || '')] = p; });

  function agruparECalc(atributo) {
    var grupos = {};
    respostas.forEach(function(r) {
      var perf = perfilPorHash[r.emailHash];
      var val  = perf ? (perf[atributo] || 'não_informado') : 'não_informado';
      if (!grupos[val]) grupos[val] = [];
      var score = parseFloat(r.resposta);
      if (!isNaN(score)) {
        if (_ESCUTA_DIMENSOES_INVERTIDAS.indexOf(r.dimensao) >= 0) score = 6 - score;
        grupos[val].push(score);
      }
    });
    var resultado = {};
    Object.keys(grupos).forEach(function(g) {
      if (grupos[g].length < gmin) {
        resultado[g] = { bloqueado: true, motivo: 'grupo_pequeno' };
      } else {
        resultado[g] = { media: parseFloat(_escutaMedia(grupos[g]).toFixed(3)), n: grupos[g].length };
      }
    });
    return resultado;
  }

  return {
    porVinculo: agruparECalc('vinculo'),
    porNivel:   agruparECalc('nivel'),
    gaps:       _escutaCalcGaps(respostas, perfilPorHash, gmin)
  };
}

function _escutaCalcGaps(respostas, perfilPorHash, grupoMinimo) {
  var gaps     = [];
  var atributos = ['vinculo', 'nivel', 'genero'];
  atributos.forEach(function(attr) {
    var grupos = {};
    respostas.forEach(function(r) {
      var perf = perfilPorHash[r.emailHash];
      var val  = perf ? (perf[attr] || null) : null;
      if (!val) return;
      if (!grupos[val]) grupos[val] = [];
      var s = parseFloat(r.resposta);
      if (!isNaN(s)) {
        if (_ESCUTA_DIMENSOES_INVERTIDAS.indexOf(r.dimensao) >= 0) s = 6 - s;
        grupos[val].push(s);
      }
    });
    var valGroups = Object.keys(grupos).filter(function(g) { return grupos[g].length >= grupoMinimo; });
    if (valGroups.length < 2) return;
    var medias = valGroups.map(function(g) { return { grupo: g, media: _escutaMedia(grupos[g]) }; });
    medias.sort(function(a, b) { return a.media - b.media; });
    var gap = medias[medias.length - 1].media - medias[0].media;
    if (gap >= 0.8) {
      gaps.push({
        atributo: attr,
        gap:      parseFloat(gap.toFixed(2)),
        menor:    medias[0],
        maior:    medias[medias.length - 1],
        nivel:    gap >= 1.5 ? 'critico' : 'moderado'
      });
    }
  });
  return gaps;
}

// ═══════════════════════════════════════════════════════════════
// ALERTAS — PROCESSAMENTO ASSÍNCRONO
// ═══════════════════════════════════════════════════════════════

function obterAlertasEscuta() {
  try {
    var rows = _escutaLerSheet(_ESCUTA_SHEETS.ALERTAS);
    return { ok: true, dados: rows.filter(function(r) { return r.status === 'ativo'; }) };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

/**
 * Ponto de entrada para trigger temporal (a cada 30-60 min).
 * Configurar em: Triggers > processarAlertasEscuta > Time-driven.
 * NÃO chamar de registrarRespostaPulse.
 */
function processarAlertasEscuta() {
  try {
    _escutaVerificarEGerarAlertas();
    console.log('[Escuta] processarAlertasEscuta executado em ' + new Date().toISOString());
  } catch(e) {
    console.warn('[Escuta] Erro em processarAlertasEscuta: ' + e.message);
  }
}

function _escutaVerificarEGerarAlertas() {
  try {
    var periodo = _escutaPeriodoAtual();
    var resp    = _escutaLerSheet(_ESCUTA_SHEETS.RESPOSTAS).filter(function(r) {
      return String(r.periodo) === periodo;
    });
    var esponts = _escutaLerSheet(_ESCUTA_SHEETS.ESPONTANEA).filter(function(e) {
      return String(e.timestamp).startsWith(periodo.substring(0, 7));
    });

    var ind   = _escutaCalcIndicadores(resp);
    var uHash = {};
    resp.forEach(function(r) { uHash[r.emailHash] = true; });
    var conf  = _escutaCalcConfianca(Object.keys(uHash).length);

    if (!conf.suficiente) return;

    var alertas = _escutaDetectarAlertas(ind, esponts, resp);
    alertas.forEach(function(a) { _escutaRegistrarAlerta(a); });
  } catch(e) {
    console.warn('[Escuta] Erro em _escutaVerificarEGerarAlertas: ' + e.message);
  }
}

function _escutaDetectarAlertas(indicadores, espontaneas, respostas) {
  var alertas    = [];
  var rows       = _escutaLerSheet(_ESCUTA_SHEETS.ALERTAS);
  var existentes = rows.filter(function(a) {
    return a.status === 'ativo' &&
      String(a.timestamp).startsWith(_escutaPeriodoAtual().substring(0, 7));
  });
  var tiposExistentes = {};
  existentes.forEach(function(a) { tiposExistentes[a.tipo] = true; });
  function jaTem(tipo) { return tiposExistentes[tipo]; }

  // Burnout: carga alta + energia baixa
  var cargaScore = indicadores.carga && indicadores.carga.media !== null ? indicadores.carga.media : null;
  var energiaM   = indicadores.energia && indicadores.energia.media;
  if (cargaScore !== null && energiaM && cargaScore > 3.5 && energiaM < 2.5 && !jaTem('burnout_risco')) {
    alertas.push({ tipo: 'burnout_risco', dimensao: 'energia,carga', nivel: 'alto',
      descricao: 'Padrão de carga alta combinado com energia baixa detectado. Risco de burnout.',
      dados: JSON.stringify({ carga: cargaScore.toFixed(2), energia: energiaM.toFixed(2) }) });
  }

  // Apoio baixo
  if (indicadores.apoio && indicadores.apoio.media !== null &&
      indicadores.apoio.media < 2.5 && !jaTem('apoio_baixo')) {
    alertas.push({ tipo: 'apoio_baixo', dimensao: 'apoio', nivel: 'moderado',
      descricao: 'Indicador de apoio abaixo do limiar crítico.',
      dados: JSON.stringify({ apoio: indicadores.apoio.media.toFixed(2) }) });
  }

  // Risco psicossocial NR-1
  var rpMedia = indicadores.risco_psicossocial && indicadores.risco_psicossocial.media;
  if (rpMedia && rpMedia < 2.5 && !jaTem('risco_psicossocial_nr1')) {
    alertas.push({ tipo: 'risco_psicossocial_nr1', dimensao: 'risco_psicossocial', nivel: 'critico',
      descricao: 'Indicadores de risco psicossocial (NR-1) em nível crítico.',
      dados: JSON.stringify({ risco: rpMedia.toFixed(2) }) });
  }

  // Escuta espontânea negativa
  var resumoE = _escutaResumoEspontanea(espontaneas);
  if (resumoE.total >= 5 && (resumoE.sentimentos.negativo / resumoE.total) > 0.6 && !jaTem('escuta_negativa')) {
    alertas.push({ tipo: 'escuta_negativa', dimensao: 'escuta', nivel: 'moderado',
      descricao: 'Maioria das escutas espontâneas com sentimento negativo.',
      dados: JSON.stringify({ total: resumoE.total, negativo: resumoE.sentimentos.negativo }) });
  }

  // Liderança baixa
  if (indicadores.lideranca && indicadores.lideranca.media !== null &&
      indicadores.lideranca.media < 2.5 && !jaTem('lideranca_baixa')) {
    alertas.push({ tipo: 'lideranca_baixa', dimensao: 'lideranca', nivel: 'moderado',
      descricao: 'Indicador de liderança abaixo do limiar de atenção.',
      dados: JSON.stringify({ lideranca: indicadores.lideranca.media.toFixed(2) }) });
  }

  // Gaps estruturais
  var perfis = _escutaLerSheet(_ESCUTA_SHEETS.PERFIL_ANALITICO);
  var perfilPorHash = {};
  perfis.forEach(function(p) { perfilPorHash[_escutaEmailHash(p.email || '')] = p; });
  var cfg  = obterConfiguracaoEscuta().dados || {};
  var gmin = parseInt(cfg.grupoMinimo) || _ESCUTA_DEFAULTS.GRUPO_MINIMO;
  _escutaCalcGaps(respostas, perfilPorHash, gmin)
    .filter(function(g) { return g.nivel === 'critico' && !jaTem('gap_' + g.atributo); })
    .forEach(function(g) {
      alertas.push({ tipo: 'gap_' + g.atributo, dimensao: g.atributo, nivel: 'critico',
        descricao: 'Desigualdade estrutural em ' + g.atributo + ' (gap ' + g.gap + ').',
        dados: JSON.stringify(g) });
    });

  return alertas;
}

function _escutaRegistrarAlerta(a) {
  var sh = _escutaSheet(_ESCUTA_SHEETS.ALERTAS);
  var id = _escutaID();
  sh.appendRow([id, a.tipo, a.dimensao, a.nivel, a.descricao,
                a.dados || '{}', new Date().toISOString(), 'ativo', '', '', '']);
  _escutaInvalidarCacheSheet(_ESCUTA_SHEETS.ALERTAS);
  return id;
}

function resolverAlertaEscuta(id, acao, sessaoOuEmail) {
  try {
    var email = typeof _resolverEmailReal === 'function'
      ? _resolverEmailReal(sessaoOuEmail || '')
      : obterEmailUsuario('');
    if (!verificarPermissaoEscuta(email, 'editar')) return { ok: false, msg: 'Permissão negada.' };

    var sh   = _escutaSheet(_ESCUTA_SHEETS.ALERTAS);
    var rows = _escutaSheetToArray(sh);
    var idx  = rows.findIndex(function(r) { return r.id === id; });
    if (idx < 0) return { ok: false, msg: 'Alerta não encontrado.' };

    var row = idx + 2;
    sh.getRange(row, 8).setValue('resolvido');
    sh.getRange(row, 9).setValue(email);
    sh.getRange(row, 10).setValue(acao || '');
    sh.getRange(row, 11).setValue(new Date().toISOString());
    _escutaInvalidarCacheSheet(_ESCUTA_SHEETS.ALERTAS);
    _escutaLog('resolverAlerta', email, { id: id, acao: acao });
    return { ok: true };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// PERFIL ANALÍTICO
// ═══════════════════════════════════════════════════════════════

function obterPerfilAnaliticoEscuta() {
  try {
    var email  = obterEmailUsuario('');
    var rows   = _escutaLerSheet(_ESCUTA_SHEETS.PERFIL_ANALITICO);
    var perfil = rows.find(function(r) { return r.email === email; });
    return { ok: true, dados: perfil || null };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

function salvarPerfilAnaliticoEscuta(dados) {
  var lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(5000)) return { ok: false, msg: 'Sistema ocupado. Tente novamente.' };

    var email = typeof _resolverEmailReal === 'function'
      ? _resolverEmailReal(dados.sessao || dados.email || '')
      : obterEmailUsuario('');
    var sh    = _escutaSheet(_ESCUTA_SHEETS.PERFIL_ANALITICO);
    var rows  = _escutaSheetToArray(sh);
    var idx   = rows.findIndex(function(r) { return r.email === email; });
    var agora = new Date().toISOString();

    var linha = [
      email,
      dados.genero           || '',
      dados.raca             || '',
      dados.orientacaoSexual || '',
      dados.faixaSalarial    || '',
      dados.vinculo          || '',
      dados.nivel            || '',
      dados.tempoCasa        || '',
      dados.regiao           || '',
      dados.distancia        || '',
      agora
    ];

    if (idx >= 0) {
      sh.getRange(idx + 2, 1, 1, linha.length).setValues([linha]);
    } else {
      sh.appendRow(linha);
    }
    _escutaInvalidarCacheSheet(_ESCUTA_SHEETS.PERFIL_ANALITICO);
    return { ok: true };
  } catch(e) {
    return { ok: false, msg: e.message };
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}

// ═══════════════════════════════════════════════════════════════
// RELATÓRIOS
// ═══════════════════════════════════════════════════════════════

function gerarRelatorioEscuta(tipo, periodo) {
  try {
    var email   = obterEmailUsuario('');
    if (!verificarPermissaoEscuta(email, 'visualizar')) return { ok: false, msg: 'Permissão negada.' };

    periodo = periodo || _escutaPeriodoAtual();

    var respostas = _escutaLerSheet(_ESCUTA_SHEETS.RESPOSTAS).filter(function(r) {
      return String(r.periodo) === periodo;
    });
    var esponts = _escutaLerSheet(_ESCUTA_SHEETS.ESPONTANEA).filter(function(e) {
      return String(e.timestamp).startsWith(periodo.substring(0, 7));
    });
    var alertas = _escutaLerSheet(_ESCUTA_SHEETS.ALERTAS).filter(function(a) {
      return String(a.timestamp).startsWith(periodo.substring(0, 7));
    });

    var ind  = _escutaCalcIndicadores(respostas);
    var tend = _escutaCalcTendencia(_escutaLerSheet(_ESCUTA_SHEETS.RESPOSTAS), periodo);
    var eRes = _escutaResumoEspontanea(esponts);
    var uH   = {};
    respostas.forEach(function(r) { uH[r.emailHash] = true; });
    var conf = _escutaCalcConfianca(Object.keys(uH).length);

    return {
      ok: true,
      dados: {
        tipo:        tipo || 'institucional',
        periodo:     periodo,
        geradoEm:    new Date().toISOString(),
        geradoPor:   email,
        confianca:   conf,
        indicadores: ind,
        tendencia:   tend,
        escuta:      eRes,
        alertas: {
          total:    alertas.length,
          criticos: alertas.filter(function(a) { return a.nivel === 'critico'; }).length,
          abertos:  alertas.filter(function(a) { return a.status === 'ativo'; }).length
        },
        recomendacoes: _escutaGerarRecomendacoes(ind, eRes, alertas)
      }
    };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

function _escutaGerarRecomendacoes(indicadores, resumoEspontanea, alertas) {
  var recs   = [];
  var labels = {
    energia:            'Considerar redistribuição de carga e pausas programadas.',
    carga:              'Revisar distribuição de atividades e prioridades.',
    clareza:            'Reforçar comunicação de objetivos e expectativas.',
    apoio:              'Fortalecer redes de suporte e mentoria.',
    autonomia:          'Ampliar espaços de autonomia e tomada de decisão.',
    cultura:            'Promover ações de pertencimento e valores organizacionais.',
    lideranca:          'Investir em desenvolvimento de lideranças e feedback.',
    risco_psicossocial: 'Acionar protocolo NR-1 de apoio psicossocial.'
  };

  _ESCUTA_DIMENSOES.forEach(function(d) {
    var i = indicadores[d];
    if (!i || i.media === null) return;
    var score = i.media; // já normalizado (invertido para carga/risco)
    if (score < 2.5) {
      recs.push({ dimensao: d, prioridade: score < 2.0 ? 'critica' : 'alta',
                  acao: labels[d] || 'Investigar indicadores de ' + d + '.' });
    }
  });

  if ((resumoEspontanea.sentimentos.negativo || 0) > (resumoEspontanea.total * 0.5)) {
    recs.push({ dimensao: 'escuta', prioridade: 'moderada',
                acao: 'Analisar relatos espontâneos negativos para identificar padrões.' });
  }

  alertas.filter(function(a) { return a.nivel === 'critico'; }).forEach(function(a) {
    recs.push({ dimensao: a.dimensao, prioridade: 'critica',
                acao: 'Alerta crítico ativo: ' + a.descricao });
  });

  recs.sort(function(a, b) {
    var ord = { critica: 0, alta: 1, moderada: 2 };
    return (ord[a.prioridade] || 2) - (ord[b.prioridade] || 2);
  });

  return recs;
}

// ═══════════════════════════════════════════════════════════════
// CARGA INICIAL — CONSOLIDADA COM CACHE
// ═══════════════════════════════════════════════════════════════

function obterDadosEscuta() {
  try {
    var email = obterEmailUsuario('');

    // Pré-carrega todas as abas no cache de execução de uma só vez
    var sheetsParaCarregar = [
      _ESCUTA_SHEETS.RESPOSTAS,
      _ESCUTA_SHEETS.ESPONTANEA,
      _ESCUTA_SHEETS.ALERTAS,
      _ESCUTA_SHEETS.PESQUISAS,
      _ESCUTA_SHEETS.BANCO_PESQUISAS,
      _ESCUTA_SHEETS.SATURACAO,
      _ESCUTA_SHEETS.PERFIL_ANALITICO
    ];
    sheetsParaCarregar.forEach(function(nome) {
      if (!_escutaExecCache[nome]) {
        try {
          _escutaExecCache[nome] = _escutaSheetToArray(_escutaSheet(nome));
        } catch(e_) {
          _escutaExecCache[nome] = [];
          console.warn('[Escuta] preload falhou para "' + nome + '": ' + e_.message);
        }
      }
    });

    var cfg      = obterConfiguracaoEscuta();
    var dash     = obterDashboardEscuta({});
    var alertas  = obterAlertasEscuta();
    var perfil   = obterPerfilAnaliticoEscuta();
    var pesqs    = obterPesquisasEscuta();
    var banco    = obterBancoPesquisas();
    var satur    = obterSaturacaoEscuta();
    var pergs    = obterPerguntasEscuta();

    return {
      ok:        true,
      email:     email,
      config:    cfg.dados,
      dashboard: dash.dados,
      alertas:   alertas.dados,
      perfil:    perfil.dados,
      pesquisas: pesqs.dados,
      banco:     banco.dados,
      saturacao: satur.dados,
      perguntas: pergs.dados
    };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// CICLO DE FEEDBACK AO USUÁRIO
// ═══════════════════════════════════════════════════════════════

function obterFeedbackEscuta() {
  try {
    var rows = _escutaLerSheet(_ESCUTA_SHEETS.ALERTAS);
    var resolvidos = rows.filter(function(r) {
      return r.status === 'resolvido' && r.acao;
    }).slice(-5);
    return { ok: true, dados: resolvidos };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// GOVERNANÇA DA ESCUTA
// ═══════════════════════════════════════════════════════════════

/**
 * Painel completo de governança. Combina clima, confiança, saturação,
 * cobertura por perfil, alertas, risco NR-1, status e qualidade metodológica.
 */
function obterGovernancaEscuta() {
  try {
    var periodo = _escutaPeriodoAtual();

    // Tenta cache de serviço (5 min) para evitar recálculo frequente
    var sCache   = CacheService.getScriptCache();
    var cKey     = '_escuta_gov_' + periodo;
    var cached   = sCache.get(cKey);
    if (cached) {
      try { return { ok: true, dados: JSON.parse(cached) }; } catch(e) {}
    }

    // Pré-carga consolidada
    var respostas   = _escutaLerSheet(_ESCUTA_SHEETS.RESPOSTAS).filter(function(r) {
      return String(r.periodo) === periodo;
    });
    var espontaneas = _escutaLerSheet(_ESCUTA_SHEETS.ESPONTANEA).filter(function(e) {
      return String(e.timestamp).startsWith(periodo.substring(0, 7));
    });
    var alertasAtivos = _escutaLerSheet(_ESCUTA_SHEETS.ALERTAS).filter(function(a) {
      return a.status === 'ativo';
    });
    var perfis = _escutaLerSheet(_ESCUTA_SHEETS.PERFIL_ANALITICO);

    var uHash = {};
    respostas.forEach(function(r) { uHash[r.emailHash] = true; });
    var nPart = Object.keys(uHash).length;

    var indicadores = _escutaCalcIndicadores(respostas);
    var confianca   = _escutaCalcConfianca(nPart);
    var saturacao   = obterSaturacaoEscuta().dados || [];
    var perfilPorHash = {};
    perfis.forEach(function(p) { perfilPorHash[_escutaEmailHash(p.email || '')] = p; });

    var status           = _escutaStatusEscuta(confianca, indicadores, saturacao);
    var qualidade        = _escutaQualidadeMetodologica(confianca, saturacao, indicadores, respostas);
    var motor            = _escutaMotorMetodologico(indicadores, confianca, saturacao, respostas);
    var cobertura        = _escutaCoberturaPorPerfil(respostas, perfilPorHash);
    var resumoEspontanea = _escutaResumoEspontanea(espontaneas);

    var rpMedia = indicadores.risco_psicossocial && indicadores.risco_psicossocial.media;
    var riscoNR1 = {
      media:  rpMedia !== null && rpMedia !== undefined ? rpMedia : null,
      nivel:  rpMedia !== null && rpMedia !== undefined ? _escutaNivelClimatico(rpMedia) : 'sem_dados',
      alerta: rpMedia !== null && rpMedia !== undefined && rpMedia < 2.5
    };

    var governanca = {
      periodo:               periodo,
      climaGeral:            indicadores._climaGeral,
      indicadoresDimensao:   indicadores,
      confianca:             confianca,
      saturacao:             saturacao,
      coberturaPorPerfil:    cobertura,
      alertasAtivos:         alertasAtivos.length,
      alertasDetalhes:       alertasAtivos.slice(0, 10),
      riscoNR1:              riscoNR1,
      resumoEspontanea:      resumoEspontanea,
      qualidadeMetodologica: qualidade,
      status:                status,
      motor:                 motor,
      geradoEm:              new Date().toISOString()
    };

    try {
      sCache.put(cKey, JSON.stringify(governanca), _ESCUTA_DEFAULTS.CACHE_TTL_GOVERNANCA);
    } catch(e) {}

    return { ok: true, dados: governanca };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

/**
 * Status da escuta institucional no período.
 * Retorna: 'subamostrada' | 'desequilibrada' | 'critica' | 'confiavel'
 */
function _escutaStatusEscuta(confianca, indicadores, saturacao) {
  if (!confianca.suficiente) {
    return {
      codigo:  'subamostrada',
      rotulo:  'Subamostrada',
      cor:     'cinza',
      descricao: 'Participação insuficiente para conclusões (' + confianca.percentual + '%). Mínimo: ' +
                 Math.round(_ESCUTA_DEFAULTS.CONFIANCA_MINIMA * 100) + '%.'
    };
  }

  // Verifica se alguma dimensão crítica foi acionada
  var temCritico = _ESCUTA_DIMENSOES.some(function(d) {
    return indicadores[d] && indicadores[d].nivel === 'critico';
  });
  if (temCritico) {
    return {
      codigo:  'critica',
      rotulo:  'Crítica',
      cor:     'vermelho',
      descricao: 'Uma ou mais dimensões em nível crítico. Ação institucional requerida.'
    };
  }

  // Verifica desequilíbrio: dimensões sem dados ou com n < 3
  var dimSemDados = _ESCUTA_DIMENSOES.filter(function(d) {
    return !indicadores[d] || indicadores[d].media === null || indicadores[d].n < 3;
  });
  if (dimSemDados.length >= 3) {
    return {
      codigo:   'desequilibrada',
      rotulo:   'Desequilibrada',
      cor:      'laranja',
      descricao: 'Cobertura insuficiente em ' + dimSemDados.length + ' dimensões: ' + dimSemDados.join(', ') + '.'
    };
  }

  return {
    codigo:   'confiavel',
    rotulo:   'Confiável',
    cor:      'verde',
    descricao: 'Amostra suficiente (' + confianca.percentual + '%) com cobertura equilibrada.'
  };
}

/**
 * Indicador de qualidade metodológica de 0 a 100.
 * Fatores: confiança (+35), cobertura de dimensões (+25), equilíbrio de saturação (+20), perfis (+20).
 */
function _escutaQualidadeMetodologica(confianca, saturacao, indicadores, respostas) {
  var pontos = 0;
  var detalhes = [];

  // Fator 1: confiança (35 pts)
  if (confianca.representativa) {
    pontos += 35;
    detalhes.push({ fator: 'confianca', pontos: 35, msg: 'Amostra representativa (≥35%).' });
  } else if (confianca.suficiente) {
    pontos += 18;
    detalhes.push({ fator: 'confianca', pontos: 18, msg: 'Amostra suficiente mas abaixo de 35%.' });
  } else {
    detalhes.push({ fator: 'confianca', pontos: 0, msg: 'Amostra insuficiente (<15%).' });
  }

  // Fator 2: cobertura de dimensões (25 pts)
  var dimComDados = _ESCUTA_DIMENSOES.filter(function(d) {
    return indicadores[d] && indicadores[d].media !== null;
  }).length;
  var ptsDim = Math.round((dimComDados / _ESCUTA_DIMENSOES.length) * 25);
  pontos += ptsDim;
  detalhes.push({ fator: 'cobertura_dimensoes', pontos: ptsDim,
    msg: dimComDados + '/' + _ESCUTA_DIMENSOES.length + ' dimensões com dados.' });

  // Fator 3: equilíbrio de saturação (20 pts) — sem dimensões com 0% nem 100% no período
  var periodo = _escutaPeriodoAtual();
  var satPeriodo = saturacao.filter(function(s) { return s.periodo === periodo; });
  var nSat = satPeriodo.length;
  var ptsSat = nSat >= 4 ? 20 : nSat >= 2 ? 10 : 0;
  pontos += ptsSat;
  detalhes.push({ fator: 'saturacao', pontos: ptsSat,
    msg: nSat + ' dimensões com dados de saturação no período.' });

  // Fator 4: cobertura de perfis (20 pts)
  var perfis = _escutaLerSheet(_ESCUTA_SHEETS.PERFIL_ANALITICO);
  var total  = _escutaTotalColaboradores();
  var taxaPerfis = total > 0 ? perfis.length / total : 0;
  var ptsPerfis  = taxaPerfis >= 0.5 ? 20 : taxaPerfis >= 0.25 ? 10 : 0;
  pontos += ptsPerfis;
  detalhes.push({ fator: 'perfis', pontos: ptsPerfis,
    msg: perfis.length + ' perfis preenchidos de ' + total + ' (' + Math.round(taxaPerfis * 100) + '%).' });

  var nivel = pontos >= 80 ? 'excelente' : pontos >= 60 ? 'bom' : pontos >= 40 ? 'regular' : 'baixo';
  return { pontos: pontos, nivel: nivel, detalhes: detalhes };
}

/**
 * Motor metodológico: detecta vieses, desequilíbrios e gera mensagens operacionais.
 * Baseado em escuta_institucional.md e manual_metodologico.md.
 */
function _escutaMotorMetodologico(indicadores, confianca, saturacao, respostas) {
  var mensagens = [];
  var alertasMotor = [];

  // Viés de não-resposta
  if (!confianca.suficiente) {
    mensagens.push({
      tipo:      'vies_nao_resposta',
      severidade: 'alto',
      msg:       'Taxa de resposta de ' + confianca.percentual + '% abaixo do mínimo (15%). ' +
                 'Indicadores podem não refletir a realidade institucional.',
      acao:      'Divulgar canal de escuta. Verificar acessibilidade do sistema nos turnos.'
    });
    alertasMotor.push('vies_nao_resposta');
  }

  // Desequilíbrio de dimensões
  var dimSemDados = _ESCUTA_DIMENSOES.filter(function(d) {
    return !indicadores[d] || indicadores[d].n < 3;
  });
  if (dimSemDados.length > 0) {
    mensagens.push({
      tipo:      'desequilibrio_dimensao',
      severidade: dimSemDados.length >= 4 ? 'alto' : 'moderado',
      msg:       'Dimensões com cobertura insuficiente (<3 respostas): ' + dimSemDados.join(', ') + '.',
      acao:      'Verificar configuração de saturação. Pode indicar perguntas desativadas ou sistema restrito a poucos usuários.'
    });
    alertasMotor.push('desequilibrio_dimensao');
  }

  // Baixa confiança mas com alertas ativos — inconsistência
  var alertasAtivos = _escutaLerSheet(_ESCUTA_SHEETS.ALERTAS).filter(function(a) { return a.status === 'ativo'; });
  if (!confianca.suficiente && alertasAtivos.length > 0) {
    mensagens.push({
      tipo:      'inconsistencia_confianca_alertas',
      severidade: 'moderado',
      msg:       'Alertas ativos com amostra insuficiente. Alertas gerados sem representatividade estatística.',
      acao:      'Ampliar adesão antes de agir sobre alertas. Verificar se foram gerados em período anterior.'
    });
  }

  // Dimensão risco_psicossocial sem dados
  if (!indicadores.risco_psicossocial || indicadores.risco_psicossocial.n < 3) {
    mensagens.push({
      tipo:      'nr1_sem_dados',
      severidade: 'alto',
      msg:       'Dimensão risco_psicossocial sem dados suficientes. Monitoramento NR-1 comprometido.',
      acao:      'Verificar se perguntas RP01, RP02, RP03 estão ativas e não saturadas.'
    });
    alertasMotor.push('nr1_sem_dados');
  }

  // Padrão de tendência negativa
  var tendencia = _escutaCalcTendencia(respostas.concat(_escutaLerSheet(_ESCUTA_SHEETS.RESPOSTAS)), _escutaPeriodoAtual());
  var tendValida = tendencia.filter(function(t) { return t.climaGeral !== null; });
  if (tendValida.length >= 2) {
    var ultimo   = tendValida[tendValida.length - 1].climaGeral;
    var anterior = tendValida[tendValida.length - 2].climaGeral;
    if (ultimo < anterior - 0.5) {
      mensagens.push({
        tipo:      'tendencia_queda',
        severidade: 'alto',
        msg:       'Queda de ' + Math.abs(ultimo - anterior).toFixed(2) + ' pontos no clima geral em relação ao período anterior.',
        acao:      'Investigar eventos institucionais recentes. Acionar gestão para análise.'
      });
    }
  }

  return {
    mensagens:     mensagens,
    alertasMotor:  alertasMotor,
    statusGeral:   alertasMotor.length === 0 ? 'metodologicamente_saudavel' : 'requer_atencao'
  };
}

/**
 * Cobertura de respostas por grupos de perfil (sem revelar dados individuais).
 */
function _escutaCoberturaPorPerfil(respostas, perfilPorHash) {
  var atributos = ['vinculo', 'nivel', 'genero'];
  var cobertura = {};
  var gmin      = _ESCUTA_DEFAULTS.GRUPO_MINIMO;

  atributos.forEach(function(attr) {
    var grupos = {};
    respostas.forEach(function(r) {
      var perf = perfilPorHash[r.emailHash];
      var val  = perf ? (perf[attr] || 'não_informado') : 'não_informado';
      grupos[val] = (grupos[val] || 0) + 1;
    });
    var resultado = {};
    Object.keys(grupos).forEach(function(g) {
      resultado[g] = grupos[g] >= gmin ? grupos[g] : { bloqueado: true };
    });
    cobertura[attr] = resultado;
  });

  return cobertura;
}

// ═══════════════════════════════════════════════════════════════
// SIMULADOR DE IMPACTO (pré-ativação de pesquisa)
// ═══════════════════════════════════════════════════════════════

/**
 * Simula o impacto de ativar uma pesquisa antes de salvá-la.
 * Estima: volume esperado, saturação por dimensão, alertas potenciais.
 */
function simularImpactoPesquisa(pesquisa) {
  try {
    var total    = _escutaTotalColaboradores();
    var cfg      = obterConfiguracaoEscuta().dados || {};
    var limiteDia = parseInt(cfg.limiteDia) || _ESCUTA_DEFAULTS.LIMITE_DIA;
    var meta     = _escutaMetaDimensao();

    // Estimar usuários elegíveis
    var elegiveisEstimado = total;
    if (pesquisa.direcionamento && pesquisa.direcionamento.usuarios) {
      elegiveisEstimado = pesquisa.direcionamento.usuarios.length;
    }

    // Volume esperado: usuários elegíveis × taxa histórica de resposta pulse
    var respostas   = _escutaLerSheet(_ESCUTA_SHEETS.RESPOSTAS);
    var periodo     = _escutaPeriodoAtual();
    var respPeriodo = respostas.filter(function(r) { return String(r.periodo) === periodo; });
    var uHash       = {};
    respPeriodo.forEach(function(r) { uHash[r.emailHash] = true; });
    var taxaHistorica = total > 0 ? Math.min(Object.keys(uHash).length / total, 1) : 0.3;
    var volumeEstimado = Math.round(elegiveisEstimado * taxaHistorica * limiteDia);

    // Impacto por dimensão
    var sat = obterSaturacaoEscuta().dados || [];
    var impactoDimensoes = {};
    (pesquisa.perguntas || []).forEach(function(p) {
      if (!p.dimensao) return;
      var satDim = sat.find(function(s) { return s.dimensao === p.dimensao; });
      var coletados = satDim ? parseInt(satDim.coletados || 0) : 0;
      var novosEsperados = Math.min(volumeEstimado, meta - coletados);
      impactoDimensoes[p.dimensao] = {
        coletadosAtual:  coletados,
        meta:            meta,
        novosEsperados:  Math.max(0, novosEsperados),
        saturariaApos:   (coletados + novosEsperados) >= meta
      };
    });

    // Alertas potenciais (baseado em indicadores atuais)
    var indicadores  = _escutaCalcIndicadores(respPeriodo);
    var alertasPotenciais = [];
    _ESCUTA_DIMENSOES.forEach(function(d) {
      if (indicadores[d] && indicadores[d].media !== null && indicadores[d].media < 2.5) {
        alertasPotenciais.push({ dimensao: d, nivel: indicadores[d].nivel, media: indicadores[d].media });
      }
    });

    return {
      ok: true,
      simulacao: {
        elegiveisEstimado:   elegiveisEstimado,
        volumeEstimado:      volumeEstimado,
        taxaParticipacao:    Math.round(taxaHistorica * 100) + '%',
        impactoDimensoes:    impactoDimensoes,
        alertasPotenciais:   alertasPotenciais,
        avisos:              volumeEstimado < 5
          ? ['Volume esperado abaixo do grupo mínimo (' + volumeEstimado + '). Indicadores poderão ser bloqueados.']
          : []
      }
    };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// CONSTRUTOR GUIADO DE PESQUISAS (ANTI-ERRO)
// ═══════════════════════════════════════════════════════════════

/**
 * Fluxo guiado em 5 etapas para construção de pesquisas custom.
 * Cada etapa valida entradas e retorna sugestões para a próxima.
 * etapa: 1=objetivo | 2=publico | 3=dimensoes | 4=tipoTempo | 5=frequencia
 */
function construirFluxoPesquisa(etapa, dados) {
  try {
    var resultado = { etapa: etapa, dados: dados, proximaEtapa: etapa + 1, sugestoes: {}, erros: [] };

    if (etapa === 1) {
      // Objetivo: texto livre → sugestão de dimensões
      if (!dados.objetivo || dados.objetivo.trim().length < 5) {
        resultado.erros.push('Descreva o objetivo da pesquisa (mínimo 5 caracteres).');
        resultado.proximaEtapa = 1;
      } else {
        var sug = sugerirParametrosPesquisa(dados.objetivo, null);
        resultado.sugestoes.dimensoes     = sug.sugestao.dimensoes;
        resultado.sugestoes.perguntasSug  = sug.sugestao.perguntas.map(function(p) { return p.id; });
        resultado.sugestoes.tipoTempoPadrao = sug.sugestao.tipoTempo;
      }

    } else if (etapa === 2) {
      // Público: elegibilidade e direcionamento
      if (!dados.publico) {
        resultado.erros.push('Defina o público-alvo (todos, setor, nível, vínculo...).');
        resultado.proximaEtapa = 2;
      } else {
        resultado.sugestoes.elegibilidade = dados.publico;
        resultado.sugestoes.totalEstimado = _escutaTotalColaboradores();
      }

    } else if (etapa === 3) {
      // Dimensões: validar e selecionar perguntas
      var dims = dados.dimensoes || [];
      var invalidas = dims.filter(function(d) { return _ESCUTA_DIMENSOES.indexOf(d) < 0; });
      if (dims.length === 0) {
        resultado.erros.push('Selecione pelo menos uma dimensão.');
        resultado.proximaEtapa = 3;
      } else if (invalidas.length > 0) {
        resultado.erros.push('Dimensões inválidas: ' + invalidas.join(', '));
        resultado.proximaEtapa = 3;
      } else {
        resultado.sugestoes.perguntas = _BANCO_PERGUNTAS_PADRAO.filter(function(p) {
          return dims.indexOf(p.dimensao) >= 0;
        });
      }

    } else if (etapa === 4) {
      // Tipo temporal
      var tiposValidos = ['instantanea', 'acumulativa', 'final'];
      if (!dados.tipoTempo || tiposValidos.indexOf(dados.tipoTempo) < 0) {
        resultado.erros.push('Selecione o tipo temporal: instantanea, acumulativa ou final.');
        resultado.proximaEtapa = 4;
      } else {
        resultado.sugestoes.tipoTempo = dados.tipoTempo;
        resultado.sugestoes.janelas = {
          instantanea: 'Disponível a qualquer momento do turno',
          acumulativa: 'Disponível após 50% do turno',
          final:       'Disponível após 75% do turno'
        }[dados.tipoTempo];
      }

    } else if (etapa === 5) {
      // Frequência e período
      if (!dados.periodoInicio || !dados.periodoFim) {
        resultado.erros.push('Defina o período de vigência (início e fim).');
        resultado.proximaEtapa = 5;
      } else if (dados.periodoFim < dados.periodoInicio) {
        resultado.erros.push('Data de fim deve ser posterior ao início.');
        resultado.proximaEtapa = 5;
      } else {
        resultado.sugestoes.pronto = true;
        resultado.proximaEtapa = null; // fluxo concluído
        // Montar rascunho de pesquisa normalizado
        resultado.rascunho = {
          titulo:        dados.titulo || 'Pesquisa ' + dados.periodoInicio,
          perguntas:     (dados.perguntasSelecionadas || []).map(function(id) {
            return _BANCO_PERGUNTAS_PADRAO.find(function(p) { return p.id === id; });
          }).filter(Boolean),
          periodoInicio: dados.periodoInicio,
          periodoFim:    dados.periodoFim,
          elegibilidade: dados.publico || 'todos',
          prioridade:    dados.prioridade || 1,
          status:        'rascunho',
          padrao:        false
        };
      }
    }

    return { ok: true, resultado: resultado };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// MAPA DE DADOS — VISUALIZAÇÃO LÓGICA
// ═══════════════════════════════════════════════════════════════

/**
 * Retorna a cadeia lógica: Resposta → dimensão → peso → média → clima → alerta → recomendação.
 * Usado para visualização do fluxo de dados no painel de governança.
 */
function obterMapaDadosEscuta(periodo) {
  try {
    periodo = periodo || _escutaPeriodoAtual();
    var respostas = _escutaLerSheet(_ESCUTA_SHEETS.RESPOSTAS).filter(function(r) {
      return String(r.periodo) === periodo;
    });
    var alertas = _escutaLerSheet(_ESCUTA_SHEETS.ALERTAS).filter(function(a) {
      return a.status === 'ativo' && String(a.timestamp).startsWith(periodo.substring(0, 7));
    });

    var indicadores = _escutaCalcIndicadores(respostas);

    var mapa = _ESCUTA_DIMENSOES.map(function(dim) {
      var ind = indicadores[dim];
      var alertasDim = alertas.filter(function(a) {
        return a.dimensao === dim || (a.dimensao || '').indexOf(dim) >= 0;
      });
      var recomendacao = null;
      if (ind && ind.media !== null && ind.media < 2.5) {
        var labels = {
          energia: 'Redistribuir carga e programar pausas.',
          carga: 'Revisar distribuição de atividades.',
          clareza: 'Reforçar comunicação de objetivos.',
          apoio: 'Fortalecer redes de suporte.',
          autonomia: 'Ampliar espaços de decisão.',
          cultura: 'Promover ações de pertencimento.',
          lideranca: 'Desenvolvimento de lideranças.',
          risco_psicossocial: 'Acionar protocolo NR-1.'
        };
        recomendacao = labels[dim];
      }

      return {
        dimensao:      dim,
        invertida:     _ESCUTA_DIMENSOES_INVERTIDAS.indexOf(dim) >= 0,
        nRespostas:    ind ? ind.n    : 0,
        pesoMedio:     1.0, // calculado por média ponderada internamente
        media:         ind ? ind.media : null,
        clima:         ind ? ind.nivel : 'sem_dados',
        alertas:       alertasDim.map(function(a) { return { tipo: a.tipo, nivel: a.nivel }; }),
        recomendacao:  recomendacao
      };
    });

    return { ok: true, periodo: periodo, mapa: mapa, climaGeral: indicadores._climaGeral };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// MANUAL VIVO — INTERFACE EXPLICATIVA INTEGRADA
// ═══════════════════════════════════════════════════════════════

/**
 * Retorna conteúdo explicativo estruturado para tooltips e blocos de ajuda.
 * secao: 'indicadores' | 'alertas' | 'parametros' | 'fairness' | 'nr1' | 'privacidade' | null (tudo)
 */
function obterManualEscuta(secao) {
  var manual = {
    indicadores: {
      titulo: 'Como funcionam os indicadores?',
      conteudo: [
        'Cada dimensão recebe um score de 1 a 5 (média ponderada das respostas).',
        'Níveis: Excelente (≥4.5) | Bom (≥3.5) | Regular (≥2.5) | Baixo (≥1.5) | Crítico (<1.5).',
        'Dimensões "carga" e "risco_psicossocial" são invertidas: score alto = situação ruim.',
        'Clima Geral: média das dimensões positivas (energia, clareza, apoio, autonomia, cultura, liderança).'
      ],
      fonte: 'escuta_institucional.md §5 | manual_metodologico.md §3'
    },
    alertas: {
      titulo: 'O que são os alertas institucionais?',
      conteudo: [
        'Gerados automaticamente quando padrões preocupantes são detectados.',
        'Tipos: burnout_risco (carga alta + energia baixa), apoio_baixo, risco_psicossocial_nr1, escuta_negativa, lideranca_baixa, gap_estrutural.',
        'Alertas só são gerados com confiança mínima de 15% e sem duplicação no mesmo período.',
        'Alertas NR-1 são de nível crítico e requerem ação institucional imediata.'
      ],
      fonte: 'escuta_institucional.md §10 | manual_metodologico.md §3.3'
    },
    parametros: {
      titulo: 'Parâmetros do sistema',
      conteudo: [
        'Limite diário: máximo de perguntas por usuário/dia (padrão: 3).',
        'Anti-spam: intervalo mínimo entre perguntas ao mesmo usuário (padrão: 4h).',
        'Grupo mínimo: tamanho mínimo de grupo para análise estratificada (padrão: 5).',
        'Meta de saturação: max(10, min(25, total_usuários × 0.25)) respostas/dimensão/período.',
        'Total de colaboradores: definido via PropertiesService (TOTAL_COLABORADORES).'
      ],
      fonte: 'manual_metodologico.md §3.4 | escuta_institucional.md §6'
    },
    fairness: {
      titulo: 'Como o sistema garante distribuição justa?',
      conteudo: [
        'Perguntas são priorizadas para dimensões com menor cobertura no período.',
        'Limite diário impede que o mesmo usuário seja sobrecarregado.',
        'Anti-spam (4h) evita perguntas em sequência.',
        'Perguntas respondidas nas últimas 48h são excluídas da seleção.',
        'Dimensões saturadas param de receber perguntas automaticamente.'
      ],
      fonte: 'escuta_institucional.md §8 | manual_metodologico.md §5'
    },
    nr1: {
      titulo: 'Monitoramento NR-1 (Risco Psicossocial)',
      conteudo: [
        'A NR-1 (2024) exige gerenciamento de riscos psicossociais no trabalho.',
        'O sistema monitora via dimensão "risco_psicossocial" com peso reforçado (1.5).',
        'Alerta crítico é gerado quando o indicador cai abaixo de 2.5.',
        'IMPORTANTE: Este sistema realiza monitoramento agregado. NÃO substitui acompanhamento clínico individual.',
        'Em caso de alerta NR-1: acionar protocolos de saúde ocupacional da instituição.'
      ],
      fonte: 'escuta_institucional.md §7 | manual_metodologico.md §2.1'
    },
    privacidade: {
      titulo: 'Privacidade e anonimização',
      conteudo: [
        'Email é convertido em hash (djb2 base36) antes de qualquer armazenamento.',
        'Campo "anônimo": quando ativado, o email original não é gravado.',
        'Dados estratificados só são exibidos para grupos com ≥5 participantes.',
        'Perfil analítico é preenchimento voluntário — nunca obrigatório.',
        'Nenhuma análise individual é realizada ou exibida.'
      ],
      fonte: 'escuta_institucional.md §9.3 | manual_metodologico.md §4.3'
    }
  };

  if (secao && manual[secao]) {
    return { ok: true, dados: manual[secao] };
  }
  return { ok: true, dados: manual };
}

// ═══════════════════════════════════════════════════════════════
// LOG DE AUDITORIA
// ═══════════════════════════════════════════════════════════════

function _escutaLog(acao, email, dados) {
  try {
    var sh = _escutaSheet(_ESCUTA_SHEETS.LOGS);
    sh.appendRow([new Date().toISOString(), email, acao, JSON.stringify(dados || {})]);
  } catch(e) {
    console.warn('[EscutaLog] ' + e.message);
  }
}
