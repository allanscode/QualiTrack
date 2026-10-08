# SPEC: Módulo Admin

## Arquivo Principal
- `src/components/AdminPanel.tsx` (9 subabas)

## Sub-módulos (Tabs Internas)

| Tab | Key | Nome UI | Ícone | Componente |
|---|---|---|---|---|
| 1 | `users` | Usuários | `Users` | `UsersManagement` |
| 2 | `teams` | Equipes | `Shield` | `TeamsManagement` |
| 3 | `forms` | Formulários | `ClipboardList` | `FormsManagement` |
| 4 | `requests` | Solicitações | `UserPlus` | `RequestsManagement` |
| 5 | `operacao` | Operação | `Calendar` | `QualityConfigManagement` |
| 6 | `metas` | Metas | `Target` | `QualityConfigManagement` |
| 7 | `campos_extras` | Campos Extras | `Sliders` | `DissatisfactionFieldsManagement` |
| 8 | `ia_hub` | Inteligência Artificial | `Brain` | `AIHubManagement` |
| 9 | `emails` | E-mails & Disparos | `Mail` | `EmailConfigManagement` |

> Tab bar: pill buttons em `bg-surface-card` container com `rounded-2xl`. Conteúdo: `AnimatePresence mode="wait"` + `motion.div` (fade + y-slide, 0.2s).

## Gestão de Usuários (`UsersManagement.tsx`)

### Listagem
- Tabela com: Usuário (avatar + nome + email), Perfil (badge), Equipe (Único badge da Equipe Principal e contador `+X` para as demais equipes vinculadas com Popover de hover), Ações
- Filtros: status (ativo/inativo), role, equipe, busca por texto
- Ações por linha: Reativar, Reenviar Senha, Editar, Excluir (two-step confirmation)

### Criação (Convite) e Edição
- Modal com campos: Nome, Email, Perfil (select), Equipes (multi-select em lista com checkboxes; seletor de Equipe Principal via ícone de estrela `Star` ao lado de cada equipe selecionada; busca condicional se > 8 equipes)
- Ao salvar → chama Edge Function `admin-invite-user` via `executeWithRetry` (até 3 attempts, 15s timeout)
- Edge Function: cria no Auth + insere na `public.users` (contendo `primary_team_id`) + sincroniza `user_teams`
- Fallback (mock mode): insere diretamente no localStorage (incluindo `primary_team_id` no payload do usuário)
- **Importante**: `team_ids` NÃO é enviado no payload da tabela `users` — sincronizado via `syncUserTeams()`. No entanto, a equipe marcada como principal é persistida diretamente na tabela `users` sob a propriedade `primary_team_id`.

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
- O administrador confirma o destinatário em um modal com Turnstile antes do envio. `handleResetPassword` passa o `captchaToken` a `supabase.auth.resetPasswordForEmail()`, exigido pela configuração de Auth em produção. O modal mostra erros específicos para CAPTCHA, limite temporário e SMTP.

## Gestão de Equipes (`TeamsManagement.tsx`)

O modelo atual distingue equipes de pessoas e grupos de tickets do Zendesk. Veja [Equipes e grupos de tickets](equipes-e-grupos.md) para regras de vínculo, conversão de cadastros antigos e visibilidade de gestores.
O painel de Equipes possui abas internas **Equipes** e **Grupos do Zendesk**.

### Modelo
```typescript
interface Team {
  id: string;
  name: string;
  active: boolean;
  description?: string;
  sigla?: string;
  icon?: string;
  kind?: 'team' | 'group';
  zendesk_group_id?: number | null;
}
```
- CRUD de equipes reais; grupos sincronizados pelo ID do Zendesk
- Vínculo N:N entre equipes e grupos via `team_groups`
- Conversão segura de um cadastro antigo em grupo via `convert_team_to_group`
- Soft-delete (toggle `active`) apenas após remover pessoas e grupos vinculados

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

### Controles das avaliações automáticas

Na aba **Inteligência Artificial → Automações**, admin e gestor de qualidade podem
ligar ou desligar separadamente as filas Positivas e Chamados Filhos. Monitores de
qualidade podem consultar o estado, sem alterá-lo. O comando usa RPC autenticada
com checagem de papel ativo, compara o estado esperado para evitar sobrescrita entre
operadores e registra usuário e horário da alteração. As tabelas de configuração
continuam sem acesso direto pelo navegador. Ligar exige auditor ativo; no staging,
o limite total de avaliações não é zerado nem contornado. Desligar interrompe novos
jobs, preservando fila e avaliações já iniciadas. O MockDb mantém estado local.

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
