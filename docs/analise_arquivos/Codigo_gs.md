# 📄 Análise de Arquivo — Codigo.gs

## 1. Identificação
- **Nome:** Codigo.gs
- **Caminho:** `/Codigo.gs`
- **Tipo:** Backend GAS — entrypoint HTTP
- **Camada:** backend/entrypoint
- **Módulo:** Core — roteamento HTTP

---

## 2. Propósito
Ponto de entrada único do webapp GAS. Define `doGet`/`doPost` (handlers HTTP), a função `include()` para composição de templates HTML, e funções auxiliares de URL e notificação. É o "controller" do sistema no padrão MVC GAS.

---

## 3. Funções

| Função | Descrição |
|--------|-----------|
| `doGet(e)` | Handler HTTP GET: renderiza app (Index.html) ou processa ações inline de aprovação/recusa via query params |
| `doPost(e)` | Handler HTTP POST: processa formulário de recusa de solicitação |
| `include(filename)` | Template helper: injeta fragmento HTML no template principal |
| `getBaseUrl()` | Resolve URL pública do webapp com fallback hardcoded |
| `obterMapaSalas()` | Lê aba Configuracoes e retorna `{id → nome}` |
| `_notificarCancelamentoMesmoDia({...})` | Envia email para admins quando reserva é cancelada no mesmo dia |
| `chat_enviarMensagem(texto)` | Stub de compatibilidade (apenas console.log) |
| `obterMetricasCODIP()` | Stub EM_BREVE — lança Error |
| `gerarDocumentoDownload()` | Stub EM_BREVE — lança Error |
| `testeVSCode()` | Utilitário de desenvolvimento — Logger.log |

---

## 4. Conexões
- **Quem chama:** Google Apps Script runtime (HTTP requests externos)
- **Quem é chamado:**
  - `mod_admin.gs`: `aprovarSolicitacao`, `recusarSolicitacao`
  - `utils.js`: `_getSheet`, `gerarId`, `isMesmoDia`
  - `HtmlService`: renderização do template
  - `GmailApp`: envio de notificações
- **Integrações:** `Index.html` via `include()`, fluxo de aprovação por email

---

## 5. Funcionalidades
- **Renderização do app:** `doGet` sem parâmetros → renderiza `Index.html` com título, viewport e ALLOWALL
- **Aprovação inline por email:** `?acao=aprovar&id=X` → chama `aprovarSolicitacao` sem carregar o app completo
- **Formulário de recusa:** `?acao=recusar&id=X` → renderiza HTML mínimo com textarea; `doPost` processa o envio
- **Notificação de cancelamento no dia:** `_notificarCancelamentoMesmoDia` chamada por `mod_reservas.gs`

---

## 6. Possíveis Falhas

### 🔴 CRÍTICO
- **URL hardcoded:** `BASE_URL_FALLBACK` contém URL real de deployment embutida no código. Qualquer redeploy gera uma nova URL, tornando o fallback obsoleto e potencialmente expondo a URL de produção em repositórios.
- **XSS em doGet:** o parâmetro `id` é injetado diretamente no HTML do formulário de recusa (`value="${id}"`) sem sanitização — vetor de XSS se o id for forjado.

### 🟠 MÉDIO
- **`obterMapaSalas` duplicada:** mesma lógica existe em `mod_admin.gs` (`obterMapaSalas`). Duas fontes de verdade.
- **`chat_enviarMensagem` mantida "para compatibilidade" mas sem uso real:** código morto funcional.

### 🟡 BAIXO
- **Stubs lançam `Error("EM_BREVE")`:** `obterMetricasCODIP` e `gerarDocumentoDownload` registrados no bridge (`GAS.admin.*`) mas falham explicitamente — qualquer chamada frontend produz erro de usuário visível.
- **`testeVSCode()` em produção:** função de desenvolvimento exposta no namespace global.

---

## 7. Qualidade do Código
**Positivos:**
- Responsabilidade bem delimitada (só roteamento HTTP)
- Tratamento de erro em `doGet`/`doPost`
- Separação clara entre fluxo de email (aprovação/recusa) e fluxo de app

**Críticos:**
- XSS no formulário de recusa
- URL hardcoded em constante global
- Duplicação de `obterMapaSalas`

---

## 8. Melhorias Sugeridas
- Sanitizar `id` antes de injetar no HTML do formulário de recusa
- Mover `BASE_URL_FALLBACK` para PropertiesService
- Remover `obterMapaSalas` daqui (consolidar em `mod_admin.gs` ou `utils.js`)
- Remover `testeVSCode` e `chat_enviarMensagem`

---

## 9. Papel no Sistema
- **Fluxo:** Internet → `doGet/doPost` → HtmlService (app) ou handlers de aprovação
- **Criticidade:** 🔴 CRÍTICO — é o único ponto de entrada HTTP

---

## 10. Tags
`#backend` `#entrypoint` `#http` `#routing` `#email` `#xss-risk`

---

## 11. Dependências
- **Depende de:** `utils.js` (`_getSheet`), `mod_admin.gs` (aprovar/recusar), `GmailApp`, `HtmlService`
- **É dependência para:** todo o sistema (é o entrypoint)

---

## 12. Relação com Problemas Existentes
- O XSS no formulário de recusa é um risco de segurança real, especialmente porque o `id` vem de URL pública enviada por email.

---

## 13. Alinhamento com a Visão
**Alinhado:** responsabilidade única de roteamento HTTP
**Desalinhado:** URL hardcoded, código morto, XSS não endereçado
