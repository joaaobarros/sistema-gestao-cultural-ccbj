/**
 * @file mod_comunicacao_processos.gs
 * @layer backend/modules
 * @description Gestão de processos de comunicação integrada ao módulo COMUNICACAO (planilhas)
 */

// =====================================================
// HELPERS
// =====================================================

function _abaProcessos() {
  return _abrirAba('COMUNICACAO', 'ProcessosComunicacao');
}

function _abaEntregas() {
  return _abrirAba('COMUNICACAO', 'EntregasComunicacao');
}

function _toObj(headers, row) {
  var obj = {};
  headers.forEach(function(h, i) {
    obj[h] = row[i];
  });
  return obj;
}

// =====================================================
// LISTAR PROCESSOS
// =====================================================

function listarProcessosComunicacao() {
  var aba = _abaProcessos();
  var dados = aba.getDataRange().getValues();

  if (dados.length <= 1) return [];

  var headers = dados[0];

  return dados.slice(1).map(function(row) {
    var obj = _toObj(headers, row);

    return {
        id: obj['ID'],
        titulo: obj['Título'],
        descricao: obj['Descrição'],
        status: obj['Status'],
        prioridade: obj['Prioridade'],
        responsavel: obj['Responsável'],
        prazo: obj['Prazo'],
        origem: obj['Origem'],
        idReserva: obj['ID Reserva'],
        revisaoStatus: obj['Revisao Status'],
        revisaoSolicitacao: obj['Revisao Solicitacao'],
        revisaoSolicitante: obj['Revisao Solicitante'],
        revisaoData: obj['Revisao Data'],
        revisaoResposta: obj['Revisao Resposta']
        };
  });
}

// =====================================================
// CRIAR PROCESSO
// =====================================================

function criarProcessoComunicacao(dados) {
  var aba = _abaProcessos();

  var id = 'proc_' + Date.now();
  var agora = new Date().toISOString();

  // salvar processo
  aba.appendRow([
    id,
    dados.titulo || '',
    dados.descricao || '',
    'Solicitado',
    dados.prioridade || 'Média',
    dados.origem || 'manual',
    dados.idReserva || '',
    dados.idRece || '',
    dados.solicitante || '',
    dados.responsavel || '',
    dados.prazo || '',
    agora,
    '',
    dados.observacoes || ''
  ]);

  // tarefa principal
  var tarefaPrincipal = {
    id: id,
    titulo: dados.titulo,
    funcao: dados.responsavel || dados.tipoPrincipal || '',
    prazo: dados.prazo,
    status: 'Solicitado'
  };

  _criarTarefaComunicacao({
    idProcesso: id,
    titulo: dados.titulo,
    responsavel: dados.responsavel
  });

  // criar entregas e tarefas por entrega
  var entregas = dados.entregas || [];
  entregas.forEach(function(tipo) {
    // criar registro de entrega
    criarEntregaComunicacao({
      idProcesso: id,
      tipo: tipo
    });

    // criar tarefa individual por entrega
    var tarefaEntrega = {
      id: id + '_' + tipo,
      titulo: tipo.toUpperCase() + ' - ' + (dados.titulo || ''),
      funcao: dados.responsavel || tipo,
      prazo: dados.prazo,
      status: 'Solicitado'
    };

    _criarTarefasPorEntregas({
      idProcesso: id,
      titulo: dados.titulo,
      responsavel: dados.responsavel,
      entregas: [tipo]
    });

    // notificar atraso crítico por entrega
    if (_isAtrasada(tarefaEntrega)) {
      _notificarAtrasoCritico(tarefaEntrega);
    }
  });

  // notificar atraso da tarefa principal
  if (_isAtrasada(tarefaPrincipal)) {
    _notificarAtrasoCritico(tarefaPrincipal);
  }

  return { ok: true, id: id };
}

// =====================================================
// ATUALIZAR PROCESSO
// =====================================================

function atualizarProcessoComunicacao(id, dados) {
  var aba = _abaProcessos();
  var valores = aba.getDataRange().getValues();

  var headers = valores[0];

  for (var i = 1; i < valores.length; i++) {

    if (valores[i][0] === id) {

      var map = {};
      headers.forEach(function(h, idx){ map[h] = idx; });

      // atualizações
      if (dados.titulo !== undefined)       valores[i][map['Título']] = dados.titulo;
      if (dados.descricao !== undefined)    valores[i][map['Descrição']] = dados.descricao;
      if (dados.status !== undefined)       valores[i][map['Status']] = dados.status;
      if (dados.prioridade !== undefined)   valores[i][map['Prioridade']] = dados.prioridade;
      if (dados.responsavel !== undefined)  valores[i][map['Responsável']] = dados.responsavel;
      if (dados.prazo !== undefined)        valores[i][map['Prazo']] = dados.prazo;

      valores[i][map['Data Atualização']] = new Date().toISOString();

      // salva
      aba.getRange(i + 1, 1, 1, valores[i].length).setValues([valores[i]]);

      // monta objeto atualizado
      var tarefa = {
        id: id,
        titulo: valores[i][map['Título']],
        status: valores[i][map['Status']],
        prioridade: valores[i][map['Prioridade']],
        responsavel: valores[i][map['Responsável']],
        prazo: valores[i][map['Prazo']]
      };

      // notificação normal
      _notificarAtualizacaoProcesso(id, dados);

      // atraso crítico (correto agora)
      if (_isAtrasada(tarefa)) {
        _notificarAtrasoCritico(tarefa);
      }

      return { ok: true };
    }
  }

  return { ok: false };
}

function _isAtrasada(tarefa){
  if (!tarefa || !tarefa.prazo) return false;

  try {
    var hoje = new Date();
    var prazo = new Date(tarefa.prazo);

    return prazo < hoje &&
      String(tarefa.status || '').toLowerCase() !== 'concluído';

  } catch(e){
    return false;
  }
}

function _notificarAtrasoCritico(tarefa) {
  if (!tarefa || !tarefa.id) return;

  // Obtém e-mails da função/responsável
  var emails = _obterResponsaveisPorTipo(tarefa.funcao);

  // Se houver gestor de equipe, incluir
  var gestores = _obterGestoresPorFuncao(tarefa.funcao);
  emails = Array.from(new Set([...emails, ...gestores]));

  if (!emails.length) return;

  // Corpo da notificação
  var assunto = '[ALERTA] Tarefa em atraso crítico: ' + (tarefa.titulo || '');
  var mensagem = `
    A tarefa "${tarefa.titulo}" está com prazo vencido (${tarefa.prazo || 'sem prazo'}) e ainda não foi concluída.
    Por favor, verifique e tome as ações necessárias.
  `;

  emails.forEach(function(email){
    enviarEmailInterno(email, assunto, mensagem);
  });

  // Também cria tarefa de alerta na aba de tarefas
  criarTarefaPlanilha({
    titulo: '[ALERTA] Tarefa atrasada: ' + (tarefa.titulo || ''),
    tipo: 'alerta',
    subtipo: 'atraso_critico',
    origem: 'sistema',
    idOrigem: tarefa.id,
    responsavel: emails.join(', '),
    status: 'Aberta',
    prioridade: 'Alta'
  });
}

function enviarEmailInterno(destino, assunto, corpo){
  try {
    MailApp.sendEmail({
      to: destino,
      subject: assunto,
      body: corpo
    });
  } catch(e){
    console.error('Falha ao enviar e-mail para', destino, e);
  }
}

// =====================================================
// EXCLUIR
// =====================================================

function excluirProcessoComunicacao(id) {
  var aba = _abaProcessos();
  var dados = aba.getDataRange().getValues();

  for (var i = 1; i < dados.length; i++) {
    if (dados[i][0] === id) {
      aba.deleteRow(i + 1);
      break;
    }
  }

  return { ok: true };
}

// =====================================================
// ENTREGAS
// =====================================================

function criarEntregaComunicacao(dados) {
  var aba = _abaEntregas();

  aba.appendRow([
    'ent_' + Date.now(),
    dados.idProcesso,
    dados.tipo,
    'Pendente',
    '',
    '',
    ''
  ]);
}

function listarEntregasPorProcesso(idProcesso) {
  var aba = _abaEntregas();
  var dados = aba.getDataRange().getValues();

  var headers = dados[0];

  return dados.slice(1)
    .map(function(row){ return _toObj(headers, row); })
    .filter(function(e){ return e['ID Processo'] === idProcesso; });
}

// =====================================================
// TAREFAS (PLANILHA)
// =====================================================

function _criarTarefaComunicacao(dados) {
  return criarTarefaPlanilha({
    titulo: '[COMUNICAÇÃO] ' + (dados.titulo || ''),
    tipo: 'comunicacao',
    subtipo: 'nova_demanda',
    origem: 'comunicacao',
    idOrigem: dados.idProcesso || '',
    responsavel: dados.responsavel || '',
    status: 'Aberta',
    prioridade: 'Média'
  });
}

// =====================================================
// NOTIFICAÇÕES DE ATUALIZAÇÃO (PLANILHA)
// =====================================================

function _notificarAtualizacaoProcesso(id, dados) {

  if (!dados || !dados.status) return;

  var aba = _abrirAba('PESSOAL', 'Tarefas');

  var idTar = 'tar_' + Date.now();
  var agora = new Date().toISOString();

  aba.appendRow([
    idTar,
    'Atualização: ' + (dados.titulo || 'Processo de comunicação'),
    'comunicacao',                 // Tipo
    'status_update',               // Subtipo
    'comunicacao',                 // Origem
    id,                            // ID Origem
    dados.responsavel || '',       // Responsável (pode evoluir depois)
    'Aberta',
    'Média',
    agora,
    ''
  ]);

  return { ok: true };
}

// =====================================================
// TAREFAS POR ENTREGA
// =====================================================

function _criarTarefasPorEntregas(dados) {

  if (!dados.entregas || !dados.entregas.length) return;

  dados.entregas.forEach(function(tipo) {

    // resolve função a partir do tipo
    var funcao = _mapearTipoParaFuncao(tipo);

    // SEM responsável (fila da função)
    var responsavel = '';

    criarTarefaPlanilha({
      titulo: tipo.toUpperCase() + ' - ' + (dados.titulo || ''),
      tipo: 'comunicacao',
      subtipo: 'entrega',
      origem: 'comunicacao',
      idOrigem: dados.idProcesso,

      responsavel: responsavel, // vazio

      status: 'Aberta',
      prioridade: 'Média',
      funcao: funcao,
      statusInterno: 'pendente_triagem'
    });

  });
}

// =====================================================
// ATUALIZAR ENTREGA 
// =====================================================

function atualizarEntregaComunicacao(idEntrega, dados) {

  var aba = _abaEntregas();
  var valores = aba.getDataRange().getValues();
  var headers = valores[0];

  for (var i = 1; i < valores.length; i++) {

    if (valores[i][0] === idEntrega) {

      var map = {};
      headers.forEach(function(h, idx){ map[h] = idx; });

      var statusAnterior = valores[i][map['Status']];

      if (dados.status !== undefined) {
        valores[i][map['Status']] = dados.status;
      }

      if (dados.responsavel !== undefined) {
        valores[i][map['Responsável']] = dados.responsavel;
      }

      if (dados.prazo !== undefined) {
        valores[i][map['Prazo']] = dados.prazo;
      }

      if (dados.link !== undefined) {
        valores[i][map['Link Entrega']] = dados.link;
      }

      // só registra data se mudou para "Entregue"
      if (
        dados.status === 'Entregue' &&
        statusAnterior !== 'Entregue'
      ) {
        valores[i][map['Data Entrega']] = new Date().toISOString();
      }

      aba.getRange(i + 1, 1, 1, valores[i].length).setValues([valores[i]]);

      // só notifica se acabou de virar "Entregue"
      if (
        dados.status === 'Entregue' &&
        statusAnterior !== 'Entregue'
      ) {
        _notificarEntregaConcluida({
          idProcesso: valores[i][map['ID Processo']],
          tipo: valores[i][map['Tipo']],
          link: valores[i][map['Link Entrega']]
        });
      }

      return { ok: true };
    }
  }

  return { ok: false };
}

// =====================================================
// NOTIFICAÇÃO DE ENTREGA CONCLUÍDA
// =====================================================

function _notificarEntregaConcluida(dados) {

  var processos = listarProcessosComunicacao();

  var processo = processos.find(function(p){
    return p.id === dados.idProcesso;
  });

  var responsavel = processo ? processo.solicitante : '';

  var titulo = 'Entrega concluída: ' + (dados.tipo || '');

  if (dados.link) {
    titulo += ' (material disponível)';
  }

  return criarTarefaPlanilha({
    titulo: titulo,
    tipo: 'comunicacao',
    subtipo: 'entrega_concluida',
    origem: 'comunicacao',
    idOrigem: dados.idProcesso,
    responsavel: responsavel,
    status: 'Aberta',
    prioridade: 'Média'
  });

}

function _obterResponsaveisPorTipo(tipo) {

  var aba = _abrirAba('EQUIPES', 'Funcionarios');
  var dados = aba.getDataRange().getValues();
  var headers = dados[0];

  var idx = {};
  headers.forEach(function(h, i){ idx[h] = i; });

  var hoje = new Date().toISOString().slice(0,10);

  var funcao = _mapearTipoParaFuncao(tipo);

  var lista = [];

  for (var i = 1; i < dados.length; i++) {

    var row = dados[i];

    var ativo = String(row[idx['Status']] || '').toLowerCase() === 'ativo';
    if (!ativo) continue;

    var email = row[idx['Email Institucional']];
    if (!email) continue;

    var funcoes = [];
    var substituicoes = [];

    try {
      funcoes = JSON.parse(row[idx['Funcoes']] || '[]');
    } catch(e){ funcoes = []; }

    try {
      substituicoes = JSON.parse(row[idx['Substituicoes']] || '[]');
    } catch(e){ substituicoes = []; }

    // ✔ função direta
    var temFuncao = funcoes.some(function(f){
      return f.tipo === funcao && f.ativo !== false;
    });

    // ✔ substituição ativa
    var substituindo = substituicoes.some(function(s){
      return s.tipo === funcao &&
        (!s.inicio || s.inicio <= hoje) &&
        (!s.fim || s.fim >= hoje);
    });

    if (temFuncao || substituindo) {
      lista.push(email);
    }

  }

  return lista;
}

function _resolverResponsavel(tipo) {

  var lista = _obterResponsaveisPorTipo(tipo);

  // regra simples (por enquanto)
  return lista[0] || '';
}

function _mapearTipoParaFuncao(tipo){

  var aba = _abrirAba('CONFIG', 'MapeamentoComunicacao');
  var dados = aba.getDataRange().getValues();

  if (dados.length <= 1) return 'comunicacao';

  var headers = dados[0];
  var idx = {};
  headers.forEach(function(h,i){ idx[h]=i });

  for (var i = 1; i < dados.length; i++){

    var row = dados[i];

    var ativo = String(row[idx['Ativo']]).toLowerCase() !== 'false';
    if (!ativo) continue;

    if (row[idx['Tipo Entrega']] === tipo){
      return row[idx['Função']] || 'comunicacao';
    }

  }

  return 'comunicacao';
}

// =====================================================
// GESTORES POR FUNÇÃO
// =====================================================

function _obterGestoresPorFuncao(funcao) {
  if (!funcao) return [];

  var aba = _abrirAba('EQUIPES', 'Funcionarios');
  var dados = aba.getDataRange().getValues();
  var headers = dados[0];

  var idx = {};
  headers.forEach(function(h, i){ idx[h] = i; });

  var hoje = new Date().toISOString().slice(0, 10);
  var lista = [];

  for (var i = 1; i < dados.length; i++) {
    var row = dados[i];

    var ativo = String(row[idx['Status']] || '').toLowerCase() === 'ativo';
    if (!ativo) continue;

    var email = row[idx['Email Institucional']];
    if (!email) continue;

    var gestor = String(row[idx['Gestor']] || '').toLowerCase() === 'sim' ||
                 String(row[idx['Papel']] || '').toLowerCase() === 'gestor';
    if (!gestor) continue;

    var funcoes = [];
    try { funcoes = JSON.parse(row[idx['Funcoes']] || '[]'); } catch(e){}

    var pertence = funcoes.some(function(f){
      return f.tipo === funcao && f.ativo !== false;
    });

    if (pertence) lista.push(email);
  }

  return lista;
}

// =====================================================
// REVISÃO DE PROCESSOS
// =====================================================

function solicitarAlteracaoProcesso(idProcesso, texto, emailCliente) {
  var aba = _abaProcessos();
  var valores = aba.getDataRange().getValues();
  var headers = valores[0];

  var map = {};
  headers.forEach(function(h, idx){ map[h] = idx; });

  for (var i = 1; i < valores.length; i++) {
    if (valores[i][0] !== idProcesso) continue;

    valores[i][map['Revisao Status']] = 'Solicitada';
    valores[i][map['Revisao Solicitacao']] = texto || '';
    valores[i][map['Revisao Solicitante']] = emailCliente || '';
    valores[i][map['Revisao Data']] = new Date().toISOString();
    valores[i][map['Revisao Resposta']] = '';

    aba.getRange(i + 1, 1, 1, valores[i].length).setValues([valores[i]]);

    // notificar equipe de comunicação
    var emails = _obterResponsaveisPorTipo('comunicacao');
    var assunto = '[REVISÃO] Solicitação de alteração no processo ' + idProcesso;
    var mensagem = 'O cliente solicitou uma revisão:\n\n"' + (texto || '') + '"\n\nProcesso: ' + idProcesso;
    emails.forEach(function(email){ enviarEmailInterno(email, assunto, mensagem); });

    return { ok: true };
  }

  return { ok: false };
}

function responderRevisaoProcesso(idProcesso, status, resposta) {
  var aba = _abaProcessos();
  var valores = aba.getDataRange().getValues();
  var headers = valores[0];

  var map = {};
  headers.forEach(function(h, idx){ map[h] = idx; });

  for (var i = 1; i < valores.length; i++) {
    if (valores[i][0] !== idProcesso) continue;

    valores[i][map['Revisao Status']] = status || 'Respondida';
    valores[i][map['Revisao Resposta']] = resposta || '';
    valores[i][map['Data Atualização']] = new Date().toISOString();

    aba.getRange(i + 1, 1, 1, valores[i].length).setValues([valores[i]]);

    // notificar solicitante
    var solicitante = valores[i][map['Revisao Solicitante']];
    if (solicitante) {
      var assunto = '[REVISÃO] Resposta à sua solicitação — processo ' + idProcesso;
      var mensagem = 'Sua solicitação de revisão foi respondida.\n\nStatus: ' + (status || '') + '\n\n' + (resposta || '');
      enviarEmailInterno(solicitante, assunto, mensagem);
    }

    return { ok: true };
  }

  return { ok: false };
}

function responderTarefaComoFuncao(idTarefa, mensagem, autor) {

  if (!mensagem) return { ok: false };

  _registrarInteracaoTarefa(idTarefa, {
    tipo: 'resposta_funcao',
    mensagem: mensagem,
    autor: autor || 'funcao'
  });

  _atualizarStatusInternoTarefa(idTarefa, 'em_gestao');

  return { ok: true };
}

// =====================================================
// INTEGRAÇÃO RESERVA → COMUNICAÇÃO
// =====================================================

/**
 * Cria demanda de comunicação a partir de uma reserva.
 * Garante deduplicação: se já existe demanda para o idReserva, retorna ela sem criar nova.
 */
function criarDemandaComunicacaoFromReserva(idReserva, dadosReserva, dadosComunicacao) {
  if (!idReserva) throw new Error('ID da reserva é obrigatório.');
  if (!dadosComunicacao || !dadosComunicacao.titulo) throw new Error('Título da demanda é obrigatório.');

  var existente = obterDemandaPorReservaId(idReserva);
  if (existente) return { ok: true, id: existente.id, duplicado: true };

  return criarProcessoComunicacao({
    titulo:      dadosComunicacao.titulo,
    descricao:   dadosComunicacao.descricao   || '',
    prioridade:  dadosComunicacao.prioridade  || 'Média',
    prazo:       dadosComunicacao.prazo       || '',
    observacoes: dadosComunicacao.observacoes || '',
    entregas:    dadosComunicacao.entregas    || [],
    origem:      'reserva',
    idReserva:   idReserva,
    solicitante: (dadosReserva && dadosReserva.responsavel) || '',
    responsavel: dadosComunicacao.responsavel || ''
  });
}

/**
 * Retorna a primeira demanda de comunicação vinculada ao idReserva, ou null.
 */
function obterDemandaPorReservaId(idReserva) {
  if (!idReserva) return null;
  var aba   = _abaProcessos();
  var dados = aba.getDataRange().getValues();
  if (dados.length <= 1) return null;
  var headers = dados[0];
  for (var i = 1; i < dados.length; i++) {
    var obj = _toObj(headers, dados[i]);
    if (String(obj['ID Reserva'] || '').trim() === String(idReserva).trim()) {
      return { id: obj['ID'], titulo: obj['Título'], status: obj['Status'] };
    }
  }
  return null;
}