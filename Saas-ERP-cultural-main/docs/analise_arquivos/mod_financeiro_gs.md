# 📄 Análise de Arquivo — mod_financeiro.gs

## 1. Identificação
- **Nome:** mod_financeiro.gs
- **Caminho:** `/mod_financeiro.gs`
- **Tipo:** Backend GAS — módulo de negócio
- **Camada:** backend/domínio
- **Módulo:** Financeiro — contratações, pagamentos, RH/custos, simulações

---

## 2. Propósito
Módulo híbrido que combina gestão de contratações operacionais (Drive JSON) com cálculo financeiro de RH (planilha EQUIPES.Vinculos). Calcula custo total de vínculos empregatícios com encargos, benefícios e provisões; consolida custo por contrato/meta/programa; gera fluxo mensal de RH; simula cenários de reajuste e demissão.

---

## 3. Funções

### Contratações e pagamentos (Drive JSON)
| Função | Descrição |
|--------|-----------|
| `obterContratacoes()` | Lê `contratacoes.json` |
| `salvarContratacao(dados)` | Upsert simples |
| `excluirContratacao(id)` | Remove por id |
| `obterPagamentos()` | Lê `pagamentos.json` |
| `registrarPagamento(dados)` | Append-only com id automático |
| `excluirPagamento(id)` | Remove por id |
| `obterFluxoCaixa()` | Suma saídas e contratado; retorna saldo + detalhes |

### RH — cálculo de custos (planilha EQUIPES.Vinculos)
| Função | Descrição |
|--------|-----------|
| `_getParametroRH(chave)` | Lê ParametrosRH da planilha EQUIPES |
| `calcularCustoVinculo(v)` | Calcula salário ajustado, encargos, benefícios, provisões e custo total mensal/contrato |
| `atualizarCalculoVinculos()` | Recalcula e sobrescreve todas as linhas da aba Vinculos |
| `calcularCustoPorMeta()` | Agrega custo por meta usando campo `Meta` da aba Vinculos |
| `calcularCustoPorPrograma()` | Agrega custo por programa |
| `calcularCustoContrato(idContrato)` | Soma custo mensal de todos os vínculos do contrato |
| `simularCenarioRH(ajustes)` | Recalcula custo total aplicando reajuste percentual sobre todos os vínculos |
| `gerarResumoRH()` | Retorna `{porMeta, porPrograma, total}` |
| `gerarFluxoRH(idContrato)` | Gera linha mensal de custo por vínculo entre Data Início e Data Fim |
| `simularDemissao(idVinculo, data)` | Estima custo rescisório (multa FGTS + aviso prévio) vs economia mensal |
| `calcularSaldoMensal(idContrato, orcamento)` | Compara gasto mensal do fluxo com orçamento informado |

### Consolidação financeira (cruzamento RH × contratações)
| Função | Descrição |
|--------|-----------|
| `compararContratoRH(id)` | Planejado (campo `orcamentoRH`) vs real (custo RH calculado) |
| `compararMetaRH(id)` | Por meta: planejado (`orcamentoPorMeta` JSON) vs real |
| `obterResumoFinanceiroContrato(id)` | Consolidação: contrato + custo real RH |
| `obterResumoFinanceiroPorMeta(id)` | Totaliza planejado/real/diferença por meta |

---

## 4. Conexões
- **Quem chama:** Frontend via `GAS.financeiro.*` e `GAS.rh.*` (bridge)
- **Quem é chamado:**
  - `DataLayer.gs`: `readJSON`, `writeJSON`
  - `Setup.js`: `_abrirAba('EQUIPES', 'Vinculos')`, `_abrirAba('EQUIPES', 'ParametrosRH')`

---

## 5. Funcionalidades
- **Cálculo de custo CLT preciso:** encargos patronais (INSS 20% + Sistema S 6.6% + FGTS 8% + PIS 1%), benefícios com desconto, provisões (férias + 1/3 + 13º + FGTS rescisório)
- **Simulação de cenários:** reajuste percentual aplicado sobre toda a folha; cálculo de break-even de demissão
- **Fluxo mensal:** gera uma entrada por mês entre início e fim do vínculo — útil para projeção de despesas ao longo do contrato
- **Dois sistemas de "contratações":** `contratacoes.json` (Drive, operacional — fornecedores/PJ) e aba Vinculos (planilha EQUIPES — vínculos CLT/PJ estruturados)

---

## 6. Possíveis Falhas

### 🔴 CRÍTICO
- **`calcularCustoPorMeta` acessa coluna `Meta` que não está no schema de `Vinculos`:** a aba `Vinculos` em Setup.js define 25 colunas mas não inclui `Meta`, `Percentual Alocação`, `Programa (Projeto)` ou `ID Contrato`. Essas colunas são acessadas por nome via `idx[...]` — como não existem no schema, `idx['Meta']` é `undefined` e retorna string vazia para todos os vínculos, tornando os resultados de custo por meta sempre zero.
- **`gerarFluxoRH` loop infinito sem `Data Fim`:** quando `Data Fim` é nula/vazia, o `while (!fim || data <= fim)` roda indefinidamente até atingir o limite hardcoded de 60 iterações. Se `Data Início` também for inválida, pode lançar exceção não tratada.

### 🟠 MÉDIO
- **`calcularCustoVinculo` usa vale-transporte hardcoded (`vtA * 2 * 22`):** assume 2 passagens/dia e 22 dias úteis. Parâmetros vêm de `_getParametroRH` mas o multiplier `2 * 22` é fixo — sem flexibilidade para trabalhadores home-office ou turnos diferentes.
- **`simularDemissao` calcula FGTS com taxa base hardcoded de 8%:** deveria reusar o cálculo de `calcularCustoVinculo`; duplicação da lógica.
- **Dois sistemas de contratações sem integração:** `contratacoes.json` (fornecedores/PJ) e aba `Contratacoes` na planilha FINANCEIRO (definida em Setup.js) são independentes.

### 🟡 BAIXO
- **`obterFluxoCaixa` soma todos os pagamentos sem filtro por período:** retorna acumulado histórico completo — pode ser lento com grande volume de dados.

---

## 7. Qualidade do Código
**Positivos:**
- `calcularCustoVinculo` é bem estruturado e parametrizável via ParametrosRH
- `simularCenarioRH` é concisa e poderosa para planejamento
- Lookup por cabeçalho em todas as funções de planilha

**Críticos:**
- Colunas acessadas (`Meta`, `Percentual Alocação`, `Programa`, `ID Contrato`) não existem no schema definido em Setup.js — módulo está desconectado do schema canônico
- Risco de loop near-infinite em `gerarFluxoRH`

---

## 8. Melhorias Sugeridas
- Adicionar colunas `Meta`, `Percentual Alocação`, `Programa (Projeto)`, `ID Contrato` ao schema `EQUIPES.Vinculos` em Setup.js
- Adicionar limite de segurança explícito em `gerarFluxoRH` e validação de datas
- Reutilizar `calcularCustoVinculo` em `simularDemissao` ao invés de duplicar taxa FGTS

---

## 9. Papel no Sistema
- **Fluxo de custo:** planilha EQUIPES.Vinculos → `calcularCustoVinculo` → `gerarFluxoRH` → `calcularSaldoMensal`
- **Criticidade:** 🟠 MÉDIO — falha silenciosa em custo por meta/programa (dados zeros) pode levar a decisões incorretas de gestão

---

## 10. Tags
`#backend` `#financeiro` `#rh` `#custos` `#simulacao` `#vinculos` `#drive-json`

---

## 11. Dependências
- **Depende de:** `DataLayer.gs`, `Setup.js` (`_abrirAba`)
- **É dependência para:** Frontend dos módulos financeiro e RH

---

## 12. Relação com Problemas Existentes
- As colunas `Meta`, `Percentual Alocação` etc. foram adicionadas ao módulo sem atualizar o schema canônico em Setup.js — padrão recorrente de drift entre schema e código.

---

## 13. Alinhamento com a Visão
**Alinhado:** cálculo preciso de custo CLT, simulações, parametrização via planilha
**Desalinhado:** schema da planilha Vinculos desatualizado, loop potencialmente infinito, duplicação de lógica
