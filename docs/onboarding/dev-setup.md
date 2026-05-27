# Setup de Desenvolvimento

## Pré-requisitos
- Node.js 18+
- npm 9+
- (Opcional) Supabase CLI para Edge Functions
- (Opcional) Git + GitHub account para contribuir

## Instalação

```bash
# Clone o repositório
git clone <repo-url>
cd QualiTrack

# Instale dependências
npm install

# Inicie o dev server
npm run dev
```

O app estará disponível em `http://localhost:3000`.

## Variáveis de Ambiente

Crie um arquivo `.env` na raiz com:

```env
# Supabase (produção)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# (Opcional) Desabilitar HMR
DISABLE_HMR=true
```

### Mock Mode (sem Supabase)
Se as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` não estiverem configuradas (ou contiverem "placeholder"), o app entrará em **mock mode** automaticamente, usando localStorage com prefixo `qualitrack_mock_`.

**Credenciais mock:**

| Email | Senha | Role |
|---|---|---|
| qualidade@webposto.com.br | 123456 | admin (Administrador) |

> **Nota**: Usuários de outros perfis são reais ou de teste temporário e serão removidos quando o app for publicado. Não documente credenciais de usuários temporários.

## Scripts npm

| Comando | Descrição |
|---|---|
| `npm run dev` | Dev server com HMR (Vite) em localhost:3000 |
| `npm run build` | Build de produção |
| `npm run lint` | Type checking (`tsc --noEmit`) — **execute sempre após editar código** |
| `npm run preview` | Preview do build de produção |
| `npm run clean` | Limpa pasta dist/ |

## Estrutura do Projeto

```
QualiTrack/
├── src/
│   ├── App.tsx              # Componente raiz (auth, layout, sidebar, routing, tema, sessão)
│   ├── main.tsx             # Entry point React DOM
│   ├── types.ts             # Todos os tipos TypeScript do domínio
│   ├── index.css            # Design system tokens + Tailwind v4 @theme
│   ├── lib/
│   │   ├── supabase.ts      # Cliente Supabase + mockDb completo (localStorage)
│   │   ├── chartColors.ts   # Utilitário de cores de gráfico (lê CSS vars, theme-aware)
│   │   ├── businessHours.ts # Cálculo de prazos em horas úteis
│   │   ├── contestation.ts  # Funções de contestação (isApprovalAction/isRejectionAction)
│   │   └── useQualityConfig.tsx  # Context Provider singleton + hook de config
│   └── components/
│       ├── MonitoriaList.tsx         # Listagem, filtros, transições de status
│       ├── MonitoriaForm.tsx         # Formulário 4 etapas, score, reavaliação
│       ├── AdminPanel.tsx            # Container admin com 6 sub-tabs
│       ├── QualityConfigManagement.tsx  # Editor de config de qualidade
│       ├── ui/                       # Componentes reutilizáveis
│       ├── dashboard/                # Dashboard (context, filtros, 5 roles, 8 widgets)
│       └── admin/                    # Sub-componentes do AdminPanel
├── supabase/
│   ├── config.toml                   # Config do projeto Supabase
│   ├── migrations/                   # Migrations SQL versionadas (timestamp)
│   └── functions/                    # Edge Functions (Deno)
│       ├── admin-invite-user/        # Convite (funcional)
│       ├── admin-create-user/        # Placeholder — retorna 501
│       └── send-email/               # Envio de email via SMTP
├── docs/                             # Documentação completa
├── rls_monitorias.sql                # RLS policies para monitorias
├── .env.example                      # Template de variáveis
├── package.json
├── vite.config.ts                    # Vite + Tailwind v4 plugin + alias @/
└── tsconfig.json
```

## Convenções de Código

- **Idioma**: UI em português (BR). Código e comentários em português ou inglês
- **Imports**: Use alias `@/` que mapeia para a raiz do projeto
- **Componentes**: Functional components com hooks. Sem class components
- **Estado**: React Context para estado global, `useState` para estado local
- **CSS**: Tailwind v4 classes + tokens semânticos. Nunca CSS-in-JS ou styled-components
- **Ícones**: Apenas `lucide-react`. Tamanho padrão: `w-5 h-5`
- **Tipos**: Todos os tipos de domínio em `src/types.ts`. Não crie tipos inline
- **Hooks**: Sempre no topo do componente, nunca condicionais, nunca dentro de `useEffect`
- **Constantes**: Usadas em `useState` devem estar no escopo do módulo (fora do componente)
- **Cores**: Nunca hardcode hex. Use tokens semânticos (`bg-surface-card`, `text-brand-primary`, etc.)
- **Equipes**: Nunca envie `team_ids` no payload da tabela `users`. Use `syncUserTeams()`

## Deploy de Edge Functions

```bash
# Login no Supabase
npx supabase login

# Link ao projeto
npx supabase link --project-ref your-project-ref

# Deploy de functions
npx supabase functions deploy admin-invite-user
npx supabase functions deploy send-email
```

## Troubleshooting

### App mostra tela branca
- Verifique o console do browser (F12) para erros React
- Limpe localStorage (`qualitrack_mock_*`) se corrompido
- Verifique se `npm run lint` passa sem erros

### Edge Functions não funcionam
- Verifique se `SUPABASE_SERVICE_ROLE_KEY` está configurada no Supabase Dashboard
- Verifique logs: `npx supabase functions logs admin-invite-user`

### Tema escuro com cores erradas
- Verifique se `.dark` está sendo aplicado ao `<html>` element
- Cores de nível devem ser pastel no dark mode (ex: ruim = `#FCA5A5`)
- Tokens CSS custom properties estão em `src/index.css`

### Sessão expira inesperadamente
- Idle timeout: 60 min sem atividade → logout automático
- Absolute timeout: 8h contínuas → logout forçado
- Verifique `qualitrack_last_activity` no localStorage

### `StrictMode` em dev causa double execution
- React 19 StrictMode monta/desmonta componentes 2x em dev
- Não é bug — desaparece em produção

## Documentação de Referência

Ver `docs/README.md` para índice completo da documentação.
