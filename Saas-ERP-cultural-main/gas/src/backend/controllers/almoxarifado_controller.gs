/**
 * @file backend/controllers/almoxarifado_controller.gs
 * @layer backend/controllers
 * @description Fachada oficial do domínio Almoxarifado.
 *
 * REGRA ARQUITETURAL:
 *   - A bridge aponta APENAS para funções ctrl_almoxarifado_*.
 *   - Toda resposta é GasResponse: { ok, data, error, metadata }.
 *
 * @depends shared/response.gs (GasResponse),
 *          modules/almoxarifado/mod_almoxarifado.gs (obterItensAlmoxarifado,
 *            salvarItemAlmoxarifado, excluirItemAlmoxarifado,
 *            movimentarEstoque, obterMovimentacoes),
 *          backend/mod_admin.gs (obterEmailUsuario)
 */

function ctrl_almoxarifado_listar(emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return obterItensAlmoxarifado();
  }, 'ctrl_almoxarifado_listar');
}

function ctrl_almoxarifado_salvar(dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!dados || typeof dados !== 'object') throw new Error('Dados do item são obrigatórios.');
    obterEmailUsuario(emailFallback || '');
    return salvarItemAlmoxarifado(dados);
  }, 'ctrl_almoxarifado_salvar');
}

function ctrl_almoxarifado_excluir(id, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID do item é obrigatório.');
    obterEmailUsuario(emailFallback || '');
    return excluirItemAlmoxarifado(id);
  }, 'ctrl_almoxarifado_excluir');
}

function ctrl_almoxarifado_movimentar(id, tipo, qtd, obs, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id)   throw new Error('ID do item é obrigatório.');
    if (!tipo) throw new Error('Tipo da movimentação é obrigatório.');
    if (qtd === undefined || qtd === null) throw new Error('Quantidade é obrigatória.');
    obterEmailUsuario(emailFallback || '');
    return movimentarEstoque(id, tipo, qtd, obs || '');
  }, 'ctrl_almoxarifado_movimentar');
}

function ctrl_almoxarifado_movimentos(emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return obterMovimentacoes();
  }, 'ctrl_almoxarifado_movimentos');
}

// Balcão (mod_pessoal.gs)

function ctrl_balcao_listar(emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return obterAtendimentos();
  }, 'ctrl_balcao_listar');
}

function ctrl_balcao_salvar(dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!dados || typeof dados !== 'object') throw new Error('Dados do atendimento são obrigatórios.');
    obterEmailUsuario(emailFallback || '');
    return salvarAtendimento(dados);
  }, 'ctrl_balcao_salvar');
}

function ctrl_balcao_excluir(id, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID do atendimento é obrigatório.');
    obterEmailUsuario(emailFallback || '');
    return excluirAtendimento(id);
  }, 'ctrl_balcao_excluir');
}
