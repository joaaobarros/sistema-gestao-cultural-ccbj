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

    /**
     * Lista tarefas de uma função específica, respeitando nível de acesso.
     * Inclui tarefas onde funcao === funcaoBuscada (responsável indefinido = fila da função).
     */
    listarPorFuncao: function(funcao, email, nivel) {
      var todas = _ler();
      var atribuidas = funcao
        ? todas.filter(function(t) { return t.funcao === funcao; })
        : todas;

      if (_NIVEIS_AMPLOS.indexOf(nivel) !== -1) return atribuidas;
      return atribuidas.filter(function(t) { return _pertenceAoUsuario(t, email); });
    },

    /**
     * Filtro genérico multi-campo — qualquer combinação dos campos abaixo.
     * @param {Object} filtros — { modulo, funcao, status, responsavel, tipo, prioridade, semResponsavel }
     * @param {string} email   — para filtragem por permissão
     * @param {string} nivel   — nível de acesso
     */
    listarComFiltros: function(filtros, email, nivel) {
      var todas = _ler();
      var f = filtros || {};

      var resultado = todas.filter(function(t) {
        if (f.modulo      && t.modulo      !== f.modulo)      return false;
        if (f.funcao      && t.funcao      !== f.funcao)      return false;
        if (f.status      && t.status      !== f.status)      return false;
        if (f.responsavel && t.responsavel !== f.responsavel) return false;
        if (f.tipo        && t.tipo        !== f.tipo)        return false;
        if (f.prioridade  && t.prioridade  !== f.prioridade)  return false;
        if (f.tarefaPai   && t.tarefaPai   !== f.tarefaPai)   return false;
        if (f.semResponsavel && t.responsavel)                return false;
        if (f.slaViolado  && !t.slaViolado)                   return false;
        return true;
      });

      if (_NIVEIS_AMPLOS.indexOf(nivel) !== -1) return resultado;
      return resultado.filter(function(t) { return _pertenceAoUsuario(t, email); });
    },

    listarAtrasadas: function() {
      var now = Date.now();
      return _ler().filter(function(t) {
        if (!t.prazo) return false;
        if (t.status === 'concluida' || t.status === 'cancelada') return false;
        return new Date(t.prazo).getTime() < now;
      });
    },

    /**
     * Verifica se já existe processo de comunicação vinculado a um ID de origem.
     * Usado para deduplicação de demandas criadas a partir de reservas.
     */
    obterPorOrigem: function(modulo, idOrigem) {
      return _ler().find(function(t) {
        return t.modulo === modulo &&
               t.idOrigem === idOrigem &&
               t.tipo === 'processo_comunicacao';
      }) || null;
    }
  };
})();
