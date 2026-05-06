# 📄 Análise de Arquivo — mod_relatorios_financeiros.html

## 1. Identificação
- **Nome:** mod_relatorios_financeiros.html
- **Caminho:** `/html/modulos/mod_relatorios_financeiros.html`
- **Tipo:** Frontend HTML + JS inline — módulo completo
- **Camada:** frontend/modulos
- **Módulo:** Relatórios Financeiros — consolidação de execução orçamentária por contrato

---

## 2. Propósito
Painel de relatórios financeiros (`#aba-rel-financeiros`): carrega dados de contratos (rubricas/metas) e fluxo de caixa de contratações em paralelo, renderiza 4 KPIs e tabela de execução por contrato com barra de percentual. Contém JavaScript inline (~130 linhas) com lógica própria de carregamento paralelo e renderização.

---

## 3. Funções (JavaScript inline)

| Função | Descrição |
|--------|-----------|
| `_relFmt(v)` | Formata valor monetário: usa `_fmtMoeda` se disponível, fallback para `toLocaleString('pt-BR')` |
| `carregarRelFinanceiros()` | Carregamento paralelo: `GAS.contratos.obterDados` + `GAS.contratacoes.fluxoCaixa` com contador de 2 pendentes |
| `_relFinRenderizar()` | Orquestra KPIs + tabela com `_relFinCache` |
| `_relFinKPIs(d)` | 4 KPI cards: contratos ativos, total orçado, alocado em rubricas, pago |
| `_relFinTabela(contratos, metas, rubricas)` | Tabela com execução por contrato: barra de % e saldo |
| `_totalMetas(idContrato)` | Calcula total alocado: filtra metas do contrato, filtra rubricas de cada meta, soma valores |
| `window._onShow_aba_rel_financeiros` | Lazy loading com cache: só carrega se `_relFinCache` for null |

---

## 4. Conexões
- **Quem chama:** `window._onShow_aba_rel_financeiros` — acionado via dispatch genérico de `navegacao_ui_js.html`
- **Quem é chamado:**
  - `GAS.contratos.obterDados(ok, err)` — contratos, metas e rubricas
  - `GAS.contratacoes.fluxoCaixa(ok, err)` — totalContratado e totalSaidas
  - `escaparHTML` (mod_ui_componentes_js)
  - `_fmtMoeda` (GestaoContratos.html ou mod_contratos_js.html — disponível no contexto global)
  - `temPermissao('contratos','editar')` — controle de botão no estado vazio
  - `mostrarAba('aba-contratos-fin')` — link do estado vazio

---

## 5. Funcionalidades
- **Carregamento paralelo:** `carregarRelFinanceiros` dispara duas chamadas GAS simultaneamente com contador `pendente=2`; renderiza apenas quando ambas completam (ou falham com `{}` como fallback)
- **4 KPIs financeiros:** contratos ativos (count), total orçado (sum valorTotal), alocado em rubricas (sum rubricas), pago em contratações (fluxo.totalSaidas)
- **Barra de execução por contrato:** mesma lógica de cor de `mod_contratos_js.html` — <70% verde, 70–90% âmbar, ≥90% vermelho; `Math.min(100, ...)` previne barra além de 100%
- **Saldo negativo em vermelho:** `saldo = valorTotal - alocado`; colorido em vermelho se `saldo < 0` — indica sobrealocação
- **Fallback de formatação monetária:** `_relFmt` verifica se `_fmtMoeda` existe antes de usar — resiliente se o arquivo que define a função não carregar
- **Lazy loading com cache único:** `_relFinCache` persiste; botão "Atualizar" reseta e recarrega

---

## 6. Possíveis Falhas

### 🔴 CRÍTICO
- **`_totalMetas(idContrato)` é O(metas × rubricas) por contrato:** loop aninhado — `metas.filter().reduce(rubricas.filter().reduce(...))`. Com 10 contratos, 50 metas e 200 rubricas, são ~10.000 iterações síncronas no browser. Se o dataset crescer, pode causar travamento perceptível da UI.

### 🟠 MÉDIO
- **JavaScript inline junto ao HTML (~130 linhas):** mesmo anti-padrão de `mod_balcao.html` e `mod_eficiencia.html`.
- **`GAS.contratacoes.fluxoCaixa` paralelo com `GAS.contratos.obterDados`:** se uma das chamadas falhar, a renderização usa o fallback `{}` sem notificar o usuário — KPI "Pago" pode mostrar R$ 0 sem erro visível.

### 🟡 BAIXO
- **`_relFinCache = null` como única flag:** não distingue "dado inválido/erro" de "não carregado". Após erro, `_relFinCache` ainda é null — ao reabrir a aba, re-tenta (comportamento correto, mas sem indicação de que houve falha anterior).
- **Lógica de `_totalMetas` duplicada de `mod_contratos_js.html`:** `_totalRubricas` e `_totalContrato` no módulo de contratos fazem cálculo equivalente — código duplicado, risco de divergência.

---

## 7. Qualidade do Código
**Positivos:**
- Carregamento paralelo com contador `pendente` é padrão correto e eficiente
- `_relFmt` com fallback para `toLocaleString` é resiliente
- `Math.min(100, ...)` na barra previne overflow visual
- Estado vazio com link contextual para o módulo de contratos é UX cuidadosa

**Críticos:**
- `_totalMetas` com loops aninhados — complexidade O(n²) potencial
- JS inline junto ao HTML

---

## 8. Melhorias Sugeridas
- Pré-indexar rubricas por `idMeta` em um Map antes de iterar — reduz `_totalMetas` de O(metas × rubricas) para O(1) por meta após O(rubricas) de indexação
- Mover JS para `mod_relatorios_financeiros_js.html` separado
- Adicionar notificação de erro quando `GAS.contratacoes.fluxoCaixa` falhar

---

## 9. Papel no Sistema
- **Fluxo:** aba abre → `_onShow` → carregamento paralelo → `_relFinRenderizar()` → 4 KPIs + tabela de execução
- **Criticidade:** 🟠 MÉDIO — dados financeiros para gestão orçamentária; imprecisão ou indisponibilidade impacta tomada de decisão

---

## 10. Tags
`#frontend` `#html` `#js-inline` `#financeiro` `#contratos` `#kpi` `#execucao-orcamentaria`

---

## 11. Dependências
- **Depende de:** `GAS.contratos.obterDados`, `GAS.contratacoes.fluxoCaixa`, `escaparHTML`, `_fmtMoeda` (global, de GestaoContratos.html), `temPermissao`, `mostrarAba`
- **É dependência para:** visão consolidada financeira do CCBJ

---

## 12. Relação com Problemas Existentes
- A lógica de `_totalMetas` replica a lógica de `_totalRubricas`/`_totalContrato` de `mod_contratos_js.html` — mais uma instância de duplicação de cálculo financeiro no frontend.
- Depende de `_fmtMoeda` declarada em `GestaoContratos.html` — mesmo padrão de acoplamento via global identificado em `mod_contratos_js.html`.

---

## 13. Alinhamento com a Visão
**Alinhado:** carregamento paralelo com `pendente`, fallback de formatação, lazy loading com cache, barra de execução com código de cor, saldo negativo em vermelho
**Desalinhado:** JS inline, `_totalMetas` O(n²) potencial, lógica duplicada de cálculo de rubricas
