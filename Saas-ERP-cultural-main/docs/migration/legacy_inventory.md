# Inventário do Legacy — CCBJ
> FASE 6 — Redução Controlada do Legacy  
> Data: 2026-05-11  
> Status: em redução controlada (17 chamadas _call() restantes no bridge)

---

## Contexto

O bridge (`server_bridge_js.html`) é o contrato público entre o frontend e o backend.  
Toda chamada no bridge deve usar `_callCtrl(ctrl, args, cb, err)` — que passa por um controller com `GasResponse.wrap`.  
Chamadas via `_call(fn, args, cb, err)` são legado — acessam funções GAS diretamente, sem o contrato de resposta padronizado.

**Meta:** zero chamadas `_call()` ao final da migração.  
**Progresso atual:** 220 migradas (92%), 17 restantes (8%).

---

## Classificação dos 17 _call() Restantes

### Classificações

| Código | Significado                                  |
|--------|----------------------------------------------|
| `DEAD` | Nunca chamado no frontend real               |
| `CTRL` | Precisa de um controller novo ou extensão    |
| `AUTH` | Relacionado à infra de autenticação          |
| `WAIT` | Aguardando decisão de produto/roadmap        |

---

### Inventário Completo

| Função                       | Linhas Bridge | Classificação | Ação Recomendada                                              |
|------------------------------|---------------|---------------|---------------------------------------------------------------|
| `obterUrlLogout`             | 189, 294      | `AUTH`        | Migrar para `auth_controller.gs` como `ctrl_auth_url_logout` |
| `salvarPreferenciasUsuario`  | 298           | `CTRL`        | Criar `preferencias_controller.gs` → `ctrl_pref_salvar`      |
| `carregarPreferenciasUsuario`| 302           | `CTRL`        | Criar `preferencias_controller.gs` → `ctrl_pref_carregar`    |
| `listarTodasSolicitacoes`    | 312           | `CTRL`        | Estender `acoes_controller.gs` → `ctrl_acoes_listar_todas`   |
| `listarSolicitacoesPendentes`| 315           | `CTRL`        | Estender `acoes_controller.gs` → `ctrl_acoes_listar_pendentes`|
| `chat_criarSolicitacao`      | 318           | `WAIT`        | Depende do módulo "Chat" — não implementado no frontend atual |
| `enviarConviteEmailInstitucional` | 331     | `CTRL`        | Criar `comunicacao_controller.gs` → `ctrl_com_enviar_convite` |
| `gerarDocumentoDrive`        | 344           | `CTRL`        | Criar `documentos_controller.gs` → `ctrl_doc_gerar`          |
| `obterRelatorioDiario`       | 664           | `CTRL`        | Estender `rh_controller.gs` → `ctrl_rh_relatorio_diario`     |
| `registrarHabilitacaoDiaria` | 668           | `CTRL`        | Estender `habilitacoes_controller.gs` → `ctrl_hab_diaria`    |
| `fazerLogout`                | 291           | `DEAD`        | Nunca chamado — logout é 100% client-side (`_loginLogout()`) |
| `obterItensFixosPorSala`     | 152           | `DEAD`        | Apenas em JSDoc — código real usa `GAS.admin.obterDadosParaConfig` |
| `exportarAgendaRecePlanilha` | 242           | `DEAD`        | Referenciado só em comentário — funcionalidade não implementada |
| `enviarConvitesCalendar`     | 328           | `DEAD`        | Nunca chamado no frontend — helper de integração Google Calendar |
| `criarEventosCalendarConvidados` | 334      | `DEAD`        | Apenas em JSDoc — nunca chamado                               |
| `gerarDocumentoDownload`     | 347           | `DEAD`        | Referenciado apenas em comentário — download feito client-side|

---

## Plano de Eliminação por Prioridade

### Fase Imediata — Remover DEAD (6 funções)
Estas funções nunca são chamadas no frontend real. Podem ser removidas do bridge sem risco.

1. `fazerLogout` (linha 291)
2. `obterItensFixosPorSala` (linha 152)
3. `exportarAgendaRecePlanilha` (linha 242)
4. `enviarConvitesCalendar` (linha 328)
5. `criarEventosCalendarConvidados` (linha 334)
6. `gerarDocumentoDownload` (linha 347)

**Impacto:** bridge_legacy de 17 → 11 (migração de 92% → 95%)

### Fase Curto Prazo — Migrar CTRL prioritários (5 funções)
Criação de controllers simples, baixo risco:

1. `preferencias_controller.gs` — cobre `salvarPreferenciasUsuario` + `carregarPreferenciasUsuario`
2. Extensão de `rh_controller.gs` — cobre `obterRelatorioDiario`
3. Extensão de `habilitacoes_controller.gs` — cobre `registrarHabilitacaoDiaria`
4. `comunicacao_controller.gs` — cobre `enviarConviteEmailInstitucional`
5. `documentos_controller.gs` — cobre `gerarDocumentoDrive`

**Impacto:** bridge_legacy de 11 → 4

### Fase Médio Prazo — Migrar AUTH e WAIT (3 funções)
Dependem de decisão arquitetural:

- `obterUrlLogout` (AUTH) — depende de como o logout será padronizado
- `listarTodasSolicitacoes` + `listarSolicitacoesPendentes` — revisão do módulo Ações
- `chat_criarSolicitacao` — bloqueado pelo módulo Chat (não priorizado)

---

## Status do Core (FASE 7 — Estabilização)

### Serviços em `core/services/` (definitivos, não duplicar)

| Arquivo                  | Responsabilidade                          | Status    |
|--------------------------|-------------------------------------------|-----------|
| `auditoria_service.gs`   | Auditoria: eventos + Logger + registrarLog | ✓ Estável |
| `cache_service.gs`       | AppCache — wrapper do CacheService GAS    | ✓ Estável |
| `data_gateway.gs`        | DataGateway — acesso central à planilha   | ✓ Estável |
| `fsm_guardian.gs`        | FsmGuardian — enforcement centralizado FSM| ✓ Novo    |
| `metrics_engine.gs`      | MetricsEngine — agregador de métricas     | ✓ Estável |
| `permissoes_service.gs`  | PermissoesService — ponto único de permissões | ✓ Estável |
| `usuarios_service.gs`    | UsuariosService — lookup de usuários      | ✓ Estável |

### PROIBIDO criar em outros locais:
- Nenhum `*_service.gs` fora de `core/services/`
- Nenhum helper de cache fora de `cache_service.gs`
- Nenhum acesso a `PermissoesService` duplicado

---

## Wrappers Temporários Ainda Ativos

| Wrapper                          | Localização                 | Motivo                    | Quando Remover       |
|----------------------------------|-----------------------------|---------------------------|----------------------|
| `GAS.permissoesV2` (shim)       | `mod_permissoes_v2_js.html` | Backward-compat v1→v2     | Quando v1 for removido |
| `obterPermissoesUsuario` (v1 fn) | `mod_permissoes_v2.gs`      | Wrapper retro-compat       | Quando não houver mais callers v1 |

---

## Adapters Órfãos Identificados

Nenhum adapter órfão crítico encontrado. Os wrappers acima são intencionais.

Potenciais órfãos a investigar:
- `DataLayer.js` — mencionado em memória como "possivelmente código morto" — verificar callers

---

*Próxima revisão: após remoção dos 6 DEAD do bridge*
