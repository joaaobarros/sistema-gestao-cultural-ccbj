# Modelo de Eventos — SaaS ERP Cultural

## 1. Objetivo

Este documento define o modelo de eventos do sistema.

Eventos representam mudanças relevantes de estado operacional, institucional ou estrutural.

O modelo de eventos existe para:

- reduzir acoplamento
- melhorar integração
- fortalecer rastreabilidade
- permitir observabilidade
- organizar fluxos do sistema

---

# 2. Princípio Central

Módulos devem preferencialmente reagir a eventos ao invés de depender diretamente entre si.

---

## Objetivo

Evitar:

- dependência circular
- integrações frágeis
- fluxos invisíveis
- múltiplos pontos de verdade

---

# 3. O Que É Um Evento

Um evento representa uma ocorrência relevante registrada pelo sistema.

Eventos indicam:

- criação
- alteração
- transição
- conclusão
- falha
- aprovação
- arquivamento
- associação

---

# 4. Estrutura Base do Evento

Todo evento deve possuir:

| Campo | Objetivo |
|---|---|
| id | identificador único |
| tipo | tipo do evento |
| origem | módulo gerador |
| entidade | entidade afetada |
| entidade_id | identificador da entidade |
| usuario | responsável |
| timestamp | momento da ocorrência |
| contexto | informações adicionais |

---

# 5. Categorias de Eventos

---

## 5.1 Eventos Operacionais

Relacionados à execução cotidiana.

---

### Exemplos

- ACTION_CREATED
- TASK_CREATED
- TASK_COMPLETED
- RESERVATION_CREATED
- CONTRACT_UPDATED

---

## 5.2 Eventos Institucionais

Relacionados à governança e gestão.

---

### Exemplos

- REPORT_SUBMITTED
- INDICATOR_UPDATED
- AUDIT_LOG_CREATED
- USER_PERMISSION_CHANGED

---

## 5.3 Eventos Analíticos

Relacionados à inteligência e monitoramento.

---

### Exemplos

- ALERT_TRIGGERED
- KPI_THRESHOLD_REACHED
- OPERATIONAL_RISK_IDENTIFIED

---

## 5.4 Eventos de Sistema

Relacionados à infraestrutura.

---

### Exemplos

- SESSION_STARTED
- AUTH_FAILED
- SYSTEM_ERROR
- INTEGRATION_FAILED

---

# 6. Eventos da Action Engine

A Action Engine deve ser principal emissora de eventos operacionais.

---

## Eventos Básicos

| Evento |
|---|
| ACTION_CREATED |
| ACTION_UPDATED |
| ACTION_APPROVED |
| ACTION_STARTED |
| ACTION_PAUSED |
| ACTION_COMPLETED |
| ACTION_ARCHIVED |

---

# 7. Eventos de Tarefas

| Evento |
|---|
| TASK_CREATED |
| TASK_ASSIGNED |
| TASK_STARTED |
| TASK_COMPLETED |
| TASK_DELAYED |

---

# 8. Eventos de Reservas

| Evento |
|---|
| RESERVATION_CREATED |
| RESERVATION_APPROVED |
| RESERVATION_REJECTED |
| RESERVATION_CONFLICT_DETECTED |

---

# 9. Eventos de Contratos

| Evento |
|---|
| CONTRACT_CREATED |
| CONTRACT_UPDATED |
| CONTRACT_EXPIRED |
| PAYMENT_REGISTERED |

---

# 10. Eventos de Relatórios

| Evento |
|---|
| REPORT_CREATED |
| REPORT_SUBMITTED |
| REPORT_APPROVED |
| REPORT_ARCHIVED |

---

# 11. Eventos de Governança

| Evento |
|---|
| USER_CREATED |
| ROLE_UPDATED |
| PERMISSION_GRANTED |
| ACCESS_DENIED |
| AUDIT_EVENT_REGISTERED |

---

# 12. Fluxo Reativo

Módulos devem poder reagir a eventos.

---

## Exemplo

```text
ACTION_CREATED
    ↓
gera cronograma
    ↓
cria tarefas
    ↓
habilita reservas
    ↓
inicia indicadores
```

---

# 13. Benefícios Arquiteturais

O modelo de eventos permite:

- desacoplamento
- rastreabilidade
- observabilidade
- automações futuras
- workflows dinâmicos
- monitoramento institucional

---

# 14. Eventos e Observabilidade

Eventos devem alimentar:

- logs
- auditoria
- monitoramento
- histórico operacional
- análise institucional

---

# 15. Eventos e Inteligência

Eventos devem futuramente permitir:

- alertas automáticos
- análise de gargalos
- leitura operacional
- previsão de risco
- análise institucional contínua

---

# 16. Eventos e Governança

Eventos críticos devem possuir:

- rastreamento de usuário
- contexto operacional
- registro temporal
- histórico preservado

---

# 17. Eventos e Escalabilidade

O modelo deve permitir futuramente:

- integrações externas
- APIs
- automações
- IA
- workflows configuráveis
- múltiplos ambientes

---

# 18. Critérios de Qualidade

Um evento é considerado adequado quando:

- representa mudança relevante
- possui contexto claro
- é rastreável
- evita duplicidade
- fortalece integração

---

# 19. Riscos Arquiteturais

O sistema pode degenerar se:

- módulos dependerem diretamente entre si
- eventos forem ignorados
- eventos forem ambíguos
- múltiplos fluxos paralelos surgirem
- eventos não forem rastreados

---

# 20. Direção Futura

O sistema deverá evoluir para arquitetura progressivamente mais orientada a eventos.

Mesmo dentro das limitações do Google Apps Script, os fluxos devem preservar lógica reativa e integração desacoplada.

---