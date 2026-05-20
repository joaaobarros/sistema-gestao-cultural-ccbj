/**
 * @file modules/rh/escalas_repository.gs
 * @layer modules/rh
 * @description Repositório do Sistema de Escalas e Agendas Operacionais.
 *
 * Arquivos gerenciados:
 *   rh_escalas.json        — escalas (turnos embutidos)
 *   rh_escalas_trocas.json — solicitações de troca de turno
 *   rh_escalas_logs.json   — logs de importação
 *
 * @depends core/data_layer.gs (readJSON, writeJSON)
 */

var EscalasRepository = (function () {

  // ── Helpers genéricos ─────────────────────────────────────────────

  function _ler(arquivo) {
    return readJSON(arquivo) || [];
  }

  function _salvar(arquivo, dados, prefixo) {
    var lista  = _ler(arquivo);
    var isNovo = !dados.id;
    if (isNovo) {
      dados.id       = typeof gerarId === 'function'
        ? gerarId(prefixo)
        : prefixo + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);
      dados.criadoEm = new Date().toISOString();
      lista.push(dados);
    } else {
      var idx = lista.findIndex(function(x) { return x.id === dados.id; });
      if (idx >= 0) lista[idx] = dados; else lista.push(dados);
    }
    writeJSON(arquivo, lista);
    return { id: dados.id, isNovo: isNovo };
  }

  function _excluir(arquivo, id) {
    writeJSON(arquivo, _ler(arquivo).filter(function(x) { return x.id !== id; }));
  }

  // ── Escalas ──────────────────────────────────────────────────────

  function listarEscalas(filtros) {
    var lista = _ler('rh_escalas.json');
    if (!filtros) return lista;
    if (filtros.status)  lista = lista.filter(function(e) { return e.status === filtros.status; });
    if (filtros.setor)   lista = lista.filter(function(e) { return e.setor === filtros.setor; });
    if (filtros.equipe)  lista = lista.filter(function(e) { return e.equipe === filtros.equipe; });
    if (filtros.tipo)    lista = lista.filter(function(e) { return e.tipo === filtros.tipo; });
    if (filtros.idColaborador) {
      lista = lista.filter(function(e) {
        return (e.turnos || []).some(function(t) {
          return t.idColaborador === filtros.idColaborador;
        });
      });
    }
    if (filtros.dataInicio) {
      lista = lista.filter(function(e) {
        return (e.turnos || []).some(function(t) {
          return (t.dataInicio || '') >= filtros.dataInicio;
        });
      });
    }
    if (filtros.dataFim) {
      lista = lista.filter(function(e) {
        return (e.turnos || []).some(function(t) {
          return (t.dataInicio || '') <= filtros.dataFim;
        });
      });
    }
    if (filtros.mes) {
      lista = lista.filter(function(e) {
        return (e.turnos || []).some(function(t) {
          return (t.dataInicio || '').startsWith(filtros.mes);
        });
      });
    }
    return lista;
  }

  function obterEscala(id) {
    var lista = _ler('rh_escalas.json');
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].id === id) return lista[i];
    }
    return null;
  }

  function salvarEscala(d)   { return _salvar('rh_escalas.json', d, 'esc'); }
  function excluirEscala(id) { _excluir('rh_escalas.json', id); }

  // ── Trocas ───────────────────────────────────────────────────────

  function listarTrocas(filtros) {
    var lista = _ler('rh_escalas_trocas.json');
    if (!filtros) return lista;
    if (filtros.status) lista = lista.filter(function(t) { return t.status === filtros.status; });
    if (filtros.idColaborador) {
      lista = lista.filter(function(t) {
        return t.idSolicitante === filtros.idColaborador ||
               t.idSubstituto  === filtros.idColaborador;
      });
    }
    if (filtros.idEscala) lista = lista.filter(function(t) { return t.idEscala === filtros.idEscala; });
    return lista.sort(function(a, b) {
      return (b.criadoEm || '') < (a.criadoEm || '') ? -1 : 1;
    });
  }

  function obterTroca(id) {
    var lista = _ler('rh_escalas_trocas.json');
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].id === id) return lista[i];
    }
    return null;
  }

  function salvarTroca(d) { return _salvar('rh_escalas_trocas.json', d, 'troca'); }

  // ── Logs de Importação ───────────────────────────────────────────

  function listarLogs()   { return _ler('rh_escalas_logs.json'); }
  function salvarLog(d)   { return _salvar('rh_escalas_logs.json', d, 'implog'); }

  // ── API pública ───────────────────────────────────────────────────

  return {
    listarEscalas: listarEscalas,
    obterEscala:   obterEscala,
    salvarEscala:  salvarEscala,
    excluirEscala: excluirEscala,
    listarTrocas:  listarTrocas,
    obterTroca:    obterTroca,
    salvarTroca:   salvarTroca,
    listarLogs:    listarLogs,
    salvarLog:     salvarLog
  };

})();
