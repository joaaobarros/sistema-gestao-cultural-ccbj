/**
 * @file modules/solicitacoes/solicitacao_repository.gs
 * @layer modules/solicitacoes
 * @description Repositório de Solicitações Internas. Persistência em Drive JSON.
 * @depends core/data_layer.gs (readJSON, modifyJSON, writeJSON)
 */

var _SOL_FILE = 'solicitacoes.json';

// Contador de protocolo (persistido separadamente)
var _SOL_SEQ_FILE = 'solicitacoes_seq.json';

var SolicitacaoRepository = (function() {

  function _todos() {
    return readJSON(_SOL_FILE);
  }

  function _seq() {
    var s = readJSON(_SOL_SEQ_FILE);
    return (s && s.seq) ? s.seq : 0;
  }

  function _proximoProtocolo() {
    var seq = 0;
    modifyJSON(_SOL_SEQ_FILE, function(data) {
      var atual = (data && data.seq) ? data.seq : 0;
      seq = atual + 1;
      return { seq: seq };
    });
    var ano = new Date().getFullYear();
    return 'SOL-' + ano + '-' + String(seq).padStart(4, '0');
  }

  return {

    proximoProtocolo: function() {
      return _proximoProtocolo();
    },

    salvar: function(sol) {
      modifyJSON(_SOL_FILE, function(lista) {
        var idx = lista.findIndex(function(s) { return s.id === sol.id; });
        if (idx === -1) {
          lista.push(sol);
        } else {
          lista[idx] = sol;
        }
        return lista;
      });
    },

    obterPorId: function(id) {
      var lista = _todos();
      return lista.find(function(s) { return s.id === id; }) || null;
    },

    listarComFiltros: function(filtros) {
      var lista = _todos();

      if (filtros.status) {
        var statuses = Array.isArray(filtros.status) ? filtros.status : [filtros.status];
        lista = lista.filter(function(s) { return statuses.indexOf(s.status) !== -1; });
      }
      if (filtros.tipo) {
        lista = lista.filter(function(s) { return s.tipo === filtros.tipo; });
      }
      if (filtros.solicitante) {
        lista = lista.filter(function(s) { return s.solicitante === filtros.solicitante; });
      }
      if (filtros.setorSolicitante) {
        lista = lista.filter(function(s) { return s.setorSolicitante === filtros.setorSolicitante; });
      }
      if (filtros.setorExecutor) {
        lista = lista.filter(function(s) { return s.setorExecutor === filtros.setorExecutor; });
      }
      if (filtros.contratoId) {
        lista = lista.filter(function(s) { return s.contratoId === filtros.contratoId; });
      }
      if (filtros.processoId) {
        lista = lista.filter(function(s) { return s.processoId === filtros.processoId; });
      }
      if (filtros.acaoId) {
        lista = lista.filter(function(s) { return s.acaoId === filtros.acaoId; });
      }
      if (filtros.busca) {
        var q = filtros.busca.toLowerCase();
        lista = lista.filter(function(s) {
          return (s.titulo || '').toLowerCase().indexOf(q) !== -1 ||
                 (s.protocolo || '').toLowerCase().indexOf(q) !== -1 ||
                 (s.descricao || '').toLowerCase().indexOf(q) !== -1;
        });
      }

      return lista.sort(function(a, b) {
        return new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0);
      });
    },

    listarAbertos: function() {
      var terminais = ['concluida', 'cancelada'];
      return _todos().filter(function(s) { return terminais.indexOf(s.status) === -1; });
    },

    excluir: function(id) {
      modifyJSON(_SOL_FILE, function(lista) {
        return lista.filter(function(s) { return s.id !== id; });
      });
    },

    contarPorStatus: function() {
      var lista = _todos();
      var counts = {};
      lista.forEach(function(s) {
        counts[s.status] = (counts[s.status] || 0) + 1;
      });
      return counts;
    },

    obterMetricasPorPeriodo: function(dataInicio, dataFim) {
      var lista = _todos();
      var ini = dataInicio ? new Date(dataInicio).getTime() : 0;
      var fim = dataFim ? new Date(dataFim).getTime() : Date.now();

      var filtrado = lista.filter(function(s) {
        var t = new Date(s.criadoEm || 0).getTime();
        return t >= ini && t <= fim;
      });

      var tipos = {};
      var setores = {};
      var valorTotal = 0;

      filtrado.forEach(function(s) {
        tipos[s.tipo] = (tipos[s.tipo] || 0) + 1;
        setores[s.setorSolicitante || 'desconhecido'] = (setores[s.setorSolicitante || 'desconhecido'] || 0) + 1;
        valorTotal += parseFloat(s.valorTotal || 0);
      });

      return {
        total: filtrado.length,
        valorTotal: valorTotal,
        porTipo: tipos,
        porSetor: setores
      };
    }

  };
})();
