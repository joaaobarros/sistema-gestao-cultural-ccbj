/**
 * @file modules/solicitacoes/solicitacao_engine.gs
 * @layer modules/solicitacoes
 * @description Motor de Solicitações Internas Institucionais.
 *
 * Centraliza criação, FSM, aprovação, devolução, execução e conclusão de
 * solicitações de: contratação de bolsistas, professores, serviços, transporte,
 * traslado, alimentação, estrutura técnica, aluguel de equipamentos, compras,
 * aquisições, material gráfico, camarim, logística institucional.
 *
 * PRINCÍPIO: Cada solicitação é um workflow institucional completo, com ID,
 * protocolo, timeline, aprovações, itens de catálogo e vínculos financeiros.
 *
 * @depends modules/solicitacoes/solicitacao_repository.gs
 * @depends modules/solicitacoes/catalogo_engine.gs
 * @depends modules/solicitacoes/disponibilidade_engine.gs
 * @depends core/event_bus_backend.gs (SystemEvents)
 * @depends core/logger.gs (Logger)
 */

// ── Status canônicos ─────────────────────────────────────────────────────────

var STATUS_SOLICITACAO = Object.freeze({
  RASCUNHO:            'rascunho',
  SOLICITADA:          'solicitada',
  EM_ANALISE:          'em_analise',
  AGUARDANDO_AJUSTE:   'aguardando_ajuste',
  APROVADA:            'aprovada',
  PARCIAL:             'parcialmente_aprovada',
  EM_EXECUCAO:         'em_execucao',
  CONCLUIDA:           'concluida',
  CANCELADA:           'cancelada'
});

var LABEL_STATUS_SOL = {
  rascunho:              'Rascunho',
  solicitada:            'Solicitada',
  em_analise:            'Em Análise',
  aguardando_ajuste:     'Aguard. Ajuste',
  aprovada:              'Aprovada',
  parcialmente_aprovada: 'Parcialmente Aprovada',
  em_execucao:           'Em Execução',
  concluida:             'Concluída',
  cancelada:             'Cancelada'
};

// FSM oficial
var _TRANSICOES_SOL = {
  rascunho:              ['solicitada', 'cancelada'],
  solicitada:            ['em_analise', 'aguardando_ajuste', 'cancelada'],
  em_analise:            ['aprovada', 'parcialmente_aprovada', 'aguardando_ajuste', 'cancelada'],
  aguardando_ajuste:     ['solicitada', 'cancelada'],
  aprovada:              ['em_execucao', 'cancelada'],
  parcialmente_aprovada: ['em_execucao', 'cancelada'],
  em_execucao:           ['concluida', 'cancelada'],
  concluida:             [],
  cancelada:             []
};

// Tipos de solicitação
var TIPO_SOLICITACAO = Object.freeze({
  BOLSISTA:            'bolsista',
  PROFESSOR:           'professor',
  SERVICO:             'servico',
  TRANSPORTE:          'transporte',
  TRASLADO:            'traslado',
  ALIMENTACAO:         'alimentacao',
  ESTRUTURA_TECNICA:   'estrutura_tecnica',
  ALUGUEL_EQUIPAMENTO: 'aluguel_equipamento',
  COMPRA:              'compra',
  AQUISICAO:           'aquisicao',
  MATERIAL_GRAFICO:    'material_grafico',
  CAMARIM:             'camarim',
  LOGISTICA:           'logistica',
  OUTRO:               'outro'
});

var LABEL_TIPO_SOL = {
  bolsista:            'Contratação de Bolsista',
  professor:           'Contratação de Professor',
  servico:             'Contratação de Serviço',
  transporte:          'Contratação de Transporte',
  traslado:            'Contratação de Traslado',
  alimentacao:         'Contratação de Alimentação',
  estrutura_tecnica:   'Estrutura Técnica',
  aluguel_equipamento: 'Aluguel de Equipamento',
  compra:              'Compra',
  aquisicao:           'Aquisição',
  material_grafico:    'Material Gráfico',
  camarim:             'Camarim',
  logistica:           'Logística Institucional',
  outro:               'Outro'
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function _agora_sol() { return new Date().toISOString(); }

function _gerarId_sol(prefixo) {
  return (typeof gerarId === 'function')
    ? gerarId(prefixo)
    : prefixo + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

function _emitir_sol(tipo, sol, emailAtor, extra) {
  try {
    SystemEvents.emit(tipo, {
      entidade:   'solicitacao',
      entidadeId: sol.id,
      usuario:    emailAtor || 'sistema',
      contexto:   Object.assign({ protocolo: sol.protocolo, titulo: sol.titulo, status: sol.status }, extra || {})
    });
  } catch(e) {
    Logger.warn('[SolicitacaoEngine] emit ' + tipo + ': ' + e.message);
  }
}

function _validarTransicaoSol(statusAtual, novoStatus) {
  var permitidos = _TRANSICOES_SOL[statusAtual] || [];
  if (permitidos.indexOf(novoStatus) === -1) {
    throw new Error(
      'Transição inválida: "' + statusAtual + '" → "' + novoStatus + '". ' +
      'Permitidas: [' + (permitidos.join(', ') || 'nenhuma') + ']'
    );
  }
}

function _novoEventoSol(tipo, descricao, emailAtor, extra) {
  return {
    id:        _gerarId_sol('evt'),
    tipo:      tipo,
    descricao: descricao,
    ator:      emailAtor || 'sistema',
    timestamp: _agora_sol(),
    extra:     extra || null
  };
}

function _calcularValorTotal(itens) {
  return (itens || []).reduce(function(acc, item) {
    return acc + (parseFloat(item.valorTotal || 0) || 0);
  }, 0);
}

// ── SolicitacaoEngine ─────────────────────────────────────────────────────────

var SolicitacaoEngine = (function() {

  return {

    // ── Criação ──────────────────────────────────────────────────────────────

    criar: function(dados, emailCriador) {
      if (!dados || !dados.titulo) throw new Error('Título da solicitação é obrigatório.');
      if (!dados.tipo)             throw new Error('Tipo da solicitação é obrigatório.');
      if (!TIPO_SOLICITACAO[dados.tipo.toUpperCase()] && Object.values(TIPO_SOLICITACAO).indexOf(dados.tipo) === -1) {
        throw new Error('Tipo inválido: ' + dados.tipo);
      }

      var agora    = _agora_sol();
      var protocolo = SolicitacaoRepository.proximoProtocolo();

      var itens = dados.itens || [];
      var valorTotal = _calcularValorTotal(itens);

      var sol = {
        id:          _gerarId_sol('sol'),
        protocolo:   protocolo,
        titulo:      dados.titulo,
        descricao:   dados.descricao   || '',
        tipo:        dados.tipo,
        tipoLabel:   LABEL_TIPO_SOL[dados.tipo] || dados.tipo,
        status:      STATUS_SOLICITACAO.RASCUNHO,
        prioridade:  dados.prioridade  || 'media',

        // Partes envolvidas
        solicitante:          dados.solicitante          || emailCriador || '',
        setorSolicitante:     dados.setorSolicitante     || '',
        setorExecutor:        dados.setorExecutor        || '',
        responsavelAprovacao: dados.responsavelAprovacao || '',

        // Itens do catálogo
        itens: itens.map(function(item) {
          return {
            catalogoId:    item.catalogoId    || '',
            nome:          item.nome          || '',
            quantidade:    parseFloat(item.quantidade) || 1,
            valorUnitario: parseFloat(item.valorUnitario) || 0,
            valorTotal:    parseFloat(item.valorTotal) || 0,
            unidade:       item.unidade       || 'un',
            observacoes:   item.observacoes   || '',
            dataInicio:    item.dataInicio    || '',
            dataFim:       item.dataFim       || '',
            disponivel:    item.disponivel    !== undefined ? item.disponivel : true
          };
        }),

        // Financeiro
        valorTotal:   valorTotal,
        contratoId:   dados.contratoId  || '',
        metaId:       dados.metaId      || '',
        rubricaId:    dados.rubricaId   || '',
        rubricaNome:  dados.rubricaNome || '',
        saldoVerificado: false,
        saldoRubrica: null,
        saldoDisponivel: null,

        // Vínculos institucionais
        processoId:  dados.processoId   || '',
        acaoId:      dados.acaoId       || '',

        // Anexos
        anexos: dados.anexos || [],

        // Workflow
        aprovacoes: [],
        observacoesAprovador: '',

        // Necessidades específicas
        dataNeeded:     dados.dataNeeded    || '',
        localEntrega:   dados.localEntrega  || '',
        observacoesGerais: dados.observacoesGerais || '',

        // Timeline e histórico (append-only)
        timeline: [
          _novoEventoSol('criacao', 'Solicitação criada: ' + dados.titulo, emailCriador)
        ],
        historico: [{
          de:        '',
          para:      STATUS_SOLICITACAO.RASCUNHO,
          motivo:    'Solicitação criada',
          ator:      emailCriador || 'sistema',
          timestamp: agora
        }],

        // Tarefas derivadas geradas pelo sistema
        tarefasDerivadas: [],

        // Rastreamento
        criadoEm:    agora,
        atualizadoEm: agora,
        criadoPor:   emailCriador || '',
        concluidaEm: '',
        canceladaEm: ''
      };

      SolicitacaoRepository.salvar(sol);

      _emitir_sol(SystemEventTypes.SOLICITACAO_CRIADA, sol, emailCriador, {
        tipo: sol.tipo, valorTotal: valorTotal
      });

      return sol;
    },

    // ── Envio para análise (rascunho → solicitada) ────────────────────────────

    enviar: function(id, emailAtor) {
      var sol = SolicitacaoRepository.obterPorId(id);
      if (!sol) throw new Error('Solicitação não encontrada: ' + id);
      if (!sol.itens || sol.itens.length === 0) throw new Error('Adicione pelo menos um item antes de enviar.');

      _validarTransicaoSol(sol.status, STATUS_SOLICITACAO.SOLICITADA);

      sol.status       = STATUS_SOLICITACAO.SOLICITADA;
      sol.atualizadoEm = _agora_sol();

      sol.historico.push({ de: 'rascunho', para: 'solicitada', motivo: 'Enviada para análise', ator: emailAtor || 'sistema', timestamp: _agora_sol() });
      sol.timeline.push(_novoEventoSol('status_change', 'Solicitação enviada para análise', emailAtor));

      SolicitacaoRepository.salvar(sol);

      _emitir_sol(SystemEventTypes.SOLICITACAO_STATUS_CHANGED, sol, emailAtor, { de: 'rascunho', para: 'solicitada' });

      return sol;
    },

    // ── Mudança de status genérica com FSM ───────────────────────────────────

    mudarStatus: function(id, novoStatus, motivo, emailAtor) {
      var sol = SolicitacaoRepository.obterPorId(id);
      if (!sol) throw new Error('Solicitação não encontrada: ' + id);

      _validarTransicaoSol(sol.status, novoStatus);

      var statusAnterior = sol.status;
      sol.status         = novoStatus;
      sol.atualizadoEm   = _agora_sol();

      if (novoStatus === STATUS_SOLICITACAO.CONCLUIDA) sol.concluidaEm = _agora_sol();
      if (novoStatus === STATUS_SOLICITACAO.CANCELADA)  sol.canceladaEm = _agora_sol();

      sol.historico.push({
        de: statusAnterior, para: novoStatus,
        motivo: motivo || '', ator: emailAtor || 'sistema', timestamp: _agora_sol()
      });
      sol.timeline.push(_novoEventoSol(
        'status_change',
        'Status: ' + (LABEL_STATUS_SOL[statusAnterior] || statusAnterior) +
          ' → ' + (LABEL_STATUS_SOL[novoStatus] || novoStatus) +
          (motivo ? ' — ' + motivo : ''),
        emailAtor
      ));

      SolicitacaoRepository.salvar(sol);
      _emitir_sol(SystemEventTypes.SOLICITACAO_STATUS_CHANGED, sol, emailAtor, { de: statusAnterior, para: novoStatus });

      return sol;
    },

    // ── Aprovação ─────────────────────────────────────────────────────────────

    aprovar: function(id, parecer, emailAprovador) {
      var sol = SolicitacaoRepository.obterPorId(id);
      if (!sol) throw new Error('Solicitação não encontrada: ' + id);

      if (sol.status !== STATUS_SOLICITACAO.EM_ANALISE &&
          sol.status !== STATUS_SOLICITACAO.SOLICITADA) {
        throw new Error('Somente solicitações em análise ou solicitadas podem ser aprovadas.');
      }

      sol.status               = STATUS_SOLICITACAO.APROVADA;
      sol.observacoesAprovador = parecer || '';
      sol.atualizadoEm         = _agora_sol();

      sol.aprovacoes.push({
        id:        _gerarId_sol('apr'),
        tipo:      'aprovacao',
        aprovador: emailAprovador,
        parecer:   parecer || '',
        timestamp: _agora_sol()
      });

      sol.historico.push({
        de: 'em_analise', para: 'aprovada',
        motivo: parecer || 'Aprovada', ator: emailAprovador, timestamp: _agora_sol()
      });
      sol.timeline.push(_novoEventoSol('aprovacao', 'Solicitação aprovada por ' + emailAprovador, emailAprovador, { parecer: parecer }));

      SolicitacaoRepository.salvar(sol);
      _emitir_sol(SystemEventTypes.SOLICITACAO_APROVADA, sol, emailAprovador);

      return sol;
    },

    // ── Aprovação parcial ─────────────────────────────────────────────────────

    aprovarParcialmente: function(id, itensAprovados, parecer, emailAprovador) {
      var sol = SolicitacaoRepository.obterPorId(id);
      if (!sol) throw new Error('Solicitação não encontrada: ' + id);

      _validarTransicaoSol(sol.status, STATUS_SOLICITACAO.PARCIAL);

      // Atualiza itens aprovados vs. não aprovados
      if (itensAprovados && Array.isArray(itensAprovados)) {
        sol.itens = sol.itens.map(function(item, idx) {
          return Object.assign({}, item, { aprovado: itensAprovados.indexOf(idx) !== -1 });
        });
        sol.valorTotal = _calcularValorTotal(
          sol.itens.filter(function(i) { return i.aprovado !== false; })
        );
      }

      sol.status               = STATUS_SOLICITACAO.PARCIAL;
      sol.observacoesAprovador = parecer || '';
      sol.atualizadoEm         = _agora_sol();

      sol.aprovacoes.push({
        id:        _gerarId_sol('apr'),
        tipo:      'aprovacao_parcial',
        aprovador: emailAprovador,
        parecer:   parecer || '',
        itensAprovados: itensAprovados || [],
        timestamp: _agora_sol()
      });

      sol.timeline.push(_novoEventoSol('aprovacao_parcial',
        'Aprovação parcial por ' + emailAprovador + ' — ' + (parecer || ''), emailAprovador));

      SolicitacaoRepository.salvar(sol);
      _emitir_sol(SystemEventTypes.SOLICITACAO_APROVADA, sol, emailAprovador, { parcial: true });

      return sol;
    },

    // ── Devolução para ajuste ─────────────────────────────────────────────────

    devolver: function(id, motivo, emailDevolvedor) {
      var sol = SolicitacaoRepository.obterPorId(id);
      if (!sol) throw new Error('Solicitação não encontrada: ' + id);
      if (!motivo || !motivo.trim()) throw new Error('Motivo da devolução é obrigatório.');

      _validarTransicaoSol(sol.status, STATUS_SOLICITACAO.AGUARDANDO_AJUSTE);

      sol.status       = STATUS_SOLICITACAO.AGUARDANDO_AJUSTE;
      sol.atualizadoEm = _agora_sol();

      sol.aprovacoes.push({
        id:        _gerarId_sol('apr'),
        tipo:      'devolucao',
        aprovador: emailDevolvedor,
        parecer:   motivo,
        timestamp: _agora_sol()
      });

      sol.timeline.push(_novoEventoSol('devolucao',
        'Devolvida para ajuste: ' + motivo, emailDevolvedor));
      sol.historico.push({
        de: sol.status, para: STATUS_SOLICITACAO.AGUARDANDO_AJUSTE,
        motivo: motivo, ator: emailDevolvedor, timestamp: _agora_sol()
      });

      SolicitacaoRepository.salvar(sol);
      _emitir_sol(SystemEventTypes.SOLICITACAO_DEVOLVIDA, sol, emailDevolvedor, { motivo: motivo });

      return sol;
    },

    // ── Edição de campos (em rascunho ou aguardando ajuste) ──────────────────

    editar: function(id, campos, emailAtor) {
      var sol = SolicitacaoRepository.obterPorId(id);
      if (!sol) throw new Error('Solicitação não encontrada: ' + id);

      var editaveis = ['rascunho', 'aguardando_ajuste'];
      if (editaveis.indexOf(sol.status) === -1) {
        throw new Error('Edição permitida apenas em rascunho ou aguardando ajuste.');
      }

      var camposPermitidos = ['titulo', 'descricao', 'prioridade', 'setorSolicitante', 'setorExecutor',
        'responsavelAprovacao', 'itens', 'contratoId', 'metaId', 'rubricaId', 'rubricaNome',
        'dataNeeded', 'localEntrega', 'observacoesGerais', 'acaoId', 'processoId', 'anexos'];

      camposPermitidos.forEach(function(k) {
        if (campos.hasOwnProperty(k)) sol[k] = campos[k];
      });

      if (campos.itens) {
        sol.valorTotal = _calcularValorTotal(campos.itens);
        sol.saldoVerificado = false;
      }

      sol.atualizadoEm = _agora_sol();
      sol.timeline.push(_novoEventoSol('edicao', 'Solicitação atualizada', emailAtor));

      SolicitacaoRepository.salvar(sol);
      return sol;
    },

    // ── Verificação e registro de disponibilidade orçamentária ───────────────

    verificarSaldo: function(id, emailAtor) {
      var sol = SolicitacaoRepository.obterPorId(id);
      if (!sol) throw new Error('Solicitação não encontrada: ' + id);

      var resultado = DisponibilidadeEngine.verificarOrcamentario({
        contratoId: sol.contratoId,
        metaId:     sol.metaId,
        rubricaId:  sol.rubricaId,
        valor:      sol.valorTotal
      });

      sol.saldoVerificado = true;
      sol.saldoRubrica    = resultado.saldoRubrica;
      sol.saldoDisponivel = resultado.disponivel;
      sol.atualizadoEm    = _agora_sol();

      sol.timeline.push(_novoEventoSol('verificacao_saldo',
        'Saldo verificado: R$ ' + (resultado.saldoRubrica || 0).toFixed(2) +
        ' disponível. Solicitação: R$ ' + sol.valorTotal.toFixed(2) +
        (resultado.disponivel ? ' ✓ OK' : ' ✗ INSUFICIENTE'), emailAtor,
        { resultado: resultado }
      ));

      SolicitacaoRepository.salvar(sol);
      return resultado;
    },

    // ── Vinculação de tarefa derivada ─────────────────────────────────────────

    vincularTarefa: function(id, tarefaId, titulo, emailAtor) {
      var sol = SolicitacaoRepository.obterPorId(id);
      if (!sol) throw new Error('Solicitação não encontrada: ' + id);

      sol.tarefasDerivadas = sol.tarefasDerivadas || [];
      if (!sol.tarefasDerivadas.some(function(t) { return t.id === tarefaId; })) {
        sol.tarefasDerivadas.push({ id: tarefaId, titulo: titulo || '', criadaEm: _agora_sol() });
      }

      sol.atualizadoEm = _agora_sol();
      sol.timeline.push(_novoEventoSol('vinculo_tarefa', 'Tarefa derivada vinculada: ' + (titulo || tarefaId), emailAtor));

      SolicitacaoRepository.salvar(sol);
      return sol;
    },

    // ── Comentário na timeline ────────────────────────────────────────────────

    comentar: function(id, texto, emailAtor) {
      if (!texto || !texto.trim()) throw new Error('Comentário não pode ser vazio.');
      var sol = SolicitacaoRepository.obterPorId(id);
      if (!sol) throw new Error('Solicitação não encontrada: ' + id);

      sol.timeline.push(_novoEventoSol('comentario', texto.trim(), emailAtor));
      sol.atualizadoEm = _agora_sol();
      SolicitacaoRepository.salvar(sol);
      return { ok: true };
    },

    // ── Geração automática de tarefas derivadas pós-aprovação ────────────────

    gerarTarefasDerivadas: function(id, emailAtor) {
      var sol = SolicitacaoRepository.obterPorId(id);
      if (!sol) throw new Error('Solicitação não encontrada: ' + id);

      var tarefasGeradas = [];
      var agora = _agora_sol();

      // Tarefas padrão por tipo
      var templatesTarefa = _TEMPLATES_TAREFA_SOL[sol.tipo];
      if (!templatesTarefa || !templatesTarefa.length) return tarefasGeradas;

      templatesTarefa.forEach(function(tpl) {
        try {
          var dadosTarefa = {
            titulo:      tpl.titulo.replace('{protocolo}', sol.protocolo).replace('{titulo}', sol.titulo),
            descricao:   tpl.descricao || '',
            tipo:        tpl.tipo || 'administrativa',
            prioridade:  tpl.prioridade || sol.prioridade || 'media',
            responsavel: tpl.funcao || emailAtor,
            modulo:      'solicitacao',
            origemId:    sol.id,
            processoId:  sol.processoId || '',
            prazo:       sol.dataNeeded || '',
            status:      'solicitada'
          };

          var tarefa = TarefaEngine.criar(dadosTarefa, emailAtor || 'sistema');
          tarefasGeradas.push({ id: tarefa.id, titulo: tarefa.titulo });

          SolicitacaoEngine.vincularTarefa(id, tarefa.id, tarefa.titulo, emailAtor);
        } catch(e) {
          Logger.warn('[SolicitacaoEngine.gerarTarefasDerivadas] ' + e.message);
        }
      });

      sol.timeline.push(_novoEventoSol('tarefas_geradas',
        tarefasGeradas.length + ' tarefa(s) derivada(s) gerada(s) automaticamente', emailAtor));

      return tarefasGeradas;
    },

    // ── Métricas e alertas ────────────────────────────────────────────────────

    detectarPendencias: function() {
      var abertas = SolicitacaoRepository.listarAbertos();
      var agora   = Date.now();
      var pendencias = [];

      abertas.forEach(function(sol) {
        // Solicitação sem movimento há mais de 3 dias
        var diasSemAtividade = (agora - new Date(sol.atualizadoEm || 0).getTime()) / 86400000;
        if (diasSemAtividade > 3 && sol.status !== STATUS_SOLICITACAO.RASCUNHO) {
          pendencias.push({
            solicitacaoId: sol.id, protocolo: sol.protocolo, titulo: sol.titulo,
            tipo: 'inativa', urgencia: 'media',
            descricao: 'Solicitação ' + sol.protocolo + ' sem movimentação há ' + Math.floor(diasSemAtividade) + ' dias.',
            destinatario: sol.responsavelAprovacao || sol.solicitante
          });
        }

        // Data needed vencida e não concluída
        if (sol.dataNeeded && new Date(sol.dataNeeded).getTime() < agora) {
          pendencias.push({
            solicitacaoId: sol.id, protocolo: sol.protocolo, titulo: sol.titulo,
            tipo: 'prazo_vencido', urgencia: 'alta',
            descricao: 'Data de necessidade da solicitação ' + sol.protocolo + ' já venceu.',
            destinatario: sol.responsavelAprovacao || sol.solicitante
          });
        }

        // Saldo insuficiente verificado
        if (sol.saldoVerificado && sol.saldoDisponivel === false) {
          pendencias.push({
            solicitacaoId: sol.id, protocolo: sol.protocolo, titulo: sol.titulo,
            tipo: 'saldo_insuficiente', urgencia: 'alta',
            descricao: 'Saldo insuficiente para a solicitação ' + sol.protocolo + '.',
            destinatario: sol.responsavelAprovacao || sol.solicitante
          });
        }
      });

      return pendencias;
    }

  };
})();

// ── Templates de tarefas derivadas por tipo de solicitação ───────────────────

var _TEMPLATES_TAREFA_SOL = {
  transporte: [
    { titulo: 'Confirmar disponibilidade de transporte — {protocolo}', tipo: 'operacional', prioridade: 'alta', funcao: 'operacional' },
    { titulo: 'Emitir ordem de transporte — {protocolo}', tipo: 'administrativa', prioridade: 'media', funcao: 'administrativo' }
  ],
  alimentacao: [
    { titulo: 'Solicitar cotação de alimentação — {protocolo}', tipo: 'administrativa', prioridade: 'media', funcao: 'administrativo' },
    { titulo: 'Confirmar entrega de alimentação — {protocolo}', tipo: 'operacional', prioridade: 'alta', funcao: 'operacional' }
  ],
  bolsista: [
    { titulo: 'Verificar documentação do bolsista — {protocolo}', tipo: 'rh', prioridade: 'alta', funcao: 'rh' },
    { titulo: 'Processar contrato de bolsista — {protocolo}', tipo: 'administrativa', prioridade: 'media', funcao: 'rh' }
  ],
  professor: [
    { titulo: 'Verificar habilitação do professor — {protocolo}', tipo: 'rh', prioridade: 'alta', funcao: 'rh' },
    { titulo: 'Processar contrato de professor — {protocolo}', tipo: 'administrativa', prioridade: 'media', funcao: 'rh' }
  ],
  servico: [
    { titulo: 'Solicitar proposta de serviço — {protocolo}', tipo: 'administrativa', prioridade: 'media', funcao: 'administrativo' },
    { titulo: 'Acompanhar execução do serviço — {protocolo}', tipo: 'operacional', prioridade: 'media', funcao: 'operacional' }
  ],
  estrutura_tecnica: [
    { titulo: 'Verificar disponibilidade de equipamentos — {protocolo}', tipo: 'infraestrutura', prioridade: 'alta', funcao: 'infraestrutura' },
    { titulo: 'Montar estrutura técnica — {protocolo}', tipo: 'infraestrutura', prioridade: 'alta', funcao: 'infraestrutura' }
  ],
  material_grafico: [
    { titulo: 'Briefing de material gráfico — {protocolo}', tipo: 'comunicacao', prioridade: 'media', funcao: 'comunicacao' },
    { titulo: 'Aprovar arte final — {protocolo}', tipo: 'comunicacao', prioridade: 'media', funcao: 'comunicacao' }
  ],
  camarim: [
    { titulo: 'Preparar camarim para evento — {protocolo}', tipo: 'infraestrutura', prioridade: 'alta', funcao: 'infraestrutura' }
  ],
  compra: [
    { titulo: 'Solicitar cotações para compra — {protocolo}', tipo: 'administrativa', prioridade: 'media', funcao: 'administrativo' },
    { titulo: 'Processar nota fiscal — {protocolo}', tipo: 'financeiro', prioridade: 'media', funcao: 'financeiro' }
  ],
  aquisicao: [
    { titulo: 'Processo de aquisição — {protocolo}', tipo: 'administrativa', prioridade: 'media', funcao: 'administrativo' }
  ]
};

// ── Trigger global para verificação diária ───────────────────────────────────

function solicitacoes_verificarPendenciasDiario() {
  try {
    var pendencias = SolicitacaoEngine.detectarPendencias();
    var enviados = 0;
    pendencias.forEach(function(p) {
      try {
        if (p.destinatario && p.destinatario.includes('@')) {
          NotificationEngine.enviarAlertaSolicitacao(p);
          enviados++;
        }
      } catch(e) {
        Logger.warn('[solicitacoes_verificarPendenciasDiario] ' + e.message);
      }
    });
    Logger.info('[SolicitacaoEngine] Pendências: ' + pendencias.length + ' detectadas, ' + enviados + ' notificadas.');
    return { pendencias: pendencias.length, enviados: enviados };
  } catch(e) {
    Logger.error('[solicitacoes_verificarPendenciasDiario] ' + e.message);
  }
}
