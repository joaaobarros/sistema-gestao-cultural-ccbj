#!/usr/bin/env bash
# scripts/regression_tests.sh
# FASE 10 — Testes de Regressão CCBJ
#
# Valida os invariantes estabelecidos em cada fase de consolidação.
# Um teste que falha indica regressão arquitetural.
# Uso: ./scripts/regression_tests.sh
# Exit 0 = todos passaram; Exit 1 = falha(s).

set -eu

SRC="Saas-ERP-cultural-main/gas/src"
BRIDGE="$SRC/html/logic/services/server_bridge_js.html"
GOV="scripts/governance_check.sh"
PASS=0
FAIL=0
FAIL_LIST=""

# ─── framework de assertions ────────────────────────────────────────────────

_ok()  { echo "    ✓ $1"; PASS=$((PASS+1)); }
_err() { echo "    ✗ $1"; FAIL=$((FAIL+1)); FAIL_LIST="${FAIL_LIST}\n    ✗ $1"; }
_sec() { echo ""; echo "  [$1]"; }

# Arquivo existe
_file() {
  local file="$1" desc="$2"
  [ -f "$file" ] && _ok "$desc" || _err "$desc  (arquivo não encontrado: $file)"
}

# Arquivo contém padrão (grep -E)
_has() {
  local pat="$1" file="$2" desc="$3"
  grep -qE "$pat" "$file" 2>/dev/null && _ok "$desc" || _err "$desc  (padrão ausente: $pat)"
}

# Busca recursiva em .gs: deve conter padrão
_has_gs() {
  local pat="$1" path="$2" desc="$3"
  grep -rqE "$pat" "$path" --include="*.gs" 2>/dev/null && _ok "$desc" || _err "$desc  (padrão ausente: $pat)"
}

# Busca recursiva em .gs: NÃO deve conter padrão (exclui comentários)
_not_gs() {
  local pat="$1" path="$2" desc="$3"
  local n
  n=$(grep -rnE "$pat" "$path" --include="*.gs" 2>/dev/null | grep -v "^\s*//" | wc -l)
  [ "$n" -eq 0 ] && _ok "$desc" || _err "$desc  ($n ocorrência(s) encontrada(s))"
}

# Bridge usa _callCtrl para ctrl especificado
_bridge_ctrl() {
  local ctrl="$1" desc="$2"
  grep -qE "_callCtrl\('${ctrl}'" "$BRIDGE" 2>/dev/null && _ok "$desc" \
    || _err "$desc  (_callCtrl('$ctrl') ausente no bridge)"
}

# Bridge NÃO usa _call para padrão legado
_bridge_no_call() {
  local pat="$1" desc="$2"
  grep -E "_call\($pat" "$BRIDGE" 2>/dev/null | grep -v "_callCtrl\|_stub\|//" | grep -q . \
    && _err "$desc  (padrão legado ainda presente: $pat)" \
    || _ok "$desc"
}

# Contagem mínima de linhas com padrão em arquivo
_count_ge() {
  local pat="$1" file="$2" min="$3" desc="$4"
  local n
  n=$(grep -c "$pat" "$file" 2>/dev/null || echo 0)
  [ "$n" -ge "$min" ] && _ok "$desc  ($n encontrado)" || _err "$desc  (encontrado $n, mínimo $min)"
}

# ═══════════════════════════════════════════════════════════════════════════
# FASE 1 — Permissões como núcleo único
# ═══════════════════════════════════════════════════════════════════════════
_sec "FASE 1 — Permissões"

_file  "$SRC/core/services/permissoes_service.gs"                           "PermissoesService existe"
_has   "pode:"           "$SRC/core/services/permissoes_service.gs"          "PermissoesService.pode exportado"
_has   "isAdmin:"        "$SRC/core/services/permissoes_service.gs"          "PermissoesService.isAdmin exportado"
_has   "isSuperAdmin:"   "$SRC/core/services/permissoes_service.gs"          "PermissoesService.isSuperAdmin exportado"
_has   "obterPerfil:"    "$SRC/core/services/permissoes_service.gs"          "PermissoesService.obterPerfil exportado"

_file  "$SRC/backend/controllers/permissoes_controller.gs"                  "permissoes_controller.gs existe"
_bridge_ctrl "ctrl_permissoes_listar"   "Bridge: GAS.permissoes.listar → ctrl"
_bridge_ctrl "ctrl_permissoes_obter"    "Bridge: GAS.permissoes.obter → ctrl"
_bridge_ctrl "ctrl_permissoes_salvar"   "Bridge: GAS.permissoes.salvar → ctrl"

_has   "GAS\.permissoesV2" "$SRC/html/logic/mod_permissoes_v2_js.html"      "GAS.permissoesV2 shim existe"
_has   "GAS\.permissoes\." "$SRC/html/logic/mod_permissoes_v2_js.html"      "GAS.permissoesV2 delega para GAS.permissoes"

_not_gs "typeof podeEditar\|typeof podeAcessarModulo\|typeof verificarPermissao\|typeof obterPermissoesUsuarioV2" \
        "$SRC" "Sem typeof guards legados de permissão em .gs"

# ═══════════════════════════════════════════════════════════════════════════
# FASE 2 — Habilitações como domínio real
# ═══════════════════════════════════════════════════════════════════════════
_sec "FASE 2 — Habilitações"

_file  "$SRC/modules/programacao/habilitacoes_engine.gs"                    "HabilitacoesEngine existe"
_has   "Object\.freeze"   "$SRC/modules/programacao/habilitacoes_engine.gs" "STATUS_HABILITACAO é Object.freeze"
_has   "aplicarTransicao" "$SRC/modules/programacao/habilitacoes_engine.gs" "HabilitacoesEngine.aplicarTransicao"
_has   "submeter:"        "$SRC/modules/programacao/habilitacoes_engine.gs" "HabilitacoesEngine.submeter exportado"

_file  "$SRC/modules/programacao/habilitacoes_repository.gs"                "HabilitacoesRepository existe"
_has   "criar:"           "$SRC/modules/programacao/habilitacoes_repository.gs" "HabilitacoesRepository.criar exportado"
_has   "atualizar:"       "$SRC/modules/programacao/habilitacoes_repository.gs" "HabilitacoesRepository.atualizar exportado"

_file  "$SRC/backend/controllers/habilitacoes_controller.gs"                "habilitacoes_controller.gs existe"
_bridge_ctrl "ctrl_hab_listar"    "Bridge: GAS.habilitacoes.listar → ctrl"
_bridge_ctrl "ctrl_hab_criar"     "Bridge: GAS.habilitacoes.criar → ctrl"
_bridge_ctrl "ctrl_hab_transicao" "Bridge: GAS.habilitacoes.mudarStatus → ctrl"

# ═══════════════════════════════════════════════════════════════════════════
# FASE 3 — ActionEngine como infraestrutura operacional
# ═══════════════════════════════════════════════════════════════════════════
_sec "FASE 3 — Acoes"

_file  "$SRC/action_engine/action_engine.gs"                                "action_engine.gs existe"
_has   "obterLockComRetry" "$SRC/action_engine/action_engine.gs"            "criarAcao usa obterLockComRetry"
_has   "AuditoriaService"  "$SRC/action_engine/action_engine.gs"            "criarAcao registra auditoria"

_file  "$SRC/backend/controllers/acoes_controller.gs"                       "acoes_controller.gs existe"
_count_ge "^function ctrl_acoes_" "$SRC/backend/controllers/acoes_controller.gs" 7 "Mínimo 7 ctrl_acoes_*"

_bridge_ctrl "ctrl_acoes_listar"    "Bridge: GAS.acoes.listar → ctrl"
_bridge_ctrl "ctrl_acoes_criar"     "Bridge: GAS.acoes.criar → ctrl"
_bridge_ctrl "ctrl_acoes_mudar_status" "Bridge: GAS.acoes.mudarStatus → ctrl"

# ═══════════════════════════════════════════════════════════════════════════
# FASE 4 — Contratos como domínio estruturado
# ═══════════════════════════════════════════════════════════════════════════
_sec "FASE 4 — Contratos"

_file  "$SRC/modules/contratos/contratos_engine.gs"                         "ContratosEngine existe"
_has   "Object\.freeze"    "$SRC/modules/contratos/contratos_engine.gs"     "STATUS_CONTRATO é Object.freeze"
_has   "aplicarTransicao:" "$SRC/modules/contratos/contratos_engine.gs"     "ContratosEngine.aplicarTransicao exportado"

_file  "$SRC/backend/controllers/contratos_controller.gs"                   "contratos_controller.gs existe"
_has   "ctrl_contratos_status" "$SRC/backend/controllers/contratos_controller.gs" "ctrl_contratos_status existe"

_bridge_ctrl "ctrl_contratos_listar"  "Bridge: GAS.contratos.obter → ctrl"
_bridge_ctrl "ctrl_contratos_status"  "Bridge: GAS.contratos.mudarStatus → ctrl"
_bridge_ctrl "ctrl_contratos_salvar"  "Bridge: GAS.contratos.salvar → ctrl"

# ═══════════════════════════════════════════════════════════════════════════
# FASE 5 — Financeiro desacoplado
# ═══════════════════════════════════════════════════════════════════════════
_sec "FASE 5 — Financeiro"

_file  "$SRC/backend/controllers/financeiro_controller.gs"                  "financeiro_controller.gs existe"
_count_ge "^function ctrl_fin_" "$SRC/backend/controllers/financeiro_controller.gs" 6 "Mínimo 6 ctrl_fin_*"

_bridge_ctrl "ctrl_fin_listar_contratacoes"   "Bridge: GAS.contratacoes.listar → ctrl"
_bridge_ctrl "ctrl_fin_registrar_pagamento"   "Bridge: GAS.contratacoes.registrarPagamento → ctrl"
_bridge_ctrl "ctrl_fin_fluxo_caixa"           "Bridge: GAS.contratacoes.fluxoCaixa → ctrl"

# ═══════════════════════════════════════════════════════════════════════════
# FASE 6 — Escuta Institucional estruturada
# ═══════════════════════════════════════════════════════════════════════════
_sec "FASE 6 — Escuta"

_file  "$SRC/backend/controllers/escuta_controller.gs"                      "escuta_controller.gs existe"
_count_ge "^function ctrl_escuta_" "$SRC/backend/controllers/escuta_controller.gs" 28 "Mínimo 28 ctrl_escuta_*"

_bridge_ctrl "ctrl_escuta_dados"              "Bridge: GAS.escuta.obterDados → ctrl"
_bridge_ctrl "ctrl_escuta_responder_pulse"    "Bridge: GAS.escuta.responderPulse → ctrl"
_bridge_ctrl "ctrl_escuta_gerar_relatorio"    "Bridge: GAS.escuta.gerarRelatorio → ctrl"

# Funções antigas não devem mais aparecer como _call no bridge
_bridge_no_call "'obterDadosEscuta'"          "Bridge: obterDadosEscuta não usa _call legado"
_bridge_no_call "'registrarRespostaPulse'"    "Bridge: registrarRespostaPulse não usa _call legado"
_bridge_no_call "'obterAlertasEscuta'"        "Bridge: obterAlertasEscuta não usa _call legado"

# ═══════════════════════════════════════════════════════════════════════════
# FASE 7 — IA modularizada
# ═══════════════════════════════════════════════════════════════════════════
_sec "FASE 7 — IA"

_file  "$SRC/backend/controllers/ia_controller.gs"                          "ia_controller.gs existe"
_count_ge "^function ctrl_ia_" "$SRC/backend/controllers/ia_controller.gs"  4 "Mínimo 4 ctrl_ia_*"

_bridge_ctrl "ctrl_ia_perguntar"          "Bridge: GAS.admin.perguntarIA → ctrl_ia_perguntar"
_bridge_ctrl "ctrl_ia_gerar_relatorio"    "Bridge: GAS.admin.gerarRelatorioIA → ctrl_ia_gerar_relatorio"
_bridge_ctrl "ctrl_ia_analisar_dashboard" "Bridge: GAS.admin.analisarDashboardIA → ctrl_ia_analisar_dashboard"
_bridge_ctrl "ctrl_ia_sugerir_reserva"    "Bridge: GAS.admin.sugerirReservaIA → ctrl_ia_sugerir_reserva"

# Funções raw não devem mais aparecer como _call no bridge
_bridge_no_call "'perguntarIA'"            "Bridge: perguntarIA não usa _call legado"
_bridge_no_call "'gerarRelatorioIA'"       "Bridge: gerarRelatorioIA não usa _call legado"
_bridge_no_call "'sugerirReservaIAComDados'" "Bridge: sugerirReservaIAComDados não usa _call legado"

# ═══════════════════════════════════════════════════════════════════════════
# FASE 8 — Governança: script de detecção deve passar
# ═══════════════════════════════════════════════════════════════════════════
_sec "FASE 8 — Governança"

if [ -f "$GOV" ]; then
  if bash "$GOV" > /dev/null 2>&1; then
    _ok "governance_check.sh passa com exit 0"
  else
    _err "governance_check.sh falhou (run: bash $GOV)"
  fi
else
  _err "governance_check.sh não encontrado em $GOV"
fi

# ═══════════════════════════════════════════════════════════════════════════
# FASE 9 — GOVERNANÇA CONTÍNUA (novos invariantes)
# ═══════════════════════════════════════════════════════════════════════════
_sec "FASE 9 — Governança: FsmGuardian"

_file  "$SRC/core/services/fsm_guardian.gs"                                 "FsmGuardian existe"
_has   "registrar:"          "$SRC/core/services/fsm_guardian.gs"           "FsmGuardian.registrar exportado"
_has   "validar:"            "$SRC/core/services/fsm_guardian.gs"           "FsmGuardian.validar exportado"
_has   "assertValida:"       "$SRC/core/services/fsm_guardian.gs"           "FsmGuardian.assertValida exportado"

# Todos os engines com FSM devem registrar no Guardian
for engine in reserva_engine chave_engine habilitacoes_engine contratos_engine; do
  engine_path=$(find "$SRC" -name "${engine}.gs" 2>/dev/null | head -1)
  if [ -n "$engine_path" ]; then
    grep -q "FsmGuardian.registrar" "$engine_path" 2>/dev/null \
      && _ok "${engine}.gs: FsmGuardian.registrar presente" \
      || _err "${engine}.gs: FsmGuardian.registrar ausente"
  else
    _err "${engine}.gs não encontrado"
  fi
done

# action_engine: tem FSM (_TRANSICOES_VALIDAS) mas sem repository → deve ter Guardian
_has_gs "FsmGuardian.registrar" "$SRC/action_engine"                        "action_engine registrado no FsmGuardian"

_sec "FASE 9 — Governança: Observabilidade"

_file  "$SRC/core/services/auditoria_service.gs"                            "AuditoriaService existe"
_has   "registrarFsmViolacao:"    "$SRC/core/services/auditoria_service.gs" "AuditoriaService.registrarFsmViolacao exportado"
_has   "registrarFalhaAuth:"      "$SRC/core/services/auditoria_service.gs" "AuditoriaService.registrarFalhaAuth exportado"
_has   "registrarMutacaoCritica:" "$SRC/core/services/auditoria_service.gs" "AuditoriaService.registrarMutacaoCritica exportado"

_file  "$SRC/core/services/metrics_engine.gs"                               "MetricsEngine existe"
_has   "fsm:"       "$SRC/core/services/metrics_engine.gs"                  "MetricsEngine.fsm exportado"
_has   "seguranca:" "$SRC/core/services/metrics_engine.gs"                  "MetricsEngine.seguranca exportado"
_has   "governanca:" "$SRC/core/services/metrics_engine.gs"                 "MetricsEngine.governanca exportado"
_has   "FSM:"       "$SRC/core/services/metrics_engine.gs"                  "METRICA_TIPO.FSM definido"

_sec "FASE 9 — Governança: Event Schema"

_file  "$SRC/core/event_bus_backend.gs"                                     "event_bus_backend.gs existe"
_has   "validarSchema:"   "$SRC/core/event_bus_backend.gs"                  "SystemEvents.validarSchema exportado"
_has   "FSM_INVALID_TRANSITION" "$SRC/core/events_constants.gs"             "FSM_INVALID_TRANSITION em SystemEventTypes"
_has   "FSM_BYPASS_DETECTED"    "$SRC/core/events_constants.gs"             "FSM_BYPASS_DETECTED em SystemEventTypes"
_has   "MUTATION_CRITICAL"      "$SRC/core/events_constants.gs"             "MUTATION_CRITICAL em SystemEventTypes"
_has   "AUTH_FAILURE_TRACKED"   "$SRC/core/events_constants.gs"             "AUTH_FAILURE_TRACKED em SystemEventTypes"
_has   "GOVERNANCE_VIOLATION"   "$SRC/core/events_constants.gs"             "GOVERNANCE_VIOLATION em SystemEventTypes"

# Validar que aliases modernos são suportados no _normalizar
_has   "actor"     "$SRC/core/event_bus_backend.gs"                         "SystemEvents suporta alias 'actor'"
_has   "module"    "$SRC/core/event_bus_backend.gs"                         "SystemEvents suporta alias 'module'"
_has   "payload"   "$SRC/core/event_bus_backend.gs"                         "SystemEvents suporta alias 'payload'"

_sec "FASE 9 — Governança: Lint Arquitetural"

# Governance check deve passar
if [ -f "$GOV" ]; then
  if bash "$GOV" > /dev/null 2>&1; then
    _ok "governance_check.sh (10 checks) passa com exit 0"
  else
    _err "governance_check.sh falhou (run: bash $GOV)"
  fi
else
  _err "governance_check.sh não encontrado em $GOV"
fi

# Verificar ausência de *_service.gs fora do core
orphan_services=$(find "$SRC" -name "*_service.gs" 2>/dev/null | grep -v "core/services" | wc -l)
[ "$orphan_services" -eq 0 ] \
  && _ok "Sem *_service.gs fora de core/services/ ($orphan_services)" \
  || _err "*_service.gs fora de core/services/: $orphan_services arquivo(s)"

# Verificar ausência de getRange/appendRow em controllers
ctrl_direct=$(grep -rn "\.getRange(\|\.appendRow(\|\.setValues(" "$SRC/backend/controllers" \
  --include="*.gs" 2>/dev/null | grep -v "^\s*//" | wc -l)
[ "$ctrl_direct" -eq 0 ] \
  && _ok "Sem getRange/appendRow/setValues em controllers ($ctrl_direct)" \
  || _err "getRange/appendRow/setValues em controllers: $ctrl_direct ocorrência(s)"

# Verificar ausência de Logger.log em core/controllers (exceto logger.gs)
logger_violations=$(grep -rn "Logger\.log(" "$SRC/core" "$SRC/backend/controllers" \
  --include="*.gs" 2>/dev/null | grep -v "logger\.gs:" | grep -vP ":\s*//" | grep -vP ":\s+\*" | wc -l)
[ "$logger_violations" -eq 0 ] \
  && _ok "Sem Logger.log() legado em core/ e controllers/ ($logger_violations)" \
  || _err "Logger.log() legado em core/ ou controllers/: $logger_violations ocorrência(s)"

_sec "FASE 9 — Governança: Documentação"

_file  "Saas-ERP-cultural-main/docs/migration/legacy_inventory.md"          "Inventário do legacy existe"
_file  "Saas-ERP-cultural-main/docs/migration/scalability_analysis.md"      "Análise de escalabilidade existe"
_has   "DEAD"              "Saas-ERP-cultural-main/docs/migration/legacy_inventory.md" "Legacy classificado (DEAD/CTRL/AUTH presente)"
_has   "GARGALO"           "Saas-ERP-cultural-main/docs/migration/scalability_analysis.md" "Gargalos documentados"

# ═══════════════════════════════════════════════════════════════════════════
# INVARIANTES GERAIS — nunca devem regredir
# ═══════════════════════════════════════════════════════════════════════════
_sec "INVARIANTES GERAIS"

# GasResponse.wrap em todos os controllers (contagem ctrl_* == contagem wrap)
ctrl_total=$(grep -rn "^function ctrl_" "$SRC/backend/controllers" --include="*.gs" 2>/dev/null | wc -l)
wrap_total=$(grep -rn "GasResponse\.wrap" "$SRC/backend/controllers" --include="*.gs" 2>/dev/null | wc -l)
[ "$ctrl_total" -eq "$wrap_total" ] \
  && _ok "GasResponse.wrap em 100% das ctrl_* ($ctrl_total/$wrap_total)" \
  || _err "ctrl_* sem GasResponse.wrap (ctrl=$ctrl_total wrap=$wrap_total)"

_not_gs "SystemEvents\.emit\(['\"]" "$SRC"                                  "Sem SystemEvents.emit com string literal"
_not_gs "SpreadsheetApp\."          "$SRC/backend/controllers"               "Sem SpreadsheetApp em controllers"

for engine_file in $(find "$SRC" -name "*_engine.gs" 2>/dev/null); do
  n=$(grep "SpreadsheetApp\." "$engine_file" 2>/dev/null | grep -v "^\s*//" | wc -l)
  if [ "$n" -gt 0 ]; then
    _err "SpreadsheetApp em engine: $(basename $engine_file) ($n linhas)"
  fi
done
_ok "Sem SpreadsheetApp em engines"

_not_gs "^function ctrl_"          "$SRC/backend/mod_"                      "Sem ctrl_* em backend/mod_*.gs"

# ═══════════════════════════════════════════════════════════════════════════
# SUMÁRIO
# ═══════════════════════════════════════════════════════════════════════════
total=$(( PASS + FAIL ))
echo ""
echo "  ══════════════════════════════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then
  echo "  ✓ PASSOU — $PASS/$total testes OK. Zero regressões."
else
  echo "  ✗ FALHOU — $PASS/$total passaram, $FAIL falharam:"
  printf "%b\n" "$FAIL_LIST"
fi
echo "  ══════════════════════════════════════════════════════════════"

exit $( [ "$FAIL" -eq 0 ] && echo 0 || echo 1 )
