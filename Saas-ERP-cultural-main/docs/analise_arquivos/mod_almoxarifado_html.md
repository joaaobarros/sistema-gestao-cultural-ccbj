# 📄 Análise de Arquivo — mod_almoxarifado.html

## 1. Identificação
- **Nome:** mod_almoxarifado.html
- **Caminho:** `/html/modulos/mod_almoxarifado.html`
- **Tipo:** Frontend HTML + JS inline — módulo completo
- **Camada:** frontend/modulos
- **Módulo:** Almoxarifado — controle de estoque, movimentações e cadastro de itens

---

## 2. Propósito
Módulo completo de controle de estoque (`#aba-almoxarifado`): carrega lista de itens, filtra por texto/categoria/status, renderiza tabela com estado de estoque (Normal/Baixo/Zerado), e oferece modais de criação/edição e movimentação (entrada/saída). Contém JavaScript inline (~190 linhas) com lógica própria de status derivado.

---

## 3. Funções (JavaScript inline)

| Função | Descrição |
|--------|-----------|
| `_almGetCategorias()` | Mescla categorias padrão (`_ALM_CATS_DEFAULT`) com categorias do cache |
| `_almAtualizarFiltroCategoria()` | Popula `#almFiltroCategoria` com categorias derivadas do cache |
| `_almStatus(item)` | Deriva status: qtd ≤ 0 → Zerado; qtdMinima > 0 && qtd ≤ qtdMinima → Baixo; else → Normal |
| `_almStatusCls(s)` | Retorna estilo inline de cor por status |
| `carregarAlmoxarifado()` | GAS.almoxarifado.listar → `_almoxCache` → popula filtro de categoria → renderiza |
| `_almFiltrar()` | Alias: chama `_almRenderizar()` |
| `_almRenderizar()` | Filtra `_almoxCache` por busca/categoria/status; renderiza tabela com ações condicionais por permissão |
| `abrirModalAlmoxarifado(id)` | SweetAlert2 para criar/editar item (nome, categoria, unidade, qtd, qtdMinima) |
| `_almMovimentar(id)` | SweetAlert2 de movimentação: tipo (entrada/saída), quantidade, observação → GAS.almoxarifado.movimentar |
| `_excluirAlmItem(id)` | Confirmação SweetAlert2 → GAS.almoxarifado.excluir |
| `window._onShow_aba_almoxarifado` | Lazy loading: só carrega se `_almoxCache.length === 0` |

---

## 4. Conexões
- **Quem chama:** `window._onShow_aba_almoxarifado` — dispatch genérico de `navegacao_ui_js.html`
- **Quem é chamado:**
  - `GAS.almoxarifado.*`: listar, salvar, movimentar, excluir
  - `escaparHTML`, `showLoader`, `temPermissao` (mod_ui_componentes_js)
  - `SweetAlert2` — modais

---

## 5. Funcionalidades
- **Status derivado local:** `_almStatus` calcula Normal/Baixo/Zerado no frontend a partir de `qtd` e `qtdMinima` sem round-trip
- **Categorias dinâmicas:** `_almGetCategorias` mescla defaults com categorias reais do cache — select de categoria reflete os itens cadastrados
- **Filtragem imediata:** busca (`oninput`), categoria (`onchange`), status (`onchange`) — sem botão de buscar
- **Ações condicionadas por permissão:** botões Movimentar/Editar/Excluir só são renderizados se `temPermissao` retornar true
- **Estado vazio inteligente:** distingue "estoque vazio" de "nenhum resultado de filtro" com mensagens diferentes

---

## 6. Possíveis Falhas

### 🟠 MÉDIO
- **JavaScript inline junto ao HTML (~190 linhas):** mesmo anti-padrão recorrente no projeto.
- **`_almStatus` com `qtdMinima = 0` nunca gera "Baixo":** `if (min > 0 && qtd <= min)` — itens sem `qtdMinima` configurada nunca ficam "Baixo", apenas "Zerado". Se admin não configurar mínimo, o sistema nunca alerta.
- **Lazy loading com `!_almoxCache.length`:** se `carregarAlmoxarifado()` falhar e retornar `[]`, `_almoxCache` permanece `[]`. Ao re-abrir a aba, `_almoxCache.length === 0` é verdadeiro — re-tenta carregar (comportamento correto para erro, mas pode mascarar cache legítimo vazio).

### 🟡 BAIXO
- **`data-requer-permissao="almoxarifado:editar"` no botão HTML:** atributo declarativo de permissão que não é processado automaticamente — a proteção real está em `temPermissao()` dentro de `_almRenderizar()`. O atributo pode ter sido planejado para um sistema de proteção declarativa que não está implementado.
- **`abrirModalAlmoxarifado` com `qtd` como "Quantidade inicial":** o label diz "inicial" mas ao editar item existente, o campo mostra a quantidade atual — label enganoso para edição.

---

## 7. Qualidade do Código
**Positivos:**
- `_almStatus` como função pura derivada de qtd/qtdMinima é design correto
- `escaparHTML` usado em todos os dados de usuário
- Estado vazio com mensagem contextual diferente por caso (vazio vs. filtrado)
- `temPermissao` verificado por granularidade (editar vs. excluir)

**Médio:**
- JS inline junto ao HTML
- `qtdMinima = 0` nunca gera alerta de "Baixo"

---

## 8. Melhorias Sugeridas
- Corrigir o label "Quantidade inicial" para "Quantidade atual" no modal de edição
- Adicionar aviso quando `qtdMinima === 0` em vez de silenciosamente nunca alertar
- Mover JS para `mod_almoxarifado_js.html` separado

---

## 9. Papel no Sistema
- **Fluxo:** aba abre → `_onShow` → `carregarAlmoxarifado()` → `_almRenderizar()` → tabela de itens → modal de movimentação → GAS.almoxarifado.movimentar
- **Criticidade:** 🟡 BAIXO — suporte operacional; falha aqui não bloqueia agendamentos

---

## 10. Tags
`#frontend` `#html` `#js-inline` `#almoxarifado` `#estoque` `#movimentacao` `#permissoes`

---

## 11. Dependências
- **Depende de:** `GAS.almoxarifado.*`, `escaparHTML`, `showLoader`, `temPermissao`, `SweetAlert2`
- **É dependência para:** controle de estoque de itens volantes do CCBJ; o formulário de nova reserva (`mod_nova_reserva.html`) lista itens do almoxarifado via `AppState`

---

## 12. Relação com Problemas Existentes
- O módulo usa `temPermissao()` mas também declara `data-requer-permissao` como atributo — sugere trabalho inacabado de migração para um sistema de permissão declarativo que nunca foi implementado.

---

## 13. Alinhamento com a Visão
**Alinhado:** status derivado local, categorias dinâmicas, filtragem imediata, ações condicionadas por permissão
**Desalinhado:** JS inline, `qtdMinima=0` nunca gera alerta, label "inicial" enganoso na edição
