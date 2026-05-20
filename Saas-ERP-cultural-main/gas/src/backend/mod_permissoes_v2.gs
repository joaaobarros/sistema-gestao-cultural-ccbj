/**
 * @file mod_permissoes_v2.gs
 * @layer backend
 * @description Delegadores globais para PermissoesV2Engine.
 *              Toda a lógica vive em modules/auth/permissoes_v2_engine.gs.
 *
 * @depends modules/auth/permissoes_v2_engine.gs (PermissoesV2Engine)
 */

// Lista exportada — usada pelo frontend para exibir todos os módulos na grade de permissões.
var _P2_MODULOS = [
  'agenda','estrategia','comunicacao','espacos',
  'reservas','contratos','financeiro','tarefas',
  'processos','almoxarifado','balcao','rh',
  'eficiencia','contratacoes','relatorios','escuta','pessoal',
  'acoes','reunioes'
];

function obterUsuariosSistema()                        { return PermissoesV2Engine.obterUsuarios(); }
function sincronizarUsuariosSistema()                  { return PermissoesV2Engine.sincronizarUsuarios(); }
function obterPermissoesUsuarioV2(email)               { return PermissoesV2Engine.obterPermissoes(email); }
function salvarPermissoesUsuarioV2(dados)              { return PermissoesV2Engine.salvarPermissoes(dados); }
function calcularPermissoesAutomaticas(origem, perfil) { return PermissoesV2Engine.calcularAutomaticas(origem, perfil); }
function calcularPermissoesFinais(email)               { return PermissoesV2Engine.calcularFinais(email); }
function listarPermissoesV2(emailFallback)             { return PermissoesV2Engine.listar(emailFallback); }
function obterAuditoriaPermissoes()                    { return PermissoesV2Engine.obterAuditoria(); }
function podeAcessarModulo(email, modulo)              { return PermissoesV2Engine.podeAcessar(email, modulo); }
function podeEditar(email, modulo)                     { return PermissoesV2Engine.podeEditar(email, modulo); }
function podeExcluir(email, modulo)                    { return PermissoesV2Engine.podeExcluir(email, modulo); }
