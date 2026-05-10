# 📄 Análise de Arquivo — mod_permissoes_v2_js.html

## 1. Identificação
- **Nome:** mod_permissoes_v2_js.html
- **Caminho:** `/html/logic/mod_permissoes_v2_js.html`
- **Tipo:** Frontend JS — lógica de módulo
- **Camada:** frontend/logic
- **Módulo:** Permissões v2 — painel de gestão de usuários e permissões

---

## 2. Propósito
Frontend do sistema de permissões v2: carrega lista de usuários + permissões do backend, renderiza painel de gestão com lista navegável, painel de edição por usuário (perfil + módulos + origem manual/automática), sincronização de usuários, e formulário de edição com cálculo local de permissões para preview antes de salvar.

---

## 3. Funções

### Namespace e estado
| Elemento | Descrição |
|----------|-----------|
| `GAS.permissoesV2` | Extensão do namespace: `listar`, `obter`, `salvar`, `usuarios`, `sincronizar`, `calcularAuto`, `auditoria` |
| `_p2S` | Estado do módulo: `usuarios[]`, `permissoes[]`, `emailSelecionado`, `editando`, filtros, `saving` |
| `_P2_BASE_LOCAL` | Cópia local das permissões base dos 8 perfis — espelha `_P2_BASE` do backend |

### Carregamento
| Função | Descrição |
|--------|-----------|
| `p2CarregarDados()` | Carrega `listarPermissoesV2` → preenche `_p2S.usuarios` e `_p2S.permissoes` |
| `p2SincronizarUsuarios()` | Chama `sincronizarUsuariosSistema` no backend; recarrega dados |

### Lista de usuários
| Função | Descrição |
|--------|-----------|
| `p2RenderizarLista()` | Filtra + renderiza cards de usuário com badge "novo" se não configurado |
| `_p2FiltrarLista()` | Filtra por busca e status (todos/configurado/novo) |
| `p2FiltrarUsuarios(v)` | Atualiza filtro de busca e re-renderiza |
| `p2FiltroStatus(s)` | Ativa filtro de status + re-renderiza |

### Edição de usuário
| Função | Descrição |
|--------|-----------|
| `p2SelecionarUsuario(email)` | Seleciona usuário; cria `_p2S.editando` (deep copy); verifica se alvo é superadmin |
| `p2SetPerfil(perfil)` | Atualiza perfil e recalcula automaticamente módulos via `_p2BaseLocal` |
| `p2ToggleManual(mod, acao)` | Alterna override manual para um módulo (liga/desliga/reset) |
| `p2RecalcularPreview()` | Reconstrói `permissoes_finais` localmente usando mesma lógica de consolidação do backend |
| `p2Salvar()` | Persiste via `salvarPermissoesUsuarioV2`; desabilita botão durante salvamento |

### UI helpers
| Função | Descrição |
|--------|-----------|
| `_p2El(id)` | `document.getElementById` com prefixo |
| `_p2esc(s)` | Escapa caracteres HTML (aspas, < >) |
| `_p2FindPerm(email)` | Busca permissão no array local por email |
| `_p2PerfilLabel`, `_p2PerfilCor`, `_p2AvatarCls` | Rótulos e estilos por perfil |

---

## 4. Conexões
- **Quem chama:** `window._onShow_aba_permissoes_v2` ao abrir a aba (bootstrap)
- **Quem é chamado:**
  - `GAS.permissoesV2.*` (bridge para backend)
  - `AppState.usuario` (email, isSuperadmin, isAdmin)
  - `_p2El` → DOM do painel de permissões

---

## 5. Funcionalidades
- **Preview local de permissões:** `p2RecalcularPreview` implementa a mesma lógica de `_p2consolidar` do backend — o usuário vê o resultado final antes de salvar, sem round-trip ao servidor
- **Proteção de edição superadmin:** `p2SelecionarUsuario` bloqueia edição de superadmin por não-superadmin e bloqueia auto-rebaixamento no frontend (validação duplicada da validação backend)
- **Badges de usuários novos:** usuários sincronizados mas sem permissão configurada recebem badge "novo" para chamar atenção do admin
- **Filtros locais:** busca por nome/email e status (todos/configurado/novo) sem round-trip ao servidor

---

## 6. Possíveis Falhas

### 🔴 CRÍTICO
- **`_P2_BASE_LOCAL` é cópia hardcoded do backend:** idêntico a `_P2_BASE` em `mod_permissoes_v2.gs`. Se os perfis forem atualizados no backend mas não aqui, o preview local mostrará permissões incorretas — o usuário verá um estado diferente do que será efetivamente salvo.

### 🟠 MÉDIO
- **`p2RecalcularPreview` implementa consolidação localmente:** lógica duplicada de `_p2consolidar` (GAS). Qualquer divergência entre a lógica JS e a lógica GAS resulta em preview incorreto sem erro visível.
- **`p2Salvar` não valida dados antes de enviar:** confia que o estado `_p2S.editando` é sempre válido; se corrompido por bug de UI, envia dados inconsistentes ao backend.
- **`_p2esc` é implementação própria de escape HTML:** usa `replace` sequencial com `'&amp;'`, `'&lt;'`, etc. — se algum caracter especial não estiver na lista, gera XSS ao renderizar dados de nome/email de usuário.

### 🟡 BAIXO
- **Estado `_p2S.editando` é deep copy JSON:** `JSON.parse(JSON.stringify(perm))` perde tipos especiais (Date → string) — irrelevante para este módulo mas padrão frágil.
- **Sem debounce em `p2FiltrarUsuarios`:** chamado a cada keystroke; com muitos usuários, re-renderiza a cada tecla.

---

## 7. Qualidade do Código
**Positivos:**
- Preview local de permissões é UX excelente — elimina round-trips desnecessários
- Proteção dupla (frontend + backend) para superadmin é correto
- Estado `_p2S` bem estruturado com getters computados para `isSA`/`isAdmin`

**Críticos:**
- `_P2_BASE_LOCAL` hardcoded — sincronização manual obrigatória com backend
- Lógica de consolidação duplicada

---

## 8. Melhorias Sugeridas
- Carregar `_P2_BASE` do backend via `GAS.permissoesV2.calcularAuto` ao invés de hardcodar localmente
- Ou expor `_P2_BASE` via uma chamada de configuração para garantir sincronização
- Adicionar validação mínima em `p2Salvar` (ex: `perfil_base` é string válida)
- Substituir `_p2esc` por `escaparHTML` de `mod_ui_componentes_js` para consistência

---

## 9. Papel no Sistema
- **Fluxo:** aba aberta → `p2CarregarDados` → `p2RenderizarLista` → usuário seleciona → `p2SelecionarUsuario` → edita perfil/módulos → `p2RecalcularPreview` (local) → `p2Salvar` → backend
- **Criticidade:** 🟠 MÉDIO — gerencia permissões de todo o sistema; bug no preview pode induzir admin a salvar configuração incorreta

---

## 10. Tags
`#frontend` `#permissoes` `#admin` `#usuarios` `#drag-ui` `#preview`

---

## 11. Dependências
- **Depende de:** `GAS.permissoesV2.*`, `AppState`, `mod_ui_componentes_js` (`escaparHTML`)
- **É dependência para:** painel de permissões v2 no DOM

---

## 12. Relação com Problemas Existentes
- A duplicação de `_P2_BASE_LOCAL` vs `_P2_BASE` é o mesmo padrão de drift entre schema frontend e backend observado em outros módulos — mais um ponto de divergência silenciosa.

---

## 13. Alinhamento com a Visão
**Alinhado:** preview local sem round-trip, proteção de superadmin em camada dupla, filtros locais eficientes
**Desalinhado:** `_P2_BASE_LOCAL` hardcoded, lógica de consolidação duplicada, `_p2esc` própria em vez de reutilizar `escaparHTML`
