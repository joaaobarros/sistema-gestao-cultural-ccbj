/**
 * @file mod_pessoal.gs
 * @layer backend/modules
 * @description Tarefas, processos e atendimentos de balcão.
 *              Dados persistidos em Drive JSON via DataLayer.gs.
 */

// ── Tarefas ─────────────────────────────────────────────

function obterTarefas() {
  return readJSON('tarefas.json');
}

function salvarTarefa(dados) {
  var lista = readJSON('tarefas.json');

  if (!dados.id) {
    dados.id = 'tar_' + Date.now();
    dados.criadoEm = new Date().toISOString();
    lista.push(dados);
  } else {
    var encontrado = false;

    for (var i = 0; i < lista.length; i++) {
      if (lista[i].id === dados.id) {

        // merge (não sobrescreve tudo)
        Object.keys(dados).forEach(function(k){
          lista[i][k] = dados[k];
        });

        encontrado = true;
        break;
      }
    }

    if (!encontrado) lista.push(dados);
  }

  writeJSON('tarefas.json', lista);
  return { ok: true, id: dados.id };
}

function salvarOrdemKanban(ordens) {

  var lista = readJSON('tarefas.json');

  lista.forEach(function(t){

    if (ordens[t.id]) {
      t.ordem = ordens[t.id].ordem;
      t.status = ordens[t.id].status;
    }

  });

  writeJSON('tarefas.json', lista);

  return { ok: true };
}

function excluirTarefa(id) {
  var lista = readJSON('tarefas.json');
  writeJSON('tarefas.json', lista.filter(function(t) { return t.id !== id; }));
  return { ok: true };
}

// ── Processos ────────────────────────────────────────────

function obterProcessos() {
  return readJSON('processos.json');
}

function salvarProcesso(dados) {
  var lista = readJSON('processos.json');
  if (!dados.id) {
    dados.id = 'proc_' + Date.now();
    dados.criadoEm = new Date().toISOString();
    lista.push(dados);
  } else {
    var encontrado = false;
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].id === dados.id) { lista[i] = dados; encontrado = true; break; }
    }
    if (!encontrado) lista.push(dados);
  }
  writeJSON('processos.json', lista);
  return { ok: true, id: dados.id };
}

function excluirProcesso(id) {
  var lista = readJSON('processos.json');
  writeJSON('processos.json', lista.filter(function(p) { return p.id !== id; }));
  return { ok: true };
}

// ── Atendimentos (Balcão) ────────────────────────────────

function obterAtendimentos() {
  return readJSON('atendimentos.json');
}

function salvarAtendimento(dados) {
  var lista = readJSON('atendimentos.json');
  if (!dados.id) {
    dados.id = 'ate_' + Date.now();
    dados.criadoEm = new Date().toISOString();
    dados.status = dados.status || 'Aberto';
    lista.push(dados);
  } else {
    var encontrado = false;
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].id === dados.id) { lista[i] = dados; encontrado = true; break; }
    }
    if (!encontrado) lista.push(dados);
  }
  writeJSON('atendimentos.json', lista);
  return { ok: true, id: dados.id };
}

function excluirAtendimento(id) {
  var lista = readJSON('atendimentos.json');
  writeJSON('atendimentos.json', lista.filter(function(a) { return a.id !== id; }));
  return { ok: true };
}

// ── Demandas (legado, mantido) ───────────────────────────

function obterDemandas() {
  return readJSON('demandas.json');
}

function registrarDemanda(dados) {
  var lista = readJSON('demandas.json');
  dados.id = 'dem_' + Date.now();
  dados.criadoEm = new Date().toISOString();
  lista.push(dados);
  writeJSON('demandas.json', lista);
  return { ok: true, id: dados.id };
}

function criarTarefaPlanilha(dados) {
  var aba = _abrirAba('PESSOAL', 'Tarefas');

  var id = 'tar_' + Date.now();

  aba.appendRow([
    id,
    dados.titulo || '',
    dados.tipo || 'geral',
    dados.subtipo || '',
    dados.origem || '',
    dados.idOrigem || '',
    dados.responsavel || '',
    dados.status || 'Aberta',
    dados.prioridade || 'Média',
    new Date().toISOString(), '',
    dados.funcao || '',         
    dados.statusInterno || '',
    dados.executores || '[]'   
  ]);

  return { ok: true, id: id };
}

function _registrarInteracaoTarefa(idTarefa, dados) {

  var aba = _abrirAba('PESSOAL', 'InteracoesTarefas');

  aba.appendRow([
    'int_' + Date.now(),
    idTarefa,
    dados.tipo || 'comentario',
    dados.mensagem || '',
    dados.autor || '',
    new Date().toISOString()
  ]);

  return { ok: true };
}

function _atualizarStatusInternoTarefa(idTarefa, status) {

  var aba = _abrirAba('PESSOAL', 'Tarefas');
  var dados = aba.getDataRange().getValues();
  var headers = dados[0];

  var idx = {};
  headers.forEach(function(h,i){ idx[h]=i });

  for (var i = 1; i < dados.length; i++) {

    if (dados[i][idx['ID']] === idTarefa) {

      dados[i][idx['Status Interno']] = status;

      aba.getRange(i+1,1,1,dados[i].length)
         .setValues([dados[i]]);

      return { ok: true };
    }
  }

  return { ok: false };
}

function atribuirExecutoresTarefa(idTarefa, emails) {

  var aba = _abrirAba('PESSOAL', 'Tarefas');
  var dados = aba.getDataRange().getValues();
  var headers = dados[0];

  var idx = {};
  headers.forEach((h,i)=>idx[h]=i);

  for (var i = 1; i < dados.length; i++) {

    if (dados[i][idx['ID']] === idTarefa) {

      // salva lista de executores
      dados[i][idx['Executores']] = JSON.stringify(emails || []);

      // mantém compatibilidade (primeiro executor)
      dados[i][idx['Responsável']] = emails[0] || '';

      // atualiza status
      dados[i][idx['Status']] = 'Em andamento';
      dados[i][idx['Status Interno']] = 'atribuida';

      aba.getRange(i+1,1,1,dados[i].length)
         .setValues([dados[i]]);

      // LOG DA ATRIBUIÇÃO
      registrarAtribuicaoTarefa(idTarefa, emails);

      return { ok: true };
    }
  }

  return { ok: false };
}

function registrarAtribuicaoTarefa(idTarefa, emails, autor) {

  _registrarInteracaoTarefa(idTarefa, {
    tipo: 'atribuicao',
    mensagem: 'Atribuído para: ' + (emails || []).join(', '),
    autor: autor || ''
  });

}

function listarTarefasPorFuncao(funcao) {

  var aba = _abrirAba('PESSOAL', 'Tarefas');
  var dados = aba.getDataRange().getValues();

  if (!dados || dados.length <= 1) return [];

  var headers = dados[0];

  var idx = {};
  headers.forEach(function(h,i){ idx[h]=i });

  // helper seguro
  function _get(row, campo){
    return idx[campo] !== undefined ? row[idx[campo]] : '';
  }

  function _parseJSON(valor){
    try {
      return valor ? JSON.parse(valor) : [];
    } catch(e){
      return [];
    }
  }

  function _parseData(d){
    try {
      return d ? new Date(d) : null;
    } catch(e){
      return null;
    }
  }

  var tarefas = dados.slice(1).map(function(row){

    return {
      id: _get(row, 'ID'),
      titulo: _get(row, 'Título'),
      funcao: _get(row, 'Função'),
      status: _get(row, 'Status'),
      statusInterno: _get(row, 'Status Interno'),
      responsavel: _get(row, 'Responsável'),
      prioridade: _get(row, 'Prioridade') || 'Média',
      prazo: _get(row, 'Prazo') || '',
      executores: _parseJSON(_get(row, 'Executores')),
      idProcesso: _get(row, 'ID Origem')
    };

  }).filter(function(t){

    // filtro principal (fila da função)
    return t.funcao === funcao &&
           (!t.responsavel || t.statusInterno !== 'atribuida');

  });

  // anexar entregas com proteção
  tarefas.forEach(function(t){
    try {
      t.entregas = listarEntregasPorProcesso(t.idProcesso) || [];
    } catch(e){
      t.entregas = [];
    }
  });

  // =====================================================
  // Ordenação de tarefas considerando ordem Kanban + prioridade + prazo
  // =====================================================
  tarefas.sort(function(a, b) {

    // 🔹 Primeiro: ordem manual do Kanban (se existir)
    var ordemA = a.ordem || 0;
    var ordemB = b.ordem || 0;
    if (ordemA !== ordemB) return ordemA - ordemB;

    // 🔹 Depois: prioridade
    var p = { 'Alta': 3, 'Média': 2, 'Baixa': 1 };
    var pa = p[a.prioridade] || 0;
    var pb = p[b.prioridade] || 0;
    if (pb !== pa) return pb - pa;

    // 🔹 Por último: prazo
    var da = _parseData(a.prazo);
    var db = _parseData(b.prazo);
    if (da && db) return da - db;
    if (da) return -1;
    if (db) return 1;

    return 0;
  });

  return tarefas;
}