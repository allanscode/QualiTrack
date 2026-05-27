# Fluxo: Onboarding de Usuários

## Métodos de Criação de Usuário

### 1. Convite Administrativo (Recomendado)

```mermaid
sequenceDiagram
    participant Admin
    participant Frontend
    participant EdgeFn as admin-invite-user
    participant Auth as Supabase Auth
    participant DB as public.users + user_teams

    Admin->>Frontend: Preenche nome, email, role, equipes
    Frontend->>EdgeFn: POST { email, name, role, team_ids }
    EdgeFn->>Auth: auth.admin.inviteUserByEmail()
    Auth-->>EdgeFn: user.id
    EdgeFn->>DB: INSERT users (SEM team_ids)
    EdgeFn->>DB: INSERT user_teams (N:N)
    EdgeFn-->>Frontend: { success: true }
    Auth-->>Admin: Email de convite
    Admin->>Frontend: Clica link → define senha
```

**Fluxo no Frontend (`UsersManagement.tsx`):**
1. Admin acessa AdminPanel → tab Usuários
2. Clica "Adicionar Usuário"
3. Preenche: Nome, Email, Perfil (select), Equipes (multi-select com checkboxes; busca condicional se > 8 equipes)
4. Frontend chama Edge Function `admin-invite-user` via `executeWithRetry`
5. Edge Function: cria no Auth + insere na `public.users` + sincroniza `user_teams`
6. Supabase envia email de convite com link
7. Novo usuário clica no link e define sua senha

**Importante**:
- `team_ids` NÃO é enviado no payload da tabela `users`
- Sincronizado via `syncUserTeams()` na Edge Function
- Fallback mock mode: insere diretamente no localStorage

### 2. Solicitação de Acesso (Self-Service)

```mermaid
flowchart TD
    A["Usuário acessa login"] --> B["Clica 'Solicitar Acesso'"]
    B --> C["Preenche: nome, email, justificativa"]
    C --> D["INSERT access_requests (status=pending)"]
    D --> E["Admin vê na tab Solicitações"]
    E --> F{"Admin decide"}
    F -->|"Aprova"| G["Define role + equipes"]
    G --> H["Cria usuário via Edge Function"]
    H --> I["syncUserTeams()"]
    I --> J["Envia email de boas-vindas"]
    F -->|"Rejeita"| K["Informa motivo"]
    K --> L["Envia email de rejeição"]
```

**Modelo:**
```typescript
interface AccessRequest {
  id: string;
  name: string;
  email: string;
  justification?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}
```

**Permissões para aprovar/rejeitar:** `admin`, `gestor_qualidade`, `gestor_suporte`

### 3. Script SQL (Setup Inicial)
- Migration inicial cria o admin padrão diretamente no banco
- Credenciais padrão: `qualidade@webposto.com.br` / `123456` (admin)
- Usado apenas no setup inicial do sistema
- Outros perfis são usuários reais ou temporários e serão removidos na publicação

## Fluxo de Definição de Senha (Convite/Recovery)

### Detecção de Hash
O `App.tsx` detecta o tipo de fluxo via hash da URL:

```typescript
const hash = window.location.hash;
if (hash.includes('type=recovery')) isPasswordRecoveryRef.current = true;
if (hash.includes('type=invite')) isInviteFlowRef.current = true;
```

### Fluxo de Recovery
1. Link de recuperação contém `#type=recovery&access_token=...`
2. App detecta via `isPasswordRecoveryRef` e mostra formulário de nova senha
3. Usuário define nova senha via `supabase.auth.updateUser({ password })`
4. App chama `handleLogout({ silent: true })` + toast contextual

### Fluxo de Convite
1. Link de convite contém `#type=invite`
2. App detecta via `isInviteFlowRef` e mostra formulário de definição de senha
3. Após definir senha, `handleLogout({ silent: true })` + toast

## Referências
- **Edge Function**: `supabase/functions/admin-invite-user/`
- **Componentes**: `UsersManagement.tsx`, `RequestsManagement.tsx`
- **Auth docs**: `docs/flows/authentication.md`
- **RBAC**: `AGENTS.md` seção 7
