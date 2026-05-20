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

/**
 * @description Configurações operacionais do sistema (horários, turnos, etc.)
 *
 * PROPRIEDADES CONFIGURÁVEIS:
 *   RESERVA_HORA_INICIO  — hora mínima para início de reservas  (default: "08:00")
 *   RESERVA_HORA_FIM     — hora máxima para término de reservas (default: "22:00")
 *   TURNO_MANHA_INI      — início do turno manhã               (default: "08:00")
 *   TURNO_MANHA_FIM      — fim do turno manhã                  (default: "12:00")
 *   TURNO_TARDE_INI      — início do turno tarde               (default: "12:00")
 *   TURNO_TARDE_FIM      — fim do turno tarde                  (default: "18:00")
 *   TURNO_NOITE_INI      — início do turno noite               (default: "18:00")
 *   TURNO_NOITE_FIM      — fim do turno noite                  (default: "22:00")
 */
var _sistemaConfigCache = null;

function getSistemaConfig() {
  if (_sistemaConfigCache) return _sistemaConfigCache;

  var props = PropertiesService.getScriptProperties();

  _sistemaConfigCache = {
    reservaHoraInicio: props.getProperty('RESERVA_HORA_INICIO') || '08:00',
    reservaHoraFim:    props.getProperty('RESERVA_HORA_FIM')    || '22:00',
    turnoManhaIni:     props.getProperty('TURNO_MANHA_INI')     || '08:00',
    turnoManhaTer:     props.getProperty('TURNO_MANHA_FIM')     || '12:00',
    turnoTardeIni:     props.getProperty('TURNO_TARDE_INI')     || '12:00',
    turnoTardeTer:     props.getProperty('TURNO_TARDE_FIM')     || '18:00',
    turnoNoiteIni:     props.getProperty('TURNO_NOITE_INI')     || '18:00',
    turnoNoiteTer:     props.getProperty('TURNO_NOITE_FIM')     || '22:00'
  };

  return _sistemaConfigCache;
}

function invalidarCacheSistemaConfig() {
  _sistemaConfigCache = null;
}

/**
 * Persiste configurações operacionais via PropertiesService.
 * Requer nível superadmin — validar no controller antes de chamar.
 * @param {Object} cfg — chaves aceitas: reservaHoraInicio, reservaHoraFim,
 *                       turnoManhaIni, turnoManhaTer, turnoTardeIni, turnoTardeTer,
 *                       turnoNoiteIni, turnoNoiteTer
 */
function salvarSistemaConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') throw new Error('Configuração inválida');

  var map = {
    reservaHoraInicio: 'RESERVA_HORA_INICIO',
    reservaHoraFim:    'RESERVA_HORA_FIM',
    turnoManhaIni:     'TURNO_MANHA_INI',
    turnoManhaTer:     'TURNO_MANHA_FIM',
    turnoTardeIni:     'TURNO_TARDE_INI',
    turnoTardeTer:     'TURNO_TARDE_FIM',
    turnoNoiteIni:     'TURNO_NOITE_INI',
    turnoNoiteTer:     'TURNO_NOITE_FIM'
  };

  var props = PropertiesService.getScriptProperties();
  var reHora = /^([01]\d|2[0-3]):[0-5]\d$/;

  Object.keys(map).forEach(function(key) {
    if (cfg[key] !== undefined) {
      var val = String(cfg[key]).trim();
      if (!reHora.test(val)) throw new Error('Valor inválido para ' + key + ': ' + val);
      props.setProperty(map[key], val);
    }
  });

  invalidarCacheSistemaConfig();
  Logger.info('config', 'salvarSistemaConfig: configurações salvas', cfg);
  return { ok: true, config: getSistemaConfig() };
}
