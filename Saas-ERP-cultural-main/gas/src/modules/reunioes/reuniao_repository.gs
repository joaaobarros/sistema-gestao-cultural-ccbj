/**
 * @file modules/reunioes/reuniao_repository.gs
 * @layer modules
 * @description Repositório de Reuniões e Encaminhamentos — persistência via Drive JSON.
 *              Dois arquivos: reunioes.json (reuniões + atas) e encaminhamentos.json.
 *              Ponto único de leitura/escrita. Filtragem por permissão encapsulada aqui.
 *
 * @depends core/data_layer.gs (readJSON, writeJSON)
 * @depends core/logger.gs (Logger)
 */

var ReunioesRepository = (function() {

  var _FILE_REUNIOES       = 'reunioes.json';
  var _FILE_ENCAMINHAMENTOS = 'encaminhamentos.json';
  var _NIVEIS_AMPLOS       = ['superadmin', 'admin', 'gestor'];

  // ── Helpers internos ─────────────────────────────────────────────────────

  function _lerReunioes() {
    try { return readJSON(_FILE_REUNIOES) || []; }
    catch(e) { Logger.warn('[ReunioesRepository] Erro ao ler reunioes.json: ' + e.message); return []; }
  }

  function _escreverReunioes(lista) { writeJSON(_FILE_REUNIOES, lista); }

  function _lerEncaminhamentos() {
    try { return readJSON(_FILE_ENCAMINHAMENTOS) || []; }
    catch(e) { Logger.warn('[ReunioesRepository] Erro ao ler encaminhamentos.json: ' + e.message); return []; }
  }

  function _escreverEncaminhamentos(lista) { writeJSON(_FILE_ENCAMINHAMENTOS, lista); }

  function _pertenceAoUsuario(reuniao, email) {
    if (!email) return false;
    if (reuniao.organizador === email) return true;
    if (reuniao.criadoPor  === email) return true;
    if ((reuniao.participantes || []).indexOf(email) !== -1) return true;
    return false;
  }

  function _podeVerEncaminhamento(enc, email, nivel) {
    if (_NIVEIS_AMPLOS.indexOf(nivel) !== -1) return true;
    if (enc.responsavel === email) return true;
    if (enc.criadoPor   === email) return true;
    if ((enc.envolvidos || []).indexOf(email) !== -1) return true;
    return false;
  }

  // ── Reuniões ─────────────────────────────────────────────────────────────

  return {

    // --- Reuniões ---

    listarReunioes: function() {
      return _lerReunioes();
    },

    listarReunioesParaUsuario: function(email, nivel) {
      var todas = _lerReunioes();
      // Superadmin/admin/gestor veem todas as reuniões
      if (_NIVEIS_AMPLOS.indexOf(nivel) !== -1) return todas;
      // Demais: apenas reuniões onde o usuário é participante ou organizador
      return todas.filter(function(r) { return _pertenceAoUsuario(r, email); });
    },

    obterReuniaoPorId: function(id) {
      return _lerReunioes().find(function(r) { return r.id === id; }) || null;
    },

    salvarReuniao: function(reuniao) {
      var lista = _lerReunioes();
      var idx = -1;
      for (var i = 0; i < lista.length; i++) {
        if (lista[i].id === reuniao.id) { idx = i; break; }
      }
      if (idx === -1) lista.push(reuniao);
      else            lista[idx] = reuniao;
      _escreverReunioes(lista);
      return reuniao;
    },

    excluirReuniao: function(id) {
      _escreverReunioes(_lerReunioes().filter(function(r) { return r.id !== id; }));
      return { ok: true };
    },

    listarPorStatus: function(status) {
      return _lerReunioes().filter(function(r) { return r.status === status; });
    },

    listarProximas: function(diasHorizonte) {
      var limite = new Date();
      limite.setDate(limite.getDate() + (diasHorizonte || 30));
      var hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      return _lerReunioes().filter(function(r) {
        if (r.status === 'cancelada' || r.status === 'arquivada') return false;
        var d = new Date(r.data);
        return d >= hoje && d <= limite;
      });
    },

    // --- Encaminhamentos ---

    listarEncaminhamentos: function() {
      return _lerEncaminhamentos();
    },

    listarEncaminhamentosParaUsuario: function(email, nivel) {
      var todos = _lerEncaminhamentos();
      if (_NIVEIS_AMPLOS.indexOf(nivel) !== -1) return todos;
      return todos.filter(function(e) { return _podeVerEncaminhamento(e, email, nivel); });
    },

    listarEncaminhamentosPorReuniao: function(reuniaoId) {
      return _lerEncaminhamentos().filter(function(e) { return e.reuniaoId === reuniaoId; });
    },

    listarEncaminhamentosAtrasados: function() {
      var agora = Date.now();
      return _lerEncaminhamentos().filter(function(e) {
        if (!e.prazo) return false;
        if (e.status === 'concluido' || e.status === 'cancelado') return false;
        return new Date(e.prazo).getTime() < agora;
      });
    },

    obterEncaminhamentoPorId: function(id) {
      return _lerEncaminhamentos().find(function(e) { return e.id === id; }) || null;
    },

    salvarEncaminhamento: function(enc) {
      var lista = _lerEncaminhamentos();
      var idx = -1;
      for (var i = 0; i < lista.length; i++) {
        if (lista[i].id === enc.id) { idx = i; break; }
      }
      if (idx === -1) lista.push(enc);
      else            lista[idx] = enc;
      _escreverEncaminhamentos(lista);
      return enc;
    },

    excluirEncaminhamento: function(id) {
      _escreverEncaminhamentos(_lerEncaminhamentos().filter(function(e) { return e.id !== id; }));
      return { ok: true };
    },

    listarEncaminhamentosComFiltros: function(filtros, email, nivel) {
      var todos = _lerEncaminhamentos();
      var f = filtros || {};
      var resultado = todos.filter(function(e) {
        if (f.status      && e.status      !== f.status)      return false;
        if (f.responsavel && e.responsavel !== f.responsavel) return false;
        if (f.prioridade  && e.prioridade  !== f.prioridade)  return false;
        if (f.reuniaoId   && e.reuniaoId   !== f.reuniaoId)   return false;
        if (f.modulo      && e.modulo      !== f.modulo)      return false;
        if (f.atrasados   && !e.atrasado)                     return false;
        if (f.incompletos && !e.incompleto)                   return false;
        return true;
      });
      if (_NIVEIS_AMPLOS.indexOf(nivel) !== -1) return resultado;
      return resultado.filter(function(e) { return _podeVerEncaminhamento(e, email, nivel); });
    },

    // Métricas para dashboard
    calcularMetricasEncaminhamentos: function() {
      var todos = _lerEncaminhamentos();
      var agora = Date.now();
      var por_status = {};
      var por_responsavel = {};
      var atrasados = 0;
      var incompletos = 0;
      var criticos = 0;
      todos.forEach(function(e) {
        por_status[e.status] = (por_status[e.status] || 0) + 1;
        if (e.responsavel) por_responsavel[e.responsavel] = (por_responsavel[e.responsavel] || 0) + 1;
        if (e.prazo && new Date(e.prazo).getTime() < agora &&
            e.status !== 'concluido' && e.status !== 'cancelado') atrasados++;
        if (e.incompleto) incompletos++;
        if (e.prioridade === 'critica' && e.status !== 'concluido') criticos++;
      });
      return {
        total: todos.length,
        por_status: por_status,
        por_responsavel: por_responsavel,
        atrasados: atrasados,
        incompletos: incompletos,
        criticos: criticos
      };
    },

    calcularMetricasReunioes: function() {
      var todas = _lerReunioes();
      var por_status = {};
      var semExecucao = 0;
      todas.forEach(function(r) {
        por_status[r.status] = (por_status[r.status] || 0) + 1;
      });
      var reunioesFinalizadas = todas.filter(function(r) {
        return r.status === 'ata_aprovada' || r.status === 'arquivada';
      });
      var todasEnc = _lerEncaminhamentos();
      reunioesFinalizadas.forEach(function(r) {
        var encs = todasEnc.filter(function(e) { return e.reuniaoId === r.id; });
        if (encs.length === 0) semExecucao++;
      });
      return {
        total: todas.length,
        por_status: por_status,
        sem_execucao: semExecucao
      };
    }

  };

})();
