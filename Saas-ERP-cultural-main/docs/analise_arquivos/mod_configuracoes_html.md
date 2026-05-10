# 📄 Análise de Arquivo — mod_configuracoes.html

## 1. Identificação
- **Nome:** mod_configuracoes.html
- **Caminho:** `/html/modulos/mod_configuracoes.html`
- **Tipo:** Frontend HTML — template de aba
- **Camada:** frontend/modulos
- **Módulo:** Configurações — painel de administração (espaços, itens, setores, usuários/permissões)

---

## 2. Propósito
Template HTML da aba de gestão administrativa (`#aba-gestao-admin`): quatro cards colapsáveis — Espaços, Recursos de Almoxarifado, Setores Institucionais e Usuários/Permissões. Cada card tem container de conteúdo populado por JS (`mod_admin_js.html`) e botão de novo registro. O card de Usuários/Permissões tem layout split (lista + editor) para edição inline sem modal.

---

## 3. Estruturas

### Cards e seus containers
| Card | Container | Função de renderização |
|------|-----------|----------------------|
| Espaços | `#tabelaAdminEspacos` | `renderizarEspacosAdmin()` |
| Recursos de Almoxarifado | `#listaAdminItens` | `renderizarItensAdmin()` |
| Setores Institucionais | `#listaAdminSetores` | `renderizarSetoresAdmin()` |
| Usuários e Permissões | `#listaUsuariosPermissoes` + `#editorPermissoes` | `carregarUsuariosPermissoes()` |

### Ações por card
| Card | Ação principal | Ação alternativa |
|------|---------------|-----------------|
| Espaços | `abrirModalConfig('espaco')` | `filtrarLista('tabelaAdminEspacos', this.value)` |
| Almoxarifado | `abrirModalConfig('item')` | `filtrarLista('listaAdminItens', this.value)` |
| Setores | `abrirModalConfig('setor')` | — |
| Usuários | `carregarUsuariosPermissoes()` | — |

### Layout de Usuários/Permissões
- Coluna 1 (1/3): `#listaUsuariosPermissoes` — lista scrollável de usuários
- Coluna 2-3 (2/3): `#editorPermissoes` — editor inline, inicial com "Selecione um usuário"

---

## 4. Conexões
- **Quem chama:** `mostrarAba('aba-gestao-admin')` → dispara `renderizarEspacosAdmin`, `renderizarItensAdmin`, `renderizarSetoresAdmin`, `renderizarAdmins`, `carregarDadosContratos` (lazy em `navegacao_ui_js.html`)
- **Quem é chamado:**
  - `abrirModalConfig(tipo)`, `renderizarEspacosAdmin/ItensAdmin/SetoresAdmin()`, `filtrarLista()`, `toggleCard()` — de `mod_admin_js.html`
  - `carregarUsuariosPermissoes()` — de `mod_admin_js.html` ou `mod_permissoes_v2_js.html`

---

## 5. Funcionalidades
- **Cards colapsáveis:** `toggleCard(id, btnEl)` alterna visibilidade de cada card via JS
- **Busca local inline:** input de busca no header de Espaços e Itens chama `filtrarLista()` em tempo real (sem round-trip)
- **Altura máxima 400px com scroll:** cada card tem `max-h-[400px] overflow-y-auto` — previne overflow de listas longas
- **Editor split para permissões:** layout side-by-side (lista + editor) sem modal — UX mais fluida para editar permissões de usuários

---

## 6. Possíveis Falhas

### 🟠 MÉDIO
- **`#listaUsuariosPermissoes` usa v1 de permissões ou v2?** O botão chama `carregarUsuariosPermissoes()` — não está claro qual função é chamada; pode ser a v1 (simple list) ou a interface de `mod_permissoes_v2_js.html`. Ambos os sistemas coexistem sem separação explícita no HTML.
- **`#editorPermissoes` começa com texto "Selecione um usuário":** se `carregarUsuariosPermissoes()` não preencher `#listaUsuariosPermissoes` por erro de backend, o editor fica inutilizável sem feedback de erro visível.

### 🟡 BAIXO
- **`filtrarLista()` chamada com ID do container:** função genérica que filtra linhas da tabela por texto — mas se `renderizarEspacosAdmin` renderizar divs ao invés de `<tr>`, o filtro falha silenciosamente.
- **Ausência de container de Admins:** a aba `aba-gestao-admin` tem renderização de `renderizarAdmins()` chamada pelo lazy loading, mas não há container `#listaAdminAdmins` neste HTML — o JS que renderiza admins precisa criar seu próprio container ou sobrescrever outro.

---

## 7. Qualidade do Código
**Positivos:**
- Template limpo sem JS inline — responsabilidade única de estrutura
- 4 cards semânticos com separação clara de entidades admin
- Layout split para permissões é UX bem pensada para gestão frequente
- `max-h-[400px]` em todos os containers previne overflow

**Médio:**
- Ausência de container explícito para admins apesar de `renderizarAdmins()` ser chamada no lazy loading

---

## 8. Melhorias Sugeridas
- Adicionar container `#listaAdminAdmins` para tornar o destino de `renderizarAdmins()` explícito no HTML
- Tornar claro no HTML qual sistema de permissões (v1/v2) o card de Usuários usa — um comentário ou atributo `data-version`

---

## 9. Papel no Sistema
- **Fluxo:** admin abre aba → lazy loading renderiza 4 cards → admin clica "Novo" → modal config → salva → recarrega card
- **Criticidade:** 🟠 MÉDIO — ponto de entrada para configuração de toda a infraestrutura do sistema (espaços, itens, permissões)

---

## 10. Tags
`#frontend` `#html` `#admin` `#configuracoes` `#espacos` `#itens` `#setores` `#permissoes` `#template`

---

## 11. Dependências
- **Depende de:** `mod_admin_js.html` (funções de renderização e modal), `mod_permissoes_v2_js.html` (gestão de usuários)
- **É dependência para:** toda a configuração administrativa do sistema

---

## 12. Relação com Problemas Existentes
- `renderizarAdmins()` é chamada pelo lazy loading mas não há container dedicado visível neste HTML — indica que ou o container é gerado dinamicamente pelo JS ou há um bug de destino de renderização.
- A coexistência de permissões v1 e v2 sem separação explícita neste template contribui para a ambiguidade sobre qual sistema está ativo.

---

## 13. Alinhamento com a Visão
**Alinhado:** cards colapsáveis, busca local inline, editor split para permissões, alturas máximas com scroll
**Desalinhado:** ausência de container explícito para admins, ambiguidade sobre qual sistema de permissões é usado
