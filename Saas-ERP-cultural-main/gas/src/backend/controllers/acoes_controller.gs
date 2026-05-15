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
 * Retorna painel integrado enriquecido de uma Ação Institucional.
 * Agrega: reservas, tarefas, reuniões, contratos, equipe e dados financeiros.
 * Estrutura: { reservas[], tarefas[], reunioes[], contratos[], equipe[], financeiro{}, processos[] }
 *
 * @param {string} acaoId
 * @param {string} emailFallback
 */
function ctrl_acoes_obter_painel_integrado(acaoId, emailFallback) {
  return GasResponse.wrap(function() {
    if (!acaoId) throw new Error('acaoId é obrigatório.');

    var recursos  = obterRecursosDaAcao(acaoId);
    var resultado = {
      reservas:   [],
      tarefas:    [],
      reunioes:   [],
      contratos:  [],
      equipe:     [],
      financeiro: { previsto: 0, executado: 0, saldo: 0, contratos: [] },
      processos:  [],
      outros:     []
    };

    // ── Entidades já vinculadas via associarRecurso ───────────────────────────
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
              processoId:  tarefa.processoId  || '',
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
        } else if (r.tipo === 'contrato') {
          // Contratos vinculados via associarRecurso (tipo='contrato')
          resultado.contratos.push({
            id:          r.recursoId,
            associadoEm: r.associadoEm
          });
        } else {
          resultado.outros.push(r);
        }
      } catch (e) {
        Logger.warn('[ctrl_acoes_obter_painel_integrado] Falha ao enriquecer ' + r.tipo + ':' + r.recursoId + ' — ' + e.message);
      }
    });

    // ── Contratos financeiros vinculados à ação (via acaoId no financeiro) ────
    try {
      var contratacoes = lerJSON('contratacoes.json') || [];
      var contratosDaAcao = contratacoes.filter(function(c) {
        return c.acaoId === acaoId || c.idAcao === acaoId;
      });
      contratosDaAcao.forEach(function(c) {
        var jaVinculado = resultado.contratos.some(function(x) { return x.id === c.id; });
        if (!jaVinculado) {
          resultado.contratos.push({
            id:          c.id,
            descricao:   c.descricao   || c.nome || '',
            valor:       parseFloat(c.valor) || 0,
            status:      c.status      || '',
            tipo:        c.tipo        || '',
            responsavel: c.responsavel || ''
          });
        }
        // Agrega financeiro
        var val = parseFloat(c.valor) || 0;
        resultado.financeiro.previsto  += val;
        resultado.financeiro.contratos.push({ id: c.id, descricao: c.descricao || '', valor: val });
      });

      // Pagamentos executados vinculados à ação
      var pagamentos = lerJSON('pagamentos.json') || [];
      pagamentos.filter(function(p) {
        return p.acaoId === acaoId || p.idAcao === acaoId;
      }).forEach(function(p) {
        resultado.financeiro.executado += parseFloat(p.valor) || 0;
      });

      resultado.financeiro.saldo = resultado.financeiro.previsto - resultado.financeiro.executado;
    } catch(e) {
      Logger.warn('[ctrl_acoes_obter_painel_integrado] Falha ao agregar financeiro: ' + e.message);
    }

    // ── Equipe vinculada à ação (funcionários com idAcao ou acaoId) ──────────
    try {
      var funcionarios = lerJSON('funcionarios.json') || [];
      resultado.equipe = funcionarios.filter(function(f) {
        return f.acaoId === acaoId || (f.acoes || []).indexOf(acaoId) !== -1;
      }).map(function(f) {
        return {
          email:  f.email  || '',
          nome:   f.nome   || '',
          papel:  f.papel  || f.cargo || '',
          setor:  f.setor  || '',
          status: f.status || 'ativo'
        };
      });
    } catch(e) {
      Logger.warn('[ctrl_acoes_obter_painel_integrado] Falha ao agregar equipe: ' + e.message);
    }

    // ── Processos Institucionais vinculados à ação ────────────────────────────
    try {
      var processos = ProcessoInstitucionalRepository.listarComFiltros({ acaoId: acaoId }, '', 'superadmin');
      resultado.processos = processos.map(function(p) {
        return {
          id:               p.id,
          titulo:           p.titulo,
          tipo:             p.tipo,
          status:           p.status,
          prioridade:       p.prioridade,
          responsavelAtual: p.responsavelAtual,
          setoresEnvolvidos: p.setoresEnvolvidos || []
        };
      });
    } catch(e) {
      Logger.warn('[ctrl_acoes_obter_painel_integrado] Falha ao agregar processos: ' + e.message);
    }

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

/**
 * Retorna lista leve de Ações para autocomplete em outros módulos (Tarefas, Reuniões, etc.).
 * Exclui ações concluídas e canceladas. Filtra por termo de busca se fornecido.
 * Retorna: [{ id, nome, tipo, status, responsavel }]
 *
 * @param {string} termo       — texto para filtrar por nome ou tipo (opcional)
 * @param {string} emailFallback
 */
function ctrl_acoes_para_autocomplete(termo, emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    var todas  = listarAcoes({});
    var t      = (termo || '').toLowerCase().trim();
    var STATUS_EXCLUIDOS = ['concluido', 'cancelado', 'arquivado'];
    return todas
      .filter(function(a) {
        if (STATUS_EXCLUIDOS.indexOf(a.status) !== -1) return false;
        if (!t) return true;
        return (a.nome  || '').toLowerCase().indexOf(t) !== -1 ||
               (a.tipo  || '').toLowerCase().indexOf(t) !== -1 ||
               (a.descricao || '').toLowerCase().indexOf(t) !== -1;
      })
      .slice(0, 15)
      .map(function(a) {
        return {
          id:          a.id          || '',
          nome:        a.nome        || '',
          tipo:        a.tipo        || '',
          status:      a.status      || '',
          responsavel: a.responsavel || ''
        };
      });
  }, 'ctrl_acoes_para_autocomplete');
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
