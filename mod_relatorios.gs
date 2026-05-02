// ============================================================
// mod_relatorios.gs
// Contratos, Metas, Indicadores, Rubricas, CODIP e Documentos
// ============================================================

// ==============================
// GERAÇÃO DE DOCUMENTOS
// ==============================

function mapearGraficosPorSecao(secoes, graficos) {
  if (!graficos || !graficos.length) return {};
  const mapa = {};
  secoes.forEach((secao, i) => {
    const titulo = String(secao.titulo || "").toLowerCase();
    if (/dados|uso|horário|grafico|gráfico|estat/i.test(titulo)) {
      mapa[i] = graficos.slice(0, 2);
    }
  });
  return mapa;
}

function gerarDocumentoDrive(conteudo) {
  if (!conteudo || !conteudo.secoes) {
    throw new Error("Conteúdo inválido");
  }

  let fileId = null;
  let url = null;

  const graficos = conteudo.graficos
    ? conteudo.graficos
    : conteudo.grafico
      ? Array.isArray(conteudo.grafico)
        ? conteudo.grafico
        : [{ imagem: conteudo.grafico }]
      : [];

  const mapaGraficos = mapearGraficosPorSecao(conteudo.secoes, graficos);

  if (conteudo.formato === "ppt") {
    const pres = SlidesApp.create(conteudo.titulo);
    const slides = pres.getSlides();
    if (slides.length) pres.removeSlide(slides[0]);

    const capa = pres.appendSlide(SlidesApp.PredefinedLayout.TITLE);
    capa
      .getPlaceholder(SlidesApp.PlaceholderType.TITLE)
      .asShape()
      .getText()
      .setText(conteudo.titulo);
    capa
      .getPlaceholder(SlidesApp.PlaceholderType.SUBTITLE)
      ?.asShape()
      .getText()
      .setText("Relatório gerado automaticamente");

    conteudo.secoes.forEach((secao, index) => {
      const slide = pres.appendSlide(SlidesApp.PredefinedLayout.BLANK);
      slide
        .insertTextBox(secao.titulo, 40, 30, 600, 40)
        .getText()
        .getTextStyle()
        .setBold(true)
        .setFontSize(20);
      slide
        .insertTextBox(secao.conteudo, 40, 80, 300, 250)
        .getText()
        .getTextStyle()
        .setFontSize(12);
      const graficosDaSecao = mapaGraficos[index] || [];
      graficosDaSecao.forEach((g, i) => {
        try {
          const blob = Utilities.newBlob(
            Utilities.base64Decode(g.imagem.split(",")[1]),
            "image/png",
            "grafico.png",
          );
          slide
            .insertImage(blob)
            .setLeft(360)
            .setTop(80 + i * 160)
            .setWidth(300);
        } catch (e) {
          console.log("Erro ao inserir gráfico:", e);
        }
      });
      slide
        .insertShape(SlidesApp.ShapeType.RECTANGLE, 40, 70, 600, 2)
        .getFill()
        .setSolidFill("#4C1D95");
    });

    fileId = pres.getId();
    url = pres.getUrl();
  } else if (conteudo.formato === "doc") {
    const doc = DocumentApp.create(conteudo.titulo);
    const body = doc.getBody();
    conteudo.secoes.forEach((secao, index) => {
      body
        .appendParagraph(secao.titulo)
        .setHeading(DocumentApp.ParagraphHeading.HEADING2);
      body.appendParagraph(secao.conteudo);
      const graficosDaSecao = mapaGraficos[index] || [];
      graficosDaSecao.forEach((g) => {
        try {
          const blob = Utilities.newBlob(
            Utilities.base64Decode(g.imagem.split(",")[1]),
            "image/png",
            "grafico.png",
          );
          body.appendParagraph("Gráfico:");
          body.appendImage(blob);
        } catch (e) {
          console.log("Erro ao inserir gráfico no doc:", e);
        }
      });
    });
    fileId = doc.getId();
    url = doc.getUrl();
  } else if (conteudo.formato === "pdf") {
    const doc = DocumentApp.create(conteudo.titulo);
    const body = doc.getBody();
    conteudo.secoes.forEach((secao, index) => {
      body
        .appendParagraph(secao.titulo)
        .setHeading(DocumentApp.ParagraphHeading.HEADING2);
      body.appendParagraph(secao.conteudo);
      const graficosDaSecao = mapaGraficos[index] || [];
      graficosDaSecao.forEach((g) => {
        try {
          const blob = Utilities.newBlob(
            Utilities.base64Decode(g.imagem.split(",")[1]),
            "image/png",
            "grafico.png",
          );
          body.appendParagraph("Gráfico:");
          body.appendImage(blob);
        } catch (e) {
          console.log("Erro ao inserir gráfico no PDF:", e);
        }
      });
    });
    const file = DriveApp.getFileById(doc.getId());
    const pdfBlob = file.getAs("application/pdf");
    const pdfFile = DriveApp.createFile(pdfBlob).setName(
      conteudo.titulo + ".pdf",
    );
    file.setTrashed(true);
    fileId = pdfFile.getId();
    url = pdfFile.getUrl();
  } else {
    throw new Error("Formato não suportado");
  }

  return {
    url,
    downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
    fileId,
  };
}

function mapearGraficosIA(secoes, graficos) {
  try {
    const prompt = `
Associe gráficos às seções de um relatório.
SEÇÕES:
${JSON.stringify(secoes.map((s, i) => ({ i, titulo: s.titulo })))}
GRÁFICOS:
${JSON.stringify(graficos.map((g, i) => ({ i, titulo: g.titulo || "Gráfico" })))}
Responda SOMENTE JSON no formato:
{"0": [0], "1": [1], "2": []}
`;
    const resposta = chamarIA(prompt);
    return JSON.parse(resposta);
  } catch (e) {
    console.log("IA falhou, usando fallback local");
    return mapearGraficosPorSecao(secoes, graficos);
  }
}

// ==============================
// CODIP
// ==============================

function _salvarCamposCODIP(idReserva, dados) {
  try {
    const sheet = _getSheet("RelatoriosCODIP");
    if (!sheet) throw new Error("Aba RelatoriosCODIP não encontrada");

    if (sheet.getLastRow() > 1) {
      const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
      for (let i = 0; i < ids.length; i++) {
        if (String(ids[i][0]).trim() === String(idReserva).trim()) {
          sheet
            .getRange(i + 2, 1, 1, 34)
            .setValues([_montarLinhaCodip(idReserva, dados)]);
          return true;
        }
      }
    }

    sheet.appendRow(_montarLinhaCodip(idReserva, dados));
    return true;
  } catch (e) {
    console.error("Erro CODIP:", e.message);
    return false;
  }
}

function _montarLinhaCodip(idReserva, dados) {
  return [
    idReserva,
    dados.codipPrograma || "",
    dados.codipMesRef || "",
    dados.codipTipoAcao || "",
    dados.codipEixo || "",
    dados.codipSegmento1 || "",
    dados.codipSegmento2 || "",
    dados.codipLinguagem1 || "",
    dados.codipLinguagem2 || "",
    dados.codipModalidade || "",
    dados.codipRecursos || "",
    dados.codipRede || "NÃO",
    dados.codipAcessibilidade || "",
    Number(dados.codipPubPresencial || 0),
    Number(dados.codipPubVirtual || 0),
    Number(dados.codipVisualizacoes || 0),
    Number(dados.codipPCD || 0),
    Number(dados.codipIdosos || 0),
    Number(dados.codipProfExternos || 0),
    Number(dados.codipVoluntarios || 0),
    dados.codipVulnerabilidade || "",
    dados.codipPubEspecifico || "",
    Number(dados.codipHorasAntes || 0),
    Number(dados.codipHorasMes || 0),
    Number(dados.codipHorasTotal || 0),
    dados.codipProdutos || "",
    dados.codipDisponibilidade || "",
    dados.codipAvalSatisfacao || "",
    dados.codipDesafios || "",
    dados.codipObservacoes || "",
    dados.codipLinkEvidencias || "",
    dados.codipLinkRelatorio || "",
    dados.codipDescricaoAcao || "",
    new Date(),
  ];
}

function reescreverDescricaoAcaoIA(texto, setor) {
  const s = String(setor || "").toLowerCase();
  let foco = "";
  if (
    /ação cultural|acao cultural|difus|apresentação|contação de histórias/.test(
      s,
    )
  )
    foco = "com foco em Difusão e Fruição Cultural";
  else if (/narte|cidadania|direitos|campanha|articulação comunitária/.test(s))
    foco = "com foco em Cidadania Cultural e Direitos Humanos";
  else if (/escola|formação|formacao|curso/.test(s))
    foco = "com foco em Formação e Conhecimento em Arte e Cultura";

  const prompt = `Reescreva o texto abaixo para uso em relatório institucional ${foco}.

REGRAS:
- Escrita impessoal, sem uso de primeira pessoa ou sujeito institucional
- Proibição de verbos no presente (ex: "é", "visa", "promove", "busca", "oferece")
- Priorizar estrutura nominal (substantivos, locuções nominais)
- Ausência de marcação temporal explícita
- Descrição atemporal, concisa e técnica
- Foco em proposta conceitual, abordagem, relação com o público e linguagem
- Estrutura preferencialmente nominal ou abstrata, sem indicação de agente
- Substituição de verbos por substantivos ou advérbios sempre que possível
- Conversão de ações em qualificações nominais, com uso de particípio passado quando necessário
- Eliminação de conectivos explicativos e redundâncias
- Parágrafo único, contínuo, sem tópicos
- Máximo de 600 caracteres
- Não utilizar markdown na resposta
- Responder apenas com o texto reescrito, sem aspas ou comentários

TEXTO ORIGINAL:
${String(texto || "").trim()}`;

  return chamarIA(prompt);
}

function obterRelatoriosCODIP() {
  try {
    const sheet = _getSheet("RelatoriosCODIP");
    if (!sheet || sheet.getLastRow() < 2) return [];

    const dados = sheet.getRange(2, 1, sheet.getLastRow() - 1, 34).getValues();
    const reservas = obterReservas();

    // Mapa de reservas para enriquecer com dados de nome e setor
    const mapaReservas = {};
    reservas.forEach((r) => {
      mapaReservas[String(r[0]).trim()] = r;
    });

    // Mapa de contratos/metas/indicadores
    const contratos = obterContratos();
    const metas = obterMetas();
    const indicadores = obterIndicadores();
    const mapaCtrs = {},
      mapaMetas = {},
      mapaInds = {};
    contratos.forEach((c) => {
      mapaCtrs[c.id] = c;
    });
    metas.forEach((m) => {
      mapaMetas[m.id] = m;
    });
    indicadores.forEach((i) => {
      mapaInds[i.id] = i;
    });

    return dados
      .filter((r) => r[0])
      .map((r) => {
        const reserva = mapaReservas[String(r[0]).trim()] || [];
        const ctr = mapaCtrs[String(r[33] || "")] || {};
        const met = mapaMetas[String(r[34] || "")] || {};
        const ind = mapaInds[String(r[35] || "")] || {};
        return {
          idReserva: r[0],
          nomeAcao: reserva[6] || r[0],
          setor: reserva[9] || "",
          responsavel: reserva[8] || "",
          programa: r[1],
          mesRef: r[2],
          tipoAcao: r[3],
          eixo: r[4],
          segmento1: r[5],
          segmento2: r[6],
          linguagem1: r[7],
          linguagem2: r[8],
          modalidade: r[9],
          recursos: r[10],
          rede: r[11],
          acessibilidade: r[12],
          pubPresencial: Number(r[13]) || 0,
          pubVirtual: Number(r[14]) || 0,
          visualizacoes: Number(r[15]) || 0,
          pcd: Number(r[16]) || 0,
          idosos: Number(r[17]) || 0,
          profExternos: Number(r[18]) || 0,
          voluntarios: Number(r[19]) || 0,
          vulnerabilidade: r[20],
          pubEspecifico: r[21],
          horasAntes: Number(r[22]) || 0,
          horasMes: Number(r[23]) || 0,
          horasTotal: Number(r[24]) || 0,
          produtos: r[25],
          disponibilidade: r[26],
          avalSatisfacao: r[27],
          desafios: r[28],
          observacoes: r[29],
          linkEvidencias: r[30],
          linkRelatorio: r[31],
          descricaoAcao: r[32],
          idContrato: r[33] || "",
          idMeta: r[34] || "",
          idIndicador: r[35] || "",
          nomeContrato: ctr.nome || "",
          nomeMeta: met.titulo || "",
          nomeIndicador: ind.nome || ind.texto || "",
        };
      });
  } catch (e) {
    console.error("obterRelatoriosCODIP:", e.message);
    return [];
  }
}

// ==============================
// AGREGADOR
// ==============================

function obterDadosContratos() {
  try {
    return {
      contratos: obterContratos(),
      metas: obterMetas(),
      indicadores: obterIndicadores(),
      rubricas: obterRubricas(),
    };
  } catch (e) {
    throw new Error("Erro ao carregar dados: " + e.message);
  }
}

// ==============================
// CONTRATOS
// ==============================

function obterContratos() {
  const aba = _getSheet("Contratos");
  if (!aba || aba.getLastRow() < 2) return [];
  const rows = aba.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!String(r[0]).trim()) continue;
    result.push({
      id: String(r[0]),
      nome: String(r[1] || ""),
      numero: String(r[2] || ""),
      descricao: String(r[3] || ""),
      vigIni: r[4] ? String(r[4]) : "",
      vigFim: r[5] ? String(r[5]) : "",
      status: String(r[6] || ""),
      valorTotal: Number(r[7]) || 0,
      fonteRecurso: String(r[8] || ""),
      contrapartida: Number(r[9]) || 0,
      modalidade: String(r[10] || ""),
      obsFinanceiro: String(r[11] || ""),
    });
  }
  return result;
}

function obterContratoPorId(id) {
  const idStr = String(id || "").trim();
  const todos = obterContratos();
  for (let i = 0; i < todos.length; i++) {
    if (todos[i].id === idStr) return todos[i];
  }
  return null;
}

function salvarContrato(dados, email) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const aba = _getSheet("Contratos");
    const id = String(dados.id || "").trim();
    const linha = [
      id || gerarId("CTR"),
      String(dados.nome || ""),
      String(dados.numero || ""),
      String(dados.descricao || ""),
      dados.vigIni || "",
      dados.vigFim || "",
      String(dados.status || "ATIVO"),
      Number(dados.valorTotal) || 0,
      String(dados.fonteRecurso || ""),
      Number(dados.contrapartida) || 0,
      String(dados.modalidade || ""),
      String(dados.obsFinanceiro || ""),
    ];
    if (!id) {
      aba.appendRow(linha);
    } else {
      const rows = aba.getDataRange().getValues();
      let found = false;
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim() === id) {
          aba.getRange(i + 1, 1, 1, linha.length).setValues([linha]);
          found = true;
          break;
        }
      }
      if (!found) aba.appendRow(linha);
    }
    registrarLog(
      "SALVAR",
      "CONTRATO",
      linha[0],
      JSON.stringify(dados),
      "",
      "",
      String(email || ""),
    );
    return true;
  } catch (e) {
    console.error("salvarContrato:", e.message);
    return false;
  } finally {
    lock.releaseLock();
  }
}

function excluirContrato(id, email) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const aba = _getSheet("Contratos");
    const rows = aba.getDataRange().getValues();
    const idStr = String(id || "").trim();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === idStr) {
        aba.deleteRow(i + 1);
        registrarLog(
          "EXCLUIR",
          "CONTRATO",
          idStr,
          "",
          "",
          "",
          String(email || ""),
        );
        return true;
      }
    }
    return false;
  } catch (e) {
    console.error("excluirContrato:", e.message);
    return false;
  } finally {
    lock.releaseLock();
  }
}

function atualizarContrato(id, campos, email) {
  try {
    const atual = obterContratoPorId(id);
    if (!atual) return false;
    const merged = {};
    for (const k in atual) merged[k] = atual[k];
    for (const k in campos) merged[k] = campos[k];
    merged.id = String(id);
    return salvarContrato(merged, email);
  } catch (e) {
    console.error("atualizarContrato:", e.message);
    return false;
  }
}

// ==============================
// METAS
// ==============================

function obterMetas() {
  const aba = _getSheet("Metas");
  if (!aba || aba.getLastRow() < 2) return [];
  const rows = aba.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!String(r[0]).trim()) continue;
    result.push({
      id: String(r[0]),
      idContrato: String(r[1] || ""),
      numero: String(r[2] || ""),
      titulo: String(r[3] || ""),
      descricao: String(r[4] || ""),
      tipoMeta: String(r[5] || "CONTRATUAL"),
    });
  }
  return result;
}

function obterMetaPorId(id) {
  const idStr = String(id || "").trim();
  const todos = obterMetas();
  for (let i = 0; i < todos.length; i++) {
    if (todos[i].id === idStr) return todos[i];
  }
  return null;
}

function salvarMeta(dados, email) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const aba = _getSheet("Metas");
    const id = String(dados.id || "").trim();
    const linha = [
      id || gerarId("META"),
      String(dados.idContrato || ""),
      String(dados.numero || ""),
      String(dados.titulo || ""),
      String(dados.descricao || ""),
      String(dados.tipoMeta || "CONTRATUAL"),
    ];
    if (!id) {
      aba.appendRow(linha);
    } else {
      const rows = aba.getDataRange().getValues();
      let found = false;
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim() === id) {
          aba.getRange(i + 1, 1, 1, linha.length).setValues([linha]);
          found = true;
          break;
        }
      }
      if (!found) aba.appendRow(linha);
    }
    registrarLog(
      "SALVAR",
      "META",
      linha[0],
      JSON.stringify(dados),
      "",
      "",
      String(email || ""),
    );
    return true;
  } catch (e) {
    console.error("salvarMeta:", e.message);
    return false;
  } finally {
    lock.releaseLock();
  }
}

function excluirMeta(id, email) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const aba = _getSheet("Metas");
    const rows = aba.getDataRange().getValues();
    const idStr = String(id || "").trim();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === idStr) {
        aba.deleteRow(i + 1);
        registrarLog("EXCLUIR", "META", idStr, "", "", "", String(email || ""));
        return true;
      }
    }
    return false;
  } catch (e) {
    console.error("excluirMeta:", e.message);
    return false;
  } finally {
    lock.releaseLock();
  }
}

function atualizarMeta(id, campos, email) {
  try {
    const atual = obterMetaPorId(id);
    if (!atual) return false;
    const merged = {};
    for (const k in atual) merged[k] = atual[k];
    for (const k in campos) merged[k] = campos[k];
    merged.id = String(id);
    return salvarMeta(merged, email);
  } catch (e) {
    console.error("atualizarMeta:", e.message);
    return false;
  }
}

// ==============================
// INDICADORES
// ==============================

function obterIndicadores() {
  const aba = _getSheet("Indicadores");
  if (!aba || aba.getLastRow() < 2) return [];
  const rows = aba.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!String(r[0]).trim()) continue;
    const meses = [
      Number(r[5]) || 0,
      Number(r[6]) || 0,
      Number(r[7]) || 0,
      Number(r[8]) || 0,
      Number(r[9]) || 0,
      Number(r[10]) || 0,
      Number(r[11]) || 0,
      Number(r[12]) || 0,
      Number(r[13]) || 0,
      Number(r[14]) || 0,
      Number(r[15]) || 0,
      Number(r[16]) || 0,
    ];
    result.push({
      id: String(r[0]),
      idMeta: String(r[1] || ""),
      idContrato: String(r[2] || ""),
      ano: Number(r[3]) || new Date().getFullYear(),
      texto: String(r[4] || ""),
      nome: String(r[4] || ""),
      tipoIndicador: String(r[17] || "CONTRATUAL"),
      numero: String(r[18] || ""),
      meses: meses,
      q1: meses[0] + meses[1] + meses[2],
      q2: meses[3] + meses[4] + meses[5],
      q3: meses[6] + meses[7] + meses[8],
      q4: meses[9] + meses[10] + meses[11],
      anual: meses.reduce((a, b) => a + b, 0),
    });
  }
  return result;
}

function obterIndicadorPorId(id) {
  const idStr = String(id || "").trim();
  const todos = obterIndicadores();
  for (let i = 0; i < todos.length; i++) {
    if (todos[i].id === idStr) return todos[i];
  }
  return null;
}

function salvarIndicador(dados, email) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const aba = _getSheet("Indicadores");
    const id = String(dados.id || "").trim();
    const anoRef = Number(dados.ano) || new Date().getFullYear();
    const m = dados.meses;
    let mesesArr = [];
    if (m && !Array.isArray(m) && typeof m === "object") {
      mesesArr = m[anoRef] || m[String(anoRef)] || [];
    } else if (Array.isArray(m)) {
      mesesArr = m;
    }
    while (mesesArr.length < 12) mesesArr.push(0);
    const linha = [
      id || gerarId("IND"),
      String(dados.idMeta || ""),
      String(dados.idContrato || ""),
      anoRef,
      String(dados.nome || dados.texto || ""),
      Number(mesesArr[0]) || 0,
      Number(mesesArr[1]) || 0,
      Number(mesesArr[2]) || 0,
      Number(mesesArr[3]) || 0,
      Number(mesesArr[4]) || 0,
      Number(mesesArr[5]) || 0,
      Number(mesesArr[6]) || 0,
      Number(mesesArr[7]) || 0,
      Number(mesesArr[8]) || 0,
      Number(mesesArr[9]) || 0,
      Number(mesesArr[10]) || 0,
      Number(mesesArr[11]) || 0,
      String(dados.tipoIndicador || "CONTRATUAL"),
      String(dados.numero || ""),
    ];
    if (!id) {
      aba.appendRow(linha);
    } else {
      const rows = aba.getDataRange().getValues();
      let found = false;
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim() === id) {
          aba.getRange(i + 1, 1, 1, linha.length).setValues([linha]);
          found = true;
          break;
        }
      }
      if (!found) aba.appendRow(linha);
    }
    registrarLog(
      "SALVAR",
      "INDICADOR",
      linha[0],
      JSON.stringify(dados),
      "",
      "",
      String(email || ""),
    );
    return true;
  } catch (e) {
    console.error("salvarIndicador:", e.message);
    return false;
  } finally {
    lock.releaseLock();
  }
}

function excluirIndicador(id, email) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const aba = _getSheet("Indicadores");
    const rows = aba.getDataRange().getValues();
    const idStr = String(id || "").trim();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === idStr) {
        aba.deleteRow(i + 1);
        registrarLog(
          "EXCLUIR",
          "INDICADOR",
          idStr,
          "",
          "",
          "",
          String(email || ""),
        );
        return true;
      }
    }
    return false;
  } catch (e) {
    console.error("excluirIndicador:", e.message);
    return false;
  } finally {
    lock.releaseLock();
  }
}

function atualizarIndicador(id, campos, email) {
  try {
    const atual = obterIndicadorPorId(id);
    if (!atual) return false;
    const merged = {};
    for (const k in atual) merged[k] = atual[k];
    for (const k in campos) merged[k] = campos[k];
    merged.id = String(id);
    return salvarIndicador(merged, email);
  } catch (e) {
    console.error("atualizarIndicador:", e.message);
    return false;
  }
}

// ==============================
// RUBRICAS
// ==============================

function obterRubricas() {
  const aba = _getSheet("Rubricas");
  if (!aba || aba.getLastRow() < 2) return [];
  const rows = aba.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!String(r[0]).trim()) continue;
    result.push({
      id: String(r[0]),
      idMeta: String(r[1] || ""),
      nome: String(r[2] || ""),
      valor: Number(r[3]) || 0,
      obs: String(r[4] || ""),
    });
  }
  return result;
}

function obterRubricaPorId(id) {
  const idStr = String(id || "").trim();
  const todos = obterRubricas();
  for (let i = 0; i < todos.length; i++) {
    if (todos[i].id === idStr) return todos[i];
  }
  return null;
}

function salvarRubrica(dados, email) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const aba = _getSheet("Rubricas");

    const idFinal = String(dados.id || gerarId("RUB")).trim();

    const linha = [
      idFinal,
      String(dados.idMeta || ""),
      String(dados.nome || ""),
      Number(dados.valor) || 0,
      String(dados.obs || ""),
    ];

    let isEdicao = false;

    if (!dados.id) {
      aba.appendRow(linha);
    } else {
      const rows = aba.getDataRange().getValues();
      let found = false;

      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim() === idFinal) {
          aba.getRange(i + 1, 1, 1, linha.length).setValues([linha]);
          found = true;
          isEdicao = true;
          break;
        }
      }

      if (!found) {
        aba.appendRow(linha);
      }
    }

    registrarLog(
      "SALVAR",
      "RUBRICA",
      idFinal,
      JSON.stringify(dados),
      "",
      "",
      String(email || ""),
    );

    atualizarValorRubrica(idFinal);

    return true;
  } catch (e) {
    console.error("salvarRubrica:", e.message);
    return false;
  } finally {
    lock.releaseLock();
  }
}

function adicionarItemMemoriaRubrica(dados, emailUsuario) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    if (!dados.idRubrica) throw new Error("Rubrica obrigatória");

    const quantidade = Number(dados.quantidade || 0);
    const valorUnitario = Number(dados.valorUnitario || 0);

    if (quantidade <= 0 || valorUnitario < 0) {
      throw new Error("Valores inválidos");
    }

    const subtotal = quantidade * valorUnitario;

    const aba = _getSheet("RubricasMemoria");

    aba.appendRow([
      gerarId("MEM"),
      dados.idRubrica,
      sanitizarTexto(dados.descricao),
      dados.metrica || "UN",
      quantidade,
      valorUnitario,
      subtotal,
      new Date(),
      emailUsuario,
      true,
    ]);

    atualizarValorRubrica(dados.idRubrica);

    return true;
  } finally {
    lock.releaseLock();
  }
}

function calcularValorRubrica(idRubrica) {
  const aba = _getSheet("RubricasMemoria");
  if (!aba || aba.getLastRow() < 2) return 0;

  const dados = aba.getRange(2, 1, aba.getLastRow() - 1, 10).getValues();

  let total = 0;

  for (let i = 0; i < dados.length; i++) {
    if (String(dados[i][1]) === String(idRubrica) && dados[i][9] === true) {
      total += Number(dados[i][6] || 0);
    }
  }

  return total;
}

function atualizarValorRubrica(idRubrica) {
  const valor = calcularValorRubrica(idRubrica);

  const aba = _getSheet("Rubricas");
  const dados = aba.getDataRange().getValues();

  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][0]) === String(idRubrica)) {
      aba.getRange(i + 1, 4).setValue(valor);
      return true;
    }
  }

  return false;
}

function listarMemoriaRubrica(idRubrica) {
  const aba = _getSheet("RubricasMemoria");
  if (!aba || aba.getLastRow() < 2) return [];

  const dados = aba.getRange(2, 1, aba.getLastRow() - 1, 10).getValues();

  return dados.filter(
    (r) => String(r[1]) === String(idRubrica) && r[9] === true,
  );
}

function excluirRubrica(id, email) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const aba = _getSheet("Rubricas");
    const rows = aba.getDataRange().getValues();
    const idStr = String(id || "").trim();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === idStr) {
        aba.deleteRow(i + 1);
        registrarLog(
          "EXCLUIR",
          "RUBRICA",
          idStr,
          "",
          "",
          "",
          String(email || ""),
        );
        return true;
      }
    }
    return false;
  } catch (e) {
    console.error("excluirRubrica:", e.message);
    return false;
  } finally {
    lock.releaseLock();
  }
}

function atualizarRubrica(id, campos, email) {
  try {
    const atual = obterRubricaPorId(id);
    if (!atual) return false;
    const merged = {};
    for (const k in atual) merged[k] = atual[k];
    for (const k in campos) merged[k] = campos[k];
    merged.id = String(id);
    return salvarRubrica(merged, email);
  } catch (e) {
    console.error("atualizarRubrica:", e.message);
    return false;
  }
}

function adicionarItemMemoriaRubrica(dados, emailUsuario) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    if (!dados.idRubrica) throw new Error("Rubrica obrigatória");

    const quantidade = Number(dados.quantidade || 0);
    const valorUnitario = Number(dados.valorUnitario || 0);

    if (quantidade <= 0 || valorUnitario < 0) {
      throw new Error("Valores inválidos");
    }

    const subtotal = quantidade * valorUnitario;

    const aba = _getSheet("RubricasMemoria");

    aba.appendRow([
      gerarId("MEM"),
      dados.idRubrica,
      sanitizarTexto(dados.descricao),
      dados.metrica || "UN",
      quantidade,
      valorUnitario,
      subtotal,
      new Date(),
      emailUsuario,
      true
    ]);

    atualizarValorRubrica(dados.idRubrica);

    return true;

  } finally {
    lock.releaseLock();
  }
}


function calcularValorRubrica(idRubrica) {
  const aba = _getSheet("RubricasMemoria");
  if (!aba || aba.getLastRow() < 2) return 0;

  const dados = aba.getRange(2, 1, aba.getLastRow() - 1, 10).getValues();

  let total = 0;

  for (let i = 0; i < dados.length; i++) {
    if (
      String(dados[i][1]) === String(idRubrica) &&
      dados[i][9] === true
    ) {
      total += Number(dados[i][6] || 0);
    }
  }

  return total;
}


function atualizarValorRubrica(idRubrica) {
  const valor = calcularValorRubrica(idRubrica);

  const aba = _getSheet("Rubricas");
  const dados = aba.getDataRange().getValues();

  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][0]) === String(idRubrica)) {
      aba.getRange(i + 1, 4).setValue(valor);
      return true;
    }
  }

  return false;
}
