# 📄 Análise de Arquivo — navegacao_ui_js.html

## 1. Identificação
- **Nome:** navegacao_ui_js.html
- **Caminho:** `/html/logic/ui/navegacao_ui_js.html`
- **Tipo:** Frontend JS — UI pura
- **Camada:** frontend/ui
- **Módulo:** Navegação — troca de abas, sidebar, lazy loading, placeholders

---

## 2. Propósito
Ponto central de navegação entre abas: `mostrarAba` oculta todas as `.tab-content`, exibe a aba solicitada, atualiza o título, destaca botão ativo na sidebar, aplica proteção de acesso básica, dispara carregamento lazy por aba e fecha sidebar no mobile. `toggleSidebar` controla visibilidade da sidebar. `toggleModulo` colapsa/expande grupos na sidebar. `_mostrarPlaceholderEmBreve` exibe tela padrão para módulos não implementados.

---

## 3. Funções

| Função | Descrição |
|--------|-----------|
| `toggleSidebar()` | Alterna `-translate-x-full` e `hidden` da sidebar e overlay no mobile |
| `mostrarAba(idAba)` | Troca de contexto: oculta todas as abas, exibe a solicitada, atualiza título, destaca botão sidebar, verifica permissão, dispara lazy loading, fecha sidebar no mobile, scroll top |
| `toggleModulo(id)` | Colapsa/expande seção colapsável da sidebar via `classList.toggle('hidden')` |
| `_mostrarPlaceholderEmBreve(aba)` | Cria/reutiliza elemento `#aba-placeholder-embreve` com mensagem "Em Desenvolvimento" |

### Lazy loading por aba (dentro de `mostrarAba`)
| Aba | Função disparada |
|-----|-----------------|
| `aba-gestao-admin` | `renderizarEspacosAdmin`, `renderizarItensAdmin`, `renderizarSetoresAdmin`, `renderizarAdmins`, `carregarDadosContratos` |
| `aba-contratos-fin` | `_finOnShow` ou `carregarDadosContratos` |
| `aba-auditoria` | `carregarAuditoria` |
| `aba-agenda-rece` | `carregarReservasRece` |
| `aba-codip` | `carregarAbaCODIP` |
| `aba-dashboard` | `carregarDashboard` |
| `aba-aprovacoes` | `carregarSolicitacoes` |
| Qualquer `_onShow_*` | `window['_onShow_' + idAba.replace(/-/g,'_')]()` — dispatch genérico |

---

## 4. Conexões
- **Quem chama:** Todos os botões com `data-aba` e `onclick="mostrarAba(...)"` do sistema; módulos após concluir ação (ex: `carregarReservas` ao salvar)
- **Quem é chamado:**
  - `AppState.usuario.isAdmin/isSuperadmin` — verificação de acesso
  - Funções de carregamento de cada módulo (chamadas por nome se existirem)
  - `window._onShow_aba_xxx` — mecanismo de extensão genérico

---

## 5. Funcionalidades
- **Proteção de acesso embutida:** se usuário não é admin/superadmin e tenta acessar `aba-gestao-admin` ou `aba-auditoria`, é redirecionado para `aba-lista-reservas`
- **Dispatch genérico `_onShow_*`:** módulos podem registrar `window._onShow_aba_permissoes_v2 = function(){}` para ser notificados quando sua aba abre — desacoplamento elegante
- **Lazy loading:** dados só são carregados quando o usuário abre a aba pela primeira vez (com guard em `_ctrCache` para contratos)
- **Responsivo:** fecha sidebar automaticamente no mobile (`window.innerWidth < 768`) ao navegar

---

## 6. Possíveis Falhas

### 🟠 MÉDIO
- **Proteção de acesso apenas para `aba-gestao-admin` e `aba-auditoria`:** outras abas restritas (ex: `aba-rh`, `aba-financeiro`, `aba-contratacoes`) não têm redirecionamento embutido em `mostrarAba` — dependem apenas de `permissoes_ui_js` para esconder botões, mas não bloqueiam acesso direto por URL hash ou chamada programática.
- **`mostrarAba` chama funções por nome sem verificar se existem antes:** usa `typeof func === 'function'` em alguns casos, mas não em todos (ex: `renderizarContratos` chamada diretamente em linha 97 sem guard).

### 🟡 BAIXO
- **`_mostrarPlaceholderEmBreve` usa `document.querySelector('.flex-1.overflow-y-auto')`:** seletor de CSS que depende de estrutura de HTML específica — se o layout mudar, o placeholder é criado no lugar errado.
- **`titulos` em `mostrarAba` é um mapa hardcoded:** novas abas precisam ser adicionadas aqui manualmente ou recebem título "Sistema CCBJ" como fallback.
- **`window.scrollTo(0, 0)` ao final de `mostrarAba`:** comportamento de scroll pode ser inconveniente em SPA quando o usuário espera permanecer na posição.

---

## 7. Qualidade do Código
**Positivos:**
- `_onShow_*` dispatch genérico é arquiteturalmente extensível sem modificar este arquivo
- Guard `typeof func === 'function'` na maioria das chamadas lazy é defensivo
- Proteção de acesso no ponto de navegação (e não apenas na renderização de botões) é correto

**Médio:**
- Proteção de acesso incompleta para módulos sensíveis além de admin/auditoria

---

## 8. Melhorias Sugeridas
- Usar `window['_onShow_' + ...pattern` também para os lazy loaders atuais (elimina hardcoded por aba em `mostrarAba`)
- Adicionar título automático via `data-titulo` no elemento HTML da aba, em vez do mapa hardcoded
- Adicionar guard `typeof renderizarContratos === 'function'` antes da chamada na linha 99

---

## 9. Papel no Sistema
- **Fluxo:** Botão `data-aba` → `mostrarAba(id)` → oculta todas as abas → exibe a alvo → lazy loading → título + botão ativo
- **Criticidade:** 🔴 ALTO — `mostrarAba` é chamada em todo o sistema; bug aqui quebra toda a navegação

---

## 10. Tags
`#frontend` `#ui` `#navegacao` `#lazy-loading` `#sidebar` `#permissoes`

---

## 11. Dependências
- **Depende de:** `AppState` (permissões), funções de carregamento de cada módulo (por nome)
- **É dependência para:** todo o sistema de navegação do frontend

---

## 12. Relação com Problemas Existentes
- A proteção de acesso parcial em `mostrarAba` complementa `permissoes_ui_js.html` mas não cobre todos os módulos — cobertura desigual de segurança no frontend.

---

## 13. Alinhamento com a Visão
**Alinhado:** lazy loading, `_onShow_*` extensível, proteção de acesso no ponto de navegação, responsivo
**Desalinhado:** mapa de títulos hardcoded, proteção incompleta para módulos além de admin/auditoria
