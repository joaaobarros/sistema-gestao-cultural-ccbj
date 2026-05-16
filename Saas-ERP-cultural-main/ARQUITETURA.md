# ARQUITETURA — Sistema de Gestão Cultural CCBJ

> Documento de referência técnica. Atualizado em 2026-05.

---

## 1. Visão Geral

Plataforma institucional transversal de gestão cultural construída sobre **Google Apps Script (GAS)**, operando como SPA (Single-Page Application) com backend multi-spreadsheet. O sistema não é uma coleção de módulos independentes — é uma plataforma integrada onde ações, tarefas, reuniões, contratos, reservas e processos compartilham estado e se notificam mutuamente.

**Princípios arquiteturais:**
- Orientação por ações institucionais como unidade central
- Modularidade com baixo acoplamento via bridge tipada
- Rastreabilidade via auditoria e EventBus em todas as escritas
- FSM (máquina de estados finitos) para transições de status em todos os domínios
- Separação rígida entre estrutura HTML e lógica JavaScript

---

## 2. Pilha Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Runtime | Google Apps Script (V8) |
| Banco de dados | Google Sheets (multi-spreadsheet) + Drive (JSON) |
| Frontend | HTML/CSS/JS servido via `HtmlService.createTemplateFromFile` |
| CSS | TailwindCSS (CDN) + custom CSS por módulo |
| UI Libraries | SweetAlert2, Flatpickr, Font Awesome 6 |
| Auth | Google OAuth via `Session.getActiveUser()` |
| Cache | `CacheService.getScriptCache()` (6h TTL) |

---

## 3. Arquitetura de Backend em 3 Camadas

```
Frontend (GAS.namespace.método)
        │
        ▼
┌─────────────────────────────┐
│  CONTROLLERS (ctrl_*.gs)    │  ← Fachada pública. Única camada exposta ao bridge.
│  25 controllers             │     Retornam sempre GasResponse { ok, data, error }.
│  Regra: ctrl_dominio_acao   │     Fazem auditoria e validação de sessão.
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  ENGINES / SERVICES         │  ← Lógica de negócio e FSMs.
│  23 engines                 │     Nunca chamados diretamente pelo bridge.
│  Ex: TarefaEngine, FSM      │     Orquestram transições, validações, notificações.
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  REPOSITORIES / MOD_*       │  ← Acesso a dados. Sheets + Drive JSON.
│  11 repositories formais    │     lerJSON() / salvarJSON() para Drive.
│  mod_relatorios.gs (CRUD    │     _getSheet() para Sheets.
│  legado, migração Fase 5)   │     LockService em operações de escrita.
└─────────────────────────────┘
```

### Controllers (25)

| Controller | Domínio |
|-----------|---------|
| `acoes_controller.gs` | Ações institucionais + solicitações |
| `admin_controller.gs` | Administração, logs, configurações |
| `almoxarifado_controller.gs` | Almoxarifado e movimentações |
| `auth_controller.gs` | Autenticação e URL de logout |
| `chaves_controller.gs` | Protocolo de chaves |
| `comunicacao_controller.gs` | Convites, e-mails institucionais |
| `comunicacao_processos_controller.gs` | Demandas de comunicação vinculadas a processos |
| `contratos_controller.gs` | Contratos, metas, rubricas, indicadores |
| `documentos_controller.gs` | Geração de documentos no Drive |
| `equipes_controller.gs` | Equipes e membros |
| `escalas_controller.gs` | Escalas de trabalho |
| `escuta_controller.gs` | Sistema de escuta institucional |
| `financeiro_controller.gs` | Painel financeiro integrado |
| `habilitacoes_controller.gs` | Habilitações de programação |
| `ia_controller.gs` | Assistente IA / métricas inteligentes |
| `modulos_controller.gs` | Ativação/desativação de módulos |
| `pauta_externa_controller.gs` | Gestão de pautas externas |
| `permissoes_controller.gs` | Permissões por perfil |
| `preferencias_controller.gs` | Preferências de usuário (favoritos, etc.) |
| `processos_inst_controller.gs` | Processos administrativo-financeiros |
| `reservas_controller.gs` | Reservas de espaços |
| `reunioes_controller.gs` | Reuniões e encaminhamentos |
| `rh_controller.gs` | RH — equipe, folha, férias, rescisão |
| `solicitacoes_controller.gs` | Solicitações externas (CODIP, etc.) |
| `tarefas_controller.gs` | Tarefas e delegação |

### Serviços Core

```
core/
├── auth_session.gs          — Resolução de identidade e sessão
├── config.gs                — Constantes e PROP keys
├── data_layer.gs            — Abstração lerJSON() / salvarJSON()
├── event_bus_backend.gs     — EventBus de backend (SystemEvents)
├── events_constants.gs      — Tipos de eventos (SystemEventTypes)
├── logger.gs                — Logger estruturado (Logger.info/warn/error)
├── notification_engine.gs   — Notificações push e e-mail
├── setup.gs                 — Bootstrap: spreadsheets, abas, JSON files
└── services/
    ├── auditoria_service.gs — Registro de auditoria em todas as escritas
    ├── cache_service.gs     — Wrapper de CacheService com TTL
    ├── data_gateway.gs      — Gateway de acesso multi-spreadsheet
    ├── fsm_guardian.gs      — Validador genérico de transições FSM
    ├── metrics_engine.gs    — Cálculo de métricas e IA institucional
    ├── permissoes_service.gs — Avaliação de permissões por perfil
    └── usuarios_service.gs  — Resolução de usuários e perfis
```

---

## 4. Arquitetura de Frontend

O frontend é uma SPA servida pelo GAS via `Index.html`. Todos os arquivos são concatenados no servidor antes do envio ao browser via `<?!= include('caminho/arquivo') ?>`.

### Estrutura de Pastas Frontend

```
gas/src/html/
├── layout/
│   ├── sidebar.html          — Navegação lateral + favoritos
│   ├── header.html           — Barra superior + busca
│   ├── login_html.html       — Tela de login OAuth
│   └── ...
├── modulos/                  — Estrutura HTML de cada módulo (sem JS)
│   ├── mod_acoes.html
│   ├── mod_gestao_contratos.html
│   └── ... (28 módulos)
├── logic/                    — JavaScript de cada módulo (separado do HTML)
│   ├── mod_acoes_js.html
│   ├── mod_gestao_contratos_js.html
│   └── ... (28 arquivos _js.html)
│   ├── core/                 — Auth, identidade, boot
│   ├── services/
│   │   └── server_bridge_js.html  — GAS bridge (objeto GAS.*)
│   └── ui/
│       ├── navegacao_ui_js.html   — Roteamento de abas
│       └── permissoes_ui_js.html  — aplicarPermissoesUI()
└── modais/                   — Modais compartilhados
```

### Padrão de Módulo (regra de ouro)

Cada módulo tem DOIS arquivos:
1. `html/modulos/mod_xxx.html` — Apenas estrutura HTML e CSS local. Sem `<script>`.
2. `html/logic/mod_xxx_js.html` — Apenas JavaScript. Com cabeçalho `<!--@file...-->`.

Em `Index.html`, sempre incluir o HTML antes do JS correspondente:
```
<?!= include('html/modulos/mod_xxx'); ?>
<?!= include('html/logic/mod_xxx_js'); ?>
```

### Lazy-load de módulos

Módulos pesados usam o padrão de lazy-load para não carregar ao boot:

```javascript
window['_onShow_aba-xxx'] = function() {
  if (!_xxxState.carregado) {
    carregarXxx();
    _xxxState.carregado = true;
  }
};
```

O roteador em `navegacao_ui_js.html` chama este hook ao mostrar uma aba.

---

## 5. Padrão de Comunicação Frontend → Backend

### Bridge (objeto GAS)

Toda comunicação com o servidor passa pelo objeto `GAS` definido em `server_bridge_js.html`. **Nunca usar `google.script.run` diretamente fora da camada de autenticação.**

```javascript
// CORRETO
GAS.tarefas.criar(dados, function(result) { /* sucesso */ }, function(err) { /* erro */ });

// ERRADO — uso direto proibido fora de auth
google.script.run.withSuccessHandler(cb).criarTarefa(dados);
```

### Namespaces do Bridge (25)

| Namespace | Controller alvo |
|-----------|----------------|
| `GAS.reservas` | reservas_controller |
| `GAS.admin` | admin_controller |
| `GAS.rece` | admin_controller (RECE) |
| `GAS.ia` | ia_controller |
| `GAS.contratos` | contratos_controller |
| `GAS.sessao` | preferencias_controller + auth_controller |
| `GAS.solicitacoes` | acoes_controller (solicitações) |
| `GAS.comunicacao` | comunicacao_controller |
| `GAS.documentos` | documentos_controller |
| `GAS.tarefas` | tarefas_controller |
| `GAS.processos` | processos_inst_controller |
| `GAS.almoxarifado` | almoxarifado_controller |
| `GAS.balcao` | tarefas_controller (comunicacao) |
| `GAS.equipes` | equipes_controller |
| `GAS.eficiencia` | ia_controller (métricas) |
| `GAS.contratacoes` | financeiro_controller |
| `GAS.rh` | rh_controller |
| `GAS.escalas` | escalas_controller |
| `GAS.escuta` | escuta_controller |
| `GAS.auth` | auth_controller |
| `GAS.chaves` | chaves_controller |
| `GAS.modulos` | modulos_controller |
| `GAS.permissoes` | permissoes_controller |
| `GAS.processosAdm` | processos_inst_controller |

### GasResponse (envelope padrão)

Todo retorno de controller usa `GasResponse.wrap()`:

```javascript
// backend
function ctrl_xxx_acao(dados, emailFallback) {
  return GasResponse.wrap(function() {
    // lança exceção em caso de erro
    return resultado;
  });
}
// retorna: { ok: true, data: resultado } ou { ok: false, error: "mensagem" }
```

O bridge extrai `data` automaticamente e passa ao callback de sucesso.

### BtnGuard — Padrão para botões com ação GAS

```javascript
BtnGuard.gas(btnEl, GAS.tarefas.criar, [dados], function(result) {
  // sucesso
}, function(err) {
  // erro — BtnGuard já restaurou o botão
});
```

`BtnGuard.gas()` desabilita o botão, mostra spinner, e restaura em caso de erro.  
**Proibido fazer GAS calls diretas em `onclick` sem BtnGuard em operações de escrita.**

---

## 6. Módulos Registrados

Gerenciados em `mod_modulos_registry.gs`. Visibilidade controlada por `ativo: true/false` e perfil `apenasSuperadmin`.

### Módulos Ativos (ativo: true)

| moduleId | Nome | Aba | Categoria |
|----------|------|-----|-----------|
| `nova_reserva` | Nova Reserva | aba-lista-reservas | operacional |
| `acoes` | Ações Institucionais | aba-acoes | estrategia |
| `habilitacoes` | Habilitações | aba-habilitacoes | programacao |
| `aprovacoes` | Aprovações | aba-aprovacoes | operacional |
| `agenda_rece` | Agenda RECE | aba-agenda-rece | operacional |
| `chaves` | Protocolo de Chaves | aba-protocolo-chaves | operacional |
| `dashboard` | Dashboard | aba-dashboard | estrategia |
| `configuracoes` | Configurações | aba-configuracoes | admin |
| `auditoria` | Auditoria | aba-auditoria | admin |
| `permissoes` | Permissões | aba-permissoes-v2 | admin |
| `gestao_modulos` | Gestão de Módulos | aba-gestao-modulos | admin |
| `almoxarifado` | Almoxarifado | aba-almoxarifado | operacional |
| `eficiencia` | Eficiência | aba-eficiencia | estrategia |
| `balcao` | Balcão da Comunicação | aba-balcao | comunicacao |

### Módulos em Beta / Desenvolvimento (ativo: false)

| moduleId | Status | Observação |
|----------|--------|-----------|
| `tarefas` | beta | Funcional, pendente ativação |
| `reunioes` | beta | Funcional, pendente ativação |
| `rh` | beta | Funcional, pendente ativação |
| `contratos` | beta | `aba-gestao-contratos`, funcional |
| `financeiro` | beta | `aba-contratos-fin`, depende de contratos |
| `escuta` | beta | Funcional, pendente ativação |
| `processos_adm` | beta | Novo módulo v2.0 |
| `solicitacoes` | beta | Solicitações externas |
| `pauta_externa` | beta | Pautas externas |
| `codip` | beta | CODIP — sem backend próprio ainda |
| `relatorios_fin` | beta | Relatórios financeiros |
| `contratacoes` | beta | Fluxo de caixa |
| `agenda_geral` | beta | Agenda pública |

---

## 7. Catálogo de Dados JSON (Drive)

Arquivos gerenciados pelo `DataLayer` via `lerJSON(nome)` / `salvarJSON(nome, dados)`. Criados automaticamente pelo `setup.gs` na inicialização.

| Arquivo | Domínio | Conteúdo |
|---------|---------|---------|
| `permissoes_v2.json` | Auth | Mapa de permissões por perfil e aba |
| `usuarios_sistema.json` | Auth | Cache de usuários e perfis |
| `auditoria_permissoes.json` | Auth | Log de mudanças de permissão |
| `funcionarios.json` | RH/Equipes | Cadastro de colaboradores |
| `escalas.json` | RH | Escalas de trabalho (legado) |
| `avaliacoes.json` | RH | Avaliações de desempenho (legado) |
| `ferias.json` | RH | Controle de férias |
| `rh_cargos.json` | RH | PCCS — plano de cargos e salários |
| `rh_historico.json` | RH | Histórico de movimentações |
| `rh_avaliacoes.json` | RH | Avaliações estruturadas v2 |
| `rh_ponto.json` | RH | Registro de ponto |
| `rh_documentos.json` | RH | Documentos dos colaboradores |
| `rh_folha.json` | RH | Folha de pagamento |
| `rh_perfil_social.json` | RH | Perfil social e contatos |
| `rh_escalas.json` | RH | Escalas de trabalho v2 |
| `rh_escalas_trocas.json` | RH | Solicitações de troca de turno |
| `rh_escalas_logs.json` | RH | Log de importações de escala |
| `rh_ferias.json` | RH | Férias v2 (FeriasEngine) |
| `rh_alertas_ferias.json` | RH | Alertas de vencimento de férias |
| `rh_pccs.json` | RH | PCCS — plano de cargos e salários |
| `rh_pccs_params.json` | RH | Parâmetros fiscais do PCCS |
| `contratacoes.json` | Financeiro | Contratos financeiros e fontes de recurso |
| `pagamentos.json` | Financeiro | Pagamentos executados |
| `tarefas.json` | Tarefas | Todas as tarefas (TarefaEngine) |
| `processos.json` | Processos | Processos administrativo-financeiros |
| `demandas.json` | Processos | Demandas vinculadas a processos |
| `atendimentos.json` | Processos | Atendimentos e registros |
| `processo_tipos.json` | Processos | Catálogo configurável de tipos e etapas |
| `orcamento_reservas.json` | Processos | Reservas orçamentárias (OrcamentoGuard) |
| `almoxarifado.json` | Almoxarifado | Estoque atual por categoria |
| `movimentacoes_almox.json` | Almoxarifado | Histórico de movimentações |
| `reunioes.json` | Reuniões | Reuniões, pautas e atas |
| `encaminhamentos.json` | Reuniões | Encaminhamentos com FSM próprio |
| `reunioes_series.json` | Reuniões | Séries de reuniões recorrentes |
| `pauta_historico.json` | Reuniões | Log auditável de mutações de pauta |
| `solicitacoes.json` | Solicitações | Solicitações externas (SolicitacaoEngine) |
| `solicitacoes_seq.json` | Solicitações | Contador de sequência de IDs |
| `pauta_externa.json` | Pauta Externa | Pautas externas recebidas |
| `pauta_externa_seq.json` | Pauta Externa | Contador de sequência de IDs |
| `modulos_registry.json` | Sistema | Estado ativo/inativo dos módulos |

---

## 8. Engines e FSMs

Cada domínio com fluxo de estados tem um engine próprio com FSM guardian:

| Engine | Localização | Estados |
|--------|------------|---------|
| `ActionEngine` | `action_engine/` | rascunho → em_andamento → concluido / cancelado |
| `ReservaEngine` | `modules/reservas/` | pendente → confirmada → cancelada / no_show |
| `ContratosEngine` | `modules/contratos/` | ativo → suspenso → encerrado / vencendo |
| `TarefaEngine` | `modules/tarefas/` | pendente → em_andamento → concluida / cancelada |
| `ChaveEngine` | `modules/chaves/` | disponivel → em_uso → devolvida |
| `HabilitacoesEngine` | `modules/programacao/` | rascunho → habilitado → realizado |
| `AuthEngine` | `modules/auth/` | Resolução de identidade e sessão |
| `SolicitacaoEngine` | `modules/solicitacoes/` | pendente → aprovado / recusado |
| `ReunioesEngine` | `modules/reunioes/` | convocada → realizada → cancelada |
| `ReunioesSeriesEngine` | `modules/reunioes/` | Recorrência e geração automática |
| `PautaExternaEngine` | `modules/pauta_externa/` | recebida → em_analise → aprovada / recusada |
| `EquipesEngine` | `modules/equipes/` | Gestão de membros e papéis |
| `ProcessoInstitucionalEngine` | `modules/processos/` | etapas configuráveis via ProcessoTipoConfigEngine |
| `RhEngine` | `modules/rh/` | Movimentações e histórico |
| `FeriasEngine` | `modules/rh/` | Solicitação e aprovação de férias |
| `EscalasEngine` | `modules/rh/` | Gestão de escalas e trocas |
| `RescisaoEngine` | `modules/rh/` | Cálculo trabalhista de rescisão |
| `MetricsEngine` | `core/services/` | Métricas institucionais + IA |
| `NotificationEngine` | `core/` | Notificações push e e-mail |

### FSMGuardian (validador genérico)

Todas as transições passam pelo `fsm_guardian.gs` que valida:
- Se a transição é permitida a partir do estado atual
- Se o usuário tem perfil para executar a transição
- Registra o evento no `EventBus` e `AuditoriaService`

---

## 9. Regras Arquiteturais (não negociáveis)

### Backend

1. **O bridge aponta APENAS para funções `ctrl_dominio_acao`** — nunca para engines, repositories ou mod_*.
2. **Todo controller retorna `GasResponse.wrap()`** — nunca retorna valor bruto.
3. **Toda escrita passa por `AuditoriaService.registrar()`** — rastreabilidade é obrigatória.
4. **Transições de status usam o engine do domínio** — nunca atualizar status diretamente no repository.
5. **Operações concorrentes usam `LockService`** — já implementado em preferencias, relatorios, permissoes e modulos_registry.

### Frontend

1. **Chamadas GAS usam `GAS.namespace.método()`** — `google.script.run` direto proibido (exceto camada de auth pré-sessão).
2. **Botões de ação usam `BtnGuard.gas()`** — proteção contra duplo-clique obrigatória.
3. **Módulos usam lazy-load via `window['_onShow_aba-xxx']`** — não carregar dados no boot.
4. **HTML e JS separados** — `mod_xxx.html` sem `<script>`, `mod_xxx_js.html` sem HTML estrutural.
5. **Favoritação proibida** para abas listadas em `FAV_BLOQUEADOS` na sidebar.

---

## 10. Estado da Refatoração (2026-05)

### Concluído

- ✅ **Fase 1 — Estabilização**: Eliminado `mod_processos.html` legado; migrados todos os `google.script.run` críticos para `GAS.*`; removidos hardcodes de teste (`joao.barros` em metrics); deletado arquivo de teste de produção.
- ✅ **Fase 2 — Padronização**: LockService implementado em todos os paths críticos; módulos órfãos confirmados como já bridgeados.
- ✅ **Fase 3 — Decomposição total**: Todos os 28 módulos HTML separados de seus respectivos `_js.html`. Eliminado `mod_contratos_js.html` (superseded). 40 includes de lógica no Index.html com padrão uniforme.

### Pendente (Fase 5+)

- 🔄 **Migração de CRUD para repositories**: `mod_relatorios.gs` ainda concentra operações de leitura/escrita de vários domínios. Migração progressiva para repositories por domínio.
- 🔄 **Ativação de módulos beta**: tarefas, reuniões, rh, contratos, escuta, processos_adm — dependem de validação funcional.
- 🔄 **Consolidação RH**: múltiplos engines de RH (rh, ferias, escalas, rescisao, historico, parametros_fiscais) podem ser unificados sob um único `RhDomainService`.
- 🔄 **mod_balcao**: módulo de comunicação em beta (`ativo: false`) — decisão de ativação pendente.

---

## 11. Fluxo de Boot da Aplicação

```
1. Index.html carregado pelo browser
2. login_html.html → OAuth Google → auth_identity_js.html verifica sessão
3. Se autenticado:
   a. AppState inicializado com dados do usuário
   b. carregarPreferencias() → sidebar renderizada com favoritos
   c. aplicarPermissoesUI() → abas visíveis conforme perfil
   d. inicializarApp() → aba padrão exibida
4. Ao clicar em aba:
   a. mostrarAba('aba-xxx') → navegacao_ui_js.html
   b. Chama window['_onShow_aba-xxx']() se existir (lazy-load)
   c. GAS.namespace.listar() → controller → engine/repository → GasResponse → callback
```

---

*Para adicionar um módulo: (1) criar HTML em `modulos/`, (2) criar JS em `logic/`, (3) adicionar includes no `Index.html`, (4) registrar em `mod_modulos_registry.gs`, (5) adicionar botão na sidebar, (6) implementar `window['_onShow_aba-xxx']` no JS.*
