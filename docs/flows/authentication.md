# Fluxo: Autenticação

## Métodos Suportados
- Login com email/senha
- Recuperação de senha (email)
- Convite administrativo (email com link)
- Solicitação de acesso (self-service)

## Fluxo de Login

```mermaid
sequenceDiagram
    participant U as Usuário
    participant App as AuthProvider.tsx
    participant SB as Supabase Auth
    participant DB as Supabase DB

    U->>App: Email + Senha
    App->>SB: signInWithPassword()
    SB-->>App: Session + JWT
    App->>DB: SELECT * FROM users WHERE email=...
    App->>DB: SELECT * FROM user_teams WHERE user_id=...
    DB-->>App: User { id, role, ... } + team_ids
    App->>App: enrichUserWithTeamIds()
    App->>App: Renderiza MainApp (por role)
    App->>App: Salva sessão (localStorage mock ou Supabase persistSession)
```

## Fluxo de Recuperação de Senha

1. Usuário clica "Esqueci minha senha"
2. App chama `auth.resetPasswordForEmail(email, { redirectTo })`
3. Supabase envia email com link de recuperação
4. Link contém hash `#type=recovery&access_token=...`
5. **Antes do Supabase processar o hash**, o módulo `supabase.ts` captura `window.location.hash` em `initialUrlHash` e `window.location.search` em `initialUrlSearch` no nível do módulo (executado na importação, antes de qualquer React lifecycle)
6. `AuthProvider.tsx` lê `initialUrlHash` e `initialUrlSearch` para detectar recovery/invite **antes** que o `INITIAL_SESSION` event do Supabase possa sobrescrever o `authView`
7. App detecta hash via `isPasswordRecoveryRef` e mostra formulário de nova senha
8. Usuário define nova senha via `auth.updateUser({ password })`
9. App chama `handleLogout({ silent: true })` + toast contextual

### Fix: Race Condition INITIAL_SESSION vs Recovery Hash

**Problema original**: O evento `INITIAL_SESSION` do Supabase era processado antes do React detectar o hash de recovery, fazendo `setAuthView('login')` sobrescrever o estado `change-password`.

**Solução**:
1. `src/lib/supabase.ts` exporta `initialUrlHash` e `initialUrlSearch` — capturados no escopo do módulo (executado na importação do arquivo, antes de `createClient`)
2. `AuthProvider.tsx` usa `isPasswordRecoveryRef.current` como guarda: `if (!isPasswordRecoveryRef.current) setAuthView('login')`
3. Isso previne que `INITIAL_SESSION` resete a view de change-password

```typescript
// src/lib/supabase.ts
export const initialUrlHash = typeof window !== 'undefined' ? window.location.hash : '';
export const initialUrlSearch = typeof window !== 'undefined' ? window.location.search : '';

// src/providers/AuthProvider.tsx
if (session && !isPasswordRecoveryRef.current) {
  setAuthView('login');
}
```

## Fluxo de Convite (Admin)

1. Admin cria usuário no AdminPanel
2. Frontend chama Edge Function `admin-invite-user`
3. Edge Function:
   - `auth.admin.inviteUserByEmail()` → cria user no Auth
   - INSERT na `public.users` (SEM `team_ids`)
   - Sincroniza `user_teams` com os `team_ids` recebidos
4. Supabase envia email de convite com link
5. Link contém hash `#type=invite`
6. `initialUrlHash` captura o hash antes do Supabase processar
7. App detecta via `isInviteFlowRef` e mostra formulário de definição de senha
8. Após definir senha, `handleLogout({ silent: true })` + toast

## Fluxo de Solicitação de Acesso

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

## Gerenciamento de Sessão

### Mecanismos
| Mecanismo | Constante | Valor | Descrição |
|-----------|-----------|-------|-----------|
| Idle timeout | `IDLE_TIMEOUT_MS` | 60 min | Sem atividade → logout automático |
| Idle warning | `IDLE_WARNING_MS` | 5 min | Modal com countdown 5 min antes do logout |
| Absolute timeout | `ABSOLUTE_TIMEOUT_MS` | 8 h | Sessão contínua máximo 8h → logout forçado |
| Proactive refresh | `SESSION_REFRESH_MS` | 50 min | `supabase.auth.refreshSession()` a cada 50min |

### Persistência (F5)
- **Supabase**: `INITIAL_SESSION` com session restaura login
- **Mock**: `localStorage` chave `qualitrack_session` (`{userId, sessionStartedAt, sessionExpiresAt}`)
- **Last Activity**: `localStorage` chave `qualitrack_last_activity` — verifica expiração ao restaurar

### Resiliência
- Heartbeat ping ao Supabase a cada 2 min (único timer — heartbeat duplicado foi removido)
- Reconexão agressiva (5s polling) quando offline
- `visibilitychange`: verifica expiração ao focar aba
- Event listeners `online`/`offline`
- Evento customizado `qualitrack:reconnected`

### `handleLogout(options?)`
Aceita `{ silent?, message? }` para evitar que `MouseEvent` seja passado como string para Sonner (crash).

## Mock Mode (Desenvolvimento)

Quando Supabase não está configurado:
- Login compara email/senha diretamente no localStorage
- Usuário padrão: `qualidade@webposto.com.br` / `123456` (admin)
- Sessão persistida em `localStorage` (sobrevive a F5 e fechamento de aba)
- Outros perfis são usuários reais ou temporários e serão removidos na publicação
- **Produção**: `main.tsx` emite `console.error` se mock mode for detectado em produção

## Detecção de Hash (Recovery/Invite) — Atual

```typescript
// Em src/lib/supabase.ts (escopo do módulo, antes do createClient)
export const initialUrlHash = typeof window !== 'undefined' ? window.location.hash : '';
export const initialUrlSearch = typeof window !== 'undefined' ? window.location.search : '';

// Em AuthProvider.tsx useEffect
const hash = initialUrlHash || window.location.hash;
if (hash.includes('type=recovery')) {
  isPasswordRecoveryRef.current = true;
}
if (hash.includes('type=invite')) {
  isInviteFlowRef.current = true;
}
```
