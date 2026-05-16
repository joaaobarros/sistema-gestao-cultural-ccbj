/**
 * @file modules/solicitacoes/catalogo_engine.gs
 * @layer modules/solicitacoes
 * @description Engine de Catálogo Institucional de Itens e Recursos.
 *
 * Gerencia catálogo configurável de todos os recursos disponíveis para
 * solicitações internas: transporte, alimentação, estrutura técnica,
 * equipamentos, camarim, materiais gráficos, etc.
 *
 * Cada item possui quantidade total, valor, fornecedor de referência,
 * restrições e compatibilidade com contratos/rubricas.
 *
 * @depends core/data_layer.gs
 */

var _CATALOGO_FILE = 'catalogo_itens.json';

// Categorias canônicas do catálogo
var CATEGORIA_CATALOGO = Object.freeze({
  TRANSPORTE:         'transporte',
  ALIMENTACAO:        'alimentacao',
  ESTRUTURA_TECNICA:  'estrutura_tecnica',
  EQUIPAMENTO:        'equipamento',
  CAMARIM:            'camarim',
  MATERIAL_GRAFICO:   'material_grafico',
  PESSOAL:            'pessoal',
  SERVICO:            'servico',
  LOGISTICA:          'logistica',
  OUTRO:              'outro'
});

var LABEL_CATEGORIA_CATALOGO = {
  transporte:       'Transporte',
  alimentacao:      'Alimentação',
  estrutura_tecnica:'Estrutura Técnica',
  equipamento:      'Equipamento',
  camarim:          'Camarim',
  material_grafico: 'Material Gráfico',
  pessoal:          'Pessoal',
  servico:          'Serviço',
  logistica:        'Logística',
  outro:            'Outro'
};

// ── CatalogoEngine ────────────────────────────────────────────────────────────

var CatalogoEngine = (function() {

  function _todos() { return readJSON(_CATALOGO_FILE); }

  function _gerarId() {
    return typeof gerarId === 'function' ? gerarId('cat') : 'cat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  }

  function _validarItem(dados) {
    if (!dados.nome || !dados.nome.trim()) throw new Error('Nome do item é obrigatório.');
    if (!dados.categoria) throw new Error('Categoria é obrigatória.');
    if (dados.quantidadeTotal !== undefined && dados.quantidadeTotal < 0) throw new Error('Quantidade não pode ser negativa.');
    if (dados.valorUnitario !== undefined && dados.valorUnitario < 0) throw new Error('Valor não pode ser negativo.');
  }

  return {

    // ── CRUD ─────────────────────────────────────────────────────────────────

    criar: function(dados, emailCriador) {
      _validarItem(dados);

      var item = {
        id:                    _gerarId(),
        nome:                  dados.nome.trim(),
        categoria:             dados.categoria,
        categoriaLabel:        LABEL_CATEGORIA_CATALOGO[dados.categoria] || dados.categoria,
        descricao:             dados.descricao              || '',
        observacoes:           dados.observacoes            || '',
        quantidadeTotal:       parseFloat(dados.quantidadeTotal) || 0,
        valorUnitario:         parseFloat(dados.valorUnitario)  || 0,
        unidade:               dados.unidade                || 'un',
        fornecedorRef:         dados.fornecedorRef          || '',
        contratosCompativeis:  dados.contratosCompativeis   || [],
        rubricasCompativeis:   dados.rubricasCompativeis    || [],
        restricoes:            dados.restricoes             || '',
        requerAntecedencia:    parseInt(dados.requerAntecedencia) || 0,
        ativo:                 true,
        criadoEm:              new Date().toISOString(),
        atualizadoEm:          new Date().toISOString(),
        criadoPor:             emailCriador || ''
      };

      modifyJSON(_CATALOGO_FILE, function(lista) {
        lista.push(item);
        return lista;
      });

      return item;
    },

    editar: function(id, campos, emailAtor) {
      var item = null;
      modifyJSON(_CATALOGO_FILE, function(lista) {
        var idx = lista.findIndex(function(i) { return i.id === id; });
        if (idx === -1) throw new Error('Item não encontrado: ' + id);

        var permitidos = ['nome', 'categoria', 'descricao', 'observacoes', 'quantidadeTotal',
          'valorUnitario', 'unidade', 'fornecedorRef', 'contratosCompativeis',
          'rubricasCompativeis', 'restricoes', 'requerAntecedencia', 'ativo'];

        permitidos.forEach(function(k) {
          if (campos.hasOwnProperty(k)) lista[idx][k] = campos[k];
        });

        if (campos.categoria) {
          lista[idx].categoriaLabel = LABEL_CATEGORIA_CATALOGO[campos.categoria] || campos.categoria;
        }

        lista[idx].atualizadoEm = new Date().toISOString();
        item = lista[idx];
        return lista;
      });

      return item;
    },

    desativar: function(id) {
      modifyJSON(_CATALOGO_FILE, function(lista) {
        var idx = lista.findIndex(function(i) { return i.id === id; });
        if (idx !== -1) { lista[idx].ativo = false; lista[idx].atualizadoEm = new Date().toISOString(); }
        return lista;
      });
      return { ok: true };
    },

    obterPorId: function(id) {
      return _todos().find(function(i) { return i.id === id; }) || null;
    },

    listar: function(filtros) {
      var lista = _todos();
      filtros = filtros || {};

      if (filtros.apenasAtivos !== false) {
        lista = lista.filter(function(i) { return i.ativo !== false; });
      }
      if (filtros.categoria) {
        lista = lista.filter(function(i) { return i.categoria === filtros.categoria; });
      }
      if (filtros.busca) {
        var q = filtros.busca.toLowerCase();
        lista = lista.filter(function(i) {
          return (i.nome || '').toLowerCase().indexOf(q) !== -1 ||
                 (i.descricao || '').toLowerCase().indexOf(q) !== -1;
        });
      }

      return lista.sort(function(a, b) { return (a.nome || '').localeCompare(b.nome || ''); });
    },

    listarPorCategoria: function() {
      var lista = _todos().filter(function(i) { return i.ativo !== false; });
      var grupos = {};
      lista.forEach(function(item) {
        var cat = item.categoria || 'outro';
        if (!grupos[cat]) grupos[cat] = { categoria: cat, label: LABEL_CATEGORIA_CATALOGO[cat] || cat, itens: [] };
        grupos[cat].itens.push(item);
      });
      return Object.values(grupos);
    },

    // ── Disponibilidade física de um item em data/período ─────────────────────

    verificarDisponibilidadeFisica: function(catalogoId, quantidade, dataInicio, dataFim) {
      var item = CatalogoEngine.obterPorId(catalogoId);
      if (!item) throw new Error('Item não encontrado no catálogo: ' + catalogoId);
      if (!item.ativo) throw new Error('Item inativo: ' + item.nome);

      var totalDisponivel = parseFloat(item.quantidadeTotal) || 0;
      if (totalDisponivel === 0) {
        return { disponivel: true, mensagem: 'Quantidade ilimitada (serviço/pessoal)' };
      }

      // Conta quantidades já reservadas no período por solicitações aprovadas/em execução
      var statusEmUso = [STATUS_SOLICITACAO.APROVADA, STATUS_SOLICITACAO.PARCIAL, STATUS_SOLICITACAO.EM_EXECUCAO];
      var solicitacoes = SolicitacaoRepository.listarAbertos();
      var quantidadeEmUso = 0;

      solicitacoes.forEach(function(sol) {
        if (statusEmUso.indexOf(sol.status) === -1) return;

        (sol.itens || []).forEach(function(si) {
          if (si.catalogoId !== catalogoId) return;

          // Verifica sobreposição de período
          var siIni = si.dataInicio ? new Date(si.dataInicio).getTime() : 0;
          var siFim = si.dataFim ? new Date(si.dataFim).getTime() : Infinity;
          var reqIni = dataInicio ? new Date(dataInicio).getTime() : 0;
          var reqFim = dataFim ? new Date(dataFim).getTime() : Infinity;

          if (siIni <= reqFim && siFim >= reqIni) {
            quantidadeEmUso += parseFloat(si.quantidade) || 0;
          }
        });
      });

      var disponivel = (totalDisponivel - quantidadeEmUso) >= (parseFloat(quantidade) || 1);

      return {
        disponivel:        disponivel,
        totalItem:         totalDisponivel,
        emUso:             quantidadeEmUso,
        disponivelQtd:     totalDisponivel - quantidadeEmUso,
        solicitado:        parseFloat(quantidade) || 1,
        mensagem:          disponivel
          ? 'Disponível: ' + (totalDisponivel - quantidadeEmUso) + ' de ' + totalDisponivel
          : 'Indisponível: apenas ' + (totalDisponivel - quantidadeEmUso) + ' disponível(is) de ' + totalDisponivel
      };
    },

    // ── Inicializar catálogo com itens padrão CCBJ ────────────────────────────

    inicializarCatalogoPadrao: function(emailAtor) {
      var existentes = _todos();
      if (existentes.length > 0) return { ok: true, mensagem: 'Catálogo já inicializado.', total: existentes.length };

      var itensPadrao = [
        // Transporte
        { nome: 'Van 20 lugares', categoria: 'transporte', quantidadeTotal: 2, valorUnitario: 0, unidade: 'diária', descricao: 'Van de 20 lugares para transporte de grupo' },
        { nome: 'Microônibus 35 lugares', categoria: 'transporte', quantidadeTotal: 1, valorUnitario: 0, unidade: 'diária', descricao: 'Microônibus para eventos e traslados' },
        { nome: 'Veículo de apoio', categoria: 'transporte', quantidadeTotal: 3, valorUnitario: 0, unidade: 'diária', descricao: 'Veículo de apoio operacional' },
        // Alimentação
        { nome: 'Kit lanche infantil', categoria: 'alimentacao', quantidadeTotal: 0, valorUnitario: 0, unidade: 'unidade', descricao: 'Kit lanche para público infantil' },
        { nome: 'Refeição adulto', categoria: 'alimentacao', quantidadeTotal: 0, valorUnitario: 0, unidade: 'unidade', descricao: 'Refeição para equipe e convidados' },
        { nome: 'Coffee break', categoria: 'alimentacao', quantidadeTotal: 0, valorUnitario: 0, unidade: 'kit', descricao: 'Coffee break para reuniões e eventos' },
        { nome: 'Água mineral', categoria: 'alimentacao', quantidadeTotal: 0, valorUnitario: 0, unidade: 'caixa', descricao: 'Água mineral para eventos' },
        // Estrutura técnica
        { nome: 'Palco pequeno (4x6m)', categoria: 'estrutura_tecnica', quantidadeTotal: 1, valorUnitario: 0, unidade: 'evento', descricao: 'Palco metálico pequeno' },
        { nome: 'Palco médio (6x8m)', categoria: 'estrutura_tecnica', quantidadeTotal: 1, valorUnitario: 0, unidade: 'evento', descricao: 'Palco metálico médio' },
        { nome: 'Sistema de sonorização P', categoria: 'estrutura_tecnica', quantidadeTotal: 2, valorUnitario: 0, unidade: 'evento', descricao: 'Sistema de som para eventos pequenos' },
        { nome: 'Sistema de sonorização G', categoria: 'estrutura_tecnica', quantidadeTotal: 1, valorUnitario: 0, unidade: 'evento', descricao: 'Sistema de som para grandes eventos' },
        { nome: 'Kit iluminação cênica', categoria: 'estrutura_tecnica', quantidadeTotal: 2, valorUnitario: 0, unidade: 'evento', descricao: 'Kit de iluminação para apresentações' },
        { nome: 'Gerador de energia', categoria: 'estrutura_tecnica', quantidadeTotal: 1, valorUnitario: 0, unidade: 'diária', descricao: 'Gerador para áreas sem energia' },
        // Camarim
        { nome: 'Camarim grande porte', categoria: 'camarim', quantidadeTotal: 2, valorUnitario: 0, unidade: 'uso', descricao: 'Camarim completo para grandes produções' },
        { nome: 'Camarim pequeno', categoria: 'camarim', quantidadeTotal: 3, valorUnitario: 0, unidade: 'uso', descricao: 'Camarim individual' },
        { nome: 'Kit camarim básico', categoria: 'camarim', quantidadeTotal: 0, valorUnitario: 0, unidade: 'kit', descricao: 'Itens básicos de camarim (espelho, cadeiras, mesa)' },
        // Material gráfico
        { nome: 'Banner padrão 120x180cm', categoria: 'material_grafico', quantidadeTotal: 0, valorUnitario: 0, unidade: 'unidade', descricao: 'Banner lona vinílica padrão' },
        { nome: 'Folder A4 (500 unidades)', categoria: 'material_grafico', quantidadeTotal: 0, valorUnitario: 0, unidade: 'kit', descricao: 'Folder A4 frente e verso' },
        { nome: 'Cartaz A3', categoria: 'material_grafico', quantidadeTotal: 0, valorUnitario: 0, unidade: 'unidade', descricao: 'Cartaz A3 para divulgação' },
        { nome: 'Adesivos', categoria: 'material_grafico', quantidadeTotal: 0, valorUnitario: 0, unidade: 'kit', descricao: 'Adesivos institucionais' },
        // Equipamento
        { nome: 'Projetor multimídia', categoria: 'equipamento', quantidadeTotal: 3, valorUnitario: 0, unidade: 'evento', descricao: 'Projetor HDMI Full HD' },
        { nome: 'Tela de projeção', categoria: 'equipamento', quantidadeTotal: 3, valorUnitario: 0, unidade: 'evento', descricao: 'Tela retrátil 2m x 2m' },
        { nome: 'Câmera fotográfica', categoria: 'equipamento', quantidadeTotal: 2, valorUnitario: 0, unidade: 'diária', descricao: 'Câmera para registro de eventos' },
        { nome: 'Notebook', categoria: 'equipamento', quantidadeTotal: 4, valorUnitario: 0, unidade: 'diária', descricao: 'Notebook para uso em evento' }
      ];

      var criados = 0;
      itensPadrao.forEach(function(dados) {
        try {
          CatalogoEngine.criar(dados, emailAtor || 'sistema');
          criados++;
        } catch(e) {
          Logger.warn('[CatalogoEngine.inicializarCatalogoPadrao] ' + dados.nome + ': ' + e.message);
        }
      });

      return { ok: true, criados: criados };
    }

  };
})();
