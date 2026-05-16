/**
 * @file backend/controllers/admin_controller.gs
 * @layer backend/controllers
 * @description Fachada oficial para operações administrativas, configuração e métricas.
 *
 * REGRA ARQUITETURAL:
 *   - O bridge aponta APENAS para funções ctrl_admin_* e ctrl_rece_*.
 *   - Toda resposta é GasResponse: { ok, data, error, metadata }.
 *
 * Cobre domínios:
 *   - Dados iniciais e perfil do usuário
 *   - Configuração de espaços (Configuracoes)
 *   - Métricas e dashboard
 *   - Logs e auditoria
 *   - RECE (Agenda Reservada CCBJ)
 *
 * @depends shared/response.gs (GasResponse),
 *          backend/mod_admin.gs,
 *          backend/mod_metrics.gs,
 *          core/auth_session.gs,
 *          modules/admin/config_service.gs (ConfigService),
 *          modules/admin/rollback_service.gs (RollbackService),
 *          modules/relatorios/codip_service.gs (CodipService)
 */

// ═══════════════════════════════════════════════════════════════════
// INICIALIZAÇÃO E PERFIL
// ═══════════════════════════════════════════════════════════════════

/**
 * Carrega dados iniciais do app: usuário, permissões, salas, reservas, config.
 * Ponto de entrada crítico do boot da aplicação.
 * @param {string} emailFallback — email capturado no doGet (window.__EMAIL_INICIAL__)
 * @param {string} sessaoId      — token de sessão opcional
 */
function ctrl_admin_dados_iniciais(emailFallback, sessaoId) {
  return GasResponse.wrap(function () {
    return obterDadosIniciais(emailFallback || '', sessaoId || '');
  }, 'ctrl_admin_dados_iniciais');
}

/**
 * Retorna perfil completo do usuário autenticado.
 * @param {string} emailFallback
 */
function ctrl_admin_perfil(emailFallback) {
  return GasResponse.wrap(function () {
    var email = obterEmailUsuario(emailFallback || '');
    return obterPerfilUsuario(email);
  }, 'ctrl_admin_perfil');
}

/**
 * Retorna lista de e-mails de usuários do sistema (para seletores e permissões).
 */
function ctrl_admin_emails_sistema() {
  return GasResponse.wrap(function () {
    return obterEmailsSistema();
  }, 'ctrl_admin_emails_sistema');
}

/**
 * Retorna setor cadastrado para o usuário.
 * @param {string} emailAlvo
 */
function ctrl_admin_obter_setor(emailAlvo) {
  return GasResponse.wrap(function () {
    if (!emailAlvo) throw new Error('E-mail é obrigatório');
    return obterSetorUsuario(emailAlvo);
  }, 'ctrl_admin_obter_setor');
}

/**
 * Salva setor do usuário.
 * @param {string} emailAlvo
 * @param {string} setor
 * @param {string} emailSolicitante
 */
function ctrl_admin_salvar_setor(emailAlvo, setor, emailSolicitante) {
  return GasResponse.wrap(function () {
    if (!emailAlvo) throw new Error('E-mail alvo é obrigatório');
    if (!setor)     throw new Error('Setor é obrigatório');
    return salvarSetorUsuario(emailAlvo, setor, emailSolicitante || '');
  }, 'ctrl_admin_salvar_setor');
}

// ═══════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════════════

/**
 * Salva configuração de espaço (criar ou atualizar).
 * @param {Object} dados — payload de configuração do espaço
 */
function ctrl_admin_salvar_config(dados) {
  return GasResponse.wrap(function () {
    if (!dados || typeof dados !== 'object') throw new Error('Dados de configuração são obrigatórios');
    return ConfigService.salvar(dados);
  }, 'ctrl_admin_salvar_config');
}

/**
 * Exclui registro por ID e tipo.
 * @param {string} tipo — nome da entidade ('reserva', 'contrato', etc.)
 * @param {string} id
 * @param {string} emailFallback
 */
function ctrl_admin_excluir_por_id(tipo, id, emailFallback) {
  return GasResponse.wrap(function () {
    if (!tipo) throw new Error('Tipo é obrigatório');
    if (!id)   throw new Error('ID é obrigatório');
    var email = obterEmailUsuario(emailFallback || '');
    return excluirRegistroPorID(tipo, id, email);
  }, 'ctrl_admin_excluir_por_id');
}

/**
 * Remove registro genérico por ID e tipo.
 * @param {string} id
 * @param {string} tipo
 * @param {string} emailFallback
 */
function ctrl_admin_remover_registro(id, tipo, emailFallback) {
  return GasResponse.wrap(function () {
    if (!id)   throw new Error('ID é obrigatório');
    if (!tipo) throw new Error('Tipo é obrigatório');
    var email = obterEmailUsuario(emailFallback || '');
    return ConfigService.remover(id, tipo, email);
  }, 'ctrl_admin_remover_registro');
}

/**
 * Retorna dados de uma aba para uso em configuração.
 * @param {string} [nomeAba]
 */
function ctrl_admin_dados_config(nomeAba) {
  return GasResponse.wrap(function () {
    return ConfigService.obterDados(nomeAba || undefined);
  }, 'ctrl_admin_dados_config');
}

/**
 * Alterna quantidade de um item em uma sala.
 * @param {string} idItem
 * @param {string} idSala
 * @param {number} qtd
 * @param {string} acao — 'adicionar' | 'remover'
 * @param {string} emailFallback
 */
function ctrl_admin_alternar_item(idItem, idSala, qtd, acao, emailFallback) {
  return GasResponse.wrap(function () {
    if (!idItem) throw new Error('ID do item é obrigatório');
    if (!idSala) throw new Error('ID da sala é obrigatório');
    var email = obterEmailUsuario(emailFallback || '');
    return ConfigService.alternarItem(idItem, idSala, qtd, acao, email);
  }, 'ctrl_admin_alternar_item');
}

/**
 * Retorna configuração do sistema (campo admin).
 */
function ctrl_admin_sistema_config() {
  return GasResponse.wrap(function () {
    return obterSistemaConfigAdmin();
  }, 'ctrl_admin_sistema_config');
}

/**
 * Salva configuração do sistema.
 * @param {Object} cfg
 * @param {string} emailFallback
 */
function ctrl_admin_salvar_sistema_config(cfg, emailFallback) {
  return GasResponse.wrap(function () {
    if (!cfg || typeof cfg !== 'object') throw new Error('Configuração é obrigatória');
    return salvarSistemaConfigAdmin(cfg, emailFallback || '');
  }, 'ctrl_admin_salvar_sistema_config');
}

// ═══════════════════════════════════════════════════════════════════
// MÉTRICAS E DASHBOARD
// ═══════════════════════════════════════════════════════════════════

/**
 * Retorna métricas do dashboard com filtros de data/sala/setor.
 * @param {string} dataInicio — ISO
 * @param {string} dataFim    — ISO
 * @param {string} [sala]
 * @param {string} [setor]
 */
function ctrl_admin_metricas_dashboard(dataInicio, dataFim, sala, setor) {
  return GasResponse.wrap(function () {
    return obterMetricasDashboard(dataInicio || null, dataFim || null, sala || null, setor || null);
  }, 'ctrl_admin_metricas_dashboard');
}

/**
 * Retorna dados de série temporal para o gráfico de reservas.
 */
function ctrl_admin_grafico_reservas() {
  return GasResponse.wrap(function () {
    return obterDadosGraficoReservas();
  }, 'ctrl_admin_grafico_reservas');
}

/**
 * Retorna métricas CODIP (público, registros, taxa de presença).
 */
function ctrl_admin_metricas_codip() {
  return GasResponse.wrap(function () {
    return CodipService.obterMetricas();
  }, 'ctrl_admin_metricas_codip');
}

/**
 * Retorna relatórios CODIP completos.
 */
function ctrl_admin_relatorios_codip() {
  return GasResponse.wrap(function () {
    return CodipService.obterRelatorios();
  }, 'ctrl_admin_relatorios_codip');
}

// ═══════════════════════════════════════════════════════════════════
// AUDITORIA OPERACIONAL V2 (AuditoriaStore — JSON estruturado no Drive)
// ═══════════════════════════════════════════════════════════════════

/**
 * Consulta eventos estruturados do AuditoriaStore com filtros avançados.
 * Exige perfil admin ou superadmin.
 *
 * @param {Object} filtros — { categoria, modulo, usuario, tipo, resultado, busca, de, ate, limite }
 * @param {string} emailFallback
 */
function ctrl_admin_auditoria_v2(filtros, emailFallback) {
  return GasResponse.wrap(function () {
    var email = obterEmailUsuario(emailFallback || '');
    if (!PermissoesService.isAdmin(email)) throw new Error('Acesso negado — requer perfil admin ou superior');
    return {
      eventos:       AuditoriaStore.consultar(filtros || {}),
      stats:         AuditoriaStore.obterEstatisticas(),
      modulosAtivos: AuditoriaStore.obterModulosAtivos()
    };
  }, 'ctrl_admin_auditoria_v2');
}

// LOGS LEGADO (aba Logs + LogAcessos da planilha)
// ═══════════════════════════════════════════════════════════════════

/**
 * Retorna log de ações do usuário.
 * @param {string} emailFallback
 */
function ctrl_admin_logs(emailFallback) {
  return GasResponse.wrap(function () {
    var email = obterEmailUsuario(emailFallback || '');
    return obterLogs(email);
  }, 'ctrl_admin_logs');
}

/**
 * Retorna log de acessos.
 * @param {string} emailFallback
 */
function ctrl_admin_log_acessos(emailFallback) {
  return GasResponse.wrap(function () {
    var email = obterEmailUsuario(emailFallback || '');
    return obterLogAcessos(email);
  }, 'ctrl_admin_log_acessos');
}

/**
 * Desfaz a ação mais recente antes de um timestamp.
 * @param {string} emailFallback
 * @param {string} timestamp
 */
function ctrl_admin_rollback(emailFallback, timestamp) {
  return GasResponse.wrap(function () {
    if (!timestamp) throw new Error('Timestamp é obrigatório para rollback');
    var email = obterEmailUsuario(emailFallback || '');
    return RollbackService.porTimestamp(email, timestamp);
  }, 'ctrl_admin_rollback');
}

/**
 * Desfaz ação por índice no log.
 * @param {string} emailFallback
 * @param {number} indice
 */
function ctrl_admin_rollback_indice(emailFallback, indice) {
  return GasResponse.wrap(function () {
    if (indice === undefined || indice === null) throw new Error('Índice é obrigatório para rollback');
    var email = obterEmailUsuario(emailFallback || '');
    return RollbackService.porIndice(email, indice);
  }, 'ctrl_admin_rollback_indice');
}

// ═══════════════════════════════════════════════════════════════════
// AGENDA RECE
// ═══════════════════════════════════════════════════════════════════

/**
 * Lista reservas da agenda RECE.
 */
function ctrl_rece_listar() {
  return GasResponse.wrap(function () {
    return obterReservasRece();
  }, 'ctrl_rece_listar');
}

/**
 * Salva reserva RECE.
 * @param {Object} dados
 */
function ctrl_rece_salvar(dados) {
  return GasResponse.wrap(function () {
    if (!dados || typeof dados !== 'object') throw new Error('Dados da reserva RECE são obrigatórios');
    return salvarReservaRece(dados);
  }, 'ctrl_rece_salvar');
}

/**
 * Cancela reserva RECE.
 * @param {string} id
 * @param {string} emailFallback
 */
function ctrl_rece_cancelar(id, emailFallback) {
  return GasResponse.wrap(function () {
    if (!id) throw new Error('ID é obrigatório');
    var email = obterEmailUsuario(emailFallback || '');
    return cancelarReservaRece(id, email);
  }, 'ctrl_rece_cancelar');
}

/**
 * Exclui reserva RECE.
 * @param {string} id
 * @param {string} emailFallback
 */
function ctrl_rece_excluir(id, emailFallback) {
  return GasResponse.wrap(function () {
    if (!id) throw new Error('ID é obrigatório');
    var email = obterEmailUsuario(emailFallback || '');
    return excluirReservaRece(id, email);
  }, 'ctrl_rece_excluir');
}

/**
 * Faz upload de imagem para a agenda RECE via Drive.
 * @param {string} b64
 * @param {string} mimeType
 * @param {string} nome
 */
function ctrl_rece_upload_imagem(b64, mimeType, nome) {
  return GasResponse.wrap(function () {
    if (!b64)      throw new Error('Dados base64 são obrigatórios');
    if (!mimeType) throw new Error('mimeType é obrigatório');
    return uploadImagemRece(b64, mimeType, nome || 'imagem');
  }, 'ctrl_rece_upload_imagem');
}
