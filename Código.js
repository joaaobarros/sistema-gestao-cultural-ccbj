/**
 * ARQUIVO: Código.gs
 */

/**
 * MAPEAMENTO CENTRAL DE PLANILHAS (AJUSTE OS IDs)
 */




/**
 * CAMADA INTELIGENTE (NÃO PRECISA MAIS USAR ss)
 */
function _getSheet(nomeAba) {

  const mapa = {

    // MASTER
    'Administradores': ['MASTER', 'Administradores'],
    'Configuracoes': ['MASTER', 'Configuracoes'],
    'Listas': ['MASTER', 'Listas'],
    'Logs': ['MASTER', 'Logs'],
    'LogAcessos': ['MASTER', 'LogAcessos'],

    // ESPACOS
    'Reservas': ['ESPACOS', 'Reservas'],
    'Itens': ['ESPACOS', 'Itens'],
    'Solicitacoes': ['ESPACOS', 'Solicitacoes'],

    // COMUNICACAO
    'ReservasRECE': ['COMUNICACAO', 'ReservasRECE'],

    // RELATORIOS
    'RelatoriosCODIP': ['RELATORIOS', 'RelatoriosCODIP'],
    'Contratos':   ['RELATORIOS', 'Contratos'],
    'Metas':       ['RELATORIOS', 'Metas'],
    'Indicadores': ['RELATORIOS', 'Indicadores'],
    'Rubricas':    ['RELATORIOS', 'Rubricas']
  };

  const conf = mapa[nomeAba];

  if (!conf) {
    throw new Error('Aba não mapeada: ' + nomeAba);
  }

  return _abrirAba(conf[0], conf[1]);
}


//===================================================


function sanitizarTexto(str) {
  return String(str || '')
    .replace(/[<>]/g, '')
    .substring(0, 5000);
}


function obterMapaSalas() {
  
  const sheet = _getSheet('Configuracoes');
  const mapa = {};

  if (sheet && sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 2)
      .getValues()
      .forEach(s => {
        if (s[0] && s[1]) {
          mapa[String(s[0]).trim()] = String(s[1]).trim();
        }
      });
  }

  return mapa;
}

/**
 * Função auxiliar para incluir arquivos HTML (como Logic.html) dentro do Index.html.
 * @param {string} filename Nome do arquivo a ser incluído.
 * @return {string} Conteúdo do arquivo em formato de texto.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * DADOS INICIAIS — agora recebe o email do cliente como parâmetro adicional
 * O cliente passa o email capturado via google.script.run (disponível no contexto OAuth)
 */
function obterDadosIniciais(emailDoCliente) {
  try {
    // Tenta capturar pelo servidor; usa o cliente como fallback
    const emailUsuario = obterEmailUsuario(emailDoCliente || '');

    const cache = CacheService.getUserCache();

    // Chave inclui o email para evitar colisão entre usuários no mesmo cache
    const cacheKey = 'dados_iniciais_' + emailUsuario.replace(/[^a-z0-9]/g, '_');

    const cacheExistente = cache.get(cacheKey);
    if (cacheExistente) {
      const dadosCache = JSON.parse(cacheExistente);
      // Garante que o email no cache é o correto
      dadosCache.usuarioEmail = emailUsuario;
      return dadosCache;
    }

    // ===== ADMINS =====
    const abaAdmins = _getSheet('Administradores');
    let listaAdminsCompleta = [];
    let nivelAcesso = 'usuário';
    let indiceAdmins = {};

    if (abaAdmins && abaAdmins.getLastRow() > 1) {
      listaAdminsCompleta = abaAdmins
        .getRange(2, 1, abaAdmins.getLastRow() - 1, 2)
        .getValues();

      // Cria índice para lookup rápido
      indiceAdmins = criarIndiceAdmins(listaAdminsCompleta);

      // Busca o nível de acesso do usuário
      const adminInfo = indiceAdmins[emailUsuario];
      if (adminInfo) {
        nivelAcesso = adminInfo.nivel;
      }
    }

    registrarAcesso(emailUsuario, nivelAcesso);

    // ===== SALAS =====
    const configSheet = _getSheet('Configuracoes');
    let salasFull = [];
    let indiceSalas = {};
    const mapaSalasObj = {};

    if (configSheet && configSheet.getLastRow() > 1) {
      salasFull = configSheet
        .getRange(2, 1, configSheet.getLastRow() - 1, 5)
        .getValues();

      // Cria índice
      indiceSalas = criarIndiceSalas(salasFull);

      // Mapa simples para compatibilidade
      salasFull.forEach(s => {
        const id = String(s[0]).trim();
        const nome = String(s[1]).trim();
        if (id && nome) mapaSalasObj[id] = nome;
      });
    }

    // ===== ITENS =====
    const itensSheet = _getSheet('Itens');
    let listaItens = [];
    let indiceItens = {};

    if (itensSheet && itensSheet.getLastRow() > 1) {
      listaItens = itensSheet
        .getRange(2, 1, itensSheet.getLastRow() - 1, 6)
        .getValues();

      // Cria índice
      indiceItens = criarIndiceItens(listaItens);
    }

    // ===== SETORES =====
    const setoresSheet = _getSheet('Listas');
    let setores = [];
    if (setoresSheet && setoresSheet.getLastRow() > 1) {
      setores = setoresSheet
        .getRange(2, 1, setoresSheet.getLastRow() - 1, 1)
        .getValues()
        .map(s => s[0]);
    }

    // ===== MAPA EMAIL → NOME =====
    const mapaNomes = {};
    listaAdminsCompleta.forEach(a => {
      const em = String(a[0] || '').trim();
      if (em && validarEmail(em)) {
        try {
          mapaNomes[em] = resolverNomePorEmail(em);
        } catch (e) {
          mapaNomes[em] = em.split('@')[0];
        }
      }
    });

    // ===== RESULTADO FINAL =====
    const resultado = {
      usuarioEmail: emailUsuario,
      isAdmin: nivelAcesso === 'admin' || nivelAcesso === 'superadmin',
      isSuperadmin: nivelAcesso === 'superadmin',
      isComunicacao: nivelAcesso === 'comunicação' || nivelAcesso === 'comunicacao',
      isHabilitador: nivelAcesso === 'habilitador',
      salas: salasFull,
      mapaSalas: mapaSalasObj,
      setores: setores,
      administradores: listaAdminsCompleta,
      listaItens: listaItens,
      mapaNomes: mapaNomes,
      
      // 🆕 ÍNDICES PARA PERFORMANCE
      _indiceAdmins: indiceAdmins,
      _indiceSalas: indiceSalas,
      _indiceItens: indiceItens,
      
      timestamp: new Date().getTime()
    };

    cache.put(cacheKey, JSON.stringify(resultado), 60);
    console.log('Dados iniciais enviados para:', emailUsuario, '| Índices criados.');
    return resultado;

  } catch (e) {
    console.error('Erro em obterDadosIniciais:', e.message, e.stack);
    throw new Error('Erro ao carregar dados: ' + e.message);
  }
}

/**
 * LIMPAR CACHE — por email específico
 */
function limparCacheUsuario(emailUsuario) {
  const cache = CacheService.getUserCache();
  // Remove sempre a chave legada (chamadas antigas sem email)
  cache.remove('dados_iniciais');
  // Remove a chave específica do usuário se o email foi fornecido
  if (emailUsuario && String(emailUsuario).includes('@')) {
    const chave = 'dados_iniciais_' + emailUsuario.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    cache.remove(chave);
  }
}

/**
 * CAPTURA ROBUSTA DO EMAIL DO USUÁRIO REAL
 * Funciona em implantações "Execute as: User accessing the web app"
 * Para "Execute as: Me", o emailCliente passado pelo frontend é usado como fallback
 */
function obterEmailUsuario(emailClienteFallback) {
  try {
    // Prioridade 1: usuário ativo (funciona em "Execute as: User")
    let email = Session.getActiveUser()?.getEmail();

    // Prioridade 2: usuário efetivo
    if (!email || email.trim() === '') {
      email = Session.getEffectiveUser()?.getEmail();
    }

    // Prioridade 3: fallback passado pelo cliente (para "Execute as: Me")
    if (!email || email.trim() === '') {
      email = emailClienteFallback;
    }

    if (!email || email.trim() === '') {
      throw new Error('Email não identificado.');
    }

    // Valida formato básico para evitar injeção
    const emailLimpo = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo)) {
      throw new Error('Formato de email inválido: ' + emailLimpo);
    }

    return emailLimpo;

  } catch (e) {
    console.error('Erro ao obter email:', e.message);
    // Nunca retorna email do proprietário como fallback silencioso
    throw new Error('Não foi possível identificar o usuário: ' + e.message);
  }
}


/**
 * VERIFICAR DONO OU ADMIN — recebe emailAtual explicitamente
 */
function verificarDonoOuAdmin(emailDono, emailAtual) {
  const emailAtualLimpo = String(emailAtual || '').toLowerCase().trim();
  const emailDonoLimpo = String(emailDono || '').toLowerCase().trim();

  if (!emailAtualLimpo) throw new Error('Email do usuário não identificado.');

  if (emailAtualLimpo === emailDonoLimpo) return true;

  try {
    verificarPermissao('admin', emailAtualLimpo);
    return true;
  } catch (e) {
    throw new Error('Acesso negado: apenas o responsável ou administrador pode realizar esta ação.');
  }
}

function habilitarReservaStatus(id, emailAtual, observacao) {
  if (!emailAtual || !emailAtual.includes('@')) throw new Error('Email não identificado.');
  
  const abaAdmins = _getSheet('Administradores');
  let nivel = '';
  if (abaAdmins && abaAdmins.getLastRow() > 1) {
    const admins = abaAdmins.getRange(2,1,abaAdmins.getLastRow()-1,2).getValues();
    const found = admins.find(a => String(a[0]).toLowerCase().trim() === String(emailAtual).toLowerCase().trim());
    if (found) nivel = String(found[1]).toLowerCase().trim();
  }
  if (!['admin','superadmin','habilitador'].includes(nivel)) throw new Error('Sem permissão para habilitar espaços.');
  const aba = _getSheet('Reservas');
  const dados = aba.getDataRange().getValues();
  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][0]).trim() !== String(id).trim()) continue;
    if (String(dados[i][13]).toUpperCase() === 'CANCELADO') throw new Error('Não é possível habilitar reserva cancelada.');
    aba.getRange(i+1, 14).setValue('HABILITADO');
    const obs = String(observacao || '').trim();
    if (obs) {
      const rel = String(dados[i][11] || '');
      aba.getRange(i+1, 12).setValue(rel + (rel ? '\n' : '') + '[HAB] ' + obs);
    }
    registrarLog('HABILITAÇÃO','RESERVA',dados[i][6],'ID:'+id+(obs?' | Obs:'+obs:''),
      'Status:'+dados[i][13],'Status:HABILITADO',emailAtual);
    limparCacheUsuario(emailAtual);
    return true;
  }
  throw new Error('Reserva não encontrada.');
}

function verificarPermissaoCancelamento(id, emailAtual) {

  
  const aba = _getSheet('Reservas');
  const dados = aba.getDataRange().getValues();

  const abaAdmins = _getSheet('Administradores');
  let admins = [];

  if (abaAdmins && abaAdmins.getLastRow() > 1) {
    admins = abaAdmins
      .getRange(2, 1, abaAdmins.getLastRow() - 1, 1)
      .getValues()
      .map(l => String(l[0]).toLowerCase().trim());
  }

  for (let i = 1; i < dados.length; i++) {

    if (String(dados[i][0]).trim() === String(id).trim()) {

      const dono = String(dados[i][8]).toLowerCase().trim();
      const email = String(emailAtual).toLowerCase().trim();

      return {
        podeCancelar: admins.includes(email) || dono === email,
        ehAdmin: admins.includes(email),
        ehDono: dono === email
      };
    }
  }

  throw new Error("Reserva não encontrada");
}

/**
 * PROCESSAR AGENDAMENTO EM LOTE — agora recebe emailUsuario
 */
function processarAgendamentoLote(dados, datas) {
  // Valida email do responsável
  if (!dados.responsavel || !validarEmail(dados.responsavel)) {
    throw new Error('Email do responsável inválido. Faça login novamente.');
  }

  detectarComportamentoSuspeito('agendamento_lote');

  let lock;
  try {
    lock = obterLockComRetry('processarAgendamentoLote', 10000, 3);

    const abaReservas = _getSheet('Reservas');

    if (!dados || !Array.isArray(datas) || datas.length === 0) {
      throw new Error('Dados inválidos para agendamento.');
    }

    if (!dados.sala || !dados.horaInicio || !dados.horaTermino || !dados.nomeAcao) {
      throw new Error('Campos obrigatórios não preenchidos.');
    }

    validarReserva(dados);

    const idGrupoLote = gerarId('LOTE');
    const dataSolicitacao = new Date();
    const linhasReservas = [];
    const datasProcessadas = new Set();
    const responsavelNormalizado = normalizarEmail(dados.responsavel);

    datas.forEach(dataStr => {
      if (!dataStr) return;

      const dataKey = String(dataStr).trim();
      if (datasProcessadas.has(dataKey)) {
        throw new Error('Data duplicada: ' + dataStr);
      }
      datasProcessadas.add(dataKey);

      // Normaliza data
      const dataFinal = new Date(normalizarData(dataStr));
      if (isNaN(dataFinal.getTime())) {
        throw new Error('Data inválida: ' + dataStr);
      }

      // Verifica conflito
      const resultadoConflito = verificarConflitoEspaco(
        dados.sala, dataFinal, dados.horaInicio, dados.horaTermino, null
      );
      
      if (resultadoConflito && resultadoConflito.conflito) {
        const ex = resultadoConflito.existente || {};
        throw new Error(
          `Conflito detectado: Sala ocupada em ${dataKey}` +
          (ex.inicio ? ` (${ex.inicio}–${ex.fim}: ${ex.nome || ''})` : '')
        );
      }

      // Verifica disponibilidade de itens
      verificarDisponibilidadeItensPorHorario(
        dados.itensVolantes, dataFinal, dados.horaInicio, dados.horaTermino, dados.sala
      );

      const novoIdReserva = gerarId('RES');
      const linhaReserva = [
        novoIdReserva,
        dataFinal,
        dados.horaInicio,
        dados.horaTermino,
        dados.sala,
        dados.turno,
        dados.nomeAcao,
        dados.tipoAcao,
        responsavelNormalizado,
        dados.setor,
        dados.coResponsavel,
        dados.release,
        dados.itensVolantes,
        'CONFIRMADO',
        dataSolicitacao,
        idGrupoLote
      ];

      linhasReservas.push(linhaReserva);

      // CODIP — salvar junto com reserva
      try {
        if (dados.codipPublico || dados.codipPublicoReal || dados.codipObs) {
          _salvarCamposCODIP(novoIdReserva, dados);
        }
      } catch (e) {
        console.error('Erro ao salvar CODIP:', e);
      }

      // Log da criação
      registrarLog(
        'CRIAÇÃO', 'RESERVA', novoIdReserva,
        `Agendamento via lote | Data: ${dataKey} | Sala: ${dados.sala}`,
        null, linhaReserva,
        responsavelNormalizado
      );
    });

    if (linhasReservas.length > 0) {
      abaReservas.getRange(
        abaReservas.getLastRow() + 1, 1,
        linhasReservas.length, linhasReservas[0].length
      ).setValues(linhasReservas);
    }

    limparCacheUsuario(responsavelNormalizado);
    return { success: true, total: linhasReservas.length, lote: idGrupoLote };

  } catch (e) {
    console.error('Erro ao processar lote:', e.message);
    throw new Error(e.message);
  } finally {
    if (lock) lock.releaseLock();
  }
}


/**
 * VERIFICAR CONFLITO DE ESPAÇO (VERSÃO AVANÇADA COM BUFFER INTELIGENTE)
 * - Detecta conflito real
 * - Detecta conflito apenas por buffer (5 min)
 * - Sugere ajuste automático quando possível
 */
function verificarConflitoEspaco(sala, data, inicio, termino, idReservaIgnorar) {

  const BUFFER = 5; // minutos

  const aba = _getSheet("Reservas");

  if (!aba || aba.getLastRow() < 2) {
    return { conflito: false };
  }

  const dados = aba.getDataRange().getValues();

  // Normaliza inputs usando utils centralizados
  const dataBusca = normalizarData(data);
  const inicioBusca = normalizarHora(inicio);
  const terminoBusca = normalizarHora(termino);

  if (dataBusca === null) {
    throw new Error("Data inválida ao verificar conflito.");
  }

  if (inicioBusca === null || terminoBusca === null) {
    throw new Error("Horário inválido.");
  }

  if (terminoBusca <= inicioBusca) {
    throw new Error("Horário final deve ser maior que o inicial.");
  }

  const salaNormalizada = String(sala).trim();

  for (let i = 1; i < dados.length; i++) {

    const idReserva = String(dados[i][0] || '').trim();
    if (idReservaIgnorar && idReserva === String(idReservaIgnorar).trim()) {
      continue;
    }

    const status = String(dados[i][13] || '').toUpperCase();
    if (status === "CANCELADO") {
      continue;
    }

    const salaPlanilha = String(dados[i][4] || '').trim();
    if (salaPlanilha !== salaNormalizada) {
      continue;
    }

    const dataPlanilha = normalizarData(dados[i][1]);
    if (dataPlanilha === null || dataPlanilha !== dataBusca) {
      continue;
    }

    const iniPlanilha = normalizarHora(dados[i][2]);
    const terPlanilha = normalizarHora(dados[i][3]);

    if (iniPlanilha === null || terPlanilha === null) {
      continue;
    }

    // 🔴 VERIFICA SOBREPOSIÇÃO DE HORÁRIO
    const temConflito = horariosSobrepostos(inicioBusca, terminoBusca, iniPlanilha, terPlanilha);

    if (temConflito) {
      return {
        conflito: true,
        tipo: "REAL",
        solicitado: {
          inicio: formatarHora(inicioBusca),
          fim: formatarHora(terminoBusca)
        },
        existente: {
          inicio: formatarHora(iniPlanilha),
          fim: formatarHora(terPlanilha),
          nome: dados[i][6]
        },
        contexto: {
          sala: sala,
          data: formatarData(dataBusca)
        }
      };
    }
  }

  return { conflito: false };
}



/**
 * REGISTRAR LOG — usa o emailUsuario passado explicitamente
 * Nunca mais depende de Session no servidor
 */
function registrarLog(acao, tipo, alvo, detalhes, dadosAntes, dadosDepois, emailUsuario) {
  try {
    
    const abaLogs = _getSheet('Logs');
    if (!abaLogs) return;

    // Tenta Session como último recurso, mas usa o parâmetro primeiro
    const usuario = emailUsuario
      || Session.getActiveUser()?.getEmail()
      || 'desconhecido@sistema';

    const formatarDados = (dados) => {
      if (dados === undefined || dados === null) return '';
      if (Array.isArray(dados)) {
        return dados.map(v => (v === null || v === undefined ? '-' : String(v))).join(' | ');
      }
      if (typeof dados === 'object') {
        try {
          const json = JSON.stringify(dados);
          return json.length > 50000 ? json.substring(0, 50000) + '...' : json;
        } catch (e) {
          return String(dados);
        }
      }
      return String(dados);
    };

    abaLogs.appendRow([
      new Date(),
      sanitizarTexto(String(usuario)),
      sanitizarTexto(String(acao || '')).toUpperCase(),
      sanitizarTexto(String(tipo || '')).toUpperCase(),
      sanitizarTexto(String(alvo || '')),
      sanitizarTexto(String(detalhes || '')),
      formatarDados(dadosAntes),
      formatarDados(dadosDepois)
    ]);

  } catch (e) {
    console.error('Erro ao registrar log:', e.message);
  }
}


/**
 * BUSCAR LOGS PARA O SUPERADMIN
 * Retorna o histórico de auditoria em ordem decrescente (mais recentes primeiro).
 */
function obterLogs(emailUsuario) {
  try {
    verificarPermissao('superadmin', emailUsuario);
    
    const abaLogs = _getSheet('Logs');
    if (!abaLogs || abaLogs.getLastRow() < 2) return '[]';
    const dados = abaLogs.getRange(2, 1, abaLogs.getLastRow() - 1, 8).getDisplayValues();
    return JSON.stringify(dados.reverse());
  } catch (e) {
    throw new Error(e.message);
  }
}


/**
 * OBTER RESERVAS (ALIMENTA A TABELA PRINCIPAL)
 * Recupera todas as linhas da aba Reservas para exibição no front-end.
 * @return {Array} Matriz de dados da planilha em ordem reversa (mais novos primeiro).
 */
function obterReservas() {
  try {
    
    const aba = _getSheet("Reservas");
    
    // Se a aba estiver vazia ou não existir, retorna array vazio
    if (!aba || aba.getLastRow() < 2) return [];
    
    // Retorna na ordem natural da planilha; a ordenação visual é feita no cliente
    return aba.getRange(2, 1, aba.getLastRow() - 1, 16).getDisplayValues();
    
  } catch (e) {
    console.error("Erro em obterReservas: " + e.message);
    return [];
  }
}

/**
 * CANCELAR RESERVA — recebe emailAtual explicitamente
 */
function cancelarReserva(id, emailAtual) {
  limitarRequisicoes('cancelar_reserva', 5, 30000);

  if (!emailAtual || !emailAtual.includes('@')) {
    throw new Error('Email do usuário não identificado.');
  }

  
  const aba = _getSheet('Reservas');
  const dados = aba.getDataRange().getValues();

  for (let i = 1; i < dados.length; i++) {

    if (String(dados[i][0]).trim() === String(id).trim()) {

      const emailDono = dados[i][8];
      verificarDonoOuAdmin(emailDono, emailAtual);

      const linha = i + 1;

      const nome = dados[i][6];
      const data = dados[i][1];
      const inicio = dados[i][2];
      const fim = dados[i][3];
      const sala = dados[i][4];

      const statusAntes = dados[i][13];

      if (String(statusAntes).toUpperCase() === "CANCELADO") {
        throw new Error("Reserva já cancelada.");
      }

      // ✅ Cancela
      aba.getRange(linha, 14).setValue('CANCELADO');

      // 🔥 ALERTA MESMO DIA
      if (isMesmoDia(data)) {
        _notificarCancelamentoMesmoDia({ sala, nome, inicio, fim, emailAtual });
      }

      registrarLog(
        'CANCELAMENTO',
        'RESERVA',
        nome,
        'ID: ' + id,
        'Status: ' + statusAntes,
        'Status: CANCELADO',
        emailAtual
      );

      return true;
    }
  }

  throw new Error("Reserva não encontrada");
}

function isMesmoDia(dataReserva) {
  const hoje = new Date();
  hoje.setHours(0,0,0,0);

  const data = new Date(dataReserva);
  data.setHours(0,0,0,0);

  return hoje.getTime() === data.getTime();
}

/**
 * EXCLUIR REGISTRO — recebe emailAtual explicitamente
 */
function excluirRegistroPorID(tipo, id, emailAtual) {
  if (!tipo || !id) throw new Error('ID e tipo são obrigatórios.');
  if (!emailAtual || !emailAtual.includes('@')) throw new Error('Email não identificado.');

  const tipoLower = String(tipo).toLowerCase().trim();
  const idSafe = String(id).trim();
  const tiposPermitidos = ['reserva', 'espaco', 'item', 'usuario', 'setor'];
  if (!tiposPermitidos.includes(tipoLower)) throw new Error('Tipo de exclusão inválido.');

  limitarRequisicoes('excluir_registro', 10, 30000);
  detectarComportamentoSuspeito('exclusao');

  const lock = LockService.getScriptLock();
  lock.waitLock(5000);

  try {
    

    if (tipoLower === 'reserva') {
      const abaReservas = _getSheet('Reservas');
      const dadosReservas = abaReservas.getDataRange().getValues();
      let encontrou = false;
      for (let i = 1; i < dadosReservas.length; i++) {
        if (String(dadosReservas[i][0]).trim() === idSafe) {
          verificarDonoOuAdmin(dadosReservas[i][8], emailAtual);
          encontrou = true;
          break;
        }
      }
      if (!encontrou) throw new Error('Reserva não encontrada.');
    } else if (tipoLower === 'usuario') {
      verificarPermissao('superadmin', emailAtual);
    } else {
      verificarPermissao('admin', emailAtual);
    }

    const mapaAbas = {
      reserva: 'Reservas',
      espaco: 'Configuracoes',
      usuario: 'Administradores',
      setor: 'Listas',
      item: 'Itens'
    };

    const aba = _getSheet(mapaAbas[tipoLower]);
    if (!aba) throw new Error('Aba não encontrada.');

    const dados = aba.getDataRange().getValues();
    for (let i = 1; i < dados.length; i++) {
      if (dados[i][0] && String(dados[i][0]).trim() === idSafe) {
        const dadosAntes = dados[i];
        const alvoNome = dados[i][1] || 'ID: ' + idSafe;

        if (tipoLower === 'espaco') liberarItensOrfaos(idSafe);

        aba.deleteRow(i + 1);

        registrarLog(
          'EXCLUSÃO DEFINITIVA', tipo.toUpperCase(), String(alvoNome),
          'Removido via painel administrativo.',
          dadosAntes, null,
          emailAtual   // ← email real no log
        );

        limparCacheUsuario(emailAtual);
        return true;
      }
    }
    throw new Error('Registro não encontrado.');

  } catch (e) {
    throw new Error('Falha ao excluir: ' + e.message);
  } finally {
    lock.releaseLock();
  }
}



/**
 * SALVAR EDIÇÃO DE RESERVA — recebe emailAtual no objeto dados
 */
function salvarEdicaoReserva(dados) {
  validarCamposObrigatorios(dados, ['id', 'data', 'horaInicio', 'horaTermino', 'sala', 'nomeAcao', 'responsavel']);

  if (!validarEmail(dados.responsavel)) {
    throw new Error('Email do responsável inválido.');
  }

  try {
    const responsavelNormalizado = normalizarEmail(dados.responsavel);
    const aba = _getSheet('Reservas');
    
    if (!aba) throw new Error('Aba Reservas não encontrada.');

    // Valida a reserva antes de processar
    validarReserva(dados);

    const valores = aba.getDataRange().getValues();

    for (let i = 1; i < valores.length; i++) {
      if (String(valores[i][0]).trim() === String(dados.id).trim()) {
        const emailDono = valores[i][8];
        verificarDonoOuAdmin(emailDono, responsavelNormalizado);

        // 🔴 NOVO: Verifica conflito ao editar (ignorando a própria reserva)
        const resultadoConflito = verificarConflitoEspaco(
          dados.sala, dados.data, dados.horaInicio, dados.horaTermino, dados.id
        );

        if (resultadoConflito && resultadoConflito.conflito) {
          const ex = resultadoConflito.existente || {};
          throw new Error(
            `Conflito detectado: Sala ocupada` +
            (ex.inicio ? ` (${ex.inicio}–${ex.fim}: ${ex.nome || ''})` : '')
          );
        }

        // Verifica disponibilidade de itens para o novo horário
        verificarDisponibilidadeItensPorHorario(
          dados.itensVolantes, dados.data, dados.horaInicio, dados.horaTermino, dados.sala
        );

        const linha = i + 1;
        const dadosAntes = valores[i].slice(1, 13);

        const valoresNovos = [[
          dados.data, dados.horaInicio, dados.horaTermino,
          dados.sala, dados.turno, dados.nomeAcao, dados.tipoAcao,
          responsavelNormalizado,
          dados.setor, dados.coResponsavel, dados.release, dados.itensVolantes
        ]];

        aba.getRange(linha, 2, 1, 12).setValues(valoresNovos);

        registrarLog(
          'EDIÇÃO', 'RESERVA', dados.nomeAcao,
          'ID: ' + dados.id,
          dadosAntes, valoresNovos[0],
          responsavelNormalizado
        );

        // Sincroniza com Agenda RECE se houver vínculo
        _sincronizarEdicaoComRece(dados);

        limparCacheUsuario(responsavelNormalizado);
        return { success: true, id: dados.id };
      }
    }

    throw new Error('Reserva não encontrada para edição.');
  } catch (e) {
    throw new Error('Erro ao salvar edição: ' + e.message);
  }
}

function _sincronizarEdicaoComRece(dados) {
  // Sincronização Geral→RECE: atualiza campos básicos em registros RECE
  // vinculados pelo ID da reserva (coluna 24, índice 23) OU por título+dataInicio exatos.
  try {
    
    const abaRece = _getSheet('ReservasRECE');
    if (!abaRece || abaRece.getLastRow() < 2) return;

    const linhasRece = abaRece.getRange(2, 1, abaRece.getLastRow() - 1, 24).getValues();
    const mapaSalas  = obterMapaSalas();
    const nomeEspaco = mapaSalas[String(dados.sala).trim()] || dados.sala;
    const idReserva  = String(dados.id || '').trim();
    const tituloNovo = String(dados.nomeAcao || '').trim().toUpperCase();

    // Normaliza data para DD/MM/YYYY para comparação
    const normData = (d) => {
      if (!d) return '';
      const s = String(d).trim();
      if (s.includes('/')) return s;
      if (s.includes('-')) { const p = s.split('-'); return `${p[2]}/${p[1]}/${p[0]}`; }
      return s;
    };
    const dataFormatada = normData(dados.data);

    for (let i = 0; i < linhasRece.length; i++) {
      const idVinculo    = String(linhasRece[i][23] || '').trim(); // coluna X = ID reserva geral
      const tituloRece   = String(linhasRece[i][1]  || '').trim().toUpperCase();
      const dataRece     = normData(linhasRece[i][2]);

      const vinculado = (idReserva && idVinculo === idReserva) ||
                        (tituloRece === tituloNovo && dataRece === dataFormatada);
      if (!vinculado) continue;

      const linhaRece = i + 2;
      const dadosAntes = linhasRece[i].slice();

      abaRece.getRange(linhaRece, 2).setValue(dados.nomeAcao);    // Título
      abaRece.getRange(linhaRece, 3).setValue(dataFormatada);     // Data Início
      abaRece.getRange(linhaRece, 5).setValue(dados.horaInicio);  // Horário Início
      abaRece.getRange(linhaRece, 6).setValue(dados.horaTermino); // Horário Término
      abaRece.getRange(linhaRece, 7).setValue(nomeEspaco);        // Espaço

      registrarLog(
        'SINCRONIZAÇÃO', 'RECE', dados.nomeAcao,
        'Atualizado via edição de Reserva Geral. ID: ' + idReserva,
        dadosAntes,
        [dados.nomeAcao, dataFormatada, dados.horaInicio, dados.horaTermino, nomeEspaco],
        dados.responsavel
      );
      console.log(`RECE sincronizado: linha ${linhaRece} — ${dados.nomeAcao}`);
      break;
    }
  } catch(e) {
    console.error('Erro ao sincronizar RECE:', e.message);
  }
}

/**
 * ALTERNAR QUANTIDADE DE ITEM — recebe emailAtual
 */
function alternarQuantidadeItem(idItem, idSala, quantidade, acao, emailAtual) {
  try {
    verificarPermissao('admin', emailAtual);

    
    const abaItens = _getSheet("Itens");
    const dados = abaItens.getDataRange().getValues();

    for (let i = 1; i < dados.length; i++) {
      if (String(dados[i][0]).trim() === String(idItem).trim()) {
        let qtdAtualEstoque = Number(dados[i][3]);
        let mapaAlocacao = {};
        try {
          mapaAlocacao = JSON.parse(String(dados[i][4] || "{}"));
        } catch(e) { mapaAlocacao = {}; }

        if (acao === 'fixar') {
          if (qtdAtualEstoque < quantidade) throw new Error("Estoque insuficiente no almoxarifado!");
          abaItens.getRange(i + 1, 4).setValue(qtdAtualEstoque - quantidade);
          mapaAlocacao[idSala] = (mapaAlocacao[idSala] || 0) + quantidade;
        } else {
          let qtdNaSala = mapaAlocacao[idSala] || 0;
          if (qtdNaSala < quantidade) throw new Error("Quantidade na sala insuficiente para liberar!");
          abaItens.getRange(i + 1, 4).setValue(qtdAtualEstoque + quantidade);
          mapaAlocacao[idSala] -= quantidade;
          if (mapaAlocacao[idSala] <= 0) delete mapaAlocacao[idSala];
        }

        abaItens.getRange(i + 1, 5).setValue(JSON.stringify(mapaAlocacao));
        limparCacheUsuario(emailAtual);
        return { success: true };
      }
    }

    throw new Error("Item não encontrado!");
  } catch (e) {
    throw new Error(e.message);
  }
}


/**
 * Função genérica para buscar dados de qualquer aba
 * Usada para popular as listas de patrimônio no modal
 */
function obterDadosParaConfig(nomeAba) {
  try {
    
    const aba = _getSheet(nomeAba);
    if (!aba || aba.getLastRow() < 2) return [];

    // Retorna apenas os dados, sem o cabeçalho
    return aba.getRange(2, 1, aba.getLastRow() - 1, aba.getLastColumn()).getValues();
  } catch (e) {
    console.error("Erro ao buscar dados: " + e.message);
    return [];
  }
}




/**
 * PROCESSAR SALVAR CONFIG — recebe emailAtual nos dados
 */
function processarSalvarConfig(dados) {
  try {
    limitarRequisicoes('salvar_config', 10, 30000);

    if (!dados.emailAtual || !dados.emailAtual.includes('@')) {
      throw new Error('Email do usuário não identificado.');
    }

    validarCamposObrigatorios(dados, ['tipo']);

    const tipo = String(dados.tipo || '').toLowerCase().trim();

    if (tipo === 'espaco') validarCamposObrigatorios(dados, ['nome', 'capacidade']);
    if (tipo === 'item') validarCamposObrigatorios(dados, ['nome', 'categoria', 'qtd']);
    if (tipo === 'usuario') validarCamposObrigatorios(dados, ['email', 'nivel']);
    if (tipo === 'setor') validarCamposObrigatorios(dados, ['nome']);

    if (tipo === 'usuario') verificarPermissao('superadmin', dados.emailAtual);
    else verificarPermissao('admin', dados.emailAtual);

    
    const id = dados.id ? String(dados.id).trim() : null;
    const nome = String(dados.nome || '').toUpperCase().trim();

    const mapeamento = {
      espaco: { aba: 'Configuracoes' },
      item: { aba: 'Itens' },
      usuario: { aba: 'Administradores' },
      setor: { aba: 'Listas' }
    };

    const config = mapeamento[tipo];
    if (!config) throw new Error('Tipo inválido: ' + tipo);

    const aba = _getSheet(config.aba);
    const data = aba.getDataRange().getValues();

    if (id) {
      for (let i = 0; i < data.length; i++) {
        if (String(data[i][0]).trim() === id) {
          const linha = i + 1;
          const dadosAntes = data[i];
          let dadosDepois = [];

          if (tipo === 'espaco') {
            const emailEsp = String(dados.emailEspaco || '').toLowerCase().trim();
            dadosDepois = [id, nome, Number(dados.capacidade), data[i][3] || '', emailEsp];
            aba.getRange(linha, 2, 1, 2).setValues([[nome, Number(dados.capacidade)]]);
            aba.getRange(linha, 5).setValue(emailEsp);
          } else if (tipo === 'item') {
            dadosDepois = [id, nome, dados.categoria, Number(dados.qtd)];
            aba.getRange(linha, 2, 1, 3).setValues([[nome, dados.categoria, Number(dados.qtd)]]);
          } else if (tipo === 'usuario') {
            dadosDepois = [id, dados.nivel];
            aba.getRange(linha, 2).setValue(dados.nivel);
          } else if (tipo === 'setor') {
            dadosDepois = [nome];
            aba.getRange(linha, 1).setValue(nome);
          }

          registrarLog(
            'EDIÇÃO', tipo.toUpperCase(), nome,
            'Editado via painel Admin.',
            dadosAntes, dadosDepois,
            dados.emailAtual   // ← email real
          );

          limparCacheUsuario(dados.emailAtual);
          return obterDadosIniciais(dados.emailAtual);
        }
      }
    }

    // Criação
    let novaLinha = [];
    if (tipo === 'espaco') novaLinha = [gerarId('SAL'), nome, Number(dados.capacidade), '', String(dados.emailEspaco || '').toLowerCase().trim()];
    else if (tipo === 'item') novaLinha = [gerarId('ITM'), nome, dados.categoria, Number(dados.qtd), '{}', 'DISPONÍVEL'];
    else if (tipo === 'usuario') novaLinha = [dados.email.toLowerCase(), dados.nivel];
    else if (tipo === 'setor') novaLinha = [nome];

    aba.appendRow(novaLinha);

    registrarLog(
      'CRIAÇÃO', tipo.toUpperCase(), nome || dados.email,
      'Criado via painel Admin.',
      null, novaLinha,
      dados.emailAtual   // ← email real
    );

    limparCacheUsuario(dados.emailAtual);
    return obterDadosIniciais(dados.emailAtual);

  } catch (error) {
    throw new Error('Erro no servidor: ' + error.message);
  }
}


/**
 * REMOVER REGISTRO GENÉRICO — recebe emailAtual
 */
function removerRegistroGenerico(id, tipo, emailAtual) {
  try {
    if (tipo === 'usuario') verificarPermissao('superadmin', emailAtual);
    else verificarPermissao('admin', emailAtual);

    
    const mapaAbas = { setor: 'Listas', usuario: 'Administradores', espaco: 'Configuracoes', item: 'Itens' };
    const sheet = _getSheet(mapaAbas[tipo]);
    const dados = sheet.getDataRange().getValues();

    for (let i = dados.length - 1; i >= 1; i--) {
      if (String(dados[i][0]).trim() === String(id).trim()) {
        registrarLog('EXCLUSÃO', tipo.toUpperCase(), String(id),
          'Removido via painel Admin.', dados[i], null, emailAtual);
        sheet.deleteRow(i + 1);
        break;
      }
    }

    limparCacheUsuario(emailAtual);
    return obterDadosIniciais(emailAtual);
  } catch (e) {
    throw new Error(e.message);
  }
}



function validarCamposObrigatorios(obj, campos) {
  if (!obj || typeof obj !== "object") {
    throw new Error("Dados inválidos.");
  }

  campos.forEach(campo => {
    if (
      obj[campo] === undefined ||
      obj[campo] === null ||
      String(obj[campo]).trim() === ""
    ) {
      throw new Error("Campo obrigatório não preenchido: " + campo);
    }
  });
}


function gerarId(prefixo) {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefixo}-${timestamp}-${random}`;
}



function limitarRequisicoes(chave, limite, intervaloMs) {
  const cache = CacheService.getUserCache();
  const agora = Date.now();

  let registros = [];
  try {
    registros = JSON.parse(cache.get(chave) || "[]");
  } catch(e) { registros = []; }

  // Mantém apenas registros dentro do intervalo
  registros = registros.filter(ts => agora - ts < intervaloMs);

  if (registros.length >= limite) {
    const segundos = Math.ceil(intervaloMs / 1000);
    throw new Error(`Muitas ações em pouco tempo. Aguarde ${segundos} segundos antes de tentar novamente.`);
  }

  registros.push(agora);
  cache.put(chave, JSON.stringify(registros), 60);
}


function validarReserva(dados) {
  // Valida formato de horário
  if (!validarFormatoHora(dados.horaInicio) || !validarFormatoHora(dados.horaTermino)) {
    throw new Error("Formato de horário inválido. Use HH:MM (ex: 14:30).");
  }

  // Normaliza horários para minutos
  const ini = normalizarHora(dados.horaInicio);
  const ter = normalizarHora(dados.horaTermino);
  const INICIO_MIN = normalizarHora('08:00');
  const FIM_MAX    = normalizarHora('21:30');

  if (ini === null || ter === null) {
    throw new Error("Não foi possível processar os horários.");
  }

  if (ini < INICIO_MIN || ini >= FIM_MAX) {
    throw new Error("Horário de início deve estar entre 08:00 e 21:29.");
  }

  if (ter > FIM_MAX) {
    throw new Error("Horário de término não pode ultrapassar 21:30.");
  }

  if (ter <= ini) {
    throw new Error("Horário de término deve ser posterior ao início.");
  }

  // Valida nome da ação
  const nomeAcao = String(dados.nomeAcao || '').trim();
  if (nomeAcao.length < 3) {
    throw new Error("Nome da ação deve ter no mínimo 3 caracteres.");
  }

  if (nomeAcao.length > 100) {
    throw new Error("Nome da ação não pode exceder 100 caracteres.");
  }

  return true;
}


function detectarComportamentoSuspeito(acao) {
  const cache = CacheService.getUserCache();
  const chave = "suspeita_" + String(acao).toLowerCase().replace(/\s/g, '_');
  const agora = Date.now();
  const intervalo = 5000; // 5 segundos

  let registros = [];
  try {
    registros = JSON.parse(cache.get(chave) || "[]");
  } catch(e) { registros = []; }

  registros = registros.filter(ts => agora - ts < intervalo);
  registros.push(agora);
  cache.put(chave, JSON.stringify(registros), 30);

  if (registros.length > 2) {
    throw new Error("Ação repetida muito rapidamente. Aguarde alguns segundos e tente novamente.");
  }
}


/**
 * ROLLBACK SELETIVO — recebe o índice da linha no log (contando de baixo para cima)
 * índice 0 = última ação, 1 = penúltima, etc.
 */
function rollbackAcaoPorIndice(emailAtual, indiceLog) {
  verificarPermissao('superadmin', emailAtual);

  const lock = LockService.getScriptLock();
  lock.waitLock(5000);

  try {
    
    const abaLogs = _getSheet('Logs');
    if (!abaLogs || abaLogs.getLastRow() < 2) throw new Error('Nenhum log disponível.');

    const totalLinhas = abaLogs.getLastRow() - 1; // descontar cabeçalho
    const linhaAlvo = abaLogs.getLastRow() - indiceLog; // índice 0 = última linha

    if (linhaAlvo < 2) throw new Error('Índice de log inválido.');

    const log = abaLogs.getRange(linhaAlvo, 1, 1, 8).getValues()[0];

    const acao      = String(log[2] || '').toUpperCase();
    const tipo      = String(log[3] || '').toUpperCase();
    const alvo      = String(log[4] || '');
    const antesRaw  = String(log[6] || '').trim();
    const depoisRaw = String(log[7] || '').trim();

    const parsearDados = raw => {
      if (!raw || raw === '') return null;
      return raw.split(' | ').map(v => v === '-' ? '' : v);
    };

    const dadosAntes  = parsearDados(antesRaw);
    const dadosDepois = parsearDados(depoisRaw);

    const mapaAbas = {
      'RESERVA': 'Reservas', 'ESPACO': 'Configuracoes', 'ESPAÇO': 'Configuracoes',
      'ITEM': 'Itens', 'ADMIN': 'Administradores', 'USUARIO': 'Administradores',
      'SETOR': 'Listas', 'RECE': 'ReservasRECE'
    };

    const abaNome = mapaAbas[tipo];
    if (!abaNome) throw new Error('Tipo desconhecido para rollback: ' + tipo);

    const aba = _getSheet(abaNome);
    if (!aba) throw new Error('Aba não encontrada: ' + abaNome);

    if (acao.includes('EXCLUSÃO')) {
      if (!dadosAntes) throw new Error('Sem dados anteriores para restaurar.');
      aba.appendRow(dadosAntes);
      registrarLog('ROLLBACK', tipo, alvo, 'Restauração após exclusão.', null, dadosAntes, emailAtual);
    } else if (acao.includes('EDIÇÃO')) {
      if (!dadosAntes) throw new Error('Sem dados anteriores para reverter.');
      const id = String(dadosAntes[0]).trim();
      const dados = aba.getDataRange().getValues();
      let revertido = false;
      for (let i = 1; i < dados.length; i++) {
        if (String(dados[i][0]).trim() === id) {
          aba.getRange(i + 1, 1, 1, dadosAntes.length).setValues([dadosAntes]);
          revertido = true; break;
        }
      }
      if (!revertido) throw new Error('Registro não encontrado: ' + id);
      registrarLog('ROLLBACK', tipo, alvo, 'Reversão de edição.', dadosDepois, dadosAntes, emailAtual);
    } else if (acao.includes('CRIAÇÃO') || acao.includes('AGENDAMENTO')) {
      if (!dadosDepois) throw new Error('Sem dados do registro criado.');
      const id = String(dadosDepois[0]).trim();
      const dados = aba.getDataRange().getValues();
      let removido = false;
      for (let i = 1; i < dados.length; i++) {
        if (String(dados[i][0]).trim() === id) {
          aba.deleteRow(i + 1); removido = true; break;
        }
      }
      if (!removido) throw new Error('Registro não encontrado: ' + id);
      registrarLog('ROLLBACK', tipo, alvo, 'Remoção após criação.', dadosDepois, null, emailAtual);
    } else {
      throw new Error("Ação '" + acao + "' não é reversível.");
    }

    limparCacheUsuario(emailAtual);
    return { success: true };

  } catch (e) {
    throw new Error('Erro no rollback: ' + e.message);
  } finally {
    lock.releaseLock();
  }
}


function validarDisponibilidadeItens(itensSolicitados) {
  
  const abaItens = _getSheet("Itens");
  if (!abaItens) return;

  const dados = abaItens.getDataRange().getValues();

  // transforma "4x Microfone" em objeto
  const parseItens = (str) => {
    if (!str || str === "Nenhum") return [];

    return str.split('|').map(i => {
      const partes = i.trim().split('x');
      return {
        qtd: Number(partes[0]),
        nome: partes[1]?.trim()
      };
    });
  };

  const itens = parseItens(itensSolicitados);

  itens.forEach(item => {

    const linha = dados.find(l => String(l[1]).trim() === item.nome);

    if (!linha) return;

    const total = Number(linha[3] || 0);

    if (item.qtd > total) {
      throw new Error(`Estoque insuficiente para "${item.nome}". Disponível: ${total}`);
    }
  });
}




function verificarDisponibilidadeItensPorHorario(itensSolicitados, data, inicio, termino, idSala) {
  if (!itensSolicitados || itensSolicitados === "Nenhum") return;

  const disponibilidade = obterDisponibilidadeItensPorHorario(data, inicio, termino, idSala || null);

  const parseItens = (str) => {
    if (!str || str === "Nenhum") return [];
    return str.split(/[|]/).map(i => {
      const semFixo = i.trim().replace(/\s*\(fixo\)\s*/gi, '');
      const p = semFixo.split('x ');
      return { qtd: Number(p[0]) || 0, nome: (p[1] || '').trim() };
    }).filter(i => i.nome && i.qtd > 0);
  };

  parseItens(itensSolicitados).forEach(item => {
    const disponivel = disponibilidade[item.nome] ?? 0;
    if (item.qtd > disponivel) {
      throw new Error(
        `Item "${item.nome}" indisponível neste horário.\nDisponível: ${disponivel} | Solicitado: ${item.qtd}`
      );
    }
  });
}

/**
 * AUXILIAR: Parse de string de itens "Qtd x Nome | Qtd x Nome"
 * Remove marcadores (fixo) e retorna array de { qtd, nome }
 */
function parseItensString(str) {
  if (!str || str === "Nenhum") return [];
  
  return str.split(/[|]/).map(item => {
    const semFixo = item.trim().replace(/\s*\(fixo\)\s*/gi, '');
    const partes = semFixo.split('x ');
    return { 
      qtd: Number(partes[0]) || 0, 
      nome: (partes[1] || '').trim() 
    };
  }).filter(i => i.nome && i.qtd > 0);
}

function obterDisponibilidadeItensPorHorario(data, inicio, termino, idSalaContexto) {
  try {
    const abaItens = _getSheet("Itens");
    const abaReservas = _getSheet("Reservas");

    if (!abaItens) return {};

    const itens = abaItens.getDataRange().getValues();
    const reservas = abaReservas ? abaReservas.getDataRange().getValues() : [];

    // Normaliza inputs usando utils centralizados
    const dataBusca = normalizarData(data);
    const inicioMin = normalizarHora(inicio);
    const terminoMin = normalizarHora(termino);

    if (dataBusca === null || inicioMin === null || terminoMin === null) {
      return {};
    }

    // Monta mapa com estoque disponível de cada item
    const disponibilidade = {};
    itens.slice(1).forEach(item => {
      const nome = String(item[1] || '').trim();
      if (!nome) return;

      const estoqueAlmox = sanitizarNumero(item[3], 0, 100000);
      let qtdNaSala = 0;

      if (idSalaContexto) {
        try {
          const mapa = JSON.parse(String(item[4] || '{}'));
          qtdNaSala = sanitizarNumero(mapa[String(idSalaContexto).trim()] || 0, 0);
        } catch (e) {
          // JSON inválido — ignora
        }
      }

      // Disponível = estoque no almoxarifado + o que já está fixado na sala
      disponibilidade[nome] = estoqueAlmox + qtdNaSala;
    });

    // Desconta o que está comprometido em reservas sobrepostas
    reservas.slice(1).forEach(r => {
      if (compararStrings(r[13], 'CANCELADO')) return;

      const dataReserva = normalizarData(r[1]);
      if (dataReserva === null || dataReserva !== dataBusca) return;

      const ini = normalizarHora(r[2]);
      const ter = normalizarHora(r[3]);
      
      if (ini === null || ter === null) return;
      if (!horariosSobrepostos(inicioMin, terminoMin, ini, ter)) return;

      const salaDaReserva = String(r[4] || '').trim();

      parseItensString(r[12]).forEach(ir => {
        if (disponibilidade[ir.nome] === undefined) return;

        // Se o item é fixo na mesma sala: não desconta (ele já está lá)
        let ehFixoNaMesmaSala = false;
        
        if (idSalaContexto && salaDaReserva === String(idSalaContexto).trim()) {
          const itemDados = itens.slice(1).find(i => 
            compararStrings(String(i[1] || ''), ir.nome)
          );
          
          if (itemDados) {
            try {
              const mapa = JSON.parse(String(itemDados[4] || '{}'));
              if (sanitizarNumero(mapa[String(idSalaContexto).trim()] || 0) > 0) {
                ehFixoNaMesmaSala = true;
              }
            } catch (e) {
              // JSON inválido — ignora
            }
          }
        }

        if (!ehFixoNaMesmaSala) {
          disponibilidade[ir.nome] -= ir.qtd;
        }
      });
    });

    return disponibilidade;

  } catch (e) {
    logarErroSeguro('obterDisponibilidadeItensPorHorario', e);
    return {};
  }
}

/**
 * SALVAR RESERVA RECE — usa responsavel do objeto dados
 * Com lock melhorado (timeout 10s + retry)
 */
function salvarReservaRece(dados) {
  if (!dados.responsavel || !validarEmail(dados.responsavel)) {
    throw new Error('Email do responsável inválido.');
  }

  let lock;
  try {
    lock = obterLockComRetry('salvarReservaRece', 10000, 3);

    const aba = _getSheet("ReservasRECE");
    if (!aba) throw new Error("Aba ReservasRECE não encontrada. Execute o Setup.");

    if (!dados.titulo || !dados.dataInicio || !dados.horaInicio || !dados.horaTermino) {
      throw new Error("Preencha todos os campos obrigatórios da Agenda RECE.");
    }

    const id = dados.id ? String(dados.id).trim() : null;
    const dataSolicitacao = new Date();
    const responsavel = normalizarEmail(dados.responsavel);

    // Data término: usa a fornecida ou copia a data início
    const dataTermino = (dados.dataTermino && String(dados.dataTermino).trim())
      ? String(dados.dataTermino).trim()
      : String(dados.dataInicio).trim();

    const linha = [
      id || gerarId("REC"),
      dados.titulo,
      dados.dataInicio,
      dataTermino,
      dados.horaInicio,
      dados.horaTermino,
      dados.espaco || "",
      dados.categorias || "",
      dados.parceiros || "",
      dados.acessibilidades || "",
      dados.classificacao || "",
      dados.publicoAlvo || "",
      dados.artista || "",
      dados.linkInscricao || "",
      dados.acesso || "",
      dados.descricao || "",
      dados.observacoes || "",
      "CONFIRMADO",
      responsavel,
      dataSolicitacao,
      dados.imagemUrl || "",
      dados.convidadosInternos || "",
      dados.eventoInstitucional ? "SIM" : "",
      dados.convidadosExternos || "",
      dados.idReservaGeral || ""   // col 25 — vínculo com Reservas
    ];

    if (id) {
      // Edição
      const dados_ = aba.getDataRange().getValues();
      for (let i = 1; i < dados_.length; i++) {
        if (String(dados_[i][0]).trim() === id) {
          aba.getRange(i + 1, 1, 1, linha.length).setValues([linha]);
          registrarLog("EDIÇÃO", "RECE", dados.titulo, "ID: " + id, dados_[i], linha, responsavel);
          limparCacheUsuario(responsavel);
          return { success: true, id };
        }
      }
      throw new Error("Registro RECE não encontrado para edição.");
    } else {
      aba.appendRow(linha);
      registrarLog("CRIAÇÃO", "RECE", dados.titulo, "Criado via formulário.", null, linha, responsavel);
      limparCacheUsuario(responsavel);
      return { success: true, id: linha[0] };
    }
  } catch (e) {
    throw new Error(e.message);
  } finally {
    if (lock) lock.releaseLock();
  }
}

/**
 * OBTER RESERVAS RECE
 */
function obterReservasRece() {
  try {
    
    const aba = _getSheet("ReservasRECE");
    if (!aba || aba.getLastRow() < 2) return [];
    return aba.getRange(2, 1, aba.getLastRow() - 1, 25).getDisplayValues();
  } catch(e) {
    console.error("Erro em obterReservasRece:", e.message);
    return [];
  }
}

/**
 * CANCELAR RESERVA RECE — recebe emailAtual
 */
function cancelarReservaRece(id, emailAtual) {
  try {
    if (!emailAtual) throw new Error('Email não identificado.');
    
    const aba = _getSheet('ReservasRECE');
    const dados = aba.getDataRange().getValues();
    for (let i = 1; i < dados.length; i++) {
      if (String(dados[i][0]).trim() === id) {
        const ehComunicacao = verificarPermissaoRece(emailAtual);
        if (!ehComunicacao) verificarDonoOuAdmin(dados[i][18], emailAtual);
        aba.getRange(i + 1, 18).setValue('CANCELADO');
        registrarLog('CANCELAMENTO', 'RECE', dados[i][1], 'ID: ' + id,
          'CONFIRMADO', 'CANCELADO', emailAtual);
        return true;
      }
    }
    return false;
  } catch (e) {
    throw new Error(e.message);
  }
}

/**
 * EXCLUIR RESERVA RECE — recebe emailAtual
 */
function excluirReservaRece(id, emailAtual) {
  try {
    verificarPermissao('admin', emailAtual);
    
    const aba = _getSheet('ReservasRECE');
    const dados = aba.getDataRange().getValues();
    for (let i = 1; i < dados.length; i++) {
      if (String(dados[i][0]).trim() === id) {
        registrarLog('EXCLUSÃO', 'RECE', dados[i][1], 'ID: ' + id,
          dados[i], null, emailAtual);
        aba.deleteRow(i + 1);
        limparCacheUsuario(emailAtual);
        return true;
      }
    }
    throw new Error('Registro não encontrado.');
  } catch (e) {
    throw new Error(e.message);
  }
}

/**
 * REGISTRAR ACESSO — chamada automaticamente em obterDadosIniciais
 */
function registrarAcesso(emailUsuario, nivelAcesso) {
  try {
    
    const aba = _getSheet('LogAcessos');
    if (!aba) return;

    // Evita registrar acessos repetidos do mesmo usuário em menos de 5 minutos
    const cache = CacheService.getUserCache();
    const chaveAcesso = 'acesso_' + emailUsuario.replace(/[^a-z0-9]/g, '_');
    if (cache.get(chaveAcesso)) return; // já registrou recentemente
    cache.put(chaveAcesso, '1', 300); // 5 minutos

    const nomeUsuario = emailUsuario.split('@')[0];
    aba.appendRow([
      new Date(),
      emailUsuario,
      nomeUsuario,
      nivelAcesso || 'usuário',
      '', // IP não disponível no GAS server-side
      ''  // User Agent não disponível no GAS server-side
    ]);
  } catch(e) {
    console.error('Erro ao registrar acesso:', e.message);
  }
}

/**
 * OBTER LOG DE ACESSOS — para admins
 */
function obterLogAcessos(emailUsuario) {
  try {
    const email = emailUsuario || Session.getActiveUser()?.getEmail() || Session.getEffectiveUser()?.getEmail();
    verificarPermissao("admin", email);
    
    const aba = _getSheet('LogAcessos');
    if (!aba || aba.getLastRow() < 2) return '[]';
    const dados = aba.getRange(2, 1, aba.getLastRow() - 1, 6).getDisplayValues();
    return JSON.stringify(dados.reverse());
  } catch(e) {
    throw new Error(e.message);
  }
}

/**
 * MÉTRICAS PARA DASHBOARD
 */
function obterMetricasDashboard(dataInicio, dataFim, filtroSala, filtroSetor) {
  try {
    
    const abaReservas = _getSheet('Reservas');
    const abaItens    = _getSheet('Itens');
    const abaLogs     = _getSheet('LogAcessos');
    const porDiaSemana = { 0:'Domingo', 1:'Segunda', 2:'Terça', 3:'Quarta', 4:'Quinta', 5:'Sexta', 6:'Sábado' };
    const contagemDias   = {};
    const contagemMeses  = {};
    const contagemHoras  = {};
    const temposPorSala  = {}; 
    const temposPorItem  = {}; 

    // Converte filtros de string YYYY-MM-DD para Date
    const parseFiltro = str => {
      if (!str) return null;
      const p = str.split('-');
      if (p.length === 3) { const d = new Date(p[0], p[1]-1, p[2]); d.setHours(0,0,0,0); return d; }
      return null;
    };
    const filtroInicio = parseFiltro(dataInicio);
    const filtroFim    = parseFiltro(dataFim);
    if (filtroFim) filtroFim.setHours(23,59,59,999);
    const filtroSalaStr  = String(filtroSala  || '').trim();
    const filtroSetorStr = String(filtroSetor || '').trim();

    const todasReservas = abaReservas && abaReservas.getLastRow() > 1
      ? abaReservas.getRange(2, 1, abaReservas.getLastRow() - 1, 16).getValues()
      : [];

    // Filtra por período
    const reservas = todasReservas.filter(r => {
      // Filtro de sala e setor — sempre aplicado
      if (filtroSalaStr  && String(r[4]).trim() !== filtroSalaStr)  return false;
      if (filtroSetorStr && String(r[9]).trim() !== filtroSetorStr) return false;

      // Filtro de período — só se houver datas
      if (!filtroInicio && !filtroFim) return true;
      try {
        const raw = r[1];
        let d;
        if (raw instanceof Date) {
          d = new Date(raw);
        } else {
          const str = String(raw || '').trim();
          if (str.includes('/')) { const p = str.split('/'); d = new Date(p[2], p[1]-1, p[0]); }
          else if (str.includes('-')) { d = new Date(str); }
        }
        if (!d || isNaN(d.getTime())) return true;
        d.setHours(0,0,0,0);
        if (filtroInicio && d < filtroInicio) return false;
        if (filtroFim    && d > filtroFim)    return false;
        return true;
      } catch(e) { return true; }
    });

    let total = 0, confirmadas = 0, canceladas = 0;
    const porSala = {}, porSetor = {}, porTurno = {}, porMes = {};
    const cancelPorSala = {}, cancelPorSetor = {};
    const contagemItens = {};

    reservas.forEach(r => {
      total++;
      const status = String(r[13] || '').toUpperCase();
      const sala   = String(r[4]  || 'Não informado');
      const setor  = String(r[9]  || 'Não informado');
      const turno  = String(r[5]  || 'Não informado');

      porSala[sala]   = (porSala[sala]   || 0) + 1;
      porSetor[setor] = (porSetor[setor] || 0) + 1;
      porTurno[turno] = (porTurno[turno] || 0) + 1;

      if (status === 'CONFIRMADO') confirmadas++;
      if (status === 'CANCELADO') {
        canceladas++;
        cancelPorSala[sala]   = (cancelPorSala[sala]   || 0) + 1;
        cancelPorSetor[setor] = (cancelPorSetor[setor] || 0) + 1;
      }

      const itensStr = String(r[12] || '');
      if (itensStr && itensStr !== 'Nenhum') {
        itensStr.split(/[|]/).forEach(i => {
          const semFixo = i.trim().replace(/\s*\(fixo\)\s*/gi, '');
          const p = semFixo.split('x ');
          const qtd  = Number(p[0]) || 0;
          const nome = (p[1] || '').trim();
          if (nome && qtd > 0) contagemItens[nome] = (contagemItens[nome] || 0) + qtd;
        });
      }

      try {
        const raw = r[1];
        let dataObj;
        if (raw instanceof Date) { dataObj = raw; }
        else {
          const str = String(raw || '').trim();
          if (str.includes('/')) { const p = str.split('/'); dataObj = new Date(p[2], p[1]-1, p[0]); }
        }
        if (dataObj && !isNaN(dataObj.getTime())) {
          const chave = `${dataObj.getFullYear()}-${String(dataObj.getMonth()+1).padStart(2,'0')}`;
          porMes[chave] = (porMes[chave] || 0) + 1;
        }
      } catch(e) {}

      try {
        const raw = r[1];
        let d;
        if (raw instanceof Date) { d = new Date(raw); }
        else {
          const str = String(raw || '').trim();
          if (str.includes('/')) { const p = str.split('/'); d = new Date(p[2], p[1]-1, p[0]); }
          else if (str.includes('-')) { d = new Date(str); }
        }
        if (d && !isNaN(d.getTime())) {
          const nomeDia  = porDiaSemana[d.getDay()];
          const nomeMesR = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][d.getMonth()] + '/' + d.getFullYear();
          contagemDias[nomeDia]   = (contagemDias[nomeDia]   || 0) + 1;
          contagemMeses[nomeMesR] = (contagemMeses[nomeMesR] || 0) + 1;
        }
      } catch(e) {}

      const _toMinH = v => {
        if (v instanceof Date) return v.getHours()*60+v.getMinutes();
        const s = String(v||'').trim();
        if (!s.includes(':')) return null;
        const p = s.split(':');
        return parseInt(p[0])*60+parseInt(p[1]);
      };
      const _iniH = _toMinH(r[2]), _terH = _toMinH(r[3]);
      if (_iniH !== null && _terH !== null && _terH > _iniH) {
        // Conta cada hora cheia coberta pela reserva
        const _h1 = Math.floor(_iniH/60), _h2 = Math.ceil(_terH/60);
        for (let _hh = _h1; _hh < _h2; _hh++) {
          const _hStr = String(_hh).padStart(2,'0')+'h';
          contagemHoras[_hStr] = (contagemHoras[_hStr]||0) + 1;
        }
      }

      
      const calcMinutos = (ini, ter) => {
        const toMin = v => {
          if (v instanceof Date) return v.getHours() * 60 + v.getMinutes();
          const str = String(v || '').trim();
          if (!str.includes(':')) return null;
          const p = str.split(':');
          return parseInt(p[0]) * 60 + parseInt(p[1]);
        };
        const i = toMin(ini), t = toMin(ter);
        return (i !== null && t !== null && t > i) ? t - i : null;
      };

      const mins = calcMinutos(r[2], r[3]);
      if (mins !== null) {
        const sala = String(r[4] || '').trim();
        if (sala) {
          if (!temposPorSala[sala]) temposPorSala[sala] = [];
          temposPorSala[sala].push(mins);
        }

        const itensStr = String(r[12] || '');
        if (itensStr && itensStr !== 'Nenhum') {
          itensStr.split(/[|]/).forEach(i => {
            const semFixo = i.trim().replace(/\s*\(fixo\)\s*/gi, '');
            const p = semFixo.split('x ');
            const nome = (p[1] || '').trim();
            if (nome) {
              if (!temposPorItem[nome]) temposPorItem[nome] = [];
              temposPorItem[nome].push(mins);
            }
          });
        }
      }
    });

    const top5Salas             = Object.entries(porSala).sort((a,b) => b[1]-a[1]).slice(0,5);
    const top5Setores           = Object.entries(porSetor).sort((a,b) => b[1]-a[1]).slice(0,5);
    const ultimos6Meses         = Object.entries(porMes).sort().slice(-6);
    const cancelamentosPorSala  = Object.entries(cancelPorSala).sort((a,b) => b[1]-a[1]).slice(0,5);
    const cancelamentosPorSetor = Object.entries(cancelPorSetor).sort((a,b) => b[1]-a[1]).slice(0,5);
    const topItens              = Object.entries(contagemItens).sort((a,b) => b[1]-a[1]).slice(0,5);
    
    const ordemDias  = ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];
    const ordemMeses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

    const diasSemana = ordemDias.map(d => [d, contagemDias[d] || 0]);
    const mesesAno = Object.entries(contagemMeses)
    .sort((a, b) => {
      const [mA, yA] = a[0].split('/'); const [mB, yB] = b[0].split('/');
      const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
      return (Number(yA) - Number(yB)) || (meses.indexOf(mA) - meses.indexOf(mB));
    })
    .filter(([,v]) => v > 0);
    const horasPico = Object.entries(contagemHoras).sort((a, b) => {
      return parseInt(a[0].replace('h', '')) - parseInt(b[0].replace('h', ''));
    });

    const mediaMin = arr => arr.length > 0 ? Math.round(arr.reduce((a,b) => a+b, 0) / arr.length) : 0;
    const fmtDuracao = m => {
      const h = Math.floor(m / 60);
      const min = m % 60;
      return h > 0 ? `${h}h${min > 0 ? min + 'min' : ''}` : `${min}min`;
    };

    const mediaOcupacaoPorSala = Object.entries(temposPorSala)
      .map(([sala, arr]) => [sala, mediaMin(arr), arr.length])
      .sort((a, b) => b[2] - a[2])
      .slice(0, 6);

    const mediaUsoItens = Object.entries(temposPorItem)
      .map(([nome, arr]) => [nome, mediaMin(arr), arr.length])
      .sort((a, b) => b[2] - a[2])
      .slice(0, 6);

    let habilitadas = 0;
    reservas.forEach(r => { if (String(r[13]||'').toUpperCase()==='HABILITADO') habilitadas++; });

    // Solicitações pendentes
    let solPendentes = 0, solAprovadas = 0, solRecusadas = 0;
    try {
      const abaSol = _getSheet('Solicitacoes');
      if (abaSol && abaSol.getLastRow() > 1) {
        abaSol.getRange(2,1,abaSol.getLastRow()-1,9).getValues().forEach(r => {
          const st = String(r[8]||'').toUpperCase();
          if (st==='PENDENTE') solPendentes++;
          else if (st==='APROVADO') solAprovadas++;
          else if (st==='RECUSADO') solRecusadas++;
        });
      }
    } catch(e) {}

    let itensDisponiveis = 0, itensFixados = 0;
    if (abaItens && abaItens.getLastRow() > 1) {
      const itens = abaItens.getRange(2, 1, abaItens.getLastRow() - 1, 5).getValues();
      itens.forEach(i => {
        itensDisponiveis += Number(i[3] || 0);
        try {
          const mapa = JSON.parse(String(i[4] || '{}'));
          itensFixados += Object.values(mapa).reduce((a,v) => a + Number(v), 0);
        } catch(e) {}
      });
    }

    let acessosUnicos30d = 0;
    if (abaLogs && abaLogs.getLastRow() > 1) {
      const logs   = abaLogs.getRange(2, 1, abaLogs.getLastRow() - 1, 3).getValues();
      const limite = new Date(); limite.setDate(limite.getDate() - 30);
      const emailsVistos = new Set();
      logs.forEach(l => { try { if (new Date(l[0]) >= limite) emailsVistos.add(l[1]); } catch(e) {} });
      acessosUnicos30d = emailsVistos.size;
    }

    let codip = {
      totalEstimado: 0,
      totalReal: 0,
      totalRegistros: 0,
      taxaPresenca: 0
    };

    try {
      const abaCodip = _getSheet('RelatoriosCODIP');

      const dataInicioObj = dataInicio ? new Date(dataInicio) : null;
      const dataFimObj = dataFim ? new Date(dataFim) : null;

      if (abaCodip && abaCodip.getLastRow() > 1) {

        const dadosCodip = abaCodip
          .getRange(2, 1, abaCodip.getLastRow() - 1, 33)
          .getValues();

        dadosCodip.forEach(linha => {

          const dataRegistro = new Date(linha[32]);

          if (dataInicioObj && dataRegistro < dataInicioObj) return;
          if (dataFimObj && dataRegistro > dataFimObj) return;

          const estimado = Number(linha[13] || 0);

          codip.totalEstimado += estimado;
          codip.totalReal += estimado;
        });

        codip.totalRegistros = dadosCodip.length;

        codip.taxaPresenca = codip.totalEstimado > 0
          ? Math.round((codip.totalReal / codip.totalEstimado) * 100)
          : 0;
      }

    } catch(e) {
      console.error('Erro CODIP dashboard:', e);
    }

    return {
      total, confirmadas, canceladas,
      taxaCancelamento: total > 0 ? Math.round((canceladas / total) * 100) : 0,
      porSalaTotal: porSala,
      porSetor,
      porTurno,
      top5Salas,
      top5Setores,
      ultimos6Meses,
      cancelamentosPorSala,
      cancelamentosPorSetor,
      topItens,
      itensDisponiveis,
      itensFixados,
      acessosUnicos30d,
      diasSemana,
      mesesAno,
      mediaOcupacaoPorSala,
      mediaUsoItens,
      horasPico,
      habilitadas,
      solPendentes,
      solAprovadas,
      solRecusadas,
      total,
      confirmadas,
      canceladas,

      taxaCancelamento: total > 0 ? Math.round((canceladas / total) * 100) : 0,

      codip

    };
  } catch(e) {
    console.error('Erro em obterMetricasDashboard:', e.message);
    throw new Error(e.message);
  }
}

function obterDadosGraficoReservas() {
  try {
    
    const aba = _getSheet('Reservas');
    if (!aba || aba.getLastRow() < 2) return { labels: [], valores: [], tipo: 'bar', titulo: 'Reservas' };
    const dados = aba.getRange(2, 1, aba.getLastRow() - 1, 16).getValues();
    const contagem = {};
    dados.forEach(r => {
      if (String(r[13] || '').toUpperCase() === 'CANCELADO') return;
      const sala = String(r[4] || '').trim();
      if (sala) contagem[sala] = (contagem[sala] || 0) + 1;
    });
    const mapaSalas = obterMapaSalas();
    const sorted = Object.entries(contagem).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return {
      labels: sorted.map(([id]) => mapaSalas[id] || id),
      valores: sorted.map(([, v]) => v),
      tipo: 'bar',
      titulo: 'Reservas por Espaço'
    };
  } catch (e) {
    console.error('Erro em obterDadosGraficoReservas:', e.message);
    return { labels: [], valores: [], tipo: 'bar', titulo: 'Reservas' };
  }
}

function obterPerfilUsuario() {
  try {
    const email = obterEmailUsuario('');
    let nome = email.split('@')[0];
    let foto = null;

    try {
      const url = 'https://people.googleapis.com/v1/people/me?personFields=names,photos';
      const res  = UrlFetchApp.fetch(url, {
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
      });
      const data = JSON.parse(res.getContentText());
      nome = data.names?.[0]?.displayName || nome;
      foto = data.photos?.[0]?.url        || null;
    } catch(e) {}

    return { email, nome, foto };
  } catch(e) {
    throw new Error(e.message);
  }
}

function obterUrlLogout() {
  try {
    const appUrl = ScriptApp.getService().getUrl();
    return 'https://accounts.google.com/Logout?continue=' + encodeURIComponent(appUrl);
  } catch(e) {
    return 'https://accounts.google.com/logout';
  }
}


/**
 * ROLLBACK POR TIMESTAMP
 * Localiza a linha do log pelo valor exato da coluna Data/Hora,
 * eliminando dependência de índices posicionais que mudam com filtros.
 */
function rollbackAcaoPorTimestamp(emailAtual, timestampStr) {
  verificarPermissao('superadmin', emailAtual);

  if (!timestampStr || String(timestampStr).trim() === '') {
    throw new Error('Timestamp inválido para rollback.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(5000);

  try {
    
    const abaLogs = _getSheet('Logs');
    if (!abaLogs || abaLogs.getLastRow() < 2) throw new Error('Nenhum log disponível.');

    const dados = abaLogs.getRange(2, 1, abaLogs.getLastRow() - 1, 8).getDisplayValues();

    // Localiza a linha pelo timestamp exato (coluna 0)
    let linhaAlvo = -1;
    for (let i = 0; i < dados.length; i++) {
      if (String(dados[i][0]).trim() === String(timestampStr).trim()) {
        linhaAlvo = i;
        break;
      }
    }

    if (linhaAlvo === -1) throw new Error('Entrada de log não encontrada: ' + timestampStr);

    const log = dados[linhaAlvo];

    const acao     = String(log[2] || '').toUpperCase();
    const tipo     = String(log[3] || '').toUpperCase();
    const alvo     = String(log[4] || '');
    const antesRaw = String(log[6] || '').trim();
    const depoisRaw= String(log[7] || '').trim();

    const parsearDados = raw => {
      if (!raw || raw === '') return null;
      return raw.split(' | ').map(v => v === '-' ? '' : v);
    };

    const dadosAntes  = parsearDados(antesRaw);
    const dadosDepois = parsearDados(depoisRaw);

    const mapaAbas = {
      'RESERVA': 'Reservas', 'ESPACO': 'Configuracoes', 'ESPAÇO': 'Configuracoes',
      'ITEM': 'Itens', 'ADMIN': 'Administradores', 'USUARIO': 'Administradores',
      'SETOR': 'Listas', 'RECE': 'ReservasRECE'
    };

    const abaNome = mapaAbas[tipo];
    if (!abaNome) throw new Error('Tipo desconhecido para rollback: ' + tipo);

    const aba = _getSheet(abaNome);
    if (!aba) throw new Error('Aba não encontrada: ' + abaNome);

    if (acao.includes('EXCLUSÃO')) {
      if (!dadosAntes) throw new Error('Sem dados anteriores para restaurar.');
      aba.appendRow(dadosAntes);
      registrarLog('ROLLBACK', tipo, alvo, 'Restauração após exclusão. Ref: ' + timestampStr,
        null, dadosAntes, emailAtual);

    } else if (acao.includes('EDIÇÃO')) {
      if (!dadosAntes) throw new Error('Sem dados anteriores para reverter.');
      const id = String(dadosAntes[0]).trim();
      const registros = aba.getDataRange().getValues();
      let revertido = false;
      for (let i = 1; i < registros.length; i++) {
        if (String(registros[i][0]).trim() === id) {
          aba.getRange(i + 1, 1, 1, dadosAntes.length).setValues([dadosAntes]);
          revertido = true; break;
        }
      }
      if (!revertido) throw new Error('Registro não encontrado para reverter: ' + id);
      registrarLog('ROLLBACK', tipo, alvo, 'Reversão de edição. Ref: ' + timestampStr,
        dadosDepois, dadosAntes, emailAtual);

    } else if (acao.includes('CRIAÇÃO') || acao.includes('AGENDAMENTO')) {
      if (!dadosDepois) throw new Error('Sem dados do registro criado.');
      const id = String(dadosDepois[0]).trim();
      const registros = aba.getDataRange().getValues();
      let removido = false;
      for (let i = 1; i < registros.length; i++) {
        if (String(registros[i][0]).trim() === id) {
          aba.deleteRow(i + 1); removido = true; break;
        }
      }
      if (!removido) throw new Error('Registro não encontrado para remover: ' + id);
      registrarLog('ROLLBACK', tipo, alvo, 'Remoção após criação. Ref: ' + timestampStr,
        dadosDepois, null, emailAtual);

    } else {
      throw new Error("Ação '" + acao + "' não é reversível.");
    }

    limparCacheUsuario(emailAtual);
    return { success: true };

  } catch (e) {
    throw new Error('Erro no rollback: ' + e.message);
  } finally {
    lock.releaseLock();
  }
}

function chamarIA(prompt) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GROQ_API_KEY');
  if (!apiKey) return { ok: false, texto: 'Chave GROQ_API_KEY não configurada nas propriedades do script.' };

  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const payload = {
    model: 'llama-3.1-8b-instant',
    messages: [
      { role: 'system', content: 'Você é o Bêjotinha, um especialista em gestão de espaços do Centro Cultural Bom Jardim (CCBJ), equipamento público de cultura localizado no bairro Bom Jardim, em Fortaleza/CE. O CCBJ é vinculado à Secretaria de Cultura do Ceará e gerido em parceria pelo Instituto Dragão do Mar e atende comunidades em situação de vulnerabilidade social com programação gratuita de arte, cultura e educação. Seus espaços incluem teatro, sala de dança, biblioteca, multigaleria, estúdio, sala multiuso, praça central e áreas abertas/de convivência/espaços alternativos. Todos os espaços são também sala de aula. A programação envolve oficinas, espetáculos, mostras, formações e eventos comunitários. Há 3 setores finalísticos: Escola de Cultura e Artes (Formação), Ação Cultural (Difusão e Fruição) e NArTE - Núcleo de Articulação Técnica Especializada (Cidadania Cultural e Direitos Humanos); além de 3 setores meio: Comunicação, Administrativo/Financeiro e Gestão. O sistema registra reservas internas de espaços pelos setores institucionais, com controle de itens do almoxarifado. Responda sempre em português, de forma clara, objetiva e estruturada. Use markdown simples (negrito, listas) quando ajudar na leitura.' },
      { role: 'user', content: prompt }
    ],
    max_tokens: 2048,
    temperature: 0.4
  };

  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + apiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const json = JSON.parse(response.getContentText());
    if (json.error) return { ok: false, texto: 'Erro da API: ' + json.error.message };
    if (json.choices && json.choices[0]) {
      return { ok: true, texto: json.choices[0].message.content };
    }
    return { ok: false, texto: 'Resposta inesperada da API.' };
  } catch (e) {
    return { ok: false, texto: 'Erro ao chamar a API: ' + e.message };
  }
}

function gerarRelatorioIA(filtros) {
  try {
    const reservasBruto = obterReservas();
    if (!reservasBruto || reservasBruto.length === 0) {
      return { ok: false, texto: 'Não há reservas no sistema para analisar.' };
    }

    // ✅ MAPA PADRÃO CORRETO
    const salaMap = obterMapaSalas();

    // Monta objetos legíveis
    const reservas = reservasBruto.map(r => ({
      id: r[0],
      data: r[1],
      inicio: r[2],
      termino: r[3],
      sala: salaMap[String(r[4]).trim()] || r[4],
      turno: r[5],
      acao: r[6],
      tipo: r[7],
      responsavel: r[8],
      setor: r[9],
      itens: r[12],
      status: r[13]
    }));

    // Filtro de período
    const hoje = new Date();
    const filtradas = reservas.filter(r => {
      if (!r.data) return true;
      const p = String(r.data).split('/');
      if (p.length !== 3) return true;

      const d = new Date(p[2], p[1]-1, p[0]);

      if (filtros.periodo === 'hoje') {
        return d.toDateString() === hoje.toDateString();
      }

      if (filtros.periodo === '7dias') {
        const lim = new Date(hoje);
        lim.setDate(hoje.getDate() + 7);
        return d >= hoje && d <= lim;
      }

      if (filtros.periodo === '30dias') {
        const lim = new Date(hoje);
        lim.setDate(hoje.getDate() + 30);
        return d >= hoje && d <= lim;
      }

      return true;
    });

    // Filtro usuário
    const emailAtivo = Session.getActiveUser().getEmail();

    const amostra = (
      filtros.usuario === 'minhas'
        ? filtradas.filter(r =>
            String(r.responsavel).toLowerCase().includes(emailAtivo.toLowerCase())
          )
        : filtradas
    ).slice(0, 60);

    if (amostra.length === 0) {
      return { ok: false, texto: 'Nenhuma reserva encontrada com os filtros aplicados.' };
    }

    const instrucoes = {
      uso: 'Analise o padrão de uso dos espaços: quais salas são mais usadas, em quais turnos, por quais setores. Identifique subutilização e picos.',
      conflitos: 'Identifique APENAS reservas com sobreposição real de horário na MESMA sala na MESMA data. Considere conflito somente quando dois registros têm mesma sala, mesma data, e os intervalos de horário se sobrepõem (início de um é menor que término do outro e vice-versa). Não aponte como conflito reservas em salas diferentes, datas diferentes, ou que apenas ficam próximas no horário sem sobreposição. Liste os conflitos reais encontrados com sala, data e horários exatos.',
      itens: 'Analise o uso dos itens e equipamentos: quais são mais solicitados, por quais setores, se há padrão de uso que indica falta de recursos.',
      otimizacao: 'Sugira melhorias operacionais concretas para o CCBJ com base nos dados: redistribuição de horários, aquisição de recursos, reorganização de setores. Lembre-se que se trata de ações de agendamento interno, então não aponte propostas de melhorias para agendamentos externos aos setores do CCBJ'
    };

    const prompt = `${instrucoes[filtros.tipo] || instrucoes.uso}

REGRAS:
- Use SOMENTE os dados abaixo
- Seja específico com nomes, horários e números reais dos dados
- Formato: título em negrito, lista de insights, conclusão com recomendações práticas
- Máximo 500 palavras


DADOS (${amostra.length} reservas):
${JSON.stringify(amostra)}`;

    return chamarIA(prompt);

  } catch(e) {
    return { ok: false, texto: 'Erro interno: ' + e.message };
  }
}

function perguntarIA(pergunta) {
  try {
    

    // 🔥 PRIMEIRO: mapa de salas
    const salaMap = obterMapaSalas();

    const reservasBruto = obterReservas();
    const reservas = (reservasBruto || []).slice(0, 60).map(r => ({
      data: r[1],
      inicio: r[2],
      termino: r[3],
      sala: salaMap[String(r[4] || '').trim()] || r[4],
      turno: r[5],
      acao: r[6],
      responsavel: r[8],
      setor: r[9],
      itens: r[12],
      status: r[13]
    }));

    // ===== SALAS =====
    const configSheet = _getSheet('Configuracoes');
    const salas = configSheet && configSheet.getLastRow() > 1
      ? configSheet.getRange(2, 1, configSheet.getLastRow()-1, 3).getValues()
          .map(s => ({
            id: String(s[0]).trim(),
            nome: String(s[1]).trim(),
            capacidade: Number(s[2]) || 0
          }))
      : [];

    // ===== ITENS =====
    const itensSheet = _getSheet('Itens');
    const itens = itensSheet && itensSheet.getLastRow() > 1
      ? itensSheet.getRange(2, 1, itensSheet.getLastRow()-1, 4).getValues()
          .map(i => ({
            nome: i[1],
            categoria: i[2],
            qtdDisponivel: i[3]
          }))
      : [];

    // ===== SETORES =====
    const setoresSheet = _getSheet('Listas');
    const setores = setoresSheet && setoresSheet.getLastRow() > 1
      ? setoresSheet.getRange(2, 1, setoresSheet.getLastRow()-1, 1)
          .getValues()
          .map(s => String(s[0]).trim())
          .filter(Boolean)
      : [];

    // ===== HISTÓRICO =====
    let perguntaFinal = pergunta;
    try {
      const parsed = JSON.parse(pergunta);
      if (Array.isArray(parsed)) {
        perguntaFinal = parsed.map(m => `${m.role}: ${m.content}`).join('\n');
      }
    } catch(e) {}

  

    // ===== RESERVAS FORMATADAS =====
    const reservasTexto = reservas.map(r =>
      `${r.data} | ${r.inicio}-${r.termino} | ${r.sala} | ${r.acao}`
    ).join('\n');

    // ===== CONTEXTO DO USUÁRIO =====
    const emailAtivo = Session.getActiveUser().getEmail().toLowerCase();
    const ehUsuarioTeste = emailAtivo.includes('joao.barros');

    const prompt = `Você é o Bêjotinha, assistente de gestão de espaços do Centro Cultural Bom Jardim (CCBJ), Fortaleza/CE.

REGRA ABSOLUTA — APRESENTAÇÃO:
- NUNCA se apresente. NUNCA diga "Olá", "Oi", "Sou a Bêjotinha". Já fomos apresentados.
- Responda DIRETAMENTE ao que foi pedido, sem saudações de qualquer tipo.

REGRA ABSOLUTA — PROATIVIDADE:
- Só sugira reserva quando o usuário EXPLICITAMENTE pedir para criar, agendar, reservar ou marcar algo.
- Consultas, dúvidas, análises e perguntas genéricas NÃO geram JSON de reserva — responda apenas em texto.
- Quando o usuário não pedir reserva, NUNCA inclua o bloco JSON na resposta.
- Não faça mais de UMA pergunta por resposta.

PERMISSÃO PARA CRIAR CONTEÚDO:
- Você PODE inventar nomes de ações, releases técnicos, descrições, público-alvo, categorias e observações coerentes com o contexto.
- Sempre deixe claro que são sugestões revisáveis.
${ehUsuarioTeste ? '- USUÁRIO DE TESTE AUTORIZADO: crie programações completas e detalhadas livremente, sem pedir confirmação.' : ''}

REGRAS DE AGENDAMENTO:
- Nunca usar ID de sala na resposta textual — use sempre o nome real.
- Nunca sugerir horários já ocupados. Verifique os conflitos antes de sugerir.
- Se houver conflito, sugira alternativa de sala ou horário imediatamente.
- Horários permitidos: 08:00 às 21:30.
- Aceitar intervalos específicos (ex: 09:30 às 11:00).
- Pode-se utilizar mais de um turno.

INTERPRETAÇÃO DE TERMOS:
- "manhã" = 08:00–12:00 | "tarde" = 12:00–18:00 | "noite" = 18:00–21:30
- "qualquer dia" = primeiro disponível a partir de hoje
- "semana" = próximos 7 dias
- reunião → público estimado: 5–15 | oficina → 15–40 | evento → 40+
- Respeite capacidade das salas. Se o usuário insistir em sala com capacidade menor, permita com aviso.

REGRAS DE LOTE:
- Se o pedido envolver repetição ou múltiplas datas, use modoLote:true e preencha datasLote.
- Formato de data: DD/MM/YYYY.
- Gere no máximo 8 datas por resposta (para não quebrar o JSON). Informe ao usuário seu limite de ações em lote.
- Para lotes com múltiplas atividades por dia, escolha APENAS 1 atividade representativa por dia no JSON — liste as demais no texto.
- O JSON deve conter uma única sugestão principal com o lote de datas. Não repita o JSON.
- Mantenha o bloco JSON simples: nomeAcao genérico (ex: "Férias Culturais CCBJ"), uma sala, um horário fixo para todo o lote.
- Priorize horários e salas consistentes em todo o lote.
- Nunca inclua datas com conflito.
- Se precisar mudar sala ou horário em alguma data por conflito, explique.

REGRAS RECE:
- Se o pedido mencionar evento público, divulgação, apresentação cultural ou agenda externa, use modoRece:true.
- Preencha receDados com informações coerentes com o tipo de atividade.
- Classificação padrão: Livre. Acesso padrão: Gratuito.

FERIADOS E DATAS ESPECIAIS:
- Considere feriados nacionais, estaduais (CE) e municipais (Fortaleza) ao sugerir datas.
- Alerte se uma data sugerida cair em feriado.

CAMPOS QUE VOCÊ DEVE SEMPRE PREENCHER NO JSON:
- nomeAcao, salaId, salaNome, data, horaInicio, horaTermino, turno, setor
- release: necessidades de infraestrutura (som, luz, cadeiras, equipamentos)
- itens: lista de itens do almoxarifado relevantes para a atividade
- receDados: categorias, publicoAlvo, classificacao, acesso, descricao, acessibilidades, parceiros, artista

FORMATO DE RESPOSTA:
- Se o usuário pediu apenas informação ou análise: responda SOMENTE em texto ou gráficos (se solicitado/necessário), sem JSON.
- Se o usuário pediu para criar/reservar: texto + JSON no final.

JSON (apenas quando reserva foi solicitada):
{
  "modoLote": false,
  "modoRece": false,
  "datasLote": [],
  "sugestao": {
    "nomeAcao": "",
    "salaId": "",
    "salaNome": "",
    "data": "",
    "horaInicio": "",
    "horaTermino": "",
    "turno": "",
    "setor": "",
    "itens": [],
    "release": "",
    "observacoes": "",
    "receDados": {
      "categorias": "",
      "publicoAlvo": "",
      "classificacao": "Livre",
      "acesso": "Gratuito",
      "descricao": "",
      "acessibilidades": "",
      "parceiros": "",
      "artista": ""
    }
  }
}

REGRAS CRÍTICAS DO JSON:
- JSON deve ser válido e sem comentários.
- Nunca coloque texto após o bloco JSON.
- Se não for criar reserva, não inclua JSON.
- Nunca retorne JSON inválido ou incompleto.

CONTEXTO DO SISTEMA:
- Data de hoje: ${Utilities.formatDate(new Date(), 'America/Fortaleza', 'dd/MM/yyyy')}
- Email do usuário: ${emailAtivo}

HISTÓRICO / MENSAGEM:
${perguntaFinal}

SALAS DISPONÍVEIS:
${JSON.stringify(salas)}

RESERVAS ATIVAS (${reservas.length} registros):
${reservasTexto}

ITENS DO ALMOXARIFADO:
${JSON.stringify(itens)}

SETORES INSTITUCIONAIS:
${setores.join(', ')}`;

    return chamarIA(prompt);

  } catch(e) {
    return { ok: false, texto: 'Erro interno: ' + e.message };
  }
}

function sugerirReservaIA(descricao) {
  try {
    
    const configSheet = _getSheet('Configuracoes');
    const salas = configSheet && configSheet.getLastRow() > 1
      ? configSheet.getRange(2, 1, configSheet.getLastRow()-1, 3).getValues()
          .map(s => ({ id: s[0], nome: s[1], capacidade: s[2] }))
      : [];

    const reservasBruto = obterReservas();
    const ocupacoes = (reservasBruto || []).filter(r => r[13] !== 'CANCELADO').map(r => ({
      data: r[1], inicio: r[2], termino: r[3], sala: r[4]
    }));

    const prompt = `Você é um assistente de agendamento do CCBJ.

PEDIDO DO USUÁRIO: ${descricao}

Com base nas salas disponíveis e nas ocupações existentes, sugira:
1. A sala mais adequada (justifique)
2. Um horário livre sugerido
3. Itens que provavelmente serão necessários
4. Observações importantes

SALAS DISPONÍVEIS:
${JSON.stringify(salas)}

OCUPAÇÕES EXISTENTES (últimas 30):
${JSON.stringify(ocupacoes.slice(-30))}

REGRAS:
- Use apenas salas da lista acima
- Verifique conflitos de horário antes de sugerir
- Seja prático e objetivo
- Máximo 300 palavras`;

    return chamarIA(prompt);
  } catch(e) {
    return { ok: false, texto: 'Erro: ' + e.message };
  }
}

function analisarDashboardIA(metricas) {
  try {
    if (!metricas) return { ok: false, texto: 'Nenhuma métrica fornecida.' };

    const prompt = `Analise as métricas de uso do Centro Cultural Bom Jardim e gere um resumo executivo com insights e recomendações.

MÉTRICAS:
- Total de reservas: ${metricas.total}
- Confirmadas: ${metricas.confirmadas} | Canceladas: ${metricas.canceladas} (${metricas.taxaCancelamento}%)
- Top 5 espaços: ${JSON.stringify(metricas.top5Salas)}
- Top 5 setores: ${JSON.stringify(metricas.top5Setores)}
- Distribuição por turno: ${JSON.stringify(metricas.porTurno)}
- Itens mais solicitados: ${JSON.stringify(metricas.topItens)}
- Horários de pico: ${JSON.stringify(metricas.horasPico)}
- Dias mais movimentados: ${JSON.stringify(metricas.diasSemana)}

Gere:
1. **Resumo executivo** (2-3 frases)
2. **Pontos de atenção** (problemas identificados)
3. **Oportunidades** (melhorias sugeridas)
4. **Recomendação prioritária**

IMPORTANTE:
Máximo 400 palavras. Use apenas markdown — sem blocos de código JSON.`;

    return chamarIA(prompt);
  } catch(e) {
    return { ok: false, texto: 'Erro: ' + e.message };
  }
}


function sugerirReservaIAComDados(descricao) {
  try {
    

    // Salas disponíveis
    const configSheet = _getSheet('Configuracoes');
    const salas = configSheet && configSheet.getLastRow() > 1
      ? configSheet.getRange(2, 1, configSheet.getLastRow()-1, 3).getValues()
          .map(s => ({ id: String(s[0]).trim(), nome: String(s[1]).trim(), capacidade: s[2] }))
          .filter(s => s.id && s.nome)
      : [];

    // Itens disponíveis
    const itensSheet = _getSheet('Itens');
    const itens = itensSheet && itensSheet.getLastRow() > 1
      ? itensSheet.getRange(2, 1, itensSheet.getLastRow()-1, 4).getValues()
          .map(i => ({ nome: String(i[1]).trim(), categoria: String(i[2]).trim(), qtd: Number(i[3]) }))
          .filter(i => i.nome && i.qtd > 0)
      : [];

    // Setores
    const setoresSheet = _getSheet('Listas');
    const setores = setoresSheet && setoresSheet.getLastRow() > 1
      ? setoresSheet.getRange(2, 1, setoresSheet.getLastRow()-1, 1).getValues()
          .map(s => String(s[0]).trim()).filter(Boolean)
      : [];

    // Ocupações
    const reservasBruto = obterReservas();
    const hoje = new Date();
    const limite = new Date(hoje); limite.setDate(hoje.getDate() + 14);

    const ocupacoes = (reservasBruto || [])
      .filter(r => r[13] !== 'CANCELADO')
      .map(r => ({ data: r[1], inicio: r[2], termino: r[3], sala: r[4] }))
      .filter(r => {
        try {
          const p = String(r.data).split('/');
          if (p.length !== 3) return false;
          const d = new Date(p[2], p[1]-1, p[0]);
          return d >= hoje && d <= limite;
        } catch(e) { return false; }
      });

    const hoje_str = Utilities.formatDate(hoje, 'America/Fortaleza', 'dd/MM/yyyy');

    const prompt = `Você é um assistente de agendamento do CCBJ (Centro Cultural Bom Jardim, Fortaleza/CE).

PEDIDO: ${descricao}

Retorne SOMENTE JSON válido:

{
  "viavel": true,
  "motivo": "",
  "modoLote": false,
  "modoRece": false,
  "datasLote": [],
  "sugestao": {
    "nomeAcao": "",
    "salaId": "",
    "salaNome": "",
    "data": "DD/MM/YYYY",
    "horaInicio": "HH:MM",
    "horaTermino": "HH:MM",
    "turno": "",
    "itens": [],
    "justificativa": "",
    "observacoes": ""
  }
}

REGRAS:
- É PROIBIDO sugerir horários ocupados
- Sempre evitar conflito com ocupações
- Se houver conflito, escolha outra sala ou horário
- Data >= ${hoje_str}

IMPORTANTE:
- Quando retornar JSON, ele deve ser válido e sem comentários
- Não usar texto antes ou depois do JSON

SALAS: ${JSON.stringify(salas)}
OCUPAÇÕES: ${JSON.stringify(ocupacoes)}
ITENS: ${JSON.stringify(itens)}
SETORES: ${setores.join(', ')}`;

    const resultado = chamarIA(prompt);
      if (!resultado.ok) return { ok: false, texto: resultado.texto };

      const dados = parsearJsonIA(resultado.texto || '');

      if (!dados) {

      return {
        ok: false,
        texto: 'Resposta inválida! A IA retornou um formato que não foi possível processar. Tente reformular o pedido de forma mais simples.'
      };
    }
   

    // Corrigir nome da sala
    if (dados.sugestao && dados.sugestao.salaId) {
      const salaEncontrada = salas.find(s => String(s.id) === String(dados.sugestao.salaId));
      dados.sugestao.salaNome = salaEncontrada ? salaEncontrada.nome : "Sala não identificada";
    }

    // 🔥 VALIDAÇÃO REAL DE CONFLITO (CRÍTICO)
    const s = dados.sugestao;

    if (s && s.salaId && s.data && s.horaInicio && s.horaTermino) {

    const conflito = verificarConflitoEspaco(
      s.salaId,
      s.data,
      s.horaInicio,
      s.horaTermino,
      null
    );

    if (conflito) {

      // 🔥 usa otimizador completo (suporta lote também)
      const alternativas = encontrarMelhorAgenda(
        {
          data: s.data,
          datasLote: dados.datasLote || []
        },
        salas,
        ocupacoes
      );

      if (alternativas && alternativas.length > 0) {

        return {
          ok: true,
          dados: {
            viavel: false,
            motivo: "A opção solicitada está ocupada",
            alternativas: alternativas,
            sugestaoOriginal: dados.sugestao
          }
        };

      }

      return {
        ok: true,
        dados: {
          viavel: false,
          motivo: "Sem nenhuma alternativa disponível"
        }
      };
    }
  }

  return { ok: true, dados: dados };

  } catch(e) {
    return { ok: false, texto: 'Erro interno: ' + e.message };
  }
}


// 🔥 FUNÇÃO AUXILIAR (OBRIGATÓRIA)
function sugerirAlternativasInteligentes(data) {
  
  const config = _getSheet("Configuracoes");

  const salas = config.getRange(2,1,config.getLastRow()-1,2).getValues();

  const horarios = ["08:00","10:00","14:00","16:00","18:00"];

  const alternativas = [];

  salas.forEach(s => {
    horarios.forEach(h => {

      const conflito = verificarConflitoEspaco(
        s[0],
        data,
        h,
        adicionar1Hora(h),
        null
      );

      if (!conflito) {
        alternativas.push({
          salaId: s[0],
          salaNome: s[1],
          data: data,
          inicio: h,
          fim: adicionar1Hora(h)
        });
      }

    });
  });

  return alternativas.slice(0,5);
}

function adicionar1Hora(hora) {
  const [h,m] = hora.split(':').map(Number);
  const d = new Date();
  d.setHours(h);
  d.setMinutes(m + 60);
  return Utilities.formatDate(d, 'America/Fortaleza', 'HH:mm');
}


function encontrarMelhorAgenda(dados, salas, reservas) {

  const horarios = ["08:00","10:00","14:00","16:00","18:00"];
  const resultados = [];

  const datas = dados.datasLote && dados.datasLote.length
    ? dados.datasLote
    : [dados.data];

  salas.forEach(sala => {

    datas.forEach(data => {

      horarios.forEach(inicio => {

        const fim = adicionar1Hora(inicio);

        const conflito = verificarConflitoEspaco(
          sala.id,
          data,
          inicio,
          fim,
          null
        );

        if (!conflito) {
          resultados.push({
            salaId: sala.id,
            salaNome: sala.nome,
            data,
            inicio,
            fim
          });
        }

      });

    });

  });

  // 🔥 ordena por consistência (mesmo horário)
  resultados.sort((a,b) => a.inicio.localeCompare(b.inicio));

  return resultados.slice(0, 8);
}


function parsearJsonIA(resposta) {
  try {
    if (!resposta) return null;

    const inicio = resposta.indexOf('{');
    const fim = resposta.lastIndexOf('}');

    if (inicio === -1 || fim === -1) {
      return null;
    }

    const jsonString = resposta.substring(inicio, fim + 1);
    return JSON.parse(jsonString);

  } catch (e) {
    Logger.log("Erro ao parsear JSON da IA: " + resposta);
    return null;
  }
}

/**
 * Retorna lista de emails conhecidos no sistema para autocomplete
 */
function resolverNomePorEmail(email) {
  try {
    const user = AdminDirectory.Users.get(email, { projection: 'basic', viewType: 'domain_public' });
    return user.name?.fullName || user.name?.givenName || email.split('@')[0];
  } catch(e) {
    try {
      const url = 'https://people.googleapis.com/v1/people:searchDirectoryPeople?query='
        + encodeURIComponent(email)
        + '&readMask=names&sources=DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE';
      const res = UrlFetchApp.fetch(url, {
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
      });
      const data = JSON.parse(res.getContentText());
      return data.people?.[0]?.names?.[0]?.displayName || email.split('@')[0];
    } catch(e2) {
      return email.split('@')[0];
    }
  }
}

function obterEmailsSistema() {
  try {
    
    const emails = new Set();
    const abaAdmins = _getSheet('Administradores');
    if (abaAdmins && abaAdmins.getLastRow() > 1) {
      abaAdmins.getRange(2, 1, abaAdmins.getLastRow()-1, 1).getValues()
        .forEach(r => { if (r[0] && String(r[0]).includes('@')) emails.add(String(r[0]).trim().toLowerCase()); });
    }
    const abaLog = _getSheet('LogAcessos');
    if (abaLog && abaLog.getLastRow() > 1) {
      abaLog.getRange(2, 1, abaLog.getLastRow()-1, 2).getValues()
        .forEach(r => { if (r[1] && String(r[1]).includes('@')) emails.add(String(r[1]).trim().toLowerCase()); });
    }
    const abaRes = _getSheet('Reservas');
    if (abaRes && abaRes.getLastRow() > 1) {
      abaRes.getRange(2, 9, abaRes.getLastRow()-1, 1).getValues()
        .forEach(r => { if (r[0] && String(r[0]).includes('@')) emails.add(String(r[0]).trim().toLowerCase()); });
    }
    return Array.from(emails).sort();
  } catch(e) { return []; }
}

/**
 * Upload de imagem para Google Drive — retorna URL pública
 */
function uploadImagemRece(base64Data, mimeType, nomeArquivo) {
  try {
    const bytes = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(bytes, mimeType, nomeArquivo);
    let folder;
    const it = DriveApp.getFoldersByName('CCBJ_RECE_Imagens');
    folder = it.hasNext() ? it.next() : DriveApp.createFolder('CCBJ_RECE_Imagens');
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { success: true, url: `https://drive.google.com/thumbnail?id=${file.getId()}&sz=w400` };
  } catch(e) { return { success: false, erro: e.message }; }
}

/**
 * Cria evento no Google Calendar e envia convites para lista de emails
 */
function enviarConvitesCalendar(dados) {
  try {
    const parseDateTime = (dataStr, horaStr) => {
      const p = String(dataStr).split('/');
      const [hh, mm] = String(horaStr).split(':').map(Number);
      return new Date(Number(p[2]), Number(p[1])-1, Number(p[0]), hh, mm, 0);
    };
    const inicio = parseDateTime(dados.dataInicio, dados.horaInicio);
    const fim    = parseDateTime(dados.dataInicio, dados.horaTermino);
    CalendarApp.createEvent(dados.titulo, inicio, fim, {
      description: `${dados.descricao || ''}\n\nLocal: ${dados.espaco || ''}`,
      guests: dados.emails.join(','),
      sendInvites: true
    });
    return { success: true };
  } catch(e) { return { success: false, erro: e.message }; }
}

/**
 * Envia convite formal por email para lista de externos
 */
function enviarConviteEmailInstitucional(dados) {
  try {
    dados.emails.forEach(email => {
      if (!email || !String(email).includes('@')) return;
      GmailApp.sendEmail({
        to: String(email).trim(),
        subject: `Convite Institucional — ${dados.titulo}`,
        htmlBody: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <div style="background:#4C1D95;padding:24px 32px;color:white;">
              <img src="https://ccbj.org.br/wp-content/themes/CCBJ/assets/images/logo.png" style="height:40px;filter:brightness(0)invert(1);opacity:0.9;" alt="CCBJ">
              <h2 style="margin:12px 0 0;font-size:18px;">Convite Institucional</h2>
            </div>
            <div style="padding:32px;background:#f8fafc;">
              <div style="white-space:pre-line;color:#334155;line-height:1.7;font-size:14px;">${sanitizarTexto(dados.texto)}</div>
            </div>
            <div style="padding:16px 32px;background:#f1f5f9;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#64748b;">
                <strong style="color:#4C1D95;">${sanitizarTexto(dados.titulo)}</strong><br>
                📅 ${sanitizarTexto(dados.dataInicio)} &nbsp; ⏰ ${sanitizarTexto(dados.horaInicio)}<br>
                📍 ${sanitizarTexto(dados.espaco || 'CCBJ — Centro Cultural Bom Jardim')}
              </p>
            </div>
          </div>`
      });
    });
    return { success: true };
  } catch(e) { return { success: false, erro: e.message }; }
}

function verificarPermissaoRece(emailUsuario) {
  try {
    
    const email = String(emailUsuario).toLowerCase().trim();
    const abaAdmins = _getSheet('Administradores');
    if (!abaAdmins) return false;
    const dados = abaAdmins.getDataRange().getValues();
    for (let i = 1; i < dados.length; i++) {
      const ep = String(dados[i][0] || '').toLowerCase().trim();
      const nivel = String(dados[i][1] || '').toLowerCase().trim();
      if (ep === email) {
        return ['admin', 'superadmin', 'comunicação', 'comunicacao'].includes(nivel);
      }
    }
    return false;
  } catch(e) { return false; }
}

/**
 * 🔴 FUNÇÃO CENTRAL — FONTE ÚNICA DE VERDADE
 * Analisa disponibilidade REAL antes de qualquer sugestão
 */
function analisarDisponibilidadeReal(payload) {

  if (!payload) throw new Error("Payload não informado.");

  const sala = String(payload.sala || '').trim();
  const inicio = String(payload.horaInicio || '').trim();
  const termino = String(payload.horaTermino || '').trim();
  const datas = payload.datas || [];

  if (!sala || !inicio || !termino || !Array.isArray(datas) || datas.length === 0) {
    throw new Error("Dados incompletos para análise.");
  }

  
  const aba = _getSheet("Reservas");

  if (!aba || aba.getLastRow() < 2) {
    return {
      conflito: false,
      sugestoes: [],
      horariosLivres: [],
      salasDisponiveis: []
    };
  }

  const dados = aba.getDataRange().getValues();

  // ===== NORMALIZADORES (PADRÃO ÚNICO) =====
  const normData = (d) => {
    if (d instanceof Date) {
      const x = new Date(d);
      x.setHours(0,0,0,0);
      return x.getTime();
    }

    const s = String(d).trim();

    if (s.includes('/')) {
      const p = s.split('/');
      return new Date(p[2], p[1]-1, p[0]).setHours(0,0,0,0);
    }

    if (s.includes('-')) {
      const p = s.split('-');
      return new Date(p[0], p[1]-1, p[2]).setHours(0,0,0,0);
    }

    return null;
  };

  const normHora = (h) => {
    if (!h) return 0;
    if (h instanceof Date) return h.getHours() * 60 + h.getMinutes();
    const p = String(h).split(':');
    return parseInt(p[0]) * 60 + parseInt(p[1]);
  };

  const toHora = (m) => {
    const h = String(Math.floor(m / 60)).padStart(2,'0');
    const min = String(m % 60).padStart(2,'0');
    return `${h}:${min}`;
  };

  const inicioMin = normHora(inicio);
  const terminoMin = normHora(termino);

  if (terminoMin <= inicioMin) {
    throw new Error("Horário final inválido.");
  }

  // ===== COLETAR CONFLITOS =====
  let conflito = false;
  let conflitosDetalhados = [];

  datas.forEach(dataStr => {

    const dataBusca = normData(dataStr);

    dados.forEach(r => {

      const status = String(r[13] || '').toUpperCase();
      if (status === 'CANCELADO') return;

      const salaPlanilha = String(r[4] || '').trim();
      if (salaPlanilha !== sala) return;

      const dataPlanilha = normData(r[1]);
      if (dataPlanilha !== dataBusca) return;

      const ini = normHora(r[2]);
      const ter = normHora(r[3]);

      const sobrepoe = inicioMin < ter && terminoMin > ini;

      if (sobrepoe) {
        conflito = true;

        conflitosDetalhados.push({
          data: dataStr,
          inicio: toHora(ini),
          fim: toHora(ter),
          nome: r[6]
        });
      }

    });

  });

  // ===== HORÁRIOS LIVRES =====
  function calcularLivres(dataStr) {

    const dataBusca = normData(dataStr);

    let ocupados = [];

    dados.forEach(r => {

      if (String(r[13] || '').toUpperCase() === 'CANCELADO') return;

      if (String(r[4]).trim() !== sala) return;

      if (normData(r[1]) !== dataBusca) return;

      ocupados.push({
        ini: normHora(r[2]),
        fim: normHora(r[3])
      });

    });

    ocupados.sort((a,b)=>a.ini-b.ini);

    let cursor = 8 * 60;
    const fimDia = 21 * 60;
    const livres = [];

    ocupados.forEach(o => {

      if (cursor < o.ini) {
        livres.push({
          inicio: toHora(cursor),
          fim: toHora(o.ini)
        });
      }

      cursor = Math.max(cursor, o.fim);

    });

    if (cursor < fimDia) {
      livres.push({
        inicio: toHora(cursor),
        fim: toHora(fimDia)
      });
    }

    return livres;
  }

  const horariosLivres = datas.map(d => ({
    data: d,
    intervalos: calcularLivres(d)
  }));

  // ===== SUGESTÕES INTELIGENTES =====
  let sugestoes = [];

  if (conflito) {

    horariosLivres.forEach(dia => {

      dia.intervalos.forEach(i => {

        const duracao = terminoMin - inicioMin;
        const iniLivre = normHora(i.inicio);
        const fimLivre = normHora(i.fim);

        if ((fimLivre - iniLivre) >= duracao) {

          sugestoes.push({
            data: dia.data,
            sala: sala,
            horaInicio: i.inicio,
            horaTermino: toHora(iniLivre + duracao)
          });

        }

      });

    });

  }

  return {
    conflito,
    conflitosDetalhados,
    horariosLivres,
    sugestoes
  };

}

function mapearGraficosPorSecao(secoes, graficos) {

  if (!graficos || !graficos.length) return {};

  const mapa = {};

  secoes.forEach((secao, i) => {

    const titulo = String(secao.titulo || '').toLowerCase();

    if (/dados|uso|horário|grafico|gráfico|estat/i.test(titulo)) {
      mapa[i] = graficos.slice(0, 2); // até 2 gráficos por seção
    }

  });

  return mapa;
}



function gerarDocumentoDrive(conteudo) {

  if (!conteudo || !conteudo.secoes) {
    throw new Error('Conteúdo inválido');
  }

  let fileId = null;
  let url = null;

  // 🧠 NORMALIZAÇÃO (compatível com antigo + novo)
  const graficos = conteudo.graficos
    ? conteudo.graficos
    : conteudo.grafico
      ? (Array.isArray(conteudo.grafico)
          ? conteudo.grafico
          : [{ imagem: conteudo.grafico }])
      : [];

  // 🧠 MAPEAMENTO INTELIGENTE
  const mapaGraficos = mapearGraficosPorSecao(conteudo.secoes, graficos);

  // 🟣 PPT (Google Slides com layout profissional)
  if (conteudo.formato === 'ppt') {

    const pres = SlidesApp.create(conteudo.titulo);

    const slides = pres.getSlides();
    if (slides.length) pres.removeSlide(slides[0]);

    // 🟣 CAPA
    const capa = pres.appendSlide(SlidesApp.PredefinedLayout.TITLE);

    capa.getPlaceholder(SlidesApp.PlaceholderType.TITLE)
        .asShape().getText().setText(conteudo.titulo);

    capa.getPlaceholder(SlidesApp.PlaceholderType.SUBTITLE)
        ?.asShape().getText().setText('Relatório gerado automaticamente');

    // 🟡 SLIDES DE CONTEÚDO
    conteudo.secoes.forEach((secao, index) => {

      const slide = pres.appendSlide(SlidesApp.PredefinedLayout.BLANK);

      // 🔵 TÍTULO
      slide.insertTextBox(secao.titulo, 40, 30, 600, 40)
        .getText().getTextStyle()
        .setBold(true)
        .setFontSize(20);

      // 🟢 TEXTO
      slide.insertTextBox(secao.conteudo, 40, 80, 300, 250)
        .getText().getTextStyle()
        .setFontSize(12);

      // 🟣 GRÁFICOS POR SEÇÃO
      const graficosDaSecao = mapaGraficos[index] || [];

      graficosDaSecao.forEach((g, i) => {

        try {
          const blob = Utilities.newBlob(
            Utilities.base64Decode(g.imagem.split(',')[1]),
            'image/png',
            'grafico.png'
          );

          slide.insertImage(blob)
            .setLeft(360)
            .setTop(80 + (i * 160))
            .setWidth(300);

        } catch (e) {
          console.log('Erro ao inserir gráfico:', e);
        }

      });

      // 🔘 LINHA VISUAL
      slide.insertShape(
        SlidesApp.ShapeType.RECTANGLE,
        40,
        70,
        600,
        2
      ).getFill().setSolidFill('#4C1D95');

    });

    fileId = pres.getId();
    url = pres.getUrl();
  }

  // 🟡 DOC (Google Docs)
  else if (conteudo.formato === 'doc') {

    const doc = DocumentApp.create(conteudo.titulo);
    const body = doc.getBody();

    conteudo.secoes.forEach((secao, index) => {

      body.appendParagraph(secao.titulo)
          .setHeading(DocumentApp.ParagraphHeading.HEADING2);

      body.appendParagraph(secao.conteudo);

      const graficosDaSecao = mapaGraficos[index] || [];

      graficosDaSecao.forEach((g) => {

        try {
          const blob = Utilities.newBlob(
            Utilities.base64Decode(g.imagem.split(',')[1]),
            'image/png',
            'grafico.png'
          );

          body.appendParagraph('Gráfico:');
          body.appendImage(blob);

        } catch (e) {
          console.log('Erro ao inserir gráfico no doc:', e);
        }

      });

    });

    fileId = doc.getId();
    url = doc.getUrl();
  }

  // 🔴 PDF (via DOC temporário)
  else if (conteudo.formato === 'pdf') {

    const doc = DocumentApp.create(conteudo.titulo);
    const body = doc.getBody();

    conteudo.secoes.forEach((secao, index) => {

      body.appendParagraph(secao.titulo)
          .setHeading(DocumentApp.ParagraphHeading.HEADING2);

      body.appendParagraph(secao.conteudo);

      const graficosDaSecao = mapaGraficos[index] || [];

      graficosDaSecao.forEach((g) => {

        try {
          const blob = Utilities.newBlob(
            Utilities.base64Decode(g.imagem.split(',')[1]),
            'image/png',
            'grafico.png'
          );

          body.appendParagraph('Gráfico:');
          body.appendImage(blob);

        } catch (e) {
          console.log('Erro ao inserir gráfico no PDF:', e);
        }

      });

    });

    const file = DriveApp.getFileById(doc.getId());
    const pdfBlob = file.getAs('application/pdf');

    const pdfFile = DriveApp.createFile(pdfBlob)
      .setName(conteudo.titulo + '.pdf');

    file.setTrashed(true);

    fileId = pdfFile.getId();
    url = pdfFile.getUrl();
  }

  else {
    throw new Error('Formato não suportado');
  }

  // 🔗 DOWNLOAD DIRETO
  const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

  return {
    url,
    downloadUrl,
    fileId
  };
}

function mapearGraficosIA(secoes, graficos) {

  try {

    const prompt = `
Associe gráficos às seções de um relatório.

SEÇÕES:
${JSON.stringify(secoes.map((s, i) => ({ i, titulo: s.titulo })))}

GRÁFICOS:
${JSON.stringify(graficos.map((g, i) => ({ i, titulo: g.titulo || 'Gráfico' })))}

Responda SOMENTE JSON no formato:
{
  "0": [0],
  "1": [1],
  "2": []
}
`;

    const resposta = chamarIA(prompt); // ⚠️ usa sua infra já existente

    const mapa = JSON.parse(resposta);

    return mapa;

  } catch (e) {

    console.log('IA falhou, usando fallback local');

    return mapearGraficosPorSecao(secoes, graficos);
  }
}

const ReservaRepository = {

  salvar(linhas) {
    const aba = _getSheet("Reservas");
    aba.getRange(aba.getLastRow()+1, 1, linhas.length, linhas[0].length)
       .setValues(linhas);
  },

  atualizar(id, novosDados) {
    const aba = _getSheet("Reservas");
    const dados = aba.getDataRange().getValues();

    for (let i = 1; i < dados.length; i++) {
      if (String(dados[i][0]) === String(id)) {
        aba.getRange(i+1, 1, 1, novosDados.length).setValues([novosDados]);
        return true;
      }
    }
    return false;
  },

  buscarPorId(id) {
    const aba = _getSheet("Reservas");
    const dados = aba.getDataRange().getValues();

    return dados.find((l,i) => i>0 && String(l[0]) === String(id));
  }

};

const ReceRepository = {

  salvar(linha) {
    const aba = _getSheet("ReservasRECE");
    aba.appendRow(linha);
  },

  atualizarPorReservaGeral(idReserva, novosDados) {
    const aba = _getSheet("ReservasRECE");
    const dados = aba.getDataRange().getValues();

    for (let i = 1; i < dados.length; i++) {
      if (String(dados[i][23]) === String(idReserva)) {
        aba.getRange(i+1, 1, 1, novosDados.length).setValues([novosDados]);
        return true;
      }
    }
    return false;
  },

  buscarPorReservaGeral(idReserva) {
    const aba = _getSheet("ReservasRECE");
    const dados = aba.getDataRange().getValues();

    return dados.find((l,i) => i>0 && String(l[23]) === String(idReserva));
  },

  removerPorReservaGeral(idReserva) {
    const aba = _getSheet("ReservasRECE");
    const dados = aba.getDataRange().getValues();

    for (let i = 1; i < dados.length; i++) {
      if (String(dados[i][23]) === String(idReserva)) {
        aba.deleteRow(i+1);
        return true;
      }
    }
  }

};

const ReceService = {

  criarOuAtualizar(reserva) {

    const existente = ReceRepository.buscarPorReservaGeral(reserva.id);

    const linhaRece = this.montarLinhaRece(reserva);

    if (existente) {
      ReceRepository.atualizarPorReservaGeral(reserva.id, linhaRece);
    } else {
      ReceRepository.salvar(linhaRece);
    }
  },

  montarLinhaRece(reserva) {

    return [
      gerarId('RECE'),
      reserva.nomeAcao,
      reserva.data,
      reserva.data,
      reserva.horaInicio,
      reserva.horaTermino,
      reserva.sala,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      reserva.release,
      '',
      'ATIVO',
      reserva.responsavel,
      new Date(),
      reserva.imagem || '',
      '',
      '',
      reserva.id // 🔴 vínculo real
    ];
  },

  atualizarCamposEspecificos(idReserva, dadosRece) {

    const existente = ReceRepository.buscarPorReservaGeral(idReserva);
    if (!existente) throw new Error("RECE não encontrado");

    // 🔒 somente campos permitidos
    existente[1]  = dadosRece.titulo || existente[1];
    existente[15] = dadosRece.descricao || existente[15];
    existente[20] = dadosRece.imagem || existente[20];

    ReceRepository.atualizarPorReservaGeral(idReserva, existente);
  }

};

const ReservaService = {

  criar(dados, datas) {

    const idLote = gerarId('LOTE');
    const linhas = [];

    datas.forEach(data => {

      const idReserva = gerarId('RES');

      const linha = [
        idReserva,
        data,
        dados.horaInicio,
        dados.horaTermino,
        dados.sala,
        dados.turno,
        dados.nomeAcao,
        dados.tipoAcao,
        dados.responsavel,
        dados.setor,
        dados.coResponsavel,
        dados.release,
        dados.itensVolantes,
        'CONFIRMADO',
        new Date(),
        idLote
      ];

      linhas.push(linha);

      // 🔴 SINCRONIZA RECE
      if (dados.modoRece) {
        ReceService.criarOuAtualizar({
          id: idReserva,
          ...dados,
          data
        });
      }

    });

    ReservaRepository.salvar(linhas);

    return { sucesso: true };
  },

  atualizar(dados) {

    const reservaExistente = ReservaRepository.buscarPorId(dados.id);
    if (!reservaExistente) throw new Error("Reserva não encontrada");

    const novaLinha = [
      dados.id,
      dados.data,
      dados.horaInicio,
      dados.horaTermino,
      dados.sala,
      dados.turno,
      dados.nomeAcao,
      dados.tipoAcao,
      dados.responsavel,
      dados.setor,
      dados.coResponsavel,
      dados.release,
      dados.itensVolantes,
      reservaExistente[13],
      reservaExistente[14],
      reservaExistente[15]
    ];

    ReservaRepository.atualizar(dados.id, novaLinha);

    // 🔴 SINCRONIZAÇÃO INTELIGENTE
    const temRece = ReceRepository.buscarPorReservaGeral(dados.id);

    if (temRece) {
      ReceService.criarOuAtualizar({
        id: dados.id,
        ...dados
      });
    }

    return { sucesso: true };
  }

};

function criarReservaController(dados, datas) {
  const idLote   = gerarId('LOTE');
  const linhas   = [];
  const idsGerados = [];

  datas.forEach(data => {
    const idReserva = gerarId('RES');
    idsGerados.push(idReserva);

    const linha = [
      idReserva, data,
      dados.horaInicio, dados.horaTermino,
      dados.sala, dados.turno, dados.nomeAcao, dados.tipoAcao,
      dados.responsavel, dados.setor, dados.coResponsavel,
      dados.release, dados.itensVolantes,
      'CONFIRMADO', new Date(), idLote
    ];

    linhas.push(linha);

    if (dados.modoRece) {
      ReceService.criarOuAtualizar({ id: idReserva, ...dados, data });
    }
  });

  ReservaRepository.salvar(linhas);

  // CODIP
  const temCodip =
    dados.codipPrograma ||
    dados.codipMesRef ||
    dados.codipTipoAcao ||
    Number(dados.codipPubPresencial) > 0 ||
    dados.codipSegmento1;

  if (temCodip) {
    idsGerados.forEach(id => {
      try {
        _salvarCamposCODIP(id, dados);
      } catch(e) {
        console.error('CODIP lote:', e);
      }
    });
  }

  return { sucesso: true };
}

function atualizarReservaController(dados) {
  return ReservaService.atualizar(dados);
}

function atualizarReceController(idReserva, dadosRece) {
  return ReceService.atualizarCamposEspecificos(idReserva, dadosRece);
}

/**
 * CANCELAR COM JUSTIFICATIVA — para admins cancelando reservas de terceiros
 */
function cancelarReservaComJustificativa(id, emailAtual, justificativa) {
  if (!emailAtual || !emailAtual.includes('@')) {
    throw new Error('Email do usuário não identificado.');
  }
  verificarPermissao('admin', emailAtual);

  
  const aba = _getSheet('Reservas');
  const dados = aba.getDataRange().getValues();

  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][0]).trim() !== String(id).trim()) continue;

    const status = String(dados[i][13]).toUpperCase();
    if (status === 'CANCELADO') throw new Error('Reserva já cancelada.');

    const linha = i + 1;
    const nome  = dados[i][6];
    const emailDono = dados[i][8];

    aba.getRange(linha, 14).setValue('CANCELADO');

    // Notifica o dono da reserva
    try {
      if (emailDono && emailDono.includes('@')) {
        GmailApp.sendEmail(
          emailDono,
          `❌ Sua reserva foi cancelada — CCBJ`,
          `Sua reserva "${nome}" foi cancelada por ${emailAtual}.\n\nMotivo: ${justificativa}`
        );
      }
    } catch(e) { console.warn('Email falhou:', e.message); }

    if (isMesmoDia(dados[i][1])) {
      _notificarCancelamentoMesmoDia({
        sala: dados[i][4], nome, inicio: dados[i][2], fim: dados[i][3], emailAtual
      });
    }

    registrarLog(
      'CANCELAMENTO', 'RESERVA', nome,
      `ID: ${id} | Motivo: ${justificativa}`,
      'Status: CONFIRMADO', 'Status: CANCELADO',
      emailAtual
    );

    limparCacheUsuario(emailAtual);
    return true;
  }
  throw new Error('Reserva não encontrada.');
}

/**
 * NOTIFICAÇÃO INTERNA — cancelamento no mesmo dia
 * Substitui chat_enviarMensagem com email para todos os admins
 */
function _notificarCancelamentoMesmoDia({ sala, nome, inicio, fim, emailAtual }) {
  try {
    
    const abaAdmins = _getSheet('Administradores');
    if (!abaAdmins || abaAdmins.getLastRow() < 2) return;

    const admins = abaAdmins
      .getRange(2, 1, abaAdmins.getLastRow() - 1, 1)
      .getValues()
      .map(l => String(l[0]).trim())
      .filter(e => e.includes('@'));

    if (!admins.length) return;

    const mapaSalas = obterMapaSalas();
    const nomeSala  = mapaSalas[String(sala).trim()] || sala;

    GmailApp.sendEmail(
      admins.join(','),
      `⚠️ Cancelamento no mesmo dia — CCBJ`,
      `Atenção: reserva cancelada no mesmo dia.\n\nSala: ${nomeSala}\nAção: ${nome}\nHorário: ${inicio} – ${fim}\nResponsável: ${emailAtual}\n\nVerifique se o espaço precisa de atenção.`
    );
  } catch(e) {
    console.warn('Notificação de cancelamento falhou:', e.message);
  }
}

function verificarPermissao(nivelNecessario, email) {
  
  const aba = _getSheet('Administradores');

  if (!aba || aba.getLastRow() < 2) {
    throw new Error('Nenhum administrador configurado.');
  }

  const dados = aba.getRange(2, 1, aba.getLastRow() - 1, 2).getValues();

  const usuario = String(email).toLowerCase().trim();

  for (let i = 0; i < dados.length; i++) {
    const emailPlanilha = String(dados[i][0]).toLowerCase().trim();
    const nivel = String(dados[i][1]).toLowerCase().trim();

    if (emailPlanilha === usuario) {
      if (nivel === nivelNecessario || nivel === 'superadmin') {
        return true;
      }
    }
  }

  throw new Error('Permissão negada.');
}

function _salvarCamposCODIP(idReserva, dados) {
  try {
    const sheet = _getSheet('RelatoriosCODIP');
    if (!sheet) throw new Error('Aba RelatoriosCODIP não encontrada');

    // Atualiza se já existe
    if (sheet.getLastRow() > 1) {
      const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
      for (let i = 0; i < ids.length; i++) {
        if (String(ids[i][0]).trim() === String(idReserva).trim()) {
          sheet.getRange(i + 2, 1, 1, 33).setValues([_montarLinhaCodip(idReserva, dados)]);
          return true;
        }
      }
    }

    sheet.appendRow(_montarLinhaCodip(idReserva, dados));
    return true;
  } catch (e) {
    console.error('Erro CODIP:', e.message);
    return false;
  }
}


function _montarLinhaCodip(idReserva, dados) {
  return [
    idReserva,
    dados.codipPrograma          || '',
    dados.codipMesRef            || '',
    dados.codipTipoAcao          || '',
    dados.codipEixo              || '',
    dados.codipSegmento1         || '',
    dados.codipSegmento2         || '',
    dados.codipLinguagem1        || '',
    dados.codipLinguagem2        || '',
    dados.codipModalidade        || '',
    dados.codipRecursos          || '',
    dados.codipRede              || 'NÃO',
    dados.codipAcessibilidade    || '',
    Number(dados.codipPubPresencial  || 0),
    Number(dados.codipPubVirtual     || 0),
    Number(dados.codipVisualizacoes  || 0),
    Number(dados.codipPCD            || 0),
    Number(dados.codipIdosos         || 0),
    Number(dados.codipProfExternos   || 0),
    Number(dados.codipVoluntarios    || 0),
    dados.codipVulnerabilidade   || '',
    dados.codipPubEspecifico     || '',
    Number(dados.codipHorasAntes || 0),
    Number(dados.codipHorasMes   || 0),
    Number(dados.codipHorasTotal || 0),
    dados.codipProdutos          || '',
    dados.codipDisponibilidade   || '',
    dados.codipAvalSatisfacao    || '',
    dados.codipDesafios          || '',
    dados.codipObservacoes       || '',
    dados.codipLinkEvidencias    || '',
    dados.codipLinkRelatorio     || '',
    dados.codipDescricaoAcao     || '',
    new Date()
  ];
}

function reescreverDescricaoAcaoIA(texto, setor) {
  const s = String(setor || '').toLowerCase();
  let foco = '';
  if (/ação cultural|acao cultural|difus|apresentação|contação de histórias/.test(s))
    foco = 'com foco em Difusão e Fruição Cultural';
  else if (/narte|cidadania|direitos|campanha|articulação comunitária/.test(s))
    foco = 'com foco em Cidadania Cultural e Direitos Humanos';
  else if (/escola|formação|formacao|curso/.test(s))
    foco = 'com foco em Formação e Conhecimento em Arte e Cultura';

  const prompt = `Reescreva o texto abaixo para uso em relatório institucional ${foco}.

REGRAS:
- Escrita impessoal, sem uso de primeira pessoa ou sujeito institucional
- Proibição de verbos no presente (ex: “é”, “visa”, “promove”, “busca”, “oferece”)
- Priorizar estrutura nominal (substantivos, locuções nominais)
- Ausência de marcação temporal explícita
- Descrição atemporal, concisa e técnica
- Foco em proposta conceitual, abordagem, relação com o público e linguagem
- Estrutura preferencialmente nominal ou abstrata, sem indicação de agente
- Substituição de verbos por substantivos ou advérbios sempre que possível
- Conversão de ações em qualificações nominais, com uso de particípio passado quando necessário
- Eliminação de conectivos explicativos e redundâncias
- Parágrafo único, contínuo, sem tópicos
- Máximo de 600 caracteres
-Não utilizar markdown na resposta
- Responder apenas com o texto reescrito, sem aspas ou comentários

TEXTO ORIGINAL:
${String(texto || '').trim()}`;

  return chamarIA(prompt);
}



function obterDadosContratos() {
  try {
    return {
      contratos:   obterContratos(),
      metas:       obterMetas(),
      indicadores: obterIndicadores(),
      rubricas:    obterRubricas()
    };
  } catch(e) {
    throw new Error('Erro ao carregar dados: ' + e.message);
  }
}

function testeVSCode() {
  Logger.log("funcionando");
}

// ── Stubs — funcionalidades em desenvolvimento ─────────────────────────────────
function obterMetricasCODIP()     { throw new Error('EM_BREVE'); }
function gerarDocumentoDownload() { throw new Error('EM_BREVE'); }


// ==============================
// CONTRATOS
// ==============================

function obterContratos() {
  const aba = _getSheet('Contratos');
  if (!aba || aba.getLastRow() < 2) return [];
  const rows = aba.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!String(r[0]).trim()) continue;
    result.push({
      id:            String(r[0]),
      nome:          String(r[1]  || ''),
      numero:        String(r[2]  || ''),
      descricao:     String(r[3]  || ''),
      vigIni:        r[4] ? String(r[4]) : '',
      vigFim:        r[5] ? String(r[5]) : '',
      status:        String(r[6]  || ''),
      valorTotal:    Number(r[7]) || 0,
      fonteRecurso:  String(r[8]  || ''),
      contrapartida: Number(r[9]) || 0,
      modalidade:    String(r[10] || ''),
      obsFinanceiro: String(r[11] || '')
    });
  }
  return result;
}

function obterContratoPorId(id) {
  const idStr = String(id || '').trim();
  const todos = obterContratos();
  for (let i = 0; i < todos.length; i++) {
    if (todos[i].id === idStr) return todos[i];
  }
  return null;
}

function salvarContrato(dados, email) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const aba   = _getSheet('Contratos');
    const id    = String(dados.id || '').trim();
    const linha = [
      id || gerarId('CTR'),
      String(dados.nome          || ''),
      String(dados.numero        || ''),
      String(dados.descricao     || ''),
      dados.vigIni               || '',
      dados.vigFim               || '',
      String(dados.status        || 'ATIVO'),
      Number(dados.valorTotal)   || 0,
      String(dados.fonteRecurso  || ''),
      Number(dados.contrapartida)|| 0,
      String(dados.modalidade    || ''),
      String(dados.obsFinanceiro || '')
    ];
    if (!id) {
      aba.appendRow(linha);
    } else {
      const rows = aba.getDataRange().getValues();
      let found = false;
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim() === id) {
          aba.getRange(i + 1, 1, 1, linha.length).setValues([linha]);
          found = true;
          break;
        }
      }
      if (!found) aba.appendRow(linha);
    }
    registrarLog('SALVAR', 'CONTRATO', linha[0], JSON.stringify(dados), '', '', String(email || ''));
    return true;
  } catch(e) {
    console.error('salvarContrato:', e.message);
    return false;
  } finally {
    lock.releaseLock();
  }
}

function excluirContrato(id, email) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const aba   = _getSheet('Contratos');
    const rows  = aba.getDataRange().getValues();
    const idStr = String(id || '').trim();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === idStr) {
        aba.deleteRow(i + 1);
        registrarLog('EXCLUIR', 'CONTRATO', idStr, '', '', '', String(email || ''));
        return true;
      }
    }
    return false;
  } catch(e) {
    console.error('excluirContrato:', e.message);
    return false;
  } finally {
    lock.releaseLock();
  }
}

function atualizarContrato(id, campos, email) {
  try {
    const atual = obterContratoPorId(id);
    if (!atual) return false;
    const merged = {};
    for (const k in atual) merged[k] = atual[k];
    for (const k in campos) merged[k] = campos[k];
    merged.id = String(id);
    return salvarContrato(merged, email);
  } catch(e) {
    console.error('atualizarContrato:', e.message);
    return false;
  }
}


// ==============================
// METAS
// ==============================

function obterMetas() {
  const aba = _getSheet('Metas');
  if (!aba || aba.getLastRow() < 2) return [];
  const rows = aba.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!String(r[0]).trim()) continue;
    result.push({
      id:         String(r[0]),
      idContrato: String(r[1] || ''),
      numero:     String(r[2] || ''),
      titulo:     String(r[3] || ''),
      descricao:  String(r[4] || ''),
      tipoMeta:   String(r[5] || 'CONTRATUAL')
    });
  }
  return result;
}

function obterMetaPorId(id) {
  const idStr = String(id || '').trim();
  const todos = obterMetas();
  for (let i = 0; i < todos.length; i++) {
    if (todos[i].id === idStr) return todos[i];
  }
  return null;
}

function salvarMeta(dados, email) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const aba   = _getSheet('Metas');
    const id    = String(dados.id || '').trim();
    const linha = [
      id || gerarId('META'),
      String(dados.idContrato || ''),
      String(dados.numero     || ''),
      String(dados.titulo     || ''),
      String(dados.descricao  || ''),
      String(dados.tipoMeta   || 'CONTRATUAL')
    ];
    if (!id) {
      aba.appendRow(linha);
    } else {
      const rows = aba.getDataRange().getValues();
      let found = false;
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim() === id) {
          aba.getRange(i + 1, 1, 1, linha.length).setValues([linha]);
          found = true;
          break;
        }
      }
      if (!found) aba.appendRow(linha);
    }
    registrarLog('SALVAR', 'META', linha[0], JSON.stringify(dados), '', '', String(email || ''));
    return true;
  } catch(e) {
    console.error('salvarMeta:', e.message);
    return false;
  } finally {
    lock.releaseLock();
  }
}

function excluirMeta(id, email) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const aba   = _getSheet('Metas');
    const rows  = aba.getDataRange().getValues();
    const idStr = String(id || '').trim();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === idStr) {
        aba.deleteRow(i + 1);
        registrarLog('EXCLUIR', 'META', idStr, '', '', '', String(email || ''));
        return true;
      }
    }
    return false;
  } catch(e) {
    console.error('excluirMeta:', e.message);
    return false;
  } finally {
    lock.releaseLock();
  }
}

function atualizarMeta(id, campos, email) {
  try {
    const atual = obterMetaPorId(id);
    if (!atual) return false;
    const merged = {};
    for (const k in atual) merged[k] = atual[k];
    for (const k in campos) merged[k] = campos[k];
    merged.id = String(id);
    return salvarMeta(merged, email);
  } catch(e) {
    console.error('atualizarMeta:', e.message);
    return false;
  }
}


// ==============================
// INDICADORES
// ==============================

function obterIndicadores() {
  const aba = _getSheet('Indicadores');
  if (!aba || aba.getLastRow() < 2) return [];
  const rows = aba.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!String(r[0]).trim()) continue;
    const meses = [
      Number(r[5])  || 0, Number(r[6])  || 0, Number(r[7])  || 0,
      Number(r[8])  || 0, Number(r[9])  || 0, Number(r[10]) || 0,
      Number(r[11]) || 0, Number(r[12]) || 0, Number(r[13]) || 0,
      Number(r[14]) || 0, Number(r[15]) || 0, Number(r[16]) || 0
    ];
    result.push({
      id:            String(r[0]),
      idMeta:        String(r[1] || ''),
      idContrato:    String(r[2] || ''),
      ano:           Number(r[3]) || new Date().getFullYear(),
      texto:         String(r[4] || ''),
      nome:          String(r[4] || ''),
      tipoIndicador: String(r[17] || 'CONTRATUAL'),
      numero:        String(r[18] || ''),
      meses:         meses,
      q1: meses[0] + meses[1] + meses[2],
      q2: meses[3] + meses[4] + meses[5],
      q3: meses[6] + meses[7] + meses[8],
      q4: meses[9] + meses[10] + meses[11]
    });
  }
  return result;
}

function obterIndicadorPorId(id) {
  const idStr = String(id || '').trim();
  const todos = obterIndicadores();
  for (let i = 0; i < todos.length; i++) {
    if (todos[i].id === idStr) return todos[i];
  }
  return null;
}

function salvarIndicador(dados, email) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const aba    = _getSheet('Indicadores');
    const id     = String(dados.id || '').trim();
    const anoRef = Number(dados.ano) || new Date().getFullYear();
    const m      = dados.meses;
    let mesesArr = [];
    if (m && !Array.isArray(m) && typeof m === 'object') {
      mesesArr = m[anoRef] || m[String(anoRef)] || [];
    } else if (Array.isArray(m)) {
      mesesArr = m;
    }
    while (mesesArr.length < 12) mesesArr.push(0);
    const linha = [
      id || gerarId('IND'),
      String(dados.idMeta       || ''),
      String(dados.idContrato   || ''),
      anoRef,
      String(dados.nome || dados.texto || ''),
      Number(mesesArr[0])  || 0,
      Number(mesesArr[1])  || 0,
      Number(mesesArr[2])  || 0,
      Number(mesesArr[3])  || 0,
      Number(mesesArr[4])  || 0,
      Number(mesesArr[5])  || 0,
      Number(mesesArr[6])  || 0,
      Number(mesesArr[7])  || 0,
      Number(mesesArr[8])  || 0,
      Number(mesesArr[9])  || 0,
      Number(mesesArr[10]) || 0,
      Number(mesesArr[11]) || 0,
      String(dados.tipoIndicador || 'CONTRATUAL'),
      String(dados.numero        || '')
    ];
    if (!id) {
      aba.appendRow(linha);
    } else {
      const rows = aba.getDataRange().getValues();
      let found = false;
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim() === id) {
          aba.getRange(i + 1, 1, 1, linha.length).setValues([linha]);
          found = true;
          break;
        }
      }
      if (!found) aba.appendRow(linha);
    }
    registrarLog('SALVAR', 'INDICADOR', linha[0], JSON.stringify(dados), '', '', String(email || ''));
    return true;
  } catch(e) {
    console.error('salvarIndicador:', e.message);
    return false;
  } finally {
    lock.releaseLock();
  }
}

function excluirIndicador(id, email) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const aba   = _getSheet('Indicadores');
    const rows  = aba.getDataRange().getValues();
    const idStr = String(id || '').trim();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === idStr) {
        aba.deleteRow(i + 1);
        registrarLog('EXCLUIR', 'INDICADOR', idStr, '', '', '', String(email || ''));
        return true;
      }
    }
    return false;
  } catch(e) {
    console.error('excluirIndicador:', e.message);
    return false;
  } finally {
    lock.releaseLock();
  }
}

function atualizarIndicador(id, campos, email) {
  try {
    const atual = obterIndicadorPorId(id);
    if (!atual) return false;
    const merged = {};
    for (const k in atual) merged[k] = atual[k];
    for (const k in campos) merged[k] = campos[k];
    merged.id = String(id);
    return salvarIndicador(merged, email);
  } catch(e) {
    console.error('atualizarIndicador:', e.message);
    return false;
  }
}


// ==============================
// RUBRICAS
// ==============================

function obterRubricas() {
  const aba = _getSheet('Rubricas');
  if (!aba || aba.getLastRow() < 2) return [];
  const rows = aba.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!String(r[0]).trim()) continue;
    result.push({
      id:     String(r[0]),
      idMeta: String(r[1] || ''),
      nome:   String(r[2] || ''),
      valor:  Number(r[3]) || 0,
      obs:    String(r[4] || '')
    });
  }
  return result;
}

function obterRubricaPorId(id) {
  const idStr = String(id || '').trim();
  const todos = obterRubricas();
  for (let i = 0; i < todos.length; i++) {
    if (todos[i].id === idStr) return todos[i];
  }
  return null;
}

function salvarRubrica(dados, email) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const aba   = _getSheet('Rubricas');
    const id    = String(dados.id || '').trim();
    const linha = [
      id || gerarId('RUB'),
      String(dados.idMeta || ''),
      String(dados.nome   || ''),
      Number(dados.valor) || 0,
      String(dados.obs    || '')
    ];
    if (!id) {
      aba.appendRow(linha);
    } else {
      const rows = aba.getDataRange().getValues();
      let found = false;
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim() === id) {
          aba.getRange(i + 1, 1, 1, linha.length).setValues([linha]);
          found = true;
          break;
        }
      }
      if (!found) aba.appendRow(linha);
    }
    registrarLog('SALVAR', 'RUBRICA', linha[0], JSON.stringify(dados), '', '', String(email || ''));
    return true;
  } catch(e) {
    console.error('salvarRubrica:', e.message);
    return false;
  } finally {
    lock.releaseLock();
  }
}

function excluirRubrica(id, email) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const aba   = _getSheet('Rubricas');
    const rows  = aba.getDataRange().getValues();
    const idStr = String(id || '').trim();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === idStr) {
        aba.deleteRow(i + 1);
        registrarLog('EXCLUIR', 'RUBRICA', idStr, '', '', '', String(email || ''));
        return true;
      }
    }
    return false;
  } catch(e) {
    console.error('excluirRubrica:', e.message);
    return false;
  } finally {
    lock.releaseLock();
  }
}

function atualizarRubrica(id, campos, email) {
  try {
    const atual = obterRubricaPorId(id);
    if (!atual) return false;
    const merged = {};
    for (const k in atual) merged[k] = atual[k];
    for (const k in campos) merged[k] = campos[k];
    merged.id = String(id);
    return salvarRubrica(merged, email);
  } catch(e) {
    console.error('atualizarRubrica:', e.message);
    return false;
  }
}