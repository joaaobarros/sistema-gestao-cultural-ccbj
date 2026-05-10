# 📄 Análise de Arquivo — mod_favoritos_js.html

## 1. Identificação
- **Nome:** mod_favoritos_js.html
- **Caminho:** `/html/logic/mod_favoritos_js.html`
- **Tipo:** Frontend JS — lógica de módulo
- **Camada:** frontend/logic
- **Módulo:** Favoritos — atalhos rápidos da sidebar com drag-and-drop

---

## 2. Propósito
Gerencia a lista de abas favoritadas pelo usuário na sidebar: persistência via `salvarPreferencia`/`obterPreferencia` (GAS), cache local em `localStorage` para resposta imediata, drag-and-drop para adicionar do menu e reordenar, renderização dinâmica com destaque da aba ativa, limite de 12 favoritos.

---

## 3. Funções

| Função | Descrição |
|--------|-----------|
| `salvarFavoritos()` | Salva no backend (`salvarPreferencia`) com fire-and-forget + atualiza `localStorage` |
| `carregarFavoritos(cb)` | Aplica cache local imediatamente; sincroniza com backend em background; chama `cb` ao fim |
| `iniciarPreferencias(preferencias)` | Compatibilidade com boot legado: aceita objeto `{favoritos:[]}` ou carrega direto do backend |
| `resetarFavoritos()` | Limpa lista + localStorage + persiste |
| `removerFavorito(index)` | Remove por índice, salva e re-renderiza |
| `iniciarDrag(e)` | Inicia drag de item do menu principal |
| `iniciarDragFavorito(e, index)` | Inicia drag de favorito para reordenação |
| `onDragOverItem(e, index)` | Previne default para permitir drop |
| `onDropReorder(e, index)` | Reordena favoritos (splice + insert) |
| `onDropFavoritos(e)` | Adiciona item vindo do menu; verifica deduplicação |
| `onDragOverFavoritos(e)` | Previne default |
| `renderizarFavoritos()` | Gera HTML da lista; limita a 12; destaca aba ativa via `setTimeout(0)` |

---

## 4. Conexões
- **Quem chama:** bootstrap/boot (chama `iniciarPreferencias` após login)
- **Quem é chamado:**
  - `google.script.run.salvarPreferencia` / `obterPreferencia`
  - `mostrarAba(aba)` ao clicar em favorito
  - `localStorage` (cache local)

---

## 5. Funcionalidades
- **Cache otimista:** `localStorage` carrega instantaneamente enquanto backend sincroniza em background — sem flash vazio na tela
- **Drag-and-drop duplo:** item do menu principal → área de favoritos (adicionar) OU entre favoritos → reordenar
- **Deduplicação:** `onDropFavoritos` verifica se o item já existe antes de adicionar
- **Destaque de aba ativa:** `renderizarFavoritos` marca o favorito correspondente à aba aberta com classe `ativo` via `setTimeout(0)` (após o DOM atualizar)

---

## 6. Possíveis Falhas

### 🟠 MÉDIO
- **`salvarFavoritos` é fire-and-forget:** erros de backend são apenas `console.warn` — usuário não é avisado se o favorito não foi salvo; na próxima sessão pode não aparecer.
- **Cache `localStorage` desincronizado:** se o backend retornar um valor diferente (favorito removido em outro dispositivo/sessão), o cache local só é atualizado se a sincronização tiver sucesso — em caso de erro, o usuário vê dados desatualizados para sempre.

### 🟡 BAIXO
- **Limite de 12 aplicado apenas na renderização:** `favoritos.push(dragItem)` pode acumular mais de 12 itens na lista interna; `renderizarFavoritos` exibe apenas os 12 primeiros — itens além do 12 existem mas nunca são visíveis ou removíveis.
- **`dragIndex` compartilhado entre dois handlers (menu e favorito):** ambos usam a variável global `dragOrigem` + `dragIndex`. Se dois drags simultâneos ocorrerem (possível em toque em mobile), o estado pode ficar inconsistente.

---

## 7. Qualidade do Código
**Positivos:**
- Padrão de cache local + sync background é correto para UX responsiva
- Deduplicação no drop é defensiva
- `iniciarPreferencias` com compatibilidade legada é correto

**Médio:**
- Limite de 12 aplicado apenas na renderização (inconsistência de estado)
- Salvamento silencioso sem feedback de falha

---

## 8. Melhorias Sugeridas
- Aplicar limite de 12 em `onDropFavoritos` (antes do push) para evitar estado interno inconsistente
- Adicionar feedback visual quando `salvarFavoritos` falha (breve toast)
- Invalidar cache localStorage se backend retornar array diferente

---

## 9. Papel no Sistema
- **Fluxo:** Boot → `iniciarPreferencias` → `carregarFavoritos` → render + sync; Drag → `onDropFavoritos` → `salvarFavoritos` → render
- **Criticidade:** 🟡 BAIXO — funcionalidade de conveniência; falha não afeta nenhum fluxo principal

---

## 10. Tags
`#frontend` `#favoritos` `#sidebar` `#drag-and-drop` `#localstorage` `#preferencias`

---

## 11. Dependências
- **Depende de:** `google.script.run` (`salvarPreferencia`, `obterPreferencia`), `mostrarAba`, `localStorage`
- **É dependência para:** sidebar (renderiza `#favoritosContainer`)

---

## 12. Relação com Problemas Existentes
- `salvarPreferencia` no backend tem duas implementações incompatíveis (mod_preferencias.gs usa `JSON.stringify`; mod_admin.gs usa `String()`). `carregarFavoritos` usa `JSON.parse(val)` — funciona corretamente com `JSON.stringify`, falha silenciosamente com `String()`.

---

## 13. Alinhamento com a Visão
**Alinhado:** cache otimista, deduplicação, compatibilidade com boot legado
**Desalinhado:** limite de 12 não aplicado na lista interna, salvamento sem feedback de falha
