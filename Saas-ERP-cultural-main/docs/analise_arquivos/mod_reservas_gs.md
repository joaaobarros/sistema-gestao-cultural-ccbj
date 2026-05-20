# 📄 Análise de Arquivo — mod_reservas.gs

## 1. Identificação
- **Nome:** mod_reservas.gs
- **Caminho:** `/mod_reservas.gs`
- **Tipo:** Backend GAS — módulo de negócio
- **Camada:** backend/domínio
- **Módulo:** Reservas — CRUD, conflitos, itens, RECE, CODIP

---

## 2. Propósito
Módulo central do domínio de reservas. Gerencia criação, edição, cancelamento e consulta de reservas; verificação de conflitos de horário com buffer de 5 minutos; disponibilidade de itens do almoxarifado por horário; agendamento em lote; análise de disponibilidade com sugestões; e sincronização com a agenda RECE (Comunicação). Implementa padrões Repository e Service para acesso a dados.

---

## 3. Funções

### Leitura
| Função | Descrição |
|--------|-----------|
| `obterReservas()` | Retorna todas as reservas como array 2D (16 colunas) |

### Conflito de horário
| Função | Descrição |
|--------|-----------|
| `verificarConflitoEspaco(sala, data, inicio, termino, ignorarId)` | Verifica sobreposição com buffer de 5min; retorna `{conflito, tipo, solicitado, existente, contexto}` |

### Cancelamento e status
| Função | Descrição |
|--------|-----------|
| `cancelarReserva(id, email)` | Cancela por dono ou admin; notifica se mesmo dia |
| `cancelarReservaComJustificativa(id, email, motivo)` | Admin cancela com email de motivo ao dono |
| `habilitarReservaStatus(id, email, obs)` | Muda status para HABILITADO (admin/superadmin/habilitador) |
| `verificarPermissaoCancelamento(id, email)` | Retorna `{podeCancelar, ehAdmin, ehDono}` — consulta sem efeito |

### Edição
| Função | Descrição |
|--------|-----------|
| `salvarEdicaoReserva(dados)` | Edita reserva com verificação de conflito, disponibilidade de itens e sync RECE |

### Exclusão
| Função | Descrição |
|--------|-----------|
| `excluirRegistroPorID(tipo, id, email)` | Remove fisicamente de qualquer aba; libera itens órfãos para espaços |

### Disponibilidade de itens
| Função | Descrição |
|--------|-----------|
| `validarDisponibilidadeItens(itens)` | Verificação simples: estoque total (sem considerar horário) |
| `verificarDisponibilidadeItensPorHorario(itens, data, ini, ter, sala)` | Valida itens considerando sobreposição de horários |
| `obterDisponibilidadeItensPorHorario(data, ini, ter, sala)` | Calcula mapa nome→qtd disponível descontando reservas sobrepostas |
| `parseItensString(str)` | Parseia `"2x Cadeira | 1x Mesa"` → `[{qtd, nome}]` |

### Análise e sugestões
| Função | Descrição |
|--------|-----------|
| `analisarDisponibilidadeReal(payload)` | Verifica conflitos para múltiplas datas; retorna conflitos + horários livres + sugestões |

### Agendamento em lote (legado)
| Função | Descrição |
|--------|-----------|
| `processarAgendamentoLote(dados, datas)` | Cria múltiplas reservas com lock e retry; valida conflito e itens por data |

### Controller e padrões Repository/Service
| Função/Objeto | Descrição |
|--------|-----------|
| `criarReservaController(dados, datas)` | Entrypoint canônico: cria batch, integra RECE e CODIP via Repository |
| `atualizarReservaController(dados)` | Delega para `ReservaService.atualizar` |
| `ReservaRepository` | `{salvar, atualizar, buscarPorId}` — acesso direto à planilha Reservas |
| `ReceRepository` | `{salvar, atualizarPorReservaGeral, buscarPorReservaGeral, removerPorReservaGeral}` |
| `ReceService` | `{criarOuAtualizar, montarLinhaRece, atualizarCamposEspecificos}` |
| `ReservaService` | `{criar, atualizar}` — operações de alto nível |

---

## 4. Conexões
- **Quem chama:**
  - `mod_admin.gs` (`aprovarSolicitacao`): `criarReservaController`, `atualizarReservaController`, `cancelarReserva`
  - Frontend via `server_bridge_js.html` (`GAS.reservas.*`): `obterReservas`, `verificarConflitoEspaco`, `processarAgendamentoLote`, `analisarDisponibilidadeReal`
- **Quem é chamado:**
  - `utils.js`: `_getSheet`, `normalizarData`, `normalizarHora`, `formatarHora`, `formatarData`, `horariosSobrepostos`, `obterLockComRetry`, `sanitizarNumero`, `compararStrings`, `logarErroSeguro`
  - `mod_admin.gs`: `registrarLog`, `verificarDonoOuAdmin`, `verificarPermissao`, `limitarRequisicoes`, `detectarComportamentoSuspeito`, `limparCacheUsuario`, `validarCamposObrigatorios`, `validarReserva`, `validarEmail`, `normalizarEmail`
  - `Codigo.gs`: `gerarId`, `isMesmoDia`, `_notificarCancelamentoMesmoDia`
  - `Setup.js` (indireto via utils): `liberarItensOrfaos`

---

## 5. Funcionalidades
- **Buffer de 5 minutos:** `verificarConflitoEspaco` aplica BUFFER implicitamente via `horariosSobrepostos` — o buffer real está implementado em utils.js, não aqui
- **Disponibilidade real por horário:** `obterDisponibilidadeItensPorHorario` calcula itens disponíveis descontando reservas sobrepostas, respeitando itens fixos na sala (não subtraídos do estoque)
- **Agendamento em lote:** valida cada data individualmente antes de salvar — se uma falhar, o lote todo é abortado (transação all-or-nothing por exceção)
- **Sugestões automáticas:** `analisarDisponibilidadeReal` retorna slots disponíveis que comportam a duração solicitada
- **Padrão Repository:** `ReservaRepository` e `ReceRepository` isolam acesso a planilhas, mas convivem com acesso direto `_getSheet` em outras funções do mesmo arquivo

---

## 6. Possíveis Falhas

### 🔴 CRÍTICO
- **`criarReservaController` e `ReservaService.criar` fazem a mesma coisa:** `ReservaService.criar` delega diretamente para `criarReservaController` (linha 1173-1175). Duplicação de entrypoint sem valor — confunde qual deve ser chamado.
- **`criarReservaController` não verifica conflito de horário:** ao contrário de `processarAgendamentoLote`, o controller canônico não chama `verificarConflitoEspaco` antes de salvar. Reservas criadas via aprovação de solicitação podem ignorar conflitos se outro admin aprovar simultaneamente.
- **`processarAgendamentoLote` registra log ANTES de salvar na planilha:** o `registrarLog` é chamado dentro do `forEach` (linha 951), mas `abaReservas.setValues(linhasReservas)` ocorre após o loop. Se `setValues` falhar, os logs já foram escritos mas as reservas não existem.

### 🟠 MÉDIO
- **`verificarConflitoEspaco` não inclui o BUFFER de 5 min documentado no cabeçalho:** o comentário menciona "buffer de 5 minutos" mas o código usa `horariosSobrepostos` puro sem adicionar o buffer. O BUFFER de 5 é declarado como constante mas nunca aplicado na chamada.
- **`analisarDisponibilidadeReal` reimplementa `normalizarData`/`normalizarHora`:** define funções locais `normData` e `normHora` ao invés de usar as funções já existentes em utils.js — duplicação com risco de comportamento divergente.
- **`ReceService.montarLinhaRece` usa posição hardcoded para `ID Reserva Geral` (coluna 23):** `ReceRepository` acessa `dados[i][23]` diretamente para o ID da reserva geral. Se o schema da aba `ReservasRECE` mudar (ex: nova coluna inserida), o lookup silenciosamente lê a coluna errada.

### 🟡 BAIXO
- **`_salvarCamposCODIP` definido como noop no final do arquivo:** stub de compatibilidade que retorna `true` sem implementação. Se `mod_relatorios.gs` ou outro módulo não definir a função antes, o noop silencia o erro.
- **`parseItensString` duplicada:** existe em `mod_reservas.gs` e uma variante inline `parseItens` em `validarDisponibilidadeItens` — três implementações do mesmo parser no mesmo arquivo.

---

## 7. Qualidade do Código
**Positivos:**
- Padrões Repository/Service são uma melhoria arquitetural clara sobre o acesso direto
- `analisarDisponibilidadeReal` é bem implementada: retorna dados ricos ao frontend sem múltiplas chamadas
- Lock com retry em `processarAgendamentoLote` é robusto
- Comentários por bloco são detalhados e úteis

**Críticos:**
- `criarReservaController` sem verificação de conflito é o bug mais perigoso do módulo
- Duplicação de `normalizarData`/`normalizarHora` localmente é anti-padrão
- Log antes de salvar cria estado inconsistente em caso de falha

---

## 8. Melhorias Sugeridas
- Adicionar `verificarConflitoEspaco` em `criarReservaController`
- Eliminar `ReservaService.criar` (noop que delega) ou inverter: controller chama o service
- Mover log para depois de `setValues` em `processarAgendamentoLote`
- Substituir `normData`/`normHora` locais por imports de utils.js
- Consolidar `parseItensString` em utils.js e remover duplicatas
- Substituir acesso por índice hardcoded em `ReceRepository` por lookup de cabeçalho

---

## 9. Papel no Sistema
- **Fluxo de nova reserva:** Frontend → `processarAgendamentoLote` ou `criarReservaController` → `ReservaRepository.salvar` → aba Reservas → (opcional) RECE + CODIP
- **Fluxo de aprovação:** `mod_admin.aprovarSolicitacao` → `criarReservaController` (sem verificação de conflito)
- **Criticidade:** 🔴 CRÍTICO — é o módulo de negócio mais central do sistema

---

## 10. Tags
`#backend` `#reservas` `#conflito` `#itens` `#lote` `#rece` `#codip` `#repository` `#service`

---

## 11. Dependências
- **Depende de:** `utils.js` (helpers), `mod_admin.gs` (log, validação, permissões), `Codigo.gs` (gerarId, isMesmoDia, _notificarCancelamentoMesmoDia)
- **É dependência para:** `mod_admin.gs` (aprovar/recusar solicitação), `mod_comunicacao.gs` (RECE), `mod_relatorios.gs` (CODIP)

---

## 12. Relação com Problemas Existentes
- A ausência de verificação de conflito em `criarReservaController` é mencionada nos problemas estruturais pendentes do projeto.
- `processarAgendamentoLote` é identificado como legado mas continua sendo a rota para agendamento via frontend (`GAS.reservas.processar`).

---

## 13. Alinhamento com a Visão
**Alinhado:** padrões Repository/Service, lock com retry, análise rica de disponibilidade
**Desalinhado:** duplicação de entrypoints, ausência de verificação de conflito no controller canônico, reimplementação de funções de utils.js
