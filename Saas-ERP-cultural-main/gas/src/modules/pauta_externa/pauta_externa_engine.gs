/**
 * @file modules/pauta_externa/pauta_externa_engine.gs
 * @layer modules/pauta_externa
 * @description Motor de Solicitações Externas de Cessão de Pauta.
 *
 * Usuários externos (sem login/domínio) solicitam uso de espaços do CCBJ.
 * O sistema:
 *   - Recebe via formulário público (doGet com ?secao=pauta)
 *   - Gera protocolo e envia email de confirmação ao solicitante
 *   - Cria pré-reserva interna e gera tarefas de análise
 *   - Flui por aprovação interna com notificações automáticas
 *   - Notifica o solicitante externo em cada mudança de status
 *
 * REGRAS DE CESSÃO DE PAUTA:
 *   - Antecedência mínima: 15 dias corridos
 *   - Atividades comerciais: bloqueadas
 *   - Gratuidade: obrigatória
 *   - Aceite institucional: obrigatório antes de enviar
 *
 * @depends modules/pauta_externa/pauta_externa_repository.gs
 * @depends modules/reservas/reserva_engine.gs (verificarConflito)
 * @depends core/notification_engine.gs
 * @depends core/event_bus_backend.gs
 */

// ── Status canônicos ─────────────────────────────────────────────────────────

var STATUS_PAUTA = Object.freeze({
  RECEBIDA:            'recebida',
  EM_ANALISE:          'em_analise',
  AGUARDANDO_AJUSTE:   'aguardando_ajuste',
  PARCIALMENTE_APROVADA: 'parcialmente_aprovada',
  APROVADA:            'aprovada',
  INDEFERIDA:          'indeferida',
  CANCELADA:           'cancelada',
  CONCLUIDA:           'concluida'
});

var LABEL_STATUS_PAUTA = {
  recebida:              'Recebida',
  em_analise:            'Em Análise',
  aguardando_ajuste:     'Aguard. Ajuste',
  parcialmente_aprovada: 'Parcialmente Aprovada',
  aprovada:              'Aprovada',
  indeferida:            'Indeferida',
  cancelada:             'Cancelada',
  concluida:             'Concluída'
};

// FSM oficial de pauta
var _TRANSICOES_PAUTA = {
  recebida:              ['em_analise', 'indeferida', 'cancelada'],
  em_analise:            ['aguardando_ajuste', 'parcialmente_aprovada', 'aprovada', 'indeferida', 'cancelada'],
  aguardando_ajuste:     ['em_analise', 'cancelada'],
  parcialmente_aprovada: ['concluida', 'cancelada'],
  aprovada:              ['concluida', 'cancelada'],
  indeferida:            [],
  cancelada:             [],
  concluida:             []
};

// Antecedência mínima em dias
var PAUTA_ANTECEDENCIA_MINIMA_DIAS = 15;

// ── Helpers ──────────────────────────────────────────────────────────────────

function _agora_pauta() { return new Date().toISOString(); }

function _gerarId_pauta(prefixo) {
  return (typeof gerarId === 'function')
    ? gerarId(prefixo)
    : prefixo + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

function _emitir_pauta(tipo, pauta, extra) {
  try {
    SystemEvents.emit(tipo, {
      entidade:   'pauta_externa',
      entidadeId: pauta.id,
      usuario:    'externo',
      contexto:   Object.assign({ protocolo: pauta.protocolo, status: pauta.status }, extra || {})
    });
  } catch(e) {
    Logger.warn('[PautaExternaEngine] emit ' + tipo + ': ' + e.message);
  }
}

function _validarTransicaoPauta(statusAtual, novoStatus) {
  var permitidos = _TRANSICOES_PAUTA[statusAtual] || [];
  if (permitidos.indexOf(novoStatus) === -1) {
    throw new Error(
      'Transição inválida de pauta: "' + statusAtual + '" → "' + novoStatus + '". ' +
      'Permitidas: [' + (permitidos.join(', ') || 'nenhuma') + ']'
    );
  }
}

function _novoEventoPauta(tipo, descricao, ator, extra) {
  return {
    id:        _gerarId_pauta('evt'),
    tipo:      tipo,
    descricao: descricao,
    ator:      ator || 'sistema',
    timestamp: _agora_pauta(),
    extra:     extra || null
  };
}

// ── Validações de entrada ─────────────────────────────────────────────────────

function _validarSolicitanteExterno(sol) {
  if (!sol.nome || !sol.nome.trim())     throw new Error('Nome do solicitante é obrigatório.');
  if (!sol.email || !sol.email.trim())   throw new Error('E-mail do solicitante é obrigatório.');
  if (!sol.telefone || !sol.telefone.trim()) throw new Error('Telefone do solicitante é obrigatório.');

  var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(sol.email.trim())) throw new Error('E-mail inválido: ' + sol.email);
}

function _validarProposta(prop) {
  if (!prop.titulo || !prop.titulo.trim())   throw new Error('Título da proposta é obrigatório.');
  if (!prop.linguagem || !prop.linguagem.trim()) throw new Error('Linguagem artística é obrigatória.');
  if (!prop.sinopse || !prop.sinopse.trim()) throw new Error('Sinopse/descrição é obrigatória.');
}

function _validarDatas(datasSolicitadas) {
  if (!datasSolicitadas || !datasSolicitadas.length) throw new Error('Informe ao menos uma data solicitada.');

  var agora    = Date.now();
  var minFuture = agora + PAUTA_ANTECEDENCIA_MINIMA_DIAS * 86400000;

  datasSolicitadas.forEach(function(d) {
    var dt = d.data ? new Date(d.data).getTime() : 0;
    if (!dt) throw new Error('Data inválida: ' + d.data);
    if (dt < minFuture) {
      throw new Error(
        'A data ' + d.data + ' não respeita a antecedência mínima de ' +
        PAUTA_ANTECEDENCIA_MINIMA_DIAS + ' dias para solicitação de pauta.'
      );
    }
  });
}

// ── PautaExternaEngine ────────────────────────────────────────────────────────

var PautaExternaEngine = (function() {

  return {

    // ── Receber nova solicitação externa ─────────────────────────────────────

    receberSolicitacao: function(dados) {
      // Validações obrigatórias
      if (!dados.aceiteTermos) throw new Error('O aceite dos termos institucionais é obrigatório.');

      var sol = dados.solicitante || {};
      _validarSolicitanteExterno(sol);

      var prop = dados.proposta || {};
      _validarProposta(prop);

      var datas = dados.datasSolicitadas || [];
      _validarDatas(datas);

      // Validação de gratuidade
      if (dados.proposta && dados.proposta.gratuito === false) {
        throw new Error('O CCBJ cede espaço apenas para atividades gratuitas ao público.');
      }

      // Validação de atividade comercial
      if (dados.proposta && dados.proposta.comercial === true) {
        throw new Error('Atividades comerciais não são elegíveis para cessão de pauta.');
      }

      var agora     = _agora_pauta();
      var protocolo = PautaExternaRepository.proximoProtocolo();

      var pauta = {
        id:        _gerarId_pauta('pauta'),
        protocolo: protocolo,
        status:    STATUS_PAUTA.RECEBIDA,

        // Solicitante externo
        solicitante: {
          nome:          (sol.nome         || '').trim(),
          cpf:           (sol.cpf          || '').trim(),
          email:         (sol.email        || '').trim().toLowerCase(),
          telefone:      (sol.telefone     || '').trim(),
          organizacao:   (sol.organizacao  || '').trim(),
          cnpj:          (sol.cnpj         || '').trim(),
          enderecoWeb:   (sol.enderecoWeb  || '').trim(),
          mapaCultural:  (sol.mapaCultural || '').trim(),
          redesSociais: {
            instagram: (sol.instagram || '').trim(),
            facebook:  (sol.facebook  || '').trim(),
            youtube:   (sol.youtube   || '').trim(),
            outro:     (sol.outrasRedes || '').trim()
          }
        },

        // Proposta artística
        proposta: {
          titulo:                 (prop.titulo          || '').trim(),
          linguagem:              (prop.linguagem        || '').trim(),
          subTipo:                (prop.subTipo          || '').trim(),
          sinopse:                (prop.sinopse          || '').trim(),
          release:                (prop.release          || '').trim(),
          classificacaoIndicativa:(prop.classificacaoIndicativa || '').trim(),
          publicoAlvo:            (prop.publicoAlvo      || '').trim(),
          estimativaPublico:      parseInt(prop.estimativaPublico) || 0,
          gratuito:               prop.gratuito !== false,
          comercial:              prop.comercial === true,
          acessibilidade:         prop.acessibilidade === true,
          descricaoAcessibilidade:(prop.descricaoAcessibilidade || '').trim()
        },

        // Rider técnico
        rider: {
          palco:         dados.rider && dados.rider.palco         === true,
          iluminacao:    dados.rider && dados.rider.iluminacao    === true,
          sonorizacao:   dados.rider && dados.rider.sonorizacao   === true,
          camerim:       dados.rider && dados.rider.camerim       === true,
          projecao:      dados.rider && dados.rider.projecao      === true,
          camarimQtd:    parseInt(dados.rider && dados.rider.camarimQtd) || 0,
          observacoes:   (dados.rider && dados.rider.observacoes  || '').trim()
        },

        // Espaços e datas
        espacosSolicitados: (dados.espacosSolicitados || []).map(function(e) {
          return typeof e === 'string' ? { espacoId: e, nome: e } : e;
        }),
        datasSolicitadas: datas.map(function(d) {
          return {
            data:       d.data       || '',
            horaInicio: d.horaInicio || '',
            horaFim:    d.horaFim    || '',
            observacao: d.observacao || ''
          };
        }),
        duracaoMinutos:    parseInt(dados.duracaoMinutos) || 0,
        periodicidade:     dados.periodicidade || 'pontual',

        // Equipe
        equipe: (dados.equipe || []).map(function(m) {
          return {
            nome:  (m.nome  || '').trim(),
            funcao:(m.funcao || '').trim(),
            email: (m.email || '').trim()
          };
        }),

        // Documentos
        documentosAnexados: dados.documentosAnexados || [],

        // Acompanhamento interno
        timeline: [
          _novoEventoPauta('recebimento', 'Solicitação de pauta recebida: ' + prop.titulo, 'externo')
        ],
        historico: [{
          de: '', para: STATUS_PAUTA.RECEBIDA,
          motivo: 'Recebida via formulário externo',
          ator: 'externo',
          timestamp: agora
        }],
        observacoesInternas: '',
        parecerFinal:        '',

        // Vínculos gerados internamente
        reservasGeradas:     [],
        processoId:          '',
        tarefasDerivadas:    [],

        // Aceite
        aceiteTermos: true,

        // Prazos
        prazoRespostaInstitucional: _calcularPrazoResposta(agora),

        // Controle
        criadoEm:            agora,
        atualizadoEm:        agora,
        primeiraRespostaEm:  '',
        concluidaEm:         '',
        canceladaEm:         ''
      };

      PautaExternaRepository.salvar(pauta);

      // Enviar email de confirmação ao solicitante
      PautaExternaEngine.notificarSolicitante(pauta, 'recebida');

      // Gerar tarefas internas de análise
      PautaExternaEngine.gerarTarefasAnalise(pauta.id, 'sistema');

      // Verificar conflito de reservas
      PautaExternaEngine.verificarConflitosEAgendarPreReserva(pauta.id);

      _emitir_pauta(SystemEventTypes.PAUTA_RECEBIDA, pauta);

      return { id: pauta.id, protocolo: pauta.protocolo };
    },

    // ── Consulta pública por protocolo (para externo acompanhar) ────────────

    consultarPublico: function(protocolo, emailSolicitante) {
      var pauta = PautaExternaRepository.obterPorProtocolo(protocolo);
      if (!pauta) throw new Error('Protocolo não encontrado: ' + protocolo);

      // Valida que o email confere com o solicitante
      if (emailSolicitante && pauta.solicitante.email !== emailSolicitante.toLowerCase().trim()) {
        throw new Error('Email não corresponde ao protocolo informado.');
      }

      // Retorna visão pública (sem dados internos)
      return {
        protocolo: pauta.protocolo,
        status:    pauta.status,
        statusLabel: LABEL_STATUS_PAUTA[pauta.status] || pauta.status,
        proposta:  pauta.proposta.titulo,
        criadoEm:  pauta.criadoEm,
        prazo:     pauta.prazoRespostaInstitucional,
        parecer:   pauta.parecerFinal || '',
        timeline:  (pauta.timeline || []).filter(function(e) {
          return ['recebimento', 'status_change', 'ajuste_solicitado', 'aprovacao', 'indeferimento'].indexOf(e.tipo) !== -1;
        })
      };
    },

    // ── Mudança de status (uso interno) ──────────────────────────────────────

    mudarStatus: function(id, novoStatus, motivo, emailAtor) {
      var pauta = PautaExternaRepository.obterPorId(id);
      if (!pauta) throw new Error('Pauta não encontrada: ' + id);

      _validarTransicaoPauta(pauta.status, novoStatus);

      var statusAnterior = pauta.status;

      // Registra primeira resposta institucional
      if (!pauta.primeiraRespostaEm && novoStatus !== STATUS_PAUTA.RECEBIDA) {
        pauta.primeiraRespostaEm = _agora_pauta();
      }

      pauta.status       = novoStatus;
      pauta.atualizadoEm = _agora_pauta();

      if (novoStatus === STATUS_PAUTA.CONCLUIDA) pauta.concluidaEm = _agora_pauta();
      if (novoStatus === STATUS_PAUTA.CANCELADA)  pauta.canceladaEm = _agora_pauta();

      pauta.historico.push({
        de: statusAnterior, para: novoStatus,
        motivo: motivo || '', ator: emailAtor || 'sistema', timestamp: _agora_pauta()
      });
      pauta.timeline.push(_novoEventoPauta(
        'status_change',
        'Status: ' + (LABEL_STATUS_PAUTA[statusAnterior] || statusAnterior) +
          ' → ' + (LABEL_STATUS_PAUTA[novoStatus] || novoStatus) +
          (motivo ? ' — ' + motivo : ''),
        emailAtor
      ));

      PautaExternaRepository.salvar(pauta);

      // Notificar solicitante externo automaticamente
      PautaExternaEngine.notificarSolicitante(pauta, novoStatus, motivo);

      _emitir_pauta(SystemEventTypes.PAUTA_STATUS_CHANGED, pauta, { de: statusAnterior, para: novoStatus });

      return pauta;
    },

    // ── Aprovação ─────────────────────────────────────────────────────────────

    aprovar: function(id, parecer, emailAprovador) {
      var pauta = PautaExternaRepository.obterPorId(id);
      if (!pauta) throw new Error('Pauta não encontrada: ' + id);

      _validarTransicaoPauta(pauta.status, STATUS_PAUTA.APROVADA);

      pauta.status             = STATUS_PAUTA.APROVADA;
      pauta.parecerFinal       = parecer || 'Aprovada';
      pauta.atualizadoEm       = _agora_pauta();
      pauta.primeiraRespostaEm = pauta.primeiraRespostaEm || _agora_pauta();

      pauta.historico.push({
        de: 'em_analise', para: 'aprovada',
        motivo: parecer || 'Aprovada', ator: emailAprovador, timestamp: _agora_pauta()
      });
      pauta.timeline.push(_novoEventoPauta('aprovacao', 'Pauta aprovada por ' + emailAprovador, emailAprovador));

      // Confirmar pré-reservas geradas
      PautaExternaEngine.confirmarPreReservas(id, emailAprovador);

      PautaExternaRepository.salvar(pauta);

      // Notificar solicitante
      PautaExternaEngine.notificarSolicitante(pauta, 'aprovada', parecer);

      _emitir_pauta(SystemEventTypes.PAUTA_APROVADA, pauta);

      return pauta;
    },

    // ── Indeferimento ─────────────────────────────────────────────────────────

    indeferir: function(id, motivo, emailAtor) {
      if (!motivo || !motivo.trim()) throw new Error('Motivo do indeferimento é obrigatório.');
      var pauta = PautaExternaRepository.obterPorId(id);
      if (!pauta) throw new Error('Pauta não encontrada: ' + id);

      _validarTransicaoPauta(pauta.status, STATUS_PAUTA.INDEFERIDA);

      pauta.status             = STATUS_PAUTA.INDEFERIDA;
      pauta.parecerFinal       = motivo;
      pauta.atualizadoEm       = _agora_pauta();
      pauta.primeiraRespostaEm = pauta.primeiraRespostaEm || _agora_pauta();

      pauta.timeline.push(_novoEventoPauta('indeferimento', 'Pauta indeferida: ' + motivo, emailAtor));
      pauta.historico.push({
        de: pauta.status, para: 'indeferida',
        motivo: motivo, ator: emailAtor, timestamp: _agora_pauta()
      });

      PautaExternaRepository.salvar(pauta);

      PautaExternaEngine.notificarSolicitante(pauta, 'indeferida', motivo);

      _emitir_pauta(SystemEventTypes.PAUTA_INDEFERIDA, pauta, { motivo: motivo });

      return pauta;
    },

    // ── Solicitação de ajuste ──────────────────────────────────────────────────

    solicitarAjuste: function(id, orientacoes, emailAtor) {
      if (!orientacoes || !orientacoes.trim()) throw new Error('Orientações são obrigatórias ao solicitar ajuste.');
      var pauta = PautaExternaRepository.obterPorId(id);
      if (!pauta) throw new Error('Pauta não encontrada: ' + id);

      _validarTransicaoPauta(pauta.status, STATUS_PAUTA.AGUARDANDO_AJUSTE);

      pauta.status       = STATUS_PAUTA.AGUARDANDO_AJUSTE;
      pauta.atualizadoEm = _agora_pauta();
      pauta.primeiraRespostaEm = pauta.primeiraRespostaEm || _agora_pauta();

      pauta.timeline.push(_novoEventoPauta('ajuste_solicitado', 'Ajuste solicitado: ' + orientacoes, emailAtor));
      pauta.historico.push({
        de: 'em_analise', para: 'aguardando_ajuste',
        motivo: orientacoes, ator: emailAtor, timestamp: _agora_pauta()
      });

      PautaExternaRepository.salvar(pauta);

      PautaExternaEngine.notificarSolicitante(pauta, 'aguardando_ajuste', orientacoes);

      return pauta;
    },

    // ── Adicionar observação interna ──────────────────────────────────────────

    adicionarObservacaoInterna: function(id, texto, emailAtor) {
      if (!texto || !texto.trim()) throw new Error('Observação não pode ser vazia.');
      var pauta = PautaExternaRepository.obterPorId(id);
      if (!pauta) throw new Error('Pauta não encontrada: ' + id);

      pauta.observacoesInternas = (pauta.observacoesInternas || '') + '\n[' + new Date().toLocaleDateString('pt-BR') + ' — ' + emailAtor + '] ' + texto.trim();
      pauta.timeline.push(_novoEventoPauta('obs_interna', '[INTERNO] ' + texto.trim(), emailAtor));
      pauta.atualizadoEm = _agora_pauta();

      PautaExternaRepository.salvar(pauta);
      return { ok: true };
    },

    // ── Verificar conflitos e criar pré-reservas ──────────────────────────────

    verificarConflitosEAgendarPreReserva: function(id) {
      var pauta = PautaExternaRepository.obterPorId(id);
      if (!pauta) return;

      var conflitos = [];
      var preReservas = [];

      (pauta.datasSolicitadas || []).forEach(function(d) {
        (pauta.espacosSolicitados || []).forEach(function(e) {
          try {
            var espacoId = typeof e === 'string' ? e : e.espacoId;
            var conflito = ReservaEngine.verificarConflito({
              espacoId: espacoId,
              data:     d.data,
              inicio:   d.horaInicio,
              fim:      d.horaFim
            });

            if (conflito && conflito.conflito) {
              conflitos.push({ espacoId: espacoId, data: d.data, mensagem: conflito.mensagem || 'Conflito de horário' });
            } else {
              preReservas.push({ espacoId: espacoId, data: d.data, inicio: d.horaInicio, fim: d.horaFim });
            }
          } catch(e2) {
            Logger.warn('[PautaExternaEngine.verificarConflitos] ' + e2.message);
          }
        });
      });

      pauta.conflitosDetectados = conflitos;
      pauta.preReservas = preReservas;
      pauta.atualizadoEm = _agora_pauta();

      if (conflitos.length) {
        pauta.timeline.push(_novoEventoPauta('conflito_detectado',
          conflitos.length + ' conflito(s) de horário detectado(s)', 'sistema'));
      }

      PautaExternaRepository.salvar(pauta);
    },

    // ── Confirmar pré-reservas (chamado no momento da aprovação) ──────────────

    confirmarPreReservas: function(id, emailAtor) {
      var pauta = PautaExternaRepository.obterPorId(id);
      if (!pauta || !pauta.preReservas || !pauta.preReservas.length) return;

      var reservasConfirmadas = [];

      pauta.preReservas.forEach(function(pr) {
        try {
          if (typeof ctrl_reservas_criar === 'function') {
            var r = ctrl_reservas_criar({
              nome:       'Pauta Externa: ' + pauta.proposta.titulo,
              espacoId:   pr.espacoId,
              sala:       pr.espacoId,
              data:       pr.data,
              horaInicio: pr.inicio,
              horaTermino:pr.fim,
              solicitante: pauta.solicitante.email,
              observacoes: 'Pauta externa ' + pauta.protocolo
            }, emailAtor);
            if (r && r.ok) reservasConfirmadas.push(r.data);
          }
        } catch(e) {
          Logger.warn('[PautaExternaEngine.confirmarPreReservas] ' + e.message);
        }
      });

      if (reservasConfirmadas.length) {
        pauta.reservasGeradas = (pauta.reservasGeradas || []).concat(
          reservasConfirmadas.map(function(r) { return { id: r.id || r, espaco: r.espaco || '' }; })
        );
        pauta.timeline.push(_novoEventoPauta('reservas_confirmadas',
          reservasConfirmadas.length + ' reserva(s) confirmada(s) para a pauta aprovada', emailAtor));
        pauta.atualizadoEm = _agora_pauta();
        PautaExternaRepository.salvar(pauta);
      }
    },

    // ── Geração de tarefas de análise ────────────────────────────────────────

    gerarTarefasAnalise: function(id, emailAtor) {
      var pauta = PautaExternaRepository.obterPorId(id);
      if (!pauta) return;

      var tarefas = [
        { titulo: 'Analisar documentação — ' + pauta.protocolo, tipo: 'administrativa', prioridade: 'alta' },
        { titulo: 'Verificar disponibilidade de espaço — ' + pauta.protocolo, tipo: 'operacional', prioridade: 'alta' },
        { titulo: 'Análise de rider técnico — ' + pauta.protocolo, tipo: 'infraestrutura', prioridade: 'media' }
      ];

      var criadas = [];
      tarefas.forEach(function(tpl) {
        try {
          if (typeof TarefaEngine !== 'undefined') {
            var t = TarefaEngine.criar({
              titulo:    tpl.titulo,
              tipo:      tpl.tipo,
              prioridade: tpl.prioridade,
              modulo:    'pauta_externa',
              origemId:  pauta.id,
              status:    'solicitada'
            }, emailAtor || 'sistema');
            criadas.push({ id: t.id, titulo: t.titulo });
          }
        } catch(e) {
          Logger.warn('[PautaExternaEngine.gerarTarefasAnalise] ' + e.message);
        }
      });

      if (criadas.length) {
        pauta.tarefasDerivadas = (pauta.tarefasDerivadas || []).concat(criadas);
        pauta.atualizadoEm = _agora_pauta();
        PautaExternaRepository.salvar(pauta);
      }
    },

    // ── Notificação automática ao solicitante externo ─────────────────────────

    notificarSolicitante: function(pauta, evento, detalhes) {
      try {
        var email = pauta.solicitante && pauta.solicitante.email;
        if (!email) return;

        var templates = {
          recebida: {
            assunto: '[CCBJ] Protocolo ' + pauta.protocolo + ' — Solicitação de Pauta Recebida',
            corpo: 'Olá, ' + (pauta.solicitante.nome || '') + '!\n\n' +
                   'Recebemos sua solicitação de cessão de pauta para "' + (pauta.proposta.titulo || '') + '".\n\n' +
                   'Protocolo: ' + pauta.protocolo + '\n' +
                   'Status: Recebida\n' +
                   'Prazo para resposta institucional: ' + _formatarData(pauta.prazoRespostaInstitucional) + '\n\n' +
                   'Você pode acompanhar sua solicitação pelo protocolo acima.\n\n' +
                   '— Equipe CCBJ'
          },
          em_analise: {
            assunto: '[CCBJ] Protocolo ' + pauta.protocolo + ' — Em Análise',
            corpo: 'Olá, ' + (pauta.solicitante.nome || '') + '!\n\n' +
                   'Sua solicitação de pauta ' + pauta.protocolo + ' está sendo analisada pela nossa equipe.\n\n' +
                   'Em breve você receberá uma resposta.\n\n— Equipe CCBJ'
          },
          aguardando_ajuste: {
            assunto: '[CCBJ] Protocolo ' + pauta.protocolo + ' — Ajustes Necessários',
            corpo: 'Olá, ' + (pauta.solicitante.nome || '') + '!\n\n' +
                   'Sua solicitação de pauta ' + pauta.protocolo + ' precisa de ajustes:\n\n' +
                   (detalhes || '') + '\n\n' +
                   'Entre em contato conosco para providenciar os ajustes necessários.\n\n— Equipe CCBJ'
          },
          aprovada: {
            assunto: '[CCBJ] Protocolo ' + pauta.protocolo + ' — APROVADA ✓',
            corpo: 'Olá, ' + (pauta.solicitante.nome || '') + '!\n\n' +
                   'Sua solicitação de cessão de pauta foi APROVADA!\n\n' +
                   'Proposta: ' + (pauta.proposta.titulo || '') + '\n' +
                   'Protocolo: ' + pauta.protocolo + '\n\n' +
                   (detalhes ? 'Observações: ' + detalhes + '\n\n' : '') +
                   'Entraremos em contato para alinhar os detalhes operacionais.\n\n— Equipe CCBJ'
          },
          indeferida: {
            assunto: '[CCBJ] Protocolo ' + pauta.protocolo + ' — Indeferida',
            corpo: 'Olá, ' + (pauta.solicitante.nome || '') + '!\n\n' +
                   'Informamos que sua solicitação de cessão de pauta ' + pauta.protocolo + ' não foi aprovada.\n\n' +
                   'Motivo: ' + (detalhes || 'Não atende aos critérios vigentes.') + '\n\n' +
                   'Para mais informações, entre em contato com nossa equipe.\n\n— Equipe CCBJ'
          }
        };

        var tpl = templates[evento];
        if (!tpl) return;

        GmailApp.sendEmail(email, tpl.assunto, tpl.corpo);

        Logger.info('[PautaExternaEngine] Email enviado para ' + email + ' — evento: ' + evento);
      } catch(e) {
        Logger.warn('[PautaExternaEngine.notificarSolicitante] ' + e.message);
      }
    }

  };
})();

// ── Helpers internos ──────────────────────────────────────────────────────────

function _calcularPrazoResposta(criadoEm) {
  var data = new Date(criadoEm);
  data.setDate(data.getDate() + 10); // Prazo de 10 dias úteis
  return data.toISOString();
}

function _formatarData(isoStr) {
  if (!isoStr) return '';
  try {
    return new Date(isoStr).toLocaleDateString('pt-BR');
  } catch(e) { return isoStr; }
}
