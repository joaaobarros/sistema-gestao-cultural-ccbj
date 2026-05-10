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
  SETUP_COMPLETED:      'SETUP_COMPLETED'

});
