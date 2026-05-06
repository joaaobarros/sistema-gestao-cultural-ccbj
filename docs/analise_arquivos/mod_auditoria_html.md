# 📄 Análise de Arquivo — mod_auditoria.html

## 1. Identificação
- **Nome:** mod_auditoria.html
- **Caminho:** `/html/modulos/mod_auditoria.html`
- **Tipo:** Frontend HTML — template de aba
- **Camada:** frontend/modulos
- **Módulo:** Auditoria — log de ações, log de acessos e comparativo de contratos

---

## 2. Propósito
Template HTML da aba de auditoria (`#aba-auditoria`): três sub-abas — Log de Ações (trilha de auditoria geral com rollback), Log de Acessos (logins/sessões), e Comparativo de Contratos (diff entre versões). Cada sub-aba tem estrutura HTML própria; conteúdo populado por `mod_admin_js.html`.

---

## 3. Estruturas

### Sub-abas
| Sub-aba | ID container | Visibilidade inicial |
|---------|-------------|---------------------|
| Log de Ações | `#subaba-logs` | Visível |
| Log de Acessos | `#subaba-acessos` | `hidden` |
| Comparativo | `#subaba-comparativo` | `hidden` |

### Log de Ações
- Busca: `#buscaLog` com `oninput="filtrarLogs(this.value)"` — filtro em tempo real
- Botão "Desfazer Última Ação" → `executarRollback()` (superadmin)
- Tabela 8 colunas: Data/Hora, Operador, Ação, Alvo, Detalhes, Antes, Depois, Reverter
- Corpo: `#tabelaLogs` — estado inicial com mensagem "Aguardando autorização..."

### Log de Acessos
- Busca: `#buscaLogAcessos` com `oninput="filtrarLogAcessos(this.value)"`
- Tabela 4 colunas: Data/Hora, Usuário, IP/Dispositivo, Tipo
- Corpo: `#tabelaLogAcessos` — estado inicial com spinner "Carregando..."

### Comparativo de Contratos
- Select: `#filtroContratoComparativo` (populado por JS)
- Inputs: `#versao1`, `#versao2` (números)
- Botão → `carregarComparativoContratoUI()`
- Container resultado: `#comparativoContrato`

---

## 4. Conexões
- **Quem chama:** `mostrarAba('aba-auditoria')` → `carregarAuditoria()` (lazy loading em `navegacao_ui_js.html`)
- **Quem é chamado:**
  - `mostrarSubAbaAuditoria(aba)` — troca entre os 3 sub-tabs (mod_admin_js)
  - `filtrarLogs()`, `filtrarLogAcessos()` — filtro em tempo real (mod_admin_js)
  - `executarRollback()` — desfazer última ação (mod_admin_js)
  - `carregarComparativoContratoUI()` — diff de versões de contrato (mod_admin_js ou mod_contratos_js)

---

## 5. Funcionalidades
- **Três perspectivas de auditoria:** ações do sistema (quem fez o quê quando), acessos (logins), e comparativo estrutural de versões de contrato
- **Rollback direto:** botão "Desfazer Última Ação" no header da sub-aba — prominente e de acesso rápido (protegido por SweetAlert2 + verificação superadmin no JS)
- **Filtros em tempo real:** ambas as tabelas de log têm filtragem local via `oninput` sem round-trip
- **Estado de carregamento diferenciado:** Log de Ações mostra "Aguardando autorização" (sugere carregamento preguiçoso explícito), Log de Acessos mostra spinner (sugere carregamento automático)

---

## 6. Possíveis Falhas

### 🔴 CRÍTICO
- **`carregarComparativoContratoUI()` chama `compararVersoesContrato` no backend** — que tem o bug crítico de definição dupla (a segunda sobrescreve a primeira em GAS). O comparativo pode usar lógica incorreta ou retornar dados inconsistentes.

### 🟠 MÉDIO
- **`executarRollback()` acessível de qualquer admin no HTML** — a proteção superadmin está no JS (`executarRollback()` verifica `isSuperadmin` via SweetAlert2 antes de chamar o backend), mas o botão é visível para todos os admins, o que pode gerar chamadas abortadas desnecessárias.
- **Estado inicial inconsistente entre sub-abas:** Log de Ações mostra "Aguardando autorização" mas Log de Acessos mostra spinner — carregamento assíncrono diferenciado pode confundir o usuário sobre se a aba está carregando ou bloqueada.

### 🟡 BAIXO
- **`#versao1` e `#versao2` são inputs `type="number"` sem validação:** usuário pode inserir versão negativa ou maior que o total de versões sem feedback imediato — depende do JS do backend para validar.
- **`#filtroContratoComparativo` populado por JS sem loading state:** enquanto o select está vazio (antes do JS popular), o botão "Comparar" pode ser clicado sem contrato selecionado.

---

## 7. Qualidade do Código
**Positivos:**
- Três perspectivas de auditoria em uma única aba com sub-tabs é padrão de UX limpo
- Filtros em tempo real nas tabelas de log são essenciais para auditorias práticas
- Estado de espera "Aguardando autorização" é mensagem mais honesta que spinner genérico

**Críticos:**
- Comparativo de contratos depende de função backend com bug de definição dupla

---

## 8. Melhorias Sugeridas
- Adicionar `disabled` no botão "Comparar" até `#filtroContratoComparativo` ter valor selecionado
- Adicionar validação de range nos inputs `#versao1`/`#versao2` via `min="1"` e troca dinâmica de máximo

---

## 9. Papel no Sistema
- **Fluxo Auditoria:** `carregarAuditoria()` → `renderizarLogs()` → tabela com rollback por linha
- **Fluxo Comparativo:** seleciona contrato + versões → `carregarComparativoContratoUI()` → diff visual
- **Criticidade:** 🟠 MÉDIO — auditoria é crítica para compliance; o comparativo de contratos está funcionalmente quebrado pelo bug de GAS

---

## 10. Tags
`#frontend` `#html` `#auditoria` `#logs` `#rollback` `#comparativo` `#contratos` `#template`

---

## 11. Dependências
- **Depende de:** `mod_admin_js.html` (todas as funções de auditoria e comparativo), `GAS.admin.obterLogs`, `GAS.admin.obterLogAcessos`, `GAS.admin.rollbackPorIndice`, `GAS.contratos.compararVersoesContrato`
- **É dependência para:** controle e compliance do sistema

---

## 12. Relação com Problemas Existentes
- A sub-aba Comparativo de Contratos usa `compararVersoesContrato` do backend — que tem definição duplicada em `mod_relatorios.gs` (segunda sobrescreve a primeira). O comparativo pode retornar dados da lógica incorreta sem erro visível.

---

## 13. Alinhamento com a Visão
**Alinhado:** três perspectivas de auditoria, filtros em tempo real, rollback por linha e global, estado de espera explícito
**Desalinhado:** comparativo de contratos dependente de bug backend, botão Rollback visível para todos os admins
