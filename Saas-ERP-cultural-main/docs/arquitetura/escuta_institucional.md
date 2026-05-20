# Escuta Institucional Contínua — Documentação do Sistema

**Sistema:** CCBJ — Centro Cultural dos Correios Brasília  
**Versão:** 1.0  
**Data:** Maio/2026  
**Autor técnico:** João Paulo Barros

---

## 1. Visão Geral

O Sistema de Escuta Institucional Contínua é uma camada transversal do CCBJ que captura, processa e analisa sinais sobre o clima organizacional de forma contínua, ética e adaptativa. Não é um módulo isolado — é infraestrutura institucional.

### 1.1 Objetivos

- Monitorar continuamente o clima organizacional
- Identificar padrões estruturais de bem-estar e sofrimento
- Detectar desigualdades internas por perfil (gênero, raça, vínculo, nível)
- Monitorar riscos psicossociais nos termos da **NR-1 (2024)**
- Apoiar decisões institucionais com evidências
- Garantir uso ético, anônimo e responsável dos dados
- Gerar relatórios periódicos confiáveis

### 1.2 Princípios Fundamentais

| Princípio | Aplicação |
|-----------|-----------|
| Mínimo atrito | Widget não-invasivo, 1 pergunta por vez |
| Coleta mínima necessária | Saturação automática por dimensão |
| Qualidade sobre quantidade | Confiança mínima antes de conclusões |
| Sistema adaptativo | Perguntas selecionadas por contexto temporal |
| Não-invasividade | Widget flutuante, descartável, com "responder depois" |
| Foco em padrão | Análise agregada, nunca individual |
| Ética e responsabilidade | Anonimização, grupo mínimo, acesso diferenciado |

---

## 2. Metodologia de Coleta

### 2.1 Pesquisas Pulse (Adaptativas)

Perguntas curtas (1 por sessão) exibidas como widget flutuante no canto inferior direito da tela, sem bloquear o fluxo de trabalho.

**Critérios de exibição:**
1. Sistema global ativo
2. Usuário não atingiu limite diário (padrão: 3 perguntas/dia)
3. Intervalo anti-spam respeitado (padrão: 4h entre perguntas)
4. Progresso do turno compatível com o tipo da pergunta
5. Dimensão não saturada no período
6. Pergunta não respondida pelo usuário nas últimas 48h
7. Momento propício (10%–95% do turno)

**Prioridade de perguntas:**
1. Pesquisas personalizadas **direcionadas** ao usuário (maior prioridade)
2. Pesquisas personalizadas **gerais** (segunda prioridade)
3. Banco padrão institucional (ordem por menor cobertura de dimensão)

### 2.2 Escuta Espontânea

Canal para registro livre de relatos, disponível a qualquer momento via painel dedicado.

- Categorias: apoio, carga, comunicação, conflito, liderança, positivo, ambiente, outro
- Texto livre opcional
- Anonimato configurável pelo usuário
- Análise automática de sentimento (positivo/negativo/neutro)
- **Não é canal de denúncia formal**

### 2.3 Pesquisas Personalizadas

Criadas manualmente por perfis autorizados (RH ou Gestor Geral) com:
- Título e período de vigência
- Perguntas customizadas (dimensão, tipo, tipoTempo)
- Status (ativo/inativo)
- Prioridade numérica
- Direcionamento opcional por vínculo, nível, tempo de casa, setor, usuário

---

## 3. Contexto Temporal

### 3.1 Sistema de 3 Turnos

| Turno | Início | Fim |
|-------|--------|-----|
| Manhã | 07:00 | 13:59 |
| Tarde | 14:00 | 17:59 |
| Noite | 18:00 | 22:59 |

### 3.2 Progresso do Turno

```
progresso = (hora_atual - inicio_turno) / (fim_turno - inicio_turno)
```

### 3.3 Validade por Tipo de Pergunta

| Tipo | Condição |
|------|----------|
| `instantanea` | Sempre válida (progresso ≥ 0%) |
| `acumulativa` | Progresso ≥ 50% do turno |
| `final` | Progresso ≥ 75% do turno |

**Zona proibida:** início do turno (< 10%) e fim do turno (> 95%) — evita pressão e rushing.

---

## 4. Dimensões Monitoradas

| Dimensão | Código | Perguntas | Inversão |
|----------|--------|-----------|----------|
| Energia | `energia` | 3 | Não |
| Carga de Trabalho | `carga` | 3 | **Sim** (maior = pior) |
| Clareza | `clareza` | 3 | Não |
| Apoio | `apoio` | 3 | Não |
| Autonomia | `autonomia` | 3 | Não |
| Cultura | `cultura` | 3 | Não |
| Liderança | `lideranca` | 3 | Não |
| Risco Psicossocial | `risco_psicossocial` | 3 | **Sim** (maior = pior) |

**Total padrão:** 24 perguntas institucionais, todas ativáveis/desativáveis individualmente.

---

## 5. Indicadores

### 5.1 Indicador por Dimensão

```
score_dimensao = média_ponderada(respostas_dimensao)
score_invertido = 6 - score_bruto  [para carga e risco_psicossocial]
```

**Níveis de clima:**

| Score | Nível |
|-------|-------|
| ≥ 4.5 | Excelente |
| ≥ 3.5 | Bom |
| ≥ 2.5 | Regular |
| ≥ 1.5 | Baixo |
| < 1.5 | Crítico |

### 5.2 Clima Geral

Média aritmética dos indicadores positivos (energia, clareza, apoio, autonomia, cultura, liderança).

### 5.3 Taxa de Confiança

```
confianca = participantes / total_usuarios
```

- **Mínima para conclusões:** 15% (configurável)
- Abaixo da mínima: indicadores bloqueados, aviso exibido

### 5.4 Tendência

Comparação dos últimos 3 períodos mensais do Clima Geral.

---

## 6. Sistema de Saturação

Cada dimensão tem uma **meta de coleta** por período:

```
meta = clamp(total_usuarios × 0.25, 10, 25)
```

Quando a meta é atingida, a dimensão para de receber perguntas pelo sistema pulse.

Princípio: **"o sistema sabe quando NÃO perguntar"**.

---

## 7. NR-1 — Monitoramento de Risco Psicossocial

A dimensão `risco_psicossocial` implementa os princípios da **NR-1 (Norma Regulamentadora nº 1, atualização 2024)** sobre **gerenciamento de riscos psicossociais**.

### 7.1 Perguntas NR-1

- Frequência de sobrecarga que afeta bem-estar
- Impacto de situações de trabalho na saúde
- Segurança psicológica para expressar preocupações

### 7.2 Alertas NR-1

O alerta `risco_psicossocial_nr1` é gerado quando o indicador da dimensão cai abaixo de 2.5, sinalizando nível crítico que requer atenção institucional.

### 7.3 Limitação Importante

> **Este sistema realiza monitoramento institucional agregado. NÃO realiza diagnóstico clínico individual. Para casos individuais, acionar os protocolos de saúde ocupacional da instituição.**

---

## 8. Fairness e Controle

### 8.1 Limite por Usuário

- Máximo de 3 perguntas/dia por usuário (configurável)
- Intervalo mínimo de 4h entre perguntas ao mesmo usuário

### 8.2 Distribuição Equilibrada

Perguntas são priorizadas para dimensões com menor cobertura no período, garantindo distribuição proporcional entre todas as dimensões.

### 8.3 Prevenção de Usuários Invisíveis e Sobrecarregados

O sistema equilibra a distribuição sem concentrar perguntas em usuários mais ativos nem ignorar usuários menos ativos.

---

## 9. Análise de Desigualdades

### 9.1 Perfil Analítico

Dados opcionais coletados dos usuários para análise estratificada:

| Atributo | Categoria |
|----------|-----------|
| Gênero | Social |
| Raça/Cor | Social |
| Orientação Sexual | Social |
| Faixa Salarial | Econômico |
| Vínculo (CLT, PJ, etc.) | Organizacional |
| Nível (operacional, tático, estratégico) | Organizacional |
| Tempo de Casa | Organizacional |
| Região | Territorial |

### 9.2 Detecção de Gaps

Diferença de score entre grupos de mesmo atributo:

- Gap ≥ 0.8: alerta moderado
- Gap ≥ 1.5: alerta crítico

### 9.3 Proteção de Grupos

Grupos com menos de 5 participantes (configurável) **não são analisados separadamente** — exibindo apenas "Dados insuficientes para este grupo".

---

## 10. Alertas Institucionais

Alertas são gerados automaticamente após cada coleta quando:

| Tipo | Condição |
|------|----------|
| `burnout_risco` | Carga > 3.5 AND energia < 2.5 |
| `apoio_baixo` | Apoio < 2.5 |
| `risco_psicossocial_nr1` | Risco psicossocial < 2.5 |
| `escuta_negativa` | >60% das escutas espontâneas negativas |
| `lideranca_baixa` | Liderança < 2.5 |
| `gap_[atributo]` | Gap estrutural ≥ 1.5 em qualquer atributo |

**Regra:** alertas só são gerados com confiança mínima atingida e padrão consistente.

---

## 11. Limitações e Vieses

### 11.1 Viés de Não Resposta

Usuários que não respondem podem ter perfil diferente dos que respondem. O sistema exibe a taxa de confiança para transparência.

### 11.2 Viés de Auto-Seleção

O sistema pulse convida aleatoriamente (por contexto temporal e fairness), mas não garante amostra representativa.

### 11.3 Dados Incompletos

Perfis analíticos são opcionais. Análises estratificadas dependem da adesão voluntária ao preenchimento do perfil.

### 11.4 Temporalidade

Indicadores refletem o momento de coleta. Eventos pontuais podem distorcer médias. A tendência de 3 períodos suaviza variações.

---

## 12. Ciclo de Feedback

O sistema implementa retorno institucional aos participantes:

> "Com base nas escutas recebidas, fizemos X"

Ações resolvidas são registradas com descrição e exibidas no painel de escuta espontânea, fechando o ciclo de comunicação.

---

## 13. Validação e Revisão

Este documento deve ser revisado semestralmente por:

- Coordenação de RH
- Representação dos trabalhadores
- Responsável técnico pelo sistema

A metodologia está aberta para validação por pares com especialistas em saúde organizacional e psicologia do trabalho.
