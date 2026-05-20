/**
 * @file modules/auth/cadastro_externo_service.gs
 * @layer modules/auth
 * @description Serviço de aprovação/recusa de cadastros externos.
 *
 * Gerencia o fluxo de auto-cadastro: um usuário externo solicita acesso via
 * solicitarCadastroExterno(), um admin lista, aprova ou recusa pelo painel.
 * Aprovação escreve a credencial em 'CredenciaisUsuarios' e notifica por e-mail.
 *
 * @depends core/utils.gs (_getSheet, obterAdmins),
 *          GmailApp, PropertiesService
 */

var CadastroExternoService = (function () {

  // ── Helpers de e-mail ────────────────────────────────────────────

  function _enviarEmailAprovacao(emailAlvo, nome) {
    try {
      var webAppUrl = '';
      try { webAppUrl = PropertiesService.getScriptProperties().getProperty('WEBAPP_URL') || ''; } catch(e) {}
      var assunto = 'Acesso ao Sistema CCBJ aprovado — Bem-vindo(a)!';
      var corpo = [
        'Olá, ' + nome + '!',
        '',
        'Sua solicitação de acesso ao Sistema de Gestão de Espaços do CCBJ foi aprovada.',
        '',
        'Você já pode fazer login com seu e-mail e a senha que cadastrou.',
        webAppUrl ? 'Acesse: ' + webAppUrl : 'Acesse o sistema pelo link fornecido pelo administrador.',
        '',
        'Se precisar de ajuda, entre em contato com a equipe do CCBJ.',
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        'Centro Cultural Bom Jardim — Sistema de Gestão de Espaços',
        'Este e-mail foi gerado automaticamente.'
      ].join('\n');
      GmailApp.sendEmail(emailAlvo, assunto, corpo);
    } catch(e) {
      console.warn('[CadastroExternoService._enviarEmailAprovacao] ' + e.message);
    }
  }

  function _enviarEmailRecusa(emailAlvo, nome, motivo) {
    try {
      var assunto = 'Solicitação de acesso ao Sistema CCBJ — Resposta';
      var corpo = [
        'Olá, ' + nome + '!',
        '',
        'Sua solicitação de acesso ao Sistema de Gestão de Espaços do CCBJ foi analisada.',
        '',
        'Infelizmente, não foi possível aprovar seu cadastro neste momento.',
        motivo ? ('\nMotivo informado:\n"' + String(motivo).trim() + '"\n') : '',
        'Se acredita que houve um engano, entre em contato diretamente com a equipe do CCBJ.',
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        'Centro Cultural Bom Jardim — Sistema de Gestão de Espaços',
        'Este e-mail foi gerado automaticamente.'
      ].join('\n');
      GmailApp.sendEmail(emailAlvo, assunto, corpo);
    } catch(e) {
      console.warn('[CadastroExternoService._enviarEmailRecusa] ' + e.message);
    }
  }

  // ── API pública ──────────────────────────────────────────────────

  function listar(emailAdmin) {
    try {
      var emailL = String(emailAdmin || '').toLowerCase().trim();
      var admins = obterAdmins();
      if (!admins.includes(emailL)) return { ok: false, msg: 'Acesso negado.' };

      var sh = _getSheet('Solicitacoes');
      if (!sh || sh.getLastRow() < 2) return { ok: true, solicitacoes: [] };

      var dados = sh.getRange(2, 1, sh.getLastRow() - 1, 12).getDisplayValues();
      var result = dados
        .filter(function(r) { return r[0] && String(r[1]).toUpperCase() === 'CADASTRO_EXTERNO'; })
        .map(function(r) {
          var payload = {};
          try { payload = JSON.parse(r[7] || '{}'); } catch(e) {}
          return {
            id:              r[0],
            nome:            payload.nome || r[6] || '',
            email:           r[5],
            status:          r[8],
            aprovador:       r[9],
            dataSolicitacao: r[10],
            dataAcao:        r[11]
          };
        });

      return { ok: true, solicitacoes: result };
    } catch(e) {
      console.warn('[CadastroExternoService.listar] ' + e.message);
      return { ok: false, msg: e.message };
    }
  }

  function aprovar(id, emailAdmin) {
    try {
      var emailL = String(emailAdmin || '').toLowerCase().trim();
      var admins = obterAdmins();
      if (!admins.includes(emailL)) return { ok: false, msg: 'Acesso negado.' };

      var sh = _getSheet('Solicitacoes');
      if (!sh) return { ok: false, msg: 'Aba Solicitacoes não encontrada.' };

      var dados = sh.getRange(2, 1, sh.getLastRow() - 1, 12).getValues();
      var linhaIdx = -1;
      var sol = null;

      for (var i = 0; i < dados.length; i++) {
        if (String(dados[i][0]).trim() === String(id).trim()) {
          linhaIdx = i + 2;
          sol = dados[i];
          break;
        }
      }

      if (linhaIdx < 0 || !sol) return { ok: false, msg: 'Solicitação não encontrada.' };
      if (String(sol[8]).toUpperCase() !== 'PENDENTE') return { ok: false, msg: 'Solicitação já processada.' };

      var payload = {};
      try { payload = JSON.parse(String(sol[7] || '{}')); } catch(e) {}

      var emailAlvo  = String(sol[5]).toLowerCase().trim();
      var nome       = payload.nome || String(sol[6]).trim();
      var senhaHash  = payload.senhaHash || '';

      if (!emailAlvo || !senhaHash) return { ok: false, msg: 'Dados da solicitação incompletos.' };

      var shCred = _getSheet('CredenciaisUsuarios');
      if (!shCred) return { ok: false, msg: 'Aba CredenciaisUsuarios não encontrada.' };

      var jaExiste = false;
      if (shCred.getLastRow() > 1) {
        var credDados = shCred.getRange(2, 1, shCred.getLastRow() - 1, 4).getValues();
        for (var j = 0; j < credDados.length; j++) {
          if (String(credDados[j][0] || '').toLowerCase().trim() === emailAlvo) {
            jaExiste = true;
            shCred.getRange(j + 2, 2).setValue(senhaHash);
            shCred.getRange(j + 2, 3).setValue(nome);
            shCred.getRange(j + 2, 4).setValue(true);
            break;
          }
        }
      }
      if (!jaExiste) {
        shCred.appendRow([emailAlvo, senhaHash, nome, true, new Date().toISOString(), '']);
      }

      sh.getRange(linhaIdx, 9).setValue('APROVADO');
      sh.getRange(linhaIdx, 10).setValue(emailAdmin);
      sh.getRange(linhaIdx, 12).setValue(new Date().toLocaleString('pt-BR'));

      try { _enviarEmailAprovacao(emailAlvo, nome); } catch(e) {}

      return { ok: true, msg: 'Usuário aprovado com sucesso.', emailAlvo: emailAlvo };
    } catch(e) {
      console.warn('[CadastroExternoService.aprovar] ' + e.message);
      return { ok: false, msg: e.message };
    }
  }

  function recusar(id, emailAdmin, motivo) {
    try {
      var emailL = String(emailAdmin || '').toLowerCase().trim();
      var admins = obterAdmins();
      if (!admins.includes(emailL)) return { ok: false, msg: 'Acesso negado.' };

      var sh = _getSheet('Solicitacoes');
      if (!sh) return { ok: false, msg: 'Aba Solicitacoes não encontrada.' };

      var dados = sh.getRange(2, 1, sh.getLastRow() - 1, 12).getValues();
      var linhaIdx = -1;
      var sol = null;

      for (var i = 0; i < dados.length; i++) {
        if (String(dados[i][0]).trim() === String(id).trim()) {
          linhaIdx = i + 2;
          sol = dados[i];
          break;
        }
      }

      if (linhaIdx < 0 || !sol) return { ok: false, msg: 'Solicitação não encontrada.' };
      if (String(sol[8]).toUpperCase() !== 'PENDENTE') return { ok: false, msg: 'Solicitação já processada.' };

      var payload = {};
      try { payload = JSON.parse(String(sol[7] || '{}')); } catch(e) {}
      var emailAlvo = String(sol[5]).toLowerCase().trim();
      var nome = payload.nome || String(sol[6]).trim();
      payload.motivoRecusa = String(motivo || '').trim();

      sh.getRange(linhaIdx, 8).setValue(JSON.stringify(payload));
      sh.getRange(linhaIdx, 9).setValue('RECUSADO');
      sh.getRange(linhaIdx, 10).setValue(emailAdmin);
      sh.getRange(linhaIdx, 12).setValue(new Date().toLocaleString('pt-BR'));

      try { _enviarEmailRecusa(emailAlvo, nome, motivo); } catch(e) {}

      return { ok: true, msg: 'Solicitação recusada.' };
    } catch(e) {
      console.warn('[CadastroExternoService.recusar] ' + e.message);
      return { ok: false, msg: e.message };
    }
  }

  return {
    listar:  listar,
    aprovar: aprovar,
    recusar: recusar
  };

})();
