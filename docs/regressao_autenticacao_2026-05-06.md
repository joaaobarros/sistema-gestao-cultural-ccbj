# Relatório de Regressão — Autenticação CCBJ

**Data:** 2026-05-06  
**Commit restaurado:** `c0055abb` (2026-05-05 17:22:40)  
**Branch de referência:** `restore/2026-05-05-1723`  
**Commit introdutor da regressão:** `a876fdf` (2026-05-06 08:38:20)

---

## 1. Causa Raiz

O commit `a876fdf` introduziu um sistema de autenticação baseado em captura de email no `doGet`, que é **incompatível** com o modo de deployment `executeAs: USER_DEPLOYING`.

### Por que o sistema original funcionava

No deployment `USER_DEPLOYING + access: ANYONE`, o GAS expõe identidades de forma diferente em dois contextos:

| Contexto | `Session.getActiveUser()` | Comportamento |
|---|---|---|
| `doGet` (HTTP request) | ❌ Retorna vazio para não-proprietários | Session não propagada via HTTP simples |
| `google.script.run` | ✅ Retorna o email do chamante | OAuth token propagado automaticamente |

O sistema original explorava **apenas o contexto correto** (`google.script.run`):
- `doGet` apenas carregava o template HTML sem capturar identidade
- `inicializarApp()` chamava `obterDadosIniciais()` via `google.script.run`
- `obterDadosIniciais()` usava `Session.getActiveUser()` no servidor — funciona neste contexto

### O que `a876fdf` quebrou

O commit introduziu três mudanças que criaram um deadlock de autenticação:

**1. `Codigo.gs` doGet — bloqueou usuários legítimos**
```js
// ANTES (funcional): carregava sem bloqueio
return HtmlService.createTemplateFromFile("Index")
  .evaluate()
  .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

// DEPOIS (quebrado): bloqueava quando email vazio (sempre para não-proprietários)
if (!email) {
  return HtmlService.createHtmlOutput('🔒 Você precisa estar logado...');
}
```

**2. `bootstrap_js.html` — criou dependência circular**
```js
// ANTES (funcional): chamada direta
inicializarApp();

// DEPOIS (quebrado): esperava Auth que nunca resolvia
Auth.quandoPronto(function() { inicializarApp(); });
// Auth dependia de window.__EMAIL_INICIAL__ que doGet nunca injetava → deadlock
```

**3. `auth_identity_js.html` — arquivo novo com múltiplos bugs**
- `Auth._disparar()` chamado mas nunca definido → sessão nunca estabelecida
- 4 `DOMContentLoaded` duplicados chamando `Auth.iniciar()`
- IIFE acessando `AppState.usuario` antes do AppState existir
- GSI introduzido desnecessariamente

**4. `server_bridge_js.html` — passou sessão vazia**
```js
// ANTES: sem sessão (backend resolve via Session.getActiveUser())
GAS._call('obterDadosIniciais', [], cb, err);

// DEPOIS: passa sessão que nunca foi estabelecida
GAS._call('obterDadosIniciais', [GAS._sessao()], cb, err);
// GAS._sessao() → AppState.usuario._sessao || AppState.usuario.email
// Ambos vazios no momento da chamada → string vazia → comportamento idêntico ao original, mas indica arquitetura errada
```

**5. `ALLOWALL` removido** — quebrou compatibilidade com iframes/embeds do GAS.

---

## 2. Arquivos Afetados pela Regressão

### Arquivos críticos alterados (quebraram o sistema)

| Arquivo | Tipo de mudança | Impacto |
|---|---|---|
| `Codigo.gs` | doGet bloqueou em email vazio | Todos os não-proprietários bloqueados em HTTP |
| `html/logic/bootstrap_js.html` | Auth.quandoPronto() em vez de inicializarApp() direto | Boot travado indefinidamente |
| `html/logic/core/auth_identity_js.html` | Arquivo novo com deadlock interno | Auth nunca resolvia |
| `html/logic/services/server_bridge_js.html` | Adição de GAS._sessao() em obterDadosIniciais | Arquitetura de sessão incorreta |

### Arquivos adicionados (não causam regressão diretamente)

| Arquivo | Observação |
|---|---|
| `auth_session.gs` | Implementação de tokens de sessão — funcional mas desnecessária |
| `html/logic/core/auth_identity_js.html` | Helper de identidade — corrigido para não-bloqueante |
| `docs/arquitetura_permissoes.md` | Documentação — sem impacto |
| `docs/analise_arquivos/*.md` | Documentação — sem impacto |

### Arquivos modificados (melhorias mantidas)

| Arquivo | Mudanças relevantes |
|---|---|
| `mod_admin.gs` | `obterDadosIniciais` reescrito com resolução de sessão robusta |
| `mod_permissoes_v2.gs` | Motor de permissões v2 aprimorado |
| `html/logic/mod_permissoes_v2_js.html` | UI de gestão de permissões completa |
| `html/logic/mod_rh.html` | Bug de ReferenceError corrigido |
| `utils.js` | `_getSheet` duplicada removida |

---

## 3. Fluxo Antes vs Depois

### Fluxo original (funcional — 05/05/2026 17:22)
```
doGet → template carregado sem email → setXFrameOptionsMode(ALLOWALL)
  ↓
DOMContentLoaded → bootstrap_js → inicializarApp() [DIRETO]
  ↓
inicializarApp() → GAS.admin.obterDados() → obterDadosIniciais([])
  ↓ (google.script.run — OAuth token propagado)
backend: Session.getActiveUser() → email real do chamante ✅
  ↓
AppState.usuario.email = dados.usuarioEmail → sistema pronto
  ↓
mod_permissoes_js.html → polling até email disponível → carregarPermissoes()
```

### Fluxo pós-regressão (quebrado — 06/05/2026 08:38)
```
doGet → Session.getActiveUser() → vazio para não-proprietários
  ↓
BLOQUEIO: retorna página "Você precisa estar logado" ❌ [DEADLOCK AQUI]
```
```
(se email disponível via doGet):
DOMContentLoaded → bootstrap_js → Auth.quandoPronto(inicializarApp) [ESPERA AUTH]
  ↓
auth_identity_js → Auth.iniciar() → window.__EMAIL_INICIAL__ → OK se injetado
  ↓  
_bootAutenticacao() → Auth._disparar() → MÉTODO NÃO EXISTE ❌
  → sessão nunca estabelecida
  → Auth.pronto = true via Auth.iniciar() [de uma das 4 duplicatas]
  → inicializarApp() roda... mas GAS._sessao() retorna ''
  → sistema parcialmente funcional apenas para o proprietário
```

### Fluxo corrigido (atual — rollback cirúrgico)
```
doGet → tenta email (se disponível: bônus) → NÃO BLOQUEIA → ALLOWALL restaurado
  ↓
DOMContentLoaded → bootstrap_js → inicializarApp() [DIRETO, sem Auth]
  ↓ (em paralelo, não-bloqueante)
auth_identity_js → resolve email em background → Auth._definirEmail()
  ↓
inicializarApp() → GAS.admin.obterDados() → obterDadosIniciais([])
  ↓ (google.script.run)
backend: Session.getActiveUser() → email real ✅
  ↓
AppState.usuario.email = dados.usuarioEmail → sistema pronto ✅
```

---

## 4. Impactos em Autenticação e Permissões

### Autenticação
- **Causa da expulsão de não-proprietários:** `doGet` bloqueou antes do HTML carregar
- **Identidade real:** sempre veio de `google.script.run.obterDadosIniciais()`, nunca do doGet
- **Sessão GSI:** desnecessária — `Session.getActiveUser()` funciona em `google.script.run`

### Permissões
- `mod_permissoes_v2_js.html` — mantido; `carregarPermissoes()` lê `AppState.usuario.email` que agora é populado corretamente
- `temPermissao()` — mantido; fallback para visitante_controlado está correto
- Ordem de carregamento de permissões: `inicializarApp()` → `AppState.usuario.email` set → `mod_permissoes_js.html` polling detecta → `carregarPermissoes()` → `aplicarPermissoesUI()` → estável

### AppState
- `AppState.usuario.email` — populado por `obterDadosIniciais()` via `inicializarApp()`
- `AppState.usuario.isAdmin` / `isSuperadmin` — populados no mesmo callback, sem mudança
- `AppState.usuario._sessao` — nunca necessário neste deployment; removido da dependência crítica

---

## 5. Estratégia de Rollback Adotada

**Rollback cirúrgico** (não reverter tudo):

| Arquivo | Ação |
|---|---|
| `Codigo.gs` doGet | Restaurado ao original + template vars seguras (`emailInicial=''` se vazio) |
| `html/logic/bootstrap_js.html` | Restaurado `inicializarApp()` direto |
| `html/logic/core/auth_identity_js.html` | Reescrito como helper não-bloqueante |
| `html/logic/services/server_bridge_js.html` | `obterDadosIniciais([])` sem sessaoId |
| Demais arquivos | Mantidos — melhorias funcionais preservadas |

**Melhorias preservadas do histórico pós-regressão:**
- `mod_permissoes_v2.gs` e `mod_permissoes_v2_js.html` (permissões granulares)
- `fix(backend)`: remoção de `_getSheet` duplicada em `utils.js`
- `fix(rh)`: ReferenceError crítico em `_rhPodeVerFinanceiro()`
- `fix(reservas)`: migração para `temPermissao()` v2

---

## 6. Riscos Remanescentes

| Risco | Probabilidade | Mitigação |
|---|---|---|
| `Session.getActiveUser()` retornar vazio em edge cases | Baixa | `obterEmailSessaoAtiva()` como fallback assíncrono em `auth_identity_js` |
| Conflito entre `temPermissao()` de v1 e v2 | Baixa | v2 sobrescreve v1 por ser carregado depois; v1 usada como fallback se v2 não carregou |
| Cache de `obterDadosIniciais()` com email errado | Média | Cache usa `CacheService.getScriptCache()` com chave por email — se email correto, cache correto |
| `ALLOWALL` permitindo embed em domínios externos | Aceito | Necessário para funcionamento do GAS HtmlService em alguns contextos |

---

## 7. Branch de Referência

```
restore/2026-05-05-1723 → commit c0055abb → 2026-05-05 17:22:40
```

Para comparar qualquer arquivo:
```bash
git diff restore/2026-05-05-1723 HEAD -- <arquivo>
git show restore/2026-05-05-1723:<arquivo>
```

Para validar login de usuário comum (não-proprietário):
1. Acessar a URL do webapp com conta diferente da do deployer
2. Aguardar carregamento do sistema (2-5s para `obterDadosIniciais`)
3. Verificar console: `Sistema pronto. Usuário: <email-real>` (não o email do proprietário)
4. Verificar que as permissões refletem o perfil do usuário acessante
