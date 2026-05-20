/**
 * @file modules/reunioes/reuniao_series_engine.gs
 * @layer modules
 * @description Motor de Séries/Presets de Reuniões — inteligência organizacional.
 *
 *  Responsabilidades:
 *   1. CRUD de séries (templates estruturais — SEM pauta, SEM decisões passadas)
 *   2. Criação de reunião a partir de preset
 *   3. Gestão colaborativa de pautas (adicionar/editar/remover com auditoria)
 *   4. Controle temporal: antes do início = edição livre; após = apenas marcação de status
 *   5. Transferência de pautas entre reuniões da mesma série (com rastreabilidade)
 *   6. Análise de recorrência temática (gargalos, pautas circulares, efetividade)
 *   7. Dashboard por série (timeline, taxas, métricas)
 *   8. Contexto IA (resumo histórico sem inventar dados)
 *
 *  Persistência:
 *   - reunioes_series.json  → séries/presets
 *   - pauta_historico.json  → log auditável de cada mutação de pauta
 *   - reunioes.json         → reuniões (via ReunioesRepository + ReunioesEngine)
 *   - encaminhamentos.json  → encaminhamentos (via ReunioesRepository)
 *
 * @depends modules/reunioes/reuniao_repository.gs (ReunioesRepository)
 * @depends modules/reunioes/reuniao_engine.gs      (ReunioesEngine)
 * @depends core/data_layer.gs                      (readJSON, writeJSON, modifyJSON)
 * @depends core/event_bus_backend.gs               (SystemEvents)
 * @depends core/logger.gs                          (Logger)
 */

// ── Estados canônicos — Série ──────────────────────────────────────────────

var STATUS_SERIE = {
  ATIVA:     'ativa',
  PAUSADA:   'pausada',
  ENCERRADA: 'encerrada'
};

// Status final de pauta (marcado após início da reunião — substitui remoção)
var STATUS_FINAL_PAUTA = {
  NAO_DEBATIDA:          'nao_debatida',
  PARCIALMENTE_DEBATIDA: 'parcialmente_debatida',
  SEM_ENCAMINHAMENTO:    'sem_encaminhamento',
  ADIADA:                'adiada',
  TRANSFERIDA:           'transferida',
  PENDENTE_PROXIMA:      'pendente_proxima'
};

var LABEL_STATUS_FINAL_PAUTA = {
  nao_debatida:          'Não debatida',
  parcialmente_debatida: 'Parcialmente debatida',
  sem_encaminhamento:    'Sem encaminhamento',
  adiada:                'Adiada',
  transferida:           'Transferida',
  pendente_proxima:      'Pendente para próxima'
};

// ── Repositório Interno de Séries e Histórico de Pautas ───────────────────

var _SeriesRepo = (function() {

  var _FILE_SERIES          = 'reunioes_series.json';
  var _FILE_PAUTA_HISTORICO = 'pauta_historico.json';
  var _NIVEIS_AMPLOS        = ['superadmin', 'admin', 'gestor'];

  function _lerSeries() {
    try { return readJSON(_FILE_SERIES) || []; }
    catch(e) { Logger.warn('[SeriesRepo] Erro ao ler reunioes_series.json: ' + e.message); return []; }
  }

  function _lerHistorico() {
    try { return readJSON(_FILE_PAUTA_HISTORICO) || []; }
    catch(e) { Logger.warn('[SeriesRepo] Erro ao ler pauta_historico.json: ' + e.message); return []; }
  }

  return {

    // ── Séries ─────────────────────────────────────────────────────────────

    listarSeries: function() { return _lerSeries(); },

    listarSeriesParaUsuario: function(email, nivel) {
      var todas = _lerSeries();
      if (_NIVEIS_AMPLOS.indexOf(nivel) !== -1) return todas;
      return todas.filter(function(s) {
        return s.criadoPor === email ||
               s.organizadorPadrao === email ||
               (s.participantesRecorrentes || []).indexOf(email) !== -1;
      });
    },

    obterSeriePorId: function(id) {
      return _lerSeries().find(function(s) { return s.id === id; }) || null;
    },

    salvarSerie: function(serie) {
      modifyJSON(_FILE_SERIES, function(lista) {
        var idx = -1;
        for (var i = 0; i < lista.length; i++) {
          if (lista[i].id === serie.id) { idx = i; break; }
        }
        if (idx === -1) lista.push(serie);
        else            lista[idx] = serie;
        return lista;
      });
      return serie;
    },

    excluirSerie: function(id) {
      modifyJSON(_FILE_SERIES, function(lista) {
        return lista.filter(function(s) { return s.id !== id; });
      });
      return { ok: true };
    },

    // ── Histórico de Pautas ───────────────────────────────────────────────

    registrarHistoricoPauta: function(entrada) {
      // entrada: { reuniaoId, pautaId, acao, usuario, antes, depois, detalhe }
      var registro = {
        id:        'PAH-' + new Date().getFullYear() + '-' +
                   Utilities.getUuid().replace(/-/g,'').substring(0,8).toUpperCase(),
        reuniaoId: entrada.reuniaoId,
        pautaId:   entrada.pautaId   || null,
        acao:      entrada.acao,
        usuario:   entrada.usuario,
        timestamp: new Date().toISOString(),
        antes:     entrada.antes   || null,
        depois:    entrada.depois  || null,
        detalhe:   entrada.detalhe || ''
      };
      try {
        modifyJSON(_FILE_PAUTA_HISTORICO, function(lista) {
          lista.push(registro);
          return lista;
        });
      } catch(e) {
        Logger.warn('[SeriesRepo.registrarHistoricoPauta] ' + e.message);
      }
      return registro;
    },

    listarHistoricoPauta: function(reuniaoId, pautaId) {
      var hist = _lerHistorico();
      return hist.filter(function(h) {
        if (h.reuniaoId !== reuniaoId) return false;
        if (pautaId && h.pautaId !== pautaId) return false;
        return true;
      }).sort(function(a, b) { return a.timestamp > b.timestamp ? 1 : -1; });
    }

  };
})();

// ── Motor Principal ────────────────────────────────────────────────────────

var ReunioesSeriesEngine = (function() {

  var _NIVEIS_AMPLOS = ['superadmin', 'admin', 'gestor'];
  var _NIVEIS_ADMIN  = ['superadmin', 'admin'];

  // ── Helpers ───────────────────────────────────────────────────────────────

  function _gerarId(prefixo) {
    return prefixo + '-' + new Date().getFullYear() +
           '-' + Utilities.getUuid().replace(/-/g,'').substring(0,8).toUpperCase();
  }

  function _agora() { return new Date().toISOString(); }

  function _isOrganizador(reuniao, email) {
    return reuniao.organizador === email || reuniao.criadoPor === email;
  }

  function _isParticipante(reuniao, email) {
    return (reuniao.participantes || []).indexOf(email) !== -1;
  }

  function _normalizarTitulo(titulo) {
    if (!titulo) return '';
    return titulo.toLowerCase()
      .replace(/[áàãâä]/g,'a').replace(/[éèêë]/g,'e')
      .replace(/[íìîï]/g,'i').replace(/[óòõôö]/g,'o')
      .replace(/[úùûü]/g,'u').replace(/ç/g,'c')
      .replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim();
  }

  function _jaccard(a, b) {
    var wa = a.split(' ').filter(function(w) { return w.length > 3; });
    var wb = b.split(' ').filter(function(w) { return w.length > 3; });
    if (!wa.length || !wb.length) return 0;
    var inter = wa.filter(function(w) { return wb.indexOf(w) !== -1; });
    var union  = wa.concat(wb.filter(function(w) { return wa.indexOf(w) === -1; }));
    return union.length ? inter.length / union.length : 0;
  }

  // ── Verificação de permissão de pauta ─────────────────────────────────────
  //
  // ANTES do início (planejada|agendada):
  //   - Organizador/admin: tudo
  //   - Participante (se série autoriza): adicionar e editar/remover próprios
  //
  // APÓS o início (em_andamento|finalizada|ata_*|arquivada):
  //   - Remoção BLOQUEADA para todos
  //   - Adição: apenas organizador/admin
  //   - Edição: organizador/admin | própria pauta (participante)
  //   - Marcação de statusFinal: organizador/admin | própria pauta

  var _STATUS_PRE_INICIO = ['planejada', 'agendada'];
  var _STATUS_POS_INICIO = ['em_andamento','finalizada','ata_rascunho','ata_aprovada','arquivada'];

  function _verificarPerm(reuniao, email, nivel, acao) {
    var amplo      = _NIVEIS_AMPLOS.indexOf(nivel) !== -1;
    var organiz    = _isOrganizador(reuniao, email);
    var participa  = _isParticipante(reuniao, email);
    var posInicio  = _STATUS_POS_INICIO.indexOf(reuniao.status) !== -1;

    if (amplo || organiz) return true;

    if (acao === 'remover' && posInicio) {
      throw new Error('Pautas não podem ser removidas após o início da reunião. ' +
                      'Use "Marcar status" para indicar: não debatida, adiada, transferida etc.');
    }

    if (acao === 'adicionar' && posInicio) {
      throw new Error('Somente o organizador pode adicionar pautas após o início da reunião.');
    }

    if (!participa) {
      throw new Error('Usuário não é participante desta reunião.');
    }

    // Participante — verificar permissão da série
    var permSerie = reuniao._seriePermissoes || {};
    if (permSerie.participantesPodemAdicionarPauta === false) {
      throw new Error('Participantes não têm permissão para editar pautas nesta série.');
    }

    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 1. CRUD DE SÉRIES / PRESETS
  // ─────────────────────────────────────────────────────────────────────────

  function criarSerie(dados, emailCriador) {
    if (!dados.nome || !dados.nome.trim()) throw new Error('Nome da série é obrigatório.');

    var serie = {
      id:   _gerarId('SER'),
      nome: dados.nome.trim(),
      descricao: dados.descricao || '',
      tipo:      dados.tipo || 'ordinaria',
      status:    STATUS_SERIE.ATIVA,

      // ── Estrutura operacional (o que o preset persiste) ──
      organizadorPadrao:        dados.organizadorPadrao || emailCriador,
      participantesRecorrentes: dados.participantesRecorrentes || [],
      setores:                  dados.setores   || [],
      local:                    dados.local     || '',
      linkRemoto:               dados.linkRemoto || '',
      modalidade:               dados.modalidade || 'presencial',
      tags:                     dados.tags      || [],
      sigilosa:                 !!dados.sigilosa,
      duracao:                  dados.duracao   || 60,
      aprovadoresPadrao:        dados.aprovadoresPadrao || [],

      // ── Recorrência ──
      recorrencia: {
        tipo:       (dados.recorrencia || {}).tipo       || null,
        diaSemana:  (dados.recorrencia || {}).diaSemana  !== undefined ? (dados.recorrencia||{}).diaSemana : null,
        diaDoMes:   (dados.recorrencia || {}).diaDoMes   || null,
        horaInicio: (dados.recorrencia || {}).horaInicio || '',
        horaTermino:(dados.recorrencia || {}).horaTermino|| ''
      },

      // ── Permissões de pauta colaborativa ──
      permissoes: {
        participantesPodemAdicionarPauta: (dados.permissoes||{}).participantesPodemAdicionarPauta !== false,
        janelaPautaHoras:                 (dados.permissoes||{}).janelaPautaHoras || 24,
        participantesPodemReordenar:      !!(dados.permissoes||{}).participantesPodemReordenar
      },

      // ── Integrações ──
      integracoes: {
        gerarTarefasAutomatico: !!(dados.integracoes||{}).gerarTarefasAutomatico,
        notificarParticipantes: (dados.integracoes||{}).notificarParticipantes !== false,
        modulos:                (dados.integracoes||{}).modulos || []
      },

      criadoPor:    emailCriador,
      criadoEm:     _agora(),
      atualizadoEm: _agora(),
      historico: [{ ts: _agora(), acao: 'criada', usuario: emailCriador }]
    };

    try {
      SystemEvents.emit('SERIE_REUNIAO_CRIADA', {
        entidade: 'serie_reuniao', entidade_id: serie.id,
        usuario: emailCriador, payload: { nome: serie.nome }
      });
    } catch(e) { Logger.warn('[ReunioesSeriesEngine.criarSerie] SystemEvents: ' + e.message); }

    return _SeriesRepo.salvarSerie(serie);
  }

  function atualizarSerie(id, dados, email) {
    var serie = _SeriesRepo.obterSeriePorId(id);
    if (!serie) throw new Error('Série não encontrada: ' + id);
    if (serie.status === STATUS_SERIE.ENCERRADA) throw new Error('Série encerrada não pode ser editada.');

    var campos = ['nome','descricao','tipo','organizadorPadrao','participantesRecorrentes',
                  'setores','local','linkRemoto','modalidade','tags','sigilosa','duracao',
                  'aprovadoresPadrao','recorrencia','permissoes','integracoes'];
    campos.forEach(function(c) { if (dados[c] !== undefined) serie[c] = dados[c]; });
    serie.atualizadoEm = _agora();
    serie.historico.push({ ts: _agora(), acao: 'atualizada', usuario: email });
    return _SeriesRepo.salvarSerie(serie);
  }

  function excluirSerie(id, email) {
    var serie = _SeriesRepo.obterSeriePorId(id);
    if (!serie) throw new Error('Série não encontrada: ' + id);
    var ativas = ReunioesRepository.listarReunioesPorSerie(id).filter(function(r) {
      return r.status !== 'arquivada' && r.status !== 'cancelada';
    });
    if (ativas.length > 0) {
      throw new Error('Série possui ' + ativas.length + ' reunião(ões) ativa(s). Arquive-as antes de excluir a série.');
    }
    return _SeriesRepo.excluirSerie(id);
  }

  function alterarStatusSerie(id, novoStatus, email) {
    if (!STATUS_SERIE[novoStatus.toUpperCase()] && Object.keys(STATUS_SERIE).map(function(k){return STATUS_SERIE[k];}).indexOf(novoStatus)===-1) {
      throw new Error('Status inválido: ' + novoStatus);
    }
    var serie = _SeriesRepo.obterSeriePorId(id);
    if (!serie) throw new Error('Série não encontrada: ' + id);
    var statusAnterior = serie.status;
    serie.status = novoStatus;
    serie.atualizadoEm = _agora();
    serie.historico.push({ ts: _agora(), acao: statusAnterior + '→' + novoStatus, usuario: email });
    return _SeriesRepo.salvarSerie(serie);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. CRIAR REUNIÃO A PARTIR DE PRESET
  //    Preset NÃO copia: pauta, encaminhamentos, decisões passadas.
  //    Preset copia: estrutura operacional, participantes, local, modalidade.
  // ─────────────────────────────────────────────────────────────────────────

  function criarReuniaoDeSerie(serieId, dadosEspecificos, email) {
    var serie = _SeriesRepo.obterSeriePorId(serieId);
    if (!serie) throw new Error('Série não encontrada: ' + serieId);
    if (serie.status !== STATUS_SERIE.ATIVA) throw new Error('Série não está ativa.');
    if (!dadosEspecificos.data) throw new Error('Data da reunião é obrigatória.');

    var reunioesNaSerie = ReunioesRepository.listarReunioesPorSerie(serieId);
    var serieNumero = reunioesNaSerie.length + 1;

    var dados = {
      titulo:      dadosEspecificos.titulo || (serie.nome + ' #' + serieNumero),
      tipo:        dadosEspecificos.tipo   || serie.tipo,
      data:        dadosEspecificos.data,
      horaInicio:  dadosEspecificos.horaInicio  || serie.recorrencia.horaInicio  || '',
      horaTermino: dadosEspecificos.horaTermino || serie.recorrencia.horaTermino || '',
      local:       dadosEspecificos.local     || serie.local,
      linkRemoto:  dadosEspecificos.linkRemoto || serie.linkRemoto,
      modalidade:  dadosEspecificos.modalidade || serie.modalidade,
      organizador: dadosEspecificos.organizador || serie.organizadorPadrao || email,
      participantes:     dadosEspecificos.participantes || serie.participantesRecorrentes.slice(),
      setores:           dadosEspecificos.setores       || serie.setores.slice(),
      tags:              dadosEspecificos.tags           || serie.tags.slice(),
      sigilosa:          dadosEspecificos.sigilosa !== undefined ? dadosEspecificos.sigilosa : serie.sigilosa,
      aprovadores:       dadosEspecificos.aprovadores   || serie.aprovadoresPadrao.slice(),
      descricao:         dadosEspecificos.descricao || '',
      pauta:             [],   // NUNCA herda pauta do preset
      serieId:           serieId,
      serieNumero:       serieNumero,
      _seriePermissoes:  serie.permissoes   // injeta permissões da série na reunião
    };

    var reuniao = ReunioesEngine.criar(dados, email);

    try {
      SystemEvents.emit('REUNIAO_SERIE_CRIADA', {
        entidade: 'reuniao', entidade_id: reuniao.id, usuario: email,
        payload: { serieId: serieId, serieNome: serie.nome, numero: serieNumero }
      });
    } catch(e) {}

    return reuniao;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. GESTÃO COLABORATIVA DE PAUTAS
  // ─────────────────────────────────────────────────────────────────────────

  function adicionarItemPauta(reuniaoId, dados, email, nivel) {
    var reuniao = ReunioesRepository.obterReuniaoPorId(reuniaoId);
    if (!reuniao) throw new Error('Reunião não encontrada: ' + reuniaoId);
    _verificarPerm(reuniao, email, nivel, 'adicionar');
    if (!dados.titulo || !dados.titulo.trim()) throw new Error('Título da pauta é obrigatório.');

    var pauta = reuniao.pauta || [];
    var item = {
      id:               'P' + (pauta.length + 1),
      titulo:           dados.titulo.trim(),
      responsavel:      dados.responsavel  || email,
      tempoEstimado:    dados.tempoEstimado || 0,
      status:           'pendente',          // status de discussão ao vivo
      statusFinal:      null,                // preenchido pós-início
      notas:            dados.notas || '',
      ordem:            dados.ordem !== undefined ? dados.ordem : pauta.length + 1,
      adicionadoPor:    email,
      adicionadoEm:     _agora(),
      editadoEm:        null,
      transferidaDe:    null,
      vezesTransferida: 0,
      historico: [{ ts: _agora(), acao: 'adicionada', usuario: email, detalhe: dados.titulo.trim() }]
    };

    pauta.push(item);
    reuniao.pauta = pauta;
    reuniao.atualizadoEm = _agora();

    _SeriesRepo.registrarHistoricoPauta({
      reuniaoId: reuniaoId, pautaId: item.id, acao: 'adicionada',
      usuario: email, depois: item, detalhe: 'Pauta adicionada: ' + item.titulo
    });

    return ReunioesRepository.salvarReuniao(reuniao);
  }

  function editarItemPauta(reuniaoId, itemId, dados, email, nivel) {
    var reuniao = ReunioesRepository.obterReuniaoPorId(reuniaoId);
    if (!reuniao) throw new Error('Reunião não encontrada: ' + reuniaoId);

    var item = (reuniao.pauta || []).find(function(p) { return p.id === itemId; });
    if (!item) throw new Error('Item de pauta não encontrado: ' + itemId);

    var amplo    = _NIVEIS_AMPLOS.indexOf(nivel) !== -1;
    var organiz  = _isOrganizador(reuniao, email);
    var ehAutor  = item.adicionadoPor === email || !item.adicionadoPor;
    if (!amplo && !organiz && !ehAutor) {
      throw new Error('Sem permissão para editar esta pauta. Apenas o autor ou o organizador podem editá-la.');
    }

    var antes = JSON.parse(JSON.stringify(item));
    var campos = ['titulo','responsavel','tempoEstimado','notas','ordem'];
    campos.forEach(function(c) { if (dados[c] !== undefined) item[c] = dados[c]; });
    item.editadoEm = _agora();
    if (!item.historico) item.historico = [];
    item.historico.push({ ts: _agora(), acao: 'editada', usuario: email });
    reuniao.atualizadoEm = _agora();

    _SeriesRepo.registrarHistoricoPauta({
      reuniaoId: reuniaoId, pautaId: itemId, acao: 'editada',
      usuario: email, antes: antes, depois: item
    });

    return ReunioesRepository.salvarReuniao(reuniao);
  }

  function removerItemPauta(reuniaoId, itemId, email, nivel) {
    var reuniao = ReunioesRepository.obterReuniaoPorId(reuniaoId);
    if (!reuniao) throw new Error('Reunião não encontrada: ' + reuniaoId);
    _verificarPerm(reuniao, email, nivel, 'remover');

    var item = (reuniao.pauta || []).find(function(p) { return p.id === itemId; });
    if (!item) throw new Error('Item de pauta não encontrado: ' + itemId);

    var amplo   = _NIVEIS_AMPLOS.indexOf(nivel) !== -1;
    var organiz = _isOrganizador(reuniao, email);
    var ehAutor = item.adicionadoPor === email || !item.adicionadoPor;
    if (!amplo && !organiz && !ehAutor) {
      throw new Error('Sem permissão para remover esta pauta. Apenas o autor ou o organizador podem removê-la.');
    }

    var antes = JSON.parse(JSON.stringify(item));
    reuniao.pauta = (reuniao.pauta || []).filter(function(p) { return p.id !== itemId; });
    reuniao.atualizadoEm = _agora();

    _SeriesRepo.registrarHistoricoPauta({
      reuniaoId: reuniaoId, pautaId: itemId, acao: 'removida',
      usuario: email, antes: antes, detalhe: 'Pauta removida: ' + item.titulo
    });

    return ReunioesRepository.salvarReuniao(reuniao);
  }

  function reordenarPauta(reuniaoId, novaOrdem, email, nivel) {
    // novaOrdem: array de ids na ordem desejada
    var reuniao = ReunioesRepository.obterReuniaoPorId(reuniaoId);
    if (!reuniao) throw new Error('Reunião não encontrada: ' + reuniaoId);

    var amplo   = _NIVEIS_AMPLOS.indexOf(nivel) !== -1;
    var organiz = _isOrganizador(reuniao, email);
    var permSerie = reuniao._seriePermissoes || {};
    var podeReordenar = amplo || organiz ||
      (_isParticipante(reuniao, email) && permSerie.participantesPodemReordenar === true);
    if (!podeReordenar) throw new Error('Sem permissão para reordenar pauta.');

    var mapa = {};
    (reuniao.pauta || []).forEach(function(p) { mapa[p.id] = p; });
    reuniao.pauta = novaOrdem.filter(function(id) { return mapa[id]; }).map(function(id, idx) {
      mapa[id].ordem = idx + 1;
      return mapa[id];
    });
    reuniao.atualizadoEm = _agora();

    _SeriesRepo.registrarHistoricoPauta({
      reuniaoId: reuniaoId, pautaId: null, acao: 'reordenada',
      usuario: email, detalhe: 'Nova ordem: ' + novaOrdem.join(', ')
    });

    return ReunioesRepository.salvarReuniao(reuniao);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. MARCAÇÃO DE STATUS FINAL
  //    Após o início: pautas NÃO são removidas — apenas recebem statusFinal.
  //    A ata preserva toda pauta com rastreabilidade do que aconteceu.
  // ─────────────────────────────────────────────────────────────────────────

  function marcarStatusFinalPauta(reuniaoId, itemId, statusFinal, observacao, email, nivel) {
    var statusValidos = Object.keys(STATUS_FINAL_PAUTA).map(function(k) { return STATUS_FINAL_PAUTA[k]; });
    if (statusValidos.indexOf(statusFinal) === -1) throw new Error('Status final inválido: ' + statusFinal);

    var reuniao = ReunioesRepository.obterReuniaoPorId(reuniaoId);
    if (!reuniao) throw new Error('Reunião não encontrada: ' + reuniaoId);

    // Permitido a partir de em_andamento
    var statusOK = ['em_andamento','finalizada','ata_rascunho'];
    if (statusOK.indexOf(reuniao.status) === -1) {
      throw new Error('Status final de pauta só pode ser definido durante ou após a reunião (status atual: ' + reuniao.status + ').');
    }

    var item = (reuniao.pauta || []).find(function(p) { return p.id === itemId; });
    if (!item) throw new Error('Item de pauta não encontrado: ' + itemId);

    var amplo   = _NIVEIS_AMPLOS.indexOf(nivel) !== -1;
    var organiz = _isOrganizador(reuniao, email);
    var ehAutor = item.adicionadoPor === email;
    if (!amplo && !organiz && !ehAutor) {
      throw new Error('Sem permissão para marcar status desta pauta.');
    }

    var antes = item.statusFinal;
    item.statusFinal = statusFinal;
    item.editadoEm   = _agora();
    if (observacao) item.notas = (item.notas ? item.notas + '\n' : '') + '[' + LABEL_STATUS_FINAL_PAUTA[statusFinal] + '] ' + observacao;
    if (!item.historico) item.historico = [];
    item.historico.push({ ts: _agora(), acao: 'status_final:' + statusFinal, usuario: email, detalhe: observacao || '' });
    reuniao.atualizadoEm = _agora();

    _SeriesRepo.registrarHistoricoPauta({
      reuniaoId: reuniaoId, pautaId: itemId, acao: 'status_alterado', usuario: email,
      antes: { statusFinal: antes }, depois: { statusFinal: statusFinal }, detalhe: observacao || ''
    });

    return ReunioesRepository.salvarReuniao(reuniao);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5. TRANSFERÊNCIA DE PAUTAS
  //    Mantém histórico: de onde veio, quantas vezes foi transferida,
  //    há quanto tempo está aberta.
  // ─────────────────────────────────────────────────────────────────────────

  function transferirPauta(reuniaoOrigemId, pautaId, reuniaoDestinoId, email, nivel) {
    if (reuniaoOrigemId === reuniaoDestinoId) throw new Error('Origem e destino não podem ser a mesma reunião.');

    var origem  = ReunioesRepository.obterReuniaoPorId(reuniaoOrigemId);
    if (!origem) throw new Error('Reunião de origem não encontrada.');
    var destino = ReunioesRepository.obterReuniaoPorId(reuniaoDestinoId);
    if (!destino) throw new Error('Reunião de destino não encontrada.');
    if (destino.status === 'arquivada' || destino.status === 'cancelada') {
      throw new Error('Não é possível transferir para reunião arquivada ou cancelada.');
    }

    var amplo   = _NIVEIS_AMPLOS.indexOf(nivel) !== -1;
    var organiz = _isOrganizador(origem, email);
    if (!amplo && !organiz) throw new Error('Somente o organizador pode transferir pautas.');

    var item = (origem.pauta || []).find(function(p) { return p.id === pautaId; });
    if (!item) throw new Error('Item de pauta não encontrado: ' + pautaId);

    // Calcular rastreabilidade cumulativa
    var vezesTransferida = (item.vezesTransferida || 0) + 1;
    var origemOriginal   = item.transferidaDe || null;
    var dataOriginal     = origemOriginal ? origemOriginal.dataOriginal : origem.data;
    var primeiraAbertura = origemOriginal ? origemOriginal.primeiraAbertura : _agora();

    // Marcar item de origem como transferida
    item.statusFinal = STATUS_FINAL_PAUTA.TRANSFERIDA;
    item.editadoEm   = _agora();
    if (!item.historico) item.historico = [];
    item.historico.push({
      ts: _agora(), acao: 'transferida', usuario: email,
      detalhe: 'Para: ' + destino.titulo + ' (' + reuniaoDestinoId + ')'
    });

    // Criar item espelho no destino
    var destPauta = destino.pauta || [];
    var novoItem = {
      id:               'P' + (destPauta.length + 1),
      titulo:           item.titulo,
      responsavel:      item.responsavel,
      tempoEstimado:    item.tempoEstimado,
      status:           'pendente',
      statusFinal:      null,
      notas:            item.notas,
      ordem:            destPauta.length + 1,
      adicionadoPor:    item.adicionadoPor || email,
      adicionadoEm:     _agora(),
      editadoEm:        null,
      transferidaDe: {
        reuniaoId:           reuniaoOrigemId,
        pautaId:             pautaId,
        contador:            vezesTransferida,
        dataOriginal:        dataOriginal,
        primeiraAbertura:    primeiraAbertura,
        tituloReuniaoOrigem: origem.titulo
      },
      vezesTransferida: vezesTransferida,
      historico: [{
        ts: _agora(), acao: 'criada_por_transferencia', usuario: email,
        detalhe: 'Transferida de: ' + origem.titulo
      }]
    };

    destPauta.push(novoItem);
    destino.pauta        = destPauta;
    destino.atualizadoEm = _agora();
    origem.atualizadoEm  = _agora();

    _SeriesRepo.registrarHistoricoPauta({
      reuniaoId: reuniaoOrigemId, pautaId: pautaId, acao: 'transferida',
      usuario: email, detalhe: 'Para reunião ' + reuniaoDestinoId + ' (' + destino.titulo + ')'
    });
    _SeriesRepo.registrarHistoricoPauta({
      reuniaoId: reuniaoDestinoId, pautaId: novoItem.id, acao: 'recebida_por_transferencia',
      usuario: email, detalhe: 'De reunião ' + reuniaoOrigemId + ' (' + origem.titulo + ')'
    });

    try {
      SystemEvents.emit('PAUTA_TRANSFERIDA', {
        entidade: 'pauta', entidade_id: pautaId, usuario: email,
        payload: { titulo: item.titulo, de: reuniaoOrigemId, para: reuniaoDestinoId,
                   vezesTransferida: vezesTransferida }
      });
    } catch(e) {}

    ReunioesRepository.salvarReuniao(origem);
    return ReunioesRepository.salvarReuniao(destino);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 6. ANÁLISE DE RECORRÊNCIA TEMÁTICA
  //    Detecta: temas reincidentes, gargalos, pautas circulares,
  //             encaminhamentos inefetivos, tempo médio de resolução.
  // ─────────────────────────────────────────────────────────────────────────

  function analisarRecorrenciaSerial(serieId) {
    var serie = _SeriesRepo.obterSeriePorId(serieId);
    if (!serie) throw new Error('Série não encontrada: ' + serieId);

    var reunioesDaSerie = ReunioesRepository.listarReunioesPorSerie(serieId);
    if (!reunioesDaSerie.length) {
      return { serieId: serieId, serieNome: serie.nome, geradoEm: _agora(),
               resumo: {}, temas: [], gargalos: [], alertas: [] };
    }

    var idsReunioes = reunioesDaSerie.map(function(r) { return r.id; });
    var todosEnc = ReunioesRepository.listarEncaminhamentos().filter(function(e) {
      return idsReunioes.indexOf(e.reuniaoId) !== -1;
    });

    // Agregar pautas por título normalizado
    var temaMap = {};

    reunioesDaSerie.forEach(function(reuniao) {
      (reuniao.pauta || []).forEach(function(item) {
        var chave = _normalizarTitulo(item.titulo);
        if (!temaMap[chave]) {
          temaMap[chave] = {
            titulo:                item.titulo,
            tituloNormalizado:     chave,
            aparecimentos:         0,
            reunioesIds:           [],
            transferencias:        0,
            vezesMaxTransferida:   0,
            statusFinais:          {},
            encaminhamentosGerados:   0,
            encaminhamentosConcluidos:0,
            primeiraAbertura:      null,
            ultimaAbertura:        null
          };
        }
        var t = temaMap[chave];
        t.aparecimentos++;
        t.reunioesIds.push(reuniao.id);
        t.transferencias      += (item.vezesTransferida || 0);
        t.vezesMaxTransferida  = Math.max(t.vezesMaxTransferida, item.vezesTransferida || 0);
        if (item.statusFinal) {
          t.statusFinais[item.statusFinal] = (t.statusFinais[item.statusFinal] || 0) + 1;
        }
        var dataRef = item.adicionadoEm || reuniao.data;
        if (dataRef) {
          if (!t.primeiraAbertura || dataRef < t.primeiraAbertura) t.primeiraAbertura = dataRef;
          if (!t.ultimaAbertura   || reuniao.data > t.ultimaAbertura)  t.ultimaAbertura   = reuniao.data;
        }
      });
    });

    // Cruzar encaminhamentos com temas (similaridade Jaccard)
    todosEnc.forEach(function(enc) {
      var chaveEnc = _normalizarTitulo(enc.titulo);
      Object.keys(temaMap).forEach(function(chave) {
        if (_jaccard(chaveEnc, chave) >= 0.4) {
          temaMap[chave].encaminhamentosGerados++;
          if (enc.status === 'concluido') temaMap[chave].encaminhamentosConcluidos++;
        }
      });
    });

    // Construir lista de temas com métricas
    var temas = Object.keys(temaMap).map(function(chave) {
      var t = temaMap[chave];
      var d1 = t.primeiraAbertura ? new Date(t.primeiraAbertura) : null;
      var d2 = t.ultimaAbertura   ? new Date(t.ultimaAbertura)   : null;
      t.diasAberto = d1 && d2 ? Math.max(0, Math.floor((d2 - d1) / 86400000)) : 0;
      t.taxaResolucao = t.encaminhamentosGerados > 0
        ? Math.round(t.encaminhamentosConcluidos / t.encaminhamentosGerados * 100) : null;
      t.ehRecorrente = t.aparecimentos >= 3 || t.transferencias >= 2;
      t.alertas = [];
      if (t.aparecimentos >= 6)           t.alertas.push('Tema reapareceu em ' + t.aparecimentos + ' reuniões.');
      if (t.vezesMaxTransferida >= 4)     t.alertas.push('Pauta transferida ' + t.vezesMaxTransferida + ' vezes sem resolução.');
      if (t.encaminhamentosGerados > 0 && t.encaminhamentosConcluidos === 0) {
        t.alertas.push('Há ' + t.encaminhamentosGerados + ' encaminhamentos relacionados ainda pendentes.');
      }
      if (t.diasAberto > 90)              t.alertas.push('Pauta aberta há ' + t.diasAberto + ' dias sem resolução.');
      return t;
    });

    temas.sort(function(a, b) {
      return (b.aparecimentos + b.transferencias) - (a.aparecimentos + a.transferencias);
    });

    var gargalos = temas.filter(function(t) {
      return t.aparecimentos >= 3 && (t.taxaResolucao === null || t.taxaResolucao < 30);
    });

    // Métricas globais da série
    var totalReunioes    = reunioesDaSerie.length;
    var reunioesComAta   = reunioesDaSerie.filter(function(r) {
      return r.status === 'ata_aprovada' || r.status === 'arquivada';
    }).length;
    var totalPautas      = reunioesDaSerie.reduce(function(s,r) { return s + (r.pauta||[]).length; }, 0);
    var totalTransferidas= reunioesDaSerie.reduce(function(s,r) {
      return s + (r.pauta||[]).filter(function(p) { return p.statusFinal === 'transferida'; }).length;
    }, 0);
    var encConcluidos    = todosEnc.filter(function(e) { return e.status === 'concluido'; }).length;
    var encAtrasados     = todosEnc.filter(function(e) {
      return (e.atrasado || e.status === 'atrasado') && e.status !== 'cancelado';
    }).length;

    return {
      serieId:   serieId,
      serieNome: serie.nome,
      geradoEm:  _agora(),
      resumo: {
        totalReunioes:          totalReunioes,
        reunioesComAta:         reunioesComAta,
        totalPautas:            totalPautas,
        totalTransferencias:    totalTransferidas,
        totalEncaminhamentos:   todosEnc.length,
        encaminhamentosConcluidos: encConcluidos,
        encaminhamentosAtrasados:  encAtrasados,
        taxaResolutividade: totalPautas > 0
          ? Math.round((totalPautas - totalTransferidas) / totalPautas * 100) : null
      },
      temas:     temas.slice(0, 20),
      gargalos:  gargalos.slice(0, 10),
      alertasGlobais: gargalos.length > 0
        ? [gargalos.length + ' gargalos organizacionais identificados.'] : []
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 7. DASHBOARD POR SÉRIE
  // ─────────────────────────────────────────────────────────────────────────

  function obterDashboardSerie(serieId) {
    var serie = _SeriesRepo.obterSeriePorId(serieId);
    if (!serie) throw new Error('Série não encontrada: ' + serieId);

    var reunioesDaSerie = ReunioesRepository.listarReunioesPorSerie(serieId)
      .sort(function(a,b) { return a.data > b.data ? 1 : -1; });
    var idsReunioes = reunioesDaSerie.map(function(r) { return r.id; });
    var todosEnc = ReunioesRepository.listarEncaminhamentos().filter(function(e) {
      return idsReunioes.indexOf(e.reuniaoId) !== -1;
    });

    // Timeline enriquecida
    var hoje = new Date().toISOString().substring(0,10);
    var timeline = reunioesDaSerie.map(function(r) {
      var encsR = todosEnc.filter(function(e) { return e.reuniaoId === r.id; });
      return {
        id:              r.id,
        titulo:          r.titulo,
        data:            r.data,
        status:          r.status,
        serieNumero:     r.serieNumero || null,
        totalPautas:     (r.pauta||[]).length,
        pautasTransferidas: (r.pauta||[]).filter(function(p){ return p.statusFinal === 'transferida'; }).length,
        pautasNaoDebatidas: (r.pauta||[]).filter(function(p){ return p.statusFinal === 'nao_debatida'; }).length,
        totalEncs:       encsR.length,
        encsConcluidos:  encsR.filter(function(e){ return e.status === 'concluido'; }).length,
        encsAtrasados:   encsR.filter(function(e){ return e.atrasado || e.status === 'atrasado'; }).length
      };
    });

    // Pautas pendentes de reuniões anteriores
    var pautasPendentes = [];
    reunioesDaSerie.forEach(function(r) {
      if (r.data >= hoje) return;  // apenas passadas
      (r.pauta||[]).forEach(function(p) {
        if (p.statusFinal === 'pendente_proxima' || p.statusFinal === 'adiada') {
          pautasPendentes.push({
            reuniaoId: r.id, reuniaoTitulo: r.titulo, reuniaoData: r.data,
            pautaId: p.id, titulo: p.titulo, statusFinal: p.statusFinal,
            vezesTransferida: p.vezesTransferida || 0, adicionadoEm: p.adicionadoEm
          });
        }
      });
    });

    // Top pautas mais transferidas
    var todasPautas = [];
    reunioesDaSerie.forEach(function(r) {
      (r.pauta||[]).forEach(function(p) {
        if ((p.vezesTransferida||0) > 0) todasPautas.push({ item: p, reuniaoData: r.data });
      });
    });
    var maisTransferidas = todasPautas
      .sort(function(a,b) { return (b.item.vezesTransferida||0) - (a.item.vezesTransferida||0); })
      .slice(0, 10)
      .map(function(x) {
        return { titulo: x.item.titulo, vezesTransferida: x.item.vezesTransferida, reuniaoData: x.reuniaoData };
      });

    // Encaminhamentos por responsável
    var encPorResp = {};
    todosEnc.forEach(function(e) {
      if (!encPorResp[e.responsavel]) encPorResp[e.responsavel] = { total:0, pendentes:0, concluidos:0 };
      encPorResp[e.responsavel].total++;
      if (e.status === 'concluido') encPorResp[e.responsavel].concluidos++;
      else if (e.status !== 'cancelado') encPorResp[e.responsavel].pendentes++;
    });

    // Taxa de resolução por reunião
    var taxaMedia = timeline.filter(function(t) { return t.totalEncs > 0; });
    var taxaMediaVal = taxaMedia.length > 0
      ? Math.round(taxaMedia.reduce(function(s,t) { return s + (t.encsConcluidos/t.totalEncs); }, 0) / taxaMedia.length * 100)
      : null;

    return {
      serie:    serie,
      timeline: timeline,
      pautasPendentes: pautasPendentes,
      maisTransferidas: maisTransferidas,
      encaminhamentosPorResponsavel: encPorResp,
      metricas: {
        totalReunioes:      reunioesDaSerie.length,
        proximaReuniao:     timeline.find(function(t) {
          return t.data >= hoje && t.status !== 'cancelada' && t.status !== 'arquivada';
        }) || null,
        taxaResolutividade: taxaMediaVal,
        totalEncs:          todosEnc.length,
        encsConcluidos:     todosEnc.filter(function(e){ return e.status==='concluido'; }).length,
        encsAtrasados:      todosEnc.filter(function(e){ return e.atrasado||e.status==='atrasado'; }).length,
        totalPautasPendentes: pautasPendentes.length
      }
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 8. CONTEXTO IA
  //    Agrega dados REAIS do histórico da série sem inventar nada.
  //    O frontend usa este contexto para exibir sugestões contextuais.
  // ─────────────────────────────────────────────────────────────────────────

  function gerarContextoIA(serieId, reuniaoAtualId) {
    var serie = _SeriesRepo.obterSeriePorId(serieId);
    var reunioesPassadas = ReunioesRepository.listarReunioesPorSerie(serieId)
      .filter(function(r) {
        if (reuniaoAtualId && r.id === reuniaoAtualId) return false;
        return r.status === 'ata_aprovada' || r.status === 'arquivada';
      })
      .sort(function(a,b) { return b.data > a.data ? 1 : -1; })
      .slice(0, 5);

    var idsPassadas = reunioesPassadas.map(function(r) { return r.id; });
    var encPendentes = ReunioesRepository.listarEncaminhamentos().filter(function(e) {
      return idsPassadas.indexOf(e.reuniaoId) !== -1 &&
             e.status !== 'concluido' && e.status !== 'cancelado';
    });

    // Temas frequentes das últimas reuniões
    var freqs = {};
    reunioesPassadas.forEach(function(r) {
      (r.pauta||[]).forEach(function(p) {
        var chave = _normalizarTitulo(p.titulo);
        freqs[chave] = { titulo: p.titulo, count: (freqs[chave] ? freqs[chave].count : 0) + 1 };
      });
    });
    var recorrentes = Object.keys(freqs)
      .filter(function(k) { return freqs[k].count >= 2; })
      .map(function(k) { return { titulo: freqs[k].titulo, aparecimentos: freqs[k].count }; })
      .sort(function(a,b) { return b.aparecimentos - a.aparecimentos; })
      .slice(0, 5);

    var alertas = [];
    if (recorrentes.length > 0) {
      alertas.push(recorrentes.length + ' tema(s) recorrente(s) identificado(s) nesta série.');
    }
    if (encPendentes.filter(function(e){ return e.atrasado||e.status==='atrasado'; }).length > 0) {
      alertas.push('Há encaminhamentos atrasados de reuniões anteriores.');
    }

    return {
      serieNome:              serie ? serie.nome : '',
      totalReunioesConcluidas: reunioesPassadas.length,
      pautasRecorrentes:      recorrentes,
      encaminhamentosPendentes: encPendentes.slice(0,10).map(function(e) {
        return { titulo: e.titulo, responsavel: e.responsavel,
                 prazo: e.prazo, prioridade: e.prioridade, status: e.status };
      }),
      ultimasReunioes: reunioesPassadas.map(function(r) {
        return { titulo: r.titulo, data: r.data, totalPautas: (r.pauta||[]).length };
      }),
      alertas: alertas
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // API PÚBLICA
  // ─────────────────────────────────────────────────────────────────────────

  return {
    // Séries / Presets
    criarSerie:          criarSerie,
    atualizarSerie:      atualizarSerie,
    excluirSerie:        excluirSerie,
    alterarStatusSerie:  alterarStatusSerie,
    listarSeries:        function(email, nivel) { return _SeriesRepo.listarSeriesParaUsuario(email, nivel); },
    obterSerie:          function(id) { return _SeriesRepo.obterSeriePorId(id); },

    // Criar reunião a partir de preset
    criarReuniaoDeSerie: criarReuniaoDeSerie,

    // Pauta colaborativa
    adicionarItemPauta:     adicionarItemPauta,
    editarItemPauta:        editarItemPauta,
    removerItemPauta:       removerItemPauta,
    reordenarPauta:         reordenarPauta,
    marcarStatusFinalPauta: marcarStatusFinalPauta,

    // Transferência
    transferirPauta:     transferirPauta,

    // Histórico de pauta (auditoria)
    listarHistoricoPauta: function(reuniaoId, pautaId) {
      return _SeriesRepo.listarHistoricoPauta(reuniaoId, pautaId);
    },

    // Inteligência organizacional
    analisarRecorrenciaSerial: analisarRecorrenciaSerial,
    obterDashboardSerie:       obterDashboardSerie,
    gerarContextoIA:           gerarContextoIA,

    // Constantes exportadas
    STATUS_SERIE:            STATUS_SERIE,
    STATUS_FINAL_PAUTA:      STATUS_FINAL_PAUTA,
    LABEL_STATUS_FINAL_PAUTA: LABEL_STATUS_FINAL_PAUTA
  };

})();
