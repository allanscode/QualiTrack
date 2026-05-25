# AGENTS.md — Guia para Agentes de IA no QualiTrack

> Leia este documento **inteiro** antes de modificar qualquer arquivo do projeto.

---

## 1. Sobre o Projeto

**QualiTrack** é um sistema de gestão de qualidade para operações de suporte ao cliente. Permite que equipes de qualidade avaliem a performance de atendentes através de monitorias estruturadas, com fluxo de contestação, SLA automatizado e dashboards analíticos por perfil.

---

## 2. Tech Stack

| Camada | Tecnologia | Versão/Detalhes |
|--------|-----------|----------------|
| Framework | React | 19.x |
| Linguagem | TypeScript | 5.8.x (strict) |
| Build | Vite | 6.x |
| Estilo | TailwindCSS | **v4** (CSS-native, `@theme` blocks, sem `tailwind.config.js`) |
| Animações | Motion (Framer Motion) | `motion/react` |
| Gráficos | Recharts | 3.x (AreaChart, BarChart, PieChart) |
| Ícones | Lucide React | Única lib de ícones permitida |
| Notificações | Sonner | Toast notifications |
| Datas | date-fns | Formatação e localização ptBR |
| Backend | Supabase | Auth + PostgreSQL + Edge Functions (Deno) |
| Estado | React Context + useState | Sem Redux/Zustand |
| Roteamento | State-based (`activeTab`) | **Sem react-router-dom** |

---

## 3. Comandos Essenciais

```bash
npm run dev       # Servidor de desenvolvimento (localhost:3000)
npm run build     # Build de produção (Vite)
npm run lint      # Type checking (tsc --noEmit) — EXECUTE SEMPRE após editar código
npm run preview   # Preview do build de produção
npm run clean     # Limpa pasta dist/
```

**Sempre execute `npm run lint` após alterações para verificar erros de tipo.**

---

## 4. Estrutura de Diretórios

```
QualiTrack/
├── src/
│   ├── App.tsx                          # Componente raiz (auth, layout, sidebar, routing, tema)
│   ├── main.tsx                         # Entry point React DOM
│   ├── types.ts                         # Todos os tipos TypeScript do domínio
│   ├── index.css                        # Design system tokens + Tailwind v4 @theme
│   ├── lib/
│ │ ├── supabase.ts # Cliente Supabase + mockDb completo (localStorage)
│ │ ├── businessHours.ts # Cálculo de SLA em horas úteis
│ │ ├── contestation.ts # Funções unificadas de contestação (isApprovalAction/isRejectionAction)
│ │ └── useQualityConfig.tsx # Context Provider + hook de configuração de qualidade
│   └── components/
│       ├── MonitoriaList.tsx            # Listagem, filtros, transições de status
│       ├── MonitoriaForm.tsx            # Formulário 4 etapas, cálculo de score, reavaliação
│       ├── AdminPanel.tsx               # Container admin com tab routing
│       ├── QualityConfigManagement.tsx  # Editor de configuração de qualidade
│       ├── ui/                          # Componentes reutilizáveis (Card, Button, Badge, etc.)
│       ├── dashboard/
│       │   ├── DashboardMain.tsx        # Router de dashboard por role
│       │   ├── DashboardContext.tsx      # Estado central (filtros, dados, queries RBAC)
│       │   ├── FilterBar.tsx            # Barra de filtros global
│       │   ├── roles/                   # 5 dashboards específicos por perfil
│       │   └── widgets/                 # 8 widgets (StatCard, TrendChart, etc.)
│       └── admin/                       # Sub-componentes do AdminPanel
├── supabase/
│   ├── config.toml                      # Configuração do projeto Supabase
│ ├── calculate_sla_deadline.sql # Função SQL de cálculo de deadline SLA
│ ├── migrations/ # Migrations SQL versionadas (timestamp)
│ └── functions/ # Edge Functions (Deno)
│       ├── admin-invite-user/           # Convite de usuário (funcional)
│       ├── admin-create-user/           # PLACEHOLDER — não implementado
│ └── send-email/ # Envio de email via SMTP (env vars, sem hardcoded)
├── docs/ # Documentação completa (veja seção 11)
├── rls_monitorias.sql # RLS policies para a tabela monitorias
├── .env.example # Template de variáveis de ambiente
├── package.json
├── vite.config.ts                       # Vite + Tailwind v4 plugin + alias @/
└── tsconfig.json
```

---

## 5. Regras Fundamentais de Arquitetura

1. **Sem Backend Customizado**: Toda persistência é via Supabase. Lógica no frontend (React) ou Edge Functions (Deno). Não crie servidores Express, NestJS, etc.
2. **Sem Router Library**: Navegação baseada em state (`activeTab` em `App.tsx`). Não instale `react-router-dom` sem autorização explícita.
3. **Mock Mode Preservado**: Todo CRUD precisa suportar Mock Mode. Se adicionar query Supabase, adicione a persistência equivalente em `localStorage` via `mockDb` em `supabase.ts`.
4. **TailwindCSS v4**: Não use plugins do Tailwind v3 ou `tailwind.config.js`. Customização é via `@theme` em `src/index.css`.
5. **Componentização**: Não adicione código aos arquivos monolíticos (`App.tsx`, `MonitoriaList.tsx`, `MonitoriaForm.tsx`). Prioridade é **extrair componentes menores** antes de adicionar features.
6. **Hooks Incondicionais**: Todos os `useX` devem estar no topo do componente, nunca condicionais. Incidentes anteriores em `MonitoriaForm.tsx`.
7. **Constantes no Escopo do Módulo**: Constantes usadas em inicializadores de `useState` ou outros hooks devem ser declaradas **fora** do componente (escopo do módulo). Nunca declare `const` dentro do componente que seja referenciado antes de sua linha. Incidente: `MOCK_SESSION_KEY` usada em `useState` antes de ser declarada.
8. **Hooks nunca dentro de `useEffect`**: `useCallback`, `useMemo`, `useRef` etc. não podem ser chamados dentro de callbacks de `useEffect`. Use refs como ponte (ex: `extendSessionRef.current = fn` dentro do effect, `useCallback(() => ref.current())` fora). Incidente: `useCallback` dentro de `useEffect` de session management.

---

## 6. Padrões de UI/UX

### Design Tokens
Use **sempre** os tokens semânticos definidos em `index.css`. Nunca hardcode cores hexadecimais no JSX.

| Token | Uso |
|-------|-----|
| `bg-surface-card` | Fundo de cards |
| `bg-surface-bg` | Fundo da página |
| `bg-surface-subtle` | Fundo de áreas secundárias |
| `border-surface-border` | Bordas |
| `text-brand-primary` | Texto principal |
| `text-brand-muted` | Texto secundário |
| `text-brand-accent` | Texto de destaque |
| `bg-brand-accent` | Botões/badges de destaque |

### Assinaturas de Design
- **Labels**: `uppercase tracking-widest text-[10px] font-black`
- **Bordas**: `rounded-2xl` ou `rounded-3xl` (nunca bordas quadradas)
- **Sombras**: `shadow-premium` para cards flutuantes
- **Animações**: Use `motion` (Framer Motion) para transitions. Evite CSS bruto para montar/desmontar componentes.
- **Dark Mode**: Configurado via classe `.dark` no `<html>`. Teste sempre em ambos os modos.

### Ícones
Use **apenas** `lucide-react`. Nunca introduza outra lib de ícones.

---

## 7. RBAC — Perfis e Visibilidade

### 5 Roles

| Role (interno) | Label | Escopo |
|----------------|-------|--------|
| `admin` | Administrador | Acesso total, todos os dados |
| `gestor_qualidade` | Supervisor de Qualidade | Todas monitorias, config de qualidade |
| `qualidade` | Monitor de Qualidade | Apenas monitorias que criou |
| `gestor_suporte` | Supervisor de Atendimento | Monitorias das suas equipes |
| `suporte` | Agente de Atendimento | Apenas suas monitorias |

### Visibilidade de Dados (DashboardContext)

| Role | Monitorias Visíveis |
|------|-------------------|
| `suporte` | `evaluated_id = user.id` |
| `qualidade` | `evaluator_id = user.id` |
| `gestor_suporte` | Monitorias dos seus `team_ids` |
| `gestor_qualidade` | Todas |
| `admin` | Todas |

### Anonimização
Agentes (`suporte`) e gestores de suporte (`gestor_suporte`) veem nomes de avaliadores como "Analista da Qualidade".

### Filtros por Role (FilterBar)

| Filtro | suporte | qualidade | gestor_suporte | gestor_qualidade | admin |
|--------|---------|-----------|----------------|------------------|-------|
| Data | Sim | Sim | Sim | Sim | Sim |
| Equipe | Próprias | Sim | Próprias | Sim | Sim |
| Agente | Não | Sim | Próprias equipes | Sim | Sim |
| Auditor | Não | Não | Não | Sim | Sim |
| Status | Sim | Sim | Sim | Sim | Sim |

---

## 8. Lógica de Negócio Crítica

### Score
```
score = Σ(pontos_obtidos × peso_pilar) / Σ(pontos_possíveis × peso_pilar) × 100
```
- Critérios N/A são excluídos do cálculo
- **Erro crítico**: Qualquer erro crítico marcado → Score = 0%

### Máquina de Status (Monitorias)

```
pendente_revisao ──(aceitar)──→ concluida
pendente_revisao ──(contestar)──→ em_contestacao
em_contestacao ──(reavaliar)──→ pendente_revisao
em_contestacao ──(negar)──→ contestacao_negada
contestacao_negada ──(aceitar)──→ concluida
contestacao_negada ──(escalar)──→ aguardando_gestor_suporte
aguardando_gestor_suporte ──(aceitar)──→ concluida
aguardando_gestor_suporte ──(escalar)──→ aguardando_gestor_qualidade
aguardando_gestor_qualidade ──(finalizar)──→ concluida
[Qualquer status, SLA expirado] ──(cron auto)──→ concluida
```

### SLA
- Prazos calculados em **horas úteis** via `addBusinessHours()` em `businessHours.ts`
- Fins de semana e feriados não contam
- Vencimento do SLA → resolução automática via cron (`process_sla_timeouts()`)
- **Regra de SLA**: Qualidade perde prazo → nota vira 100%; Suporte perde prazo → nota mantida
- `recalculateActiveDeadlines()` é **pesada** — dispare apenas no save da config

### Contestação (History-based)
- Widgets escaneiam `history[]` por palavras-chave: "aceita"/"procedente"/"alterada" (aprovada) vs "negada"/"recusada"/"mantida"/"Improcedente" (rejeitada)
- Usa **última resolução** apenas para evitar contagem dupla

---

## 9. Mock Mode

Ativado automaticamente quando `VITE_SUPABASE_URL` está ausente ou contém "placeholder". CRUD completo via `localStorage` com prefixo `qualitrack_mock_`.

### Credenciais

| Email | Senha | Role | Observação |
|-------|-------|------|------------|
| qualidade@webposto.com.br | 123456 | admin (Administrador) | Padrão de produção — sempre válida |

> **Nota**: Usuários de outros perfis (qualidade, suporte, gestores) são reais ou de teste temporário e serão removidos quando o app for publicado. Não documente credenciais de usuários temporários.

### Sessão Mock

Mock mode persiste sessão em `localStorage` com chave `qualitrack_session` (`{userId, sessionStartedAt, sessionExpiresAt}`). Isso substitui o antigo `sessionStorage` `qualitrack_mock_user` — a sessão sobrevive a F5 e fechamento de aba.

---

## 9.5. Gerenciamento de Sessão (`App.tsx`)

O `App.tsx` implementa gerenciamento de sessão unificado com 4 mecanismos:

| Mecanismo | Constante | Valor | Descrição |
|-----------|-----------|-------|-----------|
| Idle timeout | `IDLE_TIMEOUT_MS` | 60 min | Sem atividade → logout automático |
| Idle warning | `IDLE_WARNING_MS` | 5 min | Modal com countdown 5 min antes do logout |
| Absolute timeout | `ABSOLUTE_TIMEOUT_MS` | 8 h | Sessão contínua máximo 8h → logout forçado |
| Proactive refresh | `SESSION_REFRESH_MS` | 50 min | `supabase.auth.refreshSession()` a cada 50min |

### Padrão Ref-Bridge para `extendSession`

`useCallback` **não pode** ser chamado dentro de `useEffect`. A solução é o padrão ref-bridge:

```
const extendSessionRef = useRef<() => void>(() => {});

useEffect(() => {
  // Dentro do effect: atualiza o ref
  extendSessionRef.current = () => { /* lógica real */ };
}, [deps]);

// Fora do effect: callback estável para JSX
const extendSession = useCallback(() => {
  extendSessionRef.current();
}, []);
```

### Estado de Sessão

| State/Ref | Tipo | Uso |
|-----------|------|-----|
| `showIdleWarning` | `boolean` | Controla visibilidade do modal de aviso |
| `idleCountdown` | `number` | Segundos restantes no countdown (M:SS) |
| `sessionStartTimeRef` | `Ref<number>` | Timestamp de início da sessão (8h limit) |
| `isCleaningSessionRef` | `Ref<boolean>` | Previne race condition em logout forçado |
| `extendSessionRef` | `Ref<fn>` | Ponte entre useEffect e useCallback |

### `handleLogout(options?)`

Aceita `{ silent?, message? }` para evitar que `MouseEvent` (de `onClick={handleLogout}`) seja passado como string para Sonner (crash). Após reset de senha: `handleLogout({ silent: true })` + toast contextual.

### Persistência de Sessão (F5)

- **Supabase**: SDK `persistSession: true` + `localStorage` — `INITIAL_SESSION` com session restaura login
- **Mock**: `localStorage` chave `qualitrack_session` — `{userId, sessionStartedAt, sessionExpiresAt}`
- **Last Activity**: `localStorage` chave `qualitrack_last_activity` — timestamp da última atividade do usuário. Ao restaurar sessão (F5), o sistema verifica se o idle já expirou comparando `Date.now() - lastActivity`. Se ≥ 60 min, sessão é descartada e usuário redirecionado ao login.

---

## 10. Variáveis de Ambiente

```bash
VITE_SUPABASE_URL # URL do projeto Supabase (ausente = Mock Mode)
VITE_SUPABASE_ANON_KEY # Chave anônima do Supabase
DISABLE_HMR # (opcional) "true" para desativar HMR
```

---

## 11. Documentação de Referência

| Caminho | Conteúdo |
|---------|----------|
| `docs/prd/master-prd.md` | PRD completo do produto |
| `docs/architecture/system-overview.md` | Visão geral da arquitetura |
| `docs/architecture/frontend.md` | Arquitetura do frontend |
| `docs/architecture/backend.md` | Arquitetura do backend |
| `docs/database/schema.md` | Schema do banco (7 tabelas) |
| `docs/specs/monitoria.md` | Spec de monitorias (status, score, SLA, form) |
| `docs/specs/dashboard.md` | Spec de dashboards (5 layouts, 8 widgets, RBAC) |
| `docs/specs/admin.md` | Spec do painel admin (5 tabs) |
| `docs/specs/quality-config.md` | Spec de configuração de qualidade |
| `docs/flows/authentication.md` | Fluxo de autenticação (login, recovery, invite) |
| `docs/flows/onboarding.md` | Fluxos de onboarding |
| `docs/decisions/adr-001.md` | Decisão: Firebase → Supabase |
| `docs/decisions/adr-002.md` | Decisão: Mock Mode |
| `docs/decisions/adr-003.md` | Decisão: SLA com horário comercial |
| `docs/agents/ai-context.md` | Regras detalhadas para agentes de IA |
| `docs/api/endpoints.md` | Contratos de API e queries Supabase |
| `docs/onboarding/dev-setup.md` | Guia de setup para desenvolvedores |
| `DASHBOARD_INDICATORS.md` | Dicionário de indicadores do dashboard |

---

## 12. Checklist de Segurança para Edição

Antes de commitar qualquer alteração, verifique:

- [ ] Não quebra o fluxo de SLA (`addBusinessHours`)?
- [ ] O componente funciona em Light **e** Dark mode?
- [ ] Se adicionou filtro no dashboard, aplicou em `DashboardContext.tsx` e não apenas localmente?
- [ ] Testou o fluxo com o Role correto? (Componente para `suporte` não pode exibir dados de outros agentes)
- [ ] Usou `lucide-react` para ícones?
- [ ] Adicionou suporte no `mockDb` se adicionou query Supabase?
- [ ] Hooks estão no topo do componente, incondicionais?
- [ ] Não hardcodou cores hexadecimais — usou tokens semânticos?
- [ ] Formatação de datas: Supabase armazena UTC, frontend renderiza horário local (-03:00)?

---

## 13. Débito Técnico e Pontos de Atenção

| Issue | Severidade | Status | Detalhes |
|-------|------------|--------|----------|
| Credenciais SMTP hardcoded no `send-email` Edge Function | **CRÍTICA** | ✅ Resolvido | Migrado para `Deno.env.get()` — secrets via `supabase secrets set` |
| API key Firebase exposta em `firebase-applet-config.json` | **ALTA** | ✅ Resolvido | Arquivos Firebase removidos; dependência `firebase` removida do `package.json`; key invalidada no Google Cloud Console |
| Sem RLS na tabela `monitorias` | **ALTA** | ✅ Resolvido | RLS implementada via `rls_monitorias.sql` (casts `auth.uid()::text` para compatibilidade TEXT/UUID) |
| Lógica do cron SLA diverge do frontend | **MÉDIA** | ✅ Documentado | Comentário esclarecedor adicionado; cron usa `deadline_at` (salvo por `recalculateActiveDeadlines()`) |
| Componentes monolíticos (App.tsx, MonitoriaList.tsx, MonitoriaForm.tsx) | **MÉDIA** | Pendente | Extrair componentes menores ANTES de adicionar features |
| Z-index/clipping com CustomSelect em containers scrolláveis | **MÉDIA** | ✅ Resolvido | CustomSelect reescrito com React Portal (`createPortal`) |
| Lógica de contestação duplicada em 5 dashboards | **MÉDIA** | ✅ Resolvido | Extraída para `src/lib/contestation.ts` — 4 dashboards atualizados |
| `admin-create-user` Edge Function é placeholder | **BAIXA** | ✅ Resolvido | Retorna 501 com TODO (referenciado em config.toml, não removido) |
| Migrations fora de `supabase/migrations/` | **BAIXA** | ✅ Resolvido | Copiadas para `supabase/migrations/` com timestamps |
| `index.html` título é "My Google AI Studio App" | **BAIXA** | ✅ Resolvido | Corrigido para "QualiTrack" |
| Dependências legadas no `package.json` | **BAIXA** | ✅ Resolvido | Removidos: `firebase`, `@google/genai`, `express`, `react-markdown`, `dotenv`, `autoprefixer`, `tsx`, `@types/express` |
| `MOCK_SESSION_KEY` usada antes da declaração | **ALTA** | ✅ Resolvido | Constantes de sessão movidas para escopo do módulo (antes do componente) |
| `useCallback` dentro de `useEffect` (session) | **ALTA** | ✅ Resolvido | Ref-bridge pattern: `extendSessionRef` atualizado no effect, `useCallback` fora chama `ref.current()` |
| Favicon 404 | **BAIXA** | ✅ Resolvido | Adicionado `public/favicon.svg` + `<link>` em `index.html` |

---

## 14. Workflow para Novas Features

1. Leia a **SPEC correspondente** em `/docs/specs/`
2. Identifique a **tabela afetada** em `/docs/database/schema.md`
3. Crie/atualize a interface em `src/types.ts`
4. Implemente o componente UI usando `src/components/ui/` quando possível
5. Se for dado persistente, adicione no `supabase.ts` (Supabase **e** mockDb)
6. Se adicionou filtros no dashboard, aplique em `DashboardContext.tsx`
7. Execute `npm run lint` para verificar tipos
8. Execute `npm run build` para validar compilação
9. Teste em Mock Mode e com Supabase (se disponível)
10. Teste em Light e Dark mode
11. Teste com o role correto (RBAC)

---

## 15. Convenções de Código

- **Idioma**: UI em português (BR). Código e comentários em português ou inglês.
- **Imports**: Use alias `@/` que mapeia para a raiz do projeto (configurado em `vite.config.ts`)
- **Componentes**: Functional components com hooks. Sem class components.
- **Estado**: React Context para estado global (dashboard), `useState`/`useReducer` para estado local.
- **Async**: `async/await` com `executeWithRetry()` para operações CRUD (15s timeout, até 2 retries).
- **CSS**: Tailwind v4 classes + tokens semânticos. Nunca CSS-in-JS ou styled-components.
- **Tipos**: Todos os tipos de domínio em `src/types.ts`. Não crie tipos inline.
- **Auto-save**: FormsManagement auto-salva drafts em `localStorage` com chave `qualitrack_form_draft`.
