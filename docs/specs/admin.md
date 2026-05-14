# SPEC: Módulo Admin

## Arquivo Principal
- `src/components/AdminPanel.tsx` (1192 linhas)

## Sub-módulos (Tabs Internas)

| Tab | Nome UI | Descrição |
|---|---|---|
| `users` | Usuários | CRUD de usuários com convite Supabase |
| `teams` | Equipes | CRUD de equipes/departamentos |
| `forms` | Formulários | Editor de formulários de avaliação |
| `requests` | Solicitações | Aprovação/rejeição de acessos |
| `qualidade` | Configurações | Redirect para QualityConfigManagement |

## Gestão de Usuários

### Listagem
- Tabela com: Nome, Email, Perfil (badge), Equipes, Status (ativo/inativo)
- Filtro por role e busca por texto
- Toggle de ativação/desativação

### Criação (Convite)
- Modal com campos: Nome, Email, Perfil (select), Equipes (multi-select)
- Ao salvar → chama Edge Function `admin-invite-user`
- Edge Function: cria no Auth + insere na `public.users`
- Fallback (mock mode): insere diretamente no localStorage

### Edição
- Alterar nome, role, equipes
- Não permite alterar email

## Gestão de Equipes

### Modelo
```typescript
interface Team {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
}
```
- CRUD simples
- Soft-delete (toggle `active`)

## Editor de Formulários

### Modelo
```typescript
interface EvaluationForm {
  id: string;
  name: string;
  sections: FormSection[];
  created_at: string;
  active: boolean;
}

interface FormSection {
  id: string;
  title: string;      // Nome do pilar
  weight: number;      // Peso (1-100)
  criteria: FormCriteria[];
  criticalErrors?: CriticalError[];
}

interface FormCriteria {
  id: string;
  text: string;        // Descrição do critério
}

interface CriticalError {
  id: string;
  text: string;        // Descrição do erro crítico
}
```

### Funcionalidades
- Adicionar/remover pilares (sections)
- Definir peso de cada pilar
- Adicionar/remover critérios dentro de cada pilar
- Adicionar/remover erros críticos por pilar
- Preview do formulário
- Validação: soma dos pesos não precisa ser 100 (são relativos)

## Solicitações de Acesso

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

## Permissões

| Ação | Roles Permitidos |
|---|---|
| Ver Admin Panel | `admin` |
| Gerenciar usuários | `admin` |
| Gerenciar equipes | `admin` |
| Gerenciar formulários | `admin` |
| Aprovar solicitações | `admin`, `gestor_qualidade`, `gestor_suporte` |
| Config. qualidade | `admin`, `gestor_qualidade` |
