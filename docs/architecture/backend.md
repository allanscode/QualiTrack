# Arquitetura Backend

## Visão Geral

QualiTrack não possui servidor backend tradicional. Toda comunicação é feita diretamente do frontend para o **Supabase** (BaaS).

## Autenticação — Supabase Auth

- **Método**: Email + Senha (`signInWithPassword`)
- **Convite**: `auth.admin.inviteUserByEmail()` via Edge Function
- **Recovery**: `auth.resetPasswordForEmail()` com redirect
- **Mock Mode**: Quando Supabase não configurado, usa localStorage

### Tabelas Auth
- `auth.users` — Gerenciada pelo Supabase (email, senha, JWT)
- `public.users` — Customizada com role, team_ids, name, active
- **Vínculo**: Mesmo UUID entre as duas

## Edge Functions (Deno)

### 1. `admin-invite-user`
- **Auth**: JWT obrigatório + role check (admin, gestor_qualidade, gestor_suporte)
- **Fluxo**: Valida JWT → Verifica role → `inviteUserByEmail()` → INSERT `public.users`
- **Input**: `{ email, name, role, team_ids }`

### 2. `admin-create-user`
- **Status**: Placeholder (scaffold, não implementado)

### 3. `send-email`
- **SMTP**: Gmail (smtp.gmail.com:465, TLS)
- **Tipos**: `welcome`, `reset`, `rejection`
- ⚠️ Credenciais SMTP hardcoded

## Cron Job — SLA (`process_sla_timeouts()`)

Executada a cada 5 minutos (pg_cron):

| Posse Atual | Ação ao Vencer SLA |
|---|---|
| Qualidade (em_contestacao, etc.) | Score = 100%, status = concluida |
| Suporte (pendente_revisao, etc.) | Score mantido, status = concluida |

## Row Level Security (RLS)

### `quality_configs`
- SELECT: Todos autenticados
- INSERT/UPDATE/DELETE: Apenas admin e gestor_qualidade

> Demais policies foram criadas no painel Supabase e não estão versionadas.

## Alertas

- [ ] Policies RLS completas não versionadas
- [ ] Credenciais SMTP hardcoded em `send-email`
- [ ] `admin-create-user` não implementada
- [ ] Sem rate limiting, logging estruturado ou observabilidade
