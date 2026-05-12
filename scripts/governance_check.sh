#!/usr/bin/env bash
# scripts/governance_check.sh
# FASE 1 — Lint Arquitetural CCBJ (Governança Contínua)
#
# Detecta violações arquiteturais no projeto.
# Uso: ./scripts/governance_check.sh [PATH_SRC]
# Exit 0 = sem violações bloqueantes; Exit 1 = violações encontradas.
#
# BLOQUEANTE  — violações em camadas já migradas; NUNCA devem existir.
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
  local mode="${3:-bloqueante}"

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
# ─────────────────────────────────────────────────────────────────────────────
_header "CHECK 1 — SystemEvents.emit com string literal (não SystemEventTypes.*)"
result=$(grep -rn "SystemEvents\.emit(['\"]" "$SRC" --include="*.gs" \
  | grep -v "^\s*//" || true)
_emit_violations "emit_literal" "$result" "bloqueante"

# ─────────────────────────────────────────────────────────────────────────────
# CHECK 2 — typeof guards legados em funções de permissão
#
# Após a consolidação do PermissoesService, nenhum arquivo deve fazer
# typeof checks de funções de permissão. Usar PermissoesService.pode().
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
# CHECK 6 — Logger.log() legado em camadas migradas (core/ e controllers/)
#
# Logger.log é o método nativo do GAS (deprecated). Todos os arquivos
# nas camadas core/ e backend/controllers/ devem usar Logger.info/warn/error.
# Exclui linhas de comentário (// e * JSDoc).
# ─────────────────────────────────────────────────────────────────────────────
_header "CHECK 6 — Logger.log() legado em core/ e controllers/"
# Exclui o próprio logger.gs (implementação do Logger) e linhas de comentário.
result=$(grep -rn "Logger\.log(" "$SRC/core" "$SRC/backend/controllers" \
  --include="*.gs" 2>/dev/null \
  | grep -v "logger\.gs:" \
  | grep -v "[[:space:]]\*/\? " \
  | grep -vP ":\s*//" \
  | grep -vP ":\s+\*" || true)
_emit_violations "logger_log_core" "$result" "bloqueante"

# ─────────────────────────────────────────────────────────────────────────────
# CHECK 7 — *_service.gs fora de core/services/
#
# Services são infraestrutura central. Nenhum arquivo *_service.gs deve
# existir fora de core/services/ — evita services paralelos espalhados.
# ─────────────────────────────────────────────────────────────────────────────
_header "CHECK 7 — *_service.gs fora de core/services/"
result=$(find "$SRC" -name "*_service.gs" 2>/dev/null \
  | grep -v "core/services" || true)
_emit_violations "service_outside_core" "$result" "bloqueante"

# ─────────────────────────────────────────────────────────────────────────────
# CHECK 8 — getRange/appendRow/setValues em controllers
#
# Controllers NÃO podem escrever ou ler células diretamente. Devem delegar
# para *Repository ou DataGateway. Indica bypass do padrão de dados.
# ─────────────────────────────────────────────────────────────────────────────
_header "CHECK 8 — getRange/appendRow/setValues em controllers"
result=$(grep -rn "\.getRange(\|\.appendRow(\|\.setValues(" \
  "$SRC/backend/controllers" --include="*.gs" 2>/dev/null \
  | grep -v "^\s*//" || true)
_emit_violations "direct_sheet_in_ctrl" "$result" "bloqueante"

# ─────────────────────────────────────────────────────────────────────────────
# CHECK 9 — appendRow/setValues em engines que JÁ têm repository próprio
#
# Se um engine tem um *_repository.gs no mesmo diretório, toda persistência
# DEVE passar pelo repository — escrita direta no engine é bypass BLOQUEANTE.
# Engines sem repository ainda (ex: action_engine) são tracking (TENDÊNCIA 5).
# Exclui core/services/*_engine.gs (infraestrutura de leitura, não domínio).
# ─────────────────────────────────────────────────────────────────────────────
_header "CHECK 9 — appendRow/setValues em engines com repository existente"
result=""
trend_engine_writes=""
for f in $(find "$SRC" -name "*_engine.gs" 2>/dev/null | grep -v "core/services"); do
  dir=$(dirname "$f")
  has_repo=$(find "$dir" -name "*_repository.gs" 2>/dev/null | wc -l)
  found=$(grep -n "\.appendRow(\|\.setValues(" "$f" 2>/dev/null \
    | grep -v "^\s*//" || true)
  if [ -n "$found" ]; then
    if [ "$has_repo" -gt 0 ]; then
      result="$result
$(basename "$f") [tem repository]: $found"
    else
      trend_engine_writes="$trend_engine_writes
$(basename "$f") [sem repository, tendência]: $found"
    fi
  fi
done
result=$(echo "$result" | grep . || true)
_emit_violations "engine_bypass_repository" "$result" "bloqueante"

# ─────────────────────────────────────────────────────────────────────────────
# CHECK 10 — Acesso direto frontend → backend sem passar por controller
#
# O bridge só pode chamar funções via _callCtrl (controllers) ou _stub.
# Chamadas _call() para funções que já têm controller equivalente são bypass.
# Detectamos: _call() cujo nome começa com padrões que indicam módulos migrados.
# ─────────────────────────────────────────────────────────────────────────────
_header "CHECK 10 — Bridge com _call() para domínios que já têm controller"
if [ -f "$BRIDGE" ]; then
  # Domínios migrados: reservas, chaves, admin, permissoes, escuta, habilitacoes,
  # contratos, acoes, financeiro, equipes, ia, modulos, tarefas, rh, comunicacao
  migrated_pattern="(criarReserva|aprovarSolicitacao|cancelarReserva|atualizarReserva|\
chaves_|ctrl_|obterPermissoes|listarPermissoes|salvarPermissoes|\
obterDadosEscuta|registrarResposta|obterAlertas|\
perguntarIA|gerarRelatorioIA|sugerirReservaIA)"
  result=$(grep "_call(" "$BRIDGE" 2>/dev/null \
    | grep -v "_callCtrl\|_stub\|//" \
    | grep -E "$migrated_pattern" || true)
  _emit_violations "bridge_bypass" "$result" "bloqueante"
else
  echo "    (bridge não encontrada em $BRIDGE)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# CHECK 11 — SpreadsheetApp em core/ (camada de serviços centrais)
#
# A camada core/ (auth, logger, services/) não deve tocar a planilha diretamente.
# Toda persistência de core deve passar por módulos específicos ou DataGateway.
# utils.gs é excluído por ser utilitário de _getSheet (helper de acesso, não lógica).
# ─────────────────────────────────────────────────────────────────────────────
_header "CHECK 11 — SpreadsheetApp em core/ (camada de serviços centrais)"
# utils.gs: helper _getSheet (acesso permitido por design)
# setup.gs: script de inicialização de planilhas (acesso permitido por design)
result=""
for f in $(find "$SRC/core" -name "*.gs" 2>/dev/null \
           | grep -v "utils\.gs" | grep -v "setup\.gs"); do
  found=$(grep -n "SpreadsheetApp\." "$f" 2>/dev/null | grep -v "^\s*//" || true)
  [ -n "$found" ] && result="$result
$(basename "$f"): $found"
done
result=$(echo "$result" | grep . || true)
_emit_violations "spreadsheet_in_core" "$result" "bloqueante"

# ─────────────────────────────────────────────────────────────────────────────
# TENDÊNCIA 1 — GAS._call() no bridge (namespaces legacy não migrados)
# ─────────────────────────────────────────────────────────────────────────────
_header "TENDÊNCIA 1 — GAS._call() no bridge (legacy, não migrado)"
if [ -f "$BRIDGE" ]; then
  t1_count=$(grep "_call(" "$BRIDGE" | grep -v "_callCtrl\|_stub\|//" | grep -c . || true)
  echo "    → $t1_count chamadas _call() ainda sem controller (meta: 0)"
  if [ "$t1_count" -gt 0 ]; then
    grep "_call(" "$BRIDGE" | grep -v "_callCtrl\|_stub\|//" \
      | grep -oP "GAS\._call\('\K[^']+" \
      | sort | uniq -c | sort -rn \
      | sed 's/^/    /' || true
  fi
else
  echo "    (bridge não encontrada em $BRIDGE)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# TENDÊNCIA 2 — SpreadsheetApp fora de Gateway/Repository (módulos legacy)
# ─────────────────────────────────────────────────────────────────────────────
_header "TENDÊNCIA 2 — SpreadsheetApp fora de Gateway/Repository (legacy)"
t2_count=$(grep -rn "SpreadsheetApp\." "$SRC" --include="*.gs" \
  | grep -v "data_gateway\|_repository\|_gateway\|data_layer\|setup\.gs\|logger\.gs\|config\.gs\|utils\.gs" \
  | grep -v "backend/controllers\|_engine\." \
  | grep -v "^\s*//" \
  | grep -c . || true)
echo "    → $t2_count acessos diretos SpreadsheetApp em módulos legacy (meta: 0)"

# ─────────────────────────────────────────────────────────────────────────────
# TENDÊNCIA 3 — Logger.log() em módulos não migrados
# ─────────────────────────────────────────────────────────────────────────────
_header "TENDÊNCIA 3 — Logger.log() em módulos não migrados"
t3_count=$(grep -rn "Logger\.log(" "$SRC" --include="*.gs" \
  | grep -v "^\s*//" \
  | grep -v "core/\|backend/controllers/" \
  | grep -c . || true)
echo "    → $t3_count ocorrências de Logger.log() em módulos não-core/não-controller (meta: 0)"

# ─────────────────────────────────────────────────────────────────────────────
# TENDÊNCIA 4 — FsmGuardian.validar() não usado em engines com FSM
#
# Engines com FSM deveriam chamar FsmGuardian.validar() para enforcement
# centralizado. Meta: 100% dos engines com FSM usam FsmGuardian.
# ─────────────────────────────────────────────────────────────────────────────
_header "TENDÊNCIA 4 — Engines com FSM que não usam FsmGuardian.validar()"
fsm_engines=$(grep -rln "_TRANSICOES_\|aplicarTransicao" "$SRC" --include="*_engine.gs" 2>/dev/null || true)
t4_count=0
for f in $fsm_engines; do
  if ! grep -q "FsmGuardian" "$f" 2>/dev/null; then
    echo "    → $(basename "$f"): tem FSM mas não usa FsmGuardian"
    t4_count=$((t4_count + 1))
  fi
done
[ "$t4_count" -eq 0 ] && echo "    ✓ todos os engines com FSM usam FsmGuardian" || \
  echo "    → $t4_count engine(s) sem FsmGuardian (meta: 0)"

# ─────────────────────────────────────────────────────────────────────────────
# TENDÊNCIA 5 — getRange/appendRow/setValues em módulos com *_repository.gs
#
# Quando um módulo tem um repositório dedicado, toda I/O de planilha DEVE
# passar pelo repositório. Acessos diretos em módulos "irmãos" do repository
# indicam bypass não concluído — meta: 0.
# (Exclui os próprios *_repository.gs e *_engine.gs — esses são permitidos.)
# ─────────────────────────────────────────────────────────────────────────────
_header "TENDÊNCIA 5 — getRange/appendRow/setValues em módulos com repository"
t5_total=0
for repo_file in $(find "$SRC" -name "*_repository.gs" 2>/dev/null); do
  dir=$(dirname "$repo_file")
  for f in $(find "$dir" -name "*.gs" 2>/dev/null \
             | grep -v "_repository\.gs" \
             | grep -v "_engine\.gs"); do
    count=$(grep -c "\.getRange(\|\.appendRow(\|\.setValues(" "$f" 2>/dev/null \
      | grep -v "^\s*//" || echo 0)
    if [ "$count" -gt 0 ] 2>/dev/null; then
      echo "    $(basename "$f") [$(basename "$dir")]: $count ocorrência(s)"
      t5_total=$((t5_total + count))
    fi
  done
done
[ "$t5_total" -eq 0 ] \
  && echo "    ✓ nenhum módulo com repository faz acesso procedural direto" \
  || echo "    → $t5_total ocorrência(s) procedurais em módulos com repository (meta: 0)"

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
