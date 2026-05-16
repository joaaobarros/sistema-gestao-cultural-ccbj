/**
 * @file modules/solicitacoes/disponibilidade_engine.gs
 * @layer modules/solicitacoes
 * @description Engine de Disponibilidade Institucional.
 *
 * Valida disponibilidade em três dimensões:
 * 1. FÍSICA: quantidade do item no catálogo vs. reservas ativas
 * 2. ORÇAMENTÁRIA: saldo da rubrica/meta/contrato vs. valor solicitado
 * 3. OPERACIONAL: conflito de datas e limites operacionais
 *
 * @depends modules/solicitacoes/catalogo_engine.gs
 * @depends backend/mod_relatorios.gs (obterContratos, saldoRubrica)
 * @depends core/logger.gs
 */

var DisponibilidadeEngine = (function() {

  // ── Disponibilidade orçamentária ─────────────────────────────────────────────

  function _obterSaldoRubrica(contratoId, metaId, rubricaId) {
    if (!contratoId && !metaId && !rubricaId) {
      return { saldo: null, definido: false };
    }

    try {
      // Busca contratos/metas/rubricas via mod_relatorios
      var contratos = (typeof obterContratos === 'function') ? obterContratos() : [];
      var contrato  = contratos.find(function(c) { return c.id === contratoId; });

      if (!contrato) return { saldo: null, definido: false, erro: 'Contrato não encontrado' };

      // Busca meta dentro do contrato
      var metas = contrato.metas || [];
      var meta  = metaId ? metas.find(function(m) { return m.id === metaId; }) : null;

      if (metaId && !meta) return { saldo: null, definido: false, erro: 'Meta não encontrada' };

      // Busca rubrica dentro da meta
      var rubricas  = meta ? (meta.rubricas || []) : [];
      var rubrica   = rubricaId ? rubricas.find(function(r) { return r.id === rubricaId; }) : null;

      if (rubricaId && !rubrica) return { saldo: null, definido: false, erro: 'Rubrica não encontrada' };

      var origem = rubrica || meta || contrato;
      var valorTotal   = parseFloat(origem.valor || origem.valorTotal || 0);
      var valorExecutado = parseFloat(origem.valorExecutado || origem.executado || 0);
      var saldo        = valorTotal - valorExecutado;

      return {
        saldo:         saldo,
        valorTotal:    valorTotal,
        valorExecutado: valorExecutado,
        definido:      true,
        nivel:         rubrica ? 'rubrica' : (meta ? 'meta' : 'contrato'),
        nome:          origem.nome || origem.descricao || '',
        contratoId:    contratoId,
        metaId:        metaId,
        rubricaId:     rubricaId
      };
    } catch(e) {
      Logger.warn('[DisponibilidadeEngine._obterSaldoRubrica] ' + e.message);
      return { saldo: null, definido: false, erro: e.message };
    }
  }

  return {

    // ── Verificação orçamentária completa ─────────────────────────────────────

    verificarOrcamentario: function(params) {
      var contratoId = params.contratoId || '';
      var metaId     = params.metaId     || '';
      var rubricaId  = params.rubricaId  || '';
      var valor      = parseFloat(params.valor) || 0;

      if (!contratoId && !metaId && !rubricaId) {
        return {
          disponivel:   null,
          saldoRubrica: null,
          valor:        valor,
          mensagem:     'Nenhuma rubrica vinculada. Verificação orçamentária não aplicada.',
          semVinculo:   true
        };
      }

      var saldoInfo = _obterSaldoRubrica(contratoId, metaId, rubricaId);

      if (!saldoInfo.definido) {
        return {
          disponivel:   null,
          saldoRubrica: null,
          valor:        valor,
          mensagem:     saldoInfo.erro || 'Não foi possível verificar o saldo.',
          erro:         true
        };
      }

      var disponivel = saldoInfo.saldo >= valor;

      return {
        disponivel:     disponivel,
        saldoRubrica:   saldoInfo.saldo,
        valorTotal:     saldoInfo.valorTotal,
        valorExecutado: saldoInfo.valorExecutado,
        valor:          valor,
        deficit:        disponivel ? 0 : (valor - saldoInfo.saldo),
        nivel:          saldoInfo.nivel,
        nomeReferencia: saldoInfo.nome,
        mensagem:       disponivel
          ? 'Saldo disponível: R$ ' + saldoInfo.saldo.toFixed(2) + ' (solicitado: R$ ' + valor.toFixed(2) + ')'
          : 'Saldo insuficiente: R$ ' + saldoInfo.saldo.toFixed(2) + ' disponível, R$ ' + valor.toFixed(2) + ' solicitado.'
      };
    },

    // ── Verificação física de itens ───────────────────────────────────────────

    verificarFisico: function(itens) {
      var resultados = [];
      var todosDisponiveis = true;

      (itens || []).forEach(function(item) {
        if (!item.catalogoId) {
          resultados.push({
            itemNome:     item.nome || 'Item sem catálogo',
            disponivel:   true,
            mensagem:     'Item sem catálogo associado — verificação física não aplicada.'
          });
          return;
        }

        try {
          var res = CatalogoEngine.verificarDisponibilidadeFisica(
            item.catalogoId,
            item.quantidade || 1,
            item.dataInicio,
            item.dataFim
          );
          resultados.push(Object.assign({ itemNome: item.nome || item.catalogoId }, res));
          if (!res.disponivel) todosDisponiveis = false;
        } catch(e) {
          resultados.push({ itemNome: item.nome || item.catalogoId, disponivel: false, mensagem: e.message });
          todosDisponiveis = false;
        }
      });

      return {
        todosDisponiveis: todosDisponiveis,
        resultados:       resultados
      };
    },

    // ── Verificação de antecedência mínima ────────────────────────────────────

    verificarAntecedencia: function(itens, dataNecessidade) {
      if (!dataNecessidade) return { ok: true, alertas: [] };

      var agora  = Date.now();
      var dataN  = new Date(dataNecessidade).getTime();
      var diasAte = Math.floor((dataN - agora) / 86400000);
      var alertas = [];

      (itens || []).forEach(function(item) {
        if (!item.catalogoId) return;
        try {
          var catItem = CatalogoEngine.obterPorId(item.catalogoId);
          if (catItem && catItem.requerAntecedencia > 0 && diasAte < catItem.requerAntecedencia) {
            alertas.push({
              item: catItem.nome,
              requer: catItem.requerAntecedencia,
              disponivel: diasAte,
              mensagem: '"' + catItem.nome + '" requer ' + catItem.requerAntecedencia + ' dias de antecedência. Restam ' + diasAte + ' dias.'
            });
          }
        } catch(e) {}
      });

      return { ok: alertas.length === 0, alertas: alertas };
    },

    // ── Verificação completa (física + orçamentária + antecedência) ───────────

    verificarCompleta: function(params) {
      var fisico       = DisponibilidadeEngine.verificarFisico(params.itens);
      var orcamentario = DisponibilidadeEngine.verificarOrcamentario({
        contratoId: params.contratoId,
        metaId:     params.metaId,
        rubricaId:  params.rubricaId,
        valor:      params.valorTotal
      });
      var antecedencia = DisponibilidadeEngine.verificarAntecedencia(params.itens, params.dataNeeded);

      var bloqueante = !fisico.todosDisponiveis ||
        (orcamentario.disponivel === false) ||
        !antecedencia.ok;

      return {
        bloqueante:    bloqueante,
        fisico:        fisico,
        orcamentario:  orcamentario,
        antecedencia:  antecedencia,
        resumo:        bloqueante
          ? 'Verificação detectou impedimentos. Revise itens e orçamento antes de enviar.'
          : 'Disponibilidade verificada. Solicitação pode prosseguir.'
      };
    },

    // ── Sugestões de alternativa (quando item indisponível) ───────────────────

    sugerirAlternativas: function(catalogoId, dataInicio, dataFim) {
      var item = CatalogoEngine.obterPorId(catalogoId);
      if (!item) return [];

      var mesmaCategoria = CatalogoEngine.listar({ categoria: item.categoria });
      var alternativas   = [];

      mesmaCategoria.forEach(function(alt) {
        if (alt.id === catalogoId) return;
        try {
          var disp = CatalogoEngine.verificarDisponibilidadeFisica(alt.id, 1, dataInicio, dataFim);
          if (disp.disponivel) {
            alternativas.push({ id: alt.id, nome: alt.nome, disponivel: disp.disponivelQtd, mensagem: disp.mensagem });
          }
        } catch(e) {}
      });

      return alternativas;
    }

  };
})();
