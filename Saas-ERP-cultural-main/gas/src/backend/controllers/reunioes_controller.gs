/**
 * @file backend/controllers/reunioes_controller.gs
 * @layer backend/controllers
 * @description Fachada pública do módulo Reuniões.
 *              Todas as funções ctrl_reunioes_* são os únicos pontos de entrada do frontend.
 *              Cada função: obtém contexto de sessão, delega ao ReunioesEngine, retorna GasResponse.
 *
 * @depends modules/reunioes/reuniao_engine.gs    (ReunioesEngine)
 * @depends modules/reunioes/reuniao_repository.gs (ReunioesRepository)
 * @depends core/services/permissoes_service.gs   (PermissoesService)
 * @depends shared/response.gs                    (GasResponse)
 */

// ── Helper de contexto ───────────────────────────────────────────────────────

function _ctrlReunioesObterContexto(emailFallback) {
  var email = obterEmailUsuario(emailFallback || '');
  var nivel = _resolverNivelAcesso(email);
  return { email: email, nivel: nivel };
}

// ── Listagem e consulta ──────────────────────────────────────────────────────

/**
 * Lista reuniões visíveis para o usuário logado.
 * Superadmin/admin/gestor veem todas. Demais: apenas em que participam.
 */
function ctrl_reunioes_listar(filtros, emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    var reunioes = ReunioesRepository.listarReunioesParaUsuario(ctx.email, ctx.nivel);

    var f = filtros || {};
    if (f.status)   reunioes = reunioes.filter(function(r) { return r.status === f.status; });
    if (f.tipo)     reunioes = reunioes.filter(function(r) { return r.tipo === f.tipo; });
    if (f.mes)      reunioes = reunioes.filter(function(r) { return r.data && r.data.startsWith(f.mes); });
    if (f.busca) {
      var q = f.busca.toLowerCase();
      reunioes = reunioes.filter(function(r) {
        return (r.titulo || '').toLowerCase().indexOf(q) !== -1 ||
               (r.local  || '').toLowerCase().indexOf(q) !== -1;
      });
    }

    // Ordenar por data desc
    reunioes.sort(function(a, b) { return b.data > a.data ? 1 : -1; });

    return GasResponse.ok({ reunioes: reunioes, nivel: ctx.nivel });
  } catch(e) {
    Logger.error('[ctrl_reunioes_listar] ' + e.message);
    return GasResponse.error(e.message);
  }
}

/** Obtém uma reunião por ID com verificação de acesso. */
function ctrl_reunioes_obter(id, emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    var reuniao = ReunioesRepository.obterReuniaoPorId(id);
    if (!reuniao) return GasResponse.error('Reunião não encontrada.', 'NOT_FOUND');

    var NIVEIS_AMPLOS = ['superadmin', 'admin', 'gestor'];
    var podeVer = NIVEIS_AMPLOS.indexOf(ctx.nivel) !== -1 ||
                  reuniao.organizador === ctx.email ||
                  (reuniao.participantes || []).indexOf(ctx.email) !== -1 ||
                  reuniao.criadoPor === ctx.email;
    if (!podeVer) return GasResponse.error('Acesso negado a esta reunião.', 'FORBIDDEN');

    var encaminhamentos = ReunioesRepository.listarEncaminhamentosPorReuniao(id);
    return GasResponse.ok({ reuniao: reuniao, encaminhamentos: encaminhamentos, nivel: ctx.nivel });
  } catch(e) {
    Logger.error('[ctrl_reunioes_obter] ' + e.message);
    return GasResponse.error(e.message);
  }
}

/** Cria uma nova reunião. */
function ctrl_reunioes_criar(dados, emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    var reuniao = ReunioesEngine.criar(dados, ctx.email);
    return GasResponse.ok(reuniao);
  } catch(e) {
    Logger.error('[ctrl_reunioes_criar] ' + e.message);
    return GasResponse.error(e.message);
  }
}

/** Atualiza uma reunião existente. */
function ctrl_reunioes_atualizar(id, dados, emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    var reuniao = ReunioesRepository.obterReuniaoPorId(id);
    if (!reuniao) return GasResponse.error('Reunião não encontrada.', 'NOT_FOUND');

    var NIVEIS_AMPLOS = ['superadmin', 'admin', 'gestor'];
    var podeEditar = NIVEIS_AMPLOS.indexOf(ctx.nivel) !== -1 ||
                     reuniao.organizador === ctx.email ||
                     reuniao.criadoPor   === ctx.email;
    if (!podeEditar) return GasResponse.error('Sem permissão para editar esta reunião.', 'FORBIDDEN');

    var atualizada = ReunioesEngine.atualizar(id, dados, ctx.email);
    return GasResponse.ok(atualizada);
  } catch(e) {
    Logger.error('[ctrl_reunioes_atualizar] ' + e.message);
    return GasResponse.error(e.message);
  }
}

/** Aplica transição de status (FSM) a uma reunião. */
function ctrl_reunioes_transicao(id, novoStatus, contexto, emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    var reuniao = ReunioesRepository.obterReuniaoPorId(id);
    if (!reuniao) return GasResponse.error('Reunião não encontrada.', 'NOT_FOUND');

    var NIVEIS_AMPLOS = ['superadmin', 'admin', 'gestor'];
    var podeTransitar = NIVEIS_AMPLOS.indexOf(ctx.nivel) !== -1 ||
                        reuniao.organizador === ctx.email;
    if (!podeTransitar) return GasResponse.error('Sem permissão para alterar status desta reunião.', 'FORBIDDEN');

    var atualizada = ReunioesEngine.aplicarTransicao(id, novoStatus, ctx.email, contexto);
    return GasResponse.ok(atualizada);
  } catch(e) {
    Logger.error('[ctrl_reunioes_transicao] ' + e.message);
    return GasResponse.error(e.message);
  }
}

/** Exclui uma reunião (apenas admin/superadmin). */
function ctrl_reunioes_excluir(id, emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    var NIVEIS_ADMIN = ['superadmin', 'admin'];
    if (NIVEIS_ADMIN.indexOf(ctx.nivel) === -1) {
      return GasResponse.error('Somente administradores podem excluir reuniões.', 'FORBIDDEN');
    }
    ReunioesRepository.excluirReuniao(id);
    return GasResponse.ok({ excluido: true });
  } catch(e) {
    Logger.error('[ctrl_reunioes_excluir] ' + e.message);
    return GasResponse.error(e.message);
  }
}

// ── Ata ──────────────────────────────────────────────────────────────────────

/** Salva rascunho da ata. */
function ctrl_reunioes_salvar_ata(id, dadosAta, emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    var reuniao = ReunioesRepository.obterReuniaoPorId(id);
    if (!reuniao) return GasResponse.error('Reunião não encontrada.', 'NOT_FOUND');

    var NIVEIS_AMPLOS = ['superadmin', 'admin', 'gestor'];
    var podeEditar = NIVEIS_AMPLOS.indexOf(ctx.nivel) !== -1 ||
                     reuniao.organizador === ctx.email ||
                     reuniao.criadoPor   === ctx.email ||
                     (reuniao.participantes || []).indexOf(ctx.email) !== -1;
    if (!podeEditar) return GasResponse.error('Sem permissão para editar ata.', 'FORBIDDEN');

    var atualizada = ReunioesEngine.salvarAta(id, dadosAta, ctx.email);
    return GasResponse.ok(atualizada);
  } catch(e) {
    Logger.error('[ctrl_reunioes_salvar_ata] ' + e.message);
    return GasResponse.error(e.message);
  }
}

/** Registra aprovação/rejeição da ata por um aprovador. */
function ctrl_reunioes_aprovar_ata(id, aprovado, emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    var atualizada = ReunioesEngine.aprovarAta(id, ctx.email, aprovado !== false);
    return GasResponse.ok(atualizada);
  } catch(e) {
    Logger.error('[ctrl_reunioes_aprovar_ata] ' + e.message);
    return GasResponse.error(e.message);
  }
}

/** Registra lista de presença. */
function ctrl_reunioes_registrar_presenca(id, presentes, ausentes, emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    var atualizada = ReunioesEngine.registrarPresenca(id, presentes, ausentes, ctx.email);
    return GasResponse.ok(atualizada);
  } catch(e) {
    Logger.error('[ctrl_reunioes_registrar_presenca] ' + e.message);
    return GasResponse.error(e.message);
  }
}

/** Atualiza item de pauta (status, notas, tempo real). */
function ctrl_reunioes_atualizar_pauta(reuniaoId, itemId, dadosItem, emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    var atualizada = ReunioesEngine.atualizarItemPauta(reuniaoId, itemId, dadosItem, ctx.email);
    return GasResponse.ok(atualizada);
  } catch(e) {
    Logger.error('[ctrl_reunioes_atualizar_pauta] ' + e.message);
    return GasResponse.error(e.message);
  }
}

// ── Encaminhamentos ──────────────────────────────────────────────────────────

/** Lista todos os encaminhamentos visíveis para o usuário. */
function ctrl_reunioes_listar_encaminhamentos(filtros, emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    var encaminhamentos = ReunioesRepository.listarEncaminhamentosComFiltros(
      filtros || {}, ctx.email, ctx.nivel
    );
    return GasResponse.ok({ encaminhamentos: encaminhamentos, nivel: ctx.nivel });
  } catch(e) {
    Logger.error('[ctrl_reunioes_listar_encaminhamentos] ' + e.message);
    return GasResponse.error(e.message);
  }
}

/** Cria um encaminhamento vinculado a uma reunião. */
function ctrl_reunioes_criar_encaminhamento(reuniaoId, dados, emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    var enc = ReunioesEngine.criarEncaminhamento(reuniaoId, dados, ctx.email);
    return GasResponse.ok(enc);
  } catch(e) {
    Logger.error('[ctrl_reunioes_criar_encaminhamento] ' + e.message);
    return GasResponse.error(e.message);
  }
}

/** Atualiza dados de um encaminhamento. */
function ctrl_reunioes_atualizar_encaminhamento(id, dados, emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    var enc = ReunioesRepository.obterEncaminhamentoPorId(id);
    if (!enc) return GasResponse.error('Encaminhamento não encontrado.', 'NOT_FOUND');

    var NIVEIS_AMPLOS = ['superadmin', 'admin', 'gestor'];
    var podeEditar = NIVEIS_AMPLOS.indexOf(ctx.nivel) !== -1 ||
                     enc.responsavel === ctx.email ||
                     enc.criadoPor   === ctx.email;
    if (!podeEditar) return GasResponse.error('Sem permissão.', 'FORBIDDEN');

    var atualizado = ReunioesEngine.atualizarEncaminhamento(id, dados, ctx.email);
    return GasResponse.ok(atualizado);
  } catch(e) {
    Logger.error('[ctrl_reunioes_atualizar_encaminhamento] ' + e.message);
    return GasResponse.error(e.message);
  }
}

/** Altera status de um encaminhamento (FSM). */
function ctrl_reunioes_transicao_encaminhamento(id, novoStatus, comentario, emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    var enc = ReunioesRepository.obterEncaminhamentoPorId(id);
    if (!enc) return GasResponse.error('Encaminhamento não encontrado.', 'NOT_FOUND');

    var NIVEIS_AMPLOS = ['superadmin', 'admin', 'gestor'];
    var podeTransitar = NIVEIS_AMPLOS.indexOf(ctx.nivel) !== -1 ||
                        enc.responsavel === ctx.email ||
                        enc.criadoPor   === ctx.email;
    if (!podeTransitar) return GasResponse.error('Sem permissão para alterar status.', 'FORBIDDEN');

    var atualizado = ReunioesEngine.aplicarTransicaoEncaminhamento(id, novoStatus, ctx.email, comentario);
    return GasResponse.ok(atualizado);
  } catch(e) {
    Logger.error('[ctrl_reunioes_transicao_encaminhamento] ' + e.message);
    return GasResponse.error(e.message);
  }
}

/** Adiciona comentário a um encaminhamento. */
function ctrl_reunioes_comentar_encaminhamento(id, texto, emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    if (!texto || texto.trim() === '') return GasResponse.error('Comentário não pode estar vazio.');
    var atualizado = ReunioesEngine.adicionarComentario(id, texto.trim(), ctx.email);
    return GasResponse.ok(atualizado);
  } catch(e) {
    Logger.error('[ctrl_reunioes_comentar_encaminhamento] ' + e.message);
    return GasResponse.error(e.message);
  }
}

/** Gera uma tarefa no TarefaEngine a partir de um encaminhamento. */
function ctrl_reunioes_gerar_tarefa(encId, emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    var resultado = ReunioesEngine.gerarTarefaDeEncaminhamento(encId, ctx.email);
    return GasResponse.ok(resultado);
  } catch(e) {
    Logger.error('[ctrl_reunioes_gerar_tarefa] ' + e.message);
    return GasResponse.error(e.message);
  }
}

// ── Participantes / Usuários ─────────────────────────────────────────────────

/** Retorna lista de usuários do sistema para o seletor de participantes. */
function ctrl_reunioes_listar_usuarios(emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    var usuarios = [];
    try {
      usuarios = UsuariosService.listarTodos() || [];
    } catch(e) {
      // fallback: ler da aba Administradores
      var aba = _getSheet('Administradores');
      if (aba && aba.getLastRow() >= 2) {
        var dados = aba.getRange(2, 1, aba.getLastRow() - 1, 2).getValues();
        dados.forEach(function(row) {
          if (row[0]) usuarios.push({ email: row[0], nivel: row[1], nome: row[0].split('@')[0] });
        });
      }
    }
    return GasResponse.ok({ usuarios: usuarios });
  } catch(e) {
    Logger.error('[ctrl_reunioes_listar_usuarios] ' + e.message);
    return GasResponse.error(e.message);
  }
}

// ── Dashboard ────────────────────────────────────────────────────────────────

/** Retorna métricas e dados para o dashboard de reuniões. */
function ctrl_reunioes_dashboard(emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    var dashboard = ReunioesEngine.obterDashboard(ctx.email, ctx.nivel);
    return GasResponse.ok(dashboard);
  } catch(e) {
    Logger.error('[ctrl_reunioes_dashboard] ' + e.message);
    return GasResponse.error(e.message);
  }
}

// ── Trigger de sistema ───────────────────────────────────────────────────────

/**
 * Trigger diário — marca encaminhamentos vencidos como atrasados.
 * Chamar via GAS Time-based Trigger (1x por dia).
 */
function reunioes_verificarAtrasosDiario() {
  try {
    var resultado = ReunioesEngine.verificarAtrasos('sistema');
    Logger.info('[reunioes_verificarAtrasosDiario] Atrasos processados: ' + JSON.stringify(resultado));
  } catch(e) {
    Logger.error('[reunioes_verificarAtrasosDiario] ' + e.message);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SÉRIES / PRESETS
// ════════════════════════════════════════════════════════════════════════════

/** Lista séries visíveis para o usuário. */
function ctrl_reunioes_series_listar(emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    var series = ReunioesSeriesEngine.listarSeries(ctx.email, ctx.nivel);
    return GasResponse.ok({ series: series, nivel: ctx.nivel });
  } catch(e) {
    Logger.error('[ctrl_reunioes_series_listar] ' + e.message);
    return GasResponse.error(e.message);
  }
}

/** Obtém uma série por ID. */
function ctrl_reunioes_series_obter(id, emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    var serie = ReunioesSeriesEngine.obterSerie(id);
    if (!serie) return GasResponse.error('Série não encontrada.', 'NOT_FOUND');
    return GasResponse.ok({ serie: serie, nivel: ctx.nivel });
  } catch(e) {
    Logger.error('[ctrl_reunioes_series_obter] ' + e.message);
    return GasResponse.error(e.message);
  }
}

/** Cria uma nova série/preset. */
function ctrl_reunioes_series_criar(dados, emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    var NIVEIS_AMPLOS = ['superadmin', 'admin', 'gestor'];
    if (NIVEIS_AMPLOS.indexOf(ctx.nivel) === -1) {
      return GasResponse.error('Somente gestores e administradores podem criar séries.', 'FORBIDDEN');
    }
    var serie = ReunioesSeriesEngine.criarSerie(dados, ctx.email);
    return GasResponse.ok(serie);
  } catch(e) {
    Logger.error('[ctrl_reunioes_series_criar] ' + e.message);
    return GasResponse.error(e.message);
  }
}

/** Atualiza uma série existente. */
function ctrl_reunioes_series_atualizar(id, dados, emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    var serie = ReunioesSeriesEngine.obterSerie(id);
    if (!serie) return GasResponse.error('Série não encontrada.', 'NOT_FOUND');
    var NIVEIS_AMPLOS = ['superadmin', 'admin', 'gestor'];
    var podeEditar = NIVEIS_AMPLOS.indexOf(ctx.nivel) !== -1 ||
                     serie.organizadorPadrao === ctx.email ||
                     serie.criadoPor === ctx.email;
    if (!podeEditar) return GasResponse.error('Sem permissão para editar esta série.', 'FORBIDDEN');
    return GasResponse.ok(ReunioesSeriesEngine.atualizarSerie(id, dados, ctx.email));
  } catch(e) {
    Logger.error('[ctrl_reunioes_series_atualizar] ' + e.message);
    return GasResponse.error(e.message);
  }
}

/** Altera status de uma série (ativa/pausada/encerrada). */
function ctrl_reunioes_series_status(id, novoStatus, emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    var NIVEIS_AMPLOS = ['superadmin', 'admin', 'gestor'];
    var serie = ReunioesSeriesEngine.obterSerie(id);
    if (!serie) return GasResponse.error('Série não encontrada.', 'NOT_FOUND');
    var podeEditar = NIVEIS_AMPLOS.indexOf(ctx.nivel) !== -1 || serie.criadoPor === ctx.email;
    if (!podeEditar) return GasResponse.error('Sem permissão.', 'FORBIDDEN');
    return GasResponse.ok(ReunioesSeriesEngine.alterarStatusSerie(id, novoStatus, ctx.email));
  } catch(e) {
    Logger.error('[ctrl_reunioes_series_status] ' + e.message);
    return GasResponse.error(e.message);
  }
}

/** Exclui uma série (apenas admin). */
function ctrl_reunioes_series_excluir(id, emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    var NIVEIS_ADMIN = ['superadmin', 'admin'];
    if (NIVEIS_ADMIN.indexOf(ctx.nivel) === -1) {
      return GasResponse.error('Somente administradores podem excluir séries.', 'FORBIDDEN');
    }
    return GasResponse.ok(ReunioesSeriesEngine.excluirSerie(id, ctx.email));
  } catch(e) {
    Logger.error('[ctrl_reunioes_series_excluir] ' + e.message);
    return GasResponse.error(e.message);
  }
}

/** Cria uma reunião a partir de um preset de série. */
function ctrl_reunioes_criar_de_serie(serieId, dadosEspecificos, emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    var reuniao = ReunioesSeriesEngine.criarReuniaoDeSerie(serieId, dadosEspecificos || {}, ctx.email);
    return GasResponse.ok(reuniao);
  } catch(e) {
    Logger.error('[ctrl_reunioes_criar_de_serie] ' + e.message);
    return GasResponse.error(e.message);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// PAUTA COLABORATIVA
// ════════════════════════════════════════════════════════════════════════════

/** Adiciona item à pauta de uma reunião. */
function ctrl_reunioes_pauta_adicionar(reuniaoId, dados, emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    var reuniao = ReunioesSeriesEngine.adicionarItemPauta(reuniaoId, dados, ctx.email, ctx.nivel);
    return GasResponse.ok(reuniao);
  } catch(e) {
    Logger.error('[ctrl_reunioes_pauta_adicionar] ' + e.message);
    return GasResponse.error(e.message);
  }
}

/** Edita item de pauta. */
function ctrl_reunioes_pauta_editar(reuniaoId, itemId, dados, emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    var reuniao = ReunioesSeriesEngine.editarItemPauta(reuniaoId, itemId, dados, ctx.email, ctx.nivel);
    return GasResponse.ok(reuniao);
  } catch(e) {
    Logger.error('[ctrl_reunioes_pauta_editar] ' + e.message);
    return GasResponse.error(e.message);
  }
}

/** Remove item de pauta (somente antes do início da reunião). */
function ctrl_reunioes_pauta_remover(reuniaoId, itemId, emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    var reuniao = ReunioesSeriesEngine.removerItemPauta(reuniaoId, itemId, ctx.email, ctx.nivel);
    return GasResponse.ok(reuniao);
  } catch(e) {
    Logger.error('[ctrl_reunioes_pauta_remover] ' + e.message);
    return GasResponse.error(e.message);
  }
}

/** Reordena a pauta de uma reunião. novaOrdem: array de ids */
function ctrl_reunioes_pauta_reordenar(reuniaoId, novaOrdem, emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    if (!Array.isArray(novaOrdem) || novaOrdem.length === 0) {
      return GasResponse.error('novaOrdem deve ser um array de IDs.');
    }
    var reuniao = ReunioesSeriesEngine.reordenarPauta(reuniaoId, novaOrdem, ctx.email, ctx.nivel);
    return GasResponse.ok(reuniao);
  } catch(e) {
    Logger.error('[ctrl_reunioes_pauta_reordenar] ' + e.message);
    return GasResponse.error(e.message);
  }
}

/**
 * Marca status final de uma pauta (após início da reunião).
 * statusFinal: nao_debatida | parcialmente_debatida | sem_encaminhamento |
 *              adiada | transferida | pendente_proxima
 */
function ctrl_reunioes_pauta_status_final(reuniaoId, itemId, statusFinal, observacao, emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    var reuniao = ReunioesSeriesEngine.marcarStatusFinalPauta(
      reuniaoId, itemId, statusFinal, observacao || '', ctx.email, ctx.nivel
    );
    return GasResponse.ok(reuniao);
  } catch(e) {
    Logger.error('[ctrl_reunioes_pauta_status_final] ' + e.message);
    return GasResponse.error(e.message);
  }
}

/**
 * Transfere uma pauta de uma reunião para outra.
 * Mantém histórico completo de transferência.
 */
function ctrl_reunioes_pauta_transferir(reuniaoOrigemId, pautaId, reuniaoDestinoId, emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    var reuniao = ReunioesSeriesEngine.transferirPauta(
      reuniaoOrigemId, pautaId, reuniaoDestinoId, ctx.email, ctx.nivel
    );
    return GasResponse.ok(reuniao);
  } catch(e) {
    Logger.error('[ctrl_reunioes_pauta_transferir] ' + e.message);
    return GasResponse.error(e.message);
  }
}

/** Retorna histórico de auditoria de pautas de uma reunião. */
function ctrl_reunioes_pauta_historico(reuniaoId, pautaId, emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    var reuniao = ReunioesRepository.obterReuniaoPorId(reuniaoId);
    if (!reuniao) return GasResponse.error('Reunião não encontrada.', 'NOT_FOUND');
    var NIVEIS_AMPLOS = ['superadmin', 'admin', 'gestor'];
    var podeVer = NIVEIS_AMPLOS.indexOf(ctx.nivel) !== -1 ||
                  reuniao.organizador === ctx.email ||
                  (reuniao.participantes || []).indexOf(ctx.email) !== -1;
    if (!podeVer) return GasResponse.error('Acesso negado.', 'FORBIDDEN');
    var historico = ReunioesSeriesEngine.listarHistoricoPauta(reuniaoId, pautaId || null);
    return GasResponse.ok({ historico: historico });
  } catch(e) {
    Logger.error('[ctrl_reunioes_pauta_historico] ' + e.message);
    return GasResponse.error(e.message);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// INTELIGÊNCIA ORGANIZACIONAL — RECORRÊNCIA E DASHBOARDS
// ════════════════════════════════════════════════════════════════════════════

/** Análise de recorrência temática de uma série. */
function ctrl_reunioes_recorrencia_analisar(serieId, emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    var analise = ReunioesSeriesEngine.analisarRecorrenciaSerial(serieId);
    return GasResponse.ok(analise);
  } catch(e) {
    Logger.error('[ctrl_reunioes_recorrencia_analisar] ' + e.message);
    return GasResponse.error(e.message);
  }
}

/** Dashboard completo de uma série (timeline, métricas, pendências). */
function ctrl_reunioes_dashboard_serie(serieId, emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    var dashboard = ReunioesSeriesEngine.obterDashboardSerie(serieId);
    return GasResponse.ok(dashboard);
  } catch(e) {
    Logger.error('[ctrl_reunioes_dashboard_serie] ' + e.message);
    return GasResponse.error(e.message);
  }
}

/**
 * Contexto IA para pauta de uma reunião.
 * Retorna pautas recorrentes e encaminhamentos pendentes da série — sem inventar dados.
 */
function ctrl_reunioes_contexto_ia(serieId, reuniaoAtualId, emailFallback) {
  try {
    var ctx = _ctrlReunioesObterContexto(emailFallback);
    if (!serieId) return GasResponse.error('serieId é obrigatório.');
    var contexto = ReunioesSeriesEngine.gerarContextoIA(serieId, reuniaoAtualId || null);
    return GasResponse.ok(contexto);
  } catch(e) {
    Logger.error('[ctrl_reunioes_contexto_ia] ' + e.message);
    return GasResponse.error(e.message);
  }
}
