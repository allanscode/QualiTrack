# Schema e Entidades — Banco de Dados

## Visão Geral

O banco de dados é **PostgreSQL** gerenciado pelo **Supabase**. O schema utiliza `public` para tabelas de aplicação e `auth` para autenticação (gerenciado pelo Supabase). Total: **11 tabelas** no schema `public`.

## Diagrama ER

```mermaid
erDiagram
    USERS ||--o{ MONITORIAS : "evaluator_id"
    USERS ||--o{ MONITORIAS : "evaluated_id"
    TEAMS ||--o{ MONITORIAS : "team_id"
    FORMS ||--o{ MONITORIAS : "form_id"
    USERS }o--o{ TEAMS : "user_teams (N:N)"
    USERS ||--o| TEAMS : "primary_team_id"

    USERS {
        uuid id PK
        text email UK
        text name
        text role
        uuid primary_team_id FK
        boolean active
        boolean must_change_password
        timestamptz created_at
    }

    USER_TEAMS {
        uuid id PK
        uuid user_id FK
        uuid team_id FK
        timestamptz created_at
    }

    TEAMS {
        uuid id PK
        text name
        boolean active
        timestamptz created_at
    }

    FORMS {
        uuid id PK
        text name
        jsonb sections
        boolean active
        timestamptz created_at
    }

    MONITORIAS {
        uuid id PK
        text ticket_id
        uuid evaluator_id FK
        text evaluator_name
        uuid evaluated_id FK
        text evaluated_name
        uuid team_id FK
        uuid form_id FK
        text form_name
        text channel
        numeric score
        jsonb answers
        jsonb critical_errors
        text feedback
        text status
        jsonb history
        timestamptz action_deadline_at
        text resolution_type
        text contestation_result
        jsonb form_snapshot
        jsonb applied_config
        jsonb selected_critical_errors
        jsonb dissatisfaction_answers
        boolean active
        timestamptz created_at
        timestamptz updated_at
    }

    ACCESS_REQUESTS {
        uuid id PK
        text name
        text email
        text justification
        text status
        timestamptz created_at
    }

    QUALITY_CONFIGS {
        uuid id PK
        jsonb config
        timestamptz created_at
        timestamptz updated_at
    }

    DISSATISFACTION_FIELDS {
        uuid id PK
        text title
        text type
        jsonb options
        boolean active
        timestamptz created_at
    }

    BUSINESS_HOURS {
        uuid id PK
        text start_time
        text end_time
    }

  HOLIDAYS {
    uuid id PK
    text date
    text name
  }

  USER_PREFERENCES {
    uuid user_id PK FK
    jsonb preferences
    timestamptz updated_at
  }
```

## Tabelas Detalhadas

### `public.users`
| Coluna | Tipo | Default | Descrição |
|---|---|---|---|
| `id` | UUID | PK (= auth.users.id) | ID compartilhado com Supabase Auth |
| `email` | TEXT | UNIQUE | Email do usuário |
| `name` | TEXT | — | Nome completo |
| `role` | TEXT | — | `admin`, `gestor_qualidade`, `gestor_suporte`, `qualidade`, `suporte` |
| `primary_team_id` | UUID | FK → teams | ID da equipe principal do usuário (único badge renderizado por padrão) |
| `active` | BOOLEAN | `true` | Soft-delete |
| `must_change_password` | BOOLEAN | `false` | Flag para forçar troca de senha |
| `external_id` | TEXT | — | ID do agente na plataforma de origem (ex.: id do agente no Zendesk) |
| `source_system` | TEXT | — | Sistema de origem do vínculo (ex.: `'zendesk'`, `'manual'`) |
| `is_provisional` | BOOLEAN | `false` | `true` = conta criada automaticamente pela triagem, sem onboarding formal ainda |
| `created_at` | TIMESTAMPTZ | `now()` | Data de criação |

> **Contas provisórias** (migration `20260825000001` + `20260825000003`): quando a triagem (`helpdesk-queue`) encontra um e-mail de agente sem conta, cria uma linha aqui com `is_provisional: true`. Ao criar a conta formal com o mesmo e-mail, o trigger `handle_new_user()` migra `monitorias`/`user_teams`/`helpdesk_submissions` da provisória para a definitiva e apaga a provisória. Ver [`docs/flows/central-de-filas.md`](../flows/central-de-filas.md#identidade-universal-de-agentes).

> **Nota**: A coluna `team_ids` foi removida (migration M5). O relacionamento N:N entre usuários e equipes é feito via tabela `user_teams`. O frontend enriquece o objeto `User` com `team_ids: string[]` via `enrichUserWithTeamIds()`, mas **nunca** envia `team_ids` em payloads Supabase da tabela `users`. Use `syncUserTeams()` para sincronizar.
>
> **Cleanup (migration `20260617000006`)**: Colunas legadas `password`, `reset_token` e `team_id` (FK → teams) foram removidas por não serem usadas pelo app. A constraint `role` agora possui CHECK com os 5 roles válidos.
>
> **RLS**: Policies na tabela `users` usam helpers `SECURITY DEFINER` no schema `_private` (`_private.is_admin_user()`, `_private.is_quality_or_support_user()`, `_private.is_support_manager()`) para evitar recursão infinita (42P17) causada por inline subqueries contra `public.users`.

### `public.user_teams`
| Coluna | Tipo | Default | Descrição |
|---|---|---|---|
| `id` | UUID | PK | Identificador único do registro |
| `user_id` | UUID | FK → users | ID do usuário |
| `team_id` | UUID | FK → teams | ID da equipe |
| `created_at` | TIMESTAMPTZ | `now()` | Data de criação |

> Tabela N:N — um usuário pode pertencer a múltiplas equipes e uma equipe possui múltiplos usuários. PK composta `(user_id, team_id)`.

### `public.teams`
| Coluna | Tipo | Default | Descrição |
|---|---|---|---|
| `id` | UUID | PK, `gen_random_uuid()` | Identificador único |
| `name` | TEXT | — | Nome da equipe |
| `active` | BOOLEAN | `true` | Soft-delete |
| `created_at` | TIMESTAMPTZ | `now()` | Data de criação |

### `public.forms`
| Coluna | Tipo | Default | Descrição |
|---|---|---|---|
| `id` | UUID | PK | Identificador único |
| `name` | TEXT | — | Nome do formulário |
| `sections` | JSONB | — | Array de pilares com critérios e pesos |
| `active` | BOOLEAN | `true` | Soft-delete |
| `created_at` | TIMESTAMPTZ | `now()` | Data de criação |

### `public.monitorias`
| Coluna | Tipo | Default | Descrição |
|---|---|---|---|
| `id` | UUID | PK | Identificador único |
| `ticket_id` | TEXT | — | ID do ticket avaliado |
| `evaluator_id` | UUID | FK → users | Auditor que criou |
| `evaluator_name` | TEXT | — | Nome do auditor (denormalizado) |
| `evaluated_id` | UUID | FK → users | Agente avaliado |
| `evaluated_name` | TEXT | — | Nome do agente (denormalizado) |
| `team_id` | UUID | FK → teams | Equipe do agente |
| `form_id` | UUID | FK → forms | Formulário usado |
| `form_name` | TEXT | — | Nome do formulário (denormalizado) |
| `channel` | TEXT | — | Canal de atendimento |
| `score` | NUMERIC | — | Score final (0-100) |
| `answers` | JSONB | — | Respostas por critério |
| `critical_errors` | JSONB | `[]` | Erros críticos marcados |
| `feedback` | TEXT | — | Feedback textual |
| `status` | TEXT | — | Status atual (ver MonitoriaStatus) |
| `history` | JSONB | `[]` | Array de HistoryEntry |
| `action_deadline_at` | TIMESTAMPTZ | — | Prazo de ação atual |
| `resolution_type` | TEXT | — | `'human'` ou `'automatic'` (como foi concluída) |
| `contestation_result` | TEXT | — | `'approved'`, `'rejected'` ou `'pending'` |
| `form_snapshot` | JSONB | — | Snapshot do formulário no momento da avaliação |
| `applied_config` | JSONB | — | Config de qualidade aplicada no cálculo |
| `selected_critical_errors` | JSONB | — | IDs dos erros críticos selecionados |
| `dissatisfaction_answers` | JSONB | — | Respostas de campos de insatisfação |
| `active` | BOOLEAN | `true` | Soft-delete |
| `created_at` | TIMESTAMPTZ | `now()` | Data de criação |
| `updated_at` | TIMESTAMPTZ | `now()` | Última atualização |

### `public.access_requests`
| Coluna | Tipo | Default | Descrição |
|---|---|---|---|
| `id` | UUID | PK | Identificador único |
| `name` | TEXT | — | Nome do solicitante |
| `email` | TEXT | — | Email do solicitante |
| `justification` | TEXT | — | Motivo do pedido |
| `status` | TEXT | `'pending'` | `pending`, `approved`, `rejected` |
| `created_at` | TIMESTAMPTZ | `now()` | Data da solicitação |

### `public.quality_configs`
| Coluna | Tipo | Default | Descrição |
|---|---|---|---|
| `id` | UUID | PK, `gen_random_uuid()` | Identificador único |
| `config` | JSONB | — | Configuração completa (ver SPEC Quality Config) |
| `created_at` | TIMESTAMPTZ | `now()` | Data de criação |
| `updated_at` | TIMESTAMPTZ | `now()` | Última atualização |

### `public.dissatisfaction_fields`
| Coluna | Tipo | Default | Descrição |
|---|---|---|---|
| `id` | UUID | PK | Identificador único |
| `title` | TEXT | — | Título do campo |
| `type` | TEXT | — | `'cliente'` ou `'qualidade'` |
| `options` | JSONB | — | Array de opções de resposta |
| `active` | BOOLEAN | `true` | Soft-delete |
| `created_at` | TIMESTAMPTZ | `now()` | Data de criação |

### `public.business_hours`
| Coluna | Tipo | Default | Descrição |
|---|---|---|---|
| `id` | UUID | PK | Identificador único |
| `start_time` | TEXT | — | Hora início (ex: "08:00") |
| `end_time` | TEXT | — | Hora fim (ex: "18:00") |

### `public.holidays`
| Coluna | Tipo | Default | Descrição |
|---|---|---|---|
| `id` | UUID | PK | Identificador único |
| `date` | TEXT | — | Data do feriado (ex: "2026-01-01") |
| `name` | TEXT | — | Nome do feriado (ex: "Ano Novo") |

### `public.user_preferences`
| Coluna | Tipo | Default | Descrição |
|---|---|---|---|
| `user_id` | UUID | PK, FK → users | ID do usuário (1:1 com `users`) |
| `preferences` | JSONB | `'{}'` | Preferências de UI (theme, sidebar_color, avatar_url, etc.) |
| `updated_at` | TIMESTAMPTZ | `now()` | Última atualização |

> **Campo JSONB `preferences`** — estrutura esperada:
> - `theme`: `'light'` \| `'dark'` — tema de aparência do usuário (nunca `'system'`)
> - `sidebar_color`: string hex (ex: `'#475569'`) — cor do sidebar
> - `avatar_url`: string — URL do avatar (futuro)
>
> **Extensibilidade**: Novas preferências são adicionadas como chaves no JSONB sem necessidade de migration. O frontend usa `upsertUserPreferences()` para fazer merge parcial.
>
> **RLS**: Cada usuário só pode ler/escrever a própria linha (`user_id = auth.uid()`).
>
> **Fallback `user_metadata`**: Na primeira leitura, se `sidebar_color` não existir no JSONB mas existir em `auth.users.user_metadata.sidebar_color`, o sistema migra automaticamente para o banco.

### `public.ai_evaluation_guidelines`
| Coluna | Tipo | Default | Descrição |
|---|---|---|---|
| `id` | UUID | PK, `gen_random_uuid()` | Identificador único |
| `title` | TEXT | — | Título do manual |
| `content` | TEXT | `''` | Texto efetivamente enviado no prompt da IA (colado ou extraído de PDF/.txt/.md/.csv no navegador) |
| `file_name` / `file_path` | TEXT | — | Referência ao PDF original no bucket de storage `ai-guidelines` (opcional, só para download humano) |
| `active` | BOOLEAN | `true` | Soft-delete |
| `created_by` | UUID | FK → users | Quem cadastrou |
| `created_at` / `updated_at` | TIMESTAMPTZ | `now()` | — |

> **RLS**: leitura para admin/gestor_qualidade/qualidade/gestor_suporte (mesmo grupo que acessa a Central de Filas); escrita restrita a admin/gestor_qualidade.

### `public.ai_evaluation_drafts`
| Coluna | Tipo | Default | Descrição |
|---|---|---|---|
| `id` | UUID | PK, `gen_random_uuid()` | Identificador único |
| `ticket_id` | TEXT | UNIQUE | Um rascunho por ticket; reavaliação sobrescreve |
| `form_id` | UUID | FK → forms | — |
| `agent_name` / `agent_email` / `agent_id` / `team_id` / `channel` / `satisfaction_comment` | — | — | Snapshot dos dados do ticket no momento da avaliação |
| `result` | JSONB | — | `AIEvaluationResult` completo (score, summary, strengths, improvements, suggested_answers/observations/critical_errors) |
| `guideline_ids` | UUID[] | `'{}'` | Manuais usados nessa avaliação |
| `created_by` | UUID | FK → users | — |
| `created_at` / `updated_at` | TIMESTAMPTZ | `now()` | — |

> Apagado automaticamente quando o ticket vira monitoria de verdade. Ver [`docs/flows/central-de-filas.md`](../flows/central-de-filas.md#rascunho-de-avaliação-ai_evaluation_drafts).

## Campos Denormalizados

As seguintes colunas são **denormalizadas** (duplicam dados de outras tabelas) para performance:
- `monitorias.evaluator_name` — Duplica `users.name`
- `monitorias.evaluated_name` — Duplica `users.name`
- `monitorias.form_name` — Duplica `forms.name`

> Isso evita JOINs nas queries de listagem do dashboard.

## View Anônima: `vw_monitorias_suporte`

Criada na migration `20260617000001_anonymized_monitoria_view.sql`. Posteriormente alterada para `SECURITY INVOKER` em `20260617000002_fix_view_security_invoker.sql` para garantir que as RLS policies da tabela base `monitorias` sejam aplicadas (em vez de rodar com permissões do criador):

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

**Propósito**: Agentes (`suporte`) consultam esta view em vez de `monitorias` diretamente, escondendo `evaluator_name` e `evaluator_id` para garantir anonimato do auditor.

**Uso no frontend**: `useMonitoriaData.ts` e `DashboardContext.tsx` fazem query em `vw_monitorias_suporte` quando `role === 'suporte'`.

## SQL Files no Repositório

| Arquivo | Propósito |
|---|---|
| `auth_migration.sql` | Cria admin padrão no Auth + public.users |
| `create_quality_configs.sql` | Cria tabela quality_configs + RLS |
| `rls_monitorias.sql` | RLS policies para a tabela monitorias |
| `supabase/migrations/20260520000000_initial_schema.sql` | Schema inicial: 11 tabelas + seeds |
| `supabase/migrations/20260616000001_realtime_publication.sql` | Realtime publication (idempotente) |
| `supabase/migrations/20260617000001_anonymized_monitoria_view.sql` | View `vw_monitorias_suporte` (SECURITY DEFINER default) |
| `supabase/migrations/20260617000002_fix_view_security_invoker.sql` | `ALTER VIEW vw_monitorias_suporte SET (security_invoker = on)` |
| `supabase/migrations/20260617000003_fix_function_search_path.sql` | `SET search_path TO 'public'` em `process_action_deadline_timeouts()` e `calculate_action_deadline()` |
| `supabase/migrations/20260617000004_security_batch_fix.sql` | `SET search_path` em triggers, `access_requests` RLS com field validation |
| `supabase/migrations/20260617000005_fix_users_rls_recursion.sql` | `_private` schema com `is_admin_user()`, `is_quality_or_support_user()`, `is_support_manager()`; policies `users_select` e `users_admin_write` sem inline subqueries |
| `supabase/migrations/20260617000006_cleanup_users_table.sql` | Remove colunas legadas `password`, `reset_token`, `team_id` de `public.users`; adiciona CHECK constraint em `role` |
| `supabase/migrations/20260617000007_cleanup_orphan_tables_columns.sql` | Remove tabela órfã `critical_criteria` (nunca usada pelo app) |
| `supabase/migrations/20260617000008_drop_monitorias_satisfaction.sql` | Remove coluna `satisfaction` (solta) de `monitorias` — app usa `satisfaction_result`, `satisfaction_has_record`, `satisfaction_record_text` |

## RLS por Tabela

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|--------|--------|--------|--------|--------|
| `users` | Todos autenticados | Admin | Admin (via `is_admin_user()` SECURITY DEFINER) | Admin |
| `user_teams` | Todos autenticados | Admin, gestores | Admin | Admin |
| `teams` | Todos autenticados | Admin | Admin | Admin |
| `forms` | Todos autenticados | Admin, qualidade | Admin | Admin |
| `monitorias` | RBAC por role | Admin, gestor_qualidade, qualidade | RBAC por role | Admin |
| `quality_configs` | Todos autenticados | Admin, gestor_qualidade | Admin, gestor_qualidade | Admin, gestor_qualidade |
| `access_requests` | Admin, gestores | Anônimo (com field validation: name/email NOT NULL) | Admin, gestores | Admin |
| `dissatisfaction_fields` | Todos autenticados | Admin, gestor_qualidade | Admin, gestor_qualidade | Admin, gestor_qualidade |
| `user_preferences` | Próprio usuário (`user_id = auth.uid()`) | Próprio usuário | Próprio usuário | Próprio usuário |
