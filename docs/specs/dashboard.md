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

| Widget | Descrição | Ícones Semânticos |
|---|---|---|
| `StatCard` | Card com valor numérico, ícone e cor | — |
| `TrendChart` | Gráfico de tendência (linha) temporal | — |
| `DistributionChart` | Distribuição de scores (barras por faixa) | — |
| `ComparativeBarChart` | Comparação entre agentes/equipes | — |
| `RankingWidget` | Ranking de top/bottom performers | `Target` (Oportunidades), `UserMinus` (Recusas), `AlertTriangle` (Ofensores) |
| `OfensoresChart` | Critérios mais descumpridos (maiores ofensores) | — |
| `RecentAuditsTable` | Tabela de monitorias recentes | — |
| `ActionDeadlineWidget` | Status de prazo de ação (dentro/fora do prazo) | — |

## Lógica de Reavaliações (History-Based)
Para garantir a precisão dos rankings de contestações, os widgets não dependem apenas do `status` atual da monitoria (que pode mudar), mas sim de uma varredura no `history` da monitoria em busca de termos chave:
- **Aceitas/Procedentes:** Busca por "aceita", "procedente", "alterada".
- **Recusadas/Improcedentes:** Busca por "negada", "recusada", "mantida", "improcedente".

## Layouts por Perfil

### Supervisor de Qualidade (`QualityManagerDashboard`)
- **Evolução da Qualidade:** Linha única (full width) para análise temporal detalhada.
- **Distribuição e Ranking:** Curva de Qualidade, Precisão e Ranking de Volume em 3 colunas.
- **Maiores Ofensores:** Linha única (full width) exibindo até 12 critérios.
- **Scores de Suporte:** Melhores Notas e Oportunidades em 2 colunas.
- **Controle:** Prazo de Ação e Rankings de Contestações na base em 3 colunas.

### Supervisor de Atendimento (`SupportManagerDashboard`)
- **Benchmarks e Tendência:** StatCards de performance.
- **Evolução do Score:** Linha única (full width) após remoção do prazo de ação duplicado.
- **Rankings de Notas:** Melhores Notas e Oportunidades em 2 colunas (meta dinâmica).
- **Rankings de Contestações:** Top Aceitas e Top Recusadas em 2 colunas.

### Monitor de Qualidade (`QualityDashboard`)
- **Volume e Pendências:** Volumetria Diária (2/3) e Auditorias Pendentes (1/3).
- **Qualidade e Reavaliações:** Curva de Qualidade, Precisão e Reavaliações Pendentes em 3 colunas.
- **Análise de Falhas:** Maiores Ofensores em linha única (full width, 12 itens).

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
