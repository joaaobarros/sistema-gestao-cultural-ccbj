# 📜 Log de Evolução do Sistema

## [Data]

### Ação
Criação da estrutura inicial de documentação

### Impacto
Base para análise completa do sistema

### Próximos Passos
- Análise de arquivos
- Identificação de falhas estruturais

## [Data]

### Ação
Análise da camada de serviços (GAS)

### Impacto
Mapeamento da comunicação frontend-backend e identificação de riscos críticos de integração

### Próximos Passos
- Revisar impacto no AppState
- Mapear fluxo de dados completo

## [Data]

### Ação
Análise do arquivo raiz (Index)

### Impacto
Mapeamento da arquitetura real de carregamento e orquestração do sistema

### Próximos Passos
- Revisar bootstrap
- Mapear fluxo de inicialização completo

## [Data]

### Ação
Análise do bootstrap do sistema

### Impacto
Identificação da orquestração real do sistema via eventos e DOM

### Próximos Passos
- Revisar mod_ui_estado_js (provável núcleo funcional)
- Mapear fluxo completo de inicialização

## [2026-05-05] — Sessão anterior

### Ação
Análise completa da camada de lógica frontend (html/logic/) e módulos puros

### Arquivos Analisados
`utils_js`, `Codigo_gs`, `Setup_js`, `DataLayer_gs`, `mod_admin_gs`, `mod_reservas_gs`,
`mod_almoxarifado_gs`, `mod_estrategia_gs`, `mod_preferencias_gs`, `mod_pessoal_gs`,
`mod_equipes_gs`, `mod_comunicacao_gs`, `mod_comunicacao_processos_gs`,
`mod_financeiro_gs`, `mod_metrics_gs`

### Problemas Críticos Identificados
1. `criarReservaController` não verifica conflito de espaço — reservas sobrepostas possíveis
2. `obterMetricasEficiencia` acessa `r.status` em array 2D — sempre retorna zeros
3. `calcularCustoPorMeta` acessa colunas `Meta`/`Programa` que não existem no schema Setup.js
4. Email `joao.barros` hardcoded em `perguntarIA` — comportamento especial em produção
5. `_salvarCamposCODIP` em mod_reservas.gs é noop — implementação real está em mod_relatorios.gs

## [2026-05-05] — Esta sessão

### Ação
Análise da camada de backend restante: permissões, RH, relatórios, escuta

### Arquivos Analisados
`mod_permissoes_gs`, `mod_rh_gs`, `mod_relatorios_gs`, `mod_permissoes_v2_gs`, `mod_escuta_gs`

### Problemas Críticos Identificados
1. `compararVersoesContrato` definida duas vezes em mod_relatorios.gs — segunda sobrescreve silenciosamente
2. `_mapaMetas()` e `_mapaRubricas()` tratam objetos como arrays — ranking de contratos sempre "desconhecido"
3. `obterRelatoriosCODIP` acessa r[34]/r[35] em array de 34 colunas — idContrato/idMeta sempre undefined
4. `_p2registrarAuditoria` sem LockService — auditoria de permissões pode perder entradas sob concorrência
5. `_escutaVerificarEGerarAlertas` executado síncronamente em cada resposta pulse — risco de timeout 30s
6. `resolverAlertaEscuta` e `excluirPesquisaEscuta` sem verificação de permissão — dados de clima organizacional desprotegidos

## [Data]

### Ação
Análise do núcleo funcional do sistema

### Impacto
Identificação do principal ponto de acoplamento e concentração de lógica

### Próximos Passos
- Separar responsabilidades por domínio
- Mapear fluxo completo de reservas

## [Data]

### Ação
Análise da camada de UI de reservas

### Impacto
Identificação da sobreposição entre UI e lógica de domínio

### Próximos Passos
- Mapear fluxo salvarAgendamento
- Avaliar separação entre UI e domínio

## [Data]

### Ação
Análise do módulo de disponibilidade

### Impacto
Identificação de um módulo bem estruturado com lógica pura e reutilizável

### Próximos Passos
- Usar como referência para refatoração de outros módulos

## [Data]

### Ação
Análise do módulo de itens

### Impacto
Identificação de padrão consistente de lógica pura, porém com fragilidade na estrutura de dados

### Próximos Passos
- Padronizar estrutura de dados dos itens

## [Data]

### Ação
Análise dos utilitários globais de UI

### Impacto
Mapeamento da base de tratamento de erro, loader e segurança de interface

### Próximos Passos
- Padronizar uso de UI em todos os módulos

## [Data]

### Ação
Análise do sistema de permissões

### Impacto
Identificação de controle híbrido (frontend + backend) com riscos de sincronização

### Próximos Passos
- Revisar centralização de regras no backend
- Melhorar sincronização de inicialização

## [Data]

### Ação
Análise da integração entre reservas e comunicação

### Impacto
Mapeamento do fluxo de geração de demandas vinculadas às reservas

### Próximos Passos
- Revisar fluxo salvarAgendamento
- Validar consistência entre módulos integrados

## [Data]

### Ação
Definição do módulo de solicitações externas

### Impacto
Expansão do sistema para entrada estruturada de demandas do território

### Próximos Passos
- Modelar fluxo completo
- Integrar com módulos existentes

## [Data]

### Ação
Definição dos módulos de demandas internas e gestão de projetos

### Impacto
Estruturação da operação interna e criação do núcleo integrador do sistema (ações)

### Próximos Passos
- Integrar com contratos, reservas e tarefas
- Refinar fluxos por tipo de demanda e ação

## [Data]

### Ação
Definição do modelo estrutural da ação (núcleo do sistema)

### Impacto
Transformação da arquitetura em sistema centrado em ações, integrando pessoas, recursos, tarefas e entregas

### Próximos Passos
- Mapear dados e relações entre módulos
- Estruturar backend baseado em ações