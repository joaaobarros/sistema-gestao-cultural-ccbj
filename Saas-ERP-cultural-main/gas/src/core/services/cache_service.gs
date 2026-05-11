/**
 * @file core/services/cache_service.gs
 * @layer core/services
 * @description Façade oficial para operações de cache no sistema.
 *
 * Centraliza o uso de CacheService.getScriptCache() com TTL padronizado,
 * serialização JSON automática e tratamento de erros consistente.
 *
 * ATENÇÃO: Este objeto é nomeado AppCache (não CacheService) para não
 * colidir com o global nativo CacheService do GAS.
 *
 * USO:
 *   AppCache.set('chave', valor, 600);     // TTL em segundos (padrão: 600)
 *   var v = AppCache.get('chave');         // retorna objeto ou null
 *   AppCache.remove('chave');
 *   AppCache.setPrefix('modulo:', dados, 3600);  // namespaced
 *
 * @depends CacheService (GAS nativo)
 */

var AppCache = (function () {

  var TTL_PADRAO = 600; // 10 minutos

  function _cache() {
    return CacheService.getScriptCache();
  }

  function set(chave, valor, ttl) {
    try {
      var texto = typeof valor === 'string' ? valor : JSON.stringify(valor);
      _cache().put(chave, texto, ttl || TTL_PADRAO);
    } catch(e) {
      console.warn('[AppCache.set] ' + chave + ': ' + e.message);
    }
  }

  function get(chave) {
    try {
      var texto = _cache().get(chave);
      if (texto === null) return null;
      try { return JSON.parse(texto); } catch(_) { return texto; }
    } catch(e) {
      console.warn('[AppCache.get] ' + chave + ': ' + e.message);
      return null;
    }
  }

  function remove(chave) {
    try { _cache().remove(chave); } catch(e) {}
  }

  function removeAll(chaves) {
    try {
      if (Array.isArray(chaves)) _cache().removeAll(chaves);
    } catch(e) {}
  }

  // Atalho para chaves com prefixo de módulo
  function setPrefix(prefixo, sufixo, valor, ttl) {
    set(prefixo + sufixo, valor, ttl);
  }

  function getPrefix(prefixo, sufixo) {
    return get(prefixo + sufixo);
  }

  function removePrefix(prefixo, sufixo) {
    remove(prefixo + sufixo);
  }

  return {
    set:         set,
    get:         get,
    remove:      remove,
    removeAll:   removeAll,
    setPrefix:   setPrefix,
    getPrefix:   getPrefix,
    removePrefix: removePrefix,
    TTL_PADRAO:  TTL_PADRAO
  };

})();
