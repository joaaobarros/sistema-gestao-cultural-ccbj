/**
 * ARQUIVO: Setup.gs
 * Inicializa toda a estrutura multi-planilha do sistema CCBJ.
 * Execute inicializarSistema() uma única vez como Superadmin.
 */

// ── IDs das planilhas (persistidos em PropertiesService) ─────────────────
const PROP = {
  MASTER:       'SHEET_ID_MASTER',
  ESPACOS:      'SHEET_ID_ESPACOS',
  COMUNICACAO:  'SHEET_ID_COMUNICACAO',
  RELATORIOS:   'SHEET_ID_RELATORIOS',
  FINANCEIRO:   'SHEET_ID_FINANCEIRO',
  EQUIPES:      'SHEET_ID_EQUIPES',
  PESSOAL:      'SHEET_ID_PESSOAL',
  FOLDER_ROOT:  'FOLDER_ID_ROOT',
};

// ── Estrutura de cada módulo ─────────────────────────────────────────────
const MODULOS = {

  MASTER: {
    nome:   'CCBJ_MASTER',
    pasta:  'CCBJ — Sistema',
    prop:   PROP.MASTER,
    abas: {
      'Administradores': ['Email', 'NivelAcesso'],
      'Configuracoes':   ['ID', 'Espaço', 'Capacidade', 'Resumo Itens', 'Email Responsável'],
      'Listas':          ['Setores'],
      'Logs':            ['Data/Hora', 'Usuário', 'Ação', 'Tipo', 'Alvo', 'Detalhes', 'Dados Antes', 'Dados Depois'],
      'LogAcessos':      ['Data/Hora', 'Email', 'Nome Usuário', 'Nível Acesso', 'IP Aprox.', 'User Agent'],
    }
  },

  ESPACOS: {
    nome:  'CCBJ_ESPACOS',
    pasta: 'CCBJ — Espaços e Infraestrutura',
    prop:  PROP.ESPACOS,
    abas: {
      'Reservas': [
        'ID','Data Reserva','Início','Término','Sala','Turno',
        'Nome da Ação','Tipo de Ação','Responsável','Setor',
        'Co-responsável','Release','Itens Volantes','Status',
        'Data Solicitação','ID Lote'
      ],
      'Itens': [
        'ID Item','Nome','Categoria','Quantidade Total',
        'Localização','Status de Uso'
      ],
      'Solicitacoes': [
        'ID','Tipo','Subtipo','ID Reserva','Sala','Usuario',
        'Justificativa','Payload','Status','Aprovador',
        'Data Solicitação','Data Ação'
      ],
    }
  },

  COMUNICACAO: {
    nome:  'CCBJ_COMUNICACAO',
    pasta: 'CCBJ — Comunicação',
    prop:  PROP.COMUNICACAO,
    abas: {
      'ReservasRECE': [
        'ID Reserva','Título','Data Início','Data Término',
        'Horário Início','Horário Término','Espaço','Categorias',
        'Parceiros/Organizadores','Acessibilidades',
        'Classificação Indicativa','Público Alvo','Artista',
        'Link Inscrição','Acesso','Descrição','Observações',
        'Status','Responsável','Data Solicitação','Imagem URL',
        'Convidados Internos','Evento Institucional',
        'Convidados Externos','ID Reserva Geral'
      ],
    }
  },

  RELATORIOS: {
    nome:  'CCBJ_RELATORIOS',
    pasta: 'CCBJ — Relatórios',
    prop:  PROP.RELATORIOS,
    abas: {
      'RelatoriosCODIP': [
        'ID Reserva','Programa','Mês Ref','Tipo Ação','Eixo',
        'Segmento I','Segmento II','Linguagem I','Linguagem II',
        'Modalidade','Recursos','Ação em Rede','Acessibilidade',
        'Público Presencial','Público Virtual','Visualizações',
        'PCD','Idosos','Profissionais Externos','Voluntários',
        'Vulnerabilidade','Público Específico','Horas Antes',
        'Horas Mês','Horas Total','Produtos','Disponibilidade',
        'Avaliação','Desafios','Observações','Link Evidências',
        'Link Relatório','Descrição da Ação','ID Contrato',
        'ID Meta','ID Indicador','Atualizado em'
      ],
      'Contratos':   ['ID','Nome','Número','Descrição','Vigência Início','Vigência Fim','Status','Valor Total','Fonte Recurso','Contrapartida','Modalidade','Obs Financeiro'],
      'Metas':       ['ID','ID Contrato','Número','Título','Descrição','TipoMeta'],
      'Indicadores': ['ID','ID Meta','ID Contrato','Ano','Texto do Indicador','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez','TipoIndicador','Número'],
      'Rubricas':    ['ID','ID Meta','Nome','Valor','Obs'],
      'RubricasMemoria': [ 'ID','ID_RUBRICA','DESCRICAO','METRICA','QUANTIDADE','VALOR_UNITARIO','SUBTOTAL','CRIADO_EM','CRIADO_POR','ATIVO'], 
      'ContratosVersoes': ['ID_VERSAO','ID_CONTRATO','VERSAO','SNAPSHOT_JSON','CRIADO_EM','CRIADO_POR'],
    }
  },

  FINANCEIRO: {
    nome:  'CCBJ_FINANCEIRO',
    pasta: 'CCBJ — Financeiro',
    prop:  PROP.FINANCEIRO,
    abas: {
      'Contratacoes': ['ID','Tipo','Nome','CPF/CNPJ','Valor','Data Início','Data Fim','Status','ID Contrato','Observações'],
      'Rubricas':     ['ID','ID Meta','Nome','Valor','Obs'],
      'Pagamentos':   ['ID','ID Contratacao','Competência','Valor','Data Pagamento','Status','Comprovante URL'],
      'FluxoCaixa':   ['ID','Data','Tipo','Categoria','Valor','Descrição','ID Referência','Saldo Acumulado'],
    }
  },

  EQUIPES: {
    nome:  'CCBJ_EQUIPES',
    pasta: 'CCBJ — Equipes',
    prop:  PROP.EQUIPES,
    abas: {
      'Funcionarios': ['ID','Nome','Email','CPF','Cargo','Setor','Tipo Vínculo','Data Admissão','Status'],
      'Escalas':      ['ID','ID Funcionario','Data','Entrada','Saída','Tipo','Observações'],
      'Avaliacoes':   ['ID','ID Funcionario','Período','Pontuação','Feedback','Avaliador','Data'],
      'Ferias':       ['ID','ID Funcionario','Início','Fim','Tipo','Status','Aprovador'],
    }
  },

  PESSOAL: {
    nome:  'CCBJ_PESSOAL',
    pasta: 'CCBJ — Pessoal',
    prop:  PROP.PESSOAL,
    abas: {
      'Tarefas':   ['ID','Título','Descrição','Responsável','Setor','Prioridade','Status','Data Criação','Data Limite','Data Conclusão','ID Referência','Tipo Referência'],
      'Processos': ['ID','Nome','Descrição','Responsável','Etapa Atual','Status','Data Início','Data Fim Prevista','Observações'],
      'Demandas':  ['ID','Origem','Título','Descrição','Solicitante','Responsável','Status','Data Entrada','Data Resposta','Resposta'],
    }
  },

};

// ── Cores de cabeçalho por módulo ────────────────────────────────────────
const COR_MODULO = {
  MASTER:      '#1F2937',
  ESPACOS:     '#4C1D95',
  COMUNICACAO: '#92400E',
  RELATORIOS:  '#1E3A5F',
  FINANCEIRO:  '#065F46',
  EQUIPES:     '#7C2D12',
  PESSOAL:     '#3B0764',
};

// ════════════════════════════════════════════════════════════════════════
// INICIALIZAR SISTEMA
// ════════════════════════════════════════════════════════════════════════
function inicializarSistema() {

  let usarUI = true;
  let ui;

  try {
    ui = SpreadsheetApp.getUi();
  } catch (e) {
    usarUI = false;
  }

  if (usarUI) {
    const confirm = ui.alert(
      'Inicializar Sistema CCBJ',
      'Continuar?',
      ui.ButtonSet.YES_NO
    );
    if (confirm !== ui.Button.YES) return;
  }

  const pastas = _criarEstruturaPastas();
  _criarTodasPlanilhas(pastas);
  _registrarSuperadmin();

  if (usarUI) {
    ui.alert('Setup concluído!');
  }
}

function autorizarDrive() {
  DriveApp.getRootFolder();
}

// ── Cria pasta raiz + subpastas ──────────────────────────────────────────
function _criarEstruturaPastas() {
  const props = PropertiesService.getScriptProperties();
  const mapa  = {};

  // Pasta raiz
  let root;
  const rootId = props.getProperty(PROP.FOLDER_ROOT);
  if (rootId) {
    try { root = DriveApp.getFolderById(rootId); } catch(e) { root = null; }
  }
  if (!root) {
    root = DriveApp.createFolder('CCBJ — Plataforma de Gestão Cultural');
    props.setProperty(PROP.FOLDER_ROOT, root.getId());
  }
  mapa['ROOT'] = root;

  // Subpastas de cada módulo
  Object.values(MODULOS).forEach(mod => {
    let sub = _buscarOuCriarSubpasta(root, mod.pasta);
    mapa[mod.pasta] = sub;
    console.log('📁 Pasta: ' + mod.pasta + ' → ' + sub.getId());
  });

  return mapa;
}

function _buscarOuCriarSubpasta(parent, nome) {
  const iter = parent.getFoldersByName(nome);
  if (iter.hasNext()) return iter.next();
  return parent.createFolder(nome);
}

// ── Cria todas as planilhas ──────────────────────────────────────────────
function _criarTodasPlanilhas(pastas) {
  const props = PropertiesService.getScriptProperties();

  Object.entries(MODULOS).forEach(([chave, mod]) => {
    let ss;
    const idSalvo = props.getProperty(mod.prop);

    // Reutiliza se já existe
    if (idSalvo) {
      try {
        ss = SpreadsheetApp.openById(idSalvo);
        console.log('♻️  Reutilizando: ' + mod.nome);
      } catch(e) { ss = null; }
    }

    // Cria se não existe
    if (!ss) {
      ss = SpreadsheetApp.create(mod.nome);
      const file = DriveApp.getFileById(ss.getId());

      // Move para a subpasta correta
      const pasta = pastas[mod.pasta];
      if (pasta) {
        pasta.addFile(file);
        DriveApp.getRootFolder().removeFile(file);
      }

      props.setProperty(mod.prop, ss.getId());
      console.log('✅ Criado: ' + mod.nome + ' → ' + ss.getId());
    }

    // Garante estrutura de abas
    _configurarAbas(ss, mod.abas, COR_MODULO[chave] || '#1F2937');
  });
}

// ── Cria/atualiza abas com cabeçalho ────────────────────────────────────
function _configurarAbas(ss, estrutura, corHeader) {
  const nomesOficiais = Object.keys(estrutura);

  nomesOficiais.forEach(nomeAba => {
    let aba = ss.getSheetByName(nomeAba);
    if (!aba) aba = ss.insertSheet(nomeAba);

    const colunas = estrutura[nomeAba];
    const range   = aba.getRange(1, 1, 1, colunas.length);

    range.setValues([colunas])
         .setFontWeight('bold')
         .setBackground(corHeader)
         .setFontColor('#FFFFFF')
         .setHorizontalAlignment('center');

    aba.setFrozenRows(1);
    aba.setColumnWidths(1, colunas.length, 140);
  });

  // Remove aba padrão "Sheet1" / "Plan1" se ainda existir
  ['Sheet1','Plan1','Página1'].forEach(nome => {
    const aba = ss.getSheetByName(nome);
    if (aba && ss.getSheets().length > 1) {
      try { ss.deleteSheet(aba); } catch(e) {}
    }
  });
}

// ── Registra superadmin na planilha MASTER ───────────────────────────────
function _registrarSuperadmin() {
  const email = Session.getEffectiveUser().getEmail();
  const ss    = _abrirModulo('MASTER');
  if (!ss) return;

  const aba   = ss.getSheetByName('Administradores');
  if (!aba)   return;

  const dados = aba.getDataRange().getValues();
  const jaExiste = dados.some(l =>
    String(l[0]).toLowerCase().trim() === email.toLowerCase().trim()
  );

  if (!jaExiste) aba.appendRow([email, 'Superadmin']);
}

// ════════════════════════════════════════════════════════════════════════
// HELPERS DE ACESSO
// ════════════════════════════════════════════════════════════════════════

// Cache em memória para evitar openById repetido na mesma execução
const _ssCache = {};

function _abrirModulo(chave) {
  if (_ssCache[chave]) return _ssCache[chave];

  const mod = MODULOS[chave];
  if (!mod) throw new Error('Módulo desconhecido: ' + chave);

  const props = PropertiesService.getScriptProperties();
  const id    = props.getProperty(mod.prop);
  if (!id) throw new Error('Planilha do módulo ' + chave + ' não inicializada. Execute o Setup.');

  const ss = SpreadsheetApp.openById(id);
  _ssCache[chave] = ss;
  return ss;
}

function _abrirAba(chave, nomeAba) {
  const ss  = _abrirModulo(chave);
  const aba = ss.getSheetByName(nomeAba);
  if (!aba) throw new Error('Aba "' + nomeAba + '" não encontrada em ' + chave);
  return aba;
}

// ════════════════════════════════════════════════════════════════════════
// UTILITÁRIOS DE MANUTENÇÃO
// ════════════════════════════════════════════════════════════════════════

/** Lista todos os IDs salvos — útil para diagnóstico */
function listarIdsModulos() {
  const props = PropertiesService.getScriptProperties();
  const out   = {};
  Object.entries(PROP).forEach(([k, v]) => {
    out[k] = props.getProperty(v) || '(não definido)';
  });
  console.log(JSON.stringify(out, null, 2));
  return out;
}

/** Força re-criação das abas sem apagar dados */
function recriarEstrutura() {
  Object.entries(MODULOS).forEach(([chave, mod]) => {
    try {
      const ss = _abrirModulo(chave);
      _configurarAbas(ss, mod.abas, COR_MODULO[chave] || '#1F2937');
      console.log('✅ Estrutura atualizada: ' + mod.nome);
    } catch(e) {
      console.warn('⚠️ Falha em ' + chave + ': ' + e.message);
    }
  });
}

/** Libera itens órfãos de uma sala excluída (mantido do sistema anterior) */
function liberarItensOrfaos(idSalaDeletada) {
  const abaItens = _abrirAba('ESPACOS', 'Itens');
  const dados    = abaItens.getDataRange().getValues();
  const idSala   = String(idSalaDeletada).trim();
  let   total    = 0;

  for (let i = 1; i < dados.length; i++) {
    let mapa = {};
    try {
      const raw = String(dados[i][4] || '{}').trim();
      mapa = (raw.startsWith('{') && raw.endsWith('}')) ? JSON.parse(raw) : {};
    } catch(e) { mapa = {}; }

    const qtdLiberada = Number(mapa[idSala] || 0);
    if (qtdLiberada <= 0) continue;

    delete mapa[idSala];
    const novaQtd = Number(dados[i][3] || 0) + qtdLiberada;

    abaItens.getRange(i + 1, 4).setValue(novaQtd);
    abaItens.getRange(i + 1, 5).setValue(JSON.stringify(mapa));
    total += qtdLiberada;
  }

  console.log('liberarItensOrfaos: sala "' + idSala + '", liberado: ' + total);
}

function debugProps() {
  const props = PropertiesService.getScriptProperties().getProperties();
  console.log(props);
}

function processarFilasAutomaticamente() {
  // Placeholder para trigger agendado — sem operação
  console.log('processarFilasAutomaticamente: noop');
}