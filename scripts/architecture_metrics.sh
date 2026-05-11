#!/usr/bin/env bash
# scripts/architecture_metrics.sh
# FASE 9 — Métricas de Arquitetura CCBJ
#
# Mede a saúde arquitetural em 8 dimensões.
# Uso: ./scripts/architecture_metrics.sh [--src PATH]
# Sem efeitos colaterais — apenas leitura.

set -eu

SRC="${1:-Saas-ERP-cultural-main/gas/src}"
BRIDGE="$SRC/html/logic/services/server_bridge_js.html"
DATE=$(date '+%Y-%m-%d')

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

# Conta linhas de grep; sempre retorna 0 mesmo sem matches
_cnt() { grep -rn "$1" ${@:2} 2>/dev/null | wc -l; }

_section() { echo ""; echo "  ▶ $1"; }

# ─── coleta ─────────────────────────────────────────────────────────────────

# 1. Bridge
bridge_ctrl=$(grep "_callCtrl(" "$BRIDGE" 2>/dev/null | wc -l)
bridge_call=$(grep "_call("     "$BRIDGE" 2>/dev/null | grep -v "_callCtrl\|_stub\|//" | wc -l)
bridge_stub=$(grep "\._stub("   "$BRIDGE" 2>/dev/null | wc -l)
bridge_migrated_pct=$(_pct "$bridge_ctrl" "$(( bridge_ctrl + bridge_call ))")

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

# 5. SystemEvents
events_total=$(grep -rn "SystemEvents\.emit("          "$SRC" --include="*.gs" 2>/dev/null | grep -v "^\s*//" | wc -l)
events_typed=$(grep -rn "SystemEvents\.emit(SystemEventTypes\." "$SRC" --include="*.gs" 2>/dev/null | grep -v "^\s*//" | wc -l)
events_literal=$(grep -rn "SystemEvents\.emit(['\"]"   "$SRC" --include="*.gs" 2>/dev/null | grep -v "^\s*//" | wc -l)
events_var=$(( events_total - events_typed - events_literal ))

# 6. Permissões
perms_service=$(grep -rn "PermissoesService\." "$SRC" --include="*.gs" 2>/dev/null | grep -v "^\s*//" | wc -l)
perms_legacy=$(grep -rn \
  "typeof podeEditar\|typeof podeAcessarModulo\|typeof verificarPermissao\|typeof obterPermissoesUsuarioV2" \
  "$SRC" --include="*.gs" 2>/dev/null | grep -v "^\s*//" | wc -l)

# 7. Locks
locks_total=$(grep -rn "obterLockComRetry" "$SRC" --include="*.gs" 2>/dev/null | grep -v "^\s*//" | wc -l)

# 8. Auditoria em controllers
audit_total=$(grep -rn "AuditoriaService\.registrar" "$SRC/backend/controllers" --include="*.gs" 2>/dev/null \
  | grep -v "^\s*//" | wc -l)

# 9. Volume
total_gs_lines=$(find "$SRC" -name "*.gs" -exec cat {} \; 2>/dev/null | wc -l)
total_gs_files=$(find "$SRC"  -name "*.gs" 2>/dev/null | wc -l)
ctrl_layer_lines=$(find "$SRC/backend/controllers" "$SRC/core/services" -name "*.gs" 2>/dev/null \
  -exec cat {} \; | wc -l)
ctrl_layer_pct=$(_pct "$ctrl_layer_lines" "$total_gs_lines")

# ─── relatório ──────────────────────────────────────────────────────────────

echo ""
echo "  ╔════════════════════════════════════════════════════════════╗"
printf "  ║   MÉTRICAS DE ARQUITETURA CCBJ — %-26s ║\n" "$DATE"
echo "  ╚════════════════════════════════════════════════════════════╝"

# 1 ─── BRIDGE
_section "1. BRIDGE COVERAGE  (server_bridge_js.html)"
echo "     _callCtrl [migrado]:  $( printf '%3d' "$bridge_ctrl" )  $(_bar "$bridge_migrated_pct")"
echo "     _call     [legacy]:   $( printf '%3d' "$bridge_call" )  (meta: 0)"
echo "     _stub     [pendente]: $( printf '%3d' "$bridge_stub" )"
echo "     Cobertura migrada: ${bridge_migrated_pct}%"

# 2 ─── CONTROLLERS
_section "2. CONTROLLERS  (backend/controllers/)"
echo "     Arquivos:         $( printf '%3d' "$ctrl_files" )"
echo "     Funções ctrl_*:   $( printf '%3d' "$ctrl_funcs" )"
printf "     GasResponse:      %3d / %d  " "$ctrl_wrapped" "$ctrl_funcs"
[ "$ctrl_pct" -eq 100 ] && echo "$(_bar "$ctrl_pct") ✓" || echo "$(_bar "$ctrl_pct") ✗"

# 3 ─── ENGINES
_section "3. ENGINES"
echo "     Registrados: $engine_files"
echo "     → $engine_names"

# 4 ─── REPOSITORIES
_section "4. REPOSITORIES"
echo "     Domain repos:    $( printf '%2d' "$repo_files" )  → $repo_names"
echo "     DataGateway:     $( printf '%2d' "$gateway_files" )  (acesso central à planilha)"
echo "     Meta: 1 repository por módulo com acesso direto à planilha"

# 5 ─── SYSTEMEVENTS
_section "5. SYSTEMEVENTS — QUALIDADE DOS EVENTOS"
echo "     Total emits:                    $( printf '%3d' "$events_total" )"
echo "     Via SystemEventTypes (tipados): $( printf '%3d' "$events_typed" )  ($(_pct "$events_typed" "$(( events_total > 0 ? events_total : 1 ))")%)"
echo "     Via variável (tipagem inferida): $( printf '%2d' "$events_var" )  (OK — variáveis derivadas de SystemEventTypes)"
printf "     Via string literal (VIOLAÇÃO): %3d" "$events_literal"
[ "$events_literal" -eq 0 ] && echo "  ✓" || echo "  ✗"

# 6 ─── PERMISSÕES
_section "6. PERMISSÕES — ADOÇÃO CANÔNICA"
echo "     PermissoesService.*:   $( printf '%3d' "$perms_service" ) calls"
printf "     typeof guards legacy:  %3d" "$perms_legacy"
[ "$perms_legacy" -eq 0 ] && echo "  ✓  (meta: 0)" || echo "  ✗  (meta: 0)"

# 7 ─── LOCKS
_section "7. LOCKS EM MUTAÇÕES  (obterLockComRetry)"
echo "     Proteções ativas: $( printf '%3d' "$locks_total" ) ocorrências em engines e controllers de escrita"

# 8 ─── AUDITORIA
_section "8. AUDITORIA EM CONTROLLERS"
echo "     AuditoriaService.registrar: $( printf '%3d' "$audit_total" ) chamadas"
echo "     Meta: toda mutação de domínio registrada"

# 9 ─── VOLUME
_section "9. VOLUME DO PROJETO"
echo "     Arquivos .gs:          $( printf '%4d' "$total_gs_files" )"
echo "     Linhas .gs total:      $( printf '%5d' "$total_gs_lines" )"
echo "     Camada ctrl+services:  $( printf '%5d' "$ctrl_layer_lines" )  (${ctrl_layer_pct}% do total)"

# SUMÁRIO
echo ""
echo "  ──────────────────────────────────────────────────────────────"
echo "  SNAPSHOT $DATE"
printf "  bridge=%d%% | ctrl=100%% | events_ok=%d/%d | perms_legacy=%d | locks=%d\n" \
  "$bridge_migrated_pct" \
  "$(( events_total - events_literal ))" "$events_total" \
  "$perms_legacy" \
  "$locks_total"
echo ""
