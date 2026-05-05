/**
 * @file mod_escuta.gs
 * @layer backend
 * @description Sistema de Escuta Institucional Contínua — backend Google Apps Script.
 *              Gerencia pesquisas pulse adaptativas, escuta espontânea, banco de pesquisas,
 *              pesquisas personalizadas, indicadores de clima organizacional, detecção de
 *              risco psicossocial (NR-1), alertas institucionais e geração de relatórios.
 * @responsibility CRUD de respostas e escuta; cálculo de indicadores por dimensão; controle
 *                 de saturação e fairness; detecção de alertas; governança e anonimização;
 *                 geração de relatórios periódicos; gestão do ciclo de vida de pesquisas.
 * @dependencies SpreadsheetApp (sheets: EscutaPerguntas, EscutaRespostas, EscutaEspontanea,
 *               EscutaPesquisas, EscutaBancoPesquisas, EscutaAlertas, EscutaSaturacao,
 *               EscutaPerfilAnalitico, EscutaAcoes, EscutaConfig), mod_permissoes.gs
 */

// ═══════════════════════════════════════════════════════════════
// CONFIGURAÇÃO E CONSTANTES
// ═══════════════════════════════════════════════════════════════

var _ESCUTA_SHEETS = {
  PERGUNTAS:        'EscutaPerguntas',
  RESPOSTAS:        'EscutaRespostas',
  ESPONTANEA:       'EscutaEspontanea',
  PESQUISAS:        'EscutaPesquisas',
  BANCO_PESQUISAS:  'EscutaBancoPesquisas',
  ALERTAS:          'EscutaAlertas',
  SATURACAO:        'EscutaSaturacao',
  PERFIL_ANALITICO: 'EscutaPerfilAnalitico',
  ACOES:            'EscutaAcoes',
  CONFIG:           'EscutaConfig'
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

// Dimensões com pontuação invertida (maior = pior)
var _ESCUTA_DIMENSOES_INVERTIDAS = ['carga', 'risco_psicossocial'];

var _ESCUTA_DEFAULTS = {
  META_FACTOR:       0.25,
  META_MIN:          10,
  META_MAX:          25,
  LIMITE_DIA:        3,
  ANTI_SPAM_HORAS:   4,
  CONFIANCA_MINIMA:  0.15,
  GRUPO_MINIMO:      5,
  PERIODO_TENDENCIA: 3
};

// ═══════════════════════════════════════════════════════════════
// BANCO DE PERGUNTAS PADRÃO (HARDCODED)
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
// HELPERS — SHEETS
// ═══════════════════════════════════════════════════════════════

function _escutaSS() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function _escutaSheet(nome) {
  var ss = _escutaSS();
  var sh = ss.getSheetByName(nome);
  if (!sh) {
    sh = ss.insertSheet(nome);
    _escutaInicializarCabecalhos(sh, nome);
  }
  return sh;
}

function _escutaInicializarCabecalhos(sh, nome) {
  var cabecalhos = {
    EscutaRespostas:       ['id','perguntaId','emailHash','email','resposta','dimensao','tipo',
                            'tipoTempo','timestamp','turno','progressoTurno','periodo','setor',
                            'anonimo','sourcePesquisaId'],
    EscutaEspontanea:      ['id','emailHash','email','categoria','texto','sentimento',
                            'anonimo','timestamp','setor'],
    EscutaPesquisas:       ['id','titulo','perguntas','criadoPor','periodoInicio','periodoFim',
                            'status','prioridade','criadoEm','direcionamento'],
    EscutaBancoPesquisas:  ['id','titulo','descricao','perguntas','tema','criadoPor','criadoEm'],
    EscutaAlertas:         ['id','tipo','dimensao','nivel','descricao','dados','timestamp',
                            'status','responsavel','acao','resolvidoEm'],
    EscutaSaturacao:       ['periodo','dimensao','coletados','meta','saturado'],
    EscutaPerfilAnalitico: ['email','genero','raca','orientacaoSexual','faixaSalarial','vinculo',
                            'nivel','tempoCasa','regiao','distancia','atualizadoEm'],
    EscutaAcoes:           ['id','alertaId','descricao','responsavel','prazo','status',
                            'criadoEm','concluidoEm'],
    EscutaConfig:          ['chave','valor','atualizadoEm']
  };
  var cols = cabecalhos[nome];
  if (cols) sh.appendRow(cols);
}

function _escutaID() {
  return 'ESC-' + new Date().getTime() + '-' + Math.random().toString(36).substr(2, 6).toUpperCase();
}

function _escutaEmailHash(email) {
  var str = email.toLowerCase().trim();
  var hash = 0;
  for (var i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return 'U' + Math.abs(hash).toString(36).toUpperCase();
}

function _escutaSheetToArray(sh) {
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  return data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i]; });
    return obj;
  });
}

function _escutaPeriodoAtual() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function _escutaDataHoje() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
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

// Evitar início (<10%) e fim (>95%) do turno
function _escutaMomentoPropicio() {
  var prog = _escutaProgressoTurno();
  return prog >= 0.10 && prog <= 0.95;
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
      ativo:                  'true',
      ativoEspontanea:        'true',
      ativoPadrao:            'true',
      ativoPersonalizado:     'true',
      limiteDia:              String(_ESCUTA_DEFAULTS.LIMITE_DIA),
      antiSpamHoras:          String(_ESCUTA_DEFAULTS.ANTI_SPAM_HORAS),
      confiancaMinima:        String(_ESCUTA_DEFAULTS.CONFIANCA_MINIMA),
      grupoMinimo:            String(_ESCUTA_DEFAULTS.GRUPO_MINIMO),
      metaFactor:             String(_ESCUTA_DEFAULTS.META_FACTOR)
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
    var email = Session.getActiveUser().getEmail();
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
    // Retorna o banco padrão (com possível override de ativa via sheet)
    var sh   = _escutaSheet(_ESCUTA_SHEETS.PERGUNTAS);
    var rows = _escutaSheetToArray(sh);

    // Merge: padrão + customizações
    var overrides = {};
    rows.forEach(function(r) { if (r.id) overrides[r.id] = r; });

    var perguntas = _BANCO_PERGUNTAS_PADRAO.map(function(p) {
      if (overrides[p.id]) {
        return Object.assign({}, p, {
          ativa:  overrides[p.id].ativa === 'false' ? false : Boolean(overrides[p.id].ativa !== false),
          texto:  overrides[p.id].texto || p.texto,
          peso:   parseFloat(overrides[p.id].peso) || p.peso
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
    var email = Session.getActiveUser().getEmail();
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
  var ss = _escutaSS();
  var shUsuarios = ss.getSheetByName('Usuarios') || ss.getSheetByName('usuarios');
  var totalUsuarios = shUsuarios ? Math.max(shUsuarios.getLastRow() - 1, 1) : 20;
  var cfg = obterConfiguracaoEscuta().dados || {};
  var fator = parseFloat(cfg.metaFactor) || _ESCUTA_DEFAULTS.META_FACTOR;
  var min   = _ESCUTA_DEFAULTS.META_MIN;
  var max   = _ESCUTA_DEFAULTS.META_MAX;
  return Math.max(min, Math.min(max, Math.round(totalUsuarios * fator)));
}

function _escutaVerificarSaturacao(dimensao, periodo) {
  periodo = periodo || _escutaPeriodoAtual();
  var sh   = _escutaSheet(_ESCUTA_SHEETS.SATURACAO);
  var rows = _escutaSheetToArray(sh);
  var reg  = rows.find(function(r) { return r.periodo === periodo && r.dimensao === dimensao; });
  if (!reg) return false;
  return reg.saturado === 'true' || reg.saturado === true;
}

function _escutaIncrementarSaturacao(dimensao, periodo) {
  periodo = periodo || _escutaPeriodoAtual();
  var meta = _escutaMetaDimensao();
  var sh   = _escutaSheet(_ESCUTA_SHEETS.SATURACAO);
  var rows = _escutaSheetToArray(sh);
  var idx  = rows.findIndex(function(r) { return r.periodo === periodo && r.dimensao === dimensao; });

  if (idx >= 0) {
    var rowNum    = idx + 2;
    var coletados = parseInt(rows[idx].coletados || 0) + 1;
    sh.getRange(rowNum, 3).setValue(coletados);
    sh.getRange(rowNum, 4).setValue(meta);
    sh.getRange(rowNum, 5).setValue(String(coletados >= meta));
  } else {
    sh.appendRow([periodo, dimensao, 1, meta, String(1 >= meta)]);
  }
}

function obterSaturacaoEscuta() {
  try {
    var periodo = _escutaPeriodoAtual();
    var sh      = _escutaSheet(_ESCUTA_SHEETS.SATURACAO);
    var rows    = _escutaSheetToArray(sh);
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
    var email = Session.getActiveUser().getEmail();
    var cfg   = obterConfiguracaoEscuta().dados || {};

    // Sistema global desativado
    if (cfg.ativo === 'false') return { ok: true, pergunta: null, motivo: 'sistema_inativo' };

    // Pesquisas padrão desativadas
    if (cfg.ativoPadrao === 'false') {
      // Verificar se há pesquisa personalizada ativa com prioridade
      var pessoal = _escutaObterPesquisaPersonalizadaAtiva();
      if (!pessoal) return { ok: true, pergunta: null, motivo: 'padrao_inativo' };
    }

    // Pesquisa personalizada (direcionada ou geral) tem PRIORIDADE sobre padrão
    var pesquisaPersonalizada = _escutaObterPesquisaPersonalizadaAtiva(email);
    if (pesquisaPersonalizada && cfg.ativoPersonalizado !== 'false') {
      var pergPersonal = _escutaProximaPerguntaPesquisa(pesquisaPersonalizada, email);
      if (pergPersonal) return { ok: true, pergunta: pergPersonal, sourcePesquisaId: pesquisaPersonalizada.id };
    }

    // Verificar momento propício
    if (!_escutaMomentoPropicio()) return { ok: true, pergunta: null, motivo: 'momento_impropicio' };

    // Verificar limite diário do usuário
    var hoje = _escutaDataHoje();
    var shR  = _escutaSheet(_ESCUTA_SHEETS.RESPOSTAS);
    var resp = _escutaSheetToArray(shR);
    var hashU = _escutaEmailHash(email);
    var respostasHoje = resp.filter(function(r) {
      return r.emailHash === hashU && String(r.timestamp).startsWith(hoje);
    });
    var limite = parseInt(cfg.limiteDia) || _ESCUTA_DEFAULTS.LIMITE_DIA;
    if (respostasHoje.length >= limite) return { ok: true, pergunta: null, motivo: 'limite_dia' };

    // Anti-spam: verificar última resposta do usuário
    var antiSpam = parseFloat(cfg.antiSpamHoras) || _ESCUTA_DEFAULTS.ANTI_SPAM_HORAS;
    if (respostasHoje.length > 0) {
      var ultima = respostasHoje.sort(function(a, b) {
        return new Date(b.timestamp) - new Date(a.timestamp);
      })[0];
      var diffH = (new Date() - new Date(ultima.timestamp)) / 3600000;
      if (diffH < antiSpam) return { ok: true, pergunta: null, motivo: 'anti_spam' };
    }

    // Obter perguntas padrão ativas
    var todasPerguntas = obterPerguntasEscuta().dados || [];
    var perguntas = todasPerguntas.filter(function(p) {
      return p.ativa !== false && p.ativa !== 'false' && p.padrao;
    });

    // Filtrar por validade temporal
    perguntas = perguntas.filter(function(p) {
      return _escutaPerguntaValidaTemporalmente(p.tipoTempo);
    });

    // Excluir dimensões saturadas
    var periodo = _escutaPeriodoAtual();
    perguntas = perguntas.filter(function(p) {
      return !_escutaVerificarSaturacao(p.dimensao, periodo);
    });

    // Excluir perguntas já respondidas pelo usuário nas últimas 48h
    var idsRespondidos = {};
    resp.filter(function(r) {
      return r.emailHash === hashU &&
        (new Date() - new Date(r.timestamp)) < 172800000;
    }).forEach(function(r) { idsRespondidos[r.perguntaId] = true; });
    perguntas = perguntas.filter(function(p) { return !idsRespondidos[p.id]; });

    if (!perguntas.length) return { ok: true, pergunta: null, motivo: 'sem_perguntas' };

    // Priorizar dimensões com menos respostas (fairness de dimensão)
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

    var selecionada = perguntas[0];
    return {
      ok: true,
      pergunta: selecionada,
      turno:    _escutaTurnoAtual().nome,
      progresso: _escutaProgressoTurno()
    };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

function _escutaObterPesquisaPersonalizadaAtiva(email) {
  var hoje = _escutaDataHoje();
  var sh   = _escutaSheet(_ESCUTA_SHEETS.PESQUISAS);
  var rows = _escutaSheetToArray(sh);
  var ativas = rows.filter(function(r) {
    return r.status === 'ativo' &&
      (String(r.periodoInicio) <= hoje) &&
      (String(r.periodoFim) >= hoje);
  });
  if (!ativas.length) return null;

  // Verificar eligibilidade com direcionamento (pesquisas direcionadas têm prioridade)
  var perfilEmail = email ? _escutaObterPerfilPorEmail(email) : null;
  ativas = ativas.filter(function(r) {
    try { r.direcionamento = JSON.parse(r.direcionamento || 'null'); } catch(e) { r.direcionamento = null; }
    if (!r.direcionamento) return true; // sem direcionamento = todos elegíveis
    return _escutaUsuarioElegivel(email, perfilEmail, r.direcionamento);
  });

  if (!ativas.length) return null;

  // Pesquisas direcionadas têm prioridade (boost de 100)
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
  var sh   = _escutaSheet(_ESCUTA_SHEETS.PERFIL_ANALITICO);
  var rows = _escutaSheetToArray(sh);
  return rows.find(function(r) { return r.email === email; }) || null;
}

function _escutaUsuarioElegivel(email, perfil, direcionamento) {
  if (!direcionamento) return true;

  // Usuário explícito
  if (direcionamento.usuarios && direcionamento.usuarios.length > 0) {
    return direcionamento.usuarios.indexOf(email) >= 0;
  }

  if (!perfil) return false; // sem perfil não pode ser filtrado com segurança

  // Verificar cada dimensão de direcionamento
  function _match(campo, valorPerfil) {
    if (!direcionamento[campo] || !direcionamento[campo].length) return true;
    return direcionamento[campo].indexOf(valorPerfil || '') >= 0;
  }

  return _match('setores',      perfil.setor        || '') &&
         _match('nivelFuncao',  perfil.nivel        || '') &&
         _match('vinculo',      perfil.vinculo      || '') &&
         _match('faixaSalarial',perfil.faixaSalarial|| '') &&
         _match('tempoCasa',    perfil.tempoCasa    || '') &&
         _match('regioes',      perfil.regiao       || '');
}

function _escutaProximaPerguntaPesquisa(pesquisa, email) {
  var hashU = _escutaEmailHash(email);
  var shR   = _escutaSheet(_ESCUTA_SHEETS.RESPOSTAS);
  var resp  = _escutaSheetToArray(shR);
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
// REGISTRAR RESPOSTA PULSE
// ═══════════════════════════════════════════════════════════════

function registrarRespostaPulse(dados) {
  try {
    var email = Session.getActiveUser().getEmail();
    var cfg   = obterConfiguracaoEscuta().dados || {};
    if (cfg.ativo === 'false') return { ok: false, msg: 'Sistema inativo.' };
    if (cfg.ativoPadrao === 'false' && !dados.sourcePesquisaId) return { ok: false, msg: 'Pesquisas padrão inativas.' };

    var sh     = _escutaSheet(_ESCUTA_SHEETS.RESPOSTAS);
    var turno  = _escutaTurnoAtual();
    var agora  = new Date();
    var hashU  = _escutaEmailHash(email);
    var id     = _escutaID();

    sh.appendRow([
      id,
      dados.perguntaId || '',
      hashU,
      dados.anonimo ? '' : email,
      dados.resposta,
      dados.dimensao || '',
      dados.tipo     || '',
      dados.tipoTempo || '',
      agora.toISOString(),
      turno.nome,
      _escutaProgressoTurno().toFixed(3),
      _escutaPeriodoAtual(),
      dados.setor    || '',
      dados.anonimo ? 'true' : 'false',
      dados.sourcePesquisaId || ''
    ]);

    _escutaIncrementarSaturacao(dados.dimensao, _escutaPeriodoAtual());
    _escutaVerificarEGerarAlertas();

    return { ok: true, id: id };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// ESCUTA ESPONTÂNEA
// ═══════════════════════════════════════════════════════════════

function registrarEscutaEspontanea(dados) {
  try {
    var email = Session.getActiveUser().getEmail();
    var cfg   = obterConfiguracaoEscuta().dados || {};
    if (cfg.ativo === 'false' || cfg.ativoEspontanea === 'false') {
      return { ok: false, msg: 'Escuta espontânea inativa.' };
    }

    var sh     = _escutaSheet(_ESCUTA_SHEETS.ESPONTANEA);
    var hashU  = _escutaEmailHash(email);
    var id     = _escutaID();
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

    return { ok: true, id: id };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

function _escutaAnalisarSentimento(texto) {
  if (!texto) return 'neutro';
  var t  = texto.toLowerCase();
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
// PESQUISAS PERSONALIZADAS
// ═══════════════════════════════════════════════════════════════

function obterPesquisasEscuta() {
  try {
    var sh   = _escutaSheet(_ESCUTA_SHEETS.PESQUISAS);
    var rows = _escutaSheetToArray(sh);
    rows.forEach(function(r) {
      try { r.perguntas = JSON.parse(r.perguntas); } catch(e) { r.perguntas = []; }
    });
    return { ok: true, dados: rows };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

function salvarPesquisaEscuta(dados) {
  try {
    var email = Session.getActiveUser().getEmail();
    var sh    = _escutaSheet(_ESCUTA_SHEETS.PESQUISAS);

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
      JSON.stringify(dados.direcionamento || null)
    ]);
    _escutaLog('salvarPesquisa', email, { id: id, titulo: dados.titulo });
    return { ok: true, id: id };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

function excluirPesquisaEscuta(id) {
  try {
    var email = Session.getActiveUser().getEmail();
    var sh    = _escutaSheet(_ESCUTA_SHEETS.PESQUISAS);
    var rows  = _escutaSheetToArray(sh);
    var idx   = rows.findIndex(function(r) { return r.id === id; });
    if (idx >= 0) sh.deleteRow(idx + 2);
    _escutaLog('excluirPesquisa', email, { id: id });
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
    var sh   = _escutaSheet(_ESCUTA_SHEETS.BANCO_PESQUISAS);
    var rows = _escutaSheetToArray(sh);
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
    var email = Session.getActiveUser().getEmail();
    var sh    = _escutaSheet(_ESCUTA_SHEETS.BANCO_PESQUISAS);
    var id    = dados.id || _escutaID();

    if (dados.id) {
      var rows = _escutaSheetToArray(sh);
      var idx  = rows.findIndex(function(r) { return r.id === dados.id; });
      if (idx >= 0) {
        sh.getRange(idx + 2, 2).setValue(dados.titulo || '');
        sh.getRange(idx + 2, 3).setValue(dados.descricao || '');
        sh.getRange(idx + 2, 4).setValue(JSON.stringify(dados.perguntas || []));
        sh.getRange(idx + 2, 5).setValue(dados.tema || '');
        return { ok: true };
      }
    }

    sh.appendRow([id, dados.titulo || '', dados.descricao || '',
                  JSON.stringify(dados.perguntas || []), dados.tema || '',
                  email, new Date().toISOString()]);
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
    var email = Session.getActiveUser().getEmail();
    var shR   = _escutaSheet(_ESCUTA_SHEETS.RESPOSTAS);
    var shE   = _escutaSheet(_ESCUTA_SHEETS.ESPONTANEA);
    var shA   = _escutaSheet(_ESCUTA_SHEETS.ALERTAS);
    var respostas   = _escutaSheetToArray(shR);
    var espontaneas = _escutaSheetToArray(shE);
    var alertas     = _escutaSheetToArray(shA);

    var periodo  = filtros.periodo  || _escutaPeriodoAtual();
    var setor    = filtros.setor    || '';
    var modo     = filtros.modo     || 'geral';

    // Filtrar por período
    var respPeriodo = respostas.filter(function(r) {
      return String(r.periodo) === periodo &&
        (!setor || r.setor === setor);
    });

    var indicadores = _escutaCalcIndicadores(respPeriodo);
    var saturacao   = obterSaturacaoEscuta().dados || [];
    var tendencia   = _escutaCalcTendencia(respostas, periodo);
    var espontaneas_periodo = espontaneas.filter(function(e) {
      return String(e.timestamp).startsWith(periodo.substring(0,7));
    });
    var resumoEspontanea = _escutaResumoEspontanea(espontaneas_periodo);
    var alertasAtivos    = alertas.filter(function(a) { return a.status === 'ativo'; });

    // Estatísticas de participação
    var cfg          = obterConfiguracaoEscuta().dados || {};
    var grupoMinimo  = parseInt(cfg.grupoMinimo) || _ESCUTA_DEFAULTS.GRUPO_MINIMO;
    var totalUniqueHash = {};
    respPeriodo.forEach(function(r) { totalUniqueHash[r.emailHash] = true; });
    var totalParticipantes = Object.keys(totalUniqueHash).length;

    var confianca = _escutaCalcConfianca(totalParticipantes);

    // Dashboard estratificado (apenas se confiança suficiente e grupo mínimo)
    var estratificado = null;
    if (modo === 'estratificado' && totalParticipantes >= grupoMinimo) {
      estratificado = _escutaCalcEstratificado(respPeriodo);
    }

    return {
      ok: true,
      dados: {
        periodo:           periodo,
        indicadores:       indicadores,
        confianca:         confianca,
        totalParticipantes:totalParticipantes,
        saturacao:         saturacao,
        tendencia:         tendencia,
        resumoEspontanea:  resumoEspontanea,
        alertasAtivos:     alertasAtivos.length,
        estratificado:     estratificado,
        grupoMinimo:       grupoMinimo,
        bloqueado:         totalParticipantes < grupoMinimo
      }
    };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

function _escutaCalcIndicadores(respostas) {
  var porDimensao = {};
  _ESCUTA_DIMENSOES.forEach(function(d) { porDimensao[d] = []; });

  respostas.forEach(function(r) {
    if (!r.dimensao || !porDimensao[r.dimensao]) return;
    var val = parseFloat(r.resposta);
    if (isNaN(val)) return;
    // Inverter para dimensões negativas
    if (_ESCUTA_DIMENSOES_INVERTIDAS.indexOf(r.dimensao) >= 0) val = 6 - val;
    porDimensao[r.dimensao].push(val);
  });

  var resultado = {};
  _ESCUTA_DIMENSOES.forEach(function(d) {
    var vals = porDimensao[d];
    resultado[d] = {
      media:   vals.length ? _escutaMedia(vals) : null,
      n:       vals.length,
      nivel:   vals.length ? _escutaNivelClimatico(_escutaMedia(vals)) : 'sem_dados'
    };
  });

  // Clima Geral (dimensões positivas, excluindo risco_psicossocial e carga das positivas base)
  var dimPositivas = ['energia','clareza','apoio','autonomia','cultura','lideranca'];
  var valsGeral = [];
  dimPositivas.forEach(function(d) {
    if (resultado[d].media !== null) valsGeral.push(resultado[d].media);
  });
  resultado._climaGeral = {
    media: valsGeral.length ? _escutaMedia(valsGeral) : null,
    nivel: valsGeral.length ? _escutaNivelClimatico(_escutaMedia(valsGeral)) : 'sem_dados'
  };

  return resultado;
}

function _escutaMedia(arr) {
  if (!arr.length) return null;
  return arr.reduce(function(s, v) { return s + v; }, 0) / arr.length;
}

function _escutaNivelClimatico(media) {
  if (media === null) return 'sem_dados';
  if (media >= 4.5) return 'excelente';
  if (media >= 3.5) return 'bom';
  if (media >= 2.5) return 'regular';
  if (media >= 1.5) return 'baixo';
  return 'critico';
}

function _escutaCalcConfianca(participantes) {
  var ss       = _escutaSS();
  var shU      = ss.getSheetByName('Usuarios') || ss.getSheetByName('usuarios');
  var totalEsp = shU ? Math.max(shU.getLastRow() - 1, 1) : 20;
  var cfg      = obterConfiguracaoEscuta().dados || {};
  var minConf  = parseFloat(cfg.confiancaMinima) || _ESCUTA_DEFAULTS.CONFIANCA_MINIMA;
  var taxa     = participantes / totalEsp;
  return {
    taxa:        parseFloat(taxa.toFixed(3)),
    participantes: participantes,
    total:       totalEsp,
    suficiente:  taxa >= minConf,
    percentual:  Math.round(taxa * 100)
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
    var r = respostas.filter(function(x) { return String(x.periodo) === p; });
    var ind = _escutaCalcIndicadores(r);
    return {
      periodo: p,
      climaGeral: ind._climaGeral.media,
      n: r.length
    };
  });
}

function _escutaResumoEspontanea(espontaneas) {
  var cats = {};
  var sents = { positivo: 0, negativo: 0, neutro: 0 };
  espontaneas.forEach(function(e) {
    if (e.categoria) cats[e.categoria] = (cats[e.categoria] || 0) + 1;
    if (e.sentimento in sents) sents[e.sentimento]++;
  });
  return { categorias: cats, sentimentos: sents, total: espontaneas.length };
}

function _escutaCalcEstratificado(respostas) {
  var cfg  = obterConfiguracaoEscuta().dados || {};
  var gmin = parseInt(cfg.grupoMinimo) || _ESCUTA_DEFAULTS.GRUPO_MINIMO;
  var shP  = _escutaSheet(_ESCUTA_SHEETS.PERFIL_ANALITICO);
  var perfis = _escutaSheetToArray(shP);
  var perfilPorHash = {};
  perfis.forEach(function(p) {
    var h = _escutaEmailHash(p.email || '');
    perfilPorHash[h] = p;
  });

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
        resultado[g] = { media: _escutaMedia(grupos[g]), n: grupos[g].length };
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
  var gaps = [];
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
    var valGroups = Object.keys(grupos).filter(function(g) {
      return grupos[g].length >= grupoMinimo;
    });
    if (valGroups.length < 2) return;
    var medias = valGroups.map(function(g) {
      return { grupo: g, media: _escutaMedia(grupos[g]) };
    });
    medias.sort(function(a, b) { return a.media - b.media; });
    var gap = medias[medias.length-1].media - medias[0].media;
    if (gap >= 0.8) {
      gaps.push({
        atributo: attr,
        gap:      parseFloat(gap.toFixed(2)),
        menor:    medias[0],
        maior:    medias[medias.length-1],
        nivel:    gap >= 1.5 ? 'critico' : 'moderado'
      });
    }
  });
  return gaps;
}

// ═══════════════════════════════════════════════════════════════
// ALERTAS
// ═══════════════════════════════════════════════════════════════

function obterAlertasEscuta() {
  try {
    var sh   = _escutaSheet(_ESCUTA_SHEETS.ALERTAS);
    var rows = _escutaSheetToArray(sh);
    return { ok: true, dados: rows.filter(function(r) { return r.status === 'ativo'; }) };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

function _escutaVerificarEGerarAlertas() {
  try {
    var shR  = _escutaSheet(_ESCUTA_SHEETS.RESPOSTAS);
    var shE  = _escutaSheet(_ESCUTA_SHEETS.ESPONTANEA);
    var resp = _escutaSheetToArray(shR).filter(function(r) {
      return String(r.periodo) === _escutaPeriodoAtual();
    });
    var espontaneas = _escutaSheetToArray(shE).filter(function(e) {
      return String(e.timestamp).startsWith(_escutaPeriodoAtual().substring(0,7));
    });

    var ind  = _escutaCalcIndicadores(resp);
    var conf = _escutaCalcConfianca(Object.keys(
      resp.reduce(function(a, r) { a[r.emailHash]=1; return a; }, {})
    ).length);

    if (!conf.suficiente) return; // Sem confiança mínima, não gerar alertas

    var alertas = _escutaDetectarAlertas(ind, espontaneas, resp);
    alertas.forEach(function(a) {
      _escutaRegistrarAlerta(a);
    });
  } catch(e) {
    Logger.log('[Escuta] Erro alertas: ' + e.message);
  }
}

function _escutaDetectarAlertas(indicadores, espontaneas, respostas) {
  var alertas = [];
  var shA     = _escutaSheet(_ESCUTA_SHEETS.ALERTAS);
  var existentes = _escutaSheetToArray(shA).filter(function(a) {
    return a.status === 'ativo' &&
      String(a.timestamp).startsWith(_escutaPeriodoAtual().substring(0,7));
  });
  var tiposExistentes = {};
  existentes.forEach(function(a) { tiposExistentes[a.tipo] = true; });

  function jaTem(tipo) { return tiposExistentes[tipo]; }

  // Carga alta + Energia baixa (risco de burnout)
  var cargaInv = indicadores.carga && indicadores.carga.media !== null
    ? 6 - indicadores.carga.media : null; // Media invertida = carga real
  var energiaM = indicadores.energia && indicadores.energia.media;
  if (cargaInv && energiaM && cargaInv > 3.5 && energiaM < 2.5 && !jaTem('burnout_risco')) {
    alertas.push({
      tipo:      'burnout_risco',
      dimensao:  'energia,carga',
      nivel:     'alto',
      descricao: 'Padrão de carga alta combinado com energia baixa detectado. Risco de burnout.',
      dados:     JSON.stringify({ carga: (6-cargaInv).toFixed(2), energia: energiaM.toFixed(2) })
    });
  }

  // Apoio baixo
  if (indicadores.apoio && indicadores.apoio.media !== null &&
      indicadores.apoio.media < 2.5 && !jaTem('apoio_baixo')) {
    alertas.push({
      tipo:     'apoio_baixo',
      dimensao: 'apoio',
      nivel:    'moderado',
      descricao:'Indicador de apoio abaixo do limiar crítico.',
      dados:    JSON.stringify({ apoio: indicadores.apoio.media.toFixed(2) })
    });
  }

  // Risco psicossocial elevado (NR-1)
  var rpMedia = indicadores.risco_psicossocial && indicadores.risco_psicossocial.media;
  if (rpMedia && rpMedia < 2.5 && !jaTem('risco_psicossocial_nr1')) {
    alertas.push({
      tipo:     'risco_psicossocial_nr1',
      dimensao: 'risco_psicossocial',
      nivel:    'critico',
      descricao:'Indicadores de risco psicossocial (NR-1) em nível crítico.',
      dados:    JSON.stringify({ risco: rpMedia.toFixed(2) })
    });
  }

  // Escuta espontânea negativa elevada
  var resumoE  = _escutaResumoEspontanea(espontaneas);
  var totalE   = resumoE.total;
  var negE     = resumoE.sentimentos.negativo || 0;
  if (totalE >= 5 && (negE / totalE) > 0.6 && !jaTem('escuta_negativa')) {
    alertas.push({
      tipo:     'escuta_negativa',
      dimensao: 'escuta',
      nivel:    'moderado',
      descricao:'Maioria das escutas espontâneas com sentimento negativo.',
      dados:    JSON.stringify({ total: totalE, negativo: negE })
    });
  }

  // Liderança baixa
  if (indicadores.lideranca && indicadores.lideranca.media !== null &&
      indicadores.lideranca.media < 2.5 && !jaTem('lideranca_baixa')) {
    alertas.push({
      tipo:     'lideranca_baixa',
      dimensao: 'lideranca',
      nivel:    'moderado',
      descricao:'Indicador de liderança abaixo do limiar de atenção.',
      dados:    JSON.stringify({ lideranca: indicadores.lideranca.media.toFixed(2) })
    });
  }

  // Gap estrutural (desigualdade)
  var shP    = _escutaSheet(_ESCUTA_SHEETS.PERFIL_ANALITICO);
  var perfis = _escutaSheetToArray(shP);
  var perfilPorHash = {};
  perfis.forEach(function(p) { perfilPorHash[_escutaEmailHash(p.email || '')] = p; });
  var cfg  = obterConfiguracaoEscuta().dados || {};
  var gmin = parseInt(cfg.grupoMinimo) || _ESCUTA_DEFAULTS.GRUPO_MINIMO;
  var gaps = _escutaCalcGaps(respostas, perfilPorHash, gmin);
  gaps.filter(function(g) { return g.nivel === 'critico' && !jaTem('gap_' + g.atributo); })
    .forEach(function(g) {
      alertas.push({
        tipo:     'gap_' + g.atributo,
        dimensao: g.atributo,
        nivel:    'critico',
        descricao:'Desigualdade estrutural detectada em ' + g.atributo + ' (gap ' + g.gap + ').',
        dados:    JSON.stringify(g)
      });
    });

  return alertas;
}

function _escutaRegistrarAlerta(a) {
  var sh  = _escutaSheet(_ESCUTA_SHEETS.ALERTAS);
  var id  = _escutaID();
  sh.appendRow([
    id, a.tipo, a.dimensao, a.nivel, a.descricao,
    a.dados || '{}', new Date().toISOString(), 'ativo', '', '', ''
  ]);
  return id;
}

function resolverAlertaEscuta(id, acao) {
  try {
    var email = Session.getActiveUser().getEmail();
    var sh    = _escutaSheet(_ESCUTA_SHEETS.ALERTAS);
    var rows  = _escutaSheetToArray(sh);
    var idx   = rows.findIndex(function(r) { return r.id === id; });
    if (idx < 0) return { ok: false, msg: 'Alerta não encontrado.' };
    var row = idx + 2;
    sh.getRange(row, 8).setValue('resolvido');
    sh.getRange(row, 9).setValue(email);
    sh.getRange(row, 10).setValue(acao || '');
    sh.getRange(row, 11).setValue(new Date().toISOString());
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
    var email = Session.getActiveUser().getEmail();
    var sh    = _escutaSheet(_ESCUTA_SHEETS.PERFIL_ANALITICO);
    var rows  = _escutaSheetToArray(sh);
    var perfil = rows.find(function(r) { return r.email === email; });
    return { ok: true, dados: perfil || null };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

function salvarPerfilAnaliticoEscuta(dados) {
  try {
    var email = Session.getActiveUser().getEmail();
    var sh    = _escutaSheet(_ESCUTA_SHEETS.PERFIL_ANALITICO);
    var rows  = _escutaSheetToArray(sh);
    var idx   = rows.findIndex(function(r) { return r.email === email; });
    var agora = new Date().toISOString();

    var linha = [
      email,
      dados.genero             || '',
      dados.raca               || '',
      dados.orientacaoSexual   || '',
      dados.faixaSalarial      || '',
      dados.vinculo            || '',
      dados.nivel              || '',
      dados.tempoCasa          || '',
      dados.regiao             || '',
      dados.distancia          || '',
      agora
    ];

    if (idx >= 0) {
      sh.getRange(idx + 2, 1, 1, linha.length).setValues([linha]);
    } else {
      sh.appendRow(linha);
    }
    return { ok: true };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// RELATÓRIOS
// ═══════════════════════════════════════════════════════════════

function gerarRelatorioEscuta(tipo, periodo) {
  try {
    var email   = Session.getActiveUser().getEmail();
    periodo     = periodo || _escutaPeriodoAtual();
    var shR     = _escutaSheet(_ESCUTA_SHEETS.RESPOSTAS);
    var shE     = _escutaSheet(_ESCUTA_SHEETS.ESPONTANEA);
    var shA     = _escutaSheet(_ESCUTA_SHEETS.ALERTAS);
    var resp    = _escutaSheetToArray(shR).filter(function(r) {
      return String(r.periodo) === periodo;
    });
    var esponts = _escutaSheetToArray(shE).filter(function(e) {
      return String(e.timestamp).startsWith(periodo.substring(0,7));
    });
    var alertas = _escutaSheetToArray(shA).filter(function(a) {
      return String(a.timestamp).startsWith(periodo.substring(0,7));
    });

    var ind   = _escutaCalcIndicadores(resp);
    var tend  = _escutaCalcTendencia(_escutaSheetToArray(shR), periodo);
    var eRes  = _escutaResumoEspontanea(esponts);
    var uHash = {};
    resp.forEach(function(r) { uHash[r.emailHash] = true; });
    var conf  = _escutaCalcConfianca(Object.keys(uHash).length);

    var relatorio = {
      tipo:       tipo || 'institucional',
      periodo:    periodo,
      geradoEm:   new Date().toISOString(),
      geradoPor:  email,
      confianca:  conf,
      indicadores: ind,
      tendencia:  tend,
      escuta:     eRes,
      alertas: {
        total:    alertas.length,
        criticos: alertas.filter(function(a) { return a.nivel === 'critico'; }).length,
        abertos:  alertas.filter(function(a) { return a.status === 'ativo'; }).length
      },
      recomendacoes: _escutaGerarRecomendacoes(ind, eRes, alertas)
    };

    return { ok: true, dados: relatorio };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

function _escutaGerarRecomendacoes(indicadores, resumoEspontanea, alertas) {
  var recs = [];

  _ESCUTA_DIMENSOES.forEach(function(d) {
    var i = indicadores[d];
    if (!i || i.media === null) return;
    var isInv = _ESCUTA_DIMENSOES_INVERTIDAS.indexOf(d) >= 0;
    var score = isInv ? 6 - i.media : i.media;
    if (score < 2.5) {
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
// CARGA INICIAL DO MÓDULO
// ═══════════════════════════════════════════════════════════════

function obterDadosEscuta() {
  try {
    var email   = Session.getActiveUser().getEmail();
    var cfg     = obterConfiguracaoEscuta();
    var dash    = obterDashboardEscuta({});
    var alertas = obterAlertasEscuta();
    var perfil  = obterPerfilAnaliticoEscuta();
    var pesqs   = obterPesquisasEscuta();
    var banco   = obterBancoPesquisas();
    var satur   = obterSaturacaoEscuta();
    var perguntas = obterPerguntasEscuta();

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
      perguntas: perguntas.dados
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
    var shA    = _escutaSheet(_ESCUTA_SHEETS.ALERTAS);
    var rows   = _escutaSheetToArray(shA);
    var resolvidos = rows.filter(function(r) {
      return r.status === 'resolvido' && r.acao;
    }).slice(-5);
    return { ok: true, dados: resolvidos };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// LOG DE AUDITORIA
// ═══════════════════════════════════════════════════════════════

function _escutaLog(acao, email, dados) {
  try {
    var ss = _escutaSS();
    var sh = ss.getSheetByName('LogsEscuta');
    if (!sh) {
      sh = ss.insertSheet('LogsEscuta');
      sh.appendRow(['timestamp','email','acao','dados']);
    }
    sh.appendRow([new Date().toISOString(), email, acao, JSON.stringify(dados || {})]);
  } catch(e) {
    Logger.log('[EscutaLog] ' + e.message);
  }
}
