# 📄 Análise de Arquivo — mod_permissoes.gs

## 1. Identificação
- **Nome:** mod_permissoes.gs
- **Caminho:** `/mod_permissoes.gs`
- **Tipo:** Backend GAS — módulo de negócio
- **Camada:** backend/domínio
- **Módulo:** Permissões v1 — perfis padrão, CRUD Drive JSON

---

## 2. Propósito
Sistema de permissões v1 (legado): define 5 perfis padrão com mapeamento módulo→booleano, persiste permissões customizadas em `permissoes.json` no Drive, e fornece verificadores (`podeAcessarModulo`, `podeEditar`, `podeExcluir`) usados pelo restante do backend.

---

## 3. Funções

| Função | Descrição |
|--------|-----------|
| `obterPermissoesUsuario(email)` | Lê `permissoes.json`; busca por email; fallback para `verificarPermissao('admin')` → perfil padrão por nível |
| `podeAcessarModulo(email, modulo)` | Retorna boolean de acesso ao módulo para o email |
| `podeEditar(email, modulo)` | Retorna boolean de permissão de edição |
| `podeExcluir(email, modulo)` | Retorna boolean de permissão de exclusão |
| `salvarPermissaoUsuario(dados)` | Upsert em `permissoes.json` por email |
| `listarPermissoes()` | Retorna todo o array de `permissoes.json` |
| `excluirPermissaoUsuario(email)` | Remove entrada por email de `permissoes.json` |

### Constante `_PERFIS_PADRAO`
5 perfis mapeados a objeto `{modulo: boolean}`:
- `superadmin`: acesso total a todos os módulos
- `admin`: acesso a quase todos exceto módulos internos avançados
- `gestor`: acesso a reservas, agenda, RECE, relatórios, CODIP, equipes
- `tecnico`: acesso a reservas, agenda, itens, almoxarifado
- `visitante`: apenas visualização de agenda e dashboard

---

## 4. Conexões
- **Quem chama:** `mod_permissoes_v2.gs` (wrapper substitui `obterPermissoesUsuario`); frontend via `GAS.permissoes.*`
- **Quem é chamado:**
  - `DataLayer.gs`: `readJSON`, `writeJSON`
  - `mod_admin.gs`: `verificarPermissao` (usado no fallback de `obterPermissoesUsuario`)

---

## 5. Funcionalidades
- **Perfis padrão por nível:** se o email não tiver permissão customizada em JSON, o fallback consulta `verificarPermissao('admin')` para inferir se é admin e retorna o perfil adequado
- **CRUD Drive JSON:** operações sobre `permissoes.json` sem lock — risco de race condition em sistemas concorrentes
- **Verificadores isolados:** `podeAcessarModulo`, `podeEditar`, `podeExcluir` são stateless e podem ser chamados a qualquer momento

---

## 6. Possíveis Falhas

### 🔴 CRÍTICO
- **`obterPermissoesUsuario` fallback assume que "não é admin = visitante":** se o usuário não tem entrada em `permissoes.json` e não é admin, recebe perfil `visitante` — sem diferenciação entre usuários autenticados com papéis intermediários (gestor, técnico). Novos usuários legítimos ficam presos com acesso mínimo até o admin cadastrá-los manualmente.
- **Sistema v1 convive com v2 sem integração clara:** `mod_permissoes_v2.gs` substitui `obterPermissoesUsuario` como wrapper, mas `podeAcessarModulo`, `podeEditar`, `podeExcluir` ainda são chamadas diretas ao v1 — sistema híbrido sem contrato formal.

### 🟠 MÉDIO
- **`salvarPermissaoUsuario` e `excluirPermissaoUsuario` sem lock:** operações de escrita em `permissoes.json` sem `LockService` — concorrência pode causar perda silenciosa de dados.
- **`_PERFIS_PADRAO` definido localmente em vez de ser fonte canônica:** os nomes e módulos dos perfis são hardcoded aqui, mas `mod_permissoes_v2.gs` define seus próprios 8 perfis — duas definições de perfis no sistema.

### 🟡 BAIXO
- **`listarPermissoes` sem paginação ou filtro:** retorna todo `permissoes.json` — pode ser lento com muitos usuários.

---

## 7. Qualidade do Código
**Positivos:**
- Código compacto e direto — 122 linhas para CRUD completo
- Verificadores stateless são fáceis de testar
- Fallback gracioso em `obterPermissoesUsuario`

**Críticos:**
- Sem lock em escrita
- Dois sistemas de perfis (v1 aqui vs v2) sem sincronização
- Fallback binário admin/visitante ignora perfis intermediários

---

## 8. Melhorias Sugeridas
- Adicionar `LockService` em `salvarPermissaoUsuario` e `excluirPermissaoUsuario`
- Unificar definição de perfis com `mod_permissoes_v2.gs`
- Melhorar fallback para incluir lógica de perfil por setor ou domínio de email

---

## 9. Papel no Sistema
- **Fluxo v1:** `obterPermissoesUsuario` → `permissoes.json` → perfil → `podeAcessarModulo`
- **Fluxo v2:** `mod_permissoes_v2.gs` wraps `obterPermissoesUsuario` e adiciona camadas de hierarquia
- **Criticidade:** 🟠 MÉDIO — sistema legado ainda em uso; v2 depende do v1 como base

---

## 10. Tags
`#backend` `#permissoes` `#perfis` `#acesso` `#drive-json` `#legado`

---

## 11. Dependências
- **Depende de:** `DataLayer.gs`, `mod_admin.gs` (`verificarPermissao`)
- **É dependência para:** `mod_permissoes_v2.gs`, frontend do módulo de permissões

---

## 12. Relação com Problemas Existentes
- O fallback admin/visitante é uma simplificação que funcionava quando o sistema tinha apenas 2 tipos de usuários (admin e visitante); com a evolução para 5+ perfis, o fallback passou a ser insuficiente.
- A coexistência de v1 e v2 sem deprecação formal do v1 cria ambiguidade sobre qual é a fonte canônica de permissões.

---

## 13. Alinhamento com a Visão
**Alinhado:** verificadores stateless, CRUD simples, perfis documentados
**Desalinhado:** sem lock em escrita, dois sistemas de perfis, fallback binário insuficiente para perfis intermediários
