/**
 * @file core/services/data_gateway.gs
 * @layer core/services
 * @description Gateway oficial de persistência — camada única de acesso a dados.
 *
 * Centraliza o acesso às planilhas do sistema através de um padrão uniforme
 * de repositório genérico. Proíbe chamadas diretas a SpreadsheetApp e
 * getRange() espalhadas em regras de negócio.
 *
 * REGRA ARQUITETURAL:
 *   - Código de negócio NÃO acessa SpreadsheetApp diretamente
 *   - Código de negócio usa DataGateway.obterTabela(nomeAba) para leitura
 *   - Código de negócio usa DataGateway.salvar(nomeAba, linha) para escrita
 *   - Novos repositórios específicos (ReservaRepository, etc.) usam este gateway
 *
 * NOTA: Esta é a camada gradual. As funções _getSheet (utils.gs) e
 * SpreadsheetApp ainda existem para código legado — DataGateway é a
 * convenção para código novo.
 *
 * USO:
 *   var dados = DataGateway.obterTodos('Reservas');      // → Array<Array>
 *   var linha  = DataGateway.buscarPorColuna('Reservas', 0, 'RES001');
 *   DataGateway.salvarLinha('Reservas', dadosArray);
 *   DataGateway.atualizarLinhaPorColuna('Reservas', 0, 'RES001', novosDados);
 *
 * @depends _getSheet (core/utils.gs)
 */

var DataGateway = (function () {

  function _aba(nomeAba) {
    if (typeof _getSheet !== 'function') {
      throw new Error('[DataGateway] _getSheet não disponível. Certifique-se de que utils.gs foi carregado.');
    }
    var aba = _getSheet(nomeAba);
    if (!aba) throw new Error('[DataGateway] Aba "' + nomeAba + '" não encontrada. Execute recriarEstrutura().');
    return aba;
  }

  // ── Leitura ───────────────────────────────────────────────

  /**
   * Retorna todos os dados da aba (excluindo cabeçalho).
   * @returns {Array<Array>} linhas sem cabeçalho
   */
  function obterTodos(nomeAba) {
    try {
      var aba = _aba(nomeAba);
      if (aba.getLastRow() < 2) return [];
      return aba.getRange(2, 1, aba.getLastRow() - 1, aba.getLastColumn()).getValues();
    } catch(e) {
      Logger.error('data_gateway', 'obterTodos("' + nomeAba + '")', e.message);
      return [];
    }
  }

  /**
   * Busca a primeira linha onde a coluna `indiceColuna` é igual a `valor`.
   * @param {string} nomeAba
   * @param {number} indiceColuna - 0-based
   * @param {*} valor
   * @returns {Array|null}
   */
  function buscarPorColuna(nomeAba, indiceColuna, valor) {
    try {
      var linhas = obterTodos(nomeAba);
      for (var i = 0; i < linhas.length; i++) {
        if (String(linhas[i][indiceColuna] || '') === String(valor)) return linhas[i];
      }
      return null;
    } catch(e) {
      Logger.error('data_gateway', 'buscarPorColuna("' + nomeAba + '")', e.message);
      return null;
    }
  }

  /**
   * Busca todas as linhas onde a coluna `indiceColuna` é igual a `valor`.
   * @returns {Array<Array>}
   */
  function filtrarPorColuna(nomeAba, indiceColuna, valor) {
    try {
      return obterTodos(nomeAba).filter(function(linha) {
        return String(linha[indiceColuna] || '') === String(valor);
      });
    } catch(e) {
      Logger.error('data_gateway', 'filtrarPorColuna("' + nomeAba + '")', e.message);
      return [];
    }
  }

  // ── Escrita ───────────────────────────────────────────────

  /**
   * Adiciona uma nova linha ao final da aba.
   * @param {string} nomeAba
   * @param {Array} dadosLinha
   */
  function salvarLinha(nomeAba, dadosLinha) {
    try {
      var aba = _aba(nomeAba);
      aba.appendRow(dadosLinha);
    } catch(e) {
      Logger.error('data_gateway', 'salvarLinha("' + nomeAba + '")', e.message);
      throw e;
    }
  }

  /**
   * Salva múltiplas linhas de uma vez (batch write).
   * @param {string} nomeAba
   * @param {Array<Array>} linhas
   */
  function salvarLinhas(nomeAba, linhas) {
    if (!linhas || linhas.length === 0) return;
    try {
      var aba = _aba(nomeAba);
      aba.getRange(aba.getLastRow() + 1, 1, linhas.length, linhas[0].length)
         .setValues(linhas);
    } catch(e) {
      Logger.error('data_gateway', 'salvarLinhas("' + nomeAba + '")', e.message);
      throw e;
    }
  }

  /**
   * Atualiza a primeira linha onde a coluna `indiceColuna` é igual a `valorChave`.
   * @param {string} nomeAba
   * @param {number} indiceColuna - 0-based
   * @param {*} valorChave
   * @param {Array} novosDados - array completo de colunas
   * @returns {boolean} true se atualizado
   */
  function atualizarLinhaPorColuna(nomeAba, indiceColuna, valorChave, novosDados) {
    try {
      var aba = _aba(nomeAba);
      var dados = aba.getDataRange().getValues();
      for (var i = 1; i < dados.length; i++) {
        if (String(dados[i][indiceColuna] || '') === String(valorChave)) {
          aba.getRange(i + 1, 1, 1, novosDados.length).setValues([novosDados]);
          return true;
        }
      }
      return false;
    } catch(e) {
      Logger.error('data_gateway', 'atualizarLinhaPorColuna("' + nomeAba + '")', e.message);
      throw e;
    }
  }

  /**
   * Remove a primeira linha onde a coluna `indiceColuna` é igual a `valorChave`.
   * @returns {boolean} true se removido
   */
  function removerLinhaPorColuna(nomeAba, indiceColuna, valorChave) {
    try {
      var aba = _aba(nomeAba);
      var dados = aba.getDataRange().getValues();
      for (var i = 1; i < dados.length; i++) {
        if (String(dados[i][indiceColuna] || '') === String(valorChave)) {
          aba.deleteRow(i + 1);
          return true;
        }
      }
      return false;
    } catch(e) {
      Logger.error('data_gateway', 'removerLinhaPorColuna("' + nomeAba + '")', e.message);
      return false;
    }
  }

  // ── API pública ───────────────────────────────────────────

  return {
    obterTodos:               obterTodos,
    buscarPorColuna:          buscarPorColuna,
    filtrarPorColuna:         filtrarPorColuna,
    salvarLinha:              salvarLinha,
    salvarLinhas:             salvarLinhas,
    atualizarLinhaPorColuna:  atualizarLinhaPorColuna,
    removerLinhaPorColuna:    removerLinhaPorColuna
  };

})();
