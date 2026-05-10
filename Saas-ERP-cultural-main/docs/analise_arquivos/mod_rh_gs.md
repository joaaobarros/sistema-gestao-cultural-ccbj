# 📄 Análise de Arquivo — mod_rh.gs

## 1. Identificação
- **Nome:** mod_rh.gs
- **Caminho:** `/mod_rh.gs`
- **Tipo:** Backend GAS — módulo de negócio
- **Camada:** backend/domínio
- **Módulo:** RH — cargos, histórico, ponto, folha, documentos, diversidade

---

## 2. Propósito
Módulo exclusivamente Drive JSON que concentra operações de RH de alta fidelidade: histórico de admissões/desligamentos, controle de ponto, simulação completa de folha CLT (INSS progressivo 2024 + IRRF), avaliações, documentos, indicadores de turnover e diversidade demográfica.

---

## 3. Funções

### Cargos
| Função | Descrição |
|--------|-----------|
| `obterCargos()` | Lê `rh_cargos.json` |
| `salvarCargo(dados)` | Upsert por id; inicializa `ativo = true` se novo |
| `excluirCargo(id)` | Remove por id |

### Histórico de vínculos
| Função | Descrição |
|--------|-----------|
| `obterHistoricoRH()` | Lê `rh_historico.json` |
| `registrarEventoRH(dados)` | Append com id automático — admissão, desligamento, promoção, transferência |
| `obterHistoricoPorColaborador(idColaborador)` | Filtra histórico por colaborador |

### Avaliações
| Função | Descrição |
|--------|-----------|
| `obterAvaliacoesRH()` | Lê `rh_avaliacoes.json` |
| `registrarAvaliacaoRH(dados)` | Append com timestamp e id automático |

### Ponto
| Função | Descrição |
|--------|-----------|
| `obterRegistrosPonto()` | Lê `rh_ponto.json` |
| `registrarPonto(dados)` | Append com timestamp; tipo: entrada/saída/intervalo |
| `obterPontoPorColaborador(id, inicio, fim)` | Filtra e agrupa registros por data |

### Documentos
| Função | Descrição |
|--------|-----------|
| `obterDocumentosRH()` | Lê `rh_documentos.json` |
| `salvarDocumentoRH(dados)` | Upsert com metadados: tipo, validade, link Drive |
| `excluirDocumentoRH(id)` | Remove por id |

### Folha e simulação CLT
| Função | Descrição |
|--------|-----------|
| `obterFolhaRH()` | Lê `rh_folha.json` |
| `simularFolhaRH(colaborador)` | Simula folha completa: INSS progressivo (4 faixas 2024), IRRF (5 faixas), líquido a receber |
| `salvarFolhaRH(dados)` | Salva cálculo de folha mensal |

### Perfil social / diversidade
| Função | Descrição |
|--------|-----------|
| `obterPerfilSocial()` | Lê `rh_perfil_social.json` |
| `salvarPerfilSocial(dados)` | Upsert de dados demográficos |
| `obterDiversidadeRH()` | Agrega: distribuição por racaCor, genero, escolaridade, pcd, estado |

### Indicadores
| Função | Descrição |
|--------|-----------|
| `obterIndicadoresRH()` | Calcula: turnover anual, total admissões/desligamentos por ano, headcount atual |

---

## 4. Conexões
- **Quem chama:** Frontend via `GAS.rh.*` (bridge)
- **Quem é chamado:**
  - `DataLayer.gs`: `readJSON`, `writeJSON` para todos os 7 arquivos JSON
  - Nenhuma dependência de outras planilhas ou módulos GAS

---

## 5. Funcionalidades
- **Simulação CLT completa:** `simularFolhaRH` aplica tabela progressiva do INSS 2024 (4 faixas: 7,5%, 9%, 12%, 14%) e IRRF (5 faixas), calcula deduções, benefícios e líquido — implementação fiscal precisa
- **Indicadores de turnover:** `obterIndicadoresRH` computa taxa anual `(desligamentos / headcount médio) * 100` com dados reais do histórico
- **Diversidade demográfica:** `obterDiversidadeRH` agrega dados do `rh_perfil_social.json` em 5 dimensões para relatórios CODIP/DEI
- **Módulo isolado:** sem acoplamento com planilhas — 100% Drive JSON, portável e testável de forma independente

---

## 6. Possíveis Falhas

### 🔴 CRÍTICO
- **Nenhum lock em operações de escrita:** todos os `writeJSON` (folha, ponto, histórico) sem `LockService` — operações concorrentes podem corromper dados. Ponto em especial é vulnerável: dois registros simultâneos do mesmo colaborador podem gerar inconsistência.
- **`simularFolhaRH` usa tabelas INSS/IRRF hardcoded no código:** quando tabelas mudarem (ajuste anual obrigatório), a simulação fica desatualizada sem aviso. Não há indicação do ano de referência das tabelas no código.

### 🟠 MÉDIO
- **`obterIndicadoresRH` assume que `tipo == "desligamento"` para contabilizar saídas:** se eventos forem registrados como "demissão", "rescisão" ou variante ortográfica, o cálculo de turnover ignora esses registros. Sem validação de enum no `registrarEventoRH`.
- **`obterPontoPorColaborador` faz filtro em memória de todo `rh_ponto.json`:** sem índice, o módulo carrega todos os registros de ponto de todos os colaboradores para filtrar um. Com muitos funcionários e meses de dados, pode causar timeout.
- **`rh_folha.json` salvo mas nunca usado como fonte de verdade:** `simularFolhaRH` recalcula do zero a cada chamada; `salvarFolhaRH` salva mas nenhuma função de leitura agrega histórico de folhas salvas.

### 🟡 BAIXO
- **`obterDiversidadeRH` acessa campos `racaCor`, `genero`, `escolaridade`, `pcd`, `estado` sem validação:** se `rh_perfil_social.json` tiver campos ausentes ou com nomes diferentes, os contadores retornam zero silenciosamente.
- **IDs com `rh_ + Date.now()`:** inconsistente com `gerarId(prefixo)` usado em outros módulos; vulnerável a colisão no mesmo milissegundo.

---

## 7. Qualidade do Código
**Positivos:**
- `simularFolhaRH` é a implementação fiscal mais precisa do sistema — tabelas progressivas corretas
- `obterDiversidadeRH` é arquiteturalmente correta para relatórios DEI
- Módulo isolado (sem dependência de planilhas) facilita manutenção
- `obterHistoricoPorColaborador` e `obterPontoPorColaborador` são filtros compostos úteis

**Críticos:**
- Sem lock em nenhuma operação de escrita
- Tabelas fiscais hardcoded sem data de referência

---

## 8. Melhorias Sugeridas
- Adicionar `LockService` em `registrarPonto`, `salvarFolhaRH`, `registrarEventoRH`
- Mover tabelas INSS/IRRF para `PropertiesService` ou constante configurável com campo `anoReferencia`
- Validar `tipo` em `registrarEventoRH` contra enum: `["admissao", "desligamento", "promocao", "transferencia"]`
- Usar `gerarId(prefixo)` ao invés de `prefix + Date.now()`

---

## 9. Papel no Sistema
- **Fluxo folha:** Frontend → `simularFolhaRH(colaborador)` → cálculo CLT → `salvarFolhaRH`
- **Fluxo indicadores:** Frontend → `obterIndicadoresRH` → `rh_historico.json` → turnover/headcount
- **Criticidade:** 🟡 BAIXO — módulo independente sem integração com reservas ou fluxos críticos; falha não afeta operação principal

---

## 10. Tags
`#backend` `#rh` `#folha` `#clt` `#inss` `#irrf` `#ponto` `#diversidade` `#drive-json`

---

## 11. Dependências
- **Depende de:** `DataLayer.gs` (`readJSON`, `writeJSON`)
- **É dependência para:** Frontend do módulo RH; `mod_financeiro.gs` não consome diretamente (sistemas paralelos)

---

## 12. Relação com Problemas Existentes
- `mod_financeiro.gs` tem `calcularCustoVinculo` com lógica CLT similar a `simularFolhaRH` — dois cálculos de custo CLT independentes, cada um com suas próprias taxas hardcoded. Divergência silenciosa se as taxas forem atualizadas em um mas não no outro.
- `mod_equipes.gs` tem `funcionarios.json` como repositório de colaboradores; `mod_rh.gs` tem `rh_historico.json` com admissões/desligamentos — os sistemas não se integram.

---

## 13. Alinhamento com a Visão
**Alinhado:** cálculo fiscal preciso, dados demográficos para CODIP/DEI, módulo isolado e coeso
**Desalinhado:** sem lock em escrita, tabelas fiscais hardcoded sem versionamento, desconectado de mod_financeiro.gs e mod_equipes.gs


ESCOPO FUNCIONAL
-------------------------------------

1. ESTRUTURA SALARIAL

Criar suporte completo para:

- Planos de carreira
- Classes (com range de pontos)
- Steps salariais (níveis dentro da classe)
- Parâmetros do plano

Implementar entidades:

- PlanosCarreira
- ClassesCarreira
- StepsSalariais
- ParametrosPlano
- ContratoCarreira

Garantir:
- vínculo com contrato existente
- cálculo de salário baseado em classe + step

-------------------------------------

2. BENEFÍCIOS (INTEGRAR COM MODELO EXISTENTE)

Implementar:

- BeneficiosRH (cadastro manual)
- CategoriaBeneficios (preset por categoria)
- ContratoBeneficiosOverride (exceções)
- FonteBeneficioRegras (restrições por fonte)

Garantir:
- herança por categoria
- override por contrato
- validação por fonte de financiamento

-------------------------------------

3. IMPORTAÇÃO (PLANILHA / CSV)

Implementar ingestão de dados via:

- upload CSV
- leitura de planilha (Google Sheets ou similar)

Suportar importação de:

- planos de carreira
- classes
- steps salariais
- benefícios

Regras:
- validar estrutura antes de inserir
- impedir duplicidade
- permitir atualização controlada (upsert)

-------------------------------------

4. INTERFACE (FRONTEND)

Criar telas para:

A. Planos de carreira
- criar/editar plano
- definir parâmetros

B. Classes e faixas
- criar classes
- definir range de pontos
- editar steps salariais

C. Benefícios
- criar/editar/excluir benefício
- vincular à categoria

D. Contrato
- visualizar salário (classe + step)
- visualizar benefícios herdados
- aplicar override manual

-------------------------------------

5. LÓGICA CENTRAL

Implementar funções:

- obterSalarioContrato(contratoId)
- obterBeneficiosContrato(contratoId)

Garantir:
- uso de fonte única de dados
- nenhuma lógica duplicada
- integração com AppState (ou equivalente)

-------------------------------------

6. DOCUMENTAÇÃO (.md)

Criar/atualizar:

- docs/rh_estrutura_salarial.md
- docs/rh_beneficios.md
- docs/rh_integracao.md

Conteúdo:
- modelo de dados
- fluxo de cálculo
- regras de negócio
- integração com sistema

NÃO documentar antes da implementação estar estável.

-------------------------------------

7. DIRETRIZES CRÍTICAS

- NÃO hardcode nenhum valor
- NÃO duplicar lógica entre módulos
- NÃO criar soluções paralelas
- remover código legado conflitante
