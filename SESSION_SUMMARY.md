# Sessão — Atualização Completa da Documentação (PR #4)

## Objetivo
Atualizar toda a documentação do QualiTrack para refletir o estado atual completo do projeto, permitindo que uma IA entenda o projeto em uma nova sessão sem contexto prévio.

---

## PRs Anteriores (Já Merged)
- **PR #2**: `refactor/db-restructuring` → `main` (commit `a3eb963`) — reestruturação do banco (`user_teams` N:N, drop `users.team_ids`)
- **PR #3**: `fix/dashboard-icon-standardization` → `main` (commit `7f538df`) — padronização de ícones e cores do dashboard
- Local `main` sincronizado com `git reset --hard origin/main`

---

## PR Atual (Aguardando Merge)
- **PR #4**: `docs/comprehensive-documentation-update` → `main` — https://github.com/marcospaulofreitas/QualiTrack/pull/4
  - 20 arquivos, +1604/-582 linhas
  - Commit: `f8a2f93`

---

## Arquivos Reescritos (PR #4)
- **AGENTS.md** — 17 seções (referência principal para IA)
- **docs/agents/ai-context.md** — regras condensadas para IA
- **docs/architecture/system-overview.md** — módulos, bounded contexts, padrões, data flow
- **docs/architecture/frontend.md** — stack, estado (5 níveis), sessão, design system, componentes
- **docs/architecture/backend.md** — auth, Edge Functions, cron, RLS, SQL functions
- **docs/database/schema.md** — 10 tabelas com colunas, ER diagram, RLS matrix
- **docs/specs/monitoria.md** — data model, state machine, form 4 etapas, Agente↔Equipe, score, contestação
- **docs/specs/dashboard.md** — context, 8 widgets com ícones/accents, 5 layouts, filtros, chart colors
- **docs/specs/admin.md** — 6 tabs, CRUD, Edge Function, syncUserTeams
- **docs/specs/quality-config.md** — Context Provider singleton, recálculo, business_hours/holidays
- **docs/flows/authentication.md** — login, recovery, invite, sessão (4 mecanismos), persistência, resiliência
- **docs/flows/monitoria.md** — fluxo completo, resolution_type, contestação history-based, tabela de transições
- **docs/flows/action-deadline.md** — addBusinessHours, cron, ActionDeadlineClock, recálculo em massa
- **docs/flows/onboarding.md** — convite (sequence diagram), solicitação, hash detection
- **docs/api/endpoints.md** — queries Supabase, Edge Functions, auth SDK, utilities
- **docs/prd/master-prd.md** — visão, features, regras, tech stack
- **docs/onboarding/dev-setup.md** — convenções, troubleshooting, sessão, StrictMode
- **docs/decisions/adr-002.md** — mock mode detalhado (coleções, seed, auth, responsabilidade)
- **docs/README.md** — índice atualizado com navegação
- **DASHBOARD_INDICATORS.md** — tabelas por role com ícones, accents, fórmulas

---

## Arquivos NÃO Alterados (já estavam atuais)
- `docs/decisions/adr-001.md` — Firebase → Supabase (aceito, migração concluída)
- `docs/decisions/adr-003.md` — Prazo de ação com horário comercial (aceito)

---

## Contexto Crítico para Próxima Sessão
- **gh CLI**: caminho completo `C:\Program Files\GitHub CLI\gh.exe` (não está no PATH do PowerShell por padrão)
- **Supabase project ref**: `amyfyngzkqqzixmreeih`
- **Mock credentials**: `qualidade@webposto.com.br` / `123456` (admin)
- **10 tabelas DB**: `users`, `user_teams`, `teams`, `forms`, `monitorias`, `quality_configs`, `access_requests`, `dissatisfaction_fields`, `business_hours`, `holidays`
- **NUNCA enviar `team_ids` em payload da tabela `users`** — usar `syncUserTeams()`
- `is_admin_user()` é **SECURITY DEFINER** — bypassa RLS na tabela `users` (previne 42P17)
- **Session constants no escopo do módulo**: `IDLE_TIMEOUT_MS=60min`, `IDLE_WARNING_MS=5min`, `ABSOLUTE_TIMEOUT_MS=8h`, `SESSION_REFRESH_MS=50min`
- **Ref-bridge pattern** para `useCallback` que não pode ser chamado dentro de `useEffect`
- **Dark mode**: cores de nível pastel (ex: ruim = `#FCA5A5`), nunca saturadas
- **Agente↔Equipe**: nunca limpa automaticamente; bloqueia com toast
- `chartColors.ts` lê CSS vars em runtime — funciona light e dark
- StrictMode em dev causa double effect execution (não é bug)
- **Date picker**: `input[type="date"]` usa `color-scheme: var(--date-color-scheme, light)` com `.dark` override `--date-color-scheme: dark` — previne flash preto em light mode
- **Sidebar accordion**: 4 seções recolhíveis (Equipes, Avatar, Aparência, Cor do Menu), single-open via `sidebarAccordion` state, `AnimatePresence initial={false}` + `ChevronDown` rotation, seleção de cor auto-fecha
- **Profile toggle**: Botões de avatar e nome usam classe `profile-toggle-btn` para exclusão do click-outside handler
- **Scrollbar gutter**: `scrollbar-gutter: stable` no container de scroll principal — evita layout shift quando scrollbar aparece/desaparece

---

## Próximos Passos Sugeridos
1. Merge PR #4 → `gh pr merge 4`
2. Resolver débito técnico aberto: componentes monolíticos (extrair de `App.tsx`, `MonitoriaList.tsx`, `MonitoriaForm.tsx`)
3. Configurar testes automatizados (nenhum framework configurado)
4. Configurar CI/CD pipeline
