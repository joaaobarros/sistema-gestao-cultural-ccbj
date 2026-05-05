# 📄 Módulo — Gestão de Projetos (Ações)

## 1. Objetivo

Criar e gerenciar ações/projetos vinculados a contratos, estruturando todos os desdobramentos operacionais.

---

## 2. Definição de "Ação"

Uma ação pode ser:

- curso (ex: dança, teatro)
- espetáculo
- campanha
- evento
- projeto formativo
- projeto de difusão

---

## 3. Papel no Sistema

A ação é o **nó central de integração** entre:

- contratos
- reservas
- relatórios
- tarefas
- equipes

---

## 4. Funcionalidades

### Criação
- cadastro da ação
- tipo de ação
- período
- responsáveis

---

### Vinculações

#### Contratos
- professores
- prestadores
- bolsistas

---

#### Reservas
- salas
- equipamentos
- agenda

---

#### Relatórios
- CODIP
- relatórios institucionais
- prestação de contas

---

#### Tarefas
- planejamento
- execução
- acompanhamento

---

#### Equipes
- responsáveis
- participantes
- coordenação

---

## 5. Fluxo

- planejamento
- aprovado
- em execução
- concluído
- avaliado

---

## 6. Estrutura de Dados

Acao:
- id
- nome
- tipo
- descricao
- contratoVinculado
- responsavel
- equipe
- periodoInicio
- periodoFim
- status

---

## 7. Integrações

- contratos
- reservas
- tarefas
- relatórios
- financeiro
- RH

---

## 8. Impacto no Sistema

Este módulo:

- organiza toda a operação
- conecta módulos isolados
- reduz duplicidade de informação
- melhora qualidade dos relatórios

---

## 9. Riscos

- alta complexidade inicial
- necessidade de modelagem bem feita
- dependência de integração com múltiplos módulos

---

## 10. Alinhamento com a Visão

✔ integração total  
✔ rastreabilidade  
✔ apoio à execução real  
✔ geração de inteligência  

---

## 11. Próximos Passos

- definir modelo de dados completo
- mapear fluxos por tipo de ação
- integrar com reservas e contratos
- criar dashboard de ações

---

## 12. Modelo Estrutural da Ação (Núcleo do Sistema)

Cada ação conecta todos os recursos necessários para sua execução.

### 🔹 Pessoas (Quem faz)

- gestão (coordenação, supervisão)
- execução (professores, artistas, técnicos)
- apoio (produção, comunicação, administrativo)

Integra com:
- RH
- contratos
- equipes

---

### 🔹 Subsídios (Com o quê acontece)

#### Espaços
- salas
- auditórios
- áreas externas

→ integração com reservas

#### Almoxarifado
- equipamentos
- materiais
- insumos

→ integração com almoxarifado

---

### 🔹 Operação (O que precisa ser feito)

- tarefas
- checklists
- processos internos

→ integração com módulo de tarefas/processos

---

### 🔹 Estrutura Financeira (Quanto custa)

- contratos
- pagamentos
- custos operacionais

→ integração com financeiro

---

### 🔹 Execução (Quando acontece)

- agenda
- cronograma
- datas

→ integração com reservas

---

### 🔹 Entregas (O que gera)

- relatórios (CODIP, institucionais)
- registros
- indicadores

→ integração com relatórios

---

### 🔹 Comunicação (Como circula)

- divulgação
- campanhas
- cobertura

→ integração com comunicação

---

## 13. Visão Sistêmica

A ação funciona como um hub:

Pessoas → executam  
Subsídios → viabilizam  
Tarefas → organizam  
Reservas → estruturam o tempo/espaço  
Financeiro → sustenta  
Relatórios → comprovam  
Comunicação → amplifica  

---

## 14. Implicação Arquitetural

O sistema deixa de ser:

- módulos isolados

E passa a ser:

- um sistema centrado em ações

Onde todos os módulos orbitam a ação.