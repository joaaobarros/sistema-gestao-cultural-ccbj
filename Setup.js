/**
 * @file Setup.js
 * @description Provisionamento e manutenção da infraestrutura de planilhas do sistema CCBJ.
 *              Cria 7 planilhas independentes (módulos) organizadas em subpastas no Drive,
 *              registra seus IDs em PropertiesService e fornece helpers de acesso cacheados.
 * @layer backend
 * @responsibility Setup único do sistema multi-planilha; manutenção de estrutura de abas;
 *                 registro de superadmin; helpers _abrirModulo/_abrirAba usados por utils.js.
 * @dependencies DriveApp, SpreadsheetApp, PropertiesService, Session (Google Services)
 *
 * IMPACTO NO SISTEMA:
 *   - inicializarSistema() cria pastas e planilhas — executar apenas uma vez como Superadmin.
 *   - recriarEstrutura() é segura para reexecutar — recria abas sem apagar dados.
 *   - MODULOS define a estrutura canônica de abas; alterações aqui afetam o schema do sistema.
 *
 * RISCOS:
 *   - Executar inicializarSistema() novamente em ambiente produtivo pode criar planilhas duplicadas
 *     se os IDs em PropertiesService forem perdidos.
 *   - Alterar nomes de abas em MODULOS sem migrar dados quebrará _getSheet para a aba renomeada.
 */

/**
 * ========================================
 * BLOCO: Configuração dos módulos e schema
 * ========================================
 * @description PROP: chaves usadas no PropertiesService para persistir IDs das planilhas.
 *              MODULOS: estrutura canônica — define nome, pasta, prop e abas (com cabeçalhos)
 *                       de cada módulo do sistema.
 *              COR_MODULO: cor do cabeçalho de cada planilha para identificação visual.
 *
 *              Para adicionar um novo módulo: incluir entrada em PROP, MODULOS e COR_MODULO,
 *              adicionar o mapeamento de abas em ABA_PARA_MODULO (utils.js) e
 *              executar recriarEstrutura() em produção.
 */
const PROP = {
  MASTER:       'SHEET_ID_MASTER',
  ESPACOS:      'SHEET_ID_ESPACOS',
  COMUNICACAO:  'SHEET_ID_COMUNICACAO',
  RELATORIOS:   'SHEET_ID_RELATORIOS',
  FINANCEIRO:   'SHEET_ID_FINANCEIRO',
  EQUIPES:      'SHEET_ID_EQUIPES',
  PESSOAL:      'SHEET_ID_PESSOAL',
  ESCUTA:       'SHEET_ID_ESCUTA',
  FOLDER_ROOT:  'FOLDER_ID_ROOT',
};

// ── Estrutura de cada módulo ─────────────────────────────────────────────
const MODULOS = {

  MASTER: {
    nome:   'CCBJ_MASTER',
    pasta:  'CCBJ — Sistema',
    prop:   PROP.MASTER,
    abas: {
      'Administradores':      ['Email', 'NivelAcesso'],
      'Configuracoes':        ['ID', 'Espaço', 'Capacidade', 'Resumo Itens', 'Email Responsável'],
      'Listas':               ['Setores'],
      'Logs':                 ['Data/Hora', 'Usuário', 'Ação', 'Tipo', 'Alvo', 'Detalhes', 'Dados Antes', 'Dados Depois'],
      'LogAcessos':           ['Data/Hora', 'Email', 'Nome Usuário', 'Nível Acesso', 'IP Aprox.', 'User Agent'],
      'PreferenciasUsuarios': ['email', 'chave', 'valor', 'atualizadoEm'],

      // Credenciais para autenticação com senha (sistema próprio, sem depender de Session)
      // ORDEM DAS COLUNAS: não alterar sem atualizar auth_session.gs (leitura por índice)
      'CredenciaisUsuarios':  ['email', 'senha_hash', 'nome', 'ativo', 'criado_em', 'ultimo_login'],
    }
  },

  ESPACOS: {
    nome:  'CCBJ_ESPACOS',
    pasta: 'CCBJ — Espaços e Infraestrutura',
    prop:  PROP.ESPACOS,
      abas: {

    // =========================
    // RESERVAS (mantido)
    // =========================
    'Reservas': [
      'ID','Data Reserva','Início','Término','Sala','Turno',
      'Nome da Ação','Tipo de Ação','Responsável','Setor',
      'Co-responsável','Release','Itens Volantes','Status',
      'Data Solicitação','ID Lote'
    ],

    // =========================
    // ATIVOS (NOVO CORE)
    // =========================
    'Ativos': [
      'ID',
      'Nome',
      'Codigo',
      'Tipo',
      'Categoria',
      'Criticidade',

      'LocalizacaoTipo',
      'Sala',

      'QtdTotal',
      'QtdReservado',
      'Unidade',

      'DataEntrada',
      'DataAtivacao',

      'Status',
      'FaseCicloVida',

      'ContratoID',
      'ContratacaoID',
      'ValorAquisicao',

      'CustoManutencao',
      'CustoTotal',

      'GrauPreservacao',
      'IndiceSaude',

      'Responsavel',
      'Setor',

      'CriadoEm',
      'AtualizadoEm'
    ],

    // =========================
    // MOVIMENTAÇÕES
    // =========================
    'MovimentacoesAtivos': [
      'ID',
      'ID Ativo',
      'Tipo',
      'Origem',
      'Quantidade',
      'Data',
      'Responsavel',
      'Observacao'
    ],

    // =========================
    // MANUTENÇÃO
    // =========================
    'Manutencoes': [
      'ID',
      'ID Ativo',
      'Tipo',
      'Descricao',
      'Custo',
      'DuracaoHoras',
      'DataExecucao',
      'ProximaPrevista',
      'Responsavel',
      'Status'
    ],

    // =========================
    // USO (RESERVAS)
    // =========================
    'UsoAtivos': [
      'ID',
      'ID Ativo',
      'ID Reserva',
      'DataInicio',
      'DataFim',
      'Quantidade',
      'Confirmado'
    ],

    // =========================
    // BAIXAS
    // =========================
    'BaixasAtivos': [
      'ID',
      'ID Ativo',
      'Tipo',
      'Motivo',
      'ValorRecuperado',
      'Data'
    ],

    // =========================
    // ALERTAS
    // =========================
    'AlertasInfra': [
      'ID',
      'ID Ativo',
      'Tipo',
      'Descricao',
      'Nivel',
      'Status',
      'CriadoEm'
    ],

    // =========================
    // SOLICITAÇÕES (mantido)
    // =========================
    'Solicitacoes': [
      'ID','Tipo','Subtipo','ID Reserva','Sala','Usuario',
      'Justificativa','Payload','Status','Aprovador',
      'Data Solicitação','Data Ação'
    ],

    // =========================
    // LEGADO (não apagar ainda)
    // =========================
    'Itens': [
      'ID Item','Nome','Categoria','Quantidade Total',
      'Localização','Status de Uso'
    ]

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

    'ProcessosComunicacao': [
      'ID',
      'Título',
      'Descrição',
      'Status',
      'Prioridade',
      'Origem',
      'ID Reserva',
      'ID RECE',
      'Solicitante',
      'Responsável',
      'Prazo',
      'Data Criação',
      'Data Atualização',
      'Observações',
      'Revisao Status',
      'Revisao Solicitacao',
      'Revisao Solicitante',
      'Revisao Data',
      'Revisao Resposta'
    ],

    'EntregasComunicacao': [
      'ID Entrega',
      'ID Processo',
      'Tipo',
      'Status',
      'Responsável',
      'Prazo',
      'Data Entrega',
      'Link Entrega' 
    ]

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
      'RubricasHistorico': ['DATA','ID_RUBRICA','USUARIO','DADOS'],
      'ContratosVersoes': ['ID_VERSAO','ID_CONTRATO','VERSAO','SNAPSHOT_JSON','CRIADO_EM','CRIADO_POR'],
    }
  },

  FINANCEIRO: {
    nome:  'CCBJ_FINANCEIRO',
    pasta: 'CCBJ — Financeiro',
    prop:  PROP.FINANCEIRO,
    abas: {
      'Contratacoes': ['ID','Tipo','Nome','CPF/CNPJ','Valor','Data Início','Data Fim','Status','ID Contrato','Observações'],
      'RubricasFinanceiro':     ['ID','ID Meta','Nome','Valor','Obs'],
      'Pagamentos':   ['ID','ID Contratacao','Competência','Valor','Data Pagamento','Status','Comprovante URL'],
      'FluxoCaixa':   ['ID','Data','Tipo','Categoria','Valor','Descrição','ID Referência','Saldo Acumulado'],
    }
  },

  'EQUIPES': {
    nome:  'CCBJ_EQUIPES',
    pasta: 'CCBJ — Equipes',
    prop:  PROP.EQUIPES,
    abas: {

      // =========================
      // PESSOA (CADASTRO BASE)
      // =========================
      'Funcionarios': [
        'ID',
        'Nome',
        'Email Institucional',
        'Email Pessoal',
        'CPF',
        'Telefone',
        'Contato Emergência',

        'Setores',              // JSON
        'Funcoes',              // JSON
        'Substituicoes',        // JSON

        'Cargo',
        'Tipo Vínculo',         // CLT, PJ, Bolsista etc.
        'Status',

        'Dados Sensíveis',      // JSON (saúde, pronomes etc.)
        'Criado Em',
        'Atualizado Em'
      ],

      // =========================
      // VÍNCULOS FINANCEIROS
      // =========================
      'Vinculos': [
        'ID',
        'ID Funcionario',
        'Cargo',
        'Enquadramento',
        'Tipo Vínculo',

        'Data Início',
        'Data Fim',

        'Salário Base',
        'Reajuste %',
        'Salário Ajustado',

        'INSS',
        'Sistema S + SAT',
        'FGTS',
        'PIS',

        'Vale Transporte',
        'Desconto VT',
        'Vale Alimentação',
        'Desconto VA',
        'Plano Saúde',
        'Desconto Plano',

        'Férias Provisão',
        '13º Provisão',
        'FGTS Rescisão',

        'Custo Total Mensal',
        'Custo Total Contrato'
      ],

      // =========================
      // OCORRÊNCIAS (RH REAL)
      // =========================
      'Ocorrencias': [
        'ID',
        'ID Funcionario',
        'Tipo', // atestado, afastamento, advertência etc.
        'Descrição',
        'Data Início',
        'Data Fim',
        'Status',
        'Anexo URL',
        'Criado Em'
      ],

      // =========================
      // FÉRIAS (mantido)
      // =========================
      'Ferias': [
        'ID',
        'ID Funcionario',
        'Início',
        'Fim',
        'Tipo',
        'Status',
        'Aprovador'
      ],

      // =========================
      // ESCALAS (mantido)
      // =========================
      'Escalas': [
        'ID',
        'ID Funcionario',
        'Data',
        'Entrada',
        'Saída',
        'Tipo',
        'Observações'
      ],

      // =========================
      // PARÂMETROS (CÁLCULO)
      // =========================
      'ParametrosRH': [
        'Chave',
        'Valor'
      ]

    }
  },

  ESCUTA: {
    nome:  'CCBJ_ESCUTA',
    pasta: 'CCBJ — Escuta Institucional',
    prop:  PROP.ESCUTA,
    abas: {
      'EscutaConfig': [
        'chave', 'valor', 'descricao', 'atualizadoEm'
      ],
      'EscutaPerguntas': [
        'id', 'texto', 'dimensao', 'tipo', 'tipoTempo', 'peso',
        'elegibilidade', 'prioridade', 'ativo', 'criadoEm'
      ],
      'EscutaRespostas': [
        'id', 'perguntaId', 'hashUsuario', 'email', 'resposta',
        'dimensao', 'tipo', 'tipoTempo', 'respondidoEm', 'turno',
        'progressoTurno', 'periodo', 'setor', 'anonimo', 'sourcePesquisaId'
      ],
      'EscutaEspontanea': [
        'id', 'hashUsuario', 'email', 'categoria', 'texto',
        'sentimento', 'anonimo', 'registradoEm', 'setor'
      ],
      'EscutaPesquisas': [
        'id', 'titulo', 'perguntas', 'criadoPor', 'periodoInicio',
        'periodoFim', 'status', 'prioridade', 'padrao', 'elegibilidade',
        'regras_saturacao', 'criadoEm'
      ],
      'EscutaTemplates': [
        'id', 'titulo', 'perguntas', 'categoria', 'descricao',
        'publico', 'criadoEm', 'criadoPor'
      ],
      'EscutaAlertas': [
        'id', 'tipo', 'dimensao', 'nivel', 'mensagem',
        'periodo', 'criadoEm', 'dados', 'status',
        'resolvidoPor', 'acaoTomada', 'resolvidoEm'
      ],
      'EscutaPerfis': [
        'email', 'genero', 'raca', 'orientacaoSexual', 'faixaSalarial',
        'vinculo', 'nivel', 'tempoCasa', 'regiao', 'distancia', 'atualizadoEm'
      ],
      'LogsEscuta': [
        'timestamp', 'acao', 'autor', 'alvo', 'modulo', 'detalhes'
      ],
    }
  },

  PESSOAL: {
    nome:  'CCBJ_PESSOAL',
    pasta: 'CCBJ — Pessoal',
    prop:  PROP.PESSOAL,
    abas: {
      'Tarefas': [
        'ID',
        'Título',
        'Tipo',
        'Subtipo',
        'Origem',
        'ID Origem',
        'Responsável',
        'Status',
        'Prioridade',
        'Data Criação',
        'Data Atualização',
        'Função',        
        'Status Interno',
        'Executores'
      ],
      'InteracoesTarefas': [
        'ID',
        'ID Tarefa',
        'Tipo',
        'Mensagem',
        'Autor',
        'Data'
      ],
      'Processos': ['ID','Nome','Descrição','Responsável','Etapa Atual','Status','Data Início','Data Fim Prevista','Observações'],
      'Demandas':  ['ID','Origem','Título','Descrição','Solicitante','Responsável','Status','Data Entrada','Data Resposta','Resposta'],
    }
  },

}

// ── Cores de cabeçalho por módulo ────────────────────────────────────────
const COR_MODULO = {
  MASTER:      '#1F2937',
  ESPACOS:     '#4C1D95',
  COMUNICACAO: '#92400E',
  RELATORIOS:  '#1E3A5F',
  FINANCEIRO:  '#065F46',
  EQUIPES:     '#7C2D12',
  PESSOAL:     '#3B0764',
  ESCUTA:      '#0F4C75',
}


/**
 * ========================================
 * BLOCO: Provisionamento inicial
 * ========================================
 * @description inicializarSistema(): cria toda a infraestrutura de pastas e planilhas.
 *              Exibe confirmação via UI quando executada no editor; silenciosa quando
 *              chamada programaticamente (sem UI disponível).
 *              autorizarDrive(): helper de autorização — executar antes de inicializarSistema()
 *              se for a primeira execução do script no ambiente.
 * @context Execução manual única pelo Superadmin no Google Apps Script Editor
 * @sideEffects Cria pastas no Drive, cria planilhas, salva IDs em PropertiesService,
 *              registra o email do executor como Superadmin
 */
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

  // =====================================
  // CRIA ESTRUTURA BASE
  // =====================================
  const pastas = _criarEstruturaPastas();
  _criarTodasPlanilhas(pastas);

  // =====================================
  // INICIALIZA EQUIPE
  // =====================================
  try {
    inicializarEquipePadrao();
  } catch (e) {
    console.warn('Falha ao inicializar equipe:', e.message);
  }

  // =====================================
  // REGISTRA SUPERADMIN
  // =====================================
  _registrarSuperadmin();

  // =====================================
  // INICIALIZA CREDENCIAIS DE ACESSO
  // =====================================
  try {
    inicializarCredenciais();
  } catch(e) {
    console.warn('Falha ao inicializar credenciais:', e.message);
  }

  if (usarUI) {
    ui.alert('Setup concluído!');
  }

  // =====================================
  // REGISTRA DADOS RH
  // =====================================
  try {
    inicializarParametrosRH();
  } catch(e) {
    console.warn('Falha ao iniciar parâmetros RH', e);
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

/**
 * ========================================
 * BLOCO: Helpers de acesso às planilhas
 * ========================================
 * @description _ssCache: cache em memória por execução GAS — evita abrir a mesma planilha
 *              múltiplas vezes em uma única requisição (SpreadsheetApp.openById é custoso).
 *              _abrirModulo(chave): retorna o Spreadsheet do módulo, usando cache.
 *              _abrirAba(chave, nomeAba): atalho para obter uma aba específica com erro claro.
 * @context Usados por _getSheet (utils.js) e pelos helpers de manutenção abaixo
 * @sideEffects _abrirModulo popula _ssCache; lê PropertiesService na primeira chamada
 */
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

/**
 * ========================================
 * BLOCO: Utilitários de manutenção e diagnóstico
 * ========================================
 * @description Funções de uso exclusivamente manual (executar no editor GAS):
 *              listarIdsModulos(): exibe IDs salvos no PropertiesService — diagnóstico.
 *              recriarEstrutura(): recria abas sem apagar dados — atualiza schema.
 *              liberarItensOrfaos(): quando uma sala é excluída, devolve ao estoque do almoxarifado
 *                                    os itens que estavam alocados nela.
 *              debugProps(): lista todas as propriedades salvas — diagnóstico.
 *              processarFilasAutomaticamente(): placeholder para trigger agendado futuro.
 */

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

// =====================================================
// SETUP INICIAL — EQUIPE
// =====================================================

function inicializarEquipePadrao() {

  var aba = _abrirAba('EQUIPES', 'Funcionarios');
  var dados = aba.getDataRange().getValues();

  // Se já tem dados reais, não mexe
  if (dados.length > 1) {
    console.log('Equipe já inicializada');
    return { ok: true, msg: 'Equipe já existe' };
  }

  var agora = new Date().toISOString();

  aba.appendRow([
    'fun_' + Date.now(),
    'Equipe Comunicação',
    'comunicacao@ccbj.org',
    '',
    '',
    '',
    '',

    JSON.stringify(['comunicacao']),

    JSON.stringify([
      { tipo: 'materia', ativo: true },
      { tipo: 'divulgacao', ativo: true }
    ]),

    JSON.stringify([]),

    'Equipe',
    'Institucional',
    '',
    'Ativo',

    JSON.stringify({
      observacao: 'Cadastro inicial automático'
    }),

    agora,
    agora
  ]);

  console.log('Equipe inicial criada');

  return { ok: true };
}

//revisar parametros prosteriormente, pois parametros podem
function inicializarParametrosRH() {

  var aba = _abrirAba('EQUIPES', 'ParametrosRH');
  var dados = aba.getDataRange().getValues();

  if (dados.length > 1) return;

  aba.appendRow(['meses_contrato', 12]);
  aba.appendRow(['reajuste_percentual', 0.05]);

  aba.appendRow(['vale_transporte_A', 5.40]);
  aba.appendRow(['vale_transporte_E', 4.80]);

  aba.appendRow(['vale_alimentacao', 27.01]);
  aba.appendRow(['desconto_vale_alimentacao', 1.00]);

}

/**
 * ========================================
 * BLOCO: Credenciais de acesso
 * ========================================
 * @description Provisiona a aba CredenciaisUsuarios na planilha MASTER e
 *              cria o primeiro administrador a partir de PropertiesService.
 *
 * CONFIGURAÇÃO PRÉVIA (no editor GAS → Propriedades do script):
 *   PRIMEIRO_ADMIN_EMAIL  — email do primeiro admin (ex: joao@idm.org.br)
 *   PRIMEIRO_ADMIN_SENHA  — senha em texto plano (convertida em hash SHA-256 aqui)
 *   PRIMEIRO_ADMIN_NOME   — nome para exibição (ex: João Barros)
 *
 * Segurança:
 *   - A senha nunca é armazenada em texto plano. Apenas o hash SHA-256 é gravado.
 *   - Após o primeiro login, remova PRIMEIRO_ADMIN_SENHA do PropertiesService.
 *   - A função é idempotente: não duplica o admin se já existir.
 *
 * Execução:
 *   - Chamada automaticamente por inicializarSistema().
 *   - Pode ser chamada manualmente para recriar/reparar a aba.
 */
function inicializarCredenciais() {
  var props = PropertiesService.getScriptProperties();

  // ── 1. Garantir que a aba existe ──────────────────────────────
  var master = _abrirModulo('MASTER');
  if (!master) {
    console.warn('[Credenciais] Planilha MASTER não encontrada.');
    return { ok: false, msg: 'MASTER não encontrada' };
  }

  // A aba é criada por _configurarAbas() via MODULOS.MASTER.abas — nunca criar aqui.
  var aba = master.getSheetByName('CredenciaisUsuarios');
  if (!aba) {
    console.warn('[Credenciais] Aba CredenciaisUsuarios não encontrada. Execute inicializarSistema() ou recriarEstrutura().');
    return { ok: false, msg: 'Aba não encontrada. Execute o setup.' };
  }

  // ── 2. Criar primeiro admin se configurado ────────────────────
  var emailAdmin = (props.getProperty('PRIMEIRO_ADMIN_EMAIL') || '').trim().toLowerCase();
  var senhaPlain = (props.getProperty('PRIMEIRO_ADMIN_SENHA') || '').trim();
  var nomeAdmin  = (props.getProperty('PRIMEIRO_ADMIN_NOME')  || emailAdmin.split('@')[0]).trim();

  if (!emailAdmin || !senhaPlain) {
    console.log('[Credenciais] PRIMEIRO_ADMIN_EMAIL ou PRIMEIRO_ADMIN_SENHA não configurados — pulando criação.');
    return { ok: true, msg: 'Aba garantida; primeiro admin não configurado.' };
  }

  // Verificar se já existe
  var dados = aba.getLastRow() > 1
    ? aba.getRange(2, 1, aba.getLastRow() - 1, 1).getValues()
    : [];
  var jaExiste = dados.some(function(r) {
    return String(r[0] || '').trim().toLowerCase() === emailAdmin;
  });

  if (jaExiste) {
    console.log('[Credenciais] Admin ' + emailAdmin + ' já existe — sem alterações.');
    return { ok: true, msg: 'Admin já cadastrado.' };
  }

  // Hash SHA-256 da senha
  var hashBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, senhaPlain);
  var senhaHash = hashBytes.map(function(b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');

  aba.appendRow([emailAdmin, senhaHash, nomeAdmin, true, new Date().toISOString(), '']);
  console.log('[Credenciais] Primeiro admin criado: ' + emailAdmin);

  // Aviso de segurança: lembrar de remover a senha após setup
  console.warn('[Credenciais] ⚠️  Remova PRIMEIRO_ADMIN_SENHA do PropertiesService após o primeiro login.');

  return { ok: true, msg: 'Admin ' + emailAdmin + ' criado com sucesso.' };
}

/**
 * Recria apenas a aba de credenciais sem reexecutar o setup completo.
 * Útil para reparar em produção sem risco.
 */
function repararAbaCredenciais() {
  return inicializarCredenciais();
}

function debugItens() {
  var aba = _abrirAba('ESPACOS', 'Itens');
  Logger.log(aba.getName());
}