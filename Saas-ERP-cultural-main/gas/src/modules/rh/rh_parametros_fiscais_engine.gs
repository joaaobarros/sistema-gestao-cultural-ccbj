/**
 * @file modules/rh/rh_parametros_fiscais_engine.gs
 * @layer modules/rh
 * @description Engine de parâmetros fiscais trabalhistas com atualização anual automática.
 *
 * Mantém tabelas oficiais INSS, IRRF, FGTS, encargos patronais e verbas rescisórias.
 * Tabelas internas por ano são a fonte oficial de cada exercício fiscal.
 * Edições manuais são auditadas e têm precedência sobre os valores oficiais.
 *
 * Persistência: rh_parametros_fiscais.json
 * Estrutura do arquivo:
 *   { anoVigente, atualizadoEm, atualizadoPor, fonte,
 *     inss: { tabelaProgressiva, teto },
 *     irrf: { tabela, deducaoDependente, isento },
 *     fgts: { aliquota },
 *     encargos: { patronalSemFGTS, patronalComFGTS },
 *     rescisao: { multaSemJusta, multaAcordo },
 *     avisoPrevio: { diasBase, diasPorAno, maxDias },
 *     historico: [{ dataEvento, email, tipo, descricao, snapshot }] }
 *
 * @depends core/data_layer.gs (readJSON, writeJSON)
 */

var ParametrosFiscaisRH = (function () {

  var _ARQUIVO = 'rh_parametros_fiscais.json';

  // ── Tabelas oficiais internas ──────────────────────────────────────────────
  // Fonte: Portaria MPS/MF — atualizar ao publicar cada portaria anual.

  var _TABELAS_OFICIAIS = {

    2025: {
      fonte: 'Portaria MPS/MF nº 1, de 10/01/2025',
      inss: {
        tabelaProgressiva: [
          { ate: 1412.00,  aliq: 0.075 },
          { ate: 2666.68,  aliq: 0.09  },
          { ate: 4000.03,  aliq: 0.12  },
          { ate: 7786.02,  aliq: 0.14  }
        ],
        teto: 908.86
      },
      irrf: {
        // Lei 14.663/2023 — vigente a partir de 05/2023, mesma tabela para 2024/2025
        tabela: [
          { de: 0,        ate: 2259.20,  aliq: 0,    deducao: 0       },
          { de: 2259.21,  ate: 2826.65,  aliq: 0.075, deducao: 169.44  },
          { de: 2826.66,  ate: 3751.05,  aliq: 0.15,  deducao: 381.44  },
          { de: 3751.06,  ate: 4664.68,  aliq: 0.225, deducao: 662.77  },
          { de: 4664.69,  ate: 999999,   aliq: 0.275, deducao: 896.00  }
        ],
        deducaoDependente: 189.59,
        isento: 2259.20
      },
      fgts: { aliquota: 0.08 },
      encargos: {
        patronalSemFGTS: 0.2768,  // INSS(20%) + RAT(2%) + Terceiros(5.8%) + outros
        patronalComFGTS: 0.3568   // = sem FGTS + 8% FGTS
      },
      rescisao: {
        multaSemJusta: 0.40,
        multaAcordo:   0.20
      },
      avisoPrevio: {
        diasBase:   30,
        diasPorAno: 3,
        maxDias:    90
      }
    },

    2024: {
      fonte: 'Portaria MPS/MF nº 2, de 11/01/2024',
      inss: {
        tabelaProgressiva: [
          { ate: 1320.00,  aliq: 0.075 },
          { ate: 2571.29,  aliq: 0.09  },
          { ate: 3856.94,  aliq: 0.12  },
          { ate: 7507.49,  aliq: 0.14  }
        ],
        teto: 877.24
      },
      irrf: {
        tabela: [
          { de: 0,        ate: 2259.20,  aliq: 0,    deducao: 0       },
          { de: 2259.21,  ate: 2826.65,  aliq: 0.075, deducao: 169.44  },
          { de: 2826.66,  ate: 3751.05,  aliq: 0.15,  deducao: 381.44  },
          { de: 3751.06,  ate: 4664.68,  aliq: 0.225, deducao: 662.77  },
          { de: 4664.69,  ate: 999999,   aliq: 0.275, deducao: 896.00  }
        ],
        deducaoDependente: 189.59,
        isento: 2259.20
      },
      fgts: { aliquota: 0.08 },
      encargos: {
        patronalSemFGTS: 0.2768,
        patronalComFGTS: 0.3568
      },
      rescisao: {
        multaSemJusta: 0.40,
        multaAcordo:   0.20
      },
      avisoPrevio: {
        diasBase:   30,
        diasPorAno: 3,
        maxDias:    90
      }
    }

  };

  var _ANO_PADRAO = 2025;

  // ── Helpers internos ──────────────────────────────────────────────────────

  function _tabelaDefault(ano) {
    var t = _TABELAS_OFICIAIS[ano] || _TABELAS_OFICIAIS[_ANO_PADRAO];
    return JSON.parse(JSON.stringify(t)); // deep clone
  }

  function _lerArquivo() {
    return readJSON(_ARQUIVO) || null;
  }

  function _salvarArquivo(dados) {
    writeJSON(_ARQUIVO, dados);
  }

  function _registrarHistorico(dados, tipo, descricao, email) {
    if (!dados.historico) dados.historico = [];
    dados.historico.unshift({
      dataEvento: new Date().toISOString(),
      email:      email || 'sistema',
      tipo:       tipo,
      descricao:  descricao,
      snapshot: {
        anoVigente: dados.anoVigente,
        inss:       JSON.parse(JSON.stringify(dados.inss)),
        irrf:       JSON.parse(JSON.stringify(dados.irrf)),
        fgts:       JSON.parse(JSON.stringify(dados.fgts)),
        encargos:   JSON.parse(JSON.stringify(dados.encargos)),
        rescisao:   JSON.parse(JSON.stringify(dados.rescisao)),
        avisoPrevio: JSON.parse(JSON.stringify(dados.avisoPrevio))
      }
    });
    // Mantém últimas 100 entradas
    if (dados.historico.length > 100) dados.historico = dados.historico.slice(0, 100);
  }

  // ── API pública ───────────────────────────────────────────────────────────

  /**
   * Retorna parâmetros fiscais vigentes.
   * Se o arquivo não existir, inicializa com a tabela oficial do ano-padrão.
   */
  function obter() {
    var dados = _lerArquivo();
    if (!dados || !dados.inss) {
      dados = _inicializar();
    }
    return dados;
  }

  /**
   * Inicializa o arquivo com a tabela oficial do ano mais recente disponível.
   * Chamado automaticamente por obter() quando o arquivo não existe.
   */
  function _inicializar() {
    var t = _tabelaDefault(_ANO_PADRAO);
    var dados = {
      anoVigente:    _ANO_PADRAO,
      atualizadoEm:  new Date().toISOString(),
      atualizadoPor: 'sistema',
      fonte:         t.fonte,
      inss:          t.inss,
      irrf:          t.irrf,
      fgts:          t.fgts,
      encargos:      t.encargos,
      rescisao:      t.rescisao,
      avisoPrevio:   t.avisoPrevio,
      historico:     [{
        dataEvento: new Date().toISOString(),
        email:      'sistema',
        tipo:       'inicializacao',
        descricao:  'Parâmetros inicializados com tabela oficial ' + _ANO_PADRAO,
        snapshot:   null
      }]
    };
    _salvarArquivo(dados);
    return dados;
  }

  /**
   * Aplica a tabela oficial de um ano específico ao arquivo.
   * Preserva o historico existente.
   * @param {number} ano - Ex: 2025
   * @param {string} email
   */
  function aplicarTabelaOficial(ano, email) {
    if (!_TABELAS_OFICIAIS[ano]) {
      throw new Error('Tabela oficial para o ano ' + ano + ' não disponível.');
    }
    var dados = obter();
    _registrarHistorico(dados, 'tabelaOficial', 'Tabela oficial ' + ano + ' aplicada por ' + email, email);
    var t = _tabelaDefault(ano);
    dados.anoVigente    = ano;
    dados.atualizadoEm  = new Date().toISOString();
    dados.atualizadoPor = email || 'sistema';
    dados.fonte         = t.fonte;
    dados.inss          = t.inss;
    dados.irrf          = t.irrf;
    dados.fgts          = t.fgts;
    dados.encargos      = t.encargos;
    dados.rescisao      = t.rescisao;
    dados.avisoPrevio   = t.avisoPrevio;
    _salvarArquivo(dados);
    return dados;
  }

  /**
   * Salva edições manuais nos parâmetros fiscais.
   * Aceita apenas campos reconhecidos; ignora extras.
   * @param {Object} campos - Campos a alterar. Estrutura espelha o arquivo raiz.
   * @param {string} email
   */
  function salvar(campos, email) {
    var dados = obter();
    var alterados = [];

    // inss.teto
    if (campos.inss) {
      if (campos.inss.tabelaProgressiva !== undefined) {
        dados.inss.tabelaProgressiva = campos.inss.tabelaProgressiva;
        alterados.push('inss.tabelaProgressiva');
      }
      if (campos.inss.teto !== undefined) {
        dados.inss.teto = parseFloat(campos.inss.teto) || dados.inss.teto;
        alterados.push('inss.teto');
      }
    }
    // irrf
    if (campos.irrf) {
      if (campos.irrf.tabela !== undefined) {
        dados.irrf.tabela = campos.irrf.tabela;
        alterados.push('irrf.tabela');
      }
      if (campos.irrf.deducaoDependente !== undefined) {
        dados.irrf.deducaoDependente = parseFloat(campos.irrf.deducaoDependente) || dados.irrf.deducaoDependente;
        alterados.push('irrf.deducaoDependente');
      }
      if (campos.irrf.isento !== undefined) {
        dados.irrf.isento = parseFloat(campos.irrf.isento) || dados.irrf.isento;
        alterados.push('irrf.isento');
      }
    }
    // fgts
    if (campos.fgts) {
      if (campos.fgts.aliquota !== undefined) {
        dados.fgts.aliquota = parseFloat(campos.fgts.aliquota) || dados.fgts.aliquota;
        alterados.push('fgts.aliquota');
      }
    }
    // encargos
    if (campos.encargos) {
      if (campos.encargos.patronalSemFGTS !== undefined) {
        dados.encargos.patronalSemFGTS = parseFloat(campos.encargos.patronalSemFGTS) || dados.encargos.patronalSemFGTS;
        alterados.push('encargos.patronalSemFGTS');
      }
      if (campos.encargos.patronalComFGTS !== undefined) {
        dados.encargos.patronalComFGTS = parseFloat(campos.encargos.patronalComFGTS) || dados.encargos.patronalComFGTS;
        alterados.push('encargos.patronalComFGTS');
      }
    }
    // rescisao
    if (campos.rescisao) {
      if (campos.rescisao.multaSemJusta !== undefined) {
        dados.rescisao.multaSemJusta = parseFloat(campos.rescisao.multaSemJusta) || dados.rescisao.multaSemJusta;
        alterados.push('rescisao.multaSemJusta');
      }
      if (campos.rescisao.multaAcordo !== undefined) {
        dados.rescisao.multaAcordo = parseFloat(campos.rescisao.multaAcordo) || dados.rescisao.multaAcordo;
        alterados.push('rescisao.multaAcordo');
      }
    }
    // avisoPrevio
    if (campos.avisoPrevio) {
      if (campos.avisoPrevio.diasBase !== undefined) {
        dados.avisoPrevio.diasBase = parseInt(campos.avisoPrevio.diasBase) || dados.avisoPrevio.diasBase;
        alterados.push('avisoPrevio.diasBase');
      }
      if (campos.avisoPrevio.diasPorAno !== undefined) {
        dados.avisoPrevio.diasPorAno = parseInt(campos.avisoPrevio.diasPorAno) || dados.avisoPrevio.diasPorAno;
        alterados.push('avisoPrevio.diasPorAno');
      }
      if (campos.avisoPrevio.maxDias !== undefined) {
        dados.avisoPrevio.maxDias = parseInt(campos.avisoPrevio.maxDias) || dados.avisoPrevio.maxDias;
        alterados.push('avisoPrevio.maxDias');
      }
    }

    if (alterados.length === 0) return dados;

    _registrarHistorico(
      dados,
      'edicaoManual',
      'Edição manual por ' + email + ': ' + alterados.join(', '),
      email
    );
    dados.atualizadoEm  = new Date().toISOString();
    dados.atualizadoPor = email || 'sistema';
    dados.fonte         = 'Edição manual';
    _salvarArquivo(dados);
    return dados;
  }

  /**
   * Retorna lista dos anos com tabelas oficiais embutidas.
   */
  function listarAnosOficiais() {
    return Object.keys(_TABELAS_OFICIAIS)
      .map(function (a) {
        return { ano: parseInt(a), fonte: _TABELAS_OFICIAIS[a].fonte };
      })
      .sort(function (a, b) { return b.ano - a.ano; });
  }

  /**
   * Retorna apenas o historico de alterações.
   */
  function obterHistorico() {
    var dados = _lerArquivo();
    return dados ? (dados.historico || []) : [];
  }

  // ── Utilitários de cálculo (usados pelos outros engines) ──────────────────

  /**
   * Calcula INSS progressivo com a tabela vigente.
   * @param {number} bruto
   * @returns {number} desconto INSS
   */
  function calcularINSS(bruto) {
    var p = obter();
    var faixas = p.inss.tabelaProgressiva;
    var teto   = p.inss.teto;
    var inss   = 0;
    var prev   = 0;
    for (var i = 0; i < faixas.length; i++) {
      var f = faixas[i];
      if (bruto <= prev) break;
      var tributavel = Math.min(bruto, f.ate) - prev;
      inss += tributavel * f.aliq;
      prev  = f.ate;
      if (bruto <= f.ate) break;
    }
    return Math.min(Math.round(inss * 100) / 100, teto);
  }

  /**
   * Calcula IRRF com base na tabela vigente.
   * @param {number} baseCalculo - salário bruto − INSS − (nDependentes × deducaoDependente)
   * @returns {number} desconto IRRF
   */
  function calcularIRRF(baseCalculo) {
    var p      = obter();
    var tabela = p.irrf.tabela;
    if (baseCalculo <= p.irrf.isento) return 0;
    for (var i = 0; i < tabela.length; i++) {
      var f = tabela[i];
      if (baseCalculo >= f.de && baseCalculo <= f.ate) {
        var imposto = baseCalculo * f.aliq - f.deducao;
        return Math.max(0, Math.round(imposto * 100) / 100);
      }
    }
    return 0;
  }

  return {
    obter:                obter,
    salvar:               salvar,
    aplicarTabelaOficial: aplicarTabelaOficial,
    listarAnosOficiais:   listarAnosOficiais,
    obterHistorico:       obterHistorico,
    calcularINSS:         calcularINSS,
    calcularIRRF:         calcularIRRF
  };

})();
