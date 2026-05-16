/**
 * @file backend/controllers/processos_inst_controller.gs
 * @layer backend/controllers
 * @description Fachada oficial do domínio Processos Administrativo-Financeiros.
 *              Absorve o fluxo das antigas CIs (Comunicações Internas) e
 *              evolui para engine transversal de processos institucionais.
 *
 *              Responsabilidade: orquestrar as chamadas entre engines especializados
 *              (TarefaEngine, ProcessoInstitucionalEngine) e garantir que vínculos
 *              transversais sejam criados corretamente com timeline consolidada.
 *
 *              REGRA ARQUITETURAL:
 *              - Bridge aponta APENAS para funções ctrl_proc_*.
 *              - Todo retorno via GasResponse: { ok, data, error, metadata }.
 *              - Controller é o ponto de orquestração; engines não se chamam diretamente.
 *
 * @depends shared/response.gs (GasResponse)
 * @depends modules/processos/processo_institucional_engine.gs
 * @depends modules/processos/processo_institucional_repository.gs
 * @depends modules/tarefas/tarefa_engine.gs
 * @depends modules/tarefas/tarefa_repository.gs
 * @depends core/utils.gs (obterEmailUsuario)
 * @depends core/auditoria_service.gs (AuditoriaService)
 */

// ═══════════════════════════════════════════════════════════════
// LEITURA
// ═══════════════════════════════════════════════════════════════

/**
 * Lista processos institucionais com filtros opcionais.
 * @param {Object} filtros — { status, tipo, prioridade, acaoId, setor }
 * @param {string} emailFallback
 */
function ctrl_proc_listar(filtros, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    var perms = obterPermissoesUsuario(email);
    var nivel = (perms && perms.nivel) ? perms.nivel : 'visitante';
    return ProcessoInstitucionalRepository.listarComFiltros(filtros || {}, email, nivel);
  }, 'ctrl_proc_listar');
}

/**
 * Obtém processo pelo ID com dados completos.
 * @param {string} id
 * @param {string} emailFallback
 */
function ctrl_proc_obter(id, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID é obrigatório.');
    obterEmailUsuario(emailFallback || '');
    var proc = ProcessoInstitucionalRepository.obterPorId(id);
    if (!proc) throw new Error('Processo não encontrado: ' + id);
    return proc;
  }, 'ctrl_proc_obter');
}

/**
 * Retorna dashboard completo de um processo: métricas, gargalos, timeline e vínculos.
 * @param {string} id
 * @param {string} emailFallback
 */
function ctrl_proc_dashboard(id, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID é obrigatório.');
    obterEmailUsuario(emailFallback || '');
    return ProcessoInstitucionalEngine.obterDashboard(id);
  }, 'ctrl_proc_dashboard');
}

/**
 * Retorna timeline completa e ordenada de um processo.
 * @param {string} id
 * @param {string} emailFallback
 */
function ctrl_proc_timeline(id, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID é obrigatório.');
    obterEmailUsuario(emailFallback || '');
    return ProcessoInstitucionalEngine.obterTimeline(id);
  }, 'ctrl_proc_timeline');
}

/**
 * Lista processos que têm determinada entidade vinculada.
 * @param {string} tipoEntidade — 'tarefas' | 'reservas' | 'reunioes' | 'contratos'
 * @param {string} entidadeId
 * @param {string} emailFallback
 */
function ctrl_proc_buscar_por_vinculo(tipoEntidade, entidadeId, emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return ProcessoInstitucionalRepository.buscarPorVinculo(tipoEntidade, entidadeId);
  }, 'ctrl_proc_buscar_por_vinculo');
}

// ═══════════════════════════════════════════════════════════════
// ESCRITA — PROCESSO
// ═══════════════════════════════════════════════════════════════

/**
 * Cria novo Processo Institucional.
 * @param {Object} dados — { titulo, descricao, tipo, prioridade, solicitante,
 *                           responsavelAtual, setoresEnvolvidos, acaoId,
 *                           prazo, valorPrevisto }
 * @param {string} emailFallback
 */
function ctrl_proc_criar(dados, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    if (!dados || !dados.titulo) throw new Error('Título é obrigatório.');
    if (!dados.tipo)             throw new Error('Tipo do processo é obrigatório.');

    var proc = ProcessoInstitucionalEngine.criar(dados, email);

    AuditoriaService.registrar('CRIAR', 'processo_institucional', proc.id, {
      titulo: proc.titulo, tipo: proc.tipo
    }, email);

    return proc;
  }, 'ctrl_proc_criar');
}

/**
 * Atualiza campos básicos do processo (sem mudar status).
 * @param {string} id
 * @param {Object} campos — editáveis: titulo, descricao, prioridade, prazo, responsavelAtual, setoresEnvolvidos
 * @param {string} emailFallback
 */
function ctrl_proc_editar(id, campos, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    if (!id)    throw new Error('ID é obrigatório.');
    return ProcessoInstitucionalEngine.editar(id, campos || {}, email);
  }, 'ctrl_proc_editar');
}

/**
 * Avança o status do processo via transição válida.
 * @param {string} id
 * @param {string} novoStatus
 * @param {string} motivo
 * @param {string} emailFallback
 */
function ctrl_proc_mudar_status(id, novoStatus, motivo, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email)     throw new Error('Usuário não identificado.');
    if (!id)        throw new Error('ID é obrigatório.');
    if (!novoStatus) throw new Error('Novo status é obrigatório.');

    var proc = ProcessoInstitucionalEngine.mudarStatus(id, novoStatus, motivo || '', email);

    AuditoriaService.registrar('STATUS', 'processo_institucional', proc.id, {
      novoStatus: novoStatus, motivo: motivo || ''
    }, email);

    return proc;
  }, 'ctrl_proc_mudar_status');
}

/**
 * Adiciona comentário à timeline do processo.
 * @param {string} id
 * @param {string} texto
 * @param {string} emailFallback
 */
function ctrl_proc_comentar(id, texto, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    if (!id)    throw new Error('ID é obrigatório.');
    return ProcessoInstitucionalEngine.adicionarComentario(id, texto, email);
  }, 'ctrl_proc_comentar');
}

// ═══════════════════════════════════════════════════════════════
// ESCRITA — VÍNCULOS
// ═══════════════════════════════════════════════════════════════

/**
 * Cria uma tarefa e a vincula automaticamente ao processo.
 * Ponto de entrada para operações que nascem DO processo.
 * @param {string} processoId
 * @param {Object} dadosTarefa — campos normais de TarefaEngine.criar
 * @param {string} emailFallback
 */
function ctrl_proc_criar_tarefa_vinculada(processoId, dadosTarefa, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email)     throw new Error('Usuário não identificado.');
    if (!processoId) throw new Error('processoId é obrigatório.');
    if (!dadosTarefa || !dadosTarefa.titulo) throw new Error('Título da tarefa é obrigatório.');

    return ProcessoInstitucionalEngine.criarTarefaVinculada(processoId, dadosTarefa, email);
  }, 'ctrl_proc_criar_tarefa_vinculada');
}

/**
 * Vincula tarefa EXISTENTE a um processo.
 * Orquestra: lê a tarefa real → cria snapshot → vincula ao processo.
 * @param {string} processoId
 * @param {string} tarefaId
 * @param {string} emailFallback
 */
function ctrl_proc_vincular_tarefa(processoId, tarefaId, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email)      throw new Error('Usuário não identificado.');
    if (!processoId) throw new Error('processoId é obrigatório.');
    if (!tarefaId)   throw new Error('tarefaId é obrigatório.');

    var tarefa = TarefaRepository.obterPorId(tarefaId);
    if (!tarefa) throw new Error('Tarefa não encontrada: ' + tarefaId);

    // Atualiza referência bidirecional na tarefa
    if (!tarefa.processoId) {
      tarefa.processoId = processoId;
      tarefa.atualizadoEm = new Date().toISOString();
      TarefaRepository.salvar(tarefa);
    }

    return ProcessoInstitucionalEngine.vincularTarefa(processoId, {
      id:          tarefa.id,
      titulo:      tarefa.titulo,
      status:      tarefa.status,
      responsavel: tarefa.responsavel,
      prazo:       tarefa.prazo,
      prioridade:  tarefa.prioridade
    }, email);
  }, 'ctrl_proc_vincular_tarefa');
}

/**
 * Vincula reserva EXISTENTE a um processo.
 * @param {string} processoId
 * @param {Object} dadosReserva — { id, espaco, data, inicio, fim, status, responsavel }
 * @param {string} emailFallback
 */
function ctrl_proc_vincular_reserva(processoId, dadosReserva, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email)      throw new Error('Usuário não identificado.');
    if (!processoId) throw new Error('processoId é obrigatório.');
    if (!dadosReserva || !dadosReserva.id) throw new Error('dadosReserva.id é obrigatório.');

    return ProcessoInstitucionalEngine.vincularReserva(processoId, dadosReserva, email);
  }, 'ctrl_proc_vincular_reserva');
}

/**
 * Vincula reunião a um processo.
 * @param {string} processoId
 * @param {string} reuniaoId
 * @param {string} emailFallback
 */
function ctrl_proc_vincular_reuniao(processoId, reuniaoId, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email)      throw new Error('Usuário não identificado.');
    if (!processoId) throw new Error('processoId é obrigatório.');
    if (!reuniaoId)  throw new Error('reuniaoId é obrigatório.');

    // Busca resumo da reunião para criar snapshot
    var resumo = { id: reuniaoId, titulo: '', data: '', status: '', organizador: '' };
    try {
      var reuniao = ReunioesRepository.obterReuniaoPorId(reuniaoId);
      if (reuniao) {
        resumo.titulo       = reuniao.titulo      || '';
        resumo.data         = reuniao.data        || '';
        resumo.status       = reuniao.status      || '';
        resumo.organizador  = reuniao.organizador || '';
      }
    } catch(e) {
      Logger.warn('[ctrl_proc_vincular_reuniao] Falha ao enriquecer reunião: ' + e.message);
    }

    return ProcessoInstitucionalEngine.vincularReuniao(processoId, resumo, email);
  }, 'ctrl_proc_vincular_reuniao');
}

/**
 * Vincula encaminhamento de reunião a um processo.
 * @param {string} processoId
 * @param {Object} dadosEnc — { id, descricao, responsavel, prazo, status }
 * @param {string} emailFallback
 */
function ctrl_proc_vincular_encaminhamento(processoId, dadosEnc, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email)      throw new Error('Usuário não identificado.');
    if (!processoId) throw new Error('processoId é obrigatório.');
    if (!dadosEnc || !dadosEnc.id) throw new Error('dadosEnc.id é obrigatório.');
    return ProcessoInstitucionalEngine.vincularEncaminhamento(processoId, dadosEnc, email);
  }, 'ctrl_proc_vincular_encaminhamento');
}

/**
 * Vincula contrato a um processo e atualiza impacto financeiro.
 * @param {string} processoId
 * @param {Object} dadosContrato — { id, descricao, valor, status, tipo }
 * @param {string} emailFallback
 */
function ctrl_proc_vincular_contrato(processoId, dadosContrato, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email)      throw new Error('Usuário não identificado.');
    if (!processoId) throw new Error('processoId é obrigatório.');
    if (!dadosContrato || !dadosContrato.id) throw new Error('dadosContrato.id é obrigatório.');

    var proc = ProcessoInstitucionalEngine.vincularContrato(processoId, dadosContrato, email);
    AuditoriaService.registrar('VINCULAR_CONTRATO', 'processo_institucional', processoId, {
      contratoId: dadosContrato.id, valor: dadosContrato.valor || 0
    }, email);
    return proc;
  }, 'ctrl_proc_vincular_contrato');
}

/**
 * Vincula contratação RH ao processo.
 * Integração RH → Financeiro: atualiza impacto financeiro automaticamente.
 * @param {string} processoId
 * @param {Object} dadosContratacao — { id, nome, tipo, valor, status, setor }
 * @param {string} emailFallback
 */
function ctrl_proc_vincular_contratacao_rh(processoId, dadosContratacao, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email)         throw new Error('Usuário não identificado.');
    if (!processoId)    throw new Error('processoId é obrigatório.');
    if (!dadosContratacao || !dadosContratacao.id) throw new Error('dadosContratacao.id é obrigatório.');

    var proc = ProcessoInstitucionalEngine.vincularContratacaoRH(processoId, dadosContratacao, email);
    AuditoriaService.registrar('VINCULAR_CONTRATACAO_RH', 'processo_institucional', processoId, {
      contratacaoId: dadosContratacao.id,
      nome:          dadosContratacao.nome || '',
      valor:         dadosContratacao.valor || 0
    }, email);
    return proc;
  }, 'ctrl_proc_vincular_contratacao_rh');
}

/**
 * Vincula demanda de comunicação a um processo.
 * @param {string} processoId
 * @param {Object} dadosComunicacao — { id, titulo, tipo, status, responsavel }
 * @param {string} emailFallback
 */
function ctrl_proc_vincular_comunicacao(processoId, dadosComunicacao, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email)         throw new Error('Usuário não identificado.');
    if (!processoId)    throw new Error('processoId é obrigatório.');
    if (!dadosComunicacao || !dadosComunicacao.id) throw new Error('dadosComunicacao.id é obrigatório.');
    return ProcessoInstitucionalEngine.vincularComunicacao(processoId, dadosComunicacao, email);
  }, 'ctrl_proc_vincular_comunicacao');
}

/**
 * Registra pagamento executado no processo (atualiza executado no impacto financeiro).
 * @param {string} processoId
 * @param {number} valor
 * @param {string} descricao
 * @param {string} emailFallback
 */
function ctrl_proc_registrar_pagamento(processoId, valor, descricao, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email)      throw new Error('Usuário não identificado.');
    if (!processoId) throw new Error('processoId é obrigatório.');
    if (!valor || isNaN(parseFloat(valor))) throw new Error('Valor inválido.');
    return ProcessoInstitucionalEngine.registrarPagamento(processoId, parseFloat(valor), descricao || '', email);
  }, 'ctrl_proc_registrar_pagamento');
}

// ═══════════════════════════════════════════════════════════════
// INTELIGÊNCIA / ALERTAS
// ═══════════════════════════════════════════════════════════════

/**
 * Retorna todos os alertas detectados em processos abertos.
 * Usado pelo dashboard institucional e NotificationEngine.
 * @param {string} emailFallback
 */
function ctrl_proc_detectar_alertas(emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    return ProcessoInstitucionalEngine.detectarAlertas();
  }, 'ctrl_proc_detectar_alertas');
}

/**
 * Atualiza o snapshot de uma tarefa vinculada (chamado quando tarefa muda de status).
 * Coordenação entre TarefaEngine e ProcessoEngine sem acoplamento direto.
 * @param {string} processoId
 * @param {string} tarefaId
 * @param {string} emailFallback
 */
function ctrl_proc_sync_tarefa(processoId, tarefaId, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var tarefa = TarefaRepository.obterPorId(tarefaId);
    if (!tarefa) throw new Error('Tarefa não encontrada: ' + tarefaId);
    return ProcessoInstitucionalEngine.atualizarSnapshotTarefa(processoId, {
      id:          tarefa.id,
      titulo:      tarefa.titulo,
      status:      tarefa.status,
      responsavel: tarefa.responsavel,
      prazo:       tarefa.prazo
    }, email || 'sistema');
  }, 'ctrl_proc_sync_tarefa');
}

// ═══════════════════════════════════════════════════════════════
// CATÁLOGO DE TIPOS E ETAPAS (ProcessoTipoConfigEngine)
// ═══════════════════════════════════════════════════════════════

/**
 * Retorna catálogo completo de tipos de processo configuráveis.
 * Usado para popular o formulário de criação (sem hardcode no frontend).
 */
function ctrl_proc_catalogo_tipos(emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return ProcessoTipoConfigEngine.listar();
  }, 'ctrl_proc_catalogo_tipos');
}

/**
 * Retorna etapas de um tipo de processo.
 * @param {string} tipoId
 */
function ctrl_proc_obter_etapas(tipoId, emailFallback) {
  return GasResponse.wrap(function() {
    if (!tipoId) throw new Error('tipoId é obrigatório.');
    obterEmailUsuario(emailFallback || '');
    return ProcessoTipoConfigEngine.obterEtapas(tipoId);
  }, 'ctrl_proc_obter_etapas');
}

/**
 * Salva tipo de processo customizado (superadmin).
 * @param {Object} tipo
 */
function ctrl_proc_salvar_tipo(tipo, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var perms = obterPermissoesUsuario(email);
    if (!perms || perms.nivel !== 'superadmin') throw new Error('Apenas superadmin pode customizar tipos.');
    return ProcessoTipoConfigEngine.salvar(tipo);
  }, 'ctrl_proc_salvar_tipo');
}

// ═══════════════════════════════════════════════════════════════
// GESTÃO DE ETAPAS
// ═══════════════════════════════════════════════════════════════

/**
 * Avança o processo para a próxima etapa configurada no tipo.
 * Valida orçamento se a etapa exige.
 * @param {string} processoId
 * @param {string} observacoes
 * @param {string} emailFallback
 */
function ctrl_proc_avancar_etapa(processoId, observacoes, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email)      throw new Error('Usuário não identificado.');
    if (!processoId) throw new Error('processoId é obrigatório.');

    var proc = ProcessoInstitucionalEngine.avancarEtapa(processoId, observacoes || '', email);

    AuditoriaService.registrar('AVANCAR_ETAPA', 'processo_institucional', processoId, {
      etapaAtual: proc.etapaAtualId, etapaIndice: proc.etapaIndice
    }, email);

    return proc;
  }, 'ctrl_proc_avancar_etapa');
}

/**
 * Retorna o processo para etapa anterior (retificação).
 * @param {string} processoId
 * @param {string} motivo
 * @param {string} emailFallback
 */
function ctrl_proc_voltar_etapa(processoId, motivo, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email)      throw new Error('Usuário não identificado.');
    if (!processoId) throw new Error('processoId é obrigatório.');

    var proc = ProcessoInstitucionalEngine.voltarEtapa(processoId, motivo || '', email);
    AuditoriaService.registrar('VOLTAR_ETAPA', 'processo_institucional', processoId, {
      etapaAtual: proc.etapaAtualId
    }, email);
    return proc;
  }, 'ctrl_proc_voltar_etapa');
}

// ═══════════════════════════════════════════════════════════════
// VÍNCULOS ADICIONAIS
// ═══════════════════════════════════════════════════════════════

/**
 * Vincula ação institucional REAL (com lookup no ActionEngine).
 * @param {string} processoId
 * @param {string} acaoId
 * @param {string} emailFallback
 */
function ctrl_proc_vincular_acao(processoId, acaoId, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email)      throw new Error('Usuário não identificado.');
    if (!processoId) throw new Error('processoId é obrigatório.');
    if (!acaoId)     throw new Error('acaoId é obrigatório.');
    return ProcessoInstitucionalEngine.vincularAcao(processoId, acaoId, email);
  }, 'ctrl_proc_vincular_acao');
}

/**
 * Vincula rubrica orçamentária ao processo.
 * @param {string} processoId
 * @param {string} rubricaId
 * @param {string} rubricaNome
 * @param {string} emailFallback
 */
function ctrl_proc_vincular_rubrica(processoId, rubricaId, rubricaNome, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email)      throw new Error('Usuário não identificado.');
    if (!processoId) throw new Error('processoId é obrigatório.');
    if (!rubricaId)  throw new Error('rubricaId é obrigatório.');
    return ProcessoInstitucionalEngine.vincularRubrica(processoId, rubricaId, rubricaNome || rubricaId, email);
  }, 'ctrl_proc_vincular_rubrica');
}

/**
 * Adiciona documento ao processo.
 * @param {string} processoId
 * @param {Object} doc — { nome, tipo, url, driveId }
 * @param {string} emailFallback
 */
function ctrl_proc_adicionar_documento(processoId, doc, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email)      throw new Error('Usuário não identificado.');
    if (!processoId) throw new Error('processoId é obrigatório.');
    if (!doc || !doc.nome) throw new Error('doc.nome é obrigatório.');
    return ProcessoInstitucionalEngine.adicionarDocumento(processoId, doc, email);
  }, 'ctrl_proc_adicionar_documento');
}

// ═══════════════════════════════════════════════════════════════
// CONTROLE ORÇAMENTÁRIO
// ═══════════════════════════════════════════════════════════════

/**
 * Verifica saldo orçamentário disponível em uma rubrica.
 * @param {string} rubricaId
 * @param {number} valor
 * @param {string} emailFallback
 */
function ctrl_proc_verificar_orcamento(rubricaId, valor, emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return OrcamentoGuard.verificarSaldo(rubricaId, parseFloat(valor) || 0);
  }, 'ctrl_proc_verificar_orcamento');
}

/**
 * Efetua reserva orçamentária para o processo (após aprovação).
 * @param {string} processoId
 * @param {string} emailFallback
 */
function ctrl_proc_reservar_orcamento(processoId, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email)      throw new Error('Usuário não identificado.');
    if (!processoId) throw new Error('processoId é obrigatório.');

    var resultado = ProcessoInstitucionalEngine.reservarOrcamento(processoId, email);

    AuditoriaService.registrar('RESERVAR_ORCAMENTO', 'processo_institucional', processoId, {
      rubricaId: (resultado.proc || {}).rubricaId,
      valor:     ((resultado.proc || {}).impactoFinanceiro || {}).reservado || 0
    }, email);

    return resultado;
  }, 'ctrl_proc_reservar_orcamento');
}

/**
 * Libera reserva orçamentária (cancelamento).
 * @param {string} processoId
 * @param {string} motivo
 * @param {string} emailFallback
 */
function ctrl_proc_liberar_orcamento(processoId, motivo, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email)      throw new Error('Usuário não identificado.');
    if (!processoId) throw new Error('processoId é obrigatório.');
    return OrcamentoGuard.liberar(processoId, motivo || '', email);
  }, 'ctrl_proc_liberar_orcamento');
}

/**
 * Retorna dashboard orçamentário (reservas ativas, por rubrica).
 * @param {string} emailFallback
 */
function ctrl_proc_dashboard_orcamentario(emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var perms = obterPermissoesUsuario(email);
    var nivel = (perms && perms.nivel) ? perms.nivel : 'visitante';
    if (['superadmin','admin','gestor'].indexOf(nivel) === -1) {
      throw new Error('Acesso restrito ao dashboard orçamentário.');
    }
    return OrcamentoGuard.obterDashboardOrcamentario();
  }, 'ctrl_proc_dashboard_orcamentario');
}

// ═══════════════════════════════════════════════════════════════
// BUSCA DE AÇÕES PARA AUTOCOMPLETE
// ═══════════════════════════════════════════════════════════════

/**
 * Busca ações institucionais para autocomplete no formulário de processo.
 * @param {string} busca — termo de busca
 * @param {string} emailFallback
 */
function ctrl_proc_buscar_acoes(busca, emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    if (typeof listarAcoes !== 'function') return [];
    var todas = listarAcoes({ status: 'Ativa' }) || [];
    if (!busca || !busca.trim()) return todas.slice(0, 20);
    var q = busca.toLowerCase().trim();
    return todas.filter(function(a) {
      var texto = ((a.nome || '') + ' ' + (a.titulo || '') + ' ' + (a.descricao || '')).toLowerCase();
      return texto.indexOf(q) !== -1;
    }).slice(0, 20);
  }, 'ctrl_proc_buscar_acoes');
}

/**
 * Busca rubricas orçamentárias para autocomplete.
 * @param {string} busca — termo de busca
 * @param {string} emailFallback
 */
function ctrl_proc_buscar_rubricas(busca, emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    var todas = ContratoRepository.listarRubricas();
    if (!busca || !busca.trim()) return todas.slice(0, 30);
    var q = busca.toLowerCase().trim();
    return todas.filter(function(r) {
      return ((r.nome || '') + ' ' + (r.id || '')).toLowerCase().indexOf(q) !== -1;
    }).slice(0, 20);
  }, 'ctrl_proc_buscar_rubricas');
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD INSTITUCIONAL TRANSVERSAL
// ═══════════════════════════════════════════════════════════════

/**
 * Retorna dashboard transversal de processos (para painel de gestão).
 * @param {string} emailFallback
 */
function ctrl_proc_dashboard_institucional(emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    var perms = obterPermissoesUsuario(email);
    var nivel = (perms && perms.nivel) ? perms.nivel : 'visitante';
    if (['superadmin','admin','gestor'].indexOf(nivel) === -1) {
      throw new Error('Acesso restrito ao dashboard institucional.');
    }
    return ProcessoInstitucionalEngine.obterDashboardInstitucional();
  }, 'ctrl_proc_dashboard_institucional');
}

/**
 * Retorna alertas de todos os processos abertos (para NotificationEngine e painel).
 */
function ctrl_proc_alertas_globais(emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    return ProcessoInstitucionalEngine.detectarAlertas();
  }, 'ctrl_proc_alertas_globais');
}
