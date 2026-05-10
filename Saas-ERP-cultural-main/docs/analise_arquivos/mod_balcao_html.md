# 📄 Análise de Arquivo — mod_balcao.html

## 1. Identificação
- **Nome:** mod_balcao.html
- **Caminho:** `/html/modulos/mod_balcao.html`
- **Tipo:** Frontend HTML + JS inline — módulo completo
- **Camada:** frontend/modulos
- **Módulo:** Balcão / Central de Comunicação — processos de produção, entregas, revisões e fila por função

---

## 2. Propósito
Central de Comunicação do CCBJ: gerencia processos de produção (design, foto, vídeo, texto), rastreia entregas por processo, controla ciclo de revisões, e apresenta fila de tarefas por função com 5 modos de visualização (lista/kanban/cards/carga/timeline). Diferente dos outros módulos html, contém ~900 linhas de JavaScript inline além da estrutura HTML.

---

## 3. Funções (JavaScript inline)

### Estado global
| Variável | Tipo | Descrição |
|----------|------|-----------|
| `_balcaoCache` | Array | Lista de processos carregada do backend |
| `_balcaoFuncaoAtual` | String | Função atualmente selecionada (design/foto/video/materia/comunicacao) |
| `_modoFila` | String | Modo de visualização da fila (lista/kanban/cards/carga/timeline) |
| `_FUNCOES_BALCAO` | Array | 5 funções: design, foto, video, materia, comunicacao |
| `ENTREGAS_PADRAO` | Array | 9 tipos de entregas |

### Carregamento e filtragem
| Função | Descrição |
|--------|-----------|
| `carregarBalcao()` | GAS.comunicacaoProcessos.listar → `_balcaoCache` → filtra → conta |
| `_balcaoFiltrar()` | Filtra `_balcaoCache` por texto e status; chama `renderizarBalcao()` |
| `_balcaoRenderizarContadores()` | Badges de status + badge de atraso no header |

### Renderização de processos
| Função | Descrição |
|--------|-----------|
| `renderizarBalcao(lista)` | Tabela de processos com ações (editar, excluir, solicitar revisão) |
| `_balcaoToggle(id)` | Expande/colapsa linha de detalhe de processo |
| `_renderDetalheProcesso(id)` | Injeta detalhe com descrição, entregas e revisão; chama `_renderEntregas` e `_renderRevisao` |
| `_renderEntregas(id)` | GAS.entregas.listarPorProcesso → chips de entrega com link e botão "Concluir" |
| `_renderRevisao(proc)` | Renderiza solicitação de revisão pendente com botões Aprovar/Rejeitar |

### Modal de criação/edição
| Função | Descrição |
|--------|-----------|
| `abrirModalAtendimento(atual)` | SweetAlert2 com form completo (responsável, tipo, status, prazo, entregas) |
| `editarAtendimento(id)` | Busca em `_balcaoCache` e abre modal com dados preenchidos |
| `excluirAtendimento(id)` | SweetAlert2 de confirmação → GAS.comunicacaoProcessos.excluir |

### Revisões
| Função | Descrição |
|--------|-----------|
| `abrirSolicitacaoRevisao(id)` | SweetAlert2 textarea → GAS.revisao.solicitar |
| `_responderRevisao(id, status)` | SweetAlert2 para aprovar/rejeitar revisão → GAS.revisao.responder |

### Fila da função
| Função | Descrição |
|--------|-----------|
| `renderFilaFuncao(funcao)` | GAS.tarefas.listarPorFuncao → renderiza em modo selecionado |
| `_renderFuncaoSelector()` | Botões de seleção de função (design/foto/vídeo/texto/geral) |
| `_selecionarFuncaoFila(funcao, label)` | Atualiza estado e re-renderiza fila |
| `atribuirTarefa(idTarefa, funcao)` | Modal de e-mails → GAS.tarefas.atribuirExecutores |
| `responderFuncao(idTarefa)` | Modal textarea → GAS.tarefas.responderComoFuncao |
| `concluirEntrega(idEntrega)` | Link obrigatório → GAS.entregas.atualizar(status:'Entregue') |
| `concluirEntregaFila(idEntrega)` | Igual, via modal SweetAlert2 |
| `mudarModoFila(modo)` | Persiste em `localStorage.modoFila`; re-renderiza fila |
| `renderFilaFuncaoAtual()` | Alias: `renderFilaFuncao(_balcaoFuncaoAtual)` |

### Kanban DnD
| Função | Descrição |
|--------|-----------|
| `onDragStartKanban(e)` | Captura item arrastado; cria placeholder |
| `onDragOverKanban(e)` | Destaca coluna alvo; posiciona placeholder via `getDragAfterElement` |
| `onDropKanban(e, novoStatus)` | Aplica nova ordem/status no DOM; chama `GAS._call('salvarOrdemKanban', [ordens])` |
| `getDragAfterElement(container, y)` | Calcula posição de inserção por comparação de bounding rects |

---

## 4. Conexões
- **Quem chama:** `window._onShow_aba_balcao` registrado no módulo — acionado por `mostrarAba('aba-balcao')` via dispatch genérico de `navegacao_ui_js.html`
- **Quem é chamado:**
  - `GAS.comunicacaoProcessos.*`: listar, criar, atualizar, excluir
  - `GAS.entregas.*`: listarPorProcesso, atualizar
  - `GAS.revisao.*`: solicitar, responder
  - `GAS.tarefas.*`: listarPorFuncao, atribuirExecutores, responderComoFuncao
  - `GAS._call('salvarOrdemKanban', [ordens])` — chamada direta sem namespace
  - `AppState.mapaNomes` — para datalist de responsável no modal
  - `escaparHTML`, `showLoader`, `temPermissao` — de `mod_ui_componentes_js.html`
  - `SweetAlert2` — modais de ação

---

## 5. Funcionalidades
- **5 modos de visualização da fila:** lista, kanban (3 colunas), cards (grid 2 colunas), carga (barra de workload por executor), timeline (ordenado por prazo)
- **Carga por executor:** modo "carga" calcula `n tarefas por email` e colore barras: ≤3 roxo, >3 âmbar, >5 vermelho — visual de sobrecarga
- **Drag-and-drop Kanban:** `ondragstart/ondragover/ondrop` nativos HTML5; atualiza status e ordem via `GAS._call` otimisticamente
- **Sugestão de entregas por tipo:** `_balcTipoEntregas` mapeia tipo de processo → entregas padrão pré-selecionadas no modal
- **Modo persistido em localStorage:** `modoFila` sobrevive a recarregamentos sem salvar no servidor
- **Ciclo de revisão completo:** solicitação → aprovação/rejeição com comentário — tudo via SweetAlert2
- **Badge de atraso:** `_isAtrasadoBalcao(prazo, status)` verifica se prazo < hoje AND status ≠ concluído; exibe badge vermelho

---

## 6. Possíveis Falhas

### 🔴 CRÍTICO
- **JavaScript inline junto ao HTML (~900 linhas):** viola o padrão do sistema onde HTML e JS são separados — torna o arquivo extremamente longo e mistura responsabilidades de template e lógica.
- **`GAS._call('salvarOrdemKanban', [ordens])` chama a API diretamente:** usa `_call` interno em vez de namespace `GAS.tarefas.salvarOrdem` — acoplamento frágil ao nome interno da função GAS. Se a função for renomeada, o DnD quebra silenciosamente.

### 🟠 MÉDIO
- **`renderFilaFuncao` faz chamada GAS a cada troca de função:** sem cache de fila — cada clique no seletor de função faz round-trip ao servidor. Com 5 funções e usuário alternando, pode causar múltiplas requisições em flight simultâneas.
- **Kanban DnD sem proteção de concorrência:** se dois usuários movem itens Kanban ao mesmo tempo, `salvarOrdemKanban` da última gravação vence — sem merge. A UI de um dos usuários ficará dessincronizada sem aviso.
- **`concluirEntrega` usa `closest('[id^="balcao-detail-content-"]')` para encontrar idProcesso:** seletor frágil que depende da estrutura DOM — se o HTML de detalhe mudar, o link de entrega não atualiza o processo correto.

### 🟡 BAIXO
- **`abrirModalAtendimento` usa `AppState.mapaNomes` sem verificar existência:** se `AppState.mapaNomes` for `undefined` (boot incompleto), `Object.entries(undefined)` lança TypeError.
- **Sem paginação em `renderizarBalcao`:** com muitos processos, a tabela cresce indefinidamente sem limite visual.
- **`_modoFila` e `_balcaoFuncaoAtual` são vars globais:** não encapsuladas em namespace — podem colidir com variáveis de outros módulos.

---

## 7. Qualidade do Código
**Positivos:**
- 5 modos de visualização com lógica de fallback (lista como padrão) é completo e funcional
- `escaparHTML` usado consistentemente em todas as construções de HTML dinâmico
- Badge de atraso e modo "carga" com código de cor são features de UX valiosas
- `_FUNCOES_BALCAO` como array de objetos facilita extensão sem replicar lógica
- `window._onShow_aba_balcao` segue o padrão de extensão genérico do sistema

**Críticos:**
- JS e HTML misturados no mesmo arquivo (~1015 linhas total)
- `GAS._call` direto para salvar ordem Kanban

---

## 8. Melhorias Sugeridas
- Mover o JavaScript para `mod_balcao_js.html` separado, seguindo o padrão do sistema
- Substituir `GAS._call('salvarOrdemKanban', ...)` por `GAS.tarefas.salvarOrdemKanban(...)` com namespace explícito
- Adicionar debounce ou fila de serialização para DnD concorrente
- Cachear `renderFilaFuncao` por função para evitar round-trips repetidos

---

## 9. Papel no Sistema
- **Fluxo de processo:** admin cria processo → atribui responsável → equipe vê na fila de função → executa entrega → conclui com link → solicita revisão se necessário → aprovação/rejeição
- **Fluxo DnD:** arrastar card kanban → atualiza DOM → persiste nova ordem + status via GAS
- **Criticidade:** 🟠 MÉDIO — coordenação de comunicação/produção; bug aqui impacta equipe de comunicação mas não bloqueia agendamentos

---

## 10. Tags
`#frontend` `#html` `#js-inline` `#comunicacao` `#kanban` `#drag-and-drop` `#entregas` `#revisao` `#fila`

---

## 11. Dependências
- **Depende de:** `GAS.comunicacaoProcessos.*`, `GAS.entregas.*`, `GAS.revisao.*`, `GAS.tarefas.*`, `GAS._call`, `AppState.mapaNomes`, `escaparHTML`, `showLoader`, `temPermissao`, `SweetAlert2`, `localStorage`
- **É dependência para:** equipe de comunicação que usa a Central de Comunicação para gerenciar produção

---

## 12. Relação com Problemas Existentes
- Uso de `GAS._call('salvarOrdemKanban', ...)` diretamente é padrão observado somente neste arquivo — pode indicar que `salvarOrdemKanban` não foi exposta no namespace GAS de tarefas, sugerindo função adicionada posteriormente sem seguir o padrão de arquitetura.

---

## 13. Alinhamento com a Visão
**Alinhado:** 5 modos de visualização, carga por executor, ciclo de revisão, badge de atraso, persistência de modo em localStorage, `_onShow_aba_balcao` genérico
**Desalinhado:** JS inline no HTML (maior violação de padrão do projeto), `GAS._call` direto sem namespace, sem cache de fila por função
