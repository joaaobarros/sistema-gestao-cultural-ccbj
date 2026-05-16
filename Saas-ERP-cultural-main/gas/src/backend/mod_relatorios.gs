/**
 * @file mod_relatorios.gs
 * @layer backend/modules
 * @description Analytics e geração de documentos do domínio Contratos.
 *
 * FASE 5 (concluída): CRUD de Contratos, Metas, Indicadores e Rubricas
 * migrado para ContratoRepository (modules/contratos/contrato_repository.gs).
 * As funções globais CRUD abaixo delegam para o repositório — mantidas
 * apenas para compatibilidade com chamadas internas de analytics.
 *
 * @responsibility Dashboard comparativo, heatmap, alertas, versionamento,
 *                geração de documentos Drive, relatórios CODIP.
 * @depends modules/contratos/contrato_repository.gs (ContratoRepository)
 *          core/utils.gs (_getSheet, gerarId, registrarLog)
 */
// ============================================================
// mod_relatorios.gs — Analytics, CODIP, Documentos
// CRUD de contratos delegado para ContratoRepository (Fase 5)
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
          Logger.warn('relatorios', 'Erro ao inserir gráfico em slide', e.message);
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
          Logger.warn('relatorios', 'Erro ao inserir gráfico no doc', e.message);
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
          Logger.warn('relatorios', 'Erro ao inserir gráfico no PDF', e.message);
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
    Logger.warn('relatorios', 'IA falhou, usando fallback local');
    return mapearGraficosPorSecao(secoes, graficos);
  }
}

// ==============================
// VERSIONAMENTO / COMPARAÇÃO
// ==============================

function compararVersoesContrato(idContrato, v1, v2) {
  const aba = _getSheet("ContratosVersoes");
  const dados = aba.getDataRange().getValues();

  const versoes = dados
    .slice(1)
    .filter((v) => String(v[1]).trim() === String(idContrato).trim());

  const snap1 = versoes.find((v) => Number(v[2]) === Number(v1));
  const snap2 = versoes.find((v) => Number(v[2]) === Number(v2));

  if (!snap1 || !snap2) return [];

  const s1 = JSON.parse(snap1[3]);
  const s2 = JSON.parse(snap2[3]);

  const mapa1 = {};
  const mapa2 = {};

  s1.rubricas.forEach((r) => {
    const nome = r[2];
    mapa1[nome] = Number(r[3]) || 0;
  });

  s2.rubricas.forEach((r) => {
    const nome = r[2];
    mapa2[nome] = Number(r[3]) || 0;
  });

  const todos = new Set([...Object.keys(mapa1), ...Object.keys(mapa2)]);

  const diff = [];

  todos.forEach((nome) => {
    const vAnt = mapa1[nome] || 0;
    const vNovo = mapa2[nome] || 0;

    if (vAnt !== vNovo) {
      diff.push({
        nome,
        valorAnterior: vAnt,
        valorNovo: vNovo,
        tipo: vNovo > vAnt ? "AUMENTO" : vNovo < vAnt ? "REDUCAO" : "IGUAL",
      });
    }
  });

  return diff;
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
    Logger.error('relatorios', 'Erro CODIP', e.message);
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

/**
 * Retorna métricas agregadas do CODIP para o painel de indicadores.
 * @returns {{ totalEstimado, totalReal, totalRegistros, taxaPresenca }}
 */
function obterMetricasCODIP() {
  try {
    var sheet = _getSheet('RelatoriosCODIP');
    if (!sheet || sheet.getLastRow() < 2) {
      return { totalEstimado: 0, totalReal: 0, totalRegistros: 0, taxaPresenca: 0 };
    }
    var dados = sheet.getRange(2, 1, sheet.getLastRow() - 1, 15).getValues();
    var totalPresencial = 0, totalVirtual = 0, count = 0;
    dados.forEach(function(r) {
      if (!r[0]) return;
      count++;
      totalPresencial += Number(r[13]) || 0;
      totalVirtual    += Number(r[14]) || 0;
    });
    var totalReal = totalPresencial + totalVirtual;
    var taxa = totalReal > 0 ? Math.round((totalPresencial / totalReal) * 100) : 0;
    return {
      totalEstimado:  totalPresencial,
      totalReal:      totalReal,
      totalRegistros: count,
      taxaPresenca:   taxa
    };
  } catch (e) {
    Logger.error('relatorios', 'obterMetricasCODIP', e.message);
    return { totalEstimado: 0, totalReal: 0, totalRegistros: 0, taxaPresenca: 0 };
  }
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
    Logger.error('relatorios', 'obterRelatoriosCODIP', e.message);
    return [];
  }
}

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

function _mapaMetas() {
  var mapa = {};
  ContratoRepository.listarMetas().forEach(function(m) { mapa[m.id] = m.titulo; });
  return mapa;
}

function _isAtivoMemoria(v) {
  return v === true || String(v).toUpperCase() === 'SIM';
}

function _mapaRubricas() {
  var mapa = {};
  ContratoRepository.listarRubricas().forEach(function(r) {
    mapa[r.id] = { nome: r.nome, idMeta: r.idMeta };
  });
  return mapa;
}

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

function _obterSnapshotVersao(idContrato, versao) {
  return ContratoRepository.obterSnapshotVersao(idContrato, versao);
}

function compararVersoesContrato(idContrato, v1, v2) {
  const snap1 = _obterSnapshotVersao(idContrato, v1);
  const snap2 = _obterSnapshotVersao(idContrato, v2);

  const resultado = {
    contrato: {},
    metas: [],
    rubricas: [],
    memoria: [],
  };

  // 🔹 CONTRATO (simples)
  if (JSON.stringify(snap1.contrato) !== JSON.stringify(snap2.contrato)) {
    resultado.contrato = {
      antes: snap1.contrato,
      depois: snap2.contrato,
    };
  }

  // 🔹 METAS
  const mapaMeta1 = Object.fromEntries(snap1.metas.map((m) => [m[0], m]));
  const mapaMeta2 = Object.fromEntries(snap2.metas.map((m) => [m[0], m]));

  Object.keys({ ...mapaMeta1, ...mapaMeta2 }).forEach((id) => {
    const m1 = mapaMeta1[id];
    const m2 = mapaMeta2[id];

    if (JSON.stringify(m1) !== JSON.stringify(m2)) {
      resultado.metas.push({ id, antes: m1, depois: m2 });
    }
  });

  // 🔹 RUBRICAS
  const mapaRub1 = Object.fromEntries(snap1.rubricas.map((r) => [r[0], r]));
  const mapaRub2 = Object.fromEntries(snap2.rubricas.map((r) => [r[0], r]));

  Object.keys({ ...mapaRub1, ...mapaRub2 }).forEach((id) => {
    const r1 = mapaRub1[id];
    const r2 = mapaRub2[id];

    if (JSON.stringify(r1) !== JSON.stringify(r2)) {
      resultado.rubricas.push({ id, antes: r1, depois: r2 });
    }
  });

  // 🔹 MEMÓRIA DE CÁLCULO
  const mapaMem1 = Object.fromEntries(snap1.memoria.map((m) => [m[0], m]));
  const mapaMem2 = Object.fromEntries(snap2.memoria.map((m) => [m[0], m]));

  Object.keys({ ...mapaMem1, ...mapaMem2 }).forEach((id) => {
    const m1 = mapaMem1[id];
    const m2 = mapaMem2[id];

    if (JSON.stringify(m1) !== JSON.stringify(m2)) {
      resultado.memoria.push({ id, antes: m1, depois: m2 });
    }
  });

  return resultado;
}

function compararVersoesContratoDetalhado(idContrato, v1, v2) {
  const snap1 = _obterSnapshotVersao(idContrato, v1);
  const snap2 = _obterSnapshotVersao(idContrato, v2);

  const resultado = {
    resumo: {
      totalAntes: 0,
      totalDepois: 0,
      diferenca: 0,
    },
    rubricas: [],
    alteracoes: [],
  };

  // 🔹 MAPEAR MEMÓRIA POR RUBRICA
  function agruparMemoria(memoria) {
    const mapa = {};

    memoria.forEach((m, i) => {
      if (i === 0) return;

      const idRub = m[1];
      const subtotal = Number(m[6] || 0);

      if (!mapa[idRub]) {
        mapa[idRub] = {
          total: 0,
          itens: [],
        };
      }

      mapa[idRub].total += subtotal;
      mapa[idRub].itens.push(m);
    });

    return mapa;
  }

  const mem1 = agruparMemoria(snap1.memoria);
  const mem2 = agruparMemoria(snap2.memoria);

  const todasRubricas = new Set([...Object.keys(mem1), ...Object.keys(mem2)]);

  todasRubricas.forEach((idRub) => {
    const r1 = mem1[idRub] || { total: 0 };
    const r2 = mem2[idRub] || { total: 0 };

    const diff = r2.total - r1.total;

    if (diff !== 0) {
      resultado.rubricas.push({
        idRubrica: idRub,
        antes: r1.total,
        depois: r2.total,
        diferenca: diff,
        tipo: diff > 0 ? "AUMENTO" : "REDUCAO",
      });
    }

    resultado.resumo.totalAntes += r1.total;
    resultado.resumo.totalDepois += r2.total;
  });

  resultado.resumo.diferenca =
    resultado.resumo.totalDepois - resultado.resumo.totalAntes;

  return resultado;
}

function obterRankingImpactoRubricas(idContrato, v1, v2) {
  const diff = compararVersoesContratoDetalhado(idContrato, v1, v2);

  const mapaMetas = _mapaMetas();
  const mapaRubricas = _mapaRubricas();

  return diff.rubricas
    .sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca))
    .map((r) => {
      const rub = mapaRubricas[r.idRubrica] || {};
      const nomeRubrica = rub.nome || "Rubrica desconhecida";
      const nomeMeta = mapaMetas[rub.idMeta] || "Meta desconhecida";

      return {
        idRubrica: r.idRubrica,
        nomeRubrica,
        nomeMeta,
        label: `${nomeMeta} → ${nomeRubrica}`,
        impacto: r.diferenca,
        tipo: r.tipo,
      };
    });
}

function gerarHeatmapAlteracoes(idContrato, v1, v2) {
  const diff = compararVersoesContratoDetalhado(idContrato, v1, v2);

  const mapaMetas = _mapaMetas();
  const mapaRubricas = _mapaRubricas();

  return diff.rubricas.map((r) => {
    const rub = mapaRubricas[r.idRubrica] || {};

    let intensidade = 0;
    if (diff.resumo.totalAntes > 0) {
      intensidade = Math.abs(r.diferenca) / diff.resumo.totalAntes;
    }

    return {
      idRubrica: r.idRubrica,
      nomeMeta: mapaMetas[rub.idMeta] || "Meta desconhecida",
      nomeRubrica: rub.nome || "Rubrica desconhecida",
      label: `${mapaMetas[rub.idMeta] || ""} → ${rub.nome || ""}`,
      intensidade,
      tipo: r.tipo,
    };
  });
}

function gerarAlertasContrato(idContrato, v1, v2) {
  const diff = compararVersoesContratoDetalhado(idContrato, v1, v2);

  const mapaMetas = _mapaMetas();
  const mapaRubricas = _mapaRubricas();

  const alertas = [];

  if (diff.resumo.totalAntes > 0) {
    const percentual = diff.resumo.diferenca / diff.resumo.totalAntes;

    if (percentual > 0.1) {
      alertas.push({
        tipo: "AUMENTO_CRITICO",
        mensagem: "Contrato aumentou mais de 10%",
        percentual,
      });
    }
  }

  diff.rubricas.forEach((r) => {
    const rub = mapaRubricas[r.idRubrica] || {};
    const nomeMeta = mapaMetas[rub.idMeta] || "";
    const nomeRubrica = rub.nome || "";

    if (Math.abs(r.diferenca) > 5000) {
      alertas.push({
        tipo: "RUBRICA_CRITICA",
        label: `${nomeMeta} → ${nomeRubrica}`,
        impacto: r.diferenca,
      });
    }
  });

  return alertas;
}

function obterDashboardComparativoContrato(idContrato, v1, v2) {
  const diff = compararVersoesContratoDetalhado(idContrato, v1, v2);

  return {
    resumo: diff.resumo,
    ranking: obterRankingImpactoRubricas(idContrato, v1, v2),
    heatmap: gerarHeatmapAlteracoes(idContrato, v1, v2),
    alertas: gerarAlertasContrato(idContrato, v1, v2),
  };
}

function obterTimelineContrato(idContrato) {
  const aba = _getSheet("ContratosVersoes");
  const dados = aba.getDataRange().getValues();

  const versoes = dados
    .filter((r, i) => i > 0 && String(r[1]) === String(idContrato))
    .map((r) => ({
      versao: Number(r[2]),
      criadoEm: r[4],
      criadoPor: r[5],
    }))
    .sort((a, b) => a.versao - b.versao);

  const timeline = [];

  for (let i = 1; i < versoes.length; i++) {
    const anterior = versoes[i - 1];
    const atual = versoes[i];

    const diff = compararVersoesContratoDetalhado(
      idContrato,
      anterior.versao,
      atual.versao,
    );

    timeline.push({
      de: anterior.versao,
      para: atual.versao,
      data: atual.criadoEm,
      usuario: atual.criadoPor,
      impacto: diff.resumo.diferenca,
    });
  }

  return timeline;
}

function salvarVersaoContrato(idContrato, email) {
  return ContratoRepository.salvarVersao(idContrato, email);
}


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