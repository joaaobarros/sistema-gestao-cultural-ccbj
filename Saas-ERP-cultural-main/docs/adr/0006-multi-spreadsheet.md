# ADR 0006 — Arquitetura Multi-Planilha (Single Source of Truth por Domínio)

## Status

Aceito

---

## Contexto

A versão inicial do sistema usava uma única planilha Google Sheets com todas as abas. Isso criou limitações de:

- Tamanho (planilhas grandes ficam lentas)
- Permissões (não era possível dar acesso granular a uma área sem expor tudo)
- Acoplamento (uma aba corrompida afetava o sistema inteiro)

---

## Decisão

O sistema foi reestruturado com múltiplas planilhas por domínio operacional:

| Planilha | Conteúdo |
|---|---|
| `CCBJ_MASTER` | Administradores, Configurações, Logs, Auth |
| `CCBJ_ESPACOS` | Reservas, Itens, Chaves, Protocolos |
| `CCBJ_COMUNICACAO` | ReservasRECE, Processos, Entregas |
| `CCBJ_RELATORIOS` | Contratos, Metas, Indicadores, Rubricas |
| `CCBJ_FINANCEIRO` | Contratações, Pagamentos, Fluxo |
| `CCBJ_EQUIPES` | Funcionários, Escalas, Avaliações |
| `CCBJ_PESSOAL` | Tarefas, Processos, Demandas |
| `CCBJ_ESCUTA` | Pesquisas, Respostas, Alertas |
| `CCBJ_ACOES` | Ações, AcoesRecursos (Action Engine) |

O roteamento é feito por `_getSheet(nomeAba)` via `ABA_PARA_MODULO` em `core/utils.gs`.

IDs das planilhas ficam em `PropertiesService` (não hardcoded).

---

## Consequências

### Positivas

- Single Source of Truth por domínio
- Isolamento: falha em uma planilha não trava o sistema
- Permissões granulares por planilha no Drive
- Escalabilidade: planilhas menores são mais rápidas
- Setup automatizado via `core/setup.gs`

### Riscos

- Operações cross-domínio requerem múltiplas aberturas de planilha (mitigado por cache em `_abrirModulo`)
- Configuração inicial mais complexa — resolvida pelo `inicializarSistema()`

---

## Relação com Princípios

Respeita `docs/00_vision/principles.md #4` (Single Source of Truth) e `#8` (Escalabilidade Estrutural).

---

## Data

2026-05

---
