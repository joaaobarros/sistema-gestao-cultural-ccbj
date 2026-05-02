/**
 * @file mod_preferencias.gs
 * @layer backend/modules
 * @description Persistência de preferências de usuário: ordem dos favoritos na sidebar e configurações de exibição.
 * @responsibility Entrypoints: salvarPreferenciaUsuario, carregarPreferenciasUsuario.
 * @dependencies PropertiesService (ScriptProperties por email), utils.js (obterEmailUsuario).
 */
// ============================================================
// mod_preferencias.gs
// Personalização Sidebar
// ============================================================

function salvarPreferenciasUsuario(chave, valor) {
  const email = Session.getActiveUser().getEmail();
  const sheet = _getSheet('PreferenciasUsuarios');
  if (!sheet) throw new Error("Aba PreferenciasUsuarios não encontrada.");

  const dados = sheet.getDataRange().getValues();

  for (let i = 1; i < dados.length; i++) {
    if (dados[i][0] === email && dados[i][1] === chave) {
      sheet.getRange(i + 1, 3).setValue(JSON.stringify(valor));
      sheet.getRange(i + 1, 4).setValue(new Date());
      return true;
    }
  }

  sheet.appendRow([email, chave, JSON.stringify(valor), new Date()]);
  return true;
}

function carregarPreferenciasUsuario() {
  const email = Session.getActiveUser().getEmail();
  const sheet = _getSheet('PreferenciasUsuarios');
  if (!sheet) return {};

  const dados = sheet.getDataRange().getValues();
  const prefs = {};

  for (let i = 1; i < dados.length; i++) {
    if (dados[i][0] === email) {
      try {
        prefs[dados[i][1]] = JSON.parse(dados[i][2]);
      } catch (e) {
        prefs[dados[i][1]] = null;
      }
    }
  }

  return prefs;
}