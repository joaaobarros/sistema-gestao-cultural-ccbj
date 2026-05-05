# 📄 Análise de Arquivo — mod_reservas_js

## 1. Identificação
- Nome: mod_reservas_js.html
- Caminho: html/logic/mod_reservas_js.html
- Tipo: HTML (JS embutido)
- Camada: UI + Lógica de aplicação
- Módulo: Interface de reservas

---

## 2. Propósito

Gerenciar toda a camada de interação do usuário relacionada a reservas:

- preenchimento de formulários
- renderização da agenda
- filtros
- ações de edição/cancelamento
- integração com backend

---

## 3. Funções

### 🔹 SINCRONIZAÇÃO
- sincronizarAbaAtual

---

### 🔹 INICIALIZAÇÃO UI
- popularSelectsIniciais

---

### 🔹 CALENDÁRIO
- configurarCalendario

---

### 🔹 FORMULÁRIO
- resetarFormulario

---

### 🔹 CARRINHO
- renderizarCarrinhoItens
- removerItemCarrinho
- adicionarItemFixoCarrinho

---

### 🔹 FINALIZAÇÃO
- finalizarSucesso
- finalizarErro

---

### 🔹 DADOS
- carregarReservas

---

### 🔹 RENDERIZAÇÃO
- renderizarReservas
- _gerarLinhaReserva
- _parseDataMs
- _badgeRece

---

### 🔹 AÇÕES
- habilitarReserva
- confirmarCancelamento

---

### 🔹 FILTROS
- aplicarAtalhoPeriodo
- debounce

---

### 🔹 LOTE
- alternarModoLote
- selecionarModoLote
- selecionarSubModoMensal
- gerarDatasLote

---

## 4. Conexões

- Quem chama:
  - bootstrap_js (eventos)
  - UI (interações do usuário)

- Quem é chamado:
  - AppState
  - GAS (backend)
  - mod_ui_estado_js
  - mod_ui_componentes_js

- Integrações:
  - Flatpickr
  - SweetAlert (Swal)
  - DOM

---

## 5. Funcionalidades

- Sincronização de dados
- Preenchimento de selects
- Controle de calendário
- Gestão de formulário de reservas
- Renderização de agenda
- Filtros avançados
- Ações de edição/cancelamento
- Sistema de lote (recorrência)
- Integração com RECE
- Integração com comunicação

---

## 6. Possíveis Falhas

### 🔴 CRÍTICO
- Mistura de UI + lógica de negócio
- Dependência direta de AppState
- Estado fragmentado (variáveis globais + AppState)
- Regras de permissão na UI

---

### 🟠 MÉDIO
- Uso de arrays indexados (r[0], r[1])
- HTML gerado manualmente
- Alto acoplamento com DOM

---

### 🟡 BAIXO
- Possível duplicidade de renderizações
- Dependência de ordem de execução

---

## 7. Qualidade do Código

Pontos positivos:
- Cobertura funcional completa
- Interface rica
- Integração ampla

Pontos críticos:
- Baixa separação de responsabilidades
- Alto acoplamento
- Dificuldade de manutenção

---

## 8. Melhorias Sugeridas

- Separar UI de lógica de domínio
- Criar serviços específicos:
  - reservas_service
  - permissoes_service
  - recorrencia_service
- Centralizar estado (eliminar variáveis globais)
- Substituir arrays indexados por objetos
- Modularizar renderização
- Delegar totalmente lógica de disponibilidade para disponibilidade_module_js

---

## 9. Papel no Sistema

- Fluxo: interação do usuário
- Criticidade: 🔴 CRÍTICO

---

## 10. Tags

#ui #reservas #agenda #frontend #critico

---

## 11. Dependências

- Depende de:
  - AppState
  - server_bridge (GAS)
  - mod_ui_estado_js
  - DOM

- É dependência para:
  - fluxo de reservas
  - interação do usuário

---

---

## 12. Relação com Problemas Existentes

- erros na criação de reservas → conflito entre UI (mod_reservas_js) e núcleo (mod_ui_estado_js)
- inconsistência de dados → estado fragmentado (AppState + variáveis globais + DOM)
- falhas de sincronização → uso direto de GAS sem controle central de fluxo
- bugs intermitentes → dependência de ordem de execução e eventos
- problemas de permissão → regras duplicadas entre frontend e backend

---

## 13. Alinhamento com a Visão

Alinhado:
- alta capacidade operacional
- cobertura completa do fluxo de reservas
- integração com múltiplos módulos (RECE, comunicação, itens)

Desalinhado:
- baixa modularidade real
- acoplamento excessivo com estado global
- mistura de UI com lógica de domínio
- estrutura pouco preparada para escalabilidade SaaS