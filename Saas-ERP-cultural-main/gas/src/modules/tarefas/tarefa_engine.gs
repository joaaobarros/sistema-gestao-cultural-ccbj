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
  }
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
        id:                'tar_' + Date.now(),
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

        sla:               dados.sla || SLA_TAREFA_H[pri] || 72,
        slaViolado:        false,

        criadoPor:         emailCriador || '',
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
                             'funcao','tags','processo','etapa','duracaoPrevista','sla'];

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
        id:    'cmt_' + Date.now(),
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
