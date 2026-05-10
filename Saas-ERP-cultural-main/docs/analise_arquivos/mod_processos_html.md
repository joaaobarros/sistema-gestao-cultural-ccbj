# 📄 Análise de Arquivo — mod_processos.html

## 1. Identificação
- **Nome:** mod_processos.html
- **Caminho:** `/html/modulos/mod_processos.html`
- **Tipo:** Frontend HTML + JS inline — módulo completo
- **Camada:** frontend/modulos
- **Módulo:** Processos — acompanhamento de processos institucionais (compras, convênios, etc.)

---

## 2. Propósito
Módulo de gestão de processos institucionais (`#aba-processos`): carrega lista de processos, filtra por texto/tipo/fase, renderiza tabela com badges de fase coloridos, e oferece modal de criação/edição com transição integrada para o módulo de contratações. Contém JavaScript inline (~148 linhas).

---

## 3. Funções (JavaScript inline)

| Função | Descrição |
|--------|-----------|
| `_procFaseCls(f)` | Estilo inline por fase: Iniciado=azul, Em Análise=âmbar, Aguardando Aprovação=laranja, Aprovado=verde, Encerrado=cinza |
| `carregarProcessos()` | GAS.processos.listar → `_processosCache` → `_procRenderizar` |
| `_procFiltrar()` | Alias: chama `_procRenderizar()` |
| `_procRenderizar()` | Filtra por texto (título/número)/tipo/fase; renderiza tabela com ações condicionais por permissão |
| `_procCriarContratacao(titulo)` | Navega para `aba-contratacoes` + `setTimeout(350ms)` + `abrirModalContratacao(null, {objeto:titulo,...})` |
| `abrirModalProcesso(id)` | SweetAlert2: nº, título, tipo, fase, responsável (com `_rhCache` datalist) |
| `_excluirProcesso(id)` | Confirmação SweetAlert2 → GAS.processos.excluir |
| `window._onShow_aba_processos` | Lazy loading: só carrega se `_processosCache.length === 0` |

---

## 4. Conexões
- **Quem chama:** `window._onShow_aba_processos` — dispatch genérico de `navegacao_ui_js.html`
- **Quem é chamado:**
  - `GAS.processos.*`: listar, salvar, excluir
  - `escaparHTML`, `showLoader`, `temPermissao` (mod_ui_componentes_js)
  - `_rhCache` (mod_rh.html) — para datalist de responsável
  - `mostrarAba('aba-contratacoes')` + `abrirModalContratacao` (mod_contratacoes.html) — integração cross-módulo

---

## 5. Funcionalidades
- **Integração com Contratações:** botão "Criar Contratação" para processos de tipo Compra/Serviço navega para `aba-contratacoes` e pré-popula o modal com o título do processo
- **Número de processo:** campo `#` permite registro de nº oficial do processo (ex: empenho, licitação)
- **Filtragem tríplice imediata:** texto (título+número), tipo, fase — sem botão de buscar
- **Data formatada com try/catch:** `new Date(p.criadoEm).toLocaleDateString('pt-BR')` com catch silencioso para datas inválidas

---

## 6. Possíveis Falhas

### 🟠 MÉDIO
- **JavaScript inline junto ao HTML (~148 linhas):** mesmo anti-padrão recorrente.
- **`_procCriarContratacao` usa `setTimeout(350ms)` para aguardar navegação:** timing hack frágil — se `mostrarAba('aba-contratacoes')` demorar mais que 350ms (ex: em dispositivo lento ou com lazy loading pesado), `abrirModalContratacao` é chamada antes do módulo estar disponível. O guard `typeof abrirModalContratacao === 'function'` previne erro mas silencia a falha sem feedback ao usuário.
- **`_rhCache` como dependência implícita:** mesmo problema de `mod_tarefas.html` e `mod_processos.html`.

### 🟡 BAIXO
- **`criadoEm` formatado com `new Date()` sem validação:** se `criadoEm` for string inválida, `new Date(string)` retorna `Invalid Date` e `.toLocaleDateString()` retorna `"Invalid Date"` — o try/catch captura mas exibe vazio `''` em vez da data original.
- **Lazy loading com `!_processosCache.length`:** mesmo problema dos outros módulos com cache vazio.

---

## 7. Qualidade do Código
**Positivos:**
- Integração fluida com Contratações via `_procCriarContratacao` é UX inteligente
- `try/catch` na formatação de data é defensivo
- `escaparHTML` usado em todos os dados
- `typeof abrirModalContratacao === 'function'` guard para dependência cross-módulo

**Médio:**
- `setTimeout(350ms)` é anti-padrão para aguardar navegação
- JS inline

---

## 8. Melhorias Sugeridas
- Substituir `setTimeout(350ms)` por callback de `mostrarAba` ou pelo mecanismo `_onShow_aba_contratacoes` para garantir que o módulo está pronto antes de abrir o modal
- Expor `_rhCache` como API pública do módulo RH

---

## 9. Papel no Sistema
- **Fluxo:** aba abre → `_onShow` → `carregarProcessos()` → tabela → processo de Compra/Serviço → "Criar Contratação" → navega + pré-popula modal de contratação
- **Criticidade:** 🟡 BAIXO — suporte administrativo; falha aqui não bloqueia operações culturais

---

## 10. Tags
`#frontend` `#html` `#js-inline` `#processos` `#institucional` `#contratacoes` `#integracao`

---

## 11. Dependências
- **Depende de:** `GAS.processos.*`, `escaparHTML`, `showLoader`, `temPermissao`, `_rhCache` (mod_rh.html), `mostrarAba`, `abrirModalContratacao` (mod_contratacoes.html), `SweetAlert2`
- **É dependência para:** módulo de Contratações recebe dados pré-preenchidos de processos

---

## 12. Relação com Problemas Existentes
- O uso de `setTimeout` para integração cross-módulo é o mesmo padrão de timing hack identificado em outros pontos do sistema onde a ordem de carregamento é ambígua.

---

## 13. Alinhamento com a Visão
**Alinhado:** integração com Contratações, guard de tipo antes de criar contratação, try/catch na data, filtragem imediata
**Desalinhado:** `setTimeout` como timing hack, JS inline, dependência implícita de `_rhCache`
