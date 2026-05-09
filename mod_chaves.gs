/**
 * @file mod_chaves.gs
 * @description Módulo de Protocolo de Chaves — controle de retirada, entrega,
 *              devolução, transferência e rastreabilidade de chaves físicas dos espaços.
 * @layer backend
 * @responsibility Gerenciar entidade Chaves e entidade ProtocolosChaves com seus fluxos
 *                 operacionais, permissões por setor e auditoria completa.
 * @dependencies utils.js (_getSheet, gerarId, obterLockComRetry), mod_admin.gs
 *               (obterEmailUsuario, obterSetorUsuario, verificarPermissao, registrarLog)
 *
 * ABAS:
 *   Chaves              (ESPACOS) — entidade de cada chave física
 *   ProtocolosChaves    (ESPACOS) — transações de retirada/devolução/transferência
 *   HistoricoChaves     (ESPACOS) — auditoria imutável de cada movimentação
 *
 * PERMISSÕES:
 *   INFRAESTRUTURA (setor) ou admin/superadmin: operações de entrega e confirmação
 *   Usuário comum: solicitar, confirmar recebimento, devolver, transferir
 *   VISUALIZACAO: apenas leitura
 */

// ══════════════════════════════════════════════════════════════════
// BLOCO: Constantes e Enums
// ══════════════════════════════════════════════════════════════════

const CHV_STATUS_CHAVE = {
  DISPONIVEL: 'DISPONIVEL',
  EM_USO:     'EM_USO',
  MANUTENCAO: 'MANUTENCAO',
  BLOQUEADA:  'BLOQUEADA',
  EXTRAVIADA: 'EXTRAVIADA'
};

const CHV_TIPO_CHAVE = {
  COMUM:   'COMUM',
  RESERVA: 'RESERVA',
  MASTER:  'MASTER'
};

const CHV_STATUS_PROTOCOLO = {
  SOLICITADA:                    'SOLICITADA',
  AGUARDANDO_CONFIRMACAO_USUARIO: 'AGUARDANDO_CONFIRMACAO_USUARIO',
  AGUARDANDO_CONFIRMACAO_INFRA:   'AGUARDANDO_CONFIRMACAO_INFRA',
  RETIRADA:                      'RETIRADA',
  DEVOLVIDA:                      'DEVOLVIDA',
  ATRASADA:                      'ATRASADA',
  CANCELADA:                     'CANCELADA',
  NEGADA:                        'NEGADA',
  TRANSFERENCIA_PENDENTE:        'TRANSFERENCIA_PENDENTE',
  TRANSFERIDA:                   'TRANSFERIDA'
};

// Colunas da aba Chaves (0-indexed)
const CHV_COL = {
  ID: 0, ESPACO_ID: 1, CODIGO_PATRIMONIAL: 2, TIPO: 3,
  STATUS: 4, ATIVA: 5, OBSERVACOES: 6, CRIADA_EM: 7, ATUALIZADA_EM: 8
};

// Colunas da aba ProtocolosChaves (0-indexed)
const PROT_COL = {
  ID: 0, CHAVE_ID: 1, ESPACO_ID: 2,
  RESPONSAVEL_ATUAL_ID: 3, RESPONSAVEL_ATUAL_NOME: 4,
  SOLICITANTE_ID: 5, SOLICITANTE_NOME: 6,
  SETOR_ID: 7, SETOR_NOME: 8,
  DT_SOLICITACAO: 9, DT_RETIRADA: 10, DT_PREVISTA_DEVOLUCAO: 11, DT_DEVOLUCAO: 12,
  STATUS: 13, OBSERVACOES: 14,
  ENTREGUE_POR_ID: 15, ENTREGUE_POR_NOME: 16,
  RECEBIDO_POR_ID: 17, RECEBIDO_POR_NOME: 18,
  DEVOLUCAO_RECEBIDA_POR_ID: 19, DEVOLUCAO_RECEBIDA_POR_NOME: 20,
  RESERVA_VINCULADA_ID: 21, ORIGEM: 22,
  TRANSFERENCIA_DESTINO_ID: 23, TRANSFERENCIA_DESTINO_NOME: 24
};

// Colunas da aba HistoricoChaves (0-indexed)
const HIST_COL = {
  ID: 0, PROTOCOLO_ID: 1, CHAVE_ID: 2, DT_HORA: 3,
  ACAO: 4, USUARIO_ID: 5, USUARIO_NOME: 6,
  STATUS_ANTERIOR: 7, STATUS_NOVO: 8,
  OBSERVACOES: 9, AGENTE: 10
};

// Colunas expandidas de Configuracoes (0-indexed)
const CONF_COL = {
  ID: 0, NOME: 1, CAPACIDADE: 2, RESUMO_ITENS: 3, EMAIL_RESPONSAVEL: 4,
  POSSUI_CHAVES: 5, QTD_USO_COMUM: 6, QTD_RESERVA: 7,
  ACEITA_RESERVA: 8, EXIGE_PROTOCOLO: 9, LOCALIZACAO_CHAVE: 10, OBS_INTERNAS: 11,
  SETOR_RESPONSAVEL: 12
};

// ══════════════════════════════════════════════════════════════════
// BLOCO: Helpers de permissão (internos, não jogam exceção)
// ══════════════════════════════════════════════════════════════════

function _chvEhInfraestrutura(email) {
  try {
    const setorUsuario = String(obterSetorUsuario(email) || '').trim().toUpperCase();
    if (!setorUsuario) return false;

    // Verificar contra setores responsáveis configurados em cada espaço
    const espacos = _chvLerEspacos().map(_chvMapearEspaco).filter(Boolean);
    const setoresConfig = espacos
      .map(function(e) { return String(e.setorResponsavel || '').trim().toUpperCase(); })
      .filter(function(s) { return s.length > 0; });

    if (setoresConfig.length > 0) {
      return setoresConfig.some(function(s) { return setorUsuario === s; });
    }

    // Fallback: verificação legada por substring "INFRAESTRUTURA"
    return setorUsuario.includes('INFRAESTRUTURA');
  } catch(e) { return false; }
}

function _chvEhAdmin(email) {
  try { verificarPermissao('admin', email); return true; } catch(e) { return false; }
}

function _chvEhInfraOuAdmin(email) {
  return _chvEhInfraestrutura(email) || _chvEhAdmin(email);
}

function _chvExigeInfraOuAdmin(email) {
  if (!_chvEhInfraOuAdmin(email))
    throw new Error('Apenas Infraestrutura ou administradores podem executar esta ação.');
}

function _chvResolverNome(email) {
  try { return resolverNomePorEmail(email) || email.split('@')[0]; } catch(e) { return email; }
}

// ══════════════════════════════════════════════════════════════════
// BLOCO: Helpers de acesso a planilha
// ══════════════════════════════════════════════════════════════════

function _chvGetChaves() { return _getSheet('Chaves'); }
function _chvGetProtocolos() { return _getSheet('ProtocolosChaves'); }
function _chvGetHistorico() { return _getSheet('HistoricoChaves'); }
function _chvGetConfiguracoes() { return _getSheet('Configuracoes'); }

function _chvLerChaves() {
  const aba = _chvGetChaves();
  if (!aba || aba.getLastRow() < 2) return [];
  return aba.getRange(2, 1, aba.getLastRow() - 1, 9).getValues();
}

function _chvLerProtocolos() {
  const aba = _chvGetProtocolos();
  if (!aba || aba.getLastRow() < 2) return [];
  const numCols = Math.min(aba.getLastColumn(), 25);
  return aba.getRange(2, 1, aba.getLastRow() - 1, numCols).getValues();
}

function _chvLerEspacos() {
  const aba = _chvGetConfiguracoes();
  if (!aba || aba.getLastRow() < 2) return [];
  const numCols = Math.min(aba.getLastColumn(), 13);
  return aba.getRange(2, 1, aba.getLastRow() - 1, numCols).getValues();
}

// ══════════════════════════════════════════════════════════════════
// BLOCO: Registro de histórico / auditoria
// ══════════════════════════════════════════════════════════════════

function _chvRegistrarHistorico(protocoloId, chaveId, acao, usuarioId, usuarioNome, statusAnterior, statusNovo, observacoes, agente) {
  try {
    const aba = _chvGetHistorico();
    if (!aba) return;
    aba.appendRow([
      gerarId('HCH'),
      protocoloId || '',
      chaveId || '',
      new Date().toISOString(),
      acao || '',
      usuarioId || '',
      usuarioNome || '',
      statusAnterior || '',
      statusNovo || '',
      observacoes || '',
      agente || 'SISTEMA'
    ]);
  } catch(e) {
    console.error('_chvRegistrarHistorico: ' + e.message);
  }
}

// ══════════════════════════════════════════════════════════════════
// BLOCO: Mapear linha de protocolo para objeto
// ══════════════════════════════════════════════════════════════════

function _chvMapearProtocolo(r) {
  if (!r || !r[PROT_COL.ID]) return null;
  const p = {};
  p.id               = String(r[PROT_COL.ID] || '');
  p.chaveId          = String(r[PROT_COL.CHAVE_ID] || '');
  p.espacoId         = String(r[PROT_COL.ESPACO_ID] || '');
  p.responsavelId    = String(r[PROT_COL.RESPONSAVEL_ATUAL_ID] || '');
  p.responsavelNome  = String(r[PROT_COL.RESPONSAVEL_ATUAL_NOME] || '');
  p.solicitanteId    = String(r[PROT_COL.SOLICITANTE_ID] || '');
  p.solicitanteNome  = String(r[PROT_COL.SOLICITANTE_NOME] || '');
  p.setorId          = String(r[PROT_COL.SETOR_ID] || '');
  p.setorNome        = String(r[PROT_COL.SETOR_NOME] || '');
  p.dtSolicitacao    = r[PROT_COL.DT_SOLICITACAO] ? String(r[PROT_COL.DT_SOLICITACAO]) : '';
  p.dtRetirada       = r[PROT_COL.DT_RETIRADA] ? String(r[PROT_COL.DT_RETIRADA]) : '';
  p.dtPrevistaDev    = r[PROT_COL.DT_PREVISTA_DEVOLUCAO] ? String(r[PROT_COL.DT_PREVISTA_DEVOLUCAO]) : '';
  p.dtDevolucao      = r[PROT_COL.DT_DEVOLUCAO] ? String(r[PROT_COL.DT_DEVOLUCAO]) : '';
  p.status           = String(r[PROT_COL.STATUS] || '');
  p.observacoes      = String(r[PROT_COL.OBSERVACOES] || '');
  p.entreguePorId    = String(r[PROT_COL.ENTREGUE_POR_ID] || '');
  p.entreguePorNome  = String(r[PROT_COL.ENTREGUE_POR_NOME] || '');
  p.recebidoPorId    = String(r[PROT_COL.RECEBIDO_POR_ID] || '');
  p.recebidoPorNome  = String(r[PROT_COL.RECEBIDO_POR_NOME] || '');
  p.devRecebidaPorId   = String(r[PROT_COL.DEVOLUCAO_RECEBIDA_POR_ID] || '');
  p.devRecebidaPorNome = String(r[PROT_COL.DEVOLUCAO_RECEBIDA_POR_NOME] || '');
  p.reservaVinculadaId = String(r[PROT_COL.RESERVA_VINCULADA_ID] || '');
  p.origem             = String(r[PROT_COL.ORIGEM] || '');
  p.transferenciaDestinoId   = String(r[PROT_COL.TRANSFERENCIA_DESTINO_ID] || '');
  p.transferenciaDestinoNome = String(r[PROT_COL.TRANSFERENCIA_DESTINO_NOME] || '');
  return p;
}

function _chvMapearChave(r) {
  if (!r || !r[CHV_COL.ID]) return null;
  return {
    id:                String(r[CHV_COL.ID] || ''),
    espacoId:          String(r[CHV_COL.ESPACO_ID] || ''),
    codigoPatrimonial: String(r[CHV_COL.CODIGO_PATRIMONIAL] || ''),
    tipo:              String(r[CHV_COL.TIPO] || ''),
    status:            String(r[CHV_COL.STATUS] || ''),
    ativa:             String(r[CHV_COL.ATIVA]).toLowerCase() !== 'false',
    observacoes:       String(r[CHV_COL.OBSERVACOES] || ''),
    criadaEm:          r[CHV_COL.CRIADA_EM] ? String(r[CHV_COL.CRIADA_EM]) : '',
    atualizadaEm:      r[CHV_COL.ATUALIZADA_EM] ? String(r[CHV_COL.ATUALIZADA_EM]) : ''
  };
}

function _chvMapearEspaco(r) {
  if (!r || !r[CONF_COL.ID]) return null;
  const len = r.length;
  return {
    id:               String(r[CONF_COL.ID] || ''),
    nome:             String(r[CONF_COL.NOME] || ''),
    capacidade:       Number(r[CONF_COL.CAPACIDADE] || 0),
    emailResponsavel: String(len > 4 ? (r[CONF_COL.EMAIL_RESPONSAVEL] || '') : ''),
    possuiChaves:     len > 5 ? (String(r[CONF_COL.POSSUI_CHAVES]).toLowerCase() === 'true') : false,
    qtdUsoComum:      len > 6 ? Number(r[CONF_COL.QTD_USO_COMUM] || 0) : 0,
    qtdReserva:       len > 7 ? Number(r[CONF_COL.QTD_RESERVA] || 0) : 0,
    aceitaReserva:    len > 8 ? (String(r[CONF_COL.ACEITA_RESERVA]).toLowerCase() !== 'false') : true,
    exigeProtocolo:   len > 9 ? (String(r[CONF_COL.EXIGE_PROTOCOLO]).toLowerCase() === 'true') : false,
    localizacaoChave: len > 10 ? String(r[CONF_COL.LOCALIZACAO_CHAVE] || '') : '',
    obsInternas:      len > 11 ? String(r[CONF_COL.OBS_INTERNAS] || '') : '',
    setorResponsavel: len > 12 ? String(r[CONF_COL.SETOR_RESPONSAVEL] || '') : ''
  };
}

// ══════════════════════════════════════════════════════════════════
// BLOCO: Busca por ID
// ══════════════════════════════════════════════════════════════════

function _chvEncontrarChaveLinha(chaveId) {
  const aba = _chvGetChaves();
  if (!aba || aba.getLastRow() < 2) return null;
  const dados = aba.getRange(2, 1, aba.getLastRow() - 1, 9).getValues();
  for (let i = 0; i < dados.length; i++) {
    if (String(dados[i][CHV_COL.ID]).trim() === String(chaveId).trim())
      return { linha: i + 2, dados: dados[i] };
  }
  return null;
}

function _chvEncontrarProtocoloLinha(protocoloId) {
  const aba = _chvGetProtocolos();
  if (!aba || aba.getLastRow() < 2) return null;
  const numCols = Math.min(aba.getLastColumn(), 25);
  const dados = aba.getRange(2, 1, aba.getLastRow() - 1, numCols).getValues();
  for (let i = 0; i < dados.length; i++) {
    if (String(dados[i][PROT_COL.ID]).trim() === String(protocoloId).trim())
      return { linha: i + 2, dados: dados[i] };
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════
// BLOCO: Validações de negócio
// ══════════════════════════════════════════════════════════════════

function _chvValidarChaveDisponivel(chaveId) {
  const r = _chvEncontrarChaveLinha(chaveId);
  if (!r) throw new Error('Chave não encontrada: ' + chaveId);
  const chave = _chvMapearChave(r.dados);
  if (!chave.ativa) throw new Error('Chave inativa.');
  if (chave.status !== CHV_STATUS_CHAVE.DISPONIVEL)
    throw new Error('Chave não está disponível. Status atual: ' + chave.status);
  return chave;
}

function _chvVerificarChaveJaEmUso(chaveId) {
  const protocolos = _chvLerProtocolos();
  const statusAtivos = [
    CHV_STATUS_PROTOCOLO.SOLICITADA,
    CHV_STATUS_PROTOCOLO.AGUARDANDO_CONFIRMACAO_USUARIO,
    CHV_STATUS_PROTOCOLO.AGUARDANDO_CONFIRMACAO_INFRA,
    CHV_STATUS_PROTOCOLO.RETIRADA,
    CHV_STATUS_PROTOCOLO.TRANSFERENCIA_PENDENTE
  ];
  for (let i = 0; i < protocolos.length; i++) {
    const p = _chvMapearProtocolo(protocolos[i]);
    if (!p) continue;
    if (p.chaveId === chaveId && statusAtivos.includes(p.status))
      throw new Error('Chave já possui protocolo ativo (id: ' + p.id + ').');
  }
}

function _chvAtualizarStatusChaveNaPlanilha(chaveId, novoStatus) {
  const r = _chvEncontrarChaveLinha(chaveId);
  if (!r) return;
  const aba = _chvGetChaves();
  aba.getRange(r.linha, CHV_COL.STATUS + 1).setValue(novoStatus);
  aba.getRange(r.linha, CHV_COL.ATUALIZADA_EM + 1).setValue(new Date().toISOString());
}

function _chvAtualizarProtocoloStatus(linha, novoStatus, camposExtras) {
  const aba = _chvGetProtocolos();
  aba.getRange(linha, PROT_COL.STATUS + 1).setValue(novoStatus);
  if (camposExtras) {
    Object.keys(camposExtras).forEach(function(col) {
      aba.getRange(linha, Number(col) + 1).setValue(camposExtras[col]);
    });
  }
}

// ══════════════════════════════════════════════════════════════════
// BLOCO: API pública — Espaços
// ══════════════════════════════════════════════════════════════════

/**
 * Retorna dados iniciais para o módulo de protocolo de chaves:
 * espaços com chave, lista de chaves, protocolos ativos e pendências.
 */
function chaves_obterDados(emailAtual) {
  try {
    const email = obterEmailUsuario(emailAtual || '');
    const ehInfra = _chvEhInfraOuAdmin(email);

    const espacosBrutos = _chvLerEspacos();
    const todosEspacos = espacosBrutos.map(_chvMapearEspaco).filter(Boolean);
    const espacos = todosEspacos.filter(function(e) { return e.possuiChaves; });

    const chavesBrutas = _chvLerChaves();
    const chaves = chavesBrutas
      .map(_chvMapearChave)
      .filter(function(c) { return c && c.ativa; });

    const protocolosBrutos = _chvLerProtocolos();
    const todos = protocolosBrutos.map(_chvMapearProtocolo).filter(Boolean);

    const statusAtivos = [
      CHV_STATUS_PROTOCOLO.SOLICITADA,
      CHV_STATUS_PROTOCOLO.AGUARDANDO_CONFIRMACAO_USUARIO,
      CHV_STATUS_PROTOCOLO.AGUARDANDO_CONFIRMACAO_INFRA,
      CHV_STATUS_PROTOCOLO.RETIRADA,
      CHV_STATUS_PROTOCOLO.TRANSFERENCIA_PENDENTE,
      CHV_STATUS_PROTOCOLO.ATRASADA
    ];

    const ativos = todos.filter(function(p) { return statusAtivos.includes(p.status); });

    const pendencias = {
      aguardandoUsuario:  ativos.filter(function(p) { return p.status === CHV_STATUS_PROTOCOLO.AGUARDANDO_CONFIRMACAO_USUARIO; }),
      aguardandoInfra:    ativos.filter(function(p) { return p.status === CHV_STATUS_PROTOCOLO.AGUARDANDO_CONFIRMACAO_INFRA; }),
      solicitadas:        ativos.filter(function(p) { return p.status === CHV_STATUS_PROTOCOLO.SOLICITADA; }),
      emUso:              ativos.filter(function(p) { return p.status === CHV_STATUS_PROTOCOLO.RETIRADA; }),
      atrasadas:          ativos.filter(function(p) { return p.status === CHV_STATUS_PROTOCOLO.ATRASADA; }),
      transferenciasPend: ativos.filter(function(p) { return p.status === CHV_STATUS_PROTOCOLO.TRANSFERENCIA_PENDENTE; })
    };

    let meusPendentes = [];
    if (!ehInfra) {
      meusPendentes = ativos.filter(function(p) {
        return p.solicitanteId === email || p.responsavelId === email ||
               p.transferenciaDestinoId === email;
      });
    }

    return {
      ok: true,
      ehInfra: ehInfra,
      emailUsuario: email,
      espacos: espacos,
      todosEspacos: todosEspacos,
      chaves: chaves,
      protocolosAtivos: ativos,
      pendencias: pendencias,
      meusPendentes: meusPendentes,
      enums: {
        tipoChave: Object.values(CHV_TIPO_CHAVE),
        statusChave: Object.values(CHV_STATUS_CHAVE),
        statusProtocolo: Object.values(CHV_STATUS_PROTOCOLO)
      }
    };
  } catch(e) {
    console.error('chaves_obterDados: ' + e.message);
    throw new Error('Erro ao carregar dados: ' + e.message);
  }
}

/**
 * Lista protocolos com filtros opcionais.
 */
function chaves_listarProtocolos(filtros, emailAtual) {
  try {
    const email = obterEmailUsuario(emailAtual || '');
    filtros = filtros || {};

    const protocolosBrutos = _chvLerProtocolos();
    let lista = protocolosBrutos.map(_chvMapearProtocolo).filter(Boolean);

    if (filtros.status)   lista = lista.filter(function(p) { return p.status === filtros.status; });
    if (filtros.espacoId) lista = lista.filter(function(p) { return p.espacoId === filtros.espacoId; });
    if (filtros.chaveId)  lista = lista.filter(function(p) { return p.chaveId === filtros.chaveId; });
    if (filtros.usuarioId) lista = lista.filter(function(p) {
      return p.responsavelId === filtros.usuarioId || p.solicitanteId === filtros.usuarioId;
    });
    if (filtros.setorId)  lista = lista.filter(function(p) { return p.setorId === filtros.setorId || p.setorNome === filtros.setorId; });
    if (filtros.dataInicio) {
      const di = new Date(filtros.dataInicio);
      lista = lista.filter(function(p) { return p.dtSolicitacao && new Date(p.dtSolicitacao) >= di; });
    }
    if (filtros.dataFim) {
      const df = new Date(filtros.dataFim);
      df.setHours(23,59,59,999);
      lista = lista.filter(function(p) { return p.dtSolicitacao && new Date(p.dtSolicitacao) <= df; });
    }
    if (filtros.apenasAtivos) {
      const statusAtivos = [
        CHV_STATUS_PROTOCOLO.SOLICITADA,
        CHV_STATUS_PROTOCOLO.AGUARDANDO_CONFIRMACAO_USUARIO,
        CHV_STATUS_PROTOCOLO.AGUARDANDO_CONFIRMACAO_INFRA,
        CHV_STATUS_PROTOCOLO.RETIRADA,
        CHV_STATUS_PROTOCOLO.ATRASADA,
        CHV_STATUS_PROTOCOLO.TRANSFERENCIA_PENDENTE
      ];
      lista = lista.filter(function(p) { return statusAtivos.includes(p.status); });
    }

    lista.sort(function(a, b) {
      const da = a.dtSolicitacao ? new Date(a.dtSolicitacao) : 0;
      const db = b.dtSolicitacao ? new Date(b.dtSolicitacao) : 0;
      return db - da;
    });

    return { ok: true, protocolos: lista, total: lista.length };
  } catch(e) {
    throw new Error('Erro ao listar protocolos: ' + e.message);
  }
}

/**
 * Retorna histórico de movimentações de um protocolo ou chave.
 */
function chaves_obterHistorico(filtros, emailAtual) {
  try {
    obterEmailUsuario(emailAtual || '');
    filtros = filtros || {};
    const aba = _chvGetHistorico();
    if (!aba || aba.getLastRow() < 2) return { ok: true, historico: [] };

    const dados = aba.getRange(2, 1, aba.getLastRow() - 1, 11).getValues();
    let lista = dados.map(function(r) {
      return {
        id:              String(r[HIST_COL.ID] || ''),
        protocoloId:     String(r[HIST_COL.PROTOCOLO_ID] || ''),
        chaveId:         String(r[HIST_COL.CHAVE_ID] || ''),
        dtHora:          r[HIST_COL.DT_HORA] ? String(r[HIST_COL.DT_HORA]) : '',
        acao:            String(r[HIST_COL.ACAO] || ''),
        usuarioId:       String(r[HIST_COL.USUARIO_ID] || ''),
        usuarioNome:     String(r[HIST_COL.USUARIO_NOME] || ''),
        statusAnterior:  String(r[HIST_COL.STATUS_ANTERIOR] || ''),
        statusNovo:      String(r[HIST_COL.STATUS_NOVO] || ''),
        observacoes:     String(r[HIST_COL.OBSERVACOES] || ''),
        agente:          String(r[HIST_COL.AGENTE] || '')
      };
    }).filter(function(h) { return h.id; });

    if (filtros.protocoloId) lista = lista.filter(function(h) { return h.protocoloId === filtros.protocoloId; });
    if (filtros.chaveId)     lista = lista.filter(function(h) { return h.chaveId === filtros.chaveId; });
    if (filtros.usuarioId)   lista = lista.filter(function(h) { return h.usuarioId === filtros.usuarioId; });

    lista.sort(function(a, b) {
      return new Date(b.dtHora) - new Date(a.dtHora);
    });

    return { ok: true, historico: lista };
  } catch(e) {
    throw new Error('Erro ao obter histórico: ' + e.message);
  }
}

// ══════════════════════════════════════════════════════════════════
// BLOCO: API pública — CRUD de Chaves (admin/infra only)
// ══════════════════════════════════════════════════════════════════

/**
 * Cria ou edita uma chave física. Somente admin/infra.
 */
function chaves_salvarChave(dados, emailAtual) {
  try {
    const email = obterEmailUsuario(emailAtual || '');
    _chvExigeInfraOuAdmin(email);

    if (!dados || !dados.espacoId) throw new Error('Espaço obrigatório.');
    if (!dados.codigoPatrimonial)  throw new Error('Código patrimonial obrigatório.');
    if (!Object.values(CHV_TIPO_CHAVE).includes(dados.tipo))
      throw new Error('Tipo de chave inválido: ' + dados.tipo);

    const aba = _chvGetChaves();
    if (!aba) throw new Error('Aba Chaves não encontrada.');
    const agora = new Date().toISOString();

    if (dados.id) {
      const r = _chvEncontrarChaveLinha(dados.id);
      if (!r) throw new Error('Chave não encontrada: ' + dados.id);
      aba.getRange(r.linha, CHV_COL.ESPACO_ID + 1).setValue(dados.espacoId);
      aba.getRange(r.linha, CHV_COL.CODIGO_PATRIMONIAL + 1).setValue(String(dados.codigoPatrimonial).trim());
      aba.getRange(r.linha, CHV_COL.TIPO + 1).setValue(dados.tipo);
      aba.getRange(r.linha, CHV_COL.OBSERVACOES + 1).setValue(String(dados.observacoes || ''));
      aba.getRange(r.linha, CHV_COL.ATIVA + 1).setValue(dados.ativa !== false);
      aba.getRange(r.linha, CHV_COL.ATUALIZADA_EM + 1).setValue(agora);
      registrarLog('EDIÇÃO', 'CHAVE', dados.id, 'Chave editada.', r.dados, dados, email);
    } else {
      const novoId = gerarId('CHV');
      aba.appendRow([
        novoId,
        dados.espacoId,
        String(dados.codigoPatrimonial).trim(),
        dados.tipo,
        CHV_STATUS_CHAVE.DISPONIVEL,
        true,
        String(dados.observacoes || ''),
        agora,
        agora
      ]);
      registrarLog('CRIAÇÃO', 'CHAVE', novoId, 'Chave criada.', null, dados, email);
    }
    return { ok: true };
  } catch(e) {
    throw new Error('Erro ao salvar chave: ' + e.message);
  }
}

/**
 * Altera status de uma chave (MANUTENCAO, BLOQUEADA, EXTRAVIADA, DISPONIVEL). Admin/infra only.
 */
function chaves_alterarStatusChave(chaveId, novoStatus, obs, emailAtual) {
  try {
    const email = obterEmailUsuario(emailAtual || '');
    _chvExigeInfraOuAdmin(email);

    if (!Object.values(CHV_STATUS_CHAVE).includes(novoStatus))
      throw new Error('Status inválido: ' + novoStatus);

    const r = _chvEncontrarChaveLinha(chaveId);
    if (!r) throw new Error('Chave não encontrada: ' + chaveId);

    const statusAnterior = String(r.dados[CHV_COL.STATUS]);
    _chvAtualizarStatusChaveNaPlanilha(chaveId, novoStatus);
    _chvRegistrarHistorico('', chaveId, 'STATUS_CHAVE_ALTERADO', email, _chvResolverNome(email), statusAnterior, novoStatus, obs, 'INFRA');
    registrarLog('STATUS_CHAVE', 'CHAVE', chaveId, 'Status: ' + statusAnterior + ' → ' + novoStatus, statusAnterior, novoStatus, email);

    return { ok: true };
  } catch(e) {
    throw new Error('Erro ao alterar status: ' + e.message);
  }
}

/**
 * Desativa (soft-delete) uma chave. Admin/infra only.
 */
function chaves_desativarChave(chaveId, obs, emailAtual) {
  try {
    const email = obterEmailUsuario(emailAtual || '');
    _chvExigeInfraOuAdmin(email);

    const r = _chvEncontrarChaveLinha(chaveId);
    if (!r) throw new Error('Chave não encontrada.');

    const aba = _chvGetChaves();
    aba.getRange(r.linha, CHV_COL.ATIVA + 1).setValue(false);
    aba.getRange(r.linha, CHV_COL.OBSERVACOES + 1).setValue(String(obs || ''));
    aba.getRange(r.linha, CHV_COL.ATUALIZADA_EM + 1).setValue(new Date().toISOString());
    _chvRegistrarHistorico('', chaveId, 'CHAVE_DESATIVADA', email, _chvResolverNome(email), '', '', obs, 'INFRA');

    return { ok: true };
  } catch(e) {
    throw new Error('Erro ao desativar chave: ' + e.message);
  }
}

// ══════════════════════════════════════════════════════════════════
// BLOCO: Fluxo 1 — Usuário solicita chave
// ══════════════════════════════════════════════════════════════════

/**
 * Usuário solicita retirada de uma chave. Cria protocolo SOLICITADA.
 */
function chaves_solicitar(dados, emailAtual) {
  try {
    const email = obterEmailUsuario(emailAtual || '');
    if (!dados || !dados.chaveId) throw new Error('Chave obrigatória.');
    if (!dados.espacoId)          throw new Error('Espaço obrigatório.');

    const lock = obterLockComRetry('chaves_solicitar', 8000, 3);
    try {
      _chvValidarChaveDisponivel(dados.chaveId);
      _chvVerificarChaveJaEmUso(dados.chaveId);

      const nome = _chvResolverNome(email);
      const setor = String(dados.setorNome || obterSetorUsuario(email) || '');
      const agora = new Date().toISOString();
      const novoId = gerarId('PCH');

      const aba = _chvGetProtocolos();
      if (!aba) throw new Error('Aba ProtocolosChaves não encontrada.');

      const row = new Array(25).fill('');
      row[PROT_COL.ID]                  = novoId;
      row[PROT_COL.CHAVE_ID]            = dados.chaveId;
      row[PROT_COL.ESPACO_ID]           = dados.espacoId;
      row[PROT_COL.RESPONSAVEL_ATUAL_ID]   = '';
      row[PROT_COL.RESPONSAVEL_ATUAL_NOME] = '';
      row[PROT_COL.SOLICITANTE_ID]      = email;
      row[PROT_COL.SOLICITANTE_NOME]    = nome;
      row[PROT_COL.SETOR_ID]            = setor;
      row[PROT_COL.SETOR_NOME]          = setor;
      row[PROT_COL.DT_SOLICITACAO]      = agora;
      row[PROT_COL.DT_PREVISTA_DEVOLUCAO] = String(dados.dtPrevistaDevolucao || '');
      row[PROT_COL.STATUS]              = CHV_STATUS_PROTOCOLO.SOLICITADA;
      row[PROT_COL.OBSERVACOES]         = String(dados.observacoes || '');
      row[PROT_COL.RESERVA_VINCULADA_ID] = String(dados.reservaId || '');
      row[PROT_COL.ORIGEM]              = 'SOLICITACAO';

      aba.appendRow(row);

      _chvRegistrarHistorico(novoId, dados.chaveId, 'SOLICITACAO', email, nome,
        '', CHV_STATUS_PROTOCOLO.SOLICITADA, dados.observacoes, 'USUARIO');
      registrarLog('PROTOCOLO_CHAVE', 'CHAVE', novoId, 'Solicitação de chave.', null, dados, email);

      return { ok: true, protocoloId: novoId };
    } finally {
      lock.releaseLock();
    }
  } catch(e) {
    throw new Error('Erro ao solicitar chave: ' + e.message);
  }
}

// ══════════════════════════════════════════════════════════════════
// BLOCO: Fluxo 2 — Infraestrutura inicia entrega direta
// ══════════════════════════════════════════════════════════════════

/**
 * Infraestrutura registra entrega direta para um usuário.
 * Cria protocolo AGUARDANDO_CONFIRMACAO_USUARIO.
 */
function chaves_iniciarEntregaDireta(dados, emailAtual) {
  try {
    const email = obterEmailUsuario(emailAtual || '');
    _chvExigeInfraOuAdmin(email);

    if (!dados || !dados.chaveId)      throw new Error('Chave obrigatória.');
    if (!dados.espacoId)               throw new Error('Espaço obrigatório.');
    if (!dados.destinoEmail)           throw new Error('Usuário destinatário obrigatório.');
    if (!dados.destinoEmail.includes('@')) throw new Error('Email do destinatário inválido.');

    const lock = obterLockComRetry('chaves_entregaDireta', 8000, 3);
    try {
      _chvValidarChaveDisponivel(dados.chaveId);
      _chvVerificarChaveJaEmUso(dados.chaveId);

      const nomeInfra = _chvResolverNome(email);
      const nomeDestino = _chvResolverNome(dados.destinoEmail);
      const setor = String(dados.setorNome || obterSetorUsuario(dados.destinoEmail) || '');
      const agora = new Date().toISOString();
      const novoId = gerarId('PCH');

      const aba = _chvGetProtocolos();
      if (!aba) throw new Error('Aba ProtocolosChaves não encontrada.');

      const row = new Array(25).fill('');
      row[PROT_COL.ID]                  = novoId;
      row[PROT_COL.CHAVE_ID]            = dados.chaveId;
      row[PROT_COL.ESPACO_ID]           = dados.espacoId;
      row[PROT_COL.RESPONSAVEL_ATUAL_ID]   = email;
      row[PROT_COL.RESPONSAVEL_ATUAL_NOME] = nomeInfra;
      row[PROT_COL.SOLICITANTE_ID]      = dados.destinoEmail;
      row[PROT_COL.SOLICITANTE_NOME]    = nomeDestino;
      row[PROT_COL.SETOR_ID]            = setor;
      row[PROT_COL.SETOR_NOME]          = setor;
      row[PROT_COL.DT_SOLICITACAO]      = agora;
      row[PROT_COL.DT_PREVISTA_DEVOLUCAO] = String(dados.dtPrevistaDevolucao || '');
      row[PROT_COL.STATUS]              = CHV_STATUS_PROTOCOLO.AGUARDANDO_CONFIRMACAO_USUARIO;
      row[PROT_COL.OBSERVACOES]         = String(dados.observacoes || '');
      row[PROT_COL.ENTREGUE_POR_ID]     = email;
      row[PROT_COL.ENTREGUE_POR_NOME]   = nomeInfra;
      row[PROT_COL.RESERVA_VINCULADA_ID] = String(dados.reservaId || '');
      row[PROT_COL.ORIGEM]              = 'ENTREGA_DIRETA';

      aba.appendRow(row);
      _chvAtualizarStatusChaveNaPlanilha(dados.chaveId, CHV_STATUS_CHAVE.EM_USO);

      _chvRegistrarHistorico(novoId, dados.chaveId, 'ENTREGA_DIRETA_INICIADA', email, nomeInfra,
        CHV_STATUS_CHAVE.DISPONIVEL, CHV_STATUS_PROTOCOLO.AGUARDANDO_CONFIRMACAO_USUARIO, dados.observacoes, 'INFRA');
      registrarLog('PROTOCOLO_CHAVE', 'CHAVE', novoId, 'Entrega direta pela infra.', null, dados, email);

      return { ok: true, protocoloId: novoId };
    } finally {
      lock.releaseLock();
    }
  } catch(e) {
    throw new Error('Erro ao iniciar entrega direta: ' + e.message);
  }
}

// ══════════════════════════════════════════════════════════════════
// BLOCO: Infraestrutura aprova solicitação (Fluxo 1, etapa infra)
// ══════════════════════════════════════════════════════════════════

/**
 * Infra aprova solicitação → status AGUARDANDO_CONFIRMACAO_USUARIO.
 * A chave só entra em uso oficial após confirmação do usuário.
 */
function chaves_aprovarEntrega(protocoloId, obs, emailAtual) {
  try {
    const email = obterEmailUsuario(emailAtual || '');
    _chvExigeInfraOuAdmin(email);

    const lock = obterLockComRetry('chaves_aprovarEntrega', 8000, 3);
    try {
      const r = _chvEncontrarProtocoloLinha(protocoloId);
      if (!r) throw new Error('Protocolo não encontrado: ' + protocoloId);
      const p = _chvMapearProtocolo(r.dados);

      if (p.status !== CHV_STATUS_PROTOCOLO.SOLICITADA)
        throw new Error('Apenas protocolos SOLICITADA podem ser aprovados. Status atual: ' + p.status);

      const nomeInfra = _chvResolverNome(email);
      const agora = new Date().toISOString();
      const extras = {};
      extras[PROT_COL.STATUS]              = CHV_STATUS_PROTOCOLO.AGUARDANDO_CONFIRMACAO_USUARIO;
      extras[PROT_COL.RESPONSAVEL_ATUAL_ID]   = email;
      extras[PROT_COL.RESPONSAVEL_ATUAL_NOME] = nomeInfra;
      extras[PROT_COL.ENTREGUE_POR_ID]     = email;
      extras[PROT_COL.ENTREGUE_POR_NOME]   = nomeInfra;
      if (obs) extras[PROT_COL.OBSERVACOES] = String(obs);
      _chvAtualizarProtocoloStatus(r.linha, CHV_STATUS_PROTOCOLO.AGUARDANDO_CONFIRMACAO_USUARIO, extras);
      _chvAtualizarStatusChaveNaPlanilha(p.chaveId, CHV_STATUS_CHAVE.EM_USO);

      _chvRegistrarHistorico(protocoloId, p.chaveId, 'ENTREGA_APROVADA_INFRA', email, nomeInfra,
        CHV_STATUS_PROTOCOLO.SOLICITADA, CHV_STATUS_PROTOCOLO.AGUARDANDO_CONFIRMACAO_USUARIO, obs, 'INFRA');

      return { ok: true };
    } finally {
      lock.releaseLock();
    }
  } catch(e) {
    throw new Error('Erro ao aprovar entrega: ' + e.message);
  }
}

// ══════════════════════════════════════════════════════════════════
// BLOCO: Usuário confirma recebimento → RETIRADA
// ══════════════════════════════════════════════════════════════════

function chaves_confirmarRecebimento(protocoloId, obs, emailAtual) {
  try {
    const email = obterEmailUsuario(emailAtual || '');
    const lock = obterLockComRetry('chaves_confirmarRecebimento', 8000, 3);
    try {
      const r = _chvEncontrarProtocoloLinha(protocoloId);
      if (!r) throw new Error('Protocolo não encontrado.');
      const p = _chvMapearProtocolo(r.dados);

      if (p.status !== CHV_STATUS_PROTOCOLO.AGUARDANDO_CONFIRMACAO_USUARIO)
        throw new Error('Protocolo não aguarda confirmação do usuário. Status: ' + p.status);

      const destino = p.solicitanteId;
      if (email !== destino && !_chvEhInfraOuAdmin(email))
        throw new Error('Apenas o usuário destinatário pode confirmar o recebimento.');

      const nome = _chvResolverNome(email);
      const agora = new Date().toISOString();
      const extras = {};
      extras[PROT_COL.STATUS]              = CHV_STATUS_PROTOCOLO.RETIRADA;
      extras[PROT_COL.RESPONSAVEL_ATUAL_ID]   = destino;
      extras[PROT_COL.RESPONSAVEL_ATUAL_NOME] = _chvResolverNome(destino);
      extras[PROT_COL.RECEBIDO_POR_ID]     = email;
      extras[PROT_COL.RECEBIDO_POR_NOME]   = nome;
      extras[PROT_COL.DT_RETIRADA]         = agora;
      if (obs) extras[PROT_COL.OBSERVACOES] = String(obs);

      _chvAtualizarProtocoloStatus(r.linha, CHV_STATUS_PROTOCOLO.RETIRADA, extras);
      _chvRegistrarHistorico(protocoloId, p.chaveId, 'RECEBIMENTO_CONFIRMADO', email, nome,
        CHV_STATUS_PROTOCOLO.AGUARDANDO_CONFIRMACAO_USUARIO, CHV_STATUS_PROTOCOLO.RETIRADA, obs, 'USUARIO');

      return { ok: true };
    } finally {
      lock.releaseLock();
    }
  } catch(e) {
    throw new Error('Erro ao confirmar recebimento: ' + e.message);
  }
}

// ══════════════════════════════════════════════════════════════════
// BLOCO: Usuário registra devolução → AGUARDANDO_CONFIRMACAO_INFRA
// ══════════════════════════════════════════════════════════════════

function chaves_registrarDevolucao(protocoloId, obs, emailAtual) {
  try {
    const email = obterEmailUsuario(emailAtual || '');
    const lock = obterLockComRetry('chaves_registrarDevolucao', 8000, 3);
    try {
      const r = _chvEncontrarProtocoloLinha(protocoloId);
      if (!r) throw new Error('Protocolo não encontrado.');
      const p = _chvMapearProtocolo(r.dados);

      const statusPermitidos = [CHV_STATUS_PROTOCOLO.RETIRADA, CHV_STATUS_PROTOCOLO.ATRASADA];
      if (!statusPermitidos.includes(p.status))
        throw new Error('Protocolo não está em posse do usuário. Status: ' + p.status);

      if (email !== p.responsavelId && !_chvEhInfraOuAdmin(email))
        throw new Error('Apenas o responsável pela chave pode registrar devolução.');

      const nome = _chvResolverNome(email);
      const agora = new Date().toISOString();
      const extras = {};
      extras[PROT_COL.STATUS]     = CHV_STATUS_PROTOCOLO.AGUARDANDO_CONFIRMACAO_INFRA;
      extras[PROT_COL.DT_DEVOLUCAO] = agora;
      if (obs) extras[PROT_COL.OBSERVACOES] = String(obs);

      _chvAtualizarProtocoloStatus(r.linha, CHV_STATUS_PROTOCOLO.AGUARDANDO_CONFIRMACAO_INFRA, extras);
      _chvRegistrarHistorico(protocoloId, p.chaveId, 'DEVOLUCAO_REGISTRADA', email, nome,
        p.status, CHV_STATUS_PROTOCOLO.AGUARDANDO_CONFIRMACAO_INFRA, obs, 'USUARIO');

      return { ok: true };
    } finally {
      lock.releaseLock();
    }
  } catch(e) {
    throw new Error('Erro ao registrar devolução: ' + e.message);
  }
}

// ══════════════════════════════════════════════════════════════════
// BLOCO: Infra confirma devolução → DEVOLVIDA
// ══════════════════════════════════════════════════════════════════

function chaves_confirmarDevolucao(protocoloId, obs, emailAtual) {
  try {
    const email = obterEmailUsuario(emailAtual || '');
    _chvExigeInfraOuAdmin(email);
    const lock = obterLockComRetry('chaves_confirmarDevolucao', 8000, 3);
    try {
      const r = _chvEncontrarProtocoloLinha(protocoloId);
      if (!r) throw new Error('Protocolo não encontrado.');
      const p = _chvMapearProtocolo(r.dados);

      if (p.status !== CHV_STATUS_PROTOCOLO.AGUARDANDO_CONFIRMACAO_INFRA)
        throw new Error('Protocolo não aguarda confirmação da infra. Status: ' + p.status);

      const nome = _chvResolverNome(email);
      const agora = new Date().toISOString();
      const extras = {};
      extras[PROT_COL.STATUS]                    = CHV_STATUS_PROTOCOLO.DEVOLVIDA;
      extras[PROT_COL.DEVOLUCAO_RECEBIDA_POR_ID]   = email;
      extras[PROT_COL.DEVOLUCAO_RECEBIDA_POR_NOME] = nome;
      if (obs) extras[PROT_COL.OBSERVACOES] = String(obs);

      _chvAtualizarProtocoloStatus(r.linha, CHV_STATUS_PROTOCOLO.DEVOLVIDA, extras);
      _chvAtualizarStatusChaveNaPlanilha(p.chaveId, CHV_STATUS_CHAVE.DISPONIVEL);

      _chvRegistrarHistorico(protocoloId, p.chaveId, 'DEVOLUCAO_CONFIRMADA_INFRA', email, nome,
        CHV_STATUS_PROTOCOLO.AGUARDANDO_CONFIRMACAO_INFRA, CHV_STATUS_PROTOCOLO.DEVOLVIDA, obs, 'INFRA');

      return { ok: true };
    } finally {
      lock.releaseLock();
    }
  } catch(e) {
    throw new Error('Erro ao confirmar devolução: ' + e.message);
  }
}

// ══════════════════════════════════════════════════════════════════
// BLOCO: Transferência entre usuários
// ══════════════════════════════════════════════════════════════════

/**
 * Usuário A solicita transferência para usuário B.
 * Status: TRANSFERENCIA_PENDENTE. Infra NÃO precisa aprovar.
 */
function chaves_solicitarTransferencia(protocoloId, destinoEmail, obs, emailAtual) {
  try {
    const email = obterEmailUsuario(emailAtual || '');
    if (!destinoEmail || !destinoEmail.includes('@'))
      throw new Error('Email do destinatário inválido.');

    const lock = obterLockComRetry('chaves_solicitarTransferencia', 8000, 3);
    try {
      const r = _chvEncontrarProtocoloLinha(protocoloId);
      if (!r) throw new Error('Protocolo não encontrado.');
      const p = _chvMapearProtocolo(r.dados);

      if (p.status !== CHV_STATUS_PROTOCOLO.RETIRADA)
        throw new Error('Transferência só é possível para chaves em status RETIRADA. Status: ' + p.status);

      if (email !== p.responsavelId && !_chvEhAdmin(email))
        throw new Error('Apenas o responsável atual pode solicitar transferência.');

      // Verificar chave não bloqueada/extraviada
      const rChave = _chvEncontrarChaveLinha(p.chaveId);
      if (rChave) {
        const statusChave = String(rChave.dados[CHV_COL.STATUS]);
        if ([CHV_STATUS_CHAVE.BLOQUEADA, CHV_STATUS_CHAVE.EXTRAVIADA].includes(statusChave))
          throw new Error('Não é possível transferir chave com status: ' + statusChave);
      }

      // Verificar transferência duplicada
      if (p.status === CHV_STATUS_PROTOCOLO.TRANSFERENCIA_PENDENTE)
        throw new Error('Já existe transferência pendente para este protocolo.');

      const nomeDestino = _chvResolverNome(destinoEmail);
      const extras = {};
      extras[PROT_COL.STATUS]                    = CHV_STATUS_PROTOCOLO.TRANSFERENCIA_PENDENTE;
      extras[PROT_COL.TRANSFERENCIA_DESTINO_ID]   = destinoEmail;
      extras[PROT_COL.TRANSFERENCIA_DESTINO_NOME] = nomeDestino;
      if (obs) extras[PROT_COL.OBSERVACOES] = String(obs);

      _chvAtualizarProtocoloStatus(r.linha, CHV_STATUS_PROTOCOLO.TRANSFERENCIA_PENDENTE, extras);

      const nome = _chvResolverNome(email);
      _chvRegistrarHistorico(protocoloId, p.chaveId, 'TRANSFERENCIA_SOLICITADA', email, nome,
        CHV_STATUS_PROTOCOLO.RETIRADA, CHV_STATUS_PROTOCOLO.TRANSFERENCIA_PENDENTE,
        'Para: ' + destinoEmail + '. ' + (obs || ''), 'USUARIO');

      return { ok: true };
    } finally {
      lock.releaseLock();
    }
  } catch(e) {
    throw new Error('Erro ao solicitar transferência: ' + e.message);
  }
}

/**
 * Usuário B confirma recebimento da transferência.
 * Responsabilidade é transferida automaticamente.
 */
function chaves_confirmarTransferencia(protocoloId, obs, emailAtual) {
  try {
    const email = obterEmailUsuario(emailAtual || '');
    const lock = obterLockComRetry('chaves_confirmarTransferencia', 8000, 3);
    try {
      const r = _chvEncontrarProtocoloLinha(protocoloId);
      if (!r) throw new Error('Protocolo não encontrado.');
      const p = _chvMapearProtocolo(r.dados);

      if (p.status !== CHV_STATUS_PROTOCOLO.TRANSFERENCIA_PENDENTE)
        throw new Error('Protocolo não possui transferência pendente. Status: ' + p.status);

      if (email !== p.transferenciaDestinoId && !_chvEhAdmin(email))
        throw new Error('Apenas o destinatário da transferência pode confirmar.');

      const nomeNovo = _chvResolverNome(email);
      const extras = {};
      extras[PROT_COL.STATUS]                    = CHV_STATUS_PROTOCOLO.TRANSFERIDA;
      extras[PROT_COL.RESPONSAVEL_ATUAL_ID]       = email;
      extras[PROT_COL.RESPONSAVEL_ATUAL_NOME]     = nomeNovo;
      extras[PROT_COL.RECEBIDO_POR_ID]           = email;
      extras[PROT_COL.RECEBIDO_POR_NOME]         = nomeNovo;
      extras[PROT_COL.DT_RETIRADA]               = new Date().toISOString();
      if (obs) extras[PROT_COL.OBSERVACOES] = String(obs);

      _chvAtualizarProtocoloStatus(r.linha, CHV_STATUS_PROTOCOLO.TRANSFERIDA, extras);

      _chvRegistrarHistorico(protocoloId, p.chaveId, 'TRANSFERENCIA_CONFIRMADA', email, nomeNovo,
        CHV_STATUS_PROTOCOLO.TRANSFERENCIA_PENDENTE, CHV_STATUS_PROTOCOLO.TRANSFERIDA, obs, 'USUARIO');

      return { ok: true };
    } finally {
      lock.releaseLock();
    }
  } catch(e) {
    throw new Error('Erro ao confirmar transferência: ' + e.message);
  }
}

/**
 * Cancela transferência pendente — restaura status RETIRADA.
 */
function chaves_cancelarTransferencia(protocoloId, obs, emailAtual) {
  try {
    const email = obterEmailUsuario(emailAtual || '');
    const r = _chvEncontrarProtocoloLinha(protocoloId);
    if (!r) throw new Error('Protocolo não encontrado.');
    const p = _chvMapearProtocolo(r.dados);

    if (p.status !== CHV_STATUS_PROTOCOLO.TRANSFERENCIA_PENDENTE)
      throw new Error('Protocolo não possui transferência pendente.');

    if (email !== p.responsavelId && !_chvEhInfraOuAdmin(email))
      throw new Error('Sem permissão para cancelar a transferência.');

    const extras = {};
    extras[PROT_COL.STATUS]                    = CHV_STATUS_PROTOCOLO.RETIRADA;
    extras[PROT_COL.TRANSFERENCIA_DESTINO_ID]   = '';
    extras[PROT_COL.TRANSFERENCIA_DESTINO_NOME] = '';
    if (obs) extras[PROT_COL.OBSERVACOES] = String(obs);

    _chvAtualizarProtocoloStatus(r.linha, CHV_STATUS_PROTOCOLO.RETIRADA, extras);
    const nome = _chvResolverNome(email);
    _chvRegistrarHistorico(protocoloId, p.chaveId, 'TRANSFERENCIA_CANCELADA', email, nome,
      CHV_STATUS_PROTOCOLO.TRANSFERENCIA_PENDENTE, CHV_STATUS_PROTOCOLO.RETIRADA, obs, 'USUARIO');

    return { ok: true };
  } catch(e) {
    throw new Error('Erro ao cancelar transferência: ' + e.message);
  }
}

// ══════════════════════════════════════════════════════════════════
// BLOCO: Cancelamento e negativa
// ══════════════════════════════════════════════════════════════════

function chaves_cancelar(protocoloId, motivo, emailAtual) {
  try {
    const email = obterEmailUsuario(emailAtual || '');
    const r = _chvEncontrarProtocoloLinha(protocoloId);
    if (!r) throw new Error('Protocolo não encontrado.');
    const p = _chvMapearProtocolo(r.dados);

    const statusCancelaveis = [CHV_STATUS_PROTOCOLO.SOLICITADA];
    const ehProprioOuAdmin = email === p.solicitanteId || _chvEhInfraOuAdmin(email);
    if (!ehProprioOuAdmin) throw new Error('Sem permissão para cancelar.');
    if (!statusCancelaveis.includes(p.status))
      throw new Error('Apenas protocolos SOLICITADA podem ser cancelados. Status: ' + p.status);

    const extras = {};
    extras[PROT_COL.STATUS] = CHV_STATUS_PROTOCOLO.CANCELADA;
    if (motivo) extras[PROT_COL.OBSERVACOES] = String(motivo);
    _chvAtualizarProtocoloStatus(r.linha, CHV_STATUS_PROTOCOLO.CANCELADA, extras);

    const nome = _chvResolverNome(email);
    _chvRegistrarHistorico(protocoloId, p.chaveId, 'CANCELADO', email, nome,
      p.status, CHV_STATUS_PROTOCOLO.CANCELADA, motivo, 'USUARIO');

    return { ok: true };
  } catch(e) {
    throw new Error('Erro ao cancelar: ' + e.message);
  }
}

function chaves_negar(protocoloId, motivo, emailAtual) {
  try {
    const email = obterEmailUsuario(emailAtual || '');
    _chvExigeInfraOuAdmin(email);

    const r = _chvEncontrarProtocoloLinha(protocoloId);
    if (!r) throw new Error('Protocolo não encontrado.');
    const p = _chvMapearProtocolo(r.dados);

    if (p.status !== CHV_STATUS_PROTOCOLO.SOLICITADA)
      throw new Error('Apenas solicitações podem ser negadas. Status: ' + p.status);

    const extras = {};
    extras[PROT_COL.STATUS] = CHV_STATUS_PROTOCOLO.NEGADA;
    if (motivo) extras[PROT_COL.OBSERVACOES] = String(motivo);
    _chvAtualizarProtocoloStatus(r.linha, CHV_STATUS_PROTOCOLO.NEGADA, extras);

    const nome = _chvResolverNome(email);
    _chvRegistrarHistorico(protocoloId, p.chaveId, 'NEGADO', email, nome,
      p.status, CHV_STATUS_PROTOCOLO.NEGADA, motivo, 'INFRA');

    return { ok: true };
  } catch(e) {
    throw new Error('Erro ao negar: ' + e.message);
  }
}

// ══════════════════════════════════════════════════════════════════
// BLOCO: Job de verificação de atrasos (executar via trigger)
// ══════════════════════════════════════════════════════════════════

/**
 * Marca protocolos RETIRADA como ATRASADA quando a data prevista passou.
 * Deve ser chamado por trigger diário.
 */
function chaves_verificarAtrasos() {
  try {
    const aba = _chvGetProtocolos();
    if (!aba || aba.getLastRow() < 2) return;
    const numCols = Math.min(aba.getLastColumn(), 25);
    const dados = aba.getRange(2, 1, aba.getLastRow() - 1, numCols).getValues();
    const agora = new Date();

    for (let i = 0; i < dados.length; i++) {
      const p = _chvMapearProtocolo(dados[i]);
      if (!p) continue;
      if (p.status !== CHV_STATUS_PROTOCOLO.RETIRADA) continue;
      if (!p.dtPrevistaDev) continue;

      const prevista = new Date(p.dtPrevistaDev);
      if (isNaN(prevista.getTime())) continue;
      if (agora > prevista) {
        aba.getRange(i + 2, PROT_COL.STATUS + 1).setValue(CHV_STATUS_PROTOCOLO.ATRASADA);
        _chvRegistrarHistorico(p.id, p.chaveId, 'MARCADO_ATRASADO', 'sistema', 'Sistema',
          CHV_STATUS_PROTOCOLO.RETIRADA, CHV_STATUS_PROTOCOLO.ATRASADA, 'Devolução prevista: ' + p.dtPrevistaDev, 'SISTEMA');
      }
    }
    console.log('chaves_verificarAtrasos: concluído.');
  } catch(e) {
    console.error('chaves_verificarAtrasos: ' + e.message);
  }
}

// ══════════════════════════════════════════════════════════════════
// BLOCO: Relatórios e indicadores
// ══════════════════════════════════════════════════════════════════

function chaves_obterIndicadores(emailAtual) {
  try {
    obterEmailUsuario(emailAtual || '');
    const protocolos = _chvLerProtocolos().map(_chvMapearProtocolo).filter(Boolean);
    const chaves = _chvLerChaves().map(_chvMapearChave).filter(Boolean);

    const statusAtivos = [
      CHV_STATUS_PROTOCOLO.SOLICITADA,
      CHV_STATUS_PROTOCOLO.AGUARDANDO_CONFIRMACAO_USUARIO,
      CHV_STATUS_PROTOCOLO.AGUARDANDO_CONFIRMACAO_INFRA,
      CHV_STATUS_PROTOCOLO.RETIRADA,
      CHV_STATUS_PROTOCOLO.ATRASADA,
      CHV_STATUS_PROTOCOLO.TRANSFERENCIA_PENDENTE
    ];

    const devolvidas = protocolos.filter(function(p) { return p.status === CHV_STATUS_PROTOCOLO.DEVOLVIDA; });
    let somaTemposDev = 0;
    let contTempos = 0;
    devolvidas.forEach(function(p) {
      if (p.dtSolicitacao && p.dtDevolucao) {
        const ms = new Date(p.dtDevolucao) - new Date(p.dtSolicitacao);
        if (ms > 0) { somaTemposDev += ms; contTempos++; }
      }
    });

    const contagemEspaco = {};
    const contagemUsuario = {};
    const contagemChave = {};
    protocolos.forEach(function(p) {
      contagemEspaco[p.espacoId]   = (contagemEspaco[p.espacoId] || 0) + 1;
      contagemUsuario[p.responsavelId] = (contagemUsuario[p.responsavelId] || 0) + 1;
      contagemChave[p.chaveId]     = (contagemChave[p.chaveId] || 0) + 1;
    });

    return {
      ok: true,
      totalProtocolos:      protocolos.length,
      protocolosAtivos:     protocolos.filter(function(p) { return statusAtivos.includes(p.status); }).length,
      atrasados:            protocolos.filter(function(p) { return p.status === CHV_STATUS_PROTOCOLO.ATRASADA; }).length,
      pendentesInfra:       protocolos.filter(function(p) { return p.status === CHV_STATUS_PROTOCOLO.AGUARDANDO_CONFIRMACAO_INFRA; }).length,
      pendentesUsuario:     protocolos.filter(function(p) { return p.status === CHV_STATUS_PROTOCOLO.AGUARDANDO_CONFIRMACAO_USUARIO; }).length,
      transferenciasAbertas: protocolos.filter(function(p) { return p.status === CHV_STATUS_PROTOCOLO.TRANSFERENCIA_PENDENTE; }).length,
      tempoMedioDevolucaoHoras: contTempos > 0 ? Math.round(somaTemposDev / contTempos / 3600000 * 10) / 10 : 0,
      chavesDisponiveis:    chaves.filter(function(c) { return c.status === CHV_STATUS_CHAVE.DISPONIVEL; }).length,
      chavesEmUso:          chaves.filter(function(c) { return c.status === CHV_STATUS_CHAVE.EM_USO; }).length,
      chavesManutencao:     chaves.filter(function(c) { return c.status === CHV_STATUS_CHAVE.MANUTENCAO; }).length,
      chavesBloqueadas:     chaves.filter(function(c) { return c.status === CHV_STATUS_CHAVE.BLOQUEADA; }).length,
      chavesExtraviadas:    chaves.filter(function(c) { return c.status === CHV_STATUS_CHAVE.EXTRAVIADA; }).length,
      contagemPorEspaco:    contagemEspaco,
      contagemPorChave:     contagemChave,
      contagemPorUsuario:   contagemUsuario
    };
  } catch(e) {
    throw new Error('Erro ao obter indicadores: ' + e.message);
  }
}

// ══════════════════════════════════════════════════════════════════
// BLOCO: Atualizar campos de espaço (possuiChaves etc.) via admin
// ══════════════════════════════════════════════════════════════════

/**
 * Salva campos de chave nos espaços (Configuracoes).
 * Chamado por processarSalvarConfig em mod_admin.gs quando tipo='espaco'.
 */
function chaves_salvarCamposEspaco(id, dados, emailAtual) {
  try {
    const email = obterEmailUsuario(emailAtual || '');
    verificarPermissao('admin', email);

    const aba = _chvGetConfiguracoes();
    if (!aba) throw new Error('Aba Configuracoes não encontrada.');
    const rows = aba.getDataRange().getValues();

    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][CONF_COL.ID]).trim() === String(id).trim()) {
        const linha = i + 1;

        // Garantir colunas expandidas
        aba.getRange(linha, CONF_COL.POSSUI_CHAVES + 1).setValue(!!dados.possuiChaves);
        aba.getRange(linha, CONF_COL.QTD_USO_COMUM + 1).setValue(Number(dados.qtdUsoComum || 0));
        aba.getRange(linha, CONF_COL.QTD_RESERVA + 1).setValue(Number(dados.qtdReserva || 0));
        aba.getRange(linha, CONF_COL.ACEITA_RESERVA + 1).setValue(dados.aceitaReserva !== false);
        aba.getRange(linha, CONF_COL.EXIGE_PROTOCOLO + 1).setValue(!!dados.exigeProtocolo);
        aba.getRange(linha, CONF_COL.LOCALIZACAO_CHAVE + 1).setValue(String(dados.localizacaoChave || ''));
        aba.getRange(linha, CONF_COL.OBS_INTERNAS + 1).setValue(String(dados.obsInternas || ''));
        aba.getRange(linha, CONF_COL.SETOR_RESPONSAVEL + 1).setValue(String(dados.setorResponsavel || ''));

        registrarLog('EDIÇÃO', 'ESPACO_CHAVES', id, 'Campos de chave atualizados.', null, dados, email);
        return { ok: true };
      }
    }
    throw new Error('Espaço não encontrado: ' + id);
  } catch(e) {
    throw new Error('Erro ao salvar campos do espaço: ' + e.message);
  }
}

/**
 * Retorna todos os espaços com dados expandidos para o painel admin.
 */
function chaves_listarEspacosCompletos(emailAtual) {
  try {
    obterEmailUsuario(emailAtual || '');
    const espacosBrutos = _chvLerEspacos();
    return {
      ok: true,
      espacos: espacosBrutos.map(_chvMapearEspaco).filter(Boolean)
    };
  } catch(e) {
    throw new Error('Erro ao listar espaços: ' + e.message);
  }
}
