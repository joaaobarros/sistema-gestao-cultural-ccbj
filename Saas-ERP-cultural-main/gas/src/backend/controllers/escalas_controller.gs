/**
 * @file backend/controllers/escalas_controller.gs
 * @layer controllers
 * @description Controller HTTP do Sistema de Escalas e Agendas Operacionais.
 *
 * Convenção de permissão:
 *   usuario   — vê apenas suas próprias escalas/trocas
 *   gestor    — vê e edita escalas do próprio setor
 *   rh/admin/superadmin — acesso total
 *
 * @depends EscalasEngine, GasResponse, obterEmailUsuario, verificarPermissao
 */

// ── Helpers privados ────────────────────────────────────────────────

function _ctrlEscNivel(email) {
  try {
    if (typeof verificarPermissao === 'function') {
      if (verificarPermissao('superadmin', email)) return 'superadmin';
      if (verificarPermissao('admin',      email)) return 'admin';
      if (verificarPermissao('rh',         email)) return 'rh';
      if (verificarPermissao('gestor',     email)) return 'gestor';
    }
  } catch (_) {}
  return 'usuario';
}

function _ctrlEscIdColaborador(email) {
  var emailNorm = (email || '').toLowerCase().trim();
  if (!emailNorm) return null;
  var lista = readJSON('funcionarios.json') || [];
  for (var i = 0; i < lista.length; i++) {
    var f = lista[i];
    var eInst = (f.emailInstitucional || '').toLowerCase().trim();
    var ePess = (f.emailPessoal || f.email || '').toLowerCase().trim();
    if (eInst === emailNorm || ePess === emailNorm) return f.id;
  }
  return null;
}

function _ctrlEscIsGestor(nivel) {
  return nivel === 'superadmin' || nivel === 'admin' || nivel === 'rh' || nivel === 'gestor';
}

function _ctrlEscIsRhAdmin(nivel) {
  return nivel === 'superadmin' || nivel === 'admin' || nivel === 'rh';
}

// ═══════════════════════════════════════════════════════════════════
// ESCALAS — CONSULTA
// ═══════════════════════════════════════════════════════════════════

function ctrl_escalas_listar(filtros, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlEscNivel(email);
    var f = filtros || {};
    if (nivel === 'usuario') {
      var idColab = _ctrlEscIdColaborador(email);
      if (!idColab) throw new Error('Colaborador não encontrado no cadastro.');
      f.idColaborador = idColab;
      f.status = f.status || 'publicada';
    }
    return EscalasEngine.listarEscalas(f);
  }, 'ctrl_escalas_listar');
}

function ctrl_escalas_obter(id, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID da escala é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlEscNivel(email);
    var escala = EscalasEngine.obterEscala(id);
    if (!escala) throw new Error('Escala não encontrada.');
    if (nivel === 'usuario') {
      var idColab = _ctrlEscIdColaborador(email);
      var participaOuPublicada = escala.status === 'publicada' &&
        (escala.turnos || []).some(function(t) { return t.idColaborador === idColab; });
      if (!participaOuPublicada) throw new Error('Acesso negado.');
    }
    return escala;
  }, 'ctrl_escalas_obter');
}

function ctrl_escalas_minha(mes, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var idColab = _ctrlEscIdColaborador(email);
    if (!idColab) throw new Error('Colaborador não encontrado no cadastro.');
    return EscalasEngine.minhaEscala(idColab, mes || null);
  }, 'ctrl_escalas_minha');
}

// ═══════════════════════════════════════════════════════════════════
// ESCALAS — GESTÃO (gestor / RH / admin)
// ═══════════════════════════════════════════════════════════════════

function ctrl_escalas_criar(dados, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlEscNivel(email);
    if (!_ctrlEscIsGestor(nivel)) throw new Error('Apenas gestores e RH podem criar escalas.');
    if (!dados || !dados.nome)    throw new Error('Nome da escala é obrigatório.');
    return EscalasEngine.criarEscala(dados, email);
  }, 'ctrl_escalas_criar');
}

function ctrl_escalas_atualizar(id, dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID da escala é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlEscNivel(email);
    if (!_ctrlEscIsGestor(nivel)) throw new Error('Apenas gestores e RH podem editar escalas.');
    return EscalasEngine.atualizarEscala(id, dados, email);
  }, 'ctrl_escalas_atualizar');
}

function ctrl_escalas_publicar(id, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID da escala é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlEscNivel(email);
    if (!_ctrlEscIsGestor(nivel)) throw new Error('Apenas gestores e RH podem publicar escalas.');
    return EscalasEngine.publicarEscala(id, email);
  }, 'ctrl_escalas_publicar');
}

function ctrl_escalas_cancelar(id, motivo, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID da escala é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlEscNivel(email);
    if (!_ctrlEscIsRhAdmin(nivel)) throw new Error('Apenas RH e admins podem cancelar escalas.');
    return EscalasEngine.cancelarEscala(id, motivo || '', email);
  }, 'ctrl_escalas_cancelar');
}

function ctrl_escalas_arquivar(id, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID da escala é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlEscNivel(email);
    if (!_ctrlEscIsRhAdmin(nivel)) throw new Error('Apenas RH e admins podem arquivar escalas.');
    return EscalasEngine.arquivarEscala(id, email);
  }, 'ctrl_escalas_arquivar');
}

function ctrl_escalas_excluir(id, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID da escala é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlEscNivel(email);
    if (!_ctrlEscIsRhAdmin(nivel)) throw new Error('Apenas RH e admins podem excluir escalas.');
    EscalasEngine.excluirEscala(id, email);
    return { ok: true };
  }, 'ctrl_escalas_excluir');
}

// ═══════════════════════════════════════════════════════════════════
// TURNOS
// ═══════════════════════════════════════════════════════════════════

function ctrl_escalas_adicionar_turno(idEscala, turno, emailFallback) {
  return GasResponse.wrap(function() {
    if (!idEscala) throw new Error('ID da escala é obrigatório.');
    if (!turno)    throw new Error('Dados do turno são obrigatórios.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlEscNivel(email);
    if (!_ctrlEscIsGestor(nivel)) throw new Error('Apenas gestores e RH podem adicionar turnos.');
    return EscalasEngine.adicionarTurno(idEscala, turno, email);
  }, 'ctrl_escalas_adicionar_turno');
}

function ctrl_escalas_atualizar_turno(idEscala, idTurno, dados, emailFallback) {
  return GasResponse.wrap(function() {
    if (!idEscala || !idTurno) throw new Error('IDs de escala e turno são obrigatórios.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlEscNivel(email);
    if (!_ctrlEscIsGestor(nivel)) throw new Error('Apenas gestores e RH podem editar turnos.');
    return EscalasEngine.atualizarTurno(idEscala, idTurno, dados, email);
  }, 'ctrl_escalas_atualizar_turno');
}

function ctrl_escalas_excluir_turno(idEscala, idTurno, emailFallback) {
  return GasResponse.wrap(function() {
    if (!idEscala || !idTurno) throw new Error('IDs de escala e turno são obrigatórios.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlEscNivel(email);
    if (!_ctrlEscIsGestor(nivel)) throw new Error('Apenas gestores e RH podem excluir turnos.');
    EscalasEngine.excluirTurno(idEscala, idTurno, email);
    return { ok: true };
  }, 'ctrl_escalas_excluir_turno');
}

// ═══════════════════════════════════════════════════════════════════
// TROCAS DE TURNO
// ═══════════════════════════════════════════════════════════════════

function ctrl_escalas_listar_trocas(filtros, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlEscNivel(email);
    var f = filtros || {};
    if (nivel === 'usuario') {
      var idColab = _ctrlEscIdColaborador(email);
      if (!idColab) throw new Error('Colaborador não encontrado no cadastro.');
      f.idColaborador = idColab;
    }
    return EscalasEngine.listarTrocas(f);
  }, 'ctrl_escalas_listar_trocas');
}

function ctrl_escalas_solicitar_troca(dados, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var idColab = _ctrlEscIdColaborador(email);
    if (!idColab) throw new Error('Colaborador não encontrado no cadastro.');
    if (!dados || !dados.idEscala || !dados.idTurno || !dados.idSubstituto)
      throw new Error('idEscala, idTurno e idSubstituto são obrigatórios.');
    dados.idSolicitante = idColab;
    return EscalasEngine.solicitarTroca(dados, email);
  }, 'ctrl_escalas_solicitar_troca');
}

function ctrl_escalas_responder_troca(idTroca, aceitar, motivo, emailFallback) {
  return GasResponse.wrap(function() {
    if (!idTroca) throw new Error('ID da troca é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    var idColab = _ctrlEscIdColaborador(email);
    return EscalasEngine.responderTroca(idTroca, aceitar, motivo || '', idColab, email);
  }, 'ctrl_escalas_responder_troca');
}

function ctrl_escalas_aprovar_troca(idTroca, aprovar, motivo, emailFallback) {
  return GasResponse.wrap(function() {
    if (!idTroca) throw new Error('ID da troca é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlEscNivel(email);
    if (!_ctrlEscIsGestor(nivel)) throw new Error('Apenas gestores e RH podem aprovar trocas.');
    return EscalasEngine.aprovarTroca(idTroca, aprovar, motivo || '', email);
  }, 'ctrl_escalas_aprovar_troca');
}

function ctrl_escalas_cancelar_troca(idTroca, emailFallback) {
  return GasResponse.wrap(function() {
    if (!idTroca) throw new Error('ID da troca é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    var idColab = _ctrlEscIdColaborador(email);
    var nivel   = _ctrlEscNivel(email);
    return EscalasEngine.cancelarTroca(idTroca, idColab, nivel, email);
  }, 'ctrl_escalas_cancelar_troca');
}

// ═══════════════════════════════════════════════════════════════════
// IMPORTAÇÃO / EXPORTAÇÃO
// ═══════════════════════════════════════════════════════════════════

function ctrl_escalas_importar_colabore(csvTexto, opcoes, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlEscNivel(email);
    if (!_ctrlEscIsRhAdmin(nivel)) throw new Error('Apenas RH e admins podem importar escalas.');
    if (!csvTexto) throw new Error('Texto CSV é obrigatório.');
    return EscalasEngine.importarColabore(csvTexto, opcoes || {}, email);
  }, 'ctrl_escalas_importar_colabore');
}

function ctrl_escalas_exportar(id, formato, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID da escala é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlEscNivel(email);
    if (!_ctrlEscIsGestor(nivel)) throw new Error('Apenas gestores e RH podem exportar escalas.');
    return EscalasEngine.exportarEscala(id, formato || 'colabore');
  }, 'ctrl_escalas_exportar');
}

function ctrl_escalas_listar_logs(emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlEscNivel(email);
    if (!_ctrlEscIsRhAdmin(nivel)) throw new Error('Apenas RH e admins podem ver logs de importação.');
    return EscalasRepository.listarLogs();
  }, 'ctrl_escalas_listar_logs');
}

// ═══════════════════════════════════════════════════════════════════
// GOOGLE CALENDAR SYNC
// ═══════════════════════════════════════════════════════════════════

function ctrl_escalas_sincronizar_calendar(id, emailFallback) {
  return GasResponse.wrap(function() {
    if (!id) throw new Error('ID da escala é obrigatório.');
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlEscNivel(email);
    if (!_ctrlEscIsGestor(nivel)) throw new Error('Apenas gestores e RH podem sincronizar com Calendar.');
    return EscalasEngine.sincronizarCalendar(id, email);
  }, 'ctrl_escalas_sincronizar_calendar');
}

// ═══════════════════════════════════════════════════════════════════
// UTILITÁRIOS
// ═══════════════════════════════════════════════════════════════════

function ctrl_escalas_verificar_conflito(dados, emailFallback) {
  return GasResponse.wrap(function() {
    var email = obterEmailUsuario(emailFallback || '');
    var nivel = _ctrlEscNivel(email);
    if (!_ctrlEscIsGestor(nivel)) throw new Error('Acesso negado.');
    if (!dados || !dados.idColaborador || !dados.dataInicio || !dados.horaInicio || !dados.horaFim)
      throw new Error('idColaborador, dataInicio, horaInicio e horaFim são obrigatórios.');
    return EscalasEngine.verificarConflito(dados);
  }, 'ctrl_escalas_verificar_conflito');
}
