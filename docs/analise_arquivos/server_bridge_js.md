# 📄 Análise de Arquivo — server_bridge_js

## 1. Identificação
- Nome: server_bridge_js.html
- Caminho: html/logic/services/server_bridge_js.html
- Tipo: HTML (JS embutido)
- Camada: Serviços / Integração backend
- Módulo: Comunicação frontend ↔ Apps Script

---

## 2. Propósito

Centralizar todas as chamadas ao backend (Google Apps Script) através de um objeto único (GAS), padronizando:

- chamadas assíncronas
- tratamento de erro
- organização por domínio

---

## 3. Funções e Estruturas Funcionais

### 3.1 GAS._call
- Tipo: Função central
- Descrição:
  Encapsula google.script.run com:
  - successHandler
  - failureHandler
  - padronização de argumentos
- Impacto: 🔴 CRÍTICO — todas as chamadas passam por aqui

---

### 3.2 GAS._stub
- Tipo: Função auxiliar
- Descrição:
  Retorna resposta simulada para funcionalidades não implementadas
- Uso atual: IA.chat

---

### 3.3 Namespaces (Estrutura funcional)

Cada bloco representa um domínio do sistema:

- reservas → CRUD + disponibilidade
- admin → config, logs, métricas, IA
- rece → agenda RECE + exportações
- ia → integração com IA
- contratos → gestão contratual
- sessao → login, logout, preferências
- solicitacoes → fluxo de solicitações
- comunicacao → calendar + e-mail
- documentos → geração de arquivos
- tarefas → gestão de tarefas
- processos → fluxos internos
- almoxarifado → estoque
- balcao → atendimentos
- comunicacaoProcessos → fluxos de comunicação
- entregas → entregas vinculadas
- revisao → revisões
- equipes → RH operacional
- eficiencia → métricas
- contratacoes → financeiro
- financeiro → legado (duplicado)
- rh → RH expandido
- escuta → escuta institucional

---

## 4. Conexões

- Quem chama:
  - Todos os módulos frontend (via Index.html)

- Quem é chamado:
  - Backend (.gs)

- Integrações:
  - google.script.run
  - _handleServerError (UI)
  - Inicializado via ordem definida em Index.html

---

## 5. Funcionalidades

- Centralização de chamadas backend
- Organização por domínio
- Encapsulamento da API
- Base para escalabilidade
- Redução de duplicação de chamadas

---

## 6. Possíveis Falhas

- Backend acoplado por string (sem validação)
- Ausência de contrato de dados
- Dependência silenciosa de _handleServerError
- Crescimento excessivo do objeto GAS
- Duplicidade entre financeiro e contratacoes
- Uso de callbacks dificulta manutenção
- Dependência indireta de mod_ui_componentes_js (_handleServerError)

---

## 7. Qualidade do Código

Pontos positivos:
- Organização excelente
- Centralização correta
- Estrutura clara

Pontos críticos:
- Sem tipagem
- Sem validação
- Sem contrato de dados
- Acoplamento forte com backend

---

## 8. Melhorias Sugeridas

- Implementar validação de payload
- Criar contratos de dados (schemas)
- Migrar para async/await
- Modularizar namespaces
- Criar logging estruturado
- Remover duplicidades (financeiro vs contratacoes)

---

## 9. Papel no Sistema

- Fluxo: todos (integração)
- Criticidade: 🔴 Crítico

---

## 10. Tags

#services #backend #integracao #gas #critico #api

---

## 11. Dependências

- Depende de:
  - google.script.run
  - _handleServerError

- É dependência para:
  - todo frontend

---

## 12. Relação com Problemas Existentes

- Erro ao salvar dados → falha em _call
- Inconsistência de dados → falta de contrato
- Bugs intermitentes → ausência de validação

---

## 13. Alinhamento com a Visão

Alinhado:
- centralização
- integração
- organização por domínio

Desalinhado:
- ausência de controle de dados
- estrutura não preparada para SaaS robusto
- acoplamento backend elevado