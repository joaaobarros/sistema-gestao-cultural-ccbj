# Sistema de Gestão Cultural — CCBJ

Sistema interno de gestão modular para operações culturais, administrativas e estratégicas do Centro Cultural Bom Jardim.

---

## Estrutura do Repositório

```
.
├── Saas-ERP-cultural-main/       ← código canônico (deploy via clasp)
│   ├── gas/src/
│   │   ├── core/                 ← infraestrutura (config, auth, logger, data_layer, events)
│   │   ├── action_engine/        ← motor de Ações Institucionais (máquina de estados)
│   │   ├── modules/              ← domínios: reservas, chaves, comunicacao, rh, financeiro…
│   │   ├── backend/              ← roteamento HTTP, admin, permissões, relatorios
│   │   └── html/                 ← frontend (layout, modulos, logic, modais)
│   └── docs/                     ← documentação técnica e ADRs
├── legacy/                       ← base legada (referência histórica, não deployada)
├── .clasp.json                   ← rootDir aponta para Saas-ERP-cultural-main/gas/src
└── README.md
```

---

## Deploy

```bash
# Enviar para Google Apps Script
clasp push

# Abrir no editor online
clasp open
```

O `rootDir` em `.clasp.json` aponta para `Saas-ERP-cultural-main/gas/src` — apenas a nova arquitetura é deployada.

---

## Documentação

- `Saas-ERP-cultural-main/docs/mapa_sistema.md` — visão geral da arquitetura
- `Saas-ERP-cultural-main/docs/index_tecnico.md` — índice técnico navegável
- `Saas-ERP-cultural-main/docs/migration/` — relatório de migração e ADRs
- `Saas-ERP-cultural-main/docs/arquitetura/` — permissões, escuta, padrões

---

## Camadas da Arquitetura

| Camada | Responsabilidade |
|--------|-----------------|
| `core/` | Infraestrutura pura: config, auth, data layer, Logger, SystemEvents |
| `action_engine/` | Entidade Ação: CRUD, 7 estados, associação de recursos |
| `modules/` | Domínios isolados: cada módulo encapsula suas regras |
| `backend/` | Roteamento HTTP (`doGet/doPost`), admin, permissões, relatórios |
| `html/` | Frontend GAS: layout, módulos visuais, lógica de UI |

Todas as mutações de domínio emitem `SystemEvents.emit(...)`. Logs padronizados via `Logger.info/warn/error`.
