# Protocolo de Uso de Dados — Escuta Institucional CCBJ

**Versão:** 1.0 | **Data:** Maio/2026  
**Responsável:** Coordenação de RH + Responsável Técnico

---

## 1. Matriz de Acesso por Perfil

| Dado | Usuário | Gestor Setor | Gestor Geral | RH | Admin Técnico | Superadmin |
|------|---------|-------------|--------------|-----|---------------|------------|
| Próprias respostas | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Indicadores agregados (geral) | ❌ | ✅ (setor) | ✅ | ✅ | ❌ | ✅ |
| Indicadores estratificados | ❌ | ✅ (setor) | ✅ | ✅ | ❌ | ✅ |
| Dados de gênero/raça/orientação | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Dados de faixa salarial | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Escuta espontânea (agregada) | ❌ | ✅ (setor) | ✅ | ✅ | ❌ | ✅ |
| Escuta espontânea (individual) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌* |
| Alertas institucionais | ❌ | ✅ (setor) | ✅ | ✅ | ❌ | ✅ |
| Configuração do sistema | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Dados brutos (planilhas) | ❌ | ❌ | ❌ | ❌ | ✅** | ✅ |

**\*** Escuta espontânea anônima: identificação impossível. Não-anônima: acessível apenas em investigação formal com autorização documentada.

**\*\*** Acesso técnico às planilhas não implica permissão de análise de dados pessoais.

---

## 2. Separação Técnico × Analítico

**Princípio crítico:** `acesso técnico ≠ acesso analítico`

- O perfil **Admin Técnico** tem acesso aos sistemas e planilhas para manutenção
- O perfil **Admin Técnico NÃO tem acesso** às análises de dados pessoais ou sensíveis
- Acesso a dados de escuta para fins analíticos requer perfil **RH** ou **Gestor Geral**
- Esta separação deve ser auditada anualmente

---

## 3. Dados Sensíveis

Os seguintes dados são classificados como **sensíveis** e têm acesso restrito a perfil RH e Superadmin:

| Dado | Justificativa |
|------|---------------|
| Raça/Cor | Dado sensível — LGPD Art. 11 |
| Gênero | Dado sensível — LGPD Art. 11 |
| Orientação Sexual | Dado sensível — LGPD Art. 11 |
| Faixa Salarial | Confidencialidade remuneratória |
| Cruzamentos desses dados | Risco de reidentificação |

---

## 4. Uso Permitido dos Dados

### 4.1 Permitido

- ✅ Análise agregada de clima organizacional por período
- ✅ Identificação de padrões estruturais por setor ou nível
- ✅ Detecção de desigualdades entre grupos (mínimo 5 pessoas)
- ✅ Geração de alertas institucionais preventivos
- ✅ Relatórios periódicos de gestão
- ✅ Embasamento de decisões de políticas de pessoal
- ✅ Monitoramento de risco psicossocial (NR-1)
- ✅ Ciclo de feedback sobre ações tomadas

### 4.2 Proibido

- ❌ Identificação de respostas individuais de colaboradores
- ❌ Uso dos dados em processos disciplinares
- ❌ Uso em avaliação de desempenho individual
- ❌ Compartilhamento com terceiros sem autorização
- ❌ Cruzamento de dados para reidentificação de anônimos
- ❌ Uso para fins de vigilância ou controle
- ❌ Exibição de dados de grupos com menos de 5 pessoas
- ❌ Uso de escuta espontânea como canal de denúncia

---

## 5. Anonimização

### 5.1 Pulse Surveys

- Email do usuário é armazenado internamente para controle de saturação e fairness
- Email **nunca** aparece em análises ou dashboards
- Perguntas respondidas são referenciadas por hash único não-reversível
- Após 90 dias, considerar supressão do email mantendo apenas o hash

### 5.2 Escuta Espontânea

- Usuário escolhe anonimato no momento do registro
- Opção anônima: email não armazenado, apenas o hash
- Opção não-anônima: email armazenado, mas não exibido em análises
- Textos individuais não são exibidos em dashboards

### 5.3 Perfil Analítico

- Totalmente voluntário
- Armazenado vinculado ao email do usuário
- Usado apenas para análise estratificada agregada
- Direito de exclusão: usuário pode limpar o perfil a qualquer momento

---

## 6. Base Legal — LGPD

O tratamento de dados deste sistema se baseia em:

| Base | Artigo LGPD | Aplicação |
|------|-------------|-----------|
| Legítimo interesse | Art. 7º, IX | Pesquisas de clima organizacional |
| Execução de contrato | Art. 7º, V | Gestão de pessoas (NR-1) |
| Consentimento | Art. 7º, I | Perfil analítico (opcional) |

Para dados sensíveis (raça, gênero, orientação sexual):

| Base | Artigo LGPD | Aplicação |
|------|-------------|-----------|
| Consentimento específico | Art. 11, I | Perfil analítico voluntário |
| Tutela da saúde | Art. 11, II, f | Monitoramento NR-1 |

---

## 7. Direitos dos Titulares

Conforme LGPD, cada colaborador tem direito a:

| Direito | Como Exercer |
|---------|-------------|
| Acesso | Solicitar ao RH relatório das próprias respostas |
| Retificação | Atualizar perfil analítico pelo sistema |
| Exclusão | Solicitar ao RH exclusão do perfil e hash |
| Portabilidade | Solicitar exportação dos próprios dados |
| Informação | Este documento é público a todos os colaboradores |
| Revogação do consentimento | Limpar perfil analítico pelo sistema a qualquer momento |

---

## 8. Retenção e Exclusão

| Dado | Retenção | Critério |
|------|----------|---------|
| Respostas pulse (hash) | 24 meses | Revisão anual |
| Respostas pulse (email) | 90 dias | Depois: manter só hash |
| Escuta espontânea | 24 meses | Revisão anual |
| Perfil analítico | Enquanto colaborador ativo + 12 meses | Após desligamento |
| Alertas institucionais | 36 meses | Para rastreabilidade |
| Logs de auditoria | 60 meses | Conformidade legal |

---

## 9. Segurança e Auditoria

### 9.1 Segurança

- Dados armazenados em Google Sheets com acesso restrito por email do Google Workspace
- Acesso ao banco de dados requer autenticação institucional
- Log de auditoria registra todas as ações de leitura/escrita analítica

### 9.2 Auditoria

- Registro automático de: quem acessou, quando, qual dado
- Auditoria trimestral dos perfis de acesso
- Relatório anual para liderança e representação dos trabalhadores

### 9.3 Incidentes

Em caso de vazamento ou acesso não autorizado:
1. Isolar imediatamente o acesso comprometido
2. Notificar a ANPD em até 72h se houver risco relevante
3. Comunicar os titulares afetados
4. Documentar e investigar a causa

---

## 10. Governança

### 10.1 Responsabilidades

| Papel | Responsabilidade |
|-------|-----------------|
| DPO / Responsável Dados | Supervisão geral da conformidade LGPD |
| Coordenação de RH | Uso analítico dos dados |
| Responsável Técnico | Segurança e integridade do sistema |
| Liderança | Decisões baseadas nos dados |
| Colaboradores | Participação voluntária e perfil analítico |

### 10.2 Revisão deste Protocolo

- Revisão obrigatória: anual
- Revisão extraordinária: após incidente, mudança legal ou mudança de escopo do sistema
- Aprovação: Coordenação de RH + Responsável Técnico + representante dos colaboradores

---

## 11. Transparência

Este protocolo é disponibilizado a todos os colaboradores do CCBJ.  
Qualquer dúvida sobre o uso dos dados deve ser direcionada à Coordenação de RH ou ao Responsável pelo Tratamento de Dados (DPO).

**Perguntas frequentes estão disponíveis no manual de uso do sistema (manual_metodologico.md).**
