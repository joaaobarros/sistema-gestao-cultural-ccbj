# FASE 8 — Padrões Consolidados do Sistema
# Sistema CCBJ — gas/src — Referência Normativa

**Data:** 2026-05-11
**Branch:** refactor-fase2
**Status:** DEFINITIVO — estes padrões são obrigatórios para todo código novo

---

## 1. Nomenclatura de Arquivos

| Tipo de arquivo | Padrão | Exemplos |
|----------------|--------|---------|
| Módulo de domínio backend | `mod_<dominio>.gs` | `mod_reservas.gs`, `mod_chaves.gs` |
| Arquivo core / infraestrutura | `<funcao>.gs` | `utils.gs`, `logger.gs`, `config.gs` |
| Engine especial | `<nome>_engine.gs` | `action_engine.gs` |
| HTML de módulo (template) | `mod_<dominio>.html` | `mod_rh.html`, `mod_agenda_geral.html` |
| HTML de lógica JS | `mod_<dominio>_js.html` | `mod_reservas_js.html`, `mod_rh_js.html` |
| HTML de layout | `<nome>.html` (sem prefixo) | `header.html`, `sidebar.html`, `login_html.html` |
| HTML de modal | `modal_<nome>.html` | `modal_config.html`, `modal_manual.html` |
| Arquivo de teste | `test_<dominio>.gs` | `test_conflito_reserva.gs` |

---

## 2. Nomenclatura de Funções Backend (.gs)

### Padrão geral:

```javascript
// Funções públicas (callable via google.script.run):
<verbo><Dominio><Complemento>(params)
// Ex: criarReservaController, obterPermissoesUsuarioV2, salvarCargoRH

// Funções privadas (nunca chamadas externamente):
_<verbo><Complemento>(params)
// Ex: _getSheet, _resolverEmailReal, _p2consolidar, _hashSenha

// Funções de namespace (prefixo do módulo):
<modulo>_<verbo><Complemento>(params)
// Ex: chaves_solicitar, chaves_confirmarRecebimento, modulos_alterarStatus
```

### Verbos padronizados:

| Verbo | Semântica |
|-------|-----------|
| `obter` | Leitura única (retorna um objeto) |
| `listar` | Leitura múltipla (retorna array) |
| `criar` | Criação de entidade nova |
| `salvar` | Criação ou atualização (upsert) |
| `atualizar` | Atualização de entidade existente |
| `excluir` | Remoção permanente |
| `cancelar` | Mudança de estado para cancelado |
| `verificar` | Validação sem mutação |
| `registrar` | Persistência de evento/log |
| `calcular` | Computação derivada sem persistência |
| `sincronizar` | Atualização de cache/estado derivado |
| `confirmar` | Mudança de estado requerendo confirmação |

---

## 3. Nomenclatura de Constantes

```javascript
// CORRETO — UPPER_SNAKE_CASE em setup.gs:
var PROP = { RESERVAS: 'reservas_cfg', ACOES: 'acoes_cfg' };
var COR_MODULO = { RESERVAS: '#2563EB', ACOES: '#7C3AED' };
var MODULOS = { MASTER: { id: 'MASTER', nome: '...', abas: {...} } };

// CORRETO — constantes de eventos em events_constants.gs:
var SystemEventTypes = {
  RESERVATION_CREATED: 'RESERVATION_CREATED',
  ROLE_UPDATED: 'ROLE_UPDATED',
  // ...
};

// PROIBIDO — constantes espalhadas em módulos de domínio:
var TEMPO_LOCK = 30000; // dentro de mod_reservas.gs sem necessidade
```

---

## 4. Padrão de Logging

### Regra por camada:

| Camada | Logger permitido | Razão |
|--------|-----------------|-------|
| `modules/` | `Logger.info/warn/error` | ✅ Pode chamar registrarLog via Logger |
| `backend/` | `Logger.info/warn/error` | ✅ Mesmo motivo |
| `action_engine/` | `Logger.info/warn/error` | ✅ Mesmo motivo |
| `core/utils.gs` | `registrarLog(email, modulo, texto)` diretamente | ⚠️ Logger depende de registrarLog — circular |
| `core/logger.gs` | `console.*` apenas | ⚠️ É o próprio Logger |
| `core/auth_session.gs` | `console.log/warn` | ⚠️ core/, Logger seria circular |
| `core/setup.gs` | `console.log` | ⚠️ Roda antes da planilha existir |
| `core/data_layer.gs` | `console.log` | ⚠️ Pode rodar durante bootstrap |
| `core/event_bus_backend.gs` | `console.warn` (fallback) | ⚠️ Logger não pode depender de EventBus |

### Assinatura obrigatória:

```javascript
// CORRETO:
Logger.info('modulo', 'Mensagem descritiva', { dados: relevantes });
Logger.warn('modulo', 'Situação de atenção', { contexto });
Logger.error('modulo', 'Falha identificada', errorOrString);

// PROIBIDO em modules/ e backend/:
console.log('...');
console.error('...');
console.warn('...');

// PROIBIDO — Logger.log não existe no Logger customizado:
Logger.log('...');
```

---

## 5. Padrão de Retorno de Funções Públicas

Toda função pública (callable via google.script.run) deve retornar:

```javascript
// Sucesso:
{ ok: true, dado: valor, ... }

// Erro controlado:
{ ok: false, msg: 'Mensagem legível pelo usuário' }

// NUNCA lançar exceção não tratada para o frontend
// Usar try/catch e retornar { ok: false, msg: e.message }
```

### Exemplos:

```javascript
// CORRETO:
function criarReservaController(dados, datas) {
  try {
    // ... lógica
    return { ok: true, id: novaReservaId };
  } catch(e) {
    Logger.error('reservas', 'Falha ao criar reserva', e.message);
    return { ok: false, msg: e.message };
  }
}

// CORRETO para funções que retornam dados:
function obterReservas() {
  try {
    var dados = /* ... */;
    return { ok: true, reservas: dados };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

// PROIBIDO — retorno sem wrapper:
function obterReservas() {
  return getRange(...).getValues(); // sem { ok, ... }
}
```

---

## 6. Padrão de Acesso a Dados

### Acesso a planilhas:

```javascript
// CORRETO — via _getSheet() de utils.gs:
var sheet = _getSheet('Reservas');

// PROIBIDO — acesso direto fora de core/:
var ss = SpreadsheetApp.openById('...');
var sheet = ss.getSheetByName('Reservas');

// PROIBIDO — em módulos de domínio:
var ss = SpreadsheetApp.getActiveSpreadsheet();
```

### Acesso a JSON no Drive:

```javascript
// CORRETO — via data_layer.gs:
var lista = readJSON('permissoes_v2.json');
writeJSON('permissoes_v2.json', lista);
modifyJSON('permissoes_v2.json', function(data) { return data; }); // atômico

// PROIBIDO — acesso direto ao DriveApp em módulos de domínio:
DriveApp.getFilesByName('permissoes_v2.json');
```

### Operações atômicas:

```javascript
// Para operações read-modify-write em dados críticos:
modifyJSON('arquivo.json', function(dados) {
  // modificar dados aqui
  return dadosModificados;
});
// modifyJSON usa LockService internamente
```

---

## 7. Padrão de Eventos de Sistema

Todo evento de sistema deve:
1. Usar constante de `SystemEventTypes.*`
2. Incluir campos obrigatórios: `entidade`, `entidadeId`, `usuario`, `origem`, `contexto`

```javascript
// CORRETO:
SystemEvents.emit(SystemEventTypes.RESERVATION_CREATED, {
  entidade:   'reserva',
  entidadeId: id,
  usuario:    email,
  origem:     'mod_reservas',
  contexto:   { sala: dados.sala, data: dados.data, inicio: dados.inicio }
});

// PROIBIDO — operação crítica sem evento:
// (criar reserva sem emit RESERVATION_CREATED)

// PROIBIDO — criar evento sem constante:
SystemEvents.emit('meu_evento_custom', { ... });
// Deve adicionar a SystemEventTypes em events_constants.gs primeiro
```

### Quando emitir eventos:

| Operação | Evento |
|----------|--------|
| Criar reserva | `RESERVATION_CREATED` |
| Cancelar reserva | `RESERVATION_CANCELLED` |
| Aprovar reserva | `RESERVATION_APPROVED` |
| Recusar reserva | `RESERVATION_REJECTED` |
| Criar protocolo de chave | `KEY_PROTOCOL_CREATED` |
| Confirmar recebimento de chave | `KEY_PROTOCOL_RETRIEVED` |
| Devolver chave | `KEY_PROTOCOL_RETURNED` |
| Transferir chave | `KEY_PROTOCOL_TRANSFERRED` |
| Ativar módulo | `MODULE_ACTIVATED` |
| Desativar módulo | `MODULE_DEACTIVATED` |
| Mudar perfil de usuário | `ROLE_UPDATED` |
| Mudar permissões manuais | `PERMISSION_GRANTED` |
| Criar contrato | `CONTRACT_CREATED` |
| Atualizar contrato | `CONTRACT_UPDATED` |
| Registrar pagamento | `PAYMENT_REGISTERED` |
| Atualizar indicador | `INDICATOR_UPDATED` |

---

## 8. Padrão de Estrutura de Módulo Backend

Cada arquivo de módulo deve seguir a estrutura:

```javascript
/**
 * @file mod_<dominio>.gs
 * @layer modules/<dominio>/ (ou backend/ ou core/)
 * @description Responsabilidade única declarada.
 * @dependencies <lista de dependências>
 */

// ── Constantes internas ──────────────────────────────────────
var _NOME_CONSTANTE = 'valor';

// ── Funções privadas ─────────────────────────────────────────
function _funcaoPrivada() { ... }

// ── Funções públicas — CRUD ───────────────────────────────────
function criarEntidade(dados) { ... }
function obterEntidade(id) { ... }
function atualizarEntidade(id, dados) { ... }
function excluirEntidade(id) { ... }

// ── Funções públicas — Operações de domínio ──────────────────
function operacaoEspecifica(params) { ... }
```

---

## 9. Padrão de Acesso a Permissões em Módulos

```javascript
// CORRETO — verificar permissão antes de operar:
function salvarDadosSensiveis(dados, email) {
  if (!podeEditar(email, 'financeiro')) {
    return { ok: false, msg: 'Permissão insuficiente.' };
  }
  // ... prosseguir
}

// CORRETO — verificar nível explicitamente para operações admin:
function operacaoAdmin(params, email) {
  if (!verificarPermissao('admin', email)) {
    return { ok: false, msg: 'Apenas administradores podem executar esta operação.' };
  }
}

// PROIBIDO — operar sem verificar permissão em funções que modificam dados:
function salvarDadosSensiveis(dados) {
  // sem verificação de permissão
  sheet.appendRow([...]);
}
```

---

## 10. Padrão de Testes

```javascript
// Estrutura de arquivo de teste:
function executarTodosTestes<Dominio>() {
  var resultados = [];

  resultados.push(_teste<Cenario1>());
  resultados.push(_teste<Cenario2>());
  // ...

  var falhas = resultados.filter(function(r) { return !r.ok; });
  Logger.info('teste', falhas.length + ' falha(s) de ' + resultados.length + ' testes');
  return { ok: falhas.length === 0, resultados: resultados };
}

function _teste<Cenario>() {
  try {
    // Arrange
    var entrada = { ... };

    // Act
    var resultado = funcaoATestar(entrada);

    // Assert
    var passou = resultado.ok === true && resultado.valor === esperado;
    return { ok: passou, cenario: '<Cenario>', resultado: resultado };
  } catch(e) {
    return { ok: false, cenario: '<Cenario>', erro: e.message };
  }
}
```

---

## 11. Padrão de Tratamento de Erros

```javascript
// CORRETO — erros de negócio como retorno { ok: false }:
if (!dados.email) {
  return { ok: false, msg: 'Email é obrigatório.' };
}

// CORRETO — erros de infraestrutura no try/catch:
try {
  var resultado = operacaoCritica();
  return { ok: true, dados: resultado };
} catch(e) {
  Logger.error('modulo', 'Descrição do que falhou', e.message);
  return { ok: false, msg: 'Erro interno. Tente novamente.' };
}

// PROIBIDO — expor detalhes internos para o frontend:
return { ok: false, msg: e.stack }; // stack trace não para usuário

// PROIBIDO — swallow silencioso em operações críticas:
try { operacaoCritica(); } catch(e) {} // sem log, sem retorno de erro
```

---

## 12. Padrão de Locks (Operações Concorrentes)

```javascript
// CORRETO — lock explícito para operações críticas:
function operacaoCritica(params) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    // ... operação
    return { ok: true };
  } finally {
    lock.releaseLock(); // SEMPRE no finally
  }
}

// PROIBIDO — lock sem finally (pode causar deadlock permanente):
var lock = LockService.getScriptLock();
lock.waitLock(30000);
// ... sem try/finally
lock.releaseLock(); // nunca alcançado em caso de erro
```

---

## 13. Padrão do Frontend (html/logic/)

```javascript
// CORRETO — toda chamada backend via GAS.*:
GAS.reservas.criar(dados, datas, function(resp) {
  if (!resp || !resp.ok) {
    _handleServerError(resp ? resp.msg : 'Erro desconhecido');
    return;
  }
  // usar resp.id, resp.reserva, etc.
});

// PROIBIDO — chamada direta sem bridge:
google.script.run
  .withSuccessHandler(cb)
  .criarReservaController(dados, datas);

// PROIBIDO — console.log em arquivos frontend:
console.log('debug: ' + JSON.stringify(dados));

// CORRETO — usar EventBus para comunicação entre módulos:
EventBus.emit('reserva:criada', { id: reservaId });
EventBus.on('reserva:criada', function(dados) { ... });

// PROIBIDO — estado global compartilhado fora de AppState:
window.minhaVariavel = valor; // usar AppState.minhaVariavel
```

---

*Padrões consolidados em 2026-05-11. Documento normativo — toda exceção deve ser justificada.*
