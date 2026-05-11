/**
 * @file backend/controllers/chaves_controller.gs
 * @layer backend/controllers
 * @description Fachada oficial do domínio Chaves — único ponto de entrada via google.script.run.
 *
 * REGRA ARQUITETURAL:
 *   - O bridge aponta APENAS para funções ctrl_chaves_*.
 *   - Nenhum acesso frontend direto a mod_chaves.gs ou chave_engine.gs.
 *   - Toda transição de protocolo ocorre via KeyEngine.aplicarTransicao().
 *   - Toda resposta é GasResponse: { ok, data, error, metadata }.
 *
 * @depends shared/response.gs (GasResponse),
 *          modules/chaves/chave_engine.gs (KeyEngine),
 *          modules/chaves/mod_chaves.gs (funções chaves_*),
 *          backend/mod_admin.gs (obterEmailUsuario)
 */

// ═══════════════════════════════════════════════════════════════════
// LEITURA
// ═══════════════════════════════════════════════════════════════════

/**
 * Retorna estado inicial do módulo: espaços, chaves, protocolos ativos, indicadores.
 * @param {string} emailFallback
 */
function ctrl_chaves_dados(emailFallback) {
  return GasResponse.wrap(function () {
    var email = obterEmailUsuario(emailFallback || '');
    return chaves_obterDados(email);
  }, 'ctrl_chaves_dados');
}

/**
 * Lista protocolos com filtros opcionais.
 * @param {Object} filtros — { status?, chaveId?, espacoId?, responsavelId? }
 * @param {string} emailFallback
 */
function ctrl_chaves_listar_protocolos(filtros, emailFallback) {
  return GasResponse.wrap(function () {
    var email = obterEmailUsuario(emailFallback || '');
    return chaves_listarProtocolos(filtros || {}, email);
  }, 'ctrl_chaves_listar_protocolos');
}

/**
 * Retorna histórico de movimentações de uma chave ou protocolo.
 * @param {Object} filtros — { chaveId?, protocoloId? }
 * @param {string} emailFallback
 */
function ctrl_chaves_historico(filtros, emailFallback) {
  return GasResponse.wrap(function () {
    var email = obterEmailUsuario(emailFallback || '');
    return chaves_obterHistorico(filtros || {}, email);
  }, 'ctrl_chaves_historico');
}

/**
 * Retorna indicadores operacionais do módulo de chaves.
 * @param {string} emailFallback
 */
function ctrl_chaves_indicadores(emailFallback) {
  return GasResponse.wrap(function () {
    var email = obterEmailUsuario(emailFallback || '');
    return chaves_obterIndicadores(email);
  }, 'ctrl_chaves_indicadores');
}

/**
 * Lista espaços com campos de configuração de chaves.
 * @param {string} emailFallback
 */
function ctrl_chaves_listar_espacos(emailFallback) {
  return GasResponse.wrap(function () {
    var email = obterEmailUsuario(emailFallback || '');
    return chaves_listarEspacosCompletos(email);
  }, 'ctrl_chaves_listar_espacos');
}

// ═══════════════════════════════════════════════════════════════════
// CADASTRO
// ═══════════════════════════════════════════════════════════════════

/**
 * Salva ou atualiza o cadastro de uma chave física.
 * @param {Object} dados
 * @param {string} emailFallback
 */
function ctrl_chaves_salvar(dados, emailFallback) {
  return GasResponse.wrap(function () {
    if (!dados || typeof dados !== 'object') throw new Error('Dados da chave são obrigatórios');
    var email = obterEmailUsuario(emailFallback || '');
    return chaves_salvarChave(dados, email);
  }, 'ctrl_chaves_salvar');
}

/**
 * Altera o status de uma chave (DISPONIVEL, MANUTENCAO, BLOQUEADA, EXTRAVIADA).
 * @param {string} chaveId
 * @param {string} novoStatus
 * @param {string} [obs]
 * @param {string} emailFallback
 */
function ctrl_chaves_alterar_status(chaveId, novoStatus, obs, emailFallback) {
  return GasResponse.wrap(function () {
    if (!chaveId)    throw new Error('ID da chave é obrigatório');
    if (!novoStatus) throw new Error('Novo status é obrigatório');
    var email = obterEmailUsuario(emailFallback || '');
    return chaves_alterarStatusChave(chaveId, novoStatus, obs || '', email);
  }, 'ctrl_chaves_alterar_status');
}

/**
 * Desativa uma chave física do sistema.
 * @param {string} chaveId
 * @param {string} [obs]
 * @param {string} emailFallback
 */
function ctrl_chaves_desativar(chaveId, obs, emailFallback) {
  return GasResponse.wrap(function () {
    if (!chaveId) throw new Error('ID da chave é obrigatório');
    var email = obterEmailUsuario(emailFallback || '');
    return chaves_desativarChave(chaveId, obs || '', email);
  }, 'ctrl_chaves_desativar');
}

/**
 * Salva campos de configuração de chaves em um espaço.
 * @param {string} espacoId
 * @param {Object} dados
 * @param {string} emailFallback
 */
function ctrl_chaves_salvar_espaco(espacoId, dados, emailFallback) {
  return GasResponse.wrap(function () {
    if (!espacoId) throw new Error('ID do espaço é obrigatório');
    if (!dados || typeof dados !== 'object') throw new Error('Dados do espaço são obrigatórios');
    var email = obterEmailUsuario(emailFallback || '');
    return chaves_salvarCamposEspaco(espacoId, dados, email);
  }, 'ctrl_chaves_salvar_espaco');
}

// ═══════════════════════════════════════════════════════════════════
// FLUXO USUÁRIO — Solicitação e confirmação de retirada
// ═══════════════════════════════════════════════════════════════════

/**
 * Usuário solicita retirada de chave (SOLICITADA).
 * @param {Object} dados — { chaveId, espacoId, dtPrevistaDevolucao, observacoes?, reservaId? }
 * @param {string} emailFallback
 */
function ctrl_chaves_solicitar(dados, emailFallback) {
  return GasResponse.wrap(function () {
    if (!dados || typeof dados !== 'object') throw new Error('Dados da solicitação são obrigatórios');
    if (!dados.chaveId)   throw new Error('chaveId é obrigatório');
    if (!dados.espacoId)  throw new Error('espacoId é obrigatório');
    var email = obterEmailUsuario(emailFallback || '');
    return chaves_solicitar(dados, email);
  }, 'ctrl_chaves_solicitar');
}

/**
 * Usuário confirma recebimento da chave (AGUARDANDO_CONFIRMACAO_USUARIO → RETIRADA).
 * @param {string} protocoloId
 * @param {string} [obs]
 * @param {string} emailFallback
 */
function ctrl_chaves_confirmar_recebimento(protocoloId, obs, emailFallback) {
  return GasResponse.wrap(function () {
    if (!protocoloId) throw new Error('ID do protocolo é obrigatório');
    var email = obterEmailUsuario(emailFallback || '');
    return chaves_confirmarRecebimento(protocoloId, obs || '', email);
  }, 'ctrl_chaves_confirmar_recebimento');
}

// ═══════════════════════════════════════════════════════════════════
// FLUXO INFRAESTRUTURA — Entrega e devolução
// ═══════════════════════════════════════════════════════════════════

/**
 * Infraestrutura inicia entrega direta de chave (AGUARDANDO_CONFIRMACAO_USUARIO).
 * @param {Object} dados — { chaveId, destinoEmail, dtPrevistaDevolucao, obs? }
 * @param {string} emailFallback
 */
function ctrl_chaves_entrega_direta(dados, emailFallback) {
  return GasResponse.wrap(function () {
    if (!dados || typeof dados !== 'object') throw new Error('Dados da entrega são obrigatórios');
    var email = obterEmailUsuario(emailFallback || '');
    return chaves_iniciarEntregaDireta(dados, email);
  }, 'ctrl_chaves_entrega_direta');
}

/**
 * Infraestrutura aprova entrega de chave solicitada (SOLICITADA → AGUARDANDO_CONFIRMACAO_USUARIO).
 * @param {string} protocoloId
 * @param {string} [obs]
 * @param {string} emailFallback
 */
function ctrl_chaves_aprovar_entrega(protocoloId, obs, emailFallback) {
  return GasResponse.wrap(function () {
    if (!protocoloId) throw new Error('ID do protocolo é obrigatório');
    var email = obterEmailUsuario(emailFallback || '');
    return chaves_aprovarEntrega(protocoloId, obs || '', email);
  }, 'ctrl_chaves_aprovar_entrega');
}

/**
 * Usuário registra devolução (RETIRADA/ATRASADA → AGUARDANDO_CONFIRMACAO_INFRA).
 * @param {string} protocoloId
 * @param {string} [obs]
 * @param {string} emailFallback
 */
function ctrl_chaves_registrar_devolucao(protocoloId, obs, emailFallback) {
  return GasResponse.wrap(function () {
    if (!protocoloId) throw new Error('ID do protocolo é obrigatório');
    var email = obterEmailUsuario(emailFallback || '');
    return chaves_registrarDevolucao(protocoloId, obs || '', email);
  }, 'ctrl_chaves_registrar_devolucao');
}

/**
 * Infraestrutura confirma recebimento da devolução (AGUARDANDO_CONFIRMACAO_INFRA → DEVOLVIDA).
 * @param {string} protocoloId
 * @param {string} [obs]
 * @param {string} emailFallback
 */
function ctrl_chaves_confirmar_devolucao(protocoloId, obs, emailFallback) {
  return GasResponse.wrap(function () {
    if (!protocoloId) throw new Error('ID do protocolo é obrigatório');
    var email = obterEmailUsuario(emailFallback || '');
    return chaves_confirmarDevolucao(protocoloId, obs || '', email);
  }, 'ctrl_chaves_confirmar_devolucao');
}

// ═══════════════════════════════════════════════════════════════════
// FLUXO TRANSFERÊNCIA
// ═══════════════════════════════════════════════════════════════════

/**
 * Solicita transferência para outro responsável (RETIRADA → TRANSFERENCIA_PENDENTE).
 * @param {string} protocoloId
 * @param {string} destinoEmail
 * @param {string} [obs]
 * @param {string} emailFallback
 */
function ctrl_chaves_solicitar_transferencia(protocoloId, destinoEmail, obs, emailFallback) {
  return GasResponse.wrap(function () {
    if (!protocoloId)   throw new Error('ID do protocolo é obrigatório');
    if (!destinoEmail)  throw new Error('E-mail de destino é obrigatório');
    var email = obterEmailUsuario(emailFallback || '');
    return chaves_solicitarTransferencia(protocoloId, destinoEmail, obs || '', email);
  }, 'ctrl_chaves_solicitar_transferencia');
}

/**
 * Destinatário confirma recebimento da transferência (TRANSFERENCIA_PENDENTE → TRANSFERIDA).
 * @param {string} protocoloId
 * @param {string} [obs]
 * @param {string} emailFallback
 */
function ctrl_chaves_confirmar_transferencia(protocoloId, obs, emailFallback) {
  return GasResponse.wrap(function () {
    if (!protocoloId) throw new Error('ID do protocolo é obrigatório');
    var email = obterEmailUsuario(emailFallback || '');
    return chaves_confirmarTransferencia(protocoloId, obs || '', email);
  }, 'ctrl_chaves_confirmar_transferencia');
}

/**
 * Cancela transferência pendente (TRANSFERENCIA_PENDENTE → RETIRADA).
 * @param {string} protocoloId
 * @param {string} [obs]
 * @param {string} emailFallback
 */
function ctrl_chaves_cancelar_transferencia(protocoloId, obs, emailFallback) {
  return GasResponse.wrap(function () {
    if (!protocoloId) throw new Error('ID do protocolo é obrigatório');
    var email = obterEmailUsuario(emailFallback || '');
    return chaves_cancelarTransferencia(protocoloId, obs || '', email);
  }, 'ctrl_chaves_cancelar_transferencia');
}

// ═══════════════════════════════════════════════════════════════════
// FLUXO ENCERRAMENTO
// ═══════════════════════════════════════════════════════════════════

/**
 * Cancela um protocolo ativo.
 * @param {string} protocoloId
 * @param {string} [motivo]
 * @param {string} emailFallback
 */
function ctrl_chaves_cancelar(protocoloId, motivo, emailFallback) {
  return GasResponse.wrap(function () {
    if (!protocoloId) throw new Error('ID do protocolo é obrigatório');
    var email = obterEmailUsuario(emailFallback || '');
    return chaves_cancelar(protocoloId, motivo || '', email);
  }, 'ctrl_chaves_cancelar');
}

/**
 * Nega um protocolo solicitado (somente infraestrutura/admin).
 * @param {string} protocoloId
 * @param {string} [motivo]
 * @param {string} emailFallback
 */
function ctrl_chaves_negar(protocoloId, motivo, emailFallback) {
  return GasResponse.wrap(function () {
    if (!protocoloId) throw new Error('ID do protocolo é obrigatório');
    var email = obterEmailUsuario(emailFallback || '');
    return chaves_negar(protocoloId, motivo || '', email);
  }, 'ctrl_chaves_negar');
}

// ═══════════════════════════════════════════════════════════════════
// FLUXO OPERACIONAL (sem etapas intermediárias)
// ═══════════════════════════════════════════════════════════════════

/**
 * Retirada operacional direta (infraestrutura entrega e confirma em um passo).
 * @param {Object} dados
 * @param {string} emailFallback
 */
function ctrl_chaves_retirada_operacional(dados, emailFallback) {
  return GasResponse.wrap(function () {
    if (!dados || typeof dados !== 'object') throw new Error('Dados da retirada operacional são obrigatórios');
    var email = obterEmailUsuario(emailFallback || '');
    return chaves_retiradaOperacional(dados, email);
  }, 'ctrl_chaves_retirada_operacional');
}

/**
 * Devolução operacional direta (infraestrutura confirma em um passo).
 * @param {string} protocoloId
 * @param {string} [obs]
 * @param {string} emailFallback
 */
function ctrl_chaves_devolucao_operacional(protocoloId, obs, emailFallback) {
  return GasResponse.wrap(function () {
    if (!protocoloId) throw new Error('ID do protocolo é obrigatório');
    var email = obterEmailUsuario(emailFallback || '');
    return chaves_devolucaoOperacional(protocoloId, obs || '', email);
  }, 'ctrl_chaves_devolucao_operacional');
}

/**
 * Transferência operacional direta (sem etapa de confirmação pelo destinatário).
 * @param {string} protocoloId
 * @param {string} destinoNome
 * @param {string} destinoSetor
 * @param {string} [obs]
 * @param {string} emailFallback
 */
function ctrl_chaves_transferencia_operacional(protocoloId, destinoNome, destinoSetor, obs, emailFallback) {
  return GasResponse.wrap(function () {
    if (!protocoloId)   throw new Error('ID do protocolo é obrigatório');
    if (!destinoNome)   throw new Error('Nome do destino é obrigatório');
    if (!destinoSetor)  throw new Error('Setor do destino é obrigatório');
    var email = obterEmailUsuario(emailFallback || '');
    return chaves_transferenciaOperacional(protocoloId, destinoNome, destinoSetor, obs || '', email);
  }, 'ctrl_chaves_transferencia_operacional');
}
