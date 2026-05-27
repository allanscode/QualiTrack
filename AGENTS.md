# AGENTS.md — Guia para Agentes de IA no QualiTrack

> Leia este documento **inteiro** antes de modificar qualquer arquivo do projeto.

---

## 1. Sobre o Projeto

**QualiTrack** é um sistema de gestão de qualidade para operações de suporte ao cliente. Permite que equipes de qualidade avaliem a performance de atendentes através de monitorias estruturadas, com fluxo de contestação, prazo de ação automatizado e dashboards analíticos por perfil.

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
│   ├── App.tsx                      # Componente raiz (auth, layout, sidebar, routing, tema, sessão)
│   ├── main.tsx                     # Entry point React DOM
│   ├── types.ts                     # Todos os tipos TypeScript do domínio
│   ├── index.css                    # Design system tokens + Tailwind v4 @theme
│   ├── lib/
│   │   ├── supabase.ts              # Cliente Supabase + mockDb completo (localStorage)
│   │   ├── chartColors.ts           # Utilitário de cores de gráfico (lê CSS vars, theme-aware)
│   │   ├── businessHours.ts         # Cálculo de prazos de ação em horas úteis
│   │   ├── contestation.ts          # Funções unificadas de contestação (isApprovalAction/isRejectionAction)
│   │   └── useQualityConfig.tsx     # Context Provider singleton + hook de config de qualidade
│   └── components/
│       ├── MonitoriaList.tsx        # Listagem, filtros, transições de status
│       ├── MonitoriaForm.tsx        # Formulário 4 etapas, cálculo de score, reavaliação
│       ├── AdminPanel.tsx           # Container admin com 6 sub-tabs
│       ├── QualityConfigManagement.tsx  # Editor de configuração de qualidade
│       ├── ui/                      # Componentes reutilizáveis
│       │   ├── Card.tsx
│       │   ├── Button.tsx
│       │   ├── Badge.tsx
│       │   ├── CustomSelect.tsx     # Dropdown com portal + type-ahead
│       │   ├── Select.tsx           # Select nativo estilizado
│       │   └── ActionDeadlineClock.tsx  # Relógio de contagem regressiva de prazo
│       ├── dashboard/
│       │   ├── DashboardMain.tsx    # Router de dashboard por role
│       │   ├── DashboardContext.tsx # Estado central (filtros, dados, queries RBAC, presença)
│       │   ├── FilterBar.tsx        # Barra de filtros global
│       │   ├── roles/               # 5 dashboards específicos por perfil
│       │   └── widgets/             # 8 widgets (StatCard, TrendChart, etc.)
│       └── admin/                   # Sub-componentes do AdminPanel
│           ├── UsersManagement.tsx
│           ├── TeamsManagement.tsx
│           ├── FormsManagement.tsx
│           ├── RequestsManagement.tsx
│           └── DissatisfactionFieldsManagement.tsx
├── supabase/
│   ├── config.toml                  # Configuração do projeto Supabase
│   ├── migrations/                  # Migrations SQL versionadas (timestamp)
│   └── functions/                   # Edge Functions (Deno)
│       ├── admin-invite-user/       # Convite de usuário (funcional)
│       ├── admin-create-user/       # PLACEHOLDER — retorna 501
│       └── send-email/              # Envio de email via SMTP (env vars)
├── docs/                            # Documentação completa (veja seção 11)
├── rls_monitorias.sql               # RLS policies para a tabela monitorias
├── .env.example                     # Template de variáveis de ambiente
├── package.json
├── vite.config.ts                   # Vite + Tailwind v4 plugin + alias @/
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
9. **Seleção Agente↔Equipe nunca limpa automaticamente**: No `MonitoriaForm`, ao selecionar Agente ou Equipe, o outro campo NUNCA deve ser limpo automaticamente. Se o usuário tentar trocar um campo enquanto o outro está selecionado com valor incompatível, bloqueie com toast informativo. O usuário deve primeiro desselecionar (escolher placeholder) para depois alterar o relacionamento.
10. **Nunca enviar `team_ids` em payload da tabela `users`**: O relacionamento N:N usuário↔equipe é feito via tabela `user_teams`. O frontend enriquece o objeto `User` com `team_ids: string[]` via `enrichUserWithTeamIds()`, mas **nunca** envia `team_ids` em upsert/update Supabase da tabela `users`. Use `syncUserTeams()` para sincronizar.

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

### Cores Funcionais
| Token | Uso |
|-------|-----|
| `text-functional-success` / `bg-functional-success` | Ações positivas, aprovações |
| `text-functional-warning` / `bg-functional-warning` | Alertas, pendências |
| `text-functional-error` / `bg-functional-error` | Erros, rejeições, exclusões |

### Cores de Nível de Qualidade (Dark-mode pastel)
| Classe | Uso |
|--------|-----|
| `text-level-excelente` / `bg-level-excelente` | Faixa Excelente |
| `text-level-aceitavel` / `bg-level-aceitavel` | Faixa Aceitável |
| `text-level-atencao` / `bg-level-atencao` | Faixa Atenção |
| `text-level-ruim` / `bg-level-ruim` | Faixa Ruim |
| `text-level-roxo` / `bg-level-roxo` | Status aguardando gestor qualidade |

> No dark mode, as cores de nível são **pastel/soft** (ex: `#FCA5A5` para ruim em vez de vermelho saturado).

### Ícones do Dashboard — Categorias Semânticas
| Categoria | Ícone | Cor de Acento |
|-----------|-------|---------------|
| Score/Nota | `Target` | Derivada do nível (level-*) |
| Volume | `ClipboardCheck` | `text-brand-accent` |
| Pendência | `AlertTriangle` | `text-functional-error` ou `text-functional-warning` |
| Aprovação | `CheckCircle2` | `text-functional-success` |
| Rejeição | `XCircle` | `text-functional-error` |
| Tendência | `TrendingUp` | `text-functional-success` |
| Info/Contexto | `Users`, `History`, `ClipboardList` | `text-brand-muted` |

> **StatCard** e **RankingWidget**: a cor de fundo do ícone deriva do accent via `getIconBg()` — mapeia `text-*` → `bg-icon-*` automaticamente (nunca `bg-brand-*`, que usaria a mesma cor do texto).

### Assinaturas de Design
- **Labels**: `uppercase tracking-widest text-[10px] font-black`
- **Bordas**: `rounded-2xl` ou `rounded-3xl` (nunca bordas quadradas)
- **Sombras**: `shadow-premium` para cards flutuantes
- **Animações**: Use `motion` (Framer Motion) para transitions. Evite CSS bruto para montar/desmontar componentes.
- **Dark Mode**: Configurado via classe `.dark` no `<html>`. Teste sempre em ambos os modos.

### Ícones
Use **apenas** `lucide-react`. Nunca introduza outra lib de ícones. Tamanho padrão: `w-5 h-5`.

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
| `suporte` | `evaluated_id = user.id` OU `team_id IN (myTeamIds)` |
| `qualidade` | `evaluator_id = user.id` |
| `gestor_suporte` | `team_id IN (myTeamIds)` (fallback UUID impossível se sem equipes) |
| `gestor_qualidade` | Todas |
| `admin` | Todas |

### Anonimização
Agentes (`suporte`) e gestores de suporte (`gestor_suporte`) veem nomes de avaliadores como "Analise da Qualidade".

### Filtros por Role (FilterBar)

| Filtro | suporte | qualidade | gestor_suporte | gestor_qualidade | admin |
|--------|---------|-----------|----------------|------------------|-------|
| Data | Sim | Sim | Sim | Sim | Sim |
| Equipe | Próprias | Todas | Próprias | Todas | Todas |
| Agente | Não | Todas | Próprias equipes | Todas | Todas |
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
[Qualquer status, prazo expirado] ──(cron auto)──→ concluida
```

### Conclusão Automática (Prazo de Ação)
- Cron job `process_action_deadline_timeouts()` executa a cada 5 min via `pg_cron`
- Monitorias com `action_deadline_at < now()` e status ativo são finalizadas automaticamente
- **Qualidade perde prazo** → Score = 100%, status = `concluida`, `resolution_type = 'automatic'`
- **Suporte perde prazo** → Score mantido, status = `concluida`, `resolution_type = 'automatic'`
- Indicador visual: ícone `Clock` + label no `RecentAuditsTable` quando `resolution_type === 'automatic'`

### Prazo de Ação
- Prazos calculados em **horas úteis** via `addBusinessHours()` em `businessHours.ts`
- Fins de semana e feriados não contam
- Configurável via `useQualityConfig` (horas por etapa)
- `recalculateActiveDeadlines()` é **pesada** — dispare apenas no save da config

### Contestação (History-based)
- Widgets escaneiam `history[]` por palavras-chave: "aceita"/"procedente"/"alterada" (aprovada) vs "negada"/"recusada"/"mantida"/"Improcedente" (rejeitada)
- Usa **última resolução** apenas para evitar contagem dupla
- Lógica extraída para `src/lib/contestation.ts`

---

## 9. Mock Mode

Ativado automaticamente quando `VITE_SUPABASE_URL` está ausente ou contém "placeholder". CRUD completo via `localStorage` com prefixo `qualitrack_mock_`.

### Credenciais

| Email | Senha | Role | Observação |
|-------|-------|------|------------|
| qualidade@webposto.com.br | 123456 | admin (Administrador) | Padrão de produção — sempre válida |

> **Nota**: Usuários de outros perfis são reais ou de teste temporário e serão removidos quando o app for publicado. Não documente credenciais de usuários temporários.

### Sessão Mock
Mock mode persiste sessão em `localStorage` com chave `qualitrack_session` (`{userId, sessionStartedAt, sessionExpiresAt}`). A sessão sobrevive a F5 e fechamento de aba.

### Seed Data
- 2 equipes padrão: Alpha (`team-alpha`), Beta (`team-beta`)
- `user_teams` auto-seeded para usuários suporte/gestor_suporte no init
- Coleções mock: `monitorias`, `users`, `teams`, `forms`, `quality_configs`, `access_requests`, `user_teams`, `dissatisfaction_fields`, `business_hours`, `holidays`

---

## 10. Gerenciamento de Sessão (`App.tsx`)

O `App.tsx` implementa gerenciamento de sessão unificado com 4 mecanismos:

| Mecanismo | Constante | Valor | Descrição |
|-----------|-----------|-------|-----------|
| Idle timeout | `IDLE_TIMEOUT_MS` | 60 min | Sem atividade → logout automático |
| Idle warning | `IDLE_WARNING_MS` | 5 min | Modal com countdown 5 min antes do logout |
| Absolute timeout | `ABSOLUTE_TIMEOUT_MS` | 8 h | Sessão contínua máximo 8h → logout forçado |
| Proactive refresh | `SESSION_REFRESH_MS` | 50 min | `supabase.auth.refreshSession()` a cada 50min |

> Todas as constantes de sessão estão no **escopo do módulo** (fora do componente `App()`).

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
| `isPasswordRecoveryRef` | `Ref<boolean>` | Gates entre recovery e invite no change-password |
| `isInviteFlowRef` | `Ref<boolean>` | Detecta `type=invite` no hash para fluxo de convite |

### `handleLogout(options?)`

Aceita `{ silent?, message? }` para evitar que `MouseEvent` (de `onClick={handleLogout}`) seja passado como string para Sonner (crash). Após reset de senha: `handleLogout({ silent: true })` + toast contextual.

### Persistência de Sessão (F5)

- **Supabase**: SDK `persistSession: true` + `localStorage` — `INITIAL_SESSION` com session restaura login
- **Mock**: `localStorage` chave `qualitrack_session` — `{userId, sessionStartedAt, sessionExpiresAt}`
- **Last Activity**: `localStorage` chave `qualitrack_last_activity` — timestamp da última atividade do usuário. Ao restaurar sessão (F5), o sistema verifica se o idle já expirou comparando `Date.now() - lastActivity`. Se ≥ 60 min, sessão é descartada e usuário redirecionado ao login.
- **Tema/Aparência**: `localStorage` chave `qualitrack_theme` — valor `'light'` | `'dark'` | `'system'`. Restaurado incondicionalmente no `useState` initializer (sem depender de sessão). NÃO resetar tema no `useEffect` de `currentUser` — o estado transiente `currentUser = null` durante restauração de sessão causava reset prematuro para `'system'`.

### Resiliência de Sessão
- Heartbeat ping ao Supabase a cada 2 min
- Reconexão agressiva (5s polling) quando offline
- `visibilitychange`: ao focar aba, verifica expiração e dispara refresh
- Event listeners `online`/`offline`
- Evento customizado `qualitrack:reconnected` para reload de dados

### Presença Online
- **Local**: `localStorage` chave `qualitrack_active_sessions` — heartbeat 10s, timeout 25s
- **Supabase**: Presence channel `'online-presence'` com `track()` on subscribe
- Merge: local-first, remote overwrites; deduplicado por user ID

---

## 11. Variáveis de Ambiente

```bash
VITE_SUPABASE_URL          # URL do projeto Supabase (ausente = Mock Mode)
VITE_SUPABASE_ANON_KEY     # Chave anônima do Supabase
DISABLE_HMR                # (opcional) "true" para desativar HMR
```

---

## 12. Documentação de Referência

| Caminho | Conteúdo |
|---------|----------|
| `docs/prd/master-prd.md` | PRD completo do produto |
| `docs/architecture/system-overview.md` | Visão geral da arquitetura |
| `docs/architecture/frontend.md` | Arquitetura do frontend |
| `docs/architecture/backend.md` | Arquitetura do backend |
| `docs/database/schema.md` | Schema do banco (10 tabelas) |
| `docs/specs/monitoria.md` | Spec de monitorias (status, score, prazos, form) |
| `docs/specs/dashboard.md` | Spec de dashboards (5 layouts, 8 widgets, RBAC) |
| `docs/specs/admin.md` | Spec do painel admin (6 tabs) |
| `docs/specs/quality-config.md` | Spec de configuração de qualidade |
| `docs/flows/authentication.md` | Fluxo de autenticação (login, recovery, invite) |
| `docs/flows/monitoria.md` | Fluxo completo de monitoria |
| `docs/flows/action-deadline.md` | Fluxo de prazo de ação |
| `docs/flows/onboarding.md` | Fluxos de onboarding |
| `docs/decisions/adr-001.md` | Decisão: Firebase → Supabase |
| `docs/decisions/adr-002.md` | Decisão: Mock Mode |
| `docs/decisions/adr-003.md` | Decisão: Prazo de ação com horário comercial |
| `docs/agents/ai-context.md` | Regras detalhadas para agentes de IA |
| `docs/api/endpoints.md` | Contratos de API e queries Supabase |
| `docs/onboarding/dev-setup.md` | Guia de setup para desenvolvedores |
| `DASHBOARD_INDICATORS.md` | Dicionário de indicadores do dashboard |

---

## 13. Checklist de Segurança para Edição

Antes de commitar qualquer alteração, verifique:

- [ ] Não quebra o fluxo de prazo de ação (`addBusinessHours`)?
- [ ] O componente funciona em Light **e** Dark mode?
- [ ] Se adicionou filtro no dashboard, aplicou em `DashboardContext.tsx` e não apenas localmente?
- [ ] Testou o fluxo com o Role correto? (Componente para `suporte` não pode exibir dados de outros agentes)
- [ ] Usou `lucide-react` para ícones?
- [ ] Adicionou suporte no `mockDb` se adicionou query Supabase?
- [ ] Hooks estão no topo do componente, incondicionais?
- [ ] Não hardcodou cores hexadecimais — usou tokens semânticos?
- [ ] Formatação de datas: Supabase armazena UTC, frontend renderiza horário local (-03:00)?
- [ ] Não enviou `team_ids` em payload Supabase da tabela `users` — usou `syncUserTeams()`?

---

## 14. Débito Técnico e Pontos de Atenção

| Issue | Severidade | Status | Detalhes |
|-------|------------|--------|----------|
| Componentes monolíticos (App.tsx, MonitoriaList.tsx, MonitoriaForm.tsx) | **MÉDIA** | Pendente | Extrair componentes menores ANTES de adicionar features |
| Sem testes automatizados | **MÉDIA** | Pendente | Nenhum framework de teste configurado |
| Sem CI/CD | **MÉDIA** | Pendente | Nenhum pipeline configurado |
| Credenciais SMTP hardcoded no `send-email` | **CRÍTICA** | ✅ Resolvido | Migrado para `Deno.env.get()` |
| API key Firebase exposta | **ALTA** | ✅ Resolvido | Arquivos Firebase removidos; key invalidada |
| Sem RLS na tabela `monitorias` | **ALTA** | ✅ Resolvido | RLS via `rls_monitorias.sql` |
| `MOCK_SESSION_KEY` usada antes da declaração | **ALTA** | ✅ Resolvido | Constantes movidas para escopo do módulo |
| `useCallback` dentro de `useEffect` | **ALTA** | ✅ Resolvido | Ref-bridge pattern |
| Lógica de contestação duplicada | **MÉDIA** | ✅ Resolvido | Extraída para `src/lib/contestation.ts` |
| Z-index/clipping com CustomSelect | **MÉDIA** | ✅ Resolvido | React Portal + type-ahead |
| Agente↔Equipe limpa campos automaticamente | **MÉDIA** | ✅ Resolvido | Bloqueio com toast; nunca auto-limpa |
| `admin-create-user` Edge Function é placeholder | **BAIXA** | ✅ Resolvido | Retorna 501 |
| Migrations fora de `supabase/migrations/` | **BAIXA** | ✅ Resolvido | Copiadas com timestamps |
| Dependências legadas no `package.json` | **BAIXA** | ✅ Resolvido | Firebase, express, etc. removidos |
| Favicon 404 | **BAIXA** | ✅ Resolvido | `public/favicon.svg` + `<link>` em `index.html` |
| `index.html` título errado | **BAIXA** | ✅ Resolvido | Corrigido para "QualiTrack" |
| RLS infinite recursion (42P17) | **ALTA** | ✅ Resolvido | `SECURITY DEFINER` function `is_admin_user()` |
| RankingWidget badge invisível no dark | **MÉDIA** | ✅ Resolvido | `bg-brand-accent` substituído |
| Dark mode cores saturadas nos indicadores | **MÉDIA** | ✅ Resolvido | Sistema pastel com `.dark` overrides |
| Dashboard ícones sem padronização | **MÉDIA** | ✅ Resolvido | Categorias semânticas + `getIconBg()` |
| Ícones invisíveis (bg = text color) | **ALTA** | ✅ Resolvido | Classes `.bg-icon-*` separadas de `bg-brand-*` em `index.css` |
| Tema não persistia após F5 | **ALTA** | ✅ Resolvido | Removido `setTheme('system')` do useEffect de `currentUser` |
| Tooltip ComparativeBarChart sem contraste | **MÉDIA** | ✅ Resolvido | `color: var(--brand-on-primary)` + `itemStyle` com cor explícita |

---

## 15. Workflow para Novas Features

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

## 16. Convenções de Código

- **Idioma**: UI em português (BR). Código e comentários em português ou inglês.
- **Imports**: Use alias `@/` que mapeia para a raiz do projeto (configurado em `vite.config.ts`)
- **Componentes**: Functional components com hooks. Sem class components.
- **Estado**: React Context para estado global (dashboard, quality config), `useState`/`useReducer` para estado local.
- **Async**: `async/await` com `executeWithRetry()` para operações CRUD (15s timeout, até 2-5 retries com backoff exponencial).
- **CSS**: Tailwind v4 classes + tokens semânticos. Nunca CSS-in-JS ou styled-components.
- **Tipos**: Todos os tipos de domínio em `src/types.ts`. Não crie tipos inline.
- **Auto-save**: FormsManagement auto-salva drafts em `localStorage` com chave `qualitrack_form_draft`.
- **CustomSelect**: Usa `<div>` trigger com `<input>` inline para type-ahead; `createPortal` para dropdown; filtra opções por digitação (case-insensitive).
- **Gráficos**: Cores via `chartPalette()`/`chartColorArray()`/`chartColorMap()` de `chartColors.ts` — lê CSS vars em runtime, funciona em light e dark mode.
- **Ícones Dashboard**: Fundos de ícone usam classes `.bg-icon-*` (ex: `bg-icon-primary`, `bg-icon-accent`, `bg-icon-highlight`) — cores claras/pastel que contrastam com `text-brand-*`. NUNCA use `bg-brand-*` para fundo de ícone, pois estas classes usam as mesmas CSS vars de `text-brand-*` (ícone ficaria invisível).
- **Tooltips Recharts**: Usar `backgroundColor: 'var(--brand-primary)'` + `color: 'var(--brand-on-primary)'` — garante contraste em light e dark mode.
- **Git**: Branch por feature/fix; delete merged branches; PR via GitHub.

---

## 17. Tipo `Monitoria` — Campos Relevantes

```typescript
interface Monitoria {
  id: string;
  ticket_id: string;
  evaluator_id: string;
  evaluated_id: string;
  team_id?: string;
  form_id: string;
  channel: 'Chat' | 'Email' | 'Telefone' | 'WhatsApp';
  answers: Record<string, 'SIM' | 'NAO' | 'NA'>;
  score: number;
  status: MonitoriaStatus;
  action_deadline_at?: string;
  history: MonitoriaHistoryEntry[];
  resolution_type?: 'human' | 'automatic';     // Como foi concluída
  contestation_result?: 'approved' | 'rejected' | 'pending';
  form_snapshot?: EvaluationForm;               // Snapshot do formulário no momento da avaliação
  applied_config?: Record<string, unknown>;     // Config aplicada no cálculo
  selected_critical_errors?: string[];
  dissatisfaction_answers?: Record<string, string[]>;
  started_at?: string;
  finished_at?: string;
  concluded_at?: string;
  evaluator_name?: string;                      // Denormalizado
  evaluated_name?: string;                      // Denormalizado
  form_name?: string;                           // Denormalizado
  team_name?: string;                           // Denormalizado
  display_id?: number;
  active?: boolean;
  created_at: string;
  updated_at: string;
}
```
