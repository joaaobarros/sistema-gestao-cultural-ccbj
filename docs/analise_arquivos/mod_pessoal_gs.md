# 📄 Análise de Arquivo — mod_pessoal.gs

## 1. Identificação
- **Nome:** mod_pessoal.gs
- **Caminho:** `/mod_pessoal.gs`
- **Tipo:** Backend GAS — módulo de negócio
- **Camada:** backend/domínio
- **Módulo:** Pessoal — tarefas, processos, balcão, demandas

---

## 2. Propósito
Gerencia tarefas (kanban), processos internos, atendimentos de balcão e demandas legadas. Usa dois mecanismos de persistência: Drive JSON (via `DataLayer.gs`) para objetos flexíveis, e aba `Tarefas`/`InteracoesTarefas` da planilha PESSOAL para tarefas com interações e atribuição de executores.

---

## 3. Funções

### Tarefas (Drive JSON)
| Função | Descrição |
|--------|-----------|
| `obterTarefas()` | Lê `tarefas.json` |
| `salvarTarefa(dados)` | Upsert com merge (não sobrescreve campos não enviados) |
| `salvarOrdemKanban(ordens)` | Atualiza `ordem` e `status` de múltiplas tarefas de uma vez |
| `excluirTarefa(id)` | Remove por id |

### Processos (Drive JSON)
| Função | Descrição |
|--------|-----------|
| `obterProcessos()` | Lê `processos.json` |
| `salvarProcesso(dados)` | Upsert simples (sem merge) |
| `excluirProcesso(id)` | Remove por id |

### Atendimentos balcão (Drive JSON)
| Função | Descrição |
|--------|-----------|
| `obterAtendimentos()` | Lê `atendimentos.json` |
| `salvarAtendimento(dados)` | Upsert; inicializa status como "Aberto" |
| `excluirAtendimento(id)` | Remove por id |

### Demandas (Drive JSON — legado)
| Função | Descrição |
|--------|-----------|
| `obterDemandas()` | Lê `demandas.json` |
| `registrarDemanda(dados)` | Append-only (sem upsert) |

### Tarefas (Planilha PESSOAL)
| Função | Descrição |
|--------|-----------|
| `criarTarefaPlanilha(dados)` | Append na aba Tarefas da planilha PESSOAL |
| `_registrarInteracaoTarefa(id, dados)` | Append na aba InteracoesTarefas |
| `_atualizarStatusInternoTarefa(id, status)` | Atualiza `Status Interno` por lookup de cabeçalho |
| `atribuirExecutoresTarefa(id, emails)` | Atribui executores e atualiza status; registra interação de atribuição |
| `registrarAtribuicaoTarefa(id, emails, autor)` | Cria interação do tipo "atribuicao" |
| `listarTarefasPorFuncao(funcao)` | Lê planilha Tarefas; filtra por função e status; ordena kanban + prioridade + prazo |

---

## 4. Conexões
- **Quem chama:** Frontend via `GAS.pessoal.*` (bridge)
- **Quem é chamado:**
  - `DataLayer.gs`: `readJSON`, `writeJSON`
  - `Setup.js`: `_abrirAba('PESSOAL', ...)` para funções de planilha
  - `mod_comunicacao_processos.gs` (via `listarEntregasPorProcesso`): chamada em `listarTarefasPorFuncao`

---

## 5. Funcionalidades
- **Dois sistemas de tarefas paralelos:** Drive JSON (flexível, kanban) e planilha PESSOAL (estruturado, com interações e executores). O frontend usa ambos dependendo do contexto.
- **Merge de campos em `salvarTarefa`:** ao contrário de outros módulos, `salvarTarefa` faz merge com `Object.keys` — campos não enviados são preservados
- **Ordenação Kanban rica:** `listarTarefasPorFuncao` ordena por (1) ordem manual kanban, (2) prioridade, (3) prazo

---

## 6. Possíveis Falhas

### 🔴 CRÍTICO
- **Dois sistemas de tarefas desconectados:** `tarefas.json` (Drive) e aba `Tarefas` (planilha PESSOAL) são independentes. Uma tarefa criada via `salvarTarefa` não aparece em `listarTarefasPorFuncao` e vice-versa. Não há sincronização.

### 🟠 MÉDIO
- **Ausência de lock em todos os métodos Drive JSON:** `salvarOrdemKanban` faz read→write sem lock — em uso concorrente (vários usuários reordenando kanban), atualizações são perdidas. O problema é herdado do `DataLayer.gs`.
- **`listarTarefasPorFuncao` chama `listarEntregasPorProcesso` sem verificar se a função existe:** se `mod_comunicacao_processos.gs` não estiver carregado ou a função não existir, o erro é silenciado com `try/catch { t.entregas = [] }` — comportamento mascarado.
- **`salvarProcesso` não faz merge (ao contrário de `salvarTarefa`):** `lista[i] = dados` sobrescreve o objeto inteiro. Se o frontend enviar dados parciais, campos existentes são perdidos.

### 🟡 BAIXO
- **IDs com padrão `tar_/proc_/ate_/dem_/int_` + `Date.now()`:** inconsistente com `gerarId(prefixo)` de utils.js. Em caso de chamadas simultâneas no mesmo milissegundo, IDs colidem.
- **`registrarDemanda` é append-only sem opção de atualização:** marcado como "legado mantido" — sem plano de migração documentado.

---

## 7. Qualidade do Código
**Positivos:**
- Funções concisas e bem separadas por entidade
- Merge em `salvarTarefa` é um cuidado correto para campos opcionais
- Ordenação kanban em `listarTarefasPorFuncao` é sofisticada e bem comentada

**Críticos:**
- Dois sistemas de tarefas paralelos sem integração
- Ausência de lock em operações de escrita concorrente

---

## 8. Melhorias Sugeridas
- Decidir se tarefas vivem no Drive JSON ou na planilha e migrar para um único sistema
- Usar `gerarId(prefixo)` ao invés de `prefix + Date.now()`
- Adicionar lock em `salvarOrdemKanban` (operação especialmente vulnerável a race conditions)
- Aplicar merge em `salvarProcesso` assim como em `salvarTarefa`

---

## 9. Papel no Sistema
- **Fluxo kanban:** Frontend → `GAS.pessoal.salvarTarefa` → `tarefas.json` Drive
- **Fluxo fila por função:** Frontend → `GAS.pessoal.listarTarefasPorFuncao` → planilha Tarefas
- **Criticidade:** 🟠 MÉDIO — falha afeta módulos de produtividade (tarefas, processos, balcão)

---

## 10. Tags
`#backend` `#tarefas` `#processos` `#balcao` `#kanban` `#drive-json` `#planilha`

---

## 11. Dependências
- **Depende de:** `DataLayer.gs`, `Setup.js` (`_abrirAba`), `mod_comunicacao_processos.gs` (`listarEntregasPorProcesso`)
- **É dependência para:** Frontend dos módulos de tarefas, processos e balcão

---

## 12. Relação com Problemas Existentes
- A duplicação tarefas (Drive JSON vs planilha PESSOAL) replica o mesmo problema do almoxarifado: dois sistemas paralelos para a mesma entidade. A planilha PESSOAL tem colunas específicas para `Executores`, `Status Interno`, `Função` — sugerindo que esse é o sistema canônico para tarefas com workflow estruturado.

---

## 13. Alinhamento com a Visão
**Alinhado:** modularidade, merge de campos, ordenação kanban rica
**Desalinhado:** dois sistemas paralelos sem integração, ausência de lock, IDs inconsistentes
