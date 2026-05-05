# 📄 Análise de Arquivo — mod_comunicacao_processos.gs

## 1. Identificação
- **Nome:** mod_comunicacao_processos.gs
- **Caminho:** `/mod_comunicacao_processos.gs`
- **Tipo:** Backend GAS — módulo de negócio
- **Camada:** backend/domínio
- **Módulo:** Comunicação — processos, entregas, revisões, roteamento

---

## 2. Propósito
Gerencia o fluxo completo de processos de comunicação: criação de demandas (a partir de reservas ou manualmente), gestão de entregas por tipo (design, foto, vídeo, redação), roteamento automático de tarefas por função, notificações de atraso, ciclo de revisão (solicitação + resposta) e integração com `mod_pessoal.gs` (tarefas na planilha PESSOAL).

---

## 3. Funções

### Processos
| Função | Descrição |
|--------|-----------|
| `listarProcessosComunicacao()` | Lê planilha ProcessosComunicacao → array de objetos mapeados por cabeçalho |
| `criarProcessoComunicacao(dados)` | Cria processo + tarefa principal + entregas + tarefas por entrega; notifica atrasos |
| `atualizarProcessoComunicacao(id, dados)` | Atualiza campos; notifica atualização e verifica atraso |
| `excluirProcessoComunicacao(id)` | Remove linha da planilha (sem verificação de permissão) |

### Entregas
| Função | Descrição |
|--------|-----------|
| `criarEntregaComunicacao(dados)` | Cria linha em EntregasComunicacao com status Pendente |
| `listarEntregasPorProcesso(idProcesso)` | Filtra entregas pelo ID do processo |
| `atualizarEntregaComunicacao(idEntrega, dados)` | Atualiza status/responsável/prazo/link; define Data Entrega ao virar "Entregue" |

### Revisão
| Função | Descrição |
|--------|-----------|
| `solicitarAlteracaoProcesso(id, texto, email)` | Registra revisão na planilha; notifica equipe comunicação |
| `responderRevisaoProcesso(id, status, resposta)` | Responde revisão; notifica solicitante |
| `responderTarefaComoFuncao(idTarefa, msg, autor)` | Registra resposta na interação e atualiza status interno da tarefa |

### Roteamento e notificações (privados)
| Função | Descrição |
|--------|-----------|
| `_obterResponsaveisPorTipo(tipo)` | Lê planilha EQUIPES.Funcionarios; resolve emails por função/substituição |
| `_obterGestoresPorFuncao(funcao)` | Filtra funcionários com campo Gestor/Papel="gestor" na função |
| `_mapearTipoParaFuncao(tipo)` | Mapa fixo: design, foto, vídeo, matéria, etc. → função da equipe |
| `_resolverResponsavel(tipo)` | Retorna primeiro email da lista de responsáveis |
| `_isAtrasada(tarefa)` | Compara prazo com hoje; retorna true se atrasada e não concluída |
| `_notificarAtrasoCritico(tarefa)` | Email + cria tarefa de alerta para responsáveis e gestores |
| `_notificarAtualizacaoProcesso(id, dados)` | Cria tarefa de notificação na planilha PESSOAL.Tarefas |
| `_notificarEntregaConcluida(dados)` | Cria tarefa de notificação quando entrega muda para "Entregue" |
| `_criarTarefaComunicacao(dados)` | Cria tarefa principal via `criarTarefaPlanilha` |
| `_criarTarefasPorEntregas(dados)` | Cria uma tarefa por tipo de entrega com função mapeada |
| `enviarEmailInterno(email, assunto, corpo)` | Wrapper de `MailApp.sendEmail` com try/catch |

### Integração reserva→comunicação
| Função | Descrição |
|--------|-----------|
| `criarDemandaComunicacaoFromReserva(idReserva, dadosRes, dadosCom)` | Cria processo vinculado à reserva com deduplicação por idReserva |
| `obterDemandaPorReservaId(idReserva)` | Retorna processo existente vinculado ao ID da reserva |

---

## 4. Conexões
- **Quem chama:** Frontend via bridge (`GAS.comunicacao.*`); `mod_reservas_js.html` (via `criarDemandaComunicacaoFromReserva`)
- **Quem é chamado:**
  - `Setup.js`: `_abrirAba('COMUNICACAO', ...)`, `_abrirAba('EQUIPES', ...)`, `_abrirAba('PESSOAL', ...)`
  - `mod_pessoal.gs`: `criarTarefaPlanilha`, `_registrarInteracaoTarefa`, `_atualizarStatusInternoTarefa`
  - `MailApp`, `GmailApp`

---

## 5. Funcionalidades
- **Roteamento automático por função:** ao criar processo, as entregas são roteadas para a fila da função correta via `_mapearTipoParaFuncao` + `_obterResponsaveisPorTipo`
- **Deduplicação de demandas:** `criarDemandaComunicacaoFromReserva` verifica se já existe processo para o mesmo `idReserva` antes de criar
- **Ciclo de revisão completo:** solicitação de alteração + resposta com notificação bidireccional
- **Detecção de atraso em criação:** `criarProcessoComunicacao` verifica se o processo/entregas já nasce atrasado (prazo passado) e notifica imediatamente

---

## 6. Possíveis Falhas

### 🔴 CRÍTICO
- **`excluirProcessoComunicacao` sem verificação de permissão:** qualquer usuário pode excluir qualquer processo — sem `verificarPermissao` ou `verificarDonoOuAdmin`.
- **`_obterResponsaveisPorTipo` duplica lógica de `obterResponsaveisPorTipo` de `mod_equipes.gs`:** ambas leem `EQUIPES.Funcionarios` e implementam a mesma lógica de substituições. Duas fontes de verdade que podem divergir.
- **`_notificarAtrasoCritico` chama `criarTarefaPlanilha` com `responsavel: emails.join(', ')`:** o campo `Responsável` da planilha recebe múltiplos emails separados por vírgula — viola o schema da aba (campo destinado a email único).

### 🟠 MÉDIO
- **`criarProcessoComunicacao` chama `_notificarAtrasoCritico` na criação:** verifica se o processo já nasce atrasado. Processos criados com prazo hoje (mesma data) disparam alerta na criação — comportamento provavelmente indesejado.
- **`_obterGestoresPorFuncao` acessa colunas `Gestor` e `Papel` que não existem no schema de `Funcionarios` em Setup.js:** `MODULOS.EQUIPES.abas.Funcionarios` não define essas colunas — `idx['Gestor']` será `undefined`, a condição sempre será `false`, e gestores nunca serão notificados.
- **IDs de processos e entregas usando `Date.now()` sem prefixo único:** `'proc_' + Date.now()` pode colidir com `'proc_' + Date.now()` de `mod_pessoal.gs` se ambos criarem processos no mesmo milissegundo.

### 🟡 BAIXO
- **`_resolverResponsavel` retorna apenas o primeiro da lista:** sem critério de balanceamento de carga — sempre o mesmo responsável recebe as tarefas se a função tiver múltiplos.
- **`enviarEmailInterno` usa `MailApp.sendEmail` enquanto o restante do sistema usa `GmailApp`:** inconsistência de API de email.

---

## 7. Qualidade do Código
**Positivos:**
- Deduplicação de demandas via `obterDemandaPorReservaId` é arquiteturalmente correta
- Lookup por cabeçalho em todos os acessos a planilha (robusto ao schema)
- Separação clara entre funções públicas e privadas (_prefixo)
- Ciclo de revisão bem estruturado

**Críticos:**
- `excluirProcessoComunicacao` sem controle de acesso
- Duplicação com `mod_equipes.gs` cria divergência de comportamento potencial
- Colunas `Gestor`/`Papel` referenciadas mas não definidas no schema

---

## 8. Melhorias Sugeridas
- Adicionar `verificarPermissao("admin", emailAtual)` em `excluirProcessoComunicacao`
- Consolidar `_obterResponsaveisPorTipo` com `obterResponsaveisPorTipo` de `mod_equipes.gs`
- Adicionar colunas `Gestor` e `Papel` ao schema de `Funcionarios` em Setup.js
- Corrigir `_notificarAtrasoCritico` para não passar múltiplos emails no campo `responsavel` único
- Implementar balanceamento de carga em `_resolverResponsavel`

---

## 9. Papel no Sistema
- **Fluxo de demanda de reserva:** `mod_reservas_js.html` → `criarDemandaComunicacaoFromReserva` → `criarProcessoComunicacao` → planilha ProcessosComunicacao + tarefas por função
- **Fluxo de entrega:** `atualizarEntregaComunicacao` status "Entregue" → `_notificarEntregaConcluida` → tarefa de aviso
- **Criticidade:** 🟠 MÉDIO — falha afeta fluxo de comunicação/RECE; não afeta reservas gerais

---

## 10. Tags
`#backend` `#comunicacao` `#processos` `#entregas` `#revisao` `#roteamento` `#notificacao`

---

## 11. Dependências
- **Depende de:** `Setup.js` (`_abrirAba`), `mod_pessoal.gs` (criarTarefaPlanilha, interações), `MailApp`
- **É dependência para:** Frontend do módulo comunicação, `mod_pessoal.gs` (listarTarefasPorFuncao chama `listarEntregasPorProcesso`)

---

## 12. Relação com Problemas Existentes
- A duplicação entre `_obterResponsaveisPorTipo` (aqui) e `obterResponsaveisPorTipo` (mod_equipes.gs) é um exemplo do problema de "dois repositórios de funcionários" documentado em mod_equipes.gs.
- O campo `Gestor`/`Papel` referenciado mas não no schema é um bug silencioso — gestores nunca são notificados de atrasos.

---

## 13. Alinhamento com a Visão
**Alinhado:** deduplicação de demandas, lookup por cabeçalho, ciclo de revisão completo
**Desalinhado:** sem controle de acesso em exclusão, duplicação de lógica de responsáveis, colunas referenciadas mas não no schema
