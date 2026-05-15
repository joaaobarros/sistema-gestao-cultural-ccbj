/**
 * @file modules/processos/processo_institucional_engine.gs
 * @layer modules
 * @description Motor de Processos Institucionais — camada de orquestração transversal.
 *
 *              PRINCÍPIO ARQUITETURAL:
 *              Este módulo NÃO implementa um novo FSM. O motor de fluxo real de cada
 *              etapa reside nos engines especializados (TarefaEngine, ReservaEngine, etc.).
 *              O ProcessoInstitucionalEngine é um ORQUESTRADOR: mantém o "fio institucional"
 *              que conecta tarefas, reservas, reuniões, contratos e RH numa timeline única
 *              rastreável. O status do processo é derivado das entidades vinculadas ou
 *              avançado manualmente por gestores.
 *
 *              PADRÃO DE USO:
 *              1. Controller cria o processo (ProcessoInstitucionalEngine.criar)
 *              2. Controller cria entidades nos engines especializados (TarefaEngine, etc.)
 *              3. Controller vincula as entidades criadas ao processo (ProcessoInstitucionalEngine.vincular*)
 *              4. Engine mantém timeline consolidada automaticamente a cada vínculo
 *
 * @depends modules/processos/processo_institucional_repository.gs
 * @depends core/event_bus_backend.gs (SystemEvents)
 * @depends core/logger.gs (Logger)
 */

// ── Estados canônicos ────────────────────────────────────────────────────────

var STATUS_PROCESSO = {
  SOLICITADO:          'solicitado',
  EM_ANDAMENTO:        'em_andamento',
  AGUARDANDO_SETOR:    'aguardando_setor',
  AGUARDANDO_APROVACAO:'aguardando_aprovacao',
  BLOQUEADO:           'bloqueado',
  CONCLUIDO:           'concluido',
  CANCELADO:           'cancelado'
};

var LABEL_STATUS_PROCESSO = {
  solicitado:           'Solicitado',
  em_andamento:         'Em Andamento',
  aguardando_setor:     'Aguardando Setor',
  aguardando_aprovacao: 'Aguard. Aprovação',
  bloqueado:            'Bloqueado',
  concluido:            'Concluído',
  cancelado:            'Cancelado'
};

// Transições simples (sem FSMGuardian — status é parcialmente derivado)
var _TRANSICOES_PROCESSO = {
  solicitado:           ['em_andamento', 'cancelado'],
  em_andamento:         ['aguardando_setor', 'aguardando_aprovacao', 'bloqueado', 'concluido', 'cancelado'],
  aguardando_setor:     ['em_andamento', 'aguardando_aprovacao', 'bloqueado', 'concluido', 'cancelado'],
  aguardando_aprovacao: ['em_andamento', 'bloqueado', 'concluido', 'cancelado'],
  bloqueado:            ['em_andamento', 'cancelado'],
  concluido:            [],
  cancelado:            []
};

// Tipos de processo pré-definidos
var TIPO_PROCESSO = {
  CONTRATACAO_PROFESSOR:    'contratacao_professor',
  CONTRATACAO_PROFISSIONAL: 'contratacao_profissional',
  CONTRATACAO_SERVICO:      'contratacao_servico',
  AQUISICAO_EQUIPAMENTO:    'aquisicao_equipamento',
  BOLSISTA:                 'bolsista',
  MANUTENCAO_ESPACO:        'manutencao_espaco',
  PROJETO_CULTURAL:         'projeto_cultural',
  CAMPANHA_COMUNICACAO:     'campanha_comunicacao',
  OUTRO:                    'outro'
};

// Setores canônicos do sistema
var SETORES_SISTEMA = ['rh', 'financeiro', 'comunicacao', 'reservas', 'infraestrutura',
                       'juridico', 'direcao', 'operacional', 'programacao'];

// ── Helpers privados ─────────────────────────────────────────────────────────

function _agora_proc() { return new Date().toISOString(); }

function _gerarId_proc(prefixo) {
  return (typeof gerarId === 'function')
    ? gerarId(prefixo)
    : prefixo + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

function _emitir_proc(tipo, proc, emailAtor, extra) {
  try {
    SystemEvents.emit(tipo, {
      entidade:   'processo_institucional',
      entidadeId: proc.id,
      usuario:    emailAtor || 'sistema',
      contexto:   Object.assign({ titulo: proc.titulo, status: proc.status }, extra || {})
    });
  } catch(e) {
    Logger.warn('[ProcessoInstitucionalEngine] Falha ao emitir evento ' + tipo + ': ' + e.message);
  }
}

function _validarTransicaoProcesso(statusAtual, novoStatus) {
  var permitidos = _TRANSICOES_PROCESSO[statusAtual] || [];
  if (permitidos.indexOf(novoStatus) === -1) {
    throw new Error(
      'Transição inválida de processo: "' + statusAtual + '" → "' + novoStatus + '". ' +
      'Permitidas: [' + (permitidos.join(', ') || 'nenhuma') + ']'
    );
  }
}

function _novoEventoTimeline(tipo, descricao, emailAtor, entidade, entidadeId, setor) {
  return {
    id:         _gerarId_proc('evt'),
    tipo:       tipo,
    descricao:  descricao,
    ator:       emailAtor  || 'sistema',
    setor:      setor      || null,
    entidade:   entidade   || null,
    entidadeId: entidadeId || null,
    timestamp:  _agora_proc()
  };
}

// ── ProcessoInstitucionalEngine ──────────────────────────────────────────────

var ProcessoInstitucionalEngine = (function() {

  return {

    // ── Criação ───────────────────────────────────────────────────────────────

    criar: function(dados, emailCriador) {
      if (!dados || !dados.titulo) throw new Error('Título do processo é obrigatório.');
      if (!dados.tipo)             throw new Error('Tipo do processo é obrigatório.');

      var agora = _agora_proc();
      var proc  = {
        id:                _gerarId_proc('proc'),
        titulo:            dados.titulo,
        descricao:         dados.descricao    || '',
        tipo:              dados.tipo,
        status:            STATUS_PROCESSO.SOLICITADO,
        prioridade:        dados.prioridade   || 'media',

        // Partes envolvidas
        solicitante:       dados.solicitante  || emailCriador || '',
        responsavelAtual:  dados.responsavelAtual || emailCriador || '',
        setoresEnvolvidos: dados.setoresEnvolvidos || [],

        // Vínculo com Ação Institucional (opcional)
        acaoId:            dados.acaoId       || '',

        // Vínculos com entidades (snapshots — não dados live)
        tarefas:           [],
        reservas:          [],
        reunioes:          [],
        encaminhamentos:   [],
        contratos:         [],
        contratacoes:      [],
        comunicacoes:      [],

        // Financeiro consolidado (atualizado a cada vínculo financeiro)
        impactoFinanceiro: {
          previsto:  dados.valorPrevisto || 0,
          executado: 0
        },

        // Timeline unificada (append-only)
        timeline: [
          _novoEventoTimeline(
            'criacao',
            'Processo criado: ' + dados.titulo,
            emailCriador,
            'processo_institucional',
            null,
            null
          )
        ],

        // Alertas detectados
        alertas: [],

        // Datas e rastreamento
        prazo:       dados.prazo    || '',
        criadoEm:    agora,
        atualizadoEm: agora,
        criadoPor:   emailCriador  || '',
        concluidoEm: '',
        canceladoEm: '',

        historico: [{
          de:         '',
          para:       STATUS_PROCESSO.SOLICITADO,
          motivo:     'Processo criado',
          ator:       emailCriador || 'sistema',
          timestamp:  agora
        }]
      };

      ProcessoInstitucionalRepository.salvar(proc);

      _emitir_proc('PROCESSO_CRIADO', proc, emailCriador, {
        tipo:              proc.tipo,
        setoresEnvolvidos: proc.setoresEnvolvidos
      });

      return proc;
    },

    // ── Mudança de status (manual) ────────────────────────────────────────────

    mudarStatus: function(id, novoStatus, motivo, emailAtor) {
      var proc = ProcessoInstitucionalRepository.obterPorId(id);
      if (!proc) throw new Error('Processo não encontrado: ' + id);

      _validarTransicaoProcesso(proc.status, novoStatus);

      var statusAnterior  = proc.status;
      proc.status         = novoStatus;
      proc.atualizadoEm   = _agora_proc();

      if (novoStatus === STATUS_PROCESSO.CONCLUIDO) proc.concluidoEm = _agora_proc();
      if (novoStatus === STATUS_PROCESSO.CANCELADO)  proc.canceladoEm = _agora_proc();

      proc.historico = proc.historico || [];
      proc.historico.push({
        de:        statusAnterior,
        para:      novoStatus,
        motivo:    motivo || '',
        ator:      emailAtor || 'sistema',
        timestamp: _agora_proc()
      });

      proc.timeline = proc.timeline || [];
      proc.timeline.push(_novoEventoTimeline(
        'status_change',
        'Status alterado: ' + (LABEL_STATUS_PROCESSO[statusAnterior] || statusAnterior) +
          ' → ' + (LABEL_STATUS_PROCESSO[novoStatus] || novoStatus) +
          (motivo ? ' (' + motivo + ')' : ''),
        emailAtor
      ));

      ProcessoInstitucionalRepository.salvar(proc);

      _emitir_proc('PROCESSO_STATUS_CHANGED', proc, emailAtor, {
        de: statusAnterior, para: novoStatus
      });

      return proc;
    },

    // ── Edição de campos básicos ──────────────────────────────────────────────

    editar: function(id, campos, emailAtor) {
      var proc = ProcessoInstitucionalRepository.obterPorId(id);
      if (!proc) throw new Error('Processo não encontrado: ' + id);

      var editaveis = ['titulo', 'descricao', 'prioridade', 'prazo', 'responsavelAtual',
                       'setoresEnvolvidos', 'acaoId', 'impactoFinanceiro'];

      editaveis.forEach(function(k) {
        if (campos.hasOwnProperty(k)) proc[k] = campos[k];
      });

      proc.atualizadoEm = _agora_proc();

      proc.timeline = proc.timeline || [];
      proc.timeline.push(_novoEventoTimeline(
        'edicao',
        'Processo atualizado',
        emailAtor
      ));

      ProcessoInstitucionalRepository.salvar(proc);
      return proc;
    },

    // ── Vínculos com Tarefas ──────────────────────────────────────────────────

    vincularTarefa: function(processoId, resumoTarefa, emailAtor) {
      if (!resumoTarefa || !resumoTarefa.id) throw new Error('resumoTarefa.id é obrigatório.');
      var proc = ProcessoInstitucionalRepository.obterPorId(processoId);
      if (!proc) throw new Error('Processo não encontrado: ' + processoId);

      // Deduplicação: não vincular mesma tarefa duas vezes
      proc.tarefas = proc.tarefas || [];
      if (proc.tarefas.some(function(t) { return t.id === resumoTarefa.id; })) {
        return proc;
      }

      proc.tarefas.push({
        id:          resumoTarefa.id,
        titulo:      resumoTarefa.titulo      || '',
        status:      resumoTarefa.status      || '',
        responsavel: resumoTarefa.responsavel || '',
        prazo:       resumoTarefa.prazo        || '',
        prioridade:  resumoTarefa.prioridade   || '',
        vinculadoEm: _agora_proc()
      });

      proc.atualizadoEm = _agora_proc();

      if (proc.status === STATUS_PROCESSO.SOLICITADO) {
        proc.status = STATUS_PROCESSO.EM_ANDAMENTO;
        proc.historico.push({
          de: STATUS_PROCESSO.SOLICITADO,
          para: STATUS_PROCESSO.EM_ANDAMENTO,
          motivo: 'Primeira tarefa vinculada',
          ator: emailAtor || 'sistema',
          timestamp: _agora_proc()
        });
      }

      proc.timeline = proc.timeline || [];
      proc.timeline.push(_novoEventoTimeline(
        'vinculo',
        'Tarefa vinculada: ' + (resumoTarefa.titulo || resumoTarefa.id),
        emailAtor,
        'tarefa',
        resumoTarefa.id,
        resumoTarefa.setor || null
      ));

      ProcessoInstitucionalRepository.salvar(proc);

      _emitir_proc('PROCESSO_VINCULO_ADICIONADO', proc, emailAtor, {
        tipoVinculo: 'tarefa', entidadeId: resumoTarefa.id
      });

      return proc;
    },

    // Atualiza snapshot da tarefa na lista do processo (chamado quando tarefa muda de status)
    atualizarSnapshotTarefa: function(processoId, resumoTarefa, emailAtor) {
      var proc = ProcessoInstitucionalRepository.obterPorId(processoId);
      if (!proc) return null;

      proc.tarefas = proc.tarefas || [];
      var idx = proc.tarefas.findIndex(function(t) { return t.id === resumoTarefa.id; });
      if (idx === -1) return proc;

      var statusAnterior = proc.tarefas[idx].status;
      proc.tarefas[idx] = Object.assign(proc.tarefas[idx], {
        status:      resumoTarefa.status      || proc.tarefas[idx].status,
        responsavel: resumoTarefa.responsavel || proc.tarefas[idx].responsavel,
        prazo:       resumoTarefa.prazo       || proc.tarefas[idx].prazo,
        atualizadoEm: _agora_proc()
      });

      proc.atualizadoEm = _agora_proc();

      if (statusAnterior !== resumoTarefa.status) {
        proc.timeline = proc.timeline || [];
        proc.timeline.push(_novoEventoTimeline(
          'tarefa_status',
          'Tarefa "' + (resumoTarefa.titulo || resumoTarefa.id) + '": ' +
            statusAnterior + ' → ' + resumoTarefa.status,
          emailAtor || 'sistema',
          'tarefa',
          resumoTarefa.id
        ));
      }

      ProcessoInstitucionalRepository.salvar(proc);
      return proc;
    },

    // ── Vínculos com Reservas ─────────────────────────────────────────────────

    vincularReserva: function(processoId, resumoReserva, emailAtor) {
      if (!resumoReserva || !resumoReserva.id) throw new Error('resumoReserva.id é obrigatório.');
      var proc = ProcessoInstitucionalRepository.obterPorId(processoId);
      if (!proc) throw new Error('Processo não encontrado: ' + processoId);

      proc.reservas = proc.reservas || [];
      if (proc.reservas.some(function(r) { return r.id === resumoReserva.id; })) return proc;

      proc.reservas.push({
        id:          resumoReserva.id,
        espaco:      resumoReserva.espaco    || '',
        data:        resumoReserva.data      || '',
        inicio:      resumoReserva.inicio    || '',
        fim:         resumoReserva.fim       || '',
        status:      resumoReserva.status    || '',
        responsavel: resumoReserva.responsavel || '',
        vinculadoEm: _agora_proc()
      });

      proc.atualizadoEm = _agora_proc();

      if ((proc.setoresEnvolvidos || []).indexOf('reservas') === -1) {
        proc.setoresEnvolvidos = (proc.setoresEnvolvidos || []).concat(['reservas']);
      }

      proc.timeline = proc.timeline || [];
      proc.timeline.push(_novoEventoTimeline(
        'vinculo',
        'Reserva vinculada: ' + (resumoReserva.espaco || resumoReserva.id) +
          (resumoReserva.data ? ' em ' + resumoReserva.data : ''),
        emailAtor,
        'reserva',
        resumoReserva.id,
        'reservas'
      ));

      ProcessoInstitucionalRepository.salvar(proc);

      _emitir_proc('PROCESSO_VINCULO_ADICIONADO', proc, emailAtor, {
        tipoVinculo: 'reserva', entidadeId: resumoReserva.id
      });

      return proc;
    },

    // ── Vínculos com Reuniões ─────────────────────────────────────────────────

    vincularReuniao: function(processoId, resumoReuniao, emailAtor) {
      if (!resumoReuniao || !resumoReuniao.id) throw new Error('resumoReuniao.id é obrigatório.');
      var proc = ProcessoInstitucionalRepository.obterPorId(processoId);
      if (!proc) throw new Error('Processo não encontrado: ' + processoId);

      proc.reunioes = proc.reunioes || [];
      if (proc.reunioes.some(function(r) { return r.id === resumoReuniao.id; })) return proc;

      proc.reunioes.push({
        id:           resumoReuniao.id,
        titulo:       resumoReuniao.titulo      || '',
        data:         resumoReuniao.data        || '',
        status:       resumoReuniao.status      || '',
        organizador:  resumoReuniao.organizador || '',
        vinculadoEm:  _agora_proc()
      });

      proc.atualizadoEm = _agora_proc();

      proc.timeline = proc.timeline || [];
      proc.timeline.push(_novoEventoTimeline(
        'vinculo',
        'Reunião vinculada: ' + (resumoReuniao.titulo || resumoReuniao.id),
        emailAtor,
        'reuniao',
        resumoReuniao.id
      ));

      ProcessoInstitucionalRepository.salvar(proc);
      return proc;
    },

    // ── Vínculos com Encaminhamentos ──────────────────────────────────────────

    vincularEncaminhamento: function(processoId, resumoEnc, emailAtor) {
      if (!resumoEnc || !resumoEnc.id) throw new Error('resumoEnc.id é obrigatório.');
      var proc = ProcessoInstitucionalRepository.obterPorId(processoId);
      if (!proc) throw new Error('Processo não encontrado: ' + processoId);

      proc.encaminhamentos = proc.encaminhamentos || [];
      if (proc.encaminhamentos.some(function(e) { return e.id === resumoEnc.id; })) return proc;

      proc.encaminhamentos.push({
        id:          resumoEnc.id,
        descricao:   resumoEnc.descricao  || '',
        responsavel: resumoEnc.responsavel|| '',
        prazo:       resumoEnc.prazo      || '',
        status:      resumoEnc.status     || '',
        vinculadoEm: _agora_proc()
      });

      proc.atualizadoEm = _agora_proc();

      proc.timeline = proc.timeline || [];
      proc.timeline.push(_novoEventoTimeline(
        'vinculo',
        'Encaminhamento vinculado: ' + (resumoEnc.descricao || resumoEnc.id),
        emailAtor,
        'encaminhamento',
        resumoEnc.id
      ));

      ProcessoInstitucionalRepository.salvar(proc);
      return proc;
    },

    // ── Vínculos com Contratos ────────────────────────────────────────────────

    vincularContrato: function(processoId, resumoContrato, emailAtor) {
      if (!resumoContrato || !resumoContrato.id) throw new Error('resumoContrato.id é obrigatório.');
      var proc = ProcessoInstitucionalRepository.obterPorId(processoId);
      if (!proc) throw new Error('Processo não encontrado: ' + processoId);

      proc.contratos = proc.contratos || [];
      if (proc.contratos.some(function(c) { return c.id === resumoContrato.id; })) return proc;

      var valor = parseFloat(resumoContrato.valor) || 0;
      proc.contratos.push({
        id:          resumoContrato.id,
        descricao:   resumoContrato.descricao || '',
        valor:       valor,
        status:      resumoContrato.status    || '',
        tipo:        resumoContrato.tipo      || '',
        vinculadoEm: _agora_proc()
      });

      // Atualiza impacto financeiro previsto
      proc.impactoFinanceiro = proc.impactoFinanceiro || { previsto: 0, executado: 0 };
      proc.impactoFinanceiro.previsto = (proc.impactoFinanceiro.previsto || 0) + valor;

      proc.atualizadoEm = _agora_proc();

      if ((proc.setoresEnvolvidos || []).indexOf('juridico') === -1) {
        proc.setoresEnvolvidos = (proc.setoresEnvolvidos || []).concat(['juridico']);
      }

      proc.timeline = proc.timeline || [];
      proc.timeline.push(_novoEventoTimeline(
        'vinculo',
        'Contrato vinculado: ' + (resumoContrato.descricao || resumoContrato.id) +
          (valor ? ' (R$ ' + valor.toFixed(2) + ')' : ''),
        emailAtor,
        'contrato',
        resumoContrato.id,
        'juridico'
      ));

      ProcessoInstitucionalRepository.salvar(proc);

      _emitir_proc('PROCESSO_VINCULO_ADICIONADO', proc, emailAtor, {
        tipoVinculo: 'contrato', entidadeId: resumoContrato.id, valor: valor
      });

      return proc;
    },

    // ── Vínculos com Contratações RH ──────────────────────────────────────────

    vincularContratacaoRH: function(processoId, resumoContratacao, emailAtor) {
      if (!resumoContratacao || !resumoContratacao.id) throw new Error('resumoContratacao.id é obrigatório.');
      var proc = ProcessoInstitucionalRepository.obterPorId(processoId);
      if (!proc) throw new Error('Processo não encontrado: ' + processoId);

      proc.contratacoes = proc.contratacoes || [];
      if (proc.contratacoes.some(function(c) { return c.id === resumoContratacao.id; })) return proc;

      var valor = parseFloat(resumoContratacao.valor) || 0;
      proc.contratacoes.push({
        id:          resumoContratacao.id,
        nome:        resumoContratacao.nome  || '',
        tipo:        resumoContratacao.tipo  || '',
        valor:       valor,
        status:      resumoContratacao.status|| '',
        setor:       resumoContratacao.setor || 'rh',
        vinculadoEm: _agora_proc()
      });

      // Integração RH → Financeiro: atualiza impacto financeiro
      proc.impactoFinanceiro = proc.impactoFinanceiro || { previsto: 0, executado: 0 };
      if (valor > 0) {
        proc.impactoFinanceiro.previsto = (proc.impactoFinanceiro.previsto || 0) + valor;
      }

      proc.atualizadoEm = _agora_proc();

      var setores = proc.setoresEnvolvidos || [];
      if (setores.indexOf('rh') === -1)        setores = setores.concat(['rh']);
      if (setores.indexOf('financeiro') === -1) setores = setores.concat(['financeiro']);
      proc.setoresEnvolvidos = setores;

      proc.timeline = proc.timeline || [];
      proc.timeline.push(_novoEventoTimeline(
        'vinculo',
        'Contratação RH vinculada: ' + (resumoContratacao.nome || resumoContratacao.id) +
          (valor ? ' — R$ ' + valor.toFixed(2) : '') +
          ' [Impacto financeiro registrado automaticamente]',
        emailAtor,
        'contratacao_rh',
        resumoContratacao.id,
        'rh'
      ));

      ProcessoInstitucionalRepository.salvar(proc);

      _emitir_proc('PROCESSO_VINCULO_ADICIONADO', proc, emailAtor, {
        tipoVinculo: 'contratacao_rh', entidadeId: resumoContratacao.id,
        impactoFinanceiro: proc.impactoFinanceiro
      });

      return proc;
    },

    // ── Vínculos com Comunicação ──────────────────────────────────────────────

    vincularComunicacao: function(processoId, resumoComunicacao, emailAtor) {
      if (!resumoComunicacao || !resumoComunicacao.id) throw new Error('resumoComunicacao.id é obrigatório.');
      var proc = ProcessoInstitucionalRepository.obterPorId(processoId);
      if (!proc) throw new Error('Processo não encontrado: ' + processoId);

      proc.comunicacoes = proc.comunicacoes || [];
      if (proc.comunicacoes.some(function(c) { return c.id === resumoComunicacao.id; })) return proc;

      proc.comunicacoes.push({
        id:          resumoComunicacao.id,
        titulo:      resumoComunicacao.titulo || '',
        tipo:        resumoComunicacao.tipo   || '',
        status:      resumoComunicacao.status || '',
        responsavel: resumoComunicacao.responsavel || '',
        vinculadoEm: _agora_proc()
      });

      proc.atualizadoEm = _agora_proc();

      var setores = proc.setoresEnvolvidos || [];
      if (setores.indexOf('comunicacao') === -1) {
        proc.setoresEnvolvidos = setores.concat(['comunicacao']);
      }

      proc.timeline = proc.timeline || [];
      proc.timeline.push(_novoEventoTimeline(
        'vinculo',
        'Demanda de comunicação vinculada: ' + (resumoComunicacao.titulo || resumoComunicacao.id),
        emailAtor,
        'comunicacao',
        resumoComunicacao.id,
        'comunicacao'
      ));

      ProcessoInstitucionalRepository.salvar(proc);
      return proc;
    },

    // ── Registro de pagamento executado ──────────────────────────────────────

    registrarPagamento: function(processoId, valor, descricao, emailAtor) {
      var proc = ProcessoInstitucionalRepository.obterPorId(processoId);
      if (!proc) throw new Error('Processo não encontrado: ' + processoId);

      proc.impactoFinanceiro = proc.impactoFinanceiro || { previsto: 0, executado: 0 };
      proc.impactoFinanceiro.executado = (proc.impactoFinanceiro.executado || 0) + (parseFloat(valor) || 0);
      proc.atualizadoEm = _agora_proc();

      proc.timeline = proc.timeline || [];
      proc.timeline.push(_novoEventoTimeline(
        'pagamento',
        'Pagamento registrado: R$ ' + parseFloat(valor).toFixed(2) +
          (descricao ? ' — ' + descricao : ''),
        emailAtor,
        null, null,
        'financeiro'
      ));

      ProcessoInstitucionalRepository.salvar(proc);
      return proc;
    },

    // ── Comentários ───────────────────────────────────────────────────────────

    adicionarComentario: function(processoId, texto, emailAtor) {
      if (!texto || !texto.trim()) throw new Error('Comentário não pode ser vazio.');
      var proc = ProcessoInstitucionalRepository.obterPorId(processoId);
      if (!proc) throw new Error('Processo não encontrado: ' + processoId);

      proc.timeline = proc.timeline || [];
      proc.timeline.push(_novoEventoTimeline(
        'comentario',
        texto.trim(),
        emailAtor
      ));

      proc.atualizadoEm = _agora_proc();
      ProcessoInstitucionalRepository.salvar(proc);
      return { ok: true };
    },

    // ── Dashboard do processo ─────────────────────────────────────────────────

    obterDashboard: function(processoId) {
      var proc = ProcessoInstitucionalRepository.obterPorId(processoId);
      if (!proc) throw new Error('Processo não encontrado: ' + processoId);

      var tarefas         = proc.tarefas         || [];
      var reservas        = proc.reservas         || [];
      var reunioes        = proc.reunioes          || [];
      var encaminhamentos = proc.encaminhamentos  || [];
      var contratos       = proc.contratos        || [];
      var contratacoes    = proc.contratacoes     || [];
      var comunicacoes    = proc.comunicacoes     || [];

      var TERM = ['concluida', 'concluido', 'cancelado', 'cancelada'];

      function _pctConcluido(lista) {
        if (!lista.length) return null;
        var c = lista.filter(function(i) {
          return i.status === 'concluida' || i.status === 'concluido';
        }).length;
        return Math.round(c / lista.length * 100);
      }

      function _pendentes(lista) {
        return lista.filter(function(i) { return TERM.indexOf(i.status) === -1; }).length;
      }

      // Gargalos: entidades abertas com prazo vencido
      var agora    = Date.now();
      var atrasadas = tarefas.filter(function(t) {
        return t.prazo && new Date(t.prazo).getTime() < agora &&
               TERM.indexOf(t.status) === -1;
      });

      var encPendentes = encaminhamentos.filter(function(e) {
        return e.status === 'pendente' || e.status === 'em_andamento';
      });

      var gargalos = [];
      if (atrasadas.length)    gargalos.push({ tipo: 'tarefas_atrasadas',    quantidade: atrasadas.length,    descricao: atrasadas.length + ' tarefa(s) atrasada(s)' });
      if (encPendentes.length) gargalos.push({ tipo: 'encaminhamentos_abertos', quantidade: encPendentes.length, descricao: encPendentes.length + ' encaminhamento(s) aberto(s)' });

      var saldoFin = (proc.impactoFinanceiro.previsto || 0) - (proc.impactoFinanceiro.executado || 0);
      if (saldoFin < 0) gargalos.push({ tipo: 'financeiro_negativo', quantidade: 1, descricao: 'Saldo financeiro negativo: R$ ' + saldoFin.toFixed(2) });

      return {
        processo: {
          id:               proc.id,
          titulo:           proc.titulo,
          tipo:             proc.tipo,
          status:           proc.status,
          statusLabel:      LABEL_STATUS_PROCESSO[proc.status] || proc.status,
          prioridade:       proc.prioridade,
          responsavelAtual: proc.responsavelAtual,
          setoresEnvolvidos: proc.setoresEnvolvidos,
          prazo:            proc.prazo,
          criadoEm:         proc.criadoEm,
          atualizadoEm:     proc.atualizadoEm
        },
        resumo: {
          tarefas:         { total: tarefas.length,         pendentes: _pendentes(tarefas),         pctConcluido: _pctConcluido(tarefas) },
          reservas:        { total: reservas.length,        pendentes: _pendentes(reservas) },
          reunioes:        { total: reunioes.length },
          encaminhamentos: { total: encaminhamentos.length, pendentes: encPendentes.length },
          contratos:       { total: contratos.length },
          contratacoes:    { total: contratacoes.length },
          comunicacoes:    { total: comunicacoes.length }
        },
        impactoFinanceiro: {
          previsto:  proc.impactoFinanceiro.previsto  || 0,
          executado: proc.impactoFinanceiro.executado || 0,
          saldo:     saldoFin
        },
        gargalos:    gargalos,
        alertas:     (proc.alertas || []).filter(function(a) { return !a.resolvido; }),
        timeline:    (proc.timeline || []).slice(-30),  // últimos 30 eventos
        vinculos: {
          tarefas:         tarefas,
          reservas:        reservas,
          reunioes:        reunioes,
          encaminhamentos: encaminhamentos,
          contratos:       contratos,
          contratacoes:    contratacoes,
          comunicacoes:    comunicacoes
        }
      };
    },

    // ── Timeline completa ─────────────────────────────────────────────────────

    obterTimeline: function(processoId) {
      var proc = ProcessoInstitucionalRepository.obterPorId(processoId);
      if (!proc) throw new Error('Processo não encontrado: ' + processoId);
      return (proc.timeline || []).sort(function(a, b) {
        return new Date(a.timestamp) - new Date(b.timestamp);
      });
    },

    // ── Criação de tarefa vinculada (atalho: cria + vincula em 1 passo) ───────

    criarTarefaVinculada: function(processoId, dadosTarefa, emailCriador) {
      var proc = ProcessoInstitucionalRepository.obterPorId(processoId);
      if (!proc) throw new Error('Processo não encontrado: ' + processoId);

      // Enriquece a tarefa com contexto do processo
      var dadosEnriquecidos = Object.assign({}, dadosTarefa, {
        processoId: processoId,
        processo:   proc.titulo,
        modulo:     dadosTarefa.modulo || proc.tipo || 'processo_institucional'
      });

      var tarefa = TarefaEngine.criar(dadosEnriquecidos, emailCriador);

      // Vincula ao processo
      ProcessoInstitucionalEngine.vincularTarefa(processoId, {
        id:          tarefa.id,
        titulo:      tarefa.titulo,
        status:      tarefa.status,
        responsavel: tarefa.responsavel,
        prazo:       tarefa.prazo,
        prioridade:  tarefa.prioridade
      }, emailCriador);

      return tarefa;
    },

    // ── Detecção de gargalos e alertas (para NotificationEngine) ─────────────

    detectarAlertas: function() {
      var abertos = ProcessoInstitucionalRepository.listarAbertos();
      var alertas = [];
      var agora   = Date.now();

      abertos.forEach(function(proc) {
        // Processo com prazo vencido
        if (proc.prazo && new Date(proc.prazo).getTime() < agora) {
          alertas.push({
            processoId:     proc.id,
            processoTitulo: proc.titulo,
            tipo:           'prazo_vencido',
            destinatario:   proc.responsavelAtual || proc.solicitante,
            descricao:      'Processo "' + proc.titulo + '" com prazo vencido.',
            urgencia:       'alta'
          });
        }

        // Processo sem atividade há mais de 7 dias
        if (proc.atualizadoEm) {
          var diasSemAtividade = (agora - new Date(proc.atualizadoEm).getTime()) / 86400000;
          if (diasSemAtividade > 7) {
            alertas.push({
              processoId:     proc.id,
              processoTitulo: proc.titulo,
              tipo:           'inativo',
              destinatario:   proc.responsavelAtual || proc.solicitante,
              descricao:      'Processo "' + proc.titulo + '" sem atividade há ' + Math.floor(diasSemAtividade) + ' dias.',
              urgencia:       'media'
            });
          }
        }

        // Tarefas atrasadas vinculadas
        var tarefasAtrasadas = (proc.tarefas || []).filter(function(t) {
          return t.prazo && new Date(t.prazo).getTime() < agora &&
                 t.status !== 'concluida' && t.status !== 'cancelada';
        });
        if (tarefasAtrasadas.length) {
          alertas.push({
            processoId:     proc.id,
            processoTitulo: proc.titulo,
            tipo:           'tarefas_atrasadas',
            destinatario:   proc.responsavelAtual || proc.solicitante,
            descricao:      tarefasAtrasadas.length + ' tarefa(s) atrasada(s) no processo "' + proc.titulo + '".',
            urgencia:       'alta'
          });
        }

        // Impacto financeiro negativo
        var fin = proc.impactoFinanceiro || {};
        if ((fin.executado || 0) > (fin.previsto || 0) && fin.previsto > 0) {
          alertas.push({
            processoId:     proc.id,
            processoTitulo: proc.titulo,
            tipo:           'financeiro_negativo',
            destinatario:   proc.responsavelAtual || proc.solicitante,
            descricao:      'Processo "' + proc.titulo + '" com saldo financeiro negativo.',
            urgencia:       'critica'
          });
        }
      });

      return alertas;
    },

    // ── Verificação diária (para trigger time-based) ──────────────────────────

    verificarAlertosDiario: function() {
      var alertas = ProcessoInstitucionalEngine.detectarAlertas();
      var enviados = 0;

      alertas.forEach(function(alerta) {
        try {
          if (alerta.destinatario && alerta.destinatario.includes('@')) {
            NotificationEngine.enviarAlertaProcesso(alerta);
            enviados++;
          }
        } catch(e) {
          Logger.warn('[ProcessoInstitucionalEngine.verificarAlertosDiario] Falha: ' + e.message);
        }
      });

      Logger.info('[ProcessoInstitucionalEngine] Alertas diários: ' + alertas.length + ' detectados, ' + enviados + ' enviados.');
      return { alertas: alertas.length, enviados: enviados };
    }

  };
})();

// ── Trigger global (para agendamento time-based) ──────────────────────────────
function processos_verificarAlertosDiario() {
  try {
    return ProcessoInstitucionalEngine.verificarAlertosDiario();
  } catch(e) {
    Logger.warn('[trigger processos_verificarAlertosDiario] ' + e.message);
  }
}
