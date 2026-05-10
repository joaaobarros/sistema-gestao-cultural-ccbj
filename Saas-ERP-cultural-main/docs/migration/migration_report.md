# Relatório Técnico de Migração — Sistema CCBJ

**Data:** 2026-05-10  
**Branch:** refactor-fase2  
**Autor:** Arquitetura / JP Barros  
**Status:** Fase 1 concluída (migração estrutural + instrumentação)

---

## 1. Contexto

O sistema CCBJ operava com uma base legada em estrutura flat na raiz do repositório. A reestruturação criou a nova arquitetura em `Saas-ERP-cultural-main/gas/src/`, organizada em camadas:

```
gas/src/
├── core/               ← infraestrutura (config, utils, auth, data_layer, setup)
│   ├── events_constants.gs  ← NOVO: constantes SystemEventTypes.*
│   ├── event_bus_backend.gs ← NOVO: SystemEvents.emit() / getRecentes()
│   └── logger.gs            ← NOVO: Logger.info/warn/error
├── action_engine/      ← NOVO: engine de ações com máquina de estados
├── modules/            ← domínios operacionais isolados
├── backend/            ← serviços, roteamento, orquestração
└── html/               ← frontend (includes inalterados)
```

**Princípio da migração:** zero regressão, coexistência, compatibilidade total.

---

## 2. Arquivos Migrados (estrutura)

### 2.1 Core (idênticos ao legado + enriquecidos)

| Arquivo | Origem | Destino | Estado |
|---------|--------|---------|--------|
| utils.js | raiz | `core/utils.gs` | ✅ + Acoes/EventLog no ABA_PARA_MODULO |
| Setup.js | raiz | `core/setup.gs` | ✅ + ACOES spreadsheet, PROP.ACOES, COR_MODULO.ACOES |
| DataLayer.gs | raiz | `core/data_layer.gs` | ✅ idêntico |
| config.gs | raiz | `core/config.gs` | ✅ idêntico |
| auth_session.gs | raiz | `core/auth_session.gs` | ✅ idêntico |

### 2.2 Novos — infraestrutura (não existiam no legado)

| Arquivo | Camada | Responsabilidade |
|---------|--------|-----------------|
| `core/events_constants.gs` | core | Constantes `SystemEventTypes.*` (37 tipos de evento) |
| `core/event_bus_backend.gs` | core | `SystemEvents.emit()`, `getRecentes()`, `getEventosPorEntidade()` |
| `core/logger.gs` | core | `Logger.info/warn/error` — interface uniforme |
| `action_engine/action_engine.gs` | action_engine | Entidade Ação, CRUD, máquina de 7 estados, `associarRecurso()` |
| `backend/router.gs` | backend | Ponto de entrada HTTP (`doGet/doPost`, `include`) |

### 2.3 Módulos (movidos para domínio correto)

| Módulo | Origem | Destino | Diff legado |
|--------|--------|---------|-------------|
| mod_reservas.gs | raiz | `modules/reservas/` | +SystemEvents RESERVATION_CREATED/CANCELLED |
| mod_chaves.gs | raiz | `modules/chaves/` | ✅ idêntico → **+SystemEvents nesta fase** |
| mod_comunicacao.gs | raiz | `modules/comunicacao/` | ✅ idêntico |
| mod_comunicacao_processos.gs | raiz | `modules/comunicacao/` | ✅ idêntico |
| mod_almoxarifado.gs | raiz | `modules/almoxarifado/` | ✅ idêntico |
| mod_equipes.gs | raiz | `modules/equipes/` | ✅ idêntico |
| mod_escuta.gs | raiz | `modules/escuta/` | ✅ idêntico |
| mod_financeiro.gs | raiz | `modules/financeiro/` | ✅ idêntico |
| mod_pessoal.gs | raiz | `modules/pessoal/` | ✅ idêntico |
| mod_rh.gs | raiz | `modules/rh/` | ✅ idêntico |

### 2.4 Backend (movidos para camada correta)

| Arquivo | Origem | Destino | Diff legado |
|---------|--------|---------|-------------|
| mod_admin.gs | raiz | `backend/` | +SystemEvents RESERVATION_APPROVED/REJECTED |
| mod_permissoes_v2.gs | raiz | `backend/` | ✅ idêntico → **+SystemEvents nesta fase** |
| mod_relatorios.gs | raiz | `backend/` | ✅ idêntico |
| mod_metrics.gs | raiz | `backend/` | ✅ idêntico |
| mod_modulos_registry.gs | raiz | `backend/` | ✅ idêntico → **+SystemEvents nesta fase** |
| mod_preferencias.gs | raiz | `backend/` | ✅ idêntico |

---

## 3. Integrações Realizadas Nesta Fase

### 3.1 SystemEvents — novos eventos integrados

| Módulo | Evento | Gatilho |
|--------|--------|---------|
| `modules/chaves/mod_chaves.gs` | `KEY_PROTOCOL_CREATED` | `chaves_solicitarChave` (origem: SOLICITACAO) |
| `modules/chaves/mod_chaves.gs` | `KEY_PROTOCOL_CREATED` | `chaves_iniciarEntregaDireta` (origem: ENTREGA_DIRETA) |
| `modules/chaves/mod_chaves.gs` | `KEY_PROTOCOL_RETRIEVED` | `chaves_confirmarRecebimento` |
| `modules/chaves/mod_chaves.gs` | `KEY_PROTOCOL_RETURNED` | `chaves_confirmarDevolucao` |
| `modules/chaves/mod_chaves.gs` | `KEY_PROTOCOL_TRANSFERRED` | `chaves_confirmarTransferencia` |
| `modules/chaves/mod_chaves.gs` | `KEY_PROTOCOL_DELAYED` | `chaves_verificarAtrasos` (trigger diário) |
| `backend/mod_modulos_registry.gs` | `MODULE_ACTIVATED` | `modulos_alterarStatus(id, true)` |
| `backend/mod_modulos_registry.gs` | `MODULE_DEACTIVATED` | `modulos_alterarStatus(id, false)` |
| `backend/mod_permissoes_v2.gs` | `ROLE_UPDATED` | `salvarPermissoesUsuarioV2` (quando perfil_base muda) |
| `backend/mod_permissoes_v2.gs` | `PERMISSION_GRANTED` | `salvarPermissoesUsuarioV2` (quando apenas permissões manuais mudam) |

**Eventos já existentes (fases anteriores):**
- `RESERVATION_CREATED`, `RESERVATION_CANCELLED` — em `modules/reservas/mod_reservas.gs`
- `RESERVATION_APPROVED`, `RESERVATION_REJECTED` — em `backend/mod_admin.gs`

### 3.2 Logger — padronização

Substituídas todas as chamadas `console.error/warn/log` nos módulos e backend por `Logger.error/warn/info`, exceto:

- `core/setup.gs` — scripts CLI de setup do operador, rodam antes da planilha existir
- `core/data_layer.gs` — infraestrutura, pode rodar durante bootstrap
- `core/utils.gs` — contém o próprio `registrarLog`; Logger → registrarLog → _getSheet → utils seria circular
- `core/event_bus_backend.gs` — fallback de logging do EventBus (não pode depender de Logger)
- `core/logger.gs` — é o próprio Logger

**Arquivos onde console.* foi padronizado para Logger:**

| Arquivo | Chamadas substituídas |
|---------|----------------------|
| `modules/chaves/mod_chaves.gs` | 3 |
| `modules/comunicacao/mod_comunicacao.gs` | 2 |
| `modules/comunicacao/mod_comunicacao_processos.gs` | 1 |
| `modules/reservas/mod_reservas.gs` | 5 |
| `backend/mod_relatorios.gs` | 22 |
| `backend/mod_admin.gs` | 5 |
| `backend/mod_metrics.gs` | 3 |
| `backend/mod_modulos_registry.gs` | 2 |
| `backend/mod_permissoes_v2.gs` | 1 |
| `backend/router.gs` | 1 |

---

## 4. Duplicações Eliminadas

Todas as duplicações conhecidas já foram eliminadas em fases anteriores (branch refactor-fase2):

| Duplicação | Resolução |
|------------|-----------|
| `mod_permissoes.gs` (v1) vs `mod_permissoes_v2.gs` | v1 removido — v2 já redefinida como fonte única |
| `_getSheet` duplicado em utils.js | Segunda definição buggy removida |
| Include duplicado de `mod_permissoes_v2_js` no Index.html | Removido |
| Funções stub em `mod_estrategia.gs` | Arquivo removido |
| `Logic.html` (monolítico) vs `html/logic/*.html` | Monolítico não carregado; lógica real nos includes |

---

## 5. Pontos de Compatibilidade Mantidos

| Contrato | Status | Estratégia |
|----------|--------|-----------|
| Assinaturas de funções públicas | ✅ Preservadas | Nenhuma assinatura alterada nesta fase |
| `google.script.run.*` (bridge) | ✅ Preservadas | server_bridge_js.html inalterado |
| Includes HTML (`<?= include(...)?>`) | ✅ Preservados | frontend html/ inalterado |
| `ABA_PARA_MODULO` em utils | ✅ Compatível | Apenas adições (Acoes, EventLog) |
| `PROP` e `MODULOS` em setup | ✅ Compatível | Apenas adições (ACOES) |

---

## 6. Pontos de Risco Identificados

| Risco | Nível | Mitigação |
|-------|-------|-----------|
| `Logger` chama `registrarLog` → `_getSheet` — se planilha offline, silencioso | Baixo | Logger tem try/catch → fallback para console.warn |
| `SystemEvents.emit` falha silenciosamente se `EventLog` não existe | Baixo | emit() tem try/catch → não interrompe operação |
| `mod_relatorios.gs`: `console.log` de debug em `obterMemoriaRubrica` removidos | Baixo | Eram traces de desenvolvimento; dados preservados |
| `Action Engine` não integrado em módulos de negócio ainda | Médio | Pendente para fase 2 da migração |

---

## 7. Funções Obsoletas / Código Morto

Identificados em fases anteriores e já removidos do sistema legado:

- `mod_estrategia.gs` (stubs only) — removido
- `mod_permissoes.gs` v1 — removido
- `html/logic/mod_permissoes_js.html` v1 frontend — removido
- `BASE_URL_FALLBACK` hardcoded em Codigo.gs — removido
- Stubs `chat_enviarMensagem`, `obterMetricasCODIP`, `sessaoInicial` — removidos
- Bloco comentado `processarMensagemIA` (462 linhas) — removido

---

## 8. Módulos Estabilizados

| Módulo | Estado | Observação |
|--------|--------|-----------|
| Reservas | ✅ Estável | SystemEvents integrado; validações completas |
| Chaves | ✅ Estável | SystemEvents KEY_PROTOCOL_* integrado |
| Permissões v2 | ✅ Estável | SystemEvents ROLE_UPDATED/PERMISSION_GRANTED |
| Módulos Registry | ✅ Estável | SystemEvents MODULE_ACTIVATED/DEACTIVATED |
| Relatórios | ✅ Estável | Logger padronizado; debug traces removidos |
| Comunicação | ✅ Estável | Logger padronizado |
| Admin | ✅ Estável | Logger + SystemEvents APPROVED/REJECTED |
| Escuta | ✅ Estável | Sem eventos de sistema pendentes (domínio interno) |
| Financeiro | ✅ Estável | Eventos PAYMENT_REGISTERED pendentes (fase 2) |
| RH / Pessoal / Equipes | ✅ Estável | Domínios simples; sem eventos de sistema críticos |
| Almoxarifado | ✅ Estável | Domínio simples |
| Action Engine | 🟡 Criado | Integração com módulos pendente (fase 2) |

---

## 9. Próximas Etapas (Fase 2)

1. **Integrar Action Engine** nos módulos de negócio (reservas, contratos, tarefas)
2. **Eventos pendentes**: `PAYMENT_REGISTERED` em financeiro, `REPORT_CREATED/APPROVED` em relatorios
3. **Data Layer centralizado**: eliminar acessos diretos a `SpreadsheetApp` dentro de regras de negócio
4. **Regressão automatizada**: criar suite de testes GAS para operações críticas
5. **Deploy**: publicar nova arquitetura (`gas/src/`) como substituta definitiva

---

## 10. Inventário Final de Arquivos

```
gas/src/
├── appsscript.json
├── Index.html
├── action_engine/
│   └── action_engine.gs          ← NOVO
├── backend/
│   ├── mod_admin.gs               ← +SystemEvents +Logger
│   ├── mod_metrics.gs             ← +Logger
│   ├── mod_modulos_registry.gs    ← +SystemEvents +Logger
│   ├── mod_permissoes_v2.gs       ← +SystemEvents +Logger
│   ├── mod_preferencias.gs
│   ├── mod_relatorios.gs          ← +Logger (22 substituições)
│   └── router.gs                  ← equivalente ao Codigo.gs legado
├── core/
│   ├── auth_session.gs
│   ├── config.gs
│   ├── data_layer.gs
│   ├── event_bus_backend.gs       ← NOVO
│   ├── events_constants.gs        ← NOVO
│   ├── logger.gs                  ← NOVO
│   ├── setup.gs                   ← +ACOES
│   └── utils.gs                   ← +Acoes/EventLog
├── modules/
│   ├── almoxarifado/mod_almoxarifado.gs
│   ├── chaves/mod_chaves.gs       ← +SystemEvents KEY_PROTOCOL_* +Logger
│   ├── comunicacao/
│   │   ├── mod_comunicacao.gs     ← +Logger
│   │   └── mod_comunicacao_processos.gs ← +Logger
│   ├── equipes/mod_equipes.gs
│   ├── escuta/mod_escuta.gs
│   ├── financeiro/mod_financeiro.gs
│   ├── pessoal/mod_pessoal.gs
│   ├── reservas/mod_reservas.gs   ← +SystemEvents RESERVATION_* +Logger
│   └── rh/mod_rh.gs
└── html/                          ← frontend inalterado
```

---

*Relatório gerado automaticamente durante a fase de migração controlada.*
