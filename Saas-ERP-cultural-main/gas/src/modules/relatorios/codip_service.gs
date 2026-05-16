/**
 * @file modules/relatorios/codip_service.gs
 * @layer modules/relatorios
 * @description Serviço de relatórios CODIP (Coordenadoria de Informação e Pesquisa).
 *
 * Gerencia a aba 'RelatoriosCODIP': gravação de campos por reserva,
 * métricas agregadas e listagem completa enriquecida com dados de reservas
 * e contratos.
 *
 * @depends core/utils.gs (_getSheet),
 *          mod_relatorios.gs (obterReservas, obterContratos, obterMetas, obterIndicadores
 *                             — globais do domínio contratos/reservas)
 */

var CodipService = (function () {

  function _montarLinha(idReserva, dados) {
    return [
      idReserva,
      dados.codipPrograma         || '',
      dados.codipMesRef           || '',
      dados.codipTipoAcao         || '',
      dados.codipEixo             || '',
      dados.codipSegmento1        || '',
      dados.codipSegmento2        || '',
      dados.codipLinguagem1       || '',
      dados.codipLinguagem2       || '',
      dados.codipModalidade       || '',
      dados.codipRecursos         || '',
      dados.codipRede             || 'NÃO',
      dados.codipAcessibilidade   || '',
      Number(dados.codipPubPresencial  || 0),
      Number(dados.codipPubVirtual     || 0),
      Number(dados.codipVisualizacoes  || 0),
      Number(dados.codipPCD            || 0),
      Number(dados.codipIdosos         || 0),
      Number(dados.codipProfExternos   || 0),
      Number(dados.codipVoluntarios    || 0),
      dados.codipVulnerabilidade  || '',
      dados.codipPubEspecifico    || '',
      Number(dados.codipHorasAntes || 0),
      Number(dados.codipHorasMes   || 0),
      Number(dados.codipHorasTotal || 0),
      dados.codipProdutos         || '',
      dados.codipDisponibilidade  || '',
      dados.codipAvalSatisfacao   || '',
      dados.codipDesafios         || '',
      dados.codipObservacoes      || '',
      dados.codipLinkEvidencias   || '',
      dados.codipLinkRelatorio    || '',
      dados.codipDescricaoAcao    || '',
      new Date()
    ];
  }

  function salvarCampos(idReserva, dados) {
    try {
      var sheet = _getSheet('RelatoriosCODIP');
      if (!sheet) throw new Error('Aba RelatoriosCODIP não encontrada');

      if (sheet.getLastRow() > 1) {
        var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
        for (var i = 0; i < ids.length; i++) {
          if (String(ids[i][0]).trim() === String(idReserva).trim()) {
            sheet.getRange(i + 2, 1, 1, 34).setValues([_montarLinha(idReserva, dados)]);
            return true;
          }
        }
      }

      sheet.appendRow(_montarLinha(idReserva, dados));
      return true;
    } catch (e) {
      console.warn('[CodipService.salvarCampos] ' + e.message);
      return false;
    }
  }

  function obterMetricas() {
    try {
      var sheet = _getSheet('RelatoriosCODIP');
      if (!sheet || sheet.getLastRow() < 2)
        return { totalEstimado: 0, totalReal: 0, totalRegistros: 0, taxaPresenca: 0 };

      var dados = sheet.getRange(2, 1, sheet.getLastRow() - 1, 15).getValues();
      var totalPresencial = 0, totalVirtual = 0, count = 0;
      dados.forEach(function(r) {
        if (!r[0]) return;
        count++;
        totalPresencial += Number(r[13]) || 0;
        totalVirtual    += Number(r[14]) || 0;
      });
      var totalReal = totalPresencial + totalVirtual;
      var taxa = totalReal > 0 ? Math.round((totalPresencial / totalReal) * 100) : 0;
      return {
        totalEstimado:  totalPresencial,
        totalReal:      totalReal,
        totalRegistros: count,
        taxaPresenca:   taxa
      };
    } catch (e) {
      console.warn('[CodipService.obterMetricas] ' + e.message);
      return { totalEstimado: 0, totalReal: 0, totalRegistros: 0, taxaPresenca: 0 };
    }
  }

  function obterRelatorios() {
    try {
      var sheet = _getSheet('RelatoriosCODIP');
      if (!sheet || sheet.getLastRow() < 2) return [];

      var dados = sheet.getRange(2, 1, sheet.getLastRow() - 1, 34).getValues();
      var reservas = obterReservas();
      var mapaReservas = {};
      reservas.forEach(function(r) { mapaReservas[String(r[0]).trim()] = r; });

      var contratos   = obterContratos();
      var metas       = obterMetas();
      var indicadores = obterIndicadores();
      var mapaCtrs = {}, mapaMetas = {}, mapaInds = {};
      contratos.forEach(function(c)   { mapaCtrs[c.id]  = c; });
      metas.forEach(function(m)       { mapaMetas[m.id] = m; });
      indicadores.forEach(function(i) { mapaInds[i.id]  = i; });

      return dados
        .filter(function(r) { return r[0]; })
        .map(function(r) {
          var reserva = mapaReservas[String(r[0]).trim()] || [];
          var ctr = mapaCtrs[String(r[33] || '')]  || {};
          var met = mapaMetas[String(r[34] || '')] || {};
          var ind = mapaInds[String(r[35] || '')]  || {};
          return {
            idReserva:     r[0],
            nomeAcao:      reserva[6]  || r[0],
            setor:         reserva[9]  || '',
            responsavel:   reserva[8]  || '',
            programa:      r[1],  mesRef:     r[2],  tipoAcao:   r[3],
            eixo:          r[4],  segmento1:  r[5],  segmento2:  r[6],
            linguagem1:    r[7],  linguagem2: r[8],  modalidade: r[9],
            recursos:      r[10], rede:       r[11], acessibilidade: r[12],
            pubPresencial: Number(r[13]) || 0,
            pubVirtual:    Number(r[14]) || 0,
            visualizacoes: Number(r[15]) || 0,
            pcd:           Number(r[16]) || 0,
            idosos:        Number(r[17]) || 0,
            profExternos:  Number(r[18]) || 0,
            voluntarios:   Number(r[19]) || 0,
            vulnerabilidade: r[20], pubEspecifico: r[21],
            horasAntes:    Number(r[22]) || 0,
            horasMes:      Number(r[23]) || 0,
            horasTotal:    Number(r[24]) || 0,
            produtos:      r[25], disponibilidade: r[26],
            avalSatisfacao: r[27], desafios: r[28], observacoes: r[29],
            linkEvidencias: r[30], linkRelatorio: r[31], descricaoAcao: r[32],
            idContrato:    r[33] || '', idMeta: r[34] || '', idIndicador: r[35] || '',
            nomeContrato:  ctr.nome  || '',
            nomeMeta:      met.titulo || '',
            nomeIndicador: ind.nome  || ind.texto || ''
          };
        });
    } catch (e) {
      console.warn('[CodipService.obterRelatorios] ' + e.message);
      return [];
    }
  }

  return {
    salvarCampos:   salvarCampos,
    obterMetricas:  obterMetricas,
    obterRelatorios: obterRelatorios
  };

})();
