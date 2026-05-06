# Arquitetura de Permissões — Sistema CCBJ

> Atualizado: 2026-05-06 — Refactor Fase 2

---

## Fonte única de verdade

`mod_permissoes_v2_js.html` é o único arquivo que define `temPermissao()` e `carregarPermissoes()`. O arquivo legado `mod_permissoes_js.html` **não está incluído** no Index.html.

---

## Fluxo de carregamento

```
DOMContentLoaded
  └─ inicializarApp()                    [mod_ui_estado_js]
       └─ GAS.admin.obterDados()         [async]
            ├─ AppState.usuario.email
            ├─ AppState.usuario.isAdmin
            ├─ AppState.usuario.isSuperadmin
            ├─ AppState.usuario.isHabilitador
            ├─ AppState.usuario.isComunicacao
            └─ configurarInterfacePorPermissao()

  └─ permissoes_ui_js.html polls AppState.usuario.email
       └─ carregarPermissoes()            [mod_permissoes_v2_js, async]
            ├─ GAS.permissoesV2.obter(email)
            ├─ AppState.usuario.permissoes = { modulo: {visualizar, editar, excluir} }
            ├─ AppState.usuario.perfil
            ├─ aplicarPermissoesUI()      → oculta [data-requer-permissao] sem acesso
            └─ dispatchEvent('permissoes:ready')
                 ├─ configurarInterfacePorPermissao()
                 ├─ renderizarReservas()  (se dados já carregados)
                 ├─ _rhAplicarPermissaoFinanceiro()
                 └─ sidebar injection (botão Permissões v2)
```

---

## Função `temPermissao(modulo, acao)`

Localização: `html/logic/mod_permissoes_v2_js.html` — linha 546.

**Cadeia de prioridade:**
1. `AppState.usuario.isSuperadmin` → `true`
2. `_p2S.permissoes` contém dados do email atual → usa `permissoes_finais`
3. `AppState.usuario.permissoes[modulo][acao]` (carregado por `carregarPermissoes`)
4. `AppState.usuario.isAdmin` → `true` (exceto excluir/rh)
5. Fallback visitante_controlado → apenas visualizar em `['agenda','estrategia','comunicacao','espacos']`

**Módulos válidos (17):**
`agenda`, `estrategia`, `comunicacao`, `espacos`, `reservas`, `contratos`, `financeiro`,
`tarefas`, `processos`, `almoxarifado`, `balcao`, `rh`, `eficiencia`, `contratacoes`,
`relatorios`, `escuta`, `pessoal`

**Ações válidas:** `visualizar`, `editar`, `excluir`

---

## `aplicarPermissoesUI()`

Localização: `html/logic/mod_permissoes_v2_js.html` — logo após `carregarPermissoes`.

Oculta (`display:none`) todos os elementos com `data-requer-permissao="modulo:acao"` onde o usuário não tem permissão. Chamada automaticamente dentro de `carregarPermissoes()` após carregar dados do backend.

Módulos com `data-requer-permissao`: `rh:editar`, `tarefas:editar`, `processos:editar`, `almoxarifado:editar`, `contratacoes:editar`, `escuta:visualizar`.

---

## Flags legados (AppState.usuario)

Mantidos por compatibilidade ou sem equivalente v2:

| Flag | Origem | Equivalente v2 |
|------|--------|----------------|
| `isAdmin` | `GAS.admin.obterDados()` | `temPermissao(modulo,'editar')` na maioria dos casos |
| `isSuperadmin` | `GAS.admin.obterDados()` | `isSuperadmin` em `temPermissao` tem prioridade máxima |
| `isHabilitador` | `GAS.admin.obterDados()` | **Sem equivalente v2** — controla botão "Habilitar reserva" |
| `isComunicacao` | `GAS.admin.obterDados()` | Aproxima-se do perfil `comunicacao` em v2 |

---

## Uso por módulo

| Módulo | Verificação de permissão | Padrão |
|--------|--------------------------|--------|
| Configurações | `configurarInterfacePorPermissao()` | flags legacy (isAdmin/isSuperadmin) |
| Reservas (lista/modal) | `temPermissao('reservas','editar')` | v2 ✓ |
| Reservas RECE | `temPermissao('reservas','editar/excluir')` | v2 ✓ |
| RH | `temPermissao('rh','editar/excluir')` | v2 ✓ |
| Tarefas | `temPermissao('tarefas','editar/excluir')` | v2 ✓ |
| Processos | `temPermissao('processos','editar/excluir')` | v2 ✓ |
| Almoxarifado | `temPermissao('almoxarifado','editar/excluir')` | v2 ✓ |
| Balcão | `temPermissao('balcao','editar')` | v2 ✓ |
| Contratações | `temPermissao('contratacoes','editar/excluir')` | v2 ✓ |
| Auditoria | `AppState.usuario.isAdmin` (bloqueia aba) | legacy — sem módulo v2 |
| Rollback | `AppState.usuario.isSuperadmin` | legacy — operação superadmin only |

---

## Padrão de uso nos módulos

```js
// Verificação simples
if (!temPermissao('reservas', 'editar')) {
  Swal.fire('Sem permissão', '...', 'warning');
  return;
}

// Renderização condicional
const btnEditar = temPermissao('reservas', 'editar') || AppState.usuario.email === r[8]
  ? '<button ...>Editar</button>'
  : '';

// data-requer-permissao (oculto automaticamente após carregarPermissoes)
<button data-requer-permissao="rh:editar" ...>Novo Colaborador</button>
```

---

## Ordem de inclusão (Index.html)

```
app_state_js           ← PRIMEIRO: define AppState
server_bridge_js       ← GAS namespace
disponibilidade_module_js
itens_module_js
mod_ui_componentes_js
navegacao_ui_js        ← mostrarAba
permissoes_ui_js       ← chama carregarPermissoes após AppState pronto
mod_ui_estado_js       ← inicializarApp
mod_reservas_js
mod_admin_js
mod_contratos_js
mod_favoritos_js
mod_permissoes_v2_js   ← define temPermissao, carregarPermissoes, aplicarPermissoesUI
integracao_reserva_comunicacao_js
bootstrap_js           ← ÚLTIMO: dispara DOMContentLoaded handlers
```

---

## Função `_getSheet` — backend (utils.js)

`_getSheet(nomeAba)` é a única função backend para acessar abas. Definida em `utils.js` linha 84.

**`ABA_PARA_MODULO` — mapeamento completo:**

| Aba | Módulo |
|-----|--------|
| Administradores, Configuracoes, Listas, Logs, LogAcessos, PreferenciasUsuarios | MASTER |
| Reservas, Itens, Ativos, Solicitacoes | ESPACOS |
| ReservasRECE, ProcessosComunicacao, EntregasComunicacao | COMUNICACAO |
| RelatoriosCODIP, Contratos, Metas, Indicadores, Rubricas, RubricasMemoria, RubricasHistorico, ContratosVersoes | RELATORIOS |
| Contratacoes, Pagamentos, FluxoCaixa, RubricasFinanceiro | FINANCEIRO |
| Funcionarios, Escalas, Avaliacoes, Ferias | EQUIPES |
| Tarefas, Processos, Demandas | PESSOAL |

**Bug corrigido (refactor-fase2, 2026-05):** Existia uma segunda definição de `_getSheet` em `utils.js` (linha 923) que sobrescrevia a correta (linha 84). A versão duplicada retornava `[]` (array vazio) para abas não mapeadas, causando `TypeError: getLastRow is not a function` quando `obterDadosIniciais()` chamava `_getSheet("Administradores")`. Isso impedia o boot completo e mantinha `isAdmin = false`, ocultando Configurações e Auditoria.
