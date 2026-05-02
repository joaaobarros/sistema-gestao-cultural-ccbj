/**
 * @file mod_metrics.gs
 * @layer backend/modules
 * @description Cálculo de métricas de ocupação e KPIs do dashboard; integração com modelo de IA para
 *              análise e sugestões contextuais (chamarIA, relatórios, sugestão de reserva).
 * @responsibility Entrypoints: obterMetricasDashboard, chamarIA, chamarIAChat.
 * @dependencies utils.js (_getSheet), ChatService.js (se presente), planilha MASTER/ESPACOS.
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

      if (status === "CONFIRMADO") confirmadas++;
      if (status === "CANCELADO") {
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
      if (String(r[13] || "").toUpperCase() === "HABILITADO") habilitadas++;
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
      console.error("Erro CODIP dashboard:", e);
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
    console.error("Erro em obterMetricasDashboard:", e.message);
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
      if (String(r[13] || "").toUpperCase() === "CANCELADO") return;
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
    console.error("Erro em obterDadosGraficoReservas:", e.message);
    return { labels: [], valores: [], tipo: "bar", titulo: "Reservas" };
  }
}

// ==============================
// INTELIGÊNCIA ARTIFICIAL
// ==============================

function chamarIA(prompt) {
  const apiKey =
    PropertiesService.getScriptProperties().getProperty("GROQ_API_KEY");
  if (!apiKey)
    return {
      ok: false,
      texto: "Chave GROQ_API_KEY não configurada nas propriedades do script.",
    };

  const url = "https://api.groq.com/openai/v1/chat/completions";
  const payload = {
    model: "llama-3.1-8b-instant",
    messages: [
      {
        role: "system",
        content:
          "Você é o Bêjotinha, um especialista em gestão de espaços do Centro Cultural Bom Jardim (CCBJ), equipamento público de cultura localizado no bairro Bom Jardim, em Fortaleza/CE. O CCBJ é vinculado à Secretaria de Cultura do Ceará e gerido em parceria pelo Instituto Dragão do Mar e atende comunidades em situação de vulnerabilidade social com programação gratuita de arte, cultura e educação. Seus espaços incluem teatro, sala de dança, biblioteca, multigaleria, estúdio, sala multiuso, praça central e áreas abertas/de convivência/espaços alternativos. Todos os espaços são também sala de aula. A programação envolve oficinas, espetáculos, mostras, formações e eventos comunitários. Há 3 setores finalísticos: Escola de Cultura e Artes (Formação), Ação Cultural (Difusão e Fruição) e NArTE - Núcleo de Articulação Técnica Especializada (Cidadania Cultural e Direitos Humanos); além de 3 setores meio: Comunicação, Administrativo/Financeiro e Gestão. O sistema registra reservas internas de espaços pelos setores institucionais, com controle de itens do almoxarifado. Responda sempre em português, de forma clara, objetiva e estruturada. Use markdown simples (negrito, listas) quando ajudar na leitura.",
      },
      { role: "user", content: prompt },
    ],
    max_tokens: 2048,
    temperature: 0.4,
  };

  try {
    const response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + apiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    const json = JSON.parse(response.getContentText());
    if (json.error)
      return { ok: false, texto: "Erro da API: " + json.error.message };
    if (json.choices && json.choices[0]) {
      return { ok: true, texto: json.choices[0].message.content };
    }
    return { ok: false, texto: "Resposta inesperada da API." };
  } catch (e) {
    return { ok: false, texto: "Erro ao chamar a API: " + e.message };
  }
}

function gerarRelatorioIA(filtros) {
  try {
    const reservasBruto = obterReservas();
    if (!reservasBruto || reservasBruto.length === 0) {
      return { ok: false, texto: "Não há reservas no sistema para analisar." };
    }
    const salaMap = obterMapaSalas();
    const reservas = reservasBruto.map((r) => ({
      id: r[0],
      data: r[1],
      inicio: r[2],
      termino: r[3],
      sala: salaMap[String(r[4]).trim()] || r[4],
      turno: r[5],
      acao: r[6],
      tipo: r[7],
      responsavel: r[8],
      setor: r[9],
      itens: r[12],
      status: r[13],
    }));

    const hoje = new Date();
    const filtradas = reservas.filter((r) => {
      if (!r.data) return true;
      const p = String(r.data).split("/");
      if (p.length !== 3) return true;
      const d = new Date(p[2], p[1] - 1, p[0]);
      if (filtros.periodo === "hoje")
        return d.toDateString() === hoje.toDateString();
      if (filtros.periodo === "7dias") {
        const lim = new Date(hoje);
        lim.setDate(hoje.getDate() + 7);
        return d >= hoje && d <= lim;
      }
      if (filtros.periodo === "30dias") {
        const lim = new Date(hoje);
        lim.setDate(hoje.getDate() + 30);
        return d >= hoje && d <= lim;
      }
      return true;
    });

    const emailAtivo = Session.getActiveUser().getEmail();
    const amostra = (
      filtros.usuario === "minhas"
        ? filtradas.filter((r) =>
            String(r.responsavel)
              .toLowerCase()
              .includes(emailAtivo.toLowerCase()),
          )
        : filtradas
    ).slice(0, 60);

    if (amostra.length === 0) {
      return {
        ok: false,
        texto: "Nenhuma reserva encontrada com os filtros aplicados.",
      };
    }

    const instrucoes = {
      uso: "Analise o padrão de uso dos espaços: quais salas são mais usadas, em quais turnos, por quais setores. Identifique subutilização e picos.",
      conflitos:
        "Identifique APENAS reservas com sobreposição real de horário na MESMA sala na MESMA data.",
      itens:
        "Analise o uso dos itens e equipamentos: quais são mais solicitados, por quais setores.",
      otimizacao:
        "Sugira melhorias operacionais concretas para o CCBJ com base nos dados.",
    };

    const prompt = `${instrucoes[filtros.tipo] || instrucoes.uso}

REGRAS:
- Use SOMENTE os dados abaixo
- Seja específico com nomes, horários e números reais dos dados
- Formato: título em negrito, lista de insights, conclusão com recomendações práticas
- Máximo 500 palavras

DADOS (${amostra.length} reservas):
${JSON.stringify(amostra)}`;

    return chamarIA(prompt);
  } catch (e) {
    return { ok: false, texto: "Erro interno: " + e.message };
  }
}

function perguntarIA(pergunta) {
  try {
    const salaMap = obterMapaSalas();
    const reservasBruto = obterReservas();
    const reservas = (reservasBruto || []).slice(0, 60).map((r) => ({
      data: r[1],
      inicio: r[2],
      termino: r[3],
      sala: salaMap[String(r[4] || "").trim()] || r[4],
      turno: r[5],
      acao: r[6],
      responsavel: r[8],
      setor: r[9],
      itens: r[12],
      status: r[13],
    }));

    const configSheet = _getSheet("Configuracoes");
    const salas =
      configSheet && configSheet.getLastRow() > 1
        ? configSheet
            .getRange(2, 1, configSheet.getLastRow() - 1, 3)
            .getValues()
            .map((s) => ({
              id: String(s[0]).trim(),
              nome: String(s[1]).trim(),
              capacidade: Number(s[2]) || 0,
            }))
        : [];

    const itensSheet = _getSheet("Itens");
    const itens =
      itensSheet && itensSheet.getLastRow() > 1
        ? itensSheet
            .getRange(2, 1, itensSheet.getLastRow() - 1, 4)
            .getValues()
            .map((i) => ({ nome: i[1], categoria: i[2], qtdDisponivel: i[3] }))
        : [];

    const setoresSheet = _getSheet("Listas");
    const setores =
      setoresSheet && setoresSheet.getLastRow() > 1
        ? setoresSheet
            .getRange(2, 1, setoresSheet.getLastRow() - 1, 1)
            .getValues()
            .map((s) => String(s[0]).trim())
            .filter(Boolean)
        : [];

    let perguntaFinal = pergunta;
    try {
      const parsed = JSON.parse(pergunta);
      if (Array.isArray(parsed)) {
        perguntaFinal = parsed.map((m) => `${m.role}: ${m.content}`).join("\n");
      }
    } catch (e) {}

    const reservasTexto = reservas
      .map(
        (r) => `${r.data} | ${r.inicio}-${r.termino} | ${r.sala} | ${r.acao}`,
      )
      .join("\n");

    const emailAtivo = Session.getActiveUser().getEmail().toLowerCase();
    const ehUsuarioTeste = emailAtivo.includes("joao.barros");

    const prompt = `Você é o Bêjotinha, assistente de gestão de espaços do Centro Cultural Bom Jardim (CCBJ), Fortaleza/CE.

REGRA ABSOLUTA — APRESENTAÇÃO:
- NUNCA se apresente. NUNCA diga "Olá", "Oi", "Sou a Bêjotinha". Já fomos apresentados.
- Responda DIRETAMENTE ao que foi pedido, sem saudações de qualquer tipo.

REGRA ABSOLUTA — PROATIVIDADE:
- Só sugira reserva quando o usuário EXPLICITAMENTE pedir para criar, agendar, reservar ou marcar algo.
- Consultas, dúvidas, análises e perguntas genéricas NÃO geram JSON de reserva — responda apenas em texto.
- Quando o usuário não pedir reserva, NUNCA inclua o bloco JSON na resposta.
- Não faça mais de UMA pergunta por resposta.

PERMISSÃO PARA CRIAR CONTEÚDO:
- Você PODE inventar nomes de ações, releases técnicos, descrições, público-alvo, categorias e observações coerentes com o contexto.
- Sempre deixe claro que são sugestões revisáveis.
${ehUsuarioTeste ? "- USUÁRIO DE TESTE AUTORIZADO: crie programações completas e detalhadas livremente, sem pedir confirmação." : ""}

REGRAS DE AGENDAMENTO:
- Nunca usar ID de sala na resposta textual — use sempre o nome real.
- Nunca sugerir horários já ocupados. Verifique os conflitos antes de sugerir.
- Se houver conflito, sugira alternativa de sala ou horário imediatamente.
- Horários permitidos: 08:00 às 21:30.

INTERPRETAÇÃO DE TERMOS:
- "manhã" = 08:00–12:00 | "tarde" = 12:00–18:00 | "noite" = 18:00–21:30
- "qualquer dia" = primeiro disponível a partir de hoje
- "semana" = próximos 7 dias
- reunião → público estimado: 5–15 | oficina → 15–40 | evento → 40+

JSON (apenas quando reserva foi solicitada):
{
  "modoLote": false,
  "modoRece": false,
  "datasLote": [],
  "sugestao": {
    "nomeAcao": "",
    "salaId": "",
    "salaNome": "",
    "data": "",
    "horaInicio": "",
    "horaTermino": "",
    "turno": "",
    "setor": "",
    "itens": [],
    "release": "",
    "observacoes": "",
    "receDados": {
      "categorias": "",
      "publicoAlvo": "",
      "classificacao": "Livre",
      "acesso": "Gratuito",
      "descricao": "",
      "acessibilidades": "",
      "parceiros": "",
      "artista": ""
    }
  }
}

REGRAS CRÍTICAS DO JSON:
- JSON deve ser válido e sem comentários.
- Nunca coloque texto após o bloco JSON.
- Se não for criar reserva, não inclua JSON.

CONTEXTO DO SISTEMA:
- Data de hoje: ${Utilities.formatDate(new Date(), "America/Fortaleza", "dd/MM/yyyy")}
- Email do usuário: ${emailAtivo}

HISTÓRICO / MENSAGEM:
${perguntaFinal}

SALAS DISPONÍVEIS:
${JSON.stringify(salas)}

RESERVAS ATIVAS (${reservas.length} registros):
${reservasTexto}

ITENS DO ALMOXARIFADO:
${JSON.stringify(itens)}

SETORES INSTITUCIONAIS:
${setores.join(", ")}`;

    return chamarIA(prompt);
  } catch (e) {
    return { ok: false, texto: "Erro interno: " + e.message };
  }
}

function sugerirReservaIA(descricao) {
  try {
    const configSheet = _getSheet("Configuracoes");
    const salas =
      configSheet && configSheet.getLastRow() > 1
        ? configSheet
            .getRange(2, 1, configSheet.getLastRow() - 1, 3)
            .getValues()
            .map((s) => ({ id: s[0], nome: s[1], capacidade: s[2] }))
        : [];
    const reservasBruto = obterReservas();
    const ocupacoes = (reservasBruto || [])
      .filter((r) => r[13] !== "CANCELADO")
      .map((r) => ({
        data: r[1],
        inicio: r[2],
        termino: r[3],
        sala: r[4],
      }));
    const prompt = `Você é um assistente de agendamento do CCBJ.
PEDIDO DO USUÁRIO: ${descricao}
Com base nas salas disponíveis e nas ocupações existentes, sugira:
1. A sala mais adequada (justifique)
2. Um horário livre sugerido
3. Itens que provavelmente serão necessários
4. Observações importantes
SALAS DISPONÍVEIS:
${JSON.stringify(salas)}
OCUPAÇÕES EXISTENTES (últimas 30):
${JSON.stringify(ocupacoes.slice(-30))}
REGRAS:
- Use apenas salas da lista acima
- Verifique conflitos de horário antes de sugerir
- Seja prático e objetivo
- Máximo 300 palavras`;
    return chamarIA(prompt);
  } catch (e) {
    return { ok: false, texto: "Erro: " + e.message };
  }
}

function analisarDashboardIA(metricas) {
  try {
    if (!metricas) return { ok: false, texto: "Nenhuma métrica fornecida." };
    const prompt = `Analise as métricas de uso do Centro Cultural Bom Jardim e gere um resumo executivo com insights e recomendações.

MÉTRICAS:
- Total de reservas: ${metricas.total}
- Confirmadas: ${metricas.confirmadas} | Canceladas: ${metricas.canceladas} (${metricas.taxaCancelamento}%)
- Top 5 espaços: ${JSON.stringify(metricas.top5Salas)}
- Top 5 setores: ${JSON.stringify(metricas.top5Setores)}
- Distribuição por turno: ${JSON.stringify(metricas.porTurno)}
- Itens mais solicitados: ${JSON.stringify(metricas.topItens)}
- Horários de pico: ${JSON.stringify(metricas.horasPico)}
- Dias mais movimentados: ${JSON.stringify(metricas.diasSemana)}

Gere:
1. **Resumo executivo** (2-3 frases)
2. **Pontos de atenção** (problemas identificados)
3. **Oportunidades** (melhorias sugeridas)
4. **Recomendação prioritária**

IMPORTANTE:
Máximo 400 palavras. Use apenas markdown — sem blocos de código JSON.`;
    return chamarIA(prompt);
  } catch (e) {
    return { ok: false, texto: "Erro: " + e.message };
  }
}

function sugerirReservaIAComDados(descricao) {
  try {
    const configSheet = _getSheet("Configuracoes");
    const salas =
      configSheet && configSheet.getLastRow() > 1
        ? configSheet
            .getRange(2, 1, configSheet.getLastRow() - 1, 3)
            .getValues()
            .map((s) => ({
              id: String(s[0]).trim(),
              nome: String(s[1]).trim(),
              capacidade: s[2],
            }))
            .filter((s) => s.id && s.nome)
        : [];

    const itensSheet = _getSheet("Itens");
    const itens =
      itensSheet && itensSheet.getLastRow() > 1
        ? itensSheet
            .getRange(2, 1, itensSheet.getLastRow() - 1, 4)
            .getValues()
            .map((i) => ({
              nome: String(i[1]).trim(),
              categoria: String(i[2]).trim(),
              qtd: Number(i[3]),
            }))
            .filter((i) => i.nome && i.qtd > 0)
        : [];

    const setoresSheet = _getSheet("Listas");
    const setores =
      setoresSheet && setoresSheet.getLastRow() > 1
        ? setoresSheet
            .getRange(2, 1, setoresSheet.getLastRow() - 1, 1)
            .getValues()
            .map((s) => String(s[0]).trim())
            .filter(Boolean)
        : [];

    const reservasBruto = obterReservas();
    const hoje = new Date();
    const limite = new Date(hoje);
    limite.setDate(hoje.getDate() + 14);
    const ocupacoes = (reservasBruto || [])
      .filter((r) => r[13] !== "CANCELADO")
      .map((r) => ({ data: r[1], inicio: r[2], termino: r[3], sala: r[4] }))
      .filter((r) => {
        try {
          const p = String(r.data).split("/");
          if (p.length !== 3) return false;
          const d = new Date(p[2], p[1] - 1, p[0]);
          return d >= hoje && d <= limite;
        } catch (e) {
          return false;
        }
      });

    const hoje_str = Utilities.formatDate(
      hoje,
      "America/Fortaleza",
      "dd/MM/yyyy",
    );

    const prompt = `Você é um assistente de agendamento do CCBJ (Centro Cultural Bom Jardim, Fortaleza/CE).

PEDIDO: ${descricao}

Retorne SOMENTE JSON válido:
{
  "viavel": true,
  "motivo": "",
  "modoLote": false,
  "modoRece": false,
  "datasLote": [],
  "sugestao": {
    "nomeAcao": "",
    "salaId": "",
    "salaNome": "",
    "data": "DD/MM/YYYY",
    "horaInicio": "HH:MM",
    "horaTermino": "HH:MM",
    "turno": "",
    "itens": [],
    "justificativa": "",
    "observacoes": ""
  }
}

REGRAS:
- É PROIBIDO sugerir horários ocupados
- Sempre evitar conflito com ocupações
- Se houver conflito, escolha outra sala ou horário
- Data >= ${hoje_str}

IMPORTANTE:
- Quando retornar JSON, ele deve ser válido e sem comentários
- Não usar texto antes ou depois do JSON

SALAS: ${JSON.stringify(salas)}
OCUPAÇÕES: ${JSON.stringify(ocupacoes)}
ITENS: ${JSON.stringify(itens)}
SETORES: ${setores.join(", ")}`;

    const resultado = chamarIA(prompt);
    if (!resultado.ok) return { ok: false, texto: resultado.texto };

    const dados = parsearJsonIA(resultado.texto || "");
    if (!dados) {
      return {
        ok: false,
        texto:
          "Resposta inválida! A IA retornou um formato que não foi possível processar. Tente reformular o pedido de forma mais simples.",
      };
    }

    if (dados.sugestao && dados.sugestao.salaId) {
      const salaEncontrada = salas.find(
        (s) => String(s.id) === String(dados.sugestao.salaId),
      );
      dados.sugestao.salaNome = salaEncontrada
        ? salaEncontrada.nome
        : "Sala não identificada";
    }

    const s = dados.sugestao;
    if (s && s.salaId && s.data && s.horaInicio && s.horaTermino) {
      const conflito = verificarConflitoEspaco(
        s.salaId,
        s.data,
        s.horaInicio,
        s.horaTermino,
        null,
      );
      if (conflito) {
        const alternativas = encontrarMelhorAgenda(
          { data: s.data, datasLote: dados.datasLote || [] },
          salas,
          ocupacoes,
        );
        if (alternativas && alternativas.length > 0) {
          return {
            ok: true,
            dados: {
              viavel: false,
              motivo: "A opção solicitada está ocupada",
              alternativas,
              sugestaoOriginal: dados.sugestao,
            },
          };
        }
        return {
          ok: true,
          dados: {
            viavel: false,
            motivo: "Sem nenhuma alternativa disponível",
          },
        };
      }
    }

    return { ok: true, dados };
  } catch (e) {
    return { ok: false, texto: "Erro interno: " + e.message };
  }
}

function adicionar1Hora(hora) {
  const [h, m] = hora.split(":").map(Number);
  const d = new Date();
  d.setHours(h);
  d.setMinutes(m + 60);
  return Utilities.formatDate(d, "America/Fortaleza", "HH:mm");
}

function encontrarMelhorAgenda(dados, salas, reservas) {
  const horarios = ["08:00", "10:00", "14:00", "16:00", "18:00"];
  const resultados = [];
  const datas =
    dados.datasLote && dados.datasLote.length ? dados.datasLote : [dados.data];

  salas.forEach((sala) => {
    datas.forEach((data) => {
      horarios.forEach((inicio) => {
        const fim = adicionar1Hora(inicio);
        const conflito = verificarConflitoEspaco(
          sala.id,
          data,
          inicio,
          fim,
          null,
        );
        if (!conflito) {
          resultados.push({
            salaId: sala.id,
            salaNome: sala.nome,
            data,
            inicio,
            fim,
          });
        }
      });
    });
  });

  resultados.sort((a, b) => a.inicio.localeCompare(b.inicio));
  return resultados.slice(0, 8);
}

function parsearJsonIA(resposta) {
  try {
    if (!resposta) return null;
    const inicio = resposta.indexOf("{");
    const fim = resposta.lastIndexOf("}");
    if (inicio === -1 || fim === -1) return null;
    return JSON.parse(resposta.substring(inicio, fim + 1));
  } catch (e) {
    Logger.log("Erro ao parsear JSON da IA: " + resposta);
    return null;
  }
}
