# FASE 2 — Matriz de Responsabilidades
# Arquitetura gas/src — Mapeamento de Camadas

**Data:** 2026-05-11  
**Branch:** refactor-fase2  
**Status:** FASE 2 CONCLUÍDA — arquitetura gas/src já implementa a matriz

---

## Princípio

Cada arquivo tem uma responsabilidade única e declarada.  
Cada camada tem um propósito exclusivo.  
Nenhuma camada acessa a responsabilidade de outra diretamente.

---

## CAMADA: core/

Infraestrutura compartilhada. Não contém lógica de negócio.

| Arquivo | Responsabilidade única | Dependências externas |
|---------|------------------------|----------------------|
| `core/config.gs` | Configuração institucional (org) e operacional (turnos, horários) via PropertiesService | PropertiesService |
| `core/utils.gs` | Funções utilitárias puras: formatação, normalização, validação, acesso a abas (`_getSheet`) | `core/setup.gs` (_abrirModulo) |
| `core/setup.gs` | Estrutura de planilhas, constantes do sistema (MODULOS, PROP, COR_MODULO), setup inicial | SpreadsheetApp, PropertiesService |
| `core/data_layer.gs` | Persistência em arquivos JSON no Drive (DataLayer) | DriveApp |
| `core/auth_session.gs` | Autenticação por token de sessão, hashing, credenciais, resolução de nível de acesso | CacheService, `core/utils.gs` |
| `core/logger.gs` | Interface uniforme de logging: Logger.info/warn/error → registrarLog → planilha | `core/utils.gs` (registrarLog) |
| `core/event_bus_backend.gs` | Emissão e consulta de eventos de sistema (SystemEvents.emit, getRecentes) | `core/utils.gs` (_getSheet) |
| `core/events_constants.gs` | Constantes de tipos de evento (SystemEventTypes.*) — 37 tipos declarados | Nenhuma |

**Regra da camada core:**
- Nunca importar de `modules/` ou `backend/`
- Nunca conter lógica de domínio (reservas, chaves, RH, etc.)
- Ser usável por qualquer outra camada sem dependência circular

---

## CAMADA: modules/

Domínios de negócio. Cada módulo é independente do outro.

| Módulo | Arquivo | Responsabilidade única | Interage com |
|--------|---------|------------------------|--------------|
| **reservas** | `modules/reservas/mod_reservas.gs` | CRUD de reservas, motor de conflito de horário, disponibilidade de itens, processamento em lote | core/ |
| **chaves** | `modules/chaves/mod_chaves.gs` | Fluxo completo de retirada/devolução/transferência de chaves, auditoria, atrasos | core/ |
| **rh** | `modules/rh/mod_rh.gs` | Gestão de colaboradores, avaliações, PCCS (tabela salarial, parâmetros, reajuste) | core/ |
| **escuta** | `modules/escuta/mod_escuta.gs` | Pesquisas pulse, escuta espontânea, indicadores, alertas NR-1, ciclo de vida | core/ |
| **financeiro** | `modules/financeiro/mod_financeiro.gs` | Contratos financeiros, pagamentos, rubricas, categorias | core/ |
| **comunicacao** | `modules/comunicacao/mod_comunicacao.gs` | Solicitações de comunicação, balcão | core/ |
| **comunicacao** | `modules/comunicacao/mod_comunicacao_processos.gs` | Processos de comunicação institucional | core/ |
| **equipes** | `modules/equipes/mod_equipes.gs` | Gestão de equipes, cargos, vínculos | core/ |
| **pessoal** | `modules/pessoal/mod_pessoal.gs` | Dados pessoais, tarefas, interações | core/ |
| **almoxarifado** | `modules/almoxarifado/mod_almoxarifado.gs` | Controle de estoque, movimentações | core/ |
| **programacao** | `modules/programacao/mod_habilitacoes.gs` | Credenciamento de proponentes (habilitações) | core/ |
| **programacao** | `modules/programacao/mod_hab_diaria.gs` | Check-in operacional diário de espaços | core/ |

**Regra da camada modules:**
- Nunca importar de outros módulos diretamente (comunicação via events ou backend)
- Nunca conter roteamento HTTP ou lógica de permissão global
- Nunca acessar SpreadsheetApp diretamente — usar `_getSheet()` de core/utils

---

## CAMADA: backend/

Serviços orquestradores, permissões, roteamento. Chama módulos, nunca é chamado por módulos.

| Arquivo | Responsabilidade única | Chama |
|---------|------------------------|-------|
| `backend/router.gs` | Ponto de entrada HTTP (doGet/doPost), include() para HTML, notificações de cancelamento | `backend/mod_admin.gs`, `core/config.gs` |
| `backend/mod_admin.gs` | Gateway de operações administrativas: aprovar/recusar reservas, dados iniciais, mapa de salas, usuários, cadastros externos | `modules/reservas/`, `core/auth_session.gs` |
| `backend/mod_permissoes_v2.gs` | Motor de permissões: 4 camadas (perfil_base, automáticas, manuais, finais), 8 perfis, auditoria | `core/data_layer.gs`, `core/event_bus_backend.gs` |
| `backend/mod_modulos_registry.gs` | Registro e ativação de módulos: CRUD JSON, `apenasSuperadmin`, `toggleSuperadmin` | `core/data_layer.gs`, `core/event_bus_backend.gs` |
| `backend/mod_relatorios.gs` | Relatórios financeiros, CODIP, contratos, metas, indicadores, download | `core/utils.gs` |
| `backend/mod_metrics.gs` | Métricas de uso, dashboard, indicadores operacionais | `core/utils.gs` |
| `backend/mod_preferencias.gs` | Preferências de usuário (JSON no Drive) | `core/data_layer.gs` |

**Regra da camada backend:**
- Nunca conter lógica de domínio puro (delegar a modules/)
- Ser o único ponto de entrada para o frontend via google.script.run
- Toda função pública chamável pelo frontend deve existir aqui ou em um módulo

---

## CAMADA: action_engine/

Motor de ações transversais — entidade central de programação.

| Arquivo | Responsabilidade única | Integra com |
|---------|------------------------|-------------|
| `action_engine/action_engine.gs` | Entidade Ação (CRUD), máquina de estados (7 estados), associação de recursos (reservas, contratos, chaves) | core/, SystemEvents |

**Regra da camada action_engine:**
- Não tem lógica de UI
- Não tem roteamento
- Expõe funções públicas: `criarAcao`, `listarAcoes`, `atualizarAcao`, `mudarStatusAcao`, `associarRecurso`, `obterRecursosDaAcao`
- Comunica-se com módulos via IDs de recursos (sem importar os módulos)

---

## CAMADA: html/

Frontend — separado por tipo de artefato.

```
html/
├── layout/           — estrutura estática da página (header, sidebar, login)
├── modais/           — painéis modais reutilizáveis (config, manual)
├── modulos/          — painéis HTML de cada módulo (conteúdo das abas)
└── logic/
    ├── core/         — infraestrutura JS frontend (EventBus, AppState, AuthIdentity)
    ├── services/     — bridge frontend↔backend (server_bridge_js.html)
    ├── ui/           — lógica de UI transversal (navegacao, permissoes)
    ├── modules/      — lógica de módulos específicos (disponibilidade, itens)
    └── *.html        — lógica JS de cada módulo
```

**Regra da camada html:**
- Nunca chamar SpreadsheetApp ou APIs GAS diretamente
- Todo acesso ao backend via `google.script.run` através de `server_bridge_js.html` (namespace GAS)
- Estado global via `AppState` (app_state_js.html)
- Eventos frontend via `EventBus` (event_bus_js.html)
- PROIBIDO: `console.log` — usar `Logger` quando disponível, ou nenhum log

---

## Mapa de Dependências (direção obrigatória)

```
html/ → server_bridge_js (GAS.*) → backend/ → modules/ → core/
                                 → action_engine/ → core/
                                 → core/ (direto)
```

**Dependência proibida:**
- `modules/` → `backend/` (circular)
- `core/` → `modules/` (circular)
- `html/` → GAS APIs diretamente (sem bridge)
- `modules/X/` → `modules/Y/` (acoplamento entre domínios)

---

## Convenções Obrigatórias

### Nomenclatura

| Tipo | Padrão | Exemplo |
|------|--------|---------|
| Módulo backend | `mod_<dominio>.gs` | `mod_reservas.gs` |
| Arquivo core | `<funcao>.gs` | `utils.gs`, `logger.gs` |
| HTML de módulo | `mod_<dominio>.html` | `mod_rh.html` |
| HTML de lógica | `mod_<dominio>_js.html` | `mod_reservas_js.html` |
| Engine especial | `<nome>_engine.gs` | `action_engine.gs` |

### Logging

```javascript
// CORRETO
Logger.info('reservas', 'Reserva criada', id);
Logger.warn('chaves', 'Atraso detectado', acaoId);
Logger.error('admin', 'Erro ao aprovar', e.message);

// PROIBIDO (exceto em core/ com dependência circular documentada)
console.log(...)
console.error(...)
```

### Eventos de Sistema

```javascript
// CORRETO — emitir após toda operação relevante
SystemEvents.emit(SystemEventTypes.RESERVATION_CREATED, {
  entidade: 'reserva', entidadeId: id,
  usuario: email, origem: 'mod_reservas',
  contexto: { sala, data }
});

// PROIBIDO — operação crítica sem rastro de evento
```

### Acesso a Dados

```javascript
// CORRETO — via _getSheet()
const sheet = _getSheet('Reservas');

// PROIBIDO — acesso direto em módulos de negócio
const ss = SpreadsheetApp.openById(...);
const sheet = ss.getSheetByName('Reservas');
```

---

## Tabela de Responsabilidades por Domínio

| Domínio | core | modules | backend | action_engine | html |
|---------|------|---------|---------|---------------|------|
| Configuração org/sistema | config.gs | — | mod_admin.gs (controller) | — | mod_configuracoes.html |
| Autenticação | auth_session.gs | — | mod_admin.gs (obterEmailUsuario) | — | auth_login_js.html |
| Permissões | — | — | mod_permissoes_v2.gs | — | mod_permissoes_v2_js.html |
| Módulos ativos | — | — | mod_modulos_registry.gs | — | mod_gestao_modulos_js.html |
| Reservas / Conflito | utils.gs (normalizarHora, locks) | mod_reservas.gs | mod_admin.gs (aprovar) | associarRecurso | mod_reservas_js.html |
| Chaves | utils.gs (locks) | mod_chaves.gs | — | associarRecurso | mod_protocolo_chaves_js.html |
| RH / PCCS | — | mod_rh.gs | — | — | mod_rh.html |
| Habilitações | — | mod_habilitacoes.gs, mod_hab_diaria.gs | — | — | mod_habilitacoes.html, mod_hab_diaria_js.html |
| Financeiro | — | mod_financeiro.gs | mod_relatorios.gs | — | mod_financeiro.html |
| Comunicação | — | mod_comunicacao.gs, mod_comunicacao_processos.gs | — | — | — |
| Escuta | — | mod_escuta.gs | — | — | mod_escuta.html |
| Métricas | — | — | mod_metrics.gs | — | mod_dashboard.html |
| Ações | — | — | — | action_engine.gs | mod_acoes.html, mod_acoes_js.html |
| Setup / Inicialização | setup.gs | — | — | — | — |
| Persistência JSON | data_layer.gs | — | — | — | — |
| Logging | logger.gs | — | — | — | — |
| Eventos de sistema | event_bus_backend.gs, events_constants.gs | — | — | — | event_bus_js.html |

---

*Matriz gerada em 2026-05-11. Fase 2 concluída.*
