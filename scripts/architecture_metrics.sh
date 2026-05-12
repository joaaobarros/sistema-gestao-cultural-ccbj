#!/usr/bin/env bash
# scripts/architecture_metrics.sh
# FASE 2 — Score de Cobertura Arquitetural CCBJ
#
# Mede a saúde arquitetural em 12 dimensões e gera relatório em docs/migration/.
# Uso: ./scripts/architecture_metrics.sh [PATH_SRC] [--report]
# --report : persiste relatório em docs/migration/architecture_score.md
# Sem efeitos colaterais na leitura — apenas escreve relatório se --report.

set -eu

SRC="${1:-Saas-ERP-cultural-main/gas/src}"
BRIDGE="$SRC/html/logic/services/server_bridge_js.html"
DATE=$(date '+%Y-%m-%d')
REPORT_FLAG="${2:-}"
REPORT_DIR="Saas-ERP-cultural-main/docs/migration"
REPORT_FILE="$REPORT_DIR/architecture_score.md"

# ─── helpers ────────────────────────────────────────────────────────────────

_pct() {
  local num="$1" den="$2"
  [ "$den" -eq 0 ] && echo 0 && return
  echo $(( num * 100 / den ))
}

_bar() {
  local pct="$1" width=24 filled empty bar='' i
  filled=$(( pct * width / 100 ))
  empty=$(( width - filled ))
  for ((i=0; i<filled; i++)); do bar="${bar}█"; done
  for ((i=0; i<empty; i++)); do bar="${bar}░"; done
  printf '%s %3d%%' "$bar" "$pct"
}

_cnt() { grep -rn "$1" ${@:2} 2>/dev/null | wc -l; }
_section() { echo ""; echo "  ▶ $1"; }

# ─── coleta ─────────────────────────────────────────────────────────────────

# 1. Bridge
bridge_ctrl=$(grep "_callCtrl(" "$BRIDGE" 2>/dev/null | wc -l)
bridge_call=$(grep "_call("     "$BRIDGE" 2>/dev/null | grep -v "_callCtrl\|_stub\|//" | wc -l)
bridge_stub=$(grep "\._stub("   "$BRIDGE" 2>/dev/null | wc -l)
bridge_total=$(( bridge_ctrl + bridge_call ))
bridge_migrated_pct=$(_pct "$bridge_ctrl" "$bridge_total")

# 2. Controllers
ctrl_files=$(find "$SRC/backend/controllers" -name "*.gs" 2>/dev/null | wc -l)
ctrl_funcs=$(grep -rn "^function ctrl_" "$SRC/backend/controllers" --include="*.gs" 2>/dev/null | wc -l)
ctrl_wrapped=$(grep -rn "GasResponse\.wrap" "$SRC/backend/controllers" --include="*.gs" 2>/dev/null | wc -l)
ctrl_pct=$(_pct "$ctrl_wrapped" "$ctrl_funcs")

# 3. Engines
engine_files=$(find "$SRC" -name "*_engine.gs" 2>/dev/null | wc -l)
engine_names=$(find "$SRC" -name "*_engine.gs" 2>/dev/null \
  | xargs -I{} basename {} .gs | sort | tr '\n' ',' | sed 's/,$//' | sed 's/,/, /g')

# 4. Repositories
repo_files=$(find "$SRC" -name "*_repository.gs" 2>/dev/null | wc -l)
repo_names=$(find "$SRC" -name "*_repository.gs" 2>/dev/null \
  | xargs -I{} basename {} .gs | sort | tr '\n' ',' | sed 's/,$//' | sed 's/,/, /g')
gateway_files=$(find "$SRC" -name "*data_gateway*" 2>/dev/null | wc -l)

# Módulos com domínio declarado (pasta modules/*)
modulo_dirs=$(find "$SRC/modules" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l)
modulo_com_repo=$(find "$SRC/modules" -name "*_repository.gs" 2>/dev/null \
  | xargs -I{} dirname {} | sort -u | wc -l)
modulo_repo_pct=$(_pct "$modulo_com_repo" "$modulo_dirs")

# 5. SystemEvents
events_total=$(grep -rn "SystemEvents\.emit("              "$SRC" --include="*.gs" 2>/dev/null | grep -v "^\s*//" | wc -l)
events_typed=$(grep -rn "SystemEvents\.emit(SystemEventTypes\." "$SRC" --include="*.gs" 2>/dev/null | grep -v "^\s*//" | wc -l)
events_literal=$(grep -rn "SystemEvents\.emit(['\"]"       "$SRC" --include="*.gs" 2>/dev/null | grep -v "^\s*//" | wc -l)
events_var=$(( events_total - events_typed - events_literal ))
events_typed_pct=$(_pct "$(( events_typed + events_var ))" "$(( events_total > 0 ? events_total : 1 ))")

# 6. Permissões
perms_service=$(grep -rn "PermissoesService\." "$SRC" --include="*.gs" 2>/dev/null | grep -v "^\s*//" | wc -l)
perms_legacy=$(grep -rn \
  "typeof podeEditar\|typeof podeAcessarModulo\|typeof verificarPermissao\|typeof obterPermissoesUsuarioV2" \
  "$SRC" --include="*.gs" 2>/dev/null | grep -v "^\s*//" | wc -l)

# 7. Locks
locks_total=$(grep -rn "obterLockComRetry" "$SRC" --include="*.gs" 2>/dev/null | grep -v "^\s*//" | wc -l)

# 8. Auditoria
audit_controllers=$(grep -rn "AuditoriaService\." "$SRC/backend/controllers" --include="*.gs" 2>/dev/null | grep -v "^\s*//" | wc -l)
audit_engines=$(grep -rn "AuditoriaService\." "$SRC" --include="*_engine.gs" 2>/dev/null | grep -v "^\s*//" | wc -l)
audit_total=$(( audit_controllers + audit_engines ))

# 9. FSM Guardian
fsm_engines=$(grep -rln "_TRANSICOES_\|aplicarTransicao" "$SRC" --include="*_engine.gs" 2>/dev/null | wc -l)
fsm_guardians=$(grep -rln "FsmGuardian" "$SRC" --include="*_engine.gs" 2>/dev/null | wc -l)
fsm_pct=$(_pct "$fsm_guardians" "$(( fsm_engines > 0 ? fsm_engines : 1 ))")

# 10. Legacy Logger
logger_log_core=$(grep -rn "Logger\.log(" "$SRC/core" "$SRC/backend/controllers" \
  --include="*.gs" 2>/dev/null \
  | grep -v "logger\.gs:" | grep -vP ":\s*//" | grep -vP ":\s+\*" | wc -l)
logger_log_total=$(grep -rn "Logger\.log(" "$SRC" --include="*.gs" 2>/dev/null | grep -v "^\s*//" | wc -l)

# 11. SpreadsheetApp legacy
spreadsheet_legacy=$(grep -rn "SpreadsheetApp\." "$SRC" --include="*.gs" \
  | grep -v "data_gateway\|_repository\|_gateway\|data_layer\|setup\.gs\|logger\.gs\|config\.gs\|utils\.gs" \
  | grep -v "backend/controllers\|_engine\." \
  | grep -v "^\s*//" | wc -l)

# 12. Volume
total_gs_lines=$(find "$SRC" -name "*.gs" -exec cat {} \; 2>/dev/null | wc -l)
total_gs_files=$(find "$SRC" -name "*.gs" 2>/dev/null | wc -l)
ctrl_layer_lines=$(find "$SRC/backend/controllers" "$SRC/core/services" -name "*.gs" 2>/dev/null \
  -exec cat {} \; | wc -l)
ctrl_layer_pct=$(_pct "$ctrl_layer_lines" "$total_gs_lines")

# ─── Score global (ponderado) ────────────────────────────────────────────────
# 5 indicadores binários ou percentuais → máx 100 pontos
s_bridge=$bridge_migrated_pct                      # 0-100 — migração do bridge
s_ctrl=$([ "$ctrl_pct" -eq 100 ] && echo 100 || echo 0)   # 100 ou 0
s_events=$events_typed_pct                          # 0-100 — tipagem dos eventos
s_fsm=$fsm_pct                                     # 0-100 — engines com guardian
s_audit=$([ "$audit_total" -gt 0 ] && echo 100 || echo 0) # tem auditoria?

score=$(( (s_bridge + s_ctrl + s_events + s_fsm + s_audit) / 5 ))

_score_label() {
  [ "$score" -ge 90 ] && echo "EXCELENTE" && return
  [ "$score" -ge 75 ] && echo "BOM" && return
  [ "$score" -ge 60 ] && echo "REGULAR" && return
  echo "CRÍTICO"
}

# ─── Saída ───────────────────────────────────────────────────────────────────

OUTPUT=$(cat <<METRICS_EOF

  ╔════════════════════════════════════════════════════════════╗
  ║   MÉTRICAS DE ARQUITETURA CCBJ — ${DATE}                 ║
  ╚════════════════════════════════════════════════════════════╝

  ▶ 1. BRIDGE COVERAGE  (server_bridge_js.html)
     _callCtrl [migrado]:  $( printf '%3d' "$bridge_ctrl" )  $(_bar "$bridge_migrated_pct")
     _call     [legacy]:   $( printf '%3d' "$bridge_call" )  (meta: 0)
     _stub     [pendente]: $( printf '%3d' "$bridge_stub" )

  ▶ 2. CONTROLLERS  (backend/controllers/)
     Arquivos:         $( printf '%3d' "$ctrl_files" )
     Funções ctrl_*:   $( printf '%3d' "$ctrl_funcs" )
     GasResponse:      $( printf '%3d' "$ctrl_wrapped" ) / $ctrl_funcs  $(_bar "$ctrl_pct")$( [ "$ctrl_pct" -eq 100 ] && echo " ✓" || echo " ✗")

  ▶ 3. ENGINES  ($engine_files registrados)
     → $engine_names

  ▶ 4. REPOSITORIES E MÓDULOS
     Repositórios:     $( printf '%2d' "$repo_files" )  → $repo_names
     DataGateway:      $( printf '%2d' "$gateway_files" )
     Módulos com repo: $modulo_com_repo / $modulo_dirs  $(_bar "$modulo_repo_pct")

  ▶ 5. FSM GUARDIAN  (Enforcement Centralizado)
     Engines com FSM:         $( printf '%2d' "$fsm_engines" )
     Registrados no Guardian: $( printf '%2d' "$fsm_guardians" )  $(_bar "$fsm_pct")

  ▶ 6. SYSTEMEVENTS — QUALIDADE
     Total emits:                     $( printf '%3d' "$events_total" )
     Via SystemEventTypes (tipados):  $( printf '%3d' "$events_typed" )
     Via variável (inferido):         $( printf '%3d' "$events_var" )
     Via string literal (VIOLAÇÃO):   $( printf '%3d' "$events_literal" )$( [ "$events_literal" -eq 0 ] && echo "  ✓" || echo "  ✗")
     Cobertura tipada:  $(_bar "$events_typed_pct")

  ▶ 7. PERMISSÕES
     PermissoesService.*:   $( printf '%3d' "$perms_service" ) calls
     typeof guards legacy:  $( printf '%3d' "$perms_legacy" )$( [ "$perms_legacy" -eq 0 ] && echo "  ✓" || echo "  ✗")

  ▶ 8. LOCKS  (obterLockComRetry)
     Proteções ativas: $( printf '%3d' "$locks_total" )

  ▶ 9. AUDITORIA
     AuditoriaService em controllers: $( printf '%3d' "$audit_controllers" )
     AuditoriaService em engines:     $( printf '%3d' "$audit_engines" )
     Total:                           $( printf '%3d' "$audit_total" )$( [ "$audit_total" -gt 0 ] && echo "  ✓" || echo "  ✗")

  ▶ 10. LOGGER LEGADO
     Logger.log() em core/controllers: $( printf '%3d' "$logger_log_core" )$( [ "$logger_log_core" -eq 0 ] && echo "  ✓" || echo "  ✗")
     Logger.log() total no projeto:    $( printf '%3d' "$logger_log_total" ) (meta: 0)

  ▶ 11. SPREADSHEETAPP LEGACY
     Acessos diretos fora do padrão: $( printf '%3d' "$spreadsheet_legacy" ) (meta: 0)

  ▶ 12. VOLUME
     Arquivos .gs:          $( printf '%4d' "$total_gs_files" )
     Linhas .gs total:      $( printf '%5d' "$total_gs_lines" )
     Camada ctrl+services:  $( printf '%5d' "$ctrl_layer_lines" )  (${ctrl_layer_pct}% do total)

  ──────────────────────────────────────────────────────────────
  SCORE GLOBAL: $score/100  [$(_score_label)]  (bridge+ctrl+events+fsm+audit / 5)
  ──────────────────────────────────────────────────────────────
  SNAPSHOT $DATE
  bridge=${bridge_migrated_pct}% | ctrl=${ctrl_pct}% | events_ok=${events_typed_pct}% | fsm=${fsm_pct}% | audit=${audit_total} | legacy_logger=${logger_log_total} | legacy_ss=${spreadsheet_legacy}

METRICS_EOF
)

echo "$OUTPUT"

# ─── Relatório em docs/migration/ ────────────────────────────────────────────

if [ "$REPORT_FLAG" = "--report" ]; then
  mkdir -p "$REPORT_DIR"
  cat > "$REPORT_FILE" <<REPORT_EOF
# Architecture Score — CCBJ
> Gerado automaticamente por \`scripts/architecture_metrics.sh --report\`
> Data: ${DATE}

## Score Global: ${score}/100  [${_score_label:-$(_score_label)}]

| Dimensão                | Valor              | Meta  |
|-------------------------|-------------------|-------|
| Bridge (migrado)        | ${bridge_migrated_pct}%            | 100%  |
| Controllers (wrapped)   | ${ctrl_pct}%           | 100%  |
| Eventos tipados         | ${events_typed_pct}%          | 100%  |
| FSM Guardian            | ${fsm_pct}%           | 100%  |
| Auditoria ativa         | $([ "$audit_total" -gt 0 ] && echo "Sim" || echo "Não")              | Sim   |
| Logger.log (core)       | ${logger_log_core}            | 0     |
| SpreadsheetApp (legacy) | ${spreadsheet_legacy}            | 0     |
| Locks ativos            | ${locks_total}           | ≥ 20  |

## Detalhes

### Bridge
- _callCtrl (migrado): **${bridge_ctrl}**
- _call (legacy):      **${bridge_call}** (meta: 0)
- _stub (pendente):    **${bridge_stub}**

### Módulos
- Módulos com repository: **${modulo_com_repo} / ${modulo_dirs}** (${modulo_repo_pct}%)

### SystemEvents
- Total emits: **${events_total}**
- Via SystemEventTypes: **${events_typed}**
- Via variável tipada: **${events_var}**
- Via literal (VIOLAÇÃO): **${events_literal}**

### FSM Guardian
- Engines com FSM: **${fsm_engines}**
- Registrados no Guardian: **${fsm_guardians}** (${fsm_pct}%)

### Volume
- Arquivos .gs: **${total_gs_files}**
- Linhas .gs: **${total_gs_lines}**
- Camada ctrl+services: **${ctrl_layer_lines}** (${ctrl_layer_pct}%)

---
*Próxima execução: \`./scripts/architecture_metrics.sh --report\`*
REPORT_EOF
  echo "  → Relatório salvo em: $REPORT_FILE"
fi
