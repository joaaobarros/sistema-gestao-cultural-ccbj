# 📄 Análise de Arquivo — mod_admin_js.html

## 1. Identificação
- **Nome:** mod_admin_js.html
- **Caminho:** `/html/logic/mod_admin_js.html`
- **Tipo:** Frontend JS — lógica de módulo
- **Camada:** frontend/logic
- **Módulo:** Admin — painel de configuração completo (espaços, itens, setores, admins, auditoria, dashboard)

---

## 2. Propósito
Maior arquivo de lógica frontend (3568 linhas): centraliza toda a lógica do painel administrativo — renderização de espaços/itens/setores/admins, modal de configuração multi-tipo, rollback de auditoria, log de acessos, sub-abas de auditoria, filtros do dashboard e funções de configuração de donosEspaco com serialização JSON. Único ponto de UI para operações administrativas de configuração do sistema.

---

## 3. Funções

### Renderização de listas (admin)
| Função | Descrição |
|--------|-----------|
| `renderizarEspacosAdmin()` | Renderiza salas com capacidade, donos e itens fixos; carrega itens via `GAS.admin.obterDadosParaConfig('Itens')` para exibir alocação |
| `renderizarItensAdmin(dadosFiltrados?)` | Renderiza itens com barra de disponibilidade (disponíveis vs fixados nas salas) |
| `renderizarSetoresAdmin()` | Badges de setores com editar/excluir |
| `renderizarAdmins()` | Tabela de administradores com nível de acesso |

### Modal de configuração
| Função | Descrição |
|--------|-----------|
| `abrirModalConfig(tipo, id, nome, valor1, valor2)` | Modal multi-tipo: `espaco`/`item`/`usuario`/`setor`; mostra/oculta campos condicionalmente |
| `salvarConfiguracao()` | Coleta dados do modal e chama backend via `GAS.admin.salvarConfiguracao`; recarrega após salvar |
| `fecharModalConfig()` | Fecha modal e limpa estado |

### Donos de espaço
| Função | Descrição |
|--------|-----------|
| `adicionarDono()` | Adiciona entrada ao array `window._donosEspaco` |
| `removerDono(index)` | Remove por índice |
| `renderizarContainerDonos()` | Renderiza lista de donos com campos: email, dias (checkboxes), setor |
| `serializarDonos()` | JSON.stringify do array `_donosEspaco` |

### Patrimônio e itens fixos
| Função | Descrição |
|--------|-----------|
| `atualizarVisualizacaoPatrimonio(idSala)` | Carrega itens da sala e renderiza quantidade fixada |
| `toggleItemFixo(idSala, idItem, delta)` | Incrementa/decrementa item fixo na sala via backend |

### Auditoria
| Função | Descrição |
|--------|-----------|
| `executarRollback()` | Confirmação SweetAlert2 → `GAS.admin.rollbackPorIndice` (somente superadmin) |
| `carregarAuditoria()` | Carrega log via `GAS.admin.obterLogs`; renderiza tabela |
| `renderizarLogs(logs)` | Gera tabela HTML do log de auditoria com ações codificadas por cor |
| `filtrarLogs(valor)` | Filtro de texto em tempo real nas linhas da tabela |
| `rollbackAcao(indice)` | Rollback seletivo de ação específica pelo índice |

### Log de acessos
| Função | Descrição |
|--------|-----------|
| `carregarLogAcessos()` | Carrega log de acessos via `GAS.admin.obterLogAcessos` |
| `filtrarLogAcessos(valor)` | Filtro de texto no log de acessos |

### Sub-abas e dashboard
| Função | Descrição |
|--------|-----------|
| `mostrarSubAbaAuditoria(aba)` | Alterna entre `logs`/`acessos`/`comparativo` |
| `redefinirFiltrosDashboard()` | Reseta seletores de filtro do dashboard |

---

## 4. Conexões
- **Quem chama:** Bootstrap/event listeners de botões do painel admin; `mostrarAba('aba-gestao-admin')` dispara rendering
- **Quem é chamado:**
  - `GAS.admin.*`: `obterDadosParaConfig`, `salvarConfiguracao`, `rollbackPorIndice`, `obterLogs`, `obterLogAcessos`
  - `AppState`: `usuario.isAdmin`, `usuario.isSuperadmin`, `colecoes.salas/itens/setores/administradores`
  - `escaparHTML`, `showLoader` (mod_ui_componentes_js)
  - `SweetAlert2` para confirmações destrutivas
  - `window._donosEspaco` — estado global mutável compartilhado com `modal_config.html`

---

## 5. Funcionalidades
- **Modal multi-tipo:** `abrirModalConfig` serve para 4 tipos de entidade com campos condicionais — código único para CRUD de espaços, itens, setores e admins
- **Cálculo de patrimônio:** `renderizarItensAdmin` computa disponíveis (`qtdDisp`) e fixados (`totalFixado` via JSON do campo `localizacao`) — barra visual com cor condicional
- **Rollback seletivo:** `renderizarLogs` renderiza botão de rollback por linha individual (além do rollback da última ação global)
- **Donos de espaço com granularidade de dias:** `_donosEspaco` permite configurar para quais dias da semana cada dono tem prioridade no espaço

---

## 6. Possíveis Falhas

### 🔴 CRÍTICO
- **`window._donosEspaco` é estado global compartilhado:** `renderizarEspacosAdmin` e `abrirModalConfig` ambos leem/escrevem em `window._donosEspaco` — se o modal for aberto por uma rota diferente sem passar pelo fluxo correto, o array pode ter dados de outra sala residindo na memória.
- **`renderizarEspacosAdmin` faz N+1 chamadas ao backend:** renderiza todas as salas e ENTÃO faz UMA chamada `obterDadosParaConfig('Itens')` — correto. Mas dentro, para cada sala, itera todos os itens — O(salas × itens). Com muitos itens e salas, pode travar o browser por excesso de cálculo síncrono em template strings.

### 🟠 MÉDIO
- **`salvarConfiguracao()` não valida campos obrigatórios antes de enviar:** confia que o HTML do modal impõe `required`, mas botões de submit podem ser acionados programaticamente sem validação — dados incompletos chegam ao backend.
- **`rollbackAcao(indice)` está documentada mas não verificada na leitura:** não foi possível confirmar se todos os caminhos de rollback individual passam por verificação `isSuperadmin` (apenas `executarRollback` verifica explicitamente na leitura dos primeiros 200 linhas).
- **`atualizarVisualizacaoPatrimonio` faz chamada GAS síncrona a cada abertura de modal de espaço:** pode causar flash de loading a cada edição.

### 🟡 BAIXO
- **3568 linhas em um único arquivo:** todo o painel admin (espaços, itens, setores, admins, auditoria, log, sub-abas, patrimônio, donos) em um arquivo — dificulta manutenção.
- **`renderizarLogs` serializa HTML de timestamp/email sem truncamento:** logs muito antigos com muitas entradas geram tabelas imensos sem paginação.

---

## 7. Qualidade do Código
**Positivos:**
- Modal multi-tipo com campos condicionais é padrão elegante para reduzir código de CRUD
- `escaparHTML` usado consistentemente em dados do usuário — sem XSS evidente
- Lógica de patrimônio (disponíveis vs fixados) calculada corretamente no frontend a partir dos dados

**Críticos:**
- Estado global mutável `window._donosEspaco`
- Arquivo muito longo sem divisão por responsabilidade

---

## 8. Melhorias Sugeridas
- Encapsular `_donosEspaco` em closure ou objeto de estado local ao modal
- Adicionar paginação ou limite na `renderizarLogs` (ex: últimas 100 entradas)
- Dividir o arquivo em sub-módulos: `admin_espacos_js.html`, `admin_auditoria_js.html`

---

## 9. Papel no Sistema
- **Fluxo de configuração:** Admin abre aba → renderiza listas de `AppState` → editar/criar → modal → `salvarConfiguracao` → GAS → recarrega `AppState`
- **Fluxo de auditoria:** Admin abre aba → `carregarAuditoria` → `renderizarLogs` → rollback opcional via `GAS.admin.rollbackPorIndice`
- **Criticidade:** 🔴 ALTO — controla configuração de toda a infraestrutura do sistema (espaços, itens, permissões de usuário)

---

## 10. Tags
`#frontend` `#admin` `#espacos` `#itens` `#setores` `#auditoria` `#rollback` `#patrimonio`

---

## 11. Dependências
- **Depende de:** `AppState`, `GAS.admin.*`, `escaparHTML`, `showLoader`, `SweetAlert2`, `window._donosEspaco`
- **É dependência para:** painel de configuração admin (`#aba-gestao-admin`), `modal_config.html` (usa `_donosEspaco`)

---

## 12. Relação com Problemas Existentes
- O tamanho de 3568 linhas reflete o acoplamento de responsabilidades — espaços, itens, setores, admins, auditoria e logs foram consolidados aqui ao longo do tempo sem refatoração.
- `window._donosEspaco` como estado global é o mesmo padrão de estado mutable compartilhado visto em outros módulos.

---

## 13. Alinhamento com a Visão
**Alinhado:** modal multi-tipo reduz duplicação de código CRUD, `escaparHTML` consistente, lógica de patrimônio correta
**Desalinhado:** arquivo de 3568 linhas sem divisão, estado global mutável, auditoria sem paginação
