# 🧠 Mapa do Sistema CCBJ

## 1. Visão Geral

Sistema modular baseado em:
- HTML como camada de interface
- JS embutido em HTML como lógica
- Google Apps Script como backend
- Google Sheets como banco de dados

---

## 2. Estrutura Atual

### UI
- html/modulos
- html/layout

### Lógica
- logic/core
- logic/modules

### Serviços
- services/

### Backend
- Arquivos .gs

---

## 3. Problemas Estruturais Confirmados pela Análise

- **Schema drift:** `MODULOS` em Setup.js e `ABA_PARA_MODULO` em utils.js divergiram — módulos novos (Escuta, RH) criam abas sem registro no schema canônico
- **Dois sistemas paralelos sem sincronização:** itens, tarefas, funcionários, contratações — cada domínio tem uma versão Drive JSON (flexível) e uma versão em planilha (estruturada), sem integração
- **Conflito de reservas não verificado:** `criarReservaController` (entrypoint canônico) não chama `verificarConflitoEspaco` — aprovações via link de email podem criar sobreposições
- **Email de desenvolvedor em produção:** `emailAtivo.includes("joao.barros")` em mod_metrics.gs habilita criação livre sem confirmação
- **Funções críticas com bugs silenciosos:** `obterMetricasEficiencia` sempre retorna zeros; `calcularCustoPorMeta` sempre retorna zeros; CODIP de mod_reservas.gs é noop; `_mapaMetas` trata objetos como arrays

---

## 4. Backend — Módulos GAS Analisados

| Arquivo | Criticidade | Resumo |
|---------|-------------|--------|
| `Codigo.gs` | 🟠 MÉDIO | Entrypoint, gerarId, obterMapaSalas, doGet |
| `Setup.js` | 🔴 CRÍTICO | Schema canônico `MODULOS` — divergiu de utils.js |
| `DataLayer.gs` | 🔴 CRÍTICO | Persistência Drive JSON; ScriptLock em leituras causa contenção |
| `utils.js` | 🟠 MÉDIO | `_getSheet`, validações, `obterLockComRetry` |
| `mod_admin.gs` | 🔴 CRÍTICO | Boot (`obterDadosIniciais`), log, rate-limiting, preferências |
| `mod_reservas.gs` | 🔴 CRÍTICO | Domínio central; `criarReservaController` não verifica conflito |
| `mod_almoxarifado.gs` | 🟡 BAIXO | Almoxarifado Drive JSON; paralelo à aba Itens ESPACOS |
| `mod_estrategia.gs` | 🟡 BAIXO | 3 stubs lançam `Error("EM_BREVE")` |
| `mod_preferencias.gs` | 🟡 BAIXO | PreferenciasUsuarios; duplicado em mod_admin.gs |
| `mod_pessoal.gs` | 🟠 MÉDIO | Tarefas + balcão; dois sistemas paralelos de tarefas |
| `mod_equipes.gs` | 🟠 MÉDIO | `obterMetricasEficiencia` quebrada; dois repositórios de funcionários |
| `mod_comunicacao.gs` | 🟠 MÉDIO | Agenda RECE, Calendar, Drive upload; URLs hardcoded |
| `mod_comunicacao_processos.gs` | 🟠 MÉDIO | Processos/entregas/revisão; exclusão sem permissão |
| `mod_financeiro.gs` | 🟠 MÉDIO | RH + contratações; colunas Meta/Programa não no schema |
| `mod_metrics.gs` | 🟠 MÉDIO | Dashboard KPIs + Bêjotinha IA; email dev hardcoded |
| `mod_permissoes.gs` | 🟠 MÉDIO | v1 legado; sem lock em escrita; fallback binário admin/visitante |
| `mod_rh.gs` | 🟡 BAIXO | Folha CLT, ponto, diversidade; tabelas INSS hardcoded |
| `mod_relatorios.gs` | 🟠 MÉDIO | Contratos/metas/rubricas/CODIP; `compararVersoesContrato` duplicada |
| `mod_permissoes_v2.gs` | 🔴 ALTO | Sistema híbrido 4 camadas; auditoria sem lock |
| `mod_escuta.gs` | 🟠 MÉDIO | Escuta institucional/NR-1; cálculo pesado síncrono em cada resposta |

## 5. Problemas Sistêmicos Identificados

- **Schema drift:** `MODULOS` em Setup.js divergiu de `ABA_PARA_MODULO` em utils.js; módulos novos (Escuta, RH expandido) não definem abas no schema canônico
- **Dois sistemas paralelos:** itens (ESPACOS vs almoxarifado.json), tarefas (PESSOAL vs tarefas.json), funcionários (EQUIPES vs funcionarios.json), contratações (FINANCEIRO vs contratacoes.json)
- **Conflito de reservas não verificado em `criarReservaController`:** aprovação via email pode criar sobreposição
- **Email de dev hardcoded em produção:** `joao.barros` em mod_metrics.gs
- **Funções duplicadas em módulos distintos:** `compararVersoesContrato`, `calcularCustoVinculo`/`simularFolhaRH`, `_obterResponsaveisPorTipo`

## 6. Estratégia de Análise

Cada arquivo será analisado individualmente e conectado ao sistema geral.