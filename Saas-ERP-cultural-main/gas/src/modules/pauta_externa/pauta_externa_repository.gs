/**
 * @file modules/pauta_externa/pauta_externa_repository.gs
 * @layer modules/pauta_externa
 * @description Repositório de Solicitações Externas de Cessão de Pauta.
 *              Persistência em Drive JSON.
 * @depends core/data_layer.gs
 */

var _PAUTA_FILE     = 'pauta_externa.json';
var _PAUTA_SEQ_FILE = 'pauta_externa_seq.json';

var PautaExternaRepository = (function() {

  function _todos() { return readJSON(_PAUTA_FILE); }

  function _proximoProtocolo() {
    var seq = 0;
    modifyJSON(_PAUTA_SEQ_FILE, function(data) {
      var atual = (data && data.seq) ? data.seq : 0;
      seq = atual + 1;
      return { seq: seq };
    });
    var ano = new Date().getFullYear();
    return 'PAUTA-' + ano + '-' + String(seq).padStart(4, '0');
  }

  return {

    proximoProtocolo: function() { return _proximoProtocolo(); },

    salvar: function(pauta) {
      modifyJSON(_PAUTA_FILE, function(lista) {
        var idx = lista.findIndex(function(p) { return p.id === pauta.id; });
        if (idx === -1) lista.push(pauta);
        else            lista[idx] = pauta;
        return lista;
      });
    },

    obterPorId: function(id) {
      return _todos().find(function(p) { return p.id === id; }) || null;
    },

    obterPorProtocolo: function(protocolo) {
      return _todos().find(function(p) { return p.protocolo === protocolo; }) || null;
    },

    listarComFiltros: function(filtros) {
      var lista = _todos();
      filtros = filtros || {};

      if (filtros.status) {
        var statuses = Array.isArray(filtros.status) ? filtros.status : [filtros.status];
        lista = lista.filter(function(p) { return statuses.indexOf(p.status) !== -1; });
      }
      if (filtros.emailSolicitante) {
        lista = lista.filter(function(p) {
          return (p.solicitante && p.solicitante.email === filtros.emailSolicitante);
        });
      }
      if (filtros.dataInicio) {
        var ini = new Date(filtros.dataInicio).getTime();
        lista = lista.filter(function(p) { return new Date(p.criadoEm || 0).getTime() >= ini; });
      }
      if (filtros.dataFim) {
        var fim = new Date(filtros.dataFim).getTime() + 86400000;
        lista = lista.filter(function(p) { return new Date(p.criadoEm || 0).getTime() <= fim; });
      }
      if (filtros.busca) {
        var q = filtros.busca.toLowerCase();
        lista = lista.filter(function(p) {
          return (p.protocolo || '').toLowerCase().indexOf(q) !== -1 ||
                 (p.solicitante && (p.solicitante.nome || '').toLowerCase().indexOf(q) !== -1) ||
                 (p.proposta && (p.proposta.titulo || '').toLowerCase().indexOf(q) !== -1);
        });
      }

      return lista.sort(function(a, b) {
        return new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0);
      });
    },

    listarAbertos: function() {
      var terminais = ['indeferida', 'cancelada', 'concluida'];
      return _todos().filter(function(p) { return terminais.indexOf(p.status) === -1; });
    },

    contarPorStatus: function() {
      var lista = _todos();
      var counts = {};
      lista.forEach(function(p) { counts[p.status] = (counts[p.status] || 0) + 1; });
      return counts;
    },

    obterDashboard: function() {
      var lista = _todos();
      var agora = Date.now();
      var ultimosMeses = new Date(agora - 90 * 86400000).getTime();

      var recentes = lista.filter(function(p) {
        return new Date(p.criadoEm || 0).getTime() >= ultimosMeses;
      });

      var porStatus = {};
      lista.forEach(function(p) { porStatus[p.status] = (porStatus[p.status] || 0) + 1; });

      var abertas = lista.filter(function(p) {
        return ['indeferida', 'cancelada', 'concluida'].indexOf(p.status) === -1;
      });

      var tempoMedioResposta = 0;
      var comResposta = lista.filter(function(p) {
        return p.primeiraRespostaEm && p.criadoEm;
      });
      if (comResposta.length) {
        var totalMs = comResposta.reduce(function(acc, p) {
          return acc + (new Date(p.primeiraRespostaEm) - new Date(p.criadoEm));
        }, 0);
        tempoMedioResposta = Math.round(totalMs / comResposta.length / 86400000);
      }

      return {
        total:              lista.length,
        abertas:            abertas.length,
        recentes90dias:     recentes.length,
        porStatus:          porStatus,
        tempoMedioResposta: tempoMedioResposta
      };
    }

  };
})();
