/**
 * @file ChatService.js
 * @layer backend/services
 * @description Serviço de integração com modelo de linguagem (LLM): monta o prompt com contexto do sistema,
 *              chama a API de IA e retorna resposta parseada. Usado por mod_metrics.gs.
 * @responsibility Funções: chamarModeloIA(prompt, contexto), parsearRespostaIA(texto).
 * @dependencies UrlFetchApp (chamada HTTP à API), PropertiesService (chave de API).
 */
// ChatService.gs
// ================================
// 🔧 CONFIG
// ================================

function getBaseUrl() {
  try {
    return ScriptApp.getService().getUrl() || BASE_URL_FALLBACK;
  } catch (e) {
    return BASE_URL_FALLBACK;
  }
}

// ================================
// 👤 ADMINS
// ================================
function obterAdmins() {
  const aba = _getSheet('Administradores');
  if (!aba || aba.getLastRow() < 2) return [];
  return aba.getRange(2, 1, aba.getLastRow() - 1, 1)
    .getValues()
    .map(l => String(l[0]).toLowerCase().trim())
    .filter(e => e.includes('@'));
}

// ================================
// 👤 DONO DO ESPAÇO (email responsável, col 5)
// ================================
function obterDonoEspaco(nomeOuIdEspaco, diaSemana) {
  const aba = _getSheet('Configuracoes');
  if (!aba || aba.getLastRow() < 2) return null;
  const dados = aba.getDataRange().getValues();
  for (let i = 1; i < dados.length; i++) {
    const id   = String(dados[i][0] || '').trim();
    const nome = String(dados[i][1] || '').toLowerCase().trim();
    const alvo = String(nomeOuIdEspaco || '').toLowerCase().trim();
    if (id !== nomeOuIdEspaco && nome !== alvo) continue;

    const rawDono = String(dados[i][4] || '').trim();
    if (!rawDono) return null;

    // Tenta JSON de múltiplos donos
    try {
      const arr = JSON.parse(rawDono);
      const lista = Array.isArray(arr) ? arr : [arr];
      if (diaSemana !== undefined && diaSemana !== null) {
        const filtrados = lista.filter(d => Array.isArray(d.dias) && d.dias.includes(diaSemana));
        if (filtrados.length) return filtrados.map(d => d.email).join(',');
      }
      return lista.map(d => d.email || d).join(',');
    } catch(e) {
      return rawDono;
    }
  }
  return null;
}

// ================================
// 📧 NOTIFICAÇÃO POR EMAIL
// ================================
function notificarSolicitacao(s) {
  try {
    const diaSemana = s.diaSemana !== undefined ? s.diaSemana : null;
    const dono   = obterDonoEspaco(s.sala, diaSemana);
    const admins = obterAdmins();
    // Notifica o dono do espaço E os admins, removendo duplicatas
    const dest   = [...new Set([dono, ...admins].filter(Boolean))];
    if (!dest.length) return;

    const configSheet = _getSheet('Configuracoes');
    let nomeSala = s.sala || '—';
    if (configSheet && configSheet.getLastRow() > 1) {
      const dados = configSheet.getDataRange().getValues();
      for (let i = 1; i < dados.length; i++) {
        if (String(dados[i][0]).trim() === String(s.sala).trim()) {
          nomeSala = String(dados[i][1]).trim();
          break;
        }
      }
    }

    const base = getBaseUrl();
    const assunto = `🔔 Nova solicitação de reserva — ${nomeSala} — CCBJ`;

    dest.forEach(email => {
      const ehDono = email.toLowerCase().trim() === (dono || '').toLowerCase().trim();
      const papel  = ehDono ? '👤 Responsável pelo espaço' : '🛡️ Administrador do sistema';

      const corpo = `
Olá,

Você está recebendo esta notificação como: ${papel}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 NOVA SOLICITAÇÃO DE RESERVA — CCBJ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🏛️ Espaço solicitado : ${nomeSala}
📋 Tipo               : ${s.tipo} / ${s.subtipo}
👤 Solicitante        : ${s.usuario}
📩 Destinatário       : ${email}
📅 Data da solicitação: ${new Date().toLocaleString('pt-BR')}

💬 Justificativa:
"${s.justificativa}"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ações disponíveis:

✅ Aprovar : ${base}?acao=aprovar&id=${s.id}
❌ Recusar : ${base}?acao=recusar&id=${s.id}

Ou acesse o painel de Aprovações no sistema CCBJ.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Este e-mail foi gerado automaticamente pelo Sistema de Gestão de Espaços do CCBJ.
      `.trim();

      GmailApp.sendEmail(email, assunto, corpo);
    });

  } catch (e) {
    console.error('Erro ao notificar:', e.message);
  }
}

// ================================
// 🧾 CRIAR SOLICITAÇÃO
// Assinatura: (tipo, subtipo, dados, usuario, justificativa)
// ================================
function chat_criarSolicitacao(tipo, subtipo, dados, usuario, justificativa) {
  if (!justificativa || String(justificativa).trim().length < 10) {
    throw new Error('Justificativa obrigatória (mínimo 10 caracteres).');
  }
  if (!usuario || !usuario.includes('@')) {
    throw new Error('Usuário não identificado.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const aba = _getSheet('Solicitacoes');
    if (!aba) throw new Error("Aba 'Solicitacoes' não encontrada. Execute o Setup.");

    const id = gerarId('SOL');

    // Extração robusta da sala em todos os níveis possíveis do payload
    const sala = String(dados?.sala || '').trim();

    // Detecta dia da semana da primeira data solicitada
    let diaSemana = null;
    try {
      const datas = dados?.datas || [];
      const dataStr = datas.length > 0 ? datas[0] : (dados?.dados?.data || '');
      if (dataStr) {
        const p = String(dataStr).split('/');
        if (p.length === 3) diaSemana = new Date(p[2], p[1]-1, p[0]).getDay();
      }
    } catch(e) {}

    const linha = [
      id,
      String(tipo   || '').toUpperCase(),
      String(subtipo || '').toUpperCase(),
      (dados && dados.idReserva) || (dados && dados.dados && dados.dados.id) || '',
      sala,
      String(usuario).toLowerCase().trim(),
      String(justificativa).trim(),
      JSON.stringify(dados || {}),
      'PENDENTE',
      '',
      new Date(),
      ''
    ];

    aba.appendRow(linha);
    limparCacheUsuario(usuario);

    try {
      notificarSolicitacao({ id, tipo, subtipo, sala, usuario, justificativa, diaSemana });
    } catch(e) {
      console.warn('Notificação falhou (não crítico):', e.message);
    }

    return { success: true, id };

  } finally {
    lock.releaseLock();
  }
}

// ================================
// 📋 LISTAR SOLICITAÇÕES
// ================================
function listarSolicitacoesPendentes(emailUsuario) {
  const aba = _getSheet('Solicitacoes');
  if (!aba || aba.getLastRow() < 2) return [];

  const dados  = aba.getRange(2, 1, aba.getLastRow() - 1, 12).getDisplayValues();
  const admins = obterAdmins();
  const email  = String(emailUsuario || '').toLowerCase().trim();
  const isAdmin = admins.includes(email);

  const configSheet = _getSheet('Configuracoes');
  const salasComoResponsavel = new Set();
  if (configSheet && configSheet.getLastRow() > 1) {
    configSheet.getRange(2, 1, configSheet.getLastRow() - 1, 5).getValues().forEach(function(row) {
      const rawDono = String(row[4] || '').trim();
      if (!rawDono) return;
      let emails = [];
      try {
        const arr = JSON.parse(rawDono);
        const lista = Array.isArray(arr) ? arr : [arr];
        emails = lista.map(function(d) { return String(d.email || d || '').toLowerCase().trim(); });
      } catch(e) {
        emails = [rawDono.toLowerCase().trim()];
      }
      if (emails.includes(email)) {
        salasComoResponsavel.add(String(row[0]).trim());
      }
    });
  }

  return dados
    .filter(r => {
      if (!r[0]) return false;

      // Admin vê tudo
      if (isAdmin) return true;

      // Dono do espaço vê todas as solicitações das suas salas (qualquer status)
      if (salasComoResponsavel.has(String(r[4]).trim())) return true;

      // Solicitante vê apenas as próprias pendentes
      const status = String(r[8]).toUpperCase();
      return String(r[5]).toLowerCase().trim() === email && status === 'PENDENTE';
    })
    .map(r => ({
      id:              r[0],
      tipo:            r[1],
      subtipo:         r[2],
      idReserva:       r[3],
      sala:            r[4],
      usuario:         r[5],
      justificativa:   r[6],
      status:          r[8],
      aprovador:       r[9],
      dataSolicitacao: r[10],
      dataAcao:        r[11]
    }));
}

function listarTodasSolicitacoes(emailUsuario) {
  // Admins e donos de espaço têm acesso
  const admins = obterAdmins();
  const emailL = String(emailUsuario || '').toLowerCase().trim();
  const isAdm  = admins.includes(emailL);
  if (!isAdm) {
    // Verifica se é dono de algum espaço
    const configS = _getSheet('Configuracoes');
    let ehDono = false;
    if (configS && configS.getLastRow() > 1) {
      configS.getRange(2, 1, configS.getLastRow()-1, 5).getValues().forEach(function(row) {
        if (ehDono) return;
        const raw = String(row[4]||'').trim();
        if (!raw) return;
        let emails = [];
        try { const a=JSON.parse(raw); emails=(Array.isArray(a)?a:[a]).map(function(d){return String(d.email||d||'').toLowerCase().trim();}); }
        catch(e) { emails=[raw.toLowerCase().trim()]; }
        if (emails.includes(emailL)) ehDono = true;
      });
    }
    if (!ehDono) throw new Error('Acesso negado.');
  }

  const aba = _getSheet('Solicitacoes');
  if (!aba || aba.getLastRow() < 2) return [];

  return aba.getRange(2, 1, aba.getLastRow() - 1, 12).getDisplayValues()
    .filter(r => r[0])
    .map(r => ({
      id:           r[0],
      tipo:         r[1],
      subtipo:      r[2],
      idReserva:    r[3],
      sala:         r[4],
      usuario:      r[5],
      justificativa:r[6],
      status:       r[8],
      aprovador:    r[9],
      dataSolicitacao: r[10],
      dataAcao:     r[11]
    }))
    .reverse(); // mais recentes primeiro
}

// ================================
// ✅ APROVAR
// ================================
function aprovarSolicitacao(id, emailAprovador) {
  if (!emailAprovador || !emailAprovador.includes('@')) {
    emailAprovador = obterEmailUsuario('');
  }

  const admins = obterAdmins();
  const emailLimpo = emailAprovador.toLowerCase().trim();
  const isAdmin = admins.includes(emailLimpo);

  let isDonoEspaco = false;
  if (!isAdmin) {
    const abaSol = _getSheet('Solicitacoes');
    if (abaSol) {
      const linhasSol = abaSol.getDataRange().getValues();
      for (let i = 1; i < linhasSol.length; i++) {
        if (String(linhasSol[i][0]).trim() === String(id).trim()) {
          const salaId = String(linhasSol[i][4]).trim();
          // Descobre dia da semana a partir do payload
          let diaSemana = null;
          try {
            const payload = JSON.parse(linhasSol[i][7] || '{}');
            const datas = payload.datas || [];
            const dataStr = datas.length > 0 ? datas[0] : (payload.dados?.data || '');
            if (dataStr) {
              const p = String(dataStr).split('/');
              if (p.length === 3) diaSemana = new Date(p[2], p[1]-1, p[0]).getDay();
            }
          } catch(e) {}
          const donosStr = obterDonoEspaco(salaId, diaSemana) || '';
          const listaEmails = donosStr.split(',').map(e => e.toLowerCase().trim());
          if (listaEmails.includes(emailLimpo)) isDonoEspaco = true;
          break;
        }
      }
    }
  }

  if (!isAdmin && !isDonoEspaco) {
    throw new Error('Acesso negado: apenas o responsável pelo espaço ou administrador pode aprovar.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const aba = _getSheet('Solicitacoes');
    const dados = aba.getDataRange().getValues();

    let linha = -1, sol = null;
    for (let i = 1; i < dados.length; i++) {
      if (String(dados[i][0]).trim() === String(id).trim()) {
        sol = dados[i]; linha = i; break;
      }
    }
    if (!sol) throw new Error('Solicitação não encontrada.');

    const status = String(sol[8]).toUpperCase();
    if (status === 'APROVADO') throw new Error('Solicitação já aprovada.');
    if (status === 'RECUSADO') throw new Error('Solicitação já recusada.');

    let payload = {};
    try { payload = JSON.parse(sol[7] || '{}'); } catch(e) {}

    const tipo = String(sol[1]).toUpperCase();

    // Executa a ação correspondente
    if (tipo === 'RESERVA') {
      const d  = payload.dados || payload;
      const dt = payload.datas || payload.datasAgendadas || [d.data].filter(Boolean);
      if (!d || !d.nomeAcao) throw new Error('Payload inválido para reserva.');
      criarReservaController(d, dt);

    } else if (tipo === 'ALTERACAO') {
      const d = payload.dados || payload;
      if (!d || !d.id) throw new Error('Payload inválido para alteração.');
      atualizarReservaController(d);

    } else if (tipo === 'CANCELAMENTO') {
      const idRes = payload.idReserva || payload.id || sol[3];
      if (!idRes) throw new Error('ID da reserva não encontrado.');
      cancelarReserva(idRes, emailAprovador);
    }

    // Atualiza status
    aba.getRange(linha + 1, 9).setValue('APROVADO');
    aba.getRange(linha + 1, 10).setValue(emailAprovador);
    aba.getRange(linha + 1, 12).setValue(new Date());

    registrarLog('APROVAÇÃO', 'SOLICITAÇÃO', id,
      `Tipo: ${tipo} | Aprovador: ${emailAprovador}`,
      'PENDENTE', 'APROVADO', emailAprovador);

    // Notifica solicitante
    try {
      const solicitante = String(sol[5] || '');
      if (solicitante.includes('@')) {
        GmailApp.sendEmail(solicitante,
          `✅ Sua solicitação foi aprovada — CCBJ`,
          `Sua solicitação (${tipo}) foi aprovada por ${emailAprovador}.`);
      }
    } catch(e) {}

    limparCacheUsuario(emailAprovador);
    return { success: true };

  } finally {
    lock.releaseLock();
  }
}

// ================================
// ❌ RECUSAR
// ================================
function recusarSolicitacao(id, justificativa, emailAprovador) {
  if (!emailAprovador || !emailAprovador.includes('@')) {
    emailAprovador = obterEmailUsuario('');
  }

  const admins = obterAdmins();
  const emailLimpoR = emailAprovador.toLowerCase().trim();
  const isAdminR = admins.includes(emailLimpoR);

  let isDonoEspacoR = false;
  if (!isAdminR) {
    const abaSolR = _getSheet('Solicitacoes');
    if (abaSolR) {
      const linhasSolR = abaSolR.getDataRange().getValues();
      for (let i = 1; i < linhasSolR.length; i++) {
        if (String(linhasSolR[i][0]).trim() === String(id).trim()) {
          const salaIdR = String(linhasSolR[i][4]).trim();
          let diaSemanaR = null;
          try {
            const payloadR = JSON.parse(linhasSolR[i][7] || '{}');
            const datasR = payloadR.datas || [];
            const dataStrR = datasR.length > 0 ? datasR[0] : (payloadR.dados?.data || '');
            if (dataStrR) {
              const p = String(dataStrR).split('/');
              if (p.length === 3) diaSemanaR = new Date(p[2], p[1]-1, p[0]).getDay();
            }
          } catch(e) {}
          const donosStrR = obterDonoEspaco(salaIdR, diaSemanaR) || '';
          const listaEmailsR = donosStrR.split(',').map(e => e.toLowerCase().trim());
          if (listaEmailsR.includes(emailLimpoR)) isDonoEspacoR = true;
          break;
        }
      }
    }
  }

  if (!isAdminR && !isDonoEspacoR) {
    throw new Error('Acesso negado: apenas o responsável pelo espaço ou administrador pode recusar.');
  }

  if (!justificativa || String(justificativa).trim().length < 5) {
    throw new Error('Justificativa obrigatória (mínimo 5 caracteres).');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const aba = _getSheet('Solicitacoes');
    const dados = aba.getDataRange().getValues();

    let linha = -1, sol = null;
    for (let i = 1; i < dados.length; i++) {
      if (String(dados[i][0]).trim() === String(id).trim()) {
        sol = dados[i]; linha = i; break;
      }
    }
    if (!sol) throw new Error('Solicitação não encontrada.');

    const status = String(sol[8]).toUpperCase();
    if (status !== 'PENDENTE') throw new Error(`Solicitação já ${status.toLowerCase()}.`);

    aba.getRange(linha + 1, 9).setValue('RECUSADO');
    aba.getRange(linha + 1, 10).setValue(emailAprovador);
    aba.getRange(linha + 1, 12).setValue(new Date());
    // Salva justificativa da recusa no campo Justificativa
    const justAtual = String(sol[6] || '');
    aba.getRange(linha + 1, 7).setValue(
      justAtual + ' | RECUSA: ' + justificativa.trim()
    );

    registrarLog('RECUSA', 'SOLICITAÇÃO', id,
      `Motivo: ${justificativa} | Recusador: ${emailAprovador}`,
      'PENDENTE', 'RECUSADO', emailAprovador);

    // Notifica solicitante
    try {
      const solicitante = String(sol[5] || '');
      if (solicitante.includes('@')) {
        GmailApp.sendEmail(solicitante,
          `❌ Sua solicitação foi recusada — CCBJ`,
          `Sua solicitação (${sol[1]}) foi recusada.\nMotivo: ${justificativa}`);
      }
    } catch(e) {}

    limparCacheUsuario(emailAprovador);
    return { success: true };

  } finally {
    lock.releaseLock();
  }
}

// ================================
// 🌐 doGet — carrega app + fluxo de aprovação via link
// ================================
function doGet(e) {
  const acao = e && e.parameter && e.parameter.acao;
  const id   = e && e.parameter && e.parameter.id;

  if (acao && id) {
    if (acao === 'aprovar') {
      try {
        const email = Session.getActiveUser().getEmail();
        aprovarSolicitacao(id, email);
        return HtmlService.createHtmlOutput(
          '<h2 style="font-family:sans-serif;color:green">✅ Solicitação aprovada com sucesso.</h2>'
        );
      } catch(e) {
        return HtmlService.createHtmlOutput(
          `<h2 style="font-family:sans-serif;color:red">Erro: ${e.message}</h2>`
        );
      }
    }

    if (acao === 'recusar') {
      return HtmlService.createHtmlOutput(`
        <!DOCTYPE html><html><body style="font-family:sans-serif;max-width:500px;margin:40px auto;padding:20px">
        <h2>❌ Recusar solicitação</h2>
        <form method="post">
          <input type="hidden" name="id" value="${id}">
          <label>Motivo da recusa:</label><br>
          <textarea name="justificativa" required rows="4" style="width:100%;margin-top:8px;padding:8px;border:1px solid #ccc;border-radius:4px"></textarea><br><br>
          <button type="submit" style="background:#dc2626;color:white;padding:10px 24px;border:none;border-radius:6px;cursor:pointer;font-size:14px">Confirmar Recusa</button>
        </form>
        </body></html>
      `);
    }
  }

  return HtmlService
    .createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Sistema de Reservas — CCBJ')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ================================
// 🌐 doPost — recusa via formulário web
// ================================
function doPost(e) {
  try {
    const id   = e.parameter.id;
    const just = (e.parameter.justificativa || '').trim();
    const email = Session.getActiveUser().getEmail();
    recusarSolicitacao(id, just, email);
    return HtmlService.createHtmlOutput(
      '<h2 style="font-family:sans-serif;color:#dc2626">❌ Solicitação recusada.</h2>'
    );
  } catch(err) {
    return HtmlService.createHtmlOutput(
      `<h2 style="font-family:sans-serif;color:red">Erro: ${err.message}</h2>`
    );
  }
}

// ================================
// 📤 ENVIAR MENSAGEM GOOGLE CHAT
// (mantida para compatibilidade)
// ================================
function chat_enviarMensagem(texto) {
  // Google Chat removido — use _notificarCancelamentoMesmoDia para alertas internos
  console.log('[ALERTA INTERNO]', texto);
}