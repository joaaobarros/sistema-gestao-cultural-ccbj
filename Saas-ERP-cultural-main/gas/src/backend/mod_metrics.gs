/**
 * @file mod_metrics.gs
 * @layer backend/modules
 * @description Cálculo de métricas de ocupação e KPIs do dashboard.
 *
 * FASE 8 (concluída): funções de IA migradas para IAService (core/services/ia_service.gs).
 * Funções globais de IA abaixo são delegadores — mantidos para retrocompatibilidade.
 *
 * @responsibility obterMetricasDashboard, obterDadosGraficoReservas.
 * @depends core/services/ia_service.gs (IAService), core/utils.gs (_getSheet)
 */
// ============================================================
// mod_metrics.gs
// Dashboard, métricas, IA
// ============================================================

// ==============================
// DASHBOARD — delegam a MetricsEngine
// ==============================

function obterMetricasDashboard(dataInicio, dataFim, filtroSala, filtroSetor) {
  return MetricsEngine.obterDashboard(dataInicio, dataFim, filtroSala, filtroSetor);
}
function obterDadosGraficoReservas() { return MetricsEngine.obterGraficoReservas(); }

// ==============================
// INTELIGÊNCIA ARTIFICIAL — delegadores para IAService
// ==============================

function chamarIA(prompt)                  { return IAService.chamar(prompt); }
function parsearJsonIA(resposta)           { return IAService.parsearJson(resposta); }
function gerarRelatorioIA(filtros)         { return IAService.gerarRelatorio(filtros); }
function perguntarIA(pergunta)             { return IAService.perguntar(pergunta); }
function analisarDashboardIA(metricas)     { return IAService.analisarDashboard(metricas); }
function sugerirReservaIAComDados(desc)    { return IAService.sugerirReservaComDados(desc); }
function encontrarMelhorAgenda(d, s, r)    { return IAService._encontrarMelhorAgenda ? IAService._encontrarMelhorAgenda(d, s, r) : []; }

function sugerirReservaIA(desc)            { return IAService.sugerirReservaComDados(desc); }

