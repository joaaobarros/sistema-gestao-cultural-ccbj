# Architecture Score — CCBJ
> Gerado automaticamente por `scripts/architecture_metrics.sh --report`
> Data: 2026-05-11

## Score Global: 99/100  [EXCELENTE]

| Dimensão                | Valor              | Meta  |
|-------------------------|-------------------|-------|
| Bridge (migrado)        | 99%            | 100%  |
| Controllers (wrapped)   | 100%           | 100%  |
| Eventos tipados         | 100%          | 100%  |
| FSM Guardian            | 100%           | 100%  |
| Auditoria ativa         | Sim              | Sim   |
| Logger.log (core)       | 0            | 0     |
| SpreadsheetApp (legacy) | 0            | 0     |
| Locks ativos            | 31           | ≥ 20  |

## Detalhes

### Bridge
- _callCtrl (migrado): **231**
- _call (legacy):      **1** (meta: 0)
- _stub (pendente):    **1**

### Módulos
- Módulos com repository: **5 / 12** (41%)

### SystemEvents
- Total emits: **27**
- Via SystemEventTypes: **16**
- Via variável tipada: **11**
- Via literal (VIOLAÇÃO): **0**

### FSM Guardian
- Engines com FSM: **5**
- Registrados no Guardian: **5** (100%)

### Volume
- Arquivos .gs: **69**
- Linhas .gs: **25380**
- Camada ctrl+services: **4142** (16%)

---
*Próxima execução: `./scripts/architecture_metrics.sh --report`*
