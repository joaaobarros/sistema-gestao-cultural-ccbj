# 🧠 Visão do Produto
Sistema de Gestão Cultural (CCBJ → SaaS)

---

## 1. Origem do Projeto

O sistema nasce como uma solução interna para o Centro Cultural Bom Jardim (CCBJ), com o objetivo de organizar, integrar e qualificar a gestão de processos culturais.

Desde sua concepção, já possui direcionamento estratégico para evoluir em um produto SaaS escalável.

---

## 2. Problema que Resolve

A gestão cultural é marcada por:

- Fragmentação de ferramentas
- Falta de integração entre áreas
- Dificuldade de acompanhar execução em tempo real
- Baixa qualidade na sistematização de dados para relatórios
- Retrabalho constante na prestação de contas

O sistema surge para centralizar, organizar e qualificar toda a operação.

---

## 3. Proposta de Valor

Um sistema completo de gestão cultural que acompanha:

→ Entrada do recurso  
→ Execução do projeto  
→ Operação cotidiana  
→ Monitoramento  
→ Entrega de relatórios  

Com foco em:

- Execução real (dia a dia)
- Tomada de decisão
- Geração de valor para financiadores
- Qualificação de dados para agentes culturais
- Qualificação do trabalho no campo cultural

---

## 4. Escopo Funcional

O sistema contempla:

- Gestão de espaços
- Gestão de equipes
- Gestão de contratos
- Gestão de projetos
- Gestão de metas e indicadores
- Gestão de relatórios
- Gestão de comunicação
- Gestão de processos

---

## 5. Princípios do Sistema

### 5.1 Simplicidade com profundidade
Interface simples, mas com capacidade avançada de operação.

### 5.2 Modularidade
Cada módulo deve funcionar:
- de forma independente
- e integrado ao sistema

### 5.3 Integração total
Evitar ilhas de informação.

### 5.4 Rastreabilidade
Toda ação deve ser rastreável.

### 5.5 Orientação à decisão
O sistema não é só operacional — é estratégico.

---

## 6. Experiência do Usuário

O sistema deve oferecer múltiplas formas de visualização:

- Kanban
- Listas
- Tabelas
- Agendas
- Checklists
- Dashboards
- Diagramas
- Mapas mentais (futuro)

Objetivo:

- Clareza de status
- Visão de fluxo
- Identificação de gargalos
- Distribuição de responsabilidades

---

## 7. Inteligência e Métricas

O sistema deve gerar:

### Operacionais
- Produtividade
- Tempo de execução
- Gargalos
- Clima institucional

### Financeiras
- Custos
- Execução orçamentária

### Culturais
- Perfil de público
- Território
- Alcance
- Impacto qualitativo

---

## 8. Evolução para SaaS

Após consolidação no CCBJ:

### Modelo de Produto
Sistema SaaS modular com planos:

- Individual básico
- Individual completo
- Pequenas equipes
- Organizações maiores

Cada plano acessa módulos específicos.

---

## 9. Papel do CCBJ

O CCBJ atua como:

- Ambiente de teste real
- Validador de funcionalidades
- Base de refinamento do produto

---

## 10. Riscos de Desvio

O sistema pode se desvirtuar se:

- Virar apenas um agregador de funcionalidades
- Perder simplicidade
- Não integrar módulos
- Não gerar inteligência (apenas dados)
- Crescer sem arquitetura clara

---

## 11. Critério de Validação Contínua

Toda evolução deve responder:

- Isso melhora a execução real?
- Isso reduz retrabalho?
- Isso gera mais clareza?
- Isso melhora a tomada de decisão?
- Isso aproxima ou afasta da visão SaaS?

---

## 12. Estado Atual

(em construção)

Este documento será atualizado continuamente com base na evolução real do sistema.

---

## 13. Tradução Técnica da Visão

Esta seção conecta a visão do produto com decisões de arquitetura e desenvolvimento.

### 13.1 Modularidade (Técnico)

- Cada módulo deve ter:
  - Responsabilidade clara
  - Baixo acoplamento
  - Interface definida (entrada/saída)
- Evitar dependência direta entre módulos
- Comunicação preferencial via camada de serviço

---

### 13.2 Integração

- Deve existir um ponto central de orquestração (core/app_state)
- Fluxos não devem ser duplicados em múltiplos arquivos
- Dados devem ter fonte única (single source of truth)

---

### 13.3 Estrutura de Dados

- Padronização de entidades (projetos, usuários, atividades, etc.)
- Evitar múltiplas versões do mesmo dado
- Preparação para futura migração de banco (Sheets → DB real)

---

### 13.4 Backend (Apps Script)

- Deve atuar como camada de serviço (API)
- Evitar lógica distribuída no frontend
- Centralizar regras críticas

---

### 13.5 Frontend

- Separação entre:
  - UI (visual)
  - Lógica
- Evitar JS espalhado em múltiplos HTML sem padrão

---

### 13.6 Escalabilidade SaaS

- Preparar:
  - multiusuário
  - multi-organização
  - controle de permissões
- Evitar hardcode de contexto (ex: CCBJ fixo)

---

### 13.7 Observabilidade

- Sistema deve permitir:
  - rastrear ações
  - identificar erros
  - entender fluxos

---

## 14. Critério Técnico de Qualidade

Um trecho do sistema é considerado adequado quando:

- Possui responsabilidade clara
- Não duplica lógica
- Está integrado ao fluxo geral
- Não quebra outros módulos
- Pode ser reutilizado
- Está preparado para evolução SaaS

---

## 15. Uso na Análise do Sistema

Este documento deve ser utilizado como referência para:

- Avaliação de arquivos
- Identificação de falhas
- Priorização de refatoração
- Tomada de decisão técnica

Cada análise de arquivo deve considerar:

→ Está alinhado com a visão?  
→ Está neutro?  
→ Está desviando o sistema?

---