# 📄 Análise de Arquivo — mod_agenda_rece.html

## 1. Identificação
- **Nome:** mod_agenda_rece.html
- **Caminho:** `/html/modulos/mod_agenda_rece.html`
- **Tipo:** Frontend HTML — template de aba
- **Camada:** frontend/modulos
- **Módulo:** Agenda RECE — visualização da agenda pública do setor RECE

---

## 2. Propósito
Template HTML da aba de Agenda RECE (`#aba-agenda-rece`): exibe eventos cadastrados com dados RECE (categorias, artista, imagem, acesso) em dois modos de visualização (Lista/Agenda semanal), com filtros de busca e datas, e três opções de exportação (CSV, Planilha Excel, PDF). Voltado para a comunicação/publicização de eventos do CCBJ.

---

## 3. Estruturas

### Modos de visualização
| Modo | Botão | Elemento ativo |
|------|-------|---------------|
| Lista | `#btnModoListaRece` | `#tabelaReceWrapper` |
| Agenda semanal | `#btnModoAgendaRece` | `#viewAgendaRece` |

### Filtros
| Filtro | ID | Tipo |
|--------|-----|------|
| Busca | `#receBusca` | Texto (título, artista, categoria) |
| Data Início | `#receFiltroInicio` | `type="date"` |
| Data Fim | `#receFiltroFim` | `type="date"` |

### Ações
| Ação | Função |
|------|--------|
| Filtrar | `renderizarTabelaRece()` |
| CSV | `exportarReceCSV()` |
| Planilha (Excel) | `exportarRecePlanilha()` |
| PDF | `exportarRecePDF()` |
| Redefinir | `limparFiltrosRece()` |

### Tabela Lista (10 colunas)
Título, Datas, Horários, Espaço, Categorias, Artista, Imagem, Acesso, Status, Ações.

### View Agenda
- Navegação semanal: `window._agendaReceSemana` (global, ← / Hoje / →)
- Datepicker: `#agendaReceDatePicker` (flatpickr)
- Filtro de sala: `#agendaReceSala` (select, populado por JS)
- Container: `#agendaReceContainer` (`min-h-[500px]`)

---

## 4. Conexões
- **Quem chama:** `mostrarAba('aba-agenda-rece')` → `carregarReservasRece()` (lazy loading em `navegacao_ui_js.html`)
- **Quem é chamado:**
  - `alternarModoVisualizacaoRece(modo)`, `renderizarTabelaRece()`, `renderizarModoAgendaRece()` (mod_ui_estado_js)
  - `exportarReceCSV()`, `exportarRecePlanilha()`, `exportarRecePDF()` (mod_ui_estado_js)
  - `limparFiltrosRece()` (mod_ui_estado_js)

---

## 5. Funcionalidades
- **3 formatos de exportação:** CSV, Excel e PDF — o único módulo do sistema com exportação triple (outros têm apenas CSV)
- **Coluna Imagem na tabela:** exibe thumbnails das imagens de divulgação dos eventos RECE
- **Agenda semanal RECE:** visualização do tipo "agenda Google" filtrada por sala, para comunicação visual de eventos
- **Contador de resultados:** `#receContador` exibe total de eventos filtrados

---

## 6. Possíveis Falhas

### 🟠 MÉDIO
- **`window._agendaReceSemana` como global:** sem namespace — coexiste com `window._agendaGoogleSemana` e `window._diagramaSemana` no namespace global; naming collision improvável mas possível se outro módulo usar `_agendaReceSemana`.
- **`exportarRecePlanilha()` e `exportarRecePDF()`:** funções mencionadas no HTML mas não verificadas se estão implementadas em `mod_ui_estado_js.html` — se não implementadas, botões lançam erro silencioso no console.

### 🟡 BAIXO
- **Filtros sem disparo automático:** busca e datas não têm `oninput`/`onchange` — usuário precisa clicar "Filtrar" explicitamente após mudar os campos.
- **`#agendaReceContainer` com `min-h-[500px]`:** se a agenda não renderizar por erro JS, o container fica vazio com altura mínima sem feedback ao usuário.

---

## 7. Qualidade do Código
**Positivos:**
- Template limpo sem JS inline — responsabilidade única
- 3 opções de exportação é diferencial de UX para equipe de comunicação
- Estado vazio com ícone e mensagem contextual
- `min-w-[860px]` previne colapso da tabela em mobile

**Médio:**
- Global `window._agendaReceSemana` adiciona ao namespace global sem encapsulamento

---

## 8. Melhorias Sugeridas
- Verificar se `exportarRecePlanilha()` e `exportarRecePDF()` estão implementados; desabilitar botões com `disabled` se não estiverem
- Adicionar `oninput` nos campos de data para disparar filtragem automaticamente

---

## 9. Papel no Sistema
- **Fluxo:** `carregarReservasRece()` carrega eventos com dados RECE → tabela ou agenda → exportação para comunicação
- **Criticidade:** 🟡 BAIXO — visualização de dados já existentes; falha aqui não impede criação de reservas

---

## 10. Tags
`#frontend` `#html` `#rece` `#agenda` `#comunicacao` `#exportacao` `#template`

---

## 11. Dependências
- **Depende de:** `mod_ui_estado_js.html` (todas as funções RECE), flatpickr, `AppState`
- **É dependência para:** visualização e exportação de eventos públicos do CCBJ

---

## 12. Relação com Problemas Existentes
- A aba RECE exibe dados dos campos preenchidos em `mod_nova_reserva.html` (bloco RECE) — a qualidade dos dados depende do preenchimento correto no formulário de reserva.

---

## 13. Alinhamento com a Visão
**Alinhado:** dois modos de visualização, 3 formatos de exportação, estado vazio explícito, coluna Imagem para divulgação
**Desalinhado:** global `window._agendaReceSemana`, ausência de auto-filtragem nos campos de data
