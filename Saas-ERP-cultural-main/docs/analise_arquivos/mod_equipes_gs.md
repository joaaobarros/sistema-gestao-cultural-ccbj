# 📄 Análise de Arquivo — mod_equipes.gs

## 1. Identificação
- **Nome:** mod_equipes.gs
- **Caminho:** `/mod_equipes.gs`
- **Tipo:** Backend GAS — módulo de negócio
- **Camada:** backend/domínio
- **Módulo:** Equipes — colaboradores, escalas, avaliações, férias, eficiência

---

## 2. Propósito
Gerencia colaboradores, suas funções/substituições, escalas de trabalho, avaliações e solicitações de férias. Fornece `obterResponsaveisPorTipo` — função central que resolve quem está ativo em cada função em determinado momento, respeitando substituições temporárias. Também calcula métricas de eficiência baseadas nas reservas.

---

## 3. Funções

### Colaboradores
| Função | Descrição |
|--------|-----------|
| `obterFuncionarios()` | Lê `funcionarios.json` |
| `salvarFuncionario(dados)` | Upsert com `findIndex`; inicializa `ativo = true` se novo |
| `excluirFuncionario(id)` | Remove por id sem verificar dependências |

### Responsáveis por função
| Função | Descrição |
|--------|-----------|
| `obterResponsaveisPorTipo(tipo)` | Retorna emails de colaboradores ativos com função direta OU substituição temporária ativa para o tipo |

### Escalas
| Função | Descrição |
|--------|-----------|
| `obterEscalas()` | Lê `escalas.json` |
| `salvarEscala(dados)` | Upsert com id automático |

### Avaliações
| Função | Descrição |
|--------|-----------|
| `obterAvaliacoes()` | Lê `avaliacoes.json` |
| `registrarAvaliacao(dados)` | Append-only com id automático |

### Férias
| Função | Descrição |
|--------|-----------|
| `obterFerias()` | Lê `ferias.json` |
| `solicitarFerias(dados)` | Append com status inicial "Pendente" |

### Eficiência
| Função | Descrição |
|--------|-----------|
| `obterMetricasEficiencia()` | Analisa reservas: total, confirmadas, canceladas, por sala, por mês |

### Integração com planilha
| Função | Descrição |
|--------|-----------|
| `listarEquipePorFuncao(funcao)` | Lê aba `Funcionarios` da planilha EQUIPES; filtra por função ativa |

---

## 4. Conexões
- **Quem chama:** Frontend via `GAS.equipes.*` (bridge); `mod_comunicacao_processos.gs` pode chamar `obterResponsaveisPorTipo`
- **Quem é chamado:**
  - `DataLayer.gs`: `readJSON`, `writeJSON`
  - `Setup.js`: `_abrirAba('EQUIPES', 'Funcionarios')`
  - `mod_reservas.gs`: `obterReservas()` chamada em `obterMetricasEficiencia`

---

## 5. Funcionalidades
- **Resolução de responsáveis com substituições temporárias:** `obterResponsaveisPorTipo` respeita substituições com janela `inicio`–`fim`, permitindo cobertura de ausências sem alterar a função principal
- **Dois repositórios de funcionários paralelos:** `funcionarios.json` (Drive, flexível) e aba `Funcionarios` (planilha EQUIPES, estruturada)
- **Métricas de eficiência derivadas de reservas:** `obterMetricasEficiencia` agrega dados das reservas reais para taxa de cancelamento, ocupação por sala e tendência mensal

---

## 6. Possíveis Falhas

### 🔴 CRÍTICO
- **Dois repositórios de funcionários desconectados:** `funcionarios.json` e a aba `Funcionarios` na planilha EQUIPES são independentes. `obterFuncionarios` retorna do JSON; `listarEquipePorFuncao` lê da planilha. O mesmo colaborador pode estar em um e não no outro.

### 🟠 MÉDIO
- **`obterMetricasEficiencia` assume array 2D de `obterReservas`:** `obterReservas()` retorna array 2D (colunas por posição), mas `obterMetricasEficiencia` acessa `r.status`, `r.sala`, `r.data` como propriedades nomeadas. O código nunca funcionará corretamente pois `r[0..15]` são os valores, não `r.status` etc.
- **Ausência de lock em operações de escrita Drive JSON:** mesma vulnerabilidade de race condition herdada de outros módulos Drive JSON.
- **`excluirFuncionario` sem verificação de referências:** remove colaborador sem verificar se ele é responsável por reservas, escalas ou substituições ativas.

### 🟡 BAIXO
- **IDs com padrão `fun_/esc_/aval_/fer_` + `Date.now()`:** inconsistente com `gerarId(prefixo)`, vulnerável a colisão em chamadas no mesmo milissegundo.
- **`solicitarFerias` sem workflow de aprovação:** cria solicitação com status "Pendente" mas não há função correspondente de aprovação/recusa de férias neste módulo.

---

## 7. Qualidade do Código
**Positivos:**
- `obterResponsaveisPorTipo` é bem implementada — lógica de substituição temporária com janela de datas é correta
- `listarEquipePorFuncao` usa lookup por cabeçalho (robusto contra mudanças de schema)

**Críticos:**
- `obterMetricasEficiencia` está quebrada: acessa `r.status` em array 2D onde deveria ser `r[13]` (índice da coluna Status)
- Dois repositórios de funcionários sem integração

---

## 8. Melhorias Sugeridas
- Corrigir `obterMetricasEficiencia` para acessar colunas por índice (ou usar objeto mapeado)
- Decidir entre Drive JSON ou planilha EQUIPES como fonte canônica de funcionários
- Implementar aprovação/recusa de férias em `solvarFerias`
- Usar `gerarId(prefixo)` ao invés de `prefix + Date.now()`

---

## 9. Papel no Sistema
- **Fluxo responsáveis:** `mod_comunicacao_processos.gs` → `obterResponsaveisPorTipo` → `funcionarios.json`
- **Fluxo listagem:** Frontend → `listarEquipePorFuncao` → planilha EQUIPES.Funcionarios
- **Criticidade:** 🟠 MÉDIO — `obterMetricasEficiencia` está quebrada; `obterResponsaveisPorTipo` é crítica para roteamento de tarefas

---

## 10. Tags
`#backend` `#equipes` `#funcionarios` `#escalas` `#ferias` `#eficiencia` `#substituicoes`

---

## 11. Dependências
- **Depende de:** `DataLayer.gs`, `Setup.js` (`_abrirAba`), `mod_reservas.gs` (`obterReservas`)
- **É dependência para:** `mod_comunicacao_processos.gs`, frontend de equipes

---

## 12. Relação com Problemas Existentes
- O bug de `obterMetricasEficiencia` (acesso a propriedade nomeada em array 2D) é silencioso — o módulo de eficiência retorna dados aparentemente válidos (zeros para confirmadas/canceladas) sem lançar exceção.

---

## 13. Alinhamento com a Visão
**Alinhado:** lógica de substituições temporárias é arquiteturalmente correta; separação por responsabilidade
**Desalinhado:** dois repositórios de funcionários, bug silencioso em métricas de eficiência, workflow de férias incompleto
