# Métricas de Descomissionamento — CCBJ
> Data: 2026-05-11 | Branch: refactor-fase2 | Baseline mantido: 103/103 testes, 11/11 checks

---

## Resumo Executivo

Descomissionamento controlado em 5 fases concluídas (FASES 1–5/8).  
Zero regressões em todos os commits. Governança ampliada de 10 para 11 checks bloqueantes.

---

## 1. Funções Removidas por Fase

### FASE 2 — Remoção de código DEAD confirmado

| Módulo                        | Funções removidas | LOC removidas (est.) |
|-------------------------------|-------------------|----------------------|
| `server_bridge_js.html`       | 1 (`GAS.ia.chat` stub) | ~1 |
| `mod_reservas_js.html`        | 2 (`finalizarSucesso`, `finalizarErro`) | ~115 |
| `mod_comunicacao.gs`          | 3 (`_sincronizarEdicaoComRece`, `atualizarReceController`, `verificarPermissaoRece`) | ~50 |
| `mod_equipes.gs`              | 6 (`obterFuncionarios`, `obterResponsaveisPorTipo`, `obterEscalas`, `obterAvaliacoes`, `obterFerias`, `listarEquipePorFuncao`) | ~90 |
| `mod_financeiro.gs`           | 16 (cluster RH+Financeiro morto) | ~470 |
| **TOTAL FASE 2**              | **28 funções**    | **~726 LOC**         |

### FASE 3 — Eliminação de wrappers de compatibilidade

| Módulo                     | Item removido                      | LOC removidas |
|----------------------------|------------------------------------|---------------|
| `mod_permissoes_v2.gs`     | `obterPermissoesUsuario()` (wrapper v1→v2) | ~40 |
| `auth_session.gs`          | fallback legacy `obterPermissoesUsuario` em `_resolverNivelAcesso` | ~8 |
| **TOTAL FASE 3**           | **2 remoções**                     | **~48 LOC**   |

### FASE 4 — Migração de helpers procedurais para repositório (mod_chaves.gs)

| Helper removido                       | Substituído por                            |
|---------------------------------------|--------------------------------------------|
| `_chvGetChaves()`                     | `ChavesRepository` (interno)              |
| `_chvGetProtocolos()`                 | `ChavesRepository` (interno)              |
| `_chvGetHistorico()`                  | `ChavesRepository` (interno)              |
| `_chvLerChaves()`                     | `ChavesRepository.listarChaves()`         |
| `_chvLerProtocolos()`                 | `ChavesRepository.listarProtocolos()`     |
| `_chvMapearChave()`                   | Mapper interno do repository              |
| `_chvMapearProtocolo()`               | Mapper interno do repository              |
| `_chvEncontrarChaveLinha()`           | `ChavesRepository.obterChavePorId()`      |
| `_chvEncontrarProtocoloLinha()`       | `ChavesRepository.obterProtocoloPorId()`  |
| `_chvAtualizarStatusChaveNaPlanilha()` | `ChavesRepository.atualizarStatusChave()` |
| `_chvRegistrarHistorico()`            | `ChavesRepository.appendHistorico()`      |
| **TOTAL FASE 4**                      | **11 helpers eliminados**                 |

`chaves_repository.gs` estendido: `criarProtocolo()` aceita campos opcionais (`dtRetirada`, `entreguePorId/Nome`, `recebidoPorId/Nome`), eliminando as duas últimas operações de `appendRow` manual em `mod_chaves.gs`.

---

## 2. Variação de Tamanho por Módulo

| Módulo                      | LOC antes | LOC depois | Delta     |
|-----------------------------|-----------|------------|-----------|
| `mod_financeiro.gs`         | ~542      | 90         | −452 (−83%) |
| `mod_chaves.gs`             | 1308      | 1156       | −152 (−12%) |
| `mod_equipes.gs`            | ~256      | 166        | −90 (−35%) |
| `mod_comunicacao.gs`        | ~298      | 248        | −50 (−17%) |
| `mod_permissoes_v2.gs`      | ~556      | 518        | −38 (−7%)  |
| `auth_session.gs`           | −         | −          | −8 (−1%)  |
| `mod_reservas_js.html`      | ~1800     | ~1685      | −115 (−6%) |
| **TOTAL ESTIMADO**          |           |            | **~905 LOC** |

---

## 3. Bridge — Estado da Migração

| Tipo de chamada        | Antes (baseline) | Depois | Meta |
|------------------------|------------------|--------|------|
| `_call()` legacy       | 6                | **1**  | 0    |
| `_callCtrl()` canônico | ~200             | 232    | 100% |
| `_stub()` (placeholder)| 2                | 1      | 0    |

**Taxa canônica: 232/(232+1) = 99,6%**

Restante (WAIT): `chat_criarSolicitacao` — bloqueado pela ausência do módulo Chat.

---

## 4. Cobertura do Contrato GasResponse

| Métrica                        | Valor |
|--------------------------------|-------|
| Controllers (`*.gs`)           | 20    |
| Funções `ctrl_*`               | 226   |
| Funções com `GasResponse.wrap` | 226   |
| **Cobertura**                  | **100%** |

---

## 5. Acesso Procedural Direto (SpreadsheetApp fora de Repository)

### Antes do descomissionamento
- `mod_financeiro.gs`: ~10 ops (RH — todas em cluster morto)
- `mod_chaves.gs`: ~26 ops (10 sheets distintas + helpers duplicados)
- Módulos sem repository: múltiplos (não migrados)

### Depois (estado atual)
| Módulo                    | Ops restantes | Justificativa                                     |
|---------------------------|---------------|--------------------------------------------------|
| `mod_chaves.gs`           | 9             | Aba `Configuracoes` — sem repository dedicado   |
| `mod_hab_diaria.gs`       | 10            | Aba `HabilitacaoDiaria` — sem repository ainda  |
| `mod_comunicacao.gs`      | 8             | Sem repository — ACTIVE                          |
| `mod_comunicacao_processos.gs` | 17       | Sem repository — ACTIVE                          |
| `mod_reservas.gs`         | 41            | Sem repository — maior débito restante           |
| `mod_pessoal.gs`          | 9             | Aba Tarefas/Kanban — sem repository              |
| `mod_escuta.gs`           | ~6            | Sem repository — ACTIVE                          |

**SpreadsheetApp fora de gateway/repository: 0** ✓ (TENDÊNCIA 2 zerada)

---

## 6. Governança — Evolução dos Checks

| Check | Descrição | Status |
|-------|-----------|--------|
| 1–10  | Checks originais (baseline) | ✓ Aprovados |
| **11** | SpreadsheetApp em `core/` (exceto utils.gs, setup.gs) | **NOVO — FASE 5** |
| T-5   | getRange/appendRow/setValues em módulos com repository | **NOVA TENDÊNCIA** |

**Checks bloqueantes: 10 → 11**  
**Tendências rastreadas: 4 → 5**

---

## 7. Itens em Espera (WAIT / BLOCKED)

| ID   | Item                          | Bloqueio                                       | Próximo passo                         |
|------|-------------------------------|------------------------------------------------|---------------------------------------|
| W-01 | Bridge `chat_criarSolicitacao` | Módulo Chat não implementado                  | Implementar módulo Chat + controller  |
| W-02 | `aprovarSolicitacao` direct call | Frontend chama `google.script.run` diretamente | Criar `ctrl_admin_aprovar_solicitacao` |
| B-01 | `mod_hab_diaria.gs` procedural | Sem `hab_diaria_repository.gs`               | Criar repository para aba HabDiaria   |

---

## 8. Invariantes Mantidos Durante Todo o Descomissionamento

- [x] regression_tests.sh: **103/103** em todos os commits
- [x] governance_check.sh: **zero violações bloqueantes** em todos os commits  
- [x] Nenhuma função pública removida sem confirmação de 0 callers externos
- [x] Nenhuma regressão de runtime detectada
- [x] GasResponse.wrap: 100% cobertura mantida (226/226)
- [x] FsmGuardian: todos engines com FSM registrados

---

*Gerado em: 2026-05-11 | Autor: refactor-fase2 | Base: 103/103 testes, 11/11 checks*
