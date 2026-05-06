# 📄 Análise de Arquivo — mod_escuta.gs

## 1. Identificação
- **Nome:** mod_escuta.gs
- **Caminho:** `/mod_escuta.gs`
- **Tipo:** Backend GAS — módulo de negócio
- **Camada:** backend/domínio
- **Módulo:** Escuta Institucional — pulse surveys, clima organizacional, NR-1, alertas, relatórios

---

## 2. Propósito
Sistema completo de escuta institucional contínua (1414 linhas): pesquisas pulse adaptativas por turno/progresso temporal, escuta espontânea com análise de sentimento, banco de perguntas com 21 questões padrão em 8 dimensões, controle de saturação/fairness, dashboard de clima organizacional, detecção de risco psicossocial (NR-1), alertas automáticos (burnout, liderança, gap estrutural), perfil analítico demográfico e geração de relatórios periódicos.

---

## 3. Funções

### Configuração e helpers
| Função | Descrição |
|--------|-----------|
| `obterConfiguracaoEscuta()` | Lê aba EscutaConfig; aplica defaults (`limiteDia=3`, `antiSpamHoras=4`, `grupoMinimo=5`) |
| `salvarConfiguracaoEscuta(configs)` | Upsert key-value em EscutaConfig |
| `_escutaSheet(nome)` | Retorna/cria aba; se não existe, cria com cabeçalhos via `_escutaInicializarCabecalhos` |
| `_escutaEmailHash(email)` | djb2 hash em base36 para anonimização |
| `_escutaTurnoAtual()` | Detecta turno (manhã 7–14, tarde 14–18, noite 18–23) |
| `_escutaProgressoTurno()` | Percentual de avanço no turno atual |
| `_escutaPerguntaValidaTemporalmente(tipo)` | `instantanea` sempre; `acumulativa` ≥50%; `final` ≥75% |

### Banco de perguntas
| Função | Descrição |
|--------|-----------|
| `obterPerguntasEscuta()` | Merge: perguntas padrão (`_BANCO_PERGUNTAS_PADRAO`) + overrides da aba EscutaPerguntas |
| `atualizarPerguntaEscuta(id, campos)` | Upsert de override na aba EscutaPerguntas |

### Saturação e fairness
| Função | Descrição |
|--------|-----------|
| `_escutaVerificarSaturacao(dimensao, periodo)` | Verifica se dimensão atingiu meta do período |
| `_escutaIncrementarSaturacao(dimensao, periodo)` | Incrementa contador; marca saturado se ≥meta |
| `_escutaMetaDimensao()` | Calcula meta: `max(10, min(25, round(totalUsuarios * 0.25)))` |
| `obterSaturacaoEscuta()` | Retorna saturação do período atual por dimensão |

### Pulse — seleção e registro
| Função | Descrição |
|--------|-----------|
| `obterPerguntaPulse()` | Seleciona próxima pergunta: sistema ativo → pesquisa personalizada → momento propício → limite diário → anti-spam → filtros temporal/saturação/respondido → prioriza dimensão sub-representada |
| `registrarRespostaPulse(dados)` | Append em EscutaRespostas; incrementa saturação; dispara verificação de alertas |
| `_escutaObterPesquisaPersonalizadaAtiva(email)` | Pesquisas ativas com direcionamento + boost de prioridade |
| `_escutaUsuarioElegivel(email, perfil, direcionamento)` | Filtra por: setor, nível, vínculo, faixaSalarial, tempoCasa, regiao |

### Escuta espontânea
| Função | Descrição |
|--------|-----------|
| `registrarEscutaEspontanea(dados)` | Append com análise de sentimento por keyword matching |
| `_escutaAnalisarSentimento(texto)` | Positivo/negativo/neutro via listas de palavras-chave |

### Pesquisas personalizadas e banco de templates
| Função | Descrição |
|--------|-----------|
| `obterPesquisasEscuta()` | Lista pesquisas com `perguntas` JSON desserializado |
| `salvarPesquisaEscuta(dados)` | Upsert; sem lock; sem verificação de permissão |
| `excluirPesquisaEscuta(id)` | Remove linha; sem verificação de permissão |
| `obterBancoPesquisas()` | Templates reutilizáveis |
| `salvarTemplateBancoPesquisas(dados)` | Upsert de template |

### Dashboard e indicadores
| Função | Descrição |
|--------|-----------|
| `obterDashboardEscuta(filtros)` | Indica{média, n, nível} por dimensão + _climaGeral + confiança + saturação + tendência 3 meses + resumo espontânea + alertas ativos; modo `estratificado` adiciona breakdown por vínculo/nível e gaps |
| `_escutaCalcIndicadores(respostas)` | Média ponderada por dimensão; inverte `carga` e `risco_psicossocial` (maior = pior) |
| `_escutaNivelClimatico(media)` | `excelente/bom/regular/baixo/critico` por faixas 4.5/3.5/2.5/1.5 |
| `_escutaCalcConfianca(participantes)` | Taxa participação/total; suficiente se ≥15% |
| `_escutaCalcTendencia(respostas, periodo)` | Histórico de 3 meses com `_climaGeral.media` |
| `_escutaCalcEstratificado(respostas)` | Breakdown por vínculo e nível com bloqueio de grupos <5 |
| `_escutaCalcGaps(respostas, perfis, gMin)` | Gaps por vinculo/nivel/genero; alerta se gap ≥0.8 pontos |

### Alertas
| Função | Descrição |
|--------|-----------|
| `_escutaVerificarEGerarAlertas()` | Chamada a cada resposta; calcula indicadores; gera alertas se confiança suficiente |
| `_escutaDetectarAlertas(ind, esponts, respostas)` | 5 tipos: `burnout_risco`, `apoio_baixo`, `risco_psicossocial_nr1`, `escuta_negativa`, `lideranca_baixa`, `gap_*` |
| `resolverAlertaEscuta(id, acao)` | Marca como resolvido; sem verificação de permissão |
| `obterAlertasEscuta()` | Retorna apenas alertas com `status === 'ativo'` |

### Perfil analítico e relatórios
| Função | Descrição |
|--------|-----------|
| `obterPerfilAnaliticoEscuta()` | Dados demográficos do usuário ativo (genero, raca, orientacaoSexual, faixaSalarial, vinculo, nivel, tempoCasa, regiao, distancia) |
| `salvarPerfilAnaliticoEscuta(dados)` | Upsert de perfil demográfico — fornecimento voluntário |
| `gerarRelatorioEscuta(tipo, periodo)` | Relatório completo: indicadores + tendência + escuta + alertas + recomendações automáticas |
| `_escutaGerarRecomendacoes(ind, espontanea, alertas)` | Recomendações por dimensão crítica + alertas ativos; ação NR-1 se `risco_psicossocial < 2.5` |
| `obterDadosEscuta()` | Boot: carrega config + dashboard + alertas + perfil + pesquisas + banco + saturação + perguntas |
| `obterFeedbackEscuta()` | Últimos 5 alertas resolvidos (ciclo de transparência para colaboradores) |

---

## 4. Conexões
- **Quem chama:** Frontend via `GAS.escuta.*` (bridge)
- **Quem é chamado:**
  - `SpreadsheetApp.getActiveSpreadsheet()` diretamente — módulo NÃO usa `_getSheet` de utils.js
  - `Session.getActiveUser().getEmail()` para identificação do usuário
  - Não depende de outros módulos GAS (módulo totalmente isolado)

---

## 5. Funcionalidades
- **Controle temporal sofisticado:** perguntas `instantanea` são sempre válidas; `acumulativa` só após 50% do turno; `final` após 75% — respostas contextualizadas ao momento do dia
- **Privacidade por design:** emailHash para anonimização; grupo mínimo de 5 participantes bloqueia dados estratificados; campo `anonimo` omite email no banco
- **Deduplicação de alertas:** `_escutaDetectarAlertas` verifica alertas existentes do mesmo tipo no período antes de criar novos
- **Fairness de dimensão:** `obterPerguntaPulse` ordena por contagem crescente de respostas por dimensão — evita saturação de uma dimensão em detrimento de outra
- **NR-1 compliance:** dimensão `risco_psicossocial` com peso 1.5, invertida, gera alerta crítico e recomendação explícita de "acionar protocolo NR-1"
- **Auto-criação de schema:** `_escutaSheet` cria abas automaticamente se não existirem — o módulo é autossuficiente para implantação

---

## 6. Possíveis Falhas

### 🔴 CRÍTICO
- **`_escutaVerificarEGerarAlertas` executado a cada resposta:** `registrarRespostaPulse` chama `_escutaVerificarEGerarAlertas` que lê TODAS as respostas do período + TODAS as espontâneas + TODOS os alertas + calcula indicadores completos + detecção de gaps. Executado síncronamente em cada resposta de qualquer colaborador. Com centenas de respostas, pode causar timeout de 30s do GAS.
- **`resolverAlertaEscuta` e `excluirPesquisaEscuta` sem verificação de permissão:** qualquer usuário logado pode resolver alertas de clima organizacional ou deletar pesquisas — dados de RH/clima sem proteção adequada.

### 🟠 MÉDIO
- **`_escutaMetaDimensao` e `_escutaCalcConfianca` buscam aba `Usuarios`/`usuarios` que não existe no sistema:** nenhuma das 7 planilhas do CCBJ tem essa aba — `totalUsuarios` sempre será `20` (hardcoded fallback), tornando as metas e taxas de confiança incorretas para o porte real da equipe.
- **Nenhum `LockService` em operações de escrita:** `registrarRespostaPulse`, `salvarPesquisaEscuta`, `salvarPerfilAnaliticoEscuta` sem lock — operações simultâneas podem sobrescrever dados.
- **`salvarPesquisaEscuta` usa `findIndex` com leitura completa a cada UPDATE:** itera toda a aba para cada atualização de pesquisa; sem índice.

### 🟡 BAIXO
- **`_escutaEmailHash` usa djb2 (não criptográfico):** probabilidade de colisão em equipes grandes; para proteção de privacidade real, deveria usar hash criptográfico com salt.
- **`_escutaLog` escreve em aba `LogsEscuta` não declarada em `_ESCUTA_SHEETS`:** aba criada manualmente sem passar por `_escutaInicializarCabecalhos` — inconsistência com o padrão de auto-criação do módulo.
- **`obterDadosEscuta` realiza 8 leituras independentes de planilha:** cada função lê sua própria aba — sem consolidação ou cache para o carregamento inicial.

---

## 7. Qualidade do Código
**Positivos:**
- Módulo mais bem documentado e coeso do sistema — arquitetura clara em seções
- Privacidade por design é o ponto mais forte: hash, grupo mínimo, flag anônimo
- Controle temporal de perguntas (tipoTempo × progresso do turno) é sofisticado e correto
- `_escutaSheet` com auto-criação torna o módulo deployável sem dependência de Setup.js
- Sistema de fairness de dimensão bem implementado
- Recomendações automáticas com ação NR-1 explícita é arquiteturalmente correto para compliance

**Críticos:**
- Cálculo pesado síncrono em cada resposta (`_escutaVerificarEGerarAlertas`)
- Operações sensíveis (alertas, pesquisas) sem controle de permissão

---

## 8. Melhorias Sugeridas
- Tornar `_escutaVerificarEGerarAlertas` assíncrono ou chamado apenas por trigger temporal (não por resposta individual)
- Adicionar `verificarPermissao` em `resolverAlertaEscuta` e `excluirPesquisaEscuta`
- Criar uma propriedade `TOTAL_COLABORADORES` em PropertiesService para substituir a busca pela aba `Usuarios`
- Adicionar `LockService` em `registrarRespostaPulse` e `salvarPesquisaEscuta`
- Adicionar `LogsEscuta` ao `_ESCUTA_SHEETS` e `_escutaInicializarCabecalhos`

---

## 9. Papel no Sistema
- **Fluxo de pulse:** Frontend → `obterPerguntaPulse` (seleção adaptativa) → `registrarRespostaPulse` → `_escutaVerificarEGerarAlertas` → alertas automáticos
- **Fluxo de dashboard:** Frontend → `obterDashboardEscuta` → 8 dimensões + gaps + alertas ativos
- **Criticidade:** 🟠 MÉDIO — módulo isolado que não interfere com reservas; timeout em `_escutaVerificarEGerarAlertas` pode degradar experiência do colaborador

---

## 10. Tags
`#backend` `#escuta` `#clima` `#rh` `#nr1` `#pulse` `#anonimizacao` `#alertas` `#diversidade` `#fairness`

---

## 11. Dependências
- **Depende de:** `SpreadsheetApp` (direto, sem `_getSheet`), `Session` (usuário ativo)
- **É dependência para:** Frontend do módulo escuta (único consumidor)
- **Módulo isolado:** não é chamado por nenhum outro módulo GAS

---

## 12. Relação com Problemas Existentes
- O padrão de auto-criação de abas em `_escutaSheet` é o oposto do padrão centralizado de Setup.js — as 10 abas Escuta* não estão definidas em `MODULOS` em Setup.js, logo `_getSheet('EscutaRespostas')` retorna null se chamado de fora deste módulo.
- O módulo tem sua própria lógica de hash de email que é incompatível com `_escutaEmailHash` se outros módulos precisarem cruzar usuários com dados de escuta.

---

## 13. Alinhamento com a Visão
**Alinhado:** privacidade por design, controle temporal sofisticado, NR-1 compliance, módulo isolado e coeso, fairness de dimensão, anonimização
**Desalinhado:** cálculo pesado síncrono por resposta, operações destrutivas sem permissão, `totalUsuarios` hardcoded por ausência de fonte canônica, sem lock em escritas
