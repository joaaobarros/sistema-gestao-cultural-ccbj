# 📄 Análise de Arquivo — mod_ui_componentes_js

## 1. Identificação
- Nome: mod_ui_componentes_js.html
- Caminho: html/logic/mod_ui_componentes_js.html
- Tipo: HTML (JS embutido)
- Camada: UI utilitária
- Módulo: Componentes globais de interface

---

## 2. Propósito

Fornecer utilitários reutilizáveis de interface para todo o sistema, incluindo:

- tratamento de erros do backend
- controle de loader global
- helpers de cor
- sanitização de HTML

---

## 3. Funções

### 🔹 TRATAMENTO DE ERRO
- _handleServerError
  - Esconde loader
  - Exibe erro via Swal
  - Trata caso especial "EM_BREVE"

---

### 🔹 CORES (UI)
- corBg
- corTexto
  - Mapeamento semântico → classes Tailwind

---

### 🔹 SEGURANÇA
- escaparHTML
  - Sanitização de string para evitar injeção HTML

---

### 🔹 LOADER
- showLoader
  - Controla overlay global (#globalLoader)

---

## 4. Conexões

- Quem chama:
  - server_bridge_js (erros)
  - mod_ui_estado_js
  - mod_reservas_js
  - outros módulos UI

- Quem é chamado:
  - DOM
  - Swal

- Integrações:
  - google.script.run (indiretamente via erro)
  - Tailwind CSS
  - SweetAlert (Swal)

---

## 5. Funcionalidades

- Tratamento padrão de erro
- Controle de loading global
- Padronização visual (cores)
- Segurança básica contra XSS
- Reutilização de UI

---

## 6. Possíveis Falhas

### 🔴 CRÍTICO
- Dependência implícita de Swal (não validado)
- Dependência de elemento DOM (#globalLoader)

---

### 🟠 MÉDIO
- Falta de fallback se Swal não existir
- Mapeamento de cores fixo (não configurável)

---

### 🟡 BAIXO
- Sanitização simples (não cobre todos os casos complexos)

---

## 7. Qualidade do Código

Pontos positivos:
- Funções pequenas e bem definidas
- Alta reutilização
- Boa separação de responsabilidade
- Código limpo

Pontos críticos:
- Dependências implícitas não protegidas
- Falta de validação de ambiente

---

## 8. Melhorias Sugeridas

- Validar existência de Swal antes de usar
- Criar fallback para erros (console ou modal simples)
- Tornar cores configuráveis
- Expandir sanitização para casos mais complexos
- Centralizar configuração de UI global

---

## 9. Papel no Sistema

- Fluxo: suporte global de interface
- Criticidade: 🔴 Alto

---

## 10. Tags

#ui #utilitarios #loader #erro #seguranca

---

## 11. Dependências

- Depende de:
  - DOM
  - Swal

- É dependência para:
  - praticamente todos os módulos frontend

---

## 12. Relação com Problemas Existentes

- erro não exibido → falha em _handleServerError
- loader travado → problema em showLoader
- erro visual inconsistente → uso direto de Swal em outros pontos

---

## 13. Alinhamento com a Visão

Alinhado:
- reutilização
- padronização
- suporte à interface

Desalinhado:
- dependências não controladas
- ausência de configuração centralizada