# 🔎 Index Técnico

## Por Arquivo

### Backend (.gs)
| Arquivo | Módulo | Criticidade | Doc |
|---------|--------|-------------|-----|
| Codigo.gs | Boot, salas, IDs, permissões básicas | 🔴 ALTO | [→](analise_arquivos/Codigo_gs.md) |
| Setup.js | Schema canônico das 7 planilhas | 🔴 ALTO | [→](analise_arquivos/Setup_js.md) |
| utils.js | `_getSheet`, validação, cache, rate-limit | 🔴 ALTO | [→](analise_arquivos/utils_js.md) |
| DataLayer.gs | Persistência Drive JSON | 🟠 MÉDIO | [→](analise_arquivos/DataLayer_gs.md) |
| mod_admin.gs | Admin, log, permissões, `obterDadosIniciais` | 🔴 ALTO | [→](analise_arquivos/mod_admin_gs.md) |
| mod_reservas.gs | Domínio de reservas, CODIP (noop), RECE Service | 🔴 ALTO | [→](analise_arquivos/mod_reservas_gs.md) |
| mod_comunicacao.gs | Agenda RECE, Calendar, Drive upload | 🟠 MÉDIO | [→](analise_arquivos/mod_comunicacao_gs.md) |
| mod_comunicacao_processos.gs | Processos, entregas, revisões, roteamento | 🟠 MÉDIO | [→](analise_arquivos/mod_comunicacao_processos_gs.md) |
| mod_metrics.gs | Dashboard KPIs, IA Bêjotinha (Groq) | 🟠 MÉDIO | [→](analise_arquivos/mod_metrics_gs.md) |
| mod_equipes.gs | Funcionários, escalas, substituições | 🟠 MÉDIO | [→](analise_arquivos/mod_equipes_gs.md) |
| mod_pessoal.gs | Tarefas, balcão, processos pessoal | 🟠 MÉDIO | [→](analise_arquivos/mod_pessoal_gs.md) |
| mod_financeiro.gs | Contratos PJ/Drive, cálculo RH/CLT, simulações | 🟠 MÉDIO | [→](analise_arquivos/mod_financeiro_gs.md) |
| mod_relatorios.gs | Contratos, metas, rubricas, CODIP real, versionamento | 🟠 MÉDIO | [→](analise_arquivos/mod_relatorios_gs.md) |
| mod_rh.gs | Folha CLT, ponto, histórico, diversidade | 🟡 BAIXO | [→](analise_arquivos/mod_rh_gs.md) |
| mod_permissoes.gs | Permissões v1 (legado), perfis, Drive JSON | 🟠 MÉDIO | [→](analise_arquivos/mod_permissoes_gs.md) |
| mod_permissoes_v2.gs | Permissões v2, 4 camadas, 8 perfis, 17 módulos | 🔴 ALTO | [→](analise_arquivos/mod_permissoes_v2_gs.md) |
| mod_almoxarifado.gs | Almoxarifado Drive JSON | 🟡 BAIXO | [→](analise_arquivos/mod_almoxarifado_gs.md) |
| mod_preferencias.gs | Preferências usuário por aba | 🟡 BAIXO | [→](analise_arquivos/mod_preferencias_gs.md) |
| mod_estrategia.gs | Stub (EM_BREVE) | 🟡 BAIXO | [→](analise_arquivos/mod_estrategia_gs.md) |
| mod_escuta.gs | Escuta institucional, NR-1, clima, alertas | 🟠 MÉDIO | [→](analise_arquivos/mod_escuta_gs.md) |

### Frontend — Lógica (html/logic/)
| Arquivo | Módulo | Criticidade | Doc |
|---------|--------|-------------|-----|
| server_bridge_js.html | Bridge `google.script.run` | 🔴 ALTO | [→](analise_arquivos/server_bridge_js.md) |
| bootstrap_js.html | Boot, eventos, orquestração | 🔴 ALTO | [→](analise_arquivos/bootstrap_js.md) |
| core/app_state_js.html | Estado global, EventBus | 🔴 ALTO | [→](analise_arquivos/app_state_js.md) |
| modules/disponibilidade_module_js.html | Lógica de disponibilidade | 🔴 ALTO | [→](analise_arquivos/disponibilidade_module_js.md) |
| modules/itens_module_js.html | Lookup de itens e salas | 🟠 MÉDIO | [→](analise_arquivos/itens_module_js.md) |
| mod_reservas_js.html | Controle de fluxo de reservas | 🔴 ALTO | [→](analise_arquivos/mod_reservas_js.md) |
| mod_ui_componentes_js.html | Utilitários globais de interface | 🔴 ALTO | [→](analise_arquivos/mod_ui_componentes_js.md) |
| mod_ui_estado_js.html | Núcleo operacional (reservas + init + IA) | 🔴 ALTO | [→](analise_arquivos/mod_ui_estado_js.md) |
| mod_permissoes_js.html | Controle de acesso frontend | 🔴 ALTO | [→](analise_arquivos/mod_permissoes_js.md) |
| integracao_reserva_comunicacao_js.html | Integração reservas→comunicação | 🔴 ALTO | [→](analise_arquivos/integracao_reserva_comunicacao_js.md) |
| mod_admin_js.html | Lógica frontend do painel admin | — | (pendente) |
| mod_contratos_js.html | Lógica frontend de contratos | — | (pendente) |
| mod_favoritos_js.html | Lógica frontend de favoritos | — | (pendente) |
| mod_permissoes_v2_js.html | Lógica frontend permissões v2 | — | (pendente) |
| ui/navegacao_ui_js.html | Navegação e rotas UI | — | (pendente) |
| ui/permissoes_ui_js.html | UI de permissões | — | (pendente) |

---

## Por Módulo
(em construção)

---

## Por Criticidade

### 🔴 CRÍTICO / ALTO
- `Codigo.gs` — único entry point GAS, falha derruba tudo
- `utils.js` — `_getSheet` é a única porta de entrada para planilhas
- `Setup.js` — schema canônico; drift com `ABA_PARA_MODULO` em utils.js
- `mod_admin.gs` — `obterDadosIniciais` é o boot do sistema (1448 linhas)
- `mod_reservas.gs` — domínio central; `criarReservaController` não verifica conflito
- `mod_permissoes_v2.gs` — toda verificação de acesso passa por aqui
- `server_bridge_js.html` — todas as chamadas GAS passam aqui
- `mod_ui_estado_js.html` — orquestra estado central da UI

### 🟠 MÉDIO
- `mod_comunicacao.gs`, `mod_comunicacao_processos.gs` — fluxo RECE/processos
- `mod_metrics.gs` — dashboard + IA; email dev hardcoded
- `mod_equipes.gs` — `obterMetricasEficiencia` quebrada silenciosamente
- `mod_financeiro.gs` — colunas Meta/Programa não existem no schema
- `mod_relatorios.gs` — função duplicada, CODIP com índices errados
- `mod_escuta.gs` — cálculo pesado síncrono por resposta; ops sem permissão

### 🟡 BAIXO / ISOL
- `mod_rh.gs`, `mod_almoxarifado.gs`, `mod_preferencias.gs`, `mod_estrategia.gs`

---

## Tags
`#backend` `#frontend` `#reservas` `#rh` `#financeiro` `#permissoes` `#ia` `#escuta` `#codip` `#drive-json` `#schema-drift`

## Backend GAS

- Codigo.gs → entrypoint, gerarId, doGet (🟠 médio)
- Setup.js → schema canônico MODULOS — divergido de utils.js (🔴 crítico)
- DataLayer.gs → persistência Drive JSON — ScriptLock em leituras (🔴 crítico)
- utils.js → _getSheet, validações, obterLockComRetry (🟠 médio)
- mod_admin.gs → boot obterDadosIniciais, log, rate-limiting (🔴 crítico)
- mod_reservas.gs → domínio central; criarReservaController sem verificarConflito (🔴 crítico)
- mod_almoxarifado.gs → almoxarifado Drive JSON; paralelo à aba Itens (🟡 baixo)
- mod_estrategia.gs → 3 stubs EM_BREVE (🟡 baixo)
- mod_preferencias.gs → PreferenciasUsuarios; duplicado em mod_admin.gs (🟡 baixo)
- mod_pessoal.gs → tarefas/balcão; dois sistemas paralelos (🟠 médio)
- mod_equipes.gs → obterMetricasEficiencia quebrada; dois repos de funcionários (🟠 médio)
- mod_comunicacao.gs → Agenda RECE, Calendar, Drive upload; URLs hardcoded (🟠 médio)
- mod_comunicacao_processos.gs → processos/entregas/revisão; exclusão sem permissão (🟠 médio)
- mod_financeiro.gs → RH+contratações; colunas Meta/Programa não no schema (🟠 médio)
- mod_metrics.gs → dashboard KPIs + Bêjotinha IA; email dev hardcoded (🟠 médio)
- mod_permissoes.gs → v1 legado; sem lock em escrita (🟠 médio)
- mod_rh.gs → folha CLT, ponto, diversidade; tabelas fiscais hardcoded (🟡 baixo)
- mod_relatorios.gs → contratos/metas/rubricas/CODIP; compararVersoesContrato duplicada (🟠 médio)
- mod_permissoes_v2.gs → sistema híbrido 4 camadas; auditoria sem lock (🔴 alto)
- mod_escuta.gs → escuta institucional NR-1; cálculo pesado síncrono por resposta (🟠 médio)

