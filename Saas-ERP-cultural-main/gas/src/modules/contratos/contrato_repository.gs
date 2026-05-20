/**
 * @file modules/contratos/contrato_repository.gs
 * @layer modules/contratos
 * @description Repositório oficial do domínio Contratos.
 *
 * Encapsula todo o acesso a dados de contratos, metas, indicadores,
 * rubricas e versionamento via Sheets (_getSheet). É a única camada
 * autorizada a ler/escrever nessas abas.
 *
 * @depends core/utils.gs (_getSheet, gerarId, registrarLog)
 *          core/logger.gs (Logger)
 *          core/event_bus_backend.gs (SystemEvents)
 *          core/events_constants.gs (SystemEventTypes)
 *          backend/mod_relatorios.gs (parseMoeda, sanitizarTexto)
 */

var ContratoRepository = (function () {

  // ═══════════════════════════════════════════════════════════════
  // CONTRATOS
  // ═══════════════════════════════════════════════════════════════

  function listar() {
    var aba = _getSheet('Contratos');
    if (!aba || aba.getLastRow() < 2) return [];
    var rows = aba.getDataRange().getValues();
    var result = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (!String(r[0]).trim()) continue;
      result.push({
        id:            String(r[0]),
        nome:          String(r[1] || ''),
        numero:        String(r[2] || ''),
        descricao:     String(r[3] || ''),
        vigIni:        r[4] ? String(r[4]) : '',
        vigFim:        r[5] ? String(r[5]) : '',
        status:        String(r[6] || ''),
        valorTotal:    Number(r[7]) || 0,
        fonteRecurso:  String(r[8] || ''),
        contrapartida: Number(r[9]) || 0,
        modalidade:    String(r[10] || ''),
        obsFinanceiro: String(r[11] || ''),
      });
    }
    return result;
  }

  function buscarPorId(id) {
    var idStr = String(id || '').trim();
    var todos = listar();
    for (var i = 0; i < todos.length; i++) {
      if (todos[i].id === idStr) return todos[i];
    }
    return null;
  }

  function salvar(dados, email) {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var aba = _getSheet('Contratos');
      var id = String(dados.id || '').trim();
      var linha = [
        id || gerarId('CTR'),
        String(dados.nome || ''),
        String(dados.numero || ''),
        String(dados.descricao || ''),
        dados.vigIni || '',
        dados.vigFim || '',
        String(dados.status || 'ATIVO'),
        Number(dados.valorTotal) || 0,
        String(dados.fonteRecurso || ''),
        Number(dados.contrapartida) || 0,
        String(dados.modalidade || ''),
        String(dados.obsFinanceiro || ''),
      ];
      if (!id) {
        aba.appendRow(linha);
      } else {
        var rows = aba.getDataRange().getValues();
        var found = false;
        for (var i = 1; i < rows.length; i++) {
          if (String(rows[i][0]).trim() === id) {
            aba.getRange(i + 1, 1, 1, linha.length).setValues([linha]);
            found = true;
            break;
          }
        }
        if (!found) aba.appendRow(linha);
      }
      registrarLog('SALVAR', 'CONTRATO', linha[0], JSON.stringify(dados), '', '', String(email || ''));
      try {
        SystemEvents.emit(
          !id ? SystemEventTypes.CONTRACT_CREATED : SystemEventTypes.CONTRACT_UPDATED,
          { entidade: 'contrato', entidadeId: linha[0],
            usuario: String(email || ''), origem: 'ContratoRepository',
            contexto: { nome: dados.nome || null, numero: dados.numero || null } }
        );
      } catch (_) {}
      return true;
    } catch (e) {
      Logger.error('ContratoRepository', 'salvar', e.message);
      return false;
    } finally {
      lock.releaseLock();
    }
  }

  function excluir(id, email) {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var aba = _getSheet('Contratos');
      var rows = aba.getDataRange().getValues();
      var idStr = String(id || '').trim();
      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim() === idStr) {
          aba.deleteRow(i + 1);
          registrarLog('EXCLUIR', 'CONTRATO', idStr, '', '', '', String(email || ''));
          try {
            SystemEvents.emit(SystemEventTypes.CONTRACT_UPDATED, {
              entidade: 'contrato', entidadeId: idStr,
              usuario: String(email || ''), origem: 'ContratoRepository',
              contexto: { acao: 'excluido' }
            });
          } catch (_) {}
          return true;
        }
      }
      return false;
    } catch (e) {
      Logger.error('ContratoRepository', 'excluir', e.message);
      return false;
    } finally {
      lock.releaseLock();
    }
  }

  function atualizar(id, campos, email) {
    try {
      var atual = buscarPorId(id);
      if (!atual) return false;
      var merged = {};
      for (var k in atual) merged[k] = atual[k];
      for (var k in campos) merged[k] = campos[k];
      merged.id = String(id);
      return salvar(merged, email);
    } catch (e) {
      Logger.error('ContratoRepository', 'atualizar', e.message);
      return false;
    }
  }

  function obterDados() {
    try {
      return {
        contratos:   listar(),
        metas:       listarMetas(),
        indicadores: listarIndicadores(),
        rubricas:    listarRubricas(),
      };
    } catch (e) {
      throw new Error('Erro ao carregar dados: ' + e.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // METAS
  // ═══════════════════════════════════════════════════════════════

  function listarMetas() {
    var aba = _getSheet('Metas');
    if (!aba || aba.getLastRow() < 2) return [];
    var rows = aba.getDataRange().getValues();
    var result = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (!String(r[0]).trim()) continue;
      result.push({
        id:         String(r[0]),
        idContrato: String(r[1] || ''),
        numero:     String(r[2] || ''),
        titulo:     String(r[3] || ''),
        descricao:  String(r[4] || ''),
        tipoMeta:   String(r[5] || 'CONTRATUAL'),
      });
    }
    return result;
  }

  function buscarMetaPorId(id) {
    var idStr = String(id || '').trim();
    var todos = listarMetas();
    for (var i = 0; i < todos.length; i++) {
      if (todos[i].id === idStr) return todos[i];
    }
    return null;
  }

  function salvarMeta(dados, email) {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var aba = _getSheet('Metas');
      var id = String(dados.id || '').trim();
      var linha = [
        id || gerarId('META'),
        String(dados.idContrato || ''),
        String(dados.numero || ''),
        String(dados.titulo || ''),
        String(dados.descricao || ''),
        String(dados.tipoMeta || 'CONTRATUAL'),
      ];
      if (!id) {
        aba.appendRow(linha);
      } else {
        var rows = aba.getDataRange().getValues();
        var found = false;
        for (var i = 1; i < rows.length; i++) {
          if (String(rows[i][0]).trim() === id) {
            aba.getRange(i + 1, 1, 1, linha.length).setValues([linha]);
            found = true;
            break;
          }
        }
        if (!found) aba.appendRow(linha);
      }
      registrarLog('SALVAR', 'META', linha[0], JSON.stringify(dados), '', '', String(email || ''));
      try {
        SystemEvents.emit(SystemEventTypes.INDICATOR_UPDATED, {
          entidade: 'meta', entidadeId: linha[0],
          usuario: String(email || ''), origem: 'ContratoRepository',
          contexto: { titulo: dados.titulo || null, idContrato: dados.idContrato || null }
        });
      } catch (_) {}
      return true;
    } catch (e) {
      Logger.error('ContratoRepository', 'salvarMeta', e.message);
      return false;
    } finally {
      lock.releaseLock();
    }
  }

  function excluirMeta(id, email) {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var aba = _getSheet('Metas');
      var rows = aba.getDataRange().getValues();
      var idStr = String(id || '').trim();
      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim() === idStr) {
          aba.deleteRow(i + 1);
          registrarLog('EXCLUIR', 'META', idStr, '', '', '', String(email || ''));
          return true;
        }
      }
      return false;
    } catch (e) {
      Logger.error('ContratoRepository', 'excluirMeta', e.message);
      return false;
    } finally {
      lock.releaseLock();
    }
  }

  function atualizarMeta(id, campos, email) {
    try {
      var atual = buscarMetaPorId(id);
      if (!atual) return false;
      var merged = {};
      for (var k in atual) merged[k] = atual[k];
      for (var k in campos) merged[k] = campos[k];
      merged.id = String(id);
      return salvarMeta(merged, email);
    } catch (e) {
      Logger.error('ContratoRepository', 'atualizarMeta', e.message);
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // INDICADORES
  // ═══════════════════════════════════════════════════════════════

  function listarIndicadores() {
    var aba = _getSheet('Indicadores');
    if (!aba || aba.getLastRow() < 2) return [];
    var rows = aba.getDataRange().getValues();
    var result = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (!String(r[0]).trim()) continue;
      var meses = [
        Number(r[5]) || 0,  Number(r[6]) || 0,  Number(r[7]) || 0,
        Number(r[8]) || 0,  Number(r[9]) || 0,  Number(r[10]) || 0,
        Number(r[11]) || 0, Number(r[12]) || 0, Number(r[13]) || 0,
        Number(r[14]) || 0, Number(r[15]) || 0, Number(r[16]) || 0,
      ];
      result.push({
        id:             String(r[0]),
        idMeta:         String(r[1] || ''),
        idContrato:     String(r[2] || ''),
        ano:            Number(r[3]) || new Date().getFullYear(),
        texto:          String(r[4] || ''),
        nome:           String(r[4] || ''),
        tipoIndicador:  String(r[17] || 'CONTRATUAL'),
        numero:         String(r[18] || ''),
        meses:          meses,
        q1:  meses[0] + meses[1] + meses[2],
        q2:  meses[3] + meses[4] + meses[5],
        q3:  meses[6] + meses[7] + meses[8],
        q4:  meses[9] + meses[10] + meses[11],
        anual: meses.reduce(function(a, b) { return a + b; }, 0),
      });
    }
    return result;
  }

  function buscarIndicadorPorId(id) {
    var idStr = String(id || '').trim();
    var todos = listarIndicadores();
    for (var i = 0; i < todos.length; i++) {
      if (todos[i].id === idStr) return todos[i];
    }
    return null;
  }

  function salvarIndicador(dados, email) {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var aba = _getSheet('Indicadores');
      var id = String(dados.id || '').trim();
      var anoRef = Number(dados.ano) || new Date().getFullYear();
      var m = dados.meses;
      var mesesArr = [];
      if (m && !Array.isArray(m) && typeof m === 'object') {
        mesesArr = m[anoRef] || m[String(anoRef)] || [];
      } else if (Array.isArray(m)) {
        mesesArr = m;
      }
      while (mesesArr.length < 12) mesesArr.push(0);
      var linha = [
        id || gerarId('IND'),
        String(dados.idMeta || ''),
        String(dados.idContrato || ''),
        anoRef,
        String(dados.nome || dados.texto || ''),
        Number(mesesArr[0]) || 0,  Number(mesesArr[1]) || 0,
        Number(mesesArr[2]) || 0,  Number(mesesArr[3]) || 0,
        Number(mesesArr[4]) || 0,  Number(mesesArr[5]) || 0,
        Number(mesesArr[6]) || 0,  Number(mesesArr[7]) || 0,
        Number(mesesArr[8]) || 0,  Number(mesesArr[9]) || 0,
        Number(mesesArr[10]) || 0, Number(mesesArr[11]) || 0,
        String(dados.tipoIndicador || 'CONTRATUAL'),
        String(dados.numero || ''),
      ];
      if (!id) {
        aba.appendRow(linha);
      } else {
        var rows = aba.getDataRange().getValues();
        var found = false;
        for (var i = 1; i < rows.length; i++) {
          if (String(rows[i][0]).trim() === id) {
            aba.getRange(i + 1, 1, 1, linha.length).setValues([linha]);
            found = true;
            break;
          }
        }
        if (!found) aba.appendRow(linha);
      }
      registrarLog('SALVAR', 'INDICADOR', linha[0], JSON.stringify(dados), '', '', String(email || ''));
      try {
        SystemEvents.emit(SystemEventTypes.INDICATOR_UPDATED, {
          entidade: 'indicador', entidadeId: linha[0],
          usuario: String(email || ''), origem: 'ContratoRepository',
          contexto: { nome: dados.nome || dados.texto || null,
                      idMeta: dados.idMeta || null,
                      idContrato: dados.idContrato || null, ano: anoRef }
        });
      } catch (_) {}
      return true;
    } catch (e) {
      Logger.error('ContratoRepository', 'salvarIndicador', e.message);
      return false;
    } finally {
      lock.releaseLock();
    }
  }

  function excluirIndicador(id, email) {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var aba = _getSheet('Indicadores');
      var rows = aba.getDataRange().getValues();
      var idStr = String(id || '').trim();
      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim() === idStr) {
          aba.deleteRow(i + 1);
          registrarLog('EXCLUIR', 'INDICADOR', idStr, '', '', '', String(email || ''));
          return true;
        }
      }
      return false;
    } catch (e) {
      Logger.error('ContratoRepository', 'excluirIndicador', e.message);
      return false;
    } finally {
      lock.releaseLock();
    }
  }

  function atualizarIndicador(id, campos, email) {
    try {
      var atual = buscarIndicadorPorId(id);
      if (!atual) return false;
      var merged = {};
      for (var k in atual) merged[k] = atual[k];
      for (var k in campos) merged[k] = campos[k];
      merged.id = String(id);
      return salvarIndicador(merged, email);
    } catch (e) {
      Logger.error('ContratoRepository', 'atualizarIndicador', e.message);
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // RUBRICAS
  // ═══════════════════════════════════════════════════════════════

  function listarRubricas() {
    var aba = _getSheet('Rubricas');
    if (!aba || aba.getLastRow() < 2) return [];
    var rows = aba.getDataRange().getValues();
    var result = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (!String(r[0]).trim()) continue;
      result.push({
        id:     String(r[0]),
        idMeta: String(r[1] || ''),
        nome:   String(r[2] || ''),
        valor:  Number(r[3]) || 0,
        obs:    String(r[4] || ''),
      });
    }
    return result;
  }

  function buscarRubricaPorId(id) {
    var idStr = String(id || '').trim();
    var todos = listarRubricas();
    for (var i = 0; i < todos.length; i++) {
      if (todos[i].id === idStr) return todos[i];
    }
    return null;
  }

  function salvarRubrica(dados, email) {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      Logger.info('ContratoRepository', 'salvarRubrica', {
        id: dados.id || null, idMeta: dados.idMeta || null,
        nome: dados.nome || null, itens: (dados.memoriaCalculo || []).length
      });

      if (!dados.idMeta) throw new Error('idMeta é obrigatório.');
      if (!String(dados.nome || '').trim()) throw new Error('Nome da rubrica é obrigatório.');

      var memoriaArr = Array.isArray(dados.memoriaCalculo) ? dados.memoriaCalculo : [];
      if (!memoriaArr.length) throw new Error('Memória de cálculo vazia.');

      var memoriaValidada = memoriaArr.map(function(item) {
        var qtd   = parseMoeda(item.qtd);
        var valor = parseMoeda(item.valor);
        return {
          descricao: String(item.descricao || '').trim(),
          tipo:      String(item.tipo || 'unitario').trim(),
          qtd:       qtd,
          valor:     valor,
          subtotal:  qtd * valor,
          obs:       String(item.obs || '').trim(),
        };
      });

      var valorCalculado = memoriaValidada.reduce(function(s, i) {
        return s + i.subtotal;
      }, 0);
      if (valorCalculado <= 0) throw new Error('Valor total inválido.');

      var aba        = _getSheet('Rubricas');
      var abaMemoria = _getSheet('RubricasMemoria');
      if (!aba || !abaMemoria) throw new Error('Abas necessárias não encontradas.');

      var idFinal = String(dados.id || '').trim() || gerarId('RUB');

      var linhaRubrica = [
        idFinal,
        String(dados.idMeta || ''),
        String(dados.nome || '').trim(),
        valorCalculado,
        String(dados.obs || '').trim(),
      ];

      var rows = aba.getDataRange().getValues();
      var found = false;
      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim() === idFinal) {
          aba.getRange(i + 1, 1, 1, linhaRubrica.length).setValues([linhaRubrica]);
          found = true;
          break;
        }
      }
      if (!found) aba.appendRow(linhaRubrica);

      // Limpa memória existente desta rubrica em lote
      if (abaMemoria.getLastRow() > 1) {
        var all = abaMemoria.getRange(2, 1, abaMemoria.getLastRow() - 1, 10).getValues();
        var filtrado = all.filter(function(r) {
          return String(r[1]).trim() !== idFinal;
        });
        abaMemoria.getRange(2, 1, abaMemoria.getLastRow() - 1, 10).clearContent();
        if (filtrado.length) {
          abaMemoria.getRange(2, 1, filtrado.length, 10).setValues(filtrado);
        }
      }

      // Insere nova memória em lote
      var linhasMemoria = memoriaValidada.map(function(item) {
        var descricaoFinal = item.obs
          ? item.descricao + (item.descricao ? ' — ' : '') + item.obs
          : item.descricao;
        return [
          gerarId('MEM'), idFinal, descricaoFinal, item.tipo,
          item.qtd, item.valor, item.subtotal,
          new Date(), String(email || ''), 'SIM'
        ];
      });
      if (linhasMemoria.length) {
        abaMemoria.getRange(abaMemoria.getLastRow() + 1, 1, linhasMemoria.length, 10)
                  .setValues(linhasMemoria);
      }

      // Histórico de alteração
      try {
        var abaHist = _getSheet('RubricasHistorico');
        if (abaHist) {
          abaHist.appendRow([
            new Date(), idFinal, String(email || ''),
            JSON.stringify({ nome: dados.nome, total: valorCalculado, itens: memoriaValidada })
          ]);
        }
      } catch (e) {
        Logger.warn('ContratoRepository', 'Histórico não salvo', e.message);
      }

      registrarLog('SALVAR', 'RUBRICA', idFinal,
        JSON.stringify({ nome: dados.nome, valorCalculado: valorCalculado, itens: memoriaValidada.length }),
        '', '', String(email || ''));

      // Versionamento do contrato pai
      try {
        var idContrato = dados.idContrato || null;
        if (!idContrato && dados.idMeta) {
          var metasSheet = _getSheet('Metas').getDataRange().getValues();
          var meta = metasSheet.filter(function(m) {
            return String(m[0]).trim() === String(dados.idMeta).trim();
          })[0];
          if (meta) idContrato = String(meta[1]).trim();
        }
        if (idContrato) salvarVersao(idContrato, email);
      } catch (e) {
        Logger.warn('ContratoRepository', 'Versionamento', e.message);
      }

      return true;
    } catch (e) {
      Logger.error('ContratoRepository', 'salvarRubrica', e.message);
      throw e;
    } finally {
      lock.releaseLock();
    }
  }

  function excluirRubrica(id, email) {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var aba = _getSheet('Rubricas');
      var rows = aba.getDataRange().getValues();
      var idStr = String(id || '').trim();
      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim() === idStr) {
          aba.deleteRow(i + 1);
          registrarLog('EXCLUIR', 'RUBRICA', idStr, '', '', '', String(email || ''));
          return true;
        }
      }
      return false;
    } catch (e) {
      Logger.error('ContratoRepository', 'excluirRubrica', e.message);
      return false;
    } finally {
      lock.releaseLock();
    }
  }

  function atualizarRubrica(id, campos, email) {
    try {
      var atual = buscarRubricaPorId(id);
      if (!atual) return false;
      var merged = {};
      for (var k in atual) merged[k] = atual[k];
      for (var k in campos) merged[k] = campos[k];
      merged.id = String(id);
      return salvarRubrica(merged, email);
    } catch (e) {
      Logger.error('ContratoRepository', 'atualizarRubrica', e.message);
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // MEMÓRIA DE RUBRICA
  // ═══════════════════════════════════════════════════════════════

  function listarMemoriaRubrica(idRubrica) {
    var aba = _getSheet('RubricasMemoria');
    if (!aba || aba.getLastRow() < 2) return [];
    var dados = aba.getRange(2, 1, aba.getLastRow() - 1, 10).getValues();
    return dados.filter(function(r) {
      return String(r[1]).trim() === String(idRubrica).trim() &&
             String(r[9]).toUpperCase() === 'SIM';
    });
  }

  function obterMemoriaRubrica(idRubrica) {
    var aba = _getSheet('RubricasMemoria');
    if (!aba || aba.getLastRow() < 2) {
      Logger.warn('ContratoRepository', 'obterMemoriaRubrica: aba vazia ou não encontrada');
      return [];
    }
    var lastCol  = aba.getLastColumn();
    var dados    = aba.getRange(2, 1, aba.getLastRow() - 1, lastCol).getValues();
    var headers  = aba.getRange(1, 1, 1, lastCol).getValues()[0];
    function idx(nome) { return headers.indexOf(nome); }
    var iIdRubrica = idx('ID_RUBRICA');
    var iDesc      = idx('DESCRICAO');
    var iTipo      = idx('METRICA');
    var iQtd       = idx('QUANTIDADE');
    var iValor     = idx('VALOR_UNITARIO');
    var iObs       = idx('OBS');
    var iAtivo     = idx('ATIVO');
    return dados
      .filter(function(r) {
        var idLinha = String(r[iIdRubrica] || '').trim();
        var ativo   = iAtivo > -1 ? String(r[iAtivo] || '').trim().toUpperCase() : 'SIM';
        var estaAtivo = ativo === 'SIM' || ativo === 'TRUE' || ativo === '1' || ativo === '';
        return idLinha === String(idRubrica).trim() && estaAtivo;
      })
      .map(function(r) {
        return {
          descricao: String(r[iDesc] || ''),
          tipo:      String(r[iTipo] || 'mensal'),
          qtd:       Number(r[iQtd]) || 0,
          valor:     Number(r[iValor]) || 0,
          obs:       iObs > -1 ? String(r[iObs] || '') : '',
        };
      });
  }

  function obterHistoricoRubrica(idRubrica) {
    var aba = _getSheet('RubricasHistorico');
    if (!aba || aba.getLastRow() < 2) return [];
    var dados = aba.getDataRange().getValues();
    return dados
      .slice(1)
      .filter(function(r) { return String(r[1]).trim() === String(idRubrica).trim(); })
      .map(function(r) {
        var parsed = {};
        try { parsed = JSON.parse(r[3] || '{}'); } catch (_) {}
        return {
          data:     r[0],
          usuario:  r[2],
          nome:     parsed.nome || '',
          total:    Number(parsed.total) || 0,
          itens:    Array.isArray(parsed.itens) ? parsed.itens : [],
        };
      })
      .reverse();
  }

  function adicionarItemMemoria(dados, emailUsuario) {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      if (!dados.idRubrica) throw new Error('Rubrica obrigatória');
      var quantidade   = Number(dados.quantidade || 0);
      var valorUnitario = Number(dados.valorUnitario || 0);
      if (quantidade <= 0 || valorUnitario < 0) throw new Error('Valores inválidos');
      var subtotal = quantidade * valorUnitario;
      var aba = _getSheet('RubricasMemoria');
      aba.appendRow([
        gerarId('MEM'), dados.idRubrica,
        sanitizarTexto(dados.descricao),
        dados.metrica || 'UN',
        quantidade, valorUnitario, subtotal,
        new Date(), emailUsuario, 'SIM',
      ]);
      atualizarValorRubrica(dados.idRubrica);
      return true;
    } finally {
      lock.releaseLock();
    }
  }

  function calcularValorRubrica(idRubrica) {
    var aba = _getSheet('RubricasMemoria');
    if (!aba || aba.getLastRow() < 2) return 0;
    var dados = aba.getRange(2, 1, aba.getLastRow() - 1, 10).getValues();
    return dados.reduce(function(total, r) {
      if (String(r[1]).trim() !== String(idRubrica).trim()) return total;
      if (String(r[9]).toUpperCase() !== 'SIM') return total;
      return total + parseMoeda(r[6]);
    }, 0);
  }

  function atualizarValorRubrica(idRubrica) {
    var valor = calcularValorRubrica(idRubrica);
    var aba   = _getSheet('Rubricas');
    var dados = aba.getDataRange().getValues();
    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][0]) === String(idRubrica)) {
        aba.getRange(i + 1, 4).setValue(valor);
        return true;
      }
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════
  // VERSIONAMENTO
  // ═══════════════════════════════════════════════════════════════

  function criarSnapshot(idContrato, emailUsuario) {
    var abaVersoes = _getSheet('ContratosVersoes');
    var contrato   = buscarPorId(idContrato);
    var metas      = listarMetas().filter(function(m) { return m[1] === idContrato; });
    var rubricas   = listarRubricas();
    var memoria    = _getSheet('RubricasMemoria').getDataRange().getValues();
    var rubricasFiltradas = rubricas.filter(function(r) {
      return metas.some(function(m) { return m[0] === r[1]; });
    });
    var memoriaFiltrada = memoria.filter(function(m, i) {
      if (i === 0) return false;
      return rubricasFiltradas.some(function(r) { return r[0] === m[1]; });
    });
    var snapshot = { contrato: contrato, metas: metas,
                     rubricas: rubricasFiltradas, memoria: memoriaFiltrada };
    var dados  = abaVersoes.getDataRange().getValues();
    var versao = 1;
    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][1]) === String(idContrato)) {
        versao = Math.max(versao, Number(dados[i][2]) + 1);
      }
    }
    abaVersoes.appendRow([
      gerarId('VER'), idContrato, versao,
      JSON.stringify(snapshot), new Date(), emailUsuario,
    ]);
    return versao;
  }

  function obterHistoricoContrato(idContrato) {
    var aba   = _getSheet('ContratosVersoes');
    var dados = aba.getDataRange().getValues();
    return dados
      .filter(function(r, i) {
        return i > 0 && String(r[1]) === String(idContrato);
      })
      .map(function(r) {
        return { versao: r[2], criadoEm: r[4], criadoPor: r[5] };
      });
  }

  function obterSnapshotVersao(idContrato, versao) {
    var aba   = _getSheet('ContratosVersoes');
    var dados = aba.getDataRange().getValues();
    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][1]) === String(idContrato) &&
          Number(dados[i][2]) === Number(versao)) {
        return JSON.parse(dados[i][3]);
      }
    }
    throw new Error('Versão não encontrada');
  }

  function salvarVersao(idContrato, email) {
    if (!idContrato) return false;
    var abaVersoes = _getSheet('ContratosVersoes');
    var contratos  = _getSheet('Contratos').getDataRange().getValues();
    var metas      = _getSheet('Metas').getDataRange().getValues();
    var rubricas   = _getSheet('Rubricas').getDataRange().getValues();
    var memoria    = _getSheet('RubricasMemoria').getDataRange().getValues();

    var contrato = contratos.filter(function(c) {
      return String(c[0]).trim() === String(idContrato).trim();
    })[0];
    if (!contrato) throw new Error('Contrato não encontrado');

    var metasFiltradas = metas.filter(function(m) {
      return String(m[1]).trim() === String(idContrato).trim();
    });
    var rubricasFiltradas = rubricas.filter(function(r) {
      return metasFiltradas.some(function(m) {
        return String(m[0]).trim() === String(r[1]).trim();
      });
    });
    var memoriaFiltrada = memoria.filter(function(mem) {
      return rubricasFiltradas.some(function(r) {
        return String(r[0]).trim() === String(mem[1]).trim();
      });
    });

    var snapshot = { contrato: contrato, metas: metasFiltradas,
                     rubricas: rubricasFiltradas, memoria: memoriaFiltrada };
    var versao = 1;
    if (abaVersoes.getLastRow() > 1) {
      var versoes = abaVersoes.getRange(2, 1, abaVersoes.getLastRow() - 1, 3).getValues();
      var versoesContrato = versoes
        .filter(function(v) { return String(v[1]).trim() === String(idContrato).trim(); })
        .map(function(v) { return Number(v[2]) || 0; });
      if (versoesContrato.length) versao = Math.max.apply(null, versoesContrato) + 1;
    }
    abaVersoes.appendRow([
      gerarId('VERS'), idContrato, versao,
      JSON.stringify(snapshot), new Date(), String(email || ''),
    ]);
    return true;
  }

  // ═══════════════════════════════════════════════════════════════
  // INTERFACE PÚBLICA
  // ═══════════════════════════════════════════════════════════════

  return {
    // Contratos
    listar:          listar,
    buscarPorId:     buscarPorId,
    salvar:          salvar,
    excluir:         excluir,
    atualizar:       atualizar,
    obterDados:      obterDados,

    // Metas
    listarMetas:       listarMetas,
    buscarMetaPorId:   buscarMetaPorId,
    salvarMeta:        salvarMeta,
    excluirMeta:       excluirMeta,
    atualizarMeta:     atualizarMeta,

    // Indicadores
    listarIndicadores:     listarIndicadores,
    buscarIndicadorPorId:  buscarIndicadorPorId,
    salvarIndicador:       salvarIndicador,
    excluirIndicador:      excluirIndicador,
    atualizarIndicador:    atualizarIndicador,

    // Rubricas
    listarRubricas:      listarRubricas,
    buscarRubricaPorId:  buscarRubricaPorId,
    salvarRubrica:       salvarRubrica,
    excluirRubrica:      excluirRubrica,
    atualizarRubrica:    atualizarRubrica,

    // Memória de rubrica
    listarMemoriaRubrica:  listarMemoriaRubrica,
    obterMemoriaRubrica:   obterMemoriaRubrica,
    obterHistoricoRubrica: obterHistoricoRubrica,
    adicionarItemMemoria:  adicionarItemMemoria,
    calcularValorRubrica:  calcularValorRubrica,
    atualizarValorRubrica: atualizarValorRubrica,

    // Versioning
    criarSnapshot:        criarSnapshot,
    obterHistoricoContrato: obterHistoricoContrato,
    obterSnapshotVersao:  obterSnapshotVersao,
    salvarVersao:         salvarVersao,
  };

})();
