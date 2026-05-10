# 📄 Análise de Arquivo — mod_permissoes_v2.gs

## 1. Identificação
- **Nome:** mod_permissoes_v2.gs
- **Caminho:** `/mod_permissoes_v2.gs`
- **Tipo:** Backend GAS — módulo de negócio
- **Camada:** backend/domínio
- **Módulo:** Permissões v2 — sistema híbrido com 4 camadas, 8 perfis, 17 módulos

---

## 2. Propósito
Sistema de permissões de segunda geração: substitui o modelo flat do v1 por hierarquia de 4 camadas (perfil_base → permissões automáticas por cargo/função/setor → permissões manuais → consolidação final). Mantém compatibilidade retroativa com v1 via wrapper `obterPermissoesUsuario`. Gerencia catálogo de usuários do sistema (`usuarios_sistema.json`) com sincronização multi-fonte.

---

## 3. Funções

### Constantes e perfis
| Constante | Descrição |
|-----------|-----------|
| `_P2_MODULOS` | 17 módulos do sistema |
| `_P2_SENSIVEIS` | Módulos protegidos de admin_tecnico/TI: `rh`, `contratacoes`, `financeiro` |
| `_P2_VC_MODS` | Módulos acessíveis a visitante_controlado: `agenda`, `estrategia`, `comunicacao`, `espacos` |
| `_P2_BASE` | 8 perfis com mapa {módulo → {visualizar, editar, excluir}} |

### Usuários do sistema
| Função | Descrição |
|--------|-----------|
| `obterUsuariosSistema()` | Lê `usuarios_sistema.json` |
| `sincronizarUsuariosSistema()` | Coleta emails de 3 fontes (LogAcessos, Administradores, Reservas); agrega nome, último acesso, origem, nível admin; persiste com lock |

### Permissões
| Função | Descrição |
|--------|-----------|
| `obterPermissoesUsuarioV2(email)` | Busca em `permissoes_v2.json`; se não encontrado, infere perfil a partir da aba Administradores; calcula auto + finais |
| `salvarPermissoesUsuarioV2(dados)` | Upsert com validação de hierarquia: admin não edita superadmin, superadmin não perde status próprio; log de auditoria |
| `calcularPermissoesAutomaticas(origem, perfil_base)` | Deriva permissões por: cargo, funções, setores, donos de espaço |
| `_p2consolidar(perfil_base, auto, manuais)` | 4 camadas: manual(+) > manual(-) > auto > perfil_base |
| `calcularPermissoesFinais(email)` | Recalcula finais sem cache |
| `listarPermissoesV2()` | Retorna `permissoes_v2.json` + `usuarios_sistema.json` (somente admin/superadmin) |

### Auditoria
| Função | Descrição |
|--------|-----------|
| `_p2registrarAuditoria(entrada)` | Prepend em `auditoria_permissoes.json`; trunca em 500 entradas |
| `obterAuditoriaPermissoes()` | Lê log de auditoria (somente admin/superadmin) |

### Compatibilidade v1
| Função | Descrição |
|--------|-----------|
| `obterPermissoesUsuario(email)` | Wrapper: chama v2 e traduz para formato `{perfil, modulos}` do v1 |
| `podeAcessarModulo(email, modulo)` | Reimplementado sobre v2 |
| `podeEditar(email, modulo)` | Reimplementado sobre v2 |
| `podeExcluir(email, modulo)` | Reimplementado sobre v2 |

---

## 4. Conexões
- **Quem chama:** Frontend via `GAS.permissoes.*`; qualquer módulo backend que chame `obterPermissoesUsuario`, `podeAcessarModulo`, `podeEditar`, `podeExcluir`
- **Quem é chamado:**
  - `DataLayer.gs`: `readJSON`, `writeJSON` para `permissoes_v2.json`, `usuarios_sistema.json`, `auditoria_permissoes.json`
  - `utils.js`: `_getSheet`, `obterEmailUsuario`
  - `mod_admin.gs`: `resolverNomePorEmail` (em `sincronizarUsuariosSistema`)

---

## 5. Funcionalidades
- **Motor automático por cargo:** cargos reconhecidos (`gestor`, `coordenador`, `diretor`, `tecnico`, `rh`, `comunicacao`, `admin_tecnico`) recebem grants automáticos; `admin_tecnico`/`ti` é explicitamente bloqueado de módulos sensíveis
- **Consolidação com explicação:** `_p2consolidar` retorna `{visualizar, editar, excluir, explicacao: [...]}` onde `explicacao` lista a origem de cada permissão — útil para debug de acesso
- **Hierarquia de segurança em `salvarPermissoesUsuarioV2`:** admin não pode editar superadmin; superadmin não pode remover status próprio; perfil inválido lança exceção
- **Sincronização multi-fonte:** `sincronizarUsuariosSistema` consolida emails de LogAcessos + Administradores + Reservas — usuários aparecem no catálogo após qualquer interação com o sistema
- **Retrocompatibilidade:** `obterPermissoesUsuario` (v1 API) é sobrescrita para usar v2 internamente, sem quebrar chamadores antigos

---

## 6. Possíveis Falhas

### 🔴 CRÍTICO
- **`_p2registrarAuditoria` sem lock:** read-then-write em `auditoria_permissoes.json` sem LockService — operações simultâneas de alteração de permissão podem silenciosamente descartar entradas de auditoria. Ironicamente, o log de auditoria é o ponto mais crítico para integridade do sistema de permissões.
- **`obterPermissoesUsuario` (wrapper v1) não captura caso onde `_permModulosPadrao` não existe:** o fallback do catch chama `_permModulosPadrao('visitante')` — se essa função não estiver definida no escopo GAS (vem de `mod_permissoes.gs`), o catch lança uma segunda exceção não tratada.

### 🟠 MÉDIO
- **`sincronizarUsuariosSistema` chama `resolverNomePorEmail` para cada email sem nome:** `resolverNomePorEmail` faz chamadas HTTP (AdminDirectory + People API); se sincronização for chamada com dezenas de usuários novos, pode atingir timeout de 6 minutos do GAS ou cota de chamadas externas.
- **`obterPermissoesUsuarioV2` recalcula `auto` e `finais` em cada chamada sem cache:** chamado em múltiplos pontos por requisição (verificação de acesso), executa leitura de `permissoes_v2.json` + leitura de aba Administradores + cálculo automático a cada vez.
- **`_P2_BASE` é um objeto JS mutável global:** em GAS, variáveis globais são recriadas por execução, mas se algum módulo alterar `_P2_BASE` durante execução, os perfis mudam globalmente — sem `Object.freeze`.

### 🟡 BAIXO
- **`sincronizarUsuariosSistema` lê a aba Reservas duas vezes:** uma no bloco de coleta de emails e outra no bloco de origens — mesma chamada `abaRes.getRange(...).getValues()` duplicada.
- **8 perfis em v2 vs 5 em v1:** `_PERFIS_PADRAO` do v1 tem perfis `superadmin`, `admin`, `gestor`, `tecnico`, `visitante`; v2 adiciona `rh`, `comunicacao`, `visitante_controlado`. O wrapper v1 mapeia `perfil_base` do v2 para `perfil` do v1 sem mapeamento para os novos perfis — clientes que usam `obterPermissoesUsuario().perfil` e comparam com strings fixas podem receber perfil desconhecido.

---

## 7. Qualidade do Código
**Positivos:**
- `_p2consolidar` com campo `explicacao` é excelente para debug de permissões
- Hierarquia de segurança em `salvarPermissoesUsuarioV2` é robusta e bem implementada
- Motor automático por cargo é extensível e bem estruturado
- Retrocompatibilidade com v1 via wrapper é arquiteturalmente correto

**Críticos:**
- Log de auditoria sem lock
- `resolverNomePorEmail` síncrono em loop na sincronização

---

## 8. Melhorias Sugeridas
- Adicionar `LockService` em `_p2registrarAuditoria`
- Limitar `resolverNomePorEmail` em `sincronizarUsuariosSistema` a N chamadas por execução ou usar batch lookup
- Adicionar `CacheService` em `obterPermissoesUsuarioV2` (TTL 60s)
- `Object.freeze(_P2_BASE)` para prevenir mutação acidental

---

## 9. Papel no Sistema
- **Fluxo de permissão:** `obterPermissoesUsuarioV2` → `permissoes_v2.json` (configurado) OU inferência por aba Administradores → `calcularPermissoesAutomaticas` → `_p2consolidar` → `permissoes_finais`
- **Fluxo de sincronização:** Admin chama `sincronizarUsuariosSistema` → varredura de 3 abas → `usuarios_sistema.json`
- **Criticidade:** 🔴 ALTO — toda verificação de acesso do sistema passa por este módulo; falha afeta segurança global

---

## 10. Tags
`#backend` `#permissoes` `#acesso` `#perfis` `#seguranca` `#auditoria` `#usuarios` `#drive-json`

---

## 11. Dependências
- **Depende de:** `DataLayer.gs`, `utils.js` (`_getSheet`, `obterEmailUsuario`), `mod_admin.gs` (`resolverNomePorEmail`), `mod_permissoes.gs` (`_permModulosPadrao` no fallback do wrapper)
- **É dependência para:** Todo o backend que verifica permissões; frontend do módulo de permissões

---

## 12. Relação com Problemas Existentes
- O wrapper v1 em `obterPermissoesUsuario` cria dependência circular potencial: `mod_permissoes.gs` continha a função original e `mod_permissoes_v2.gs` a sobrescreve. Se GAS carregar os módulos em ordem diferente, o comportamento pode mudar.
- A ausência de cache em `obterPermissoesUsuarioV2` agrava o problema de performance de `obterDadosIniciais` em `mod_admin.gs`, que já é lento.

---

## 13. Alinhamento com a Visão
**Alinhado:** 4 camadas de resolução de permissão, campo `explicacao` para debug, retrocompatibilidade com v1, hierarquia de segurança robusta em escrita
**Desalinhado:** log de auditoria sem lock, recalcula a cada chamada sem cache, `resolverNomePorEmail` em loop
