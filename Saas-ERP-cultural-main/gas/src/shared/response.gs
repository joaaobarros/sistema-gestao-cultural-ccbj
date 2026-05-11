/**
 * @file shared/response.gs
 * @layer shared
 * @description Contrato canônico de resposta para toda camada de controllers.
 *
 * REGRA ARQUITETURAL:
 *   - Toda função exposta via google.script.run DEVE retornar GasResponse.ok() ou GasResponse.error().
 *   - Elimina: booleano solto, string arbitrária, null silencioso, throw imprevisível.
 *   - O bridge usa _callCtrl() para desembrulhar automaticamente antes de chegar ao frontend.
 *
 * Estrutura canônica:
 *   { ok: true,  data: <resultado>,                       metadata: { timestamp, origem } }
 *   { ok: false, error: { message, code, details: null }, metadata: { timestamp, origem } }
 *
 * @depends core/logger.gs
 */

var GasResponse = (function () {

  function _meta(origem) {
    return {
      timestamp: new Date().toISOString(),
      origem:    origem || 'sistema'
    };
  }

  /**
   * Resposta de sucesso padronizada.
   * @param {*}      data    — resultado da operação (qualquer tipo serializável)
   * @param {string} [origem] — módulo/função de origem para rastreabilidade
   * @returns {{ ok: true, data: *, metadata: Object }}
   */
  function ok(data, origem) {
    return {
      ok:       true,
      data:     data !== undefined ? data : null,
      metadata: _meta(origem)
    };
  }

  /**
   * Resposta de erro padronizada.
   * @param {string} message  — mensagem legível pelo frontend
   * @param {string} [code]   — código semântico: 'CONFLITO', 'PERMISSAO', 'NAO_ENCONTRADO', 'VALIDACAO', 'ERRO_INTERNO'
   * @param {*}      [details] — dados extras para diagnóstico (não exibir diretamente ao usuário)
   * @param {string} [origem]
   * @returns {{ ok: false, error: Object, metadata: Object }}
   */
  function error(message, code, details, origem) {
    return {
      ok:    false,
      error: {
        message: message || 'Erro desconhecido',
        code:    code    || 'ERRO_INTERNO',
        details: details || null
      },
      metadata: _meta(origem)
    };
  }

  /**
   * Executa fn() e converte automaticamente em GasResponse.
   * Qualquer throw vira GasResponse.error(). Retorno vira GasResponse.ok(retorno).
   *
   * Uso:
   *   function ctrl_reservas_listar() {
   *     return GasResponse.wrap(function() { return obterReservas(); }, 'ctrl_reservas_listar');
   *   }
   *
   * @param {Function} fn     — função a executar
   * @param {string}   origem — identificador para logs e metadata
   */
  function wrap(fn, origem) {
    try {
      var resultado = fn();
      return ok(resultado, origem);
    } catch (e) {
      if (typeof Logger !== 'undefined' && Logger.error) {
        Logger.error(origem || 'gas_response', 'wrap', e.message);
      }
      return error(e.message, 'ERRO_INTERNO', null, origem);
    }
  }

  return { ok: ok, error: error, wrap: wrap };

})();
