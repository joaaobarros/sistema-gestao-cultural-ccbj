/**
 * @file backend/controllers/rh_controller.gs
 * @layer backend/controllers
 * @description Fachada oficial do domínio RH.
 *
 * REGRAS DE SEGURANÇA:
 *   - TODA função lê o email da sessão e verifica nível via _ctrlRhNivel().
 *   - Colaborador comum: acesso restrito aos próprios dados, sem dados financeiros.
 *   - Gestor: acesso aos subordinados, sem dados rescisórios/financeiros completos.
 *   - RH/admin/superadmin: acesso total com auditoria em dados sensíveis.
 *   - Backend é a única fonte de verdade — restrições não dependem de frontend.
 *   - Desligamento é um fluxo separado (ctrl_rh_registrar_desligamento).
 *   - Simulação de rescisão é separada de rescisão oficial.
 *
 * @depends shared/response.gs (GasResponse),
 *          modules/rh/rh_engine.gs (RHEngine),
 *          backend/mod_admin.gs (obterEmailUsuario)
 */

// ═══════════════════════════════════════════════════════════════════
// CARGOS
// ═══════════════════════════════════════════════════════════════════

function ctrl_rh_listar_cargos(emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return RHEngine.listarCargos();
  }, 'ctrl_rh_listar_cargos');
}

function ctrl_rh_salvar_cargo(dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!dados || typeof dados !== 'object') throw new Error('Dados do cargo são obrigatórios.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh')
      throw new Error('Apenas RH pode gerenciar cargos.');
    return { id: RHEngine.salvarCargo(dados, email) };
  }, 'ctrl_rh_salvar_cargo');
}

function ctrl_rh_excluir_cargo(id, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID do cargo é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh')
      throw new Error('Apenas RH pode excluir cargos.');
    RHEngine.excluirCargo(id, email);
    return { ok: true };
  }, 'ctrl_rh_excluir_cargo');
}

// ═══════════════════════════════════════════════════════════════════
// HISTÓRICO FUNCIONAL
// Regras:
//   colaborador → próprio histórico, sem eventos sensíveis (desligamento, alteracaoSalarial)
//   gestor      → colaboradores especificados, sem dados rescisórios
//   rh/admin/superadmin → acesso total com auditoria
// ═══════════════════════════════════════════════════════════════════

function ctrl_rh_historico(idColaborador, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);

    if (nivel === 'usuario') {
      var idProprio = _ctrlRhIdColaboradorPorEmail(email);
      if (!idProprio)
        throw new Error('Seu cadastro de colaborador não foi encontrado. Contate o RH.');
      if (idColaborador && idColaborador !== idProprio)
        throw new Error('Acesso negado: você só pode visualizar seu próprio histórico funcional.');
      _ctrlRhAudit('RH_HISTORICO_ACESSADO_PROPRIO', email, { idColaborador: idProprio });
      return RHEngine.listarHistoricoFiltrado(idProprio, 'colaborador');
    }

    if (nivel === 'gestor') {
      if (!idColaborador)
        throw new Error('Gestor deve especificar um colaborador para consulta.');
      _ctrlRhAudit('RH_HISTORICO_ACESSADO_GESTOR', email, { idColaborador: idColaborador });
      return RHEngine.listarHistoricoFiltrado(idColaborador, 'gestor');
    }

    // RH / admin / superadmin: acesso completo
    _ctrlRhAudit('RH_HISTORICO_ACESSADO_COMPLETO', email,
      { idColaborador: idColaborador || 'todos' });
    return RHEngine.listarHistorico(idColaborador || null);
  }, 'ctrl_rh_historico');
}

function ctrl_rh_registrar_evento(dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!dados || typeof dados !== 'object') throw new Error('Dados do evento são obrigatórios.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh')
      throw new Error('Registro de eventos no histórico requer perfil RH.');
    if (dados.tipo === 'desligamento')
      throw new Error('Use o endpoint de desligamento oficial para registrar desligamentos.');
    return { id: RHEngine.registrarEvento(dados, email) };
  }, 'ctrl_rh_registrar_evento');
}

function ctrl_rh_excluir_evento(id, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID do evento é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh')
      throw new Error('Apenas RH pode excluir eventos do histórico funcional.');
    RHEngine.excluirEvento(id, email);
    return { ok: true };
  }, 'ctrl_rh_excluir_evento');
}

// ═══════════════════════════════════════════════════════════════════
// HISTÓRICO ESTRUTURADO — EVENTO COM SCHEMA ADAPTATIVO
// ═══════════════════════════════════════════════════════════════════

function ctrl_rh_registrar_evento_estruturado(dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!dados || !dados.tipo || !dados.idColaborador)
      throw new Error('tipo e idColaborador são obrigatórios.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh')
      throw new Error('Registro de eventos no histórico requer perfil RH.');
    // Desligamento obrigatoriamente vai pelo fluxo oficial com cálculo automático
    if (dados.tipo === 'desligamento') {
      _ctrlRhAudit('RH_DESLIGAMENTO_INICIADO', email, { idColaborador: dados.idColaborador });
      return RHEngine.registrarDesligamento(dados, email);
    }
    return { id: RHEngine.registrarEvento(dados, email) };
  }, 'ctrl_rh_registrar_evento_estruturado');
}

// ═══════════════════════════════════════════════════════════════════
// DESLIGAMENTO OFICIAL
// Fluxo separado da simulação: gera cálculo rescisório, registra evento
// e atualiza status do colaborador. Acesso: apenas RH/admin/superadmin.
// ═══════════════════════════════════════════════════════════════════

function ctrl_rh_registrar_desligamento(dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!dados || !dados.idColaborador)
      throw new Error('idColaborador é obrigatório para registrar desligamento.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh')
      throw new Error('Apenas RH pode registrar desligamentos oficiais.');
    _ctrlRhAudit('RH_DESLIGAMENTO_INICIADO', email, { idColaborador: dados.idColaborador });
    return RHEngine.registrarDesligamento(dados, email);
  }, 'ctrl_rh_registrar_desligamento');
}

// ═══════════════════════════════════════════════════════════════════
// AVALIAÇÕES
// ═══════════════════════════════════════════════════════════════════

function ctrl_rh_avaliacoes(idColaborador, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel === 'usuario') {
      var idProprio = _ctrlRhIdColaboradorPorEmail(email);
      if (!idProprio) throw new Error('Colaborador não encontrado no cadastro.');
      if (idColaborador && idColaborador !== idProprio)
        throw new Error('Acesso negado: você só pode visualizar suas próprias avaliações.');
      return RHEngine.listarAvaliacoes(idProprio);
    }
    return RHEngine.listarAvaliacoes(idColaborador || null);
  }, 'ctrl_rh_avaliacoes');
}

function ctrl_rh_salvar_avaliacao(dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!dados || typeof dados !== 'object') throw new Error('Dados da avaliação são obrigatórios.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh' && nivel !== 'gestor')
      throw new Error('Apenas RH e gestores podem registrar avaliações.');
    return { id: RHEngine.salvarAvaliacao(dados, email) };
  }, 'ctrl_rh_salvar_avaliacao');
}

function ctrl_rh_excluir_avaliacao(id, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID da avaliação é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh')
      throw new Error('Apenas RH pode excluir avaliações.');
    RHEngine.excluirAvaliacao(id, email);
    return { ok: true };
  }, 'ctrl_rh_excluir_avaliacao');
}

// ═══════════════════════════════════════════════════════════════════
// PONTO / FREQUÊNCIA
// ═══════════════════════════════════════════════════════════════════

function ctrl_rh_ponto(idColaborador, mes, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel === 'usuario') {
      var idProprio = _ctrlRhIdColaboradorPorEmail(email);
      if (!idProprio) throw new Error('Colaborador não encontrado no cadastro.');
      if (idColaborador && idColaborador !== idProprio)
        throw new Error('Acesso negado: você só pode visualizar sua própria frequência.');
      return RHEngine.listarPonto(idProprio, mes || null);
    }
    return RHEngine.listarPonto(idColaborador || null, mes || null);
  }, 'ctrl_rh_ponto');
}

function ctrl_rh_registrar_ponto(dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!dados || typeof dados !== 'object') throw new Error('Dados do ponto são obrigatórios.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh' && nivel !== 'gestor')
      throw new Error('Apenas RH e gestores podem registrar frequência.');
    return { id: RHEngine.registrarPonto(dados, email) };
  }, 'ctrl_rh_registrar_ponto');
}

function ctrl_rh_excluir_ponto(id, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID do ponto é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh')
      throw new Error('Apenas RH pode excluir registros de frequência.');
    RHEngine.excluirPonto(id, email);
    return { ok: true };
  }, 'ctrl_rh_excluir_ponto');
}

// ═══════════════════════════════════════════════════════════════════
// DOCUMENTOS
// ═══════════════════════════════════════════════════════════════════

function ctrl_rh_documentos(idColaborador, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel === 'usuario') {
      var idProprio = _ctrlRhIdColaboradorPorEmail(email);
      if (!idProprio) throw new Error('Colaborador não encontrado no cadastro.');
      if (idColaborador && idColaborador !== idProprio)
        throw new Error('Acesso negado: você só pode visualizar seus próprios documentos.');
      return RHEngine.listarDocumentos(idProprio);
    }
    return RHEngine.listarDocumentos(idColaborador || null);
  }, 'ctrl_rh_documentos');
}

function ctrl_rh_salvar_documento(dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!dados || typeof dados !== 'object') throw new Error('Dados do documento são obrigatórios.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh')
      throw new Error('Apenas RH pode gerenciar documentos de colaboradores.');
    return { id: RHEngine.salvarDocumento(dados, email) };
  }, 'ctrl_rh_salvar_documento');
}

function ctrl_rh_excluir_documento(id, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID do documento é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh')
      throw new Error('Apenas RH pode excluir documentos.');
    RHEngine.excluirDocumento(id, email);
    return { ok: true };
  }, 'ctrl_rh_excluir_documento');
}

// ═══════════════════════════════════════════════════════════════════
// FOLHA DE PAGAMENTO — restrito a RH/admin/superadmin
// ═══════════════════════════════════════════════════════════════════

function ctrl_rh_folha(mes, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh')
      throw new Error('Folha de pagamento disponível apenas para RH.');
    _ctrlRhAudit('RH_FOLHA_ACESSADA', email, { mes: mes || 'todos' });
    return RHEngine.listarFolha(mes || null);
  }, 'ctrl_rh_folha');
}

function ctrl_rh_salvar_folha(dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!dados || typeof dados !== 'object') throw new Error('Dados da folha são obrigatórios.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh')
      throw new Error('Apenas RH pode gerenciar folha de pagamento.');
    return { id: RHEngine.salvarFolha(dados, email) };
  }, 'ctrl_rh_salvar_folha');
}

function ctrl_rh_simular_folha(dados, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh')
      throw new Error('Simulação de folha disponível apenas para RH.');
    return RHEngine.simularFolha(dados || {});
  }, 'ctrl_rh_simular_folha');
}

// ═══════════════════════════════════════════════════════════════════
// PERFIL SOCIAL (LGPD)
// Colaborador vê/edita apenas o próprio. RH vê todos.
// ═══════════════════════════════════════════════════════════════════

function ctrl_rh_perfil_social(idColaborador, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel === 'usuario') {
      var idProprio = _ctrlRhIdColaboradorPorEmail(email);
      if (!idProprio) throw new Error('Colaborador não encontrado no cadastro.');
      if (idColaborador && idColaborador !== idProprio)
        throw new Error('Acesso negado: você só pode visualizar seu próprio perfil.');
      // Sem idColaborador: retorna o perfil do próprio usuário
      return RHEngine.obterPerfilSocial(idProprio);
    }
    return RHEngine.obterPerfilSocial(idColaborador || '');
  }, 'ctrl_rh_perfil_social');
}

function ctrl_rh_salvar_perfil_social(dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!dados || typeof dados !== 'object') throw new Error('Dados do perfil são obrigatórios.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel === 'usuario') {
      var idProprio = _ctrlRhIdColaboradorPorEmail(email);
      if (!idProprio || dados.idColaborador !== idProprio)
        throw new Error('Você só pode atualizar seu próprio perfil social.');
    }
    return { id: RHEngine.salvarPerfilSocial(dados, email) };
  }, 'ctrl_rh_salvar_perfil_social');
}

// ═══════════════════════════════════════════════════════════════════
// INDICADORES E DIVERSIDADE
// ═══════════════════════════════════════════════════════════════════

function ctrl_rh_indicadores(emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel === 'usuario')
      throw new Error('Indicadores RH disponíveis apenas para gestores e equipe RH.');
    return RHEngine.obterIndicadores();
  }, 'ctrl_rh_indicadores');
}

function ctrl_rh_diversidade(emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh')
      throw new Error('Dados de diversidade disponíveis apenas para RH.');
    return RHEngine.obterDiversidade();
  }, 'ctrl_rh_diversidade');
}

// ═══════════════════════════════════════════════════════════════════
// PCCS
// ═══════════════════════════════════════════════════════════════════

function ctrl_rh_pccs(emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return RHEngine.obterPCCSCompleto();
  }, 'ctrl_rh_pccs');
}

function ctrl_rh_salvar_params_pccs(params, emailFallback) {
  return GasResponse.wrap(function() {
    if (!params || typeof params !== 'object') throw new Error('Parâmetros PCCS são obrigatórios.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh')
      throw new Error('Apenas RH pode alterar parâmetros PCCS.');
    RHEngine.salvarParametrosPCCS(params, email);
    return { ok: true };
  }, 'ctrl_rh_salvar_params_pccs');
}

function ctrl_rh_aplicar_reajuste_pccs(percentual, emailFallback) {
  return GasResponse.wrap(function() {
    if (percentual === undefined || percentual === null) throw new Error('Percentual é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh')
      throw new Error('Apenas RH pode aplicar reajustes PCCS.');
    return RHEngine.aplicarReajuste(percentual, email);
  }, 'ctrl_rh_aplicar_reajuste_pccs');
}

function ctrl_rh_salvar_tabela_pccs(row, emailFallback) {
  return GasResponse.wrap(function() {
    if (!row || typeof row !== 'object') throw new Error('Dados da linha são obrigatórios.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh')
      throw new Error('Apenas RH pode editar a tabela PCCS.');
    return { id: RHEngine.salvarTabelaRow(row, email) };
  }, 'ctrl_rh_salvar_tabela_pccs');
}

function ctrl_rh_cargos_pccs(emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return RHEngine.listarCargosPCCS();
  }, 'ctrl_rh_cargos_pccs');
}

function ctrl_rh_salvar_cargo_pccs(dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!dados || typeof dados !== 'object') throw new Error('Dados do cargo PCCS são obrigatórios.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh')
      throw new Error('Apenas RH pode gerenciar cargos PCCS.');
    return { id: RHEngine.salvarCargoPCCS(dados, email) };
  }, 'ctrl_rh_salvar_cargo_pccs');
}

function ctrl_rh_excluir_cargo_pccs(id, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID do cargo PCCS é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh')
      throw new Error('Apenas RH pode excluir cargos PCCS.');
    RHEngine.excluirCargoPCCS(id, email);
    return { ok: true };
  }, 'ctrl_rh_excluir_cargo_pccs');
}

// ═══════════════════════════════════════════════════════════════════
// FÉRIAS
// ═══════════════════════════════════════════════════════════════════

function ctrl_rh_listar_ferias(idColaborador, emailFallback) {
  return GasResponse.wrap(function() {
    var email  = obterEmailUsuario(emailFallback || '');
    var nivel  = _ctrlRhNivel(email);
    // Colaborador vê apenas as próprias férias
    if (nivel === 'usuario') {
      var idProprio = _ctrlRhIdColaboradorPorEmail(email);
      if (!idProprio) throw new Error('Colaborador não encontrado.');
      if (idColaborador && idColaborador !== idProprio)
        throw new Error('Acesso negado: você só pode visualizar suas próprias férias.');
      return RHEngine.listarFerias(idProprio, email, nivel);
    }
    return RHEngine.listarFerias(idColaborador || null, email, nivel);
  }, 'ctrl_rh_listar_ferias');
}

function ctrl_rh_solicitar_ferias(dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!dados || typeof dados !== 'object') throw new Error('Dados de férias são obrigatórios.');
    var email = obterEmailUsuario(emailFallback || '');
    return { id: RHEngine.solicitarFerias(dados, email) };
  }, 'ctrl_rh_solicitar_ferias');
}

function ctrl_rh_aprovar_ferias(id, dadosAprovacao, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID das férias é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh')
      throw new Error('Apenas RH pode aprovar férias.');
    return RHEngine.aprovarFerias(id, dadosAprovacao || {}, email);
  }, 'ctrl_rh_aprovar_ferias');
}

function ctrl_rh_reprovar_ferias(id, motivo, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID das férias é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh')
      throw new Error('Apenas RH pode reprovar férias.');
    RHEngine.reprovarFerias(id, motivo || '', email);
    return { ok: true };
  }, 'ctrl_rh_reprovar_ferias');
}

function ctrl_rh_ajuste_ferias(id, observacao, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID das férias é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh')
      throw new Error('Apenas RH pode solicitar ajuste de férias.');
    RHEngine.solicitarAjusteFerias(id, observacao || '', email);
    return { ok: true };
  }, 'ctrl_rh_ajuste_ferias');
}

function ctrl_rh_reenviar_ferias(id, novasDatas, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id || !novasDatas) throw new Error('ID e novas datas são obrigatórios.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    // Reenvio: permitido ao próprio colaborador (status pendente_ajuste) ou RH/admin
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh') {
      var idProprio = _ctrlRhIdColaboradorPorEmail(email);
      if (!idProprio) throw new Error('Colaborador não encontrado no cadastro.');
      // validação do dono é feita pela FSM — apenas log de acesso
    }
    RHEngine.reenviarFerias(id, novasDatas, email);
    return { ok: true };
  }, 'ctrl_rh_reenviar_ferias');
}

function ctrl_rh_concluir_ferias(id, dadosConclusao, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID das férias é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh')
      throw new Error('Apenas RH pode concluir férias.');
    return RHEngine.concluirFerias(id, dadosConclusao || {}, email);
  }, 'ctrl_rh_concluir_ferias');
}

function ctrl_rh_cancelar_ferias(id, motivo, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID das férias é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    // Cancelamento: RH/admin/superadmin ou o próprio colaborador solicitante
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh' && nivel !== 'gestor') {
      var idProprio = _ctrlRhIdColaboradorPorEmail(email);
      if (!idProprio) throw new Error('Acesso negado: colaborador não encontrado no cadastro.');
      // A FSM garante que só status canceláveis podem ser cancelados
    }
    RHEngine.cancelarFerias(id, motivo || '', email);
    return { ok: true };
  }, 'ctrl_rh_cancelar_ferias');
}

function ctrl_rh_saldo_ferias(idColaborador, emailFallback) {
  return GasResponse.wrap(function() {
    if (!idColaborador) throw new Error('idColaborador é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    // Colaborador pode ver próprio saldo
    if (nivel === 'usuario') {
      var idProprio = _ctrlRhIdColaboradorPorEmail(email);
      if (!idProprio || idColaborador !== idProprio)
        throw new Error('Acesso negado: você só pode consultar seu próprio saldo de férias.');
    }
    return RHEngine.saldoFerias(idColaborador);
  }, 'ctrl_rh_saldo_ferias');
}

function ctrl_rh_alertas_ferias(emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh')
      throw new Error('Acesso restrito ao RH.');
    return FeriasEngine.listarAlertas();
  }, 'ctrl_rh_alertas_ferias');
}

function ctrl_rh_verificar_alertas_ferias(emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh')
      throw new Error('Acesso restrito ao RH.');
    return FeriasEngine.verificarAlertas();
  }, 'ctrl_rh_verificar_alertas_ferias');
}

// ═══════════════════════════════════════════════════════════════════
// AUTOCOMPLETE DE USUÁRIOS / EMAILS CADASTRADOS
// ═══════════════════════════════════════════════════════════════════

function ctrl_rh_usuarios_autocomplete(emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh' && nivel !== 'gestor')
      throw new Error('Autocomplete de usuários disponível apenas para gestores e RH.');

    var funcionarios = readJSON('funcionarios.json') || [];
    var usuarios     = readJSON('usuarios_sistema.json') || [];
    var mapa = {};

    funcionarios.forEach(function(f) {
      var em = (f.emailInstitucional || f.email || '').toLowerCase().trim();
      if (em) mapa[em] = { nome: f.nome || em, email: em, origem: 'rh' };
    });
    (usuarios || []).forEach(function(u) {
      var em = (u.email || '').toLowerCase().trim();
      if (em && !mapa[em])
        mapa[em] = { nome: u.nome || em, email: em, origem: 'sistema' };
    });

    var logAcessos = _getSheet('LogAcessos');
    if (logAcessos) {
      // getDisplayValues() garante strings mesmo em colunas de data/hora
      var vals = logAcessos.getDataRange().getDisplayValues();
      for (var i = 1; i < vals.length; i++) {
        // LogAcessos: [Data/Hora, Email, Nome, Nível, IP, UserAgent]
        var em = String(vals[i][1] || '').toLowerCase().trim();
        var nm = String(vals[i][2] || '').trim();
        if (em && !mapa[em]) mapa[em] = { nome: nm || em, email: em, origem: 'log' };
      }
    }

    return Object.values(mapa).sort(function(a, b) {
      return (a.nome || '').localeCompare(b.nome || '');
    });
  }, 'ctrl_rh_usuarios_autocomplete');
}

// ═══════════════════════════════════════════════════════════════════
// CALCULADORA DE FOLHA (SIMULAÇÃO)
// ═══════════════════════════════════════════════════════════════════

function ctrl_rh_simular_folha_detalhada(dados, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh')
      throw new Error('Simulação de folha disponível apenas para RH.');
    return RHEngine.simularFolhaDetalhada(dados || {});
  }, 'ctrl_rh_simular_folha_detalhada');
}

// ═══════════════════════════════════════════════════════════════════
// RESCISÃO — SIMULAÇÃO
// Cálculo preliminar/projeção. NÃO é registro oficial.
// NÃO altera status do colaborador. NÃO aparece no histórico funcional.
// ═══════════════════════════════════════════════════════════════════

function ctrl_rh_calcular_rescisao(params, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'rh' && nivel !== 'admin')
      throw new Error('Cálculo de rescisão disponível apenas para RH.');
    _ctrlRhAudit('RH_RESCISAO_CALCULADA', email,
      { tipo: (params || {}).tipoRescisao, colaborador: (params || {}).idColaborador });
    return RHEngine.calcularRescisao(params || {});
  }, 'ctrl_rh_calcular_rescisao');
}

function ctrl_rh_salvar_simulacao_rescisao(calculo, idColaborador, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'rh' && nivel !== 'admin')
      throw new Error('Apenas RH pode salvar simulações de rescisão.');
    var id = RHEngine.salvarSimulacaoRescisao(calculo || {}, idColaborador, email);
    _ctrlRhAudit('RH_SIMULACAO_RESCISAO_SALVA', email, { id: id, idColaborador: idColaborador });
    return { id: id, tipoRegistro: 'simulacao' };
  }, 'ctrl_rh_salvar_simulacao_rescisao');
}

function ctrl_rh_listar_simulacoes_rescisao(idColaborador, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'rh' && nivel !== 'admin')
      throw new Error('Acesso restrito ao RH.');
    return RHEngine.listarSimulacoesRescisao(idColaborador || null);
  }, 'ctrl_rh_listar_simulacoes_rescisao');
}

// ═══════════════════════════════════════════════════════════════════
// RESCISÃO — OFICIAL (somente via desligamento confirmado)
// ═══════════════════════════════════════════════════════════════════

function ctrl_rh_listar_rescisoes(idColaborador, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'rh' && nivel !== 'admin')
      throw new Error('Acesso restrito ao RH.');
    _ctrlRhAudit('RH_RESCISOES_LISTADAS', email, { idColaborador: idColaborador || 'todos' });
    return RHEngine.listarRescisoes(idColaborador || null);
  }, 'ctrl_rh_listar_rescisoes');
}

function ctrl_rh_obter_rescisao(id, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'rh' && nivel !== 'admin')
      throw new Error('Acesso restrito ao RH.');
    _ctrlRhAudit('RH_RESCISAO_ACESSADA', email, { id: id });
    return RHEngine.obterRescisao(id);
  }, 'ctrl_rh_obter_rescisao');
}

// ═══════════════════════════════════════════════════════════════════
// PARÂMETROS FISCAIS — INSS, IRRF, FGTS, encargos, verbas rescisórias
// Acesso: superadmin / admin / rh
// ═══════════════════════════════════════════════════════════════════

function ctrl_rh_params_fiscais(emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh')
      throw new Error('Acesso restrito ao RH.');
    return ParametrosFiscaisRH.obter();
  }, 'ctrl_rh_params_fiscais');
}

function ctrl_rh_salvar_params_fiscais(campos, emailFallback) {
  return GasResponse.wrap(function() {
    if (!campos || typeof campos !== 'object')
      throw new Error('Campos a alterar são obrigatórios.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin')
      throw new Error('Edição de parâmetros fiscais requer perfil admin ou superadmin.');
    _ctrlRhAudit('RH_PARAMS_FISCAIS_EDITADOS', email, { campos: Object.keys(campos) });
    return ParametrosFiscaisRH.salvar(campos, email);
  }, 'ctrl_rh_salvar_params_fiscais');
}

function ctrl_rh_aplicar_tabela_fiscal_oficial(ano, emailFallback) {
  return GasResponse.wrap(function() {
    if (!ano) throw new Error('Ano é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin')
      throw new Error('Aplicação de tabela oficial requer perfil admin ou superadmin.');
    _ctrlRhAudit('RH_TABELA_FISCAL_OFICIAL_APLICADA', email, { ano: ano });
    return ParametrosFiscaisRH.aplicarTabelaOficial(parseInt(ano), email);
  }, 'ctrl_rh_aplicar_tabela_fiscal_oficial');
}

function ctrl_rh_anos_fiscais_oficiais(emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlRhNivel(email);
    if (nivel !== 'superadmin' && nivel !== 'admin' && nivel !== 'rh')
      throw new Error('Acesso restrito ao RH.');
    return ParametrosFiscaisRH.listarAnosOficiais();
  }, 'ctrl_rh_anos_fiscais_oficiais');
}

// ═══════════════════════════════════════════════════════════════════
// MEU NÍVEL — retorna o nível do usuário atual para UX frontend
// ═══════════════════════════════════════════════════════════════════

function ctrl_rh_meu_nivel(emailFallback) {
  return GasResponse.wrap(function() {
    var email       = obterEmailUsuario(emailFallback || '');
    var nivel       = _ctrlRhNivel(email);
    var idColab     = _ctrlRhIdColaboradorPorEmail(email);
    return { nivel: nivel, idColaborador: idColab };
  }, 'ctrl_rh_meu_nivel');
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS PRIVADOS DO CONTROLLER
// ═══════════════════════════════════════════════════════════════════

function _ctrlRhNivel(email) {
  try {
    if (typeof verificarPermissao === 'function') {
      if (verificarPermissao('superadmin', email)) return 'superadmin';
      if (verificarPermissao('admin', email))      return 'admin';
      if (verificarPermissao('rh', email))         return 'rh';
      if (verificarPermissao('gestor', email))     return 'gestor';
    }
  } catch (_) {}
  return 'usuario';
}

// Resolve o ID do colaborador a partir do e-mail institucional ou pessoal
function _ctrlRhIdColaboradorPorEmail(email) {
  var emailNorm = (email || '').toLowerCase().trim();
  if (!emailNorm) return null;
  var lista = readJSON('funcionarios.json') || [];
  for (var i = 0; i < lista.length; i++) {
    var f = lista[i];
    var eInst = (f.emailInstitucional || '').toLowerCase().trim();
    var ePess = (f.emailPessoal || f.email || '').toLowerCase().trim();
    if (eInst === emailNorm || ePess === emailNorm) return f.id;
  }
  return null;
}

// Registra acesso a dados sensíveis na trilha de auditoria
function _ctrlRhAudit(evento, email, extra) {
  try {
    if (typeof AuditoriaService !== 'undefined')
      AuditoriaService.registrar(evento, 'rh',
        Object.assign({ operador: email }, extra || {}));
  } catch (_) {}
}
