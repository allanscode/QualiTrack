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
supabase.from('monitorias').update({ status, score, history, action_deadline_at, updated_at })
  .eq('id', monitoriaId)

// Soft-delete
supabase.from('monitorias').update({ active: false }).eq('id', monitoriaId)
```

### Users
```typescript
supabase.from('users').select('*')
supabase.from('users').select('*').eq('email', email).single()
supabase.from('users').upsert({ id, email, name, role, team_ids, active })
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

**Response (success):**
```json
{ "success": true, "user": { "id": "uuid", "email": "..." } }
```

**Response (error):**
```json
{ "success": false, "error": "Error message", "details": {} }
```

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
```
