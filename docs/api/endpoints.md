# API — Endpoints e Contratos

## Visão Geral

QualiTrack não possui API REST customizada. Toda comunicação é via:
1. **Supabase Client SDK** — CRUD direto nas tabelas PostgreSQL
2. **Edge Functions** — Operações privilegiadas (admin)

## Supabase Client (PostgREST)

### Monitorias
```typescript
// Listar
supabase.from('monitorias').select('*').order('created_at', { ascending: false })

// Criar
supabase.from('monitorias').insert({ ...monitoria })

// Atualizar
supabase.from('monitorias').update({
  status, score, history,
  action_deadline_at, updated_at,
  resolution_type, contestation_result
}).eq('id', monitoriaId)

// Soft-delete
supabase.from('monitorias').update({ active: false }).eq('id', monitoriaId)
```

### Users
```typescript
// Listar
supabase.from('users').select('*')

// Buscar por email
supabase.from('users').select('*').eq('email', email).single()

// Upsert (SEM team_ids!)
supabase.from('users').upsert({ id, email, name, role, active, must_change_password })
```

> **IMPORTANTE**: Nunca envie `team_ids` no payload da tabela `users`. Use `syncUserTeams()` para sincronizar via tabela `user_teams`.

### User Teams
```typescript
// Listar equipes de um usuário
supabase.from('user_teams').select('*').eq('user_id', userId)

// Inserir vínculo
supabase.from('user_teams').insert({ user_id, team_id })

// Deletar vínculo
supabase.from('user_teams').delete().eq('id', recordId)
```

### Teams
```typescript
supabase.from('teams').select('*')
supabase.from('teams').insert({ name, active: true })
supabase.from('teams').update({ name, active }).eq('id', teamId)
```

### Forms
```typescript
supabase.from('forms').select('*')
supabase.from('forms').upsert({ id, name, sections, active })
```

### Quality Configs
```typescript
supabase.from('quality_configs').select('*').order('updated_at', { ascending: false }).limit(1)
supabase.from('quality_configs').upsert({ id, config, updated_at })
```

### Access Requests
```typescript
supabase.from('access_requests').select('*').order('created_at', { ascending: false })
supabase.from('access_requests').insert({ name, email, justification, status: 'pending' })
supabase.from('access_requests').update({ status }).eq('id', requestId)
```

### Dissatisfaction Fields
```typescript
supabase.from('dissatisfaction_fields').select('*')
supabase.from('dissatisfaction_fields').insert({ title, type, options, active: true })
supabase.from('dissatisfaction_fields').update({ title, type, options, active }).eq('id', fieldId)
```

### Business Hours / Holidays
```typescript
supabase.from('business_hours').select('*')
supabase.from('holidays').select('*')
```

## Edge Functions

### POST `/functions/v1/admin-invite-user`

**Headers:**
```
Authorization: Bearer <jwt>
Content-Type: application/json
```

**Body:**
```json
{
  "email": "user@empresa.com",
  "name": "Nome Completo",
  "role": "suporte",
  "team_ids": ["uuid-1"]
}
```

**Fluxo interno:**
1. Valida JWT e verifica role (admin, gestor_qualidade, gestor_suporte)
2. `auth.admin.inviteUserByEmail()` → cria user no Auth
3. INSERT na `public.users` (SEM `team_ids`)
4. Sincroniza `user_teams` com os `team_ids` recebidos

**Response (success):**
```json
{ "success": true, "user": { "id": "uuid", "email": "..." } }
```

**Response (error):**
```json
{ "success": false, "error": "Error message", "details": {} }
```

### POST `/functions/v1/admin-create-user`

**Status**: Placeholder — retorna 501 com TODO.

### POST `/functions/v1/send-email`

**Body:**
```json
{
  "email": "dest@empresa.com",
  "type": "welcome|reset|rejection",
  "token": "auth-token-or-rejection-reason",
  "name": "Nome Usuário"
}
```

**Response:**
```json
{ "success": true, "message": "E-mail enviado com sucesso" }
```

**Credenciais**: Via env vars `SMTP_USERNAME` e `SMTP_PASSWORD`.

## Auth SDK

```typescript
// Login
supabase.auth.signInWithPassword({ email, password })

// Logout
supabase.auth.signOut()

// Reset password
supabase.auth.resetPasswordForEmail(email, { redirectTo })

// Update password
supabase.auth.updateUser({ password })

// Get current session
supabase.auth.getSession()

// Listen to auth changes
supabase.auth.onAuthStateChange(callback)

// Refresh session (proactive, every 50min)
supabase.auth.refreshSession()
```

## Utility Functions

### `enrichUserWithTeamIds(dbUser)`
Consulta `user_teams` e injeta `team_ids: string[]` no user object. Usado em:
- `App.tsx` (login, session restore, handleUserSession)
- `DashboardContext.tsx` (data loading)
- `AdminPanel.tsx` (data loading)

### `syncUserTeams(userId, teamIds)`
Diff-based sync da tabela `user_teams`. Usado em:
- `UsersManagement.tsx` (criação e edição de usuários)
- `RequestsManagement.tsx` (aprovação de solicitações)

### `executeWithRetry(fn, options?)`
Retry wrapper para operações CRUD:
- Timeout: 15s por attempt
- Max attempts: 2-5 (depende do contexto)
- Backoff: exponencial
- Toast notifications em falhas

### `addBusinessHours(startDate, hours, config)`
Cálculo de prazo de ação em horas úteis:
- Itera hora a hora
- Pula fins de semana, feriados, fora do horário comercial
- Retorna data/hora final do deadline
