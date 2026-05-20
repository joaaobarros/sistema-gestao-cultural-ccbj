/**
 * @file backend/controllers/preferencias_controller.gs
 * @layer backend/controllers
 * @description Fachada oficial do domínio de Preferências de Usuário.
 *
 * REGRA ARQUITETURAL:
 *   - A bridge aponta APENAS para funções ctrl_pref_*.
 *   - Todo retorno é GasResponse: { ok, data, error, metadata }.
 *   - O motor real é mod_preferencias.gs.
 *
 * @depends shared/response.gs (GasResponse),
 *          backend/mod_preferencias.gs (salvarPreferenciasUsuario, carregarPreferenciasUsuario),
 *          core/utils.gs (obterEmailUsuario),
 *          core/services/auditoria_service.gs (AuditoriaService),
 *          core/events_constants.gs (SystemEventTypes)
 */

// ═══════════════════════════════════════════════════════════════
// LEITURA
// ═══════════════════════════════════════════════════════════════

/**
 * Carrega todas as preferências do usuário autenticado.
 * @param {string} emailFallback
 */
function ctrl_pref_carregar(emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    return carregarPreferenciasUsuario(email);
  });
}

// ═══════════════════════════════════════════════════════════════
// ESCRITA
// ═══════════════════════════════════════════════════════════════

/**
 * Persiste uma preferência de usuário por chave.
 * @param {string} chave — identificador da preferência (ex: 'favoritos', 'sidebar_state')
 * @param {*} valor — valor serializável em JSON
 * @param {string} emailFallback
 */
function ctrl_pref_salvar(chave, valor, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    if (!chave) throw new Error('Chave de preferência é obrigatória.');
    salvarPreferenciasUsuario(chave, valor, email);
    AuditoriaService.registrar(
      SystemEventTypes.USER_PREFERENCE_SAVED,
      'preferencias',
      { chave: chave, email: email }
    );
    return { chave: chave };
  });
}
