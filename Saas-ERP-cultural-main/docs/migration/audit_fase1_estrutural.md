# FASE 1 — Auditoria Estrutural Completa
# Migração Legacy → gas/src

**Data:** 2026-05-11  
**Branch:** refactor-fase2  
**Autor:** JP Barros  
**Status:** FASE 1 CONCLUÍDA — gas/src é a versão canônica

---

## 1. Descoberta Principal

**A direção da migração está invertida em relação ao esperado.**

Ao executar a auditoria comparativa entre `legacy/` e `gas/src/`, constatou-se que:

> `gas/src/` **JÁ É A VERSÃO MAIS AVANÇADA** do sistema.

O `legacy/` é um snapshot histórico do sistema flat original. O `gas/src/` foi construído a partir do legacy e evoluiu com:

- Logger padronizado (substitui console.*)
- SystemEvents em todos os módulos críticos
- Bug fixes (normalizarHora, auth_session, _getSheet duplicado, etc.)
- Novos módulos (Habilitações, PCCS/RH, config operacional)
- Arquitetura modular consolidada (core, modules, backend, action_engine)

**Conclusão:** Não há conteúdo funcional no `legacy/` que precise ser "trazido" para `gas/src/`.  
O `legacy/` pode ser tratado como **camada de compatibilidade de referência histórica**.

---

## 2. Mapeamento Completo — legacy → gas/src

### 2.1 Arquivos Core (infraestrutura)

| Arquivo legacy | Arquivo gas/src | Estado | Delta |
|---------------|-----------------|--------|-------|
| `utils.js` | `core/utils.gs` | ✅ gas/src AVANÇADO | normalizarHora(Number), mais ABA_PARA_MODULO entries |
| `Setup.js` | `core/setup.gs` | ✅ gas/src AVANÇADO | planilha ACOES separada, Habilitacoes tab, HabDiaria tab |
| `DataLayer.gs` | `core/data_layer.gs` | ✅ IDÊNTICO | — |
| `config.gs` | `core/config.gs` | ✅ gas/src AVANÇADO | getSistemaConfig(), salvarSistemaConfig(), invalidarCacheSistemaConfig() |
| `auth_session.gs` | `core/auth_session.gs` | ✅ gas/src AVANÇADO | Bug fix: _resolverNivelAcesso com try/catch separados por nível |
| *(não existia)* | `core/logger.gs` | 🆕 NOVO EM gas/src | Logger.info/warn/error — interface uniforme |
| *(não existia)* | `core/event_bus_backend.gs` | 🆕 NOVO EM gas/src | SystemEvents.emit(), getRecentes(), getEventosPorEntidade() |
| *(não existia)* | `core/events_constants.gs` | 🆕 NOVO EM gas/src | 37 tipos de evento (SystemEventTypes.*) |

### 2.2 Módulos de Domínio

| Arquivo legacy | Arquivo gas/src | Estado | Delta |
|---------------|-----------------|--------|-------|
| `mod_reservas.gs` | `modules/reservas/mod_reservas.gs` | ✅ gas/src AVANÇADO | Motor de conflito corrigido (regra explícita), SystemEvents, Logger |
| `mod_chaves.gs` | `modules/chaves/mod_chaves.gs` | ✅ gas/src AVANÇADO | SystemEvents KEY_PROTOCOL_*, Logger |
| `mod_rh.gs` | `modules/rh/mod_rh.gs` | ✅ gas/src AVANÇADO | **321 → 697 linhas**: módulo PCCS completo (tabela salarial, parâmetros, reajuste) |
| `mod_escuta.gs` | `modules/escuta/mod_escuta.gs` | ✅ gas/src AVANÇADO | Pequenas diferenças de configuração |
| `mod_financeiro.gs` | `modules/financeiro/mod_financeiro.gs` | ✅ gas/src AVANÇADO | SystemEvents CONTRACT_CREATED/PAYMENT_REGISTERED |
| `mod_comunicacao.gs` | `modules/comunicacao/mod_comunicacao.gs` | ✅ gas/src AVANÇADO | Logger padronizado |
| `mod_comunicacao_processos.gs` | `modules/comunicacao/mod_comunicacao_processos.gs` | ✅ gas/src AVANÇADO | Logger padronizado |
| `mod_almoxarifado.gs` | `modules/almoxarifado/mod_almoxarifado.gs` | ✅ IDÊNTICO | — |
| `mod_equipes.gs` | `modules/equipes/mod_equipes.gs` | ✅ IDÊNTICO | — |
| `mod_pessoal.gs` | `modules/pessoal/mod_pessoal.gs` | ✅ IDÊNTICO | — |
| `mod_acoes.gs` | `action_engine/action_engine.gs` | ✅ gas/src AVANÇADO | Função `associarRecursoAcao` renomeada para `associarRecurso`; +Logger, +SystemEvents, +_eventoParaStatus |
| *(não existia)* | `modules/programacao/mod_habilitacoes.gs` | 🆕 NOVO EM gas/src | 329 linhas — credenciamento de proponentes |
| *(não existia)* | `modules/programacao/mod_hab_diaria.gs` | 🆕 NOVO EM gas/src | 228 linhas — check-in operacional de espaços |

### 2.3 Backend (serviços e orquestração)

| Arquivo legacy | Arquivo gas/src | Estado | Delta |
|---------------|-----------------|--------|-------|
| `mod_admin.gs` | `backend/mod_admin.gs` | ✅ gas/src AVANÇADO | SystemEvents RESERVATION_APPROVED/REJECTED, Logger, getSistemaConfig |
| `mod_permissoes_v2.gs` | `backend/mod_permissoes_v2.gs` | ✅ gas/src AVANÇADO | SystemEvents ROLE_UPDATED/PERMISSION_GRANTED, Logger, null-safe perfs |
| `mod_relatorios.gs` | `backend/mod_relatorios.gs` | ✅ gas/src AVANÇADO | Logger (22 substituições), SystemEvents CONTRACT/INDICATOR |
| `mod_metrics.gs` | `backend/mod_metrics.gs` | ✅ gas/src AVANÇADO | Logger padronizado |
| `mod_modulos_registry.gs` | `backend/mod_modulos_registry.gs` | ✅ gas/src AVANÇADO | Campo `apenasSuperadmin`, novos módulos (acoes, habilitacoes, balcao, processos), `modulos_toggleSuperadmin` |
| `mod_preferencias.gs` | `backend/mod_preferencias.gs` | ✅ IDÊNTICO | — |
| `Codigo.gs` | `backend/router.gs` | ✅ gas/src AVANÇADO | Logger no router, getOrgConfig().titulo |
| *(não existia)* | `backend/router.gs` | 🆕 NOVO EM gas/src | Ponto de entrada HTTP organizado |

### 2.4 Frontend HTML — Layout

| Arquivo legacy | Arquivo gas/src | Estado | Delta |
|---------------|-----------------|--------|-------|
| `html/layout/header.html` | `html/layout/header.html` | ✅ Verificar | — |
| `html/layout/sidebar.html` | `html/layout/sidebar.html` | ✅ gas/src AVANÇADO | 108 linhas de diff — sidebar atualizada |
| `html/layout/login_html.html` | `html/layout/login_html.html` | ✅ Verificar | — |

### 2.5 Frontend HTML — Módulos

| Arquivo legacy | Arquivo gas/src | Estado |
|---------------|-----------------|--------|
| `html/modulos/GestaoContratos.html` | `html/modulos/mod_gestao_contratos.html` | ✅ RENOMEADO |
| `html/modulos/PainelSolicitacoes.html` | `html/modulos/mod_painel_solicitacoes.html` | ✅ RENOMEADO |
| `html/modulos/mod_rh.html` | `html/modulos/mod_rh.html` | ✅ gas/src AVANÇADO (757 linhas de diff — UI PCCS) |
| `html/modulos/mod_configuracoes.html` | `html/modulos/mod_configuracoes.html` | ✅ gas/src AVANÇADO (141 linhas) |
| `html/modulos/mod_agenda_geral.html` | `html/modulos/mod_agenda_geral.html` | ✅ gas/src AVANÇADO (75 linhas) |
| `html/modulos/mod_nova_reserva.html` | `html/modulos/mod_nova_reserva.html` | ✅ gas/src AVANÇADO (33 linhas) |
| `html/modulos/mod_gestao_modulos.html` | `html/modulos/mod_gestao_modulos.html` | ✅ gas/src AVANÇADO (53 linhas) |
| *(não existia)* | `html/modulos/mod_habilitacoes.html` | 🆕 NOVO |
| Demais módulos | Demais módulos | ✅ gas/src AVANÇADO ou igual |

### 2.6 Frontend HTML — Lógica

| Arquivo legacy | Arquivo gas/src | Estado | Delta |
|---------------|-----------------|--------|-------|
| `html/logic/services/server_bridge_js.html` | idem | ✅ gas/src AVANÇADO | +PCCS bridge, +habilitações bridge, +associarRecurso (nome corrigido), +toggleSuperadmin, +obterSistemaConfig |
| `html/logic/ui/navegacao_ui_js.html` | idem | ✅ gas/src AVANÇADO | 217 linhas de diff |
| `html/logic/mod_gestao_modulos_js.html` | idem | ✅ gas/src AVANÇADO | 455 linhas de diff |
| `html/logic/mod_ui_estado_js.html` | idem | ✅ gas/src AVANÇADO | 141 linhas de diff |
| `html/logic/mod_reservas_js.html` | idem | ✅ gas/src AVANÇADO | 194 linhas de diff |
| `html/logic/mod_admin_js.html` | idem | ✅ gas/src AVANÇADO | 50 linhas de diff |
| *(não existia)* | `html/logic/mod_habilitacoes_js.html` | 🆕 NOVO |
| *(não existia)* | `html/logic/mod_hab_diaria_js.html` | 🆕 NOVO |
| Demais lógicas | Demais lógicas | ✅ gas/src AVANÇADO ou igual |

---

## 3. Inconsistências Identificadas

### 3.1 Módulo 'acoes' ausente do VALID_MODULES em mod_permissoes_v2.gs

**Arquivo:** `gas/src/backend/mod_permissoes_v2.gs`

- `legacy/mod_permissoes_v2.gs`: `'acoes'` está em `VALID_MODULES` e nos perfis base (superadmin, admin, gestor, etc.)
- `gas/src/backend/mod_permissoes_v2.gs`: `'acoes'` **ausente** de `VALID_MODULES`

**Impacto:** O módulo `acoes` está registrado em `mod_modulos_registry.gs` mas sem controle de permissão per-user no motor v2. Qualquer usuário com o módulo ativo pode acessá-lo.

**Decisão pendente:** Intencional (acoes controlado por módulo registry) ou omissão?

**Ação recomendada:** Adicionar `acoes` de volta ao `VALID_MODULES` e perfis base, alinhando com o que o legacy tinha.

### 3.2 Função `associarRecursoAcao` renomeada para `associarRecurso`

**Status:** ✅ JÁ TRATADO

- `legacy/mod_acoes.gs`: `associarRecursoAcao()`
- `gas/src/action_engine.gs`: `associarRecurso()` (renomeada)
- `gas/src/server_bridge_js.html`: já chama `GAS._call('associarRecurso', ...)` — compatível

---

## 4. Gaps de Cobertura (não-bloqueantes)

| Item | Estado | Prioridade |
|------|--------|-----------|
| Suite de testes automatizada GAS | Parcial (`test_conflito_reserva.gs` existe) | Média |
| Integração Ações → formulário de reserva (selector `acaoId`) | Pendente na UI | Baixa |
| Contratos e Chaves vinculados via `associarRecurso` na UI | Pendente | Baixa |
| Deploy de gas/src como versão oficial | **PRÓXIMO PASSO CRÍTICO** | Alta |

---

## 5. Estado de Estabilidade por Domínio

| Domínio | Módulo gas/src | Estado | Observação |
|---------|----------------|--------|-----------|
| Reservas | `modules/reservas/mod_reservas.gs` | ✅ Estável | Motor de conflito corrigido, SystemEvents, Logger |
| Chaves | `modules/chaves/mod_chaves.gs` | ✅ Estável | SystemEvents KEY_PROTOCOL_* |
| Permissões | `backend/mod_permissoes_v2.gs` | ✅ Estável | ⚠️ 'acoes' ausente do VALID_MODULES |
| Módulos Registry | `backend/mod_modulos_registry.gs` | ✅ Estável | apenasSuperadmin, toggleSuperadmin |
| Admin | `backend/mod_admin.gs` | ✅ Estável | SystemEvents APPROVED/REJECTED |
| RH/PCCS | `modules/rh/mod_rh.gs` | ✅ Estável | PCCS completo (697 linhas) |
| Habilitações | `modules/programacao/mod_habilitacoes.gs` | ✅ Estável | Módulo novo completo |
| Relatorios | `backend/mod_relatorios.gs` | ✅ Estável | Logger, SystemEvents CONTRACT/INDICATOR |
| Comunicação | `modules/comunicacao/` | ✅ Estável | Logger |
| Escuta | `modules/escuta/mod_escuta.gs` | ✅ Estável | |
| Financeiro | `modules/financeiro/mod_financeiro.gs` | ✅ Estável | SystemEvents |
| RH / Pessoal / Equipes | Respectivos | ✅ Estável | |
| Almoxarifado | `modules/almoxarifado/mod_almoxarifado.gs` | ✅ Estável | |
| Action Engine | `action_engine/action_engine.gs` | ✅ Estável | Integração UI pendente |
| Config Operacional | `core/config.gs` | ✅ Estável | getSistemaConfig/salvarSistemaConfig |
| Auth | `core/auth_session.gs` | ✅ Estável | Bug crítico de nível corrigido |

---

## 6. Próximas Etapas (ordem obrigatória)

### Imediatas (antes do deploy)

1. **Corrigir módulo `acoes` em mod_permissoes_v2.gs** — adicionar ao VALID_MODULES e perfis base
2. **Validar Index.html de gas/src** — confirmar que todos os includes estão corretos (renomeações foram aplicadas)
3. **Testar suite de regressão** — `executarTodosTesteConflito()` no editor GAS

### Deploy

4. **Deploy de gas/src** como versão oficial no scriptId `1VQOR6FPbOmb-DKd64BAnpQkoTnxKyTX...`
5. **Validação pós-deploy** — testar todas as funcionalidades críticas

### Pós-deploy

6. **Arquivar legacy/** — mover para pasta `_archived/` ou branch separado
7. **Documentar** estado final no relatório de migração

---

## 7. Inventário Final de Arquivos gas/src

```
gas/src/
├── appsscript.json
├── Index.html                                    ✅ atualizado (includes renomeados + habilitacoes)
├── action_engine/
│   └── action_engine.gs                          ✅ substitui mod_acoes.gs + melhorias
├── backend/
│   ├── mod_admin.gs                              ✅ +SystemEvents +Logger
│   ├── mod_metrics.gs                            ✅ +Logger
│   ├── mod_modulos_registry.gs                   ✅ +apenasSuperadmin +novos módulos +toggleSuperadmin
│   ├── mod_permissoes_v2.gs                      ⚠️ 'acoes' ausente do VALID_MODULES
│   ├── mod_preferencias.gs                       ✅ idêntico
│   ├── mod_relatorios.gs                         ✅ +Logger +SystemEvents
│   └── router.gs                                 ✅ substitui Codigo.gs
├── core/
│   ├── auth_session.gs                           ✅ bug fix try/catch separados
│   ├── config.gs                                 ✅ +getSistemaConfig/salvarSistemaConfig
│   ├── data_layer.gs                             ✅ idêntico
│   ├── event_bus_backend.gs                      🆕 NOVO
│   ├── events_constants.gs                       🆕 NOVO (37 tipos de evento)
│   ├── logger.gs                                 🆕 NOVO
│   ├── setup.gs                                  ✅ +ACOES spreadsheet +Habilitacoes +HabDiaria
│   └── utils.gs                                  ✅ +normalizarHora(Number) +ABA_PARA_MODULO expandido
├── modules/
│   ├── almoxarifado/mod_almoxarifado.gs          ✅ idêntico
│   ├── chaves/mod_chaves.gs                      ✅ +SystemEvents KEY_PROTOCOL_* +Logger
│   ├── comunicacao/
│   │   ├── mod_comunicacao.gs                    ✅ +Logger
│   │   └── mod_comunicacao_processos.gs          ✅ +Logger
│   ├── equipes/mod_equipes.gs                    ✅ idêntico
│   ├── escuta/mod_escuta.gs                      ✅ diferenças menores
│   ├── financeiro/mod_financeiro.gs              ✅ +SystemEvents
│   ├── pessoal/mod_pessoal.gs                    ✅ idêntico
│   ├── programacao/
│   │   ├── mod_hab_diaria.gs                     🆕 NOVO (228 linhas)
│   │   └── mod_habilitacoes.gs                   🆕 NOVO (329 linhas)
│   ├── reservas/
│   │   ├── mod_reservas.gs                       ✅ motor conflito corrigido +SystemEvents +Logger
│   │   └── test_conflito_reserva.gs              🆕 NOVO (suite de testes)
│   └── rh/mod_rh.gs                              ✅ +PCCS (321→697 linhas)
└── html/                                         ✅ frontend atualizado (ver seções 2.4-2.6)
```

---

*Auditoria executada em 2026-05-11. Fase 1 concluída.*
