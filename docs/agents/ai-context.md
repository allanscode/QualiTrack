# Contexto para Agentes de IA

**Atenção Agente de IA**: Leia este documento antes de iniciar qualquer modificação estrutural na codebase do QualiTrack. Para regras completas, consulte `AGENTS.md` na raiz do projeto.

---

## 1. Regras Fundamentais de Arquitetura

1. **Sem Backend Customizado**: Toda a persistência é feita via Supabase. A lógica reside no frontend (React) ou em Edge Functions (Deno). Não proponha criar servidores Express, NestJS, etc.
2. **Sem Router Library**: A navegação é baseada em state (`activeTab` em `App.tsx`). Não instale `react-router-dom` sem a permissão explícita do Tech Lead/User.
3. **Mock Mode Preservado**: Todo CRUD no frontend precisa suportar o "Mock Mode". Se você adicionar uma query Supabase, adicione a respectiva persistência em `localStorage` via `mockDb`.
4. **TailwindCSS v4**: O projeto utiliza a versão 4 do Tailwind, que é baseada em CSS moderno e `@theme`. Não use plugins do Tailwind v3 ou configurações no `tailwind.config.js` obsoleto.
5. **Componentização**: Não adicione mais código aos arquivos "monolíticos" (`App.tsx`, `MonitoriaForm.tsx`, `MonitoriaList.tsx`). Se for mexer neles, a prioridade é **extrair componentes menores** antes de adicionar features.
6. **Hooks Incondicionais**: Mantenha todos os `useX` no topo do componente, sempre incondicionais. Incidentes anteriores em `MonitoriaForm.tsx`.
7. **Constantes no Escopo do Módulo**: Constantes usadas em inicializadores de `useState` (ex: `MOCK_SESSION_KEY`) devem ser declaradas **fora** do componente. Incidente: `MOCK_SESSION_KEY` referenciada em `useState` initializer antes de ser declarada dentro do componente.
8. **Hooks nunca dentro de `useEffect`**: `useCallback`, `useMemo`, `useRef` etc. não podem ser chamados dentro de callbacks de `useEffect`. Use o padrão ref-bridge: atualize um `ref.current` dentro do effect e chame `ref.current()` em um `useCallback` fora do effect. Incidente: `useCallback` dentro de `useEffect` para `extendSession` em `App.tsx`.
9. **Seleção Agente↔Equipe**: No `MonitoriaForm`, ao selecionar Agente ou Equipe, o outro campo NUNCA deve ser limpo automaticamente. Se o usuário tentar trocar um campo enquanto o outro está selecionado com valor incompatível, bloqueie com toast informativo. O usuário deve primeiro desselecionar (escolher placeholder) para depois alterar o relacionamento.
10. **Nunca enviar `team_ids` em payload da tabela `users`**: O relacionamento N:N usuário↔equipe é feito via tabela `user_teams`. O frontend enriquece o objeto `User` com `team_ids: string[]` via `enrichUserWithTeamIds()`, mas **nunca** envia `team_ids` em upsert/update Supabase da tabela `users`. Use `syncUserTeams()` para sincronizar.

---

## 2. Padrões de UI / UX

- **Cores**: Use os tokens semânticos definidos em `index.css` (ex: `bg-surface-card`, `text-brand-primary`, `text-level-*`, `text-functional-*`). Não hardcode cores hexadecimais no JSX.
- **Dark Mode**: Configurado via classe `.dark` no `<html>`. As cores de nível de qualidade são **pastel/soft** no dark mode (ex: `#FCA5A5` para ruim). Nunca use cores saturadas em indicadores. Para `input[type="date"]`, use `color-scheme: var(--date-color-scheme, light)` com `.dark` override `--date-color-scheme: dark` para evitar flash preto ao abrir calendário em light mode.
- **Tipografia**: Use sempre `uppercase tracking-widest text-[10px] font-black` para labels, pequenos headers e badges.
- **Bordas e Shadows**: Use `rounded-2xl` ou `rounded-3xl` (nunca bordas quadradas) e `shadow-premium` para cards flutuantes.
- **Animações**: Use `motion` (Framer Motion) para transitions. Evite transições CSS brutas para montar/desmontar componentes. Sidebar accordion usa `AnimatePresence initial={false}` + `motion.div` com smooth height animation + `ChevronDown` com `rotate-180`.
- **Profile Toggle**: Botões de avatar e nome no sidebar usam classe `profile-toggle-btn` para exclusão do click-outside handler. Ao adicionar novos botões toggle no sidebar, inclua essa classe.
- **Ícones**: Use **apenas** `lucide-react`, tamanho padrão `w-5 h-5`. Nunca introduza outra lib de ícones.
- **Dashboard — Categorias Semânticas de Ícones**:
  - Score/Nota → `Target` + cor derivada do nível (level-*)
  - Volume → `ClipboardCheck` + `text-brand-accent`
  - Pendência → `AlertTriangle` + `text-functional-error` ou `text-functional-warning`
  - Aprovação → `CheckCircle2` + `text-functional-success`
  - Rejeição → `XCircle` + `text-functional-error`
  - Tendência → `TrendingUp` + `text-brand-highlight`
  - Info/Contexto → `Users`/`History`/`ClipboardList` + `text-brand-muted`
- **StatCard/RankingWidget**: a cor de fundo do ícone deriva do accent via `getIconBg()` (mapeia `text-*` → `bg-*` automaticamente).
- **Gráficos**: Cores via `chartPalette()`/`chartColorArray()`/`chartColorMap()` de `chartColors.ts` — lê CSS vars em runtime, funciona em light e dark mode.

---

## 3. Checklist de Segurança para Edição

Antes de commitar/sugerir uma alteração:

- [ ] Não quebra o fluxo de prazo de ação (`addBusinessHours`)?
- [ ] O componente funciona em Light **e** Dark mode? (Inputs `type="date"` usam `--date-color-scheme` pattern?)
- [ ] Se adicionou filtro no dashboard, aplicou em `DashboardContext.tsx` e não apenas localmente?
- [ ] Testou o fluxo com o Role correto? (Componente para `suporte` não pode exibir dados de outros agentes)
- [ ] Usou `lucide-react` para ícones (tamanho `w-5 h-5`)?
- [ ] Adicionou suporte no `mockDb` se adicionou query Supabase?
- [ ] Hooks estão no topo do componente, incondicionais?
- [ ] Não hardcodou cores hexadecimais — usou tokens semânticos?
- [ ] Formatação de datas: Supabase armazena UTC, frontend renderiza horário local (-03:00)?
- [ ] Não enviou `team_ids` em payload Supabase da tabela `users` — usou `syncUserTeams()`?

---

## 4. Known Bugs & Pontos de Atenção (Débito Técnico)

Se você for debugar algo, verifique estes pontos conhecidos primeiro:

1. **Action Deadline Sensitivity**: O recálculo de prazos de ação (`recalculateActiveActionDeadlines` em `useQualityConfig`) é uma operação pesada. Não a dispare desnecessariamente (apenas on-save da configuração). O `useQualityConfig()` é um consumer de Context — exige que `<QualityConfigProvider>` esteja acima na árvore (envolve `<MainApp>` em `App.tsx`).
2. **Formatação de Datas**: Use sempre ISO strings para armazenar (`toISOString()`) e converta localmente na hora de renderizar, pois o Supabase armazena em UTC e o frontend no horário local (provavelmente -03:00).
3. **Edge Function SMTP**: As credenciais SMTP no `send-email` foram migradas para env vars (`Deno.env.get()`). Nunca hardcoded credenciais em Edge Functions.
4. **Hook Violations**: Incidentes anteriores com conditional hooks em `MonitoriaForm.tsx`. Mantenha todos os `useX` no topo do componente, sempre incondicionais.
5. **Seleção Agente↔Equipe**: No `MonitoriaForm`, ao selecionar Agente ou Equipe, o outro campo NUNCA deve ser limpo automaticamente. Se o usuário tentar trocar um campo enquanto o outro está selecionado com valor incompatível, bloqueie com toast informativo. O usuário deve primeiro desselecionar (escolher placeholder) para depois alterar o relacionamento.
6. **Constantes no Escopo do Módulo**: Constantes usadas em inicializadores de `useState` (ex: `MOCK_SESSION_KEY`) devem ser declaradas **fora** do componente. Incidente: `MOCK_SESSION_KEY` referenciada em `useState` initializer antes de ser declarada dentro do componente.
7. **Hooks nunca dentro de `useEffect`**: `useCallback`, `useMemo`, `useRef` etc. não podem ser chamados dentro de callbacks de `useEffect`. Use o padrão ref-bridge: atualize um `ref.current` dentro do effect e chame `ref.current()` em um `useCallback` fora do effect. Incidente: `useCallback` dentro de `useEffect` para `extendSession` em `App.tsx`.
8. **Sessão expira ao restaurar (F5)**: Ao restaurar sessão persistida, o sistema verifica `Date.now() - lastActivity` (chave `qualitrack_last_activity` no localStorage). Se idle ≥ 60min ou absolute ≥ 8h, a sessão é descartada. Nunca assuma que sessão restaurada = sessão válida.
9. **Enriquecimento de equipe via `user_teams`**: A coluna `users.team_ids` foi removida. Sempre use `enrichUserWithTeamIds()` para injetar `team_ids` no `userData` após buscar da tabela `users`. Nunca envie `team_ids` em payload de upsert/update da tabela `users` — sincronize via tabela N:N `user_teams` usando `syncUserTeams()`.
10. **Conclusão automática**: Monitorias com `resolution_type === 'automatic'` foram finalizadas pelo cron de prazo de ação. O `RecentAuditsTable` exibe ícone `Clock` ao lado do status para indicar isso. Nunca remova esse indicador visual.
11. **CustomSelect**: Usa React Portal (`createPortal`) para evitar clipping em containers scrolláveis. Possui type-ahead: ao abrir o dropdown, o usuário pode digitar para filtrar opções em tempo real (case-insensitive), sem campo de busca visível. O trigger é `<div>` com `<input>` inline.
12. **Z-index e Clipping**: Resolvido — `CustomSelect` usa React Portal. Se criar novos dropdowns, siga o mesmo padrão.
13. **RLS Infinite Recursion (42P17)**: A função `_private.is_admin_user()` com `SECURITY DEFINER` e `SET search_path = 'public'` é **obrigatória** nas policies `users_select` e `users_admin_write` para evitar recursão infinita (42P17). As policies NUNCA devem usar inline `EXISTS (SELECT 1 FROM public.users WHERE ...)` porque isso triggera a policy novamente → loop infinito. A função fica no schema `_private` (não `public`) para não ser exposta via `/rest/v1/rpc/`.
14. **Date Picker Flash**: `input[type="date"]` usa `color-scheme: var(--date-color-scheme, light)` com `.dark` override. Se adicionar novos date inputs, siga este padrão para evitar flash preto em light mode.
15. **Sidebar Accordion**: Popover de perfil usa `sidebarAccordion` state (single-open). Se adicionar novas seções, siga o padrão `AnimatePresence initial={false}` + `ChevronDown` rotation. Seleção de cor auto-fecha o accordion.
16. **Profile Toggle**: Botões de toggle do sidebar (avatar + nome) usam classe `profile-toggle-btn` para exclusão do click-outside handler. Sem isso, o click-outside fecha o popover antes do toggle.
17. **Scrollbar Gutter**: O container de scroll principal usa `scrollbar-gutter: stable` (inline style) para evitar layout shift quando scrollbar aparece/desaparece.
18. **Auth Hash Race**: `initialUrlHash` e `initialUrlSearch` são capturados no escopo do módulo em `supabase.ts` (antes de `createClient`). `AuthProvider.tsx` usa `isPasswordRecoveryRef.current` como guarda para evitar que `INITIAL_SESSION` sobrescreva a view `change-password`. Nunca remova esse guard.
19. **Anonimato do Auditor**: Agentes (`suporte`) consultam `vw_monitorias_suporte` (view que retorna `NULL` para `evaluator_name` e `evaluator_id`). Implementado em `useMonitoriaData.ts` e `DashboardContext.tsx`. Se adicionar novas queries de monitorias, verifique se a role `suporte` precisa usar a view.
20. **SLA Auto-Finalize Removido do Frontend**: A lógica de auto-finalização de monitorias por SLA foi removida de `useMonitoriaData.ts`. Agora é responsabilidade exclusiva do `pg_cron` server-side (`process_action_deadline_timeouts()`). Não recrie essa lógica no frontend.
21. **Dashboard Query Storm (P4)**: `filters` foi removido das dependências do `useEffect` de `loadData` em `DashboardContext.tsx`. Mudanças de filtro disparam recarga apenas via `debouncedRefresh`. Não adicione `filters` de volta às dependências.
22. **useQualityConfig N+1 (P15)**: O loop sequencial de atualização de monitorias foi convertido para `Promise.all`. Ao adicionar operações batch, sempre use `Promise.all`.
23. **duplicate heartbeat removido (P14)**: `resilienceHeartbeatInterval2` foi removido de `useSessionManager.ts`. Existe apenas um heartbeat interval (`resilienceHeartbeatInterval`).
24. **OfensoresChart sem mock (P9)**: Blocos de dados mockados (`if (isMockMode)`) foram removidos de `OfensoresChart.tsx`. Sempre busque dados reais do contexto.
25. **Mock Mode Production Guard**: `main.tsx` emite `console.error` se `isMockMode && import.meta.env.PROD`. Isso alerta sobre configuração incorreta em produção.
26. **envsubst $PORT**: No `Dockerfile`, use `envsubst '${PORT}'` (com aspas simples) para evitar que o shell interprete `$PORT` como variável antes do `envsubst`.
27. **maybeSingle vs single**: Use `.maybeSingle()` em vez de `.single()` para queries que podem retornar zero linhas. `.single()` retorna erro 406 quando não encontra registros. Aplicado em `useQualityConfig.tsx`.
28. **Auth flowType: 'implicit' obrigatório**: O Supabase client em `supabase.ts` deve usar `flowType: 'implicit'` (não `'pkce'`). Os emails de invite/recovery do Supabase sempre redirecionam com `#access_token=xxx&type=invite` (implicit grant). Com `flowType: 'pkce'`, `_handleAuthRedirect()` ignora `access_token` e a sessão nunca é criada. Se `'pkce'` for usado, o timer de 20s em `AuthProvider.tsx` estoura e exibe erro "expirou ou é inválido".
29. **Auth hash não pode ser sobrescrito durante redirect**: O efeito de sync do `activeTab` em `AuthProvider.tsx` verifica se o hash contém `access_token=`, `type=` ou `code=` antes de sobrescrever `window.location.hash`. Sem esse guard, o hash de autenticação é perdido e o Supabase não consegue processar o redirect.
30. **Timer PKCE limpo no INITIAL_SESSION**: `SIGNED_IN`/`PASSWORD_RECOVERY` podem disparar durante a inicialização do Supabase (antes do React montar). O timer de 20s do PKCE também é limpo no handler de `INITIAL_SESSION` (quando `isInviteFlowRef.current && session`), não apenas nos handlers de `SIGNED_IN`/`PASSWORD_RECOVERY`.
31. **Sidebar Padrão neutro (Gray-800/Gray-600)**: Após redefinição unificada de cores, o "Padrão" usa `#1F2937` (Gray-800 dark) / `#F9F9F6` (light) para **todos os perfis** — sem azul/verde por role. O círculo "Padrão" no seletor de cores deve exibir a mesma cor que será aplicada (não um gradiente). Implementado em `useSidebarManager.ts` (sidebarColors, DEFAULT_SIDEBAR_COLORS) e `index.css` (`--sidebar-bg-*`).
32. **Círculo "Padrão" deve corresponder à cor aplicada**: O primeiro círculo da lista de cores do menu "Cor do Menu" (value: '') mostrava um gradiente low-opacity incorreto (`#474942` visual). Foi alterado para `bg-[#1F2937]` (dark) / `bg-[#F9F9F6]` (light) para que o preview visual corresponda exatamente à cor que o sidebar assume ao selecionar "Padrão". Os mapas de espelhamento (`lightToDarkColorMap`, `darkToLightColorMap`) foram atualizados com `#F9F9F6` ↔ `#1F2937`.
33. **`vw_monitorias_suporte` com `SECURITY INVOKER`**: A view foi alterada de `SECURITY DEFINER` (padrão) para `SECURITY INVOKER` via migration `20260617000002`. Isso garante que as RLS policies da tabela `monitorias` sejam aplicadas quando um usuário `suporte` consulta a view. Sem isso, a view rodava com permissões do criador (admin), bypassando RLS.
34. **`SET search_path` obrigatório em funções SQL**: Toda função SQL (`SECURITY DEFINER`) deve definir `SET search_path TO 'public'` para evitar search_path injection. Aplicado em: `process_action_deadline_timeouts()`, `calculate_action_deadline()`, `update_updated_at()`, `update_user_preferences_updated_at()`, `_private.is_admin_user()`, `_private.is_quality_or_support_user()`, `_private.is_support_manager()`.
35. **Schema `_private` para helpers RLS**: Funções auxiliares de RLS (`is_admin_user`, `is_quality_or_support_user`, `is_support_manager`) ficam no schema `_private` (não `public`) para não serem expostas via Supabase REST API (`/rest/v1/rpc/`). São `SECURITY DEFINER` com `SET search_path = 'public'` para quebrar a recursão (42P17) nas policies da tabela `users`.
36. **`access_requests` INSERT com field validation**: As policies INSERT da tabela `access_requests` foram alteradas de `WITH CHECK (true)` para validação explícita (`name IS NOT NULL AND name <> '' AND email IS NOT NULL AND email <> ''`) para evitar submissão de registros vazios ou inválidos.

---

## 5. Como Iniciar uma Nova Feature

1. **Leia a SPEC correspondente** na pasta `/docs/specs/`.
2. **Identifique a tabela afetada** no `/docs/database/schema.md`.
3. Crie/atualize a interface no arquivo `src/types.ts`.
4. Implemente o componente UI usando a pasta `src/components/ui/` sempre que possível.
5. Se for dado persistente, adicione no `supabase.ts` (para Supabase e MockDb simultaneamente).
6. Se adicionou filtros no dashboard, aplique em `DashboardContext.tsx`.
7. Execute `npm run lint` para verificar tipos.
8. Execute `npm run build` para validar compilação.
9. Teste em Mock Mode e com Supabase (se disponível).
10. Teste em Light e Dark mode.
11. Teste com o role correto (RBAC).
