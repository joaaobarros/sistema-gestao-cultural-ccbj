/**
 * @file core/events_constants.gs
 * @layer core
 * @description Constantes de todos os tipos de eventos do sistema.
 *
 * Convenção: DOMÍNIO_VERBO_PASSADO (UPPER_SNAKE_CASE).
 * Todo evento emitido pelo SystemEvents deve usar uma dessas constantes.
 * Nenhum módulo deve inventar strings de evento ad-hoc.
 *
 * Referência: docs/01_architecture/event_model.md
 */

var SystemEventTypes = Object.freeze({

  // ────────────────────────────────────────────
  // ACTION ENGINE
  // ────────────────────────────────────────────
  ACTION_CREATED:         'ACTION_CREATED',
  ACTION_UPDATED:         'ACTION_UPDATED',
  ACTION_STATUS_CHANGED:  'ACTION_STATUS_CHANGED',
  ACTION_APPROVED:        'ACTION_APPROVED',
  ACTION_STARTED:         'ACTION_STARTED',
  ACTION_PAUSED:          'ACTION_PAUSED',
  ACTION_COMPLETED:       'ACTION_COMPLETED',
  ACTION_ARCHIVED:        'ACTION_ARCHIVED',
  ACTION_DELETED:         'ACTION_DELETED',

  // ────────────────────────────────────────────
  // RESERVAS
  // ────────────────────────────────────────────
  RESERVATION_CREATED:          'RESERVATION_CREATED',
  RESERVATION_UPDATED:          'RESERVATION_UPDATED',
  RESERVATION_APPROVED:         'RESERVATION_APPROVED',
  RESERVATION_REJECTED:         'RESERVATION_REJECTED',
  RESERVATION_CANCELLED:        'RESERVATION_CANCELLED',
  RESERVATION_CONFLICT_DETECTED:'RESERVATION_CONFLICT_DETECTED',

  // ────────────────────────────────────────────
  // TAREFAS
  // ────────────────────────────────────────────
  TASK_CREATED:    'TASK_CREATED',
  TASK_ASSIGNED:   'TASK_ASSIGNED',
  TASK_STARTED:    'TASK_STARTED',
  TASK_COMPLETED:  'TASK_COMPLETED',
  TASK_DELAYED:    'TASK_DELAYED',
  TASK_CANCELLED:  'TASK_CANCELLED',

  // ────────────────────────────────────────────
  // CONTRATOS
  // ────────────────────────────────────────────
  CONTRACT_CREATED:  'CONTRACT_CREATED',
  CONTRACT_UPDATED:  'CONTRACT_UPDATED',
  CONTRACT_EXPIRED:  'CONTRACT_EXPIRED',
  CONTRACT_ARCHIVED: 'CONTRACT_ARCHIVED',
  PAYMENT_REGISTERED:'PAYMENT_REGISTERED',

  // ────────────────────────────────────────────
  // CHAVES
  // ────────────────────────────────────────────
  KEY_PROTOCOL_CREATED:    'KEY_PROTOCOL_CREATED',
  KEY_PROTOCOL_RETRIEVED:  'KEY_PROTOCOL_RETRIEVED',
  KEY_PROTOCOL_RETURNED:   'KEY_PROTOCOL_RETURNED',
  KEY_PROTOCOL_TRANSFERRED:'KEY_PROTOCOL_TRANSFERRED',
  KEY_PROTOCOL_DELAYED:    'KEY_PROTOCOL_DELAYED',

  // ────────────────────────────────────────────
  // HABILITAÇÕES
  // ────────────────────────────────────────────
  QUALIFICATION_SUBMITTED:       'QUALIFICATION_SUBMITTED',
  QUALIFICATION_ANALYSIS_STARTED:'QUALIFICATION_ANALYSIS_STARTED',
  QUALIFICATION_APPROVED:        'QUALIFICATION_APPROVED',
  QUALIFICATION_REJECTED:        'QUALIFICATION_REJECTED',
  QUALIFICATION_SUSPENDED:       'QUALIFICATION_SUSPENDED',
  QUALIFICATION_REINSTATED:      'QUALIFICATION_REINSTATED',
  QUALIFICATION_CANCELLED:       'QUALIFICATION_CANCELLED',
  QUALIFICATION_UPDATED:         'QUALIFICATION_UPDATED',

  // ────────────────────────────────────────────
  // RELATÓRIOS
  // ────────────────────────────────────────────
  REPORT_CREATED:   'REPORT_CREATED',
  REPORT_SUBMITTED: 'REPORT_SUBMITTED',
  REPORT_APPROVED:  'REPORT_APPROVED',
  REPORT_ARCHIVED:  'REPORT_ARCHIVED',

  // ────────────────────────────────────────────
  // INDICADORES
  // ────────────────────────────────────────────
  INDICATOR_UPDATED:       'INDICATOR_UPDATED',
  KPI_THRESHOLD_REACHED:   'KPI_THRESHOLD_REACHED',
  ALERT_TRIGGERED:         'ALERT_TRIGGERED',
  OPERATIONAL_RISK_IDENTIFIED: 'OPERATIONAL_RISK_IDENTIFIED',

  // ────────────────────────────────────────────
  // GOVERNANÇA / USUÁRIOS
  // ────────────────────────────────────────────
  USER_CREATED:           'USER_CREATED',
  USER_UPDATED:           'USER_UPDATED',
  ROLE_UPDATED:           'ROLE_UPDATED',
  PERMISSION_GRANTED:     'PERMISSION_GRANTED',
  PERMISSION_REVOKED:     'PERMISSION_REVOKED',
  ACCESS_DENIED:          'ACCESS_DENIED',
  AUDIT_EVENT_REGISTERED: 'AUDIT_EVENT_REGISTERED',

  // ────────────────────────────────────────────
  // MÓDULOS DO SISTEMA
  // ────────────────────────────────────────────
  MODULE_ACTIVATED:   'MODULE_ACTIVATED',
  MODULE_DEACTIVATED: 'MODULE_DEACTIVATED',

  // ────────────────────────────────────────────
  // SISTEMA / INFRAESTRUTURA
  // ────────────────────────────────────────────
  SESSION_STARTED:      'SESSION_STARTED',
  AUTH_FAILED:          'AUTH_FAILED',
  SYSTEM_ERROR:         'SYSTEM_ERROR',
  INTEGRATION_FAILED:   'INTEGRATION_FAILED',
  SETUP_COMPLETED:      'SETUP_COMPLETED',

  // ────────────────────────────────────────────
  // GOVERNANÇA / FSM (FASE 4 — Enforcement de FSM)
  // ────────────────────────────────────────────
  FSM_INVALID_TRANSITION:    'FSM_INVALID_TRANSITION',
  FSM_BYPASS_DETECTED:       'FSM_BYPASS_DETECTED',
  FSM_STATE_UNKNOWN:         'FSM_STATE_UNKNOWN',

  // ────────────────────────────────────────────
  // OBSERVABILIDADE (FASE 3 — Observabilidade Operacional)
  // ────────────────────────────────────────────
  MUTATION_CRITICAL:          'MUTATION_CRITICAL',
  AUTH_FAILURE_TRACKED:       'AUTH_FAILURE_TRACKED',
  PERFORMANCE_DEGRADED:       'PERFORMANCE_DEGRADED',
  CONFLICT_ATTEMPT:           'CONFLICT_ATTEMPT',

  // ────────────────────────────────────────────
  // GOVERNANÇA ARQUITETURAL (FASE 1 — Lint Arquitetural)
  // ────────────────────────────────────────────
  GOVERNANCE_VIOLATION:       'GOVERNANCE_VIOLATION',
  ARCHITECTURAL_REGRESSION:   'ARCHITECTURAL_REGRESSION',

  // ────────────────────────────────────────────
  // COMUNICAÇÃO (FASE 2 — Controllers CTRL)
  // ────────────────────────────────────────────
  CALENDAR_INVITE_SENT:       'CALENDAR_INVITE_SENT',
  EMAIL_INVITE_SENT:          'EMAIL_INVITE_SENT',

  // ────────────────────────────────────────────
  // DOCUMENTOS (FASE 2 — Controllers CTRL)
  // ────────────────────────────────────────────
  DOCUMENT_GENERATED:         'DOCUMENT_GENERATED',

  // ────────────────────────────────────────────
  // PREFERÊNCIAS (FASE 2 — Controllers CTRL)
  // ────────────────────────────────────────────
  USER_PREFERENCE_SAVED:      'USER_PREFERENCE_SAVED',

  // ────────────────────────────────────────────
  // HABILITAÇÃO DIÁRIA (FASE 2 — Controllers CTRL)
  // ────────────────────────────────────────────
  QUALIFICATION_DAILY_REGISTERED: 'QUALIFICATION_DAILY_REGISTERED',

  // ────────────────────────────────────────────
  // PROCESSOS INSTITUCIONAIS — Camada transversal
  // ────────────────────────────────────────────
  PROCESSO_CRIADO:             'PROCESSO_CRIADO',
  PROCESSO_ATUALIZADO:         'PROCESSO_ATUALIZADO',
  PROCESSO_STATUS_CHANGED:     'PROCESSO_STATUS_CHANGED',
  PROCESSO_VINCULO_ADICIONADO: 'PROCESSO_VINCULO_ADICIONADO',
  PROCESSO_CONCLUIDO:          'PROCESSO_CONCLUIDO',
  PROCESSO_CANCELADO:          'PROCESSO_CANCELADO',
  PROCESSO_ALERTA_DETECTADO:   'PROCESSO_ALERTA_DETECTADO',

  // ────────────────────────────────────────────
  // TAREFAS — eventos complementares
  // ────────────────────────────────────────────
  TAREFA_CRIADA:              'TAREFA_CRIADA',
  TAREFA_STATUS_ALTERADO:     'TAREFA_STATUS_ALTERADO',
  TAREFA_DELEGADA:            'TAREFA_DELEGADA',
  TAREFA_REVISAO_SOLICITADA:  'TAREFA_REVISAO_SOLICITADA',
  TAREFA_REVISAO_RESPONDIDA:  'TAREFA_REVISAO_RESPONDIDA',
  TAREFA_VINCULADA_ACAO:      'TAREFA_VINCULADA_ACAO',
  TAREFA_VINCULADA_PROCESSO:  'TAREFA_VINCULADA_PROCESSO',

  // ────────────────────────────────────────────
  // NOTIFICAÇÕES TRANSVERSAIS
  // ────────────────────────────────────────────
  NOTIFICACAO_EMAIL_ENVIADA:   'NOTIFICACAO_EMAIL_ENVIADA',
  NOTIFICACAO_ALERTA_EMITIDO:  'NOTIFICACAO_ALERTA_EMITIDO',
  NOTIFICACAO_FALHA:           'NOTIFICACAO_FALHA',

  // ────────────────────────────────────────────
  // SOLICITAÇÕES INTERNAS
  // ────────────────────────────────────────────
  SOLICITACAO_CRIADA:          'SOLICITACAO_CRIADA',
  SOLICITACAO_STATUS_CHANGED:  'SOLICITACAO_STATUS_CHANGED',
  SOLICITACAO_APROVADA:        'SOLICITACAO_APROVADA',
  SOLICITACAO_DEVOLVIDA:       'SOLICITACAO_DEVOLVIDA',
  SOLICITACAO_CANCELADA:       'SOLICITACAO_CANCELADA',
  SOLICITACAO_CONCLUIDA:       'SOLICITACAO_CONCLUIDA',

  // ────────────────────────────────────────────
  // PAUTA EXTERNA (CESSÃO DE PAUTA)
  // ────────────────────────────────────────────
  PAUTA_RECEBIDA:              'PAUTA_RECEBIDA',
  PAUTA_STATUS_CHANGED:        'PAUTA_STATUS_CHANGED',
  PAUTA_APROVADA:              'PAUTA_APROVADA',
  PAUTA_INDEFERIDA:            'PAUTA_INDEFERIDA',
  PAUTA_AJUSTE_SOLICITADO:     'PAUTA_AJUSTE_SOLICITADO',
  PAUTA_CANCELADA:             'PAUTA_CANCELADA',
  PAUTA_CONCLUIDA:             'PAUTA_CONCLUIDA',

  // ────────────────────────────────────────────
  // CATÁLOGO INSTITUCIONAL
  // ────────────────────────────────────────────
  CATALOGO_ITEM_CRIADO:        'CATALOGO_ITEM_CRIADO',
  CATALOGO_ITEM_ATUALIZADO:    'CATALOGO_ITEM_ATUALIZADO',
  CATALOGO_ITEM_DESATIVADO:    'CATALOGO_ITEM_DESATIVADO'

});
