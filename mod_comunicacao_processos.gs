/**
 * @file mod_comunicacao_processos.gs
 * @layer backend/modules
 * @description Gestão de processos de comunicação institucional.
 *
 *              Substitui o conceito de "balcão" por um fluxo estruturado de produção:
 *              - Produção gráfica
 *              - Cobertura fotográfica
 *              - Audiovisual
 *              - Campanhas
 *              - Publicações (RECE)
 *
 *              Integrações:
 *              - Reservas (origem)
 *              - Agenda RECE (publicização)
 *              - Tarefas (geração automática)
 *
 *              Persistência:
 *              - comunicacao_processos.json
 *              - tarefas.json
 *
 * @dependencies DataLayer.gs (readJSON, writeJSON)
 */

// =====================================================
// LISTAGEM
// =====================================================

function listarProcessosComunicacao() {
  return readJSON('comunicacao_processos.json') || [];
}

// =====================================================
// LISTAR POR USUÁRIO (TAREFAS / RESPONSABILIDADE)
// =====================================================

function listarProcessosDoUsuario(email) {
  var lista = readJSON('comunicacao_processos.json') || [];

  return lista.filter(function(p) {
    return (
      p.responsavel === email ||
      (p.equipe && typeof usuarioPertenceEquipe === 'function' && usuarioPertenceEquipe(email, p.equipe))
    );
  });
}

// =====================================================
// CRIAÇÃO
// =====================================================

function criarProcessoComunicacao(dados) {
  var lista = readJSON('comunicacao_processos.json') || [];

  var processo = {
    id: 'proc_com_' + Date.now(),

    tipo: dados.tipo || 'Outro',
    titulo: dados.titulo || '',
    descricao: dados.descricao || '',

    origem: dados.origem || 'manual', // manual | reserva | rece
    idReserva: dados.idReserva || null,
    idRece: dados.idRece || null,

    status: dados.status || 'Solicitado',
    prioridade: dados.prioridade || 'Média',

    responsavel: dados.responsavel || '',
    equipe: dados.equipe || '',

    prazo: dados.prazo || '',
    entregas: Array.isArray(dados.entregas) ? dados.entregas : [],

    observacoes: dados.observacoes || '',

    criadoEm: new Date().toISOString(),
    atualizadoEm: null
  };

  lista.push(processo);
  writeJSON('comunicacao_processos.json', lista);

  // integração com tarefas
  _comProcCriarTarefa(processo);

  return { ok: true, id: processo.id };
}

// =====================================================
// ATUALIZAÇÃO
// =====================================================

function atualizarProcessoComunicacao(id, dados) {
  var lista = readJSON('comunicacao_processos.json') || [];
  var atualizado = false;

  for (var i = 0; i < lista.length; i++) {
    if (lista[i].id === id) {
      lista[i] = Object.assign({}, lista[i], dados, {
        atualizadoEm: new Date().toISOString()
      });
      atualizado = true;
      break;
    }
  }

  if (atualizado) {
    writeJSON('comunicacao_processos.json', lista);
    return { ok: true };
  }

  return { ok: false, error: 'Processo não encontrado' };
}

// =====================================================
// STATUS
// =====================================================

function mudarStatusProcesso(id, status) {
  return atualizarProcessoComunicacao(id, { status: status });
}

// =====================================================
// VÍNCULOS
// =====================================================

function vincularProcessoReserva(idProcesso, idReserva) {
  return atualizarProcessoComunicacao(idProcesso, {
    origem: 'reserva',
    idReserva: idReserva
  });
}

function vincularProcessoRece(idProcesso, idRece) {
  return atualizarProcessoComunicacao(idProcesso, {
    origem: 'rece',
    idRece: idRece
  });
}

// =====================================================
// EXCLUSÃO
// =====================================================

function excluirProcessoComunicacao(id) {
  var lista = readJSON('comunicacao_processos.json') || [];

  var nova = lista.filter(function(p) {
    return p.id !== id;
  });

  writeJSON('comunicacao_processos.json', nova);

  return { ok: true };
}

// =====================================================
// INTEGRAÇÃO COM TAREFAS
// =====================================================

function _comProcCriarTarefa(proc) {
  var tarefas = readJSON('tarefas.json') || [];

  var tarefa = {
    id: 'tar_' + Date.now(),

    titulo: proc.titulo,
    descricao: proc.descricao,

    origem: 'comunicacao',
    idOrigem: proc.id,

    responsavel: proc.responsavel,
    equipe: proc.equipe,

    status: 'Aberta',
    prioridade: proc.prioridade || 'Média',

    criadoEm: new Date().toISOString()
  };

  tarefas.push(tarefa);
  writeJSON('tarefas.json', tarefas);
}

// =====================================================
// CRIAÇÃO AUTOMÁTICA VIA RECE
// =====================================================

function criarProcessoViaRece(dadosRece) {
  if (!dadosRece) return { ok: false };

  return criarProcessoComunicacao({
    tipo: 'Publicação RECE',
    titulo: dadosRece.titulo,
    descricao: dadosRece.descricao,
    origem: 'rece',
    idRece: dadosRece.id,
    responsavel: dadosRece.responsavel
  });
}

// =====================================================
// CRIAÇÃO AUTOMÁTICA VIA RESERVA
// =====================================================

function criarProcessoViaReserva(dadosReserva) {
  if (!dadosReserva) return { ok: false };

  return criarProcessoComunicacao({
    tipo: 'Produção',
    titulo: dadosReserva.nome || dadosReserva.titulo,
    descricao: dadosReserva.descricao,
    origem: 'reserva',
    idReserva: dadosReserva.id,
    responsavel: dadosReserva.responsavel
  });
}