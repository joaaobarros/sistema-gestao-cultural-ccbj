#!/usr/bin/env bash
# scripts/governance_check.sh
# FASE 8 — Governança Arquitetural CCBJ
#
# Detecta violações arquiteturais no projeto.
# Uso: ./scripts/governance_check.sh [--src PATH]
# Exit 0 = sem violações bloqueantes; Exit 1 = violações encontradas.
#
# BLOQUEANTE  — violações em código que JÁ foi migrado; não devem existir.
# TENDÊNCIA   — dívida técnica em módulos legacy ainda não migrados (tracking).

set -euo pipefail

SRC="${1:-Saas-ERP-cultural-main/gas/src}"
BLOCKING=0
BRIDGE="$SRC/html/logic/services/server_bridge_js.html"

# ─── helpers ────────────────────────────────────────────────────────────────

_header() {
  echo ""
  echo "▶ $1"
}

_ok()  { echo "    ✓ nenhuma violação"; }

_emit_violations() {
  local label="$1"
  local result="$2"
  local mode="${3:-bloqueante}"  # bloqueante | tendencia

  if [ -z "$result" ]; then
    _ok
    return
  fi

  local count
  count=$(echo "$result" | grep -c .)
  echo "$result" | sed 's/^/    /'

  if [ "$mode" = "bloqueante" ]; then
    BLOCKING=$((BLOCKING + count))
    echo "    → $count violação(ões) BLOQUEANTE(S)"
  else
    echo "    → $count ocorrência(s) legacy [tendência]"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# CHECK 1 — SystemEvents.emit com string literal (não SystemEventTypes.*)
#
# Emitir eventos com strings ad-hoc quebra o contrato do event bus e impede
# rastreabilidade. Todo emit deve usar SystemEventTypes.<CONSTANTE>.
#
# EXCEÇÃO legítima: emit(variable, ...) onde variável é atribuída de
# SystemEventTypes — não há como checar isso estaticamente, mas é OK.
# Flagramos apenas literais de string imediatos: emit('...') ou emit("...").
# ─────────────────────────────────────────────────────────────────────────────
_header "CHECK 1 — SystemEvents.emit com string literal (não SystemEventTypes.*)"
result=$(grep -rn "SystemEvents\.emit(['\"]" "$SRC" --include="*.gs" \
  | grep -v "^\s*//" || true)
_emit_violations "emit_literal" "$result" "bloqueante"

# ─────────────────────────────────────────────────────────────────────────────
# CHECK 2 — typeof guards legados em funções de permissão
#
# Após a consolidação do PermissoesService (FASE 1), nenhum arquivo deve
# fazer typeof checks de podeEditar, podeAcessarModulo, verificarPermissao ou
# obterPermissoesUsuarioV2. Usar PermissoesService.pode() diretamente.
# ─────────────────────────────────────────────────────────────────────────────
_header "CHECK 2 — typeof guards legados de permissão"
result=$(grep -rn \
  "typeof podeEditar\|typeof podeAcessarModulo\|typeof verificarPermissao\|typeof obterPermissoesUsuarioV2" \
  "$SRC" --include="*.gs" | grep -v "^\s*//" || true)
_emit_violations "typeof_guards" "$result" "bloqueante"

# ─────────────────────────────────────────────────────────────────────────────
# CHECK 3 — funções ctrl_* declaradas fora de backend/controllers/
#
# Controllers são a única camada pública. Funções ctrl_* fora dessa pasta
# criam pontos de entrada paralelos não cobertos pelo contrato GasResponse.
# ─────────────────────────────────────────────────────────────────────────────
_header "CHECK 3 — ctrl_* declarados fora de backend/controllers/"
result=$(grep -rn "^function ctrl_" "$SRC" --include="*.gs" \
  | grep -v "backend/controllers" || true)
_emit_violations "ctrl_outside" "$result" "bloqueante"

# ─────────────────────────────────────────────────────────────────────────────
# CHECK 4 — SpreadsheetApp em controllers ou engines
#
# Controllers e Engines não podem tocar a planilha diretamente.
# Acesso a dados deve passar por DataGateway ou *Repository.
# ─────────────────────────────────────────────────────────────────────────────
_header "CHECK 4 — SpreadsheetApp em controllers ou engines"

controllers=$(find "$SRC/backend/controllers" -name "*.gs" 2>/dev/null || true)
engines=$(find "$SRC" -name "*_engine.gs" 2>/dev/null || true)

result=""
for f in $controllers $engines; do
  found=$(grep -n "SpreadsheetApp\." "$f" 2>/dev/null | grep -v "^\s*//" || true)
  [ -n "$found" ] && result="$result
$f: $found"
done
result=$(echo "$result" | grep . || true)
_emit_violations "spreadsheet_in_ctrl" "$result" "bloqueante"

# ─────────────────────────────────────────────────────────────────────────────
# CHECK 5 — Controllers sem GasResponse.wrap (contagem ctrl_* vs wrap)
#
# Toda função ctrl_* deve ser envolta em GasResponse.wrap para garantir
# o contrato { ok, data, error, metadata } ao frontend.
# ─────────────────────────────────────────────────────────────────────────────
_header "CHECK 5 — Controllers com ctrl_* sem GasResponse.wrap"
mismatch=""
for f in "$SRC"/backend/controllers/*.gs; do
  n_ctrl=$(grep -c "^function ctrl_" "$f" 2>/dev/null || echo 0)
  n_wrap=$(grep -c "GasResponse\.wrap" "$f" 2>/dev/null || echo 0)
  [ "$n_ctrl" -gt "$n_wrap" ] && \
    mismatch="$mismatch
    $(basename "$f"): $n_ctrl ctrl_* / $n_wrap GasResponse.wrap (delta: $((n_ctrl - n_wrap)))"
done
mismatch=$(echo "$mismatch" | grep . || true)
if [ -n "$mismatch" ]; then
  echo "$mismatch"
  delta_count=$(echo "$mismatch" | grep -c .)
  BLOCKING=$((BLOCKING + delta_count))
  echo "    → $delta_count arquivo(s) com desbalanceamento BLOQUEANTE"
else
  _ok
fi

# ─────────────────────────────────────────────────────────────────────────────
# TENDÊNCIA 1 — GAS._call() no bridge (namespaces legacy não migrados)
#
# Cada _call() no bridge é um domínio ainda sem controller.
# Meta: zero _call() ao final da migração completa.
# ─────────────────────────────────────────────────────────────────────────────
_header "TENDÊNCIA 1 — GAS._call() no bridge (legacy, não migrado)"
if [ -f "$BRIDGE" ]; then
  t1_count=$(grep -c "GAS\._call(" "$BRIDGE" | grep -v "_callCtrl\|_stub" || true)
  t1_count=$(grep "GAS\._call(" "$BRIDGE" | grep -v "_callCtrl\|_stub\|//" | grep -c . || true)
  echo "    → $t1_count chamadas _call() ainda sem controller (meta: 0)"
  if [ "$t1_count" -gt 0 ]; then
    # Mostra namespaces afetados
    grep "GAS\._call(" "$BRIDGE" | grep -v "_callCtrl\|_stub\|//" \
      | grep -oP "GAS\._call\('\K[^']+" \
      | sort | uniq -c | sort -rn \
      | sed 's/^/    /' || true
  fi
else
  echo "    (bridge não encontrada em $BRIDGE)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# TENDÊNCIA 2 — SpreadsheetApp fora de Gateway/Repository (módulos legacy)
#
# Contabiliza acessos diretos à planilha em módulos ainda não migrados
# para o padrão Repository. Meta: mover para *Repository ou DataGateway.
# ─────────────────────────────────────────────────────────────────────────────
_header "TENDÊNCIA 2 — SpreadsheetApp fora de Gateway/Repository (legacy)"
t2_count=$(grep -rn "SpreadsheetApp\." "$SRC" --include="*.gs" \
  | grep -v "data_gateway\|_repository\|_gateway\|data_layer\|setup\.gs\|logger\.gs\|config\.gs" \
  | grep -v "backend/controllers\|_engine\." \
  | grep -v "^\s*//" \
  | grep -c . || true)
echo "    → $t2_count acessos diretos SpreadsheetApp em módulos legacy (meta: 0)"

# ─────────────────────────────────────────────────────────────────────────────
# SUMÁRIO
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
if [ "$BLOCKING" -eq 0 ]; then
  echo "  ✓ APROVADO — zero violações bloqueantes."
else
  echo "  ✗ REPROVADO — $BLOCKING violação(ões) bloqueante(s) encontrada(s)."
fi
echo "═══════════════════════════════════════════════════════════════"

exit $( [ "$BLOCKING" -eq 0 ] && echo 0 || echo 1 )
