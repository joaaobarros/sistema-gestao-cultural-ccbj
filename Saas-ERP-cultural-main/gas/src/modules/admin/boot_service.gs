/**
 * @file modules/admin/boot_service.gs
 * @layer modules/admin
 * @description Entrypoint do boot do frontend — carrega dados iniciais e gerencia cache.
 *
 * @depends core/utils.gs (obterEmailUsuario, _getSheet, validarEmail,
 *                          criarIndiceAdmins, criarIndiceSalas, criarIndiceItens),
 *          core/config.gs (getSistemaConfig),
 *          backend/mod_admin.gs (registrarAcesso, obterSetorUsuario, resolverNomePorEmail,
 *                                registrarLog)
 */

var BootService = (function () {

  var _CACHE_PREFIX = 'dados_iniciais_';
  var _CACHE_TTL    = 60; // segundos

  function _chaveCache(email) {
    return _CACHE_PREFIX + email.replace(/[^a-z0-9]/g, '_');
  }

  /**
   * Entrypoint principal do boot do frontend.
   * Identidade resolvida via Session.getActiveUser() (Workspace domain).
   * Cache por usuário, TTL 60 s.
   *
   * @param {string} emailClienteFallback
   * @param {string} sessaoId
   */
  function obter(emailClienteFallback, sessaoId) {
    try {
      var emailUsuario = obterEmailUsuario(emailClienteFallback || '', sessaoId || '');
      var cache        = CacheService.getScriptCache();
      var cacheKey     = _chaveCache(emailUsuario);
      var cacheExist   = cache.get(cacheKey);

      if (cacheExist) {
        var dadosCache = JSON.parse(cacheExist);
        dadosCache.usuarioEmail = emailUsuario;
        return dadosCache;
      }

      var abaAdmins = _getSheet('Administradores');
      var listaAdminsCompleta = [];
      var nivelAcesso = 'usuário';
      var indiceAdmins = {};

      if (abaAdmins && abaAdmins.getLastRow() > 1) {
        listaAdminsCompleta = abaAdmins
          .getRange(2, 1, abaAdmins.getLastRow() - 1, 2)
          .getValues();
        indiceAdmins = criarIndiceAdmins(listaAdminsCompleta);
        var adminInfo = indiceAdmins[emailUsuario];
        if (adminInfo) nivelAcesso = adminInfo.nivel;
      }

      registrarAcesso(emailUsuario, nivelAcesso);

      var configSheet = _getSheet('Configuracoes');
      var salasFull   = [];
      var indiceSalas = {};
      var mapaSalasObj = {};
      var mapaFlagsEspacos = {};

      if (configSheet && configSheet.getLastRow() > 1) {
        var nCols = Math.max(13, configSheet.getLastColumn());
        salasFull = configSheet
          .getRange(2, 1, configSheet.getLastRow() - 1, Math.min(nCols, 13))
          .getValues();
        indiceSalas = criarIndiceSalas(salasFull);
        salasFull.forEach(function(s) {
          var id   = String(s[0]).trim();
          var nome = String(s[1]).trim();
          if (id && nome) {
            mapaSalasObj[id] = nome;
            mapaFlagsEspacos[id] = {
              possuiChaves:  s.length > 5 ? String(s[5]).toLowerCase() === 'true' : false,
              aceitaReserva: s.length > 8 ? String(s[8]).toLowerCase() !== 'false' : true
            };
          }
        });
      }

      var itensSheet = _getSheet('Itens');
      var listaItens = [];
      var indiceItens = {};
      if (itensSheet && itensSheet.getLastRow() > 1) {
        listaItens = itensSheet
          .getRange(2, 1, itensSheet.getLastRow() - 1, 6)
          .getValues();
        indiceItens = criarIndiceItens(listaItens);
      }

      var setoresSheet = _getSheet('Listas');
      var setores = [];
      if (setoresSheet && setoresSheet.getLastRow() > 1) {
        setores = setoresSheet
          .getRange(2, 1, setoresSheet.getLastRow() - 1, 1)
          .getValues()
          .map(function(s) { return s[0]; });
      }

      var mapaNomes = {};
      listaAdminsCompleta.forEach(function(a) {
        var em = String(a[0] || '').trim();
        if (em && validarEmail(em)) {
          try { mapaNomes[em] = resolverNomePorEmail(em); }
          catch(e) { mapaNomes[em] = em.split('@')[0]; }
        }
      });

      var setorUsuario = obterSetorUsuario(emailUsuario);

      var mapaSetoresAdmin = {};
      try {
        if (abaAdmins && abaAdmins.getLastRow() > 1 && abaAdmins.getLastColumn() >= 3) {
          abaAdmins.getRange(2, 1, abaAdmins.getLastRow() - 1, 3).getValues()
            .forEach(function(r) {
              var em = String(r[0] || '').trim().toLowerCase();
              if (em && r[2]) mapaSetoresAdmin[em] = String(r[2]).trim();
            });
        }
      } catch(e) {}

      var resultado = {
        usuarioEmail:    emailUsuario,
        isAdmin:         nivelAcesso === 'admin' || nivelAcesso === 'superadmin',
        isSuperadmin:    nivelAcesso === 'superadmin',
        isComunicacao:   nivelAcesso === 'comunicação' || nivelAcesso === 'comunicacao',
        isHabilitador:   nivelAcesso === 'habilitador',
        setorUsuario:    setorUsuario,
        mapaSetoresAdmin: mapaSetoresAdmin,
        mapaFlagsEspacos: mapaFlagsEspacos,
        salas:           salasFull,
        mapaSalas:       mapaSalasObj,
        setores:         setores,
        administradores: listaAdminsCompleta,
        listaItens:      listaItens,
        mapaNomes:       mapaNomes,
        _indiceAdmins:   indiceAdmins,
        _indiceSalas:    indiceSalas,
        _indiceItens:    indiceItens,
        sistemaConfig:   getSistemaConfig(),
        timestamp:       new Date().getTime()
      };

      cache.put(cacheKey, JSON.stringify(resultado), _CACHE_TTL);
      Logger.info('BootService', 'obter: dados enviados', { email: emailUsuario });
      return resultado;
    } catch(e) {
      Logger.error('BootService', 'Erro em obter', e.message);
      throw new Error('Erro ao carregar dados: ' + e.message);
    }
  }

  /**
   * Invalida o cache de dados iniciais do usuário.
   * Chamado após operações que alteram espaços, reservas ou configurações.
   * @param {string} emailUsuario
   */
  function limparCache(emailUsuario) {
    var cache = CacheService.getScriptCache();
    if (emailUsuario && String(emailUsuario).indexOf('@') !== -1) {
      cache.remove(_chaveCache(
        emailUsuario.trim().toLowerCase()
      ));
    }
  }

  return {
    obter:       obter,
    limparCache: limparCache
  };

})();
