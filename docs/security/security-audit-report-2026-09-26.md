# Relatório de Auditoria de Segurança de Código & Hardening Defensivo

**Data:** 26 de Setembro de 2026  
**Sistema:** QualiTrack — QA & Helpdesk Performance Suite  
**Escopo:** Módulos de Causa Raiz & ROI, Central de Notificações, Gamificação, Disparo de Relatório Executivo e Módulo de Feedbacks 1:1 (PDI).

---

## 1. Sumário Executivo

Uma auditoria aprofundada de segurança de código defensiva foi realizada sobre as novas implementações da plataforma, cobrindo vulnerabilidades de injeção, controle de acesso e autorização (BOLA / IDOR), vazamento de dados confidenciais (regra de anonimato do auditor), e estabilidade de cálculos numéricos.

Foram identificados **9 pontos de atenção preventiva** (3 de gravidade Alta, 4 de gravidade Média e 2 de gravidade Baixa). **100% dos pontos identificados foram corrigidos e validados com testes automatizados**, mantendo conformidade estrita com o `AGENTS.md` e os padrões de segurança do OWASP Top 10.

---

## 2. Vulnerabilidades Identificadas e Correções Aplicadas

### Item 1 — [ALTA] Violação do Anonimato de Auditor no `AgentDashboard.tsx`
* **Vulnerabilidade:** A lista `users` passada para o `FeedbacksWidget` continha nomes reais e e-mails de auditores e gestores de qualidade sem anonimização.
* **Impacto:** Quebrava a Regra 7 do `AGENTS.md`, permitindo que atendentes identificassem auditores de avaliações vinculadas.
* **Correção:** Substituição da lista bruta por `maskedUsers` em `AgentDashboard.tsx`, garantindo que qualquer auditor apareça mascarado como *"Análise da Qualidade"*.

### Item 2 — [ALTA] BOLA / IDOR e Falta de Autorização em `useFeedbacks.ts` e RLS
* **Vulnerabilidade:** Atendentes poderiam potencialmente alterar status para `'concluido'` ou alterar feedbacks de outros usuários; gestores poderiam adulterar assinaturas digitais do atendente.
* **Impacto:** Risco de auto-homologação indevida de metas de PDI e forja de ciência.
* **Correção:**
  1. No hook `useFeedbacks.ts`: Validação de titularidade (`currentUser.id === targetFeedback.agent_id`) em `acknowledgeFeedback`, e restrição de `completeFeedback` exclusivamente a papéis gestores/admin.
  2. No Supabase (`20260926000002_harden_feedbacks_security.sql`): Criação de trigger defensiva `check_agent_feedback_mutations` impedindo que atendentes alterem campos do gestor ou concluam o plano no nível de banco de dados.

### Item 3 — [ALTA] Falha de Cálculo no Relatório Executivo Individual (`ExecutiveReportModal.tsx`)
* **Vulnerabilidade:** O array `scores` de cada atendente não estava recebendo as notas das monitorias filtradas (`map[id].scores.push(m.score)` ausente).
* **Impacto:** A média individual de todos os atendentes no quadro de desempenho da equipe aparecia incorretamente como `0.0%`, falseando os relatórios enviados à diretoria.
* **Correção:** Inclusão de `if (typeof m.score === 'number' && !isNaN(m.score)) map[id].scores.push(m.score);` no laço de agregação.

### Item 4 — [MÉDIA] Prevenção de CRLF Injection & Regex de E-mail (`EmailReportModal.tsx`)
* **Vulnerabilidade:** O campo de assunto permitia quebras de linha (`\r`, `\n`) e o regex de e-mail era permissivo a caracteres de controle.
* **Impacto:** Risco de CRLF Header Injection caso integrado com transporte SMTP.
* **Correção:** Sanitização ativa com `subject.replace(/[\r\n]+/g, ' ').trim()`, regex RFC endurecido `/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/` e suporte seguro a múltiplos delimitadores.

### Item 5 — [MÉDIA] Vazamento de Notificações de SLA para o Papel 'suporte' (`App.tsx`)
* **Vulnerabilidade:** Alertas de SLA urgente (< 4 horas) não filtravam `evaluated_id` para o papel `'suporte'`.
* **Impacto:** Atendentes recebiam notificações de prazos expirando de chamados de outros colegas da mesma equipe.
* **Correção:** Inserção do filtro `if (userData?.role === 'suporte' && m.evaluated_id !== userData.id) return false;`.

### Item 6 — [MÉDIA] Escopo Hierárquico de Equipes em `CreateFeedbackModal.tsx`
* **Vulnerabilidade:** Gestores de suporte viam atendentes de todas as equipes no dropdown de criação de 1:1.
* **Impacto:** Risco de feedback registrado para colaborador fora de sua linha hierárquica.
* **Correção:** Filtragem automática de `supportAgents` vinculando apenas atendentes das equipes pertencentes ao `currentUser`.

### Item 7 — [MÉDIA] Fail-Open de Conquistas em `QualityAchievementsWidget.tsx`
* **Vulnerabilidade:** A cláusula `(!currentUser || m.evaluated_id === currentUser.id)` avaliava verdadeira quando `currentUser` estava nulo durante o carregamento inicial.
* **Impacto:** Cálculo de streaks e XP sobre a base corporativa global antes da autenticação ser resolvida.
* **Correção:** Adoção de `fail-closed` estrito: `if (!currentUser?.id) return [];`.

### Item 8 — [BAIXA] Isolamento de Notificações no LocalStorage (`App.tsx`)
* **Vulnerabilidade:** Chave única global `'qualitrack_read_notifications'` compartilhada entre diferentes contas no mesmo navegador.
* **Impacto:** Um usuário marcava como lida uma notificação crítica e ela sumia para o outro.
* **Correção:** Namespace automático: `qualitrack_read_notifications_${userData.id}`.

### Item 9 — [BAIXA] Proteção Contra Timestamps `NaN` (`rootCauseAnalysis.ts`)
* **Vulnerabilidade:** `new Date(m.created_at).getTime()` sem validação contra valores `NaN`.
* **Impacto:** Registros com datas corrompidas podiam distorcer o cálculo de ROI antes/depois.
* **Correção:** Validação prévia `if (isNaN(fbTime)) return;` e verificação em cada monitoria filtrada.

---

## 3. Matriz de Verificação & Testes

* **Typecheck (TypeScript estrito):** `npm.cmd run lint` $\rightarrow$ **0 erros**
* **Suíte de Testes Automatizados (Vitest):** `npm.cmd test -- --run` $\rightarrow$ **219 testes passando em 33 arquivos (100% sucesso)**
* **Novas Suítes Adicionadas:**
  - `src/test/rootCauseAnalysis.test.ts` (3 testes)
  - `src/test/securityAuditFixes.test.ts` (4 testes)
