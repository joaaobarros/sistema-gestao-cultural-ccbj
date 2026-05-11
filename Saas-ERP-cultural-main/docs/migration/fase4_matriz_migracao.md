# FASE 4 — Matriz de Migração
# Sistema CCBJ — Inventário Técnico Completo

**Data:** 2026-05-11
**Branch:** refactor-fase2
**Status:** gas/src é versão canônica — legacy é referência histórica apenas

---

## Convenção de Criticidade

| Nível | Significado |
|-------|-------------|
| `CRÍTICO` | Falha impede uso do sistema; sem fallback |
| `ALTO` | Falha degrada funcionalidade principal |
| `MÉDIO` | Falha afeta módulo específico, sistema continua |
| `BAIXO` | Falha é isolada, recuperável ou não operacional |

## Convenção de Prioridade de Migração

| Prioridade | Significado |
|------------|-------------|
| `1` | Deve ser migrado/estabilizado primeiro |
| `2` | Segunda onda |
| `3` | Terceira onda |
| `4` | Pode aguardar |
| `✅` | Já migrado / canônico |

---

## CAMADA CORE — Infraestrutura

| Arquivo | Localização atual | Destino arquitetural | Domínio | Criticidade | Dependências | Adapter necessário | Prioridade |
|---------|------------------|-----------------------|---------|-------------|--------------|-------------------|-----------|
| `core/config.gs` | `gas/src/core/config.gs` | core/ (definitivo) | config | CRÍTICO | PropertiesService | Não | ✅ |
| `core/utils.gs` | `gas/src/core/utils.gs` | core/ (definitivo) | utils | CRÍTICO | setup.gs | Não | ✅ |
| `core/setup.gs` | `gas/src/core/setup.gs` | core/ (definitivo) | setup | CRÍTICO | SpreadsheetApp, PropertiesService | Não | ✅ |
| `core/data_layer.gs` | `gas/src/core/data_layer.gs` | core/ (definitivo) | persistência | CRÍTICO | DriveApp | Não | ✅ |
| `core/auth_session.gs` | `gas/src/core/auth_session.gs` | core/ (definitivo) | autenticação | CRÍTICO | CacheService, UrlFetchApp, PropertiesService | Não | ✅ → fix Logger.log |
| `core/logger.gs` | `gas/src/core/logger.gs` | core/ (definitivo) | logging | ALTO | utils.gs (registrarLog) | Não | ✅ |
| `core/event_bus_backend.gs` | `gas/src/core/event_bus_backend.gs` | core/ (definitivo) | eventos | MÉDIO | utils.gs (_getSheet) | Não | ✅ |
| `core/events_constants.gs` | `gas/src/core/events_constants.gs` | core/ (definitivo) | constantes | BAIXO | Nenhuma | Não | ✅ |

---

## CAMADA BACKEND — Serviços Orquestradores

| Arquivo | Localização atual | Destino arquitetural | Domínio | Criticidade | Dependências | Adapter necessário | Prioridade |
|---------|------------------|-----------------------|---------|-------------|--------------|-------------------|-----------|
| `backend/router.gs` | `gas/src/backend/router.gs` | backend/ (definitivo) | roteamento HTTP | CRÍTICO | mod_admin.gs, core/config.gs | Não | ✅ |
| `backend/mod_admin.gs` | `gas/src/backend/mod_admin.gs` | backend/ (definitivo) | administração | CRÍTICO | utils.gs, auth_session.gs, modules/reservas | Não | ✅ |
| `backend/mod_permissoes_v2.gs` | `gas/src/backend/mod_permissoes_v2.gs` | backend/ (definitivo) | permissões | CRÍTICO | data_layer.gs, event_bus_backend.gs | Wrapper v1 temporário | ✅ → extrair _p2obterMapaAdmins |
| `backend/mod_modulos_registry.gs` | `gas/src/backend/mod_modulos_registry.gs` | backend/ (definitivo) | módulos ativos | ALTO | data_layer.gs, event_bus_backend.gs | Não | ✅ |
| `backend/mod_relatorios.gs` | `gas/src/backend/mod_relatorios.gs` | backend/ (definitivo) | relatórios | MÉDIO | utils.gs, data_layer.gs | Não | ✅ |
| `backend/mod_metrics.gs` | `gas/src/backend/mod_metrics.gs` | backend/ (definitivo) | métricas | MÉDIO | utils.gs | Não | ✅ |
| `backend/mod_preferencias.gs` | `gas/src/backend/mod_preferencias.gs` | backend/ (definitivo) | preferências | BAIXO | data_layer.gs | Não | ✅ |

---

## CAMADA MODULES — Domínios de Negócio

| Arquivo | Localização atual | Destino arquitetural | Domínio | Criticidade | Dependências | Adapter necessário | Prioridade |
|---------|------------------|-----------------------|---------|-------------|--------------|-------------------|-----------|
| `modules/reservas/mod_reservas.gs` | `gas/src/modules/reservas/mod_reservas.gs` | modules/reservas/ (definitivo) | reservas/agenda | CRÍTICO | utils.gs, LockService | Não | ✅ — Prioridade migração: 1 |
| `modules/chaves/mod_chaves.gs` | `gas/src/modules/chaves/mod_chaves.gs` | modules/chaves/ (definitivo) | chaves | ALTO | utils.gs, SystemEvents | Não | ✅ — Prioridade migração: 2 |
| `modules/rh/mod_rh.gs` | `gas/src/modules/rh/mod_rh.gs` | modules/rh/ (definitivo) | RH/PCCS | MÉDIO | utils.gs | Não | ✅ — Prioridade migração: 4 |
| `modules/financeiro/mod_financeiro.gs` | `gas/src/modules/financeiro/mod_financeiro.gs` | modules/financeiro/ (definitivo) | financeiro | MÉDIO | utils.gs, SystemEvents | Não | ✅ — Prioridade migração: 3 |
| `modules/escuta/mod_escuta.gs` | `gas/src/modules/escuta/mod_escuta.gs` | modules/escuta/ (definitivo) | escuta institucional | MÉDIO | utils.gs | Não | ✅ |
| `modules/comunicacao/mod_comunicacao.gs` | `gas/src/modules/comunicacao/mod_comunicacao.gs` | modules/comunicacao/ (definitivo) | comunicação | MÉDIO | utils.gs | Não | ✅ |
| `modules/comunicacao/mod_comunicacao_processos.gs` | `gas/src/modules/comunicacao/mod_comunicacao_processos.gs` | modules/comunicacao/ (definitivo) | processos comunicação | MÉDIO | utils.gs | Não | ✅ |
| `modules/almoxarifado/mod_almoxarifado.gs` | `gas/src/modules/almoxarifado/mod_almoxarifado.gs` | modules/almoxarifado/ (definitivo) | almoxarifado | MÉDIO | utils.gs | Não | ✅ |
| `modules/equipes/mod_equipes.gs` | `gas/src/modules/equipes/mod_equipes.gs` | modules/equipes/ (definitivo) | equipes/escalas | MÉDIO | utils.gs | Não | ✅ |
| `modules/pessoal/mod_pessoal.gs` | `gas/src/modules/pessoal/mod_pessoal.gs` | modules/pessoal/ (definitivo) | pessoal/tarefas/balcão | MÉDIO | utils.gs | Não | ✅ |
| `modules/programacao/mod_habilitacoes.gs` | `gas/src/modules/programacao/mod_habilitacoes.gs` | modules/programacao/ (definitivo) | programação/credenciamento | MÉDIO | utils.gs | Não | ✅ |
| `modules/programacao/mod_hab_diaria.gs` | `gas/src/modules/programacao/mod_hab_diaria.gs` | modules/programacao/ (definitivo) | programação/check-in | MÉDIO | utils.gs | Não | ✅ |
| `modules/reservas/test_conflito_reserva.gs` | `gas/src/modules/reservas/test_conflito_reserva.gs` | modules/reservas/ (mantido) | testes | BAIXO | mod_reservas.gs | Não | ✅ — não é arquivo de produção |

---

## CAMADA ACTION ENGINE

| Arquivo | Localização atual | Destino arquitetural | Domínio | Criticidade | Dependências | Adapter necessário | Prioridade |
|---------|------------------|-----------------------|---------|-------------|--------------|-------------------|-----------|
| `action_engine/action_engine.gs` | `gas/src/action_engine/action_engine.gs` | action_engine/ (definitivo) | ações institucionais | MÉDIO | utils.gs, SystemEvents | Não (associarRecurso renomeada de associarRecursoAcao — já compatível) | ✅ |

---

## CAMADA HTML — Frontend

### Layout

| Arquivo | Localização atual | Destino arquitetural | Domínio | Criticidade | Adapter necessário | Prioridade |
|---------|------------------|-----------------------|---------|-------------|-------------------|-----------|
| `html/layout/header.html` | `gas/src/html/layout/header.html` | html/layout/ (definitivo) | layout | ALTO | Não | ✅ |
| `html/layout/sidebar.html` | `gas/src/html/layout/sidebar.html` | html/layout/ (definitivo) | layout | ALTO | Não | ✅ |
| `html/layout/login_html.html` | `gas/src/html/layout/login_html.html` | html/layout/ (definitivo) | autenticação UI | CRÍTICO | Não | ✅ |

### Modais

| Arquivo | Localização atual | Domínio | Criticidade | Adapter necessário | Prioridade |
|---------|------------------|---------|-------------|-------------------|-----------|
| `html/modais/modal_config.html` | `gas/src/html/modais/modal_config.html` | configuração | MÉDIO | Não | ✅ |
| `html/modais/modal_manual.html` | `gas/src/html/modais/modal_manual.html` | ajuda | BAIXO | Não | ✅ |

### Módulos HTML

| Arquivo | Localização atual | Domínio | Criticidade | Prioridade migração |
|---------|------------------|---------|-------------|---------------------|
| `html/modulos/mod_nova_reserva.html` | `gas/src/html/modulos/...` | reservas | CRÍTICO | 1 |
| `html/modulos/mod_agenda_geral.html` | `gas/src/html/modulos/...` | agenda | CRÍTICO | 1 |
| `html/modulos/mod_agenda_rece.html` | `gas/src/html/modulos/...` | agenda RECE | ALTO | 1 |
| `html/modulos/mod_aprovacoes.html` | `gas/src/html/modulos/...` | aprovações | ALTO | 1 |
| `html/modulos/mod_protocolo_chaves.html` | `gas/src/html/modulos/...` | chaves | ALTO | 2 |
| `html/modulos/mod_permissoes_v2.html` | `gas/src/html/modulos/...` | permissões | ALTO | 5 |
| `html/modulos/mod_gestao_modulos.html` | `gas/src/html/modulos/...` | módulos | MÉDIO | 5 |
| `html/modulos/mod_rh.html` | `gas/src/html/modulos/...` | RH/PCCS | MÉDIO | 4 |
| `html/modulos/mod_financeiro.html` | `gas/src/html/modulos/...` | financeiro | MÉDIO | 3 |
| `html/modulos/mod_gestao_contratos.html` | `gas/src/html/modulos/...` | contratos | MÉDIO | 3 |
| `html/modulos/mod_relatorios_financeiros.html` | `gas/src/html/modulos/...` | relatórios | MÉDIO | 3 |
| `html/modulos/mod_escuta.html` | `gas/src/html/modulos/...` | escuta | MÉDIO | 4 |
| `html/modulos/mod_almoxarifado.html` | `gas/src/html/modulos/...` | almoxarifado | MÉDIO | 4 |
| `html/modulos/mod_habilitacoes.html` | `gas/src/html/modulos/...` | habilitações | MÉDIO | 4 |
| `html/modulos/mod_acoes.html` | `gas/src/html/modulos/...` | ações | MÉDIO | 3 |
| `html/modulos/mod_dashboard.html` | `gas/src/html/modulos/...` | dashboard | MÉDIO | 3 |
| `html/modulos/mod_configuracoes.html` | `gas/src/html/modulos/...` | configurações | MÉDIO | 5 |
| `html/modulos/mod_painel_solicitacoes.html` | `gas/src/html/modulos/...` | solicitações | MÉDIO | 3 |
| `html/modulos/mod_auditoria.html` | `gas/src/html/modulos/...` | auditoria | MÉDIO | 5 |
| `html/modulos/mod_rh.html` | `gas/src/html/modulos/...` | RH | MÉDIO | 4 |
| `html/modulos/mod_processos.html` | `gas/src/html/modulos/...` | processos | BAIXO | 4 |
| `html/modulos/mod_tarefas.html` | `gas/src/html/modulos/...` | tarefas | BAIXO | 4 |
| `html/modulos/mod_eficiencia.html` | `gas/src/html/modulos/...` | eficiência | BAIXO | 4 |
| `html/modulos/mod_codip.html` | `gas/src/html/modulos/...` | CODIP | BAIXO | 4 |
| `html/modulos/mod_balcao.html` | `gas/src/html/modulos/...` | balcão | BAIXO | 4 |
| `html/modulos/mod_contratacoes.html` | `gas/src/html/modulos/...` | contratações | MÉDIO | 3 |
| `html/modulos/mod_escuta.html` | `gas/src/html/modulos/...` | escuta | MÉDIO | 4 |

### Lógica JS Frontend

| Arquivo | Localização atual | Domínio | Criticidade | Adapter necessário |
|---------|------------------|---------|-------------|-------------------|
| `html/logic/bootstrap_js.html` | `gas/src/html/logic/...` | boot | CRÍTICO | Não |
| `html/logic/auth_login_js.html` | `gas/src/html/logic/...` | autenticação | CRÍTICO | Não |
| `html/logic/core/app_state_js.html` | `gas/src/html/logic/core/...` | estado global | CRÍTICO | Não |
| `html/logic/core/auth_identity_js.html` | `gas/src/html/logic/core/...` | identidade | CRÍTICO | Não |
| `html/logic/core/event_bus_js.html` | `gas/src/html/logic/core/...` | eventos frontend | ALTO | Não |
| `html/logic/services/server_bridge_js.html` | `gas/src/html/logic/services/...` | bridge GAS | CRÍTICO | GAS.financeiro → alias temporário |
| `html/logic/ui/navegacao_ui_js.html` | `gas/src/html/logic/ui/...` | navegação | ALTO | Não |
| `html/logic/ui/permissoes_ui_js.html` | `gas/src/html/logic/ui/...` | permissões UI | ALTO | Não |
| `html/logic/mod_ui_componentes_js.html` | `gas/src/html/logic/...` | componentes UI | ALTO | Não |
| `html/logic/mod_ui_estado_js.html` | `gas/src/html/logic/...` | estado UI | ALTO | Não |
| `html/logic/mod_reservas_js.html` | `gas/src/html/logic/...` | reservas | CRÍTICO | Não |
| `html/logic/mod_permissoes_v2_js.html` | `gas/src/html/logic/...` | permissões | ALTO | Não |
| `html/logic/mod_gestao_modulos_js.html` | `gas/src/html/logic/...` | módulos | MÉDIO | Não |
| `html/logic/mod_admin_js.html` | `gas/src/html/logic/...` | admin | ALTO | Não |
| `html/logic/mod_contratos_js.html` | `gas/src/html/logic/...` | contratos | MÉDIO | Não |
| `html/logic/mod_favoritos_js.html` | `gas/src/html/logic/...` | favoritos | BAIXO | Não |
| `html/logic/mod_acoes_js.html` | `gas/src/html/logic/...` | ações | MÉDIO | Não |
| `html/logic/mod_habilitacoes_js.html` | `gas/src/html/logic/...` | habilitações | MÉDIO | Não |
| `html/logic/mod_hab_diaria_js.html` | `gas/src/html/logic/...` | hab. diária | MÉDIO | Não |
| `html/logic/mod_protocolo_chaves_js.html` | `gas/src/html/logic/...` | chaves | ALTO | Não |
| `html/logic/integracao_reserva_comunicacao_js.html` | `gas/src/html/logic/...` | integração | MÉDIO | Não |
| `html/logic/modules/disponibilidade_module_js.html` | `gas/src/html/logic/modules/...` | disponibilidade | ALTO | Não |
| `html/logic/modules/itens_module_js.html` | `gas/src/html/logic/modules/...` | itens | MÉDIO | Não |

---

## CONFIGURAÇÃO

| Arquivo | Localização atual | Criticidade | Observação |
|---------|-----------------|-------------|-----------|
| `appsscript.json` | `gas/src/appsscript.json` | CRÍTICO | Manifest do GAS — não alterar sem validação |
| `Index.html` | `gas/src/Index.html` | CRÍTICO | Cadeia de includes — toda mudança de arquivo reflete aqui |
| `.clasp.json` | `Saas-ERP-cultural-main/.clasp.json` | ALTO | Vinculação ao projeto GAS |

---

## Ordem Global de Migração por Domínio

Conforme definição arquitetural oficial:

```
Prioridade 1 → reservas
Prioridade 2 → chaves
Prioridade 3 → métricas / financeiro / relatórios / ações
Prioridade 4 → RH / pessoal / almoxarifado / escuta
Prioridade 5 → permissões / autenticação / configuração / demais
```

Esta ordem reflete criticidade operacional e acoplamento, não complexidade técnica.

---

*Matriz gerada em 2026-05-11.*
