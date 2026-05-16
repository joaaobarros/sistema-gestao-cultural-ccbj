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
// DASHBOARD
// ==============================

function obterMetricasDashboard(dataInicio, dataFim, filtroSala, filtroSetor) {
  try {
    const abaReservas = _getSheet("Reservas");
    const abaItens = _getSheet("Itens");
    const abaLogs = _getSheet("LogAcessos");
    const porDiaSemana = {
      0: "Domingo",
      1: "Segunda",
      2: "Terça",
      3: "Quarta",
      4: "Quinta",
      5: "Sexta",
      6: "Sábado",
    };
    const contagemDias = {};
    const contagemMeses = {};
    const contagemHoras = {};
    const temposPorSala = {};
    const temposPorItem = {};

    const parseFiltro = (str) => {
      if (!str) return null;
      const p = str.split("-");
      if (p.length === 3) {
        const d = new Date(p[0], p[1] - 1, p[2]);
        d.setHours(0, 0, 0, 0);
        return d;
      }
      return null;
    };
    const filtroInicio = parseFiltro(dataInicio);
    const filtroFim = parseFiltro(dataFim);
    if (filtroFim) filtroFim.setHours(23, 59, 59, 999);
    const filtroSalaStr = String(filtroSala || "").trim();
    const filtroSetorStr = String(filtroSetor || "").trim();

    const todasReservas =
      abaReservas && abaReservas.getLastRow() > 1
        ? abaReservas
            .getRange(2, 1, abaReservas.getLastRow() - 1, 16)
            .getValues()
        : [];

    const reservas = todasReservas.filter((r) => {
      if (filtroSalaStr && String(r[4]).trim() !== filtroSalaStr) return false;
      if (filtroSetorStr && String(r[9]).trim() !== filtroSetorStr)
        return false;
      if (!filtroInicio && !filtroFim) return true;
      try {
        const raw = r[1];
        let d;
        if (raw instanceof Date) {
          d = new Date(raw);
        } else {
          const str = String(raw || "").trim();
          if (str.includes("/")) {
            const p = str.split("/");
            d = new Date(p[2], p[1] - 1, p[0]);
          } else if (str.includes("-")) {
            d = new Date(str);
          }
        }
        if (!d || isNaN(d.getTime())) return true;
        d.setHours(0, 0, 0, 0);
        if (filtroInicio && d < filtroInicio) return false;
        if (filtroFim && d > filtroFim) return false;
        return true;
      } catch (e) {
        return true;
      }
    });

    let total = 0,
      confirmadas = 0,
      canceladas = 0;
    const porSala = {},
      porSetor = {},
      porTurno = {},
      porMes = {};
    const cancelPorSala = {},
      cancelPorSetor = {};
    const contagemItens = {};

    reservas.forEach((r) => {
      total++;
      const status = String(r[13] || "").toUpperCase();
      const sala = String(r[4] || "Não informado");
      const setor = String(r[9] || "Não informado");
      const turno = String(r[5] || "Não informado");

      porSala[sala] = (porSala[sala] || 0) + 1;
      porSetor[setor] = (porSetor[setor] || 0) + 1;
      porTurno[turno] = (porTurno[turno] || 0) + 1;

      if (status === STATUS_RESERVA.CONFIRMADA) confirmadas++;
      if (status === STATUS_RESERVA.CANCELADA) {
        canceladas++;
        cancelPorSala[sala] = (cancelPorSala[sala] || 0) + 1;
        cancelPorSetor[setor] = (cancelPorSetor[setor] || 0) + 1;
      }

      const itensStr = String(r[12] || "");
      if (itensStr && itensStr !== "Nenhum") {
        itensStr.split(/[|]/).forEach((i) => {
          const semFixo = i.trim().replace(/\s*\(fixo\)\s*/gi, "");
          const p = semFixo.split("x ");
          const qtd = Number(p[0]) || 0;
          const nome = (p[1] || "").trim();
          if (nome && qtd > 0)
            contagemItens[nome] = (contagemItens[nome] || 0) + qtd;
        });
      }

      try {
        const raw = r[1];
        let dataObj;
        if (raw instanceof Date) {
          dataObj = raw;
        } else {
          const str = String(raw || "").trim();
          if (str.includes("/")) {
            const p = str.split("/");
            dataObj = new Date(p[2], p[1] - 1, p[0]);
          }
        }
        if (dataObj && !isNaN(dataObj.getTime())) {
          const chave = `${dataObj.getFullYear()}-${String(dataObj.getMonth() + 1).padStart(2, "0")}`;
          porMes[chave] = (porMes[chave] || 0) + 1;
        }
      } catch (e) {}

      try {
        const raw = r[1];
        let d;
        if (raw instanceof Date) {
          d = new Date(raw);
        } else {
          const str = String(raw || "").trim();
          if (str.includes("/")) {
            const p = str.split("/");
            d = new Date(p[2], p[1] - 1, p[0]);
          } else if (str.includes("-")) {
            d = new Date(str);
          }
        }
        if (d && !isNaN(d.getTime())) {
          const nomeDia = porDiaSemana[d.getDay()];
          const nomeMesR =
            [
              "Janeiro",
              "Fevereiro",
              "Março",
              "Abril",
              "Maio",
              "Junho",
              "Julho",
              "Agosto",
              "Setembro",
              "Outubro",
              "Novembro",
              "Dezembro",
            ][d.getMonth()] +
            "/" +
            d.getFullYear();
          contagemDias[nomeDia] = (contagemDias[nomeDia] || 0) + 1;
          contagemMeses[nomeMesR] = (contagemMeses[nomeMesR] || 0) + 1;
        }
      } catch (e) {}

      const _toMinH = (v) => {
        if (v instanceof Date) return v.getHours() * 60 + v.getMinutes();
        const s = String(v || "").trim();
        if (!s.includes(":")) return null;
        const p = s.split(":");
        return parseInt(p[0]) * 60 + parseInt(p[1]);
      };
      const _iniH = _toMinH(r[2]),
        _terH = _toMinH(r[3]);
      if (_iniH !== null && _terH !== null && _terH > _iniH) {
        const _h1 = Math.floor(_iniH / 60),
          _h2 = Math.ceil(_terH / 60);
        for (let _hh = _h1; _hh < _h2; _hh++) {
          const _hStr = String(_hh).padStart(2, "0") + "h";
          contagemHoras[_hStr] = (contagemHoras[_hStr] || 0) + 1;
        }
      }

      const calcMinutos = (ini, ter) => {
        const toMin = (v) => {
          if (v instanceof Date) return v.getHours() * 60 + v.getMinutes();
          const str = String(v || "").trim();
          if (!str.includes(":")) return null;
          const p = str.split(":");
          return parseInt(p[0]) * 60 + parseInt(p[1]);
        };
        const i = toMin(ini),
          t = toMin(ter);
        return i !== null && t !== null && t > i ? t - i : null;
      };

      const mins = calcMinutos(r[2], r[3]);
      if (mins !== null) {
        const sala = String(r[4] || "").trim();
        if (sala) {
          if (!temposPorSala[sala]) temposPorSala[sala] = [];
          temposPorSala[sala].push(mins);
        }
        const itensStr = String(r[12] || "");
        if (itensStr && itensStr !== "Nenhum") {
          itensStr.split(/[|]/).forEach((i) => {
            const semFixo = i.trim().replace(/\s*\(fixo\)\s*/gi, "");
            const p = semFixo.split("x ");
            const nome = (p[1] || "").trim();
            if (nome) {
              if (!temposPorItem[nome]) temposPorItem[nome] = [];
              temposPorItem[nome].push(mins);
            }
          });
        }
      }
    });

    const top5Salas = Object.entries(porSala)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const top5Setores = Object.entries(porSetor)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const ultimos6Meses = Object.entries(porMes).sort().slice(-6);
    const cancelamentosPorSala = Object.entries(cancelPorSala)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const cancelamentosPorSetor = Object.entries(cancelPorSetor)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const topItens = Object.entries(contagemItens)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const ordemDias = [
      "Segunda",
      "Terça",
      "Quarta",
      "Quinta",
      "Sexta",
      "Sábado",
      "Domingo",
    ];
    const diasSemana = ordemDias.map((d) => [d, contagemDias[d] || 0]);
    const mesesAno = Object.entries(contagemMeses)
      .sort((a, b) => {
        const [mA, yA] = a[0].split("/");
        const [mB, yB] = b[0].split("/");
        const meses = [
          "Janeiro",
          "Fevereiro",
          "Março",
          "Abril",
          "Maio",
          "Junho",
          "Julho",
          "Agosto",
          "Setembro",
          "Outubro",
          "Novembro",
          "Dezembro",
        ];
        return Number(yA) - Number(yB) || meses.indexOf(mA) - meses.indexOf(mB);
      })
      .filter(([, v]) => v > 0);
    const horasPico = Object.entries(contagemHoras).sort(
      (a, b) =>
        parseInt(a[0].replace("h", "")) - parseInt(b[0].replace("h", "")),
    );

    const mediaMin = (arr) =>
      arr.length > 0
        ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
        : 0;
    const mediaOcupacaoPorSala = Object.entries(temposPorSala)
      .map(([sala, arr]) => [sala, mediaMin(arr), arr.length])
      .sort((a, b) => b[2] - a[2])
      .slice(0, 6);
    const mediaUsoItens = Object.entries(temposPorItem)
      .map(([nome, arr]) => [nome, mediaMin(arr), arr.length])
      .sort((a, b) => b[2] - a[2])
      .slice(0, 6);

    let habilitadas = 0;
    reservas.forEach((r) => {
      if (String(r[13] || "").toUpperCase() === STATUS_RESERVA.HABILITADA) habilitadas++;
    });

    let solPendentes = 0,
      solAprovadas = 0,
      solRecusadas = 0;
    try {
      const abaSol = _getSheet("Solicitacoes");
      if (abaSol && abaSol.getLastRow() > 1) {
        abaSol
          .getRange(2, 1, abaSol.getLastRow() - 1, 9)
          .getValues()
          .forEach((r) => {
            const st = String(r[8] || "").toUpperCase();
            if (st === "PENDENTE") solPendentes++;
            else if (st === "APROVADO") solAprovadas++;
            else if (st === "RECUSADO") solRecusadas++;
          });
      }
    } catch (e) {}

    let itensDisponiveis = 0,
      itensFixados = 0;
    if (abaItens && abaItens.getLastRow() > 1) {
      const itens = abaItens
        .getRange(2, 1, abaItens.getLastRow() - 1, 5)
        .getValues();
      itens.forEach((i) => {
        itensDisponiveis += Number(i[3] || 0);
        try {
          const mapa = JSON.parse(String(i[4] || "{}"));
          itensFixados += Object.values(mapa).reduce(
            (a, v) => a + Number(v),
            0,
          );
        } catch (e) {}
      });
    }

    let acessosUnicos30d = 0;
    if (abaLogs && abaLogs.getLastRow() > 1) {
      const logs = abaLogs
        .getRange(2, 1, abaLogs.getLastRow() - 1, 3)
        .getValues();
      const limite = new Date();
      limite.setDate(limite.getDate() - 30);
      const emailsVistos = new Set();
      logs.forEach((l) => {
        try {
          if (new Date(l[0]) >= limite) emailsVistos.add(l[1]);
        } catch (e) {}
      });
      acessosUnicos30d = emailsVistos.size;
    }

    let codip = {
      totalEstimado: 0,
      totalReal: 0,
      totalRegistros: 0,
      taxaPresenca: 0,
    };
    try {
      const abaCodip = _getSheet("RelatoriosCODIP");
      const dataInicioObj = dataInicio ? new Date(dataInicio) : null;
      const dataFimObj = dataFim ? new Date(dataFim) : null;
      if (abaCodip && abaCodip.getLastRow() > 1) {
        const dadosCodip = abaCodip
          .getRange(2, 1, abaCodip.getLastRow() - 1, 34)
          .getValues();
        dadosCodip.forEach((linha) => {
          const dataRegistro = new Date(linha[33]);
          if (dataInicioObj && dataRegistro < dataInicioObj) return;
          if (dataFimObj && dataRegistro > dataFimObj) return;
          const estimado = Number(linha[13] || 0);
          codip.totalEstimado += estimado;
          codip.totalReal += estimado;
        });
        codip.totalRegistros = dadosCodip.length;
        codip.taxaPresenca =
          codip.totalEstimado > 0
            ? Math.round((codip.totalReal / codip.totalEstimado) * 100)
            : 0;
      }
    } catch (e) {
      Logger.error('metrics', 'Erro CODIP dashboard', String(e));
    }

    return {
      total,
      confirmadas,
      canceladas,
      taxaCancelamento: total > 0 ? Math.round((canceladas / total) * 100) : 0,
      porSalaTotal: porSala,
      porSetor,
      porTurno,
      top5Salas,
      top5Setores,
      ultimos6Meses,
      cancelamentosPorSala,
      cancelamentosPorSetor,
      topItens,
      itensDisponiveis,
      itensFixados,
      acessosUnicos30d,
      diasSemana,
      mesesAno,
      mediaOcupacaoPorSala,
      mediaUsoItens,
      horasPico,
      habilitadas,
      solPendentes,
      solAprovadas,
      solRecusadas,
      codip,
    };
  } catch (e) {
    Logger.error('metrics', 'Erro em obterMetricasDashboard', e.message);
    throw new Error(e.message);
  }
}

function obterDadosGraficoReservas() {
  try {
    const aba = _getSheet("Reservas");
    if (!aba || aba.getLastRow() < 2)
      return { labels: [], valores: [], tipo: "bar", titulo: "Reservas" };
    const dados = aba.getRange(2, 1, aba.getLastRow() - 1, 16).getValues();
    const contagem = {};
    dados.forEach((r) => {
      if (String(r[13] || "").toUpperCase() === STATUS_RESERVA.CANCELADA) return;
      const sala = String(r[4] || "").trim();
      if (sala) contagem[sala] = (contagem[sala] || 0) + 1;
    });
    const mapaSalas = obterMapaSalas();
    const sorted = Object.entries(contagem)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    return {
      labels: sorted.map(([id]) => mapaSalas[id] || id),
      valores: sorted.map(([, v]) => v),
      tipo: "bar",
      titulo: "Reservas por Espaço",
    };
  } catch (e) {
    Logger.error('metrics', 'Erro em obterDadosGraficoReservas', e.message);
    return { labels: [], valores: [], tipo: "bar", titulo: "Reservas" };
  }
}

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

