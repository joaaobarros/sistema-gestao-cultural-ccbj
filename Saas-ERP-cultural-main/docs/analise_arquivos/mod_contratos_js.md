# 📄 Análise de Arquivo — mod_contratos_js.html

## 1. Identificação
- **Nome:** mod_contratos_js.html
- **Caminho:** `/html/logic/mod_contratos_js.html`
- **Tipo:** Frontend JS — lógica de módulo
- **Camada:** frontend/logic
- **Módulo:** Contratos — UI de contratos, metas, indicadores, rubricas

---

## 2. Propósito
Lógica completa da UI de gestão financeira de contratos: carregamento de dados, renderização hierárquica (contratos → metas → rubricas/indicadores com collapse/expand), modais de CRUD para cada entidade, cálculo de totais e percentuais de alocação orçamentária, e exportação de memória de cálculo de rubricas.

---

## 3. Funções

### Dados
| Função | Descrição |
|--------|-----------|
| `carregarDadosContratos(cb)` | Carrega `GAS.contratos.obterDados` → `_ctrCache`; chama `cb` |

### Utilitários
| Função | Descrição |
|--------|-----------|
| `_fmtDataCtr(v)` | Formata Date/ISO → `dd/mm/yyyy` |
| `_totalRubricas(idMeta)` | Soma valores de rubricas filtrando por `idMeta` de `_ctrCache.rubricas` |
| `_totalContrato(idContrato)` | Soma totais de todas as metas do contrato |
| `_pctContrato(idContrato)` | `(totalRubricas / valorTotal) * 100` — exibe barra de alocação |
| `_ctrToggle(idContrato)` | Colapsa/expande corpo do contrato (toggle de `display:none`) |
| `_injetarCssContratos()` | Injeta `<style>` de estilos específicos do módulo no `<head>` |

### Renderização principal
| Função | Descrição |
|--------|-----------|
| `renderizarContratos()` | Gera HTML de todos os contratos com: header (nome, vigência, fonte, barra de orçamento), metas aninhadas, rubricas por meta, indicadores por meta; colapsa por `_ctrColapsados` |

### Modais CRUD
| Função | Descrição |
|--------|-----------|
| `abrirModalContrato()` | Modal de novo/editar contrato |
| `editarContrato(id)` | Preenche modal com dados do contrato pelo id |
| `excluirContratoUI(id)` | Confirmação SweetAlert2 → `GAS.contratos.excluir` → recarrega |
| `abrirModalMeta(idContrato)` | Modal de nova/editar meta para o contrato |
| `editarMeta(id)` | Preenche modal de meta |
| `excluirMetaUI(id)` | Confirmação → `GAS.contratos.excluirMeta` → recarrega |
| `abrirModalRubrica(idMeta)` | Modal de rubrica com memória de cálculo |
| `abrirModalIndicador(idMeta, idContrato)` | Modal de indicador com 12 campos mensais |

---

## 4. Conexões
- **Quem chama:** `GestaoContratos.html` (carrega `_ctrCache`, `_fmtMoeda`, `_parseMoeda`, `_mascaraMoeda`)
- **Quem é chamado:**
  - `GAS.contratos.*` (bridge para backend mod_relatorios.gs)
  - `AppState` (para verificar `isAdmin`)
  - `escaparHTML`, `Swal` de mod_ui_componentes_js.html / SweetAlert2
  - `_ctrCache` — variável global declarada em `GestaoContratos.html`

---

## 5. Funcionalidades
- **Hierarquia colapsável:** contratos → metas → rubricas/indicadores com estado persistido em `_ctrColapsados` (por id de contrato)
- **Barra de alocação orçamentária:** calcula percentual de rubricas vs valor total do contrato; código de cor: <70% verde, 70–90% amarelo, ≥90% vermelho
- **CSS injetado por código:** `_injetarCssContratos` injeta estilos específicos do módulo uma única vez (guard `document.getElementById('_css_contratos')`)
- **Memória de cálculo em modal de rubrica:** formulário expansível com campos de quantidade, valor unitário, subtotal calculado localmente

---

## 6. Possíveis Falhas

### 🔴 CRÍTICO
- **`_ctrCache`, `_fmtMoeda`, `_parseMoeda`, `_mascaraMoeda` declarados em `GestaoContratos.html`:** este módulo depende de variáveis globais definidas em outro arquivo (`GestaoContratos.html`). Se a ordem de carregamento mudar ou o módulo for usado fora do contexto de `GestaoContratos.html`, lança `ReferenceError` silencioso.
- **`console.log('RETORNO BACKEND:', d)` em `carregarDadosContratos`:** log de debug esquecido em produção; expõe estrutura de dados de contratos no console do navegador.

### 🟠 MÉDIO
- **`renderizarContratos` gera HTML inteiramente como string:** `escaparHTML` protege dados de usuário, mas a estrutura usa `onclick="..."` com strings escapadas via `escaparHTML` — se um ID de contrato contiver aspas simples, a chamada JavaScript quebra (ex: `onclick="editarContrato('...')"` com id contendo `'`).
- **`excluirContratoUI` e `excluirMetaUI` sem verificação de permissão no frontend:** qualquer usuário que consiga abrir o modal vê os botões de exclusão — a proteção é apenas no backend. Idealmente, botões destrutivos deveriam ser ocultados por `isAdmin`.

### 🟡 BAIXO
- **`_injetarCssContratos` injeta estilos no `<head>` via `document.createElement('style')`:** funciona mas é fora do padrão do sistema (outros módulos usam Tailwind inline) — pode conflitar com CSP estrita.
- **`_ctrColapsados` é estado in-memory:** ao recarregar dados (`carregarDadosContratos`), os estados de collapse são preservados, mas ao recarregar a página inteira, todos abrem novamente.

---

## 7. Qualidade do Código
**Positivos:**
- `_totalRubricas`, `_totalContrato`, `_pctContrato` são funções puras e reutilizáveis
- Guard de injeção de CSS (`document.getElementById('_css_contratos')`) previne duplicação
- Hierarquia colapsável persistida por id é UX correta

**Críticos:**
- Log de debug exposto em produção
- Dependência de variáveis globais de outro arquivo

---

## 8. Melhorias Sugeridas
- Remover `console.log('RETORNO BACKEND:', d)` de `carregarDadosContratos`
- Mover `_ctrCache` para declaração local neste módulo
- Verificar `isAdmin` antes de renderizar botões de exclusão em `renderizarContratos`

---

## 9. Papel no Sistema
- **Fluxo:** `GestaoContratos.html` carrega → `carregarDadosContratos` → `renderizarContratos` → hierarquia de cards; ação CRUD → modal → GAS → recarrega
- **Criticidade:** 🟠 MÉDIO — gerencia dados financeiros sensíveis; bug no cálculo de totais ou na persistência afeta visibilidade do orçamento

---

## 10. Tags
`#frontend` `#contratos` `#metas` `#rubricas` `#indicadores` `#financeiro` `#ui`

---

## 11. Dependências
- **Depende de:** `GestaoContratos.html` (`_ctrCache`, `_fmtMoeda`), `GAS.contratos.*`, `escaparHTML`, `SweetAlert2`
- **É dependência para:** `GestaoContratos.html` e painel de contratos do sistema

---

## 12. Relação com Problemas Existentes
- O módulo depende de `GAS.contratos.*` que chama `mod_relatorios.gs` no backend — onde `_mapaMetas` está quebrada e o diff de versões retorna "Rubrica desconhecida". O frontend exibe corretamente os dados básicos, mas funcionalidades de comparação de versões são afetadas pelo bug backend.

---

## 13. Alinhamento com a Visão
**Alinhado:** hierarquia colapsável, cálculo de alocação com código de cor, guard de CSS, funções puras de cálculo
**Desalinhado:** log de debug em produção, dependência de globals de outro arquivo, botões destrutivos sem verificação de permissão frontend
