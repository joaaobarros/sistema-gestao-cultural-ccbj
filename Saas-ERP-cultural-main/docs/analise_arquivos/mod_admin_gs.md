# 📄 Análise de Arquivo — mod_admin.gs

## 1. Identificação
- **Nome:** mod_admin.gs
- **Caminho:** `/mod_admin.gs`
- **Tipo:** Backend GAS — módulo de negócio
- **Camada:** backend/domínio
- **Módulo:** Admin — autenticação, configurações, logs, solicitações

---

## 2. Propósito
Módulo central de administração do sistema. Concentra: identificação e autenticação de usuários via Google Session; bootstrap do frontend (`obterDadosIniciais`); controle de permissões v1; logging de auditoria e acesso; CRUD de espaços, itens, setores e administradores; fluxo completo de solicitações de reserva (criar, listar, aprovar, recusar); rollback de ações; rate limiting; e preferências de usuário.

---

## 3. Funções

### Identificação e sessão
| Função | Descrição |
|--------|-----------|
| `obterEmailUsuario(fallback)` | Resolve email do usuário ativo via Session, com fallback de cliente |
| `obterPerfilUsuario()` | Email + nome + foto via People API (melhor esforço) |
| `obterUrlLogout()` | URL de logout Google com redirect para o app |
| `obterEmailsSistema()` | Todos os emails conhecidos: admins + log + responsáveis de reservas |
| `resolverNomePorEmail(email)` | Nome display via AdminDirectory API, fallback para People API |

### Permissões v1
| Função | Descrição |
|--------|-----------|
| `verificarPermissao(nivel, email)` | Valida se email tem nível na aba Administradores; superadmin passa qualquer nível |
| `verificarDonoOuAdmin(emailDono, emailAtual)` | Autoriza se dono do recurso ou admin |

### Dados iniciais
| Função | Descrição |
|--------|-----------|
| `obterDadosIniciais(emailCliente)` | Entrypoint de boot: retorna salas, itens, setores, admins, mapas, índices, nível de acesso — com CacheService por usuário (60s) |
| `limparCacheUsuario(email)` | Invalida cache de `obterDadosIniciais` |

### Logs e auditoria
| Função | Descrição |
|--------|-----------|
| `registrarLog(acao, tipo, alvo, detalhes, antes, depois, email)` | Append na aba Logs com sanitização |
| `obterLogs(email)` | Lê todos os logs (superadmin only); retorna JSON invertido |
| `registrarAcesso(email, nivel)` | Append em LogAcessos com dedup por CacheService (300s) |
| `obterLogAcessos(email)` | Lê todos os acessos (admin only) |

### Rollback
| Função | Descrição |
|--------|-----------|
| `rollbackAcaoPorIndice(email, indice)` | Reverte ação pelo índice no log (superadmin only) |
| `rollbackAcaoPorTimestamp(email, ts)` | Reverte ação por timestamp exato (superadmin only) |
| `_executarRollback(log, email, ref)` | Implementação: EXCLUSÃO→restore, EDIÇÃO→reverter, CRIAÇÃO→deletar |

### CRUD de configurações
| Função | Descrição |
|--------|-----------|
| `processarSalvarConfig(dados)` | CRUD unificado para espaco/item/usuario/setor com log |
| `removerRegistroGenerico(id, tipo, email)` | Remove por tipo com log de exclusão |
| `obterDadosParaConfig(nomeAba)` | Lê aba genérica — usado pelo painel de configuração |
| `alternarQuantidadeItem(idItem, idSala, qtd, acao, email)` | Fixar/liberar itens entre estoque e sala |
| `obterMapaSalas()` | Lê Configuracoes → `{id → nome}` |

### Solicitações
| Função | Descrição |
|--------|-----------|
| `obterAdmins()` | Retorna array de emails de administradores |
| `obterDonoEspaco(salaOuId, diaSemana)` | Retorna email(s) do dono do espaço, com suporte a agenda por dia da semana |
| `notificarSolicitacao(s)` | Envia email de notificação para admins e dono do espaço com links de aprovação |
| `chat_criarSolicitacao(tipo, subtipo, dados, usuario, justificativa)` | Cria solicitação com lock; notifica async |
| `listarSolicitacoesPendentes(email)` | Filtra por perfil: admin vê tudo; dono vê sua sala; usuário vê as próprias |
| `listarTodasSolicitacoes(email)` | Histórico completo (admin ou dono de espaço) |
| `aprovarSolicitacao(id, email)` | Aprova: executa ação (criar/alterar/cancelar reserva); notifica solicitante |
| `recusarSolicitacao(id, justificativa, email)` | Recusa: atualiza status; notifica solicitante |

### Segurança e utilitários
| Função | Descrição |
|--------|-----------|
| `validarCamposObrigatorios(obj, campos)` | Valida presença de campos; lança Error com nome do campo |
| `validarReserva(dados)` | Valida horário (08:00–21:30), nome da ação (3–100 chars) |
| `limitarRequisicoes(chave, limite, intervalo)` | Rate limiting por CacheService por usuário |
| `detectarComportamentoSuspeito(acao)` | Bloqueia se mesma ação for chamada >2x em 5 segundos |
| `salvarPreferencia(chave, valor)` | Upsert em PreferenciasUsuarios |
| `obterPreferencia(chave)` | Leitura em PreferenciasUsuarios |

---

## 4. Conexões
- **Quem chama:**
  - `Codigo.gs` (`doGet`/`doPost`): `aprovarSolicitacao`, `recusarSolicitacao`
  - Frontend via `server_bridge_js.html` (`GAS.admin.*`): `obterDadosIniciais`, `processarSalvarConfig`, `removerRegistroGenerico`, etc.
  - `mod_reservas.gs`: `registrarLog`, `limparCacheUsuario`, `verificarPermissao`
- **Quem é chamado:**
  - `utils.js`: `_getSheet`, `criarIndiceAdmins`, `criarIndiceSalas`, `criarIndiceItens`, `validarEmail`, `sanitizarTexto`, `normalizarHora`, `validarFormatoHora`
  - `mod_reservas.gs`: `criarReservaController`, `atualizarReservaController`, `cancelarReserva`
  - `Codigo.gs`: `gerarId`, `getBaseUrl`
  - GAS Services: `Session`, `CacheService`, `LockService`, `GmailApp`, `UrlFetchApp`

---

## 5. Funcionalidades
- **Boot centralizado:** `obterDadosIniciais` é o único ponto de carga inicial do frontend — retorna todos os dados em uma chamada, com cache de 60s para performance
- **Fluxo de solicitação completo:** cria → notifica → aprova/recusa → notifica resultado → executa ação real
- **Rollback auditável:** operações reversíveis registradas em log com dados antes/depois; rollback também gera entrada de log
- **Rate limiting duplo:** `limitarRequisicoes` (janela deslizante) + `detectarComportamentoSuspeito` (burst de 5s)
- **Dono de espaço com agenda:** `obterDonoEspaco` suporta JSON de donos com campo `dias` por dia da semana

---

## 6. Possíveis Falhas

### 🔴 CRÍTICO
- **`verificarPermissao` verifica apenas a aba Administradores (v1):** não integra com `mod_permissoes_v2.gs`. O sistema de permissões v2 tem seu próprio motor de consolidação, mas `verificarPermissao` continua consultando a aba flat de admins. Duas fontes de verdade para controle de acesso.
- **`aprovarSolicitacao` e `recusarSolicitacao` têm lógica duplicada de verificação de dono:** ambas implementam o mesmo bloco de lookup de dono de espaço (~40 linhas idênticas) — violação do DRY e vetor de inconsistência de comportamento.
- **`_executarRollback` parseia dados de log concatenados com ` | `:** formato `pipe-separated` do log não suporta valores que contenham ` | ` — dados com esse padrão seriam particionados incorretamente, corrompendo o rollback.

### 🟠 MÉDIO
- **`obterDadosIniciais` retorna `_indiceAdmins`, `_indiceSalas`, `_indiceItens` ao cliente:** índices internos do backend são serializados e trafegados como JSON para o frontend. Isso aumenta o payload e expõe estrutura interna desnecessariamente.
- **`obterMapaSalas` duplicada:** existe aqui e também em `Codigo.gs` — duas implementações da mesma lógica.
- **`resolverNomePorEmail` faz chamadas HTTP (`AdminDirectory`, `People API`) dentro de `obterDadosIniciais`:** em instâncias com muitos admins, isso pode causar timeout (GAS tem limite de 30s) ou gerar erros de quota da API.
- **`salvarPreferencia` / `obterPreferencia` duplicam funcionalidade de `mod_preferencias.gs`:** existe um módulo dedicado para preferências mas as funções são também implementadas aqui.

### 🟡 BAIXO
- **`limitarRequisicoes` usa CacheService por usuário mas chave sem prefixo de email:** chave `"salvar_config"` é compartilhada por execuções do mesmo usuário mas é UserCache — tecnicamente correto, mas nome da chave não deixa isso claro.
- **`registrarAcesso` usa nome derivado do email (`split('@')[0]`):** não resolve o nome real do usuário — `LogAcessos.Nome Usuário` fica com a parte local do email, não com o nome display.
- **`validarReserva` com horário hardcoded 08:00–21:30:** range de horário deveria ser configurável (ex: via aba Configuracoes), não hardcoded no código.

---

## 7. Qualidade do Código
**Positivos:**
- Arquivo bem organizado em seções claramente delimitadas
- Rate limiting e detecção de comportamento suspeito são funcionalidades defensivas valiosas
- Lock em operações críticas de aprovação/recusa previne race conditions
- Cache de dados iniciais melhora significativamente a performance de boot

**Críticos:**
- Lógica duplicada de verificação de dono em `aprovarSolicitacao`/`recusarSolicitacao`
- Rollback dependente de formato frágil de serialização
- Responsabilidade dupla: módulo de admin gerencia também preferências (deveria delegar)

---

## 8. Melhorias Sugeridas
- Extrair verificação de dono de espaço para função `_verificarDonoSolicitacao(id, email)` e reutilizar em aprovar/recusar
- Integrar `verificarPermissao` com v2 ou deprecá-la explicitamente
- Remover `_indiceAdmins/_indiceSalas/_indiceItens` do retorno de `obterDadosIniciais`
- Substituir log pipe-separated por JSON para suportar rollback confiável
- Externalizar horários de reserva (08:00–21:30) para aba Configuracoes

---

## 9. Papel no Sistema
- **Fluxo de boot:** Frontend → `obterDadosIniciais` → cache check → 4 planilhas → retorno com tudo
- **Fluxo de aprovação:** Email com link → `doGet?acao=aprovar` → `aprovarSolicitacao` → `criarReservaController` → email de confirmação
- **Criticidade:** 🔴 CRÍTICO — `obterDadosIniciais` é chamada em todo boot; `aprovarSolicitacao`/`recusarSolicitacao` são o core do fluxo de negócio

---

## 10. Tags
`#backend` `#admin` `#auth` `#permissoes` `#logs` `#solicitacoes` `#cache` `#rate-limit`

---

## 11. Dependências
- **Depende de:** `utils.js` (helpers), `mod_reservas.gs` (criar/alterar/cancelar reserva), `Codigo.gs` (gerarId, getBaseUrl), GAS Services
- **É dependência para:** frontend (via bridge), `Codigo.gs` (fluxo de email), `mod_reservas.gs` (registrarLog, limparCacheUsuario)

---

## 12. Relação com Problemas Existentes
- A coexistência de `verificarPermissao` (v1, aba flat) e `mod_permissoes_v2.gs` (motor de 4 camadas) cria dois controles de acesso em paralelo — risco de divergência se um admin for removido de um sistema mas não do outro.
- `resolverNomePorEmail` em `obterDadosIniciais` pode gerar lentidão em organizações maiores — afeta diretamente o tempo de carregamento do app.

---

## 13. Alinhamento com a Visão
**Alinhado:** responsabilidade clara de módulo de admin, logs de auditoria completos, fluxo de solicitações bem encapsulado
**Desalinhado:** duplicação de verificação de dono, permissões v1 não integradas ao v2, responsabilidade de preferências misturada aqui
