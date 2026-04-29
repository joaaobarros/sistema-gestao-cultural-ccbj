/**
 * MÓDULO: Utilitários Centralizados
 * Funções reutilizáveis para parsing, validação e operações comuns
 *
 * OBJETIVO: Eliminar duplicação de código e melhorar maintainability
 */

/**
 * ====== PARSING E NORMALIZAÇÃO ======
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
    if (str.includes("/") && !str.includes("-")) {
      const partes = str.split("/");
      if (partes.length === 3) {
        dateObj = new Date(
          parseInt(partes[2]),
          parseInt(partes[1]) - 1,
          parseInt(partes[0]),
        );
      }
    }
    // Formato YYYY-MM-DD
    else if (str.includes("-")) {
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
    console.error("Erro em normalizarData:", e.message);
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
    if (!data) return "";

    let dateObj;

    if (data instanceof Date) {
      dateObj = data;
    } else if (typeof data === "number") {
      dateObj = new Date(data);
    } else {
      const ts = normalizarData(data);
      if (ts === null) return "";
      dateObj = new Date(ts);
    }

    if (!dateObj || isNaN(dateObj.getTime())) return "";

    const dia = String(dateObj.getDate()).padStart(2, "0");
    const mes = String(dateObj.getMonth() + 1).padStart(2, "0");
    const ano = dateObj.getFullYear();

    return `${dia}/${mes}/${ano}`;
  } catch (e) {
    console.error("Erro em formatarData:", e.message);
    return "";
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

    const partes = str.split(":");
    if (partes.length < 2) return null;

    const hh = parseInt(partes[0], 10);
    const mm = parseInt(partes[1], 10);

    if (isNaN(hh) || isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
      return null;
    }

    return hh * 60 + mm;
  } catch (e) {
    console.error("Erro em normalizarHora:", e.message);
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
    if (typeof minutos !== "number" || minutos < 0 || minutos >= 1440) {
      return "";
    }

    const hh = String(Math.floor(minutos / 60)).padStart(2, "0");
    const mm = String(minutos % 60).padStart(2, "0");

    return `${hh}:${mm}`;
  } catch (e) {
    console.error("Erro em formatarHora:", e.message);
    return "";
  }
}

/**
 * ====== VALIDAÇÃO ======
 */

/**
 * Valida se uma string é um email válido
 *
 * @param {string} email - Email a validar
 * @returns {boolean} true se válido
 */
function validarEmail(email) {
  try {
    if (!email || typeof email !== "string") return false;

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
    if (!id || typeof id !== "string") return false;

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
    if (!hora || typeof hora !== "string") return false;

    const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    return regex.test(String(hora).trim());
  } catch (e) {
    return false;
  }
}

/**
 * ====== COMPARAÇÕES E VERIFICAÇÕES ======
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
  if (
    typeof ini1 !== "number" ||
    typeof ter1 !== "number" ||
    typeof ini2 !== "number" ||
    typeof ter2 !== "number"
  ) {
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
 * ====== CRIAÇÃO DE ÍNDICES E MAPAS ======
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
      const id = String(linha[0] || "").trim();
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

  if (!Array.isArray(dados) || typeof coluna !== "number" || coluna < 0) {
    return indice;
  }

  dados.forEach((linha, idx) => {
    if (Array.isArray(linha) && linha[coluna] !== undefined) {
      const chave = String(linha[coluna] || "").trim();
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
 * ====== SANITIZAÇÃO ======
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
    return String(texto || "")
      .replace(/[<>]/g, "")
      .substring(0, maxLen);
  } catch (e) {
    return "";
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
 * ====== LOCK COM RETRY ======
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
        throw new Error(
          `Não foi possível obter lock "${nome}" após ${maxTentativas} tentativas.`,
        );
      }
      // Aguarda progressivamente mais entre tentativas (backoff exponencial)
      Utilities.sleep(Math.pow(2, tentativa - 1) * 1000);
    }
  }
}

/**
 * ====== CONVERSÃO DE UNIDADES ======
 */

/**
 * Converte minutos para string de duração legível (ex: "2h 30min")
 *
 * @param {number} minutos - Duração em minutos
 * @returns {string} String formatada
 */
function formatarDuracao(minutos) {
  try {
    if (typeof minutos !== "number" || minutos < 0) return "";

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
    return "";
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
    const s1 = String(str1 || "")
      .trim()
      .toLowerCase();
    const s2 = String(str2 || "")
      .trim()
      .toLowerCase();
    return s1 === s2;
  } catch (e) {
    return false;
  }
}

/**
 * ====== TRATAMENTO DE ERRO ======
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
    console.error("Erro ao fazer log:", e);
  }
}

/**
 * ====== ÍNDICES PARA PERFORMANCE ======
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
          nivel: String(linha[1] || "")
            .toLowerCase()
            .trim(),
          indice: idx,
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
      const id = String(linha[0] || "").trim();
      if (id) {
        indice[id] = {
          nome: String(linha[1] || "").trim(),
          capacidade: sanitizarNumero(linha[2], 0),
          email: normalizarEmail_safe(linha[4]),
          indice: idx,
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
      const id = String(linha[0] || "").trim();
      if (id) {
        let mapaAlocacao = {};
        try {
          mapaAlocacao = JSON.parse(String(linha[4] || "{}"));
        } catch (e) {
          mapaAlocacao = {};
        }

        indice[id] = {
          nome: String(linha[1] || "").trim(),
          categoria: String(linha[2] || "").trim(),
          qtd: sanitizarNumero(linha[3], 0),
          alocacao: mapaAlocacao,
          indice: idx,
        };
      }
    }
  });

  return indice;
}
