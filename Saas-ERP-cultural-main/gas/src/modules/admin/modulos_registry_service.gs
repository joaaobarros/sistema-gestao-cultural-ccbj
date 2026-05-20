/**
 * @file modules/admin/modulos_registry_service.gs
 * @layer modules/admin
 * @description Registro centralizado de módulos do sistema. Controla ativação/desativação
 *              via interface SUPERADMIN. Persistência via DataLayer (JSON no Drive).
 *
 * @depends core/utils.gs (obterEmailUsuario, verificarPermissao),
 *          core/data_layer.gs (readJSON, writeJSON),
 *          core/events/system_events.gs (SystemEvents, SystemEventTypes)
 */

var ModulosRegistryService = (function () {

  var _FILE           = 'modulos_registry.json';
  var _SCHEMA_VERSION = 2;

  var _DEFAULTS = [

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

    // PROGRAMAÇÃO
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

    // OPERACIONAL
    {
      moduleId: 'aprovacoes', nome: 'Aprovações', categoria: 'operacional',
      descricao: 'Fluxo de aprovação de reservas e cadastros externos', versao: '1.0',
      ativo: true, nucleo: false, apenasSuperadmin: false,
      rotas: ['aba-aprovacoes'],
      menus: [{ grupo: 'mod-operacional', btn: 'aba-aprovacoes' }],
      dependencias: ['agenda_geral'], status_operacional: 'stable'
    },

    // COMUNICAÇÃO
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

    // ESTRATÉGIA
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

    // INFRAESTRUTURA
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

    // PESSOAL / FINANCEIRO / INSTITUCIONAL / GOVERNANÇA
    {
      moduleId: 'tarefas', nome: 'Tarefas', categoria: 'operacional',
      descricao: 'Gestão de tarefas pessoais e por equipe', versao: '0.8',
      ativo: false, nucleo: false, apenasSuperadmin: false,
      rotas: ['aba-tarefas'], menus: [],
      dependencias: [], status_operacional: 'beta'
    },
    {
      moduleId: 'rh', nome: 'RH / Depto Pessoal', categoria: 'pessoal',
      descricao: 'Gestão de colaboradores, ponto e folha de pagamento', versao: '0.6',
      ativo: false, nucleo: false, apenasSuperadmin: false,
      rotas: ['aba-rh'], menus: [],
      dependencias: [], status_operacional: 'alpha'
    },
    {
      moduleId: 'contratacoes', nome: 'Contratações', categoria: 'financeiro',
      descricao: 'CRUD de contratações PF/PJ', versao: '0.6',
      ativo: false, nucleo: false, apenasSuperadmin: false,
      rotas: ['aba-contratacoes'], menus: [],
      dependencias: [], status_operacional: 'alpha'
    },
    {
      moduleId: 'relatorios_fin', nome: 'Relatórios Financeiros', categoria: 'financeiro',
      descricao: 'Consolidação financeira cruzada de contratos e contratações', versao: '0.5',
      ativo: false, nucleo: false, apenasSuperadmin: false,
      rotas: ['aba-rel-financeiros'], menus: [],
      dependencias: ['contratacoes'], status_operacional: 'alpha'
    },
    {
      moduleId: 'financeiro', nome: 'Financeiro', categoria: 'financeiro',
      descricao: 'Gestão de contratos e rubricas financeiras', versao: '0.7',
      ativo: false, nucleo: false, apenasSuperadmin: false,
      rotas: ['aba-contratos-fin'], menus: [],
      dependencias: [], status_operacional: 'beta'
    },
    {
      moduleId: 'escuta', nome: 'Escuta Institucional', categoria: 'institucional',
      descricao: 'Pesquisas pulse, escuta espontânea e alertas NR-1', versao: '0.9',
      ativo: false, nucleo: false, apenasSuperadmin: false,
      rotas: ['aba-escuta'], menus: [],
      dependencias: [], status_operacional: 'beta'
    },
    {
      moduleId: 'codip', nome: 'CODIP', categoria: 'relatorios',
      descricao: 'Relatórios para o CODIP', versao: '0.5',
      ativo: false, nucleo: false, apenasSuperadmin: false,
      rotas: ['aba-codip'], menus: [],
      dependencias: [], status_operacional: 'alpha'
    },
    {
      moduleId: 'reunioes', nome: 'Reuniões & Atas', categoria: 'governanca',
      descricao: 'Gestão de reuniões, atas e encaminhamentos rastreáveis integrados ao fluxo de tarefas',
      versao: '1.0',
      ativo: false, nucleo: false, apenasSuperadmin: false,
      rotas: ['aba-reunioes'], menus: [],
      dependencias: ['tarefas'], status_operacional: 'beta'
    },
    {
      moduleId: 'solicitacoes', nome: 'Solicitações Institucionais', categoria: 'operacional',
      descricao: 'Formulários internos de solicitação: bolsistas, professores, serviços, transporte, alimentação, estrutura técnica, equipamentos, compras e mais',
      versao: '1.0',
      ativo: false, nucleo: false, apenasSuperadmin: false,
      rotas: ['aba-solicitacoes'],
      menus: [{ grupo: 'mod-operacional', btn: 'aba-solicitacoes' }],
      dependencias: ['tarefas'], status_operacional: 'beta'
    },
    {
      moduleId: 'pauta_externa', nome: 'Cessão de Pauta', categoria: 'programacao',
      descricao: 'Gestão de solicitações externas de cessão de espaço — fluxo público sem login, FSM de análise e notificações automáticas ao solicitante',
      versao: '1.0',
      ativo: false, nucleo: false, apenasSuperadmin: false,
      rotas: ['aba-pauta-externa'],
      menus: [{ grupo: 'mod-programacao', btn: 'aba-pauta-externa' }],
      dependencias: ['agenda_geral'], status_operacional: 'beta'
    },
    {
      moduleId: 'catalogo', nome: 'Catálogo Institucional', categoria: 'operacional',
      descricao: 'Catálogo configurável de itens e serviços com controle de disponibilidade física e orçamentária',
      versao: '1.0',
      ativo: false, nucleo: false, apenasSuperadmin: false,
      rotas: [], menus: [],
      dependencias: ['solicitacoes'], status_operacional: 'beta'
    },
    {
      moduleId: 'processos_adm', nome: 'Processos Administrativo-Financeiros', categoria: 'operacional',
      descricao: 'Engine transversal de processos administrativo-financeiros: contratações, aquisições, serviços gráficos, bolsistas, manutenções, projetos culturais e mais. Absorve CIs, controla orçamento, integra tarefas, contratos, reuniões e comunicação.',
      versao: '2.0',
      ativo: false, nucleo: false, apenasSuperadmin: false,
      rotas: ['aba-processos-institucionais'],
      menus: [{ grupo: 'mod-governanca', btn: 'aba-processos-institucionais' }],
      dependencias: ['tarefas', 'reunioes'], status_operacional: 'beta'
    }
  ];

  // ── Persistência ─────────────────────────────────────────────────

  function _clonar(m) { return JSON.parse(JSON.stringify(m)); }
  function _clonarDefaults() { return _DEFAULTS.map(function(m) { return _clonar(m); }); }

  function _mapaDefaults() {
    var mapa = {};
    var mapaSuper = {};
    _DEFAULTS.forEach(function(m) {
      mapa[m.moduleId] = !!m.ativo;
      if (m.apenasSuperadmin) mapaSuper[m.moduleId] = true;
    });
    return { mapa: mapa, mapaSuper: mapaSuper };
  }

  function _salvarRegistro(modulos) {
    writeJSON(_FILE, {
      version:   _SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      modulos:   modulos
    });
  }

  function _lerRegistro() {
    try {
      var dados = readJSON(_FILE);
      var modulos;

      if (Array.isArray(dados)) {
        modulos = dados;
      } else if (dados && Array.isArray(dados.modulos)) {
        modulos = dados.modulos;
      } else {
        var d = _clonarDefaults();
        try { _salvarRegistro(d); } catch(_) {}
        return d;
      }

      if (!modulos.length) {
        var d = _clonarDefaults();
        try { _salvarRegistro(d); } catch(_) {}
        return d;
      }

      // Merge: adiciona módulos novos não presentes no arquivo salvo
      var idsSalvos = {};
      modulos.forEach(function(m) { idsSalvos[m.moduleId] = true; });
      _DEFAULTS.forEach(function(def) {
        if (!idsSalvos[def.moduleId]) modulos.push(_clonar(def));
      });

      // Forward-fill: preenche campos estruturais sem sobrescrever escolhas do usuário
      var defMap = {};
      _DEFAULTS.forEach(function(d) { defMap[d.moduleId] = d; });
      modulos.forEach(function(m) {
        var def = defMap[m.moduleId];
        if (!def) return;
        if (!m.rotas)              m.rotas              = def.rotas;
        if (!m.menus)              m.menus              = def.menus;
        if (!m.dependencias)       m.dependencias       = def.dependencias;
        if (!m.status_operacional) m.status_operacional = def.status_operacional;
        if (!m.versao)             m.versao             = def.versao;
        if (!m.descricao)          m.descricao          = def.descricao;
        m.nucleo = !!def.nucleo; // imutável — vem sempre dos defaults
      });

      return modulos;
    } catch(e) {
      Logger.warn('ModulosRegistryService', '_lerRegistro falhou, usando defaults: ' + e.message);
      return _clonarDefaults();
    }
  }

  /**
   * Executa fn dentro de LockService para evitar race conditions
   * em operações leitura-modificação-escrita concorrentes.
   */
  function _comLock(fn) {
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

  function _isSuperadmin(emailFallback) {
    try {
      var email = obterEmailUsuario(emailFallback || '');
      verificarPermissao('superadmin', email);
      return true;
    } catch(e) {
      return false;
    }
  }

  // ── API pública ───────────────────────────────────────────────────

  /**
   * Retorna mapa moduleId→ativo e mapaSuper para o boot do frontend.
   * Fail-safe: em erro retorna defaults, nunca mapa vazio.
   */
  function obterStatus() {
    try {
      var modulos = _lerRegistro();
      var mapa = {};
      var mapaSuper = {};
      modulos.forEach(function(m) {
        mapa[m.moduleId] = !!m.ativo;
        if (m.apenasSuperadmin) mapaSuper[m.moduleId] = true;
      });
      return { ok: true, mapa: mapa, mapaSuper: mapaSuper };
    } catch(e) {
      Logger.error('ModulosRegistryService', 'obterStatus falhou, retornando defaults: ' + e.message);
      var fb = _mapaDefaults();
      return { ok: true, mapa: fb.mapa, mapaSuper: fb.mapaSuper };
    }
  }

  /** Retorna lista completa de módulos. Acesso: SUPERADMIN only. */
  function obterRegistro(emailFallback) {
    if (!_isSuperadmin(emailFallback)) return { ok: false, msg: 'Acesso restrito a SUPERADMIN.' };
    try {
      return { ok: true, modulos: _lerRegistro() };
    } catch(e) {
      return { ok: false, msg: e.message };
    }
  }

  /**
   * Ativa ou desativa um módulo. Acesso: SUPERADMIN only.
   * Módulos nucleo:true não podem ser desativados.
   */
  function alterarStatus(moduleId, ativo, emailFallback) {
    if (!_isSuperadmin(emailFallback)) return { ok: false, msg: 'Acesso restrito a SUPERADMIN.' };
    try {
      return _comLock(function() {
        var modulos    = _lerRegistro();
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

        _salvarRegistro(modulos);

        try {
          var email = obterEmailUsuario(emailFallback || '');
          Logger.info('ModulosRegistryService', (ativo ? 'MODULE_ACTIVATED' : 'MODULE_DEACTIVATED'), { moduleId: moduleId, email: email });
          SystemEvents.emit(ativo ? SystemEventTypes.MODULE_ACTIVATED : SystemEventTypes.MODULE_DEACTIVATED, {
            entidade: 'modulo', entidadeId: moduleId,
            usuario: email, origem: 'ModulosRegistryService'
          });
        } catch(logErr) {}

        return { ok: true };
      });
    } catch(e) {
      return { ok: false, msg: e.message };
    }
  }

  /**
   * Salva múltiplas alterações em operação atômica. Acesso: SUPERADMIN only.
   * Cada item em alteracoes: { moduleId, ativo?, apenasSuperadmin? }
   */
  function salvarLote(alteracoes, emailFallback) {
    if (!_isSuperadmin(emailFallback)) return { ok: false, msg: 'Acesso restrito a SUPERADMIN.' };
    if (!Array.isArray(alteracoes))    return { ok: false, msg: 'alteracoes deve ser um array.' };
    try {
      return _comLock(function() {
        var modulos = _lerRegistro();
        var erros   = [];

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

        _salvarRegistro(modulos);

        try {
          var email = obterEmailUsuario(emailFallback || '');
          Logger.info('ModulosRegistryService', 'MODULOS_LOTE_SALVO', { total: alteracoes.length, email: email });
          if (typeof AuditoriaStore !== 'undefined') {
            AuditoriaStore.registrar({
              tipo: 'MODULOS_LOTE_SALVO', modulo: 'gestao_modulos',
              acao: 'salvar_lote', entidadeId: 'registry',
              entidadeTipo: 'modulos_registry', usuario: email,
              resultado: 'sucesso',
              mensagem: alteracoes.length + ' módulo(s) alterado(s)',
              contexto: { alteracoes: alteracoes, erros: erros }
            });
          }
        } catch(logErr) {}

        return { ok: true, erros: erros };
      });
    } catch(e) {
      return { ok: false, msg: e.message };
    }
  }

  /** Alterna o flag apenasSuperadmin de um módulo. Acesso: SUPERADMIN only. */
  function toggleSuperadmin(moduleId, valor, emailFallback) {
    if (!_isSuperadmin(emailFallback)) return { ok: false, msg: 'Acesso restrito a SUPERADMIN.' };
    try {
      return _comLock(function() {
        var modulos    = _lerRegistro();
        var encontrado = false;
        modulos.forEach(function(m) {
          if (m.moduleId === moduleId) { m.apenasSuperadmin = !!valor; encontrado = true; }
        });
        if (!encontrado) return { ok: false, msg: 'Módulo não encontrado: ' + moduleId };
        _salvarRegistro(modulos);
        return { ok: true };
      });
    } catch(e) {
      return { ok: false, msg: e.message };
    }
  }

  /** Reseta o registro para os valores padrão. Acesso: SUPERADMIN only. */
  function resetar(emailFallback) {
    if (!_isSuperadmin(emailFallback)) return { ok: false, msg: 'Acesso restrito a SUPERADMIN.' };
    try {
      return _comLock(function() {
        _salvarRegistro(_clonarDefaults());
        try {
          var email = obterEmailUsuario(emailFallback || '');
          Logger.info('ModulosRegistryService', 'MODULOS_RESETADOS', { email: email });
        } catch(logErr) {}
        return { ok: true };
      });
    } catch(e) {
      return { ok: false, msg: e.message };
    }
  }

  return {
    obterStatus:     obterStatus,
    obterRegistro:   obterRegistro,
    alterarStatus:   alterarStatus,
    salvarLote:      salvarLote,
    toggleSuperadmin: toggleSuperadmin,
    resetar:         resetar
  };

})();
