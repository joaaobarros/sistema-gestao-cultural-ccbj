# FASE 2 — Detecção de Duplicações
# Sistema CCBJ — gas/src

**Data:** 2026-05-11
**Branch:** refactor-fase2
**Status:** ANÁLISE CONCLUÍDA — nenhuma ação destrutiva ainda executada

---

## Contexto

Esta fase mapeia todas as duplicações estruturais, paralelas, e violações de convenção
identificadas após a auditoria completa do sistema em `gas/src/`.

O sistema já passou por consolidação prévia (v1 removida, stubs removidos, duplicação de
`_getSheet` eliminada). O que resta são duplicações mais sutis ou violações arquiteturais
que exigem análise antes de qualquer ação.

---

## Legenda de Classificação

| Código | Significado |
|--------|-------------|
| `CI` | CONSOLIDAR IMEDIATAMENTE — baixo risco, ação simples |
| `CC` | CONSOLIDAR COM COMPATIBILIDADE — exige adapter/wrapper temporário |
| `ENC` | EXTRAIR NÚCLEO COMUM — diferenças pequenas, alto aproveitamento |
| `MS` | MANTER SEPARADO — separação arquitetural real e necessária |
| `AR` | ALTO RISCO — migração posterior, exige investigação |

---

## 1. Duplicações Identificadas

---

### D-01 — GAS.financeiro (legacy) vs GAS.contratacoes

**Tipo:** namespace paralelo no frontend
**Arquivos:** `gas/src/html/logic/services/server_bridge_js.html`

**Situação:**
- `GAS.financeiro` é explicitamente marcado como `// legado — mantido para retrocompatibilidade`
- `GAS.contratacoes` é o namespace canônico atual
- Ambos chamam as mesmas funções backend: `obterContratacoes`, `salvarContratacao`, `excluirContratacao`, `obterPagamentos`, `registrarPagamento`, `obterFluxoCaixa`

**Diferença:** zero — namespace idêntico com nomes ligeiramente diferentes nos wrappers

**Callers conhecidos:** Não identificados (nenhuma chamada `GAS.financeiro.*` encontrada nos módulos HTML audited)

**Classificação:** `CC` — CONSOLIDAR COM COMPATIBILIDADE

**Ação recomendada:**
```javascript
// Em server_bridge_js.html — manter alias explícito após remover duplicação:
var GAS_financeiro_LEGADO = GAS.contratacoes; // ou remover diretamente se sem callers
```

**Risco:** BAIXO — apenas frontend, sem impacto em backend

---

### D-02 — obterPermissoesUsuario() v1 vs obterPermissoesUsuarioV2()

**Tipo:** wrapper de compatibilidade
**Arquivo:** `gas/src/backend/mod_permissoes_v2.gs` (linhas 521–558)

**Situação:**
- `obterPermissoesUsuario(email)` é uma função de compatibilidade v1
- Internamente chama `obterPermissoesUsuarioV2(em)` e projeta o resultado para o formato antigo
- Tem fallback para visitante_controlado em caso de erro

**Callers no backend:**
- `_resolverNivelAcesso()` em `core/auth_session.gs` (linha 352)
- Potencialmente outros módulos que não foram migrados para chamar v2 diretamente

**Formato v1 retornado:**
```javascript
{ perfil: 'admin', modulos: { reservas: {visualizar, editar, excluir}, ... } }
```

**Formato v2:**
```javascript
{ email, perfil_base, permissoes_automaticas, permissoes_manuais, permissoes_finais, ... }
```

**Classificação:** `CC` — CONSOLIDAR COM COMPATIBILIDADE

**Ação recomendada:**
- Manter o wrapper v1 enquanto `_resolverNivelAcesso` o chamar
- Quando `_resolverNivelAcesso` for migrado para chamar `obterPermissoesUsuarioV2` diretamente, remover o wrapper
- **Não remover ainda**

---

### D-03 — Logger customizado vs Logger nativo GAS

**Tipo:** colisão de namespace global crítica
**Arquivo:** `gas/src/core/logger.gs`

**Situação:**
- GAS possui um global `Logger` nativo com o método `Logger.log()`
- `core/logger.gs` declara `var Logger = (function(){...})()` que retorna `{info, warn, error}`
- Esta declaração **sobrescreve o Logger nativo do GAS** no escopo global de todos os scripts
- O Logger customizado NÃO define `.log`, portanto `Logger.log()` se torna `undefined`

**Impacto real:**
- Em `core/auth_session.gs`, há chamadas a `Logger.log(...)` (linhas 229, 236, 243, 248, 253, 258, etc.)
- Estas chamadas FALHAM silenciosamente porque `Logger.log` é `undefined`
- As falhas ocorrem dentro de funções como `_verificarJWTGoogle`, `_validarEmailAutorizado`
- Quando `_verificarJWTGoogle` é chamada de dentro de `try/catch` em `iniciarSessaoGAS`, a falha de `Logger.log` não impede o retorno da função (o `Logger.log` é apenas logging)
- O **fluxo de autenticação JWT não é interrompido** — apenas o log de debug falha silenciosamente

**Evidência:**
```javascript
// auth_session.gs linha 229 — Logger.log é undefined após logger.gs ser carregado:
Logger.log('[Auth] tokeninfo retornou ' + resp.getResponseCode() + ': ' + resp.getContentText());
```

**Classificação:** `CI` — CONSOLIDAR IMEDIATAMENTE

**Ação recomendada:**
Substituir `Logger.log(...)` por `Logger.info('auth', ...)` ou `console.log(...)` em auth_session.gs.

**Atenção:** auth_session.gs está na camada `core/` onde `Logger.info` NÃO deve ser usado
(dependência circular: Logger → registrarLog → _getSheet → utils → circular).
Usar `console.log(...)` nas chamadas internas de auth_session.gs é correto — não é violação
porque auth_session é uma exceção documentada de core/ sem acesso a Logger.

```javascript
// CORRETO para auth_session.gs (core/):
console.log('[Auth] tokeninfo retornou ' + resp.getResponseCode());

// ERRADO — Logger.log não existe após logger.gs ser carregado:
Logger.log('[Auth] ...');
```

**Risco:** BAIXO — apenas logs de debug JWT perdidos, não afeta fluxo de autenticação

---

### D-04 — Lookup de Administradores Sheet repetido (3 locais)

**Tipo:** lógica duplicada de acesso a dados
**Arquivo:** `gas/src/backend/mod_permissoes_v2.gs`

**Situação:**
O padrão de "buscar nível do usuário na aba Administradores" aparece em 3 funções:

```javascript
// Padrão repetido em:
// 1. obterPermissoesUsuarioV2() — resolução de perfil_base para novos usuários
// 2. salvarPermissoesUsuarioV2() — função _buscarOuDefault() interna
// 3. sincronizarUsuariosSistema() — construção de nivelMap
```

Cada uma faz:
1. `_getSheet('Administradores')`
2. `getRange(2, 1, lastRow-1, 2).getValues()`
3. Itera e mapeia email → nível

**Classificação:** `ENC` — EXTRAIR NÚCLEO COMUM

**Ação recomendada:**
Criar função privada em mod_permissoes_v2.gs:
```javascript
function _p2obterMapaAdmins() {
  var mapa = {};
  try {
    var aba = _getSheet('Administradores');
    if (!aba || aba.getLastRow() < 2) return mapa;
    var nivelParaPerfilMap = {
      superadmin:'superadmin', admin:'admin', gestor:'gestor',
      tecnico:'tecnico', 'técnico':'tecnico', rh:'rh',
      comunicacao:'comunicacao', 'comunicação':'comunicacao'
    };
    aba.getRange(2, 1, aba.getLastRow()-1, 2).getValues().forEach(function(r) {
      var em = String(r[0]||'').toLowerCase().trim();
      var n  = String(r[1]||'').toLowerCase().trim();
      if (em && nivelParaPerfilMap[n]) mapa[em] = nivelParaPerfilMap[n];
    });
  } catch(e) {}
  return mapa;
}
```

**Risco:** BAIXO — mesma lógica, só consolida leitura

---

### D-05 — obterEmailUsuario (mod_admin.gs) vs _resolverEmailReal (auth_session.gs)

**Tipo:** sobreposição parcial de responsabilidade
**Arquivos:** `gas/src/backend/mod_admin.gs:26` e `gas/src/core/auth_session.gs:169`

**Situação:**
- `obterEmailUsuario(emailClienteFallback, sessaoId)` — pública, chamável via google.script.run por módulos de negócio
- `_resolverEmailReal(sessaoOuEmail)` — privada, usada internamente pelo sistema de sessão

**Hierarquia de cada uma:**

| Função | Session.getActiveUser | Token sessão | Email direto |
|--------|-----------------------|--------------|--------------|
| `obterEmailUsuario` | ✅ sim | ✅ sim (via _resolverEmailSessao) | ✅ sim (emailClienteFallback) |
| `_resolverEmailReal` | ✅ sim | ✅ sim | ✅ sim (validado) |

**Diferenças reais:**
- `obterEmailUsuario` é exposta como API pública do módulo admin (chamada pelo frontend via bridge indiretamente)
- `_resolverEmailReal` é interna à camada de sessão
- `obterEmailUsuario` chama `Logger.error` em caso de falha; `_resolverEmailReal` lança exceção

**Classificação:** `MS` — MANTER SEPARADO

**Justificativa:** responsabilidades distintas. `obterEmailUsuario` é o ponto de entrada de negócio (chamada pelos módulos). `_resolverEmailReal` é infraestrutura de sessão. Unificar quebraria a separação de camadas (`core/` não deve depender de `backend/`).

---

### D-06 — SpreadsheetApp direto em auth_session.gs

**Tipo:** violação de regra de acesso a dados
**Arquivo:** `gas/src/core/auth_session.gs` (função `_registrarLogSessao`)

**Situação:**
```javascript
function _registrarLogSessao(email, acao) {
  try {
    var sh = typeof _getSheet === 'function' ? _getSheet('LogAcessos') : null;
    if (!sh) {
      // Fallback violando a regra arquitetural:
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      sh = ss ? ss.getSheetByName('LogAcessos') : null;
    }
    ...
```

O fallback `SpreadsheetApp.getActiveSpreadsheet()` viola a regra "nunca acessar SpreadsheetApp diretamente fora de `core/utils.gs`".

**Porém:** auth_session.gs IS parte de core/, e o fallback só é acionado se `_getSheet` não estiver disponível (impossível em execução normal).

**Classificação:** `CI` — CONSOLIDAR IMEDIATAMENTE

**Ação recomendada:**
Remover o fallback — se `_getSheet` não existe, a função não deve tentar escrever o log:
```javascript
function _registrarLogSessao(email, acao) {
  try {
    var sh = typeof _getSheet === 'function' ? _getSheet('LogAcessos') : null;
    if (!sh) return; // silent skip — log de sessão não crítico
    sh.appendRow([new Date().toISOString(), email, acao, '', 'sessao', '']);
  } catch(e) {
    console.warn('[AuthLog]', e.message);
  }
}
```

**Risco:** MÍNIMO — é apenas log de acesso, não é fluxo crítico

---

### D-07 — mod_pessoal.gs concentra múltiplos conceitos

**Tipo:** acoplamento de domínio em arquivo único
**Arquivo:** `gas/src/modules/pessoal/mod_pessoal.gs`
**Frontend:** `GAS.tarefas`, `GAS.balcao` e `GAS.processos` (bridge)

**Situação:**
- Tarefas institucionais → `GAS.tarefas.*`
- Atendimentos de balcão → `GAS.balcao.*`
- Interações de pessoal → provavelmente em mod_pessoal.gs também
- Todos mapeados para `mod_pessoal.gs`

**Avaliação:**
Para o tamanho atual do sistema, não é problemático. O risco é que o arquivo cresça
sem limite e as responsabilidades se misturem.

**Classificação:** `MS` — MANTER SEPARADO por ora

**Condição para split futuro:** quando `mod_pessoal.gs` ultrapassar ~600 linhas ou quando
tarefas/balcão tiverem lógica de negócio distinta e complexa.

---

### D-08 — GAS.ia.chat → _stub()

**Tipo:** funcionalidade não implementada com placeholder visível
**Arquivo:** `gas/src/html/logic/services/server_bridge_js.html`

**Situação:**
```javascript
ia: {
  chamar: function(prompt, ctx, cb, err) { GAS._call('chamarIA', ...); },
  chat:   function(mensagens, ctx, cb, err) { GAS._stub(cb); },  // stub!
  reescreverDescricao: function(texto, setor, cb, err) { ... }
}
```

`GAS.ia.chat` é um stub. `GAS.ia.chamar` e `GAS.ia.reescreverDescricao` são reais.

**Classificação:** `MS` — MANTER SEPARADO

**Ação recomendada:** nenhuma agora. Remover o stub apenas quando a funcionalidade
for implementada ou descartada definitivamente.

---

### D-09 — Dois módulos de agenda separados

**Tipo:** possível duplicação intencional
**Arquivos:**
- `html/modulos/mod_agenda_geral.html`
- `html/modulos/mod_agenda_rece.html`

**Avaliação:**
- `mod_agenda_geral.html` — visão geral de todos os espaços
- `mod_agenda_rece.html` — agenda específica do espaço RECE (fluxo diferente)

**Classificação:** `MS` — MANTER SEPARADO — separação funcional real

---

## 2. Tabela Consolidada

| ID | Duplicação | Arquivos | Classificação | Risco | Prioridade |
|----|------------|----------|---------------|-------|-----------|
| D-01 | GAS.financeiro vs GAS.contratacoes | server_bridge_js.html | CC | BAIXO | Baixa |
| D-02 | obterPermissoesUsuario v1 wrapper | mod_permissoes_v2.gs | CC | MÉDIO | Média |
| D-03 | Logger.log vs Logger custom | logger.gs + auth_session.gs | CI | BAIXO | Alta |
| D-04 | Lookup Administradores × 3 | mod_permissoes_v2.gs | ENC | BAIXO | Média |
| D-05 | obterEmailUsuario vs _resolverEmailReal | mod_admin.gs + auth_session.gs | MS | — | Não aplicável |
| D-06 | SpreadsheetApp direto em auth_session | auth_session.gs | CI | MÍNIMO | Alta |
| D-07 | mod_pessoal.gs multi-conceito | mod_pessoal.gs | MS | — | Não aplicável |
| D-08 | GAS.ia.chat stub | server_bridge_js.html | MS | — | Não aplicável |
| D-09 | agenda_geral vs agenda_rece | html/modulos/ | MS | — | Não aplicável |

---

## 3. Ações Imediatas Seguras (CONSOLIDAR IMEDIATAMENTE)

As ações CI podem ser executadas sem risco de regressão:

### Ação 1 — Substituir Logger.log por console.log em auth_session.gs

**Arquivo:** `gas/src/core/auth_session.gs`
**Operação:** buscar e substituir todas as ocorrências de `Logger.log(` por `console.log(`
**Motivo:** auth_session.gs é core/ e não pode usar o Logger customizado (dependência circular)

### Ação 2 — Remover fallback SpreadsheetApp em _registrarLogSessao

**Arquivo:** `gas/src/core/auth_session.gs`
**Operação:** remover o bloco `if (!sh) { var ss = SpreadsheetApp... }`
**Motivo:** fallback viola regra arquitetural; o log de sessão não é crítico para o sistema

---

## 4. Ações com Compatibilidade (CONSOLIDAR COM COMPATIBILIDADE)

### Ação 3 — Remover GAS.financeiro namespace

**Ordem de operações:**
1. Confirmar que nenhum arquivo HTML chama `GAS.financeiro.*`
2. Remover o namespace `financeiro:` de server_bridge_js.html
3. Se existirem callers: adicionar alias `GAS.financeiro = GAS.contratacoes` por 1 versão

### Ação 4 — Extrair _p2obterMapaAdmins()

**Ordem de operações:**
1. Criar função privada `_p2obterMapaAdmins()` em mod_permissoes_v2.gs
2. Substituir os 3 blocos repetidos pela chamada à nova função
3. Testar que `obterPermissoesUsuarioV2`, `salvarPermissoesUsuarioV2` e `sincronizarUsuariosSistema` continuam funcionando

---

*Análise concluída em 2026-05-11. Nenhuma ação executada neste documento.*
