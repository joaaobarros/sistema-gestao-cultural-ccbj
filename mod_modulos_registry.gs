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

var _MOD_FILE = 'modulos_registry.json';

// ══════════════════════════════════════════════════════════════════
// BLOCO: Registro padrão de módulos
// ══════════════════════════════════════════════════════════════════
// nucleo:true  → não pode ser desativado pelo SUPERADMIN
// ativo:false  → bloqueado até ativação explícita
// ══════════════════════════════════════════════════════════════════

var _MOD_DEFAULTS = [

  // NÚCLEO — sempre ativos
  {
    moduleId: 'agenda_geral', nome: 'Agenda Geral', categoria: 'espacos',
    descricao: 'Calendário principal de reservas de espaços', versao: '1.0',
    ativo: true, nucleo: true,
    rotas: ['aba-lista-reservas'],
    menus: [{ grupo: 'mod-espacos', btn: 'aba-lista-reservas' }],
    dependencias: [], status_operacional: 'stable'
  },
  {
    moduleId: 'nova_reserva', nome: 'Novo Agendamento', categoria: 'espacos',
    descricao: 'Formulário de criação e edição de reservas', versao: '1.0',
    ativo: true, nucleo: true,
    rotas: ['aba-nova-reserva'],
    menus: [{ grupo: 'mod-espacos', btn: 'aba-nova-reserva' }],
    dependencias: ['agenda_geral'], status_operacional: 'stable'
  },
  {
    moduleId: 'configuracoes', nome: 'Configurações', categoria: 'sistema',
    descricao: 'Painel de administração do sistema', versao: '1.0',
    ativo: true, nucleo: true,
    rotas: ['aba-gestao-admin'],
    menus: [{ grupo: 'mod-sistema', btn: 'aba-gestao-admin' }],
    dependencias: [], status_operacional: 'stable'
  },
  {
    moduleId: 'auditoria', nome: 'Auditoria', categoria: 'sistema',
    descricao: 'Log de auditoria e rastreabilidade operacional', versao: '1.0',
    ativo: true, nucleo: true,
    rotas: ['aba-auditoria'],
    menus: [{ grupo: 'mod-sistema', btn: 'aba-auditoria' }],
    dependencias: [], status_operacional: 'stable'
  },
  {
    moduleId: 'permissoes', nome: 'Permissões', categoria: 'sistema',
    descricao: 'Gestão de permissões por perfil e usuário', versao: '2.0',
    ativo: true, nucleo: true,
    rotas: ['aba-permissoes-v2'],
    menus: [{ grupo: 'mod-sistema', btn: 'aba-permissoes-v2' }],
    dependencias: [], status_operacional: 'stable'
  },

  // OPERACIONAIS — ativáveis
  {
    moduleId: 'aprovacoes', nome: 'Aprovações', categoria: 'operacional',
    descricao: 'Fluxo de aprovação de reservas e cadastros externos', versao: '1.0',
    ativo: true, nucleo: false,
    rotas: ['aba-aprovacoes'],
    menus: [{ grupo: 'mod-operacional', btn: 'aba-aprovacoes' }],
    dependencias: ['agenda_geral'], status_operacional: 'stable'
  },
  {
    moduleId: 'agenda_rece', nome: 'Agenda RECE', categoria: 'comunicacao',
    descricao: 'Agenda da Rede de Espaços Culturais Espontâneos', versao: '1.0',
    ativo: true, nucleo: false,
    rotas: ['aba-agenda-rece'],
    menus: [{ grupo: 'mod-comunicacao', btn: 'aba-agenda-rece' }],
    dependencias: ['agenda_geral'], status_operacional: 'stable'
  },
  {
    moduleId: 'dashboard', nome: 'Dashboard Geral', categoria: 'estrategia',
    descricao: 'Painel de indicadores e métricas operacionais', versao: '1.0',
    ativo: true, nucleo: false,
    rotas: ['aba-dashboard'],
    menus: [{ grupo: 'mod-estrategia', btn: 'aba-dashboard' }],
    dependencias: [], status_operacional: 'stable'
  },
  {
    moduleId: 'chaves', nome: 'Protocolo de Chaves', categoria: 'infraestrutura',
    descricao: 'Gestão do protocolo de retirada e devolução de chaves', versao: '1.0',
    ativo: true, nucleo: false,
    rotas: ['aba-protocolo-chaves'],
    menus: [{ grupo: 'mod-infraestrutura', btn: 'aba-protocolo-chaves' }],
    dependencias: [], status_operacional: 'stable'
  },

  // DISPONÍVEIS — aguardando ativação
  {
    moduleId: 'tarefas', nome: 'Tarefas', categoria: 'operacional',
    descricao: 'Gestão de tarefas pessoais e por equipe', versao: '0.8',
    ativo: false, nucleo: false,
    rotas: ['aba-tarefas'],
    menus: [],
    dependencias: [], status_operacional: 'beta'
  },
  {
    moduleId: 'processos', nome: 'Processos', categoria: 'comunicacao',
    descricao: 'Gestão de processos de comunicação institucional', versao: '0.8',
    ativo: false, nucleo: false,
    rotas: ['aba-processos'],
    menus: [],
    dependencias: [], status_operacional: 'beta'
  },
  {
    moduleId: 'almoxarifado', nome: 'Almoxarifado', categoria: 'operacional',
    descricao: 'Controle de estoque e movimentações de materiais', versao: '0.7',
    ativo: false, nucleo: false,
    rotas: ['aba-almoxarifado'],
    menus: [],
    dependencias: [], status_operacional: 'beta'
  },
  {
    moduleId: 'balcao', nome: 'Balcão de Atendimento', categoria: 'operacional',
    descricao: 'Registro e acompanhamento de atendimentos ao público', versao: '0.7',
    ativo: false, nucleo: false,
    rotas: ['aba-balcao'],
    menus: [],
    dependencias: [], status_operacional: 'beta'
  },
  {
    moduleId: 'rh', nome: 'RH / Depto Pessoal', categoria: 'pessoal',
    descricao: 'Gestão de colaboradores, ponto e folha de pagamento', versao: '0.6',
    ativo: false, nucleo: false,
    rotas: ['aba-rh'],
    menus: [],
    dependencias: [], status_operacional: 'alpha'
  },
  {
    moduleId: 'eficiencia', nome: 'Eficiência', categoria: 'estrategia',
    descricao: 'Métricas derivadas de uso de espaços', versao: '0.5',
    ativo: false, nucleo: false,
    rotas: ['aba-eficiencia'],
    menus: [],
    dependencias: ['agenda_geral'], status_operacional: 'alpha'
  },
  {
    moduleId: 'contratacoes', nome: 'Contratações', categoria: 'financeiro',
    descricao: 'CRUD de contratações PF/PJ', versao: '0.6',
    ativo: false, nucleo: false,
    rotas: ['aba-contratacoes'],
    menus: [],
    dependencias: [], status_operacional: 'alpha'
  },
  {
    moduleId: 'relatorios_fin', nome: 'Relatórios Financeiros', categoria: 'financeiro',
    descricao: 'Consolidação financeira cruzada de contratos e contratações', versao: '0.5',
    ativo: false, nucleo: false,
    rotas: ['aba-rel-financeiros'],
    menus: [],
    dependencias: ['contratacoes'], status_operacional: 'alpha'
  },
  {
    moduleId: 'escuta', nome: 'Escuta Institucional', categoria: 'institucional',
    descricao: 'Pesquisas pulse, escuta espontânea e alertas NR-1', versao: '0.9',
    ativo: false, nucleo: false,
    rotas: ['aba-escuta'],
    menus: [],
    dependencias: [], status_operacional: 'beta'
  },
  {
    moduleId: 'codip', nome: 'CODIP', categoria: 'relatorios',
    descricao: 'Relatórios para o CODIP', versao: '0.5',
    ativo: false, nucleo: false,
    rotas: ['aba-codip'],
    menus: [],
    dependencias: [], status_operacional: 'alpha'
  },
  {
    moduleId: 'financeiro', nome: 'Financeiro', categoria: 'financeiro',
    descricao: 'Gestão de contratos e rubricas financeiras', versao: '0.7',
    ativo: false, nucleo: false,
    rotas: ['aba-contratos-fin'],
    menus: [],
    dependencias: [], status_operacional: 'beta'
  }
];


// ══════════════════════════════════════════════════════════════════
// BLOCO: Persistência — leitura e escrita via DataLayer
// ══════════════════════════════════════════════════════════════════

function _modLerRegistro() {
  try {
    var dados = readJSON(_MOD_FILE);
    if (!Array.isArray(dados) || dados.length === 0) return _modClonarDefaults();

    // Merge: novos módulos do default aparecem mesmo com arquivo existente
    var idsSalvos = {};
    dados.forEach(function(m) { idsSalvos[m.moduleId] = true; });
    _MOD_DEFAULTS.forEach(function(def) {
      if (!idsSalvos[def.moduleId]) dados.push(_modClonar(def));
    });

    return dados;
  } catch(e) {
    console.warn('[modulos_registry] Falha na leitura, usando defaults:', e.message);
    return _modClonarDefaults();
  }
}

function _modClonarDefaults() {
  return _MOD_DEFAULTS.map(function(m) { return _modClonar(m); });
}

function _modClonar(m) {
  return JSON.parse(JSON.stringify(m));
}

function _modSalvarRegistro(modulos) {
  writeJSON(_MOD_FILE, modulos);
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


// ══════════════════════════════════════════════════════════════════
// BLOCO: API pública — chamada pelo frontend via google.script.run
// ══════════════════════════════════════════════════════════════════

/**
 * Retorna mapa moduleId→ativo para uso no boot do frontend.
 * Não requer autenticação — fail-open: retorna {} em caso de erro.
 */
function modulos_obterStatus() {
  try {
    var modulos = _modLerRegistro();
    var mapa = {};
    modulos.forEach(function(m) { mapa[m.moduleId] = !!m.ativo; });
    return { ok: true, mapa: mapa };
  } catch(e) {
    console.error('[modulos_registry] modulos_obterStatus:', e.message);
    return { ok: true, mapa: {} };
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
      registrarLog('MODULO_' + (ativo ? 'ATIVADO' : 'DESATIVADO'), moduleId, email);
    } catch(logErr) {}

    return { ok: true };
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
    _modSalvarRegistro(_modClonarDefaults());
    return { ok: true };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}
