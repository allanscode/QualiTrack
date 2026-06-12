# AGENTS.md - Instruções para Agentes de IA

## Índice de Documentação Técnica

| Documento | Localização | Descrição |
|---|---|---|
| Arquitetura Frontend | docs/architecture/frontend.md | Stack, estrutura de pastas, gerenciamento de estado, design system, fluxo de renderização |
| Especificação Monitoria | docs/specs/monitoria.md | Fluxo de criação, validação, contestação, SLA, reavaliação |
| Arquitetura Backend | docs/architecture/backend.md | API Supabase, Edge Functions, migrações, RLS policies |
| Especificação Monitoria | docs/specs/monitoria.md | Fluxo de criação, validação, contestação, SLA, reavaliação |
| Especificação Dashboard | docs/specs/dashboard.md | Indicadores, Bento Grid, micro-indicadores, CSAT |
| Especificação Dashboard | docs/specs/dashboard.md | Indicadores, Bento Grid, micro-indicadores, CSAT |

## Diretrizes de Desenvolvimento

1. **Zero dependências de estado global**: Não use Redux, Zustand, Context API global. Estado gerenciado via Context Providers específicos (StaticDataContext, DashboardContext, QualityConfigProvider) e hooks locais.
2. **Extração de hooks customizados**: Lógica de negócio complexa deve ser extraída para hooks em src/hooks/ (ex: useSessionManager, useSidebarManager, useMonitoriaData, useMonitoriaFilters, useMonitoriaActions, useMonitoriaFormState, useMonitoriaSave).
3. **Zero dependências de estado global**: Não use Redux, Zustand, Context API global. Estado gerenciado via Context Providers específicos (StaticDataContext, DashboardContext, QualityConfigProvider) e hooks locais.
4. **Isolamento de responsabilidade**: Cada dashboard (AgentDashboard, QualityDashboard, SupportManagerDashboard, QualityManagerDashboard, AdminDashboard) é independente e consome apenas os contexts necessários.
5. **Componentes UI reutilizáveis**: Use componentes em src/components/ui/ (Button, Card, Badge, Select, CustomSelect, ActionDeadlineClock). Não crie componentes duplicados.
6. **TypeScript estrito**: strict: true no 	sconfig.json. Evite ny. Use tipagem explícita em props, estado e retornos de hooks.

## Arquivos-Chave e Localizações

| Arquivo | Localização | Descrição |
|---|---|---|
| App.tsx | src/App.tsx | Entry point: Auth, Layout, Tab Navigation, Session, Sidebar, Theme |
| AuthProvider.tsx | src/providers/AuthProvider.tsx | Auth lifecycle, session resilience, idle timeout, login/logout, password recovery, request access, enrichUserWithTeamIds, ref-bridge pattern |
| ThemeProvider.tsx | src/providers/ThemeProvider.tsx | Theme context, dark/light/system mode, persistence |
| useSessionManager.ts | src/hooks/useSessionManager.ts | Session resilience, reconnection, idle/absolute timeout, extendSession ref-bridge |
| useSidebarManager.ts | src/hooks/useSidebarManager.ts | Sidebar color, theme sync, contrast derivation (YIQ), color mirroring maps |
| useMonitoriaData.ts | src/hooks/useMonitoriaData.ts | Data fetch, RBAC query, retry w/ backoff, auto-finalize, realtime, reconnection, failsafe |
| useMonitoriaFilters.ts | src/hooks/useMonitoriaFilters.ts | Filter states (tab, search, status, team, agent, auditor, dates), clearFilters |
| useMonitoriaActions.ts | src/hooks/useMonitoriaActions.ts | Action modal, handleAction, status transitions, deadline calculation |
| useMonitoriaFormState.ts | src/hooks/useMonitoriaFormState.ts | Form state (header, scores, observations, criticalErrors, dissatisfactionAnswers) |
| useMonitoriaSave.ts | src/hooks/useMonitoriaSave.ts | Validation, payload build, Supabase/mockDb CRUD, history entry, deadline calculation |
