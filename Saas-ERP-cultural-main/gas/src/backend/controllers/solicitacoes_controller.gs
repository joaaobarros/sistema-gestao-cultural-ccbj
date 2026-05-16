/**
 * @file backend/controllers/solicitacoes_controller.gs
 * @layer backend/controllers
 * @description Controller oficial do domínio Solicitações Internas Institucionais.
 *
 * Expõe todas as operações do workflow de solicitações via google.script.run.
 * Também gerencia o catálogo de itens e consultas de disponibilidade.
 *
 * REGRA ARQUITETURAL:
 * - Toda função pública: ctrl_sol_* ou ctrl_catalogo_* ou ctrl_disp_*
 * - Todo retorno: GasResponse.wrap()
 * - Controller orquestra; engines contêm regras de negócio
 *
 * @depends shared/response.gs (GasResponse)
 * @depends modules/solicitacoes/solicitacao_engine.gs
 * @depends modules/solicitacoes/solicitacao_repository.gs
 * @depends modules/solicitacoes/catalogo_engine.gs
 * @depends modules/solicitacoes/disponibilidade_engine.gs
 * @depends core/services/auditoria_service.gs
 * @depends core/utils.gs (obterEmailUsuario)
 */

// ═══════════════════════════════════════════════════════════════
// SOLICITAÇÕES — LEITURA
// ═══════════════════════════════════════════════════════════════

function ctrl_sol_listar(filtros, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');

    var perms = obterPermissoesUsuario(email);
    var nivel = (perms && perms.nivel) ? perms.nivel : 'visitante';

    var f = filtros || {};

    // Usuário comum: vê apenas suas próprias solicitações
    if (nivel === 'usuario' || nivel === 'visitante') {
      f.solicitante = email;
    }

    return SolicitacaoRepository.listarComFiltros(f);
  }, 'ctrl_sol_listar');
}

function ctrl_sol_obter(id, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    if (!id) throw new Error('ID é obrigatório.');

    var sol = SolicitacaoRepository.obterPorId(id);
    if (!sol) throw new Error('Solicitação não encontrada: ' + id);

    // Verifica acesso: criador ou aprovador ou admin
    var perms = obterPermissoesUsuario(email);
    var nivel = (perms && perms.nivel) ? perms.nivel : 'usuario';
    if (nivel === 'usuario' && sol.solicitante !== email && sol.responsavelAprovacao !== email) {
      throw new Error('Acesso negado à solicitação.');
    }

    return sol;
  }, 'ctrl_sol_obter');
}

function ctrl_sol_timeline(id, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!id) throw new Error('ID é obrigatório.');
    var sol = SolicitacaoRepository.obterPorId(id);
    if (!sol) throw new Error('Solicitação não encontrada: ' + id);
    return (sol.timeline || []).sort(function(a, b) { return new Date(a.timestamp) - new Date(b.timestamp); });
  }, 'ctrl_sol_timeline');
}

function ctrl_sol_metricas(emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return {
      porStatus: SolicitacaoRepository.contarPorStatus(),
      pendencias: SolicitacaoEngine.detectarPendencias()
    };
  }, 'ctrl_sol_metricas');
}

function ctrl_sol_dashboard(emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');

    var todas      = SolicitacaoRepository.listarComFiltros({});
    var abertas    = SolicitacaoRepository.listarAbertos();
    var pendencias = SolicitacaoEngine.detectarPendencias();
    var porStatus  = SolicitacaoRepository.contarPorStatus();

    var valorTotalAberto = abertas.reduce(function(acc, s) { return acc + (parseFloat(s.valorTotal) || 0); }, 0);

    var porTipo = {};
    todas.forEach(function(s) { porTipo[s.tipo] = (porTipo[s.tipo] || 0) + 1; });

    var porSetor = {};
    todas.forEach(function(s) {
      var setor = s.setorSolicitante || 'desconhecido';
      porSetor[setor] = (porSetor[setor] || 0) + 1;
    });

    return {
      total:           todas.length,
      abertas:         abertas.length,
      valorTotalAberto:valorTotalAberto,
      pendencias:      pendencias.length,
      porStatus:       porStatus,
      porTipo:         porTipo,
      porSetor:        porSetor,
      alertasCriticos: pendencias.filter(function(p) { return p.urgencia === 'alta'; })
    };
  }, 'ctrl_sol_dashboard');
}

// ═══════════════════════════════════════════════════════════════
// SOLICITAÇÕES — ESCRITA
// ═══════════════════════════════════════════════════════════════

function ctrl_sol_criar(dados, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    if (!dados || !dados.titulo) throw new Error('Título é obrigatório.');
    if (!dados.tipo)             throw new Error('Tipo é obrigatório.');

    dados.solicitante = dados.solicitante || email;

    var sol = SolicitacaoEngine.criar(dados, email);

    AuditoriaService.registrar('CRIAR', 'solicitacao', sol.id, {
      protocolo: sol.protocolo, tipo: sol.tipo, titulo: sol.titulo
    }, email);

    return sol;
  }, 'ctrl_sol_criar');
}

function ctrl_sol_editar(id, campos, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    if (!id) throw new Error('ID é obrigatório.');

    return SolicitacaoEngine.editar(id, campos || {}, email);
  }, 'ctrl_sol_editar');
}

function ctrl_sol_enviar(id, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    if (!id)    throw new Error('ID é obrigatório.');

    var sol = SolicitacaoEngine.enviar(id, email);

    AuditoriaService.registrar('ENVIAR', 'solicitacao', sol.id, { protocolo: sol.protocolo }, email);

    // Notificar aprovador
    if (sol.responsavelAprovacao && sol.responsavelAprovacao.includes('@')) {
      try {
        NotificationEngine.enviarAlertaSolicitacao({
          solicitacaoId: sol.id,
          protocolo:     sol.protocolo,
          titulo:        sol.titulo,
          tipo:          'nova_solicitacao',
          urgencia:      sol.prioridade === 'critica' ? 'alta' : 'media',
          descricao:     'Nova solicitação ' + sol.protocolo + ' aguarda análise.',
          destinatario:  sol.responsavelAprovacao
        });
      } catch(e) { Logger.warn('[ctrl_sol_enviar] Notificação falhou: ' + e.message); }
    }

    return sol;
  }, 'ctrl_sol_enviar');
}

function ctrl_sol_aprovar(id, parecer, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    if (!id)    throw new Error('ID é obrigatório.');

    var sol = SolicitacaoEngine.aprovar(id, parecer || '', email);

    AuditoriaService.registrar('APROVAR', 'solicitacao', sol.id, {
      protocolo: sol.protocolo, parecer: parecer
    }, email);

    // Gerar tarefas derivadas automaticamente
    try {
      SolicitacaoEngine.gerarTarefasDerivadas(id, email);
    } catch(e) {
      Logger.warn('[ctrl_sol_aprovar] Geração de tarefas falhou: ' + e.message);
    }

    // Notificar solicitante
    try {
      if (sol.solicitante && sol.solicitante.includes('@') && sol.solicitante !== email) {
        GmailApp.sendEmail(sol.solicitante,
          '[CCBJ] Solicitação ' + sol.protocolo + ' aprovada',
          'Sua solicitação "' + sol.titulo + '" foi aprovada.\n\nProtocolo: ' + sol.protocolo +
          '\n\nParecer: ' + (parecer || 'Aprovada') + '\n\n— Sistema CCBJ'
        );
      }
    } catch(e) { Logger.warn('[ctrl_sol_aprovar] Email falhou: ' + e.message); }

    return sol;
  }, 'ctrl_sol_aprovar');
}

function ctrl_sol_aprovar_parcial(id, itensAprovados, parecer, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    if (!id)    throw new Error('ID é obrigatório.');
    return SolicitacaoEngine.aprovarParcialmente(id, itensAprovados || [], parecer || '', email);
  }, 'ctrl_sol_aprovar_parcial');
}

function ctrl_sol_devolver(id, motivo, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    if (!id)    throw new Error('ID é obrigatório.');
    if (!motivo) throw new Error('Motivo é obrigatório.');

    var sol = SolicitacaoEngine.devolver(id, motivo, email);

    // Notificar solicitante
    try {
      if (sol.solicitante && sol.solicitante.includes('@') && sol.solicitante !== email) {
        GmailApp.sendEmail(sol.solicitante,
          '[CCBJ] Solicitação ' + sol.protocolo + ' — Ajuste necessário',
          'Sua solicitação "' + sol.titulo + '" foi devolvida para ajuste.\n\nMotivo: ' + motivo +
          '\n\nProtocolo: ' + sol.protocolo + '\n\n— Sistema CCBJ'
        );
      }
    } catch(e) { Logger.warn('[ctrl_sol_devolver] Email falhou: ' + e.message); }

    return sol;
  }, 'ctrl_sol_devolver');
}

function ctrl_sol_mudar_status(id, novoStatus, motivo, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email)     throw new Error('Usuário não identificado.');
    if (!id)        throw new Error('ID é obrigatório.');
    if (!novoStatus) throw new Error('Status é obrigatório.');

    var sol = SolicitacaoEngine.mudarStatus(id, novoStatus, motivo || '', email);

    AuditoriaService.registrar('STATUS', 'solicitacao', sol.id, { novoStatus: novoStatus, motivo: motivo }, email);

    return sol;
  }, 'ctrl_sol_mudar_status');
}

function ctrl_sol_comentar(id, texto, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    if (!id)    throw new Error('ID é obrigatório.');
    if (!texto) throw new Error('Texto é obrigatório.');
    return SolicitacaoEngine.comentar(id, texto, email);
  }, 'ctrl_sol_comentar');
}

function ctrl_sol_verificar_saldo(id, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    if (!id)    throw new Error('ID é obrigatório.');
    return SolicitacaoEngine.verificarSaldo(id, email);
  }, 'ctrl_sol_verificar_saldo');
}

function ctrl_sol_verificar_disponibilidade(dados, emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    if (!dados) throw new Error('Dados são obrigatórios.');
    return DisponibilidadeEngine.verificarCompleta(dados);
  }, 'ctrl_sol_verificar_disponibilidade');
}

// ═══════════════════════════════════════════════════════════════
// CATÁLOGO — CRUD
// ═══════════════════════════════════════════════════════════════

function ctrl_catalogo_listar(filtros, emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return CatalogoEngine.listar(filtros || {});
  }, 'ctrl_catalogo_listar');
}

function ctrl_catalogo_listar_por_categoria(emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return CatalogoEngine.listarPorCategoria();
  }, 'ctrl_catalogo_listar_por_categoria');
}

function ctrl_catalogo_criar(dados, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    var perms = obterPermissoesUsuario(email);
    if (!perms || !['admin', 'superadmin', 'gestor'].includes(perms.nivel)) {
      throw new Error('Permissão insuficiente para criar itens no catálogo.');
    }
    var item = CatalogoEngine.criar(dados, email);
    AuditoriaService.registrar('CRIAR', 'catalogo_item', item.id, { nome: item.nome }, email);
    return item;
  }, 'ctrl_catalogo_criar');
}

function ctrl_catalogo_editar(id, campos, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    var perms = obterPermissoesUsuario(email);
    if (!perms || !['admin', 'superadmin', 'gestor'].includes(perms.nivel)) {
      throw new Error('Permissão insuficiente.');
    }
    return CatalogoEngine.editar(id, campos || {}, email);
  }, 'ctrl_catalogo_editar');
}

function ctrl_catalogo_verificar_disponibilidade(catalogoId, quantidade, dataInicio, dataFim, emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return CatalogoEngine.verificarDisponibilidadeFisica(catalogoId, quantidade, dataInicio, dataFim);
  }, 'ctrl_catalogo_verificar_disponibilidade');
}

function ctrl_catalogo_inicializar_padrao(emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var perms = obterPermissoesUsuario(email);
    if (!perms || perms.nivel !== 'superadmin') throw new Error('Apenas superadmin pode inicializar o catálogo padrão.');
    return CatalogoEngine.inicializarCatalogoPadrao(email);
  }, 'ctrl_catalogo_inicializar_padrao');
}

function ctrl_catalogo_sugerir_alternativas(catalogoId, dataInicio, dataFim, emailFallback) {
  return GasResponse.wrap(function() {
    obterEmailUsuario(emailFallback || '');
    return DisponibilidadeEngine.sugerirAlternativas(catalogoId, dataInicio, dataFim);
  }, 'ctrl_catalogo_sugerir_alternativas');
}

// ═══════════════════════════════════════════════════════════════
// VÍNCULOS COM PROCESSO INSTITUCIONAL
// ═══════════════════════════════════════════════════════════════

function ctrl_sol_vincular_processo(solicitacaoId, processoId, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email)        throw new Error('Usuário não identificado.');
    if (!solicitacaoId) throw new Error('solicitacaoId é obrigatório.');
    if (!processoId)    throw new Error('processoId é obrigatório.');

    var sol = SolicitacaoRepository.obterPorId(solicitacaoId);
    if (!sol) throw new Error('Solicitação não encontrada.');

    sol.processoId   = processoId;
    sol.atualizadoEm = new Date().toISOString();
    SolicitacaoRepository.salvar(sol);

    // Vincula também no lado do processo
    try {
      ProcessoInstitucionalEngine.vincularTarefa(processoId, {
        id:          sol.id,
        titulo:      '[Solicitação] ' + sol.titulo,
        status:      sol.status,
        responsavel: sol.responsavelAprovacao || sol.solicitante,
        prazo:       sol.dataNeeded || ''
      }, email);
    } catch(e) {
      Logger.warn('[ctrl_sol_vincular_processo] Vínculo no processo falhou: ' + e.message);
    }

    return sol;
  }, 'ctrl_sol_vincular_processo');
}
