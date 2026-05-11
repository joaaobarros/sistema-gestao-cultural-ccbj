# FASE 3 — Análise de Unificação de Estruturas
# Sistema CCBJ — gas/src

**Data:** 2026-05-11
**Branch:** refactor-fase2
**Status:** ANÁLISE CONCLUÍDA — execução da unificação é etapa futura controlada

---

## Princípio Aplicado

> Manter separado APENAS quando houver responsabilidade distinta,
> domínio distinto, isolamento arquitetural necessário, ou motivo funcional real.

---

## 1. Estado Atual — Estruturas Já Unificadas

Ações de consolidação já executadas em fases anteriores (não repetir):

| Estrutura | Resolução | Quando |
|-----------|-----------|--------|
| `mod_permissoes.gs` (v1) + `mod_permissoes_v2.gs` | v1 removida, v2 é canônico | Fase 2 anterior |
| `_getSheet` duplicado em utils.gs | Cópia buggy removida | Fase 2 anterior |
| Include duplicado `mod_permissoes_v2_js` em Index.html | Removido | Fase 2 anterior |
| `mod_estrategia.gs` (stubs) | Arquivo removido | Fase 2 anterior |
| `Logic.html` monolítico | Não carregado; substituído por includes granulares | Fase 2 anterior |
| Namespace flat (raiz) + `gas/src/` | gas/src é canônico; legacy é referência histórica | Fase 1 |
| `BASE_URL_FALLBACK` hardcoded | Removido de router.gs | Fase 2 anterior |
| `mod_acoes.gs` → `action_engine.gs` | Renomeado e evoluído | Fase 2 anterior |
| `GestaoContratos.html` + `PainelSolicitacoes.html` | Renomeados com prefixo `mod_` | Fase 3 anterior |
| console.* em modules/ e backend/ | Substituídos por Logger.info/warn/error | Fase 3 anterior |

---

## 2. Estruturas a Unificar — Plano

### U-01 — Logger.log nas chamadas de debug de auth_session.gs

**Referência:** D-03 em fase2_deteccao_duplicacoes.md

**O que unificar:**
Todas as chamadas `Logger.log(...)` em `core/auth_session.gs` → `console.log(...)`

**Por quê unificar:**
- O Logger customizado (`var Logger = (function(){...})()`) sobrescreve o Logger nativo do GAS
- `Logger.log` é `undefined` após logger.gs ser carregado
- auth_session.gs é core/ → uso de Logger customizado é proibido (dependência circular)

**Arquivos afetados:**
- `gas/src/core/auth_session.gs` — múltiplas ocorrências de `Logger.log(...)`

**Estratégia:** substituição direta (buscar e substituir)

**Compatibilidade:** total — apenas logs de debug, sem contrato público

**Execução segura:** SIM — pode ser feita imediatamente

---

### U-02 — Fallback SpreadsheetApp em _registrarLogSessao

**Referência:** D-06 em fase2_deteccao_duplicacoes.md

**O que unificar:**
Remover o fallback `SpreadsheetApp.getActiveSpreadsheet()` de `_registrarLogSessao`

**Por quê unificar:**
- Viola a regra arquitetural: nenhum acesso direto a SpreadsheetApp fora de `core/utils.gs`
- O fallback nunca é necessário em execução normal (se `_getSheet` existe, funciona)
- O log de sessão não é crítico para o fluxo de autenticação

**Arquivos afetados:**
- `gas/src/core/auth_session.gs` — função `_registrarLogSessao`

**Execução segura:** SIM — pode ser feita imediatamente

---

### U-03 — Extração de _p2obterMapaAdmins()

**Referência:** D-04 em fase2_deteccao_duplicacoes.md

**O que unificar:**
Criar função privada centralizada para lookup da aba Administradores

**Funções beneficiadas:**
1. `obterPermissoesUsuarioV2(email)` — resolução de perfil_base novo usuário
2. `salvarPermissoesUsuarioV2(dados)` — função interna `_buscarOuDefault`
3. `sincronizarUsuariosSistema()` — construção de nivelMap

**Padrão a extrair:**
```javascript
function _p2obterMapaAdmins() {
  var mapa = {};
  try {
    var aba = _getSheet('Administradores');
    if (!aba || aba.getLastRow() < 2) return mapa;
    var nivelMap = {
      superadmin:'superadmin', admin:'admin', gestor:'gestor',
      tecnico:'tecnico', 'técnico':'tecnico', rh:'rh',
      comunicacao:'comunicacao', 'comunicação':'comunicacao'
    };
    aba.getRange(2, 1, aba.getLastRow()-1, 2).getValues().forEach(function(r) {
      var em = String(r[0]||'').toLowerCase().trim();
      var nv = String(r[1]||'').toLowerCase().trim();
      if (em && nivelMap[nv]) mapa[em] = nivelMap[nv];
    });
  } catch(e) {}
  return mapa;
}
```

**Execução segura:** SIM, após testes unitários manuais no editor GAS

---

### U-04 — Remoção de GAS.financeiro namespace (legacy)

**Referência:** D-01 em fase2_deteccao_duplicacoes.md

**O que unificar:**
Remover o namespace `GAS.financeiro` de `server_bridge_js.html`

**Pré-condição obrigatória:**
Confirmar que nenhum arquivo HTML contém chamada a `GAS.financeiro.*`:
```bash
grep -r "GAS\.financeiro" gas/src/html/
```

**Execução segura:** SIM, desde que a busca acima retorne vazio

**Ordem de operações:**
1. Executar grep de verificação
2. Se vazio: remover bloco `financeiro:` de server_bridge_js.html
3. Se houver callers: adicionar alias e agendar remoção posterior

---

## 3. Estruturas a MANTER SEPARADAS — Justificativa

### MS-01 — obterEmailUsuario vs _resolverEmailReal

**Por que manter:**
- `obterEmailUsuario` (mod_admin.gs) → API pública de backend, usada pelos módulos
- `_resolverEmailReal` (auth_session.gs) → infraestrutura interna de sessão
- Unificar quebraria a regra: `core/` não pode depender de `backend/`
- Propósitos distintos mesmo que a lógica pareça similar

---

### MS-02 — mod_pessoal.gs com múltiplos conceitos

**Por que manter:**
- Tarefas + Balcão + interações pessoais são operacionalmente relacionadas
- O arquivo ainda não ultrapassou o limiar de complexidade
- Split prematuro criaria overhead de manutenção sem ganho

**Condição de revisão:** quando mod_pessoal.gs ultrapassar 600 linhas ativas
ou quando qualquer um dos sub-domínios exigir lógica de negócio autônoma.

---

### MS-03 — GAS.ia.chat como stub

**Por que manter:**
- Placeholder explícito (`_stub`) é intencional — comunica que a feature não está pronta
- Remover o stub quebraria chamadas que já existem no frontend (se existirem)
- Implementar ou documentar como "não previsto" antes de remover

---

### MS-04 — mod_agenda_geral vs mod_agenda_rece

**Por que manter:**
- Servem fluxos de usuário distintos
- RECE tem processo de agendamento diferente do geral
- Compartilham dados (Reservas sheet) mas têm UI e regras diferentes

---

### MS-05 — obterPermissoesUsuario() v1 wrapper

**Por que manter por ora:**
- `_resolverNivelAcesso` em auth_session.gs depende desta função
- Remover exige migrar `_resolverNivelAcesso` para chamar v2 diretamente
- Alta criticidade — autenticação de todos os usuários

**Caminho de eliminação:**
1. Migrar `_resolverNivelAcesso` para usar `obterPermissoesUsuarioV2` diretamente
2. Verificar que nenhum outro caller usa `obterPermissoesUsuario` (v1)
3. Remover o wrapper

---

## 4. Ordem de Execução Recomendada

| Prioridade | ID | Ação | Risco | Tempo estimado |
|------------|-----|------|-------|----------------|
| 1 | U-01 | Logger.log → console.log em auth_session.gs | Mínimo | < 5 min |
| 2 | U-02 | Remover fallback SpreadsheetApp | Mínimo | < 5 min |
| 3 | U-04 | Remover GAS.financeiro (após grep) | Baixo | < 10 min |
| 4 | U-03 | Extrair _p2obterMapaAdmins | Baixo | < 30 min |
| 5 | MS-05 | Migrar _resolverNivelAcesso → v2 | Médio | < 60 min |

---

## 5. O que NÃO fazer nesta etapa

- NÃO dividir mod_pessoal.gs antes do tempo
- NÃO remover o wrapper v1 de permissões sem migrar _resolverNivelAcesso
- NÃO criar nova versão paralela de nenhum módulo
- NÃO refatorar auth_session.gs além das correções pontuais mapeadas
- NÃO tocar nos módulos HTML (agenda, rece, etc.)

---

*Análise concluída em 2026-05-11. Execução é etapa separada e controlada.*
