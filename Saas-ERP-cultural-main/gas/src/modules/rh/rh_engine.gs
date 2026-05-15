/**
 * @file modules/rh/rh_engine.gs
 * @layer modules/rh
 * @description Motor de regras de negócio do domínio RH.
 *
 * Fluxo obrigatório:
 *   Controller → RHEngine → RHRepository → DataLayer
 *
 * Centraliza validações, estados oficiais e auditoria de:
 * cargos, histórico, avaliações, ponto, documentos, folha, PCCS.
 *
 * @depends modules/rh/rh_repository.gs (RHRepository),
 *          core/services/auditoria_service.gs (AuditoriaService),
 *          modules/rh/mod_rh.gs (obterIndicadoresRH, obterDiversidadeRH,
 *                                simularFolhaRH, aplicarReajustePCCS, obterPCCS)
 */

var STATUS_VINCULO = {
  ATIVO:      'ativo',
  INATIVO:    'inativo',
  AFASTADO:   'afastado',
  DESLIGADO:  'desligado',
  FERIAS:     'ferias'
};

var RHEngine = (function () {

  function _audit(evento, dados) {
    try {
      if (typeof AuditoriaService !== 'undefined')
        AuditoriaService.registrar(evento, 'rh', dados || {});
    } catch(_) {}
  }

  // ── Cargos ───────────────────────────────────────────────────────

  function listarCargos()     { return RHRepository.listarCargos(); }

  function salvarCargo(dados, email) {
    if (!dados || typeof dados !== 'object') throw new Error('Dados do cargo são obrigatórios.');
    var r = RHRepository.salvarCargo(dados);
    _audit(r.isNovo ? 'RH_CARGO_CRIADO' : 'RH_CARGO_ATUALIZADO',
      { id: r.id, nome: dados.nome || '', operador: email || '' });
    return r.id;
  }

  function excluirCargo(id, email) {
    if (!id) throw new Error('ID do cargo é obrigatório.');
    RHRepository.excluirCargo(id);
    _audit('RH_CARGO_EXCLUIDO', { id: id, operador: email || '' });
  }

  // ── Histórico ────────────────────────────────────────────────────

  function listarHistorico(idColaborador) {
    return RHRepository.listarHistorico(idColaborador || null);
  }

  function registrarEvento(dados, email) {
    if (!dados || typeof dados !== 'object') throw new Error('Dados do evento são obrigatórios.');
    if (!dados.registradoPor) dados.registradoPor = email || '';
    var r = RHRepository.salvarHistorico(dados);
    _audit('RH_EVENTO_REGISTRADO', { id: r.id, tipo: dados.tipo || '', colaborador: dados.idColaborador || '', operador: email || '' });
    return r.id;
  }

  function excluirEvento(id, email) {
    if (!id) throw new Error('ID do evento é obrigatório.');
    RHRepository.excluirHistorico(id);
    _audit('RH_EVENTO_EXCLUIDO', { id: id, operador: email || '' });
  }

  // ── Avaliações ───────────────────────────────────────────────────

  function listarAvaliacoes(idColaborador) {
    return RHRepository.listarAvaliacoes(idColaborador || null);
  }

  function salvarAvaliacao(dados, email) {
    if (!dados || typeof dados !== 'object') throw new Error('Dados da avaliação são obrigatórios.');
    if (!dados.avaliador) dados.avaliador = email || '';
    var r = RHRepository.salvarAvaliacao(dados);
    _audit(r.isNovo ? 'RH_AVALIACAO_CRIADA' : 'RH_AVALIACAO_ATUALIZADA',
      { id: r.id, colaborador: dados.idColaborador || '', avaliador: dados.avaliador });
    return r.id;
  }

  function excluirAvaliacao(id, email) {
    if (!id) throw new Error('ID da avaliação é obrigatório.');
    RHRepository.excluirAvaliacao(id);
    _audit('RH_AVALIACAO_EXCLUIDA', { id: id, operador: email || '' });
  }

  // ── Ponto ────────────────────────────────────────────────────────

  function listarPonto(idColaborador, mes) {
    return RHRepository.listarPonto(idColaborador || null, mes || null);
  }

  function registrarPonto(dados, email) {
    if (!dados || typeof dados !== 'object') throw new Error('Dados do ponto são obrigatórios.');
    var r = RHRepository.salvarPonto(dados);
    _audit('RH_PONTO_REGISTRADO', { id: r.id, colaborador: dados.idColaborador || '', operador: email || '' });
    return r.id;
  }

  function excluirPonto(id, email) {
    if (!id) throw new Error('ID do ponto é obrigatório.');
    RHRepository.excluirPonto(id);
    _audit('RH_PONTO_EXCLUIDO', { id: id, operador: email || '' });
  }

  // ── Documentos ───────────────────────────────────────────────────

  function listarDocumentos(idColaborador) {
    return RHRepository.listarDocumentos(idColaborador || null);
  }

  function salvarDocumento(dados, email) {
    if (!dados || typeof dados !== 'object') throw new Error('Dados do documento são obrigatórios.');
    var r = RHRepository.salvarDocumento(dados);
    _audit(r.isNovo ? 'RH_DOCUMENTO_CRIADO' : 'RH_DOCUMENTO_ATUALIZADO',
      { id: r.id, tipo: dados.tipo || '', colaborador: dados.idColaborador || '', operador: email || '' });
    return r.id;
  }

  function excluirDocumento(id, email) {
    if (!id) throw new Error('ID do documento é obrigatório.');
    RHRepository.excluirDocumento(id);
    _audit('RH_DOCUMENTO_EXCLUIDO', { id: id, operador: email || '' });
  }

  // ── Folha ────────────────────────────────────────────────────────

  function listarFolha(mes)   { return RHRepository.listarFolha(mes || null); }

  function salvarFolha(dados, email) {
    if (!dados || typeof dados !== 'object') throw new Error('Dados da folha são obrigatórios.');
    var r = RHRepository.salvarFolha(dados);
    _audit(r.isNovo ? 'RH_FOLHA_CRIADA' : 'RH_FOLHA_ATUALIZADA',
      { id: r.id, mes: dados.mes || '', operador: email || '' });
    return r.id;
  }

  // ── Perfil social ────────────────────────────────────────────────

  function obterPerfilSocial(id) { return RHRepository.obterPerfilSocial(id); }

  function salvarPerfilSocial(dados, email) {
    if (!dados || typeof dados !== 'object') throw new Error('Dados do perfil são obrigatórios.');
    var r = RHRepository.salvarPerfilSocial(dados);
    _audit('RH_PERFIL_SOCIAL_ATUALIZADO', { id: r.id, colaborador: dados.idColaborador || '', operador: email || '' });
    return r.id;
  }

  // ── Indicadores e diversidade — delegam ao mod_rh.gs ────────────

  function obterIndicadores() {
    return typeof obterIndicadoresRH === 'function' ? obterIndicadoresRH() : {};
  }

  function obterDiversidade() {
    return typeof obterDiversidadeRH === 'function' ? obterDiversidadeRH() : {};
  }

  // ── PCCS ─────────────────────────────────────────────────────────

  function obterPCCSCompleto() {
    return typeof obterPCCS === 'function' ? obterPCCS() : {
      parametros: RHRepository.obterParametrosPCCS(),
      tabela:     RHRepository.listarTabelaPCCS(),
      cargos:     RHRepository.listarCargosPCCS()
    };
  }

  function salvarParametrosPCCS(params, email) {
    if (!params || typeof params !== 'object') throw new Error('Parâmetros PCCS são obrigatórios.');
    // Usa obterPCCS()/writeJSON diretamente — arquivo canônico rh_pccs.json
    var d = typeof obterPCCS === 'function' ? obterPCCS() : {};
    var p = d.parametros || {};
    Object.keys(params).forEach(function(k) { p[k] = params[k]; });
    p.atualizadoEm = new Date().toISOString();
    d.parametros = p;
    writeJSON('rh_pccs.json', d);
    _audit('RH_PCCS_PARAMS_ATUALIZADOS', { operador: email || '' });
  }

  function aplicarReajuste(percentual, email) {
    if (percentual === undefined || percentual === null) throw new Error('Percentual é obrigatório.');
    var resultado = typeof aplicarReajustePCCS === 'function' ? aplicarReajustePCCS(percentual) : null;
    _audit('RH_PCCS_REAJUSTE_APLICADO', { percentual: percentual, operador: email || '' });
    return resultado;
  }

  function salvarTabelaRow(row, email) {
    if (!row || typeof row !== 'object') throw new Error('Dados da tabela são obrigatórios.');
    // salvarTabelaRowPCCS é global em mod_rh.gs — escreve no arquivo unificado rh_pccs.json
    var r = typeof salvarTabelaRowPCCS === 'function' ? salvarTabelaRowPCCS(row) : null;
    _audit('RH_PCCS_TABELA_ATUALIZADA', { tipo: row.tipo, classe: row.classe, operador: email || '' });
    return (r && r.ok) ? (row.tipo + '_' + row.classe) : (row.tipo + '_' + row.classe);
  }

  function listarCargosPCCS() {
    // obterCargosPCCS é global em mod_rh.gs — lê de rh_pccs.json (consistente com obterPCCSCompleto)
    return typeof obterCargosPCCS === 'function' ? obterCargosPCCS() : [];
  }

  function salvarCargoPCCS(d, email) {
    if (!d || typeof d !== 'object') throw new Error('Dados do cargo PCCS são obrigatórios.');
    // Escreve no arquivo unificado rh_pccs.json manipulando a estrutura diretamente
    var pccs = typeof obterPCCS === 'function' ? obterPCCS() : {};
    if (!pccs.cargos) pccs.cargos = [];
    var isNovo = !d.id;
    if (isNovo) {
      d.id = 'pccs_' + Date.now();
      d.criadoEm = new Date().toISOString();
      pccs.cargos.push(d);
    } else {
      var idx = -1;
      for (var i = 0; i < pccs.cargos.length; i++) {
        if (pccs.cargos[i].id === d.id) { idx = i; break; }
      }
      if (idx >= 0) pccs.cargos[idx] = d;
      else pccs.cargos.push(d);
    }
    writeJSON('rh_pccs.json', pccs);
    _audit(isNovo ? 'RH_PCCS_CARGO_CRIADO' : 'RH_PCCS_CARGO_ATUALIZADO',
      { id: d.id, operador: email || '' });
    return d.id;
  }

  function excluirCargoPCCS(id, email) {
    if (!id) throw new Error('ID do cargo PCCS é obrigatório.');
    // Escreve no arquivo unificado rh_pccs.json
    var pccs = typeof obterPCCS === 'function' ? obterPCCS() : {};
    pccs.cargos = (pccs.cargos || []).filter(function(c) { return c.id !== id; });
    writeJSON('rh_pccs.json', pccs);
    _audit('RH_PCCS_CARGO_EXCLUIDO', { id: id, operador: email || '' });
  }

  function simularFolha(dados) {
    return typeof simularFolhaRH === 'function' ? simularFolhaRH(dados) : {};
  }

  function simularFolhaDetalhada(dados) {
    return typeof simularFolhaRHDetalhada === 'function' ? simularFolhaRHDetalhada(dados) : simularFolha(dados);
  }

  // ── Rescisão — delega ao RescisaoEngine ─────────────────────────

  var _TIPOS_EVENTO_SENSIVEIS = ['desligamento', 'alteracaoSalarial'];
  var _CAMPOS_FINANCEIROS_SENSIVEIS = ['rescisaoCalculada', 'rescisaoSnapshot', 'idRescisaoOficial',
    'salarioAnterior', 'salarioNovo', 'percentual'];

  // Listagem filtrada por perfil (sem eventos e campos sensíveis para não-RH)
  function listarHistoricoFiltrado(idColaborador, perfil) {
    var lista = RHRepository.listarHistorico(idColaborador || null);
    lista = lista.filter(function(h) {
      if (perfil === 'colaborador') return _TIPOS_EVENTO_SENSIVEIS.indexOf(h.tipo) === -1;
      if (perfil === 'gestor')     return h.tipo !== 'desligamento';
      return true;
    });
    return lista.map(function(h) {
      if (perfil === 'colaborador' || perfil === 'gestor') {
        var clone = {};
        for (var k in h) { if (h.hasOwnProperty(k)) clone[k] = h[k]; }
        _CAMPOS_FINANCEIROS_SENSIVEIS.forEach(function(c) { delete clone[c]; });
        return clone;
      }
      return h;
    });
  }

  // Desligamento oficial: gera cálculo automático, registra evento e atualiza status
  function registrarDesligamento(dados, email) {
    if (!dados || !dados.idColaborador)
      throw new Error('idColaborador é obrigatório para registrar desligamento.');

    dados.tipo = 'desligamento';
    dados.registradoPor = email || '';

    // Calcular rescisão automaticamente se houver dados suficientes
    var rescisaoOficial = null;
    try {
      var funcionarios = readJSON('funcionarios.json') || [];
      var colaborador = null;
      for (var i = 0; i < funcionarios.length; i++) {
        if (funcionarios[i].id === dados.idColaborador) { colaborador = funcionarios[i]; break; }
      }
      var tipoRsc = dados.tipoRescisao || dados.TipoDesligamento || null;
      if (colaborador && colaborador.dataAdmissao && colaborador.salarioBase
          && dados.dataEvento && tipoRsc) {
        // Adiantamento do 13º: considera somente se for do mesmo ano do desligamento
        var anoDeslig = (dados.dataEvento || '').slice(0, 4);
        var adiant13  = colaborador.adiantamento13 || {};
        var adiant13Pago = 0;
        var adiant13Data = null;
        if (adiant13.ano && String(adiant13.ano) === anoDeslig && adiant13.valor) {
          adiant13Pago = parseFloat(adiant13.valor) || 0;
          adiant13Data = adiant13.dataPagamento || null;
        }
        var paramsCalculo = {
          dataAdmissao:               colaborador.dataAdmissao,
          dataDesligamento:           dados.dataEvento,
          tipoRescisao:               tipoRsc,
          salarioBase:                colaborador.salarioBase,
          beneficios:                 colaborador.beneficios || 0,
          observacoes:                dados.observacoes || '',
          adiantamento13Pago:         adiant13Pago,
          adiantamento13DataPagamento: adiant13Data,
          // Ativa modo histórico: FGTS e férias vencidas calculados com trajetória real
          idColaborador:              dados.idColaborador
        };
        rescisaoOficial = RescisaoEngine.calcular(paramsCalculo);
        var rscSaved    = RescisaoEngine.salvarOficial(rescisaoOficial, dados.idColaborador, email);
        dados.idRescisaoOficial = rscSaved.id;
        // Snapshot mínimo no evento — sem dados financeiros completos no histórico
        dados.rescisaoSnapshot = {
          tipoRescisao:    rescisaoOficial.tipoRescisao,
          tipoLabel:       rescisaoOficial.tipoLabel,
          totalRescisao:   rescisaoOficial.totalRescisao,
          vacanciaEstimada:rescisaoOficial.vacanciaEstimada,
          geradoEm:        rescisaoOficial.geradoEm
        };
      }
    } catch (e) {}

    // Registrar evento no histórico funcional
    var eventoResult = RHRepository.salvarHistorico(dados);
    _audit('RH_DESLIGAMENTO_REGISTRADO', {
      id: eventoResult.id, colaborador: dados.idColaborador,
      rescisaoGerada: !!rescisaoOficial, operador: email
    });

    // Atualizar status do colaborador para Inativo
    try {
      var lista = readJSON('funcionarios.json') || [];
      for (var j = 0; j < lista.length; j++) {
        if (lista[j].id === dados.idColaborador) {
          lista[j].status = 'Inativo';
          lista[j].dataDesligamento = dados.dataEvento || new Date().toISOString().slice(0, 10);
          break;
        }
      }
      writeJSON('funcionarios.json', lista);
    } catch (e) {}

    return {
      id:             eventoResult.id,
      rescisaoGerada: !!rescisaoOficial,
      idRescisao:     dados.idRescisaoOficial || null
    };
  }

  function calcularRescisao(params) {
    if (!params || typeof params !== 'object') throw new Error('Parâmetros de rescisão são obrigatórios.');
    return RescisaoEngine.calcular(params);
  }

  function salvarSimulacaoRescisao(calculo, idColaborador, email) {
    var r = RescisaoEngine.salvarSimulacao(calculo, idColaborador, email);
    _audit('RH_SIMULACAO_RESCISAO', { id: r.id, colaborador: idColaborador, operador: email || '' });
    return r.id;
  }

  function listarSimulacoesRescisao(idColaborador) {
    return RescisaoEngine.listarSimulacoes(idColaborador || null);
  }

  function listarRescisoes(idColaborador) {
    return RescisaoEngine.listar(idColaborador || null);
  }

  function obterRescisao(id) {
    return RescisaoEngine.obter(id);
  }

  // ── Férias — delega ao FeriasEngine ─────────────────────────────

  function listarFerias(idColaborador, email, nivel) {
    return FeriasEngine.listarFerias(idColaborador, email, nivel);
  }

  function solicitarFerias(dados, email) {
    return FeriasEngine.solicitar(dados, email);
  }

  function aprovarFerias(id, dadosAprovacao, email) {
    return FeriasEngine.aprovar(id, dadosAprovacao, email);
  }

  function reprovarFerias(id, motivo, email) {
    FeriasEngine.reprovar(id, motivo, email);
  }

  function solicitarAjusteFerias(id, obs, email) {
    FeriasEngine.solicitarAjuste(id, obs, email);
  }

  function reenviarFerias(id, novasDatas, email) {
    FeriasEngine.reenviarAposAjuste(id, novasDatas, email);
  }

  function concluirFerias(id, dadosConclusao, email) {
    return FeriasEngine.concluir(id, dadosConclusao, email);
  }

  function cancelarFerias(id, motivo, email) {
    FeriasEngine.cancelar(id, motivo, email);
  }

  function saldoFerias(idColaborador) {
    var funcionarios = readJSON('funcionarios.json') || [];
    var f = null;
    for (var i = 0; i < funcionarios.length; i++) {
      if (funcionarios[i].id === idColaborador) { f = funcionarios[i]; break; }
    }
    if (!f || !f.dataAdmissao) return { error: 'Colaborador ou data de admissão não encontrado.' };
    return FeriasEngine.calcularSaldo(idColaborador, f.dataAdmissao);
  }

  // ── API pública ───────────────────────────────────────────────────

  return {
    listarCargos:        listarCargos,
    salvarCargo:         salvarCargo,
    excluirCargo:        excluirCargo,
    listarHistorico:     listarHistorico,
    registrarEvento:     registrarEvento,
    excluirEvento:       excluirEvento,
    listarAvaliacoes:    listarAvaliacoes,
    salvarAvaliacao:     salvarAvaliacao,
    excluirAvaliacao:    excluirAvaliacao,
    listarPonto:         listarPonto,
    registrarPonto:      registrarPonto,
    excluirPonto:        excluirPonto,
    listarDocumentos:    listarDocumentos,
    salvarDocumento:     salvarDocumento,
    excluirDocumento:    excluirDocumento,
    listarFolha:         listarFolha,
    salvarFolha:         salvarFolha,
    obterPerfilSocial:   obterPerfilSocial,
    salvarPerfilSocial:  salvarPerfilSocial,
    obterIndicadores:    obterIndicadores,
    obterDiversidade:    obterDiversidade,
    obterPCCSCompleto:   obterPCCSCompleto,
    salvarParametrosPCCS:salvarParametrosPCCS,
    aplicarReajuste:     aplicarReajuste,
    salvarTabelaRow:     salvarTabelaRow,
    listarCargosPCCS:      listarCargosPCCS,
    salvarCargoPCCS:       salvarCargoPCCS,
    excluirCargoPCCS:      excluirCargoPCCS,
    simularFolha:          simularFolha,
    simularFolhaDetalhada: simularFolhaDetalhada,
    listarHistoricoFiltrado: listarHistoricoFiltrado,
    registrarDesligamento:   registrarDesligamento,
    calcularRescisao:        calcularRescisao,
    salvarSimulacaoRescisao: salvarSimulacaoRescisao,
    listarSimulacoesRescisao:listarSimulacoesRescisao,
    listarRescisoes:         listarRescisoes,
    obterRescisao:           obterRescisao,
    listarFerias:          listarFerias,
    solicitarFerias:       solicitarFerias,
    aprovarFerias:         aprovarFerias,
    reprovarFerias:        reprovarFerias,
    solicitarAjusteFerias: solicitarAjusteFerias,
    reenviarFerias:        reenviarFerias,
    concluirFerias:        concluirFerias,
    cancelarFerias:        cancelarFerias,
    saldoFerias:           saldoFerias,
    STATUS_VINCULO:        STATUS_VINCULO
  };

})();
