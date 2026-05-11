// ═══════════════════════════════════════════════════════════════
// mod_permissoes_v2.gs — Sistema híbrido de permissões (v2)
// ═══════════════════════════════════════════════════════════════

var _P2_MODULOS = [
  'agenda','estrategia','comunicacao','espacos',
  'reservas','contratos','financeiro','tarefas',
  'processos','almoxarifado','balcao','rh',
  'eficiencia','contratacoes','relatorios','escuta','pessoal',
  'acoes'
];

var _P2_SENSIVEIS     = ['rh','contratacoes','financeiro'];
var _P2_VC_MODS       = ['espacos','comunicacao','relatorios','estrategia'];
var _P2_PERFIS_VALIDOS = ['superadmin','admin','gestor','tecnico','rh','comunicacao','visitante_controlado','visitante'];

function _p2p(v,e,x) { return {visualizar:!!v,editar:!!e,excluir:!!x}; }

function _p2map(fn) {
  var r = {};
  _P2_MODULOS.forEach(function(m) { r[m] = fn(m); });
  return r;
}

var _P2_BASE = {
  superadmin: _p2map(function() { return _p2p(1,1,1); }),
  admin: {
    agenda:_p2p(1,1,1),      estrategia:_p2p(1,1,1),   comunicacao:_p2p(1,1,1),  espacos:_p2p(1,1,1),
    reservas:_p2p(1,1,1),    contratos:_p2p(1,1,0),    financeiro:_p2p(1,0,0),   tarefas:_p2p(1,1,1),
    processos:_p2p(1,1,1),   almoxarifado:_p2p(1,1,0), balcao:_p2p(1,1,0),       rh:_p2p(0,0,0),
    eficiencia:_p2p(1,0,0),  contratacoes:_p2p(0,0,0), relatorios:_p2p(1,0,0),
    escuta:_p2p(1,0,0),      pessoal:_p2p(1,1,0),      acoes:_p2p(1,1,1)
  },
  gestor: {
    agenda:_p2p(1,1,0),      estrategia:_p2p(1,1,0),   comunicacao:_p2p(1,0,0),  espacos:_p2p(1,0,0),
    reservas:_p2p(1,1,0),    contratos:_p2p(1,1,0),    financeiro:_p2p(0,0,0),   tarefas:_p2p(1,1,0),
    processos:_p2p(1,1,0),   almoxarifado:_p2p(0,0,0), balcao:_p2p(1,0,0),       rh:_p2p(0,0,0),
    eficiencia:_p2p(1,0,0),  contratacoes:_p2p(0,0,0), relatorios:_p2p(1,0,0),
    escuta:_p2p(1,0,0),      pessoal:_p2p(1,0,0),      acoes:_p2p(1,1,0)
  },
  tecnico: {
    agenda:_p2p(1,1,0),      estrategia:_p2p(1,0,0),   comunicacao:_p2p(1,0,0),  espacos:_p2p(1,1,0),
    reservas:_p2p(1,1,0),    contratos:_p2p(0,0,0),    financeiro:_p2p(0,0,0),   tarefas:_p2p(1,1,0),
    processos:_p2p(0,0,0),   almoxarifado:_p2p(1,1,0), balcao:_p2p(1,1,0),       rh:_p2p(0,0,0),
    eficiencia:_p2p(0,0,0),  contratacoes:_p2p(0,0,0), relatorios:_p2p(0,0,0),
    escuta:_p2p(0,0,0),      pessoal:_p2p(1,0,0),      acoes:_p2p(1,0,0)
  },
  rh: {
    agenda:_p2p(1,0,0),      estrategia:_p2p(1,0,0),   comunicacao:_p2p(1,0,0),  espacos:_p2p(1,0,0),
    reservas:_p2p(0,0,0),    contratos:_p2p(0,0,0),    financeiro:_p2p(1,0,0),   tarefas:_p2p(1,1,0),
    processos:_p2p(0,0,0),   almoxarifado:_p2p(0,0,0), balcao:_p2p(0,0,0),       rh:_p2p(1,1,0),
    eficiencia:_p2p(1,0,0),  contratacoes:_p2p(1,1,0), relatorios:_p2p(1,0,0),
    escuta:_p2p(1,0,0),      pessoal:_p2p(1,1,0),      acoes:_p2p(1,0,0)
  },
  comunicacao: {
    agenda:_p2p(1,0,0),      estrategia:_p2p(1,1,0),   comunicacao:_p2p(1,1,0),  espacos:_p2p(1,0,0),
    reservas:_p2p(1,0,0),    contratos:_p2p(0,0,0),    financeiro:_p2p(0,0,0),   tarefas:_p2p(1,1,0),
    processos:_p2p(1,1,0),   almoxarifado:_p2p(0,0,0), balcao:_p2p(0,0,0),       rh:_p2p(0,0,0),
    eficiencia:_p2p(0,0,0),  contratacoes:_p2p(0,0,0), relatorios:_p2p(0,0,0),
    escuta:_p2p(1,0,0),      pessoal:_p2p(0,0,0),      acoes:_p2p(1,1,0)
  },
  visitante_controlado: _p2map(function(m) {
    return _P2_VC_MODS.indexOf(m) !== -1 ? _p2p(1,0,0) : _p2p(0,0,0);
  }),
  visitante: _p2map(function(m) {
    return m === 'agenda' ? _p2p(1,0,0) : _p2p(0,0,0);
  })
};

// ── Usuários do sistema ──────────────────────────────────────

function obterUsuariosSistema() {
  return readJSON('usuarios_sistema.json');
}

function sincronizarUsuariosSistema() {
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

    var abaAdmins = _getSheet('Administradores');
    var adminsData = [];
    if (abaAdmins && abaAdmins.getLastRow() > 1) {
      adminsData = abaAdmins.getRange(2, 1, abaAdmins.getLastRow() - 1, 2).getValues();
      adminsData.forEach(function(r) {
        var em = String(r[0] || '').trim().toLowerCase();
        if (em && em.indexOf('@') > -1) emailSet[em] = true;
      });
    }

    var abaRes = _getSheet('Reservas');
    if (abaRes && abaRes.getLastRow() > 1) {
      abaRes.getRange(2, 9, abaRes.getLastRow() - 1, 1).getValues().forEach(function(r) {
        var em = String(r[0] || '').trim().toLowerCase();
        if (em && em.indexOf('@') > -1) emailSet[em] = true;
      });
    }

    var nivelMap = {};
    adminsData.forEach(function(r) {
      nivelMap[String(r[0] || '').trim().toLowerCase()] = String(r[1] || '').trim().toLowerCase();
    });

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
        email:       email,
        nome:        nome,
        ultimoAcesso:ultimoAcesso,
        origem:      origens,
        nivelAdmin:  nivelMap[email] || null,
        configurado: !!ex.configurado,
        ativo:       ex.ativo !== false
      });
    });

    writeJSON('usuarios_sistema.json', usuarios);
    return { ok: true, total: usuarios.length };
  } finally {
    lock.releaseLock();
  }
}

// ── Permissões ───────────────────────────────────────────────

function obterPermissoesUsuarioV2(email) {
  if (!email) {
    try { email = obterEmailUsuario(''); } catch(e) { return null; }
  }
  email = String(email).toLowerCase().trim();

  var lista = readJSON('permissoes_v2.json');
  for (var i = 0; i < lista.length; i++) {
    if (String(lista[i].email || '').toLowerCase() === email) return lista[i];
  }

  var perfil_base = 'visitante_controlado';
  try {
    var abaAdmins = _getSheet('Administradores');
    if (abaAdmins && abaAdmins.getLastRow() > 1) {
      var rows = abaAdmins.getRange(2, 1, abaAdmins.getLastRow() - 1, 2).getValues();
      for (var k = 0; k < rows.length; k++) {
        if (String(rows[k][0]||'').toLowerCase().trim() === email) {
          var n = String(rows[k][1]||'').toLowerCase().trim();
          var map = {superadmin:'superadmin',admin:'admin',gestor:'gestor',
                     tecnico:'tecnico','técnico':'tecnico',rh:'rh',
                     comunicacao:'comunicacao','comunicação':'comunicacao'};
          if (map[n]) perfil_base = map[n];
          break;
        }
      }
    }
  } catch(e) {}

  var origem = { cargo: '', funcoes: [], setores: [], donos_espaco: [] };
  var auto   = calcularPermissoesAutomaticas(origem, perfil_base);
  var finais = _p2consolidar(perfil_base, auto, {});

  return {
    email:                  email,
    perfil_base:            perfil_base,
    origem:                 origem,
    permissoes_automaticas: auto,
    permissoes_manuais:     {},
    permissoes_finais:      finais,
    atualizadoEm:           null
  };
}

function salvarPermissoesUsuarioV2(dados) {
  if (!dados || !dados.email) throw new Error('Email obrigatório');

  // Aceita emailEditor enviado pelo cliente como fallback para getActiveUser()
  // (em google.script.run com Execute as: Me, getActiveUser() pode retornar vazio)
  var emailEditor = obterEmailUsuario(dados.emailEditor || '');
  if (!emailEditor) throw new Error('Não foi possível identificar o editor. Recarregue a página.');

  // Leitura única de permissoes_v2.json — evita 3 readJSON separados na mesma função
  var listaPerms = readJSON('permissoes_v2.json');

  function _buscarOuDefault(email) {
    for (var i = 0; i < listaPerms.length; i++) {
      if (String(listaPerms[i].email||'').toLowerCase() === email) return listaPerms[i];
    }
    var perfil_base = 'visitante_controlado';
    try {
      var abaAdmins = _getSheet('Administradores');
      if (abaAdmins && abaAdmins.getLastRow() > 1) {
        var rows = abaAdmins.getRange(2, 1, abaAdmins.getLastRow() - 1, 2).getValues();
        var map  = {superadmin:'superadmin',admin:'admin',gestor:'gestor',
                    tecnico:'tecnico','técnico':'tecnico',rh:'rh',
                    comunicacao:'comunicacao','comunicação':'comunicacao'};
        for (var k = 0; k < rows.length; k++) {
          if (String(rows[k][0]||'').toLowerCase().trim() === email) {
            var n = String(rows[k][1]||'').toLowerCase().trim();
            if (map[n]) { perfil_base = map[n]; break; }
          }
        }
      }
    } catch(e) {}
    return { email: email, perfil_base: perfil_base, origem: {cargo:'',funcoes:[],setores:[],donos_espaco:[]},
             permissoes_automaticas: {}, permissoes_manuais: {}, permissoes_finais: {}, atualizadoEm: null };
  }

  var permsEditor  = _buscarOuDefault(emailEditor);
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
  if (_P2_PERFIS_VALIDOS.indexOf(dados.perfil_base) === -1) {
    throw new Error('Perfil inválido: ' + dados.perfil_base);
  }

  var origem  = dados.origem  || { cargo: '', funcoes: [], setores: [], donos_espaco: [] };
  var manuais = dados.permissoes_manuais || {};

  var auto   = calcularPermissoesAutomaticas(origem, dados.perfil_base);
  var finais = _p2consolidar(dados.perfil_base, auto, manuais);

  var registro = {
    email:                  emailAlvo,
    perfil_base:            dados.perfil_base,
    origem:                 origem,
    permissoes_automaticas: auto,
    permissoes_manuais:     manuais,
    permissoes_finais:      finais,
    atualizadoEm:           new Date().toISOString()
  };

  // Escrita atômica: re-lê dentro do lock para evitar race condition de read-modify-write
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

  // Auditoria assíncrona — não bloqueia retorno
  try { _p2registrarAuditoria({ editor: emailEditor, alvo: emailAlvo,
    antes: permsAlvoAnt, depois: registro, timestamp: new Date().toISOString() }); } catch(e) {}

  // Evento de sistema: mudança de perfil/permissões
  var perfilMudou = permsAlvoAnt.perfil_base !== dados.perfil_base;
  SystemEvents.emit(perfilMudou ? SystemEventTypes.ROLE_UPDATED : SystemEventTypes.PERMISSION_GRANTED, {
    entidade: 'usuario', entidadeId: emailAlvo,
    usuario: emailEditor, origem: 'mod_permissoes_v2',
    contexto: {
      perfilAntes: permsAlvoAnt.perfil_base,
      perfilDepois: dados.perfil_base,
      perfilMudou: perfilMudou
    }
  });

  // Marca usuário como configurado
  var usuarios = readJSON('usuarios_sistema.json');
  for (var j = 0; j < usuarios.length; j++) {
    if (String(usuarios[j].email||'').toLowerCase() === emailAlvo) {
      usuarios[j].configurado = true; break;
    }
  }
  writeJSON('usuarios_sistema.json', usuarios);

  return { ok: true, permissoes: registro };
}

// ── Motor automático ─────────────────────────────────────────

function calcularPermissoesAutomaticas(origem, perfil_base) {
  var result = _p2map(function() {
    return { visualizar: false, editar: false, excluir: false, origem: [] };
  });

  var cargo   = String(origem.cargo || '').toLowerCase().trim();
  var funcoes = Array.isArray(origem.funcoes)     ? origem.funcoes     : [];
  var setores = Array.isArray(origem.setores)     ? origem.setores     : [];
  var donos   = Array.isArray(origem.donos_espaco)? origem.donos_espaco: [];

  function grant(mods, v, e, x, motivo) {
    mods.forEach(function(m) {
      if (!result[m]) return;
      if (v) { result[m].visualizar = true; if (result[m].origem.indexOf(motivo) === -1) result[m].origem.push(motivo); }
      if (e) result[m].editar   = true;
      if (x) result[m].excluir  = true;
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
    _P2_SENSIVEIS.forEach(function(m) {
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
    if (_P2_MODULOS.indexOf(f) !== -1 && mods.indexOf(f) === -1) mods.push(f);
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

  // admin_tecnico nunca acessa dados sensíveis
  if (cargo === 'admin_tecnico' || cargo === 'ti' || cargo === 'infraestrutura') {
    _P2_SENSIVEIS.forEach(function(m) {
      result[m].visualizar = false; result[m].editar = false; result[m].excluir = false; result[m].origem = [];
    });
  }

  return result;
}

// ── Consolidação ─────────────────────────────────────────────

function _p2consolidar(perfil_base, auto, manuais) {
  if (perfil_base === 'superadmin') {
    return _p2map(function() { return { visualizar:true, editar:true, excluir:true, explicacao:['superadmin'] }; });
  }

  var base = _P2_BASE[perfil_base] || _P2_BASE.visitante_controlado;
  var result = {};

  _P2_MODULOS.forEach(function(m) {
    var b  = base[m] || _p2p(0,0,0);
    var a  = (auto   && auto[m])    || { visualizar:false, editar:false, excluir:false, origem:[] };
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
    if (!e) x = false;

    result[m] = { visualizar:v, editar:e, excluir:x, explicacao:exp };
  });

  return result;
}

function calcularPermissoesFinais(email) {
  var p = obterPermissoesUsuarioV2(email);
  if (!p) return null;
  return _p2consolidar(p.perfil_base, p.permissoes_automaticas, p.permissoes_manuais);
}

function listarPermissoesV2(emailFallback) {
  var em = obterEmailUsuario(emailFallback || '');
  if (!em) throw new Error('Acesso negado — identidade não resolvida');
  var lista = readJSON('permissoes_v2.json');
  var p = null;
  for (var i = 0; i < lista.length; i++) {
    if (String(lista[i].email||'').toLowerCase() === em) { p = lista[i]; break; }
  }
  // fallback: verifica na aba Administradores se não estiver na lista v2
  if (!p) {
    try {
      var abaAdmins = _getSheet('Administradores');
      if (abaAdmins && abaAdmins.getLastRow() > 1) {
        var rows = abaAdmins.getRange(2, 1, abaAdmins.getLastRow() - 1, 2).getValues();
        for (var k = 0; k < rows.length; k++) {
          if (String(rows[k][0]||'').toLowerCase().trim() === em) {
            var n = String(rows[k][1]||'').toLowerCase().trim();
            if (n === 'superadmin' || n === 'admin') { p = { perfil_base: n }; break; }
          }
        }
      }
    } catch(e) {}
  }
  if (!p || (p.perfil_base !== 'superadmin' && p.perfil_base !== 'admin')) {
    throw new Error('Acesso negado');
  }
  return {
    permissoes: lista,
    usuarios:   readJSON('usuarios_sistema.json')
  };
}

// ── Auditoria ────────────────────────────────────────────────

function _p2registrarAuditoria(entrada) {
  try {
    var log = readJSON('auditoria_permissoes.json');
    if (!Array.isArray(log)) log = [];
    log.unshift(entrada);
    if (log.length > 500) log = log.slice(0, 500);
    writeJSON('auditoria_permissoes.json', log);
  } catch(e) {
    Logger.error('permissoes_v2', 'Auditoria falhou', e.message);
  }
}

function obterAuditoriaPermissoes() {
  var em = obterEmailUsuario('');
  var p  = obterPermissoesUsuarioV2(em);
  if (!p || (p.perfil_base !== 'superadmin' && p.perfil_base !== 'admin')) {
    throw new Error('Acesso negado');
  }
  return readJSON('auditoria_permissoes.json');
}

// ── Compatibilidade v1 ───────────────────────────────────────

function obterPermissoesUsuario(email) {
  try {

    var em = email || obterEmailUsuario('');
    var p2 = obterPermissoesUsuarioV2(em);

    if (!p2 || !p2.permissoes_finais) {
      throw new Error('Permissões inválidas');
    }

    var modulos = {};
    var origem = p2.permissoes_finais;

    Object.keys(origem).forEach(function(mod) {

      var m = origem[mod] || {};

      modulos[mod] = {
        visualizar: !!m.visualizar,
        editar:     !!m.editar,
        excluir:    !!m.excluir
      };

    });

    return {
      perfil: p2.perfil_base || 'visitante',
      modulos: modulos
    };

  } catch(e) {
    var _vcModulos = {};
    _P2_MODULOS.forEach(function(m) {
      var b = (_P2_BASE.visitante_controlado || {})[m] || { visualizar: false, editar: false, excluir: false };
      _vcModulos[m] = { visualizar: !!b.visualizar, editar: false, excluir: false };
    });
    return { perfil: 'visitante_controlado', modulos: _vcModulos };
  }
}

function podeAcessarModulo(email, modulo) {
  try {
    var p = obterPermissoesUsuarioV2(email || obterEmailUsuario(''));
    if (p.perfil_base === 'superadmin') return true;
    return !!(p.permissoes_finais && p.permissoes_finais[modulo] && p.permissoes_finais[modulo].visualizar);
  } catch(e) { return false; }
}

function podeEditar(email, modulo) {
  try {
    var p = obterPermissoesUsuarioV2(email || obterEmailUsuario(''));
    if (p.perfil_base === 'superadmin') return true;
    return !!(p.permissoes_finais && p.permissoes_finais[modulo] && p.permissoes_finais[modulo].editar);
  } catch(e) { return false; }
}

function podeExcluir(email, modulo) {
  try {
    var p = obterPermissoesUsuarioV2(email || obterEmailUsuario(''));
    if (p.perfil_base === 'superadmin') return true;
    return !!(p.permissoes_finais && p.permissoes_finais[modulo] && p.permissoes_finais[modulo].excluir);
  } catch(e) { return false; }
}
