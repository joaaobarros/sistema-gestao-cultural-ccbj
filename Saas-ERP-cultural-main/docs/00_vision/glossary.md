# Glossário Ontológico — SaaS ERP Cultural

## Objetivo

Este documento define os significados oficiais das entidades, conceitos e estruturas utilizadas pelo sistema.

Seu objetivo é:

- reduzir ambiguidades
- padronizar linguagem
- proteger coerência arquitetural
- alinhar operação, desenvolvimento e análise

Toda nova funcionalidade deve respeitar este glossário.

---

# 1. Ação

## Definição

Unidade central de execução do sistema.

Uma ação representa qualquer iniciativa executada pela organização que mobilize recursos, pessoas, tempo, espaços, processos ou entregas.

A ação funciona como núcleo integrador entre módulos.

---

## Exemplos

- curso
- oficina
- espetáculo
- evento
- campanha
- laboratório
- atividade territorial
- projeto formativo
- ação de difusão

---

## Uma ação pode possuir

- equipe
- cronograma
- tarefas
- contratos
- reservas
- comunicação
- indicadores
- relatórios
- recursos vinculados
- entregas

---

## Uma ação NÃO é

- apenas um evento
- apenas um projeto financeiro
- apenas um item de agenda

---

# 2. Pessoa

## Definição

Qualquer indivíduo que participe direta ou indiretamente do sistema.

---

## Exemplos

- trabalhador
- artista
- professor
- estudante
- gestor
- técnico
- colaborador externo
- participante
- público

---

## Uma pessoa pode possuir

- múltiplos vínculos
- múltiplos papéis
- permissões
- participação em ações
- responsabilidades
- histórico operacional

---

# 3. Vínculo

## Definição

Relação formal ou operacional entre uma pessoa e uma organização, ação ou processo.

---

## Exemplos

- contrato
- bolsa
- prestação de serviço
- voluntariado
- participação temporária
- vínculo institucional

---

# 4. Recurso

## Definição

Elemento necessário para viabilização de uma ação.

---

## Exemplos

- orçamento
- equipamento
- sala
- material
- veículo
- equipe técnica
- infraestrutura

---

# 5. Reserva

## Definição

Bloqueio formal de uso de um recurso em determinado período.

---

## Exemplos

- reserva de sala
- reserva de equipamento
- reserva de auditório

---

# 6. Tarefa

## Definição

Unidade operacional de execução dentro de um fluxo.

---

## Uma tarefa pode possuir

- responsável
- prazo
- prioridade
- status
- dependências
- evidências

---

# 7. Entrega

## Definição

Resultado verificável produzido por uma ação ou processo.

---

## Exemplos

- relatório
- atividade realizada
- produto cultural
- publicação
- registro
- prestação
- documentação

---

# 8. Evidência

## Definição

Registro utilizado para comprovação de execução, ocorrência ou entrega.

---

## Exemplos

- fotos
- vídeos
- listas de presença
- documentos
- links
- registros administrativos

---

# 9. Indicador

## Definição

Métrica utilizada para acompanhamento operacional, institucional ou estratégico.

---

## Um indicador pode medir

- execução
- impacto
- participação
- produtividade
- alcance
- desempenho
- custos
- satisfação

---

# 10. Processo

## Definição

Fluxo estruturado de atividades, regras e responsabilidades que organiza determinada operação institucional.

---

# 11. Workflow

## Definição

Representação operacional do fluxo de estados e transições de um processo.

---

# 12. Organização

## Definição

Entidade institucional que utiliza o sistema.

O sistema deve permitir múltiplas organizações sem dependência estrutural de contexto específico.

---

# 13. Módulo

## Definição

Conjunto funcional autônomo do sistema responsável por domínio específico.

---

## Um módulo deve possuir

- responsabilidade clara
- baixo acoplamento
- integração padronizada
- limites definidos

---

# 14. Evento do Sistema

## Definição

Ocorrência registrada pelo sistema que representa mudança de estado relevante.

---

## Exemplos

- ação criada
- tarefa concluída
- reserva aprovada
- contrato encerrado
- relatório enviado

---

# 15. Observabilidade

## Definição

Capacidade do sistema de permitir rastreamento, monitoramento e entendimento de seus fluxos internos.

---

# 16. Rastreabilidade

## Definição

Capacidade de identificar:

- origem
- transformação
- responsáveis
- histórico
- destino

de qualquer informação relevante do sistema.

---
