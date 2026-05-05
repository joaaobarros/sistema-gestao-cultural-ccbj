# 🧠 MAPA — Infraestrutura / Almoxarifado (Completo)

---

## 🧩 NÍVEL 1 — TRANSFORMAÇÃO

Atual:
→ reservas + itens isolados

Futuro:
→ infraestrutura integrada (ativos + fluxo + decisão)

---

## 🧱 NÍVEL 2 — DOMÍNIOS

INFRAESTRUTURA

→ Ativos  
→ Movimentações  
→ Uso  
→ Manutenção  
→ Baixa  
→ Alertas  

---

## 🧬 NÍVEL 3 — ENTIDADE CENTRAL

ATIVO

→ identificação  
→ localização  
→ estoque  
→ ciclo de vida  
→ financeiro  
→ condição  
→ manutenção  
→ uso  
→ governança  

---

## 🔁 NÍVEL 4 — TIPOS

Consumível  
→ sai  
→ não retorna  

Móvel  
→ sai  
→ retorna  

Fixo  
→ não sai  
→ pertence ao espaço  

---

## 🔄 NÍVEL 5 — FLUXO CENTRAL (RESERVAS + ESTOQUE)

### Fluxo completo

Reserva criada  
→ registra intenção  

Reserva aprovada  
→ validar disponibilidade (ativo + sala)  

→ GAS.verificarDisponibilidadeAtivos  

↓

Itens bloqueados (lógico, não físico)

↓

RETIRADA (manual obrigatória)

→ GAS.registrarRetirada  

→ gera movimentação  
→ reduz estoque  

↓

EVENTO

↓

DEVOLUÇÃO (se aplicável)

→ GAS.registrarDevolucao  

↓

FINALIZAÇÃO

→ atualizar estado do ativo  
→ atualizar métricas  

---

## ⚙️ NÍVEL 6 — CAMADA GAS (EXECUÇÃO)

### Núcleo de ativos

criarAtivo  
atualizarAtivo  
obterAtivos  

---

### Estoque / movimentação

movimentarAtivo  
→ entrada  
→ saída  
→ transferência  
→ ajuste  

---

### Fluxo com reservas

verificarDisponibilidadeAtivos  
reservarAtivos (lógico)  
registrarRetirada  
registrarDevolucao  

---

### Manutenção

registrarManutencao  
obterManutencoes  
calcularProximaManutencao  

---

### Baixa

darBaixaAtivo  
→ venda  
→ doação  
→ perda  
→ descarte  

---

### Inteligência

calcularIndicadores  
gerarAlertas  

---

## 🔗 NÍVEL 7 — INTEGRAÇÕES

### RESERVAS (CRÍTICO)

Entrada:
→ itens solicitados  

Saída:
→ uso real  

Integrações:

- bloquear disponibilidade  
- registrar uso  
- alimentar métricas  

---

### FINANCEIRO

→ contratacao cria ativo  
→ custo alimenta ativo  

---

### RH

→ responsável pelo ativo  
→ rastreio de uso  

---

### ESPAÇOS

→ define ativos fixos  
→ substitui lógica antiga  

---

## 📊 NÍVEL 8 — MÉTRICAS

Utilização  
→ uso / tempo  

Custo total  
→ aquisição + manutenção  

Saúde  
→ condição + falhas  

Risco  
→ probabilidade × impacto  

---

## 🔮 NÍVEL 9 — INTELIGÊNCIA

Manutenção preditiva  
→ uso + tempo  

Consumo  
→ padrão por setor  

Ociosidade  
→ tempo sem uso  

Reposição  
→ previsão  

---

## 🧭 NÍVEL 10 — MIGRAÇÃO

Itens (legado)

→ manter temporariamente  
→ migrar para ativos  
→ remover dependência  

---

## 🖥️ NÍVEL 11 — FRONTEND

AppState.infraestrutura

→ ativos  
→ movimentacoes  
→ manutencoes  
→ usos  
→ baixas  
→ alertas  

---

## 🧱 NÍVEL 12 — SETUP

Abas:

Ativos  
MovimentacoesAtivos  
Manutencoes  
UsoAtivos  
BaixasAtivos  
AlertasInfra  

---

## 🚧 NÍVEL 13 — ROADMAP

Fase 1  
→ setup ✔  

Fase 2  
→ CRUD ativos  

Fase 3  
→ movimentação  

Fase 4  
→ integração reservas (CRÍTICO)  

Fase 5  
→ manutenção  

Fase 6  
→ financeiro  

Fase 7  
→ inteligência  

---

## ⚠️ NÍVEL 14 — RISCOS

Duplicação (Itens vs Ativos)  
Baixa automática  
Falta de validação humana  
Integração incompleta  

---

## 🎯 NÍVEL 15 — VALIDAÇÃO

Sistema responde:

Onde está  
Quem usou  
Quanto custou  
Qual estado  
Precisa manutenção  
Vale manter  

---

## 🧨 NÍVEL 16 — ESTADO ATUAL

Setup  
→ pronto  

Estrutura  
→ pronta  

Fluxo  
→ não implementado  

Integração reservas  
→ não implementada  

---

## 🚀 NÍVEL 17 — PRÓXIMO PASSO

Implementar:

→ GAS.verificarDisponibilidadeAtivos  
→ GAS.registrarRetirada  
→ GAS.registrarDevolucao  

Sem isso:
→ sistema não funciona na prática  

---