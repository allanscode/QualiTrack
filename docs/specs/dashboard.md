# SPEC: Dashboard

## Arquivos
- `src/components/dashboard/DashboardMain.tsx` — Router por role
- `src/components/dashboard/DashboardContext.tsx` — Context Provider
- `src/components/dashboard/FilterBar.tsx` — Barra de filtros global
- `src/components/dashboard/roles/` — 5 dashboards role-specific
- `src/components/dashboard/widgets/` — 8 widgets reutilizáveis

## Arquitetura

```
DashboardMain
├── DashboardProvider (Context)
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
| `user` | `User` | Usuário logado |
| `filters` | `DashboardFilters` | Filtros ativos |
| `monitorias` | `Monitoria[]` | Lista filtrada (RBAC + filtros UI) |
| `allMonitorias` | `Monitoria[]` | Lista pós-RBAC (antes de filtros UI) |
| `users` | `User[]` | Todos os usuários |
| `teams` | `Team[]` | Todas as equipes |
| `forms` | `EvaluationForm[]` | Todos os formulários |
| `globalAvg` | `number` | Média global de score |
| `loading` | `boolean` | Estado de carregamento |
| `refresh` | `() => void` | Trigger de reload |

### Filtros
```typescript
interface DashboardFilters {
  startDate: string;    // Default: 30 dias atrás
  endDate: string;      // Default: hoje
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
| `suporte` | Apenas suas monitorias + equipe |
| `qualidade` | Apenas monitorias que criou |
| `gestor_suporte` | Monitorias das suas equipes |
| `gestor_qualidade` | Todas |
| `admin` | Todas |

## Widgets Disponíveis

| Widget | Descrição |
|---|---|
| `StatCard` | Card com valor numérico, ícone e cor |
| `TrendChart` | Gráfico de tendência (linha) temporal |
| `DistributionChart` | Distribuição de scores (barras por faixa) |
| `ComparativeBarChart` | Comparação entre agentes/equipes |
| `RankingWidget` | Ranking de top/bottom performers |
| `OfensoresChart` | Critérios mais descumpridos (maiores ofensores) |
| `RecentAuditsTable` | Tabela de monitorias recentes |
| `SlaWidget` | Status de SLA (dentro/fora do prazo) |

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
