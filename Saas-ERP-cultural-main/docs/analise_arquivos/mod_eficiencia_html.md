# 📄 Análise de Arquivo — mod_eficiencia.html

## 1. Identificação
- **Nome:** mod_eficiencia.html
- **Caminho:** `/html/modulos/mod_eficiencia.html`
- **Tipo:** Frontend HTML + JS inline — módulo completo
- **Camada:** frontend/modulos
- **Módulo:** Eficiência Operacional — KPIs e gráficos de uso de espaços e tendências mensais

---

## 2. Propósito
Painel de eficiência operacional (`#aba-eficiencia`): carrega métricas de `GAS.eficiencia.obterMetricas`, renderiza 4 KPIs (total/confirmadas/canceladas/taxa cancelamento) e dois gráficos CSS puro (uso por espaço + agendamentos por mês). Contém JavaScript inline com lógica de renderização própria — sem dependência de biblioteca de gráficos.

---

## 3. Funções (JavaScript inline)

| Função | Descrição |
|--------|-----------|
| `carregarEficiencia()` | Mostra spinner → `GAS.eficiencia.obterMetricas` → chama `_eficienciaRenderizar` |
| `_eficienciaRenderizar()` | Orquestra renderização das 3 seções com `_eficienciaCache` |
| `_eficienciaKPIs(d)` | Renderiza 4 cards KPI com ícone, label, valor e esquema de cor |
| `_eficienciaSalas(salas)` | Barras horizontais CSS para top 8 salas por total de reservas |
| `_eficienciaMensal(meses)` | Gráfico de barras verticais CSS para últimos 12 meses |
| `window._onShow_aba_eficiencia` | Lazy loading: só carrega se `_eficienciaCache` for null |

---

## 4. Conexões
- **Quem chama:** `mostrarAba('aba-eficiencia')` → dispatch `_onShow_aba_eficiencia` em `navegacao_ui_js.html`
- **Quem é chamado:**
  - `GAS.eficiencia.obterMetricas(ok, err)` — backend
  - `escaparHTML` (mod_ui_componentes_js)
  - `mostrarAba('aba-lista-reservas')` — botão "Ver Agenda"

---

## 5. Funcionalidades
- **Cache de dados:** `_eficienciaCache` persiste entre visitas à aba; botão "Atualizar" força novo carregamento; `_onShow_aba_eficiencia` reusa cache se disponível
- **Gráficos CSS sem biblioteca:** barras construídas com `div` inline-styled, gradiente CSS, `transition:width .5s ease` para animação de entrada
- **Top 8 espaços:** `salas.slice(0,8)` limita exibição — previne overflow com muitas salas
- **Últimos 12 meses:** `meses.slice(-12)` garante janela temporal fixa
- **Normalização de escala:** `max` da lista como 100% da barra — cada barra é `(value/max)*100%`
- **4 KPIs com código de cor:** violeta (total), verde (confirmadas), vermelho (canceladas), âmbar (taxa cancelamento)

---

## 6. Possíveis Falhas

### 🟠 MÉDIO
- **JavaScript inline junto ao HTML (134 linhas total):** mesmo anti-padrão de `mod_balcao.html` — viola separação de responsabilidades do sistema.
- **`_eficienciaSalas` pressupõe que `salas[0]` é o maior:** `var max = salas[0].total || 1` — assume que o array já vem ordenado decrescentemente. Se `GAS.eficiencia.obterMetricas` retornar lista não ordenada, `max` pode ser menor que o máximo real, gerando barras que ultrapassam 100%.

### 🟡 BAIXO
- **`_eficienciaCache = null` como estado inicial não distingue "não carregado" de "erro":** se `carregarEficiencia()` falhar, `_eficienciaCache` permanece null — ao reabrir a aba, o sistema tentará recarregar (comportamento correto), mas sem feedback de que houve falha anterior.
- **Gráfico mensal sem eixo Y e sem legenda de valores absolutos:** os valores aparecem sobre cada barra, mas sem rótulo de eixo — para usuários que procuram tendências relativas, a leitura pode ser imprecisa.
- **`temPermissao` aparece nas dependências do cabeçalho mas não é chamado no código:** o arquivo menciona `temPermissao` mas não usa proteção de permissão — a aba pode ser visível a usuários sem permissão de eficiência se `permissoes_ui_js` não cobrir este módulo.

---

## 7. Qualidade do Código
**Positivos:**
- Cache de dados com lazy loading correto (`_onShow_aba_eficiencia`)
- Gráficos CSS sem dependência de biblioteca — load rápido
- `escaparHTML` usado nos rótulos de salas e meses
- Limitação de top 8 e últimos 12 meses previne overflow visual

**Médio:**
- JS inline junto ao HTML
- Pressuposição de ordenação em `salas[0].total` como max

---

## 8. Melhorias Sugeridas
- Mover JS para `mod_eficiencia_js.html` separado
- Calcular `max` com `Math.max.apply(null, salas.map(function(s){ return s.total; }))` em vez de `salas[0].total`
- Adicionar estado de erro no cache para não re-tentar infinitamente em caso de falha persistente

---

## 9. Papel no Sistema
- **Fluxo:** aba abre → `_onShow_aba_eficiencia` → se sem cache, `carregarEficiencia()` → GAS → `_eficienciaRenderizar()` → 4 KPIs + 2 gráficos
- **Criticidade:** 🟢 BAIXO — métricas derivadas para gestão interna; falha aqui não bloqueia operações

---

## 10. Tags
`#frontend` `#html` `#js-inline` `#eficiencia` `#kpi` `#graficos` `#ocupacao` `#reservas`

---

## 11. Dependências
- **Depende de:** `GAS.eficiencia.obterMetricas`, `escaparHTML` (mod_ui_componentes_js), `mostrarAba` (navegacao_ui_js)
- **É dependência para:** visão gerencial de uso dos espaços do CCBJ

---

## 12. Relação com Problemas Existentes
- `temPermissao` listada nas dependências do cabeçalho mas não chamada no código — se outros módulos sensíveis cobrem `temPermissao`, este módulo pode ter sido planejado para usá-la mas não foi implementado.

---

## 13. Alinhamento com a Visão
**Alinhado:** lazy loading com cache, gráficos CSS eficientes, top 8 e últimos 12 meses, `escaparHTML` consistente
**Desalinhado:** JS inline no HTML, pressuposição de ordenação em `salas[0]`, `temPermissao` mencionada mas não usada
