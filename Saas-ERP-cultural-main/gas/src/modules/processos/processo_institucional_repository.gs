/**
 * @file modules/processos/processo_institucional_repository.gs
 * @layer modules
 * @description Repositório de Processos Institucionais — persistência via Drive JSON (DataLayer).
 *              Ponto único de leitura/escrita do arquivo processos.json.
 *              Encapsula filtragem por nível de permissão e queries por entidade vinculada.
 *
 * @depends core/data_layer.gs (readJSON, writeJSON)
 * @depends core/logger.gs (Logger)
 */

var ProcessoInstitucionalRepository = (function() {

  var _FILE = 'processos.json';
  var _NIVEIS_AMPLOS = ['superadmin', 'admin', 'gestor'];

  function _ler() {
    try {
      return readJSON(_FILE) || [];
    } catch(e) {
      Logger.warn('[ProcessoInstitucionalRepository] Erro ao ler ' + _FILE + ': ' + e.message);
      return [];
    }
  }

  function _escrever(lista) {
    writeJSON(_FILE, lista);
  }

  function _pertenceAoUsuario(proc, email) {
    if (!email) return false;
    if (proc.solicitante      === email) return true;
    if (proc.responsavelAtual === email) return true;
    if (proc.criadoPor        === email) return true;
    return false;
  }

  return {

    listar: function() {
      return _ler();
    },

    listarParaUsuario: function(email, nivel) {
      var todos = _ler();
      if (_NIVEIS_AMPLOS.indexOf(nivel) !== -1) return todos;
      return todos.filter(function(p) { return _pertenceAoUsuario(p, email); });
    },

    obterPorId: function(id) {
      return _ler().find(function(p) { return p.id === id; }) || null;
    },

    salvar: function(proc) {
      var lista = _ler();
      var idx   = lista.findIndex(function(p) { return p.id === proc.id; });
      if (idx === -1) lista.push(proc);
      else            lista[idx] = proc;
      _escrever(lista);
      return proc;
    },

    excluir: function(id) {
      _escrever(_ler().filter(function(p) { return p.id !== id; }));
      return { ok: true };
    },

    listarComFiltros: function(filtros, email, nivel) {
      var todos = _ler();
      var f     = filtros || {};

      var resultado = todos.filter(function(p) {
        if (f.status    && p.status    !== f.status)    return false;
        if (f.tipo      && p.tipo      !== f.tipo)      return false;
        if (f.prioridade && p.prioridade !== f.prioridade) return false;
        if (f.acaoId    && p.acaoId    !== f.acaoId)    return false;
        if (f.responsavelAtual && p.responsavelAtual !== f.responsavelAtual) return false;
        if (f.setor) {
          if ((p.setoresEnvolvidos || []).indexOf(f.setor) === -1) return false;
        }
        return true;
      });

      if (_NIVEIS_AMPLOS.indexOf(nivel) !== -1) return resultado;
      return resultado.filter(function(p) { return _pertenceAoUsuario(p, email); });
    },

    // Localiza processos que têm uma entidade vinculada específica
    buscarPorVinculo: function(tipoEntidade, entidadeId) {
      return _ler().filter(function(p) {
        var lista = p[tipoEntidade] || [];
        return lista.some(function(v) { return v.id === entidadeId; });
      });
    },

    listarAbertos: function() {
      var terminais = ['concluido', 'cancelado'];
      return _ler().filter(function(p) {
        return terminais.indexOf(p.status) === -1;
      });
    }
  };
})();
