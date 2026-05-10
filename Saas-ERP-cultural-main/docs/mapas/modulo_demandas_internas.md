# 📄 Módulo — Demandas Internas

## 1. Objetivo

Estruturar e centralizar a criação, distribuição e acompanhamento de demandas internas do CCBJ.

---

## 2. Tipos de Demanda

- Contratação de professores
- Contratação de profissionais
- Contratação de serviços:
  - equipamentos
  - transporte
  - alimentação
- Bolsistas

---

## 3. Problema que resolve

- solicitações informais (WhatsApp, verbal, e-mail)
- falta de rastreabilidade
- retrabalho na gestão
- dificuldade de priorização

---

## 4. Funcionalidades

### Entrada
- formulário interno padronizado
- categorização por tipo de demanda
- anexos

---

### Processamento
- geração automática de demanda
- classificação por tipo
- validação inicial

---

### Distribuição
- encaminhamento automático ou manual
- vínculo com setor responsável:
  - RH
  - Financeiro
  - Produção
  - Gestão

---

### Fluxo
- solicitado
- em análise
- aprovado
- em execução
- concluído
- rejeitado

---

### Acompanhamento
- painel interno por setor
- filtros por tipo, status, responsável

---

### Integrações

- RH (contratações)
- financeiro (custos)
- contratos
- tarefas
- notificações

---

## 5. Estrutura de Dados

DemandaInterna:
- id
- tipo
- subtipo
- solicitante
- setorSolicitante
- descricao
- anexos
- status
- setorResponsavel
- responsavel
- prioridade
- dataCriacao
- dataAtualizacao

---

## 6. Riscos

- excesso de burocratização
- sobrecarga de análise
- necessidade de fluxo claro por tipo

---

## 7. Alinhamento com a Visão

✔ organização interna  
✔ rastreabilidade  
✔ redução de retrabalho  
✔ base para indicadores de gestão  

---

## 8. Próximos Passos

- definir formulários por tipo
- mapear fluxos específicos (RH, financeiro, produção)
- criar painel de gestão
- integrar com notificações