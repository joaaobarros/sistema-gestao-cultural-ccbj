# ADR 0004 — Registro Dinâmico de Módulos

## Status

Aceito

---

## Contexto

O sistema cresceu com muitos módulos (>20), mas nem todos são relevantes para todos os contextos de uso. Módulos inativos geravam sidebar poluída, confusão operacional e carga desnecessária de inicialização.

A solução anterior era hardcode de módulos visíveis na função `mostrarAba`.

---

## Decisão

Foi criado `mod_modulos_registry.gs` — registro canônico de módulos com estado `ativo/inativo` persistido em `modulos_registry.json` via DataLayer.

Comportamento:

- `AppState.modulos` é carregado no boot (após permissões)
- `mostrarAba` verifica `AppState.modulos[moduloId]` antes de exibir
- `aplicarEstadoModulos()` controla visibilidade na sidebar dinamicamente
- Módulos núcleo (`agenda_geral`, `nova_reserva`, `configuracoes`, `auditoria`, `permissoes`) têm `nucleo: true` e não podem ser desativados
- Novos módulos no registro padrão são merged automaticamente no primeiro boot

Visibilidade do painel de gestão de módulos: apenas `isSuperadmin`.

---

## Consequências

### Positivas

- Implantação gradual: novos módulos podem ser ativados sem redeploy
- Sidebar limpa: só módulos ativados aparecem
- Favoritos filtram abas bloqueadas sem quebrar índices
- Fail-open: se o registro não carregar, todos os módulos ficam ativos

### Riscos

- Estado persiste em JSON (DataLayer) — deleção acidental do arquivo reseta para padrão
- Merge automático de novos módulos pode ativar algo indesejado em instalações existentes

---

## Relação com Princípio de Modularidade

Respeita `docs/00_vision/principles.md #2` (Modularidade) e `#11` (Evolução Controlada): novos módulos são incorporados de forma controlada, sem romper o sistema existente.

---

## Data

2026-05

---
