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

### Volume de avaliações por agente

A tabela **Avaliações por Agente** está disponível para administrador, gestores de
qualidade e suporte e monitores de qualidade, inclusive em Customizar Dashboards.
Usa as monitorias já filtradas e autorizadas de cada painel: o gestor de suporte
vê suas equipes e o monitor de qualidade suas próprias avaliações.

As categorias seguem as filas: pesquisa `Positiva`, `Negativa` e `Sem pesquisa`
(proativa), independentemente da nota. Chamados filhos ficam em **Tickets filhos**;
registros sem categoria ficam em **Sem classificação**, exibida quando necessária.
O total soma todas essas categorias.
Conta cada monitoria salva, ativa e com nota válida uma vez, inclusive nota zero;
rascunhos de IA e agentes sem monitorias não entram.

O seletor ordena por positivas, negativas, proativas ou total (padrão), com botão
para alternar maior/menor primeiro. Empates usam total decrescente, nome e ID. A
busca por agente/equipe preserva a posição no ranking; há dez agentes por página,
e o rodapé soma todos os agentes encontrados, não apenas a página visível.
Não há consultas extras nem alteração dos dados salvos; Supabase e MockDb usam
o mesmo cálculo em `src/lib/agentEvaluationVolume.ts`.

### Histórico de produção por monitor

A tabela **Monitorias por Monitor** conta fichas persistidas por `evaluator_id`,
com nome atual do cadastro ou nome histórico salvo. Aparece nos painéis de
administrador e gestor de qualidade com os registros autorizados pelos filtros;
no painel de qualidade recebe apenas as monitorias do próprio monitor.
Não aparece nos painéis de suporte ou gestor de suporte para preservar a identidade
do auditor nesses contextos.

Conta registros ativos uma vez por ID, independentemente da nota ou do andamento:
nota zero, nota ausente e monitorias pendentes continuam representando fichas criadas.
Rascunhos de IA não entram. Os filtros atuais de período, equipe, agente, auditor e
status do dashboard delimitam o histórico; a tabela não limita os dados aos registros recentes.

As colunas **Manuais**, **Por IA** e **Total** distinguem a criação automática
atribuída ao responsável das fichas criadas manualmente. A identificação por IA usa
`form_snapshot.automation = positive_csat` ou `ai_evaluation.automatic_positive`;
conclusão automática por SLA não é confundida com criação por IA. Ordena por total,
permite inverter a ordem e buscar nome, mantendo o total geral dos filtros no rodapé.
Supabase e MockDb compartilham o cálculo em `src/lib/auditorEvaluationVolume.ts`,
sem novas consultas nem alterações nas monitorias salvas.

### Positivas com nota baixa e zeradas por erro crítico

Somente administrador e gestor de qualidade dispõem dos painéis **CSAT positivo ·
nota abaixo de 75%** e **CSAT positivo · zero por erro crítico**, inclusive no catálogo
de customização. Recebem as monitorias salvas já autorizadas e filtradas pelo dashboard;
não consultam rascunhos de IA nem a fila automática. Registros inativos, notas ausentes,
inválidas ou pesquisas diferentes de `Positiva` ficam fora.

O primeiro lista notas de zero até abaixo de 75%; exatamente 75% não entra. O segundo
é um subconjunto: nota exatamente zero **e** erro crítico selecionado, flag crítica
verdadeira no parecer de IA salvo ou pergunta crítica respondida `NAO`. Nota zero sozinha
não comprova erro crítico. A definição histórica da ficha prevalece sobre a ficha atual.

Cada painel mostra quantidade de tickets e monitorias, agente, nota, motivo crítico e
observação quando disponíveis, situação real da monitoria e data de criação. Busca por
ticket/agente/erro e paginação de dez registros não alteram os filtros globais. **Ver
monitoria** usa o evento interno `qualitrack:focus_monitoria`, sem publicar no Zendesk.

### Ranking de suporte: média ajustada

Os rankings **Melhores Suporte** e **Maiores Ofensores**, nos painéis de administrador,
gestor da qualidade e gestor de suporte, usam `(n × média real + 5 × média da equipe) / (n + 5)`.
O peso fixo 5 reduz a influência de amostras pequenas. A nota ajustada ordena o ranking
e determina o corte da meta configurada; média real e quantidade continuam visíveis.
Nenhuma nota original é alterada no banco. Agentes sem monitorias com nota ficam fora;
zero é uma nota válida. Monitorias inativas e notas ausentes ou não finitas não contam.

A média da equipe usa somente dados já autorizados por RBAC, com os mesmos filtros
de período, equipe, auditor, formulário, status e canal. O filtro de agente restringe
os participantes exibidos, mas não a média de referência da equipe. Um agente com
monitorias em várias equipes recebe a média de referência ponderada pela quantidade
de suas monitorias em cada equipe; monitorias sem equipe formam um grupo separado.
Empates usam maior quantidade de monitorias, nome e ID, nessa ordem. A ordenação
usa a precisão integral; o arredondamento ocorre apenas na apresentação.

O cálculo compartilhado está em `src/lib/supportRanking.ts` e funciona igualmente
com dados Supabase e MockDb, sem consultas adicionais nem alteração das notas salvas.

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

A tabela **Decisões dos Gestores de Atendimento** está disponível para administrador, gestor da qualidade, monitor da qualidade e gestor de atendimento, além de **Customizar Dashboards**. O gestor de atendimento vê apenas decisões das monitorias das equipes vinculadas a ele; os perfis da qualidade e o administrador veem o histórico geral. A restrição do gestor é aplicada na consulta, na tabela e na política de leitura do banco. A tabela filtra por ticket/agente/equipe, tipo de decisão e gestor, com paginação. Na prévia de personalização, o gestor vê uma amostra de uma equipe; os demais perfis veem duas decisões ilustrativas.

A tabela **Erros Críticos por Agente** está disponível nesses mesmos perfis. Ela ordena agentes por quantidade de ocorrências nas monitorias filtradas, separa monitorias afetadas do total avaliado e permite filtrar por tipo de erro, buscar agente/ticket/erro e abrir cada avaliação. Conta questões críticas com resposta `NAO` e erros críticos selecionados separadamente, sem duplicar o mesmo ID na mesma monitoria. O texto é lido do `form_snapshot` quando disponível, preservando a descrição usada na avaliação. Nota zero por si só não é classificada como erro crítico. A prévia em **Customizar Dashboards** usa dados ilustrativos e mostra apenas uma equipe para o gestor de atendimento.

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
| `ManagerDecisionHistoryTable` | Decisões de gestores, com acesso por equipe | `History` | `text-brand-highlight` |
| `CriticalErrorsTable` | Ranking de agentes e avaliações com erro crítico | `AlertOctagon` | `text-functional-error` |
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

No painel do monitor de qualidade, **Total Reav. Recebidas** conta as monitorias do auditor com contestação ou solicitação de reavaliação no histórico, mesmo que a decisão ainda esteja pendente. **Reav. Aprovadas** e **Reav. Recusadas** usam o desfecho final; quando a reavaliação registra `[DE x% PARA y%]`, a mudança de nota define se foi procedente. O aceite administrativo posterior do gestor não substitui esse desfecho. Falhas de modelos de IA recuperadas por fallback aparecem no filtro “Erro ou fallback” dos logs, com a sequência de tentativas e o modelo que concluiu a análise.
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
