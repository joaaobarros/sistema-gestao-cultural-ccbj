/**
 * @file mod_relatorios.gs
 * @layer backend/modules
 * @description Geração de documentos, relatórios CODIP e delegadores do domínio Contratos.
 *
 * FASE 5 (concluída): CRUD migrado para ContratoRepository.
 * FASE 7 (concluída): Analytics comparativo migrado para ContratoAnalyticsService.
 * Funções globais abaixo são delegadores — mantidos para retrocompatibilidade.
 *
 * @responsibility Geração de documentos Drive (PPT/DOC/PDF), relatórios CODIP,
 *                reescrita de descrições via IA, parseMoeda.
 * @depends modules/contratos/contrato_repository.gs (ContratoRepository),
 *          modules/contratos/contrato_analytics_service.gs (ContratoAnalyticsService),
 *          core/utils.gs (_getSheet, gerarId, registrarLog)
 */
// ============================================================
// mod_relatorios.gs — Analytics, CODIP, Documentos
// CRUD de contratos delegado para ContratoRepository (Fase 5)
// ============================================================

// ==============================
// GERAÇÃO DE DOCUMENTOS — delega a DocumentoService
// ==============================

function gerarDocumentoDrive(conteudo)              { return DocumentoService.gerar(conteudo); }
function mapearGraficosPorSecao(secoes, graficos)   { return DocumentoService._mapearGraficosPorSecao ? DocumentoService._mapearGraficosPorSecao(secoes, graficos) : {}; }
function mapearGraficosIA(secoes, graficos)         { return IAService.mapearGraficos(secoes, graficos); }

// ==============================
// CODIP — delega a CodipService
// ==============================

function _salvarCamposCODIP(idReserva, dados)  { return CodipService.salvarCampos(idReserva, dados); }
function obterMetricasCODIP()                  { return CodipService.obterMetricas(); }
function obterRelatoriosCODIP()                { return CodipService.obterRelatorios(); }
function reescreverDescricaoAcaoIA(texto, setor) { return IAService.reescreverDescricaoAcao(texto, setor); }

// ==============================
// AGREGADOR
// ==============================

// ── Delegadores para ContratoRepository ─────────────────────────────────────
// Mantidos para retrocompatibilidade com funções de analytics abaixo.

function obterDadosContratos()        { return ContratoRepository.obterDados(); }

// ==============================
// CONTRATOS
// ==============================

function obterContratos()             { return ContratoRepository.listar(); }
function obterContratoPorId(id)       { return ContratoRepository.buscarPorId(id); }

function salvarContrato(dados, email)         { return ContratoRepository.salvar(dados, email); }
function excluirContrato(id, email)           { return ContratoRepository.excluir(id, email); }
function atualizarContrato(id, campos, email) { return ContratoRepository.atualizar(id, campos, email); }

// ==============================
// METAS — delegadores
// ==============================

function obterMetas()                        { return ContratoRepository.listarMetas(); }
function obterMetaPorId(id)                  { return ContratoRepository.buscarMetaPorId(id); }
function salvarMeta(dados, email)            { return ContratoRepository.salvarMeta(dados, email); }
function excluirMeta(id, email)              { return ContratoRepository.excluirMeta(id, email); }
function atualizarMeta(id, campos, email)    { return ContratoRepository.atualizarMeta(id, campos, email); }

// ==============================
// INDICADORES — delegadores
// ==============================

function obterIndicadores()                     { return ContratoRepository.listarIndicadores(); }
function obterIndicadorPorId(id)                { return ContratoRepository.buscarIndicadorPorId(id); }
function salvarIndicador(dados, email)           { return ContratoRepository.salvarIndicador(dados, email); }
function excluirIndicador(id, email)             { return ContratoRepository.excluirIndicador(id, email); }
function atualizarIndicador(id, campos, email)   { return ContratoRepository.atualizarIndicador(id, campos, email); }

// ==============================
// RUBRICAS — delegadores
// ==============================

function obterRubricas()                      { return ContratoRepository.listarRubricas(); }
function obterRubricaPorId(id)                { return ContratoRepository.buscarRubricaPorId(id); }

function salvarRubrica(dados, email)                    { return ContratoRepository.salvarRubrica(dados, email); }
function listarMemoriaRubrica(idRubrica)               { return ContratoRepository.listarMemoriaRubrica(idRubrica); }
function obterMemoriaRubrica(idRubrica)                { return ContratoRepository.obterMemoriaRubrica(idRubrica); }
function obterHistoricoRubrica(idRubrica)              { return ContratoRepository.obterHistoricoRubrica(idRubrica); }
function excluirRubrica(id, email)                     { return ContratoRepository.excluirRubrica(id, email); }
function atualizarRubrica(id, campos, email)           { return ContratoRepository.atualizarRubrica(id, campos, email); }
function adicionarItemMemoriaRubrica(dados, email)     { return ContratoRepository.adicionarItemMemoria(dados, email); }
function calcularValorRubrica(idRubrica)               { return ContratoRepository.calcularValorRubrica(idRubrica); }
function atualizarValorRubrica(idRubrica)              { return ContratoRepository.atualizarValorRubrica(idRubrica); }
function criarSnapshotContrato(idContrato, email)      { return ContratoRepository.criarSnapshot(idContrato, email); }
function obterHistoricoContrato(idContrato)            { return ContratoRepository.obterHistoricoContrato(idContrato); }

function compararVersoesContrato(idContrato, v1, v2)          { return ContratoAnalyticsService.compararVersoes(idContrato, v1, v2); }
function compararVersoesContratoDetalhado(idContrato, v1, v2)  { return ContratoAnalyticsService.compararVersoesDetalhado(idContrato, v1, v2); }
function obterRankingImpactoRubricas(idContrato, v1, v2)       { return ContratoAnalyticsService.rankingImpacto(idContrato, v1, v2); }
function gerarHeatmapAlteracoes(idContrato, v1, v2)            { return ContratoAnalyticsService.heatmapAlteracoes(idContrato, v1, v2); }
function gerarAlertasContrato(idContrato, v1, v2)              { return ContratoAnalyticsService.alertas(idContrato, v1, v2); }
function obterDashboardComparativoContrato(idContrato, v1, v2) { return ContratoAnalyticsService.dashboard(idContrato, v1, v2); }
function obterTimelineContrato(idContrato)                     { return ContratoAnalyticsService.timeline(idContrato); }
function salvarVersaoContrato(idContrato, email)               { return ContratoRepository.salvarVersao(idContrato, email); }


// ─────────────────────────────────────────────────────────────
// BLOCO: parseMoeda — conversão robusta de moeda pt-BR → number
// ─────────────────────────────────────────────────────────────

/**
 * Converte string monetária no formato pt-BR para number.
 * Aceita: "1.200,50" | "1200,50" | "1200.50" | 1200 | "R$ 1.200,50"
 * Nunca retorna NaN — retorna 0 em caso de entrada inválida.
 *
 * @param {string|number} valor
 * @returns {number}
 */
function parseMoeda(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;
  if (typeof valor === 'number') return isNaN(valor) ? 0 : valor;

  var str = String(valor)
    .replace(/R\$\s*/gi, '')
    .replace(/\s/g, '')
    .trim();

  // Formato pt-BR: "1.000,50" → remove pontos de milhar, vírgula vira ponto
  if (str.includes(',')) {
    str = str.replace(/\./g, '').replace(',', '.');
  }

  var resultado = parseFloat(str);

  if (isNaN(resultado)) {
    Logger.warn('relatorios', 'parseMoeda: não converteu "' + valor + '" → 0');
    return 0;
  }

  return resultado;
}