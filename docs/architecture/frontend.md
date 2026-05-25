# Arquitetura Frontend

## Stack

| Tecnologia | Versão | Propósito |
|---|---|---|
| React | 19.x | UI Framework |
| TypeScript | ~5.8 | Tipagem estática |
| Vite | 6.x | Bundler + Dev Server |
| TailwindCSS | 4.x | Utility-first CSS |
| Motion | 12.x | Animações (Framer Motion) |
| Recharts | 3.x | Gráficos de dashboard |
| Lucide React | 0.546 | Ícones SVG |
| Sonner | 2.x | Toast notifications |
| date-fns | — | Formatação de datas (locale pt-BR) |
| clsx + tailwind-merge | — | Merge condicional de classes |

## Estrutura de Pastas

```
src/
├── App.tsx                    # Entry point: Auth + Layout + Tab Navigation
├── main.tsx                   # React DOM render
├── index.css                  # Design tokens + CSS global
├── types.ts                   # Tipos TypeScript globais
├── lib/
│ ├── supabase.ts # Cliente Supabase + MockDB (localStorage)
│ ├── useQualityConfig.tsx # Context Provider + hook de configuração de qualidade
│ ├── businessHours.ts # Utilitários de horário comercial/Prazo de Ação
│ └── contestation.ts # Funções unificadas de contestação
├── utils/                     # (Vazio — não utilizado atualmente)
└── components/
    ├── AdminPanel.tsx          # Painel administrativo (1192 linhas)
    ├── MonitoriaForm.tsx       # Formulário de monitoria multi-step (684 linhas)
    ├── MonitoriaList.tsx       # Lista de monitorias com ações (676 linhas)
    ├── QualityConfigManagement.tsx # Config de qualidade/Prazo de Ação (350 linhas)
    ├── ui/                    # Componentes UI reutilizáveis
    │   ├── Badge.tsx
    │   ├── Button.tsx
    │   ├── Card.tsx
    │   ├── CustomSelect.tsx    # Select dropdown customizado
    │   ├── Select.tsx          # Select nativo estilizado
│   └── ActionDeadlineClock.tsx # Relógio de prazo de ação com contagem regressiva
    └── dashboard/
        ├── DashboardMain.tsx   # Router de dashboard por role
        ├── DashboardContext.tsx # Context Provider com dados e filtros
        ├── FilterBar.tsx       # Barra de filtros global
        ├── roles/             # Dashboards específicos por perfil
        │   ├── AdminDashboard.tsx
        │   ├── AgentDashboard.tsx
        │   ├── QualityDashboard.tsx
        │   ├── QualityManagerDashboard.tsx
        │   └── SupportManagerDashboard.tsx
        └── widgets/           # Componentes de visualização reutilizáveis
            ├── ComparativeBarChart.tsx
            ├── DistributionChart.tsx
            ├── OfensoresChart.tsx
            ├── RankingWidget.tsx
            ├── RecentAuditsTable.tsx
            ├── ActionDeadlineWidget.tsx
            ├── StatCard.tsx
            └── TrendChart.tsx
```

## Gerenciamento de Estado

QualiTrack **não usa** nenhuma biblioteca de estado global (Redux, Zustand, etc). O estado é gerenciado em dois níveis:

### 1. Estado de Aplicação (`App.tsx`)
Estado raiz que controla:
- `currentUser` — Sessão Supabase Auth ativa
- `userData` — Dados do usuário da tabela `users`
- `activeTab` — Tab ativa (`dashboard` | `monitorias` | `admin`)
- `theme` — Tema (`'light'` | `'dark'` | `'system'`) — respeita preferência salva quando logado, segue o sistema quando deslogado
- `isFormOpen` — Modal de nova monitoria
- `authView` — View de autenticação (`login` | `request-access` | `pending` | `change-password` | `forgot-password` | `setup-password`)
- `showIdleWarning` — Modal de aviso de inatividade (5 min countdown)
- `idleCountdown` — Segundos restantes no countdown de inatividade

### 2. Estado do Dashboard (`DashboardContext.tsx`)
Context Provider que centraliza:
- `filters` — Filtros globais (data, equipe, agente, auditor, status, canal)
- `monitorias` — Lista filtrada de monitorias (pós-RBAC + filtros UI)
- `allMonitorias` — Lista completa pós-RBAC (antes de filtros UI)
- `users`, `teams`, `forms` — Dados de referência
- `globalAvg` — Média global de score
- `loading`, `refresh` — Controle de loading e refresh

### 2.5. Configuração de Qualidade (`QualityConfigProvider` — `useQualityConfig.tsx`)
Context Provider singleton que envolve `<MainApp>` em `App.tsx`:
- Faz **1 único fetch** a `quality_configs` (Supabase ou mockDb) no mount
- Fornece `config`, `oldConfig`, `saveConfig`, `getLevelForScore`, `isAboveTarget`, `recalculateActiveActionDeadlines`
- Consumido por 9+ componentes via `useQualityConfig()` hook (não há mais fetches independentes por componente)

### 3. Estado Local (Componentes)
Cada componente major (AdminPanel, MonitoriaForm, MonitoriaList) mantém seu próprio estado local via `useState`.

### 4. Gerenciamento de Sessão (`App.tsx`)

O `App.tsx` implementa um sistema unificado de gerenciamento de sessão com 4 mecanismos:

| Mecanismo | Constante (escopo do módulo) | Valor | Descrição |
|-----------|------------------------------|-------|-----------|
| Idle timeout | `IDLE_TIMEOUT_MS` | 60 min | Sem atividade → logout automático |
| Idle warning | `IDLE_WARNING_MS` | 5 min | Modal com countdown 5 min antes do logout |
| Absolute timeout | `ABSOLUTE_TIMEOUT_MS` | 8 h | Sessão contínua máximo 8h → logout forçado |
| Proactive refresh | `SESSION_REFRESH_MS` | 50 min | `supabase.auth.refreshSession()` a cada 50min |

**Constantes no escopo do módulo**: `IDLE_TIMEOUT_MS`, `IDLE_WARNING_MS`, `ABSOLUTE_TIMEOUT_MS`, `SESSION_REFRESH_MS` e `MOCK_SESSION_KEY` são declaradas **fora** do componente `App()` para estarem disponíveis em inicializadores de `useState`.

**Refs de sessão**:
- `sessionStartTimeRef` — Timestamp de início da sessão (8h limit)
- `isCleaningSessionRef` — Previne race condition em logout forçado
- `extendSessionRef` — Ponte entre `useEffect` e `useCallback` (ref-bridge pattern)

**Persistência de sessão (F5)**:
- **Supabase**: SDK `persistSession: true` + `localStorage` — evento `INITIAL_SESSION` com session restaura login
- **Mock**: `localStorage` chave `qualitrack_session` (`{userId, sessionStartedAt, sessionExpiresAt}`) — substitui antigo `sessionStorage`

**`handleLogout(options?)`**: Aceita `{ silent?, message? }` para evitar que `MouseEvent` (de `onClick={handleLogout}`) seja passado como string para Sonner.

## Navegação / Roteamento

**Não há router library** (React Router, etc). A navegação é controlada por:

```
App.tsx (activeTab state)
├── 'dashboard' → DashboardMain → DashboardRouter (switch por role)
├── 'monitorias' → MonitoriaList
└── 'admin' → AdminPanel (apenas para role='admin')
```

- Dentro de `AdminPanel`, sub-tabs: `users` | `teams` | `forms` | `requests` | `qualidade`
- Dentro de `DashboardMain`, roteamento automático por `user.role`

> **Consequência**: Não há URLs distintas, deep-linking ou browser history. Toda navegação reseta ao recarregar a página.

## Design System

### Tokens (CSS Custom Properties)

Definidos em `src/index.css`, com variantes light/dark:

| Token | Light | Dark | Uso |
|-------|-------|------|-----|
| `--brand-primary` | `#2D3A3A` | `#F9F9F6` | Texto principal |
| `--brand-accent` | `#8E9B7B` | `#8E9B7B` | Accent/CTA |
| `--brand-muted` | `#7A7D71` | `#A3A69A` | Texto secundário |
| `--surface-bg` | `#F9F9F6` | `#1A1C16` | Background geral |
| `--surface-card` | `#FFFFFF` | `#252820` | Background de cards |
| `--surface-border` | `#E2E4D8` | `#3D4136` | Bordas |

### Mapeamento de Perfis (`ROLE_LABELS`)
Os perfis de usuário (roles) são mapeados de IDs técnicos para nomes amigáveis em `src/types.ts`:
- `admin` ➔ **Administrador**
- `qualidade` ➔ **Monitor de Qualidade**
- `gestor_qualidade` ➔ **Supervisor de Qualidade**
- `gestor_suporte` ➔ **Supervisor de Atendimento**
- `suporte` ➔ **Agente de Atendimento**

### Padrões de Layout e Animação
- **Sidebar Dinâmica:** Largura variável (80px recolhida / 260px aberta) controlada por `motion.aside`.
- **Sincronização de Texto:** Rótulos dos menus e seção de perfil utilizam contêineres com `overflow-hidden` e transições de `max-width` sincronizadas em 300ms para evitar transbordo durante a animação.
- **Perfil do Usuário:** Seção de perfil (`profile-toggle-btn`) utiliza `layout` animation do Framer Motion para alternar entre `flex-row` (aberta) e `flex-col` (recolhida), permitindo que o botão de logout fique abaixo do ícone no modo compacto.
- **Quebra de Texto:** Nomes e cargos suportam `break-words` para evitar quebra de layout com nomes extensos.

### Cores Funcionais (fixas)

| Nome | Cor | Uso |
|------|-----|-----|
| success | `#10B981` | Ações positivas, aprovações |
| warning | `#F59E0B` | Alertas, pendências |
| error | `#EF4444` | Erros, rejeições, exclusões |
| info | `#6366F1` | Informações, status intermediários |

### Tipografia
- **Fonte**: Inter (Google Fonts) com fallback para system-ui
- **Pesos usados**: 400, 500, 600, 700, 800, 900

### Padrões UI Recorrentes
- **Cards**: `rounded-3xl` ou `rounded-[32px]` com `border border-surface-border shadow-premium`
- **Botões**: `rounded-2xl` com `font-black uppercase tracking-widest`
- **Inputs**: `rounded-2xl` com `bg-surface-subtle border border-surface-border`
- **Labels**: `text-[10px] font-black uppercase tracking-widest text-brand-muted`
- **Modais**: `fixed inset-0 bg-black/40 backdrop-blur-sm` com card central
- **Animações**: `motion/react` para enter/exit de componentes

## Componentes UI (`src/components/ui/`)

| Componente | Descrição |
|---|---|
| `Card` | Container com padding, borda e shadow |
| `Button` | Botão com variantes: primary, secondary, outline, ghost |
| `Badge` | Tag com variantes: success, error, warning, info, neutral |
| `Select` | `<select>` nativo estilizado |
| `CustomSelect` | Dropdown customizado com portal (evita clipping) |
| `ActionDeadlineClock` | Relógio de contagem regressiva de prazo de ação |

## Fluxo de Renderização

```mermaid
graph TD
    main["main.tsx<br/>createRoot().render()"]
    app["App.tsx<br/>Auth State Machine"]
    
    main --> app
    
    app -->|"!currentUser"| login["Login / Auth Views"]
    app -->|"currentUser"| mainApp["MainApp Component"]
    
    mainApp --> sidebar["Sidebar<br/>(role-colored)"]
    mainApp --> header["Header<br/>(greeting + date)"]
    mainApp --> content["Content Area"]
    
    content -->|"tab=dashboard"| dashMain["DashboardMain"]
    content -->|"tab=monitorias"| monList["MonitoriaList"]
    content -->|"tab=admin"| admin["AdminPanel"]
    
    dashMain --> provider["DashboardProvider<br/>(Context)"]
    provider --> filterBar["FilterBar"]
    provider --> router["DashboardRouter"]
    
    router -->|"suporte"| agentDash["AgentDashboard"]
    router -->|"qualidade"| qualDash["QualityDashboard"]
    router -->|"gestor_suporte"| supMgr["SupportManagerDashboard"]
    router -->|"gestor_qualidade"| qualMgr["QualityManagerDashboard"]
    router -->|"admin"| adminDash["AdminDashboard"]
```
