# AGENTS.md - Instruções para Agentes de IA

## Índice de Documentação Técnica

| Documento | Localização | Descrição |
|---|---|---|
| Arquitetura Frontend | docs/architecture/frontend.md | Stack, estrutura de pastas, gerenciamento de estado, design system, fluxo de renderização |
| Arquitetura Backend | docs/architecture/backend.md | API Supabase, Edge Functions, migrações, RLS policies, view anônima, cron |
| Especificação Monitoria | docs/specs/monitoria.md | Fluxo de criação, validação, contestação, SLA (pg_cron), reavaliação |
| Especificação Dashboard | docs/specs/dashboard.md | Indicadores, Bento Grid, micro-indicadores, CSAT, filtros |
| Especificação Admin | docs/specs/admin.md | CRUD, Edge Function, syncUserTeams, solicitações |
| Especificação Quality Config | docs/specs/quality-config.md | Faixas de nota, metas, prazos, Context Provider singleton |
| Banco de Dados | docs/database/schema.md | 11 tabelas, ER diagram, RLS matrix, view anônima |
| API / Endpoints | docs/api/endpoints.md | Queries Supabase, Edge Functions, auth SDK, utilitários |
| Fluxo de Autenticação | docs/flows/authentication.md | Login, recovery, invite, sessão, mock, hash race fix |
| Fluxo de Monitoria | docs/flows/monitoria.md | Criação, contestação, reavaliação, auto-finalização (cron) |
| Fluxo de Prazo de Ação | docs/flows/action-deadline.md | Cálculo business hours, cron, ActionDeadlineClock |
| Fluxo de Onboarding | docs/flows/onboarding.md | Convite, solicitação de acesso, setup |
| Docker/Infra | docs/onboarding/docker-setup.md | Docker Compose, Swarm, Traefik, build args, health check |
| Plano de Deploy | docs/deployment-plan.md | Passos locais e remotos, Supabase config, pós-deploy |
| Contexto para Agentes IA | docs/agents/ai-context.md | Regras, padrões, bugs conhecidos (27+ pontos) |
| Email Templates | docs/supabase-email-templates.md | Templates HTML profissionais para Auth emails |

## Diretrizes de Desenvolvimento

1. **Zero dependências de estado global**: Não use Redux, Zustand, Context API global. Estado gerenciado via Context Providers específicos (StaticDataContext, DashboardContext, QualityConfigProvider) e hooks locais.
2. **Extração de hooks customizados**: Lógica de negócio complexa deve ser extraída para hooks em src/hooks/ (ex: useSessionManager, useSidebarManager, useMonitoriaData, useMonitoriaFilters, useMonitoriaActions, useMonitoriaFormState, useMonitoriaSave).
3. **Isolamento de responsabilidade**: Cada dashboard (AgentDashboard, QualityDashboard, SupportManagerDashboard, QualityManagerDashboard, AdminDashboard) é independente e consome apenas os contexts necessários.
4. **Componentes UI reutilizáveis**: Use componentes em src/components/ui/ (Button, Card, Badge, Select, CustomSelect, ActionDeadlineClock). Não crie componentes duplicados.
5. **TypeScript estrito**: strict: true no tsconfig.json. Evite any. Use tipagem explícita em props, estado e retornos de hooks.
6. **Persistência dual**: Todo CRUD deve suportar Supabase (produção) e MockDb (desenvolvimento). Ver `src/lib/supabase.ts`.
7. **Anonimato de auditor**: Role `suporte` consulta `vw_monitorias_suporte` (view que oculta evaluator_name/id). Nunca consulte `monitorias` diretamente para `suporte`.

## Quem Deve Ler o Quê

| Objetivo | Documentos Prioritários |
|---|---|
| **Primeira vez no projeto** | `docs/agents/ai-context.md`, `docs/architecture/system-overview.md`, `docs/onboarding/dev-setup.md` |
| **Implementar nova feature** | SPEC da feature em `docs/specs/`, fluxo em `docs/flows/`, schema em `docs/database/schema.md` |
| **Corrigir bug** | `docs/agents/ai-context.md` (known bugs), `docs/architecture/backend.md`, `docs/flows/` |
| **Alterar dashboard** | `docs/specs/dashboard.md`, `docs/architecture/frontend.md` (DashboardContext), `DASHBOARD_INDICATORS.md` |
| **Alterar auth/login** | `docs/flows/authentication.md`, `src/providers/AuthProvider.tsx`, `src/lib/supabase.ts` |
| **Fazer deploy** | `docs/deployment-plan.md`, `docs/onboarding/docker-setup.md`, `Dockerfile`, `docker-compose.yml` |
| **Configurar Docker/Swarm** | `docs/onboarding/docker-setup.md`, `Dockerfile`, `docker-compose.yml`, `docker-compose.swarm.yml` |
| **Melhorar performance** | `docs/architecture/frontend.md` (estado/context), `docs/agents/ai-context.md` (N+1, query storm) |

## Arquivos-Chave e Localizações

| Arquivo | Localização | Descrição |
|---|---|---|
| App.tsx | src/App.tsx | Entry point: Auth, Layout, Tab Navigation, Session, Sidebar, Theme |
| AuthProvider.tsx | src/providers/AuthProvider.tsx | Auth lifecycle, session resilience, idle timeout, login/logout, password recovery, request access, enrichUserWithTeamIds, ref-bridge pattern |
| ThemeProvider.tsx | src/providers/ThemeProvider.tsx | Theme context, dark/light/system mode, persistence |
| useSessionManager.ts | src/hooks/useSessionManager.ts | Session resilience, reconnection, idle/absolute timeout, extendSession ref-bridge |
| useSidebarManager.ts | src/hooks/useSidebarManager.ts | Sidebar color, theme sync, contrast derivation (YIQ), color mirroring maps |
| useMonitoriaData.ts | src/hooks/useMonitoriaData.ts | Data fetch, RBAC query, retry w/ backoff, realtime, reconnection, failsafe, suporte view |
| useMonitoriaFilters.ts | src/hooks/useMonitoriaFilters.ts | Filter states (tab, search, status, team, agent, auditor, dates), clearFilters |
| useMonitoriaActions.ts | src/hooks/useMonitoriaActions.ts | Action modal, handleAction, status transitions, deadline calculation |
| useMonitoriaFormState.ts | src/hooks/useMonitoriaFormState.ts | Form state (header, scores, observations, criticalErrors, dissatisfactionAnswers) |
| useMonitoriaSave.ts | src/hooks/useMonitoriaSave.ts | Validation, payload build, Supabase/mockDb CRUD, history entry, deadline calculation |
| supabase.ts | src/lib/supabase.ts | Cliente Supabase + MockDB + initialUrlHash/initialUrlSearch (auth race fix) |
| Dockerfile | Dockerfile | Multi-stage build (node build + nginx serve), envsubst, build args |
| docker-compose.yml | docker-compose.yml | Dev/standalone com Traefik, healthcheck |
| docker-compose.swarm.yml | docker-compose.swarm.yml | Swarm cluster com Traefik, replicas 3, SSL Let's Encrypt |
| nginx.conf | nginx.conf | SPA fallback, CSP/HSTS headers, gzip, health check |
