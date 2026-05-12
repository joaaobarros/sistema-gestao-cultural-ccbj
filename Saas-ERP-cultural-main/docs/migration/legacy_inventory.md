# Inventário do Legacy — CCBJ
> FASE 6 — Redução Controlada do Legacy  
> Data: 2026-05-11  
> Status: em redução controlada (12 chamadas _call() restantes no bridge)

---

## Contexto

O bridge (`server_bridge_js.html`) é o contrato público entre o frontend e o backend.  
Toda chamada no bridge deve usar `_callCtrl(ctrl, args, cb, err)` — que passa por um controller com `GasResponse.wrap`.  
Chamadas via `_call(fn, args, cb, err)` são legado — acessam funções GAS diretamente, sem o contrato de resposta padronizado.

**Meta:** zero chamadas `_call()` ao final da migração.  
**Progresso atual:** 225 migradas/removidas (95%), 12 restantes (5%).

---

## Histórico de Remoção DEAD (2026-05-11)

5 entradas DEAD removidas do bridge. Análise de callers confirmada antes de cada remoção:

| Função Removida              | Wrapper GAS Removido                   | Motivo                                                          |
|------------------------------|----------------------------------------|-----------------------------------------------------------------|
| `fazerLogout`                | `GAS.sessao.logout`                    | Zero callers — logout 100% client-side via `_loginLogout()`     |
| `obterItensFixosPorSala`     | `GAS.admin.obterItensFixosPorSala`     | Zero callers via bridge — config usa `GAS.admin.obterDadosParaConfig` |
| `exportarAgendaRecePlanilha` | `GAS.rece.exportarPlanilha`            | Zero callers — funcionalidade não implementada no frontend       |
| `criarEventosCalendarConvidados` | `GAS.comunicacao.criarEventosCalendar` | Zero callers — substituído por `enviarConvitesCalendar`         |
| `gerarDocumentoDownload`     | `GAS.documentos.gerarDownload`         | Apenas referenciado por `gerarDocumentoDownloadPDF` (também removida, zero callers) |

Também removida: função frontend morta `gerarDocumentoDownloadPDF` em `mod_ui_estado_js.html`.

**NOTA IMPORTANTE:** `enviarConvitesCalendar` foi reclassificado de `DEAD` → `CTRL`.  
Análise mostrou que `GAS.comunicacao.criarConvitesCalendar` (linha 328 do bridge) é chamado ativamente  
por `enviarConvitesCalendarInterno()` em `mod_reservas_js.html:3646`, que é chamado em `mod_reservas_js.html:567`.

---

## Classificação dos 12 _call() Restantes

### Classificações

| Código | Significado                                  |
|--------|----------------------------------------------|
| `DEAD` | Nunca chamado no frontend real               |
| `CTRL` | Precisa de um controller novo ou extensão    |
| `AUTH` | Relacionado à infra de autenticação          |
| `WAIT` | Aguardando decisão de produto/roadmap        |

---

### Inventário Completo

| Função                            | Namespace Bridge                     | Classificação | Ação Recomendada                                                |
|-----------------------------------|--------------------------------------|---------------|-----------------------------------------------------------------|
| `obterUrlLogout`                  | `GAS.admin.obterUrlLogout` (l.189)   | `AUTH`        | Migrar para `auth_controller.gs` → `ctrl_auth_url_logout`      |
| `obterUrlLogout`                  | `GAS.sessao.obterUrlLogout` (l.294)  | `AUTH`        | Consolidar em um ponto único após migração AUTH                 |
| `salvarPreferenciasUsuario`       | `GAS.sessao.salvarPreferencia` (l.298) | `CTRL`      | Criar `preferencias_controller.gs` → `ctrl_pref_salvar`        |
| `carregarPreferenciasUsuario`     | `GAS.sessao.carregarPreferencias` (l.302) | `CTRL`   | Criar `preferencias_controller.gs` → `ctrl_pref_carregar`      |
| `listarTodasSolicitacoes`         | `GAS.solicitacoes.listarTodas` (l.312) | `CTRL`      | Estender `acoes_controller.gs` → `ctrl_acoes_listar_todas`     |
| `listarSolicitacoesPendentes`     | `GAS.solicitacoes.listarPendentes` (l.315) | `CTRL`  | Estender `acoes_controller.gs` → `ctrl_acoes_listar_pendentes` |
| `chat_criarSolicitacao`           | `GAS.solicitacoes.criar` (l.318)     | `WAIT`        | Depende do módulo "Chat" — não implementado no frontend atual   |
| `enviarConviteEmailInstitucional` | `GAS.comunicacao.enviarConviteEmail` (l.331) | `CTRL` | Criar `comunicacao_controller.gs` → `ctrl_com_enviar_convite`  |
| `enviarConvitesCalendar`          | `GAS.comunicacao.criarConvitesCalendar` (l.328) | `CTRL` | Criar `comunicacao_controller.gs` → `ctrl_com_convites_calendar` |
| `gerarDocumentoDrive`             | `GAS.documentos.gerarDrive` (l.344) | `CTRL`         | Criar `documentos_controller.gs` → `ctrl_doc_gerar_drive`      |
| `obterRelatorioDiario`            | `GAS.habDiaria.relatorio` (l.664)   | `CTRL`         | Estender `habilitacoes_controller.gs` → `ctrl_hab_relatorio`   |
| `registrarHabilitacaoDiaria`      | `GAS.habDiaria.registrar` (l.668)   | `CTRL`         | Estender `habilitacoes_controller.gs` → `ctrl_hab_diaria`      |

---

## Plano de Eliminação por Prioridade

### Fase Imediata — ✅ CONCLUÍDA (DEAD removidos)
5 entradas DEAD removidas em 2026-05-11. Bridge: 17 → 12.

### Fase Curto Prazo — Migrar CTRL prioritários (8 funções)
Criação de controllers simples, baixo risco:

1. `preferencias_controller.gs` — cobre `salvarPreferenciasUsuario` + `carregarPreferenciasUsuario`
2. `comunicacao_controller.gs` — cobre `enviarConviteEmailInstitucional` + `enviarConvitesCalendar`
3. `documentos_controller.gs` — cobre `gerarDocumentoDrive`
4. Extensão de `habilitacoes_controller.gs` — cobre `obterRelatorioDiario` + `registrarHabilitacaoDiaria`
5. Extensão de `acoes_controller.gs` — cobre `listarTodasSolicitacoes` + `listarSolicitacoesPendentes`

**Impacto:** bridge_legacy de 12 → 2 (obterUrlLogout×2 consolidados + chat_criarSolicitacao)

### Fase Médio Prazo — Migrar AUTH e WAIT (2-3 funções)
Dependem de decisão arquitetural:

- `obterUrlLogout` (AUTH×2) — consolidar + migrar para auth_controller
- `chat_criarSolicitacao` — bloqueado pelo módulo Chat (não priorizado)

---

## Status do Core (FASE 7 — Estabilização)

### Serviços em `core/services/` (definitivos, não duplicar)

| Arquivo                  | Responsabilidade                          | Status    |
|--------------------------|-------------------------------------------|-----------|
| `auditoria_service.gs`   | Auditoria: eventos + Logger + registrarLog | ✓ Estável |
| `cache_service.gs`       | AppCache — wrapper do CacheService GAS    | ✓ Estável |
| `data_gateway.gs`        | DataGateway — acesso central à planilha   | ✓ Estável |
| `fsm_guardian.gs`        | FsmGuardian — enforcement centralizado FSM| ✓ Estável |
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

*Próxima revisão: após criação dos controllers CTRL prioritários*
