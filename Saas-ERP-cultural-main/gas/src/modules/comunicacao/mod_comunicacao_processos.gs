/**
 * @file mod_comunicacao_processos.gs
 * @layer backend/modules
 * @description Gestão de processos de comunicação integrada ao TarefaEngine.
 *              Processos = tarefa-pai (tipo='processo_comunicacao', modulo='comunicacao').
 *              Entregas  = subtarefas (tipo='entrega_comunicacao', tarefaPai=idProcesso).
 *              Revisões  = comentários estruturados (tipo='revisao') no TarefaEngine.
 *
 *              A planilha ProcessosComunicacao é mantida como índice leve para
 *              consultas retroativas, mas a fonte de verdade é tarefas.json.
 *
 * @depends modules/tarefas/tarefa_engine.gs    (TarefaEngine, TIPO_ENTREGA_FUNCAO)
 * @depends modules/tarefas/tarefa_repository.gs (TarefaRepository)
 * @depends core/utils.gs                       (_abrirAba, obterLockComRetry)
 * @depends core/logger.gs                      (Logger)
 */

// ── Status canônicos de processo de comunicação ──────────────────────────────

var STATUS_PROCESSO_COM = {
  SOLICITADO:   'solicitada',
  EM_ANALISE:   'em_analise',
  EM_PRODUCAO:  'em_execucao',
  REVISAO:      'aguardando_aprovacao',
  CONCLUIDO:    'concluida',
  CANCELADO:    'cancelada'
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function _abaProcessosCom() {
  try {
    return _abrirAba('COMUNICACAO', 'ProcessosComunicacao');
  } catch(e) {
    Logger.warn('[comunicacao_processos] Aba ProcessosComunicacao indisponível: ' + e.message);
    return null;
  }
}

function _abaEntregasCom() {
  try {
    return _abrirAba('COMUNICACAO', 'EntregasComunicacao');
  } catch(e) {
    Logger.warn('[comunicacao_processos] Aba EntregasComunicacao indisponível: ' + e.message);
    return null;
  }
}

function _toObjCom(headers, row) {
  var obj = {};
  headers.forEach(function(h, i) { obj[h] = row[i]; });
  return obj;
}

// ── Helpers de equipe ─────────────────────────────────────────────────────────

function _obterResponsaveisPorFuncaoCom(funcao) {
  if (!funcao) return [];
  try {
    var aba = _abrirAba('EQUIPES', 'Funcionarios');
    if (!aba) return [];
    var dados = aba.getDataRange().getValues();
    if (dados.length <= 1) return [];

    var headers = dados[0];
    var idx = {};
    headers.forEach(function(h, i) { idx[h] = i; });
    var hoje = new Date().toISOString().slice(0, 10);
    var lista = [];

    for (var i = 1; i < dados.length; i++) {
      var row = dados[i];
      if (String(row[idx['Status']] || '').toLowerCase() !== 'ativo') continue;
      var email = row[idx['Email Institucional']];
      if (!email) continue;

      var funcoes = [];
      var subs = [];
      try { funcoes = JSON.parse(row[idx['Funcoes']] || '[]'); } catch(e) {}
      try { subs    = JSON.parse(row[idx['Substituicoes']] || '[]'); } catch(e) {}

      var temFuncao = funcoes.some(function(f) { return f.tipo === funcao && f.ativo !== false; });
      var substituindo = subs.some(function(s) {
        return s.tipo === funcao &&
               (!s.inicio || s.inicio <= hoje) &&
               (!s.fim    || s.fim    >= hoje);
      });

      if (temFuncao || substituindo) lista.push(email);
    }
    return lista;
  } catch(e) {
    Logger.warn('[comunicacao_processos] Falha ao obter responsáveis: ' + e.message);
    return [];
  }
}

function _obterGestoresPorFuncaoCom(funcao) {
  if (!funcao) return [];
  try {
    var aba = _abrirAba('EQUIPES', 'Funcionarios');
    if (!aba) return [];
    var dados = aba.getDataRange().getValues();
    if (dados.length <= 1) return [];

    var headers = dados[0];
    var idx = {};
    headers.forEach(function(h, i) { idx[h] = i; });
    var lista = [];

    for (var i = 1; i < dados.length; i++) {
      var row = dados[i];
      if (String(row[idx['Status']] || '').toLowerCase() !== 'ativo') continue;
      var email = row[idx['Email Institucional']];
      if (!email) continue;

      var isGestor = String(row[idx['Gestor']] || '').toLowerCase() === 'sim' ||
                     String(row[idx['Papel']]  || '').toLowerCase() === 'gestor';
      if (!isGestor) continue;

      var funcoes = [];
      try { funcoes = JSON.parse(row[idx['Funcoes']] || '[]'); } catch(e) {}
      var pertence = funcoes.some(function(f) { return f.tipo === funcao && f.ativo !== false; });
      if (pertence) lista.push(email);
    }
    return lista;
  } catch(e) {
    Logger.warn('[comunicacao_processos] Falha ao obter gestores: ' + e.message);
    return [];
  }
}

// ── Email interno ─────────────────────────────────────────────────────────────

function enviarEmailInterno(destino, assunto, corpo) {
  try {
    MailApp.sendEmail({ to: destino, subject: assunto, body: corpo });
  } catch(e) {
    Logger.warn('[comunicacao_processos] Falha ao enviar e-mail para ' + destino + ': ' + e.message);
  }
}

// ── Notificações (sem criar tarefas na planilha legada) ───────────────────────

function _notificarAtrasoCritico(tarefa) {
  if (!tarefa || !tarefa.id) return;
  var funcao  = tarefa.funcao || 'comunicacao';
  var emails  = _obterResponsaveisPorFuncaoCom(funcao);
  var gestores = _obterGestoresPorFuncaoCom(funcao);
  emails = Array.from(new Set(emails.concat(gestores)));
  if (!emails.length) return;

  var assunto = '[ALERTA] Tarefa em atraso crítico: ' + (tarefa.titulo || '');
  var mensagem = 'A tarefa "' + (tarefa.titulo || '') + '" está com prazo vencido (' +
    (tarefa.prazo || 'sem prazo') + ') e ainda não foi concluída. Por favor, verifique.';

  emails.forEach(function(email) { enviarEmailInterno(email, assunto, mensagem); });
}

function _notificarAtualizacaoProcesso(idProcesso, dadosAtualiz) {
  if (!dadosAtualiz || !dadosAtualiz.status) return;
  try {
    var responsavel = dadosAtualiz.responsavel || '';
    if (!responsavel) return;
    var assunto  = '[COMUNICAÇÃO] Processo atualizado — ' + idProcesso;
    var mensagem = 'O processo foi atualizado para o status: ' + dadosAtualiz.status + '.';
    enviarEmailInterno(responsavel, assunto, mensagem);
  } catch(e) {
    Logger.warn('[comunicacao_processos] Falha na notificação de atualização: ' + e.message);
  }
}

function _notificarEntregaConcluida(dados) {
  if (!dados || !dados.idProcesso) return;
  try {
    var processo = TarefaRepository.obterPorId(dados.idProcesso);
    var solicitante = (processo && processo.metadados && processo.metadados.solicitante) || '';
    if (!solicitante) return;

    var titulo = 'Entrega concluída: ' + (dados.tipo || '');
    if (dados.link) titulo += ' (material disponível em: ' + dados.link + ')';
    enviarEmailInterno(solicitante, '[COMUNICAÇÃO] ' + titulo, titulo);
  } catch(e) {
    Logger.warn('[comunicacao_processos] Falha na notificação de entrega: ' + e.message);
  }
}

// =====================================================
// LISTAR PROCESSOS
// =====================================================

/**
 * Lista processos de comunicação vindos do TarefaEngine.
 * Compatibilidade: retorna objetos no formato antigo + campos extras do engine.
 */
function listarProcessosComunicacao() {
  try {
    var tarefas = TarefaRepository.listarComFiltros(
      { modulo: 'comunicacao', tipo: 'processo_comunicacao' },
      '', 'gestor'  // gestor: vê todas
    );

    return tarefas.map(function(t) {
      var meta = t.metadados || {};
      return {
        id:               t.id,
        titulo:           t.titulo,
        descricao:        t.descricao,
        status:           t.status,
        prioridade:       t.prioridade,
        responsavel:      t.responsavel,
        prazo:            t.prazo,
        origem:           meta.origem      || 'manual',
        idReserva:        meta.idReserva   || '',
        solicitante:      meta.solicitante || '',
        canais:           meta.canais      || [],
        observacoes:      meta.observacoes || '',
        tipoProcesso:     meta.tipoProcesso || '',
        criadoEm:         t.criadoEm,
        atualizadoEm:     t.atualizadoEm,
        slaViolado:       t.slaViolado,
        subtarefas:       t.subtarefas || [],
        historico:        t.historico  || [],
        comentarios:      t.comentarios || [],
        revisoesPendentes: (t.comentarios || []).filter(function(c) {
          return c.tipo === 'revisao' && c.revisao && c.revisao.status === 'solicitada';
        }).length
      };
    });
  } catch(e) {
    Logger.warn('[comunicacao_processos] Falha ao listar processos: ' + e.message);
    return [];
  }
}

// =====================================================
// CRIAR PROCESSO
// =====================================================

/**
 * Cria um processo de comunicação (tarefa-pai + subtarefas por entrega).
 * Delega para TarefaEngine.criarProcessoComunicacao — fonte única de verdade.
 */
function criarProcessoComunicacao(dados, emailCriador) {
  if (!dados || !dados.titulo) throw new Error('Título do processo é obrigatório.');

  var email = emailCriador || dados.solicitante || 'sistema';

  var resultado = TarefaEngine.criarProcessoComunicacao({
    titulo:       dados.titulo,
    descricao:    dados.descricao    || '',
    prioridade:   dados.prioridade   || 'media',
    prazo:        dados.prazo        || '',
    solicitante:  dados.solicitante  || email,
    responsavel:  dados.responsavel  || '',
    origem:       dados.origem       || 'manual',
    idReserva:    dados.idReserva    || '',
    entregas:     dados.entregas     || [],
    canais:       dados.canais       || [],
    observacoes:  dados.observacoes  || '',
    tipo:         dados.tipo         || 'geral'
  }, email);

  // Mantém registro leve na planilha para retrocompatibilidade
  _registrarProcessoNaPlanilha(resultado.processo, dados);

  return { ok: true, id: resultado.processo.id, processo: resultado.processo };
}

// Registro leve na planilha (índice retrocompat — não é fonte de verdade)
function _registrarProcessoNaPlanilha(processo, dadosOriginais) {
  try {
    var aba = _abaProcessosCom();
    if (!aba) return;

    aba.appendRow([
      processo.id,
      processo.titulo,
      processo.descricao || '',
      processo.status,
      processo.prioridade,
      dadosOriginais.origem   || 'manual',
      dadosOriginais.idReserva || '',
      '',
      dadosOriginais.solicitante || '',
      processo.responsavel || '',
      processo.prazo || '',
      processo.criadoEm,
      '',
      dadosOriginais.observacoes || ''
    ]);
  } catch(e) {
    Logger.warn('[comunicacao_processos] Falha ao registrar processo na planilha (não crítico): ' + e.message);
  }
}

// =====================================================
// ATUALIZAR PROCESSO
// =====================================================

/**
 * Atualiza campos editáveis de um processo. Se status mudou, aplica FSM via TarefaEngine.
 */
function atualizarProcessoComunicacao(id, dados) {
  if (!id) throw new Error('ID do processo é obrigatório.');

  var tarefa = TarefaRepository.obterPorId(id);
  if (!tarefa) throw new Error('Processo não encontrado: ' + id);

  var emailAtor = dados._emailAtor || dados.responsavel || 'sistema';

  // Mudança de status via FSM
  if (dados.status && dados.status !== tarefa.status) {
    TarefaEngine.aplicarTransicao(id, dados.status, emailAtor, dados.observacoes || '');
  }

  // Edição de campos (sem mudar status)
  var camposEdicao = {};
  if (dados.titulo       !== undefined) camposEdicao.titulo       = dados.titulo;
  if (dados.descricao    !== undefined) camposEdicao.descricao    = dados.descricao;
  if (dados.prioridade   !== undefined) camposEdicao.prioridade   = dados.prioridade;
  if (dados.responsavel  !== undefined) camposEdicao.responsavel  = dados.responsavel;
  if (dados.prazo        !== undefined) camposEdicao.prazo        = dados.prazo;

  if (Object.keys(camposEdicao).length) {
    TarefaEngine.editar(id, camposEdicao, emailAtor);
  }

  _notificarAtualizacaoProcesso(id, dados);

  var tarefaAtual = TarefaRepository.obterPorId(id);
  if (tarefaAtual && tarefaAtual.prazo) {
    var prazo = new Date(tarefaAtual.prazo);
    var agora = new Date();
    if (prazo < agora && tarefaAtual.status !== 'concluida' && tarefaAtual.status !== 'cancelada') {
      _notificarAtrasoCritico(tarefaAtual);
    }
  }

  return { ok: true };
}

// =====================================================
// EXCLUIR PROCESSO
// =====================================================

function excluirProcessoComunicacao(id) {
  if (!id) throw new Error('ID do processo é obrigatório.');

  // Remove subtarefas (entregas)
  var subtarefas = TarefaRepository.listarComFiltros({ tarefaPai: id }, '', 'gestor');
  subtarefas.forEach(function(s) {
    try { TarefaRepository.excluir(s.id); } catch(e) {}
  });

  TarefaRepository.excluir(id);
  return { ok: true };
}

// =====================================================
// ENTREGAS (SUBTAREFAS)
// =====================================================

/**
 * Lista as entregas de um processo (subtarefas no TarefaEngine).
 */
function listarEntregasPorProcesso(idProcesso) {
  if (!idProcesso) return [];
  return TarefaRepository.listarComFiltros(
    { tarefaPai: idProcesso, tipo: 'entrega_comunicacao' },
    '', 'gestor'
  ).map(function(t) {
    var meta = t.metadados || {};
    return {
      id:          t.id,
      idProcesso:  idProcesso,
      tipo:        meta.tipoEntrega || t.etapa || '',
      status:      t.status,
      responsavel: t.responsavel,
      prazo:       t.prazo,
      concluidoEm: t.concluidoEm,
      link:        meta.link || ''
    };
  });
}

/**
 * Cria uma entrega (subtarefa) para um processo existente.
 */
function criarEntregaComunicacao(dados) {
  if (!dados || !dados.idProcesso) throw new Error('ID do processo é obrigatório.');
  if (!dados.tipo) throw new Error('Tipo da entrega é obrigatório.');

  var processo = TarefaRepository.obterPorId(dados.idProcesso);
  if (!processo) throw new Error('Processo não encontrado: ' + dados.idProcesso);

  var funcao = TIPO_ENTREGA_FUNCAO[dados.tipo] || 'comunicacao';
  var slaH   = SLA_ENTREGA_H[funcao] || 48;
  var pri    = processo.prioridade || 'media';

  var entrega = TarefaEngine.criar({
    titulo:     dados.tipo.toUpperCase() + ' — ' + processo.titulo,
    tipo:       'entrega_comunicacao',
    prioridade: pri,
    modulo:     'comunicacao',
    idOrigem:   dados.idProcesso,
    refOrigem:  processo.titulo,
    processo:   processo.titulo,
    etapa:      dados.tipo,
    funcao:     funcao,
    responsavel: dados.responsavel || processo.responsavel || '',
    tarefaPai:  dados.idProcesso,
    prazo:      dados.prazo || processo.prazo || '',
    status:     STATUS_TAREFA.SOLICITADA,
    sla:        slaH,
    metadados: {
      tipoEntrega: dados.tipo,
      idProcesso:  dados.idProcesso,
      solicitante: (processo.metadados && processo.metadados.solicitante) || ''
    }
  }, dados._emailCriador || 'sistema');

  // Atualiza lista de subtarefas na tarefa-pai
  var tarefaPai = TarefaRepository.obterPorId(dados.idProcesso);
  if (tarefaPai) {
    tarefaPai.subtarefas = tarefaPai.subtarefas || [];
    if (tarefaPai.subtarefas.indexOf(entrega.id) === -1) {
      tarefaPai.subtarefas.push(entrega.id);
      TarefaRepository.salvar(tarefaPai);
    }
  }

  return { ok: true, id: entrega.id };
}

/**
 * Atualiza status/responsável/link de uma entrega.
 * Se status='concluida', registra data e notifica solicitante.
 */
function atualizarEntregaComunicacao(idEntrega, dados) {
  if (!idEntrega) throw new Error('ID da entrega é obrigatório.');

  var tarefa = TarefaRepository.obterPorId(idEntrega);
  if (!tarefa) throw new Error('Entrega não encontrada: ' + idEntrega);

  var emailAtor = dados._emailAtor || 'sistema';
  var statusAnterior = tarefa.status;

  // Mudança de status via FSM
  if (dados.status && dados.status !== tarefa.status) {
    TarefaEngine.aplicarTransicao(idEntrega, dados.status, emailAtor, dados.observacoes || '');
  }

  // Campos editáveis
  var campos = {};
  if (dados.responsavel !== undefined) campos.responsavel = dados.responsavel;
  if (dados.prazo       !== undefined) campos.prazo       = dados.prazo;
  if (Object.keys(campos).length) TarefaEngine.editar(idEntrega, campos, emailAtor);

  // Salva link no metadados se fornecido
  if (dados.link !== undefined) {
    var t2 = TarefaRepository.obterPorId(idEntrega);
    if (t2) {
      t2.metadados = t2.metadados || {};
      t2.metadados.link = dados.link;
      TarefaRepository.salvar(t2);
    }
  }

  // Notificação se entrega acabou de ser concluída
  if (dados.status === 'concluida' && statusAnterior !== 'concluida') {
    var meta = tarefa.metadados || {};
    _notificarEntregaConcluida({
      idProcesso: meta.idProcesso || tarefa.tarefaPai || '',
      tipo:       meta.tipoEntrega || tarefa.etapa || '',
      link:       dados.link || ''
    });
  }

  return { ok: true };
}

// =====================================================
// REVISÃO DE PROCESSOS
// =====================================================

/**
 * Solicita revisão em um processo (comentário estruturado no TarefaEngine).
 */
function solicitarAlteracaoProcesso(idProcesso, texto, emailCliente) {
  if (!idProcesso) throw new Error('ID do processo é obrigatório.');
  if (!texto)      throw new Error('Texto da revisão é obrigatório.');

  var resultado = TarefaEngine.registrarRevisao(idProcesso, texto, emailCliente || 'cliente');

  // Notifica equipe de comunicação sobre a revisão
  var emails   = _obterResponsaveisPorFuncaoCom('comunicacao');
  var gestores = _obterGestoresPorFuncaoCom('comunicacao');
  var todos    = Array.from(new Set(emails.concat(gestores)));

  var assunto  = '[REVISÃO] Solicitação de alteração — processo ' + idProcesso;
  var mensagem = 'O cliente solicitou uma revisão:\n\n"' + texto + '"\n\nProcesso: ' + idProcesso;
  todos.forEach(function(email) { enviarEmailInterno(email, assunto, mensagem); });

  return resultado;
}

/**
 * Responde a uma revisão (aceita ou rejeita com texto de resposta).
 */
function responderRevisaoProcesso(idProcesso, revisaoId, resposta, aceita, emailRespondente) {
  if (!idProcesso) throw new Error('ID do processo é obrigatório.');
  if (!revisaoId)  throw new Error('ID da revisão é obrigatório.');
  if (!resposta)   throw new Error('Resposta é obrigatória.');

  var resultado = TarefaEngine.responderRevisao(
    idProcesso, revisaoId, resposta, aceita !== false, emailRespondente || 'sistema'
  );

  // Notifica solicitante da revisão
  var tarefa = TarefaRepository.obterPorId(idProcesso);
  if (tarefa) {
    var revisao = (tarefa.comentarios || []).find(function(c) { return c.id === revisaoId; });
    var solicitante = revisao ? revisao.autor : '';
    if (solicitante) {
      var statusTexto = (aceita !== false) ? 'Aceita' : 'Rejeitada';
      enviarEmailInterno(
        solicitante,
        '[REVISÃO] Resposta à sua solicitação — ' + idProcesso,
        'Sua solicitação de revisão foi respondida.\n\nStatus: ' + statusTexto + '\n\n' + resposta
      );
    }
  }

  return resultado;
}

/**
 * Compat: responde a tarefa como função (comentário estruturado).
 */
function responderTarefaComoFuncao(idTarefa, mensagem, autor) {
  if (!mensagem) return { ok: false };
  return TarefaEngine.registrarComentario(idTarefa, mensagem, autor || 'funcao');
}

// =====================================================
// INTEGRAÇÃO RESERVA → COMUNICAÇÃO
// =====================================================

/**
 * Cria demanda de comunicação a partir de uma reserva.
 * Garante deduplicação: se já existe demanda para o idReserva, retorna ela sem criar nova.
 */
function criarDemandaComunicacaoFromReserva(idReserva, dadosReserva, dadosComunicacao) {
  if (!idReserva) throw new Error('ID da reserva é obrigatório.');
  if (!dadosComunicacao || !dadosComunicacao.titulo) throw new Error('Título da demanda é obrigatório.');

  // Verifica duplicação via TarefaRepository
  var existente = TarefaRepository.obterPorOrigem('comunicacao', idReserva);
  if (existente) return { ok: true, id: existente.id, duplicado: true };

  return criarProcessoComunicacao({
    titulo:      dadosComunicacao.titulo,
    descricao:   dadosComunicacao.descricao   || '',
    prioridade:  (dadosComunicacao.prioridade  || 'media').toLowerCase(),
    prazo:       dadosComunicacao.prazo        || '',
    observacoes: dadosComunicacao.observacoes  || '',
    entregas:    dadosComunicacao.entregas     || [],
    canais:      dadosComunicacao.canais       || [],
    origem:      'reserva',
    idReserva:   idReserva,
    solicitante: (dadosReserva && dadosReserva.responsavel) || '',
    responsavel: dadosComunicacao.responsavel  || '',
    tipo:        dadosComunicacao.tipo         || 'geral'
  }, (dadosReserva && dadosReserva.responsavel) || 'sistema');
}

/**
 * Retorna o processo de comunicação vinculado ao idReserva, ou null.
 * Consulta o TarefaRepository (fonte de verdade).
 */
function obterDemandaPorReservaId(idReserva) {
  if (!idReserva) return null;
  var processo = TarefaRepository.obterPorOrigem('comunicacao', idReserva);
  if (!processo) return null;
  return { id: processo.id, titulo: processo.titulo, status: processo.status };
}
