# 📄 Análise de Arquivo — app_state_js

## 1. Identificação
- Nome: app_state_js.html
- Caminho: html/logic/core/app_state_js.html
- Tipo: HTML (JS embutido)
- Camada: Core / Estado global
- Módulo: Sistema inteiro (transversal)

---

## 2. Propósito

Centralizar o estado global da aplicação frontend através de um singleton (AppState) e manter estados transitórios do formulário de reserva.

Atua como:
- fonte de verdade local
- cache de dados do backend
- ponto de compartilhamento entre módulos

---

## 3. Funções

### indexarVinculos
- Descrição: Placeholder para conexão entre RH, financeiro e reservas
- Parâmetros: nenhum
- Retorno: nenhum
- Dependências: dados de RH, reservas e financeiro

---

## 4. Conexões

- Quem chama:
  - Todos os módulos frontend
  - UI (formulários, calendário)
  - módulos de reservas, RH, escuta

- Quem é chamado:
  - Nenhum diretamente

- Integrações:
  - Backend via services/server_bridge_js.html (GAS)
  - módulos de UI e lógica

---

## 5. Funcionalidades

- Centralização de estado global
- Cache de dados do backend
- Controle de sessão (usuário)
- Controle de filtros
- Estrutura para RH
- Estrutura para pesquisas
- Estrutura para escuta
- Base para integração entre módulos

---

## 6. Possíveis Falhas

- Crescimento descontrolado do AppState (acúmulo de responsabilidades)
- Ausência de controle de mutação (qualquer módulo altera qualquer coisa)
- Falta de padronização de acesso ao estado
- Mistura de domínios (RH, reservas, escuta, financeiro no mesmo objeto)
- Função indexarVinculos não implementada (integração incompleta)
- Uso de variáveis globais com var (risco de poluição de escopo)
- Falta de ciclo de vida do estado (init, update, listeners)
- Forte acoplamento com mod_ui_estado_js (núcleo operacional depende diretamente do estado global)

---

## 7. Qualidade do Código

Pontos positivos:
- Bem comentado
- Estrutura clara
- Intenção explícita

Pontos críticos:
- Sem encapsulamento
- Sem controle de acesso
- Alto acoplamento
- Falta de padrão de atualização

---

## 8. Melhorias Sugeridas

- Criar funções de acesso ao estado (getState / setState)
- Separar domínios (reservas, RH, financeiro, etc.)
- Implementar indexarVinculos
- Criar sistema de eventos (listeners)
- Padronizar mutações
- Reduzir uso de variáveis globais fora do AppState

---

## 9. Papel no Sistema

- Fluxo: todos
- Criticidade: 🔴 Crítico

Se falhar, compromete todo o sistema.

---

## 10. Tags

#core #estado #arquitetura #critico #integracao #dados

---

## 11. Dependências

- Depende de: nenhum arquivo
- É dependência para: todo o frontend

---

## 12. Relação com Problemas Existentes

- Erro ao criar nova pesquisa → possível despadronização em AppState.pesquisas
- Integração com banco inconsistente → possível divergência em colecoes
- Fluxos confusos → mutações não controladas do estado

---

## 13. Alinhamento com a Visão

Alinhado:
- centralização de estado
- tentativa de integração

Desalinhado:
- baixa modularidade
- ausência de controle
- risco de monolito de estado