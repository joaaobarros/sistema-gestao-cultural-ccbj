# 📄 Análise de Arquivo — mod_agenda_geral.html

## 1. Identificação
- **Nome:** mod_agenda_geral.html
- **Caminho:** `/html/modulos/mod_agenda_geral.html`
- **Tipo:** Frontend HTML — template de aba
- **Camada:** frontend/modulos
- **Módulo:** Agenda Geral — visualização, filtros e bloqueio de reservas

---

## 2. Propósito
Estrutura HTML completa da aba principal do sistema (`#aba-lista-reservas`): tabela de reservas com filtros avançados, três modos de visualização (Lista/Agenda Google Calendar/Diagrama Gantt), exportação CSV e modal de bloqueio em lote de dias (CCBJ Fechado). É o ponto de entrada principal do sistema para gestão de agenda.

---

## 3. Funções / Estruturas

Nenhuma função JavaScript definida neste arquivo. Todo comportamento é delegado via atributos `onclick`/`onchange`.

### Modos de visualização
| Modo | Elemento | Função disparada |
|------|----------|-----------------|
| Lista | `#tabelaContainerOuter` / `#corpoTabela` | `alternarModoVisualizacao('lista')` |
| Agenda | `#viewAgendaGoogle` | `alternarModoVisualizacao('agenda')` → `renderizarModoAgendaGoogle()` |
| Diagrama | `#viewDiagrama` | `alternarModoVisualizacao('diagrama')` → `renderizarModoDiagrama()` |

### Filtros da lista
| Filtro | ID | Observações |
|--------|-----|-------------|
| Busca de texto | `#filtroBusca` | Texto livre — nome, ID, responsável |
| Setor | `#filtroSetor` | Populado por JS |
| Sala | `#filtroSala` | Populado por JS |
| Status | `#filtroStatus` | Fixo: CONFIRMADO/HABILITADO/CANCELADO |
| Turno | `#filtroTurno` | Fixo: MANHÃ/TARDE/NOITE/combinados/MULTITURNO |
| Período | `#filtroIntervalo` | `onchange="aplicarAtalhoPeriodo()"` |
| Minhas Reservas | `#filtroMinhas` | Toggle checkbox |

### Modal CCBJ Fechado
| Componente | ID | Observações |
|------------|-----|-------------|
| Modal container | `#ccbjModal` | `hidden fixed` — toggle JS |
| Turno bloqueio | `#ccbjTurno` | integral/manhã/tarde/noite |
| Motivo | `#ccbjMotivo` | Campo livre |
| Modos de recorrência | 4 botões `lote-modo-btn` | manual/semanal/intervalo/mensal |
| Calendário | `#ccbjCalInput` (flatpickr) | Input oculto, renderizado pelo flatpickr |
| Preview datas | `#ccbjPreviewDatas` / `#ccbjListaDatas` | Lista de chips com datas selecionadas |

---

## 4. Conexões
- **Quem chama:** `mostrarAba('aba-lista-reservas')` em `navegacao_ui_js.html`; chamada por diversos módulos após salvar (ex: `carregarReservas`)
- **Quem é chamado:**
  - `alternarModoVisualizacao(modo)`, `renderizarReservas()`, `aplicarAtalhoPeriodo()`, `exportarAgendaCSV()` (mod_reservas_js)
  - `renderizarModoAgendaGoogle()`, `renderizarModoDiagrama()` (mod_reservas_js)
  - `bloquearDiaCCBJ()`, `_ccbjFecharModal()`, `_ccbjSelecionarModo()`, `_ccbjGerarDatas()`, `_ccbjConfirmar()`, `_ccbjLimparDatas()` (mod_reservas_js)
  - `limparFiltros()`, `limparFiltrosDiagrama()` (mod_reservas_js)

---

## 5. Funcionalidades
- **Três modos de visualização:** Lista (tabela), Agenda (grid Google Calendar-like por espaço e semana), Diagrama (Gantt semanal por espaço) — modos alternam via `alternarModoVisualizacao`
- **Navegação semanal no modo Agenda/Diagrama:** botões ← / Hoje / → incrementam `window._agendaGoogleSemana` e `window._diagramaSemana`
- **Seleção de data via flatpickr:** `#agendaGoogleDatePicker` para o modo Agenda
- **Modal CCBJ Fechado com 4 modos de recorrência:** manual (click no calendário flatpickr), semanal (dias da semana + período), intervalo (a cada X dias com qtd ou data fim), mensal (3 sub-modos: dia fixo/dia útil/nth semana)
- **Exportação CSV:** `exportarAgendaCSV()` — estado de filtros atual
- **Contador de datas selecionadas:** `#ccbjContadorDatas` atualizado em tempo real ao gerar/clicar datas

---

## 6. Possíveis Falhas

### 🟠 MÉDIO
- **Código do modal CCBJ Fechado duplicado em relação a mod_nova_reserva.html:** ambos os arquivos implementam os mesmos 4 modos de recorrência (manual/semanal/intervalo/mensal) com estrutura HTML quase idêntica. IDs diferentes (prefixo `ccbj-` vs `painel-lote-`), mas lógica JS paralela — manutenção duplicada.
- **`window._agendaGoogleSemana` e `window._diagramaSemana` como globals:** estado de navegação de semana armazenado no namespace global — se dois usuários abrem a mesma aba em abas do browser diferentes, não há isolamento.

### 🟡 BAIXO
- **`#filtroSetor` e `#filtroSala`** têm apenas `<option value="">TODOS...</option>` no HTML — devem ser populados por JS ao carregar reservas; se o carregamento falhar, selects ficam sem opções úteis sem feedback ao usuário.
- **`#tabelaContainerOuter`** não tem altura mínima explícita — se `#corpoTabela` estiver vazio e `#semResultados` não for acionado por bug, a tabela colapsa sem feedback.
- **`#diagramaContainer`** sem altura mínima explícita: se `renderizarModoDiagrama` falhar, container fica invisível.

---

## 7. Qualidade do Código
**Positivos:**
- Três modos de visualização com separação clara de containers (cada modo tem seu `div` dedicado)
- `#semResultados` como estado vazio explícito com mensagem amigável
- Legenda inline no modo Diagrama diretamente no HTML — documentação visual sem depender de JS

**Médio:**
- Duplicação de código de recorrência com mod_nova_reserva.html aumenta risco de divergência
- Globals de estado de semana no namespace window

---

## 8. Melhorias Sugeridas
- Extrair os 4 painéis de recorrência para um componente HTML compartilhado (`_painel_recorrencia.html`) e incluir via `<?!= include() ?>` em ambos os arquivos
- Encapsular `_agendaGoogleSemana` e `_diagramaSemana` em objeto de estado do módulo em vez de globals

---

## 9. Papel no Sistema
- **Fluxo principal:** usuário acessa `aba-lista-reservas` → `renderizarReservas()` popula tabela → filtra/navega → modo Diagrama/Agenda para visão temporal
- **Fluxo CCBJ Fechado:** admin clica → modal → escolhe modo de recorrência → gera datas → confirma → `_ccbjConfirmar()` → GAS bloqueia espaços em lote
- **Criticidade:** 🔴 ALTO — é a aba principal do sistema; qualquer bug de renderização aqui é percebido imediatamente por todos os usuários

---

## 10. Tags
`#frontend` `#html` `#agenda` `#reservas` `#diagrama` `#filtros` `#ccbj-fechado` `#recorrencia`

---

## 11. Dependências
- **Depende de:** `mod_reservas_js.html` (todas as funções de renderização e ação), flatpickr (calendário do modal CCBJ Fechado), `AppState` (via JS)
- **É dependência para:** ponto de entrada principal do sistema; chamada por quase todos os módulos que redirecionam ao salvar

---

## 12. Relação com Problemas Existentes
- A duplicação dos modos de recorrência com `mod_nova_reserva.html` é risco de divergência — se um modo for corrigido em um arquivo e não no outro, os comportamentos de bloqueio em lote e de criação de reservas passam a divergir.

---

## 13. Alinhamento com a Visão
**Alinhado:** três modos de visualização, filtros completos, export CSV, modal de bloqueio em lote com recorrência avançada
**Desalinhado:** duplicação de código de recorrência com mod_nova_reserva.html, globals de estado de navegação semanal
