# ADR 0001 — Arquitetura Orientada a Ações

## Status

Aceito

---

## Contexto

Sistemas tradicionais de gestão cultural normalmente organizam sua arquitetura a partir de:

- departamentos
- formulários
- eventos isolados
- contratos
- financeiro

Esse modelo produz fragmentação operacional e dificulta integração entre fluxos institucionais.

Durante a modelagem do sistema foi identificado que a unidade operacional real da gestão cultural é a ação.

Uma ação articula simultaneamente:

- pessoas
- recursos
- tarefas
- reservas
- comunicação
- indicadores
- entregas
- relatórios

---

## Decisão

O sistema será orientado por ações.

A Action Engine funcionará como núcleo operacional do ecossistema.

Módulos devem preferencialmente se integrar:

- à ação
- à Action Engine
- aos eventos do sistema

e não diretamente entre si.

---

## Consequências

### Positivas

- redução de fragmentação
- melhoria de rastreabilidade
- integração sistêmica
- melhor leitura operacional
- fortalecimento da modularidade
- coerência institucional

---

### Riscos

- aumento inicial de complexidade arquitetural
- necessidade de modelagem consistente
- maior rigor estrutural

---

## Implicações Arquiteturais

- módulos devem reconhecer ações como entidade central
- integrações diretas excessivas devem ser evitadas
- eventos devem orbitar a Action Engine
- rastreabilidade deve partir da ação

---

## Relação com a Visão do Produto

Essa decisão fortalece:

- modularidade
- integração
- rastreabilidade
- inteligência operacional
- escalabilidade SaaS

---

## Data

2026

---