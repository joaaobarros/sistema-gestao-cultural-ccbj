# ADR 0005 — Configuração Institucional SaaS-Ready

## Status

Aceito

---

## Contexto

O sistema nasceu com valores institucionais hardcoded (nome da organização, pasta de dados, timezone). Isso violava o princípio de Neutralidade Institucional e impedia reutilização em outras organizações sem alteração de código.

---

## Decisão

Foi criado `config.gs` com `getOrgConfig()` que lê todos os parâmetros institucionais via `PropertiesService.getScriptProperties()`, com defaults para o contexto CCBJ.

Propriedades configuráveis:
- `ORG_NOME` — nome curto da organização
- `ORG_NOME_COMPLETO` — nome completo
- `ORG_SISTEMA_TITULO` — título do webapp
- `ORG_DATA_FOLDER` — nome da pasta Drive de dados
- `ORG_LOGO_URL` — logotipo para emails
- `ORG_DOMINIO` — domínio de email autorizado
- `ORG_TIMEZONE` — timezone

Cada deployment GAS configura suas propriedades sem tocar no código-fonte.

---

## Consequências

### Positivas

- Neutralidade institucional: nenhuma regra crítica depende de CCBJ especificamente
- Título do webapp dinâmico (`getOrgConfig().titulo`)
- DataLayer usa `getOrgConfig().dataFolder` para nomear a pasta Drive
- Preparado para multi-tenant: cada scriptId pode ter suas próprias PropertiesService

### Riscos

- `_orgConfigCache` precisa ser invalidado após `invalidarCacheOrgConfig()` se propriedades mudarem em runtime
- Defaults CCBJ permanecem no código — documentar claramente que são apenas defaults

---

## Relação com Princípios

Respeita `docs/00_vision/principles.md #9` (Neutralidade Institucional) e `#12` (Arquitetura Sobre Ferramenta).

---

## Data

2026-05

---
