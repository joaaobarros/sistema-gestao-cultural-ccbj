# 📄 Análise de Arquivo — mod_tarefas.html

## 1. Identificação
- **Nome:** mod_tarefas.html
- **Caminho:** `/html/modulos/mod_tarefas.html`
- **Tipo:** Frontend HTML + JS inline — módulo completo
- **Camada:** frontend/modulos
- **Módulo:** Tarefas — gestão de tarefas internas da equipe

---

## 2. Propósito
Módulo de gestão de tarefas internas (`#aba-tarefas`): carrega lista de tarefas, filtra por texto/status/prioridade, renderiza tabela com badges coloridos de status/prioridade, e oferece modal de criação/edição com autocomplete de responsáveis via `_rhCache`. Contém JavaScript inline (~145 linhas).

---

## 3. Funções (JavaScript inline)

| Função | Descrição |
|--------|-----------|
| `_tarefaStatusCls(s)` | Estilo inline por status: Aberta=azul, Em Andamento=âmbar, Concluída=verde, Cancelada=vermelho |
| `_tarefaPrioridadeCls(p)` | Cor de texto por prioridade: Alta=vermelho, Média=âmbar, Baixa=cinza |
| `carregarTarefas()` | GAS.tarefas.listar → `_tarefasCache` → `_tarefaRenderizar` |
| `_tarefaFiltrar()` | Alias: chama `_tarefaRenderizar()` |
| `_tarefaRenderizar()` | Filtra cache por busca/status/prioridade; renderiza tabela com ações condicionais por permissão |
| `abrirModalTarefa(id)` | SweetAlert2 para criar/editar: título, prioridade, status, responsável (com `<datalist>` de `_rhCache`), prazo |
| `_excluirTarefa(id)` | Confirmação SweetAlert2 → GAS.tarefas.excluir |
| `window._onShow_aba_tarefas` | Lazy loading: só carrega se `_tarefasCache.length === 0` |

---

## 4. Conexões
- **Quem chama:** `window._onShow_aba_tarefas` — dispatch genérico de `navegacao_ui_js.html`
- **Quem é chamado:**
  - `GAS.tarefas.*`: listar, salvar, excluir
  - `escaparHTML`, `showLoader`, `temPermissao` (mod_ui_componentes_js)
  - `_rhCache` (mod_rh.html) — para `<datalist>` de autocomplete de responsáveis
  - `SweetAlert2` — modais

---

## 5. Funcionalidades
- **Filtragem tríplice imediata:** busca em título+responsável (`oninput`), status (`onchange`), prioridade (`onchange`) — sem botão de buscar
- **Autocomplete de responsáveis:** `<datalist id="rh-dl-tar">` populado com `_rhCache` se disponível — lista colaboradores do módulo RH
- **Ações condicionadas por permissão:** botões Editar/Excluir só renderizados se `temPermissao` retornar true
- **Estado vazio contextual:** distingue "nenhuma tarefa cadastrada" de "nenhuma tarefa encontrada" (filtro)
- **Lazy loading com cache:** `_onShow_aba_tarefas` reusa `_tarefasCache` se já populado

---

## 6. Possíveis Falhas

### 🟠 MÉDIO
- **JavaScript inline junto ao HTML (~145 linhas):** mesmo anti-padrão recorrente.
- **`abrirModalTarefa` depende de `_rhCache` de outro módulo:** `typeof _rhCache !== 'undefined' ? _rhCache : []` — acoplamento implícito ao módulo RH. Se `mod_rh.html` não foi carregado, o `<datalist>` fica vazio sem aviso. Pior: `_rhCache` não é documentado como dependência pública do módulo RH.

### 🟡 BAIXO
- **Lazy loading com `!_tarefasCache.length`:** mesmo problema de `mod_almoxarifado.html` — se carregamento falhar com lista vazia, re-tenta; se a equipe realmente tiver zero tarefas, nunca re-carrega ao abrir a aba de novo.
- **`temPermissao('tarefas','editar')` e `('tarefas','excluir')` usados mas `tarefas` está no módulo v2** — verificar se o módulo de tarefas está em `_P2_MODULOS` (apenas 17 módulos listados: sim, "tarefas" está na lista).
- **Tabela sem coluna "descrição":** o modal tem apenas título — sem campo de descrição para detalhar a tarefa.

---

## 7. Qualidade do Código
**Positivos:**
- `_tarefaStatusCls` e `_tarefaPrioridadeCls` como funções de lookup são padrão limpo
- `escaparHTML` usado em todos os dados de usuário
- Filtragem por 3 dimensões simultâneas é funcional e imediata
- Estado vazio com CTA de nova tarefa se o usuário tem permissão

**Médio:**
- Dependência de `_rhCache` de outro módulo sem contrato explícito
- JS inline junto ao HTML

---

## 8. Melhorias Sugeridas
- Expor `_rhCache` como API pública (ex: `window.RH_CACHE`) em `mod_rh.html` em vez de acessar variável interna
- Adicionar campo de descrição/contexto no modal de tarefa
- Mover JS para `mod_tarefas_js.html` separado

---

## 9. Papel no Sistema
- **Fluxo:** aba abre → `_onShow` → `carregarTarefas()` → `_tarefaRenderizar()` → tabela → modal de criar/editar → GAS.tarefas.salvar
- **Criticidade:** 🟡 BAIXO — gestão interna de equipe; falha aqui não impacta agendamentos

---

## 10. Tags
`#frontend` `#html` `#js-inline` `#tarefas` `#equipe` `#permissoes`

---

## 11. Dependências
- **Depende de:** `GAS.tarefas.*`, `escaparHTML`, `showLoader`, `temPermissao`, `_rhCache` (mod_rh.html implícito), `SweetAlert2`
- **É dependência para:** `mod_balcao.html` usa `GAS.tarefas.listarPorFuncao` para a fila de comunicação — os dois módulos usam a mesma entidade mas com interfaces diferentes

---

## 12. Relação com Problemas Existentes
- `_rhCache` como dependência implícita é o mesmo padrão de acoplamento via global observado em `mod_contratos_js.html` (`_ctrCache` de `GestaoContratos.html`).

---

## 13. Alinhamento com a Visão
**Alinhado:** filtragem tríplice imediata, lazy loading com cache, ações por permissão, autocomplete de responsáveis
**Desalinhado:** JS inline, dependência implícita de `_rhCache`, sem campo de descrição
