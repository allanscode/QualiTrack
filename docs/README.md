# 📚 QualiTrack — Documentação Técnica

> Sistema de Gestão de Qualidade para equipes de suporte ao cliente.
> Permite auditoria, avaliação e acompanhamento da performance de atendentes através de monitorias estruturadas.

---

## Visão Geral

**QualiTrack** é uma aplicação web SPA (Single Page Application) focada em **gestão de qualidade de atendimento ao cliente**. O sistema permite que equipes de qualidade criem formulários de avaliação, realizem monitorias (auditorias) em tickets de suporte, e acompanhem a performance dos agentes através de dashboards personalizados por perfil de acesso.

### Stack Principal

| Camada       | Tecnologia                              |
|--------------|----------------------------------------|
| Frontend     | React 19 + TypeScript + Vite            |
| Estilização  | TailwindCSS v4 + CSS Custom Properties  |
| Backend/BaaS | Supabase (PostgreSQL + Auth + Edge Functions) |
| Animações    | Motion (Framer Motion)                  |
| Gráficos     | Recharts                                |
| Ícones       | Lucide React                            |
| Toasts       | Sonner                                  |
| AI (futuro)  | Google Gemini API (configurado, não ativo) |

### Perfis de Acesso (RBAC)

| Role               | Label PT-BR                   | Descrição                                    |
|--------------------|-------------------------------|----------------------------------------------|
| `admin`            | Administrador                 | Acesso total ao sistema                      |
| `gestor_qualidade` | Supervisor de Qualidade       | Supervisão global da qualidade               |
| `gestor_suporte`   | Supervisor de Atendimento     | Supervisão de equipes de suporte             |
| `qualidade`        | Monitor de Qualidade          | Realiza monitorias/auditorias                |
| `suporte`          | Agente de Atendimento         | Visualiza suas monitorias e contesta         |

---

## 📂 Índice da Documentação

### Arquitetura
- [Visão Geral do Sistema](./architecture/system-overview.md)
- [Frontend](./architecture/frontend.md)
- [Backend](./architecture/backend.md)

### Produto
- [PRD Master](./prd/master-prd.md)

### Especificações Técnicas
- [SPEC: Módulo de Monitorias](./specs/monitoria.md)
- [SPEC: Módulo Admin](./specs/admin.md)
- [SPEC: Dashboard](./specs/dashboard.md)
- [SPEC: Quality Config](./specs/quality-config.md)

### Banco de Dados
- [Schema e Entidades](./database/schema.md)

### API
- [Endpoints e Contratos](./api/endpoints.md)

### Fluxos
- [Autenticação](./flows/authentication.md)
- [Monitoria (Auditoria)](./flows/monitoria.md)
- [Onboarding de Usuários](./flows/onboarding.md)
- [SLA e Prazos](./flows/sla.md)

### Decisões Arquiteturais
- [ADR-001: Migração Firebase → Supabase](./decisions/adr-001.md)
- [ADR-002: Mock Mode para Desenvolvimento](./decisions/adr-002.md)
- [ADR-003: SLA com Horário Comercial](./decisions/adr-003.md)

### Onboarding
- [Setup de Desenvolvimento](./onboarding/dev-setup.md)

### Agentes de IA
- [Contexto para Agentes de IA](./agents/ai-context.md)

---

## Convenções

- **Idioma do código**: Inglês (nomes de variáveis, funções)
- **Idioma da UI**: Português (PT-BR)
- **Idioma dos tipos/status**: Português (ex: `pendente_revisao`, `em_contestacao`)
- **Estilização**: TailwindCSS v4 com design tokens via CSS custom properties
- **Componentes**: Todos em `.tsx`, sem routing library (navegação por state)
- **Estado**: React Context para dados globais do dashboard, `useState` para estado local
- **Persistência dual**: Supabase (produção) + LocalStorage/MockDB (desenvolvimento)

## Como Navegar

1. **Novo no projeto?** → Comece por [Onboarding](./onboarding/dev-setup.md) e [AI Context](./agents/ai-context.md)
2. **Entender a arquitetura?** → Veja [System Overview](./architecture/system-overview.md)
3. **Implementar feature?** → Consulte as [SPECs](./specs/) e os [Fluxos](./flows/)
4. **Entender regras de negócio?** → Veja o [PRD](./prd/master-prd.md) e [Monitoria Flow](./flows/monitoria.md)
5. **Debugar?** → Consulte [Backend](./architecture/backend.md) e [Schema](./database/schema.md)
