/**
 * @file modules/auth/permissoes_v2_engine.gs
 * @layer modules/auth
 * @description Motor híbrido de permissões v2. Controla leitura, cálculo e persistência
 *              de permissões por perfil, cargo, função, setor e overrides manuais.
 *
 * @depends core/utils.gs (obterEmailUsuario, verificarPermissao, _getSheet),
 *          core/data_layer.gs (readJSON, writeJSON, modifyJSON),
 *          core/events/system_events.gs (SystemEvents, SystemEventTypes),
 *          core/stores/auditoria_store.gs (AuditoriaStore)
 */

var PermissoesV2Engine = (function () {

  // ── Módulos do sistema ────────────────────────────────────────

  var _MODULOS = [
    'agenda','estrategia','comunicacao','espacos',
    'reservas','contratos','financeiro','tarefas',
    'processos','almoxarifado','balcao','rh',
    'eficiencia','contratacoes','relatorios','escuta','pessoal',
    'acoes','reunioes'
  ];

  var _SENSIVEIS      = ['rh','contratacoes','financeiro'];
  var _VC_MODS        = ['espacos','comunicacao','relatorios','estrategia'];
  var _PERFIS_VALIDOS = ['superadmin','admin','gestor','tecnico','rh','comunicacao','visitante_controlado','visitante'];

  // ── Cache (CacheService, TTL 5 min) ──────────────────────────

  var _CACHE_TTL    = 300;
  var _CACHE_PREFIX = 'perm_v2_';

  function _cacheObter(email) {
    try {
      var raw = CacheService.getScriptCache().get(_CACHE_PREFIX + email);
      return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
  }

  function _cacheSalvar(email, perm) {
    try {
      var raw = JSON.stringify(perm);
      if (raw.length < 98000) {
        CacheService.getScriptCache().put(_CACHE_PREFIX + email, raw, _CACHE_TTL);
      }
    } catch(e) {}
  }

  function _cacheInvalidar(email) {
    try { CacheService.getScriptCache().remove(_CACHE_PREFIX + email); } catch(e) {}
  }

  // ── Helpers de permissão ──────────────────────────────────────

  function _p(v, e, x) { return { visualizar: !!v, editar: !!e, excluir: !!x }; }

  function _map(fn) {
    var r = {};
    _MODULOS.forEach(function(m) { r[m] = fn(m); });
    return r;
  }

  // ── Matriz base por perfil ────────────────────────────────────

  var _BASE = {
    superadmin: _map(function() { return _p(1,1,1); }),
    admin: {
      agenda:_p(1,1,1),      estrategia:_p(1,1,1),   comunicacao:_p(1,1,1),  espacos:_p(1,1,1),
      reservas:_p(1,1,1),    contratos:_p(1,1,0),    financeiro:_p(1,0,0),   tarefas:_p(1,1,1),
      processos:_p(1,1,1),   almoxarifado:_p(1,1,0), balcao:_p(1,1,0),       rh:_p(0,0,0),
      eficiencia:_p(1,0,0),  contratacoes:_p(0,0,0), relatorios:_p(1,0,0),
      escuta:_p(1,0,0),      pessoal:_p(1,1,0),      acoes:_p(1,1,1),        reunioes:_p(1,1,1)
    },
    gestor: {
      agenda:_p(1,1,0),      estrategia:_p(1,1,0),   comunicacao:_p(1,0,0),  espacos:_p(1,0,0),
      reservas:_p(1,1,0),    contratos:_p(1,1,0),    financeiro:_p(0,0,0),   tarefas:_p(1,1,0),
      processos:_p(1,1,0),   almoxarifado:_p(0,0,0), balcao:_p(1,0,0),       rh:_p(0,0,0),
      eficiencia:_p(1,0,0),  contratacoes:_p(0,0,0), relatorios:_p(1,0,0),
      escuta:_p(1,0,0),      pessoal:_p(1,0,0),      acoes:_p(1,1,0),        reunioes:_p(1,1,0)
    },
    tecnico: {
      agenda:_p(1,1,0),      estrategia:_p(1,0,0),   comunicacao:_p(1,0,0),  espacos:_p(1,1,0),
      reservas:_p(1,1,0),    contratos:_p(0,0,0),    financeiro:_p(0,0,0),   tarefas:_p(1,1,0),
      processos:_p(0,0,0),   almoxarifado:_p(1,1,0), balcao:_p(1,1,0),       rh:_p(0,0,0),
      eficiencia:_p(0,0,0),  contratacoes:_p(0,0,0), relatorios:_p(0,0,0),
      escuta:_p(0,0,0),      pessoal:_p(1,0,0),      acoes:_p(1,0,0),        reunioes:_p(1,0,0)
    },
    rh: {
      agenda:_p(1,0,0),      estrategia:_p(1,0,0),   comunicacao:_p(1,0,0),  espacos:_p(1,0,0),
      reservas:_p(0,0,0),    contratos:_p(0,0,0),    financeiro:_p(1,0,0),   tarefas:_p(1,1,0),
      processos:_p(0,0,0),   almoxarifado:_p(0,0,0), balcao:_p(0,0,0),       rh:_p(1,1,0),
      eficiencia:_p(1,0,0),  contratacoes:_p(1,1,0), relatorios:_p(1,0,0),
      escuta:_p(1,0,0),      pessoal:_p(1,1,0),      acoes:_p(1,0,0),        reunioes:_p(1,0,0)
    },
    comunicacao: {
      agenda:_p(1,0,0),      estrategia:_p(1,1,0),   comunicacao:_p(1,1,0),  espacos:_p(1,0,0),
      reservas:_p(1,0,0),    contratos:_p(0,0,0),    financeiro:_p(0,0,0),   tarefas:_p(1,1,0),
      processos:_p(1,1,0),   almoxarifado:_p(0,0,0), balcao:_p(0,0,0),       rh:_p(0,0,0),
      eficiencia:_p(0,0,0),  contratacoes:_p(0,0,0), relatorios:_p(0,0,0),
      escuta:_p(1,0,0),      pessoal:_p(0,0,0),      acoes:_p(1,1,0),        reunioes:_p(1,0,0)
    },
    visitante_controlado: _map(function(m) {
      return _VC_MODS.indexOf(m) !== -1 ? _p(1,0,0) : _p(0,0,0);
    }),
    visitante: _map(function(m) {
      return m === 'agenda' ? _p(1,0,0) : _p(0,0,0);
    })
  };

  // ── Aba Administradores ───────────────────────────────────────

  function _obterMapaAdmins() {
    var mapa = {};
    try {
      var aba = _getSheet('Administradores');
      if (!aba || aba.getLastRow() < 2) return mapa;
      var nivelMap = {
        superadmin:'superadmin', admin:'admin', gestor:'gestor',
        tecnico:'tecnico', 'técnico':'tecnico', rh:'rh',
        comunicacao:'comunicacao', 'comunicação':'comunicacao'
      };
      aba.getRange(2, 1, aba.getLastRow() - 1, 2).getValues().forEach(function(r) {
        var em = String(r[0] || '').toLowerCase().trim();
        var nv = String(r[1] || '').toLowerCase().trim();
        if (em && nivelMap[nv]) mapa[em] = nivelMap[nv];
      });
    } catch(e) {}
    return mapa;
  }

  // ── Usuários do sistema ───────────────────────────────────────

  function obterUsuarios() {
    return readJSON('usuarios_sistema.json');
  }

  function sincronizarUsuarios() {
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var existentes = readJSON('usuarios_sistema.json');
      var mapaEx = {};
      existentes.forEach(function(u) { mapaEx[u.email] = u; });

      var emailSet = {};
      var logData  = [];

      var abaLog = _getSheet('LogAcessos');
      if (abaLog && abaLog.getLastRow() > 1) {
        logData = abaLog.getRange(2, 1, abaLog.getLastRow() - 1, 3).getValues();
        logData.forEach(function(r) {
          var em = String(r[1] || '').trim().toLowerCase();
          if (em && em.indexOf('@') > -1) emailSet[em] = true;
        });
      }

      var nivelMap = _obterMapaAdmins();
      Object.keys(nivelMap).forEach(function(em) { emailSet[em] = true; });

      var abaRes = _getSheet('Reservas');
      if (abaRes && abaRes.getLastRow() > 1) {
        abaRes.getRange(2, 9, abaRes.getLastRow() - 1, 1).getValues().forEach(function(r) {
          var em = String(r[0] || '').trim().toLowerCase();
          if (em && em.indexOf('@') > -1) emailSet[em] = true;
        });
      }

      var usuarios = [];
      Object.keys(emailSet).forEach(function(email) {
        var ex = mapaEx[email] || {};

        var ultimoAcesso = ex.ultimoAcesso || null;
        logData.forEach(function(r) {
          var em = String(r[1] || '').trim().toLowerCase();
          if (em === email && r[0]) {
            var ts = r[0] instanceof Date ? r[0].toISOString() : String(r[0]);
            if (!ultimoAcesso || ts > ultimoAcesso) ultimoAcesso = ts;
          }
        });

        var origens = [];
        var logHit = logData.some(function(r) { return String(r[1]||'').trim().toLowerCase() === email; });
        if (logHit) origens.push('log_acessos');
        if (nivelMap[email]) origens.push('administradores');
        if (abaRes && abaRes.getLastRow() > 1) {
          var resHit = abaRes.getRange(2,9,abaRes.getLastRow()-1,1).getValues().some(function(r){
            return String(r[0]||'').trim().toLowerCase() === email;
          });
          if (resHit) origens.push('reservas');
        }

        var nome = ex.nome || '';
        if (!nome) {
          try { nome = resolverNomePorEmail(email); } catch(e) { nome = email.split('@')[0]; }
        }

        usuarios.push({
          email:        email,
          nome:         nome,
          ultimoAcesso: ultimoAcesso,
          origem:       origens,
          nivelAdmin:   nivelMap[email] || null,
          configurado:  !!ex.configurado,
          ativo:        ex.ativo !== false
        });
      });

      writeJSON('usuarios_sistema.json', usuarios);
      return { ok: true, total: usuarios.length };
    } finally {
      lock.releaseLock();
    }
  }

  // ── Motor automático ──────────────────────────────────────────

  function calcularAutomaticas(origem, perfil_base) {
    var result = _map(function() {
      return { visualizar: false, editar: false, excluir: false, origem: [] };
    });

    var cargo   = String(origem.cargo || '').toLowerCase().trim();
    var funcoes = Array.isArray(origem.funcoes)      ? origem.funcoes      : [];
    var setores = Array.isArray(origem.setores)      ? origem.setores      : [];
    var donos   = Array.isArray(origem.donos_espaco) ? origem.donos_espaco : [];

    function grant(mods, v, e, x, motivo) {
      mods.forEach(function(m) {
        if (!result[m]) return;
        if (v) { result[m].visualizar = true; if (result[m].origem.indexOf(motivo) === -1) result[m].origem.push(motivo); }
        if (e) result[m].editar  = true;
        if (x) result[m].excluir = true;
      });
    }

    if (cargo === 'gestor' || cargo === 'coordenador' || cargo === 'diretor') {
      grant(['reservas','contratos','relatorios','agenda','espacos','processos','tarefas'], 1,1,0, 'cargo:'+cargo);
      grant(['eficiencia','comunicacao'], 1,0,0, 'cargo:'+cargo);
      grant(['estrategia'], 1,1,0, 'cargo:'+cargo);
    }
    if (cargo === 'tecnico' || cargo === 'técnico' || cargo === 'operacional') {
      grant(['reservas','agenda','espacos','tarefas','almoxarifado','balcao'], 1,1,0, 'cargo:'+cargo);
    }
    if (cargo === 'rh' || cargo === 'depto_pessoal' || cargo === 'recursos_humanos') {
      grant(['rh','contratacoes','financeiro','pessoal','relatorios'], 1,1,0, 'cargo:rh');
      grant(['eficiencia'], 1,0,0, 'cargo:rh');
    }
    if (cargo === 'comunicacao' || cargo === 'comunicação' || cargo === 'marketing') {
      grant(['comunicacao','estrategia','agenda','processos','tarefas'], 1,1,0, 'cargo:comunicacao');
      grant(['espacos','reservas'], 1,0,0, 'cargo:comunicacao');
    }
    if (cargo === 'admin_tecnico' || cargo === 'ti' || cargo === 'infraestrutura') {
      grant(['agenda','espacos','almoxarifado','processos','tarefas'], 1,0,0, 'cargo:admin_tecnico');
      _SENSIVEIS.forEach(function(m) {
        result[m].visualizar = false; result[m].editar = false; result[m].excluir = false; result[m].origem = [];
      });
    }

    var fnModMap = {
      reservas:     ['reservas','agenda','espacos'],
      contratos:    ['contratos','financeiro'],
      almoxarifado: ['almoxarifado'],
      balcao:       ['balcao'],
      comunicacao:  ['comunicacao','estrategia'],
      rh:           ['rh','pessoal'],
      financeiro:   ['financeiro','contratacoes'],
      relatorios:   ['relatorios','eficiencia'],
      escuta:       ['escuta'],
      tarefas:      ['tarefas','processos']
    };
    funcoes.forEach(function(fn) {
      var f = String(fn || '').toLowerCase().trim();
      var mods = fnModMap[f] ? fnModMap[f].slice() : [];
      if (_MODULOS.indexOf(f) !== -1 && mods.indexOf(f) === -1) mods.push(f);
      grant(mods, 1,1,0, 'funcao:'+f);
    });

    if (donos.length > 0) {
      grant(['reservas','agenda','espacos'], 1,1,0, 'dono_espaco');
    }

    var setorModMap = {
      producao:       ['reservas','agenda','contratos','relatorios'],
      producão:       ['reservas','agenda','contratos','relatorios'],
      comunicacao:    ['comunicacao','estrategia','agenda'],
      comunicação:    ['comunicacao','estrategia','agenda'],
      administrativo: ['processos','tarefas','almoxarifado','agenda'],
      financeiro:     ['financeiro','contratacoes','relatorios'],
      pessoal:        ['pessoal','rh','eficiencia'],
      operacional:    ['reservas','agenda','espacos','almoxarifado','balcao'],
      ti:             ['processos','tarefas','agenda']
    };
    setores.forEach(function(s) {
      var sv = String(s || '').toLowerCase().trim();
      var mods = setorModMap[sv] || [];
      grant(mods, 1,0,0, 'setor:'+sv);
    });

    // admin_tecnico nunca acessa dados sensíveis — aplica novamente após funções/setores
    if (cargo === 'admin_tecnico' || cargo === 'ti' || cargo === 'infraestrutura') {
      _SENSIVEIS.forEach(function(m) {
        result[m].visualizar = false; result[m].editar = false; result[m].excluir = false; result[m].origem = [];
      });
    }

    return result;
  }

  // ── Consolidação ──────────────────────────────────────────────

  function _consolidar(perfil_base, auto, manuais) {
    if (perfil_base === 'superadmin') {
      return _map(function() { return { visualizar:true, editar:true, excluir:true, explicacao:['superadmin'] }; });
    }

    var base = _BASE[perfil_base] || _BASE.visitante_controlado;
    var result = {};

    _MODULOS.forEach(function(m) {
      var b  = base[m] || _p(0,0,0);
      var a  = (auto    && auto[m])    || { visualizar:false, editar:false, excluir:false, origem:[] };
      var mn = (manuais && manuais[m]) || {};
      var exp = [];

      function resolveAcao(acao) {
        if (mn[acao] === true)  { exp.push(acao+':manual(+)'); return true;  }
        if (mn[acao] === false) { exp.push(acao+':manual(-)'); return false; }
        if (a[acao])            { exp.push(acao+':auto('+(a.origem||[]).slice(0,2).join(',')+')'); return true; }
        if (b[acao])            { exp.push(acao+':perfil('+perfil_base+')'); return true; }
        return false;
      }

      var v = resolveAcao('visualizar');
      var e = resolveAcao('editar');
      var x = resolveAcao('excluir');
      if (!v) { e = false; x = false; }
      if (!e)   x = false;

      result[m] = { visualizar:v, editar:e, excluir:x, explicacao:exp };
    });

    return result;
  }

  // ── Leitura de permissões ─────────────────────────────────────

  function obterPermissoes(email) {
    if (!email) {
      try { email = obterEmailUsuario(''); } catch(e) { return null; }
    }
    email = String(email).toLowerCase().trim();

    var cached = _cacheObter(email);
    if (cached) return cached;

    var lista = readJSON('permissoes_v2.json');
    var encontrado = null;
    for (var i = 0; i < lista.length; i++) {
      if (String(lista[i].email || '').toLowerCase() === email) { encontrado = lista[i]; break; }
    }

    if (encontrado) {
      _cacheSalvar(email, encontrado);
      return encontrado;
    }

    var perfil_base = _obterMapaAdmins()[email] || 'visitante_controlado';
    var origem = { cargo: '', funcoes: [], setores: [], donos_espaco: [] };
    var auto   = calcularAutomaticas(origem, perfil_base);
    var finais = _consolidar(perfil_base, auto, {});

    var resultado = {
      email:                  email,
      perfil_base:            perfil_base,
      origem:                 origem,
      permissoes_automaticas: auto,
      permissoes_manuais:     {},
      permissoes_finais:      finais,
      atualizadoEm:           null
    };
    _cacheSalvar(email, resultado);
    return resultado;
  }

  function calcularFinais(email) {
    var p = obterPermissoes(email);
    if (!p) return null;
    return _consolidar(p.perfil_base, p.permissoes_automaticas, p.permissoes_manuais);
  }

  // ── Escrita de permissões ─────────────────────────────────────

  function salvarPermissoes(dados) {
    if (!dados || !dados.email) throw new Error('Email obrigatório');

    var emailEditor = obterEmailUsuario(dados.emailEditor || '');
    if (!emailEditor) throw new Error('Não foi possível identificar o editor. Recarregue a página.');

    var listaPerms = readJSON('permissoes_v2.json');

    var _mapaAdminsCache = null;
    function _buscarOuDefault(email) {
      for (var i = 0; i < listaPerms.length; i++) {
        if (String(listaPerms[i].email||'').toLowerCase() === email) return listaPerms[i];
      }
      if (!_mapaAdminsCache) _mapaAdminsCache = _obterMapaAdmins();
      var perfil_base = _mapaAdminsCache[email] || 'visitante_controlado';
      return { email: email, perfil_base: perfil_base,
               origem: {cargo:'',funcoes:[],setores:[],donos_espaco:[]},
               permissoes_automaticas: {}, permissoes_manuais: {},
               permissoes_finais: {}, atualizadoEm: null };
    }

    var permsEditor = _buscarOuDefault(emailEditor);
    if (permsEditor.perfil_base !== 'superadmin' && permsEditor.perfil_base !== 'admin') {
      throw new Error('Permissão insuficiente');
    }

    var emailAlvo    = String(dados.email).toLowerCase().trim();
    var permsAlvoAnt = _buscarOuDefault(emailAlvo);

    if (permsAlvoAnt.perfil_base === 'superadmin' && permsEditor.perfil_base !== 'superadmin') {
      throw new Error('Apenas superadmin pode editar outro superadmin');
    }
    if (emailAlvo === emailEditor && permsEditor.perfil_base === 'superadmin' && dados.perfil_base !== 'superadmin') {
      throw new Error('Superadmin não pode remover seu próprio status');
    }
    if (_PERFIS_VALIDOS.indexOf(dados.perfil_base) === -1) {
      throw new Error('Perfil inválido: ' + dados.perfil_base);
    }

    var origem  = dados.origem  || { cargo: '', funcoes: [], setores: [], donos_espaco: [] };
    var manuais = dados.permissoes_manuais || {};
    var auto    = calcularAutomaticas(origem, dados.perfil_base);
    var finais  = _consolidar(dados.perfil_base, auto, manuais);

    var registro = {
      email:                  emailAlvo,
      perfil_base:            dados.perfil_base,
      origem:                 origem,
      permissoes_automaticas: auto,
      permissoes_manuais:     manuais,
      permissoes_finais:      finais,
      atualizadoEm:           new Date().toISOString()
    };

    modifyJSON('permissoes_v2.json', function(lista) {
      var found = false;
      for (var i = 0; i < lista.length; i++) {
        if (String(lista[i].email||'').toLowerCase() === emailAlvo) {
          lista[i] = registro; found = true; break;
        }
      }
      if (!found) lista.push(registro);
      return lista;
    });

    _cacheInvalidar(emailAlvo);

    try {
      AuditoriaStore.registrar({
        tipo: permsAlvoAnt.perfil_base !== dados.perfil_base ? 'ROLE_UPDATED' : 'PERMISSION_GRANTED',
        modulo: 'permissoes', acao: 'salvar_permissoes',
        entidadeId: emailAlvo, entidadeTipo: 'usuario',
        usuario: emailEditor, resultado: 'sucesso',
        mensagem: 'Permissões atualizadas: ' + emailAlvo + ' por ' + emailEditor
          + (permsAlvoAnt.perfil_base !== dados.perfil_base
            ? ' | perfil: ' + permsAlvoAnt.perfil_base + ' → ' + dados.perfil_base
            : ''),
        antes:  { perfil_base: permsAlvoAnt.perfil_base },
        depois: { perfil_base: dados.perfil_base }
      });
    } catch(e) {}

    try { _registrarAuditoria({ editor: emailEditor, alvo: emailAlvo,
      antes: permsAlvoAnt, depois: registro, timestamp: new Date().toISOString() }); } catch(e) {}

    var perfilMudou = permsAlvoAnt.perfil_base !== dados.perfil_base;
    SystemEvents.emit(perfilMudou ? SystemEventTypes.ROLE_UPDATED : SystemEventTypes.PERMISSION_GRANTED, {
      entidade: 'usuario', entidadeId: emailAlvo,
      usuario: emailEditor, origem: 'PermissoesV2Engine',
      contexto: {
        perfilAntes:  permsAlvoAnt.perfil_base,
        perfilDepois: dados.perfil_base,
        perfilMudou:  perfilMudou
      }
    });

    var usuarios = readJSON('usuarios_sistema.json');
    for (var j = 0; j < usuarios.length; j++) {
      if (String(usuarios[j].email||'').toLowerCase() === emailAlvo) {
        usuarios[j].configurado = true; break;
      }
    }
    writeJSON('usuarios_sistema.json', usuarios);

    return { ok: true, permissoes: registro };
  }

  // ── Listagem ──────────────────────────────────────────────────

  function listar(emailFallback) {
    var em = obterEmailUsuario(emailFallback || '');
    if (!em) throw new Error('Acesso negado — identidade não resolvida');
    var lista = readJSON('permissoes_v2.json');
    var p = null;
    for (var i = 0; i < lista.length; i++) {
      if (String(lista[i].email||'').toLowerCase() === em) { p = lista[i]; break; }
    }
    if (!p) {
      var perfAdm = _obterMapaAdmins()[em];
      if (perfAdm === 'superadmin' || perfAdm === 'admin') p = { perfil_base: perfAdm };
    }
    if (!p || (p.perfil_base !== 'superadmin' && p.perfil_base !== 'admin')) {
      throw new Error('Acesso negado');
    }
    return {
      permissoes: lista,
      usuarios:   readJSON('usuarios_sistema.json')
    };
  }

  // ── Auditoria ─────────────────────────────────────────────────

  function _registrarAuditoria(entrada) {
    try {
      var log = readJSON('auditoria_permissoes.json');
      if (!Array.isArray(log)) log = [];
      log.unshift(entrada);
      if (log.length > 500) log = log.slice(0, 500);
      writeJSON('auditoria_permissoes.json', log);
    } catch(e) {
      Logger.error('PermissoesV2Engine', 'Auditoria falhou', e.message);
    }
  }

  function obterAuditoria() {
    var em = obterEmailUsuario('');
    var p  = obterPermissoes(em);
    if (!p || (p.perfil_base !== 'superadmin' && p.perfil_base !== 'admin')) {
      throw new Error('Acesso negado');
    }
    return readJSON('auditoria_permissoes.json');
  }

  // ── Verificações pontuais ─────────────────────────────────────

  function podeAcessar(email, modulo) {
    try {
      var p = obterPermissoes(email || obterEmailUsuario(''));
      if (p.perfil_base === 'superadmin') return true;
      return !!(p.permissoes_finais && p.permissoes_finais[modulo] && p.permissoes_finais[modulo].visualizar);
    } catch(e) { return false; }
  }

  function podeEditar(email, modulo) {
    try {
      var p = obterPermissoes(email || obterEmailUsuario(''));
      if (p.perfil_base === 'superadmin') return true;
      return !!(p.permissoes_finais && p.permissoes_finais[modulo] && p.permissoes_finais[modulo].editar);
    } catch(e) { return false; }
  }

  function podeExcluir(email, modulo) {
    try {
      var p = obterPermissoes(email || obterEmailUsuario(''));
      if (p.perfil_base === 'superadmin') return true;
      return !!(p.permissoes_finais && p.permissoes_finais[modulo] && p.permissoes_finais[modulo].excluir);
    } catch(e) { return false; }
  }

  return {
    // Usuários
    obterUsuarios:       obterUsuarios,
    sincronizarUsuarios: sincronizarUsuarios,
    // Permissões
    obterPermissoes:     obterPermissoes,
    salvarPermissoes:    salvarPermissoes,
    calcularAutomaticas: calcularAutomaticas,
    calcularFinais:      calcularFinais,
    listar:              listar,
    obterAuditoria:      obterAuditoria,
    // Verificações
    podeAcessar:         podeAcessar,
    podeEditar:          podeEditar,
    podeExcluir:         podeExcluir
  };

})();
