/**
 * @file modules/admin/rollback_service.gs
 * @layer modules/admin
 * @description Desfaz ações registradas na aba Logs (superadmin only).
 *
 * Suporta reversão de EDIÇÃO (restaura estado anterior), EXCLUSÃO (re-insere linha)
 * e CRIAÇÃO/AGENDAMENTO (remove o registro criado). Tipos não reversíveis lançam erro.
 *
 * @depends core/utils.gs (_getSheet, registrarLog, limparCacheUsuario, verificarPermissao),
 *          LockService
 */

var RollbackService = (function () {

  function _executar(log, emailAtual, refExtra) {
    var acao      = String(log[2] || '').toUpperCase();
    var tipo      = String(log[3] || '').toUpperCase();
    var alvo      = String(log[4] || '');
    var antesRaw  = String(log[6] || '').trim();
    var depoisRaw = String(log[7] || '').trim();

    var parsear = function(raw) {
      if (!raw || raw === '') return null;
      return raw.split(' | ').map(function(v) { return v === '-' ? '' : v; });
    };

    var dadosAntes  = parsear(antesRaw);
    var dadosDepois = parsear(depoisRaw);

    var mapaAbas = {
      RESERVA: 'Reservas', ESPACO: 'Configuracoes', 'ESPAÇO': 'Configuracoes',
      ITEM: 'Itens', ADMIN: 'Administradores', USUARIO: 'Administradores',
      SETOR: 'Listas', RECE: 'ReservasRECE'
    };

    var abaNome = mapaAbas[tipo];
    if (!abaNome) throw new Error('Tipo desconhecido para rollback: ' + tipo);

    var aba = _getSheet(abaNome);
    if (!aba) throw new Error('Aba não encontrada: ' + abaNome);

    var ref = refExtra ? ' ' + refExtra : '';

    if (acao.includes('EXCLUSÃO')) {
      if (!dadosAntes) throw new Error('Sem dados anteriores para restaurar.');
      aba.appendRow(dadosAntes);
      registrarLog('ROLLBACK', tipo, alvo, 'Restauração após exclusão.' + ref, null, dadosAntes, emailAtual);

    } else if (acao.includes('EDIÇÃO')) {
      if (!dadosAntes) throw new Error('Sem dados anteriores para reverter.');
      var idE = String(dadosAntes[0]).trim();
      var regsE = aba.getDataRange().getValues();
      var revertido = false;
      for (var i = 1; i < regsE.length; i++) {
        if (String(regsE[i][0]).trim() === idE) {
          aba.getRange(i + 1, 1, 1, dadosAntes.length).setValues([dadosAntes]);
          revertido = true;
          break;
        }
      }
      if (!revertido) throw new Error('Registro não encontrado: ' + idE);
      registrarLog('ROLLBACK', tipo, alvo, 'Reversão de edição.' + ref, dadosDepois, dadosAntes, emailAtual);

    } else if (acao.includes('CRIAÇÃO') || acao.includes('AGENDAMENTO')) {
      if (!dadosDepois) throw new Error('Sem dados do registro criado.');
      var idC = String(dadosDepois[0]).trim();
      var regsC = aba.getDataRange().getValues();
      var removido = false;
      for (var j = 1; j < regsC.length; j++) {
        if (String(regsC[j][0]).trim() === idC) {
          aba.deleteRow(j + 1);
          removido = true;
          break;
        }
      }
      if (!removido) throw new Error('Registro não encontrado: ' + idC);
      registrarLog('ROLLBACK', tipo, alvo, 'Remoção após criação.' + ref, dadosDepois, null, emailAtual);

    } else {
      throw new Error("Ação '" + acao + "' não é reversível.");
    }

    limparCacheUsuario(emailAtual);
    return { success: true };
  }

  function porIndice(emailAtual, indiceLog) {
    verificarPermissao('superadmin', emailAtual);
    var lock = LockService.getScriptLock();
    lock.waitLock(5000);
    try {
      var abaLogs = _getSheet('Logs');
      if (!abaLogs || abaLogs.getLastRow() < 2) throw new Error('Nenhum log disponível.');
      var linhaAlvo = abaLogs.getLastRow() - indiceLog;
      if (linhaAlvo < 2) throw new Error('Índice de log inválido.');
      var log = abaLogs.getRange(linhaAlvo, 1, 1, 8).getValues()[0];
      return _executar(log, emailAtual);
    } catch (e) {
      throw new Error('Erro no rollback: ' + e.message);
    } finally {
      lock.releaseLock();
    }
  }

  function porTimestamp(emailAtual, timestampStr) {
    verificarPermissao('superadmin', emailAtual);
    if (!timestampStr || String(timestampStr).trim() === '')
      throw new Error('Timestamp inválido para rollback.');
    var lock = LockService.getScriptLock();
    lock.waitLock(5000);
    try {
      var abaLogs = _getSheet('Logs');
      if (!abaLogs || abaLogs.getLastRow() < 2) throw new Error('Nenhum log disponível.');
      var dados = abaLogs.getRange(2, 1, abaLogs.getLastRow() - 1, 8).getDisplayValues();
      var linhaAlvo = -1;
      for (var i = 0; i < dados.length; i++) {
        if (String(dados[i][0]).trim() === String(timestampStr).trim()) {
          linhaAlvo = i;
          break;
        }
      }
      if (linhaAlvo === -1) throw new Error('Entrada de log não encontrada: ' + timestampStr);
      return _executar(dados[linhaAlvo], emailAtual, 'Ref: ' + timestampStr);
    } catch (e) {
      throw new Error('Erro no rollback: ' + e.message);
    } finally {
      lock.releaseLock();
    }
  }

  return {
    porIndice:    porIndice,
    porTimestamp: porTimestamp
  };

})();
