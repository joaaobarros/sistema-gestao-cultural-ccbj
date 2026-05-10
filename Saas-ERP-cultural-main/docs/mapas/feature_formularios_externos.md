# 📄 Módulo — Solicitações (Demandas Externas)

---

## 1. Objetivo

Permitir que agentes externos ao CCBJ realizem:

- inscrições  
- solicitações de pauta  
- pedidos administrativos (declarações, documentos, etc.)  

Com fluxo estruturado de:

→ entrada → triagem → encaminhamento → execução → resposta → acompanhamento  

---

## 2. Problema que resolve

- demandas dispersas (WhatsApp, e-mail, presencial)  
- falta de rastreabilidade  
- sobrecarga manual das equipes  
- ausência de acompanhamento pelo solicitante  

---

## 3. Princípio Estrutural

Este módulo não é isolado.

Ele é a porta de entrada do **sistema de Demandas**, que integra:

- operações internas  
- infraestrutura  
- comunicação  
- financeiro  

---

## 4. Funcionalidades

### Entrada
- formulário público (link externo)
- categorias:
  - pauta
  - inscrição
  - documentos
  - outros

---

### Processamento
- criação automática de demanda
- geração de protocolo único
- classificação por tipo
- sugestão de setor responsável

---

### Distribuição
- encaminhamento para setor
- atribuição de responsável
- alertas internos

---

### Acompanhamento
- visualização pelo solicitante
- controle interno por status

Status:

- recebido  
- em análise  
- em andamento  
- aguardando  
- concluído  
- recusado  

---

### Comunicação
- resposta ao solicitante
- atualização de status
- histórico de interações

---

### Monitoramento
- volume de demandas  
- tempo de resposta  
- gargalos  
- setores mais acionados  

---

## 5. Dinâmica Completa do Sistema

---

### 🔐 Entrada e Identificação

Usuário acessa sistema

↓

Sistema captura email

↓

Verifica existência no sistema

→ NÃO existe  
   → entra como externo  
   → acesso apenas a formulários  

→ EXISTE  
   → verifica status  

      → aprovado  
         → acesso interno  

      → pendente  
         → permanece externo  

---

### 🧾 Criação de Solicitação

Usuário preenche formulário

↓

Sistema gera:

- demanda  
- protocolo único  

Ex:
SOL-2026-000123

↓

Armazena:

- email do solicitante  
- dados da solicitação  

---

### 📡 Acompanhamento

#### Mesmo email

→ acesso automático às próprias solicitações  

Pode ver:

- status  
- histórico  
- resposta  

---

#### Outro email

→ exige protocolo  

↓

Validação:

→ protocolo válido  

↓

Acesso limitado:

- status  
- descrição  
- resposta  

NÃO pode:

- editar  
- anexar  
- acessar dados sensíveis  

---

### 🔄 Fluxo Interno

Solicitação recebida

↓

Triagem

→ classificação  
→ definição de setor  

↓

Encaminhamento

→ atribuição de responsável  

↓

Execução

→ ação pelo setor  

↓

Resposta

→ retorno ao solicitante  

↓

Encerramento

→ registro final  

---

### 🧑‍💼 Solicitação de Acesso Interno

Usuário externo pode solicitar acesso:

↓

Preenche:

- nome  
- telefone  
- setor desejado  
- justificativa  

↓

Sistema cria:

Solicitação de Acesso

↓

Encaminha para:

- gestor do setor  
- admins  

---

### ✅ Aprovação por Setor

Gestor ou admin:

→ aprova ou recusa  

↓

Se aprovado:

- usuário vinculado ao setor  
- permissões atribuídas  
- status atualizado  

↓

Usuário passa a acessar sistema interno

---

## 6. Integrações

- AppState → solicitacoesExternas / demandas  
- backend → registro e fluxo  
- permissões → controle por setor  
- comunicação → respostas  
- escuta → análise de padrões  

---

## 7. Estrutura de Dados

### Solicitação

- id  
- protocolo  
- tipo  
- nomeSolicitante  
- emailSolicitante  
- contato  
- descricao  
- anexos  
- status  
- setorResponsavel  
- responsavel  
- dataCriacao  
- dataAtualizacao  

---

### Solicitação de Acesso

- id  
- usuarioEmail  
- setorSolicitado  
- justificativa  
- status (pendente | aprovado | recusado)  
- aprovadoPor  
- dataCriacao  
- dataResposta  

---

## 8. Níveis de Acesso

Externo:

- criar solicitação  
- acompanhar próprias demandas  

Externo + protocolo:

- acompanhar demanda específica  

Interno:

- operar demandas do setor  

Gestor:

- aprovar acessos  
- supervisionar fluxo  

Admin:

- controle total  

---

## 9. Riscos

- sobrecarga de demandas  
- triagem ineficiente  
- ausência de responsáveis claros  
- exposição indevida de dados  
- gargalos por setor  

---

## 10. Mecanismos de Controle

- toda demanda tem responsável  
- toda demanda tem status  
- toda demanda tem histórico  
- toda demanda gera protocolo  
- acesso externo sempre restrito  

---

## 11. Alinhamento com a Visão

✔ centraliza processos  
✔ reduz retrabalho  
✔ melhora comunicação  
✔ gera inteligência institucional  
✔ fortalece relação com território  

---

## 12. Próximos Passos

- definir formulário público  
- implementar geração de protocolo  
- criar painel de acompanhamento externo  
- estruturar triagem interna  
- implementar aprovação por setor  
- integrar com módulo de Demandas (núcleo)  
- integrar com notificações  

---