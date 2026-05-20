# FASE 5 — Matriz de Risco
# Sistema CCBJ — Classificação de Arquivos por Risco de Refatoração

**Data:** 2026-05-11
**Branch:** refactor-fase2
**Status:** ANÁLISE CONCLUÍDA — usar como referência antes de qualquer mudança

---

## Legenda

| Classificação | Definição |
|---------------|-----------|
| `CRÍTICO` | Qualquer falha paralisa o sistema. Exige testes antes e depois. |
| `CENTRAL` | Usado por quase todos os módulos. Mudança tem cascata ampla. |
| `ACOPLADO` | Muitos callers externos. Mudança de assinatura é alto risco. |
| `PERIGOSO` | Lógica complexa, difícil de testar, estado compartilhado. |
| `ESTÁVEL` | Funcional, estável, baixo acoplamento. Mudança de baixo risco. |
| `ÓRFÃO` | Sem callers identificados ou domínio sem usuário ativo. |
| `MORTO` | Código que não é executado em produção. |

---

## 1. Arquivos CRÍTICOS

Falha causa parada imediata do sistema para todos os usuários.

### core/auth_session.gs
**Risco:** CRÍTICO + PERIGOSO
**Por quê:**
- Controla todo o fluxo de autenticação (iniciarSessaoGAS, validarCredenciais, _resolverEmailReal)
- CacheService para sessões — falha paralisa login de todos os usuários
- Tem problema conhecido: `Logger.log()` undefined (não afeta fluxo, mas causa ruído)
- Dois mecanismos de autenticação diferentes: JWT Google + email/senha
- Lógica de bootstrap (`criarPrimeiroAdmin`) irrecuperável se corrompida

**Antes de qualquer mudança:**
- Testar login com senha e com GSI
- Testar renovação de sessão (renovarSessaoGAS)
- Testar fluxo de visitante_controlado

**Mudanças de BAIXO risco:**
- Substituir `Logger.log` por `console.log` (D-03 do fase2)
- Remover fallback SpreadsheetApp (D-06 do fase2)

**Mudanças de ALTO risco:**
- Qualquer alteração em `_resolverEmailReal` ou `_resolverEmailSessao`
- Qualquer alteração em TTL de sessão (_SESSAO_TTL_SEGUNDOS)

---

### backend/router.gs
**Risco:** CRÍTICO
**Por quê:**
- Único ponto de entrada HTTP do sistema (`doGet`, `doPost`)
- Erros aqui deixam toda a interface inacessível
- Controla `include()` de todos os HTML

**Antes de qualquer mudança:** testar que o app ainda abre no browser

---

### gas/src/Index.html
**Risco:** CRÍTICO + ACOPLADO
**Por quê:**
- Cadeia de includes que define toda a ordem de carregamento do frontend
- Qualquer include faltando ou na ordem errada quebra o sistema silenciosamente
- Já teve includes duplicados removidos (mod_permissoes_v2_js) — requer atenção

**Regra:** ao adicionar ou remover qualquer arquivo HTML, atualizar Index.html imediatamente

---

### core/utils.gs
**Risco:** CRÍTICO + CENTRAL
**Por quê:**
- `_getSheet()` é chamado por praticamente todos os módulos
- `registrarLog()` é chamado pelo Logger customizado
- `normalizarHora()` é usado pelo motor de conflito de reservas
- Mudança em qualquer função aqui tem cascata em 15+ arquivos

**Regra:** apenas adições seguras. Nunca remover, renomear ou alterar assinaturas existentes.

---

### backend/mod_permissoes_v2.gs
**Risco:** CRÍTICO + PERIGOSO + ACOPLADO
**Por quê:**
- Motor de 4 camadas de permissão: perfil_base + automáticas + manuais + finais
- Usado em todo acesso a módulos (`podeAcessarModulo`, `podeEditar`, `podeExcluir`)
- Wrapper v1 (`obterPermissoesUsuario`) mantido — remover exige migração de callers
- JSON `permissoes_v2.json` no Drive é source of truth — corrupção é catastrófica
- Race condition protegida por `modifyJSON` (atomic read-modify-write com lock)

**Antes de qualquer mudança:** testar todas as permissões de todos os perfis (8 perfis × N módulos)

---

## 2. Arquivos CENTRAIS

Usados por muitos módulos. Mudança tem cascata, mas não paralisa imediatamente.

### core/setup.gs
**Risco:** CENTRAL + CRÍTICO (durante setup)
**Por quê:**
- Define `MODULOS`, `PROP`, `COR_MODULO` — constantes usadas em todos os módulos
- `_getSheet()` depende de `_abrirModulo()` que vem de setup.gs
- Durante setup inicial (`recriarEstrutura`), falha é irrecuperável sem acesso ao editor GAS
**Regra:** apenas adições a MODULOS/PROP/COR_MODULO. Nunca remover entradas existentes.

---

### core/data_layer.gs
**Risco:** CENTRAL
**Por quê:**
- `readJSON`, `writeJSON`, `modifyJSON` são usados por permissoes_v2, modulos_registry, preferencias
- Único acesso ao Drive para persistência JSON
- Falha afeta permissões, módulos ativos e preferências simultaneamente

---

### backend/mod_admin.gs
**Risco:** CENTRAL + ACOPLADO
**Por quê:**
- `obterDadosIniciais()` é o entrypoint do boot do frontend — chamado sempre no login
- `obterEmailUsuario()` é chamado por praticamente todos os módulos backend
- `verificarPermissao()` é chamado por auth_session e outros módulos
- Contém lógica de aprovação de reservas (gateway crítico operacional)

---

### html/logic/services/server_bridge_js.html
**Risco:** CENTRAL + ACOPLADO
**Por quê:**
- Toda chamada frontend → backend passa por aqui
- Qualquer mudança de assinatura de função GAS reflete aqui
- Tem namespace `GAS.financeiro` legado (D-01 do fase2)
- `GAS._sessao()` é usado como identificador em todas as chamadas autenticadas

---

## 3. Arquivos ALTAMENTE ACOPLADOS

Muitos callers que podem quebrar com mudança de assinatura.

### modules/reservas/mod_reservas.gs
**Callers:** mod_admin.gs (aprovar), server_bridge_js (criar/cancelar/verificar), test_conflito
**Risco:** ACOPLADO + ALTO
**Pontos críticos:**
- Motor de conflito (`verificarConflitoEspaco`) — lógica de negócio central
- `criarReservaController` tem integração com action_engine (acaoId)
- LockService para operações atômicas — deadlock é risco real em carga alta

---

### core/logger.gs
**Callers:** todos os módulos (backend/ e modules/) exceto core/ e setup.gs
**Risco:** ACOPLADO
**Ponto crítico único:** se `registrarLog` falhar, Logger tem fallback para console.warn (não
bloqueia operações). O risco real é a **colisão de namespace** com o Logger nativo GAS
(veja D-03 do fase2).

---

### html/logic/core/app_state_js.html
**Callers:** bootstrap_js, auth_login_js, todos os módulos js do frontend
**Risco:** ACOPLADO + ALTO
**Por quê:** AppState é o state container global do frontend. Mudança na estrutura
de `AppState.usuario`, `AppState.reservas`, `AppState.acoes`, etc. quebra todos os módulos.

---

## 4. Arquivos PERIGOSOS para Refatoração

Complexidade alta, estado compartilhado, difícil de testar isoladamente.

### backend/mod_permissoes_v2.gs *(já listado como CRÍTICO)*

### modules/reservas/mod_reservas.gs *(já listado como ACOPLADO)*

### html/logic/bootstrap_js.html
**Risco:** PERIGOSO
**Por quê:** orquestra o boot do sistema inteiro (auth check, carregamento de dados, renderização).
Falha aqui resulta em tela em branco para o usuário — difícil de diagnosticar.

---

### html/logic/ui/navegacao_ui_js.html
**Risco:** PERIGOSO (para mudanças de estrutura)
**Por quê:** 217 linhas de diff vs legacy, controla toda a navegação entre módulos,
sidebar, e estado de módulo ativo. Qualquer regressão aqui afeta UX de 100% dos usuários.

---

## 5. Arquivos ESTÁVEIS

Funcional, baixo acoplamento, mudança de baixo risco.

| Arquivo | Por quê é estável |
|---------|------------------|
| `modules/almoxarifado/mod_almoxarifado.gs` | Domínio isolado, sem events críticos |
| `modules/equipes/mod_equipes.gs` | Domínio isolado, CRUD simples |
| `modules/pessoal/mod_pessoal.gs` | Domínio isolado, tarefas/balcão/pessoal |
| `modules/escuta/mod_escuta.gs` | Domínio fechado, sem dependências externas |
| `modules/comunicacao/mod_comunicacao.gs` | Domínio isolado |
| `modules/comunicacao/mod_comunicacao_processos.gs` | Domínio isolado |
| `backend/mod_preferencias.gs` | Apenas CRUD de preferências JSON |
| `backend/mod_relatorios.gs` | Leitura/geração — sem mutações críticas |
| `backend/mod_metrics.gs` | Leitura de métricas — sem estado mutável |
| `core/events_constants.gs` | Constantes puras — apenas leitura |
| `html/modais/modal_config.html` | UI simples, escopo limitado |
| `html/modais/modal_manual.html` | UI estática |

---

## 6. Arquivos ÓRFÃOS ou APARENTEMENTE MORTOS

| Arquivo | Situação | Ação recomendada |
|---------|----------|-----------------|
| `modules/reservas/test_conflito_reserva.gs` | Suite de testes não executada automaticamente | Manter — executar manualmente antes de deploys em reservas |
| `GAS.ia.chat → _stub()` em server_bridge | Funcionalidade não implementada | Manter placeholder, documentar como backlog |
| `GAS.admin.obterMetricasCODIP` | Backend `obterMetricasCODIP` pode ser stub | Verificar implementação no backend antes de usar |
| `GAS.admin.obterRelatoriosCODIP` | Mesmo caso | Verificar |
| Fluxo JWT GSI em auth_session.gs | Produção usa validarCredenciais (senha), não GSI | Manter para futuro; testar quando GSI for ativado |

---

## 7. Mapa de Impacto por Mudança

| Se mudar... | Risco de quebrar... |
|-------------|---------------------|
| `core/utils.gs` → `_getSheet` | TODOS os módulos que acessam planilhas |
| `core/setup.gs` → constantes MODULOS | Setup, data_layer, todos os getSheet |
| `backend/mod_permissoes_v2.gs` → `_P2_MODULOS` | Motor de permissões, CRUD de perfis |
| `core/auth_session.gs` → `_resolverEmailSessao` | Login de todos os usuários |
| `html/logic/services/server_bridge_js.html` → GAS.* | Frontend inteiro |
| `gas/src/Index.html` → includes | Carregamento do frontend |
| `backend/router.gs` → doGet | Acesso ao sistema via browser |
| `backend/mod_admin.gs` → `obterEmailUsuario` | Todo backend que identifica usuário |
| `core/logger.gs` → Logger interface | Todo módulo que usa Logger.info/warn/error |

---

## 8. Protocolo de Mudança Segura

Para arquivos **CRÍTICOS** ou **CENTRAIS**:

```
1. Ler o arquivo completo antes de qualquer edição
2. Identificar todos os callers da função a ser modificada
3. Escrever o plano de mudança antes de executar
4. Fazer a menor mudança possível
5. Testar o caminho feliz E o caminho de erro
6. Verificar que nenhuma assinatura pública mudou
7. Confirmar em git diff que o impacto é exatamente o esperado
```

Para arquivos **ESTÁVEIS**:
```
1. Fazer a mudança
2. Testar o módulo afetado
```

---

*Matriz gerada em 2026-05-11.*
