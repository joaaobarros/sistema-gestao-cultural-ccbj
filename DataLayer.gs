/**
 * @file DataLayer.js
 * @description Camada de persistência baseada em arquivos JSON no Google Drive.
 *              Alternativa às planilhas para dados que precisam de estrutura flexível
 *              ou que não se encaixam bem no modelo tabular.
 * @layer backend
 * @responsibility Leitura e escrita segura (com lock) de arquivos JSON em pasta CCBJ_DATA.
 * @dependencies DriveApp, LockService, PropertiesService
 *
 * IMPACTO NO SISTEMA:
 *   getDataFolder() usa o ID registrado em PropertiesService (FOLDER_ID_DATA) para acesso
 *   direto, sem busca por nome. O ID é registrado por inicializarDataLayer() em Setup.js.
 *   Executar inicializarSistema() ou recriarEstrutura() garante o registro correto.
 *
 * RISCOS:
 *   - readJSON: retorna [] em caso de corrupção sem sobrescrever o arquivo — preserva dados.
 *   - modifyJSON: lança exceção em caso de corrupção — impede escrita sobre dado inválido.
 *   - Race condition em writeJSON (sem lock de leitura): usar modifyJSON para escrita crítica.
 */

/**
 * ========================================
 * BLOCO: Acesso à pasta de dados no Drive
 * ========================================
 * @description getDataFolder(): localiza a pasta CCBJ_DATA pelo ID registrado em
 *              PropertiesService; faz fallback para busca por nome se ID não estiver
 *              registrado ou tiver ficado inválido (ex: após migração de conta).
 *              _dataFolderCache: evita chamar DriveApp.getFolderById múltiplas vezes
 *              na mesma execução GAS.
 *              getFile(): localiza ou cria um arquivo JSON dentro da pasta.
 * @context Usados por readJSON, writeJSON e modifyJSON
 * @sideEffects getDataFolder() pode registrar ID em PropertiesService no fallback;
 *              getFile() pode criar arquivo vazio no Drive
 */

// Deve coincidir com PROP.DATA em Setup.js
const DATA_FOLDER_PROP = 'FOLDER_ID_DATA';
const DATA_FOLDER_NAME = 'CCBJ_DATA';

// Cache em memória — válido apenas dentro de uma única execução GAS
var _dataFolderCache = null;

function getDataFolder() {
  if (_dataFolderCache) return _dataFolderCache;

  const props    = PropertiesService.getScriptProperties();
  const folderId = props.getProperty(DATA_FOLDER_PROP);

  if (folderId) {
    try {
      _dataFolderCache = DriveApp.getFolderById(folderId);
      return _dataFolderCache;
    } catch(e) {
      // ID registrado ficou inválido (ex: pasta deletada) — refaz busca abaixo
      console.warn('DataLayer: ID de pasta inválido, re-registrando.');
    }
  }

  // Fallback: busca por nome e registra o ID encontrado/criado
  const iter   = DriveApp.getFoldersByName(DATA_FOLDER_NAME);
  const folder = iter.hasNext() ? iter.next() : DriveApp.createFolder(DATA_FOLDER_NAME);
  props.setProperty(DATA_FOLDER_PROP, folder.getId());
  _dataFolderCache = folder;
  console.log('DataLayer: pasta re-registrada → ' + folder.getId());
  return folder;
}

function getFile(nome) {
  const pasta    = getDataFolder();
  const arquivos = pasta.getFilesByName(nome);
  if (arquivos.hasNext()) return arquivos.next();
  return pasta.createFile(nome, JSON.stringify([]));
}

/**
 * ========================================
 * BLOCO: Leitura e escrita de JSON com lock
 * ========================================
 * @description readJSON: lê e parseia arquivo JSON.
 *                Em caso de erro de parse, retorna [] SEM sobrescrever o arquivo
 *                (preserva dado para diagnóstico; não silencia corrupção com reset).
 *              writeJSON: serializa e salva com lock de 30s (previne escrita concorrente).
 *                Adequado para escritas únicas onde o chamador já leu e preparou os dados.
 *              modifyJSON: operação atômica de leitura + modificação + escrita sob o mesmo
 *                lock. Usar para qualquer read-modify-write crítico (evita race condition).
 *              readJSONAsMap / writeJSONFromMap: variantes indexadas por `id`.
 * @context Chamados por módulos que usam persistência baseada em Drive
 * @sideEffects writeJSON/modifyJSON: sobrescrevem conteúdo do arquivo
 */
function readJSON(nome) {
  try {
    const conteudo = getFile(nome).getBlob().getDataAsString();
    return JSON.parse(conteudo || '[]');
  } catch(e) {
    console.error('readJSON: falha em "' + nome + '" — ' + e.message);
    return [];
  }
}

function writeJSON(nome, data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    getFile(nome).setContent(JSON.stringify(data));
  } catch(e) {
    console.error('writeJSON: falha em "' + nome + '" — ' + e.message);
    throw new Error('Falha ao salvar dados: ' + nome);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Lê, modifica atomicamente e grava um arquivo JSON sob lock exclusivo.
 * @param {string} nome  — nome do arquivo JSON (ex: 'permissoes_v2.json')
 * @param {function} fn  — recebe o array atual, retorna o array modificado
 * @returns {Array} resultado retornado por fn
 * @throws se o arquivo estiver corrompido ou se fn lançar exceção
 */
function modifyJSON(nome, fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const file     = getFile(nome);
    const conteudo = file.getBlob().getDataAsString();
    const data     = JSON.parse(conteudo || '[]');   // lança em corrupção — não escreve lixo
    const result   = fn(data);
    file.setContent(JSON.stringify(result));
    return result;
  } catch(e) {
    console.error('modifyJSON: falha em "' + nome + '" — ' + e.message);
    throw new Error('Falha ao modificar ' + nome + ': ' + e.message);
  } finally {
    lock.releaseLock();
  }
}

function readJSONAsMap(nome) {
  const lista = readJSON(nome);
  const mapa  = {};
  for (let i = 0; i < lista.length; i++) {
    const item = lista[i];
    if (item && item.id) mapa[item.id] = item;
  }
  return mapa;
}

function writeJSONFromMap(nome, mapa) {
  writeJSON(nome, Object.values(mapa));
}
