# 📄 Análise de Arquivo — mod_relatorios.gs

## 1. Identificação
- **Nome:** mod_relatorios.gs
- **Caminho:** `/mod_relatorios.gs`
- **Tipo:** Backend GAS — módulo de negócio
- **Camada:** backend/domínio
- **Módulo:** Relatórios — contratos, metas, indicadores, rubricas, CODIP, documentos Drive, versionamento

---

## 2. Propósito
Módulo mais extenso do backend (~1800 linhas): centraliza gestão financeira de contratos (CRUD de Contratos, Metas, Indicadores, Rubricas com Memória de Cálculo), relatórios CODIP, geração de documentos Drive (PPT/DOC/PDF), versionamento de contratos com comparação diff e timeline, e integrações com IA para mapeamento de gráficos e reescrita de descrições.

---

## 3. Funções

### Geração de documentos
| Função | Descrição |
|--------|-----------|
| `gerarDocumentoDrive(conteudo)` | Cria PPT (`SlidesApp`), DOC (`DocumentApp`) ou PDF (DOC→PDF→trash DOC) no Drive; retorna `{url, downloadUrl, fileId}` |
| `mapearGraficosPorSecao(secoes, graficos)` | Associa gráficos a seções via regex de título (fallback local) |
| `mapearGraficosIA(secoes, graficos)` | Chama IA para associar gráficos a seções; usa `mapearGraficosPorSecao` como fallback |
| `reescreverDescricaoAcaoIA(texto, setor)` | Reescreve texto em linguagem institucional via IA com 13 regras editoriais |

### Contratos (planilha RELATORIOS.Contratos)
| Função | Descrição |
|--------|-----------|
| `obterContratos()` | Lê aba Contratos; retorna objetos com 12 campos |
| `obterContratoPorId(id)` | Busca por id |
| `salvarContrato(dados, email)` | Upsert com LockService + log de auditoria |
| `excluirContrato(id, email)` | Remove linha com lock + log |
| `atualizarContrato(id, campos, email)` | Merge parcial + `salvarContrato` |

### Metas (planilha RELATORIOS.Metas)
| Função | Descrição |
|--------|-----------|
| `obterMetas()` | Lê aba Metas; retorna objetos com 6 campos |
| `salvarMeta`, `excluirMeta`, `atualizarMeta` | CRUD com lock + log |

### Indicadores (planilha RELATORIOS.Indicadores)
| Função | Descrição |
|--------|-----------|
| `obterIndicadores()` | 19 colunas: id, idMeta, idContrato, ano, texto/nome, 12 meses, tipoIndicador, numero; calcula q1–q4 e anual |
| `salvarIndicador`, `excluirIndicador`, `atualizarIndicador` | CRUD com lock + log |

### Rubricas (planilha RELATORIOS.Rubricas + RubricasMemoria + RubricasHistorico)
| Função | Descrição |
|--------|-----------|
| `obterRubricas()` | 5 campos: id, idMeta, nome, valor, obs |
| `salvarRubrica(dados, email)` | Validação completa: valida idMeta, nome, memória de cálculo; upsert em Rubricas + limpeza+inserção em RubricasMemoria; histórico em RubricasHistorico; dispara `salvarVersaoContrato` |
| `listarMemoriaRubrica`, `obterMemoriaRubrica` | Duas funções de leitura de RubricasMemoria (redundância) com lógica de filtro por `ativo=SIM` |
| `obterHistoricoRubrica` | Retorna histórico reverso de alterações |
| `calcularValorRubrica`, `atualizarValorRubrica` | Recalcula e persiste valor total da rubrica a partir da memória |
| `adicionarItemMemoriaRubrica` | Append de item individual + `atualizarValorRubrica` |
| `parseMoeda(valor)` | Converte string pt-BR monetária → float; aceita `"1.200,50"`, `"R$ 1.200,50"` |

### Versionamento de contratos
| Função | Descrição |
|--------|-----------|
| `salvarVersaoContrato(idContrato, email)` | Snapshot completo: contrato + metas + rubricas + memória; incrementa versão |
| `criarSnapshotContrato` | Alias antigo com lógica similar (duplicação) |
| `obterHistoricoContrato` | Lista versões com data/usuário |
| `compararVersoesContrato(idContrato, v1, v2)` | Diff entre dois snapshots por contrato, metas, rubricas e memória |
| `compararVersoesContratoDetalhado` | Diff com totais, diferença percentual e agrupamento por rubrica |
| `obterRankingImpactoRubricas` | Top rubricas por maior variação absoluta |
| `gerarHeatmapAlteracoes` | Intensidade relativa de cada rubrica sobre total |
| `gerarAlertasContrato` | Alertas: aumento >10% ou rubrica >R$5.000 de variação |
| `obterDashboardComparativoContrato` | Agrega: resumo + ranking + heatmap + alertas |
| `obterTimelineContrato` | Histórico sequencial de diffs entre versões consecutivas |
| `_obterSnapshotVersao` | Recupera JSON snapshot de uma versão específica |

### CODIP
| Função | Descrição |
|--------|-----------|
| `_salvarCamposCODIP(idReserva, dados)` | Upsert de 34 colunas na aba RelatoriosCODIP; esta é a implementação real (mod_reservas.gs tem noop) |
| `_montarLinhaCodip(idReserva, dados)` | Monta array de 34 campos CODIP com defaults |
| `obterRelatoriosCODIP()` | Lê aba + enriquece com dados de reserva, contrato, meta e indicador |

### Auxiliares
| Função | Descrição |
|--------|-----------|
| `obterDadosContratos()` | Agrega contratos + metas + indicadores + rubricas em uma chamada |
| `_mapaMetas()`, `_mapaRubricas()` | Helpers para construir mapas id→nome para diff de versões |
| `_isAtivoMemoria(v)` | Normaliza booleano/string "SIM" |

---

## 4. Conexões
- **Quem chama:** Frontend via `GAS.relatorios.*` e `GAS.contratos.*`; `mod_reservas.gs` chama `_salvarCamposCODIP`
- **Quem é chamado:**
  - `utils.js`: `_getSheet`, `gerarId`, `sanitizarTexto`
  - `mod_admin.gs`: `registrarLog`
  - `mod_metrics.gs`: `chamarIA` (usada em `mapearGraficosIA` e `reescreverDescricaoAcaoIA`)
  - `mod_reservas.gs`: `obterReservas` (em `obterRelatoriosCODIP`)
  - GAS Services: `SlidesApp`, `DocumentApp`, `DriveApp`, `LockService`

---

## 5. Funcionalidades
- **Versionamento de contratos completo:** cada `salvarRubrica` dispara snapshot automático — histórico imutável de toda evolução financeira do contrato
- **Diff avançado:** `obterDashboardComparativoContrato` entrega ranking, heatmap de intensidade e alertas automáticos em uma chamada
- **Memória de cálculo auditável:** `RubricasMemoria` registra cada item de custo com `ativo=SIM/NÃO`; `RubricasHistorico` guarda snapshots JSON de cada alteração
- **`parseMoeda`:** função robusta que trata formatos pt-BR, internacionais e `R$` — único helper financeiro compartilhado do módulo

---

## 6. Possíveis Falhas

### 🔴 CRÍTICO
- **`compararVersoesContrato` é definida DUAS VEZES (linhas 194 e 1431):** a segunda definição sobrescreve a primeira silenciosamente no GAS. A versão em linha 194 usava mapa1/mapa2 de rubricas; a versão em 1431 usa `_obterSnapshotVersao`. Apenas a segunda funciona — a primeira nunca é executada.
- **`_mapaMetas()` e `_mapaRubricas()` tratam objetos como arrays:** `obterMetas()` retorna `[{id, titulo, ...}]` (objetos), mas `_mapaMetas()` acessa `m[0]` e `m[2]` (por índice numérico) — retorna `undefined` para todos os campos, tornando `obterRankingImpactoRubricas` e `gerarHeatmapAlteracoes` sempre com "Meta desconhecida" / "Rubrica desconhecida".
- **`obterRelatoriosCODIP` acessa `r[34]` e `r[35]` em array de 34 colunas:** `_montarLinhaCodip` cria exatamente 34 elementos (índices 0–33); `obterRelatoriosCODIP` acessa `r[33]` (idContrato) e `r[34]` (idMeta), `r[35]` (idIndicador) — estes índices não existem e retornam `undefined`. Cruzamento com contratos/metas nunca funciona.

### 🟠 MÉDIO
- **`criarSnapshotContrato` é duplicada de `salvarVersaoContrato`:** mesma lógica, diferentes nomes — mantidas em paralelo sem deprecação formal.
- **`listarMemoriaRubrica` e `obterMemoriaRubrica` são redundantes:** duas funções que leem a mesma aba com lógicas de filtro levemente diferentes (uma acessa por índice hardcoded, a outra usa header lookup). A primeira usa `r[9]` por índice; a segunda usa `idx('ATIVO')` por nome.
- **`gerarDocumentoDrive` cria arquivos no Drive raiz do executor do script:** sem pasta organizacional — mesmo problema do DataLayer.

### 🟡 BAIXO
- **`reescreverDescricaoAcaoIA` chama `chamarIA` diretamente (sem namespace):** depende de `mod_metrics.gs` estar carregado — acoplamento implícito não documentado.
- **`gerarAlertasContrato` usa R$5.000 hardcoded como threshold de rubrica crítica:** sem configuração via PropertiesService.

---

## 7. Qualidade do Código
**Positivos:**
- `salvarRubrica` é a função mais robusta do sistema: validação completa, limpeza atômica de memória antiga, batch insert, histórico, versionamento automático — tudo com lock
- `parseMoeda` é bem implementada e defensiva
- `_p2consolidar`-style logic em consolidações de diff é claro e extensível
- Lock em todas as operações de escrita de planilha

**Críticos:**
- Função duplicada (`compararVersoesContrato`) com comportamento diferente — silenciosamente ignorada
- `_mapaMetas` / `_mapaRubricas` com bug de tipo array vs objeto
- CODIP com índices de coluna fora do range

---

## 8. Melhorias Sugeridas
- Remover a primeira definição de `compararVersoesContrato` (linha ~194) ou renomeá-la
- Corrigir `_mapaMetas()` para usar `.id` e `.titulo` em vez de `[0]` e `[2]`
- Adicionar 3 colunas ao schema de `_montarLinhaCodip` ou ajustar índices de acesso em `obterRelatoriosCODIP`
- Deprecar `criarSnapshotContrato` em favor de `salvarVersaoContrato`
- Mover threshold R$5.000 de `gerarAlertasContrato` para PropertiesService

---

## 9. Papel no Sistema
- **Fluxo de contrato:** Frontend → `salvarRubrica` → Rubricas + RubricasMemoria + RubricasHistorico + ContratosVersoes
- **Fluxo CODIP:** `mod_reservas.gs` → `_salvarCamposCODIP` → RelatoriosCODIP
- **Fluxo documento:** Frontend → `gerarDocumentoDrive` → Drive (PPT/DOC/PDF)
- **Criticidade:** 🟠 MÉDIO — bugs silenciosos em CODIP e diff de versões; funcionalidade de contratos é operacionalmente crítica

---

## 10. Tags
`#backend` `#relatorios` `#contratos` `#metas` `#indicadores` `#rubricas` `#codip` `#drive` `#versionamento` `#ia`

---

## 11. Dependências
- **Depende de:** `utils.js` (`_getSheet`, `gerarId`, `sanitizarTexto`), `mod_admin.gs` (`registrarLog`), `mod_metrics.gs` (`chamarIA`), `mod_reservas.gs` (`obterReservas`)
- **É dependência para:** Frontend de relatórios e contratos; `mod_reservas.gs` (chama `_salvarCamposCODIP`)

---

## 12. Relação com Problemas Existentes
- O noop `_salvarCamposCODIP` em `mod_reservas.gs` foi substituído por esta implementação real, mas o noop ainda existe — se alguém remover a dependência de `mod_relatorios.gs`, o sistema silenciosamente para de salvar dados CODIP.
- O bug de tipo em `_mapaMetas` é do mesmo padrão de "drift entre schema planejado e retorno real" observado em `mod_financeiro.gs` e `mod_equipes.gs`.

---

## 13. Alinhamento com a Visão
**Alinhado:** versionamento imutável de contratos, memória de cálculo auditável, lock em todas as escritas, `parseMoeda` robusto
**Desalinhado:** função duplicada silenciosa, bugs de índice em CODIP, `_mapaMetas`/`_mapaRubricas` com tipo errado, duplicação de `criarSnapshotContrato`
