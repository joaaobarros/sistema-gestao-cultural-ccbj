/**
 * @file modules/equipes/equipes_engine.gs
 * @layer modules/equipes
 * @description Motor de regras de negócio do domínio Equipes.
 *
 * Centraliza validações, estados oficiais e orquestração de fluxos
 * de funcionários, escalas, avaliações e férias.
 *
 * Fluxo obrigatório:
 *   Controller → EquipesEngine → EquipesRepository → DataLayer
 *
 * @depends modules/equipes/equipes_repository.gs (EquipesRepository),
 *          core/services/auditoria_service.gs (AuditoriaService),
 *          core/logger.gs (Logger)
 */

var STATUS_FERIAS = {
  PENDENTE:  'PENDENTE',
  APROVADO:  'APROVADO',
  RECUSADO:  'RECUSADO',
  CANCELADO: 'CANCELADO'
};

var STATUS_COLABORADOR = {
  ATIVO:     'ativo',
  INATIVO:   'inativo',
  AFASTADO:  'afastado',
  DESLIGADO: 'desligado'
};

var EquipesEngine = (function () {

  // ── Funcionários ─────────────────────────────────────────────────

  function listar() {
    return EquipesRepository.listarFuncionarios();
  }

  function listarPorFuncao(funcao) {
    var lista = EquipesRepository.listarFuncionarios();
    var hoje  = new Date().toISOString().slice(0, 10);
    return lista
      .filter(function(p) {
        if (!p.ativo) return false;
        var funcoes = p.funcoes || [];
        var subs    = p.substituicoes || [];
        var temFuncao = funcoes.some(function(f) { return f.tipo === funcao && f.ativo !== false; });
        var substituindo = subs.some(function(s) {
          return s.tipo === funcao &&
                 (!s.inicio || s.inicio <= hoje) &&
                 (!s.fim    || s.fim    >= hoje);
        });
        return temFuncao || substituindo;
      })
      .map(function(p) { return p.email_institucional || p.email || p.id; });
  }

  function salvar(dados, emailOperador) {
    if (!dados || typeof dados !== 'object')
      throw new Error('Dados do funcionário são obrigatórios.');

    var resultado = EquipesRepository.salvarFuncionario(dados);
    var evento    = resultado.isNovo ? 'EQUIPE_FUNCIONARIO_CRIADO' : 'EQUIPE_FUNCIONARIO_ATUALIZADO';
    try {
      if (typeof AuditoriaService !== 'undefined')
        AuditoriaService.registrar(evento, 'equipes',
          { id: resultado.id, nome: dados.nome || '', operador: emailOperador || '' });
    } catch(_) {}
    return resultado.id;
  }

  function excluir(id, emailOperador) {
    if (!id) throw new Error('ID do funcionário é obrigatório.');
    EquipesRepository.excluirFuncionario(id);
    try {
      if (typeof AuditoriaService !== 'undefined')
        AuditoriaService.registrar('EQUIPE_FUNCIONARIO_EXCLUIDO', 'equipes',
          { id: id, operador: emailOperador || '' });
    } catch(_) {}
  }

  // ── Escalas ──────────────────────────────────────────────────────

  function listarEscalas() {
    return EquipesRepository.listarEscalas();
  }

  function salvarEscala(dados, emailOperador) {
    if (!dados || typeof dados !== 'object')
      throw new Error('Dados da escala são obrigatórios.');
    var resultado = EquipesRepository.salvarEscala(dados);
    try {
      if (typeof AuditoriaService !== 'undefined')
        AuditoriaService.registrar(resultado.isNovo ? 'EQUIPE_ESCALA_CRIADA' : 'EQUIPE_ESCALA_ATUALIZADA',
          'equipes', { id: resultado.id, operador: emailOperador || '' });
    } catch(_) {}
    return resultado.id;
  }

  // ── Avaliações ───────────────────────────────────────────────────

  function listarAvaliacoes() {
    return EquipesRepository.listarAvaliacoes();
  }

  function registrarAvaliacao(dados, emailOperador) {
    if (!dados || typeof dados !== 'object')
      throw new Error('Dados da avaliação são obrigatórios.');
    if (!dados.avaliador) dados.avaliador = emailOperador || '';
    var resultado = EquipesRepository.salvarAvaliacao(dados);
    try {
      if (typeof AuditoriaService !== 'undefined')
        AuditoriaService.registrar('EQUIPE_AVALIACAO_REGISTRADA', 'equipes',
          { id: resultado.id, colaborador: dados.idColaborador || '', avaliador: dados.avaliador });
    } catch(_) {}
    return resultado.id;
  }

  // ── Férias ───────────────────────────────────────────────────────

  function listarFerias() {
    return EquipesRepository.listarFerias();
  }

  function solicitarFerias(dados, emailOperador) {
    if (!dados || typeof dados !== 'object')
      throw new Error('Dados das férias são obrigatórios.');
    if (!dados.idColaborador)
      throw new Error('idColaborador é obrigatório para solicitação de férias.');
    dados.status     = STATUS_FERIAS.PENDENTE;
    dados.solicitante = emailOperador || '';
    var resultado = EquipesRepository.salvarFerias(dados);
    try {
      if (typeof AuditoriaService !== 'undefined')
        AuditoriaService.registrar('EQUIPE_FERIAS_SOLICITADA', 'equipes',
          { id: resultado.id, colaborador: dados.idColaborador, solicitante: dados.solicitante });
    } catch(_) {}
    return resultado.id;
  }

  function obterMetricasEficiencia() {
    var lista = EquipesRepository.listarFuncionarios();
    var ativos   = lista.filter(function(f) { return f.ativo !== false; });
    var inativos = lista.filter(function(f) { return f.ativo === false; });
    return {
      total:    lista.length,
      ativos:   ativos.length,
      inativos: inativos.length,
      geradoEm: new Date().toISOString()
    };
  }

  // ── API pública ───────────────────────────────────────────────────

  return {
    listar:               listar,
    listarPorFuncao:      listarPorFuncao,
    salvar:               salvar,
    excluir:              excluir,
    listarEscalas:        listarEscalas,
    salvarEscala:         salvarEscala,
    listarAvaliacoes:     listarAvaliacoes,
    registrarAvaliacao:   registrarAvaliacao,
    listarFerias:         listarFerias,
    solicitarFerias:      solicitarFerias,
    obterMetricasEficiencia: obterMetricasEficiencia,
    STATUS_FERIAS:        STATUS_FERIAS,
    STATUS_COLABORADOR:   STATUS_COLABORADOR
  };

})();
