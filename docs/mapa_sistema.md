# 🧠 Mapa do Sistema CCBJ

## 1. Visão Geral

Sistema modular baseado em:
- HTML como camada de interface
- JS embutido em HTML como lógica
- Google Apps Script como backend
- Google Sheets como banco de dados

---

## 2. Estrutura Atual

### UI
- html/modulos
- html/layout

### Lógica
- logic/core
- logic/modules

### Serviços
- services/

### Backend
- Arquivos .gs

---

## 3. Problemas Estruturais Iniciais (Hipóteses)

- Mistura de camadas (HTML + JS + lógica)
- Acoplamento entre módulos
- Falta de API central
- Fluxos não padronizados
- Baixa rastreabilidade de dados

---

## 4. Estratégia de Análise

Cada arquivo será analisado individualmente e conectado ao sistema geral.