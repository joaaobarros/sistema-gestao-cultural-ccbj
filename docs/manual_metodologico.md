# Manual Metodológico — Sistema de Escuta Institucional CCBJ

**Versão:** 1.0 | **Data:** Maio/2026

---

## 1. Construção das Pesquisas

### 1.1 Banco Padrão (Hardcoded)

O banco padrão contém 24 perguntas distribuídas em 8 dimensões (3 por dimensão). Estas perguntas foram construídas para:

- Ser respondíveis em menos de 10 segundos
- Não pressupor contextos específicos do dia
- Cobrir aspectos cognitivos, emocionais e relacionais do trabalho
- Ser válidas para diferentes tipos de vínculo (CLT, PJ, estágio, etc.)

**Critérios de qualidade de uma boa pergunta pulse:**
1. Linguagem simples e direta
2. Escopo temporal claro (hoje, agora, esta semana)
3. Resposta em escala ou emoji — sem texto obrigatório
4. Neutralidade semântica (sem direcionar a resposta)
5. Compatível com o tipo temporal (instantânea, acumulativa, final)

### 1.2 Pesquisas Personalizadas

Criadas por gestores para investigação específica. Recomendações:

- Máximo de 5 perguntas por pesquisa personalizada
- Definir período específico (não deixar em aberto)
- Usar templates do banco sempre que possível
- Documentar o objetivo da pesquisa no título
- Pesquisas direcionadas devem ter justificativa registrada em ata

---

## 2. Definição das Dimensões

### 2.1 Por que 8 dimensões?

As dimensões foram escolhidas com base em literatura de bem-estar no trabalho (Modelo de Demandas-Recursos) e nos requisitos da NR-1/2024:

| Dimensão | Fundamento |
|----------|------------|
| Energia | Indicador de estado físico e emocional imediato |
| Carga | Demanda de trabalho (Karasek, 1979) |
| Clareza | Clareza de papel e expectativas (Rizzo, 1970) |
| Apoio | Suporte social no trabalho (House, 1981) |
| Autonomia | Controle sobre o trabalho (Hackman & Oldham, 1976) |
| Cultura | Alinhamento e pertencimento organizacional |
| Liderança | Qualidade da relação com superiores |
| Risco Psicossocial | Monitoramento NR-1 (2024) |

### 2.2 Dimensões Invertidas

`carga` e `risco_psicossocial` têm pontuação invertida na exibição:

- Score bruto 5 = alta carga/risco = exibido como 1 (ruim)
- Score bruto 1 = baixa carga/risco = exibido como 5 (bom)

Fórmula: `score_exibido = 6 - score_bruto`

---

## 3. Cálculo dos Indicadores

### 3.1 Indicador de Dimensão

```
score_dim = Σ(resposta_i × peso_i) / Σ(peso_i)
```

Onde `peso_i` é o peso configurado para cada pergunta (padrão 1.0, reforçado em perguntas críticas).

### 3.2 Clima Geral

```
clima_geral = média(energia, clareza, apoio, autonomia, cultura, lideranca)
```

Nota: `carga` e `risco_psicossocial` são excluídos do Clima Geral (usados em alertas específicos).

### 3.3 Taxa de Confiança

```
taxa = participantes_únicos / total_usuários_sistema
```

- Taxa ≥ 15%: dados são exibidos com aviso de confiança
- Taxa ≥ 35%: dados são considerados representativos
- Taxa < 15%: indicadores bloqueados, nenhuma conclusão é gerada

A fórmula de referência do sistema é:
```
confianca = respostas / (usuarios × 0.35)
```

### 3.4 Meta de Saturação por Dimensão

```
meta = max(10, min(25, round(total_usuarios × 0.25)))
```

Exemplos:
- 20 usuários → meta = 10 respostas/dimensão/período
- 40 usuários → meta = 10
- 60 usuários → meta = 15
- 100 usuários → meta = 25

---

## 4. Critérios de Confiança

### 4.1 Confiança para Exibição

| Situação | Ação do Sistema |
|----------|-----------------|
| < 15% de resposta | Bloqueia indicadores, exibe aviso |
| 15–35% | Exibe com nota de baixa confiança |
| > 35% | Exibe normalmente |

### 4.2 Confiança para Alertas

Alertas só são gerados quando a taxa de confiança mínima é atingida E o padrão se mantém por mais de 1 semana do período.

### 4.3 Confiança para Análise Estratificada

- Grupo mínimo: 5 participantes (configurável por admin)
- Grupos menores: exibido como "Dados insuficientes para este grupo"

---

## 5. Fairness — Distribuição Equilibrada

### 5.1 Problema a Evitar

- **Usuário invisível:** nunca recebe perguntas
- **Usuário sobrecarregado:** recebe perguntas todo dia
- **Dimensão esquecida:** sempre saturada nas mesmas dimensões
- **Dimensão nunca atingida:** nunca tem respostas

### 5.2 Solução Implementada

1. **Limite diário por usuário** (default: 3 perguntas)
2. **Anti-spam temporal** (default: 4h entre perguntas)
3. **Prioridade de dimensão com menor cobertura** no período atual
4. **Exclusão de perguntas** respondidas nas últimas 48h pelo mesmo usuário
5. **Saturação automática** para dimensões que atingiram a meta

### 5.3 Distribuição por Turno

O sistema funciona 24h em 3 turnos. Perguntas dos tipos:
- `instantanea`: qualquer turno
- `acumulativa`: após 50% do turno
- `final`: após 75% do turno

Garantindo cobertura proporcional entre os três turnos.

---

## 6. Limites do Sistema

### 6.1 O que este sistema NÃO faz

- ❌ Diagnóstico clínico individual
- ❌ Avaliação de desempenho
- ❌ Identificação de indivíduos em sofrimento
- ❌ Canal de denúncia formal
- ❌ Substituição de acompanhamento psicológico
- ❌ Garantia de representatividade estatística rigorosa

### 6.2 O que este sistema FAZ

- ✅ Monitoramento institucional agregado
- ✅ Identificação de padrões estruturais
- ✅ Detecção de desigualdades por grupo
- ✅ Apoio à decisão com evidências
- ✅ Monitoramento preventivo NR-1
- ✅ Ciclo de feedback institucional

### 6.3 Frequência de Revisão

| Item | Frequência |
|------|-----------|
| Banco de perguntas | Semestral |
| Limites e metas | Anual |
| Perfis analíticos | Voluntário/contínuo |
| Metodologia | Anual com validação por pares |

---

## 7. Guia de Uso — Perfis Autorizados

### 7.1 Gestor Geral / RH — Criação de Pesquisa Personalizada

1. Acessar `Escuta Institucional > Gestão > Pesquisas Personalizadas`
2. Clicar em "Nova Pesquisa"
3. Definir título, período, status e prioridade
4. Adicionar perguntas (máximo recomendado: 5)
5. Configurar direcionamento se necessário
6. Salvar e aguardar coleta no período definido

### 7.2 Todos os usuários — Escuta Espontânea

1. Acessar `Escuta Institucional > Escuta Livre`
2. Selecionar categoria mais próxima
3. (Opcional) Escrever relato livre
4. Escolher anonimato
5. Clicar em "Registrar"

### 7.3 Todos os usuários — Perfil Analítico

1. Acessar `Escuta Institucional > Meu Perfil`
2. Preencher campos desejados (todos opcionais)
3. Salvar

> Quanto mais perfis preenchidos, mais precisas as análises de desigualdade.
