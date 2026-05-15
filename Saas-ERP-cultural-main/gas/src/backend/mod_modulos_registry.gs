/**
 * @file mod_modulos_registry.gs
 * @description Registro centralizado de módulos do sistema. Controla ativação/desativação
 *              de módulos via interface SUPERADMIN. Persistência via DataLayer (JSON no Drive).
 * @layer backend
 * @responsibility CRUD do registro de módulos; verificação de acesso (SUPERADMIN only);
 *                 exposição de status para o boot do frontend.
 * @dependencies utils.js (obterEmailUsuario, verificarPermissao, registrarLog),
 *               DataLayer.gs (readJSON, writeJSON)
 */

var _MOD_FILE           = 'modulos_registry.json';
var _MOD_SCHEMA_VERSION = 2;

// ══════════════════════════════════════════════════════════════════
// BLOCO: Registro padrão de módulos
// ══════════════════════════════════════════════════════════════════
// nucleo:true  → não pode ser desativado pelo SUPERADMIN
// ativo:false  → bloqueado até ativação explícita
// apenasSuperadmin:true  → visível e acessível apenas para perfil superadmin
// ══════════════════════════════════════════════════════════════════

var _MOD_DEFAULTS = [

  // NÚCLEO — sempre ativos
  {
    moduleId: 'agenda_geral', nome: 'Agenda Geral', categoria: 'espacos',
    descricao: 'Calendário principal de reservas de espaços', versao: '1.0',
    ativo: true, nucleo: true, apenasSuperadmin: false,
    rotas: ['aba-lista-reservas'],
    menus: [{ grupo: 'mod-espacos', btn: 'aba-lista-reservas' }],
    dependencias: [], status_operacional: 'stable'
  },
  {
    moduleId: 'nova_reserva', nome: 'Novo Agendamento', categoria: 'espacos',
    descricao: 'Formulário de criação e edição de reservas', versao: '1.0',
    ativo: true, nucleo: true, apenasSuperadmin: false,
    rotas: ['aba-nova-reserva'],
    menus: [{ grupo: 'mod-espacos', btn: 'aba-nova-reserva' }],
    dependencias: ['agenda_geral'], status_operacional: 'stable'
  },
  {
    moduleId: 'configuracoes', nome: 'Configurações', categoria: 'sistema',
    descricao: 'Painel de administração do sistema', versao: '1.0',
    ativo: true, nucleo: true, apenasSuperadmin: false,
    rotas: ['aba-gestao-admin'],
    menus: [{ grupo: 'mod-sistema', btn: 'aba-gestao-admin' }],
    dependencias: [], status_operacional: 'stable'
  },
  {
    moduleId: 'auditoria', nome: 'Auditoria', categoria: 'sistema',
    descricao: 'Log de auditoria e rastreabilidade operacional', versao: '1.0',
    ativo: true, nucleo: true, apenasSuperadmin: false,
    rotas: ['aba-auditoria'],
    menus: [{ grupo: 'mod-sistema', btn: 'aba-auditoria' }],
    dependencias: [], status_operacional: 'stable'
  },
  {
    moduleId: 'permissoes', nome: 'Permissões', categoria: 'sistema',
    descricao: 'Gestão de permissões por perfil e usuário', versao: '2.0',
    ativo: true, nucleo: true, apenasSuperadmin: false,
    rotas: ['aba-permissoes-v2'],
    menus: [{ grupo: 'mod-sistema', btn: 'aba-permissoes-v2' }],
    dependencias: [], status_operacional: 'stable'
  },
  {
    moduleId: 'gestao_modulos', nome: 'Gestão de Módulos', categoria: 'sistema',
    descricao: 'Painel SUPERADMIN de ativação e configuração de módulos', versao: '1.0',
    ativo: true, nucleo: true, apenasSuperadmin: true,
    rotas: ['aba-gestao-modulos'],
    menus: [{ grupo: 'mod-sistema', btn: 'aba-gestao-modulos' }],
    dependencias: [], status_operacional: 'stable'
  },

  // PROGRAMAÇÃO — ativáveis
  {
    moduleId: 'acoes', nome: 'Ações Institucionais', categoria: 'programacao',
    descricao: 'Gestão de iniciativas, eventos e projetos — núcleo integrador da plataforma', versao: '1.0',
    ativo: true, nucleo: false, apenasSuperadmin: false,
    rotas: ['aba-acoes'],
    menus: [{ grupo: 'mod-programacao', btn: 'aba-acoes' }],
    dependencias: [], status_operacional: 'beta'
  },
  {
    moduleId: 'habilitacoes', nome: 'Credenciamento', categoria: 'programacao',
    descricao: 'Processo de credenciamento de proponentes para programas do CCBJ', versao: '1.0',
    ativo: true, nucleo: false, apenasSuperadmin: false,
    rotas: ['aba-habilitacoes'],
    menus: [{ grupo: 'mod-programacao', btn: 'aba-habilitacoes' }],
    dependencias: [], status_operacional: 'stable'
  },

  // OPERACIONAIS — ativáveis
  {
    moduleId: 'aprovacoes', nome: 'Aprovações', categoria: 'operacional',
    descricao: 'Fluxo de aprovação de reservas e cadastros externos', versao: '1.0',
    ativo: true, nucleo: false, apenasSuperadmin: false,
    rotas: ['aba-aprovacoes'],
    menus: [{ grupo: 'mod-operacional', btn: 'aba-aprovacoes' }],
    dependencias: ['agenda_geral'], status_operacional: 'stable'
  },

  // COMUNICAÇÃO — ativáveis
  {
    moduleId: 'agenda_rece', nome: 'Agenda RECE', categoria: 'comunicacao',
    descricao: 'Agenda da Rede de Espaços Culturais Espontâneos', versao: '1.0',
    ativo: true, nucleo: false, apenasSuperadmin: false,
    rotas: ['aba-agenda-rece'],
    menus: [{ grupo: 'mod-comunicacao', btn: 'aba-agenda-rece' }],
    dependencias: ['agenda_geral'], status_operacional: 'stable'
  },
  {
    moduleId: 'balcao', nome: 'Balcão da Comunicação', categoria: 'comunicacao',
    descricao: 'Solicitações e processos de comunicação institucional', versao: '0.7',
    ativo: false, nucleo: false, apenasSuperadmin: false,
    rotas: ['aba-balcao'],
    menus: [{ grupo: 'mod-comunicacao', btn: 'aba-balcao' }],
    dependencias: [], status_operacional: 'beta'
  },
  {
    moduleId: 'processos', nome: 'Processos', categoria: 'comunicacao',
    descricao: 'Gestão de processos de comunicação institucional', versao: '0.8',
    ativo: false, nucleo: false, apenasSuperadmin: false,
    rotas: ['aba-processos'],
    menus: [],
    dependencias: [], status_operacional: 'beta'
  },

  // ESTRATÉGIA — ativáveis
  {
    moduleId: 'dashboard', nome: 'Dashboard Geral', categoria: 'estrategia',
    descricao: 'Painel de indicadores e métricas operacionais', versao: '1.0',
    ativo: true, nucleo: false, apenasSuperadmin: false,
    rotas: ['aba-dashboard'],
    menus: [{ grupo: 'mod-estrategia', btn: 'aba-dashboard' }],
    dependencias: [], status_operacional: 'stable'
  },
  {
    moduleId: 'eficiencia', nome: 'Eficiência', categoria: 'estrategia',
    descricao: 'Métricas derivadas de uso de espaços', versao: '0.5',
    ativo: false, nucleo: false, apenasSuperadmin: false,
    rotas: ['aba-eficiencia'],
    menus: [],
    dependencias: ['agenda_geral'], status_operacional: 'alpha'
  },

  // INFRAESTRUTURA — ativáveis
  {
    moduleId: 'chaves', nome: 'Protocolo de Chaves', categoria: 'infraestrutura',
    descricao: 'Gestão do protocolo de retirada e devolução de chaves', versao: '1.0',
    ativo: true, nucleo: false, apenasSuperadmin: false,
    rotas: ['aba-protocolo-chaves'],
    menus: [{ grupo: 'mod-infraestrutura', btn: 'aba-protocolo-chaves' }],
    dependencias: [], status_operacional: 'stable'
  },
  {
    moduleId: 'almoxarifado', nome: 'Almoxarifado', categoria: 'infraestrutura',
    descricao: 'Controle de estoque e movimentações de materiais', versao: '0.7',
    ativo: false, nucleo: false, apenasSuperadmin: false,
    rotas: ['aba-almoxarifado'],
    menus: [{ grupo: 'mod-infraestrutura', btn: 'aba-almoxarifado' }],
    dependencias: [], status_operacional: 'beta'
  },

  // PESSOAL — ativáveis
  {
    moduleId: 'tarefas', nome: 'Tarefas', categoria: 'operacional',
    descricao: 'Gestão de tarefas pessoais e por equipe', versao: '0.8',
    ativo: false, nucleo: false, apenasSuperadmin: false,
    rotas: ['aba-tarefas'],
    menus: [],
    dependencias: [], status_operacional: 'beta'
  },
  {
    moduleId: 'rh', nome: 'RH / Depto Pessoal', categoria: 'pessoal',
    descricao: 'Gestão de colaboradores, ponto e folha de pagamento', versao: '0.6',
    ativo: false, nucleo: false, apenasSuperadmin: false,
    rotas: ['aba-rh'],
    menus: [],
    dependencias: [], status_operacional: 'alpha'
  },
  {
    moduleId: 'contratacoes', nome: 'Contratações', categoria: 'financeiro',
    descricao: 'CRUD de contratações PF/PJ', versao: '0.6',
    ativo: false, nucleo: false, apenasSuperadmin: false,
    rotas: ['aba-contratacoes'],
    menus: [],
    dependencias: [], status_operacional: 'alpha'
  },
  {
    moduleId: 'relatorios_fin', nome: 'Relatórios Financeiros', categoria: 'financeiro',
    descricao: 'Consolidação financeira cruzada de contratos e contratações', versao: '0.5',
    ativo: false, nucleo: false, apenasSuperadmin: false,
    rotas: ['aba-rel-financeiros'],
    menus: [],
    dependencias: ['contratacoes'], status_operacional: 'alpha'
  },
  {
    moduleId: 'financeiro', nome: 'Financeiro', categoria: 'financeiro',
    descricao: 'Gestão de contratos e rubricas financeiras', versao: '0.7',
    ativo: false, nucleo: false, apenasSuperadmin: false,
    rotas: ['aba-contratos-fin'],
    menus: [],
    dependencias: [], status_operacional: 'beta'
  },
  {
    moduleId: 'escuta', nome: 'Escuta Institucional', categoria: 'institucional',
    descricao: 'Pesquisas pulse, escuta espontânea e alertas NR-1', versao: '0.9',
    ativo: false, nucleo: false, apenasSuperadmin: false,
    rotas: ['aba-escuta'],
    menus: [],
    dependencias: [], status_operacional: 'beta'
  },
  {
    moduleId: 'codip', nome: 'CODIP', categoria: 'relatorios',
    descricao: 'Relatórios para o CODIP', versao: '0.5',
    ativo: false, nucleo: false, apenasSuperadmin: false,
    rotas: ['aba-codip'],
    menus: [],
    dependencias: [], status_operacional: 'alpha'
  }
];


// ══════════════════════════════════════════════════════════════════
// BLOCO: Persistência — leitura e escrita via DataLayer
// ══════════════════════════════════════════════════════════════════

/**
 * Executa fn dentro de um LockService para evitar race conditions
 * em operações de leitura-modificação-escrita concorrentes.
 */
function _modComLock(fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(8000);
  } catch(e) {
    throw new Error('Não foi possível obter lock do registro de módulos: ' + e.message);
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/**
 * Lê o registro de módulos do Drive.
 * Suporta migração automática do formato legado (array simples → objeto versionado).
 * Em caso de erro, retorna os defaults em vez de array vazio.
 */
function _modLerRegistro() {
  try {
    var dados = readJSON(_MOD_FILE);

    // Migração: formato legado era array direto; v2 é { version, updatedAt, modulos }
    var modulos;
    if (Array.isArray(dados)) {
      modulos = dados;
    } else if (dados && Array.isArray(dados.modulos)) {
      modulos = dados.modulos;
    } else {
      modulos = _modClonarDefaults();
    }

    if (!modulos.length) return _modClonarDefaults();

    // Merge: adiciona novos módulos do default que ainda não existem no arquivo salvo
    var idsSalvos = {};
    modulos.forEach(function(m) { idsSalvos[m.moduleId] = true; });
    _MOD_DEFAULTS.forEach(function(def) {
      if (!idsSalvos[def.moduleId]) modulos.push(_modClonar(def));
    });

    // Forward-fill: garante que campos estruturais existam, sem sobrescrever escolhas do usuário
    var defMap = {};
    _MOD_DEFAULTS.forEach(function(d) { defMap[d.moduleId] = d; });
    modulos.forEach(function(m) {
      var def = defMap[m.moduleId];
      if (!def) return;
      if (!m.rotas)              m.rotas              = def.rotas;
      if (!m.menus)              m.menus              = def.menus;
      if (!m.dependencias)       m.dependencias       = def.dependencias;
      if (!m.status_operacional) m.status_operacional = def.status_operacional;
      if (!m.versao)             m.versao             = def.versao;
      if (!m.descricao)          m.descricao          = def.descricao;
      // nucleo é imutável — vem sempre dos defaults
      m.nucleo = !!def.nucleo;
    });

    return modulos;
  } catch(e) {
    Logger.warn('modulos_registry', '_modLerRegistro falhou, usando defaults: ' + e.message);
    return _modClonarDefaults();
  }
}

function _modClonarDefaults() {
  return _MOD_DEFAULTS.map(function(m) { return _modClonar(m); });
}

function _modClonar(m) {
  return JSON.parse(JSON.stringify(m));
}

/**
 * Persiste o registro no Drive com envelope versionado.
 */
function _modSalvarRegistro(modulos) {
  writeJSON(_MOD_FILE, {
    version:   _MOD_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    modulos:   modulos
  });
}

function _modIsSuperadmin(emailFallback) {
  try {
    var email = obterEmailUsuario(emailFallback || '');
    verificarPermissao('superadmin', email);
    return true;
  } catch(e) {
    return false;
  }
}

/**
 * Constrói mapa moduleId→ativo a partir dos defaults (usado como fallback).
 */
function _modMapaDefaults() {
  var mapa = {};
  var mapaSuper = {};
  _MOD_DEFAULTS.forEach(function(m) {
    mapa[m.moduleId] = !!m.ativo;
    if (m.apenasSuperadmin) mapaSuper[m.moduleId] = true;
  });
  return { mapa: mapa, mapaSuper: mapaSuper };
}


// ══════════════════════════════════════════════════════════════════
// BLOCO: API pública — chamada pelo frontend via google.script.run
// ══════════════════════════════════════════════════════════════════

/**
 * Retorna mapa moduleId→ativo e mapaSuper para o boot do frontend.
 * Não requer autenticação.
 * Fail-safe: em erro retorna status dos defaults, nunca mapa vazio.
 */
function modulos_obterStatus() {
  try {
    var modulos = _modLerRegistro();
    var mapa = {};
    var mapaSuper = {};
    modulos.forEach(function(m) {
      mapa[m.moduleId] = !!m.ativo;
      if (m.apenasSuperadmin) mapaSuper[m.moduleId] = true;
    });
    return { ok: true, mapa: mapa, mapaSuper: mapaSuper };
  } catch(e) {
    Logger.error('modulos_registry', 'modulos_obterStatus falhou, retornando defaults: ' + e.message);
    var fb = _modMapaDefaults();
    return { ok: true, mapa: fb.mapa, mapaSuper: fb.mapaSuper };
  }
}

/**
 * Alterna o flag apenasSuperadmin de um módulo. Acesso: SUPERADMIN only.
 */
function modulos_toggleSuperadmin(moduleId, valor, emailFallback) {
  if (!_modIsSuperadmin(emailFallback)) return { ok: false, msg: 'Acesso restrito a SUPERADMIN.' };
  try {
    return _modComLock(function() {
      var modulos = _modLerRegistro();
      var encontrado = false;
      modulos.forEach(function(m) {
        if (m.moduleId === moduleId) { m.apenasSuperadmin = !!valor; encontrado = true; }
      });
      if (!encontrado) return { ok: false, msg: 'Módulo não encontrado: ' + moduleId };
      _modSalvarRegistro(modulos);
      return { ok: true };
    });
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

/**
 * Retorna lista completa de módulos. Acesso: SUPERADMIN only.
 */
function modulos_obterRegistro(emailFallback) {
  if (!_modIsSuperadmin(emailFallback)) return { ok: false, msg: 'Acesso restrito a SUPERADMIN.' };
  try {
    return { ok: true, modulos: _modLerRegistro() };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

/**
 * Ativa ou desativa um módulo. Acesso: SUPERADMIN only.
 * Módulos nucleo:true não podem ser desativados.
 */
function modulos_alterarStatus(moduleId, ativo, emailFallback) {
  if (!_modIsSuperadmin(emailFallback)) return { ok: false, msg: 'Acesso restrito a SUPERADMIN.' };
  try {
    return _modComLock(function() {
      var modulos = _modLerRegistro();
      var encontrado = false;
      var bloqueado  = false;

      modulos.forEach(function(m) {
        if (m.moduleId !== moduleId) return;
        encontrado = true;
        if (m.nucleo && !ativo) { bloqueado = true; return; }
        m.ativo = !!ativo;
      });

      if (!encontrado) return { ok: false, msg: 'Módulo não encontrado: ' + moduleId };
      if (bloqueado)   return { ok: false, msg: 'Módulos de núcleo não podem ser desativados.' };

      _modSalvarRegistro(modulos);

      try {
        var email = obterEmailUsuario(emailFallback || '');
        Logger.info('modulos_registry', (ativo ? 'MODULE_ACTIVATED' : 'MODULE_DEACTIVATED'), { moduleId: moduleId, email: email });
        SystemEvents.emit(ativo ? SystemEventTypes.MODULE_ACTIVATED : SystemEventTypes.MODULE_DEACTIVATED, {
          entidade: 'modulo', entidadeId: moduleId,
          usuario: email, origem: 'mod_modulos_registry'
        });
      } catch(logErr) {}

      return { ok: true };
    });
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

/**
 * Salva múltiplas alterações em uma operação atômica. Acesso: SUPERADMIN only.
 * Cada item em alteracoes: { moduleId, ativo?, apenasSuperadmin? }
 */
function modulos_salvarLote(alteracoes, emailFallback) {
  if (!_modIsSuperadmin(emailFallback)) return { ok: false, msg: 'Acesso restrito a SUPERADMIN.' };
  if (!Array.isArray(alteracoes)) return { ok: false, msg: 'alteracoes deve ser um array.' };
  try {
    return _modComLock(function() {
      var modulos = _modLerRegistro();
      var erros = [];

      alteracoes.forEach(function(alt) {
        var mod = null;
        for (var i = 0; i < modulos.length; i++) {
          if (modulos[i].moduleId === alt.moduleId) { mod = modulos[i]; break; }
        }
        if (!mod) { erros.push('Não encontrado: ' + alt.moduleId); return; }

        if (typeof alt.ativo !== 'undefined') {
          if (mod.nucleo && !alt.ativo) { erros.push('Núcleo não desativável: ' + alt.moduleId); return; }
          mod.ativo = !!alt.ativo;
        }
        if (typeof alt.apenasSuperadmin !== 'undefined') {
          mod.apenasSuperadmin = !!alt.apenasSuperadmin;
        }
      });

      _modSalvarRegistro(modulos);

      try {
        var email = obterEmailUsuario(emailFallback || '');
        Logger.info('modulos_registry', 'MODULOS_LOTE_SALVO', { total: alteracoes.length, email: email });
        if (typeof AuditoriaStore !== 'undefined') {
          AuditoriaStore.registrar({
            tipo:       'MODULOS_LOTE_SALVO',
            modulo:     'gestao_modulos',
            acao:       'salvar_lote',
            entidadeId: 'registry',
            entidadeTipo: 'modulos_registry',
            usuario:    email,
            resultado:  'sucesso',
            mensagem:   alteracoes.length + ' módulo(s) alterado(s)',
            contexto:   { alteracoes: alteracoes, erros: erros }
          });
        }
      } catch(logErr) {}

      return { ok: true, erros: erros };
    });
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

/**
 * Reseta o registro para os valores padrão. Acesso: SUPERADMIN only.
 */
function modulos_resetar(emailFallback) {
  if (!_modIsSuperadmin(emailFallback)) return { ok: false, msg: 'Acesso restrito a SUPERADMIN.' };
  try {
    return _modComLock(function() {
      _modSalvarRegistro(_modClonarDefaults());
      try {
        var email = obterEmailUsuario(emailFallback || '');
        Logger.info('modulos_registry', 'MODULOS_RESETADOS', { email: email });
      } catch(logErr) {}
      return { ok: true };
    });
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}
