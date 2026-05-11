/**
 * @file backend/controllers/comunicacao_processos_controller.gs
 * @layer backend/controllers
 * @description Fachada oficial do domínio Comunicação-Processos.
 *
 * REGRA ARQUITETURAL:
 *   - A bridge aponta APENAS para funções ctrl_com_proc_* e ctrl_com_entr_*.
 *   - Toda resposta é GasResponse: { ok, data, error, metadata }.
 *
 * @depends shared/response.gs (GasResponse),
 *          modules/comunicacao/mod_comunicacao_processos.gs,
 *          backend/mod_admin.gs (obterEmailUsuario)
 */

// ═══════════════════════════════════════════════════════════════════
// PROCESSOS DE COMUNICAÇÃO
// ═══════════════════════════════════════════════════════════════════

function ctrl_com_proc_listar(emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return listarProcessosComunicacao();
  }, 'ctrl_com_proc_listar');
}

function ctrl_com_proc_criar(dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!dados || typeof dados !== 'object') throw new Error('Dados do processo são obrigatórios.');
    obterEmailUsuario(emailFallback || '');
    return criarProcessoComunicacao(dados);
  }, 'ctrl_com_proc_criar');
}

function ctrl_com_proc_atualizar(id, dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id)   throw new Error('ID do processo é obrigatório.');
    if (!dados || typeof dados !== 'object') throw new Error('Dados são obrigatórios.');
    obterEmailUsuario(emailFallback || '');
    return atualizarProcessoComunicacao(id, dados);
  }, 'ctrl_com_proc_atualizar');
}

function ctrl_com_proc_excluir(id, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID do processo é obrigatório.');
    obterEmailUsuario(emailFallback || '');
    return excluirProcessoComunicacao(id);
  }, 'ctrl_com_proc_excluir');
}

function ctrl_com_proc_mudar_status(id, status, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id)     throw new Error('ID do processo é obrigatório.');
    if (!status) throw new Error('Status é obrigatório.');
    obterEmailUsuario(emailFallback || '');
    return atualizarProcessoComunicacao(id, { status: status });
  }, 'ctrl_com_proc_mudar_status');
}

function ctrl_com_proc_solicitar_alteracao(id, texto, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id)    throw new Error('ID do processo é obrigatório.');
    if (!texto) throw new Error('Texto é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    return solicitarAlteracaoProcesso(id, texto, email);
  }, 'ctrl_com_proc_solicitar_alteracao');
}

function ctrl_com_proc_responder_revisao(id, status, resposta, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id)     throw new Error('ID do processo é obrigatório.');
    if (!status) throw new Error('Status é obrigatório.');
    obterEmailUsuario(emailFallback || '');
    return responderRevisaoProcesso(id, status, resposta || '');
  }, 'ctrl_com_proc_responder_revisao');
}

// ═══════════════════════════════════════════════════════════════════
// ENTREGAS
// ═══════════════════════════════════════════════════════════════════

function ctrl_com_entr_listar(idProcesso, emailFallback) {
  return GasResponse.wrap(function() {
    if (!idProcesso) throw new Error('ID do processo é obrigatório.');
    obterEmailUsuario(emailFallback || '');
    return listarEntregasPorProcesso(idProcesso);
  }, 'ctrl_com_entr_listar');
}

function ctrl_com_entr_atualizar(idEntrega, dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!idEntrega) throw new Error('ID da entrega é obrigatório.');
    if (!dados || typeof dados !== 'object') throw new Error('Dados são obrigatórios.');
    obterEmailUsuario(emailFallback || '');
    return atualizarEntregaComunicacao(idEntrega, dados);
  }, 'ctrl_com_entr_atualizar');
}

// REVISÃO

function ctrl_com_revisao_responder_como_funcao(id, mensagem, autor, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id)       throw new Error('ID da tarefa é obrigatório.');
    if (!mensagem) throw new Error('Mensagem é obrigatória.');
    obterEmailUsuario(emailFallback || '');
    return responderTarefaComoFuncao(id, mensagem, autor || '');
  }, 'ctrl_com_revisao_responder_como_funcao');
}
