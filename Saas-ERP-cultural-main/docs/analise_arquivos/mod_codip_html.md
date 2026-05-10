# 📄 Análise de Arquivo — mod_codip.html

## 1. Identificação
- **Nome:** mod_codip.html
- **Caminho:** `/html/modulos/mod_codip.html`
- **Tipo:** Frontend HTML — template de aba
- **Camada:** frontend/modulos
- **Módulo:** CODIP — painel de relatórios culturais para prestação de contas

---

## 2. Propósito
Template HTML da aba CODIP (`#aba-codip`): exibe tabela de relatórios CODIP das reservas com filtros (mês referência, tipo de ação, setor, contrato), KPIs dinâmicos, exportação CSV e tabela de 11 colunas. O conteúdo é inteiramente populado por `renderizarTabelaCODIP()` e `carregarAbaCODIP()` em `mod_reservas_js.html`.

---

## 3. Estruturas

### Filtros
| Filtro | ID | Tipo |
|--------|-----|------|
| Mês referência | `#codipFiltroMes` | Input texto (ex: "04/2026") |
| Tipo de ação | `#codipFiltroTipo` | Input texto livre |
| Setor | `#codipFiltroSetor` | Input texto livre |
| Contrato | `#codipFiltroCtr` | Select (populado por JS) |

### Containers dinâmicos
| Container | ID | Descrição |
|-----------|-----|-----------|
| KPIs | `#codipAbaKpis` | Grid 4 colunas de cards de indicadores |
| Contador | `#codipContador` | Badge de total de registros |
| Corpo da tabela | `#corpoCODIP` | Populado por `renderizarTabelaCODIP()` |
| Estado vazio | `#semResultadosCODIP` | Exibido quando não há resultados |

### Colunas da tabela
Ação, Mês Ref., Tipo, Setor, Presencial, Virtual, PCD, Horas/Mês, Linguagem, Contrato/Meta, Evidências (11 colunas).

---

## 4. Conexões
- **Quem chama:** `mostrarAba('aba-codip')` → `carregarAbaCODIP()` (lazy loading em `navegacao_ui_js.html`)
- **Quem é chamado:**
  - `renderizarTabelaCODIP()` (mod_reservas_js) — botão Filtrar
  - `exportarCODIPCSV()` (mod_reservas_js) — botão CSV
  - `carregarAbaCODIP()` (mod_reservas_js) — lazy load inicial

---

## 5. Funcionalidades
- **Filtro multi-campo:** mês, tipo, setor e contrato podem ser combinados
- **KPIs dinâmicos:** `#codipAbaKpis` pode exibir total de ações, público total, horas totais, etc. — populado pelo JS
- **Tabela de 11 colunas com scroll horizontal:** `min-w-[900px]` garante que a tabela não colapsa em mobile
- **Exportação CSV:** `exportarCODIPCSV()` exporta dados filtrados atualmente visíveis
- **Estado vazio explícito:** `#semResultadosCODIP` com mensagem amigável

---

## 6. Possíveis Falhas

### 🟠 MÉDIO
- **`#codipFiltroCtr` é select populado por JS mas os outros 3 filtros são inputs de texto livre:** inconsistência de UX — usuário pode digitar "Curso/Oficina" ou "curso" e obter resultados diferentes dependendo de case-sensitivity no JS de filtragem.
- **Colunas "Contrato / Meta" e "Evidências" exibidas na tabela dependem de `obterRelatoriosCODIP` do backend** — que tem o bug crítico de acessar `r[34]`/`r[35]` além do array (máx índice 33). Logo, essas duas colunas sempre mostrarão dados vazios/incorretos.

### 🟡 BAIXO
- **`#codipFiltroMes` é input de texto sem máscara:** usuário pode digitar "4/2026" ou "abril/2026" — filtragem depende do JS de `renderizarTabelaCODIP` tratar variações corretamente.
- **Sem paginação na tabela:** muitas entradas CODIP geram tabela longa sem limite visual.

---

## 7. Qualidade do Código
**Positivos:**
- Template minimalista com responsabilidade única de estrutura
- 11 colunas semanticamente nomeadas refletem o schema CODIP real
- `min-w-[900px]` evita colapso da tabela em telas pequenas

**Médio:**
- Filtros misto (3× texto livre + 1× select) é UX inconsistente
- Colunas Contrato/Meta e Evidências dependem de bug conhecido no backend

---

## 8. Melhorias Sugeridas
- Trocar `#codipFiltroMes` para input `type="month"` nativo para garantir formato correto
- Trocar `#codipFiltroTipo` para select com as mesmas opções de `mod_nova_reserva.html`
- Adicionar paginação ou virtual scroll para tabelas grandes

---

## 9. Papel no Sistema
- **Fluxo:** `carregarAbaCODIP()` carrega dados → `renderizarTabelaCODIP()` popula tabela → filtros refinam → CSV exporta
- **Criticidade:** 🟠 MÉDIO — relatórios CODIP são enviados para prestação de contas à Secretaria de Cultura; dados incorretos ou ausentes têm impacto institucional

---

## 10. Tags
`#frontend` `#html` `#codip` `#relatorios` `#prestacao-contas` `#template`

---

## 11. Dependências
- **Depende de:** `mod_reservas_js.html` (`renderizarTabelaCODIP`, `exportarCODIPCSV`, `carregarAbaCODIP`), `GAS.reservas.obterRelatoriosCODIP` (backend)
- **É dependência para:** relatórios CODIP para prestação de contas institucional

---

## 12. Relação com Problemas Existentes
- A coluna "Contrato / Meta" depende de `r[34]`/`r[35]` no backend (`obterRelatoriosCODIP`) que acessa além do array de 34 elementos — bug crítico documentado em `mod_relatorios_gs.md`. Esta coluna nunca exibirá dados corretos até o backend ser corrigido.

---

## 13. Alinhamento com a Visão
**Alinhado:** template minimalista, KPIs separados do grid de dados, export CSV, estado vazio
**Desalinhado:** filtros de texto livre sem validação de formato, dependência de bug no backend para colunas chave
