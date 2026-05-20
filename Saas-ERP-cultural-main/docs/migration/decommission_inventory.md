# Inventário de Descomissionamento — CCBJ
> Data: 2026-05-11  
> Branch: refactor-fase2  
> Baseline: governance_check.sh APROVADO (10/10), regression_tests.sh 103/103

---

## Legenda de Classificação

| Código       | Significado                                                      |
|--------------|------------------------------------------------------------------|
| `DEAD`       | Zero callers confirmados — remover imediatamente                 |
| `DEPRECATED` | Wrapper ativo de compatibilidade — remover quando callers migrarem |
| `WAIT`       | Bloqueado por decisão de produto/roadmap — documentar e aguardar |
| `BLOCKED`    | Bloqueado por dependência técnica que exige migração prévia       |
| `ACTIVE`     | Em uso ativo — procedural mas necessário (roadmap futuro)        |

---

## BRIDGE — server_bridge_js.html

| ID  | Função/Namespace    | Arquivo                       | Classificação | Callers Bridge | Callers Frontend | Risco   | Observação                                               |
|-----|---------------------|-------------------------------|---------------|----------------|------------------|---------|----------------------------------------------------------|
| B-01 | `GAS.ia.chat`      | server_bridge_js.html:251     | `DEAD`        | N/A            | 0                | Baixo   | `_stub(cb)` — nunca chamado do frontend                  |
| B-02 | `GAS._call('chat_criarSolicitacao')` | server_bridge_js.html:310 | `WAIT` | N/A | 1 (via GAS.solicitacoes.criar) | Baixo | Chat não implementado — aguardar módulo Chat             |

---

## FRONTEND — html/

| ID  | Função                  | Arquivo                                 | Classificação | Callers Runtime | Risco   | Observação                                                                     |
|-----|-------------------------|-----------------------------------------|---------------|-----------------|---------|--------------------------------------------------------------------------------|
| F-01 | `finalizarSucesso()`   | mod_reservas_js.html:559–662            | `DEAD`        | 0               | Baixo   | Função do fluxo antigo — RECE é salvo pelo backend em criarReservaController   |
| F-02 | `aprovarSolicitacao()` direct call | mod_painel_solicitacoes.html:345 | `WAIT` | 1 | Médio  | google.script.run direto sem controller — precisa migrar para ctrl_admin_aprovar |

---

## BACKEND — modules/comunicacao/mod_comunicacao.gs

| ID   | Função                      | Linha | Classificação | Callers Externos | Risco   | Observação                                                           |
|------|-----------------------------|-------|---------------|-----------------|---------|----------------------------------------------------------------------|
| C-01 | `_sincronizarEdicaoComRece()` | 178   | `DEAD`      | 0               | Baixo   | Função órfã — nenhum caller externo ou interno além da definição     |
| C-02 | `atualizarReceController()` | 248   | `DEAD`        | 0               | Baixo   | Função órfã — nenhum caller externo ou interno além da definição     |
| C-03 | `verificarPermissaoRece()`  | 252   | `DEAD`        | 0 externos      | Baixo   | Chamada apenas por C-02 (também DEAD) — dead cluster                 |

---

## BACKEND — modules/equipes/mod_equipes.gs

| ID   | Função                      | Linha | Classificação | Callers Externos | Risco   | Observação                                                                   |
|------|-----------------------------|-------|---------------|-----------------|---------|------------------------------------------------------------------------------|
| E-01 | `obterFuncionarios()`       | 17    | `DEAD`        | 0               | Baixo   | Substituída por `EquipesEngine.listar()` no equipes_controller               |
| E-02 | `obterResponsaveisPorTipo()` | 59   | `DEAD`        | 0               | Baixo   | Sem equivalente no controller — funcionalidade não exposta                   |
| E-03 | `obterEscalas()`            | 100   | `DEAD`        | 0               | Baixo   | Substituída por `EquipesEngine.listarEscalas()` no equipes_controller        |
| E-04 | `obterAvaliacoes()`         | 125   | `DEAD`        | 0               | Baixo   | Substituída por `EquipesEngine.listarAvaliacoes()` no equipes_controller     |
| E-05 | `obterFerias()`             | 145   | `DEAD`        | 0               | Baixo   | Substituída por `EquipesEngine.listarFerias()` no equipes_controller         |
| E-06 | `listarEquipePorFuncao()`   | 224   | `DEAD`        | 0               | Baixo   | Substituída por `EquipesEngine.listarPorFuncao()` no equipes_controller      |

---

## BACKEND — modules/financeiro/mod_financeiro.gs (cluster financeiro-RH morto)

| ID   | Função                          | Linha | Classificação | Callers Externos | Risco   | Observação                                                              |
|------|---------------------------------|-------|---------------|-----------------|---------|-------------------------------------------------------------------------|
| FIN-01 | `excluirPagamento()`          | 73    | `DEAD`        | 0               | Baixo   | Sem entrada bridge — controller não expõe excluir pagamentos            |
| FIN-02 | `compararContratoRH()`        | 97    | `DEAD`        | 0               | Baixo   | Análise financeira não exposta — sem bridge, sem caller                 |
| FIN-03 | `compararMetaRH()`            | 115   | `DEAD`        | 0 externos      | Baixo   | Chamada apenas por FIN-02 (dead cluster)                                |
| FIN-04 | `obterResumoFinanceiroContrato()` | 146 | `DEAD`       | 0               | Baixo   | Análise financeira não exposta                                          |
| FIN-05 | `_getParametroRH()`           | 173   | `DEAD`        | 0 externos      | Baixo   | Helper interno chamado apenas por funções do cluster morto              |
| FIN-06 | `calcularCustoVinculo()`      | 186   | `DEAD`        | 0 externos      | Baixo   | Dead cluster — chamada por FIN-07, FIN-11, FIN-12 (todos mortos)       |
| FIN-07 | `atualizarCalculoVinculos()`  | 265   | `DEAD`        | 0               | Baixo   | Sem caller externo — análise não exposta                                |
| FIN-08 | `calcularCustoPorMeta()`      | 300   | `DEAD`        | 0 externos      | Baixo   | Dead cluster                                                            |
| FIN-09 | `calcularCustoPorPrograma()`  | 328   | `DEAD`        | 0 externos      | Baixo   | Dead cluster                                                            |
| FIN-10 | `simularCenarioRH()`          | 353   | `DEAD`        | 0               | Baixo   | Simulação não exposta                                                   |
| FIN-11 | `gerarResumoRH()`             | 389   | `DEAD`        | 0               | Baixo   | Análise não exposta                                                     |
| FIN-12 | `calcularCustoContrato()`     | 399   | `DEAD`        | 0 externos      | Baixo   | Dead cluster                                                            |
| FIN-13 | `obterResumoFinanceiroPorMeta()` | 422 | `DEAD`       | 0               | Baixo   | Análise não exposta                                                     |
| FIN-14 | `gerarFluxoRH()`              | 444   | `DEAD`        | 0 externos      | Baixo   | Dead cluster                                                            |
| FIN-15 | `simularDemissao()`           | 487   | `DEAD`        | 0               | Baixo   | Simulação não exposta                                                   |
| FIN-16 | `calcularSaldoMensal()`       | 516   | `DEAD`        | 0               | Baixo   | Análise não exposta                                                     |

---

## WRAPPERS DE COMPATIBILIDADE — mod_permissoes_v2.gs

| ID   | Função                       | Arquivo               | Classificação  | Callers | Observação                                              |
|------|------------------------------|-----------------------|----------------|---------|----------------------------------------------------------|
| P-01 | `obterPermissoesUsuario()`  | mod_permissoes_v2.gs  | `DEPRECATED`   | 6+      | Wrapper v1→v2 — remover quando todos callers usarem PermissoesService diretamente |

---

## PROCEDURAL ATIVO — roadmap futuro (ACTIVE)

Estes módulos têm código procedural ativo (getRange/getValues/setValues direto fora de Repository).  
Não são DEAD — são o NEXT na fila de migração para Engine+Repository.

| Módulo                           | Acesso Procedural | Repositório disponível? | Status Migração FASE 4 |
|----------------------------------|-------------------|------------------------|------------------------|
| `mod_reservas.gs`               | ~41 ocorrências   | Não                    | ACTIVE — criar reservas_repository.gs |
| `mod_comunicacao_processos.gs`  | ~17 ocorrências   | Não                    | ACTIVE — criar repository |
| `mod_hab_diaria.gs`             | ~13 ocorrências   | Não (HabDiaria ≠ habilitacoes_repository) | BLOCKED — criar hab_diaria_repository.gs |
| `mod_comunicacao.gs`            | ~8 ocorrências    | Não                    | ACTIVE — criar repository |
| `mod_escuta.gs`                 | ~6 ocorrências    | Não                    | ACTIVE — criar repository |
| `mod_pessoal.gs`                | ~9 ocorrências    | Não (rh_repository é JSON, não Sheets) | ACTIVE — criar repository para Tarefas |
| `mod_chaves.gs`                 | 9 ocorrências (Configuracoes only) | ✓ chaves_repository | **MIGRADO** — FASE 4 concluída. 11 helpers eliminados. Apenas Configuracoes (sem repo) permanece. |

---

## ITENS WAIT — bloqueados por decisão/produto

| ID    | Função/Área                | Localização                                  | Bloqueio                                              |
|-------|----------------------------|----------------------------------------------|-------------------------------------------------------|
| W-01  | Chat module completo       | mod_admin.gs + bridge:310                    | Módulo Chat não implementado — aguardar produto       |
| W-02  | `aprovarSolicitacao` direct | mod_painel_solicitacoes.html:345             | Precisa criar `ctrl_admin_aprovar_solicitacao` primeiro |

---

## RESUMO OPERACIONAL

| Categoria        | Total | DEAD | DEPRECATED | WAIT | BLOCKED | ACTIVE |
|-----------------|-------|------|------------|------|---------|--------|
| Bridge          | 2     | 1    | 0          | 1    | 0       | 0      |
| Frontend        | 2     | 1    | 0          | 1    | 0       | 0      |
| mod_comunicacao | 3     | 3    | 0          | 0    | 0       | 0      |
| mod_equipes     | 6     | 6    | 0          | 0    | 0       | 0      |
| mod_financeiro  | 16    | 16   | 0          | 0    | 0       | 0      |
| Wrappers compat | 1     | 0    | 1          | 0    | 0       | 0      |
| **TOTAL**       | **30** | **27** | **1** | **2** | **0** | **0** |

**27 itens DEAD — todos elegíveis para remoção imediata.**

---

## Critérios de Remoção Confirmados (para todos os DEAD acima)

- [x] Zero callers confirmados por grep em todo o codebase
- [x] Zero referências bridge (ou referência via _stub nunca invocada)
- [x] Zero referências frontend ativas
- [x] Zero triggers (nenhum dos itens é ponto de entrada de trigger GAS)
- [x] Zero adapters ativos
- [x] Equivalente moderno já existe no sistema (Engine/Controller)
- [ ] regression_tests.sh aprovado — executar após cada commit
- [ ] governance_check.sh aprovado — executar após cada commit

---

*Gerado em: 2026-05-11 | Branch: refactor-fase2 | Baseline: 103/103 testes*
