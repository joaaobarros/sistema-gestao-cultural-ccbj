/**
 * @file backend/controllers/pauta_externa_controller.gs
 * @layer backend/controllers
 * @description Controller oficial do domínio Pauta Externa (Cessão de Pauta).
 *
 * Gerencia o fluxo de solicitações externas de uso de espaços.
 * Usuários externos acessam via formulário público (doGet ?secao=pauta).
 * Internamente, a equipe CCBJ analisa, aprova/indefere e comunica o solicitante.
 *
 * FUNÇÕES PÚBLICAS (sem autenticação):
 *   ctrl_pauta_receber()     — recebe via formulário externo
 *   ctrl_pauta_consultar()   — consulta pública por protocolo
 *
 * FUNÇÕES INTERNAS (requerem autenticação):
 *   ctrl_pauta_listar()
 *   ctrl_pauta_aprovar()
 *   ctrl_pauta_indeferir()
 *   ctrl_pauta_solicitar_ajuste()
 *   etc.
 *
 * @depends shared/response.gs (GasResponse)
 * @depends modules/pauta_externa/pauta_externa_engine.gs
 * @depends modules/pauta_externa/pauta_externa_repository.gs
 */

// ═══════════════════════════════════════════════════════════════
// ACESSO PÚBLICO (sem login — via formulário externo)
// ═══════════════════════════════════════════════════════════════

/**
 * Recebe solicitação de pauta de usuário externo.
 * NÃO requer autenticação. Chamado via formulário público.
 */
function ctrl_pauta_receber(dados) {
  return GasResponse.wrap(function() {
    if (!dados) throw new Error('Dados da solicitação são obrigatórios.');

    var resultado = PautaExternaEngine.receberSolicitacao(dados);

    Logger.info('[ctrl_pauta_receber] Nova pauta: ' + resultado.protocolo);

    // Notificar equipe interna
    try {
      _notificarEquipeInternaNovapauta(resultado.protocolo, dados);
    } catch(e) {
      Logger.warn('[ctrl_pauta_receber] Notificação interna falhou: ' + e.message);
    }

    return resultado;
  }, 'ctrl_pauta_receber');
}

/**
 * Consulta pública de acompanhamento por protocolo.
 * NÃO requer autenticação.
 */
function ctrl_pauta_consultar_publico(protocolo, emailSolicitante) {
  return GasResponse.wrap(function() {
    if (!protocolo) throw new Error('Protocolo é obrigatório.');
    return PautaExternaEngine.consultarPublico(protocolo, emailSolicitante || '');
  }, 'ctrl_pauta_consultar_publico');
}

// ═══════════════════════════════════════════════════════════════
// LEITURA INTERNA
// ═══════════════════════════════════════════════════════════════

function ctrl_pauta_listar(filtros, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    return PautaExternaRepository.listarComFiltros(filtros || {});
  }, 'ctrl_pauta_listar');
}

function ctrl_pauta_obter(id, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    if (!id)    throw new Error('ID é obrigatório.');

    var pauta = PautaExternaRepository.obterPorId(id);
    if (!pauta) throw new Error('Pauta não encontrada: ' + id);
    return pauta;
  }, 'ctrl_pauta_obter');
}

function ctrl_pauta_dashboard(emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    return PautaExternaRepository.obterDashboard();
  }, 'ctrl_pauta_dashboard');
}

// ═══════════════════════════════════════════════════════════════
// ESCRITA INTERNA (fluxo de análise)
// ═══════════════════════════════════════════════════════════════

function ctrl_pauta_iniciar_analise(id, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    if (!id)    throw new Error('ID é obrigatório.');

    var pauta = PautaExternaEngine.mudarStatus(id, 'em_analise', 'Análise iniciada', email);

    AuditoriaService.registrar('INICIAR_ANALISE', 'pauta_externa', id, {
      protocolo: pauta.protocolo
    }, email);

    return pauta;
  }, 'ctrl_pauta_iniciar_analise');
}

function ctrl_pauta_aprovar(id, parecer, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    if (!id)    throw new Error('ID é obrigatório.');

    var pauta = PautaExternaEngine.aprovar(id, parecer || 'Aprovada', email);

    AuditoriaService.registrar('APROVAR', 'pauta_externa', id, {
      protocolo: pauta.protocolo, parecer: parecer
    }, email);

    // Vincular ao processo institucional se houver
    try {
      if (pauta.processoId) {
        ProcessoInstitucionalEngine.vincularComunicacao(pauta.processoId, {
          id:    pauta.id,
          titulo: 'Pauta externa aprovada: ' + pauta.proposta.titulo,
          tipo:  'pauta_externa',
          status: pauta.status,
          responsavel: email
        }, email);
      }
    } catch(e) {
      Logger.warn('[ctrl_pauta_aprovar] Vínculo com processo falhou: ' + e.message);
    }

    return pauta;
  }, 'ctrl_pauta_aprovar');
}

function ctrl_pauta_indeferir(id, motivo, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    if (!id)    throw new Error('ID é obrigatório.');
    if (!motivo) throw new Error('Motivo do indeferimento é obrigatório.');

    var pauta = PautaExternaEngine.indeferir(id, motivo, email);

    AuditoriaService.registrar('INDEFERIR', 'pauta_externa', id, {
      protocolo: pauta.protocolo, motivo: motivo
    }, email);

    return pauta;
  }, 'ctrl_pauta_indeferir');
}

function ctrl_pauta_solicitar_ajuste(id, orientacoes, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email)       throw new Error('Usuário não identificado.');
    if (!id)          throw new Error('ID é obrigatório.');
    if (!orientacoes) throw new Error('Orientações são obrigatórias.');
    return PautaExternaEngine.solicitarAjuste(id, orientacoes, email);
  }, 'ctrl_pauta_solicitar_ajuste');
}

function ctrl_pauta_mudar_status(id, novoStatus, motivo, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email)     throw new Error('Usuário não identificado.');
    if (!id)        throw new Error('ID é obrigatório.');
    if (!novoStatus) throw new Error('Status é obrigatório.');

    var pauta = PautaExternaEngine.mudarStatus(id, novoStatus, motivo || '', email);

    AuditoriaService.registrar('STATUS', 'pauta_externa', id, {
      protocolo: pauta.protocolo, novoStatus: novoStatus, motivo: motivo
    }, email);

    return pauta;
  }, 'ctrl_pauta_mudar_status');
}

function ctrl_pauta_observacao_interna(id, texto, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email) throw new Error('Usuário não identificado.');
    if (!id)    throw new Error('ID é obrigatório.');
    if (!texto) throw new Error('Texto é obrigatório.');
    return PautaExternaEngine.adicionarObservacaoInterna(id, texto, email);
  }, 'ctrl_pauta_observacao_interna');
}

function ctrl_pauta_vincular_processo(pautaId, processoId, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    if (!email)    throw new Error('Usuário não identificado.');
    if (!pautaId)  throw new Error('pautaId é obrigatório.');
    if (!processoId) throw new Error('processoId é obrigatório.');

    var pauta = PautaExternaRepository.obterPorId(pautaId);
    if (!pauta) throw new Error('Pauta não encontrada.');

    pauta.processoId   = processoId;
    pauta.atualizadoEm = new Date().toISOString();
    PautaExternaRepository.salvar(pauta);

    return pauta;
  }, 'ctrl_pauta_vincular_processo');
}

// ═══════════════════════════════════════════════════════════════
// HELPERS INTERNOS
// ═══════════════════════════════════════════════════════════════

function _notificarEquipeInternaNovapauta(protocolo, dados) {
  var cfg = getOrgConfig();
  try {
    var abaAdmins = _getSheet('Administradores');
    if (!abaAdmins || abaAdmins.getLastRow() < 2) return;

    var admins = abaAdmins
      .getRange(2, 1, abaAdmins.getLastRow() - 1, 1)
      .getValues()
      .map(function(l) { return String(l[0]).trim(); })
      .filter(function(e) { return e.includes('@'); });

    if (!admins.length) return;

    var solicitante = (dados.solicitante && dados.solicitante.nome) ? dados.solicitante.nome : 'Externo';
    var proposta    = (dados.proposta && dados.proposta.titulo) ? dados.proposta.titulo : 'Sem título';

    GmailApp.sendEmail(
      admins.join(','),
      '[' + cfg.nome + '] Nova Solicitação de Pauta — ' + protocolo,
      'Uma nova solicitação de cessão de pauta foi recebida:\n\n' +
      'Protocolo: ' + protocolo + '\n' +
      'Solicitante: ' + solicitante + '\n' +
      'Proposta: ' + proposta + '\n\n' +
      'Acesse o sistema para analisar a solicitação.\n\n— Sistema ' + cfg.nome
    );
  } catch(e) {
    Logger.warn('[_notificarEquipeInternaNovapauta] ' + e.message);
  }
}
