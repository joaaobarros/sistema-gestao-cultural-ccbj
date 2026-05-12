# Análise de Escalabilidade e Gargalos — CCBJ
> FASE 7 — Estabilização do Core | FASE 8 — Preparação para Escalabilidade Futura  
> Data: 2026-05-11

---

## Visão Geral

O sistema roda em **Google Apps Script (GAS)** com persistência em **Google Sheets**.  
GAS é uma plataforma serverless com limites rígidos de execução — entender esses limites
é obrigatório antes de qualquer crescimento de carga ou integração externa.

---

## Limites Críticos do GAS

| Limite                          | Valor           | Impacto Atual         |
|---------------------------------|-----------------|-----------------------|
| Tempo máximo de execução        | 6 min (360s)    | Alguns fluxos de lote podem atingir |
| Cota diária de execuções        | 20.000/dia (free), 100.000/dia (Workspace) | Monitorar |
| Chamadas `google.script.run`    | Assíncronas, sem fila real | Concorrência real = 0 |
| Lock de script (`getScriptLock`)| 1 lock por vez  | JÁ implementado com retry |
| CacheService TTL máximo         | 6 horas (21.600s) | OK para sessões |
| PropertiesService leitura       | Síncrona, sem problema | OK |
| Quota de emails (MailApp)       | 100/dia (free), 1500/dia (Workspace) | Verificar |
| Spreadsheet API calls           | Sem limite explícito, mas lento se muitas | Crítico |

---

## Gargalos Identificados

### GARGALO 1 — Acesso direto ao Sheets (sem cache)
**Severidade:** ALTO  
**Localização:** `mod_reservas.gs`, `mod_admin.gs`, `mod_chaves.gs`, módulos legacy  
**Descrição:**  
Cada requisição do frontend que envolve leitura de dados faz chamadas `getRange().getValues()` ao Sheets.  
Em operações pesadas (agenda, dashboard, relatórios), isso pode ser 10-30 leituras por requisição.

**Solução planejada:**  
- `DataGateway` já existe em `core/services/data_gateway.gs` — expandir para servir como cache de leitura
- Adicionar `AppCache.getOrSet()` em módulos críticos de leitura pesada
- `MetricsEngine.operacional()` já agrega em uma chamada — manter esse padrão

---

### GARGALO 2 — Operações de lote sem lock adequado
**Severidade:** MÉDIO  
**Localização:** `processarAgendamentoLote`, `chaves_verificarAtrasos`  
**Descrição:**  
Funções de trigger que processam múltiplas entidades em loop usam o script lock mas
não têm timeout individualizado por entidade. Uma falha no meio do lote pode deixar
entidades em estado inconsistente.

**Solução planejada:**  
- Implementar padrão de processamento em lote com checkpoint: registrar progresso no CacheService
- Emitir evento de auditoria por entidade processada

---

### GARGALO 3 — Concorrência de usuários simultâneos
**Severidade:** MÉDIO  
**Localização:** `criarReservaController`, `ctrl_chaves_retirar`, `ctrl_hab_criar`  
**Descrição:**  
GAS não tem concorrência real — cada `google.script.run` executa em processo separado.
O `ScriptLock` garante exclusão mútua, mas o timeout padrão é de 30s. Sob alta carga
(>5 usuários simultâneos criando reservas), pode haver fila visível.

**Solução atual:**  
`obterLockComRetry()` com 3 tentativas — adequado para carga atual do CCBJ (~20-50 usuários).

**Solução para escala:**  
- Aumentar timeout do lock para 45s em operações críticas
- Implementar fila de operações assíncronas (via Spreadsheet como fila)

---

### GARGALO 4 — Módulos sem repository (leitura pesada direta)
**Severidade:** MÉDIO**  
**Localização:** `mod_escuta.gs`, `mod_comunicacao.gs`, `mod_financeiro.gs`, `mod_almoxarifado.gs`  
**Descrição:**  
Módulos sem `*Repository` fazem leituras diretas ao Sheets.  
Sem cache, cada render de tabela ou relatório faz nova leitura.

**Solução planejada:**  
Criar repositórios para os 7 módulos restantes (escuta, comunicacao, financeiro, almoxarifado,
programacao, pessoal, contratos) — ver FASE 6 legacy_inventory.md.

---

### GARGALO 5 — EventLog sem índice (consulta linear)
**Severidade:** BAIXO  
**Localização:** `event_bus_backend.gs` → `getEventosPorEntidade()`  
**Descrição:**  
O EventLog é consultado com scan linear por entidade. Com crescimento do log
(>10.000 linhas), consultas por entidade ficam lentas.

**Solução planejada:**  
- Implementar paginação em `getRecentes()`
- Usar `MetricsEngine.auditoria()` para leituras agregadas (não linha-a-linha)
- Considerar rotação mensal do EventLog (arquivo logs mais antigos)

---

## Módulos Críticos (não podem falhar)

| Módulo                     | Criticidade | Justificativa                              |
|----------------------------|-------------|-------------------------------------------|
| `reserva_engine.gs`        | CRÍTICO     | Core operacional — toda reserva passa aqui |
| `auth_session.gs`          | CRÍTICO     | Identidade de todos os usuários           |
| `chave_engine.gs`          | CRÍTICO     | Controle de acesso físico                 |
| `event_bus_backend.gs`     | ALTO        | Rastreabilidade institucional             |
| `mod_permissoes_v2.gs`     | ALTO        | Controle de acesso a módulos              |
| `fsm_guardian.gs`          | ALTO        | Integridade das FSMs                      |

---

## Acoplamentos Síncronos Identificados

| Origem                    | Destino                        | Tipo          | Risco       |
|---------------------------|--------------------------------|---------------|-------------|
| `criarReservaController`  | `possuiConflitoReserva`        | Síncrono direto | Médio      |
| `KeyEngine.aplicarTransicao` | `ChavesRepository.atualizar` | Síncrono direto | Baixo      |
| `AuditoriaService.registrar` | `SystemEvents.emit`         | Síncrono direto | Baixo      |
| Todos controllers         | `GasResponse.wrap`             | Síncrono direto | Nenhum     |

---

## Preparação para APIs Externas

### Estado atual
O sistema é 100% interno (GAS ↔ Sheets). Não há integração com APIs externas além de:
- Google Calendar (via `CalendarApp` — alguns endpoints ainda no bridge)
- Google Drive (via `DriveApp` — geração de documentos)
- MailApp (envio de convites)

### Para integrar APIs externas no futuro
1. Criar `core/services/http_client.gs` — wrapper de `UrlFetchApp` com retry e timeout
2. Criar `backend/controllers/webhook_controller.gs` — receber eventos externos via `doPost()`
3. Implementar fila de saída em Sheets para operações assíncronas (fire-and-forget)
4. Adicionar `INTEGRATION_FAILED` ao audit trail (já definido em `SystemEventTypes`)

### Para multi-tenant no futuro
- `config.gs` já usa `PropertiesService` com chaves organizacionais — base pronta
- `getOrgConfig()` já abstrai configuração — adicionar tenant ID
- DataGateway precisa de namespace por tenant

---

## Recomendações de Curto Prazo

1. **Adicionar cache em `obterDadosIniciais`** — já tem ScriptCache, mas TTL pode ser aumentado para 5min
2. **Rotação do EventLog** — criar trigger mensal para arquivar linhas >90 dias
3. **Timeout explícito em locks críticos** — `obterLockComRetry(45000)` em `ctrl_reservas_criar`
4. **Métricas de tempo de resposta** — adicionar `Date.now()` no início/fim de controllers pesados

---

## Core Estável — Contratos Definitivos

Os seguintes arquivos formam o core definitivo. **NÃO criar paralelos:**

```
core/
  auth_session.gs        — identidade e sessão
  config.gs              — configuração organizacional
  data_layer.gs          — acesso multi-planilha
  event_bus_backend.gs   — eventos e auditoria
  events_constants.gs    — tipos de eventos (enum)
  logger.gs              — logging centralizado
  setup.gs               — inicialização da estrutura
  utils.gs               — helpers utilitários

core/services/
  auditoria_service.gs   — facade de auditoria
  cache_service.gs       — AppCache
  data_gateway.gs        — DataGateway
  fsm_guardian.gs        — enforcement de FSM
  metrics_engine.gs      — agregador de métricas
  permissoes_service.gs  — ponto único de permissões
  usuarios_service.gs    — lookup de usuários
```

**Regra:** qualquer nova infraestrutura vai em `core/services/` — nunca espalhada pelos módulos.

---

*Próxima revisão: após implementação do cache centralizado no DataGateway*
