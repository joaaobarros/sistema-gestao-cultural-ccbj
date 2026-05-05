# 📄 Análise de Arquivo — mod_comunicacao.gs

## 1. Identificação
- **Nome:** mod_comunicacao.gs
- **Caminho:** `/mod_comunicacao.gs`
- **Tipo:** Backend GAS — módulo de negócio
- **Camada:** backend/domínio
- **Módulo:** Comunicação — Agenda RECE, convites, upload de imagens

---

## 2. Propósito
Módulo responsável pela Agenda RECE (Registro de Eventos e Comunicações Externas): CRUD de registros RECE, sincronização entre edições de reservas gerais e RECE, upload de imagens para Drive, envio de convites via Google Calendar e email institucional formatado em HTML.

---

## 3. Funções

| Função | Descrição |
|--------|-----------|
| `salvarReservaRece(dados)` | Upsert de registro RECE com lock e log de auditoria |
| `obterReservasRece()` | Lê aba ReservasRECE — retorna array 2D (25 colunas) |
| `cancelarReservaRece(id, email)` | Cancela registro RECE: verifica permissão comunicação/dono/admin |
| `excluirReservaRece(id, email)` | Exclui fisicamente (admin apenas) |
| `_sincronizarEdicaoComRece(dados)` | Sincroniza título, data, horário e espaço quando reserva geral é editada |
| `atualizarReceController(idReserva, dadosRece)` | Delega para `ReceService.atualizarCamposEspecificos` |
| `verificarPermissaoRece(email)` | Retorna `true` se email tem nível admin/superadmin/comunicação |
| `uploadImagemRece(base64, mime, nome)` | Decodifica base64, cria arquivo em pasta CCBJ_RECE_Imagens, compartilha como público |
| `enviarConvitesCalendar(dados)` | Cria evento no CalendarApp com convidados |
| `enviarConviteEmailInstitucional(dados)` | Envia email HTML formatado com identidade CCBJ para lista de destinatários |

---

## 4. Conexões
- **Quem chama:** Frontend via `GAS.comunicacao.*` (bridge); `mod_reservas.gs` (`salvarEdicaoReserva` chama `_sincronizarEdicaoComRece`)
- **Quem é chamado:**
  - `utils.js`: `_getSheet`, `validarEmail`, `normalizarEmail`, `obterLockComRetry`, `sanitizarTexto`
  - `mod_admin.gs`: `registrarLog`, `limparCacheUsuario`, `verificarDonoOuAdmin`, `verificarPermissao`
  - `mod_reservas.gs`: `ReceService` (definido em mod_reservas.gs)
  - `Codigo.gs`: `gerarId`, `obterMapaSalas`
  - GAS Services: `CalendarApp`, `DriveApp`, `GmailApp`, `UrlFetchApp`

---

## 5. Funcionalidades
- **Sincronização bidirecional:** quando reserva geral é editada, `_sincronizarEdicaoComRece` atualiza automaticamente o registro RECE vinculado (por ID ou por título+data)
- **Upload público de imagens:** `uploadImagemRece` cria arquivo no Drive com link público de thumbnail — sem autenticação necessária para leitura
- **Convites via CalendarApp:** integração direta com Google Calendar do executor do script
- **Email HTML formatado:** template com logo CCBJ e identidade visual hardcoded no código

---

## 6. Possíveis Falhas

### 🔴 CRÍTICO
- **URL do logo CCBJ hardcoded em `enviarConviteEmailInstitucional`:** `https://ccbj.org.br/wp-content/themes/CCBJ/assets/images/logo.png` — se a URL mudar, todos os emails institucionais terão o logo quebrado silenciosamente.
- **`uploadImagemRece` recebe base64 sem validação de tamanho ou tipo:** qualquer string base64 é aceita. Sem limite de tamanho, um upload malicioso poderia esgotar quota do Drive ou causar timeout.
- **`_sincronizarEdicaoComRece` vincula por título+data como fallback:** se dois registros RECE tiverem o mesmo título e data, a sincronização atualiza o primeiro encontrado — pode atualizar o registro errado silenciosamente.

### 🟠 MÉDIO
- **`enviarConvitesCalendar` usa o calendário principal do executor do script:** eventos são criados no calendário do superadmin (quem publicou o script), não no calendário do usuário que fez a requisição — pode gerar confusão de propriedade de eventos.
- **`cancelarReservaRece` acessa coluna 18 por índice hardcoded:** `aba.getRange(i + 1, 18).setValue("CANCELADO")` — se a estrutura da aba ReservasRECE mudar, cancela a coluna errada.
- **`obterReservasRece` lê 25 colunas mas `ReceRepository` acessa coluna 23 por índice:** duplo ponto de acesso ao schema com posições hardcoded diferentes (18, 23, 24, 25).

### 🟡 BAIXO
- **`enviarConviteEmailInstitucional` usa `GmailApp.sendEmail` com objeto mas com campo `htmlBody`:** a assinatura correta de `GmailApp.sendEmail` com opções usa `htmlBody` — OK, mas sem fallback de `body` para clientes que não renderizam HTML.
- **Pasta CCBJ_RECE_Imagens criada no Drive raiz do executor:** mesma vulnerabilidade de `DataLayer.gs` — pasta pertence ao superadmin.

---

## 7. Qualidade do Código
**Positivos:**
- Lock com retry em `salvarReservaRece` é correto
- Log de auditoria em todas as operações destrutivas
- `_sincronizarEdicaoComRece` com vinculação dupla (ID + título/data) é defensivo

**Críticos:**
- URLs hardcoded em emails (logo, miniatura Drive)
- Acesso a colunas por índice hardcoded em múltiplos lugares
- Upload sem validação de tamanho

---

## 8. Melhorias Sugeridas
- Mover URL do logo para PropertiesService ou constante configurável
- Adicionar validação de tamanho máximo em `uploadImagemRece` (ex: 5MB)
- Substituir acesso por índice (col 18, 23) por lookup de cabeçalho
- Adicionar `body` como fallback em `enviarConviteEmailInstitucional`

---

## 9. Papel no Sistema
- **Fluxo RECE:** Frontend → `salvarReservaRece` → aba ReservasRECE → (automático) sincroniza com reserva geral
- **Fluxo de imagem:** Frontend → `uploadImagemRece` → Drive CCBJ_RECE_Imagens → URL pública
- **Criticidade:** 🟠 MÉDIO — falha afeta módulo de comunicação e RECE, não reservas gerais

---

## 10. Tags
`#backend` `#comunicacao` `#rece` `#calendar` `#drive` `#upload` `#email`

---

## 11. Dependências
- **Depende de:** `utils.js`, `mod_admin.gs` (log/permissões), `mod_reservas.gs` (ReceService), `Codigo.gs` (gerarId, obterMapaSalas)
- **É dependência para:** Frontend do módulo comunicação, `mod_reservas.gs` (sincronização RECE)

---

## 12. Relação com Problemas Existentes
- A sincronização entre reservas gerais e RECE tem dois caminhos: `_sincronizarEdicaoComRece` (em mod_comunicacao.gs) e `ReceService.criarOuAtualizar` (em mod_reservas.gs). Ambos fazem operações similares mas com lógicas diferentes.

---

## 13. Alinhamento com a Visão
**Alinhado:** lock em escrita, log de auditoria, sincronização defensiva
**Desalinhado:** URLs hardcoded, índices de coluna hardcoded, upload sem validação de tamanho
