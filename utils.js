/**
 * @file utils.js
 * @description Utilitários centralizados do backend: acesso a planilhas, parsing,
 *              validação, sanitização, índices de lookup e controle de concorrência.
 * @layer backend
 * @responsibility Funções puras reutilizáveis por todos os módulos GAS.
 *                 Nenhuma lógica de negócio aqui — apenas infraestrutura.
 * @dependencies Setup.js (_abrirModulo), PropertiesService (via Setup)
 */

/**
 * ========================================
 * BLOCO: Roteamento de planilhas — _getSheet
 * ========================================
 * @description Ponto único de acesso a qualquer aba do sistema multi-planilha.
 *              ABA_PARA_MODULO mapeia nome da aba → chave do módulo (definida em Setup.js).
 *              _getSheet roteia para a planilha correta via _abrirModulo() e retorna null
 *              em caso de falha (nunca lança exceção) para manter compatibilidade com o padrão
 *              de checagem `if (!aba || aba.getLastRow() < 2)` usado em todo o código.
 * @context Chamado por todos os módulos backend que precisam acessar uma aba
 * @inputs nomeAba — nome exato da aba conforme definido em MODULOS (Setup.js)
 * @outputs GoogleAppsScript.Spreadsheet.Sheet ou null
 * @sideEffects Abre planilha via SpreadsheetApp.openById (1 acesso por execução, cacheado)
 */

const ABA_PARA_MODULO = {
  // MASTER
  'Administradores':      'MASTER',
  'Configuracoes':        'MASTER',
  'Listas':               'MASTER',
  'Logs':                 'MASTER',
  'LogAcessos':           'MASTER',
  'PreferenciasUsuarios': 'MASTER',

  // ESPACOS
  'Reservas':             'ESPACOS',
  'Itens':                'ESPACOS',
  'Ativos':               'ESPACOS',
  'Solicitacoes':         'ESPACOS',

  // COMUNICACAO
  'ReservasRECE':         'COMUNICACAO',
  'ProcessosComunicacao': 'COMUNICACAO',
  'EntregasComunicacao':  'COMUNICACAO',

  // RELATORIOS
  'RelatoriosCODIP':      'RELATORIOS',
  'Contratos':            'RELATORIOS',
  'Metas':                'RELATORIOS',
  'Indicadores':          'RELATORIOS',
  'Rubricas':             'RELATORIOS',
  'RubricasMemoria':      'RELATORIOS',
  'RubricasHistorico':    'RELATORIOS',
  'ContratosVersoes':     'RELATORIOS',

  // FINANCEIRO
  'Contratacoes':         'FINANCEIRO',
  'Pagamentos':           'FINANCEIRO',
  'FluxoCaixa':           'FINANCEIRO',
  'RubricasFinanceiro':   'FINANCEIRO',

  // EQUIPES
  'Funcionarios':         'EQUIPES',
  'Escalas':              'EQUIPES',
  'Avaliacoes':           'EQUIPES',
  'Ferias':               'EQUIPES',

  // PESSOAL
  'Tarefas':              'PESSOAL',
  'Processos':            'PESSOAL',
  'Demandas':             'PESSOAL',

  // ESCUTA
  'EscutaConfig':         'ESCUTA',
  'EscutaPerguntas':      'ESCUTA',
  'EscutaRespostas':      'ESCUTA',
  'EscutaEspontanea':     'ESCUTA',
  'EscutaPesquisas':      'ESCUTA',
  'EscutaTemplates':      'ESCUTA',
  'EscutaAlertas':        'ESCUTA',
  'EscutaPerfis':         'ESCUTA',
  'EscutaSaturacao':      'ESCUTA',
  'EscutaAcoes':          'ESCUTA',
  'LogsEscuta':           'ESCUTA',
};

// ══════════════════════════════════════════════════════
// _getSheet — ponto único de acesso a abas
// ══════════════════════════════════════════════════════

/**
 * Retorna a Sheet correta, roteando para o módulo certo.
 * Nunca lança exceção: retorna null em caso de falha (compatível
 * com o padrão já usado em todo o código legado).
 *
 * @param {string} nomeAba - Nome exato da aba
 * @returns {GoogleAppsScript.Spreadsheet.Sheet|null}
 */
function _getSheet(nomeAba) {
  try {
    const modulo = ABA_PARA_MODULO[nomeAba];

    if (!modulo) {
      // Aba não mapeada: tenta planilha ativa (útil em desenvolvimento)
      console.warn('_getSheet: "' + nomeAba + '" sem módulo mapeado. Tentando planilha ativa.');
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      return ss ? ss.getSheetByName(nomeAba) : null;
    }

    const ss = _abrirModulo(modulo);
    if (!ss) {
      console.error('_getSheet: módulo "' + modulo + '" retornou null. Execute inicializarSistema().');
      return null;
    }

    const aba = ss.getSheetByName(nomeAba);
    if (!aba) {
      console.error('_getSheet: aba "' + nomeAba + '" não encontrada em ' + modulo + '. Execute recriarEstrutura().');
    }
    return aba;

  } catch (e) {
    console.error('_getSheet("' + nomeAba + '"): ' + e.message);
    return null;
  }
}

// ══════════════════════════════════════════════════════
// DIAGNÓSTICO — rode manualmente no editor se tiver dúvida
// ══════════════════════════════════════════════════════

/**
 * Testa se todas as abas mapeadas são acessíveis.
 * Execute no editor: verificarTodasAbas()
 */
function verificarTodasAbas() {
  const resultados = [];

  Object.keys(ABA_PARA_MODULO).forEach(function(nomeAba) {
    const aba = _getSheet(nomeAba);
    resultados.push({
      aba:    nomeAba,
      modulo: ABA_PARA_MODULO[nomeAba],
      ok:     aba !== null,
    });
  });

  const falhas = resultados.filter(function(r) { return !r.ok; });

  if (falhas.length === 0) {
    console.log('✅ Todas as ' + resultados.length + ' abas acessíveis.');
  } else {
    console.warn('⚠️ ' + falhas.length + ' aba(s) inacessível(is):');
    falhas.forEach(function(f) {
      console.warn('  • [' + f.modulo + '] ' + f.aba);
    });
    console.log('\nSolução: execute inicializarSistema() ou recriarEstrutura()');
  }

  return resultados;
}

/**
 * ========================================
 * BLOCO: Parsing e normalização de datas e horas
 * ========================================
 * @description Converte representações de data e hora para formatos internos consistentes.
 *              normalizarData: Date|string → timestamp ms (para comparação)
 *              formatarData: any → string DD/MM/YYYY (para exibição)
 *              normalizarHora: Date|string → minutos desde 00:00 (para aritmética)
 *              formatarHora: minutos → string HH:MM (para exibição)
 * @context Usados em toda a camada de serviço e repositório do backend
 * @sideEffects Nenhum — funções puras
 */

/**
 * Normaliza data para um timestamp (milissegundos desde epoch)
 * Aceita: Date object, string DD/MM/YYYY, string YYYY-MM-DD
 * 
 * @param {Date|string} data - Data em qualquer formato suportado
 * @returns {number|null} Timestamp normalizado ou null se inválido
 */
function normalizarData(data) {
  try {
    if (!data) return null;

    // Caso 1: Date object
    if (data instanceof Date) {
      const dt = new Date(data);
      dt.setHours(0, 0, 0, 0);
      return dt.getTime();
    }

    // Caso 2: String em qualquer formato
    const str = String(data).trim();
    if (!str) return null;

    let dateObj;

    // Formato DD/MM/YYYY
    if (str.includes('/') && !str.includes('-')) {
      const partes = str.split('/');
      if (partes.length === 3) {
        dateObj = new Date(parseInt(partes[2]), parseInt(partes[1]) - 1, parseInt(partes[0]));
      }
    }
    // Formato YYYY-MM-DD
    else if (str.includes('-')) {
      dateObj = new Date(str);
    }
    // Tenta parse genérico
    else {
      dateObj = new Date(str);
    }

    if (dateObj && !isNaN(dateObj.getTime())) {
      dateObj.setHours(0, 0, 0, 0);
      return dateObj.getTime();
    }

    return null;
  } catch (e) {
    console.error('Erro em normalizarData:', e.message);
    return null;
  }
}

/**
 * Formata data para string DD/MM/YYYY
 * 
 * @param {Date|string|number} data - Data em qualquer formato
 * @returns {string} Data formatada como DD/MM/YYYY ou string vazia se inválido
 */
function formatarData(data) {
  try {
    if (!data) return '';

    let dateObj;

    if (data instanceof Date) {
      dateObj = data;
    } else if (typeof data === 'number') {
      dateObj = new Date(data);
    } else {
      const ts = normalizarData(data);
      if (ts === null) return '';
      dateObj = new Date(ts);
    }

    if (!dateObj || isNaN(dateObj.getTime())) return '';

    const dia = String(dateObj.getDate()).padStart(2, '0');
    const mes = String(dateObj.getMonth() + 1).padStart(2, '0');
    const ano = dateObj.getFullYear();

    return `${dia}/${mes}/${ano}`;
  } catch (e) {
    console.error('Erro em formatarData:', e.message);
    return '';
  }
}

/**
 * Normaliza horário para minutos desde 00:00
 * Aceita: Date object, string HH:MM, string HH:MM:SS
 * 
 * @param {Date|string} hora - Hora em qualquer formato
 * @returns {number|null} Minutos desde 00:00 ou null se inválido
 */
function normalizarHora(hora) {
  try {
    if (!hora) return null;

    // Caso 1: Date object
    if (hora instanceof Date) {
      return hora.getHours() * 60 + hora.getMinutes();
    }

    // Caso 2: String HH:MM ou HH:MM:SS
    const str = String(hora).trim();
    if (!str) return null;

    const partes = str.split(':');
    if (partes.length < 2) return null;

    const hh = parseInt(partes[0], 10);
    const mm = parseInt(partes[1], 10);

    if (isNaN(hh) || isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
      return null;
    }

    return hh * 60 + mm;
  } catch (e) {
    console.error('Erro em normalizarHora:', e.message);
    return null;
  }
}

/**
 * Formata minutos desde 00:00 para string HH:MM
 * 
 * @param {number} minutos - Minutos desde 00:00
 * @returns {string} Horário formatado como HH:MM
 */
function formatarHora(minutos) {
  try {
    if (typeof minutos !== 'number' || minutos < 0 || minutos >= 1440) {
      return '';
    }

    const hh = String(Math.floor(minutos / 60)).padStart(2, '0');
    const mm = String(minutos % 60).padStart(2, '0');

    return `${hh}:${mm}`;
  } catch (e) {
    console.error('Erro em formatarHora:', e.message);
    return '';
  }
}

/**
 * ========================================
 * BLOCO: Validação de entradas
 * ========================================
 * @description Valida e normaliza emails, IDs e formatos de horário.
 *              Funções de validação retornam boolean; funções de normalização
 *              retornam o valor tratado ou lançam Error se inválido.
 * @context Usados nos entrypoints expostos ao frontend (validação de boundary)
 * @sideEffects Nenhum — funções puras (exceto normalizarEmail que lança Error)
 */

/**
 * Valida se uma string é um email válido
 * 
 * @param {string} email - Email a validar
 * @returns {boolean} true se válido
 */
function validarEmail(email) {
  try {
    if (!email || typeof email !== 'string') return false;

    const emailLimpo = String(email).trim().toLowerCase();
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    return regex.test(emailLimpo);
  } catch (e) {
    return false;
  }
}

/**
 * Normaliza e valida email
 * 
 * @param {string} email - Email a normalizar
 * @returns {string} Email normalizado ou lança erro se inválido
 */
function normalizarEmail(email) {
  if (!validarEmail(email)) {
    throw new Error(`Email inválido: ${email}`);
  }

  return String(email).trim().toLowerCase();
}

/**
 * Valida se uma string é um ID válido (formato: PREFIXO-TIMESTAMP-RANDOM)
 * 
 * @param {string} id - ID a validar
 * @returns {boolean} true se válido
 */
function validarID(id) {
  try {
    if (!id || typeof id !== 'string') return false;

    const idLimpo = String(id).trim();
    // Padrão: XXX-....-.... (prefixo de 3 letras, seguido de timestamp e random)
    const regex = /^[A-Z]{3}-[A-Z0-9]+-[A-Z0-9]+$/;

    return regex.test(idLimpo) && idLimpo.length < 100;
  } catch (e) {
    return false;
  }
}

/**
 * Normaliza e valida ID
 * 
 * @param {string} id - ID a normalizar
 * @returns {string} ID normalizado ou lança erro se inválido
 */
function normalizarID(id) {
  if (!validarID(id)) {
    throw new Error(`ID inválido: ${id}`);
  }

  return String(id).trim().toUpperCase();
}

/**
 * Valida formato de horário HH:MM
 * 
 * @param {string} hora - Hora a validar
 * @returns {boolean} true se válido
 */
function validarFormatoHora(hora) {
  try {
    if (!hora || typeof hora !== 'string') return false;

    const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    return regex.test(String(hora).trim());
  } catch (e) {
    return false;
  }
}

/**
 * ========================================
 * BLOCO: Comparações e verificações de horários
 * ========================================
 * @description Funções para detectar sobreposição de horários e calcular durações.
 *              horariosSobrepostos: usa o algoritmo clássico ini1 < ter2 && ter1 > ini2.
 * @context Usados principalmente em mod_reservas.gs para detecção de conflito
 * @sideEffects Nenhum — funções puras
 */

/**
 * Verifica se dois horários se sobrepõem
 * 
 * @param {number} ini1 - Minutos de início do período 1
 * @param {number} ter1 - Minutos de término do período 1
 * @param {number} ini2 - Minutos de início do período 2
 * @param {number} ter2 - Minutos de término do período 2
 * @returns {boolean} true se há sobreposição
 */
function horariosSobrepostos(ini1, ter1, ini2, ter2) {
  if (typeof ini1 !== 'number' || typeof ter1 !== 'number' ||
      typeof ini2 !== 'number' || typeof ter2 !== 'number') {
    return false;
  }

  return ini1 < ter2 && ter1 > ini2;
}

/**
 * Calcula duração em minutos entre dois horários
 * 
 * @param {Date|string|number} inicio - Horário inicial
 * @param {Date|string|number} fim - Horário final
 * @returns {number|null} Duração em minutos ou null se inválido
 */
function calcularDuracaoMinutos(inicio, fim) {
  try {
    const iniMin = normalizarHora(inicio);
    const fimMin = normalizarHora(fim);

    if (iniMin === null || fimMin === null || fimMin <= iniMin) {
      return null;
    }

    return fimMin - iniMin;
  } catch (e) {
    return null;
  }
}

/**
 * ========================================
 * BLOCO: Índices de lookup por ID e coluna
 * ========================================
 * @description Constrói dicionários para lookup O(1) a partir de arrays 2D de planilha,
 *              evitando iterações lineares repetidas nos módulos de serviço.
 * @context Usados em módulos que precisam de lookups frequentes por ID ou chave
 * @sideEffects Nenhum — funções puras (recebem arrays, retornam objetos)
 */

/**
 * Cria um mapa {id → linha completa} para lookup rápido
 * 
 * @param {Array<Array>} dados - Array 2D com dados (primeira coluna = ID)
 * @returns {Object} Mapa {id → [dados da linha]}
 */
function criarIndiceID(dados) {
  const indice = {};

  if (!Array.isArray(dados)) return indice;

  dados.forEach((linha, idx) => {
    if (Array.isArray(linha) && linha.length > 0) {
      const id = String(linha[0] || '').trim();
      if (id) {
        indice[id] = { dados: linha, indice: idx };
      }
    }
  });

  return indice;
}

/**
 * Cria um mapa {valor de coluna → linha completa} para lookup rápido
 * 
 * @param {Array<Array>} dados - Array 2D com dados
 * @param {number} coluna - Índice da coluna a usar como chave (0-indexed)
 * @returns {Object} Mapa {valor → [dados da linha]}
 */
function criarIndiceColuna(dados, coluna) {
  const indice = {};

  if (!Array.isArray(dados) || typeof coluna !== 'number' || coluna < 0) {
    return indice;
  }

  dados.forEach((linha, idx) => {
    if (Array.isArray(linha) && linha[coluna] !== undefined) {
      const chave = String(linha[coluna] || '').trim();
      if (chave) {
        if (!indice[chave]) {
          indice[chave] = [];
        }
        indice[chave].push({ dados: linha, indice: idx });
      }
    }
  });

  return indice;
}

/**
 * ========================================
 * BLOCO: Sanitização de entradas
 * ========================================
 * @description Proteção contra injection em textos livres e números recebidos do frontend.
 *              sanitizarTexto: remove `<>` e limita tamanho.
 *              sanitizarNumero: garante range válido.
 * @context Aplicados em entrypoints que recebem dados não confiáveis do frontend
 * @sideEffects Nenhum — funções puras
 */

/**
 * Sanitiza texto removendo caracteres perigosos e limitando tamanho
 * 
 * @param {string} texto - Texto a sanitizar
 * @param {number} maxLen - Comprimento máximo (default: 5000)
 * @returns {string} Texto sanitizado
 */
function sanitizarTexto(texto, maxLen = 5000) {
  try {
    return String(texto || '')
      .replace(/[<>]/g, '')
      .substring(0, maxLen);
  } catch (e) {
    return '';
  }
}

/**
 * Sanitiza número para evitar injection
 * 
 * @param {*} valor - Valor a validar como número
 * @param {number} min - Valor mínimo aceito (default: -Infinity)
 * @param {number} max - Valor máximo aceito (default: Infinity)
 * @returns {number} Número validado ou 0 se inválido
 */
function sanitizarNumero(valor, min = -Infinity, max = Infinity) {
  try {
    const num = Number(valor);
    if (isNaN(num)) return 0;

    if (num < min) return min;
    if (num > max) return max;

    return num;
  } catch (e) {
    return 0;
  }
}

/**
 * ========================================
 * BLOCO: Controle de concorrência — Lock com retry
 * ========================================
 * @description Obtém um LockService.getUserLock() com backoff exponencial.
 *              Necessário porque múltiplos usuários podem salvar reservas simultaneamente
 *              e o GAS não tem transações — o lock garante consistência na planilha.
 * @context Usado em processarAgendamentoLote e excluirRegistroPorID
 * @sideEffects Bloqueia execução por até timeoutMs ms por tentativa
 */

/**
 * Obtém lock com retry automático
 * 
 * @param {string} nome - Nome identificador do lock
 * @param {number} timeoutMs - Timeout em ms (default: 10000)
 * @param {number} maxTentativas - Máximo de tentativas (default: 3)
 * @returns {GoogleAppsScript.Lock.Lock} Lock obtido ou lança erro
 */
function obterLockComRetry(nome, timeoutMs = 10000, maxTentativas = 3) {
  const lock = LockService.getUserLock();

  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    try {
      lock.waitLock(timeoutMs);
      return lock;
    } catch (e) {
      if (tentativa === maxTentativas) {
        throw new Error(`Não foi possível obter lock "${nome}" após ${maxTentativas} tentativas.`);
      }
      // Aguarda progressivamente mais entre tentativas (backoff exponencial)
      Utilities.sleep(Math.pow(2, tentativa - 1) * 1000);
    }
  }
}

/**
 * ========================================
 * BLOCO: Formatação legível de durações e comparação de strings
 * ========================================
 * @description formatarDuracao: converte minutos para string "Xh Ymin" (exibição em relatórios).
 *              compararStrings: comparação tolerante para dados de planilha (trim + lowercase).
 * @sideEffects Nenhum — funções puras
 */

/**
 * Converte minutos para string de duração legível (ex: "2h 30min")
 * 
 * @param {number} minutos - Duração em minutos
 * @returns {string} String formatada
 */
function formatarDuracao(minutos) {
  try {
    if (typeof minutos !== 'number' || minutos < 0) return '';

    const horas = Math.floor(minutos / 60);
    const mins = minutos % 60;

    if (horas > 0 && mins > 0) {
      return `${horas}h ${mins}min`;
    } else if (horas > 0) {
      return `${horas}h`;
    } else {
      return `${mins}min`;
    }
  } catch (e) {
    return '';
  }
}

/**
 * ====== COMPARAÇÃO FLEXÍVEL ======
 */

/**
 * Compara duas strings de forma tolerante (trim + lowercase)
 * 
 * @param {string} str1 - Primeira string
 * @param {string} str2 - Segunda string
 * @returns {boolean} true se iguais (ignorando caso e espaços)
 */
function compararStrings(str1, str2) {
  try {
    const s1 = String(str1 || '').trim().toLowerCase();
    const s2 = String(str2 || '').trim().toLowerCase();
    return s1 === s2;
  } catch (e) {
    return false;
  }
}

/**
 * ========================================
 * BLOCO: Logging seguro de erros
 * ========================================
 * @description Centraliza o registro de erros sem expor stack traces sensíveis ao usuário.
 *              Preparado para integração futura com serviço externo de logging.
 * @context Usado em catch blocks dos módulos de serviço
 * @sideEffects console.error
 */

/**
 * Log seguro de erro sem expor informações sensíveis
 * 
 * @param {string} contexto - Contexto onde o erro ocorreu
 * @param {Error} erro - Objeto de erro
 * @param {Object} contextoAdicional - Dados adicionais para debug (opcional)
 */
function logarErroSeguro(contexto, erro, contextoAdicional = {}) {
  try {
    const msg = `[${contexto}] ${erro.message || String(erro)}`;
    console.error(msg, contextoAdicional);

    // Futuramente: enviar para serviço externo de logging
  } catch (e) {
    console.error('Erro ao fazer log:', e);
  }
}

/**
 * ========================================
 * BLOCO: Índices especializados por domínio
 * ========================================
 * @description Construtores de índice para os principais domínios do sistema.
 *              Usados quando o módulo precisa fazer lookups frequentes em um dataset
 *              carregado uma única vez da planilha.
 *              criarIndiceAdmins: email → { nivel, indice }
 *              criarIndiceSalas:  salaId → { nome, capacidade, email }
 *              criarIndiceItens:  itemId → { nome, categoria, qtd, alocacao }
 * @sideEffects Nenhum — funções puras
 */

/**
 * Cria mapa de admins para lookup rápido por email
 * Retorna: { email → { nivel, indice } }
 * 
 * @param {Array<Array>} dadosAdmins - Array de admins (coluna 0 = email, coluna 1 = nível)
 * @returns {Object} Mapa de email → { nivel, indice }
 */
function criarIndiceAdmins(dadosAdmins) {
  const indice = {};

  if (!Array.isArray(dadosAdmins)) return indice;

  dadosAdmins.forEach((linha, idx) => {
    if (Array.isArray(linha) && linha.length >= 2) {
      const email = normalizarEmail_safe(linha[0]);
      if (email) {
        indice[email] = {
          nivel: String(linha[1] || '').toLowerCase().trim(),
          indice: idx
        };
      }
    }
  });

  return indice;
}

/**
 * Versão segura de normalizarEmail que retorna null ao invés de lançar erro
 * @private
 */
function normalizarEmail_safe(email) {
  try {
    return normalizarEmail(email);
  } catch (e) {
    return null;
  }
}

/**
 * Cria mapa de salas para lookup rápido por ID
 * Retorna: { salaID → { nome, capacidade, email } }
 * 
 * @param {Array<Array>} dadosSalas - Array de salas
 * @returns {Object} Mapa de ID sala → dados
 */
function criarIndiceSalas(dadosSalas) {
  const indice = {};

  if (!Array.isArray(dadosSalas)) return indice;

  dadosSalas.forEach((linha, idx) => {
    if (Array.isArray(linha) && linha.length > 0) {
      const id = String(linha[0] || '').trim();
      if (id) {
        indice[id] = {
          nome: String(linha[1] || '').trim(),
          capacidade: sanitizarNumero(linha[2], 0),
          email: normalizarEmail_safe(linha[4]),
          indice: idx
        };
      }
    }
  });

  return indice;
}

/**
 * Cria mapa de itens para lookup rápido por ID
 * Retorna: { itemID → { nome, categoria, qtd, mapa_alocacao } }
 * 
 * @param {Array<Array>} dadosItens - Array de itens
 * @returns {Object} Mapa de ID item → dados
 */
function criarIndiceItens(dadosItens) {
  const indice = {};

  if (!Array.isArray(dadosItens)) return indice;

  dadosItens.forEach((linha, idx) => {
    if (Array.isArray(linha) && linha.length > 0) {
      const id = String(linha[0] || '').trim();
      if (id) {
        let mapaAlocacao = {};
        try {
          mapaAlocacao = JSON.parse(String(linha[4] || '{}'));
        } catch (e) {
          mapaAlocacao = {};
        }

        indice[id] = {
          nome: String(linha[1] || '').trim(),
          categoria: String(linha[2] || '').trim(),
          qtd: sanitizarNumero(linha[3], 0),
          alocacao: mapaAlocacao,
          indice: idx
        };
      }
    }
  });

  return indice;
}
function _fmtMoedaInput(v) {
  var n = Number(v) || 0;
  var partes = n.toFixed(2).split('.');
  partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return partes[0] + ',' + partes[1];
}


/**
 * ========================================
 * BLOCO: Helpers globais
 * ========================================
 */

function gerarId(prefixo) {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefixo}-${timestamp}-${random}`;
}

function isMesmoDia(dataReserva) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const data = new Date(dataReserva);
  data.setHours(0, 0, 0, 0);
  return hoje.getTime() === data.getTime();
}

/**
 * ========================================
 * COMPAT: Camada de compatibilidade Itens ↔ Ativos
 * ========================================
 * Fonte única para consumo no frontend
 */

function obterItensNormalizados() {
  try {
    var ativos = _getSheetSafe('Ativos');
    if (ativos && ativos.length > 1) {
      return _normalizarAtivos(ativos);
    }
  } catch (e) {}

  try {
    var itens = _getSheetSafe('Itens');
    if (itens && itens.length > 1) {
      return _normalizarItens(itens);
    }
  } catch (e) {}

  return [];
}

/**
 * ----------------------------------------
 * SAFE GET SHEET
 * evita crash do _getSheet
 */
function _getSheetSafe(nome) {
  try {
    return _getSheet(nome);
  } catch (e) {
    console.warn('Sheet não encontrada:', nome);
    return null;
  }
}

/**
 * ----------------------------------------
 * NORMALIZA: ATIVOS → formato padrão
 */
function _normalizarAtivos(dados) {
  var header = dados[0];

  var idx = {
    id: header.indexOf('ID'),
    nome: header.indexOf('Nome'),
    categoria: header.indexOf('Categoria'),
    qtd: header.indexOf('QtdTotal'),
    local: header.indexOf('Sala'),
    status: header.indexOf('Status')
  };

  return dados.slice(1).map(function(l) {
    return {
      id: l[idx.id],
      nome: l[idx.nome],
      categoria: l[idx.categoria],
      quantidade: Number(l[idx.qtd] || 0),
      localizacao: l[idx.local],
      status: l[idx.status]
    };
  });
}

/**
 * ----------------------------------------
 * NORMALIZA: ITENS → formato padrão
 */
function _normalizarItens(dados) {
  var header = dados[0];

  var idx = {
    id: header.indexOf('ID Item'),
    nome: header.indexOf('Nome'),
    categoria: header.indexOf('Categoria'),
    qtd: header.indexOf('Quantidade Total'),
    local: header.indexOf('Localização'),
    status: header.indexOf('Status de Uso')
  };

  return dados.slice(1).map(function(l) {
    return {
      id: l[idx.id],
      nome: l[idx.nome],
      categoria: l[idx.categoria],
      quantidade: Number(l[idx.qtd] || 0),
      localizacao: l[idx.local],
      status: l[idx.status]
    };
  });
}

function sincronizarAtivosParaItens() {
  var abaAtivos = _abrirAba('ESPACOS', 'Ativos');
  if (!abaAtivos) return;
  var ativos = abaAtivos.getDataRange().getValues();
  if (!ativos || ativos.length < 2) return;

  var abaItens = _abrirAba('ESPACOS', 'Itens');

  var normalizados = _normalizarAtivos(ativos);

  var linhas = normalizados.map(function(i) {
    return [
      i.id,
      i.nome,
      i.categoria,
      i.quantidade,
      i.localizacao,
      i.status
    ];
  });

  abaItens.clearContents();
  abaItens.appendRow([
    'ID Item','Nome','Categoria','Quantidade Total',
    'Localização','Status de Uso'
  ]);

  if (linhas.length) {
    abaItens.getRange(2,1,linhas.length,linhas[0].length).setValues(linhas);
  }
}

function _escutaGarantirDados() {
  var itens = obterItensNormalizados();

  if (!itens || !itens.length) {
    console.warn('Escuta sem base de dados de itens');
  }
}