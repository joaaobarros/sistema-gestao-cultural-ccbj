# 📄 Análise de Arquivo — mod_preferencias.gs

## 1. Identificação
- **Nome:** mod_preferencias.gs
- **Caminho:** `/mod_preferencias.gs`
- **Tipo:** Backend GAS — módulo de negócio
- **Camada:** backend/infraestrutura
- **Módulo:** Preferências — personalização de usuário

---

## 2. Propósito
Persiste preferências de usuário (ordem de favoritos na sidebar, configurações de exibição) na aba `PreferenciasUsuarios` da planilha MASTER. Funciona como par do frontend `mod_favoritos_js.html`.

---

## 3. Funções

| Função | Descrição |
|--------|-----------|
| `salvarPreferenciasUsuario(chave, valor)` | Upsert: atualiza se (email+chave) existir, cria nova linha se não |
| `carregarPreferenciasUsuario()` | Lê todas as preferências do usuário atual → `{chave: valor}` |

---

## 4. Conexões
- **Quem chama:** Frontend via `GAS.admin.salvarPreferencia` / `GAS.admin.obterPreferencia` (bridge) e `mod_favoritos_js.html`
- **Quem é chamado:** `_getSheet("PreferenciasUsuarios")`, `Session.getActiveUser()`

---

## 5. Funcionalidades
- Persistência de qualquer chave/valor serializado como JSON
- Leitura de todas as preferências do usuário em uma chamada

---

## 6. Possíveis Falhas

### 🟠 MÉDIO
- **Duplicação com `mod_admin.gs`:** `salvarPreferencia` e `obterPreferencia` estão implementadas TAMBÉM em `mod_admin.gs` (linhas 1421–1448). Duas implementações do mesmo comportamento. A de `mod_admin.gs` serializa o valor como string simples; a de `mod_preferencias.gs` usa `JSON.stringify` — comportamento diferente para o mesmo propósito.
- **`salvarPreferenciasUsuario` serializa como `JSON.stringify(valor)` mas `mod_admin.salvarPreferencia` usa `String(valor)`:** inconsistência de serialização que pode causar erros de parse ao ler preferências salvas pelo caminho errado.

### 🟡 BAIXO
- **Sem validação de `chave`:** aceita qualquer string, incluindo vazia.
- **Nomes inconsistentes:** função se chama `salvarPreferenciasUsuario` (plural) mas o bridge chama `salvarPreferencia` (singular em mod_admin.gs). Nomenclatura confusa.

---

## 7. Qualidade do Código
**Positivos:**
- Lógica simples e direta (50 linhas)
- `JSON.parse` com try/catch em `carregarPreferenciasUsuario` é defensivo

**Críticos:**
- Duplicação com mod_admin.gs com serialização incompatível

---

## 8. Melhorias Sugeridas
- Consolidar: escolher uma implementação e remover a outra
- Padronizar serialização (sempre JSON.stringify) e expor consistentemente via bridge
- Adicionar validação de `chave` não-vazia

---

## 9. Papel no Sistema
- **Fluxo:** Frontend (favoritos/drag-drop) → bridge → `salvarPreferenciasUsuario` → aba PreferenciasUsuarios
- **Criticidade:** 🟡 BAIXO — afeta apenas personalização de UI, não funcionalidades de negócio

---

## 10. Tags
`#backend` `#preferencias` `#sidebar` `#favoritos` `#usuario`

---

## 11. Dependências
- **Depende de:** `_getSheet` (utils.js), `Session` (GAS)
- **É dependência para:** `mod_favoritos_js.html` (frontend)

---

## 12. Relação com Problemas Existentes
- Duplicação com `mod_admin.gs` cria dois pontos de escrita para a mesma aba com serialização incompatível — bug latente para preferências salvas por um caminho e lidas pelo outro.

---

## 13. Alinhamento com a Visão
**Alinhado:** módulo isolado para responsabilidade específica
**Desalinhado:** duplicado em mod_admin.gs com serialização diferente
