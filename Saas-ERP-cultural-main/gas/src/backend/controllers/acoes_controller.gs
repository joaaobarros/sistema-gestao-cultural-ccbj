/**
 * @file backend/controllers/acoes_controller.gs
 * @layer backend/controllers
 * @description Fachada oficial do domínio de Ações Institucionais.
 *
 * REGRA ARQUITETURAL:
 *   - A bridge aponta APENAS para funções ctrl_acoes_*.
 *   - Todo retorno é GasResponse: { ok, data, error, metadata }.
 *   - O motor real é action_engine.gs (criarAcao, mudarStatusAcao, ...).
 *
 * @depends shared/response.gs (GasResponse),
 *          action_engine/action_engine.gs,
 *          core/utils.gs (obterEmailUsuario)
 */

// ═══════════════════════════════════════════════════════════════
// LEITURA
// ═══════════════════════════════════════════════════════════════

/**
 * Lista Ações com filtros opcionais.
 * @param {Object} filtros — { status, tipo, responsavel }
 */
function ctrl_acoes_listar(filtros) {
  return GasResponse.wrap(function() {
    return listarAcoes(filtros || {});
  });
}

/**
 * Obtém uma Ação pelo ID.
 * @param {string} id
 */
function ctrl_acoes_obter(id) {
  return GasResponse.wrap(function() {
    var acao = obterAcao(id);
    if (!acao) throw new Error('Ação não encontrada: ' + id);
    return acao;
  });
}

/**
 * Retorna recursos associados a uma Ação (lista bruta de IDs e tipos).
 * @param {string} acaoId
 */
function ctrl_acoes_obter_recursos(acaoId) {
  return GasResponse.wrap(function() {
    return obterRecursosDaAcao(acaoId);
  });
}

/**
 * Retorna painel integrado enriquecido: para cada recurso vinculado à Ação,
 * busca os dados reais da entidade (nome, status, datas, responsável).
 * Estrutura de retorno: { reservas[], tarefas[], reunioes[], outros[] }
 * @param {string} acaoId
 */
function ctrl_acoes_obter_painel_integrado(acaoId) {
  return GasResponse.wrap(function() {
    if (!acaoId) throw new Error('acaoId é obrigatório.');

    var recursos = obterRecursosDaAcao(acaoId);
    var resultado = { reservas: [], tarefas: [], reunioes: [], outros: [] };

    recursos.forEach(function(r) {
      try {
        if (r.tipo === 'reserva') {
          var linha = ReservaRepository.buscarPorId(r.recursoId);
          if (linha) {
            resultado.reservas.push({
              id:          r.recursoId,
              nome:        String(linha[6]  || ''),
              sala:        String(linha[4]  || ''),
              data:        String(linha[1]  || ''),
              inicio:      String(linha[2]  || ''),
              fim:         String(linha[3]  || ''),
              status:      String(linha[13] || ''),
              responsavel: String(linha[8]  || ''),
              setor:       String(linha[9]  || ''),
              associadoEm: r.associadoEm
            });
          }
        } else if (r.tipo === 'tarefa') {
          var tarefa = TarefaRepository.obterPorId(r.recursoId);
          if (tarefa) {
            resultado.tarefas.push({
              id:          r.recursoId,
              titulo:      tarefa.titulo      || '',
              status:      tarefa.status      || '',
              prioridade:  tarefa.prioridade  || '',
              responsavel: tarefa.responsavel || '',
              prazo:       tarefa.prazo       || '',
              associadoEm: r.associadoEm
            });
          }
        } else if (r.tipo === 'reuniao') {
          var reuniao = ReunioesRepository.obterReuniaoPorId(r.recursoId);
          if (reuniao) {
            resultado.reunioes.push({
              id:          r.recursoId,
              titulo:      reuniao.titulo      || '',
              status:      reuniao.status      || '',
              data:        reuniao.data        || '',
              local:       reuniao.local       || '',
              organizador: reuniao.organizador || '',
              associadoEm: r.associadoEm
            });
          }
        } else {
          resultado.outros.push(r);
        }
      } catch (e) {
        Logger.warn('ctrl_acoes_obter_painel_integrado', 'Falha ao enriquecer recurso ' + r.tipo + ':' + r.recursoId, e.message);
      }
    });

    return resultado;
  }, 'ctrl_acoes_obter_painel_integrado');
}

// ═══════════════════════════════════════════════════════════════
// ESCRITA
// ═══════════════════════════════════════════════════════════════

/**
 * Cria nova Ação.
 * @param {Object} dados — { nome, tipo, descricao, responsavel, dataInicio, dataFim, equipe[] }
 * @param {string} emailFallback
 */
function ctrl_acoes_criar(dados, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    var resultado = criarAcao(dados, email);
    if (!resultado.ok) throw new Error(resultado.erro || 'Erro ao criar ação.');
    return resultado;
  });
}

/**
 * Atualiza dados de uma Ação (sem mudar status).
 * @param {string} id
 * @param {Object} dados
 * @param {string} emailFallback
 */
function ctrl_acoes_atualizar(id, dados, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var resultado = atualizarAcao(id, dados, email);
    if (!resultado.ok) throw new Error(resultado.erro || 'Erro ao atualizar ação.');
    return resultado;
  });
}

/**
 * Transição de status via FSM oficial.
 * @param {string} id
 * @param {string} novoStatus — um dos ACTION_ESTADOS.*
 * @param {string} emailFallback
 * @param {string} motivo
 */
function ctrl_acoes_mudar_status(id, novoStatus, emailFallback, motivo) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var resultado = mudarStatusAcao(id, novoStatus, email, motivo || '');
    if (!resultado.ok) throw new Error(resultado.erro || 'Erro na transição de status.');
    return resultado;
  });
}

/**
 * Associa um recurso externo a uma Ação (reserva, contrato, tarefa…).
 * @param {string} acaoId
 * @param {string} tipo — 'reserva' | 'contrato' | 'tarefa' | 'chave' | 'relatorio'
 * @param {string} recursoId
 * @param {string} emailFallback
 */
function ctrl_acoes_associar_recurso(acaoId, tipo, recursoId, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var resultado = associarRecurso(acaoId, tipo, recursoId, email);
    if (!resultado.ok) throw new Error(resultado.erro || 'Erro ao associar recurso.');
    return resultado;
  });
}

// ═══════════════════════════════════════════════════════════════
// SOLICITAÇÕES (migrado de mod_admin.gs)
// ═══════════════════════════════════════════════════════════════

/**
 * Lista todas as solicitações — admins veem tudo; donos de sala veem as suas.
 * @param {string} emailFallback
 */
function ctrl_acoes_listar_todas(emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    return listarTodasSolicitacoes(email);
  });
}

/**
 * Lista solicitações pendentes — filtradas por perfil do usuário.
 * @param {string} emailFallback
 */
function ctrl_acoes_listar_pendentes(emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    return listarSolicitacoesPendentes(email);
  });
}
