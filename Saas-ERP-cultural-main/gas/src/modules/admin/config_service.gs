/**
 * @file modules/admin/config_service.gs
 * @layer modules/admin
 * @description Gerencia CRUD de configurações de espaços, itens, usuários e setores.
 *
 * Opera nas abas: Configuracoes, Itens, Administradores, Listas.
 * Exige perfil admin (ou superadmin para usuários).
 *
 * @depends core/utils.gs (_getSheet, gerarId, registrarLog, limparCacheUsuario,
 *                         verificarPermissao, validarCamposObrigatorios,
 *                         limitarRequisicoes, obterDadosIniciais)
 */

var ConfigService = (function () {

  var _MAPA_ABAS = {
    espaco:  { aba: 'Configuracoes' },
    item:    { aba: 'Itens' },
    usuario: { aba: 'Administradores' },
    setor:   { aba: 'Listas' }
  };

  function salvar(dados) {
    try {
      limitarRequisicoes('salvar_config', 10, 30000);
      if (!dados.emailAtual || !dados.emailAtual.includes('@'))
        throw new Error('Email do usuário não identificado.');
      validarCamposObrigatorios(dados, ['tipo']);

      var tipo = String(dados.tipo || '').toLowerCase().trim();
      if (tipo === 'espaco')   validarCamposObrigatorios(dados, ['nome', 'capacidade']);
      if (tipo === 'item')     validarCamposObrigatorios(dados, ['nome', 'categoria', 'qtd']);
      if (tipo === 'usuario')  validarCamposObrigatorios(dados, ['email', 'nivel']);
      if (tipo === 'setor')    validarCamposObrigatorios(dados, ['nome']);

      if (tipo === 'usuario') verificarPermissao('superadmin', dados.emailAtual);
      else                    verificarPermissao('admin', dados.emailAtual);

      var config = _MAPA_ABAS[tipo];
      if (!config) throw new Error('Tipo inválido: ' + tipo);

      var id   = dados.id ? String(dados.id).trim() : null;
      var nome = String(dados.nome || '').toUpperCase().trim();
      var aba  = _getSheet(config.aba);
      var data = aba.getDataRange().getValues();

      if (id) {
        for (var i = 0; i < data.length; i++) {
          if (String(data[i][0]).trim() === id) {
            var linha      = i + 1;
            var dadosAntes = data[i];
            var dadosDepois = [];

            if (tipo === 'espaco') {
              var emailEsp = String(dados.emailEspaco || '').toLowerCase().trim();
              dadosDepois = [id, nome, Number(dados.capacidade), data[i][3] || '', emailEsp,
                !!dados.possuiChaves, Number(dados.qtdUsoComum || 0), Number(dados.qtdReserva || 0),
                dados.aceitaReserva !== false, !!dados.exigeProtocolo,
                String(dados.localizacaoChave || ''), String(dados.obsInternas || '')];
              aba.getRange(linha, 2, 1, 2).setValues([[nome, Number(dados.capacidade)]]);
              aba.getRange(linha, 5).setValue(emailEsp);
              aba.getRange(linha, 6).setValue(!!dados.possuiChaves);
              aba.getRange(linha, 7).setValue(Number(dados.qtdUsoComum || 0));
              aba.getRange(linha, 8).setValue(Number(dados.qtdReserva || 0));
              aba.getRange(linha, 9).setValue(dados.aceitaReserva !== false);
              aba.getRange(linha, 10).setValue(!!dados.exigeProtocolo);
              aba.getRange(linha, 11).setValue(String(dados.localizacaoChave || ''));
              aba.getRange(linha, 12).setValue(String(dados.obsInternas || ''));
            } else if (tipo === 'item') {
              dadosDepois = [id, nome, dados.categoria, Number(dados.qtd)];
              aba.getRange(linha, 2, 1, 3).setValues([[nome, dados.categoria, Number(dados.qtd)]]);
            } else if (tipo === 'usuario') {
              dadosDepois = [id, dados.nivel];
              aba.getRange(linha, 2).setValue(dados.nivel);
            } else if (tipo === 'setor') {
              dadosDepois = [nome];
              aba.getRange(linha, 1).setValue(nome);
            }

            registrarLog('EDIÇÃO', tipo.toUpperCase(), nome,
              'Editado via painel Admin.', dadosAntes, dadosDepois, dados.emailAtual);
            limparCacheUsuario(dados.emailAtual);
            return obterDadosIniciais(dados.emailAtual);
          }
        }
      }

      var novaLinha = [];
      if (tipo === 'espaco') {
        novaLinha = [gerarId('SAL'), nome, Number(dados.capacidade), '',
          String(dados.emailEspaco || '').toLowerCase().trim(),
          !!dados.possuiChaves, Number(dados.qtdUsoComum || 0), Number(dados.qtdReserva || 0),
          dados.aceitaReserva !== false, !!dados.exigeProtocolo,
          String(dados.localizacaoChave || ''), String(dados.obsInternas || '')];
      } else if (tipo === 'item') {
        novaLinha = [gerarId('ITM'), nome, dados.categoria, Number(dados.qtd), '{}', 'DISPONÍVEL'];
      } else if (tipo === 'usuario') {
        novaLinha = [dados.email.toLowerCase(), dados.nivel];
      } else if (tipo === 'setor') {
        novaLinha = [nome];
      }

      aba.appendRow(novaLinha);
      registrarLog('CRIAÇÃO', tipo.toUpperCase(), nome || dados.email,
        'Criado via painel Admin.', null, novaLinha, dados.emailAtual);
      limparCacheUsuario(dados.emailAtual);
      return obterDadosIniciais(dados.emailAtual);
    } catch (e) {
      throw new Error('Erro no servidor: ' + e.message);
    }
  }

  function remover(id, tipo, emailAtual) {
    try {
      if (tipo === 'usuario') verificarPermissao('superadmin', emailAtual);
      else                    verificarPermissao('admin', emailAtual);

      var mapaAbas = { setor: 'Listas', usuario: 'Administradores', espaco: 'Configuracoes', item: 'Itens' };
      var sheet = _getSheet(mapaAbas[tipo]);
      var dados = sheet.getDataRange().getValues();

      for (var i = dados.length - 1; i >= 1; i--) {
        if (String(dados[i][0]).trim() === String(id).trim()) {
          registrarLog('EXCLUSÃO', tipo.toUpperCase(), String(id),
            'Removido via painel Admin.', dados[i], null, emailAtual);
          sheet.deleteRow(i + 1);
          break;
        }
      }

      limparCacheUsuario(emailAtual);
      return obterDadosIniciais(emailAtual);
    } catch (e) {
      throw new Error(e.message);
    }
  }

  function obterDados(nomeAba) {
    try {
      var aba = _getSheet(nomeAba);
      if (!aba || aba.getLastRow() < 2) return [];
      return aba.getRange(2, 1, aba.getLastRow() - 1, aba.getLastColumn()).getValues();
    } catch (e) {
      console.warn('[ConfigService.obterDados] ' + e.message);
      return [];
    }
  }

  function alternarItem(idItem, idSala, quantidade, acao, emailAtual) {
    try {
      verificarPermissao('admin', emailAtual);
      var abaItens = _getSheet('Itens');
      var dados = abaItens.getDataRange().getValues();

      for (var i = 1; i < dados.length; i++) {
        if (String(dados[i][0]).trim() === String(idItem).trim()) {
          var qtdAtual = Number(dados[i][3]);
          var mapaAlocacao = {};
          try { mapaAlocacao = JSON.parse(String(dados[i][4] || '{}')); } catch(e) {}

          if (acao === 'fixar') {
            if (qtdAtual < quantidade) throw new Error('Estoque insuficiente no almoxarifado!');
            abaItens.getRange(i + 1, 4).setValue(qtdAtual - quantidade);
            mapaAlocacao[idSala] = (mapaAlocacao[idSala] || 0) + quantidade;
          } else {
            var qtdNaSala = mapaAlocacao[idSala] || 0;
            if (qtdNaSala < quantidade) throw new Error('Quantidade na sala insuficiente para liberar!');
            abaItens.getRange(i + 1, 4).setValue(qtdAtual + quantidade);
            mapaAlocacao[idSala] -= quantidade;
            if (mapaAlocacao[idSala] <= 0) delete mapaAlocacao[idSala];
          }

          abaItens.getRange(i + 1, 5).setValue(JSON.stringify(mapaAlocacao));
          limparCacheUsuario(emailAtual);
          return { success: true };
        }
      }
      throw new Error('Item não encontrado!');
    } catch (e) {
      throw new Error(e.message);
    }
  }

  return {
    salvar:       salvar,
    remover:      remover,
    obterDados:   obterDados,
    alternarItem: alternarItem
  };

})();
