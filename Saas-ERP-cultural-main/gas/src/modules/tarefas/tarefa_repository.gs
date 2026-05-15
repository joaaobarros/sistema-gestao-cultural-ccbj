/**
 * @file modules/tarefas/tarefa_repository.gs
 * @layer modules
 * @description Repositório de Tarefas — persistência via Drive JSON (DataLayer).
 *              Ponto único de leitura/escrita do arquivo tarefas.json.
 *              Encapsula filtragem por nível de permissão do usuário.
 *
 * @depends core/data_layer.gs (readJSON, writeJSON)
 */

var TarefaRepository = (function() {

  var _FILE = 'tarefas.json';

  // Níveis que podem ver todas as tarefas (não apenas as suas)
  var _NIVEIS_AMPLOS = ['superadmin', 'admin', 'gestor'];

  function _ler() {
    try {
      return readJSON(_FILE) || [];
    } catch(e) {
      Logger.warn('[TarefaRepository] Erro ao ler ' + _FILE + ': ' + e.message);
      return [];
    }
  }

  function _escrever(lista) {
    writeJSON(_FILE, lista);
  }

  // Retorna true se o email é responsável, executor ou criador da tarefa
  function _pertenceAoUsuario(tarefa, email) {
    if (!email) return false;
    if (tarefa.responsavel === email)                        return true;
    if (tarefa.criadoPor  === email)                        return true;
    if ((tarefa.executores || []).indexOf(email) !== -1)    return true;
    return false;
  }

  return {

    listar: function() {
      return _ler();
    },

    /**
     * Lista tarefas visíveis para um usuário dado seu nível de acesso.
     * @param {string} email   — email do usuário
     * @param {string} nivel   — nível de acesso (superadmin | admin | gestor | outro)
     * @returns {Array}
     */
    listarParaUsuario: function(email, nivel) {
      var todas = _ler();
      if (_NIVEIS_AMPLOS.indexOf(nivel) !== -1) return todas;
      return todas.filter(function(t) { return _pertenceAoUsuario(t, email); });
    },

    obterPorId: function(id) {
      return _ler().find(function(t) { return t.id === id; }) || null;
    },

    /**
     * Verifica se um usuário pode visualizar uma tarefa específica.
     */
    podeVisualizar: function(tarefa, email, nivel) {
      if (_NIVEIS_AMPLOS.indexOf(nivel) !== -1) return true;
      return _pertenceAoUsuario(tarefa, email);
    },

    salvar: function(tarefa) {
      var lista = _ler();
      var idx   = -1;
      for (var i = 0; i < lista.length; i++) {
        if (lista[i].id === tarefa.id) { idx = i; break; }
      }
      if (idx === -1) lista.push(tarefa);
      else            lista[idx] = tarefa;
      _escrever(lista);
      return tarefa;
    },

    excluir: function(id) {
      _escrever(_ler().filter(function(t) { return t.id !== id; }));
      return { ok: true };
    },

    listarPorStatus: function(status) {
      return _ler().filter(function(t) { return t.status === status; });
    },

    listarPorModulo: function(modulo) {
      return _ler().filter(function(t) { return t.modulo === modulo; });
    },

    listarAtrasadas: function() {
      var now = Date.now();
      return _ler().filter(function(t) {
        if (!t.prazo) return false;
        if (t.status === 'concluida' || t.status === 'cancelada') return false;
        return new Date(t.prazo).getTime() < now;
      });
    }
  };
})();
