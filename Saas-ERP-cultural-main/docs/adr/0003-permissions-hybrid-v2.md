# ADR 0003 — Permissões Híbridas v2 (4 Camadas)

## Status

Aceito

---

## Contexto

O sistema original utilizava um modelo de permissões binário baseado em lista de administradores (`Administradores` na MASTER). Isso produzia:

- Ausência de granularidade por módulo
- Impossibilidade de dar acesso parcial a colaboradores externos
- Sem rastreabilidade de alterações de permissão
- Nenhuma separação entre papéis institucionais

---

## Decisão

Foi implementado um motor de permissões híbrido com 4 camadas de resolução em `mod_permissoes_v2.gs`:

1. **Perfil base** — 8 perfis pré-definidos com permissões padrão (`superadmin`, `admin`, `gestor`, `tecnico`, `rh`, `comunicacao`, `visitante_controlado`, `visitante`)
2. **Automáticas** — derivadas de atributos do usuário: cargo, função, setor, dono de espaço
3. **Manuais** — sobreposições explícitas por usuário (`null` = herda, `true` = garante, `false` = nega)
4. **Resultado final** — união das camadas com prioridade crescente

17 módulos com permissões nomeadas. Persistência em JSON via DataLayer.

Todas as alterações geram entrada de auditoria em `auditoria_permissoes.json`.

---

## Consequências

### Positivas

- Granularidade por módulo e por ação
- Compatibilidade retroativa: `obterPermissoesUsuario()` reescrita como wrapper v2
- Auditoria completa de alterações
- Usuários sem configuração recebem `visitante_controlado` automaticamente
- Multi-organização preparado: perfis não dependem de contexto CCBJ

### Riscos

- Usuário superadmin não pode ser removido por admin (proteção intencional)
- `getActiveUser()` em "Execute as: Me" pode retornar vazio — fallback necessário via `__EMAIL_INICIAL__`

---

## Implicações Arquiteturais

- `mod_permissoes_v2_js.html` é a única fonte de verdade no frontend
- `temPermissao(modulo, acao)` substitui verificações ad-hoc
- Backend valida novamente (não confia apenas no frontend)

---

## Data

2026-05

---
