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

Para monitorias, `team_id` representa a equipe principal do agente avaliado e
determina o gestor de suporte que pode ver a monitoria e as metricas em que ela
conta. `ticket_group_team_id` preserva o grupo original do ticket Zendesk. Assim,
um agente da equipe PJ atendendo um ticket de Escala conta para PJ e permanece
visivel apenas aos gestores vinculados a PJ. Se a equipe principal do agente
mudar, as monitorias existentes acompanham a nova equipe gestora.

## Personalização por cargo

O dashboard e a prévia de personalização usam a mesma grade responsiva, mesmo sem configuração salva. A grade respeita a ordem configurada e encaixa cards pequenos nos espaços ao lado dos gráficos. Gráficos de distribuição e rosca usam dois módulos de altura (280 px); gráficos de linha, barras e listas usam três (380 px). Gráficos comuns ocupam duas colunas, enquanto gráficos amplos e tabelas ocupam a largura inteira. A quantidade de colunas depende da largura do painel: uma em telas estreitas, duas a partir de 640 px e quatro a partir de 1000 px. Itens ocultos não reservam espaço. A prévia usa valores simulados, mas preserva a mesma ordem e distribuição do dashboard real.

Em **Customizar Dashboards**, o administrador seleciona um dos cinco cargos e define quais cards, gráficos e tabelas aparecem. Na própria prévia, cada card pode ser arrastado para outra posição ou movido e removido pelos botões da barra superior. A lista completa começa recolhida para deixar a prévia acessível e oferece as mesmas ações; itens retirados ficam em **Disponíveis para adicionar**. **Restaurar ordem** devolve a disposição original. A prévia e o dashboard real consomem a mesma configuração.

Os gráficos de linha de **Performance Histórica** e **Evolução** acompanham a escala selecionada: Dia mostra pontos diários (30 dias), Mês mostra um ponto por mês (12 meses) e Ano mostra pontos anuais (5 anos), sempre até a data selecionada. Os filtros de equipe, agente, auditor, formulário, status e canal continuam aplicados. Performance Histórica mantém as séries de médias global, positivas (nota >= 75%) e negativas (nota < 75%); períodos sem uma categoria não exibem ponto naquela série.

Os botões **Diagnóstico de Causa Raiz** e **Relatório Executivo (PDF)** têm controles de visibilidade independentes por cargo. O cargo `suporte` não tem acesso a essas ações, independentemente da configuração visual.

O catálogo de widgets e a ordem estão em `src/lib/dashboardLayout.ts`; a configuração fica em `quality_configs.config.dashboardLayouts` e `dashboardHiddenActions` (ou MockDb em desenvolvimento). Os IDs usam tipo e título original do widget, de modo que mudar uma descrição explicativa não altera a disposição.

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
  startDate: string;  // Default: primeiro dia do mês atual
  endDate: string;    // Default: último dia do mês atual
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
- **Linha 1 (Performance e Benchmarks):** 3 StatCards (Minha Média, Média Equipe, Média Global)
- **Linha 2 (Fila de Contestações e Sucesso):** StatCards (Total Monitorias, Em Revisão, Contestações Aprovadas, Contestações Recusadas, Taxa de Sucesso com comparação dinâmica versus meta da qualidade).
- **Linha 3 (Evolução Comparativa):** TrendChart de linha/área (Meu Score vs Média Equipe).
- **Linha 3B (Evolução Semanal):** TrendChart de linha/área (Evolução de tendência semanal).
- **Linha 4 (Fila e Prazos Operacionais):** 2 ActionDeadlineWidgets lado a lado: "Contestações Ativas" e "Prazos para Contestar".
- **Linha 5 (Meus Ofensores & Maiores Acertos):** OfensoresChart expandido com layout split de duas colunas (Ofensores em vermelho e Acertos em verde).
- **Linha 6 (Distribuição e Insatisfações):** Grid de 3 colunas perfeitamente simétricas (`grid-cols-1 md:grid-cols-3`):
    1. `Minha Classificação por Faixas` (Gráfico de rosca)
    2. `Insatisfação — Visão do Cliente` (Gráfico de colunas/rosca correspondente)
    3. `Insatisfação — Visão da Qualidade` (Gráfico de colunas/rosca correspondente)
- **Linha 8 (Histórico Recente):** Tabela de `Minhas Auditorias Recentes` (RecentAuditsTable) com mascaramento de avaliador sob anonymização.

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
