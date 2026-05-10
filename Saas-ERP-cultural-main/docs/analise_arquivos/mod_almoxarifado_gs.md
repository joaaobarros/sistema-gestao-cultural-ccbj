# 📄 Análise de Arquivo — mod_almoxarifado.gs

## 1. Identificação
- **Nome:** mod_almoxarifado.gs
- **Caminho:** `/mod_almoxarifado.gs`
- **Tipo:** Backend GAS — módulo de negócio
- **Camada:** backend/domínio
- **Módulo:** Almoxarifado — estoque e movimentações via Drive JSON

---

## 2. Propósito
Controla o estoque do almoxarifado com persistência em arquivos JSON no Drive (via `DataLayer.gs`). Gerencia itens de estoque (CRUD) e movimentações de entrada/saída com histórico. É o segundo sistema de itens do CCBJ — paralelo ao sistema de itens/salas em `mod_admin.gs` (aba `Itens` na planilha ESPACOS).

---

## 3. Funções

| Função | Descrição |
|--------|-----------|
| `obterItensAlmoxarifado()` | Lê `almoxarifado.json` — retorna lista de itens |
| `salvarItemAlmoxarifado(dados)` | Upsert: cria com `alm_timestamp` se sem id, atualiza se id existente |
| `excluirItemAlmoxarifado(id)` | Remove item por id; não verifica movimentações pendentes |
| `movimentarEstoque(id, tipo, qtd, obs)` | Entrada/saída com validação de estoque negativo; grava movimentação em `movimentacoes_almox.json` |
| `obterMovimentacoes()` | Lê `movimentacoes_almox.json` — retorna histórico completo |

---

## 4. Conexões
- **Quem chama:** Frontend via `GAS.almoxarifado.*` (bridge)
- **Quem é chamado:** `DataLayer.gs` (`readJSON`, `writeJSON`)
- **Integrações:** dois arquivos Drive JSON — `almoxarifado.json`, `movimentacoes_almox.json`

---

## 5. Funcionalidades
- CRUD completo de itens com geração de ID e timestamp automáticos
- Controle de estoque negativo impedido em saída
- Histórico de movimentações imutável (append-only) com data ISO

---

## 6. Possíveis Falhas

### 🔴 CRÍTICO
- **Dois sistemas de itens paralelos:** este módulo usa `almoxarifado.json` no Drive; `mod_admin.gs` + `mod_reservas.gs` usam a aba `Itens` na planilha ESPACOS. São duas bases de itens desconectadas — não há sincronização entre elas.
- **Ausência de lock em `movimentarEstoque`:** a operação de movimentação faz read→modify→write em dois arquivos (`almoxarifado.json` e `movimentacoes_almox.json`) sem `LockService`. Duas movimentações simultâneas podem causar race condition e perda de movimentação.

### 🟠 MÉDIO
- **`salvarItemAlmoxarifado` sem validação de campos obrigatórios:** aceita qualquer objeto como dado — sem verificar `nome`, `categoria`, `qtd`. Item sem nome é salvo silenciosamente.
- **`excluirItemAlmoxarifado` sem verificação de movimentações pendentes:** remove o item do JSON mas não valida se há movimentações recentes ou se o item está em uso.

### 🟡 BAIXO
- **ID de item com `alm_timestamp` não segue padrão do sistema:** outros módulos usam `gerarId("ALM")` de utils.js — aqui é `'alm_' + Date.now()`. Formato diferente dificulta lookup cross-sistema.
- **`movimentarEstoque` retorna `{ok: false}` em vez de lançar exceção:** inconsistente com o padrão do restante do sistema que lança `Error`. O frontend precisa verificar `ok` ao invés de tratar exceções.

---

## 7. Qualidade do Código
**Positivos:**
- Código conciso e direto (79 linhas)
- Histórico de movimentações append-only é um padrão correto

**Críticos:**
- Ausência de lock em operação crítica de escrita concorrente
- Sistema de itens paralelo sem integração com o sistema principal

---

## 8. Melhorias Sugeridas
- Adicionar `LockService` em `movimentarEstoque` (write duplo em dois arquivos)
- Definir qual sistema de itens é canônico ou criar sincronização entre os dois
- Usar `gerarId("ALM")` ao invés de `'alm_' + Date.now()`
- Adicionar validação de `nome` e `qtd` em `salvarItemAlmoxarifado`
- Padronizar retorno de erro: lançar `Error` ao invés de retornar `{ok: false}`

---

## 9. Papel no Sistema
- **Fluxo:** Frontend → `GAS.almoxarifado.*` → `readJSON/writeJSON` → Drive CCBJ_DATA
- **Criticidade:** 🟡 BAIXO — funcionalidade isolada; falha não afeta reservas nem outros módulos

---

## 10. Tags
`#backend` `#almoxarifado` `#estoque` `#drive-json` `#movimentacoes`

---

## 11. Dependências
- **Depende de:** `DataLayer.gs` (`readJSON`, `writeJSON`)
- **É dependência para:** Frontend do módulo almoxarifado

---

## 12. Relação com Problemas Existentes
- A coexistência de dois sistemas de itens (planilha ESPACOS vs Drive JSON) é um problema estrutural não resolvido. O sistema de itens volantes das reservas usa a planilha; o almoxarifado usa Drive JSON.

---

## 13. Alinhamento com a Visão
**Alinhado:** persistência via DataLayer, separação em módulo isolado
**Desalinhado:** dois sistemas de itens paralelos sem integração, ausência de lock em operação crítica
