/**
 * @file config.gs
 * @layer backend/core
 * @description Configuração institucional centralizada.
 *              Lê de PropertiesService.getScriptProperties() com defaults.
 *              Preparação SaaS: cada deployment configura suas propriedades sem
 *              alterar código-fonte.
 *
 * PROPRIEDADES CONFIGURÁVEIS (via PropertiesService.getScriptProperties().setProperty()):
 *   ORG_NOME            — nome curto da organização        (default: "CCBJ")
 *   ORG_NOME_COMPLETO   — nome completo                    (default: "Centro Cultural Bom Jardim")
 *   ORG_SISTEMA_TITULO  — título do webapp                 (default: "Sistema CCBJ")
 *   ORG_DATA_FOLDER     — nome da pasta Drive de dados     (default: "CCBJ_DATA")
 *   ORG_LOGO_URL        — URL do logotipo para emails
 *   ORG_DOMINIO         — domínio de email autorizado      (default: "")
 *   ORG_TIMEZONE        — timezone da organização          (default: "America/Fortaleza")
 *
 * USO:
 *   const cfg = getOrgConfig();
 *   cfg.nome           // "CCBJ"
 *   cfg.nomeCompleto   // "Centro Cultural Bom Jardim"
 *   cfg.titulo         // "Sistema CCBJ"
 *   cfg.dataFolder     // "CCBJ_DATA"
 *   cfg.logoUrl        // url do logo
 *   cfg.dominio        // domínio de email
 *   cfg.timezone       // timezone
 */

var _orgConfigCache = null;

function getOrgConfig() {
  if (_orgConfigCache) return _orgConfigCache;

  var props = PropertiesService.getScriptProperties();

  _orgConfigCache = {
    nome:        props.getProperty('ORG_NOME')           || 'CCBJ',
    nomeCompleto:props.getProperty('ORG_NOME_COMPLETO')  || 'Centro Cultural Bom Jardim',
    titulo:      props.getProperty('ORG_SISTEMA_TITULO') || 'Sistema CCBJ',
    dataFolder:  props.getProperty('ORG_DATA_FOLDER')    || 'CCBJ_DATA',
    logoUrl:     props.getProperty('ORG_LOGO_URL')       || '',
    dominio:     props.getProperty('ORG_DOMINIO')        || '',
    timezone:    props.getProperty('ORG_TIMEZONE')       || 'America/Fortaleza'
  };

  return _orgConfigCache;
}

/**
 * Invalida o cache (necessário após alterar PropertiesService em runtime).
 */
function invalidarCacheOrgConfig() {
  _orgConfigCache = null;
}
