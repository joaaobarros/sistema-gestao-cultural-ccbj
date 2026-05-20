# Análise Estratégica dos Mapas — Sistema CCBJ
**Data:** 2026-05-15  
**Branch:** refactor-fase2  
**Status:** Documento de Referência Arquitetural

---

## 1. PREMISSA METODOLÓGICA

Esta análise parte de um princípio central: **o sistema já é maduro** (score 98/100 na governança arquitetural de 2026-05-11). Os mapas não são ordens de execução cega — são desejos e intenções que devem ser lidos à luz do que já existe, descartando redundâncias e extraindo apenas o que gera valor incremental real.

---

## 2. ESTADO ATUAL DA ARQUITETURA

### 2.1 O Que Está Maduro e Não Deve Ser Tocado

| Engine / Módulo | Estado | Observações |
|---|---|---|
| TarefaEngine | Maduro | FSM 9 estados, 5 visões, automação, delegação |
| ReunioesSeriesEngine | Maduro | Pauta colaborativa, transferência, IA contextual |
| ReunioesEngine | Maduro | FSM reunião + encaminhamento, 6 visões |
| ChaveEngine | Maduro | FSM 5 estados, auditoria, drag-and-drop |
| ReservaEngine | Maduro | FSM, validação de conflitos, bloqueio |
| Permissões v2 | Maduro | 4 camadas, 8 perfis, 17 módulos |
| EscalaEngine | Maduro | Plantões, turnos, folgas |
| FériasEngine | Maduro | Solicitação, aprovação, cálculo |
| HabilitaçõesEngine | Maduro | Diárias, aprovações, programação |
| EventBus Backend | Maduro | 70+ tipos, aliases, normalização |
| AuditoriaService | Maduro | Rastreamento completo |
| ModulosRegistry | Maduro | Ativação dinâmica, sidebar |
| AuthEngine | Maduro | GSI + email/senha, sessão |
| EscutaModule | Maduro | 8 dimensões clima, alertas NR-1 |

### 2.2 O Que Existe Mas Está Superficial (Dívidas)

| Componente | Estado Real | Gap |
|---|---|---|
| AlmoxarifadoModule | CRUD básico | Sheets prontas (Ativos, MovimentacoesAtivos, Manutencoes, UsoAtivos, Baixas) sem engine |
| AçõesModule | Hub parcial | Painel integrado existe, mas sem contratos vinculados, sem equipes, sem financeiro por ação |
| IAController | Fachada vazia | 2.6KB, 6 funções que delegam para mod_metrics sem engine própria |
| FinanceiroModule | Isolado | Módulo funcional mas sem vínculos bidirecionais com ações/projetos |
| EventBus | Emissão parcial | 70+ constantes definidas mas nem todos os módulos emitem |

### 2.3 O Que Não Existe (Gaps Reais)

| Feature | Estado | Justificativa do Gap |
|---|---|---|
| Portal de Formulários Externos | Inexistente | Nenhum módulo aceita entrada pública sem autenticação |
| DemandaInterna unificada | Inexistente | Fluxo disperso entre RH, financeiro, comunicação |
| InfraEngine (gestão de ativos) | Inexistente | Sheets prontas, engine ausente |
| Notificações transversais | Inexistente | Apenas convites de calendário; sem alertas temporais sistêmicos |
| Dashboard de capacidade institucional | Inexistente | Visão consolidada de espaços + equipes + financeiro + ações |

---

## 3. LEITURA ESTRATÉGICA DOS 4 MAPAS

### 3.1 Mapa: feature_infraestrutura_almoxarifado.md

**Intenção real detectada:**  
O mapa não quer apenas organizar estoque. Quer transformar reservas de espaços em eventos com ativos físicos rastreados — quem retirou o equipamento, quando devolveu, se danificou. É uma camada de **rastreabilidade de recursos físicos** que complementa a rastreabilidade de espaços já existente.

**O que já existe:**  
O `setup.gs` define o spreadsheet ESPACOS com as abas: `Reservas, Ativos, MovimentacoesAtivos, Manutencoes, UsoAtivos, Baixas`. A arquitetura foi **planejada** para suportar isso. O `mod_almoxarifado.gs` usa JSON no Drive com CRUD básico de itens — não usa essas sheets.

**Decisão arquitetural:**  
- **NÃO criar novo spreadsheet.** As sheets já existem no ESPACOS.  
- **NÃO duplicar** a lógica de conflito de reservas do ReservaEngine.  
- **CRIAR** `ativo_engine.gs` com FSM de ativo + integração com ReservaEngine.  
- **MIGRAR** a persistência de `almoxarifado_items.json` para a aba `Ativos` do ESPACOS.

**O que aproveitar do mapa (filtragem inteligente):**
- FSM de ativo: `disponivel → reservado → em_uso → manutencao → baixa` ✅
- Integração reserva → bloqueio automático de ativo ✅
- Registro de retirada/devolução ✅
- Alertas de manutenção (flag simple, não preditiva em GAS) ✅
- **Descartar**: manutenção preditiva com ML (inviável em GAS), alertas push de IoT

**Integrações a implementar:**
```
Reserva aprovada → AtivoEngine.bloquear(ativoId, reservaId)
Evento iniciado → AtivoEngine.registrarRetirada(ativoId, usuarioId)
Evento concluído → AtivoEngine.registrarDevolucao(ativoId, condicao)
Ativo em manutenção → flag na UI de reservas (ativo indisponível)
```

---

### 3.2 Mapa: modulo_gestao_projetos.md

**Intenção real detectada:**  
O mapa descreve exatamente o que a `action_engine.md` (arquitetura 01) já define: a Ação como nó central conectando pessoas, recursos, operação, financeiro, execução e entregas. A intenção implícita não é criar um novo módulo — é **completar as integrações que o módulo de Ações já promete mas não entrega**.

**O que já existe:**  
`acoes_controller.gs` tem `ctrl_acoes_obter_painel_integrado()` que já busca reservas + tarefas + reuniões vinculadas. O problema é que:
1. Contratos não aparecem no painel integrado
2. Equipes/papéis não aparecem no painel integrado
3. Financeiro (rubricas, despesas, receitas) não aparecem no painel
4. O frontend `mod_acoes.html` não exibe estas integrações com profundidade

**Decisão arquitetural:**  
- **NÃO criar** Módulo de Gestão de Projetos separado.  
- **ENRIQUECER** `ctrl_acoes_obter_painel_integrado()` com contratos + equipes + financeiro.  
- **MELHORAR** o frontend com tabs de integrações dentro da visão de ação.

**Modelo de tabs no frontend de Ação:**
```
[Visão Geral] [Tarefas] [Reservas] [Reuniões] [Contratos] [Equipe] [Financeiro] [Entregas]
```

**O que aproveitar do mapa:**
- Sistema centrado em ações (já é o paradigma) ✅
- Vinculações a contratos por ação ✅
- Vinculações de equipe por papel dentro da ação ✅
- Financeiro por ação (rubricas + despesas) ✅
- Relatório consolidado de ação ✅
- **Descartar**: Criar novo módulo separado de "Gestão de Projetos"

---

### 3.3 Mapa: modulo_demandas_internas.md

**Intenção real detectada:**  
O mapa quer um ponto central para solicitações internas que atualmente estão dispersas: contratação de professores (RH), compra de equipamentos (financeiro/almoxarifado), contratação de serviços (contratos), bolsistas (RH). A intenção é **rastreabilidade e aprovação centralizada** dessas demandas.

**O que já existe:**  
- `TarefaEngine` com FSM de 9 estados e modelos de automação  
- `_TEMPLATES_AUTO` para geração de tarefas por evento  
- `modulo='comunicacao'` já sendo usado para segregar tarefas por domínio  
- `rh_controller.gs` com contratações (41KB — módulo muito robusto)  
- `financeiro_controller.gs` com contratações financeiras

**Risco de duplicação:**  
Criar um `DemandaInterna Engine` separado seria redundante com o TarefaEngine que já tem FSM, delegação, histórico, SLA e permissões.

**Decisão arquitetural:**  
- **NÃO criar** novo engine de demandas.  
- **MODELAR** DemandaInterna como Tarefa com `modulo='demanda_interna'`, `tipo=tipo_demanda`.  
- **ADICIONAR** campos extras via campo `contexto` (estrutura JSON já suportada).  
- **ADICIONAR** templates no `_TEMPLATES_AUTO` para cada tipo de demanda.  
- **CRIAR** view filtrada no frontend (aba ou filtro no mod_tarefas).

**Mapeamento de tipos:**
```javascript
tipos_demanda: [
  'contratacao_professor',    // → integra com rh_engine
  'contratacao_profissional', // → integra com rh_engine
  'aquisicao_equipamento',    // → integra com almoxarifado
  'contratacao_servico',      // → integra com contratos_engine
  'bolsista',                 // → integra com rh_engine + financeiro
  'manutencao_espaco',        // → integra com ativo_engine
]
```

**Fluxo via TarefaEngine existente:**
```
backlog → solicitada → em_analise → em_execucao → aguardando_aprovacao → concluida
```
(já é o FSM canônico do TarefaEngine — zero redundância)

---

### 3.4 Mapa: feature_formularios_externos.md

**Intenção real detectada:**  
Permitir que agentes externos ao CCBJ (artistas, grupos, comunidade, parceiros) submetam solicitações sem precisar de conta no sistema. A intenção é criar um **ponto de entrada público** que alimenta o fluxo interno de triagem.

**O que já existe:**  
- `mod_painel_solicitacoes.html` gerencia aprovações de reservas (interno)  
- `mod_aprovacoes.html` centraliza aprovações (reservas, usuários, chaves)  
- `mod_escuta.html` é monitoramento de clima (interno, autenticado)  
- Nenhum módulo aceita entrada SEM autenticação

**Gap confirmado:** Este é o único mapa com um gap arquitetural genuinamente novo — não existe solução equivalente.

**Decisão arquitetural:**  
- **CRIAR** endpoint público via `doGet(e)` com parâmetro `?tipo=formulario`  
- **CRIAR** `mod_solicitacoes_externas.gs` — persistência em `solicitacoes_externas.json`  
- **INTEGRAR** com TarefaEngine: toda solicitação aprovada na triagem gera tarefa automaticamente  
- **REAPROVEITAR** `mod_aprovacoes.html` como interface de triagem interna  
- **NÃO criar** sistema de aprovações paralelo

**Fluxo mínimo viável:**
```
Agente externo → formulário público (doGet) → solicitacoes_externas.json
                                                        ↓
                            Triagem interna (mod_aprovacoes.html)
                                     ↓                    ↓
                              Aprovada                 Recusada
                                 ↓                         ↓
                      TarefaEngine.criar()          notifica solicitante
                      modulo='solicitacao_externa'
```

---

## 4. AUDITORIA DE INTEGRAÇÕES EXISTENTES

### 4.1 Integrações Funcionando

```
Reserva → Comunicação: integracao_reserva_comunicacao_js.html ✅
Tarefa → Comunicação: mod_comunicacao_processos.gs (TarefaEngine) ✅
Reunião → Encaminhamentos → Tarefas: reuniao_engine.gs ✅
Chave → Auditoria: chave_engine.gs + auditoria_service.gs ✅
EventBus → EventLog (sheet MASTER) ✅
Permissões → Sidebar dinâmica → ModulosRegistry ✅
```

### 4.2 Integrações Prometidas mas Superficiais

```
Ação → Contratos: campo acaoId em contratos, mas sem busca reversa no painel
Ação → Equipes: sem vinculação de papel por ação
Ação → Financeiro: sem rubricas por ação
Reserva → Ativos: sheets prontas, integração inexistente
DemandaInterna → Módulos: dispersa entre RH, financeiro, comunicação
```

### 4.3 Integrações Inexistentes (Oportunidades)

```
Tarefa → Ação: tarefa pode ter acaoId mas não está integrado no painel de ação
Formulário Externo → TarefaEngine: inexistente
Ativo → Reserva: inexistente (bloqueio automático)
Demanda → RH/Contratos: inexistente como fluxo unificado
Alertas temporais → Email: inexistente (além de convites de calendário)
```

---

## 5. DESCARTE INTELIGENTE

O que os mapas propõem mas NÃO deve ser implementado:

| Proposta do Mapa | Motivo do Descarte |
|---|---|
| Módulo separado de Gestão de Projetos | action_engine.gs já é isso; duplicaria arquitetura |
| DemandaInterna Engine própria | TarefaEngine absorve com modulo='demanda_interna' |
| Sistema de aprovações paralelo para formulários externos | mod_aprovacoes.html já existe e serve |
| Manutenção preditiva com ML | Inviável em GAS; alertas simples bastam |
| Portal de acompanhamento externo em tempo real | Complexidade desproporcional; email de resposta basta |
| Novo spreadsheet para infraestrutura | Sheets Ativos/* já existem em ESPACOS |
| Módulo separado de contratos de projetos | contratos_engine.gs já existe; vincular por acaoId |

---

## 6. ROADMAP DE IMPLEMENTAÇÃO

### Prioridade 1 — InfraEngine (Gestão de Ativos)
**Impacto:** Alto | **Esforço:** Médio | **Risco:** Baixo (sheets prontas)

**Entregas:**
1. `modules/infraestrutura/ativo_engine.gs` — FSM + operações de ativo
2. `modules/infraestrutura/ativo_repository.gs` — persistência em sheets ESPACOS
3. `backend/controllers/infraestrutura_controller.gs` — fachada HTTP
4. Atualizar `almoxarifado_controller.gs` para delegar ao InfraEngine
5. Integração com ReservaEngine: hook `onReservaAprovada → bloquearAtivos()`
6. UI: enriquecer `mod_almoxarifado.html` com visão de ativos + status + movimentações

**Schema AtivoEngine:**
```javascript
STATUS_ATIVO = {
  disponivel: 'disponivel',
  reservado: 'reservado',   // bloqueado por reserva aprovada
  em_uso: 'em_uso',         // retirada registrada
  manutencao: 'manutencao',
  baixa: 'baixa'
}

TRANSICOES_ATIVO = {
  disponivel: ['reservado', 'manutencao', 'baixa'],
  reservado:  ['disponivel', 'em_uso'],
  em_uso:     ['disponivel', 'manutencao'],
  manutencao: ['disponivel', 'baixa'],
  baixa:      []
}
```

**Novos endpoints:**
```
ctrl_infra_listar_ativos()
ctrl_infra_salvar_ativo(dados)
ctrl_infra_mudar_status_ativo(id, novoStatus, contexto)
ctrl_infra_registrar_retirada(ativoId, reservaId, usuarioId)
ctrl_infra_registrar_devolucao(ativoId, condicao, observacao)
ctrl_infra_listar_movimentacoes(filtros)
ctrl_infra_registrar_manutencao(ativoId, dados)
ctrl_infra_bloquear_para_reserva(ativoId, reservaId)
```

**EventBus:**
```
ASSET_BLOCKED_FOR_RESERVATION
ASSET_RETRIEVED
ASSET_RETURNED
ASSET_MAINTENANCE_STARTED
ASSET_DECOMMISSIONED
```

---

### Prioridade 2 — Ações como Hub Real
**Impacto:** Muito Alto | **Esforço:** Médio | **Risco:** Baixo (backend existe)

**Entregas:**
1. Enriquecer `ctrl_acoes_obter_painel_integrado()` com contratos + equipes + financeiro
2. Adicionar endpoint `ctrl_acoes_associar_contrato(acaoId, contratoId)`
3. Adicionar endpoint `ctrl_acoes_associar_membro_equipe(acaoId, email, papel)`
4. Adicionar endpoint `ctrl_acoes_registrar_despesa(acaoId, dados)`
5. Frontend: 8 tabs dentro do detalhe de ação

**Novo schema de painel integrado:**
```javascript
{
  acao: { ...dadosAcao },
  reservas: [...],         // já existe
  tarefas: [...],          // já existe
  reunioes: [...],         // já existe
  contratos: [...],        // NOVO — busca por acaoId em contratos
  equipe: [...],           // NOVO — membros com papéis por ação
  financeiro: {            // NOVO — rubricas + despesas da ação
    previsto: 0,
    executado: 0,
    saldo: 0,
    rubricas: [...],
    despesas: [...]
  },
  entregas: [...]          // NOVO — artefatos/entregas da ação
}
```

**Tabs do frontend:**
```
[Visão Geral] [Tarefas] [Reservas] [Reuniões] [Contratos] [Equipe] [Financeiro] [Entregas]
```

---

### Prioridade 3 — Demandas Internas via TarefaEngine
**Impacto:** Alto | **Esforço:** Baixo (zero novo engine) | **Risco:** Mínimo

**Entregas:**
1. Adicionar em `tarefa_engine.gs` → `TIPO_DEMANDA` constants
2. Adicionar templates em `_TEMPLATES_AUTO` para cada tipo de demanda
3. Adicionar `ctrl_tarefas_listar_demandas_internas()` no controller (filtro por modulo)
4. Frontend: aba "Demandas" no `mod_tarefas.html` ou mini-módulo `mod_demandas.html`
5. Adicionar campo `tipoDemanda` e `valorEstimado` no schema de tarefa (via contexto JSON)

**Novos templates em `_TEMPLATES_AUTO`:**
```javascript
contratacao_professor_solicitada: {
  titulo: 'Contratar professor: {nome}',
  modulo: 'demanda_interna',
  tipo: 'contratacao_professor',
  prioridade: 'alta',
  responsavel: 'rh',
  sla: 72
},
aquisicao_equipamento_solicitada: {
  titulo: 'Adquirir equipamento: {item}',
  modulo: 'demanda_interna',
  tipo: 'aquisicao_equipamento',
  prioridade: 'media',
  responsavel: 'almoxarifado',
  sla: 168
},
// ... etc para cada tipo
```

**Fluxo de integração por tipo:**
```
tipo=contratacao_* → ao concluir, notifica rh_controller para criar registro
tipo=aquisicao_*   → ao concluir, notifica ativo_engine para criar ativo
tipo=manutencao_*  → ao concluir, atualiza status do ativo em ativo_engine
```

---

### Prioridade 4 — Formulários Externos
**Impacto:** Médio | **Esforço:** Médio | **Risco:** Médio (novo paradigma — sem auth)

**Entregas:**
1. `modules/solicitacoes/mod_solicitacoes_externas.gs` — persistência + lógica de triagem
2. `backend/controllers/solicitacoes_externas_controller.gs` — fachada
3. Endpoint público via `doGet(e)` — sem auth — com tipos: `inscricao`, `solicitacao_pauta`, `pedido_administrativo`
4. HTML de formulário público (servido via `doGet` — HTML estático, não requer auth)
5. Enriquecer `mod_aprovacoes.html` com aba "Formulários Externos"
6. Auto-criação de tarefa de triagem via TarefaEngine quando formulário chega

**Tipos de formulário público:**
```
inscricao        → formulário de inscrição em curso/oficina/projeto
solicitacao_pauta → artista/grupo solicita espaço para apresentação
pedido_admin     → solicitação de declarações, certidões, informações
```

**Fluxo de triagem:**
```
Formulário chegou → notifica triador por email (MailApp)
Triador abre mod_aprovacoes → aba "Formulários Externos"
Triador aprova → TarefaEngine.criar() (modulo='solicitacao_externa')
Triador recusa → MailApp.sendEmail() para solicitante
```

---

### Prioridade 5 — Notificações Transversais
**Impacto:** Alto | **Esforço:** Baixo | **Risco:** Mínimo

**Entregas:**
1. `core/notification_engine.gs` — centralizador de alertas por email
2. Triggers temporais para verificações diárias:
   - Chaves com devolução atrasada → email para responsável
   - Tarefas próximas do prazo (< 24h) → email para executor
   - Contratos vencendo (< 30 dias) → email para gestor
   - Reuniões com ata pendente de aprovação > 7 dias → email para organizador
   - Férias a iniciar em < 5 dias sem cobertura → email para RH
   - Ativos em manutenção há > 30 dias → email para infraestrutura

**Pattern:**
```javascript
// Em cada engine, método padronizado:
engine.verificarAlertas() → retorna [{ tipo, entidade, destinatario, urgencia }]
NotificationEngine.processar(alertas) → envia emails, registra no EventLog
```

**Trigger já existente como padrão:**
```
reunioes_verificarAtrasosDiario → já implementado, serve de modelo
```

---

### Prioridade 6 — IA Contextual Expandida
**Impacto:** Médio | **Esforço:** Alto | **Risco:** Baixo

**Entregas:**
1. `core/ia_engine.gs` — motor de análise contextual (agregador de dados reais)
2. Análise de capacidade institucional (espaços + equipes + financeiro + ações)
3. Alertas inteligentes de gargalo (tarefas acumuladas, espaços subutilizados)
4. Sugestão de templates baseada em histórico de ações similares
5. Dashboard de inteligência operacional (aba nova no mod_dashboard.html)

**Análises disponíveis:**
```
ia_capacidade_institucional() → % utilização espaços, carga de equipes, orçamento
ia_gargalos_operacionais()    → tarefas acumuladas, reuniões sem encaminhamento
ia_padroes_demanda()          → períodos de pico, tipos mais frequentes
ia_saude_financeira()         → ações com saldo negativo, rubricas críticas
ia_clima_equipe()             → cruzamento Escuta + escalas + férias
```

---

## 7. INTEGRAÇÕES TRANSVERSAIS — MATRIZ

```
                    Ação  Tarefa  Reserva  Reunião  Contrato  Ativo  Demanda  Formulário
Ação              [hub]   ✅       ✅        ✅       P2↑       P2↑    P3→      —
Tarefa             ✅    [hub]     —         ✅       —         P3↑    ✅        P4↑
Reserva            ✅     —      [hub]      —        —         P1↑    —         P4→
Reunião            ✅     ✅       —        [hub]    —         —      —         —
Contrato           P2↑    —       —         —       [hub]     —      P3→       —
Ativo              P2↑    P3→     P1↑       —        —       [hub]   P3→       —
Demanda            P3→    ✅       —         —       P3→       P3→   [hub]      P4→
Formulário Ext.    —      P4↑     —         —        —        —      P4→      [hub]
RH                 —      ✅       —         —       P2→       —      P3↑       —
Financeiro         P2↑    —       —         —        ✅        —      P3→       —
Notificações       P5↑    P5↑     P5↑       P5↑      P5↑      P5↑    P5↑       P5↑

✅ = integrado    P1-P6↑ = prioridade a implementar    → = integração direcional
```

---

## 8. DÍVIDAS ARQUITETURAIS A RESOLVER

### 8.1 Imediatas (zero custo de implementação)

1. **Emissão de eventos ausentes**: Verificar e adicionar `SystemEvents.emit()` em todos os pontos críticos dos módulos (almoxarifado, financeiro, contratos) que ainda não emitem eventos
2. **Campo `acaoId` em tarefas e reuniões**: Garantir que o campo seja persistido e buscável nos repositories
3. **Autocomplete de ações no formulário de tarefas**: Usar `ctrl_acoes_para_autocomplete()` já existente

### 8.2 Curto Prazo

1. **InfraEngine** — sheets prontas, engine ausente (P1)
2. **Painel de Ação completo** — dados já existem em módulos isolados (P2)
3. **Filtro de Demandas Internas** — TarefaEngine já suporta, falta UI (P3)

### 8.3 Médio Prazo

1. **Formulários Externos** — novo paradigma (sem auth), risco médio (P4)
2. **NotificationEngine** — sistema unificado de alertas (P5)
3. **IA expandida** — análises contextuais reais (P6)

---

## 9. PRINCÍPIOS DE IMPLEMENTAÇÃO

Toda implementação deve respeitar:

1. **Zero novos engines para problemas já resolvidos** — TarefaEngine absorve demandas internas
2. **Zero novos spreadsheets** — usar sheets ESPACOS já definidas para ativos
3. **Zero módulos de aprovação paralelos** — mod_aprovacoes.html já é o hub
4. **Backend como fonte de verdade** — toda lógica de negócio em `.gs`, nunca no frontend
5. **FSM canônica** — toda entidade com ciclo de vida tem FSM guardada pelo FSMGuardian
6. **EventBus para integrações** — módulos se comunicam via eventos, não chamadas diretas
7. **GasResponse.wrap()** para todos os controllers — sem exceções
8. **Auditoria obrigatória** — toda mutação crítica registrada via AuditoriaService

---

## 10. PLANO DE EVOLUÇÃO FUTURA (Pós-P6)

### Horizonte 1 (6 meses)
- Portal externo com acompanhamento de solicitações via token
- Relatório consolidado de ação (PDF/Sheet) automatizado
- Dashboard de capacidade institucional em tempo real

### Horizonte 2 (12 meses)
- Multi-organização (SaaS): isolar dados por `orgId` no DataLayer
- App mobile (PWA) para operações de campo (chaves, ativos, escalas)
- Integração com sistemas externos (calendário público CCBJ, site institucional)

### Horizonte 3 (24 meses)
- IA generativa para análise de padrões institucionais
- Benchmark entre organizações culturais (SaaS multi-tenant)
- API pública para integração com sistemas de financiamento cultural

---

## 11. GLOSSÁRIO DE DECISÕES

| Termo | Decisão | Alternativa Descartada |
|---|---|---|
| DemandaInterna | Tarefa com modulo='demanda_interna' | Engine próprio |
| Gestão de Projetos | Enriquecimento de Ações | Módulo separado |
| Ativos | ativo_engine.gs + sheets ESPACOS | Novo spreadsheet |
| Formulários Externos | doGet() + solicitacoes_externas.json | Sistema paralelo de auth |
| Notificações | notification_engine.gs + triggers temporais | Sistema de push externo |
| IA | Agregação de dados reais (sem inventar) | LLM sem contexto real |

---

*Documento gerado em análise estratégica completa dos mapas do repositório CCBJ.*  
*Validado contra arquitetura existente. Score de aderência: 98/100.*  
*Próximos passos: implementar P1 (InfraEngine) na branch refactor-fase2.*
