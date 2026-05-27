# QualiTrack — Documentação Técnica

> Sistema de Gestão de Qualidade para equipes de suporte ao cliente.
> Permite auditoria, avaliação e acompanhamento da performance de atendentes através de monitorias estruturadas.

---

## Visão Geral

**QualiTrack** é uma aplicação web SPA focada em **gestão de qualidade de atendimento ao cliente**. O sistema permite que equipes de qualidade criem formulários de avaliação, realizem monitorias em tickets de suporte, e acompanhem a performance dos agentes através de dashboards personalizados por perfil de acesso.

### Stack Principal

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + TypeScript 5.8 (strict) + Vite 6 |
| Estilização | TailwindCSS v4 + CSS Custom Properties (design tokens) |
| Backend/BaaS | Supabase (PostgreSQL + Auth + Edge Functions) |
| Animações | Motion (Framer Motion) |
| Gráficos | Recharts 3.x |
| Ícones | Lucide React (única lib) |
| Toasts | Sonner |
| Datas | date-fns (ptBR) |

### Perfis de Acesso (RBAC)

| Role | Label | Escopo |
|---|---|---|
| `admin` | Administrador | Acesso total |
| `gestor_qualidade` | Supervisor de Qualidade | Visão global + config |
| `gestor_suporte` | Supervisor de Atendimento | Suas equipes |
| `qualidade` | Monitor de Qualidade | Monitorias que criou |
| `suporte` | Agente de Atendimento | Suas monitorias |

---

## Índice da Documentação

### Arquitetura
- [Visão Geral do Sistema](./architecture/system-overview.md) — módulos, bounded contexts, padrões, data flow
- [Frontend](./architecture/frontend.md) — stack, estrutura, estado, sessão, design system, componentes
- [Backend](./architecture/backend.md) — auth, Edge Functions, cron, RLS, SQL functions

### Produto
- [PRD Master](./prd/master-prd.md) — visão, features, regras de negócio, roadmap

### Especificações Técnicas
- [SPEC: Monitorias](./specs/monitoria.md) — data model, state machine, form, score, contestação
- [SPEC: Dashboard](./specs/dashboard.md) — context, widgets, layouts, filtros, chart colors
- [SPEC: Admin](./specs/admin.md) — 6 tabs, CRUD, Edge Function, syncUserTeams
- [SPEC: Quality Config](./specs/quality-config.md) — faixas, meta, prazos, Context Provider

### Banco de Dados
- [Schema e Entidades](./database/schema.md) — 10 tabelas, ER diagram, RLS matrix

### API
- [Endpoints e Contratos](./api/endpoints.md) — Supabase queries, Edge Functions, auth, utilities

### Fluxos
- [Autenticação](./flows/authentication.md) — login, recovery, invite, sessão, mock
- [Monitoria](./flows/monitoria.md) — criação, contestação, reavaliação, auto-finalização
- [Prazo de Ação](./flows/action-deadline.md) — cálculo, cron, recálculo, ActionDeadlineClock
- [Onboarding](./flows/onboarding.md) — convite, solicitação, setup inicial

### Decisões Arquiteturais
- [ADR-001: Firebase → Supabase](./decisions/adr-001.md)
- [ADR-002: Mock Mode](./decisions/adr-002.md)
- [ADR-003: Prazo de Ação com Horário Comercial](./decisions/adr-003.md)

### Onboarding
- [Setup de Desenvolvimento](./onboarding/dev-setup.md)

### Agentes de IA
- [Contexto para Agentes de IA](./agents/ai-context.md) — regras condensadas para sessões de IA

---

## Convenções

- **Idioma do código**: Inglês (nomes de variáveis, funções)
- **Idioma da UI**: Português (PT-BR)
- **Idioma dos tipos/status**: Português (ex: `pendente_revisao`, `em_contestacao`)
- **Estilização**: TailwindCSS v4 com design tokens via CSS custom properties
- **Componentes**: Todos em `.tsx`, sem routing library (navegação por state)
- **Estado**: React Context para dados globais, `useState` para estado local
- **Persistência dual**: Supabase (produção) + LocalStorage/MockDB (desenvolvimento)
- **Ícones**: Apenas Lucide React (`w-5 h-5` padrão)
- **Cores**: Tokens semânticos, nunca hex hardcoded

## Como Navegar

1. **Novo no projeto?** → [Onboarding](./onboarding/dev-setup.md) + [AI Context](./agents/ai-context.md)
2. **Entender a arquitetura?** → [System Overview](./architecture/system-overview.md)
3. **Implementar feature?** → [SPECs](./specs/) + [Fluxos](./flows/)
4. **Entender regras de negócio?** → [PRD](./prd/master-prd.md) + [Monitoria Flow](./flows/monitoria.md)
5. **Debugar?** → [Backend](./architecture/backend.md) + [Schema](./database/schema.md)
6. **Configurar IA?** → [AGENTS.md](../AGENTS.md) (fonte principal) + [AI Context](./agents/ai-context.md)
