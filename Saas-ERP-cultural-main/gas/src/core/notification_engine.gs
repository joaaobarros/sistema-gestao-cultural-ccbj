/**
 * @file core/notification_engine.gs
 * @layer core
 * @description Motor de Notificações Transversais — centraliza alertas por email e internos
 *              para todos os módulos do sistema CCBJ.
 *
 *              RESPONSABILIDADE:
 *              Único ponto de envio de emails de alerta operacional.
 *              Todos os módulos que precisam notificar usuários devem chamar este motor.
 *              NÃO duplicar lógica de email em módulos individuais.
 *
 *              VERIFICAÇÕES DIÁRIAS (via Time-based Triggers):
 *              - notificacoes_verificarDiario() → função global para trigger
 *
 * @depends core/event_bus_backend.gs (SystemEvents)
 * @depends core/logger.gs (Logger)
 */

var NotificationEngine = (function() {

  // Configuração de templates de email por tipo de alerta
  var _TEMPLATES_EMAIL = {

    processo_prazo_vencido: {
      assunto:  '[CCBJ] ⚠️ Processo com prazo vencido: {titulo}',
      corpo:    'O processo institucional "{titulo}" está com prazo vencido.\n\n' +
                'Responsável atual: {responsavel}\n' +
                'Status: {status}\n\n' +
                'Acesse o sistema para verificar o andamento: {url}\n\n' +
                '— Sistema CCBJ'
    },
    processo_inativo: {
      assunto:  '[CCBJ] 🔔 Processo sem atividade: {titulo}',
      corpo:    'O processo "{titulo}" está sem atividade há {dias} dias.\n\n' +
                'Responsável: {responsavel}\n' +
                'Último status: {status}\n\n' +
                'Acesse o sistema para atualizar o processo.\n\n' +
                '— Sistema CCBJ'
    },
    processo_tarefas_atrasadas: {
      assunto:  '[CCBJ] ⚠️ Tarefas atrasadas no processo: {titulo}',
      corpo:    'O processo "{titulo}" possui {quantidade} tarefa(s) atrasada(s).\n\n' +
                'Acesse o painel de processos para verificar os gargalos.\n\n' +
                '— Sistema CCBJ'
    },
    processo_financeiro_negativo: {
      assunto:  '[CCBJ] 🚨 Saldo negativo no processo: {titulo}',
      corpo:    'Atenção: o processo "{titulo}" está com saldo financeiro negativo.\n\n' +
                'Previsto: R$ {previsto}\nExecutado: R$ {executado}\n\n' +
                'Acesse o sistema para revisar o orçamento.\n\n' +
                '— Sistema CCBJ'
    },
    tarefa_prazo_proximo: {
      assunto:  '[CCBJ] 📅 Tarefa próxima do prazo: {titulo}',
      corpo:    'A tarefa "{titulo}" vence em menos de 24 horas.\n\n' +
                'Prazo: {prazo}\nStatus atual: {status}\n\n' +
                'Acesse o sistema para atualizar o andamento.\n\n' +
                '— Sistema CCBJ'
    },
    tarefa_atrasada: {
      assunto:  '[CCBJ] ⚠️ Tarefa atrasada: {titulo}',
      corpo:    'A tarefa "{titulo}" está atrasada.\n\n' +
                'Prazo era: {prazo}\nStatus atual: {status}\nResponsável: {responsavel}\n\n' +
                '— Sistema CCBJ'
    },
    chave_atrasada: {
      assunto:  '[CCBJ] 🔑 Chave não devolvida: {ref}',
      corpo:    'A chave "{ref}" ainda não foi devolvida.\n\n' +
                'Responsável: {responsavel}\nData prevista: {prazo}\n\n' +
                'Por favor, providencie a devolução urgentemente.\n\n' +
                '— Sistema CCBJ'
    },
    contrato_vencendo: {
      assunto:  '[CCBJ] 📋 Contrato vence em breve: {ref}',
      corpo:    'O contrato "{ref}" vence em {dias} dias.\n\n' +
                'Verifique se é necessário renovar ou encerrar.\n\n' +
                '— Sistema CCBJ'
    },
    reuniao_ata_pendente: {
      assunto:  '[CCBJ] 📝 Ata pendente de aprovação: {titulo}',
      corpo:    'A reunião "{titulo}" tem ata aguardando aprovação há {dias} dias.\n\n' +
                'Acesse o módulo de Reuniões para aprovar.\n\n' +
                '— Sistema CCBJ'
    }
  };

  function _agora() { return new Date().toISOString(); }

  function _interpolar(template, dados) {
    return template.replace(/\{(\w+)\}/g, function(match, chave) {
      return dados[chave] !== undefined ? String(dados[chave]) : match;
    });
  }

  function _getAppUrl() {
    try { return ScriptApp.getService().getUrl() || 'https://ccbj.sistema'; } catch(_) { return 'https://ccbj.sistema'; }
  }

  function _enviarEmail(destinatario, assunto, corpo) {
    try {
      if (!destinatario || !destinatario.includes('@')) return false;
      GmailApp.sendEmail(destinatario, assunto, corpo);

      SystemEvents.emit(SystemEventTypes.NOTIFICACAO_EMAIL_ENVIADA, {
        entidade:   'notificacao',
        entidadeId: '',
        usuario:    'sistema',
        contexto:   { destinatario: destinatario, assunto: assunto }
      });

      return true;
    } catch(e) {
      Logger.warn('[NotificationEngine._enviarEmail] Falha para ' + destinatario + ': ' + e.message);
      SystemEvents.emit(SystemEventTypes.NOTIFICACAO_FALHA, {
        entidade:   'notificacao',
        entidadeId: '',
        usuario:    'sistema',
        contexto:   { destinatario: destinatario, erro: e.message }
      });
      return false;
    }
  }

  return {

    // ── Alerta de Processo ────────────────────────────────────────────────────

    enviarAlertaProcesso: function(alerta) {
      var tipo    = 'processo_' + (alerta.tipo || 'alerta');
      var tpl     = _TEMPLATES_EMAIL[tipo] || _TEMPLATES_EMAIL['processo_inativo'];
      var dados   = Object.assign({
        url:        _getAppUrl(),
        responsavel: alerta.destinatario || '',
        dias:       alerta.diasSemAtividade || '',
        quantidade: alerta.quantidade || '',
        previsto:   (alerta.previsto || 0).toFixed(2),
        executado:  (alerta.executado || 0).toFixed(2)
      }, alerta);

      var assunto = _interpolar(tpl.assunto, dados);
      var corpo   = _interpolar(tpl.corpo,   dados);

      return _enviarEmail(alerta.destinatario, assunto, corpo);
    },

    // ── Alertas de Tarefas ────────────────────────────────────────────────────

    enviarAlertaTarefas: function(tarefasAtrasadas, destinatario) {
      if (!tarefasAtrasadas || !tarefasAtrasadas.length) return 0;
      var enviados = 0;

      tarefasAtrasadas.forEach(function(tarefa) {
        var tpl  = _TEMPLATES_EMAIL.tarefa_atrasada;
        var dados = {
          titulo:      tarefa.titulo      || tarefa.id,
          prazo:       tarefa.prazo       || 'sem prazo',
          status:      tarefa.status      || '',
          responsavel: tarefa.responsavel || destinatario || ''
        };
        var dest = tarefa.responsavel || destinatario;
        if (_enviarEmail(dest, _interpolar(tpl.assunto, dados), _interpolar(tpl.corpo, dados))) {
          enviados++;
        }
      });

      return enviados;
    },

    // ── Alerta de prazo próximo ───────────────────────────────────────────────

    enviarAlertaPrazoProximo: function(tarefa) {
      var tpl   = _TEMPLATES_EMAIL.tarefa_prazo_proximo;
      var dados = {
        titulo:  tarefa.titulo || tarefa.id,
        prazo:   tarefa.prazo  || '',
        status:  tarefa.status || ''
      };
      return _enviarEmail(
        tarefa.responsavel,
        _interpolar(tpl.assunto, dados),
        _interpolar(tpl.corpo, dados)
      );
    },

    // ── Alerta de chave atrasada ──────────────────────────────────────────────

    enviarAlertaChaveAtrasada: function(chave, destinatario) {
      var tpl   = _TEMPLATES_EMAIL.chave_atrasada;
      var dados = {
        ref:         chave.ref         || chave.id || '',
        responsavel: chave.responsavel || destinatario || '',
        prazo:       chave.prazo       || chave.dataDevolvida || ''
      };
      return _enviarEmail(
        destinatario || chave.responsavel,
        _interpolar(tpl.assunto, dados),
        _interpolar(tpl.corpo, dados)
      );
    },

    // ── Alerta de contrato vencendo ───────────────────────────────────────────

    enviarAlertaContratoVencendo: function(contrato, destinatario, diasParaVencer) {
      var tpl   = _TEMPLATES_EMAIL.contrato_vencendo;
      var dados = {
        ref:  contrato.descricao || contrato.nome || contrato.id,
        dias: diasParaVencer || 30
      };
      return _enviarEmail(
        destinatario,
        _interpolar(tpl.assunto, dados),
        _interpolar(tpl.corpo, dados)
      );
    },

    // ── Alerta de ata pendente ────────────────────────────────────────────────

    enviarAlertaAtaPendente: function(reuniao, destinatario, diasPendente) {
      var tpl   = _TEMPLATES_EMAIL.reuniao_ata_pendente;
      var dados = {
        titulo: reuniao.titulo || reuniao.id,
        dias:   diasPendente || 0
      };
      return _enviarEmail(
        destinatario,
        _interpolar(tpl.assunto, dados),
        _interpolar(tpl.corpo, dados)
      );
    },

    // ── Alerta de Solicitação Interna ─────────────────────────────────────────

    enviarAlertaSolicitacao: function(alerta) {
      if (!alerta.destinatario || !alerta.destinatario.includes('@')) return false;

      var assuntos = {
        nova_solicitacao:  '[CCBJ] Nova Solicitação Aguarda Análise — {protocolo}',
        inativa:           '[CCBJ] Solicitação sem movimentação: {protocolo}',
        prazo_vencido:     '[CCBJ] Prazo vencido — Solicitação {protocolo}',
        saldo_insuficiente:'[CCBJ] Saldo insuficiente — Solicitação {protocolo}'
      };
      var corpos = {
        nova_solicitacao:  'A solicitação {protocolo} — "{titulo}" está aguardando análise.\n\nResponsável: {destinatario}\n\nAcesse o sistema para analisar.\n\n— Sistema CCBJ',
        inativa:           'A solicitação {protocolo} — "{titulo}" está sem movimentação há mais de 3 dias.\n\nAcesse o sistema para verificar.\n\n— Sistema CCBJ',
        prazo_vencido:     'A data de necessidade da solicitação {protocolo} — "{titulo}" já venceu.\n\nAcesse o sistema para providenciar.\n\n— Sistema CCBJ',
        saldo_insuficiente:'A solicitação {protocolo} possui saldo orçamentário insuficiente.\n\nAcesse o sistema para verificar a rubrica vinculada.\n\n— Sistema CCBJ'
      };

      var tipo   = alerta.tipo || 'inativa';
      var assunto = _interpolar(assuntos[tipo] || assuntos.inativa, alerta);
      var corpo   = _interpolar(corpos[tipo]   || corpos.inativa,  alerta);

      return _enviarEmail(alerta.destinatario, assunto, corpo);
    },

    // ── Verificação diária completa ───────────────────────────────────────────

    verificarTodosAlertasDiario: function() {
      var resultado = {
        processosVerificados: 0,
        tarefasVerificadas:   0,
        chaveVerificadas:     0,
        contratosVerificados: 0,
        reunioesVerificadas:  0,
        emailsEnviados:       0,
        erros:                []
      };

      // ── Processos Institucionais ─────────────────────────────────────────────
      try {
        var alertasProc = ProcessoInstitucionalEngine.detectarAlertas();
        resultado.processosVerificados = alertasProc.length;
        alertasProc.forEach(function(alerta) {
          try {
            if (NotificationEngine.enviarAlertaProcesso(alerta)) {
              resultado.emailsEnviados++;
            }
          } catch(e) {
            resultado.erros.push('processo/' + alerta.processoId + ': ' + e.message);
          }
        });
      } catch(e) {
        resultado.erros.push('processos: ' + e.message);
      }

      // ── Tarefas próximas do prazo (< 24h) ────────────────────────────────────
      try {
        var agora    = Date.now();
        var limite24h = agora + 86400000;
        var tarefas  = TarefaRepository.listar();
        resultado.tarefasVerificadas = tarefas.length;

        tarefas.forEach(function(t) {
          if (!t.prazo || !t.responsavel) return;
          if (t.status === 'concluida' || t.status === 'cancelada') return;
          var prazoMs = new Date(t.prazo).getTime();
          if (prazoMs > agora && prazoMs <= limite24h) {
            try {
              if (NotificationEngine.enviarAlertaPrazoProximo(t)) resultado.emailsEnviados++;
            } catch(e) {
              resultado.erros.push('tarefa/prazo/' + t.id + ': ' + e.message);
            }
          }
        });
      } catch(e) {
        resultado.erros.push('tarefas: ' + e.message);
      }

      // ── Contratos vencendo em 30 dias ────────────────────────────────────────
      try {
        var agora30   = Date.now() + (30 * 86400000);
        var contratacoes = lerJSON('contratacoes.json') || [];
        resultado.contratosVerificados = contratacoes.length;
        contratacoes.forEach(function(c) {
          if (!c.dataFim || !c.responsavel) return;
          if (c.status === 'encerrado' || c.status === 'cancelado') return;
          var vencimento = new Date(c.dataFim).getTime();
          if (vencimento > Date.now() && vencimento <= agora30) {
            var dias = Math.ceil((vencimento - Date.now()) / 86400000);
            try {
              if (NotificationEngine.enviarAlertaContratoVencendo(c, c.responsavel, dias)) {
                resultado.emailsEnviados++;
              }
            } catch(e) {
              resultado.erros.push('contrato/' + c.id + ': ' + e.message);
            }
          }
        });
      } catch(e) {
        resultado.erros.push('contratos: ' + e.message);
      }

      // ── Atas de reunião pendentes > 7 dias ───────────────────────────────────
      try {
        var reunioes = lerJSON('reunioes.json') || [];
        resultado.reunioesVerificadas = reunioes.length;
        var limite7d = 7 * 86400000;
        reunioes.forEach(function(r) {
          if (r.status !== 'ata_rascunho') return;
          if (!r.organizador) return;
          var diasPend = r.atualizadoEm
            ? Math.floor((Date.now() - new Date(r.atualizadoEm).getTime()) / 86400000)
            : 0;
          if (diasPend > 7) {
            try {
              if (NotificationEngine.enviarAlertaAtaPendente(r, r.organizador, diasPend)) {
                resultado.emailsEnviados++;
              }
            } catch(e) {
              resultado.erros.push('reuniao/' + r.id + ': ' + e.message);
            }
          }
        });
      } catch(e) {
        resultado.erros.push('reunioes: ' + e.message);
      }

      // ── Solicitações internas com pendências ──────────────────────────────────
      try {
        var pendenciasSol = SolicitacaoEngine.detectarPendencias();
        pendenciasSol.forEach(function(p) {
          try {
            if (NotificationEngine.enviarAlertaSolicitacao(p)) resultado.emailsEnviados++;
          } catch(e) {
            resultado.erros.push('solicitacao/' + p.solicitacaoId + ': ' + e.message);
          }
        });
      } catch(e) {
        resultado.erros.push('solicitacoes: ' + e.message);
      }

      Logger.info('[NotificationEngine.verificarTodosAlertasDiario] Resultado: ' + JSON.stringify({
        emails: resultado.emailsEnviados, erros: resultado.erros.length
      }));

      return resultado;
    }
  };
})();

// ── Trigger global (configurar como Time-based Trigger, diário) ───────────────
function notificacoes_verificarDiario() {
  try {
    return NotificationEngine.verificarTodosAlertasDiario();
  } catch(e) {
    Logger.warn('[trigger notificacoes_verificarDiario] ' + e.message);
  }
}
