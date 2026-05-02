/**
 * @file DataLayer.js
 * @description Camada de persistência baseada em arquivos JSON no Google Drive.
 *              Alternativa às planilhas para dados que precisam de estrutura flexível
 *              ou que não se encaixam bem no modelo tabular.
 * @layer backend
 * @responsibility Leitura e escrita segura (com lock) de arquivos JSON em pasta CCBJ_DATA.
 * @dependencies DriveApp, LockService
 *
 * IMPACTO NO SISTEMA:
 *   Atualmente pouco utilizado — a maior parte dos dados está nas planilhas via _getSheet.
 *   Útil para dados de configuração flexível ou preferências de usuário com estrutura variável.
 *
 * RISCOS:
 *   - readJSON usa LockService.getScriptLock (global) mesmo para leitura — pode criar
 *     contenção desnecessária. Em uso futuro intensivo, considerar lock de usuário.
 *   - Arquivos corrompidos são sobrescritos com [] automaticamente (dados perdidos).
 */

/**
 * ========================================
 * BLOCO: Acesso à pasta de dados no Drive
 * ========================================
 * @description Localiza ou cria a pasta "CCBJ_DATA" no Drive do script.
 *              getFile: localiza ou cria um arquivo JSON dentro dessa pasta.
 * @context Usados por readJSON e writeJSON
 * @sideEffects Pode criar pasta ou arquivo no Drive se não existirem
 */

const DATA_FOLDER_NAME = "CCBJ_DATA";

function getDataFolder() {
  const pastas = DriveApp.getFoldersByName(DATA_FOLDER_NAME);
  if (pastas.hasNext()) return pastas.next();

  return DriveApp.createFolder(DATA_FOLDER_NAME);
}

function getFile(nome) {
  const pasta = getDataFolder();
  const arquivos = pasta.getFilesByName(nome);

  if (arquivos.hasNext()) return arquivos.next();

  return pasta.createFile(nome, JSON.stringify([]));
}

/**
 * ========================================
 * BLOCO: Leitura e escrita de JSON com lock
 * ========================================
 * @description readJSON: lê e parseia arquivo JSON com lock de 5s (previne leitura parcial).
 *              writeJSON: serializa e salva com lock de 30s (previne escrita concorrente).
 *              readJSONAsMap / writeJSONFromMap: variantes para trabalhar com objetos
 *              indexados por `id` ao invés de arrays.
 * @context Chamados por módulos que usam persistência baseada em Drive
 * @sideEffects readJSON: pode resetar arquivo corrompido para []; writeJSON: sobrescreve conteúdo
 */
function readJSON(nome) {

  const lock = LockService.getScriptLock();
  lock.waitLock(5000); // leitura rápida, menor tempo

  try {

    const file = getFile(nome);
    const conteudo = file.getBlob().getDataAsString();

    return JSON.parse(conteudo || "[]");

  } catch (e) {

    console.error("JSON corrompido em:", nome, e);

    const file = getFile(nome);
    file.setContent(JSON.stringify([]));

    return [];

  } finally {

    lock.releaseLock();
  }
}

function writeJSON(nome, data) {

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {

    const file = getFile(nome);

    const conteudo = JSON.stringify(data);
    file.setContent(conteudo);

  } catch (e) {

    console.error("Erro ao salvar JSON:", nome, e);
    throw new Error("Falha ao salvar dados");

  } finally {

    lock.releaseLock();
  }
}

function readJSONAsMap(nome) {
  const lista = readJSON(nome);

  const mapa = {};
  for (let i = 0; i < lista.length; i++) {
    const item = lista[i];
    if (item && item.id) {
      mapa[item.id] = item;
    }
  }

  return mapa;
}

function writeJSONFromMap(nome, mapa) {
  const lista = Object.values(mapa);
  writeJSON(nome, lista);
}


