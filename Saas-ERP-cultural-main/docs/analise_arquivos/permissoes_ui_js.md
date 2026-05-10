# 📄 Análise de Arquivo — permissoes_ui_js.html

## 1. Identificação
- **Nome:** permissoes_ui_js.html
- **Caminho:** `/html/logic/ui/permissoes_ui_js.html`
- **Tipo:** Frontend JS — UI pura
- **Camada:** frontend/ui
- **Módulo:** Permissões UI — visibilidade de elementos por nível de acesso

---

## 2. Propósito
Controla a visibilidade de elementos de UI com base no nível de acesso do usuário carregado em `AppState`. Oculta botões e seções administrativas para não-admins, esconde módulos "Em Breve" de não-superadmins, e redireciona usuários sem permissão que estejam em abas restritas. Executa via polling de `DOMContentLoaded` esperando `AppState` estar disponível.

---

## 3. Funções

| Função | Descrição |
|--------|-----------|
| `configurarInterfacePorPermissao()` | Mostra/oculta `#btn-aba-gestao`, `#btn-aba-auditoria`, `#modulo-sistema` por `isAdmin`/`isSuperadmin`; oculta `.em-breve-badge` de não-superadmin; redireciona se usuário sem permissão está em aba restrita |
| `esperarAppState()` | Polling: verifica se `AppState.usuario.email` existe; tenta até 30× com 200ms entre tentativas; chama `carregarPermissoes` → `configurarInterfacePorPermissao` |

---

## 4. Conexões
- **Quem chama:** `document.addEventListener('DOMContentLoaded', ...)` — auto-executa ao carregar o arquivo
- **Quem é chamado:**
  - `AppState.usuario.isAdmin/isSuperadmin`
  - `carregarPermissoes(cb)` (de `mod_permissoes_js.html`) — carrega permissões do backend
  - `mostrarAba('aba-lista-reservas')` — redirecionamento de navegação

---

## 5. Funcionalidades
- **Polling gracioso por AppState:** espera até 6 segundos (30 × 200ms) para o AppState ser inicializado antes de configurar a interface — tolera race conditions do boot assíncrono
- **Dois níveis de ocultação:** seção inteira (`#modulo-sistema`) para não-admins; botões individuais `.em-breve-badge` para não-superadmins
- **Redirecionamento reativo:** se usuário navegou para aba restrita antes das permissões carregarem, é redirecionado ao configurar

---

## 6. Possíveis Falhas

### 🟠 MÉDIO
- **Polling `esperarAppState` tem timeout de 6 segundos mas sem tratamento de falha:** após 30 tentativas sem sucesso, a função termina silenciosamente sem configurar permissões. Se o backend falhar e `AppState.usuario` nunca for preenchido, a interface fica com todos os botões visíveis (padrão inseguro — fail-open em vez de fail-secure).
- **`carregarPermissoes` chamada via verificação `typeof` sem fallback:** se `mod_permissoes_js.html` não for carregado antes deste arquivo, `console.warn` apenas — a interface fica sem configuração de permissões e `configurarInterfacePorPermissao` nunca é chamada.

### 🟡 BAIXO
- **77 linhas — responsabilidade muito restrita:** a função `configurarInterfacePorPermissao` cobre apenas 3 IDs específicos (`btn-aba-gestao`, `btn-aba-auditoria`, `modulo-sistema`) — qualquer novo botão restrito precisa ser adicionado aqui manualmente.
- **`document.querySelector('.tab-content:not(.hidden)')?.id`:** se múltiplas `.tab-content` não estiverem ocultas (bug de estado), retorna a primeira — comportamento impreciso.

---

## 7. Qualidade do Código
**Positivos:**
- Polling com limite de tentativas é abordagem correta para race condition de boot
- Separação de responsabilidade: apenas UI, sem regras de negócio

**Médio:**
- Fail-open em caso de timeout do polling — inseguro
- IDs de elementos hardcoded

---

## 8. Melhorias Sugeridas
- Adicionar comportamento fail-secure: se `tentativas >= 30` sem sucesso, ocultar todos os botões administrativos por padrão
- Usar `data-permissao="admin"` como atributo nos elementos e iterar `querySelectorAll` ao invés de IDs hardcoded

---

## 9. Papel no Sistema
- **Fluxo:** DOMContentLoaded → polling AppState → `carregarPermissoes` → `configurarInterfacePorPermissao` → mostra/oculta elementos
- **Criticidade:** 🟠 MÉDIO — controla visibilidade de UI; falha expõe botões mas backend protege operações

---

## 10. Tags
`#frontend` `#ui` `#permissoes` `#acesso` `#admin` `#visibilidade`

---

## 11. Dependências
- **Depende de:** `AppState`, `carregarPermissoes` (mod_permissoes_js.html), `mostrarAba` (navegacao_ui_js.html)
- **É dependência para:** inicialização da interface pós-login

---

## 12. Relação com Problemas Existentes
- Cobertura parcial de permissões de UI: apenas 3 elementos são controlados aqui; outros módulos sensíveis (RH, financeiro, contratações) dependem apenas do backend para proteção — frontend não oculta botões para esses módulos.

---

## 13. Alinhamento com a Visão
**Alinhado:** separação clara de responsabilidade (apenas UI), polling gracioso para race condition de boot
**Desalinhado:** fail-open em timeout, IDs hardcoded, cobertura incompleta de elementos restritos
