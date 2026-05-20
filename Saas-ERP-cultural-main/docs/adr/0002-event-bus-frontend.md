# ADR 0002 — EventBus Frontend (Pub/Sub)

## Status

Aceito

---

## Contexto

O frontend do sistema (GAS HTML Service) cresceu com múltiplos módulos JavaScript carregados em sequência no mesmo escopo global. Módulos como `permissoes_ui_js`, `navegacao_ui_js` e `mod_ui_estado_js` precisavam reagir a eventos uns dos outros sem acoplamento direto.

O padrão original usava `window._onShow_aba_xxx` como convenção de callbacks, mas dependia de invocação explícita na função `mostrarAba`, criando acoplamento crescente.

---

## Decisão

Foi introduzido um EventBus pub/sub singleton (`html/logic/core/event_bus_js.html`) como PRIMEIRO script carregado no `Index.html`.

O EventBus expõe: `on`, `once`, `off`, `emit`, `clear`.

Convenção de nomes adotada (frontend):
- `aba:<id>:show` — aba exibida
- `app:<fase>` — fases do boot (`app:pronto`, `app:usuario:carregado`)
- `permissoes:<fase>` — ciclo de permissões
- `<dominio>:<evento>` — eventos operacionais (`reserva:criada`, `chave:status_alterado`)

---

## Consequências

### Positivas

- Módulos reagem a eventos sem depender uns dos outros
- Boot controlado por eventos (não por setTimeout)
- Observabilidade dos fluxos de inicialização
- `_onShow_aba_xxx` continua funcionando como fallback mas não é obrigatório

### Riscos

- Eventos mal nomeados geram confusão — convenção deve ser respeitada
- Erros silenciosos em listeners (`try/catch` interno ao emit)

---

## Relação com o Modelo de Eventos

Este ADR resolve a camada frontend do modelo de eventos definido em `docs/01_architecture/event_model.md`.

O equivalente backend é o `SystemEvents` (`core/event_bus_backend.gs`).

---

## Data

2026-05

---
