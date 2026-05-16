/**
 * @file modules/processos/processo_tipo_config.gs
 * @layer modules
 * @description Engine de Configuração de Tipos de Processo Administrativo-Financeiro.
 *
 *              PRINCÍPIO:
 *              Tipos de processo NÃO são hardcoded no engine.
 *              São definidos aqui como catálogo configurável e persistidos em
 *              processo_tipos.json. Gestores superadmin podem adicionar/editar tipos.
 *
 *              Cada tipo define:
 *              - Campos obrigatórios específicos
 *              - Etapas sequenciais com responsáveis por setor
 *              - Setores envolvidos padrão
 *              - Documentos exigidos por etapa
 *              - Regras orçamentárias (exige rubrica, valida saldo)
 *              - Integrações automáticas (gera tarefa, demanda balcão, etc.)
 *
 * @depends core/data_layer.gs (readJSON, writeJSON)
 * @depends core/logger.gs (Logger)
 */

// ── Catálogo padrão de tipos de processo ────────────────────────────────────
// Carregado quando processo_tipos.json não existe ou como fallback.
// Cada tipo é um objeto com: id, nome, descricao, etapas[], camposExtras[], ...

var _CATALOGO_TIPOS_PADRAO = [

  // ── CONTRATAÇÃO DE PROFESSOR ──────────────────────────────────────────────
  {
    id:          'contratacao_professor',
    nome:        'Contratação de Professor',
    descricao:   'Contratação de professor para cursos, oficinas e atividades pedagógicas.',
    categoria:   'contratacao',
    icone:       'fas fa-chalkboard-teacher',
    cor:         'indigo',
    exigeRubrica: true,
    exigeAcaoVinculada: true,
    setoresPadrao: ['rh', 'financeiro', 'programacao'],
    camposExtras: [
      { id: 'nome_professor',   label: 'Nome do Professor',    tipo: 'text',   obrigatorio: true },
      { id: 'cpf',              label: 'CPF',                   tipo: 'text',   obrigatorio: true  },
      { id: 'carga_horaria',    label: 'Carga Horária (h)',     tipo: 'number', obrigatorio: true },
      { id: 'periodo',          label: 'Período de Execução',   tipo: 'daterange', obrigatorio: true },
      { id: 'disciplina',       label: 'Disciplina/Oficina',    tipo: 'text',   obrigatorio: true }
    ],
    documentosExigidos: ['RG/CPF', 'Currículo', 'Proposta de Trabalho', 'Contrato de Prestação'],
    etapas: [
      { id: 'solicitacao',       nome: 'Solicitação',              setorResponsavel: 'programacao', descricao: 'Setor solicitante abre o processo com dados do professor e período.' },
      { id: 'analise_rh',        nome: 'Análise RH',               setorResponsavel: 'rh',          descricao: 'RH verifica documentação e conformidade do contratante.' },
      { id: 'aprovacao_direcao', nome: 'Aprovação da Direção',     setorResponsavel: 'direcao',     descricao: 'Direção aprova a contratação.' },
      { id: 'analise_financeiro',nome: 'Análise Financeira',       setorResponsavel: 'financeiro',  descricao: 'Financeiro valida saldo e emite empenho.' },
      { id: 'contratacao',       nome: 'Contratação',              setorResponsavel: 'rh',          descricao: 'Elaboração e assinatura do contrato.', documentosObrigatorios: ['Contrato de Prestação'] },
      { id: 'execucao',          nome: 'Execução',                 setorResponsavel: 'programacao', descricao: 'Execução das atividades contratadas.' },
      { id: 'pagamento',         nome: 'Pagamento',                setorResponsavel: 'financeiro',  descricao: 'Emissão de nota fiscal e pagamento.', documentosObrigatorios: ['Nota Fiscal / RPA'] },
      { id: 'encerramento',      nome: 'Encerramento',             setorResponsavel: 'rh',          descricao: 'Encerramento formal do contrato e arquivamento.' }
    ]
  },

  // ── CONTRATAÇÃO DE PROFISSIONAL ───────────────────────────────────────────
  {
    id:          'contratacao_profissional',
    nome:        'Contratação de Profissional',
    descricao:   'Contratação de profissional para serviços especializados (artista, técnico, consultor).',
    categoria:   'contratacao',
    icone:       'fas fa-user-tie',
    cor:         'purple',
    exigeRubrica: true,
    exigeAcaoVinculada: false,
    setoresPadrao: ['rh', 'financeiro'],
    camposExtras: [
      { id: 'nome_profissional', label: 'Nome do Profissional',  tipo: 'text',   obrigatorio: true },
      { id: 'area_atuacao',      label: 'Área de Atuação',       tipo: 'text',   obrigatorio: true },
      { id: 'modalidade',        label: 'Modalidade',            tipo: 'select', opcoes: ['MEI', 'PJ', 'PF', 'CLT'], obrigatorio: true },
      { id: 'valor_total',       label: 'Valor Total (R$)',       tipo: 'currency', obrigatorio: true }
    ],
    documentosExigidos: ['RG/CPF ou CNPJ', 'Proposta Comercial', 'Contrato'],
    etapas: [
      { id: 'solicitacao',       nome: 'Solicitação',              setorResponsavel: 'solicitante',  descricao: 'Abertura com justificativa e dados do profissional.' },
      { id: 'analise_adm',       nome: 'Análise Administrativa',   setorResponsavel: 'rh',           descricao: 'RH analisa conformidade documental e modalidade.' },
      { id: 'validacao_fin',     nome: 'Validação Financeira',     setorResponsavel: 'financeiro',   descricao: 'Financeiro valida rubrica e reserva orçamentária.', validacaoOrcamento: true },
      { id: 'aprovacao',         nome: 'Aprovação',                setorResponsavel: 'direcao',      descricao: 'Aprovação da direção.' },
      { id: 'contratacao',       nome: 'Contratação',              setorResponsavel: 'rh',           descricao: 'Formalização contratual.' },
      { id: 'execucao',          nome: 'Execução',                 setorResponsavel: 'solicitante',  descricao: 'Execução do serviço contratado.' },
      { id: 'pagamento',         nome: 'Pagamento',                setorResponsavel: 'financeiro',   descricao: 'Pagamento mediante NF/RPA.' },
      { id: 'encerramento',      nome: 'Encerramento',             setorResponsavel: 'rh',           descricao: 'Encerramento e arquivo.' }
    ]
  },

  // ── CONTRATAÇÃO DE SERVIÇO GRÁFICO ────────────────────────────────────────
  {
    id:          'servico_grafico',
    nome:        'Serviço Gráfico',
    descricao:   'Contratação de serviço gráfico (impressão, banners, folders, peças de comunicação).',
    categoria:   'servico',
    icone:       'fas fa-print',
    cor:         'rose',
    exigeRubrica: true,
    exigeAcaoVinculada: false,
    setoresPadrao: ['comunicacao', 'financeiro', 'operacional'],
    camposExtras: [
      { id: 'descricao_peca',  label: 'Descrição da Peça',      tipo: 'text',     obrigatorio: true },
      { id: 'quantidade',      label: 'Quantidade',             tipo: 'number',   obrigatorio: true },
      { id: 'formato',         label: 'Formato/Especificação',  tipo: 'text',     obrigatorio: false },
      { id: 'prazo_entrega',   label: 'Prazo de Entrega',       tipo: 'date',     obrigatorio: true }
    ],
    documentosExigidos: ['Arte Final Aprovada', 'Orçamento do Fornecedor', 'Nota Fiscal'],
    etapas: [
      { id: 'solicitacao',       nome: 'Solicitação',            setorResponsavel: 'solicitante',  descricao: 'Setor solicita peça com briefing.' },
      { id: 'producao_comunicacao', nome: 'Produção — Comunicação', setorResponsavel: 'comunicacao', descricao: 'Comunicação produz e envia arte final.', gerarDemandaBalcao: true },
      { id: 'aprovacao_arte',    nome: 'Aprovação da Arte',      setorResponsavel: 'solicitante',  descricao: 'Solicitante aprova a arte.' },
      { id: 'cotacao',           nome: 'Cotação',                setorResponsavel: 'financeiro',   descricao: 'Financeiro realiza cotação com fornecedores.' },
      { id: 'aprovacao_fin',     nome: 'Aprovação Financeira',   setorResponsavel: 'financeiro',   descricao: 'Aprovação do valor e reserva orçamentária.', validacaoOrcamento: true },
      { id: 'contratacao',       nome: 'Contratação',            setorResponsavel: 'financeiro',   descricao: 'Contratação do fornecedor.' },
      { id: 'producao_externa',  nome: 'Produção Externa',       setorResponsavel: 'operacional',  descricao: 'Fornecedor executa o serviço.' },
      { id: 'conferencia',       nome: 'Conferência',            setorResponsavel: 'solicitante',  descricao: 'Conferência do material entregue.' },
      { id: 'pagamento',         nome: 'Pagamento',              setorResponsavel: 'financeiro',   descricao: 'Pagamento ao fornecedor.' },
      { id: 'encerramento',      nome: 'Encerramento',           setorResponsavel: 'financeiro',   descricao: 'Arquivamento e encerramento.' }
    ]
  },

  // ── AQUISIÇÃO DE EQUIPAMENTO ──────────────────────────────────────────────
  {
    id:          'aquisicao_equipamento',
    nome:        'Aquisição de Equipamento',
    descricao:   'Compra de equipamentos, materiais ou bens para o CCBJ.',
    categoria:   'aquisicao',
    icone:       'fas fa-box',
    cor:         'amber',
    exigeRubrica: true,
    exigeAcaoVinculada: false,
    setoresPadrao: ['financeiro', 'operacional', 'infraestrutura'],
    camposExtras: [
      { id: 'descricao_item',  label: 'Descrição do Item',      tipo: 'text',     obrigatorio: true },
      { id: 'quantidade',      label: 'Quantidade',             tipo: 'number',   obrigatorio: true },
      { id: 'especificacao',   label: 'Especificação Técnica',  tipo: 'textarea', obrigatorio: false },
      { id: 'justificativa',   label: 'Justificativa',          tipo: 'textarea', obrigatorio: true }
    ],
    documentosExigidos: ['3 Orçamentos', 'Nota Fiscal', 'Termo de Recebimento'],
    etapas: [
      { id: 'solicitacao',     nome: 'Solicitação',             setorResponsavel: 'solicitante', descricao: 'Abertura com especificação do item.' },
      { id: 'pesquisa_preco',  nome: 'Pesquisa de Preço',       setorResponsavel: 'financeiro',  descricao: 'Financeiro coleta 3 orçamentos.', documentosObrigatorios: ['3 Orçamentos'] },
      { id: 'aprovacao',       nome: 'Aprovação',               setorResponsavel: 'direcao',     descricao: 'Aprovação da direção.' },
      { id: 'reserva_fin',     nome: 'Reserva Financeira',      setorResponsavel: 'financeiro',  descricao: 'Reserva orçamentária.', validacaoOrcamento: true },
      { id: 'compra',          nome: 'Compra',                  setorResponsavel: 'financeiro',  descricao: 'Efetivação da compra.' },
      { id: 'recebimento',     nome: 'Recebimento',             setorResponsavel: 'infraestrutura', descricao: 'Conferência e recebimento do item.', documentosObrigatorios: ['Nota Fiscal'] },
      { id: 'tombamento',      nome: 'Tombamento',              setorResponsavel: 'infraestrutura', descricao: 'Registro no patrimônio / almoxarifado.' },
      { id: 'pagamento',       nome: 'Pagamento',               setorResponsavel: 'financeiro',  descricao: 'Pagamento ao fornecedor.' },
      { id: 'encerramento',    nome: 'Encerramento',            setorResponsavel: 'financeiro',  descricao: 'Encerramento e arquivo.' }
    ]
  },

  // ── BOLSISTA / AGENTE CULTURAL ────────────────────────────────────────────
  {
    id:          'bolsista',
    nome:        'Bolsista / Agente Cultural',
    descricao:   'Contratação de bolsista ou agente cultural por programa específico.',
    categoria:   'contratacao',
    icone:       'fas fa-graduation-cap',
    cor:         'teal',
    exigeRubrica: true,
    exigeAcaoVinculada: false,
    setoresPadrao: ['rh', 'financeiro'],
    camposExtras: [
      { id: 'nome_bolsista',  label: 'Nome do Bolsista',        tipo: 'text',   obrigatorio: true },
      { id: 'programa',       label: 'Programa / Edital',       tipo: 'text',   obrigatorio: true },
      { id: 'valor_mensal',   label: 'Valor Mensal (R$)',        tipo: 'currency', obrigatorio: true },
      { id: 'duracao_meses',  label: 'Duração (meses)',          tipo: 'number', obrigatorio: true }
    ],
    documentosExigidos: ['Comprovante de Inscrição', 'RG/CPF', 'Termo de Compromisso'],
    etapas: [
      { id: 'solicitacao',    nome: 'Solicitação',               setorResponsavel: 'solicitante', descricao: 'Abertura pelo setor responsável pelo programa.' },
      { id: 'triagem',        nome: 'Triagem / Seleção',         setorResponsavel: 'rh',          descricao: 'RH verifica documentação e elegibilidade.' },
      { id: 'aprovacao',      nome: 'Aprovação',                 setorResponsavel: 'direcao',     descricao: 'Aprovação da direção.' },
      { id: 'reserva_fin',    nome: 'Reserva Financeira',        setorResponsavel: 'financeiro',  descricao: 'Reserva orçamentária mensal.', validacaoOrcamento: true },
      { id: 'contratacao',    nome: 'Formalização',              setorResponsavel: 'rh',          descricao: 'Assinatura do termo de compromisso.' },
      { id: 'execucao',       nome: 'Execução',                  setorResponsavel: 'solicitante', descricao: 'Atividade do bolsista.' },
      { id: 'pagamento',      nome: 'Pagamento Mensal',          setorResponsavel: 'financeiro',  descricao: 'Pagamento da bolsa.' },
      { id: 'encerramento',   nome: 'Encerramento',              setorResponsavel: 'rh',          descricao: 'Encerramento do vínculo.' }
    ]
  },

  // ── MANUTENÇÃO DE ESPAÇO ──────────────────────────────────────────────────
  {
    id:          'manutencao_espaco',
    nome:        'Manutenção de Espaço',
    descricao:   'Serviço de manutenção física, elétrica, hidráulica ou civil.',
    categoria:   'servico',
    icone:       'fas fa-tools',
    cor:         'orange',
    exigeRubrica: false,
    exigeAcaoVinculada: false,
    setoresPadrao: ['infraestrutura', 'financeiro'],
    camposExtras: [
      { id: 'local',          label: 'Local / Espaço',           tipo: 'text',     obrigatorio: true },
      { id: 'descricao',      label: 'Descrição do Serviço',     tipo: 'textarea', obrigatorio: true },
      { id: 'urgencia',       label: 'Urgência',                 tipo: 'select', opcoes: ['Baixa', 'Média', 'Alta', 'Emergencial'], obrigatorio: true }
    ],
    documentosExigidos: ['Orçamento', 'Relatório de Vistoria', 'Nota Fiscal'],
    etapas: [
      { id: 'solicitacao',    nome: 'Abertura de OS',            setorResponsavel: 'solicitante',  descricao: 'Solicitante registra o problema.' },
      { id: 'vistoria',       nome: 'Vistoria',                  setorResponsavel: 'infraestrutura', descricao: 'Infraestrutura faz vistoria e orçamento.' },
      { id: 'aprovacao',      nome: 'Aprovação',                 setorResponsavel: 'direcao',      descricao: 'Aprovação conforme valor.' },
      { id: 'execucao',       nome: 'Execução',                  setorResponsavel: 'infraestrutura', descricao: 'Execução do serviço.' },
      { id: 'conferencia',    nome: 'Conferência',               setorResponsavel: 'solicitante',  descricao: 'Conferência e aceite do serviço.' },
      { id: 'pagamento',      nome: 'Pagamento',                 setorResponsavel: 'financeiro',   descricao: 'Pagamento do serviço.' },
      { id: 'encerramento',   nome: 'Encerramento',              setorResponsavel: 'infraestrutura', descricao: 'Encerramento e registro patrimonial.' }
    ]
  },

  // ── TRANSPORTE ────────────────────────────────────────────────────────────
  {
    id:          'transporte',
    nome:        'Transporte',
    descricao:   'Solicitação de veículo/transporte para atividades institucionais.',
    categoria:   'logistica',
    icone:       'fas fa-bus',
    cor:         'blue',
    exigeRubrica: false,
    exigeAcaoVinculada: false,
    setoresPadrao: ['operacional'],
    camposExtras: [
      { id: 'origem',         label: 'Origem',                   tipo: 'text',     obrigatorio: true },
      { id: 'destino',        label: 'Destino',                  tipo: 'text',     obrigatorio: true },
      { id: 'passageiros',    label: 'Número de Passageiros',    tipo: 'number',   obrigatorio: true },
      { id: 'data_hora',      label: 'Data e Hora',              tipo: 'datetime', obrigatorio: true },
      { id: 'retorno',        label: 'Data/Hora de Retorno',     tipo: 'datetime', obrigatorio: false }
    ],
    documentosExigidos: [],
    etapas: [
      { id: 'solicitacao',    nome: 'Solicitação',               setorResponsavel: 'solicitante', descricao: 'Abertura com dados de origem/destino/passageiros.' },
      { id: 'verificacao',    nome: 'Verificação de Disponibilidade', setorResponsavel: 'operacional', descricao: 'Operacional verifica disponibilidade de veículo.' },
      { id: 'aprovacao',      nome: 'Aprovação',                 setorResponsavel: 'direcao',     descricao: 'Aprovação se necessário.' },
      { id: 'execucao',       nome: 'Execução',                  setorResponsavel: 'operacional', descricao: 'Realização do transporte.' },
      { id: 'encerramento',   nome: 'Encerramento',              setorResponsavel: 'operacional', descricao: 'Registro de quilometragem e fechamento.' }
    ]
  },

  // ── PROJETO CULTURAL ──────────────────────────────────────────────────────
  {
    id:          'projeto_cultural',
    nome:        'Projeto Cultural',
    descricao:   'Processo para execução de projeto cultural transversal (exposição, mostra, festival).',
    categoria:   'projeto',
    icone:       'fas fa-palette',
    cor:         'violet',
    exigeRubrica: true,
    exigeAcaoVinculada: true,
    setoresPadrao: ['programacao', 'comunicacao', 'financeiro', 'rh'],
    camposExtras: [
      { id: 'nome_projeto',   label: 'Nome do Projeto',          tipo: 'text',     obrigatorio: true },
      { id: 'edital',         label: 'Edital / Convênio',        tipo: 'text',     obrigatorio: false },
      { id: 'periodo',        label: 'Período de Execução',      tipo: 'daterange', obrigatorio: true },
      { id: 'publico_alvo',   label: 'Público Alvo',             tipo: 'text',     obrigatorio: false }
    ],
    documentosExigidos: ['Plano de Trabalho', 'Cronograma', 'Orçamento Detalhado'],
    etapas: [
      { id: 'solicitacao',    nome: 'Solicitação / Briefing',    setorResponsavel: 'programacao', descricao: 'Programação faz briefing do projeto.' },
      { id: 'planejamento',   nome: 'Planejamento',              setorResponsavel: 'programacao', descricao: 'Definição de escopo, cronograma e orçamento.' },
      { id: 'aprovacao_fin',  nome: 'Aprovação Financeira',      setorResponsavel: 'financeiro',  descricao: 'Validação orçamentária.', validacaoOrcamento: true },
      { id: 'aprovacao_dir',  nome: 'Aprovação da Direção',      setorResponsavel: 'direcao',     descricao: 'Aprovação estratégica.' },
      { id: 'comunicacao',    nome: 'Comunicação / Divulgação',  setorResponsavel: 'comunicacao', descricao: 'Comunicação produz materiais.', gerarDemandaBalcao: true },
      { id: 'execucao',       nome: 'Execução',                  setorResponsavel: 'programacao', descricao: 'Execução do projeto.' },
      { id: 'prestacao_contas', nome: 'Prestação de Contas',     setorResponsavel: 'financeiro',  descricao: 'Relatório financeiro e prestação de contas.' },
      { id: 'encerramento',   nome: 'Encerramento',              setorResponsavel: 'programacao', descricao: 'Avaliação e encerramento.' }
    ]
  },

  // ── CAMPANHA DE COMUNICAÇÃO ───────────────────────────────────────────────
  {
    id:          'campanha_comunicacao',
    nome:        'Campanha de Comunicação',
    descricao:   'Campanha de divulgação institucional ou de evento específico.',
    categoria:   'comunicacao',
    icone:       'fas fa-bullhorn',
    cor:         'sky',
    exigeRubrica: false,
    exigeAcaoVinculada: false,
    setoresPadrao: ['comunicacao'],
    camposExtras: [
      { id: 'objetivo',       label: 'Objetivo da Campanha',     tipo: 'textarea', obrigatorio: true },
      { id: 'canais',         label: 'Canais Previstos',         tipo: 'text',     obrigatorio: false },
      { id: 'prazo_lancamento', label: 'Prazo de Lançamento',    tipo: 'date',     obrigatorio: true }
    ],
    documentosExigidos: ['Briefing', 'Arte Final'],
    etapas: [
      { id: 'briefing',       nome: 'Briefing',                  setorResponsavel: 'solicitante', descricao: 'Solicitante envia briefing detalhado.' },
      { id: 'criacao',        nome: 'Criação',                   setorResponsavel: 'comunicacao', descricao: 'Comunicação desenvolve materiais.', gerarDemandaBalcao: true },
      { id: 'aprovacao',      nome: 'Aprovação',                 setorResponsavel: 'solicitante', descricao: 'Aprovação das peças.' },
      { id: 'publicacao',     nome: 'Publicação',                setorResponsavel: 'comunicacao', descricao: 'Publicação nos canais.' },
      { id: 'monitoramento',  nome: 'Monitoramento',             setorResponsavel: 'comunicacao', descricao: 'Acompanhamento de resultados.' },
      { id: 'encerramento',   nome: 'Encerramento',              setorResponsavel: 'comunicacao', descricao: 'Relatório de impacto.' }
    ]
  },

  // ── PROCESSO GENÉRICO ─────────────────────────────────────────────────────
  {
    id:          'outro',
    nome:        'Processo Genérico',
    descricao:   'Processo administrativo não enquadrado nos tipos anteriores.',
    categoria:   'outro',
    icone:       'fas fa-file-alt',
    cor:         'gray',
    exigeRubrica: false,
    exigeAcaoVinculada: false,
    setoresPadrao: [],
    camposExtras: [],
    documentosExigidos: [],
    etapas: [
      { id: 'solicitacao',    nome: 'Solicitação',               setorResponsavel: 'solicitante', descricao: 'Abertura do processo.' },
      { id: 'analise',        nome: 'Análise',                   setorResponsavel: 'operacional', descricao: 'Análise pela área responsável.' },
      { id: 'aprovacao',      nome: 'Aprovação',                 setorResponsavel: 'direcao',     descricao: 'Aprovação.' },
      { id: 'execucao',       nome: 'Execução',                  setorResponsavel: 'solicitante', descricao: 'Execução da demanda.' },
      { id: 'encerramento',   nome: 'Encerramento',              setorResponsavel: 'operacional', descricao: 'Encerramento.' }
    ]
  }
];

// ── ProcessoTipoConfigEngine ──────────────────────────────────────────────────

var ProcessoTipoConfigEngine = (function() {

  var _FILE = 'processo_tipos.json';

  function _lerCatalogo() {
    try {
      var custom = readJSON(_FILE);
      if (custom && custom.length) return custom;
    } catch(e) {
      Logger.warn('[ProcessoTipoConfig] Falha ao ler ' + _FILE + ': ' + e.message);
    }
    return _CATALOGO_TIPOS_PADRAO;
  }

  return {

    listar: function() {
      return _lerCatalogo();
    },

    obterPorId: function(id) {
      return _lerCatalogo().find(function(t) { return t.id === id; }) || null;
    },

    listarPorCategoria: function(categoria) {
      return _lerCatalogo().filter(function(t) { return t.categoria === categoria; });
    },

    // Salva tipo customizado (superadmin)
    salvar: function(tipo) {
      if (!tipo || !tipo.id || !tipo.nome) throw new Error('id e nome são obrigatórios.');
      var lista = _lerCatalogo();
      var idx   = lista.findIndex(function(t) { return t.id === tipo.id; });
      if (idx === -1) lista.push(tipo);
      else            lista[idx] = tipo;
      try { writeJSON(_FILE, lista); } catch(e) {
        Logger.warn('[ProcessoTipoConfig] Falha ao persistir tipos: ' + e.message);
      }
      return tipo;
    },

    resetar: function() {
      try { writeJSON(_FILE, _CATALOGO_TIPOS_PADRAO); } catch(e) {}
      return _CATALOGO_TIPOS_PADRAO;
    },

    // Retorna as etapas de um tipo com índice de posição
    obterEtapas: function(tipoId) {
      var tipo = ProcessoTipoConfigEngine.obterPorId(tipoId);
      if (!tipo) return [];
      return (tipo.etapas || []).map(function(e, i) {
        return Object.assign({ posicao: i, total: (tipo.etapas || []).length }, e);
      });
    },

    // Retorna a próxima etapa após a etapa atual
    proximaEtapa: function(tipoId, etapaAtualId) {
      var etapas = ProcessoTipoConfigEngine.obterEtapas(tipoId);
      var idx = etapas.findIndex(function(e) { return e.id === etapaAtualId; });
      if (idx === -1 || idx >= etapas.length - 1) return null;
      return etapas[idx + 1];
    },

    // Retorna campos extras de um tipo
    obterCamposExtras: function(tipoId) {
      var tipo = ProcessoTipoConfigEngine.obterPorId(tipoId);
      return tipo ? (tipo.camposExtras || []) : [];
    },

    // Verifica se etapa requer validação orçamentária
    etapaExigeOrcamento: function(tipoId, etapaId) {
      var tipo = ProcessoTipoConfigEngine.obterPorId(tipoId);
      if (!tipo) return false;
      var etapa = (tipo.etapas || []).find(function(e) { return e.id === etapaId; });
      return etapa ? !!etapa.validacaoOrcamento : false;
    },

    // Verifica se etapa deve gerar demanda no balcão
    etapaGeraBalcao: function(tipoId, etapaId) {
      var tipo = ProcessoTipoConfigEngine.obterPorId(tipoId);
      if (!tipo) return false;
      var etapa = (tipo.etapas || []).find(function(e) { return e.id === etapaId; });
      return etapa ? !!etapa.gerarDemandaBalcao : false;
    }
  };
})();
