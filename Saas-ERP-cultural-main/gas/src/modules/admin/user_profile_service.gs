/**
 * @file modules/admin/user_profile_service.gs
 * @layer modules/admin
 * @description Perfil do usuário: setor, preferências, perfil de identidade e e-mails do sistema.
 *
 * @depends core/utils.gs (_getSheet, validarEmail),
 *          backend/mod_admin.gs (obterEmailUsuario, registrarLog)
 */

var UserProfileService = (function () {

  // ── Setor ─────────────────────────────────────────────────────

  /**
   * Lê o setor do usuário — primeiro na col 3 de Administradores,
   * depois em PreferenciasUsuarios (chave 'setor_usuario').
   */
  function obterSetor(email) {
    if (!email || email.indexOf('@') === -1) return '';
    var emailNorm = String(email).trim().toLowerCase();

    try {
      var abaAdmins = _getSheet('Administradores');
      if (abaAdmins && abaAdmins.getLastRow() > 1 && abaAdmins.getLastColumn() >= 3) {
        var dados = abaAdmins.getRange(2, 1, abaAdmins.getLastRow() - 1, 3).getValues();
        for (var i = 0; i < dados.length; i++) {
          if (String(dados[i][0]).trim().toLowerCase() === emailNorm &&
              String(dados[i][2] || '').trim()) {
            return String(dados[i][2]).trim();
          }
        }
      }
    } catch(e) {}

    try {
      var abaPrefs = _getSheet('PreferenciasUsuarios');
      if (abaPrefs && abaPrefs.getLastRow() > 1) {
        var prefs = abaPrefs.getDataRange().getValues();
        for (var j = 1; j < prefs.length; j++) {
          if (String(prefs[j][0]).trim().toLowerCase() === emailNorm &&
              String(prefs[j][1]).trim() === 'setor_usuario') {
            try { return JSON.parse(String(prefs[j][2])) || ''; }
            catch(e) { return String(prefs[j][2]) || ''; }
          }
        }
      }
    } catch(e) {}

    return '';
  }

  /**
   * Salva setor do usuário.
   * Admin pode alterar setor de qualquer usuário.
   * Usuário comum só pode alterar o próprio.
   */
  function salvarSetor(emailAlvo, setor, emailSolicitante) {
    if (!emailSolicitante || emailSolicitante.indexOf('@') === -1)
      throw new Error('Email do solicitante inválido.');
    if (!emailAlvo || emailAlvo.indexOf('@') === -1)
      throw new Error('Email do usuário inválido.');

    var emailAlvoNorm = String(emailAlvo).trim().toLowerCase();
    var emailSolNorm  = String(emailSolicitante).trim().toLowerCase();
    var setorNorm     = String(setor || '').trim();

    var ehAdmin = (function() {
      try {
        var abaAdmins = _getSheet('Administradores');
        if (!abaAdmins || abaAdmins.getLastRow() < 2) return false;
        var dados = abaAdmins.getRange(2, 1, abaAdmins.getLastRow() - 1, 2).getValues();
        for (var i = 0; i < dados.length; i++) {
          if (String(dados[i][0]).trim().toLowerCase() === emailSolNorm) {
            return ['admin','superadmin'].indexOf(String(dados[i][1]).toLowerCase()) !== -1;
          }
        }
        return false;
      } catch(e) { return false; }
    })();

    if (!ehAdmin && emailAlvoNorm !== emailSolNorm)
      throw new Error('Sem permissão para alterar setor de outro usuário.');

    try {
      var abaAdmins = _getSheet('Administradores');
      if (abaAdmins && abaAdmins.getLastRow() > 1) {
        var numCols = abaAdmins.getLastColumn();
        var dados = abaAdmins.getRange(2, 1, abaAdmins.getLastRow() - 1, Math.max(2, numCols)).getValues();
        for (var i = 0; i < dados.length; i++) {
          if (String(dados[i][0]).trim().toLowerCase() === emailAlvoNorm) {
            abaAdmins.getRange(i + 2, 3).setValue(setorNorm);
            registrarLog('SETOR_USUARIO', 'USUARIO', emailAlvo,
              'Setor: ' + setorNorm, '', setorNorm, emailSolicitante);
            return true;
          }
        }
      }
    } catch(e) {}

    var abaPrefs = _getSheet('PreferenciasUsuarios');
    if (!abaPrefs) throw new Error('Não foi possível salvar o setor do usuário.');
    var dadosPrefs = abaPrefs.getDataRange().getValues();
    for (var k = 1; k < dadosPrefs.length; k++) {
      if (String(dadosPrefs[k][0]).trim().toLowerCase() === emailAlvoNorm &&
          String(dadosPrefs[k][1]).trim() === 'setor_usuario') {
        abaPrefs.getRange(k + 1, 3).setValue(JSON.stringify(setorNorm));
        abaPrefs.getRange(k + 1, 4).setValue(new Date());
        registrarLog('SETOR_USUARIO', 'USUARIO', emailAlvo,
          'Setor: ' + setorNorm, '', setorNorm, emailSolicitante);
        return true;
      }
    }
    abaPrefs.appendRow([emailAlvo, 'setor_usuario', JSON.stringify(setorNorm), new Date()]);
    registrarLog('SETOR_USUARIO', 'USUARIO', emailAlvo,
      'Setor: ' + setorNorm, '', setorNorm, emailSolicitante);
    return true;
  }

  // ── Preferências ──────────────────────────────────────────────

  function salvarPreferencia(chave, valor) {
    var email = obterEmailUsuario('');
    if (!email || !chave) return;
    var aba = _getSheet('PreferenciasUsuarios');
    if (!aba) return;
    var dados = aba.getLastRow() > 1 ? aba.getDataRange().getValues() : [[]];
    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][0]).toLowerCase() === email.toLowerCase() && dados[i][1] === chave) {
        aba.getRange(i + 1, 3).setValue(valor);
        aba.getRange(i + 1, 4).setValue(new Date().toISOString());
        return;
      }
    }
    aba.appendRow([email, chave, valor, new Date().toISOString()]);
  }

  function obterPreferencia(chave) {
    var email = obterEmailUsuario('');
    if (!email || !chave) return null;
    var aba = _getSheet('PreferenciasUsuarios');
    if (!aba || aba.getLastRow() < 2) return null;
    var dados = aba.getDataRange().getValues();
    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][0]).toLowerCase() === email.toLowerCase() && dados[i][1] === chave) {
        return String(dados[i][2] || '') || null;
      }
    }
    return null;
  }

  // ── Perfil de identidade ──────────────────────────────────────

  function obterPerfil(emailFallback) {
    try {
      var email = obterEmailUsuario(emailFallback || '');
      var nome = email.split('@')[0];
      var foto = null;
      try {
        var url = 'https://people.googleapis.com/v1/people/me?personFields=names,photos';
        var res = UrlFetchApp.fetch(url, {
          headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
          muteHttpExceptions: true
        });
        var data = JSON.parse(res.getContentText());
        nome = (data.names && data.names[0] && data.names[0].displayName) || nome;
        foto = (data.photos && data.photos[0] && data.photos[0].url) || null;
      } catch(e) {}
      return { email: email, nome: nome, foto: foto };
    } catch(e) {
      throw new Error(e.message);
    }
  }

  // ── E-mails do sistema ────────────────────────────────────────

  function obterEmailsSistema() {
    try {
      var emails = {};
      var abaAdmins = _getSheet('Administradores');
      if (abaAdmins && abaAdmins.getLastRow() > 1) {
        abaAdmins.getRange(2, 1, abaAdmins.getLastRow() - 1, 1).getValues()
          .forEach(function(r) {
            if (r[0] && String(r[0]).indexOf('@') !== -1)
              emails[String(r[0]).trim().toLowerCase()] = true;
          });
      }
      var abaLog = _getSheet('LogAcessos');
      if (abaLog && abaLog.getLastRow() > 1) {
        abaLog.getRange(2, 1, abaLog.getLastRow() - 1, 2).getValues()
          .forEach(function(r) {
            if (r[1] && String(r[1]).indexOf('@') !== -1)
              emails[String(r[1]).trim().toLowerCase()] = true;
          });
      }
      var abaRes = _getSheet('Reservas');
      if (abaRes && abaRes.getLastRow() > 1) {
        abaRes.getRange(2, 9, abaRes.getLastRow() - 1, 1).getValues()
          .forEach(function(r) {
            if (r[0] && String(r[0]).indexOf('@') !== -1)
              emails[String(r[0]).trim().toLowerCase()] = true;
          });
      }
      return Object.keys(emails).sort();
    } catch(e) {
      return [];
    }
  }

  return {
    obterSetor:          obterSetor,
    salvarSetor:         salvarSetor,
    salvarPreferencia:   salvarPreferencia,
    obterPreferencia:    obterPreferencia,
    obterPerfil:         obterPerfil,
    obterEmailsSistema:  obterEmailsSistema
  };

})();
