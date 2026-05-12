/**
 * @file backend/controllers/comunicacao_controller.gs
 * @layer backend/controllers
 * @description Fachada oficial do domínio de Comunicação Institucional.
 *
 * REGRA ARQUITETURAL:
 *   - A bridge aponta APENAS para funções ctrl_com_*.
 *   - Todo retorno é GasResponse: { ok, data, error, metadata }.
 *   - Os motores reais estão em modules/comunicacao/mod_comunicacao.gs.
 *
 * @depends shared/response.gs (GasResponse),
 *          modules/comunicacao/mod_comunicacao.gs (enviarConvitesCalendar, enviarConviteEmailInstitucional),
 *          core/utils.gs (obterEmailUsuario),
 *          core/services/auditoria_service.gs (AuditoriaService),
 *          core/events_constants.gs (SystemEventTypes)
 */

// ═══════════════════════════════════════════════════════════════
// CALENDÁRIO
// ═══════════════════════════════════════════════════════════════

/**
 * Cria evento no Google Calendar e envia convites aos participantes.
 * @param {Object} dados — { titulo, descricao, espaco, dataInicio, horaInicio, horaTermino, emails[] }
 * @param {string} emailFallback
 */
function ctrl_com_convites_calendar(dados, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    if (!dados || !dados.emails || !dados.emails.length) throw new Error('Destinatários são obrigatórios.');
    if (!dados.titulo) throw new Error('Título do evento é obrigatório.');
    var resultado = enviarConvitesCalendar(dados);
    if (resultado && resultado.success === false) throw new Error(resultado.erro || 'Erro ao criar evento no Calendar.');
    AuditoriaService.registrar(
      SystemEventTypes.CALENDAR_INVITE_SENT,
      'comunicacao',
      { titulo: dados.titulo, destinatarios: dados.emails.length, ator: email }
    );
    return { enviado: true, titulo: dados.titulo };
  });
}

// ═══════════════════════════════════════════════════════════════
// E-MAIL INSTITUCIONAL
// ═══════════════════════════════════════════════════════════════

/**
 * Envia convite institucional por e-mail via GmailApp.
 * @param {Object} dados — { titulo, texto, espaco, dataInicio, horaInicio, emails[] }
 * @param {string} emailFallback
 */
function ctrl_com_enviar_convite(dados, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    if (!dados || !dados.emails || !dados.emails.length) throw new Error('Destinatários são obrigatórios.');
    if (!dados.titulo) throw new Error('Título é obrigatório.');
    var resultado = enviarConviteEmailInstitucional(dados);
    if (resultado && resultado.success === false) throw new Error(resultado.erro || 'Erro ao enviar e-mail institucional.');
    AuditoriaService.registrar(
      SystemEventTypes.EMAIL_INVITE_SENT,
      'comunicacao',
      { titulo: dados.titulo, destinatarios: dados.emails.length, ator: email }
    );
    return { enviado: true, titulo: dados.titulo };
  });
}
