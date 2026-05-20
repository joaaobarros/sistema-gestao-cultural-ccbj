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

---

## 🧩 MODELO — ATIVO (Entidade Central)

Ativo

→ Identificação  
→ nome  
→ código  
→ tipo (consumível | móvel | fixo)  
→ categoria  
→ criticidade  

→ Localização  
→ tipo (estoque | balcão | fixo | emprestado)  
→ sala  
→ histórico  

→ Estoque  
→ qtdTotal  
→ qtdReservado  
→ disponível = total - reservado  

→ Ciclo de vida  
→ fase (aquisição | operação | manutenção | baixa)  
→ status (ativo | inativo | descartado)  
→ datas  

→ Financeiro  
→ contrato  
→ valor aquisição  
→ custo manutenção  
→ custo total  

→ Condição  
→ grau preservação  
→ índice saúde  

→ Manutenção  
→ última  
→ próxima  
→ periodicidade  

→ Uso  
→ total usos  
→ último uso  
→ taxa utilização  

→ Governança  
→ responsável  
→ setor  

---

## 🔄 MODELO — MOVIMENTAÇÃO

Movimentação

→ ativo  
→ tipo  
→ entrada  
→ saída  
→ transferência  
→ ajuste  

→ origem  
→ reserva  
→ manutenção  
→ manual  

→ quantidade  
→ data  
→ responsável  
→ observação  

---

## 📅 MODELO — USO (RESERVAS)

UsoAtivo

→ ativo  
→ reserva  

→ período  
→ início  
→ fim  

→ quantidade  

→ confirmação  
→ retirada confirmada  
→ devolução confirmada  

→ responsáveis  
→ retirada  
→ devolução  

---

## 🔧 MODELO — MANUTENÇÃO

Manutenção

→ ativo  
→ tipo  
→ preventiva  
→ corretiva  
→ inspeção  

→ descrição  
→ custo  
→ duração  

→ datas  
→ execução  
→ próxima prevista  

→ responsável  
→ status  

---

## 📉 MODELO — BAIXA

BaixaAtivo

→ ativo  

→ tipo  
→ venda  
→ doação  
→ perda  
→ descarte  

→ motivo  
→ valor recuperado  

→ data  
→ responsável  

---

## ⚠️ MODELO — ALERTA

AlertaInfra

→ ativo  

→ tipo  
→ manutenção atrasada  
→ risco  
→ estoque baixo  
→ ociosidade  

→ nível  
→ baixo  
→ médio  
→ alto  
→ crítico  

→ status  
→ ativo  
→ resolvido  

→ data  

---

## 🔁 MODELO — FLUXO RESERVA + ATIVO

Reserva

→ solicita ativos  

↓

Validação

→ disponibilidade (ativo + sala)  

↓

Bloqueio lógico

→ qtdReservado  

↓

Retirada (manual)

→ movimentação saída  

↓

Uso

→ registro de uso  

↓

Devolução

→ movimentação entrada  

↓

Atualização

→ condição  
→ métricas  
→ histórico  

---

## 📦 MODELO — DISPONIBILIDADE

DisponibilidadeAtivo

→ disponível = qtdTotal - qtdReservado  

→ bloqueios  
→ reservas futuras  

→ estados  
→ disponível  
→ reservado  
→ indisponível  

---

## 🧠 MODELO — MÉTRICAS

Indicadores

→ utilização  
→ uso / tempo  

→ custo total  
→ aquisição + manutenção  

→ saúde  
→ condição + falhas  

→ risco  
→ probabilidade × impacto  

---

## 🔮 MODELO — INTELIGÊNCIA

Regras

→ se uso ↑ → antecipar manutenção  

→ se custo manutenção > aquisição  
→ sugerir substituição  

→ se tempo sem uso ↑  
→ sugerir realocação  

→ se consumo recorrente ↑  
→ prever compra  

---

## 🔗 MODELO — INTEGRAÇÃO

Reservas  
→ gera uso  

Financeiro  
→ cria ativo  
→ alimenta custo  

RH  
→ define responsável  

Espaços  
→ define ativos fixos  

---

## 🧭 MODELO — MIGRAÇÃO

Itens (legado)

→ converter em ativos  

→ manter temporariamente  

→ eliminar dependência  

---
