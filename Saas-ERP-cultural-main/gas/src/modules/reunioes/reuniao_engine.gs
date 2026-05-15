/**
 * @file modules/reunioes/reuniao_engine.gs
 * @layer modules
 * @description Motor de Reuniões e Atas — FSM, criação, transições, geração de ata,
 *              encaminhamentos rastreáveis e integração com TarefaEngine.
 *              Ponto único de mutação dos domínios Reuniões e Encaminhamentos.
 *
 * @depends modules/reunioes/reuniao_repository.gs (ReunioesRepository)
 * @depends modules/tarefas/tarefa_engine.gs      (TarefaEngine)
 * @depends core/event_bus_backend.gs             (SystemEvents)
 * @depends core/services/auditoria_service.gs    (AuditoriaService)
 * @depends core/logger.gs                        (Logger)
 */

// ── Estados canônicos — Reunião ───────────────────────────────────────────

var STATUS_REUNIAO = {
  PLANEJADA:      'planejada',
  AGENDADA:       'agendada',
  EM_ANDAMENTO:   'em_andamento',
  FINALIZADA:     'finalizada',
  ATA_RASCUNHO:   'ata_rascunho',
  ATA_APROVADA:   'ata_aprovada',
  ARQUIVADA:      'arquivada',
  CANCELADA:      'cancelada'
};

var LABEL_STATUS_REUNIAO = {
  planejada:    'Planejada',
  agendada:     'Agendada',
  em_andamento: 'Em andamento',
  finalizada:   'Finalizada',
  ata_rascunho: 'Ata em rascunho',
  ata_aprovada: 'Ata aprovada',
  arquivada:    'Arquivada',
  cancelada:    'Cancelada'
};

var COR_STATUS_REUNIAO = {
  planejada:    'gray',
  agendada:     'blue',
  em_andamento: 'green',
  finalizada:   'indigo',
  ata_rascunho: 'yellow',
  ata_aprovada: 'purple',
  arquivada:    'slate',
  cancelada:    'red'
};

var _TRANSICOES_REUNIAO = {
  planejada:    ['agendada', 'cancelada'],
  agendada:     ['em_andamento', 'planejada', 'cancelada'],
  em_andamento: ['finalizada', 'cancelada'],
  finalizada:   ['ata_rascunho', 'cancelada'],
  ata_rascunho: ['ata_aprovada', 'finalizada'],
  ata_aprovada: ['arquivada'],
  arquivada:    [],
  cancelada:    []
};

// ── Estados canônicos — Encaminhamento ───────────────────────────────────

var STATUS_ENCAMINHAMENTO = {
  PENDENTE:             'pendente',
  EM_ANDAMENTO:         'em_andamento',
  AGUARDANDO_TERCEIROS: 'aguardando_terceiros',
  CONCLUIDO:            'concluido',
  ATRASADO:             'atrasado',
  CANCELADO:            'cancelado'
};

var LABEL_STATUS_ENCAMINHAMENTO = {
  pendente:             'Pendente',
  em_andamento:         'Em andamento',
  aguardando_terceiros: 'Aguardando terceiros',
  concluido:            'Concluído',
  atrasado:             'Atrasado',
  cancelado:            'Cancelado'
};

var COR_STATUS_ENCAMINHAMENTO = {
  pendente:             'gray',
  em_andamento:         'blue',
  aguardando_terceiros: 'yellow',
  concluido:            'green',
  atrasado:             'red',
  cancelado:            'slate'
};

var _TRANSICOES_ENCAMINHAMENTO = {
  pendente:             ['em_andamento', 'aguardando_terceiros', 'cancelado'],
  em_andamento:         ['aguardando_terceiros', 'concluido', 'pendente', 'cancelado'],
  aguardando_terceiros: ['em_andamento', 'concluido', 'cancelado'],
  atrasado:             ['em_andamento', 'concluido', 'cancelado'],
  concluido:            [],
  cancelado:            []
};

// Templates para geração automática de tarefas a partir de encaminhamentos
var _TEMPLATE_TAREFA_ENCAMINHAMENTO = {
  titulo:    'Encaminhamento: {titulo}',
  tipo:      'encaminhamento',
  modulo:    'reunioes',
  status:    'solicitada'
};

// ── Engine ────────────────────────────────────────────────────────────────

var ReunioesEngine = (function() {

  var _NIVEIS_MUTACAO = ['superadmin', 'admin', 'gestor'];

  // ── Helpers ──────────────────────────────────────────────────────────────

  function _gerarId(prefixo) {
    return prefixo + '-' + new Date().getFullYear() +
           '-' + Utilities.getUuid().replace(/-/g, '').substring(0, 8).toUpperCase();
  }

  function _agora() { return new Date().toISOString(); }

  function _validarTransicaoReuniao(statusAtual, statusNovo) {
    var permitidos = _TRANSICOES_REUNIAO[statusAtual] || [];
    if (permitidos.indexOf(statusNovo) === -1) {
      throw new Error('Transição inválida: ' + statusAtual + ' → ' + statusNovo);
    }
  }

  function _validarTransicaoEncaminhamento(statusAtual, statusNovo) {
    var permitidos = _TRANSICOES_ENCAMINHAMENTO[statusAtual] || [];
    if (permitidos.indexOf(statusNovo) === -1) {
      throw new Error('Transição inválida de encaminhamento: ' + statusAtual + ' → ' + statusNovo);
    }
  }

  function _validarEncaminhamentoCompleto(enc) {
    var faltando = [];
    if (!enc.titulo   || enc.titulo.trim() === '')   faltando.push('O QUÊ (título)');
    if (!enc.responsavel || enc.responsavel.trim() === '') faltando.push('QUEM (responsável)');
    if (!enc.prazo    || enc.prazo.trim() === '')    faltando.push('QUANDO (prazo)');
    return { completo: faltando.length === 0, faltando: faltando };
  }

  function _registrarHistoricoReuniao(reuniao, acao, email, detalhe) {
    if (!reuniao.historico) reuniao.historico = [];
    reuniao.historico.push({
      ts:      _agora(),
      acao:    acao,
      usuario: email,
      detalhe: detalhe || ''
    });
  }

  function _registrarHistoricoEncaminhamento(enc, acao, email, detalhe) {
    if (!enc.historico) enc.historico = [];
    enc.historico.push({
      ts:      _agora(),
      acao:    acao,
      usuario: email,
      detalhe: detalhe || ''
    });
  }

  // ── Reuniões: CRUD ────────────────────────────────────────────────────────

  function criar(dados, emailCriador) {
    if (!dados.titulo || dados.titulo.trim() === '') throw new Error('Título da reunião é obrigatório.');
    if (!dados.data)   throw new Error('Data da reunião é obrigatória.');

    var reuniao = {
      id:                _gerarId('REU'),
      titulo:            dados.titulo.trim(),
      tipo:              dados.tipo || 'ordinaria',           // ordinaria | extraordinaria | emergencial
      data:              dados.data,
      horaInicio:        dados.horaInicio || '',
      horaTermino:       dados.horaTermino || '',
      local:             dados.local || '',
      linkRemoto:        dados.linkRemoto || '',
      modalidade:        dados.modalidade || 'presencial',    // presencial | hibrido | remoto
      status:            STATUS_REUNIAO.PLANEJADA,
      sigilosa:          !!dados.sigilosa,
      organizador:       dados.organizador || emailCriador,
      participantes:     dados.participantes || [],
      convidadosExternos: dados.convidadosExternos || [],
      setores:           dados.setores || [],
      tags:              dados.tags || [],
      pauta:             (dados.pauta || []).map(function(p, i) {
                           return {
                             id:             'P' + (i+1),
                             titulo:         p.titulo || '',
                             responsavel:    p.responsavel || '',
                             tempoEstimado:  p.tempoEstimado || 0,
                             status:         'pendente',
                             notas:          ''
                           };
                         }),
      recorrencia:       dados.recorrencia || null,
      descricao:         dados.descricao || '',
      // Ata (preenchida durante/após reunião)
      ata: {
        status:       'nao_iniciada',
        presentes:    [],
        ausentes:     [],
        abertura:     '',
        deliberacoes: [],
        encerramento: '',
        redator:      '',
        aprovadores:  dados.aprovadores || [],
        aprovacoes:   [],
        publicadaEm:  null
      },
      // Controle de tempo (para reunião ao vivo)
      controle: {
        iniciouEm:   null,
        encerroupEm: null,
        pausas:      []
      },
      // Metadados
      criadoPor:     emailCriador,
      criadoEm:      _agora(),
      atualizadoEm:  _agora(),
      historico: []
    };

    _registrarHistoricoReuniao(reuniao, 'criada', emailCriador);

    try {
      SystemEvents.emit('REUNIAO_CRIADA', {
        entidade: 'reuniao', entidade_id: reuniao.id,
        usuario: emailCriador, payload: { titulo: reuniao.titulo, data: reuniao.data }
      });
    } catch(e) { Logger.warn('[ReunioesEngine.criar] SystemEvents: ' + e.message); }

    return ReunioesRepository.salvarReuniao(reuniao);
  }

  function atualizar(id, dados, emailEditor) {
    var reuniao = ReunioesRepository.obterReuniaoPorId(id);
    if (!reuniao) throw new Error('Reunião não encontrada: ' + id);
    if (reuniao.status === 'arquivada' || reuniao.status === 'cancelada') {
      throw new Error('Reunião arquivada ou cancelada não pode ser editada.');
    }

    var camposEditaveis = ['titulo','tipo','data','horaInicio','horaTermino',
                           'local','linkRemoto','modalidade','sigilosa',
                           'organizador','participantes','convidadosExternos',
                           'setores','tags','pauta','descricao','recorrencia','aprovadores'];
    camposEditaveis.forEach(function(c) {
      if (dados[c] !== undefined) reuniao[c] = dados[c];
    });

    if (dados.aprovadores !== undefined) reuniao.ata.aprovadores = dados.aprovadores;

    reuniao.atualizadoEm = _agora();
    _registrarHistoricoReuniao(reuniao, 'atualizada', emailEditor);
    return ReunioesRepository.salvarReuniao(reuniao);
  }

  function aplicarTransicao(id, novoStatus, email, contexto) {
    var reuniao = ReunioesRepository.obterReuniaoPorId(id);
    if (!reuniao) throw new Error('Reunião não encontrada: ' + id);

    _validarTransicaoReuniao(reuniao.status, novoStatus);
    var statusAnterior = reuniao.status;
    reuniao.status = novoStatus;
    reuniao.atualizadoEm = _agora();

    // Ações automáticas ao entrar em estados específicos
    if (novoStatus === STATUS_REUNIAO.EM_ANDAMENTO) {
      reuniao.controle.iniciouEm = _agora();
      if (reuniao.ata.presentes.length === 0) {
        reuniao.ata.presentes = reuniao.participantes.slice();
      }
    }
    if (novoStatus === STATUS_REUNIAO.FINALIZADA) {
      reuniao.controle.encerroupEm = _agora();
    }
    if (novoStatus === STATUS_REUNIAO.ATA_RASCUNHO) {
      reuniao.ata.status = 'rascunho';
    }
    if (novoStatus === STATUS_REUNIAO.ATA_APROVADA) {
      reuniao.ata.status = 'aprovada';
      reuniao.ata.publicadaEm = _agora();
    }

    _registrarHistoricoReuniao(reuniao, statusAnterior + '→' + novoStatus, email, contexto || '');

    try {
      AuditoriaService.registrarMutacaoCritica('reuniao', id, statusAnterior, novoStatus, email);
      SystemEvents.emit('REUNIAO_TRANSICAO', {
        entidade: 'reuniao', entidade_id: id, usuario: email,
        payload: { de: statusAnterior, para: novoStatus }
      });
    } catch(e) { Logger.warn('[ReunioesEngine.aplicarTransicao] ' + e.message); }

    return ReunioesRepository.salvarReuniao(reuniao);
  }

  // ── Ata ───────────────────────────────────────────────────────────────────

  function salvarAta(id, dadosAta, emailRedator) {
    var reuniao = ReunioesRepository.obterReuniaoPorId(id);
    if (!reuniao) throw new Error('Reunião não encontrada: ' + id);

    var camposAta = ['presentes','ausentes','abertura','deliberacoes','encerramento'];
    camposAta.forEach(function(c) {
      if (dadosAta[c] !== undefined) reuniao.ata[c] = dadosAta[c];
    });

    if (!reuniao.ata.redator) reuniao.ata.redator = emailRedator;
    reuniao.ata.status = 'rascunho';

    if (reuniao.status === STATUS_REUNIAO.FINALIZADA) {
      reuniao.status = STATUS_REUNIAO.ATA_RASCUNHO;
    }

    reuniao.atualizadoEm = _agora();
    _registrarHistoricoReuniao(reuniao, 'ata_salva', emailRedator);
    return ReunioesRepository.salvarReuniao(reuniao);
  }

  function aprovarAta(id, email, aprovado) {
    var reuniao = ReunioesRepository.obterReuniaoPorId(id);
    if (!reuniao) throw new Error('Reunião não encontrada: ' + id);
    if (reuniao.status !== STATUS_REUNIAO.ATA_RASCUNHO) throw new Error('Ata não está em rascunho.');

    var aprovadores = reuniao.ata.aprovadores || [];
    if (aprovadores.indexOf(email) === -1 && aprovadores.length > 0) {
      throw new Error('Usuário não é aprovador desta ata.');
    }

    var aprovacoes = reuniao.ata.aprovacoes || [];
    var jaRegistrou = aprovacoes.find(function(a) { return a.email === email; });
    if (jaRegistrou) {
      jaRegistrou.aprovado = aprovado;
      jaRegistrou.timestamp = _agora();
    } else {
      aprovacoes.push({ email: email, aprovado: aprovado, timestamp: _agora() });
    }
    reuniao.ata.aprovacoes = aprovacoes;

    var aprovadoresPendentes = aprovadores.length > 0
      ? aprovadores.filter(function(ap) {
          var reg = aprovacoes.find(function(a) { return a.email === ap && a.aprovado; });
          return !reg;
        })
      : [];

    if (aprovadoresPendentes.length === 0 && aprovado) {
      reuniao.status = STATUS_REUNIAO.ATA_APROVADA;
      reuniao.ata.status = 'aprovada';
      reuniao.ata.publicadaEm = _agora();
      _registrarHistoricoReuniao(reuniao, 'ata_aprovada', email);
      try { SystemEvents.emit('ATA_APROVADA', { entidade: 'reuniao', entidade_id: id, usuario: email }); }
      catch(e) {}
    } else {
      _registrarHistoricoReuniao(reuniao, aprovado ? 'ata_aprovada_parcial' : 'ata_rejeitada', email);
    }

    reuniao.atualizadoEm = _agora();
    return ReunioesRepository.salvarReuniao(reuniao);
  }

  // ── Controle de presença ─────────────────────────────────────────────────

  function registrarPresenca(id, presentes, ausentes, email) {
    var reuniao = ReunioesRepository.obterReuniaoPorId(id);
    if (!reuniao) throw new Error('Reunião não encontrada: ' + id);

    reuniao.ata.presentes = presentes || [];
    reuniao.ata.ausentes  = ausentes  || [];
    reuniao.atualizadoEm  = _agora();
    _registrarHistoricoReuniao(reuniao, 'presenca_registrada', email);
    return ReunioesRepository.salvarReuniao(reuniao);
  }

  // ── Pauta ─────────────────────────────────────────────────────────────────

  function atualizarItemPauta(reuniaoId, itemId, dadosItem, email) {
    var reuniao = ReunioesRepository.obterReuniaoPorId(reuniaoId);
    if (!reuniao) throw new Error('Reunião não encontrada: ' + reuniaoId);

    var item = (reuniao.pauta || []).find(function(p) { return p.id === itemId; });
    if (!item) throw new Error('Item de pauta não encontrado: ' + itemId);

    if (dadosItem.status !== undefined) item.status = dadosItem.status;
    if (dadosItem.notas  !== undefined) item.notas  = dadosItem.notas;
    if (dadosItem.titulo !== undefined) item.titulo = dadosItem.titulo;

    reuniao.atualizadoEm = _agora();
    return ReunioesRepository.salvarReuniao(reuniao);
  }

  // ── Encaminhamentos ───────────────────────────────────────────────────────

  function criarEncaminhamento(reuniaoId, dados, emailCriador) {
    var reuniao = ReunioesRepository.obterReuniaoPorId(reuniaoId);
    if (!reuniao) throw new Error('Reunião não encontrada: ' + reuniaoId);

    var validacao = _validarEncaminhamentoCompleto(dados);

    var enc = {
      id:          _gerarId('ENC'),
      reuniaoId:   reuniaoId,
      ataId:       null,
      tarefaId:    null,
      numero:      (ReunioesRepository.listarEncaminhamentosPorReuniao(reuniaoId).length) + 1,
      titulo:      (dados.titulo || '').trim(),
      descricao:   dados.descricao || '',
      responsavel: dados.responsavel || '',
      envolvidos:  dados.envolvidos  || [],
      prazo:       dados.prazo || '',
      prioridade:  dados.prioridade || 'media',
      status:      STATUS_ENCAMINHAMENTO.PENDENTE,
      modulo:      dados.modulo || null,
      tipoAcao:    dados.tipoAcao || 'tarefa',
      incompleto:  !validacao.completo,
      camposFaltando: validacao.faltando,
      comentarios: [],
      historico:   [],
      criadoPor:   emailCriador,
      criadoEm:    _agora(),
      atualizadoEm: _agora(),
      atrasado:    false
    };

    _registrarHistoricoEncaminhamento(enc, 'criado', emailCriador,
      validacao.completo ? '' : 'Incompleto: faltam ' + validacao.faltando.join(', '));

    try {
      SystemEvents.emit('ENCAMINHAMENTO_CRIADO', {
        entidade: 'encaminhamento', entidade_id: enc.id,
        usuario: emailCriador,
        payload: { reuniaoId: reuniaoId, titulo: enc.titulo, incompleto: enc.incompleto }
      });
    } catch(e) {}

    return ReunioesRepository.salvarEncaminhamento(enc);
  }

  function atualizarEncaminhamento(id, dados, email) {
    var enc = ReunioesRepository.obterEncaminhamentoPorId(id);
    if (!enc) throw new Error('Encaminhamento não encontrado: ' + id);
    if (enc.status === 'concluido' || enc.status === 'cancelado') {
      throw new Error('Encaminhamento concluído/cancelado não pode ser editado.');
    }

    var camposEditaveis = ['titulo','descricao','responsavel','envolvidos','prazo',
                           'prioridade','modulo','tipoAcao'];
    camposEditaveis.forEach(function(c) {
      if (dados[c] !== undefined) enc[c] = dados[c];
    });

    var validacao = _validarEncaminhamentoCompleto(enc);
    enc.incompleto     = !validacao.completo;
    enc.camposFaltando = validacao.faltando;
    enc.atualizadoEm   = _agora();
    _registrarHistoricoEncaminhamento(enc, 'atualizado', email);
    return ReunioesRepository.salvarEncaminhamento(enc);
  }

  function aplicarTransicaoEncaminhamento(id, novoStatus, email, comentario) {
    var enc = ReunioesRepository.obterEncaminhamentoPorId(id);
    if (!enc) throw new Error('Encaminhamento não encontrado: ' + id);

    _validarTransicaoEncaminhamento(enc.status, novoStatus);
    var statusAnterior = enc.status;
    enc.status = novoStatus;
    enc.atualizadoEm = _agora();

    if (novoStatus === 'concluido') enc.concluidoEm = _agora();

    if (comentario) {
      enc.comentarios.push({ ts: _agora(), usuario: email, texto: comentario, tipo: 'transicao' });
    }

    _registrarHistoricoEncaminhamento(enc, statusAnterior + '→' + novoStatus, email, comentario || '');

    try {
      SystemEvents.emit('ENCAMINHAMENTO_TRANSICAO', {
        entidade: 'encaminhamento', entidade_id: id, usuario: email,
        payload: { de: statusAnterior, para: novoStatus }
      });
    } catch(e) {}

    return ReunioesRepository.salvarEncaminhamento(enc);
  }

  function adicionarComentario(id, texto, email) {
    var enc = ReunioesRepository.obterEncaminhamentoPorId(id);
    if (!enc) throw new Error('Encaminhamento não encontrado: ' + id);

    enc.comentarios.push({ id: _gerarId('COM'), ts: _agora(), usuario: email, texto: texto, tipo: 'comentario' });
    enc.atualizadoEm = _agora();
    return ReunioesRepository.salvarEncaminhamento(enc);
  }

  // ── Integração com TarefaEngine ───────────────────────────────────────────

  function gerarTarefaDeEncaminhamento(encId, email) {
    var enc = ReunioesRepository.obterEncaminhamentoPorId(encId);
    if (!enc) throw new Error('Encaminhamento não encontrado: ' + encId);
    if (enc.tarefaId) throw new Error('Encaminhamento já possui tarefa vinculada: ' + enc.tarefaId);
    if (enc.incompleto) throw new Error('Encaminhamento incompleto não pode gerar tarefa. Faltam: ' + enc.camposFaltando.join(', '));

    var reuniao = ReunioesRepository.obterReuniaoPorId(enc.reuniaoId);

    var dadosTarefa = {
      titulo:      'Encaminhamento: ' + enc.titulo,
      descricao:   enc.descricao || ('Originado da reunião: ' + (reuniao ? reuniao.titulo : enc.reuniaoId)),
      responsavel: enc.responsavel,
      executores:  enc.envolvidos,
      prazo:       enc.prazo,
      prioridade:  enc.prioridade,
      tipo:        'encaminhamento',
      modulo:      'reunioes',
      idOrigem:    enc.id,
      status:      'solicitada',
      metadados:   {
        reuniaoId:       enc.reuniaoId,
        encaminhamentoId: enc.id,
        reuniaoTitulo:   reuniao ? reuniao.titulo : '',
        reuniaoData:     reuniao ? reuniao.data : ''
      }
    };

    var tarefa = TarefaEngine.criar(dadosTarefa, email);
    enc.tarefaId     = tarefa.id;
    enc.atualizadoEm = _agora();
    _registrarHistoricoEncaminhamento(enc, 'tarefa_gerada', email, tarefa.id);
    ReunioesRepository.salvarEncaminhamento(enc);

    return { encaminhamento: enc, tarefa: tarefa };
  }

  // ── Verificação de atrasos (trigger diário) ───────────────────────────────

  function verificarAtrasos(email) {
    var atrasados = ReunioesRepository.listarEncaminhamentosAtrasados();
    var atualizados = 0;
    atrasados.forEach(function(enc) {
      if (enc.status === STATUS_ENCAMINHAMENTO.PENDENTE ||
          enc.status === STATUS_ENCAMINHAMENTO.EM_ANDAMENTO ||
          enc.status === STATUS_ENCAMINHAMENTO.AGUARDANDO_TERCEIROS) {
        enc.atrasado = true;
        enc.status   = STATUS_ENCAMINHAMENTO.ATRASADO;
        enc.atualizadoEm = _agora();
        _registrarHistoricoEncaminhamento(enc, 'marcado_atrasado', 'sistema');
        ReunioesRepository.salvarEncaminhamento(enc);
        atualizados++;
        try {
          SystemEvents.emit('ENCAMINHAMENTO_ATRASADO', {
            entidade: 'encaminhamento', entidade_id: enc.id,
            usuario: 'sistema', payload: { prazo: enc.prazo, responsavel: enc.responsavel }
          });
        } catch(e) {}
      }
    });
    return { processados: atrasados.length, atualizados: atualizados };
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────

  function obterDashboard(email, nivel) {
    var metrReu = ReunioesRepository.calcularMetricasReunioes();
    var metrEnc = ReunioesRepository.calcularMetricasEncaminhamentos();
    var proximas = ReunioesRepository.listarProximas(14);
    var encAtrasados = ReunioesRepository.listarEncaminhamentosAtrasados().slice(0, 10);
    var encCriticos  = ReunioesRepository.listarEncaminhamentosComFiltros(
      { prioridade: 'critica' }, email, nivel
    ).filter(function(e) { return e.status !== 'concluido' && e.status !== 'cancelado'; }).slice(0, 10);

    return {
      reunioes:         metrReu,
      encaminhamentos:  metrEnc,
      proximas_reunioes: proximas.slice(0, 5),
      enc_atrasados:    encAtrasados,
      enc_criticos:     encCriticos
    };
  }

  // ── Expor API pública ────────────────────────────────────────────────────

  return {
    // Reuniões
    criar:                      criar,
    atualizar:                  atualizar,
    aplicarTransicao:           aplicarTransicao,
    salvarAta:                  salvarAta,
    aprovarAta:                 aprovarAta,
    registrarPresenca:          registrarPresenca,
    atualizarItemPauta:         atualizarItemPauta,

    // Encaminhamentos
    criarEncaminhamento:                 criarEncaminhamento,
    atualizarEncaminhamento:             atualizarEncaminhamento,
    aplicarTransicaoEncaminhamento:      aplicarTransicaoEncaminhamento,
    adicionarComentario:                 adicionarComentario,
    gerarTarefaDeEncaminhamento:         gerarTarefaDeEncaminhamento,

    // Operações de sistema
    verificarAtrasos:           verificarAtrasos,
    obterDashboard:             obterDashboard,

    // Expor constantes para uso externo
    STATUS_REUNIAO:             STATUS_REUNIAO,
    STATUS_ENCAMINHAMENTO:      STATUS_ENCAMINHAMENTO
  };

})();
