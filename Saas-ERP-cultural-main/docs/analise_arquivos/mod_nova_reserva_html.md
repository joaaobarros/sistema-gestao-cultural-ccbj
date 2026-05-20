# 📄 Análise de Arquivo — mod_nova_reserva.html

## 1. Identificação
- **Nome:** mod_nova_reserva.html
- **Caminho:** `/html/modulos/mod_nova_reserva.html`
- **Tipo:** Frontend HTML — template de aba (formulário complexo)
- **Camada:** frontend/modulos
- **Módulo:** Nova Reserva — formulário completo de agendamento com blocos condicionais

---

## 2. Propósito
Maior formulário HTML do sistema (1102 linhas): define a interface de criação/edição de reservas com 4 blocos condicionais ativáveis por toggle — Agendamento em Lote, Dados para Agenda RECE, Relatório CODIP completo, e Demanda de Comunicação. Cada toggle exibe/oculta um bloco de campos adicionais, tornando o formulário adaptável ao tipo de ação cultural.

---

## 3. Estruturas / Seções

### Toggles principais
| Toggle | ID | Bloco revelado | Função |
|--------|-----|---------------|--------|
| Agendar em Lote | `#checkLote` | Painel de recorrência | `toggleLote(this.checked)` |
| Agenda RECE | `#checkRece` | `#blocoRece` | `toggleRece(this.checked)` |
| Relatório CODIP | `#checkCodip` | `#blocoCodip` | `toggleCodip(this.checked)` |
| Demanda Com. | `#checkComunicacao` | `#blocoComunicacao` | `toggleComunicacao(this.checked)` |

### Campos principais do agendamento
| Campo | ID | Observações |
|-------|-----|-------------|
| Título da ação | `#inputNomeAcao` | required |
| Data | `#inputData` | flatpickr (texto) |
| Sala | `#selectSala` | Populado por JS |
| Hora início/término | `#horaInicio`, `#horaTermino` | `onchange` → `validarHorarios(); validarConflitoTempoReal(); mostrarHorariosDisponiveisUI()` |
| Turno calculado | `#inputTurnoCalculado` | readonly — derivado dos horários |

### Bloco Lote — 4 modos de recorrência
| Modo | IDs chave | Entrada |
|------|---------|---------|
| Manual | `painel-lote-manual` | Clique no calendário flatpickr |
| Semanal | `painel-lote-semanal` | Checkboxes dias + intervalo de datas |
| Intervalo | `painel-lote-intervalo` | A cada N dias × repetições (ou até data fim) |
| Mensal | `painel-lote-mensal` | Sub-modos: dia fixo / dia útil / nth semana do mês |

### Bloco RECE
11 campos adicionais de divulgação: categorias, parceiros, acessibilidades, classificação indicativa, público alvo, artista, link inscrição, acesso (gratuito/pago/mediante inscrição), descrição, observações, data término, upload de imagem de divulgação (máx 4MB).

### Bloco CODIP — 6 seções
| Seção | Campos chave |
|-------|-------------|
| Vínculo contrato | `#codipSelectContrato` → `codipCarregarMetas()` → `#codipSelectMeta` → `codipCarregarIndicadores()` → `#codipSelectIndicador` + preview mensal |
| Classificação da ação | programa, mês referência (hardcoded 2026), tipo ação, eixo política, 2× segmento, 2× linguagem artística |
| Modalidade e recursos | modalidade realização, origem recursos, ação em rede (radio), acessibilidades (checkboxes) |
| Público e alcance ★ | presencial, virtual, visualizações, total (auto), PCD, idosos, prof. externos, voluntários, vulnerabilidade, público específico |
| Duração ★ | horas antes/no mês/total + barra de execução |
| Produtos e avaliação ★ | produtos, disponibilidade, avaliação satisfação, desafios, observações |
| Evidências ★ | links Drive + relatório oficial |
| Descrição da ação | `#codipDescricaoAcao` (max 600) + botão "Reescrever com IA" → `reescreverDescricaoComIA()` |

### Bloco Comunicação
Tipo demanda, prioridade, prazo, descrição, 9 checkboxes de entregas (design, foto, vídeo, etc.), observações.

### Coluna lateral (sticky)
- Almoxarifado: seleção de itens volantes por sala; itens fixos da sala exibidos automaticamente
- Botão submit: "Confirmar Agendamento"
- Botão cancelar: `resetarFormulario(); mostrarAba('aba-lista-reservas')`

---

## 4. Conexões
- **Quem chama:** `mostrarAba('aba-nova-reserva')` de botão global; edição de reserva existente
- **Quem é chamado:**
  - `toggleLote/Rece/Codip/Comunicacao`, `gerarDatasLote(modo)`, `selecionarSubModoMensal(modo)` (mod_reservas_js)
  - `validarHorarios()`, `validarConflitoTempoReal()`, `mostrarHorariosDisponiveisUI()` (mod_reservas_js)
  - `codipCarregarMetas(idContrato)`, `codipCarregarIndicadores(idMeta)` (mod_reservas_js)
  - `adicionarConvidadoInterno()`, `alternarEventoInstitucional()`, `dispararConviteInstitucional()` (mod_reservas_js)
  - `adicionarItemVolante()`, `previewImagemRece(this)` (mod_reservas_js)
  - `reescreverDescricaoComIA()` — Groq/llama via GAS
  - `resetarFormulario()`, `mostrarAba()` (mod_reservas_js / navegacao_ui_js)

---

## 5. Funcionalidades
- **Detecção de conflito em tempo real:** a cada mudança de horário, chama `validarConflitoTempoReal()` e exibe `#avisoHorarioOcupado` se houver sobreposição
- **Sugestão de salas disponíveis:** `mostrarHorariosDisponiveisUI()` popula `#salasDisponiveis` e `#horariosDisponiveis` em tempo real
- **Cascata de selects CODIP:** contrato → metas → indicadores com preview mensal (`#codipIndicadorMesesGrid`) mostrando metas mensais do indicador
- **IA para descrição:** botão "Reescrever com IA" integra o texto escrito com Groq API via `reescreverDescricaoComIA()`
- **Convidados internos com datalist:** `<datalist id="listEmailsSistema">` para autocomplete de emails do sistema
- **Inline script no bloco Comunicação:** `<script>` diretamente no HTML para estilizar checkboxes de entregas ao marcar/desmarcar
- **Barra de execução CODIP:** cálculo local de `(horasAntes + horasMes) / horasTotal * 100` para progresso visual

---

## 6. Possíveis Falhas

### 🔴 CRÍTICO
- **`#codipMesRef` hardcoded com meses de 2026 apenas:** o select de "Mês de Referência" tem opções fixas de 01/2026 a 12/2026. Em 2027 o campo ficará sem opções válidas — necessita atualização manual ou geração dinâmica por JS.

### 🟠 MÉDIO
- **Código de recorrência (4 modos) duplicado de mod_agenda_geral.html:** IDs diferentes (prefixo `lote-` vs `ccbj-`) mas lógica HTML idêntica. Qualquer fix em um arquivo precisa ser replicado no outro.
- **`<script>` inline dentro do bloco Comunicação (linha 1016):** usar `<script>` dentro de `<div>` HTML Service é tecnicamente permitido mas viola separação HTML/JS do resto do sistema.
- **`previewImagemRece(this)` com upload de imagem:** o campo aceita até 4MB mas não há validação no HTML (apenas nota textual) — validação depende inteiramente do JS.
- **`dispararConviteInstitucional()` independente do agendamento:** o botão de envio de convite dispara imediatamente sem salvar a reserva — o HTML avisa em texto (`Os convites são enviados imediatamente...`), mas o comportamento é não-óbvio e pode resultar em convites enviados para eventos que não foram confirmados.

### 🟡 BAIXO
- **`#receImagemFile` aceita qualquer tamanho:** `max="4MB"` é apenas nota de texto, não atributo HTML válido; validação real depende do JS.
- **Coluna lateral com `lg:sticky lg:top-20`:** em mobile, o almoxarifado fica inline antes dos botões de submit — UX pode ser confusa (usuário precisa rolar além do almoxarifado para chegar ao botão de confirmação).
- **`#codipTotalAcessos` calculado localmente:** soma presencial + virtual + visualizações — mas não há evento de `oninput` declarado no HTML (dependência de JS externo para manter o total atualizado).

---

## 7. Qualidade do Código
**Positivos:**
- Progressão clara: campos obrigatórios primeiro, blocos opcionais depois — UX bem estruturada
- Preview mensal de indicador CODIP (`#codipIndicadorMesesGrid`) é UX avançada que conecta o formulário ao sistema de contratos
- Botão "Reescrever com IA" integrado ao formulário de descrição é recurso distintivo
- `#avisoHorarioOcupado` com validação em tempo real previne conflitos antes do submit

**Críticos:**
- Meses de referência CODIP hardcoded para 2026
- Script inline no bloco de comunicação
- Duplicação de código de recorrência com mod_agenda_geral.html

---

## 8. Melhorias Sugeridas
- Gerar `#codipMesRef` dinamicamente por JS (últimos 12 meses a partir da data atual)
- Extrair os 4 painéis de recorrência para include compartilhado
- Mover o `<script>` inline do bloco comunicação para mod_reservas_js.html

---

## 9. Papel no Sistema
- **Fluxo:** usuário abre formulário → preenche campos básicos (nome, data, sala, horário) → ativa toggles conforme necessidade → preenche campos adicionais → submit → `salvarReserva()` → GAS → confirma/redireciona
- **Criticidade:** 🔴 ALTO — é o ponto de entrada de todas as novas reservas; bug no formulário impede criação de agendamentos

---

## 10. Tags
`#frontend` `#html` `#formulario` `#reservas` `#codip` `#rece` `#comunicacao` `#lote` `#ia`

---

## 11. Dependências
- **Depende de:** `mod_reservas_js.html` (toda a lógica do formulário), flatpickr, `AppState`, `GAS.reservas.*`, `GAS.contratos.*` (cascata CODIP), `GAS.ia.*` (reescrever com IA)
- **É dependência para:** criação de todas as reservas do sistema

---

## 12. Relação com Problemas Existentes
- A cascata CODIP (contrato → meta → indicador) depende de `codipCarregarMetas()` que usa `GAS.contratos.*` — onde `_mapaMetas` está quebrada no backend (retorna "Meta desconhecida" por bug de acesso por índice). O select de metas pode carregar mas com nomes incorretos.
- A duplicação dos 4 modos de recorrência com `mod_agenda_geral.html` é risco sistêmico documentado.

---

## 13. Alinhamento com a Visão
**Alinhado:** formulário adaptável por toggles, validação de conflito em tempo real, cascata CODIP, IA para descrição, almoxarifado integrado
**Desalinhado:** meses de referência CODIP hardcoded para 2026, script inline, duplicação de código de recorrência
