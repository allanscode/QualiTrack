# Arquitetura Backend

## Visão Geral

QualiTrack não possui servidor backend tradicional. Toda comunicação é feita diretamente do frontend para o **Supabase** (BaaS). Operações privilegiadas são delegadas a Edge Functions (Deno).

## Autenticação — Supabase Auth

- **Método**: Email + Senha (`signInWithPassword`)
- **Convite**: `auth.admin.inviteUserByEmail()` via Edge Function
- **Recovery**: `auth.resetPasswordForEmail()` com redirect
- **Mock Mode**: Quando Supabase não configurado, usa localStorage

### Tabelas Auth
- `auth.users` — Gerenciada pelo Supabase (email, senha, JWT)
- `public.users` — Customizada com role, name, active, must_change_password
- **Vínculo**: Mesmo UUID entre as duas
- **Nota**: Coluna `team_ids` foi removida de `public.users` (migration M5). Relacionamento N:N via `user_teams`.

### Detecção de Hash
```typescript
// Em App.tsx useEffect
const hash = window.location.hash;
if (hash.includes('type=recovery')) { isPasswordRecoveryRef.current = true; }
if (hash.includes('type=invite')) { isInviteFlowRef.current = true; }
```

## Edge Functions (Deno)

### 1. `admin-invite-user`
- **Auth**: JWT obrigatório + role check (admin, gestor_qualidade, gestor_suporte)
- **Fluxo**: Valida JWT → Verifica role → `inviteUserByEmail()` → INSERT `public.users` → INSERT `user_teams` (sync)
- **Input**: `{ email, name, role, team_ids }`
- **Importante**: `team_ids` é sincronizado via `user_teams`, NÃO inserido na tabela `users`
- **Deploy**: `npx supabase functions deploy admin-invite-user`

### 2. `admin-create-user`
- **Status**: Placeholder (retorna 501 com TODO)

### 3. `send-email`
- **SMTP**: Gmail (smtp.gmail.com:465, TLS)
- **Tipos**: `welcome`, `reset`, `rejection`
- **Credenciais**: Via env vars (`Deno.env.get("SMTP_USERNAME")`, `Deno.env.get("SMTP_PASSWORD")`)
- **Deploy**: `npx supabase functions deploy send-email`

## Cron Job — Prazo de Ação (`process_action_deadline_timeouts()`)

Executada a cada 5 minutos (pg_cron):

| Posse Atual | Ação ao Vencer Prazo | resolution_type |
|---|---|---|
| Qualidade (em_contestacao, aguardando_gestor_qualidade, reavaliacao_solicitada) | Score = 100%, status = `concluida` | `'automatic'` |
| Suporte (pendente_revisao, aguardando_gestor_suporte, contestacao_negada) | Score mantido, status = `concluida` | `'automatic'` |

### Ativação do Cron
```sql
SELECT cron.schedule(
  'process-action-deadline',
  '*/5 * * * *',
  'SELECT process_action_deadline_timeouts();'
);
```

## Row Level Security (RLS)

### `users`
- SELECT: Todos autenticados
- INSERT/UPDATE/DELETE: Apenas admin
- **Nota**: Policy `users_admin_write` usa função `is_admin_user()` com `SECURITY DEFINER` para evitar recursão infinita (erro 42P17)

### `user_teams`
- SELECT: Todos autenticados
- INSERT: Admin, gestor_qualidade, gestor_suporte
- UPDATE/DELETE: Admin

### `quality_configs`
- SELECT: Todos autenticados
- INSERT/UPDATE/DELETE: Apenas admin e gestor_qualidade

### `dissatisfaction_fields`
- SELECT: Todos autenticados
- INSERT/UPDATE/DELETE: Apenas admin e gestor_qualidade

### `monitorias`
- Policies versionadas em `rls_monitorias.sql` e `supabase/migrations/`
- SELECT: RBAC por role (suporte=self+team, qualidade=self, gestor_suporte=teams, gestor_qualidade=all, admin=all)
- INSERT: Apenas admin, gestor_qualidade, qualidade
- UPDATE: Mesmas regras de SELECT
- DELETE: Apenas admin
- **Nota**: Casts `auth.uid()::text` necessários porque colunas são TEXT mas `auth.uid()` retorna UUID

### `access_requests`
- SELECT: Admin, gestor_qualidade, gestor_suporte
- INSERT: Anônimo (self-service signup)
- UPDATE: Admin, gestor_qualidade, gestor_suporte

## Funções SQL

### `_private.is_admin_user()` — SECURITY DEFINER (schema `_private`)
Retorna boolean se o usuário autenticado é admin ou gestor_qualidade. Movida do schema `public` para `_private` (migration `20260617000005_fix_users_rls_recursion.sql`) para não ser exposta via `/rest/v1/rpc/`. Necessária para evitar recursão infinita (42P17) nas policies RLS de `users`. Não modifique sem entender o padrão 42P17.

### `_private.is_quality_or_support_user()` — SECURITY DEFINER
Retorna boolean se o usuário é `qualidade` ou `gestor_suporte`. Usada na policy `users_select`.

### `_private.is_support_manager()` — SECURITY DEFINER
Retorna boolean se o usuário é `gestor_suporte`. Usada na policy `users_admin_write`.

### `process_action_deadline_timeouts()`
Busca monitorias com `action_deadline_at < now()` e status ativo, aplica regras de auto-finalização por posse.

## View Anônima: `vw_monitorias_suporte`

Criada na migration `20260617000001_anonymized_monitoria_view.sql`. Foi alterada para `SECURITY INVOKER` na migration `20260617000002_fix_view_security_invoker.sql` para que as RLS policies da tabela base `monitorias` sejam aplicadas nas consultas feitas por usuários `suporte`:

```sql
CREATE VIEW vw_monitorias_suporte AS
SELECT
  id, ticket_id, evaluated_id, evaluated_name, team_id,
  form_id, form_name, channel, score, answers, critical_errors,
  feedback, status, history, action_deadline_at, resolution_type,
  contestation_result, form_snapshot, applied_config,
  selected_critical_errors, dissatisfaction_answers, active,
  created_at, updated_at,
  NULL::text AS evaluator_name,
  NULL::uuid AS evaluator_id
FROM monitorias;
```

**Propósito**: Agentes (`suporte`) consultam esta view em vez da tabela `monitorias` diretamente, garantindo que `evaluator_name` e `evaluator_id` nunca vazem para o agente avaliado.

**Uso no frontend**:
- `useMonitoriaData.ts` — quando `role === 'suporte'`, faz query em `vw_monitorias_suporte`
- `DashboardContext.tsx` — mesma lógica

## Migrations

| Migration | Descrição |
|---|---|
| `20260520000000_initial_schema.sql` | Schema inicial: 11 tabelas base + seeds (business_hours, holidays 2026) |
| `20260616000001_realtime_publication.sql` | Publicação realtime para tabelas monitoradas (idempotente via `DO $$`) |
| `20260617000001_anonymized_monitoria_view.sql` | View `vw_monitorias_suporte` para auditoria anônima |
| `20260617000002_fix_view_security_invoker.sql` | `ALTER VIEW ... SET (security_invoker = on)` |
| `20260617000003_fix_function_search_path.sql` | `SET search_path TO 'public'` em `process_action_deadline_timeouts()` e `calculate_action_deadline()` |
| `20260617000004_security_batch_fix.sql` | `SET search_path` em triggers `update_updated_at` e `update_user_preferences_updated_at`; `access_requests` RLS INSERT com field validation |
| `20260617000005_fix_users_rls_recursion.sql` | Schema `_private` com helpers `SECURITY DEFINER`; policies `users_select` e `users_admin_write` sem inline subqueries |

## Alertas

- [ ] `admin-create-user` não implementada (retorna 501)
- [ ] Cron de prazo de ação não usa mesma lógica de horário comercial do frontend — compara `action_deadline_at < now()` diretamente
