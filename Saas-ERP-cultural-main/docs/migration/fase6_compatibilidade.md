# FASE 6 — Estratégia de Compatibilidade
# Sistema CCBJ — Camada de Compatibilidade e Adapters

**Data:** 2026-05-11
**Branch:** refactor-fase2
**Status:** ESTRATÉGIA DEFINIDA — implementação é etapa futura controlada

---

## Princípio

> Toda função pública que for renomeada, movida ou substituída deve
> continuar disponível com sua assinatura original enquanto houver callers.
> O adapter é temporário e deve ter data de remoção planejada.

---

## 1. Compatibilidade Atual Já Implementada

### 1.1 — obterPermissoesUsuario() (v1 → v2 wrapper)

**Arquivo:** `gas/src/backend/mod_permissoes_v2.gs` (linhas 521–558)
**Status:** ATIVO — wrapper v1 presente e funcional

**Contrato mantido:**
```javascript
// API v1 (preservada como wrapper):
obterPermissoesUsuario(email)
// Retorna: { perfil: 'admin', modulos: { reservas: {visualizar, editar, excluir}, ... } }

// API v2 (canônica):
obterPermissoesUsuarioV2(email)
// Retorna: { email, perfil_base, permissoes_automaticas, permissoes_manuais, permissoes_finais, ... }
```

**Callers do wrapper v1:**
- `_resolverNivelAcesso()` em `core/auth_session.gs` — usa `.perfil` do retorno v1

**Condição de remoção:** quando `_resolverNivelAcesso` for migrado para chamar `obterPermissoesUsuarioV2` diretamente

---

### 1.2 — associarRecurso() (ex-associarRecursoAcao)

**Arquivo:** `gas/src/action_engine/action_engine.gs`
**Status:** CONCLUÍDO — renomeação já propagada em toda a bridge

**Histórico:**
- Legacy: `associarRecursoAcao(acaoId, tipo, recursoId)`
- gas/src: `associarRecurso(acaoId, tipo, recursoId, email)`

**Compatibilidade:**
- `server_bridge_js.html` já chama `GAS._call('associarRecurso', ...)` — sem adapter necessário
- Nenhum caller frontend usa o nome antigo

---

### 1.3 — podeAcessarModulo / podeEditar / podeExcluir

**Arquivo:** `gas/src/backend/mod_permissoes_v2.gs`
**Status:** ATIVO — funções públicas de conveniência mantidas

**Contratos:**
```javascript
podeAcessarModulo(email, modulo)  → boolean
podeEditar(email, modulo)         → boolean
podeExcluir(email, modulo)        → boolean
```

Estas funções são facades sobre `obterPermissoesUsuarioV2` e não devem ser removidas enquanto houver callers no backend.

---

### 1.4 — GAS.financeiro (namespace legado na bridge)

**Arquivo:** `gas/src/html/logic/services/server_bridge_js.html`
**Status:** LEGADO ATIVO — marcado com comentário de retrocompatibilidade

**Contrato:**
```javascript
// Namespace legado (deprecado):
GAS.financeiro.obterContratacoes(cb)
GAS.financeiro.salvarContratacao(dados, cb)
// ...etc

// Namespace canônico:
GAS.contratacoes.listar(cb)
GAS.contratacoes.salvar(dados, cb)
// ...etc
```

**Condição de remoção:** após confirmar (via grep) que nenhum arquivo HTML chama `GAS.financeiro.*`

---

## 2. Adapters a Implementar (Etapa Futura)

### A-01 — Migrar _resolverNivelAcesso para v2 direto

**Arquivo:** `gas/src/core/auth_session.gs`

**Situação atual:**
```javascript
function _resolverNivelAcesso(email) {
  if (typeof verificarPermissao === 'function') {
    try { if (verificarPermissao('superadmin', email)) return 'superadmin'; } catch(_) {}
    try { if (verificarPermissao('admin', email)) return 'admin'; } catch(_) {}
  }
  try {
    if (typeof obterPermissoesUsuario === 'function') {
      var perms = obterPermissoesUsuario(email);  // ← chama v1 wrapper
      return (perms && perms.perfil) || 'visitante_controlado';
    }
  } catch(_) {}
  return 'visitante_controlado';
}
```

**Migração target:**
```javascript
function _resolverNivelAcesso(email) {
  try {
    if (typeof obterPermissoesUsuarioV2 === 'function') {
      var p = obterPermissoesUsuarioV2(email);
      return (p && p.perfil_base) || 'visitante_controlado';
    }
  } catch(_) {}
  return 'visitante_controlado';
}
```

**Risco:** MÉDIO — auth é crítico
**Quando executar:** somente quando v1 wrapper precisar ser removido

---

### A-02 — Extrair _p2obterMapaAdmins() como helper

**Arquivo:** `gas/src/backend/mod_permissoes_v2.gs`

**Código do adapter:**
```javascript
// Função privada nova — não exposta publicamente
function _p2obterMapaAdmins() {
  var mapa = {};
  try {
    var aba = _getSheet('Administradores');
    if (!aba || aba.getLastRow() < 2) return mapa;
    var nivelMap = {
      superadmin:'superadmin', admin:'admin', gestor:'gestor',
      tecnico:'tecnico', 'técnico':'tecnico', rh:'rh',
      comunicacao:'comunicacao', 'comunicação':'comunicacao'
    };
    aba.getRange(2, 1, aba.getLastRow()-1, 2).getValues().forEach(function(r) {
      var em = String(r[0]||'').toLowerCase().trim();
      var nv = String(r[1]||'').toLowerCase().trim();
      if (em && nivelMap[nv]) mapa[em] = nivelMap[nv];
    });
  } catch(e) {}
  return mapa;
}
```

Substituir os 3 blocos repetidos por chamadas a esta função.
**Risco:** BAIXO

---

## 3. Estratégia de Compatibilidade google.script.run

### Regra Geral

Toda função chamável pelo frontend via `google.script.run` deve:
1. Manter a mesma assinatura enquanto `server_bridge_js.html` a referenciar
2. Ser renomeada internamente apenas com alias compatível

### Padrão de alias:

```javascript
// Em qualquer arquivo .gs — manter função antiga como alias:
function nomeFuncaoAntiga() {
  return nomeFuncaoNova.apply(this, arguments);
}
```

### Funções públicas com callers bridge ativos (não remover sem alias):

| Função GAS | Namespace GAS.* | Arquivo |
|-----------|-----------------|---------|
| `obterReservas` | `GAS.reservas.obter` | mod_reservas.gs / mod_admin.gs |
| `criarReservaController` | `GAS.reservas.criar` | mod_admin.gs / mod_reservas.gs |
| `atualizarReservaController` | `GAS.reservas.atualizar` | mod_admin.gs |
| `cancelarReserva` | `GAS.reservas.cancelar` | mod_reservas.gs |
| `verificarConflitoEspaco` | `GAS.reservas.verificarConflito` | mod_reservas.gs |
| `obterDadosIniciais` | `GAS.admin.obterDados` | mod_admin.gs |
| `obterPermissoesUsuarioV2` | `GAS.permissoes.obter` | mod_permissoes_v2.gs |
| `salvarPermissoesUsuarioV2` | `GAS.permissoes.salvar` | mod_permissoes_v2.gs |
| `listarPermissoesV2` | `GAS.permissoes.listar` | mod_permissoes_v2.gs |
| `iniciarSessaoGAS` | `GAS.auth.iniciar` | auth_session.gs |
| `validarCredenciais` | `GAS.auth.login` | auth_session.gs |
| `modulos_obterRegistro` | `GAS.modulos.obterRegistro` | mod_modulos_registry.gs |
| `modulos_alterarStatus` | `GAS.modulos.alterarStatus` | mod_modulos_registry.gs |
| `criarAcao` | `GAS.acoes.criar` | action_engine.gs |
| `associarRecurso` | `GAS.acoes.associarRecurso` | action_engine.gs |
| `chaves_obterDados` | `GAS.chaves.obterDados` | mod_chaves.gs |

---

## 4. Compatibilidade de Includes HTML

### Estado atual (correto)

Todos os includes em `Index.html` já usam os nomes canônicos. Não há includes com nomes legados.

### Regra para novos arquivos

Ao criar novo arquivo HTML:
1. Usar prefixo `mod_` (módulo), `core_` (infraestrutura) ou nome descritivo
2. Adicionar `<?!= include('html/logic/nome_js') ?>` em `Index.html` na posição correta
3. A ordem em Index.html IMPORTA — dependências devem ser carregadas antes dos dependentes

### Ordem correta no Index.html (referência):

```
1. css/layout base
2. core/event_bus_js      ← EventBus primeiro
3. core/app_state_js      ← AppState depende de EventBus
4. core/auth_identity_js  ← identidade depende de AppState
5. services/server_bridge_js ← bridge depende de AppState
6. ui/navegacao_ui_js     ← navegação depende de bridge e AppState
7. ui/permissoes_ui_js    ← permissões depende de AppState e bridge
8. mod_ui_componentes_js  ← componentes usados pelos módulos
9. mod_ui_estado_js       ← estado dos módulos
10. [módulos específicos] ← carregados por demanda (disponibilidade, itens, etc.)
11. mod_*_js              ← lógica de cada módulo
12. bootstrap_js          ← boot sempre por último
```

---

## 5. Compatibilidade de Dados (JSON no Drive)

Os arquivos JSON no Drive são:
- `permissoes_v2.json` — permissões de usuários
- `usuarios_sistema.json` — lista de usuários conhecidos
- `auditoria_permissoes.json` — log de auditoria
- `modulos_config.json` (mod_modulos_registry) — configuração de módulos ativos
- `preferencias_<email>.json` (mod_preferencias) — preferências por usuário

**Regras:**
1. Nunca mudar o schema de `permissoes_v2.json` sem migração explícita de todos os registros
2. `modulos_config.json` pode ter campos adicionados (backward compatible), mas não removidos
3. Se um campo for removido do schema, manter leitura tolerante (`|| defaultValue`)

---

## 6. Checklist de Compatibilidade antes de Deploy

Antes de qualquer deploy de `gas/src/`:

- [ ] `google.script.run.*` — todas as funções chamadas pela bridge existem no backend
- [ ] Index.html — todos os includes apontam para arquivos existentes
- [ ] `_P2_MODULOS` em mod_permissoes_v2.gs — lista inclui todos os módulos ativos no registry
- [ ] `ABA_PARA_MODULO` em utils.gs — todas as abas necessárias estão mapeadas
- [ ] `MODULOS` em setup.gs — todos os módulos têm entrada com abas corretas
- [ ] `server_bridge_js.html` — namespaces GAS.* batem com funções backend existentes
- [ ] Suite de testes `test_conflito_reserva.gs` — executar `executarTodosTesteConflito()` no editor GAS

---

*Estratégia definida em 2026-05-11.*
