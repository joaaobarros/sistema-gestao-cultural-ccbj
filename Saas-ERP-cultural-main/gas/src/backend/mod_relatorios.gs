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
// VERSIONAMENTO / COMPARAÇÃO — delegadores
// ==============================

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