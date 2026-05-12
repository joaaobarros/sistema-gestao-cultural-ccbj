# Inventário do Legacy — CCBJ
> FASE 7 — Consolidação Quase Total do Bridge  
> Data: 2026-05-11  
> Status: consolidação avançada (1 chamada _call() restante — WAIT bloqueada)

---

## Contexto

O bridge (`server_bridge_js.html`) é o contrato público entre o frontend e o backend.  
Toda chamada no bridge deve usar `_callCtrl(ctrl, args, cb, err)` — que passa por um controller com `GasResponse.wrap`.  
Chamadas via `_call(fn, args, cb, err)` são legado — acessam funções GAS diretamente, sem o contrato de resposta padronizado.

**Meta:** zero chamadas `_call()` ao final da migração.  
**Progresso atual:** 231 migradas/removidas (99%), 1 restante (1%).

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

## Histórico de Remoção CTRL+AUTH (2026-05-11)

11 entradas CTRL+AUTH migradas para controllers em 2026-05-11. Bridge: 12 → 1.

| Função Migrada                 | Namespace Bridge                          | Controller Destino                          |
|--------------------------------|-------------------------------------------|---------------------------------------------|
| `salvarPreferenciasUsuario`    | `GAS.sessao.salvarPreferencia`            | `ctrl_pref_salvar` (preferencias_controller)|
| `carregarPreferenciasUsuario`  | `GAS.sessao.carregarPreferencias`         | `ctrl_pref_carregar` (preferencias_controller)|
| `obterUrlLogout` (×2)          | `GAS.admin.obterUrlLogout` + `GAS.sessao.obterUrlLogout` | `ctrl_auth_url_logout` (auth_controller) — ponto único |
| `listarTodasSolicitacoes`      | `GAS.solicitacoes.listarTodas`            | `ctrl_acoes_listar_todas` (acoes_controller)|
| `listarSolicitacoesPendentes`  | `GAS.solicitacoes.listarPendentes`        | `ctrl_acoes_listar_pendentes` (acoes_controller)|
| `enviarConvitesCalendar`       | `GAS.comunicacao.criarConvitesCalendar`   | `ctrl_com_convites_calendar` (comunicacao_controller)|
| `enviarConviteEmailInstitucional`| `GAS.comunicacao.enviarConviteEmail`    | `ctrl_com_enviar_convite` (comunicacao_controller)|
| `gerarDocumentoDrive`          | `GAS.documentos.gerarDrive`               | `ctrl_doc_gerar_drive` (documentos_controller)|
| `obterRelatorioDiario`         | `GAS.habDiaria.relatorio`                 | `ctrl_hab_relatorio` (habilitacoes_controller)|
| `registrarHabilitacaoDiaria`   | `GAS.habDiaria.registrar`                 | `ctrl_hab_diaria` (habilitacoes_controller) |

**Novos controllers criados:** `preferencias_controller.gs`, `comunicacao_controller.gs`, `documentos_controller.gs`  
**Controllers estendidos:** `auth_controller.gs`, `habilitacoes_controller.gs`, `acoes_controller.gs`  
**Novos eventos em events_constants.gs:** `CALENDAR_INVITE_SENT`, `EMAIL_INVITE_SENT`, `DOCUMENT_GENERATED`, `USER_PREFERENCE_SAVED`, `QUALIFICATION_DAILY_REGISTERED`

---

## Classificação do 1 _call() Restante

| Código | Significado                                  |
|--------|----------------------------------------------|
| `WAIT` | Aguardando decisão de produto/roadmap        |

| Função                  | Namespace Bridge              | Classificação | Bloqueio                                         |
|-------------------------|-------------------------------|---------------|--------------------------------------------------|
| `chat_criarSolicitacao` | `GAS.solicitacoes.criar`      | `WAIT`        | Módulo "Chat" não implementado no frontend atual |

---

## Plano de Eliminação por Prioridade

### Fase Imediata — ✅ CONCLUÍDA (DEAD removidos)
5 entradas DEAD removidas em 2026-05-11. Bridge: 17 → 12.

### Fase Curto Prazo — ✅ CONCLUÍDA (CTRL+AUTH migrados)
11 entradas CTRL+AUTH migradas em 2026-05-11. Bridge: 12 → 1.

### Fase Final — WAIT (1 função)
Bloqueada por decisão de produto:

- `chat_criarSolicitacao` — desbloqueia quando o módulo Chat for implementado

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
