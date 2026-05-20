/**
 * @file backend/controllers/documentos_controller.gs
 * @layer backend/controllers
 * @description Fachada oficial do domínio de Geração de Documentos.
 *
 * REGRA ARQUITETURAL:
 *   - A bridge aponta APENAS para funções ctrl_doc_*.
 *   - Todo retorno é GasResponse: { ok, data, error, metadata }.
 *   - O motor real é backend/mod_relatorios.gs.
 *
 * @depends shared/response.gs (GasResponse),
 *          modules/relatorios/documento_service.gs (DocumentoService),
 *          core/utils.gs (obterEmailUsuario),
 *          core/services/auditoria_service.gs (AuditoriaService),
 *          core/events_constants.gs (SystemEventTypes)
 */

// ═══════════════════════════════════════════════════════════════
// GERAÇÃO
// ═══════════════════════════════════════════════════════════════

/**
 * Gera documento institucional (Docs ou Slides) no Google Drive.
 * @param {Object} conteudo — { titulo, formato ('doc'|'ppt'), secoes[], graficos[] }
 * @param {string} emailFallback
 */
function ctrl_doc_gerar_drive(conteudo, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    if (!conteudo || !conteudo.secoes) throw new Error('Conteúdo com seções é obrigatório.');
    var resultado = DocumentoService.gerar(conteudo);
    AuditoriaService.registrar(
      SystemEventTypes.DOCUMENT_GENERATED,
      'documentos',
      { titulo: conteudo.titulo || '', formato: conteudo.formato || 'doc', ator: email }
    );
    return resultado;
  });
}
