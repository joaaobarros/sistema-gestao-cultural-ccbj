# 📄 Análise de Arquivo — mod_escuta.gs

## 1. Identificação
- **Nome:** mod_escuta.gs
- **Caminho:** `/mod_escuta.gs`
- **Tipo:** Backend GAS — módulo de negócio
- **Camada:** backend/domínio
- **Módulo:** Escuta Institucional — pulse surveys, clima organizacional, NR-1, governança metodológica

---

## 2. Propósito
Sistema de escuta institucional contínua refatorado com 10 grupos de melhorias (performance, segurança, consistência de dados, concorrência, estrutura, otimização, padronização de pesquisas, privacidade, governança e documentação).

Funcionalidades: pesquisas pulse adaptativas por turno/progresso temporal, escuta espontânea com análise de sentimento, banco de 21 perguntas padrão em 8 dimensões, controle de saturação/fairness com LockService, dashboard de clima, detecção de risco psicossocial (NR-1), alertas assíncronos via time trigger, perfil analítico demográfico, motor metodológico de governança, simulador de impacto e manual vivo.

---

## 3. Arquitetura

### Planilha dedicada (ESCUTA)
Todas as abas são acessadas via `_escutaSheet()` → `_getSheet()` → PropertiesService `SHEET_ID_ESCUTA`. Fallback cria aba automaticamente se não existir.

```
_ESCUTA_SHEETS = {
  CONFIG:          'EscutaConfig',
  PERGUNTAS:       'EscutaPerguntas',
  RESPOSTAS:       'EscutaRespostas',
  ESPONTANEA:      'EscutaEspontanea',
  PESQUISAS:       'EscutaPesquisas',
  BANCO_PESQUISAS: 'EscutaTemplates',
  ALERTAS:         'EscutaAlertas',
  PERFIL_ANALITICO:'EscutaPerfis',
  LOGS:            'LogsEscuta'
}
```

### Cache de execução
`var _escutaExecCache = {}` — escopo de módulo, reset a cada execução GAS. Evita múltiplas leituras da mesma aba em uma chamada. Invalidado por `_escutaInvalidarCacheSheet(nome)` após escritas.

### Identidade do usuário
Usa `_resolverEmailReal(sessaoOuEmail)` de `auth_session.gs` para capturar o email real em modo "Execute as: Me". Todas as funções que escrevem dados aceitam `sessaoOuEmail` como parâmetro ou leem de `dados.sessao`.

---

## 4. Funções

### Configuração e helpers
| Função | Descrição |
|--------|-----------|
| `obterConfiguracaoEscuta()` | Lê EscutaConfig; aplica defaults (`limiteDia=3`, `antiSpamHoras=4`, `grupoMinimo=5`) |
| `salvarConfiguracaoEscuta(configs)` | Upsert key-value em EscutaConfig |
| `_escutaSheet(nome)` | Tenta `_getSheet()` primeiro; cria aba com cabeçalhos via `_escutaInicializarCabecalhos` se inexistente |
| `_escutaEmailHash(email)` | djb2 hash base36 uppercase para anonimização; preparado para salt futuro |
| `_escutaTurnoAtual()` | Detecta turno: manhã 7–14, tarde 14–18, noite 18–23 |
| `_escutaProgressoTurno()` | Percentual de avanço no turno atual |
| `_escutaPerguntaValidaTemporalmente(tipo)` | `instantanea` sempre; `acumulativa` ≥50%; `final` ≥75% |
| `_escutaTotalColaboradores()` | Lê PropertiesService `TOTAL_COLABORADORES`; fallback 20 |
| `definirTotalColaboradoresEscuta(total)` | Admin define total de colaboradores em PropertiesService |

### Banco de perguntas
| Função | Descrição |
|--------|-----------|
| `obterPerguntasEscuta()` | Lista EscutaPerguntas (ativas) |
| `atualizarPerguntaEscuta(id, campos)` | Upsert com validação de dimensão |
| `_escutaMetaDimensao()` | Retorna mapa de pesos e rótulos por dimensão |

### Saturação e fairness
| Função | Descrição |
|--------|-----------|
| `_escutaVerificarSaturacao(dimensao, periodo)` | Verifica se a cota foi atingida |
| `_escutaIncrementarSaturacao(dimensao, periodo)` | Incrementa contador em EscutaConfig |
| `obterSaturacaoEscuta()` | Retorna mapa dimensão → contagem por período |

### Pulse (pesquisa)
| Função | Descrição |
|--------|-----------|
| `obterPerguntaPulse()` | Seleciona próxima pergunta respeitando turno, saturação e prioridade |
| `registrarRespostaPulse(dados)` | **LockService.getScriptLock**; resolve email via `dados.sessao`; NÃO chama alertas (assíncronos) |
| `processarAlertasEscuta()` | **Entry point do time trigger** — processa alertas de forma assíncrona |

### Escuta espontânea
| Função | Descrição |
|--------|-----------|
| `registrarEscutaEspontanea(dados)` | Armazena feedback livre com análise de sentimento (positivo/negativo/neutro) |
| `_escutaAnalisarSentimento(texto)` | Análise lexical simples; pontuação positiva vs negativa |

### Padronização de pesquisas
| Função | Descrição |
|--------|-----------|
| `normalizarPesquisaEscuta(pesquisa)` | Pesquisas padrão: auto-configura elegibilidade/prioridade/regras/perguntas. Pesquisas custom: valida campos obrigatórios. Retorna `{ok, pesquisa, erros}` |
| `sugerirParametrosPesquisa(objetivo, publico)` | Sugere dimensões e peso baseado em palavras-chave do objetivo |
| `salvarPesquisaEscuta(dados)` | **LockService**; `verificarPermissaoEscuta(email,'editar')`; `normalizarPesquisaEscuta()` antes de salvar |
| `excluirPesquisaEscuta(id, sessaoOuEmail)` | `verificarPermissaoEscuta(email,'excluir')` |
| `obterPesquisasEscuta()` | Lista EscutaPesquisas |
| `obterBancoPesquisas()` | Lista EscutaTemplates |

### Segurança e permissões
| Função | Descrição |
|--------|-----------|
| `verificarPermissaoEscuta(email, acao)` | Integra com `mod_permissoes.gs` (`podeEditar`, `podeExcluir`, `podeAcessarModulo`); fallback via aba Administradores |

### Perfil analítico
| Função | Descrição |
|--------|-----------|
| `obterPerfilAnaliticoEscuta()` | Lê EscutaPerfis por email (via hash) |
| `salvarPerfilAnaliticoEscuta(dados)` | **LockService.getScriptLock**; resolve email via `dados.sessao` |
| `_escutaObterPerfilPorEmail(email)` | Lookup de perfil por email para filtragem de elegibilidade |

### Indicadores e clima
| Função | Descrição |
|--------|-----------|
| `obterDadosEscuta()` | Pre-carrega todas as abas no execCache antes de chamar sub-funções |
| `obterDashboardEscuta(filtros)` | Indicadores por dimensão + clima + confiança + saturação + alertas |
| `_escutaCalcIndicadores(respostas, perguntas)` | **Média ponderada real**: `Σ(val×peso) / Σ(peso)` por dimensão |
| `_escutaCalcConfianca(respostas)` | Taxa de participação vs `_escutaTotalColaboradores()`; campo `representativa` (≥35%) |
| `_escutaCalcClima(indicadores)` | Converte score em rótulo (critico/baixo/moderado/bom/excelente) |
| `_escutaVerificarEGerarAlertas()` | Gera alertas em EscutaAlertas; chamado APENAS por `processarAlertasEscuta()` |

### Alertas
| Função | Descrição |
|--------|-----------|
| `obterAlertasEscuta()` | Lista alertas ativos |
| `resolverAlertaEscuta(id, acao, sessaoOuEmail)` | Resolve alerta com verificação de permissão |

### Governança (nova camada)
| Função | Descrição |
|--------|-----------|
| `obterGovernancaEscuta()` | Painel completo: clima, confiança, saturação, cobertura, alertas, risco NR-1, qualidade metodológica, status |
| `_escutaStatusEscuta()` | Status operacional geral do sistema |
| `_escutaQualidadeMetodologica()` | Score 0–100 baseado em cobertura, representatividade e diversidade de dimensões |
| `_escutaMotorMetodologico()` | Detecta viés, desequilíbrio, gera mensagens automáticas de sugestão |
| `_escutaCoberturaPorPerfil()` | Cobertura por dimensão demográfica (gênero, raça, setor) |
| `simularImpactoPesquisa(pesquisa)` | Antes de ativar: estima volume esperado, saturação, alertas potenciais |
| `construirFluxoPesquisa(etapa, dados)` | Builder anti-erro em 5 etapas guiadas |
| `obterMapaDadosEscuta(periodo)` | Mapa: Resposta → dimensão → média → clima → alerta → recomendação |
| `obterManualEscuta(secao)` | Manual vivo com tooltips e referências metodológicas (6 seções) |

### Logs
| Função | Descrição |
|--------|-----------|
| `_escutaLog(acao, autor, detalhes)` | Appenda em LogsEscuta com timestamp ISO |

---

## 5. Fluxo principal

```
[Frontend] responderPulse(dados)         [Frontend] processarAlertasEscuta()
     ↓                                         ↓
[registrarRespostaPulse]              [time trigger GAS]
  LockService.getScriptLock()               ↓
  _resolverEmailReal(dados.sessao)    [processarAlertasEscuta]
  verificar config ativo               _escutaVerificarEGerarAlertas()
  appendRow em EscutaRespostas
  _escutaIncrementarSaturacao()
  ← {ok, id}
```

---

## 6. Modelo Metodológico

### Média ponderada por dimensão
```
score_dim = Σ(resposta × peso_pergunta) / Σ(peso_pergunta)
```
Onde `peso_pergunta` vem do campo `peso` em EscutaPerguntas. NR-1 usa peso 1.5.

### Confiança e representatividade
- Taxa = respostas_periodo / TOTAL_COLABORADORES
- `confiavel`: taxa ≥ 15% e n ≥ grupoMinimo
- `representativa`: taxa ≥ 35%

### Saturação
```
cota = max(10, min(25, round(TOTAL_COLABORADORES × 0.25)))
```
Saturação é por dimensão × período (semana).

### Qualidade metodológica (score 0–100)
- Cobertura de dimensões ativas (máx 40 pts)
- Representatividade das respostas (máx 40 pts)
- Equilíbrio demográfico (máx 20 pts)

---

## 7. Governança da Escuta

### Status do sistema
| Status | Condição |
|--------|----------|
| `sem_dados` | Sem respostas no período |
| `subamostrada` | < grupoMinimo respostas |
| `desequilibrada` | Cobertura de dimensões < 50% |
| `confiavel` | Taxa ≥ 15% e dimensões ≥ 50% |
| `critica` | Risco NR-1 detectado |

### Alertas automáticos (processados via trigger)
| Tipo | Dimensão | Critério |
|------|----------|----------|
| `burnout` | sobrecarga_trabalho | score < 3 |
| `risco_nr1` | risco_psicossocial | score < 2.5 (nível critical) |
| `lideranca` | relacionamento_lideranca | score < 3 |
| `engajamento` | engajamento | score < 3 |
| `gap_estrutural` | qualquer | score < 2 (nível critical) |

---

## 8. Integração com outros módulos

| Módulo | Integração |
|--------|------------|
| `auth_session.gs` | `_resolverEmailReal(sessaoOuEmail)` — identidade real em "Execute as: Me" |
| `mod_permissoes.gs` | `verificarPermissaoEscuta()` usa `podeEditar`, `podeExcluir`, `podeAcessarModulo` |
| `utils.js` | `_getSheet()` roteia abas ESCUTA via `ABA_PARA_MODULO` |
| `Setup.js` | Módulo ESCUTA com `PROP.ESCUTA = 'SHEET_ID_ESCUTA'`, 9 abas registradas |

---

## 9. Possíveis Falhas / Qualidade / Melhorias

| Item | Descrição |
|------|-----------|
| `TOTAL_COLABORADORES` não configurado | Fallback 20; admin deve chamar `definirTotalColaboradoresEscuta()` |
| Trigger não configurado | `processarAlertasEscuta()` precisa de trigger time-driven em Gatilhos do GAS |
| `LockService.getUserLock()` em "Execute as: Me" | Substituído por `getScriptLock()` (UserLock mapeia todos para o dono do script) |
| `EscutaTemplates` / `EscutaPerfis` | Nomes novos — migrar dados se havia `EscutaBancoPesquisas` / `EscutaPerfilAnalitico` |
| GSI sem `GOOGLE_CLIENT_ID` | Cai para login manual via Swal; configurar via `configurarAutenticacao()` em auth_session.gs |
