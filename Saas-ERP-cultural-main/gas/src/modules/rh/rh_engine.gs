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
 *          modules/rh/rh_parametros_fiscais_engine.gs (ParametrosFiscaisRH),
 *          core/services/auditoria_service.gs (AuditoriaService)
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

  // ── Indicadores e diversidade ────────────────────────────────────

  function obterIndicadores() {
    return _indicadoresRH();
  }

  function obterDiversidade() {
    return _diversidadeRH();
  }

  // ── PCCS ─────────────────────────────────────────────────────────

  function obterPCCSCompleto() {
    return _obterPCCS();
  }

  function salvarParametrosPCCS(params, email) {
    if (!params || typeof params !== 'object') throw new Error('Parâmetros PCCS são obrigatórios.');
    var d = _obterPCCS();
    var p = d.parametros || {};
    Object.keys(params).forEach(function(k) { p[k] = params[k]; });
    p.atualizadoEm = new Date().toISOString();
    d.parametros = p;
    writeJSON(_PCCS_FILE, d);
    _audit('RH_PCCS_PARAMS_ATUALIZADOS', { operador: email || '' });
  }

  function aplicarReajuste(percentual, email) {
    if (percentual === undefined || percentual === null) throw new Error('Percentual é obrigatório.');
    var resultado = _aplicarReajustePCCS(percentual);
    _audit('RH_PCCS_REAJUSTE_APLICADO', { percentual: percentual, operador: email || '' });
    return resultado;
  }

  function salvarTabelaRow(row, email) {
    if (!row || typeof row !== 'object') throw new Error('Dados da tabela são obrigatórios.');
    var r = _salvarTabelaRowPCCS(row);
    _audit('RH_PCCS_TABELA_ATUALIZADA', { tipo: row.tipo, classe: row.classe, operador: email || '' });
    return (r && r.ok) ? (row.tipo + '_' + row.classe) : (row.tipo + '_' + row.classe);
  }

  function listarCargosPCCS() {
    return _obterCargosPCCS();
  }

  function salvarCargoPCCS(d, email) {
    if (!d || typeof d !== 'object') throw new Error('Dados do cargo PCCS são obrigatórios.');
    var pccs = _obterPCCS();
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
    writeJSON(_PCCS_FILE, pccs);
    _audit(isNovo ? 'RH_PCCS_CARGO_CRIADO' : 'RH_PCCS_CARGO_ATUALIZADO',
      { id: d.id, operador: email || '' });
    return d.id;
  }

  function excluirCargoPCCS(id, email) {
    if (!id) throw new Error('ID do cargo PCCS é obrigatório.');
    var pccs = _obterPCCS();
    pccs.cargos = (pccs.cargos || []).filter(function(c) { return c.id !== id; });
    writeJSON(_PCCS_FILE, pccs);
    _audit('RH_PCCS_CARGO_EXCLUIDO', { id: id, operador: email || '' });
  }

  function simularFolha(dados) {
    return _simularFolha(dados);
  }

  function simularFolhaDetalhada(dados) {
    return _simularFolhaDetalhada(dados);
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

  // ── PCCS — lógica privada ────────────────────────────────────────
  // (dados em rh_pccs.json como objeto unificado {parametros, tabelaSalarial, cargos})

  var _PCCS_FILE = 'rh_pccs.json';

  function _pccsTabela() {
    return [
      {tipo:'FIXA',classe:'PISO',grupo:'Administrativo',pontosMin:null,pontosMax:null,valorBase:1747.16,steps:[1747.16,1747.16,1747.16,1747.16,1747.16]},
      {tipo:'FIXA',classe:'A',grupo:'Administrativo',pontosMin:100,pontosMax:121,valorBase:1711.07,steps:[1796.62,1931.37,2076.22,2231.94,2399.34]},
      {tipo:'FIXA',classe:'B',grupo:'Administrativo',pontosMin:122,pontosMax:146,valorBase:2114.11,steps:[2219.82,2386.30,2565.27,2757.67,2964.50]},
      {tipo:'FIXA',classe:'C',grupo:'Administrativo',pontosMin:147,pontosMax:177,valorBase:2601.42,steps:[2731.49,2936.35,3156.58,3393.32,3647.82]},
      {tipo:'FIXA',classe:'D',grupo:'Administrativo',pontosMin:178,pontosMax:214,valorBase:3190.65,steps:[3350.18,3601.45,3871.55,4161.92,4474.07]},
      {tipo:'FIXA',classe:'E',grupo:'Administrativo',pontosMin:215,pontosMax:258,valorBase:3903.09,steps:[4098.24,4405.61,4736.03,5091.24,5473.08]},
      {tipo:'FIXA',classe:'F',grupo:'Administrativo',pontosMin:259,pontosMax:312,valorBase:4764.53,steps:[5002.76,5377.96,5781.31,6214.91,6681.03]},
      {tipo:'FIXA',classe:'G',grupo:'Administrativo',pontosMin:313,pontosMax:378,valorBase:5806.11,steps:[6096.42,6553.65,7045.17,7573.56,8141.57]},
      {tipo:'FIXA',classe:'H',grupo:'Administrativo',pontosMin:379,pontosMax:457,valorBase:7065.50,steps:[7418.78,7975.18,8573.32,9216.32,9907.55]},
      {tipo:'FIXA',classe:'I',grupo:'Administrativo',pontosMin:458,pontosMax:552,valorBase:8588.26,steps:[9017.67,9694.00,10421.05,11202.63,12042.82]},
      {tipo:'FIXA',classe:'J',grupo:'Administrativo',pontosMin:553,pontosMax:668,valorBase:10429.47,steps:[10950.94,11772.26,12655.18,13604.32,14624.65]},
      {tipo:'FIXA',classe:'K',grupo:'Administrativo',pontosMin:669,pontosMax:808,valorBase:12655.71,steps:[13288.50,14285.13,15356.52,16508.26,17746.38]},
      {tipo:'FIXA',classe:'L',grupo:'Administrativo',pontosMin:809,pontosMax:976,valorBase:15347.51,steps:[16114.89,17323.50,18622.76,20019.47,21520.93]},
      {tipo:'FIXA',classe:'M',grupo:'Administrativo',pontosMin:977,pontosMax:1181,valorBase:18602.23,steps:[19532.34,20997.27,22572.06,24264.97,26084.84]},
      {tipo:'FIXA',classe:'N',grupo:'Administrativo',pontosMin:1182,pontosMax:1428,valorBase:22537.58,steps:[23664.46,25439.29,27347.24,29398.28,31603.15]},
      {tipo:'FIXA',classe:'O',grupo:'Administrativo',pontosMin:1429,pontosMax:1726,valorBase:27295.89,steps:[28660.68,30810.24,33121.00,35605.08,38275.46]},
      {tipo:'FIXA',classe:'P',grupo:'Administrativo',pontosMin:1727,pontosMax:2087,valorBase:33049.27,steps:[34701.73,37304.36,40102.19,43109.86,46343.09]},
      {tipo:'FIXA',classe:'Q',grupo:'Administrativo',pontosMin:2088,pontosMax:2523,valorBase:40005.82,steps:[42006.11,45156.57,48543.31,52184.06,56097.86]},
      {tipo:'ORIENTADOR',classe:'F',grupo:'Gestão Tática',pontosMin:259,pontosMax:312,valorBase:4764.53,steps:[5002.76,5377.96,5781.31,6214.91,6681.03]},
      {tipo:'ORIENTADOR',classe:'G',grupo:'Gestão Tática',pontosMin:313,pontosMax:378,valorBase:5806.11,steps:[6096.42,6553.65,7045.17,7573.56,8141.57]},
      {tipo:'ORIENTADOR',classe:'H',grupo:'Gestão Tática',pontosMin:379,pontosMax:457,valorBase:7065.50,steps:[7418.78,7975.18,8573.32,9216.32,9907.55]},
      {tipo:'ORIENTADOR',classe:'I',grupo:'Gestão Tática',pontosMin:458,pontosMax:552,valorBase:8588.26,steps:[9017.67,9694.00,10421.05,11202.63,12042.82]},
      {tipo:'ORIENTADOR',classe:'J',grupo:'Gestão Tática',pontosMin:553,pontosMax:668,valorBase:10429.47,steps:[10950.94,11772.26,12655.18,13604.32,14624.65]},
      {tipo:'ORIENTADOR',classe:'K',grupo:'Gestão Tática',pontosMin:669,pontosMax:808,valorBase:12655.71,steps:[13288.50,14285.13,15356.52,16508.26,17746.38]},
      {tipo:'ORIENTADOR',classe:'L',grupo:'Gestão Tática',pontosMin:809,pontosMax:976,valorBase:15347.51,steps:[16114.89,17323.50,18622.76,20019.47,21520.93]},
      {tipo:'ORIENTADOR',classe:'M',grupo:'Gestão Tática',pontosMin:977,pontosMax:1181,valorBase:18602.23,steps:[19532.34,20997.27,22572.06,24264.97,26084.84]},
      {tipo:'ORIENTADOR',classe:'N',grupo:'Gestão Tática',pontosMin:1182,pontosMax:1428,valorBase:22537.58,steps:[23664.46,25439.29,27347.24,29398.28,31603.15]},
      {tipo:'ORIENTADOR',classe:'O',grupo:'Gestão Tática',pontosMin:1429,pontosMax:1726,valorBase:27295.89,steps:[28660.68,30810.24,33121.00,35605.08,38275.46]},
      {tipo:'ORIENTADOR',classe:'P',grupo:'Gestão Tática',pontosMin:1727,pontosMax:2087,valorBase:33049.27,steps:[34701.73,37304.36,40102.19,43109.86,46343.09]},
      {tipo:'ORIENTADOR',classe:'Q',grupo:'Gestão Tática',pontosMin:2088,pontosMax:2523,valorBase:40005.82,steps:[42006.11,45156.57,48543.31,52184.06,56097.86]}
    ];
  }

  function _pccsCargosDefault() {
    var rows = [
      ['Gestão Estratégica','Diretor Presidente','O','ORIENTADOR','Gestão Estratégica'],
      ['Gestão Estratégica','Diretor Administrativo-Financeiro','M','ORIENTADOR','Gestão Estratégica'],
      ['Gestão Estratégica','Diretor de Ação Cultural','M','ORIENTADOR','Gestão Estratégica'],
      ['Gestão Estratégica','Diretor de Formação','M','ORIENTADOR','Gestão Estratégica'],
      ['Gestão Estratégica','Superintendente','L','ORIENTADOR','Gestão Estratégica'],
      ['Gestão Estratégica','Gerente Executivo II','J','ORIENTADOR','Gestão Estratégica'],
      ['Gestão Estratégica','Gerente Executivo I','I','ORIENTADOR','Gestão Estratégica'],
      ['Gestão Estratégica','Assessor de Governança','J','ORIENTADOR','Assessoramento'],
      ['Gestão Estratégica','Assessor de Gestão Cultural e Artística','J','ORIENTADOR','Assessoramento'],
      ['Gestão Estratégica','Assessor de Gestão Executiva III','J','ORIENTADOR','Assessoramento'],
      ['Gestão Estratégica','Assessor de Gestão Executiva II','I','ORIENTADOR','Assessoramento'],
      ['Gestão Estratégica','Assessor de Gestão Executiva I','H','ORIENTADOR','Assessoramento'],
      ['Gestão Estratégica','Assessor de Diretoria','G','ORIENTADOR','Assessoramento'],
      ['Comunicação e Marketing','Gerente de Comunicação e Marketing','I','ORIENTADOR','Gestão Tática'],
      ['Comunicação e Marketing','Coordenador de Marketing e Projetos','H','ORIENTADOR','Gestão Tática'],
      ['Comunicação e Marketing','Assessor de Marketing e Projetos','G','ORIENTADOR','Assessoramento'],
      ['Comunicação e Marketing','Analista de Marketing e Projetos','F','FIXA','Administrativo'],
      ['Comunicação e Marketing','Assistente de Marketing e Projetos','D','FIXA','Administrativo'],
      ['Comunicação e Marketing','Coordenador de Comunicação','H','ORIENTADOR','Gestão Tática'],
      ['Comunicação e Marketing','Assessor de Comunicação','G','ORIENTADOR','Assessoramento'],
      ['Comunicação e Marketing','Analista de Comunicação III','F','FIXA','Administrativo'],
      ['Comunicação e Marketing','Analista de Comunicação II','E','FIXA','Administrativo'],
      ['Comunicação e Marketing','Analista de Comunicação I','D','FIXA','Administrativo'],
      ['Comunicação e Marketing','Assistente de Comunicação','C','FIXA','Administrativo'],
      ['Inovação e TI','Gerente de Inovação e TI','J','ORIENTADOR','Gestão Tática'],
      ['Inovação e TI','Coordenador de Inovação','H','ORIENTADOR','Gestão Tática'],
      ['Inovação e TI','Assessor de Inovação','G','ORIENTADOR','Assessoramento'],
      ['Inovação e TI','Analista de Processos e Requisitos','D','FIXA','Administrativo'],
      ['Inovação e TI','Coordenador de Infraestrutura e Serviços de TI','I','ORIENTADOR','Gestão Tática'],
      ['Inovação e TI','Analista de Suporte em TI II','E','FIXA','Administrativo'],
      ['Inovação e TI','Analista de Suporte em TI I','D','FIXA','Administrativo'],
      ['Inovação e TI','Assistente de TI','C','FIXA','Administrativo'],
      ['Monitoramento e Controle','Gerente de Monitoramento e Controle','J','ORIENTADOR','Gestão Tática'],
      ['Monitoramento e Controle','Coordenador de Monitoramento','H','ORIENTADOR','Gestão Tática'],
      ['Monitoramento e Controle','Analista de Monitoramento','D','FIXA','Administrativo'],
      ['Monitoramento e Controle','Assistente de Monitoramento','C','FIXA','Administrativo'],
      ['Monitoramento e Controle','Coordenador de Prestação de Contas','H','ORIENTADOR','Gestão Tática'],
      ['Monitoramento e Controle','Supervisor de Prestação de Contas','E','FIXA','Administrativo'],
      ['Monitoramento e Controle','Analista de Prestação de Contas','D','FIXA','Administrativo'],
      ['Monitoramento e Controle','Assistente de Prestação de Contas','C','FIXA','Administrativo'],
      ['Administrativo Financeiro','Gerente Administrativo-Financeiro','J','ORIENTADOR','Gestão Tática'],
      ['Administrativo Financeiro','Coordenador de Compras','H','ORIENTADOR','Gestão Tática'],
      ['Administrativo Financeiro','Supervisor de Compras','F','FIXA','Administrativo'],
      ['Administrativo Financeiro','Analista de Compras','D','FIXA','Administrativo'],
      ['Administrativo Financeiro','Assistente de Compras','C','FIXA','Administrativo'],
      ['Administrativo Financeiro','Coordenador de Contratos','H','ORIENTADOR','Gestão Tática'],
      ['Administrativo Financeiro','Analista de Contratos','E','FIXA','Administrativo'],
      ['Administrativo Financeiro','Coordenador de Controle Interno','H','ORIENTADOR','Gestão Tática'],
      ['Administrativo Financeiro','Analista de Controle Interno','D','FIXA','Administrativo'],
      ['Administrativo Financeiro','Assistente de Controle Interno','B','FIXA','Administrativo'],
      ['Administrativo Financeiro','Coordenador Financeiro','H','ORIENTADOR','Gestão Tática'],
      ['Administrativo Financeiro','Supervisor Financeiro','F','FIXA','Administrativo'],
      ['Administrativo Financeiro','Analista Financeiro','D','FIXA','Administrativo'],
      ['Administrativo Financeiro','Coordenador de Tesouraria','H','ORIENTADOR','Gestão Tática'],
      ['Administrativo Financeiro','Analista de Tesouraria','E','FIXA','Administrativo'],
      ['Administrativo Financeiro','Assistente de Tesouraria','D','FIXA','Administrativo'],
      ['Administrativo Financeiro','Auxiliar de Tesouraria','A','FIXA','Administrativo'],
      ['Administrativo Financeiro','Coordenador Administrativo-Financeiro','H','ORIENTADOR','Gestão Tática'],
      ['Administrativo Financeiro','Supervisor Administrativo-Financeiro','F','FIXA','Administrativo'],
      ['Administrativo Financeiro','Analista Administrativo III','E','FIXA','Administrativo'],
      ['Administrativo Financeiro','Analista Administrativo II','D','FIXA','Administrativo'],
      ['Administrativo Financeiro','Analista Administrativo I','C','FIXA','Administrativo'],
      ['Administrativo Financeiro','Secretário','D','FIXA','Administrativo'],
      ['Administrativo Financeiro','Assistente Administrativo','A','FIXA','Administrativo'],
      ['Administrativo Financeiro','Auxiliar Administrativo','PISO','FIXA','Administrativo'],
      ['Segurança e Infraestrutura','Gerente Segurança e Infraestrutura','I','ORIENTADOR','Gestão Tática'],
      ['Segurança e Infraestrutura','Coordenador de Infraestrutura','H','ORIENTADOR','Gestão Tática'],
      ['Segurança e Infraestrutura','Supervisor de Infraestrutura','E','FIXA','Administrativo'],
      ['Segurança e Infraestrutura','Especialista de Infraestrutura','F','FIXA','Administrativo'],
      ['Segurança e Infraestrutura','Técnico de Infraestrutura','E','FIXA','Administrativo'],
      ['Segurança e Infraestrutura','Técnico de Segurança do Trabalho','D','FIXA','Administrativo'],
      ['Segurança e Infraestrutura','Técnico de Conservação e Manutenção','C','FIXA','Administrativo'],
      ['Segurança e Infraestrutura','Assistente de Infraestrutura','D','FIXA','Administrativo'],
      ['Segurança e Infraestrutura','Assistente de Conservação e Manutenção','B','FIXA','Administrativo'],
      ['Segurança e Infraestrutura','Eletricista','B','FIXA','Administrativo'],
      ['Segurança e Infraestrutura','Auxiliar de Serviços Gerais','PISO','FIXA','Administrativo'],
      ['Segurança e Infraestrutura','Jardineiro','PISO','FIXA','Administrativo'],
      ['Gestão de Pessoas','Gerente de Pessoas','I','ORIENTADOR','Gestão Tática'],
      ['Gestão de Pessoas','Coordenador de Desenvolvimento Humano','G','ORIENTADOR','Gestão Tática'],
      ['Gestão de Pessoas','Analista de Desenvolvimento Humano','D','FIXA','Administrativo'],
      ['Gestão de Pessoas','Psicóloga Organizacional','D','FIXA','Administrativo'],
      ['Gestão de Pessoas','Assistente de Desenvolvimento Humano','B','FIXA','Administrativo'],
      ['Gestão de Pessoas','Coordenador de Departamento Pessoal','G','ORIENTADOR','Gestão Tática'],
      ['Gestão de Pessoas','Supervisor de Departamento Pessoal','E','FIXA','Administrativo'],
      ['Gestão de Pessoas','Analista de Departamento Pessoal','D','FIXA','Administrativo'],
      ['Gestão de Pessoas','Assistente de Departamento Pessoal','B','FIXA','Administrativo'],
      ['Articulação e Cidadania','Gerente de Articulação Institucional','I','ORIENTADOR','Gestão Tática'],
      ['Articulação e Cidadania','Assessor de Articulação','H','ORIENTADOR','Assessoramento'],
      ['Articulação e Cidadania','Assessor de Cidadania Cultural','H','ORIENTADOR','Assessoramento'],
      ['Articulação e Cidadania','Coordenador de Cidadania Cultural','H','ORIENTADOR','Gestão Tática'],
      ['Articulação e Cidadania','Coordenador de Direitos Humanos','H','ORIENTADOR','Gestão Tática'],
      ['Articulação e Cidadania','Supervisor de Cidadania Cultural','F','FIXA','Operacional'],
      ['Articulação e Cidadania','Assistente Social','D','FIXA','Operacional'],
      ['Articulação e Cidadania','Técnico de Cidadania Cultural','D','FIXA','Operacional'],
      ['Articulação e Cidadania','Psicólogo Social','D','FIXA','Operacional'],
      ['Articulação e Cidadania','Educador Social','C','FIXA','Operacional'],
      ['Articulação e Cidadania','Articulador Comunitário','C','FIXA','Operacional'],
      ['Ação Cultural e Produção','Gerente de Ação Cultural','I','ORIENTADOR','Gestão Tática'],
      ['Ação Cultural e Produção','Coordenador de Ação Cultural','H','ORIENTADOR','Gestão Tática'],
      ['Ação Cultural e Produção','Supervisor de Ação Cultural','F','FIXA','Operacional'],
      ['Ação Cultural e Produção','Assistente de Ação Cultural','C','FIXA','Operacional'],
      ['Ação Cultural e Produção','Auxiliar de Ação Cultural','A','FIXA','Operacional'],
      ['Ação Cultural e Produção','Coordenador de Produção','H','ORIENTADOR','Gestão Tática'],
      ['Ação Cultural e Produção','Supervisor de Produção','F','FIXA','Operacional'],
      ['Ação Cultural e Produção','Produtor Cultural','D','FIXA','Operacional'],
      ['Ação Cultural e Produção','Assistente de Produção','B','FIXA','Operacional'],
      ['Áreas Técnicas','Coordenador Técnico','H','ORIENTADOR','Gestão Tática'],
      ['Áreas Técnicas','Produtor Audiovisual','F','FIXA','Operacional'],
      ['Áreas Técnicas','Produtor de Palco','F','FIXA','Operacional'],
      ['Áreas Técnicas','Técnico de Teatro','E','FIXA','Operacional'],
      ['Áreas Técnicas','Editor de TV e Vídeo','E','FIXA','Operacional'],
      ['Áreas Técnicas','Técnico de Audiovisual','D','FIXA','Operacional'],
      ['Áreas Técnicas','Técnico de Cinema','D','FIXA','Operacional'],
      ['Áreas Técnicas','Técnico de Som','D','FIXA','Operacional'],
      ['Áreas Técnicas','Técnico de Luz','D','FIXA','Operacional'],
      ['Áreas Técnicas','Técnico de Palco','D','FIXA','Operacional'],
      ['Áreas Técnicas','Assistente de Técnica','C','FIXA','Operacional'],
      ['Áreas Técnicas','Auxiliar Técnico','B','FIXA','Operacional'],
      ['Áreas Técnicas','Planetarista','B','FIXA','Operacional'],
      ['Áreas Técnicas','Projecionista','B','FIXA','Operacional'],
      ['Áreas Técnicas','Camareiro','A','FIXA','Operacional'],
      ['Formação e Ação Educativa','Gerente de Formação','I','ORIENTADOR','Gestão Tática'],
      ['Formação e Ação Educativa','Coordenador de Programa de Laboratórios','I','ORIENTADOR','Gestão Tática'],
      ['Formação e Ação Educativa','Coordenador de Pesquisa e Desenvolvimento','I','ORIENTADOR','Gestão Tática'],
      ['Formação e Ação Educativa','Coordenador de Formação III','I','ORIENTADOR','Gestão Tática'],
      ['Formação e Ação Educativa','Coordenador de Formação II','H','ORIENTADOR','Gestão Tática'],
      ['Formação e Ação Educativa','Coordenador Pedagógico','G','ORIENTADOR','Gestão Tática'],
      ['Formação e Ação Educativa','Coordenador de Formação I','F','ORIENTADOR','Gestão Tática'],
      ['Formação e Ação Educativa','Coordenador de Formação em Artes Visuais','H','ORIENTADOR','Gestão Tática'],
      ['Formação e Ação Educativa','Coordenador de Formação em Audiovisual II','H','ORIENTADOR','Gestão Tática'],
      ['Formação e Ação Educativa','Coordenador de Formação em Audiovisual I','F','ORIENTADOR','Gestão Tática'],
      ['Formação e Ação Educativa','Coordenador de Formação em Cinema','H','ORIENTADOR','Gestão Tática'],
      ['Formação e Ação Educativa','Coordenador de Formação Patrimonial','G','ORIENTADOR','Gestão Tática'],
      ['Formação e Ação Educativa','Coordenador de Formação em Cultura Digital','F','ORIENTADOR','Gestão Tática'],
      ['Formação e Ação Educativa','Coordenador de Formação em Dança II','H','ORIENTADOR','Gestão Tática'],
      ['Formação e Ação Educativa','Coordenador de Formação em Dança I','F','ORIENTADOR','Gestão Tática'],
      ['Formação e Ação Educativa','Coordenador de Formação em Música II','H','ORIENTADOR','Gestão Tática'],
      ['Formação e Ação Educativa','Coordenador de Formação em Música I','F','ORIENTADOR','Gestão Tática'],
      ['Formação e Ação Educativa','Coordenador de Formação em Teatro II','H','ORIENTADOR','Gestão Tática'],
      ['Formação e Ação Educativa','Coordenador de Formação em Teatro I','F','ORIENTADOR','Gestão Tática'],
      ['Formação e Ação Educativa','Secretaria Escolar','E','FIXA','Operacional'],
      ['Formação e Ação Educativa','Supervisor Pedagógico II','F','FIXA','Operacional'],
      ['Formação e Ação Educativa','Supervisor Pedagógico I','D','FIXA','Operacional'],
      ['Formação e Ação Educativa','Analista de Formação','E','FIXA','Operacional'],
      ['Formação e Ação Educativa','Assistente de Formação','D','FIXA','Operacional'],
      ['Formação e Ação Educativa','Professor de Música','C','FIXA','Operacional'],
      ['Formação e Ação Educativa','Professor de Dança','C','FIXA','Operacional'],
      ['Formação e Ação Educativa','Professor de Teatro','C','FIXA','Operacional'],
      ['Formação e Ação Educativa','Professor de Cultura Digital','C','FIXA','Operacional'],
      ['Formação e Ação Educativa','Professor de Audiovisual','C','FIXA','Operacional'],
      ['Formação e Ação Educativa','Auxiliar Pedagógico','A','FIXA','Operacional'],
      ['Formação e Ação Educativa','Atendente Escolar','PISO','FIXA','Operacional'],
      ['Formação e Ação Educativa','Coordenador de Ação Educativa','G','ORIENTADOR','Gestão Tática'],
      ['Formação e Ação Educativa','Assessor de Ação Educativa','F','ORIENTADOR','Operacional'],
      ['Formação e Ação Educativa','Supervisor de Ação Educativa','E','FIXA','Operacional'],
      ['Formação e Ação Educativa','Mediador Cultural II','D','FIXA','Operacional'],
      ['Formação e Ação Educativa','Mediador Cultural I','C','FIXA','Operacional'],
      ['Formação e Ação Educativa','Mediador Ambiental','C','FIXA','Operacional'],
      ['Formação e Ação Educativa','Assistente de Ação Educativa','B','FIXA','Operacional'],
      ['Operação','Coordenador de Operação','H','ORIENTADOR','Gestão Tática'],
      ['Operação','Supervisor de Operação','E','FIXA','Operacional'],
      ['Operação','Supervisor de Bilheteria','E','FIXA','Operacional'],
      ['Operação','Recepcionista Bilíngue','D','FIXA','Operacional'],
      ['Operação','Técnico de Operação','D','FIXA','Operacional'],
      ['Operação','Assistente de Operação','C','FIXA','Operacional'],
      ['Operação','Auxiliar de Operação','A','FIXA','Operacional'],
      ['Operação','Bilheteiro','A','FIXA','Operacional'],
      ['Operação','Recepcionista','PISO','FIXA','Operacional'],
      ['Acervo e Patrimônio','Gerente de Museu','J','ORIENTADOR','Gestão Tática'],
      ['Acervo e Patrimônio','Coordenador de Museu','H','ORIENTADOR','Gestão Tática'],
      ['Acervo e Patrimônio','Coordenador de Conservação e Restauro','G','ORIENTADOR','Gestão Tática'],
      ['Acervo e Patrimônio','Coordenador de Pesquisa e Acervo','H','ORIENTADOR','Gestão Tática'],
      ['Acervo e Patrimônio','Supervisor de Museu','F','FIXA','Operacional'],
      ['Acervo e Patrimônio','Supervisor de Conservação e Restauro','F','FIXA','Operacional'],
      ['Acervo e Patrimônio','Supervisor de Pesquisa e Acervo','F','FIXA','Operacional'],
      ['Acervo e Patrimônio','Bibliotecário II','F','FIXA','Operacional'],
      ['Acervo e Patrimônio','Bibliotecário I','D','FIXA','Operacional'],
      ['Acervo e Patrimônio','Restaurador','F','FIXA','Operacional'],
      ['Acervo e Patrimônio','Museólogo','G','FIXA','Operacional'],
      ['Acervo e Patrimônio','Técnico de Conservação e Restauro','D','FIXA','Operacional'],
      ['Acervo e Patrimônio','Técnico de Pesquisa e Acervo','D','FIXA','Operacional'],
      ['Acervo e Patrimônio','Assistente de Pesquisa e Acervo','C','FIXA','Operacional'],
      ['Acervo e Patrimônio','Técnico de Biblioteca','B','FIXA','Operacional'],
      ['Acervo e Patrimônio','Atendente de Biblioteca','A','FIXA','Operacional'],
      ['Cinema e Audiovisual','Coordenador de Planetário','H','ORIENTADOR','Gestão Tática'],
      ['Cinema e Audiovisual','Coordenador de Audiovisual','H','ORIENTADOR','Gestão Tática'],
      ['Cinema e Audiovisual','Coordenador de Cinema','H','ORIENTADOR','Gestão Tática'],
      ['Cinema e Audiovisual','Supervisor de Cinema','F','FIXA','Operacional'],
      ['Cinema e Audiovisual','Supervisor de Teatro','F','FIXA','Operacional'],
      ['Esporte','Coordenador de Esporte e Lazer','H','ORIENTADOR','Gestão Tática'],
      ['Esporte','Educador Esportivo','F','FIXA','Operacional'],
      ['Esporte','Técnico Esportivo','E','FIXA','Operacional'],
      ['Esporte','Assistente Esportivo','D','FIXA','Operacional'],
      ['Esporte','Auxiliar Esportivo','B','FIXA','Operacional'],
      ['Gastronomia','Supervisor de Cozinha','F','FIXA','Operacional'],
      ['Gastronomia','Técnico de Cozinha','E','FIXA','Operacional'],
      ['Gastronomia','Nutricionista','D','FIXA','Operacional'],
      ['Gastronomia','Assistente de Cozinha','D','FIXA','Operacional'],
      ['Gastronomia','Auxiliar de Cozinha','B','FIXA','Operacional'],
      ['Gastronomia','Horticultor','B','FIXA','Operacional'],
      ['Gastronomia','Auxiliar de Estoque','A','FIXA','Operacional']
    ];
    return rows.map(function(r, i) {
      var n = String(i + 1);
      while (n.length < 3) n = '0' + n;
      return { id: 'pccs_' + n, area: r[0], nome: r[1], classe: r[2], tipoClasse: r[3], grupo: r[4], ativo: true };
    });
  }

  function _obterPCCS() {
    var d = readJSON(_PCCS_FILE);
    if (!d || !d.tabelaSalarial || !d.tabelaSalarial.length) {
      d = {
        parametros: {
          crescimentoStep: 0.075, amplitudeFaixa: 0.3355, crescimentoMedioClasse: 0.2178,
          pisoFaixaFixa: 1747.16, pisoOrientador: 1584.74, anoReferencia: 2025,
          atualizadoEm: new Date().toISOString()
        },
        tabelaSalarial: _pccsTabela(),
        cargos: _pccsCargosDefault()
      };
      writeJSON(_PCCS_FILE, d);
    }
    return d;
  }

  function _aplicarReajustePCCS(percentual) {
    var pct = parseFloat(percentual);
    if (isNaN(pct) || pct <= 0) return { ok: false, msg: 'Percentual inválido' };
    var fator = 1 + pct / 100;
    var d = _obterPCCS();
    d.tabelaSalarial = d.tabelaSalarial.map(function(row) {
      var r = JSON.parse(JSON.stringify(row));
      r.steps = r.steps.map(function(v) { return Math.round(v * fator * 100) / 100; });
      if (r.valorBase) r.valorBase = Math.round(r.valorBase * fator * 100) / 100;
      return r;
    });
    d.parametros = d.parametros || {};
    d.parametros.ultimoReajuste   = pct;
    d.parametros.ultimoReajusteEm = new Date().toISOString();
    d.parametros.atualizadoEm     = new Date().toISOString();
    writeJSON(_PCCS_FILE, d);
    return { ok: true };
  }

  function _salvarTabelaRowPCCS(rowData) {
    var d = _obterPCCS();
    var idx = -1;
    for (var i = 0; i < d.tabelaSalarial.length; i++) {
      if (d.tabelaSalarial[i].tipo === rowData.tipo && d.tabelaSalarial[i].classe === rowData.classe) {
        idx = i; break;
      }
    }
    if (idx >= 0) d.tabelaSalarial[idx] = rowData;
    else d.tabelaSalarial.push(rowData);
    writeJSON(_PCCS_FILE, d);
    return { ok: true };
  }

  function _obterCargosPCCS() {
    var d = _obterPCCS();
    return (d.cargos || []).filter(function(c) { return c.ativo !== false; });
  }

  // ── Simulação de folha — lógica privada ──────────────────────────

  function _simularFolha(dados) {
    var salario    = parseFloat(dados.salarioBase) || 0;
    var vinculo    = dados.vinculo || 'CLT';
    var beneficios = parseFloat(dados.beneficios) || 0;
    var adicional  = parseFloat(dados.adicional)  || 0;
    var res = {
      salarioBase: salario, beneficios: beneficios, adicional: adicional,
      inss: 0, irrf: 0, fgts: 0, encargosPatronais: 0,
      provisao13: 0, provisaoFerias: 0, descontoTotal: 0,
      custoTotal: 0, liquidoColaborador: 0
    };
    if (vinculo === 'CLT') {
      var pf      = ParametrosFiscaisRH.obter();
      var bruto   = salario + adicional;
      var inss    = ParametrosFiscaisRH.calcularINSS(bruto);
      var baseIR  = bruto - inss;
      var irrf    = ParametrosFiscaisRH.calcularIRRF(baseIR);
      var fgts    = Math.round(bruto * pf.fgts.aliquota * 100) / 100;
      var encarg  = Math.round(bruto * pf.encargos.patronalComFGTS * 100) / 100;
      var prov13  = Math.round((bruto / 12) * 100) / 100;
      var provFer = Math.round((bruto * 4 / 3 / 12) * 100) / 100;
      res.inss = inss; res.irrf = irrf; res.fgts = fgts;
      res.encargosPatronais  = encarg;
      res.provisao13         = prov13;
      res.provisaoFerias     = provFer;
      res.descontoTotal      = Math.round((inss + irrf) * 100) / 100;
      res.liquidoColaborador = Math.round((bruto - inss - irrf + beneficios) * 100) / 100;
      res.custoTotal         = Math.round((bruto + encarg + prov13 + provFer + beneficios) * 100) / 100;
    } else if (vinculo === 'PJ') {
      res.liquidoColaborador = Math.round((salario + adicional + beneficios) * 100) / 100;
      res.custoTotal         = res.liquidoColaborador;
    } else {
      res.liquidoColaborador = Math.round((salario + beneficios) * 100) / 100;
      res.custoTotal         = res.liquidoColaborador;
    }
    return res;
  }

  function _simularFolhaDetalhada(dados) {
    var salario   = parseFloat(dados.salarioBase) || 0;
    var vinculo   = dados.vinculo || 'CLT';
    var adicional = parseFloat(dados.adicional) || 0;
    var benefs = {
      planoSaude:         parseFloat(dados.planoSaude)         || 0,
      planoOdontologico:  parseFloat(dados.planoOdontologico)  || 0,
      valeAlimentacao:    parseFloat(dados.valeAlimentacao)    || 0,
      valeRefeicao:       parseFloat(dados.valeRefeicao)       || 0,
      valeTransporte:     parseFloat(dados.valeTransporte)     || 0,
      auxilioCombustivel: parseFloat(dados.auxilioCombustivel) || 0,
      auxilioHomeOffice:  parseFloat(dados.auxilioHomeOffice)  || 0,
      outrosBeneficios:   parseFloat(dados.outrosBeneficios)   || 0
    };
    var totalBeneficios = Object.keys(benefs).reduce(function(acc, k) { return acc + benefs[k]; }, 0);
    totalBeneficios = Math.round(totalBeneficios * 100) / 100;
    var res = {
      salarioBase: salario, adicional: adicional,
      beneficios: benefs, totalBeneficios: totalBeneficios,
      inss: 0, irrf: 0, fgts: 0, encargosPatronais: 0,
      provisao13: 0, provisaoFerias: 0, descontoTotal: 0,
      custoTotal: 0, liquidoColaborador: 0
    };
    if (vinculo === 'CLT') {
      var pf      = ParametrosFiscaisRH.obter();
      var bruto   = salario + adicional;
      var inss    = ParametrosFiscaisRH.calcularINSS(bruto);
      var baseIR  = bruto - inss;
      var irrf    = ParametrosFiscaisRH.calcularIRRF(baseIR);
      var fgts    = Math.round(bruto * pf.fgts.aliquota * 100) / 100;
      var encarg  = Math.round(bruto * pf.encargos.patronalComFGTS * 100) / 100;
      var prov13  = Math.round((bruto / 12) * 100) / 100;
      var provFer = Math.round((bruto * 4 / 3 / 12) * 100) / 100;
      res.inss = inss; res.irrf = irrf; res.fgts = fgts;
      res.encargosPatronais  = encarg;
      res.provisao13         = prov13;
      res.provisaoFerias     = provFer;
      res.descontoTotal      = Math.round((inss + irrf) * 100) / 100;
      res.liquidoColaborador = Math.round((bruto - inss - irrf + totalBeneficios) * 100) / 100;
      res.custoTotal         = Math.round((bruto + encarg + prov13 + provFer + totalBeneficios) * 100) / 100;
    } else if (vinculo === 'PJ') {
      res.liquidoColaborador = Math.round((salario + adicional + totalBeneficios) * 100) / 100;
      res.custoTotal         = res.liquidoColaborador;
    } else {
      res.liquidoColaborador = Math.round((salario + totalBeneficios) * 100) / 100;
      res.custoTotal         = res.liquidoColaborador;
    }
    return res;
  }

  // ── Indicadores e diversidade — lógica privada ───────────────────

  function _indicadoresRH() {
    var funcionarios = readJSON('funcionarios.json') || [];
    var historico    = readJSON('rh_historico.json') || [];
    var folha        = readJSON('rh_folha.json') || [];
    var anoAtual     = new Date().getFullYear();
    var d            = new Date();
    var mesFolha     = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    var total = funcionarios.length, ativos = 0, emFerias = 0, afastados = 0, inativos = 0;
    var porSetor = {}, porVinculo = {};
    funcionarios.forEach(function(f) {
      var st = f.status || 'Ativo';
      if (st === 'Ativo') ativos++;
      else if (st === 'Férias') emFerias++;
      else if (st === 'Afastado') afastados++;
      else inativos++;
      var setor = f.setor || 'Não informado';
      porSetor[setor] = (porSetor[setor] || 0) + 1;
      var v = f.vinculo || 'Não informado';
      porVinculo[v] = (porVinculo[v] || 0) + 1;
    });
    var desligAno = historico.filter(function(h) {
      return h.tipo === 'desligamento' && String(h.dataEvento || '').startsWith(String(anoAtual));
    }).length;
    var admAno = historico.filter(function(h) {
      return h.tipo === 'admissao' && String(h.dataEvento || '').startsWith(String(anoAtual));
    }).length;
    var mediaAtivos = Math.max(total, 1);
    var turnover    = Math.round((desligAno / mediaAtivos) * 100);
    var folhaMes    = folha.filter(function(f) { return f.mes === mesFolha; });
    var custoFolha  = folhaMes.reduce(function(acc, f) { return acc + (parseFloat(f.custoTotal) || 0); }, 0);
    return {
      total: total, ativos: ativos, emFerias: emFerias,
      afastados: afastados, inativos: inativos,
      porSetor: porSetor, porVinculo: porVinculo,
      turnover: turnover, admissoesAno: admAno, desligamentosAno: desligAno,
      custoFolhaMes: Math.round(custoFolha * 100) / 100
    };
  }

  function _diversidadeRH() {
    var perfis = readJSON('rh_perfil_social.json') || [];
    var total  = perfis.length;
    if (total === 0) return { total: 0, racaCor: {}, genero: {}, escolaridade: {}, pcd: 0, pctPcd: 0, porEstado: {} };
    var racaCor = {}, genero = {}, escolaridade = {}, porEstado = {}, pcd = 0;
    perfis.forEach(function(p) {
      var r = p.racaCor || 'Não declarado';
      racaCor[r] = (racaCor[r] || 0) + 1;
      var g = p.genero || 'Não declarado';
      genero[g] = (genero[g] || 0) + 1;
      var e = p.escolaridade || 'Não informado';
      escolaridade[e] = (escolaridade[e] || 0) + 1;
      var est = p.estado || 'Não informado';
      porEstado[est] = (porEstado[est] || 0) + 1;
      if (p.pcd && p.pcd !== 'Não' && p.pcd !== 'Prefiro não declarar') pcd++;
    });
    return {
      total: total, racaCor: racaCor, genero: genero,
      escolaridade: escolaridade, pcd: pcd,
      pctPcd: Math.round((pcd / total) * 100),
      porEstado: porEstado
    };
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
