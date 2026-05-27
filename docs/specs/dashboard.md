# SPEC: Dashboard

## Arquivos
- `src/components/dashboard/DashboardMain.tsx` — Router por role
- `src/components/dashboard/DashboardContext.tsx` — Context Provider (dados, filtros, RBAC, presença online, realtime)
- `src/components/dashboard/FilterBar.tsx` — Barra de filtros global
- `src/components/dashboard/roles/` — 5 dashboards role-specific
- `src/components/dashboard/widgets/` — 8 widgets reutilizáveis
- `src/lib/chartColors.ts` — Utilitário de cores (lê CSS vars, theme-aware)
- `src/lib/contestation.ts` — Funções de contestação (history-based)

## Arquitetura

```
DashboardMain
├── DashboardProvider (Context + Realtime)
│   ├── FilterBar
│   └── DashboardRouter
│       ├── AgentDashboard (suporte)
│       ├── QualityDashboard (qualidade)
│       ├── SupportManagerDashboard (gestor_suporte)
│       ├── QualityManagerDashboard (gestor_qualidade)
│       └── AdminDashboard (admin)
```

## DashboardContext

Centraliza dados e filtros para todos os dashboards.

### Dados Fornecidos
| Campo | Tipo | Descrição |
|---|---|---|
| `user` | `User` | Usuário logado (com `team_ids`) |
| `filters` | `DashboardFilters` | Filtros ativos |
| `setFilters` | `Dispatch` | Filter setter |
| `monitorias` | `Monitoria[]` | Lista filtrada (RBAC + filtros UI) |
| `allMonitorias` | `Monitoria[]` | Lista pós-RBAC (antes de filtros UI) |
| `users` | `User[]` | Todos os usuários ativos (com `team_ids`) |
| `teams` | `Team[]` | Todas as equipes |
| `forms` | `EvaluationForm[]` | Todos os formulários |
| `globalAvg` | `number` | Média global de score (date/status/channel filtered, NOT RBAC-scoped) |
| `loading` | `boolean` | Estado de carregamento |
| `refresh` | `() => void` | Trigger de reload |
| `onlineUsers` | `User[]` | Usuários online (merge local + Supabase Presence) |
| `dissatisfactionFields` | `DissatisfactionField[]` | Definições de campos de insatisfação |

### Filtros
```typescript
interface DashboardFilters {
  startDate: string;  // Default: 30 dias atrás
  endDate: string;    // Default: hoje
  teamId: string;
  agentId: string;
  auditorId: string;
  formId: string;
  status: string;
  channel: string;
}
```

### RBAC nos Dados
| Role | Visibilidade |
|---|---|
| `suporte` | `evaluated_id = user.id` OU `team_id IN (myTeamIds)` |
| `qualidade` | `evaluator_id = user.id` |
| `gestor_suporte` | `team_id IN (myTeamIds)` (fallback UUID impossível se sem equipes) |
| `gestor_qualidade` | Todas |
| `admin` | Todas |

### Data Loading
- **Mock mode**: `Promise.all` on 6 `mockDb.get()` calls (monitorias, users, teams, forms, dissatisfaction_fields, user_teams)
- **Supabase mode**: `executeWithRetry` com até 5 attempts, exponential backoff, 15s timeout; core fetch (monitorias, scores, users, teams, forms) + optional fetch (dissatisfaction_fields, user_teams) em paralelo
- **Debounced**: `loadData` debounced 300ms quando filtros mudam
- **Reload triggers**: `activeTab` change to `'dashboard'`, `qualitrack:reconnected`, `qualitrack:refresh-monitorias`
- **Realtime**: Subscription `postgres_changes` no canal `monitorias-realtime-dash`

### Presença Online
- **Local**: `localStorage` chave `qualitrack_active_sessions` — heartbeat 10s, timeout 25s
- **Supabase**: Presence channel `'online-presence'` com `track()` on subscribe
- **Merge**: local-first, remote overwrites; deduplicado por user ID

## Widgets Disponíveis

| Widget | Descrição | Ícone Semântico | Accent |
|---|---|---|---|
| `StatCard` | Card com valor numérico, ícone e cor | Por categoria | Via prop `accent` → `getIconBg()` |
| `TrendChart` | Gráfico de tendência (linha) temporal | `TrendingUp` | `text-brand-highlight` |
| `DistributionChart` | Distribuição de scores (donut) | `PieChartIcon` | `text-brand-accent` |
| `ComparativeBarChart` | Comparação entre agentes/equipes | `BarChart3` | `text-brand-muted` |
| `RankingWidget` | Ranking de top/bottom performers | Por categoria | Via prop `accent` → `getIconBg()` |
| `OfensoresChart` | Critérios mais descumpridos | `AlertOctagon` | `text-functional-error` |
| `RecentAuditsTable` | Tabela de monitorias recentes | `ClipboardList` | `text-brand-muted` |
| `ActionDeadlineWidget` | Status de prazo de ação | `Clock` | `text-functional-warning` |

### `getIconBg()` Map
Mapeia automaticamente classes `text-*` → `bg-icon-*`:
- `text-functional-error` → `bg-icon-error`
- `text-functional-warning` → `bg-icon-warning`
- `text-functional-success` → `bg-icon-success`
- `text-brand-accent` → `bg-icon-accent`
- `text-brand-highlight` → `bg-icon-highlight`
- `text-brand-muted` → `bg-icon-muted`
- `text-brand-primary` → `bg-icon-primary`
- `text-level-*` → `bg-level-*` (replace prefix)
- Fallback: `bg-surface-subtle`

## Ícones — Categorias Semânticas

| Categoria | Ícone | Cor de Acento |
|-----------|-------|---------------|
| Score/Nota | `Target` | Derivada do nível (level-*) |
| Volume | `ClipboardCheck` | `text-brand-accent` |
| Pendência | `AlertTriangle` | `text-functional-error` ou `text-functional-warning` |
| Aprovação | `CheckCircle2` | `text-functional-success` |
| Rejeição | `XCircle` | `text-functional-error` |
| Tendência | `TrendingUp` | `text-functional-success` |
| Info/Contexto | `Users`, `History`, `ClipboardList` | `text-brand-muted` |

> Todos os ícones: tamanho `w-5 h-5`. Container: `w-9 h-9 rounded-xl` com classe `bg-icon-*` derivada via `getIconBg()`. NUNCA usar `bg-brand-*` para fundo de ícone (mesma cor do texto = invisível).

## Lógica de Reavaliações (History-Based)
Para garantir a precisão dos rankings de contestações, os widgets não dependem apenas do `status` atual da monitoria (que pode mudar), mas sim de uma varredura no `history` da monitoria em busca de termos chave:
- **Aceitas/Procedentes:** Busca por "aceita", "procedente", "alterada".
- **Recusadas/Improcedentes:** Busca por "negada", "recusada", "mantida", "improcedente".
- Usa **última resolução** apenas para evitar contagem dupla.
- Lógica extraída para `src/lib/contestation.ts`.

## `RecentAuditsTable` — Status Config

| Status | Label | Cor |
|--------|-------|-----|
| `pendente_revisao` | Aguardando Suporte | `text-functional-warning` |
| `em_contestacao` | Em Reanalise | `text-level-atencao` |
| `aguardando_gestor_suporte` | Aguardando Gestor | `text-functional-success` |
| `aguardando_gestor_qualidade` | Aguardando Qualidade | `text-level-roxo` |
| `concluida` | Concluida | `text-functional-success` |
| `contestacao_aceita` | Contestacao Aceita | `text-functional-success` |
| `contestacao_negada` | Contestacao Negada | `text-functional-error` |
| `finalizada_alterada` | Concluida Alterada | `text-functional-success` |

### Indicador de Auto-Conclusão
Quando `resolution_type === 'automatic'`, ícone `Clock` (`w-3 h-3 opacity-70`) é renderizado ao lado do status.

### Sticky Thead
`<thead className="bg-surface-subtle/30 sticky top-0 z-10">` com container `max-h-[450px] overflow-y-auto`.

## Layouts por Perfil

### Agente de Atendimento (`AgentDashboard`)
- **Performance e Benchmarks:** 3 StatCards (Minha Média, Média Equipe, Média Global) + TrendChart
- **Volumetria:** StatCards (Monitorias, Total Pendentes, Solicitadas, Aprovadas, Recusadas, Taxa de Reversão)
- **Evolução Comparativa:** TrendChart (score diária vs média equipe)
- **Maiores Ofensores:** OfensoresChart (8 itens)

### Monitor de Qualidade (`QualityDashboard`)
- **Volume e Pendências:** Volumetria Diária (2/3) + Auditorias Pendentes StatCard (1/3)
- **Qualidade e Reavaliações:** Curva de Qualidade, Precisão e Reavaliações Pendentes em 3 colunas
- **Análise de Falhas:** Maiores Ofensores em linha única (full width, 12 itens)

### Supervisor de Atendimento (`SupportManagerDashboard`)
- **Benchmarks e Tendência:** StatCards de performance
- **Evolução do Score:** TrendChart (full width)
- **Rankings de Notas:** Melhores Notas e Oportunidades em 2 colunas (meta dinâmica)
- **Rankings de Contestações:** Top Aceitas e Top Recusadas em 2 colunas
- **Prazo de Ação:** ActionDeadlineWidget

### Supervisor de Qualidade (`QualityManagerDashboard`)
- **Evolução da Qualidade:** TrendChart (full width)
- **Distribuição e Ranking:** Curva de Qualidade, Precisão e Ranking de Volume em 3 colunas
- **Maiores Ofensores:** Linha única (full width, 12 itens)
- **Scores de Suporte:** Melhores Notas e Oportunidades em 2 colunas
- **Controle:** Prazo de Ação e Rankings de Contestações na base em 3 colunas

### Administrador (`AdminDashboard`)
- Visão global com todos os widgets disponíveis

## Filtros por Role na FilterBar

| Filtro | suporte | qualidade | gestor_suporte | gestor_qualidade | admin |
|---|---|---|---|---|---|
| Data | ✅ | ✅ | ✅ | ✅ | ✅ |
| Equipe | ✅ (suas) | ✅ | ✅ (suas) | ✅ | ✅ |
| Agente | ❌ | ✅ | ✅ (suas equipes) | ✅ | ✅ |
| Auditor | ❌ | ❌ | ❌ | ✅ | ✅ |
| Status | ✅ | ✅ | ✅ | ✅ | ✅ |

## Debounce
Filtros têm debounce de 300ms antes de disparar `loadData()`.

## Cores de Gráfico
Via `chartPalette()`/`chartColorArray()`/`chartColorMap()` de `chartColors.ts`:
- Lê CSS vars em runtime (`getComputedStyle`)
- Funciona em light e dark mode
- Cores: ruim, aceitavel, excelente, accent, highlight, muted
