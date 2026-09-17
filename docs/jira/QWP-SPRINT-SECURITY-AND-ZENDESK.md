# [QWP-142] Blindagem RLS de Monitorias, Adequação ao Supabase Free e Planejamento de Domínio Vercel

* **Projeto:** QualidadeWP (QWP)
* **Chave da Tarefa:** `QWP-142`
* **Tipo de Item:** `História Técnica / Tarefa de Infraestrutura`
* **Status:** `EM ANDAMENTO (In Progress)`
* **Prioridade:** `Alta`
* **Data de Início:** `17/09/2026`
* **Ambiente Alvo:** `Supabase (Free Tier) + Vercel (Hobby Tier) + Repositório QualidadeWP`

---

## 1. Descrição do Item

Esta tarefa engloba as definições de infraestrutura, fechamento de pendências de segurança identificadas no reporte técnico e preparação para a sprint de automação com o Zendesk:

1. **Adequação ao Plano Free do Supabase:**
   - Decisão de negócio de manter o plano Free atual sem migração imediata para o plano pago.
   - Aplicação das mitigações técnicas necessárias dentro das cotas gratuitas do Supabase (500 MB DB, 500k invocações Edge, SMTP customizado para contornar limite de 3 emails/hora).

2. **Reforço de RLS e Integridade de Monitorias:**
   - Criação da trigger de integridade `trg_monitoria_update_integrity` impedindo adulteração de notas, respostas e transições de status indevidas via chamadas diretas ao PostgREST.
   - Blindagem do anonimato do auditor para a role `suporte` através de view desacoplada `vw_monitorias_suporte`.

3. **Análise de Subdomínio e Proxy na Vercel:**
   - Mapeamento das regras de apontamento DNS na Vercel para o domínio corporativo `qwp-qualityautomacoes.com.br` (Punycode `xn--qualityautomaes-yza9c.com.br`).
   - Validação de que subdomínios próprios possuem SSL automático gratuito e operam perfeitamente no plano Hobby sem custos de proxy.

4. **Preparação para a Sprint de Automação Zendesk:**
   - Levantamento das alterações para capturar tags de organização no Zendesk e travar Ficha/Manual na interface do QWP.

---

## 2. Critérios de Aceite (Definition of Done)

- [x] **RLS / Integridade:** Atendentes (`suporte`) são bloqueados no banco caso tentem alterar notas (`score`), critérios (`answers`) ou desativar monitorias via API.
- [x] **Migração Segura:** O trigger de integridade permite que contas provisórias transfiram suas monitorias durante a formalização do cadastro (`handle_new_user`).
- [x] **Anonimato do Auditor:** Role `suporte` não tem acesso aos campos `evaluator_id` e `evaluator_name`.
- [x] **Testes Automatizados:** 105 testes no Vitest e 17 verificações de segurança no PostgreSQL executando com 100% de sucesso.
- [x] **Documentação de Domínio:** Guia claro de apontamento DNS e conversão Punycode para `qwp-qualityautomações.com.br` na Vercel.
- [ ] **Sprint Zendesk:** Extração de tags na Edge Function `helpdesk-queue` e travamento read-only de Ficha/Manual na UI (próximo passo).

---

## 3. Sub-Tarefas Técnicas

| Sub-tarefa | Responsável | Status |
|---|---|:---:|
| **QWP-142.1** Criar migration `20260917000001_monitorias_update_integrity_and_anonymity.sql` | Antigravity AI | Concluído |
| **QWP-142.2** Testar integridade no banco em memória PGlite e validar regressões | Antigravity AI | Concluído |
| **QWP-142.3** Mapear limitações do Supabase Free e Vercel Hobby para gestão | Antigravity AI | Concluído |
| **QWP-142.4** Implementar resolvedor de tags Zendesk na Edge Function `helpdesk-queue` | Antigravity AI | A Fazer |
| **QWP-142.5** Bloquear modal "Avaliar com IA" em modo Read-Only no QWP | Antigravity AI | A Fazer |
