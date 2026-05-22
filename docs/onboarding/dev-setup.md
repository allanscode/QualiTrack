# Setup de Desenvolvimento

## Pré-requisitos
- Node.js 18+ 
- npm 9+
- (Opcional) Supabase CLI para Edge Functions

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
Se as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` não estiverem configuradas (ou contiverem "placeholder"), o app entrará em **mock mode** automaticamente, usando localStorage.

**Credenciais mock:**

| Email | Senha | Role |
|---|---|---|
| qualidade@webposto.com.br | 123456 | admin (Administrador) |

> **Nota**: Usuários de outros perfis são reais ou de teste temporário e serão removidos quando o app for publicado.

## Scripts npm

| Comando | Descrição |
|---|---|
| `npm run dev` | Dev server com HMR (Vite) |
| `npm run build` | Build de produção |
| `npm run lint` | Type checking (tsc --noEmit) |
| `npm run preview` | Preview do build de produção |

## Estrutura do Projeto

```
QualiTrack/
├── docs/                  # ← Esta documentação
├── public/                # Assets estáticos
├── src/
│   ├── App.tsx            # Entry point
│   ├── main.tsx           # React DOM render
│   ├── index.css          # Design tokens + CSS
│   ├── types.ts           # TypeScript types
│   ├── lib/               # Utilitários e hooks
│   └── components/        # Componentes React
├── supabase/
│ ├── config.toml # Config Edge Functions
│ ├── migrations/ # Migrations SQL versionadas
│ └── functions/ # Edge Functions (Deno)
├── rls_monitorias.sql # RLS policies para a tabela monitorias
├── .env                   # Variáveis de ambiente (gitignored)
├── .env.example           # Template de variáveis
├── package.json
├── vite.config.ts
└── tsconfig*.json
```

## Deploy de Edge Functions

```bash
# Login no Supabase
npx supabase login

# Link ao projeto
npx supabase link --project-ref your-project-ref

# Deploy de todas as functions
npx supabase functions deploy admin-invite-user
npx supabase functions deploy send-email
```

## Troubleshooting

### App mostra tela branca
- Verifique o console do browser (F12) para erros React
- Limpe localStorage (`qualitrack_mock_*`) se corrompido

### Edge Functions não funcionam
- Verifique se `SUPABASE_SERVICE_ROLE_KEY` está configurada no Supabase Dashboard
- Verifique logs: `npx supabase functions logs admin-invite-user`

### Tema escuro com cores erradas
- Verifique se `.dark` está sendo aplicado ao `<html>` element
- Os tokens CSS custom properties devem estar em `src/index.css`
