# SPEC: Módulo Admin

## Arquivo Principal
- `src/components/AdminPanel.tsx` (222 linhas, 6 sub-tabs)

## Sub-módulos (Tabs Internas)

| Tab | Key | Nome UI | Ícone | Componente |
|---|---|---|---|---|
| 1 | `users` | Usuários | `Users` | `UsersManagement` |
| 2 | `teams` | Equipes | `Shield` | `TeamsManagement` |
| 3 | `forms` | Formulários | `ClipboardList` | `FormsManagement` |
| 4 | `requests` | Solicitações | `UserPlus` | `RequestsManagement` |
| 5 | `qualidade` | Configurações | `BarChart3` | `QualityConfigManagement` |
| 6 | `campos_extras` | Campos Extras | `Sliders` | `DissatisfactionFieldsManagement` |

> Tab bar: pill buttons em `bg-surface-card` container com `rounded-2xl`. Conteúdo: `AnimatePresence mode="wait"` + `motion.div` (fade + y-slide, 0.2s).

## Gestão de Usuários (`UsersManagement.tsx`)

### Listagem
- Tabela com: Usuário (avatar + nome + email), Perfil (badge), Equipe (nomes comma-separated), Ações
- Filtros: status (ativo/inativo), role, equipe, busca por texto
- Ações por linha: Reativar, Reenviar Senha, Editar, Excluir (two-step confirmation)

### Criação (Convite)
- Modal com campos: Nome, Email, Perfil (select), Equipes (multi-select com checkboxes; busca condicional se > 8 equipes)
- Ao salvar → chama Edge Function `admin-invite-user` via `executeWithRetry` (até 3 attempts, 15s timeout)
- Edge Function: cria no Auth + insere na `public.users` + sincroniza `user_teams`
- Fallback (mock mode): insere diretamente no localStorage
- **Importante**: `team_ids` NÃO é enviado no payload da tabela `users` — sincronizado via `syncUserTeams()`

### Edição
- Alterar nome, role, equipes
- Não permite alterar email
- Sincroniza equipes via `syncUserTeams()`

### `syncUserTeams(userId, teamIds)`
1. Busca `user_teams` existentes para o usuário
2. Computa `toAdd` (teamIds não existentes) e `toRemove` (existentes não em teamIds)
3. Deleta registros removidos da tabela `user_teams`
4. Insere novos registros como `{ user_id, team_id }`
5. Funciona em Supabase e mock mode

### Toggle de Status
- Soft-delete: `active: true/false`
- Reativação e desativação via `supabase.from('users').update()`

### Reset de Senha
- `handleResetPassword` chama `supabase.auth.resetPasswordForEmail()`

## Gestão de Equipes (`TeamsManagement.tsx`)

### Modelo
```typescript
interface Team {
  id: string;
  name: string;
  active: boolean;
  description?: string;
  sigla?: string;
  icon?: string;
}
```
- CRUD simples
- Soft-delete (toggle `active`)

## Editor de Formulários (`FormsManagement.tsx`)

### Modelo
```typescript
interface EvaluationForm {
  id: string;
  title: string;
  description: string;
  team_id: string;
  sections: FormSection[];
  critical_errors?: Question[];
  active: boolean;
  createdBy: string;
  created_at: string;
}

interface FormSection {
  id: string;
  title: string;     // Nome do pilar
  weight?: number;   // Peso (1-100)
  questions: Question[];
}

interface Question {
  id: string;
  text: string;
  description?: string;
  type: 'yes_no_na';
  is_critical?: boolean;
}
```

### Funcionalidades
- Adicionar/remover pilares (sections)
- Definir peso de cada pilar
- Adicionar/remover critérios dentro de cada pilar
- Adicionar/remover erros críticos por pilar
- Preview do formulário
- Validação: soma dos pesos não precisa ser 100 (são relativos)
- Auto-save de drafts em `localStorage` com chave `qualitrack_form_draft`

## Solicitações de Acesso (`RequestsManagement.tsx`)

### Fluxo
1. Usuário não cadastrado acessa a tela de login
2. Clica em "Solicitar Acesso"
3. Preenche: Nome, Email, Justificativa
4. Admin vê a solicitação na tab "Solicitações"
5. Admin pode **Aprovar** (define role e equipes) ou **Rejeitar** (com motivo)
6. Aprovação → cria usuário via Edge Function + envia email de boas-vindas
7. Rejeição → envia email com motivo

### Modelo
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

## Campos de Insatisfação (`DissatisfactionFieldsManagement.tsx`)

### Modelo
```typescript
interface DissatisfactionField {
  id: string;
  title: string;
  type: 'cliente' | 'qualidade';
  options: string[];
  active: boolean;
  created_at: string;
}
```
- CRUD de campos customizados
- Tipos: `cliente` (pesquisa de satisfação do cliente) e `qualidade` (avaliação interna)
- Tabela `dissatisfaction_answers` (JSONB) na monitoria armazena respostas

## Configurações de Qualidade
Redireciona para `QualityConfigManagement.tsx` (ver SPEC: Quality Config).

## Permissões

| Ação | Roles Permitidos |
|---|---|
| Ver Admin Panel | `admin` (Administrador) |
| Gerenciar usuários | `admin` (Administrador) |
| Gerenciar equipes | `admin` (Administrador) |
| Gerenciar formulários | `admin` (Administrador) |
| Aprovar solicitações | `admin`, `gestor_qualidade`, `gestor_suporte` |
| Config. qualidade | `admin`, `gestor_qualidade` |
| Campos de insatisfação | `admin`, `gestor_qualidade` |

## Data Loading (AdminPanel)

- **Mock mode**: `Promise.all` on 5 `mockDb.get()` calls
- **Supabase mode**: `executeWithRetry` com até 5 attempts, 15s timeout, exponential backoff; users/teams/forms/user_teams em paralelo, depois access_requests
- **User enrichment**: `teamIdsByUser` map construído de `user_teams`; cada user recebe `team_ids`
- **Failsafe**: 45s hard timeout on loading state
- **Reconnection listener**: `qualitrack:reconnected` custom event
- **Session recovery**: On first retry, attempts `supabase.auth.refreshSession()` se sessão ausente
