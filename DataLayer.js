//DataLayer.gs

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


