# 📄 Análise de Arquivo — mod_permissoes_js

## 1. Identificação
- Nome: mod_permissoes_js.html
- Caminho: html/logic/mod_permissoes_js.html
- Tipo: HTML (JS embutido)
- Camada: Lógica de controle de acesso
- Módulo: Permissões

---

## 2. Propósito

Gerenciar o sistema de permissões no frontend, incluindo:

- verificação de acesso (temPermissao)
- carregamento de permissões do backend
- aplicação de permissões na UI

---

## 3. Funções

### 🔹 temPermissao
- Descrição:
  Verifica se o usuário pode executar uma ação em um módulo
- Prioridade:
  - superadmin → acesso total
  - permissões específicas (backend)
  - fallback por perfil (isAdmin)
- Retorno:
  boolean

---

### 🔹 carregarPermissoes
- Descrição:
  Busca permissões do backend via GAS
- Atualiza:
  AppState.usuario.permissoes
  AppState.usuario.perfil
- Comportamento:
  falha silenciosa com fallback

---

### 🔹 aplicarPermissoesUI
- Descrição:
  Oculta elementos DOM com base em permissões
- Estratégia:
  atributo data-requer-permissao="modulo:acao"

---

### 🔹 Inicialização (DOMContentLoaded)
- Estratégia:
  polling via setTimeout
- Objetivo:
  aguardar AppState estar pronto antes de carregar permissões

---

## 4. Conexões

- Quem chama:
  - bootstrap (indiretamente)
  - DOMContentLoaded

- Quem é chamado:
  - GAS.permissoes
  - AppState

- Integrações:
  - server_bridge_js
  - AppState.usuario
  - DOM

---

## 5. Funcionalidades

- Controle de acesso por módulo e ação
- Fallback automático por perfil
- Integração com backend
- Ocultação dinâmica de UI
- Sistema híbrido (permissões + flags)

---

## 6. Possíveis Falhas

### 🔴 CRÍTICO
- Polling com setTimeout para aguardar AppState (arquitetura frágil)
- Falha silenciosa ao carregar permissões (pode mascarar erros)
- Regras de permissão no frontend (não confiável para segurança real)

---

### 🟠 MÉDIO
- Duplicação de lógica com backend
- Dependência de estrutura específica de dados (data.modulos)
- Ocultação via CSS (elemento ainda existe no DOM)

---

### 🟡 BAIXO
- Limite fixo de tentativas (30)
- Dependência de atributos HTML manuais

---

## 7. Qualidade do Código

Pontos positivos:
- Estrutura clara
- Boa separação funcional
- Fallback bem pensado
- Fácil integração com UI

Pontos críticos:
- Dependência de timing (polling)
- Falta de sincronização real com inicialização
- Segurança parcial (frontend)

---

## 8. Melhorias Sugeridas

- Substituir polling por evento (ex: AppStateReady)
- Criar contrato de permissões (schema)
- Centralizar validação no backend
- Usar disable em vez de ocultar elementos críticos
- Criar cache estruturado de permissões
- Validar retorno do backend

---

## 9. Papel no Sistema

- Fluxo: controle de acesso
- Criticidade: 🔴 Alto

---

## 10. Tags

#permissoes #acesso #seguranca #ui #critico

---

## 11. Dependências

- Depende de:
  - AppState
  - server_bridge (GAS)

- É dependência para:
  - mod_reservas_js
  - mod_ui_estado_js
  - todos os módulos com UI condicional

---

## 12. Relação com Problemas Existentes

- ações indevidas disponíveis → falha em temPermissao
- UI inconsistente → falha em aplicarPermissoesUI
- permissões não carregadas → falha silenciosa
- comportamento imprevisível → timing do polling

---

## 13. Alinhamento com a Visão

Alinhado:
- modularidade
- integração com backend
- controle granular

Desalinhado:
- dependência de timing
- lógica distribuída (frontend + backend)
- ausência de contrato formal