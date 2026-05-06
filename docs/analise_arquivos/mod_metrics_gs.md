# 📄 Análise de Arquivo — mod_metrics.gs

## 1. Identificação
- **Nome:** mod_metrics.gs
- **Caminho:** `/mod_metrics.gs`
- **Tipo:** Backend GAS — módulo de negócio
- **Camada:** backend/domínio
- **Módulo:** Métricas — dashboard, IA (Bêjotinha), sugestões de reserva

---

## 2. Propósito
Calcula KPIs do dashboard (ocupação, cancelamentos, itens, acessos, CODIP) e integra com a API Groq/Llama para funcionalidades de IA: análise de dados, geração de relatórios, chat contextual (Bêjotinha) com sugestão estruturada de reservas em JSON, e análise autônoma de disponibilidade com alternativas.

---

## 3. Funções

### Dashboard
| Função | Descrição |
|--------|-----------|
| `obterMetricasDashboard(inicio, fim, sala, setor)` | Agrega KPIs de reservas com filtros: top salas/setores/itens, taxa cancelamento, horários de pico, dias da semana, CODIP |
| `obterDadosGraficoReservas()` | Top 8 espaços por volume de reservas não canceladas |

### IA — Groq/Llama
| Função | Descrição |
|--------|-----------|
| `chamarIA(prompt)` | Chamada HTTP para API Groq (`llama-3.1-8b-instant`); retorna `{ok, texto}` |
| `gerarRelatorioIA(filtros)` | Gera análise de reservas por tipo (uso, conflitos, itens, otimização) |
| `perguntarIA(pergunta)` | Chat contextual com regras de comportamento + dados de reservas/salas/itens/setores |
| `sugerirReservaIA(descricao)` | Sugere sala/horário em texto simples |
| `sugerirReservaIAComDados(descricao)` | Retorna JSON estruturado para criação automática de reserva; valida conflito com `verificarConflitoEspaco` |
| `analisarDashboardIA(metricas)` | Resumo executivo de métricas com insights e recomendações |

### Auxiliares de IA
| Função | Descrição |
|--------|-----------|
| `parsearJsonIA(resposta)` | Extrai JSON de resposta textual da IA (`{...}`) com try/catch |
| `encontrarMelhorAgenda(dados, salas, reservas)` | Busca slots livres em horários fixos (08, 10, 14, 16, 18h) por sala e data |
| `adicionar1Hora(hora)` | Soma 60 minutos a uma string HH:MM |

---

## 4. Conexões
- **Quem chama:** Frontend via `GAS.metricas.*` e `GAS.ia.*` (bridge)
- **Quem é chamado:**
  - `utils.js`: `_getSheet`
  - `mod_reservas.gs`: `obterReservas`, `verificarConflitoEspaco`
  - `Codigo.gs`: `obterMapaSalas`
  - `UrlFetchApp` → API Groq externa
  - `PropertiesService` → `GROQ_API_KEY`

---

## 5. Funcionalidades
- **Dashboard completo:** 20+ métricas calculadas em uma chamada, incluindo heatmap de horários e dias da semana
- **Bêjotinha com persona:** system prompt extenso com contexto CCBJ, setores, regras de negócio, interpretação de linguagem natural ("manhã", "tarde", "qualquer dia")
- **Sugestão de reserva com validação:** `sugerirReservaIAComDados` não confia cegamente na IA — valida o slot sugerido com `verificarConflitoEspaco` e oferece alternativas se conflitar
- **Detecção de usuário de teste:** `perguntarIA` verifica se email contém "joao.barros" para liberar criação livre sem confirmação

---

## 6. Possíveis Falhas

### 🔴 CRÍTICO
- **Detecção de usuário de teste por email hardcoded:** `emailAtivo.includes("joao.barros")` habilita comportamento especial (criação livre sem confirmar) para um email específico de desenvolvedor. Se esse email entrar em produção ou outro usuário tiver nome similar, o comportamento é imprevisível.
- **`parsearJsonIA` extrai apenas do primeiro `{` ao último `}`:** se a resposta da IA contiver múltiplos JSONs (ex: texto + JSON), extrai o envelope maior que pode incluir conteúdo textual inválido — `JSON.parse` falha e retorna null, causando erro visível ao usuário.

### 🟠 MÉDIO
- **`chamarIA` usa modelo `llama-3.1-8b-instant` hardcoded:** ao mudar de modelo (ex: para llama-3.3-70b), é necessário alterar o código. Deveria usar PropertiesService ou constante configurável.
- **`obterMetricasDashboard` não usa cache:** função pesada (lê 4 planilhas e processa todas as reservas) executada a cada carregamento de dashboard — sem CacheService. Para sistemas com centenas de reservas, pode causar timeout de 30s do GAS.
- **`encontrarMelhorAgenda` usa horários fixos hardcoded (`["08:00", "10:00", "14:00", "16:00", "18:00"]`):** não considera a duração real solicitada para calcular `fim` — sempre adiciona 1 hora independente do que o usuário pediu.

### 🟡 BAIXO
- **`gerarRelatorioIA` envia até 60 registros de reservas em texto:** para instâncias com muitas reservas, pode atingir limite de tokens da API (2048) — truncamento silencioso pode gerar análise parcial.
- **`perguntarIA` aceita JSON array como input** (histórico de chat): `JSON.parse(pergunta)` com fallback gracioso — pouco documentado e pode confundir chamadores.

---

## 7. Qualidade do Código
**Positivos:**
- `sugerirReservaIAComDados` com validação pós-IA é arquiteturalmente correto (nunca confia cegamente na IA)
- `parsearJsonIA` com try/catch é defensivo
- System prompt de `perguntarIA` é rico e bem contextualizado ao domínio CCBJ
- `obterMetricasDashboard` bem estruturado com muitos KPIs úteis

**Críticos:**
- Email de desenvolvedor hardcoded em produção
- Modelo de IA hardcoded

---

## 8. Melhorias Sugeridas
- Remover detecção de email de desenvolvedor ou mover para PropertiesService com flag `MODO_DEV`
- Mover nome do modelo para `PropertiesService.getScriptProperties().getProperty("GROQ_MODEL")`
- Adicionar cache em `obterMetricasDashboard` (ex: 5min via CacheService)
- Corrigir `encontrarMelhorAgenda` para usar duração real ao calcular `fim`

---

## 9. Papel no Sistema
- **Fluxo dashboard:** Frontend → `obterMetricasDashboard` → 4 planilhas → KPIs
- **Fluxo IA:** Frontend → `perguntarIA` → dados do sistema → prompt → API Groq → resposta + JSON opcional → `verificarConflitoEspaco` → resultado
- **Criticidade:** 🟠 MÉDIO — dashboard é funcionalidade central; IA é complementar

---

## 10. Tags
`#backend` `#metricas` `#dashboard` `#ia` `#groq` `#llama` `#kpi` `#reservas`

---

## 11. Dependências
- **Depende de:** `utils.js`, `mod_reservas.gs`, `Codigo.gs`, `UrlFetchApp`, `PropertiesService`
- **É dependência para:** Frontend de dashboard e chat IA

---

## 12. Relação com Problemas Existentes
- O email hardcoded `joao.barros` é o mesmo do autor do sistema (confirmado pelo git user "JP Barros") — comportamento de desenvolvedor esquecido em produção.

---

## 13. Alinhamento com a Visão
**Alinhado:** validação pós-IA, contexto CCBJ rico no prompt, múltiplas formas de análise
**Desalinhado:** email hardcoded em produção, modelo hardcoded, ausência de cache em função pesada
