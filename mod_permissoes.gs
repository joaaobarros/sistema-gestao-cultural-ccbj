/**
 * @file mod_permissoes.gs
 * @layer backend/modules
 * @description Sistema de permissões modulares por usuário.
 *              Persiste em "permissoes.json" no Drive (DataLayer.gs).
 *              Formato: [{ email, perfil, modulos: { mod: { visualizar, editar, excluir } } }]
 *
 *              Perfis padrão (usados se não houver entrada específica):
 *              superadmin → tudo
 *              admin      → visualizar/editar na maioria; excluir restrito
 *              gestor     → visualizar/editar em reservas, contratos, relatórios
 *              tecnico    → visualizar/editar em reservas
 *              visitante  → visualizar apenas
 */

var _PERFIS_PADRAO = {
  superadmin: { reservas:true, contratos:true, financeiro:true, tarefas:true,
                processos:true, almoxarifado:true, balcao:true, rh:true,
                eficiencia:true, contratacoes:true, relatorios:true, escuta:true },
  admin:      { reservas:true, contratos:true, financeiro:true, tarefas:true,
                processos:true, almoxarifado:true, balcao:true, rh:false,
                eficiencia:true, contratacoes:true, relatorios:true, escuta:true },
  gestor:     { reservas:true, contratos:true, financeiro:false, tarefas:true,
                processos:true, almoxarifado:false, balcao:true, rh:false,
                eficiencia:true, contratacoes:false, relatorios:true, escuta:true },
  tecnico:    { reservas:true, contratos:false, financeiro:false, tarefas:true,
                processos:false, almoxarifado:false, balcao:true, rh:false,
                eficiencia:false, contratacoes:false, relatorios:false, escuta:true },
  visitante:  { reservas:true, contratos:false, financeiro:false, tarefas:false,
                processos:false, almoxarifado:false, balcao:false, rh:false,
                eficiencia:false, contratacoes:false, relatorios:false, escuta:false }
};

function _permModulosPadrao(perfil, acao) {
  var acesso = _PERFIS_PADRAO[perfil] || _PERFIS_PADRAO.visitante;
  var modulos = {};
  Object.keys(acesso).forEach(function(mod) {
    var ok = !!acesso[mod];
    modulos[mod] = {
      visualizar: ok,
      editar:     ok && acao !== 'visitante',
      excluir:    ok && (perfil === 'superadmin' || perfil === 'admin')
    };
  });
  return modulos;
}

// ── Consultar permissões de um usuário ───────────────────

function obterPermissoesUsuario(email) {
  if (!email) return { perfil: 'visitante', modulos: _permModulosPadrao('visitante') };

  var lista = readJSON('permissoes.json');
  var entrada = null;
  for (var i = 0; i < lista.length; i++) {
    if (String(lista[i].email || '').toLowerCase() === String(email).toLowerCase()) {
      entrada = lista[i]; break;
    }
  }

  if (!entrada) {
    // Deriva do nível existente em AppState (via verificarPermissao)
    try {
      var nivel = verificarPermissao('admin', email) ? 'admin' : 'visitante';
      return { perfil: nivel, modulos: _permModulosPadrao(nivel) };
    } catch(e) {
      return { perfil: 'visitante', modulos: _permModulosPadrao('visitante') };
    }
  }

  var perfil = entrada.perfil || 'visitante';
  var modulos = entrada.modulos || _permModulosPadrao(perfil);
  return { perfil: perfil, modulos: modulos };
}

// ── Funções de verificação ───────────────────────────────

function podeAcessarModulo(email, modulo) {
  var perms = obterPermissoesUsuario(email);
  if (perms.perfil === 'superadmin') return true;
  return !!(perms.modulos && perms.modulos[modulo] && perms.modulos[modulo].visualizar);
}

function podeEditar(email, modulo) {
  var perms = obterPermissoesUsuario(email);
  if (perms.perfil === 'superadmin') return true;
  return !!(perms.modulos && perms.modulos[modulo] && perms.modulos[modulo].editar);
}

function podeExcluir(email, modulo) {
  var perms = obterPermissoesUsuario(email);
  if (perms.perfil === 'superadmin') return true;
  return !!(perms.modulos && perms.modulos[modulo] && perms.modulos[modulo].excluir);
}

// ── CRUD de permissões (admin) ───────────────────────────

function salvarPermissaoUsuario(dados) {
  var lista = readJSON('permissoes.json');
  var encontrado = false;
  for (var i = 0; i < lista.length; i++) {
    if (String(lista[i].email || '').toLowerCase() === String(dados.email || '').toLowerCase()) {
      lista[i] = dados; encontrado = true; break;
    }
  }
  if (!encontrado) lista.push(dados);
  writeJSON('permissoes.json', lista);
  return { ok: true };
}

function listarPermissoes() {
  return readJSON('permissoes.json');
}

function excluirPermissaoUsuario(email) {
  var lista = readJSON('permissoes.json');
  writeJSON('permissoes.json', lista.filter(function(p) {
    return String(p.email || '').toLowerCase() !== String(email || '').toLowerCase();
  }));
  return { ok: true };
}
