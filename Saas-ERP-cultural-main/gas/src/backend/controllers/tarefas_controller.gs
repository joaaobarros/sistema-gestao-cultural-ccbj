/**
 * @file backend/controllers/tarefas_controller.gs
 * @layer backend/controllers
 * @description Fachada oficial do domínio Tarefas.
 *
 * REGRA ARQUITETURAL:
 *   - A bridge aponta APENAS para funções ctrl_tarefas_*.
 *   - Toda resposta é GasResponse: { ok, data, error, metadata }.
 *
 * @depends shared/response.gs (GasResponse),
 *          modules/pessoal/mod_pessoal.gs (obterTarefas, salvarTarefa,
 *            excluirTarefa, listarTarefasPorFuncao, atribuirExecutoresTarefa,
 *            responderTarefaComoFuncao, salvarOrdemKanban),
 *          backend/mod_admin.gs (obterEmailUsuario)
 */

function ctrl_tarefas_listar(emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return obterTarefas();
  }, 'ctrl_tarefas_listar');
}

function ctrl_tarefas_salvar(dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!dados || typeof dados !== 'object') throw new Error('Dados da tarefa são obrigatórios.');
    obterEmailUsuario(emailFallback || '');
    return salvarTarefa(dados);
  }, 'ctrl_tarefas_salvar');
}

function ctrl_tarefas_excluir(id, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID da tarefa é obrigatório.');
    obterEmailUsuario(emailFallback || '');
    return excluirTarefa(id);
  }, 'ctrl_tarefas_excluir');
}

function ctrl_tarefas_salvar_ordem_kanban(ordens, emailFallback) {
  return GasResponse.wrap(function() {
    if (!Array.isArray(ordens)) throw new Error('Ordens devem ser um array.');
    obterEmailUsuario(emailFallback || '');
    return salvarOrdemKanban(ordens);
  }, 'ctrl_tarefas_salvar_ordem_kanban');
}

function ctrl_tarefas_listar_por_funcao(funcao, emailFallback) {
  return GasResponse.wrap(function() {
    if (!funcao) throw new Error('Função é obrigatória.');
    obterEmailUsuario(emailFallback || '');
    return listarTarefasPorFuncao(funcao);
  }, 'ctrl_tarefas_listar_por_funcao');
}

function ctrl_tarefas_atribuir_executores(id, emails, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID da tarefa é obrigatório.');
    if (!emails || !Array.isArray(emails)) throw new Error('Lista de emails é obrigatória.');
    obterEmailUsuario(emailFallback || '');
    return atribuirExecutoresTarefa(id, emails);
  }, 'ctrl_tarefas_atribuir_executores');
}

function ctrl_tarefas_responder_como_funcao(id, mensagem, autor, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id)       throw new Error('ID da tarefa é obrigatório.');
    if (!mensagem) throw new Error('Mensagem é obrigatória.');
    obterEmailUsuario(emailFallback || '');
    return responderTarefaComoFuncao(id, mensagem, autor || '');
  }, 'ctrl_tarefas_responder_como_funcao');
}

// Processos de trabalho interno (mod_pessoal.gs)

function ctrl_processos_listar(emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return obterProcessos();
  }, 'ctrl_processos_listar');
}

function ctrl_processos_salvar(dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!dados || typeof dados !== 'object') throw new Error('Dados do processo são obrigatórios.');
    obterEmailUsuario(emailFallback || '');
    return salvarProcesso(dados);
  }, 'ctrl_processos_salvar');
}

function ctrl_processos_excluir(id, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID do processo é obrigatório.');
    obterEmailUsuario(emailFallback || '');
    return excluirProcesso(id);
  }, 'ctrl_processos_excluir');
}
