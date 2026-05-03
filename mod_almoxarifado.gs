/**
 * @file mod_almoxarifado.gs
 * @layer backend/modules
 * @description Controle de estoque e movimentações do almoxarifado.
 *              Dados persistidos em Drive JSON via DataLayer.gs.
 */

// ── Itens de Estoque ─────────────────────────────────────

function obterItensAlmoxarifado() {
  return readJSON('almoxarifado.json');
}

function salvarItemAlmoxarifado(dados) {
  var lista = readJSON('almoxarifado.json');
  if (!dados.id) {
    dados.id = 'alm_' + Date.now();
    dados.criadoEm = new Date().toISOString();
    dados.qtd = Number(dados.qtd) || 0;
    dados.qtdMinima = Number(dados.qtdMinima) || 0;
    lista.push(dados);
  } else {
    var encontrado = false;
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].id === dados.id) { lista[i] = dados; encontrado = true; break; }
    }
    if (!encontrado) lista.push(dados);
  }
  writeJSON('almoxarifado.json', lista);
  return { ok: true, id: dados.id };
}

function excluirItemAlmoxarifado(id) {
  var lista = readJSON('almoxarifado.json');
  writeJSON('almoxarifado.json', lista.filter(function(i) { return i.id !== id; }));
  return { ok: true };
}

// ── Movimentações ────────────────────────────────────────

function movimentarEstoque(id, tipo, qtd, obs) {
  var lista = readJSON('almoxarifado.json');
  var item = null;
  for (var i = 0; i < lista.length; i++) {
    if (lista[i].id === id) { item = lista[i]; break; }
  }
  if (!item) return { ok: false, erro: 'Item não encontrado' };

  var qtdNum = Number(qtd) || 0;
  if (tipo === 'entrada') {
    item.qtd = (Number(item.qtd) || 0) + qtdNum;
  } else if (tipo === 'saida') {
    var novaQtd = (Number(item.qtd) || 0) - qtdNum;
    if (novaQtd < 0) return { ok: false, erro: 'Estoque insuficiente' };
    item.qtd = novaQtd;
  } else {
    return { ok: false, erro: 'Tipo inválido (use "entrada" ou "saida")' };
  }

  writeJSON('almoxarifado.json', lista);

  var movs = readJSON('movimentacoes_almox.json');
  movs.push({
    id: 'mov_' + Date.now(),
    idItem: id,
    nomeItem: item.nome || '',
    tipo: tipo,
    qtd: qtdNum,
    obs: obs || '',
    data: new Date().toISOString()
  });
  writeJSON('movimentacoes_almox.json', movs);

  return { ok: true, qtdAtual: item.qtd };
}

function obterMovimentacoes() {
  return readJSON('movimentacoes_almox.json');
}
