/**
 * @file modules/relatorios/documento_service.gs
 * @layer modules/relatorios
 * @description Gera documentos institucionais no Google Drive (PPT, DOC, PDF).
 *
 * @depends SlidesApp, DocumentApp, DriveApp, Utilities
 */

var DocumentoService = (function () {

  function _mapearGraficosPorSecao(secoes, graficos) {
    if (!graficos || !graficos.length) return {};
    var mapa = {};
    secoes.forEach(function(secao, i) {
      if (/dados|uso|horário|grafico|gráfico|estat/i.test(String(secao.titulo || ''))) {
        mapa[i] = graficos.slice(0, 2);
      }
    });
    return mapa;
  }

  function _inserirGrafico(container, g, posLeft, posTop, largura) {
    try {
      var blob = Utilities.newBlob(
        Utilities.base64Decode(g.imagem.split(',')[1]),
        'image/png',
        'grafico.png'
      );
      container.insertImage(blob).setLeft(posLeft).setTop(posTop).setWidth(largura);
    } catch (e) {
      console.warn('[DocumentoService] Erro ao inserir gráfico: ' + e.message);
    }
  }

  function gerar(conteudo) {
    if (!conteudo || !conteudo.secoes) throw new Error('Conteúdo inválido');

    var graficos = conteudo.graficos
      ? conteudo.graficos
      : conteudo.grafico
        ? (Array.isArray(conteudo.grafico) ? conteudo.grafico : [{ imagem: conteudo.grafico }])
        : [];

    var mapaGraficos = _mapearGraficosPorSecao(conteudo.secoes, graficos);
    var fileId, url;

    if (conteudo.formato === 'ppt') {
      var pres  = SlidesApp.create(conteudo.titulo);
      var slides = pres.getSlides();
      if (slides.length) pres.removeSlide(slides[0]);

      var capa = pres.appendSlide(SlidesApp.PredefinedLayout.TITLE);
      capa.getPlaceholder(SlidesApp.PlaceholderType.TITLE).asShape().getText().setText(conteudo.titulo);
      var subtitle = capa.getPlaceholder(SlidesApp.PlaceholderType.SUBTITLE);
      if (subtitle) subtitle.asShape().getText().setText('Relatório gerado automaticamente');

      conteudo.secoes.forEach(function(secao, index) {
        var slide = pres.appendSlide(SlidesApp.PredefinedLayout.BLANK);
        slide.insertTextBox(secao.titulo, 40, 30, 600, 40).getText().getTextStyle().setBold(true).setFontSize(20);
        slide.insertTextBox(secao.conteudo, 40, 80, 300, 250).getText().getTextStyle().setFontSize(12);
        (mapaGraficos[index] || []).forEach(function(g, i) {
          _inserirGrafico(slide, g, 360, 80 + i * 160, 300);
        });
        slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 40, 70, 600, 2).getFill().setSolidFill('#4C1D95');
      });

      fileId = pres.getId();
      url    = pres.getUrl();

    } else if (conteudo.formato === 'doc') {
      var doc  = DocumentApp.create(conteudo.titulo);
      var body = doc.getBody();
      conteudo.secoes.forEach(function(secao, index) {
        body.appendParagraph(secao.titulo).setHeading(DocumentApp.ParagraphHeading.HEADING2);
        body.appendParagraph(secao.conteudo);
        (mapaGraficos[index] || []).forEach(function(g) {
          try {
            var blob = Utilities.newBlob(Utilities.base64Decode(g.imagem.split(',')[1]), 'image/png', 'grafico.png');
            body.appendParagraph('Gráfico:');
            body.appendImage(blob);
          } catch (e) { console.warn('[DocumentoService] ' + e.message); }
        });
      });
      fileId = doc.getId();
      url    = doc.getUrl();

    } else if (conteudo.formato === 'pdf') {
      var docPdf  = DocumentApp.create(conteudo.titulo);
      var bodyPdf = docPdf.getBody();
      conteudo.secoes.forEach(function(secao, index) {
        bodyPdf.appendParagraph(secao.titulo).setHeading(DocumentApp.ParagraphHeading.HEADING2);
        bodyPdf.appendParagraph(secao.conteudo);
        (mapaGraficos[index] || []).forEach(function(g) {
          try {
            var blob = Utilities.newBlob(Utilities.base64Decode(g.imagem.split(',')[1]), 'image/png', 'grafico.png');
            bodyPdf.appendParagraph('Gráfico:');
            bodyPdf.appendImage(blob);
          } catch (e) { console.warn('[DocumentoService] ' + e.message); }
        });
      });
      var file    = DriveApp.getFileById(docPdf.getId());
      var pdfBlob = file.getAs('application/pdf');
      var pdfFile = DriveApp.createFile(pdfBlob).setName(conteudo.titulo + '.pdf');
      file.setTrashed(true);
      fileId = pdfFile.getId();
      url    = pdfFile.getUrl();

    } else {
      throw new Error('Formato não suportado');
    }

    return {
      url:         url,
      downloadUrl: 'https://drive.google.com/uc?export=download&id=' + fileId,
      fileId:      fileId
    };
  }

  return { gerar: gerar };

})();
