# ADR 0007 — Estratégia de Migração Controlada

**Status:** Aceito  
**Data:** 2026-05-10  
**Contexto:** refactor-fase2

---

## Contexto

O sistema CCBJ possuía uma base legada em estrutura flat (raiz do repositório), funcional em produção, sem separação de responsabilidades, com duplicações e sem infraestrutura de observabilidade.

A nova arquitetura (`Saas-ERP-cultural-main/gas/src/`) foi criada em paralelo com o sistema legado ativo. O desafio era: como migrar todo o código para a nova estrutura sem quebrar o sistema em produção e sem criar uma "grande reescrita" de risco?

---

## Decisão

Adotar **migração incremental com coexistência**, em três fases distintas:

### Fase 0 — Estruturação (concluída antes deste ADR)
- Criar a nova estrutura de diretórios em `gas/src/`
- Copiar arquivos legados para os domínios corretos **sem modificar lógica**
- Criar infraestrutura nova: Event Bus, Logger, Action Engine, events_constants

### Fase 1 — Instrumentação (este ADR)
- Enriquecer módulos com `SystemEvents.emit()` nos pontos de mutação críticos
- Substituir `console.*` por `Logger.info/warn/error` em todos os módulos/backend
- Respeitar dependências circulares: `core/utils.gs`, `core/setup.gs`, `core/data_layer.gs` mantêm `console.*`
- Criar relatório técnico em `docs/migration/`

### Fase 2 — Integração (pendente)
- Integrar Action Engine nos fluxos de negócio
- Centralizar acessos ao SpreadsheetApp via Data Layer
- Desativar sistema legado e usar `gas/src/` como único source of truth

---

## Princípios da Migração

### 1. Zero Destrutividade
O sistema legado na raiz **não foi tocado** durante toda a migração. A nova arquitetura evolui em paralelo. Nenhuma função pública foi removida sem camada de compatibilidade.

### 2. Enriquecimento sem Reescrita
A migração não reescreve lógica de negócio existente. Apenas:
- Adiciona `SystemEvents.emit()` após operações mutantes
- Substitui `console.*` por `Logger.*`
- Adiciona entradas no `ABA_PARA_MODULO` e `MODULOS` quando necessário

### 3. Fallback Silencioso
Toda nova infraestrutura (`SystemEvents.emit`, `Logger.*`) tem `try/catch` que falha silenciosamente. Isso garante que uma falha no sistema de eventos ou logging nunca interrompa uma operação de negócio.

### 4. Sem Dependências Circulares
O Logger (`Logger.*`) chama `registrarLog()` (em `utils.gs`), que chama `_getSheet()`. Portanto, `utils.gs`, `data_layer.gs` e `event_bus_backend.gs` **não usam Logger** — usam `console.*` diretamente como fallback seguro.

### 5. Compatibilidade de Frontend
O frontend HTML (`html/`) e a bridge de comunicação (`server_bridge_js.html`) não foram modificados. Todas as assinaturas de funções públicas chamadas por `google.script.run` foram preservadas.

---

## Consequências

### Positivas
- Sistema legado continua 100% operacional durante toda a migração
- Nova arquitetura já possui rastreabilidade completa via EventLog
- Logger padronizado elimina logs soltos e inconsistentes
- 10 tipos de evento críticos já rastreados no EventLog (KEY_PROTOCOL_*, MODULE_*, ROLE_*, RESERVATION_*)
- Auditoria automática de todas as mudanças de permissão e status de módulo

### Negativas / Trade-offs
- `core/utils.gs`, `core/setup.gs` e `core/data_layer.gs` ainda usam `console.*` (necessário para evitar circular dependency)
- Action Engine criado mas ainda não integrado nos fluxos de negócio (fase 2)
- Dois sistemas coexistindo aumenta superfície de manutenção no curto prazo

### Riscos Aceitos
- `EventLog` não existe no sistema legado — se o deploy migrar só parcialmente, eventos não serão gravados. Mitigação: `SystemEvents.emit` falha silenciosamente.
- Módulos ainda acessam `SpreadsheetApp` diretamente (não via Data Layer centralizado). Mitigação: mapeado para fase 2.

---

## Alternativas Consideradas

| Alternativa | Motivo da Rejeição |
|-------------|-------------------|
| Reescrita completa de uma vez | Alto risco de regressão; sistema em produção |
| Migração módulo a módulo com deploy parcial | GAS não suporta deploy parcial de scripts |
| Manter legado indefinidamente | Acumula dívida técnica; impossibilita crescimento |
| Fork com novo scriptId | Perda de histórico de dados no Drive |

---

## Decisores

- JP Barros (arquiteto responsável)
- Equipe de desenvolvimento CCBJ

---

## Referências

- [migration_report.md](../migration/migration_report.md)
- [ADR 0001](0001-action-oriented-architecture.md) — Arquitetura orientada a ações
- [ADR 0002](0002-event-bus-frontend.md) — Event Bus frontend
- [ADR 0006](0006-multi-spreadsheet.md) — Multi-planilha
- [system_architecture.md](../01_architecture/system_architecture.md)
