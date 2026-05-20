# 📄 Análise de Arquivo — utils.js

## 1. Identificação
- **Nome:** utils.js
- **Caminho:** `/utils.js`
- **Tipo:** Backend GAS utilitário
- **Camada:** backend/infraestrutura
- **Módulo:** Core — compartilhado por todos os módulos GAS

---

## 2. Propósito
Biblioteca de funções puras e infraestrutura transversal do backend. É o único lugar que pode ser importado por qualquer módulo GAS sem risco de dependência circular. Define o roteador central de planilhas (`_getSheet`), funções de parsing/formatação de data/hora, validação, sanitização, índices de lookup e controle de concorrência.

---

## 3. Funções

### Roteamento de planilhas
| Função | Descrição |
|--------|-----------|
| `_getSheet(nomeAba)` | Roteador central: mapeia nome de aba → módulo via `ABA_PARA_MODULO`, chama `_abrirModulo()`, retorna `Sheet|null` |
| `verificarTodasAbas()` | Diagnóstico manual: testa acessibilidade de todas as abas mapeadas |

### Parsing e formatação de datas/horas
| Função | Descrição |
|--------|-----------|
| `normalizarData(data)` | Date/string → timestamp ms; aceita DD/MM/YYYY e YYYY-MM-DD |
| `formatarData(data)` | any → string DD/MM/YYYY |
| `normalizarHora(hora)` | Date/string HH:MM → minutos desde 00:00 |
| `formatarHora(minutos)` | minutos → string HH:MM |

### Validação
| Função | Descrição |
|--------|-----------|
| `validarEmail(email)` | boolean — regex |
| `normalizarEmail(email)` | string normalizada ou lança Error |
| `normalizarEmail_safe(email)` | versão segura que retorna null |
| `validarID(id)` | boolean — padrão XXX-TIMESTAMP-RANDOM |
| `normalizarID(id)` | string ou lança Error |
| `validarFormatoHora(hora)` | boolean — HH:MM |

### Comparações de horário
| Função | Descrição |
|--------|-----------|
| `horariosSobrepostos(ini1, ter1, ini2, ter2)` | algoritmo clássico de sobreposição de intervalos |
| `calcularDuracaoMinutos(inicio, fim)` | diferença em minutos |

### Índices de lookup
| Função | Descrição |
|--------|-----------|
| `criarIndiceID(dados)` | Array 2D → `{id → {dados, indice}}` |
| `criarIndiceColuna(dados, coluna)` | Array 2D → `{valor → [{dados, indice}]}` |
| `criarIndiceAdmins(dadosAdmins)` | `{email → {nivel, indice}}` |
| `criarIndiceSalas(dadosSalas)` | `{id → {nome, capacidade, email}}` |
| `criarIndiceItens(dadosItens)` | `{id → {nome, categoria, qtd, alocacao}}` |

### Sanitização
| Função | Descrição |
|--------|-----------|
| `sanitizarTexto(texto, maxLen)` | remove `<>`, limita comprimento |
| `sanitizarNumero(valor, min, max)` | garante range numérico |

### Concorrência
| Função | Descrição |
|--------|-----------|
| `obterLockComRetry(nome, timeoutMs, maxTentativas)` | `LockService.getUserLock()` com backoff exponencial |

### Formatação / Comparação
| Função | Descrição |
|--------|-----------|
| `formatarDuracao(minutos)` | minutos → "Xh Ymin" |
| `compararStrings(str1, str2)` | trim + lowercase |
| `logarErroSeguro(contexto, erro, ctx)` | console.error centralizado |

### Helpers globais (final do arquivo)
| Função | Descrição |
|--------|-----------|
| `gerarId(prefixo)` | ID único: PREFIXO-TIMESTAMP36-RANDOM |
| `isMesmoDia(dataReserva)` | compara com hoje sem horas |
| `_fmtMoedaInput(v)` | formata número como moeda BR (sem `R$`) |

---

## 4. Conexões
- **Quem chama:** todos os módulos `.gs` — `_getSheet` é chamada em todos
- **Quem é chamado:** `Setup.js` (`_abrirModulo`), `SpreadsheetApp`, `LockService`
- **Integrações:** via `ABA_PARA_MODULO` mapeia 30+ abas em 7 planilhas distintas

---

## 5. Funcionalidades
- Abstração completa do acesso multi-planilha via `_getSheet`
- Normalização de datas e horas para garantir comparações corretas
- Construção de índices O(1) para evitar iterações O(n) repetidas nos módulos
- Proteção de boundary (sanitização, validação) centralizada
- Lock com retry para operações críticas concorrentes

---

## 6. Possíveis Falhas

### 🔴 CRÍTICO
- **`_fmtMoedaInput` fora do lugar:** função de formatação monetária colocada no final do arquivo sem documentação, mistura responsabilidades com utils.js. Possível duplicação com função em `GestaoContratos.html`.
- **`ABA_PARA_MODULO` não inclui abas das planilhas de Escuta/RH/Almoxarifado:** sheets como `EscutaRespostas`, `Funcionarios` da planilha EQUIPES não estão mapeadas aqui — `_getSheet` falha silenciosamente (retorna null) e o módulo usa fallback `_abrirAba()` diretamente, quebrando a abstração.

### 🟠 MÉDIO
- **Lock em leitura:** `DataLayer.gs` usa `getScriptLock` mesmo para leitura, enquanto `utils.js` recomenda `getUserLock` — inconsistência de estratégia de lock.
- **`criarIndiceID` retorna `{dados, indice}` mas código legado espera acesso direto ao array:** potencial incompatibilidade se módulos antigos usarem o indice diretamente.

### 🟡 BAIXO
- **`verificarTodasAbas()` não verifica abas fora do `ABA_PARA_MODULO`** (ex: Escuta, RH da nova estrutura).
- **`gerarId` e `isMesmoDia` estão em `utils.js` mas também são documentados como dependência de `Codigo.gs`** — localização poderia ser mais clara.

---

## 7. Qualidade do Código
**Positivos:**
- Funções puras sem side effects, testáveis
- Documentação por blocos consistente e detalhada
- Tratamento defensivo (`try/catch`) em todas as funções
- Retorno de null ao invés de lançar exceção em `_getSheet` (compatibilidade com padrão legado)

**Críticos:**
- `_fmtMoedaInput` colocada no final sem contexto, viola o princípio de responsabilidade única
- `ABA_PARA_MODULO` incompleto — módulos mais novos (escuta, RH expandido) usam `_abrirAba` diretamente

---

## 8. Melhorias Sugeridas
- Completar `ABA_PARA_MODULO` com todas as abas dos módulos de Escuta, RH expandido e Almoxarifado
- Mover `_fmtMoedaInput` para módulo financeiro
- Adicionar índice de `EscutaPerguntas`, `EscutaRespostas` etc. em `criarIndice*`

---

## 9. Papel no Sistema
- **Fluxo:** qualquer módulo GAS → `_getSheet(nomeAba)` → `ABA_PARA_MODULO` → `_abrirModulo(modulo)` → SpreadsheetApp
- **Criticidade:** 🔴 CRÍTICO — falha aqui afeta todos os módulos backend

---

## 10. Tags
`#backend` `#infraestrutura` `#planilhas` `#utils` `#routing` `#validacao` `#lock`

---

## 11. Dependências
- **Depende de:** `Setup.js` (`_abrirModulo`, `_abrirAba`), GAS Services (`SpreadsheetApp`, `LockService`)
- **É dependência para:** todos os módulos `.gs` — dependência universal

---

## 12. Relação com Problemas Existentes
- Ponto central do problema de acesso multi-planilha; módulos novos que burlam `_getSheet` criam dois padrões de acesso concorrentes no sistema.

---

## 13. Alinhamento com a Visão
**Alinhado:** abstração centralizada de acesso a dados, funções puras, documentação consistente
**Desalinhado:** `ABA_PARA_MODULO` incompleto frustra o objetivo de centralização total
