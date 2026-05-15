/**
 * @file backend/controllers/tarefas_controller.gs
 * @layer backend/controllers
 * @description Fachada oficial do domínio Tarefas — único ponto de entrada via google.script.run.
 *
 * REGRA ARQUITETURAL:
 *   - A bridge aponta APENAS para funções ctrl_tarefas_* e ctrl_processos_*.
 *   - Toda resposta é GasResponse: { ok, data, error, metadata }.
 *   - Permissões verificadas server-side: filtragem por nível de acesso.
 *   - Delegação restrita: gestor/admin ou responsável atual/criador.
 *
 * Fluxo:
 *   Frontend → GAS.tarefas.* → ctrl_tarefas_* → TarefaEngine → TarefaRepository → tarefas.json
 *
 * @depends shared/response.gs            (GasResponse)
 * @depends modules/tarefas/tarefa_engine.gs (TarefaEngine, STATUS_TAREFA)
 * @depends modules/tarefas/tarefa_repository.gs (TarefaRepository)
 * @depends modules/pessoal/mod_pessoal.gs (obterProcessos, salvarProcesso, excluirProcesso)
 * @depends backend/mod_admin.gs          (obterEmailUsuario)
 * @depends backend/mod_permissoes_v2.gs  (obterPermissoesUsuario)
 */

// ── Helper interno ────────────────────────────────────────────────────────────

function _ctrlTarefasObterContexto(emailFallback) {
  var email = obterEmailUsuario(emailFallback || '');
  var nivel  = 'visitante';
  try {
    var perms = obterPermissoesUsuario(email);
    nivel = (perms && perms.nivel) ? perms.nivel : 'visitante';
  } catch(e) {
    Logger.warn('[tarefas_controller] Falha ao obter nível de ' + email + ': ' + e.message);
  }
  return { email: email, nivel: nivel };
}

// ── LEITURA ───────────────────────────────────────────────────────────────────

/**
 * Lista tarefas visíveis ao usuário autenticado.
 * Admin/gestor veem todas; demais veem somente as próprias.
 */
function ctrl_tarefas_listar(emailFallback) {
  return GasResponse.wrap(function() {
    var ctx = _ctrlTarefasObterContexto(emailFallback);
    return TarefaRepository.listarParaUsuario(ctx.email, ctx.nivel);
  }, 'ctrl_tarefas_listar');
}

/**
 * Obtém uma tarefa por ID, verificando se o usuário pode visualizá-la.
 */
function ctrl_tarefas_obter(id, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID da tarefa é obrigatório.');
    var ctx    = _ctrlTarefasObterContexto(emailFallback);
    var tarefa = TarefaRepository.obterPorId(id);
    if (!tarefa) throw new Error('Tarefa não encontrada: ' + id);
    if (!TarefaRepository.podeVisualizar(tarefa, ctx.email, ctx.nivel)) {
      throw new Error('Sem permissão para visualizar esta tarefa.');
    }
    return tarefa;
  }, 'ctrl_tarefas_obter');
}

/**
 * Retorna apenas as tarefas do usuário autenticado (minha fila).
 */
function ctrl_tarefas_minha_fila(emailFallback) {
  return GasResponse.wrap(function() {
    var ctx   = _ctrlTarefasObterContexto(emailFallback);
    var todas = TarefaRepository.listar();
    return todas.filter(function(t) {
      return t.responsavel === ctx.email ||
             (t.executores||[]).indexOf(ctx.email) !== -1;
    });
  }, 'ctrl_tarefas_minha_fila');
}

/**
 * Calcula métricas operacionais. Gestores/admins recebem visão global.
 */
function ctrl_tarefas_obter_metricas(emailFallback) {
  return GasResponse.wrap(function() {
    var ctx = _ctrlTarefasObterContexto(emailFallback);
    return TarefaEngine.calcularMetricas(ctx.email, ctx.nivel);
  }, 'ctrl_tarefas_obter_metricas');
}

// ── ESCRITA ───────────────────────────────────────────────────────────────────

/**
 * Cria tarefa com schema completo via TarefaEngine.
 */
function ctrl_tarefas_criar(dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!dados || typeof dados !== 'object') throw new Error('Dados da tarefa são obrigatórios.');
    if (!dados.titulo) throw new Error('Título da tarefa é obrigatório.');
    var ctx = _ctrlTarefasObterContexto(emailFallback);
    return TarefaEngine.criar(dados, ctx.email);
  }, 'ctrl_tarefas_criar');
}

/**
 * Edita campos de uma tarefa sem mudar status (usa TarefaEngine.editar).
 * Mantém compatibilidade: se dados.id ausente, redireciona para criar.
 */
function ctrl_tarefas_salvar(dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!dados || typeof dados !== 'object') throw new Error('Dados da tarefa são obrigatórios.');
    var ctx = _ctrlTarefasObterContexto(emailFallback);
    if (!dados.id) {
      return TarefaEngine.criar(dados, ctx.email);
    }
    return TarefaEngine.editar(dados.id, dados, ctx.email);
  }, 'ctrl_tarefas_salvar');
}

/**
 * Aplica transição de status via FSM — rejeita transições inválidas.
 * @param {string} id
 * @param {string} novoStatus — valor de STATUS_TAREFA
 * @param {string} comentario — motivo (opcional, exibido no histórico)
 */
function ctrl_tarefas_mudar_status(id, novoStatus, comentario, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id)         throw new Error('ID da tarefa é obrigatório.');
    if (!novoStatus) throw new Error('Novo status é obrigatório.');
    var ctx = _ctrlTarefasObterContexto(emailFallback);
    return TarefaEngine.aplicarTransicao(id, novoStatus, ctx.email, comentario || '');
  }, 'ctrl_tarefas_mudar_status');
}

/**
 * Delega tarefa para outro responsável.
 * Requer ser admin/gestor, responsável atual ou criador.
 * @param {string} id
 * @param {string} paraEmail — novo responsável
 * @param {string} comentario
 */
function ctrl_tarefas_delegar(id, paraEmail, comentario, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id)       throw new Error('ID da tarefa é obrigatório.');
    if (!paraEmail) throw new Error('Destinatário da delegação é obrigatório.');
    var ctx = _ctrlTarefasObterContexto(emailFallback);
    return TarefaEngine.delegar(id, paraEmail, comentario || '', ctx.email, ctx.nivel);
  }, 'ctrl_tarefas_delegar');
}

/**
 * Adiciona comentário a uma tarefa.
 * Qualquer usuário com acesso à tarefa pode comentar.
 */
function ctrl_tarefas_comentar(id, texto, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id)    throw new Error('ID da tarefa é obrigatório.');
    if (!texto) throw new Error('Texto do comentário é obrigatório.');
    var ctx    = _ctrlTarefasObterContexto(emailFallback);
    var tarefa = TarefaRepository.obterPorId(id);
    if (!tarefa) throw new Error('Tarefa não encontrada: ' + id);
    if (!TarefaRepository.podeVisualizar(tarefa, ctx.email, ctx.nivel)) {
      throw new Error('Sem permissão para comentar nesta tarefa.');
    }
    return TarefaEngine.registrarComentario(id, texto, ctx.email);
  }, 'ctrl_tarefas_comentar');
}

/**
 * Exclui tarefa. Apenas admin/gestor ou criador podem excluir.
 */
function ctrl_tarefas_excluir(id, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID da tarefa é obrigatório.');
    var ctx    = _ctrlTarefasObterContexto(emailFallback);
    var tarefa = TarefaRepository.obterPorId(id);
    if (!tarefa) throw new Error('Tarefa não encontrada: ' + id);

    var niveisGestao = ['superadmin', 'admin', 'gestor'];
    if (niveisGestao.indexOf(ctx.nivel) === -1 && tarefa.criadoPor !== ctx.email) {
      throw new Error('Sem permissão para excluir esta tarefa.');
    }
    return TarefaRepository.excluir(id);
  }, 'ctrl_tarefas_excluir');
}

/**
 * Salva ordem do Kanban (status + posição de múltiplas tarefas de uma vez).
 * @param {Object} ordens — { [id]: { status, ordem } }
 */
function ctrl_tarefas_salvar_ordem_kanban(ordens, emailFallback) {
  return GasResponse.wrap(function() {
    if (!ordens || typeof ordens !== 'object') throw new Error('Ordens inválidas.');
    _ctrlTarefasObterContexto(emailFallback);
    var lista = TarefaRepository.listar();
    lista.forEach(function(t) {
      if (ordens[t.id]) {
        t.ordem  = ordens[t.id].ordem;
        t.status = ordens[t.id].status;
        TarefaRepository.salvar(t);
      }
    });
    return { ok: true };
  }, 'ctrl_tarefas_salvar_ordem_kanban');
}

/**
 * Gera tarefa automaticamente a partir de evento de módulo.
 * Chamado internamente por outros controllers (não exposto no bridge diretamente).
 * @param {string} evento      — ex: 'reserva_aprovada', 'contrato_criado'
 * @param {Object} dadosEvento — { id, ref, responsavel, prazo, processo }
 */
function ctrl_tarefas_gerar_do_modulo(evento, dadosEvento, emailFallback) {
  return GasResponse.wrap(function() {
    if (!evento) throw new Error('Evento é obrigatório.');
    var ctx = _ctrlTarefasObterContexto(emailFallback);
    return TarefaEngine.gerarDoModulo(evento, dadosEvento || {}, ctx.email);
  }, 'ctrl_tarefas_gerar_do_modulo');
}

/**
 * Executa verificação batch de SLAs (para trigger diário).
 */
function ctrl_tarefas_verificar_slas(emailFallback) {
  return GasResponse.wrap(function() {
    _ctrlTarefasObterContexto(emailFallback);
    return TarefaEngine.verificarSlas();
  }, 'ctrl_tarefas_verificar_slas');
}

// Mantido para compatibilidade — redireciona para TarefaEngine
function ctrl_tarefas_listar_por_funcao(funcao, emailFallback) {
  return GasResponse.wrap(function() {
    if (!funcao) throw new Error('Função é obrigatória.');
    _ctrlTarefasObterContexto(emailFallback);
    return listarTarefasPorFuncao(funcao);
  }, 'ctrl_tarefas_listar_por_funcao');
}

function ctrl_tarefas_atribuir_executores(id, emails, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id)                          throw new Error('ID da tarefa é obrigatório.');
    if (!emails || !Array.isArray(emails)) throw new Error('Lista de emails é obrigatória.');
    var ctx = _ctrlTarefasObterContexto(emailFallback);
    return TarefaEngine.editar(id, { executores: emails, responsavel: emails[0] || '' }, ctx.email);
  }, 'ctrl_tarefas_atribuir_executores');
}

function ctrl_tarefas_responder_como_funcao(id, mensagem, autor, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id)       throw new Error('ID da tarefa é obrigatório.');
    if (!mensagem) throw new Error('Mensagem é obrigatória.');
    _ctrlTarefasObterContexto(emailFallback);
    return TarefaEngine.registrarComentario(id, mensagem, autor || '');
  }, 'ctrl_tarefas_responder_como_funcao');
}

// ── Processos (mantidos — mesmas funções de mod_pessoal.gs) ───────────────────

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
