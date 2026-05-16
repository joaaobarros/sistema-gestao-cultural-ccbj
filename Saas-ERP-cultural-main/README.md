# Sistema de Gestão Cultural CCBJ

Plataforma institucional transversal de gestão cultural construída sobre Google Apps Script (GAS). Integra ações, equipes, contratos, reservas, tarefas, reuniões, processos administrativos e inteligência institucional em uma única SPA.

> Documentação técnica completa: **[ARQUITETURA.md](./ARQUITETURA.md)**

---

## Estado Atual (2026-05)

| Camada | Status |
|--------|--------|
| Backend (controllers + engines) | ✅ Estável — 25 controllers, 19 engines |
| Bridge frontend→backend | ✅ Completo — 25 namespaces GAS.* |
| Decomposição HTML/JS | ✅ Concluída — 28 módulos separados |
| Migração google.script.run | ✅ Concluída — zero chamadas diretas fora de auth |
| Módulos ativos | 14 ativos, 13 em beta |
| Migração CRUD → repositories | 🔄 Fase 5 (pendente) |

---

## Módulos Ativos

Reservas · Ações · Habilitações · Aprovações · Agenda RECE · Protocolo de Chaves · Dashboard · Configurações · Auditoria · Permissões · Gestão de Módulos · Almoxarifado · Eficiência · Balcão da Comunicação

## Módulos em Beta

Tarefas · Reuniões · RH · Contratos · Financeiro · Escuta · Processos Adm. · Solicitações · Pauta Externa · CODIP · Relatórios Financeiros · Contratações · Agenda Geral

---

## Princípios

- Orientação por ações institucionais como unidade central
- Modularidade com baixo acoplamento via bridge tipada
- Rastreabilidade: toda escrita passa por `AuditoriaService` e `EventBus`
- FSM para transições de status em todos os domínios
- Separação rígida entre estrutura HTML e lógica JavaScript

---

## Quick Start para Desenvolvedores

1. Ler [ARQUITETURA.md](./ARQUITETURA.md) — visão geral, padrões e regras
2. Para adicionar um módulo: HTML em `html/modulos/` + JS em `html/logic/` + include em `Index.html` + entry em `mod_modulos_registry.gs` + botão na sidebar
3. Toda chamada ao backend via `GAS.namespace.método()` — nunca `google.script.run` diretamente
4. Todo controller retorna `GasResponse.wrap()` — nunca valor bruto
5. Botões de ação usam `BtnGuard.gas()` — proteção contra duplo-clique obrigatória
