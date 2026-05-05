# 📄 Módulo — Solicitações Externas (Agentes)

## 1. Objetivo

Permitir que agentes externos ao CCBJ realizem:

- inscrições
- solicitações de pauta
- pedidos administrativos (declarações, documentos, etc.)

Com fluxo estruturado de:

- entrada → triagem → encaminhamento → resposta

---

## 2. Problema que resolve

- demandas dispersas (WhatsApp, e-mail, presencial)
- falta de rastreabilidade
- sobrecarga manual das equipes
- ausência de acompanhamento por parte do solicitante

---

## 3. Funcionalidades

### Entrada
- formulário público (link externo)
- categorias de solicitação:
  - pauta
  - inscrição
  - documentos
  - outros

---

### Processamento
- criação automática de demanda no sistema
- classificação por tipo
- atribuição automática/manual de setor responsável

---

### Distribuição
- encaminhamento para equipes (NArTE, Ação Cultural, ECA, etc.)
- alertas internos

---

### Acompanhamento
- painel interno de gestão de demandas
- status:
  - recebido
  - em análise
  - em andamento
  - concluído
  - recusado

---

### Comunicação
- resposta ao solicitante
- notificações de atualização de status

---

### Monitoramento
- dashboard de demandas:
  - volume
  - tempo de resposta
  - gargalos
  - setores mais acionados

---

## 4. Integrações

- AppState (novo domínio: solicitacoesExternas)
- server_bridge (backend)
- mod_permissoes (acesso interno)
- comunicacaoProcessos (fluxo de resposta)
- escuta (análise de demandas)

---

## 5. Estrutura de Dados (inicial)

Solicitacao:
- id
- tipo
- nomeSolicitante
- contato
- descricao
- anexos
- status
- setorResponsavel
- responsavel
- dataCriacao
- dataAtualizacao

---

## 6. Riscos

- sobrecarga de demandas
- necessidade de triagem eficiente
- dependência de fluxo interno bem definido

---

## 7. Alinhamento com a Visão

✔ centraliza processos  
✔ reduz retrabalho  
✔ melhora comunicação  
✔ gera dados estratégicos  
✔ fortalece relação com território  

---

## 8. Próximos Passos

- definir modelo de formulário
- criar backend (registro de solicitações)
- criar painel interno
- definir fluxos por setor
- integrar com notificações