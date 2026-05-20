# 📄 Análise de Arquivo — Setup.js

## 1. Identificação
- **Nome:** Setup.js
- **Caminho:** `/Setup.js`
- **Tipo:** Backend GAS — provisionamento
- **Camada:** backend/infraestrutura
- **Módulo:** Core — schema e inicialização do sistema multi-planilha

---

## 2. Propósito
Define o schema canônico do sistema e provê as funções de provisionamento da infraestrutura de planilhas. É o único lugar onde a estrutura de todos os módulos (7 planilhas, ~35 abas, cabeçalhos) está definida. Também fornece os helpers `_abrirModulo` e `_abrirAba` usados por `utils.js` como base do roteamento de acesso a dados.

---

## 3. Funções

### Constantes/Schema
| Constante | Descrição |
|-----------|-----------|
| `PROP` | Chaves do PropertiesService para IDs das 7 planilhas e pasta raiz |
| `MODULOS` | Estrutura canônica: nome, pasta, prop e `abas` (com cabeçalhos) de cada módulo |
| `COR_MODULO` | Cor hex do cabeçalho para identificação visual de cada planilha |

### Provisionamento
| Função | Descrição |
|--------|-----------|
| `inicializarSistema()` | Cria estrutura completa de pastas e planilhas; registra superadmin; inicializa parâmetros RH |
| `autorizarDrive()` | Helper de autorização prévia — executa antes da inicialização para resolver OAuth |
| `_criarEstruturaPastas()` | Cria/recupera pasta raiz e 7 subpastas; salva ID raiz no PropertiesService |
| `_buscarOuCriarSubpasta(parent, nome)` | Idempotente: retorna subpasta existente ou cria nova |
| `_criarTodasPlanilhas(pastas)` | Para cada módulo: reutiliza planilha existente (via ID salvo) ou cria nova |
| `_configurarAbas(ss, estrutura, cor)` | Cria abas ausentes, define cabeçalhos formatados e congela linha 1 |
| `_registrarSuperadmin()` | Adiciona email do executor na aba `Administradores` com nível `Superadmin` (se ausente) |

### Helpers de acesso (usados por utils.js)
| Função | Descrição |
|--------|-----------|
| `_abrirModulo(chave)` | Abre planilha pelo nome do módulo com cache em `_ssCache`; lança erro se não inicializado |
| `_abrirAba(chave, nomeAba)` | Atalho: abre aba específica com mensagem de erro clara |

### Manutenção/diagnóstico (execução manual)
| Função | Descrição |
|--------|-----------|
| `listarIdsModulos()` | Exibe IDs do PropertiesService — diagnóstico |
| `recriarEstrutura()` | Recria abas sem apagar dados — atualiza schema sem perda |
| `liberarItensOrfaos(idSala)` | Devolve ao estoque itens alocados em sala excluída |
| `debugProps()` | Lista todas as propriedades salvas |
| `processarFilasAutomaticamente()` | Placeholder noop para trigger agendado futuro |

### Inicialização de dados
| Função | Descrição |
|--------|-----------|
| `inicializarEquipePadrao()` | Insere registro padrão "Equipe Comunicação" se aba `Funcionarios` estiver vazia |
| `inicializarParametrosRH()` | Insere parâmetros RH padrão (meses, VT, VA, reajuste) se aba `ParametrosRH` estiver vazia |

---

## 4. Conexões
- **Quem chama:**
  - `inicializarSistema()`: execução manual pelo Superadmin no editor GAS
  - `_abrirModulo/_abrirAba`: chamados por `utils.js` (`_getSheet`), por módulos que usam `_abrirAba` diretamente (ex: `mod_escuta.gs`, `mod_equipes.gs`)
- **Quem é chamado:** `DriveApp`, `SpreadsheetApp`, `PropertiesService`, `Session`, `LockService`
- **Integrações:** PropertiesService como registro de IDs; Drive como repositório de planilhas

---

## 5. Funcionalidades
- **Schema único:** `MODULOS` é a única fonte de verdade para a estrutura de todas as planilhas — cabeçalhos, nomes de abas, colunas
- **Idempotência:** `_criarTodasPlanilhas` e `_configurarAbas` são seguros de reexecutar sem perda de dados
- **Cache por execução:** `_ssCache` evita múltiplos `openById` para o mesmo módulo em uma requisição GAS
- **Provisionamento defensivo:** se ID no PropertiesService existir mas planilha for deletada, cria nova automaticamente
- **Inicialização em cadeia:** `inicializarSistema` chama equipe e parâmetros RH em try/catch (não bloqueia o setup principal se falhar)

---

## 6. Possíveis Falhas

### 🔴 CRÍTICO
- **`MODULOS` desalinhado com `ABA_PARA_MODULO` em utils.js:** `MODULOS` define as abas canônicas mas `ABA_PARA_MODULO` (em utils.js) não cobre todas elas. Exemplos: abas `EscutaRespostas`, `EscutaConfig` etc. não aparecem nem em `MODULOS` nem em `ABA_PARA_MODULO` — foram adicionadas por `mod_escuta.gs` diretamente via `_abrirAba`, sem passar pelo schema de Setup.js. Isso cria um split entre abas "gerenciadas" pelo schema e abas "órfãs" criadas dinamicamente.
- **`inicializarSistema()` sem proteção contra execução em produção:** não existe flag ou verificação de ambiente para impedir execução acidental em produção. Uma reexecução acidental pode criar planilhas duplicadas se PropertiesService estiver limpo (ex: após reset de propriedades).

### 🟠 MÉDIO
- **`_ssCache` é variável global por execução GAS, não por requisição:** em GAS, cada invocação de função tem seu próprio contexto de execução — o cache é recriado do zero a cada requisição, mas dentro de uma única execução serve múltiplos `_getSheet` calls. O comentário sugere que o cache é "por execução", o que é correto, mas pode gerar confusão sobre seu escopo.
- **`_configurarAbas` sobrescreve linha 1:** ao reexecutar `recriarEstrutura`, os cabeçalhos da linha 1 são sobrescritos. Se dados foram inseridos na linha 1 acidentalmente (sem row freeze), são perdidos silenciosamente.
- **`liberarItensOrfaos` acessa coluna por índice hardcoded:** colunas 4 (Quantidade) e 5 (Localização) são acessadas por posição — se a estrutura da aba `Itens` mudar, a função quebra silenciosamente.

### 🟡 BAIXO
- **`inicializarEquipePadrao` cria registro com email genérico `comunicacao@ccbj.org`:** email não existe no sistema real — pode gerar inconsistências em lookups que esperam emails válidos.
- **`processarFilasAutomaticamente()` é noop:** placeholder sem implementação, mas exposto no namespace global — pode causar confusão se alguém configurar um trigger apontando para ele.
- **`debugProps()` exposto no namespace global:** lista todas as propriedades do script (incluindo IDs de planilhas de produção). Risco de exposição acidental se o script for compartilhado.

---

## 7. Qualidade do Código
**Positivos:**
- Schema centralizado e bem documentado — MODULOS é referência inequívoca
- Operações de provisionamento são idempotentes e seguras para reexecução
- Cache em `_ssCache` é elegante e resolve problema de desempenho real do GAS
- Funções de diagnóstico úteis e bem separadas das funções de setup

**Críticos:**
- Desalinhamento com `ABA_PARA_MODULO` cria dois sistemas de verdade
- Ausência de guard contra reexecução em produção é risco operacional

---

## 8. Melhorias Sugeridas
- Adicionar abas de Escuta, RH expandido ao `MODULOS` e sincronizar com `ABA_PARA_MODULO`
- Adicionar flag `AMBIENTE` (dev/prod) e guard em `inicializarSistema` para ambiente produtivo
- Substituir acesso por índice em `liberarItensOrfaos` por lookup de cabeçalho
- Remover `debugProps` do namespace global ou proteger com verificação de superadmin
- Marcar `processarFilasAutomaticamente` como `// TODO` com descrição do comportamento esperado

---

## 9. Papel no Sistema
- **Fluxo:** `inicializarSistema` → `_criarEstruturaPastas` + `_criarTodasPlanilhas` → PropertiesService → Drive/Sheets
- **Fluxo de runtime:** `utils.js._getSheet` → `_abrirModulo` → `_ssCache` ou `PropertiesService` → `SpreadsheetApp.openById`
- **Criticidade:** 🔴 CRÍTICO — `_abrirModulo/_abrirAba` são chamados por todos os módulos; falha aqui paralisa o sistema

---

## 10. Tags
`#backend` `#infraestrutura` `#setup` `#schema` `#planilhas` `#provisioning` `#cache`

---

## 11. Dependências
- **Depende de:** `DriveApp`, `SpreadsheetApp`, `PropertiesService`, `Session` (GAS Services)
- **É dependência para:** `utils.js` (via `_abrirModulo/_abrirAba`), todos os módulos `.gs` indiretamente

---

## 12. Relação com Problemas Existentes
- O desalinhamento entre `MODULOS` e `ABA_PARA_MODULO` é a raiz do problema documentado em utils.js: módulos mais novos (escuta, RH expandido) usam `_abrirAba` diretamente por não terem sido adicionados ao schema canônico.
- `_registrarSuperadmin` depende de `Session.getEffectiveUser()` que retorna string vazia em contextos sem autenticação — pode criar linha em branco na aba `Administradores`.

---

## 13. Alinhamento com a Visão
**Alinhado:** schema centralizado, provisionamento idempotente, cache eficiente, helpers reutilizáveis
**Desalinhado:** schema (`MODULOS`) e roteador (`ABA_PARA_MODULO`) divergiram com a adição de módulos novos — precisam ser reconciliados
