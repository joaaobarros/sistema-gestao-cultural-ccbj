/**
 * @file modules/tarefas/tarefa_engine.gs
 * @layer modules
 * @description Motor de Tarefas — FSM, criação com schema completo, delegação,
 *              comentários, automação por módulo e métricas operacionais.
 *              Ponto único de mutação do domínio Tarefas.
 *
 * @depends modules/tarefas/tarefa_repository.gs (TarefaRepository)
 * @depends core/event_bus_backend.gs (SystemEvents)
 * @depends core/logger.gs (Logger)
 */

// ── Estados canônicos ────────────────────────────────────────────────────────

var STATUS_TAREFA = {
  BACKLOG:              'backlog',
  SOLICITADA:           'solicitada',
  EM_ANALISE:           'em_analise',
  AGUARDANDO_DOC:       'aguardando_doc',
  EM_EXECUCAO:          'em_execucao',
  AGUARDANDO_APROVACAO: 'aguardando_aprovacao',
  CONCLUIDA:            'concluida',
  CANCELADA:            'cancelada',
  BLOQUEADA:            'bloqueada'
};

var LABEL_STATUS_TAREFA = {
  backlog:              'Backlog',
  solicitada:           'Solicitada',
  em_analise:           'Em Análise',
  aguardando_doc:       'Aguard. Documento',
  em_execucao:          'Em Execução',
  aguardando_aprovacao: 'Aguard. Aprovação',
  concluida:            'Concluída',
  cancelada:            'Cancelada',
  bloqueada:            'Bloqueada'
};

// FSM — transições permitidas por estado de origem
var _TRANSICOES_TAREFA = {
  backlog:              ['solicitada', 'cancelada'],
  solicitada:           ['em_analise', 'backlog', 'cancelada'],
  em_analise:           ['em_execucao', 'aguardando_doc', 'bloqueada', 'cancelada'],
  aguardando_doc:       ['em_analise', 'em_execucao', 'cancelada'],
  em_execucao:          ['aguardando_aprovacao', 'concluida', 'bloqueada', 'cancelada'],
  aguardando_aprovacao: ['concluida', 'em_execucao', 'cancelada'],
  bloqueada:            ['em_analise', 'em_execucao', 'cancelada'],
  concluida:            [],
  cancelada:            []
};

// SLA padrão por prioridade (horas)
var SLA_TAREFA_H = {
  critica: 4,
  alta:    24,
  media:   72,
  baixa:   168
};

// Templates de geração automática por evento de módulo
var _TEMPLATES_AUTO = {
  reserva_aprovada: {
    titulo:    'Preparar espaço para {ref}',
    tipo:      'infraestrutura',
    prioridade: 'alta',
    funcao:    'infraestrutura',
    sla:       24,
    status:    'solicitada'
  },
  contrato_criado: {
    titulo:    'Revisar contrato: {ref}',
    tipo:      'administrativa',
    prioridade: 'media',
    funcao:    'juridico',
    sla:       72,
    status:    'solicitada'
  },
  chave_atrasada: {
    titulo:    'Cobrar devolução de chave: {ref}',
    tipo:      'infraestrutura',
    prioridade: 'alta',
    funcao:    'infraestrutura',
    sla:       4,
    status:    'solicitada'
  },
  pagamento_pendente: {
    titulo:    'Verificar pagamento pendente: {ref}',
    tipo:      'administrativa',
    prioridade: 'alta',
    funcao:    'financeiro',
    sla:       24,
    status:    'solicitada'
  },
  manutencao_aberta: {
    titulo:    'Atender manutenção: {ref}',
    tipo:      'infraestrutura',
    prioridade: 'media',
    funcao:    'infraestrutura',
    sla:       48,
    status:    'solicitada'
  },
  habilitacao_aprovada: {
    titulo:    'Verificar habilitação aprovada: {ref}',
    tipo:      'operacional',
    prioridade: 'baixa',
    funcao:    'operacional',
    sla:       168,
    status:    'solicitada'
  },
  // ── Comunicação Institucional ─────────────────────────────────────────────
  demanda_comunicacao: {
    titulo:    'Demanda de comunicação: {ref}',
    tipo:      'comunicacao',
    prioridade: 'media',
    funcao:    'comunicacao',
    sla:       72,
    status:    'solicitada'
  },
  cobertura_evento: {
    titulo:    'Cobertura fotográfica/audiovisual: {ref}',
    tipo:      'comunicacao',
    prioridade: 'alta',
    funcao:    'audiovisual',
    sla:       24,
    status:    'solicitada'
  },
  divulgacao_evento: {
    titulo:    'Divulgação nas redes sociais: {ref}',
    tipo:      'comunicacao',
    prioridade: 'alta',
    funcao:    'comunicacao',
    sla:       48,
    status:    'solicitada'
  },
  release_imprensa: {
    titulo:    'Release para imprensa: {ref}',
    tipo:      'comunicacao',
    prioridade: 'media',
    funcao:    'redacao',
    sla:       72,
    status:    'solicitada'
  },
  arte_grafica: {
    titulo:    'Arte gráfica: {ref}',
    tipo:      'comunicacao',
    prioridade: 'media',
    funcao:    'design',
    sla:       48,
    status:    'solicitada'
  },
  campanha_comunicacao: {
    titulo:    'Campanha de comunicação: {ref}',
    tipo:      'comunicacao',
    prioridade: 'alta',
    funcao:    'comunicacao',
    sla:       120,
    status:    'solicitada'
  }
};

// Tipos de entrega de comunicação → função responsável
var TIPO_ENTREGA_FUNCAO = {
  design:             'design',
  diagramacao:        'design',
  foto:               'fotografia',
  ensaio_fotografico: 'fotografia',
  video:              'audiovisual',
  edicao_video:       'audiovisual',
  stories:            'audiovisual',
  materia:            'redacao',
  release:            'redacao',
  divulgacao:         'comunicacao',
  rece:               'comunicacao',
  campanha:           'comunicacao',
  cobertura:          'audiovisual'
};

// SLA padrão por tipo de entrega (horas)
var SLA_ENTREGA_H = {
  design:      48,
  fotografia:  24,
  audiovisual: 72,
  redacao:     48,
  comunicacao: 24
};

// ── Helpers privados ─────────────────────────────────────────────────────────

function _agora() { return new Date().toISOString(); }

function _validarTransicaoTarefa(statusAtual, novoStatus) {
  var permitidos = _TRANSICOES_TAREFA[statusAtual] || [];
  if (permitidos.indexOf(novoStatus) === -1) {
    throw new Error(
      'Transição inválida de tarefa: "' + statusAtual + '" → "' + novoStatus + '". ' +
      'Permitidas: [' + (permitidos.join(', ') || 'nenhuma') + ']'
    );
  }
}

function _calcularSlaViolado(tarefa) {
  if (!tarefa.sla || !tarefa.criadoEm) return false;
  if (tarefa.status === 'concluida' || tarefa.status === 'cancelada') return false;
  var limiteMs = new Date(tarefa.criadoEm).getTime() + (tarefa.sla * 3600000);
  return Date.now() > limiteMs;
}

function _emitirEvento(tipo, tarefa, emailAtor, extra) {
  try {
    SystemEvents.emit(tipo, {
      entidade:   'tarefa',
      entidadeId: tarefa.id,
      usuario:    emailAtor || 'sistema',
      contexto:   Object.assign({ titulo: tarefa.titulo, status: tarefa.status }, extra || {})
    });
  } catch(e) {
    Logger.warn('[TarefaEngine] Falha ao emitir evento ' + tipo + ': ' + e.message);
  }
}

// Obtém nível de acesso do usuário para controle de permissão (tolerante a falhas)
function _obterNivelUsuario(email) {
  try {
    var perms = obterPermissoesUsuario(email);
    return (perms && perms.nivel) ? perms.nivel : 'visitante';
  } catch(e) {
    Logger.warn('[TarefaEngine] Falha ao obter nível de ' + email + ': ' + e.message);
    return 'visitante';
  }
}

// ── TarefaEngine ──────────────────────────────────────────────────────────────

var TarefaEngine = (function() {

  return {

    // ── Criação ───────────────────────────────────────────────────────────────

    criar: function(dados, emailCriador) {
      if (!dados || !dados.titulo) throw new Error('Título da tarefa é obrigatório.');
      var pri = (dados.prioridade || 'media').toLowerCase();
      var tarefa = {
        id:                typeof gerarId === 'function' ? gerarId('tar') : 'tar_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        titulo:            dados.titulo,
        descricao:         dados.descricao || '',
        tipo:              dados.tipo || 'operacional',
        prioridade:        pri,
        tags:              dados.tags || [],

        modulo:            dados.modulo || 'manual',
        idOrigem:          dados.idOrigem || '',
        refOrigem:         dados.refOrigem || '',
        processo:          dados.processo || '',
        etapa:             dados.etapa || '',

        responsavel:       dados.responsavel || '',
        responsavelNome:   dados.responsavelNome || dados.responsavel || '',
        executores:        dados.executores || [],
        setor:             dados.setor || '',
        funcao:            dados.funcao || '',

        status:            dados.status || STATUS_TAREFA.SOLICITADA,
        statusAnterior:    '',

        prazo:             dados.prazo || '',
        duracaoPrevista:   dados.duracaoPrevista || 0,
        duracaoReal:       0,
        criadoEm:          _agora(),
        iniciadoEm:        '',
        concluidoEm:       '',
        atualizadoEm:      _agora(),

        dependencias:      dados.dependencias || [],
        subtarefas:        dados.subtarefas   || [],
        tarefaPai:         dados.tarefaPai    || '',
        ordem:             dados.ordem        || 0,

        // Vínculos com outros módulos
        idAcao:            dados.idAcao       || '',
        acaoNome:          dados.acaoNome     || '',

        // Vínculo com Processo Institucional (fio transversal)
        processoId:        dados.processoId   || '',

        sla:               dados.sla || SLA_TAREFA_H[pri] || 72,
        slaViolado:        false,

        criadoPor:         emailCriador || '',
        // metadados: dados extras específicos do módulo de origem (comunicação, etc.)
        metadados:         dados.metadados || {},

        historico: [{
          data:       _agora(),
          ator:       emailCriador || 'sistema',
          campo:      'status',
          de:         '',
          para:       dados.status || STATUS_TAREFA.SOLICITADA,
          comentario: 'Tarefa criada'
        }],
        comentarios: []
      };

      TarefaRepository.salvar(tarefa);
      _emitirEvento('TAREFA_CRIADA', tarefa, emailCriador, { modulo: tarefa.modulo });
      return tarefa;
    },

    // ── Edição de campos (sem mudança de status) ──────────────────────────────

    editar: function(id, campos, emailEditor) {
      var tarefa = TarefaRepository.obterPorId(id);
      if (!tarefa) throw new Error('Tarefa não encontrada: ' + id);

      var camposEditaveis = ['titulo','descricao','tipo','prioridade','prazo',
                             'responsavel','responsavelNome','executores','setor',
                             'funcao','tags','processo','etapa','duracaoPrevista','sla',
                             'idAcao','acaoNome','processoId'];

      var alteracoes = [];
      camposEditaveis.forEach(function(k) {
        if (campos.hasOwnProperty(k) && campos[k] !== tarefa[k]) {
          alteracoes.push({ campo: k, de: tarefa[k], para: campos[k] });
          tarefa[k] = campos[k];
        }
      });

      if (!alteracoes.length) return tarefa;

      tarefa.atualizadoEm = _agora();
      tarefa.slaViolado   = _calcularSlaViolado(tarefa);

      tarefa.historico = tarefa.historico || [];
      alteracoes.forEach(function(alt) {
        tarefa.historico.push({
          data:       _agora(),
          ator:       emailEditor || 'sistema',
          campo:      alt.campo,
          de:         alt.de,
          para:       alt.para,
          comentario: ''
        });
      });

      TarefaRepository.salvar(tarefa);
      return tarefa;
    },

    // ── Transição de status (FSM-guarded) ─────────────────────────────────────

    aplicarTransicao: function(id, novoStatus, emailAtor, comentario) {
      var tarefa = TarefaRepository.obterPorId(id);
      if (!tarefa) throw new Error('Tarefa não encontrada: ' + id);

      _validarTransicaoTarefa(tarefa.status, novoStatus);

      var statusAnterior   = tarefa.status;
      tarefa.statusAnterior = statusAnterior;
      tarefa.status         = novoStatus;
      tarefa.atualizadoEm   = _agora();

      if (novoStatus === STATUS_TAREFA.EM_EXECUCAO && !tarefa.iniciadoEm) {
        tarefa.iniciadoEm = _agora();
      }
      if (novoStatus === STATUS_TAREFA.CONCLUIDA) {
        tarefa.concluidoEm = _agora();
        if (tarefa.iniciadoEm) {
          tarefa.duracaoReal = Math.round(
            (new Date(tarefa.concluidoEm) - new Date(tarefa.iniciadoEm)) / 3600000
          );
        }
      }

      tarefa.slaViolado = _calcularSlaViolado(tarefa);

      tarefa.historico = tarefa.historico || [];
      tarefa.historico.push({
        data:       _agora(),
        ator:       emailAtor || 'sistema',
        campo:      'status',
        de:         statusAnterior,
        para:       novoStatus,
        comentario: comentario || ''
      });

      TarefaRepository.salvar(tarefa);
      _emitirEvento('TAREFA_STATUS_ALTERADO', tarefa, emailAtor, {
        de: statusAnterior, para: novoStatus
      });

      // Propaga mudança de status para o Processo Institucional vinculado (tolerante a falhas)
      if (tarefa.processoId) {
        try {
          ProcessoInstitucionalEngine.atualizarSnapshotTarefa(tarefa.processoId, {
            id:          tarefa.id,
            titulo:      tarefa.titulo,
            status:      tarefa.status,
            responsavel: tarefa.responsavel,
            prazo:       tarefa.prazo
          }, emailAtor || 'sistema');
        } catch(e) {
          Logger.warn('[TarefaEngine.aplicarTransicao] Falha ao sincronizar com ProcessoEngine: ' + e.message);
        }
      }

      return tarefa;
    },

    // ── Delegação ─────────────────────────────────────────────────────────────

    /**
     * Delega (reatribui) tarefa para outro responsável.
     * Requer que emailAtor seja admin/gestor OU o responsável atual.
     * @param {string} id
     * @param {string} paraEmail — novo responsável
     * @param {string} comentario
     * @param {string} emailAtor — quem está delegando
     * @param {string} nivelAtor — nível de acesso de emailAtor
     */
    delegar: function(id, paraEmail, comentario, emailAtor, nivelAtor) {
      if (!paraEmail) throw new Error('Destinatário da delegação é obrigatório.');
      var tarefa = TarefaRepository.obterPorId(id);
      if (!tarefa) throw new Error('Tarefa não encontrada: ' + id);

      // Verifica se pode delegar
      var niveisGestao = ['superadmin', 'admin', 'gestor'];
      var podeDelegar  = niveisGestao.indexOf(nivelAtor) !== -1 ||
                         tarefa.responsavel === emailAtor ||
                         tarefa.criadoPor   === emailAtor;

      if (!podeDelegar) {
        throw new Error('Sem permissão para delegar esta tarefa. ' +
          'Apenas o responsável atual, criador ou gestores podem delegar.');
      }

      var responsavelAnterior = tarefa.responsavel;
      tarefa.responsavel      = paraEmail;
      tarefa.responsavelNome  = paraEmail;
      tarefa.atualizadoEm     = _agora();

      tarefa.historico = tarefa.historico || [];
      tarefa.historico.push({
        data:       _agora(),
        ator:       emailAtor || 'sistema',
        campo:      'responsavel',
        de:         responsavelAnterior,
        para:       paraEmail,
        comentario: comentario || 'Tarefa delegada'
      });

      TarefaRepository.salvar(tarefa);
      _emitirEvento('TAREFA_DELEGADA', tarefa, emailAtor, {
        de: responsavelAnterior, para: paraEmail
      });
      return tarefa;
    },

    // ── Comentários ────────────────────────────────────────────────────────────

    registrarComentario: function(id, texto, emailAutor) {
      if (!texto || !texto.trim()) throw new Error('Comentário não pode ser vazio.');
      var tarefa = TarefaRepository.obterPorId(id);
      if (!tarefa) throw new Error('Tarefa não encontrada: ' + id);

      tarefa.comentarios = tarefa.comentarios || [];
      tarefa.comentarios.push({
        id:    typeof gerarId === 'function' ? gerarId('cmt') : 'cmt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        autor: emailAutor || 'sistema',
        texto: texto.trim(),
        data:  _agora()
      });
      tarefa.atualizadoEm = _agora();

      TarefaRepository.salvar(tarefa);
      return { ok: true };
    },

    // ── Automação — geração a partir de módulos ────────────────────────────────

    /**
     * Gera tarefa automaticamente a partir de evento de outro módulo.
     * @param {string} evento       — chave do template (ex: 'reserva_aprovada')
     * @param {Object} dadosEvento  — { id, ref, responsavel, prazo, processo }
     * @param {string} emailCriador
     * @returns {Object|null}       — tarefa criada ou null se template não encontrado
     */
    gerarDoModulo: function(evento, dadosEvento, emailCriador) {
      var tpl = _TEMPLATES_AUTO[evento];
      if (!tpl) {
        Logger.warn('[TarefaEngine.gerarDoModulo] Template não encontrado: ' + evento);
        return null;
      }

      var ref    = dadosEvento.ref || dadosEvento.id || '';
      var titulo = tpl.titulo.replace('{ref}', ref);

      try {
        return TarefaEngine.criar({
          titulo:      titulo,
          tipo:        tpl.tipo,
          prioridade:  tpl.prioridade,
          status:      tpl.status || STATUS_TAREFA.SOLICITADA,
          modulo:      dadosEvento.modulo || evento.split('_')[0],
          idOrigem:    dadosEvento.id     || '',
          refOrigem:   ref,
          processo:    dadosEvento.processo || evento,
          funcao:      tpl.funcao || '',
          sla:         tpl.sla || SLA_TAREFA_H[tpl.prioridade] || 72,
          responsavel: dadosEvento.responsavel || '',
          prazo:       dadosEvento.prazo || ''
        }, emailCriador || 'sistema');
      } catch(e) {
        Logger.warn('[TarefaEngine.gerarDoModulo] Falha: ' + e.message);
        return null;
      }
    },

    // ── Métricas ─────────────────────────────────────────────────────────────

    /**
     * Calcula métricas operacionais. Se emailFiltro fornecido, inclui visão pessoal.
     * @param {string} email — email do usuário para métricas pessoais (opcional)
     * @param {string} nivel — nível de acesso (para decidir se retorna dados globais)
     */
    calcularMetricas: function(email, nivel) {
      var todas = TarefaRepository.listar();
      var agora  = Date.now();

      var niveisGestao = ['superadmin', 'admin', 'gestor'];
      var visaoGlobal  = niveisGestao.indexOf(nivel) !== -1;

      function _atrasadas(lista) {
        return lista.filter(function(t) {
          if (!t.prazo || t.status === 'concluida' || t.status === 'cancelada') return false;
          return new Date(t.prazo).getTime() < agora;
        });
      }

      function _tempoMedioH(lista) {
        var c = lista.filter(function(t) { return t.duracaoReal > 0; });
        if (!c.length) return 0;
        return Math.round(c.reduce(function(acc, t) { return acc + t.duracaoReal; }, 0) / c.length);
      }

      function _contarPor(lista, campo) {
        var m = {};
        lista.forEach(function(t) {
          var v = t[campo] || 'sem_dado';
          m[v] = (m[v] || 0) + 1;
        });
        return m;
      }

      // Minhas tarefas
      var minhas = email
        ? todas.filter(function(t) {
            return t.responsavel === email ||
                   (t.executores||[]).indexOf(email) !== -1 ||
                   t.criadoPor === email;
          })
        : [];

      var atrasadasGlobal = _atrasadas(todas);

      // Gargalos: status não-terminal com mais de 3 tarefas
      var porStatus = _contarPor(todas, 'status');
      var gargalos  = Object.keys(porStatus)
        .filter(function(s) {
          return s !== 'concluida' && s !== 'cancelada' && porStatus[s] > 3;
        })
        .map(function(s) { return { status: s, label: LABEL_STATUS_TAREFA[s] || s, quantidade: porStatus[s] }; })
        .sort(function(a,b) { return b.quantidade - a.quantidade; });

      return {
        global: visaoGlobal ? {
          total:        todas.length,
          abertas:      todas.filter(function(t) { return t.status !== 'concluida' && t.status !== 'cancelada'; }).length,
          concluidas:   todas.filter(function(t) { return t.status === 'concluida'; }).length,
          canceladas:   todas.filter(function(t) { return t.status === 'cancelada'; }).length,
          atrasadas:    atrasadasGlobal.length,
          slaViolados:  todas.filter(function(t) { return t.slaViolado; }).length,
          tempoMedioH:  _tempoMedioH(todas),
          porStatus:    porStatus,
          porPrioridade:_contarPor(todas, 'prioridade'),
          porModulo:    _contarPor(todas, 'modulo'),
          gargalos:     gargalos,
          listaAtrasadas: atrasadasGlobal.slice(0,10).map(function(t) {
            return { id: t.id, titulo: t.titulo, prazo: t.prazo, responsavel: t.responsavel, status: t.status };
          })
        } : null,
        pessoal: email ? {
          total:      minhas.length,
          atrasadas:  _atrasadas(minhas).length,
          concluidas: minhas.filter(function(t) { return t.status === 'concluida'; }).length,
          tempoMedioH:_tempoMedioH(minhas),
          porStatus:  _contarPor(minhas, 'status')
        } : null
      };
    },

    // ── Revisões (tipo especial de comentário com status) ─────────────────────

    /**
     * Registra uma solicitação de revisão em uma tarefa.
     * Revisão é um comentário estruturado com tipo='revisao' e status rastreável.
     */
    registrarRevisao: function(id, texto, emailSolicitante) {
      if (!texto || !texto.trim()) throw new Error('Texto da revisão é obrigatório.');
      var tarefa = TarefaRepository.obterPorId(id);
      if (!tarefa) throw new Error('Tarefa não encontrada: ' + id);

      tarefa.comentarios = tarefa.comentarios || [];
      var revisaoId = typeof gerarId === 'function' ? gerarId('rev') : 'rev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      tarefa.comentarios.push({
        id:          revisaoId,
        tipo:        'revisao',
        autor:       emailSolicitante || 'sistema',
        texto:       texto.trim(),
        data:        _agora(),
        revisao: {
          status:     'solicitada',
          respondidaEm: '',
          resposta:   '',
          respondidaPor: '',
          aceita:     null
        }
      });
      tarefa.atualizadoEm = _agora();

      TarefaRepository.salvar(tarefa);
      _emitirEvento('TAREFA_REVISAO_SOLICITADA', tarefa, emailSolicitante, { revisaoId: revisaoId });
      return { ok: true, revisaoId: revisaoId };
    },

    /**
     * Responde a uma revisão existente (aceita ou rejeita com resposta).
     */
    responderRevisao: function(id, revisaoId, resposta, aceita, emailRespondente) {
      if (!revisaoId) throw new Error('ID da revisão é obrigatório.');
      if (!resposta || !resposta.trim()) throw new Error('Resposta à revisão é obrigatória.');
      var tarefa = TarefaRepository.obterPorId(id);
      if (!tarefa) throw new Error('Tarefa não encontrada: ' + id);

      tarefa.comentarios = tarefa.comentarios || [];
      var revisao = tarefa.comentarios.find(function(c) { return c.id === revisaoId && c.tipo === 'revisao'; });
      if (!revisao) throw new Error('Revisão não encontrada: ' + revisaoId);
      if (revisao.revisao.status !== 'solicitada') throw new Error('Esta revisão já foi respondida.');

      revisao.revisao.status       = aceita ? 'aceita' : 'rejeitada';
      revisao.revisao.respondidaEm = _agora();
      revisao.revisao.resposta     = resposta.trim();
      revisao.revisao.respondidaPor = emailRespondente || 'sistema';
      revisao.revisao.aceita       = !!aceita;

      tarefa.atualizadoEm = _agora();
      TarefaRepository.salvar(tarefa);
      _emitirEvento('TAREFA_REVISAO_RESPONDIDA', tarefa, emailRespondente, {
        revisaoId: revisaoId, aceita: aceita
      });
      return { ok: true };
    },

    // ── Criação de processo de comunicação (tarefa-pai + subtarefas) ──────────

    /**
     * Cria um processo de comunicação como tarefa-pai com subtarefas por entrega.
     * Esta é a função que substitui criarProcessoComunicacao + _criarTarefasPorEntregas.
     *
     * @param {Object} dados — { titulo, descricao, prioridade, prazo, solicitante,
     *                           responsavel, origem, idReserva, entregas[], observacoes,
     *                           canais[], tipo }
     * @param {string} emailCriador
     * @returns {{ processo: Tarefa, subtarefas: Tarefa[] }}
     */
    criarProcessoComunicacao: function(dados, emailCriador) {
      if (!dados || !dados.titulo) throw new Error('Título do processo é obrigatório.');

      var agora      = _agora();
      var pri        = (dados.prioridade || 'media').toLowerCase();
      var entregas   = dados.entregas || [];

      // Cria a tarefa-pai (processo principal)
      var processo = TarefaEngine.criar({
        titulo:        dados.titulo,
        descricao:     dados.descricao || '',
        tipo:          'processo_comunicacao',
        prioridade:    pri,
        modulo:        'comunicacao',
        idOrigem:      dados.idReserva || dados.idOrigem || '',
        refOrigem:     dados.titulo,
        processo:      dados.titulo,
        responsavel:   dados.responsavel || '',
        responsavelNome: dados.responsavelNome || dados.responsavel || '',
        setor:         'comunicacao',
        funcao:        'comunicacao',
        prazo:         dados.prazo || '',
        tags:          (dados.canais || []).concat(dados.tipo ? [dados.tipo] : []),
        status:        STATUS_TAREFA.SOLICITADA,
        sla:           SLA_TAREFA_H[pri] || 72,
        metadados: {
          solicitante:  dados.solicitante  || emailCriador || '',
          origem:       dados.origem       || 'manual',
          idReserva:    dados.idReserva    || '',
          canais:       dados.canais       || [],
          observacoes:  dados.observacoes  || '',
          tipoProcesso: dados.tipo         || 'geral'
        }
      }, emailCriador || 'sistema');

      // Cria subtarefas por tipo de entrega
      var subtarefas = [];
      entregas.forEach(function(tipo) {
        var funcao = TIPO_ENTREGA_FUNCAO[tipo] || 'comunicacao';
        var slaH   = SLA_ENTREGA_H[funcao]     || 48;

        try {
          var sub = TarefaEngine.criar({
            titulo:       tipo.toUpperCase() + ' — ' + dados.titulo,
            tipo:         'entrega_comunicacao',
            prioridade:   pri,
            modulo:       'comunicacao',
            idOrigem:     processo.id,
            refOrigem:    dados.titulo,
            processo:     dados.titulo,
            etapa:        tipo,
            funcao:       funcao,
            responsavel:  dados.responsavel || '',
            tarefaPai:    processo.id,
            prazo:        dados.prazo || '',
            status:       STATUS_TAREFA.SOLICITADA,
            sla:          slaH,
            metadados: {
              tipoEntrega:  tipo,
              idProcesso:   processo.id,
              solicitante:  dados.solicitante || emailCriador || ''
            }
          }, emailCriador || 'sistema');
          subtarefas.push(sub);
        } catch(e) {
          Logger.warn('[TarefaEngine.criarProcessoComunicacao] Subtarefa falhou (' + tipo + '): ' + e.message);
        }
      });

      // Atualiza tarefa-pai com referências às subtarefas
      if (subtarefas.length) {
        processo.subtarefas = subtarefas.map(function(s) { return s.id; });
        TarefaRepository.salvar(processo);
      }

      return { processo: processo, subtarefas: subtarefas };
    },

    // ── Sobrecarga operacional ─────────────────────────────────────────────────

    /**
     * Calcula indicadores de sobrecarga por usuário e por função.
     * Retorna: quem está sobrecarregado, quem está ocioso, gargalos por status.
     */
    calcularSobrecarga: function(nivel) {
      var todas = TarefaRepository.listar();
      var agora  = Date.now();

      var ativas = todas.filter(function(t) {
        return t.status !== 'concluida' && t.status !== 'cancelada';
      });

      // Agrupa tarefas ativas por responsável
      var porResponsavel = {};
      ativas.forEach(function(t) {
        var resp = t.responsavel || '__sem_responsavel__';
        if (!porResponsavel[resp]) {
          porResponsavel[resp] = { email: resp, total: 0, atrasadas: 0, criticas: 0, aguardando: 0, tarefas: [] };
        }
        porResponsavel[resp].total++;
        porResponsavel[resp].tarefas.push({ id: t.id, titulo: t.titulo, status: t.status, prazo: t.prazo, prioridade: t.prioridade });
        if (t.prazo && new Date(t.prazo).getTime() < agora) porResponsavel[resp].atrasadas++;
        if (t.prioridade === 'critica')                      porResponsavel[resp].criticas++;
        if (t.status === 'aguardando_aprovacao')             porResponsavel[resp].aguardando++;
      });

      // Agrupa por função
      var porFuncao = {};
      ativas.forEach(function(t) {
        var func = t.funcao || '__sem_funcao__';
        if (!porFuncao[func]) porFuncao[func] = { funcao: func, total: 0, atrasadas: 0 };
        porFuncao[func].total++;
        if (t.prazo && new Date(t.prazo).getTime() < agora) porFuncao[func].atrasadas++;
      });

      // Classifica sobrecarga (>5 tarefas ativas = sobrecarregado; 0 = ocioso)
      var responsaveisOrdenados = Object.values(porResponsavel).sort(function(a, b) { return b.total - a.total; });

      var LIMIAR_SOBRECARGA = 5;
      var sobrecarregados = responsaveisOrdenados.filter(function(r) { return r.total >= LIMIAR_SOBRECARGA; });
      var ociosos          = responsaveisOrdenados.filter(function(r) { return r.total === 0; });

      // Tempo médio em cada status (para tarefas com historico)
      var tempoMedioPorStatus = {};
      todas.forEach(function(t) {
        if (!t.historico || t.historico.length < 2) return;
        for (var i = 1; i < t.historico.length; i++) {
          var prev = t.historico[i - 1];
          var curr = t.historico[i];
          if (!prev.para || !curr.data) continue;
          var status  = prev.para;
          var duracaoH = (new Date(curr.data) - new Date(prev.data)) / 3600000;
          if (!tempoMedioPorStatus[status]) tempoMedioPorStatus[status] = { total: 0, count: 0 };
          tempoMedioPorStatus[status].total += duracaoH;
          tempoMedioPorStatus[status].count++;
        }
      });
      var tempoMedio = {};
      Object.keys(tempoMedioPorStatus).forEach(function(s) {
        var d = tempoMedioPorStatus[s];
        tempoMedio[s] = Math.round(d.total / d.count);
      });

      return {
        totalAtivas:        ativas.length,
        sobrecarregados:    sobrecarregados,
        ociosos:            ociosos,
        porResponsavel:     responsaveisOrdenados.slice(0, 20),
        porFuncao:          Object.values(porFuncao).sort(function(a, b) { return b.total - a.total; }),
        tempoMedioPorStatusH: tempoMedio,
        filaAprovacao:      ativas.filter(function(t) { return t.status === 'aguardando_aprovacao'; })
                                  .map(function(t) { return { id: t.id, titulo: t.titulo, responsavel: t.responsavel, prazo: t.prazo }; })
      };
    },

    // ── Vínculo bidirecional com Ação Institucional ────────────────────────────

    /**
     * Vincula uma tarefa a uma Ação Institucional existente.
     * Registra no histórico da tarefa e emite evento para rastreabilidade.
     * O controller é responsável por chamar associarRecursoAcao na action_engine.
     *
     * @param {string} tarefaId  — ID da tarefa a vincular
     * @param {string} acaoId    — ID da ação de destino ('' para desvincular)
     * @param {string} acaoNome  — Nome legível da ação (para exibição)
     * @param {string} emailAtor — Email do usuário que fez a vinculação
     * @returns {Object}         — Tarefa atualizada
     */
    vincularAcao: function(tarefaId, acaoId, acaoNome, emailAtor) {
      var tarefa = TarefaRepository.obterPorId(tarefaId);
      if (!tarefa) throw new Error('Tarefa não encontrada: ' + tarefaId);

      var acaoAnterior     = tarefa.idAcao   || '';
      var acaoNomeAnterior = tarefa.acaoNome  || '';

      tarefa.idAcao       = acaoId   || '';
      tarefa.acaoNome     = acaoNome || '';
      tarefa.atualizadoEm = _agora();

      tarefa.historico = tarefa.historico || [];
      tarefa.historico.push({
        data:       _agora(),
        ator:       emailAtor || 'sistema',
        campo:      'idAcao',
        de:         acaoAnterior,
        para:       acaoId || '',
        comentario: acaoId
          ? ('Tarefa vinculada à ação: ' + (acaoNome || acaoId))
          : ('Vínculo com ação removido. Anterior: ' + (acaoNomeAnterior || acaoAnterior))
      });

      TarefaRepository.salvar(tarefa);
      _emitirEvento('TAREFA_VINCULADA_ACAO', tarefa, emailAtor, {
        acaoId: acaoId, acaoNome: acaoNome, acaoAnterior: acaoAnterior
      });
      return tarefa;
    },

    // ── Vínculo bidirecional com Processo Institucional ───────────────────────

    /**
     * Vincula a tarefa a um Processo Institucional.
     * Registra no histórico e propaga snapshot para o ProcessoEngine via try-catch
     * (tolerante a falhas se o módulo de processos não estiver disponível).
     *
     * @param {string} tarefaId
     * @param {string} processoId — ID do processo ('proc_*') ou '' para desvincular
     * @param {string} emailAtor
     * @returns {Object} tarefa atualizada
     */
    vincularProcesso: function(tarefaId, processoId, emailAtor) {
      var tarefa = TarefaRepository.obterPorId(tarefaId);
      if (!tarefa) throw new Error('Tarefa não encontrada: ' + tarefaId);

      var processoAnterior = tarefa.processoId || '';
      tarefa.processoId    = processoId || '';
      tarefa.atualizadoEm  = _agora();

      tarefa.historico = tarefa.historico || [];
      tarefa.historico.push({
        data:       _agora(),
        ator:       emailAtor || 'sistema',
        campo:      'processoId',
        de:         processoAnterior,
        para:       processoId || '',
        comentario: processoId
          ? 'Tarefa vinculada ao processo: ' + processoId
          : 'Vínculo com processo removido'
      });

      TarefaRepository.salvar(tarefa);

      // Propaga para o ProcessoEngine (tolerante a falhas)
      if (processoId) {
        try {
          ProcessoInstitucionalEngine.vincularTarefa(processoId, {
            id:          tarefa.id,
            titulo:      tarefa.titulo,
            status:      tarefa.status,
            responsavel: tarefa.responsavel,
            prazo:       tarefa.prazo,
            prioridade:  tarefa.prioridade
          }, emailAtor || 'sistema');
        } catch(e) {
          Logger.warn('[TarefaEngine.vincularProcesso] Falha ao propagar para ProcessoEngine: ' + e.message);
        }
      }

      _emitirEvento('TAREFA_VINCULADA_PROCESSO', tarefa, emailAtor, {
        processoId: processoId, processoAnterior: processoAnterior
      });

      return tarefa;
    },

    // ── Verificação batch de SLAs (para trigger diário) ────────────────────────

    verificarSlas: function() {
      var lista      = TarefaRepository.listar();
      var atualizados = 0;
      lista.forEach(function(t) {
        var violado = _calcularSlaViolado(t);
        if (violado !== !!t.slaViolado) {
          t.slaViolado    = violado;
          t.atualizadoEm  = _agora();
          TarefaRepository.salvar(t);
          atualizados++;
        }
      });
      return { verificadas: lista.length, atualizadas: atualizados };
    }
  };
})();

// ── Compat — função legacy referenciada no controller anterior ────────────────

function responderTarefaComoFuncao(id, mensagem, autor) {
  return TarefaEngine.registrarComentario(id, mensagem, autor);
}
