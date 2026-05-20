# 📄 Análise de Arquivo — DataLayer.gs

## 1. Identificação
- **Nome:** DataLayer.gs
- **Caminho:** `/DataLayer.gs`
- **Tipo:** Backend GAS — persistência
- **Camada:** backend/infraestrutura
- **Módulo:** Core — camada Drive JSON

---

## 2. Propósito
Camada de persistência alternativa baseada em arquivos JSON no Google Drive. Oferece operações de leitura e escrita seguras com lock de script para dados que não se encaixam no modelo tabular das planilhas — configurações flexíveis, preferências de usuário com estrutura variável, e os novos arquivos `permissoes_v2.json`, `usuarios_sistema.json`, `auditoria_permissoes.json`.

---

## 3. Funções

| Função | Descrição |
|--------|-----------|
| `getDataFolder()` | Localiza ou cria a pasta `CCBJ_DATA` no Drive raiz do script |
| `getFile(nome)` | Localiza ou cria arquivo JSON dentro de `CCBJ_DATA`; inicializa com `[]` se novo |
| `readJSON(nome)` | Lê e parseia arquivo JSON com `ScriptLock` de 5s; reseta para `[]` em caso de corrupção |
| `writeJSON(nome, data)` | Serializa e salva array com `ScriptLock` de 30s; relança erro se falhar |
| `readJSONAsMap(nome)` | Wrapper de `readJSON` que converte array → `{id → objeto}` |
| `writeJSONFromMap(nome, mapa)` | Wrapper de `writeJSON` que converte `{id → objeto}` → array via `Object.values` |

---

## 4. Conexões
- **Quem chama:**
  - `mod_almoxarifado.gs`: leitura/escrita de itens do almoxarifado (`almoxarifado.json`)
  - `mod_permissoes_v2.gs`: `permissoes_v2.json`, `usuarios_sistema.json`, `auditoria_permissoes.json`
  - `mod_preferencias.gs`: possivelmente `preferencias.json`
- **Quem é chamado:** `DriveApp`, `LockService.getScriptLock()`
- **Integrações:** pasta `CCBJ_DATA` no Drive do projeto GAS

---

## 5. Funcionalidades
- Abstração completa do acesso a arquivos Drive (sem expor DriveApp ao chamador)
- Lock de script previne race conditions em escrita concorrente de múltiplos usuários
- Auto-criação de pasta e arquivo na primeira leitura (bootstrap transparente)
- Variantes Map/Array para diferentes padrões de acesso nos módulos

---

## 6. Possíveis Falhas

### 🔴 CRÍTICO
- **`readJSON` usa `ScriptLock` (global) para leitura:** lock de script bloqueia TODOS os usuários durante leitura, mesmo sendo operação sem mutação. Em sistemas com múltiplos usuários simultâneos, isso cria gargalo de serialização desnecessário. Leitura deveria usar no máximo `UserLock` ou operar sem lock.
- **Corrupção silenciosa com perda de dados:** se `JSON.parse` lançar exceção, `readJSON` sobrescreve o arquivo com `[]` e retorna array vazio. Dados corrompidos são destruídos sem possibilidade de recuperação ou alerta para admins.

### 🟠 MÉDIO
- **`CCBJ_DATA` criada no Drive raiz do executor:** a pasta é criada no "Meu Drive" do usuário que executa o script (geralmente o superadmin), não em uma pasta compartilhada explícita. Se o superadmin sair ou revogar acesso, a pasta se torna inacessível.
- **`getFile` não valida extensão:** aceita qualquer string como nome de arquivo, incluindo nomes sem `.json`, o que pode gerar arquivos difíceis de identificar no Drive.
- **`readJSONAsMap` assume campo `id`:** filtra itens sem `id` silenciosamente — itens mal-formados são descartados sem log.

### 🟡 BAIXO
- **`writeJSONFromMap` não preserva ordem:** `Object.values` não garante ordem de inserção — para arquivos de auditoria (que são append-only em ordem cronológica), isso é inofensivo, mas para outros usos pode ser surpreendente.
- **Timeout de lock hardcoded:** 5s (leitura) e 30s (escrita) não são configuráveis — sem mecanismo de retry ou fallback se o lock expirar.

---

## 7. Qualidade do Código
**Positivos:**
- Implementação concisa e clara (128 linhas totais)
- `finally` garante liberação do lock mesmo em exceção
- Documentação por blocos bem estruturada
- Separação clara entre variante array e variante mapa

**Críticos:**
- Lock global em leitura é anti-padrão para sistemas com concorrência
- Silenciar corrupção com reset sem notificação é perigoso em produção

---

## 8. Melhorias Sugeridas
- Remover lock de `readJSON` (leitura de blob é idempotente) ou substituir por `UserLock`
- Em caso de corrupção, enviar alerta por email antes de resetar (ou apenas logar e lançar erro)
- Validar que `nome` termina em `.json` antes de criar/abrir o arquivo
- Adicionar log de audit trail em `writeJSON` (quem escreveu, quando, tamanho anterior/posterior)

---

## 9. Papel no Sistema
- **Fluxo:** módulo GAS → `readJSON/writeJSON` → `LockService` → `DriveApp` → arquivo `.json` em `CCBJ_DATA`
- **Criticidade:** 🟠 MÉDIO — falha afeta apenas módulos que usam Drive JSON (almoxarifado, permissões v2); o núcleo do sistema (reservas, admin, equipes) usa planilhas via `_getSheet`

---

## 10. Tags
`#backend` `#infraestrutura` `#drive` `#json` `#persistencia` `#lock` `#concorrencia`

---

## 11. Dependências
- **Depende de:** `DriveApp`, `LockService` (GAS Services)
- **É dependência para:** `mod_almoxarifado.gs`, `mod_permissoes_v2.gs`, `mod_preferencias.gs`

---

## 12. Relação com Problemas Existentes
- O comentário interno do arquivo já documenta o risco do `ScriptLock` em leitura — o problema é conhecido mas não corrigido.
- A perda silenciosa de dados em corrupção é especialmente arriscada para `auditoria_permissoes.json` (registros de auditoria de segurança).

---

## 13. Alinhamento com a Visão
**Alinhado:** abstração de acesso a Drive, separação de responsabilidades, lock para segurança em escrita
**Desalinhado:** lock global em leitura cria contenção desnecessária; corrupção silenciosa viola o princípio de falha explícita
