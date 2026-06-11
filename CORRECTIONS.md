# Plano de Correções — QualiTrack Audit

## 🎯 Abordagem
Bloquear e Corrigir (do crítico para o menos crítico).
Testar após cada alteração para evitar quebra.

## 🗓️ Progresso
- [x] Fase P0 — Bloqueantes (Segurança, Qualidade, Tipagem)
- [ ] Fase P1 — Essenciais (Testes, CI/CD, Cache, Auth)
- [ ] Fase P2 — Melhorias (Performance, Acessibilidade, Observabilidade)
- [ ] Fase P3 — Otimizações (Docker, SEO, Bundle)

---

## ✅ CHECKLIST DETALHADO

### **FASE P0 — BLOQUEANTES (Não entra em produção sem isso)**

#### P0.1 [x] Corrigir RLS `users_select`
- **Arquivo**: `supabase/migrations/20260609000001_security_audit_rls.sql`
- **Problema**: `FOR SELECT TO authenticated USING (true)` permite ler TODOS usuários
- **Critério de Aceite**: Users só veem próprios dados ou admin/auditor role
- **Status**: ✅ Done
- **Teste**: Query Supabase com user comum deve retornar apenas seu próprio registro

#### P0.2 [x] Implementar CSP e Headers de Segurança
- **Arquivo**: `index.html` + `vite.config.ts`
- **Problema**: Ausência de CSP, X-Frame-Options, X-Content-Type-Options, HSTS
- **Critério de Aceite**: Headers presentes, dark mode script inline com hash SHA-256
- **Status**: ✅ Done
- **Teste**: Verificar headers no DevTools > Network; CSP válido no build
- **Commit**: 493ec0d
- **Data**: 2026-06-10

#### P0.3 [x] Habilitar `strict: true` no TypeScript
- **Arquivo**: `tsconfig.json` + `src/**/*.ts` + `src/**/*.tsx`
- **Problema**: `strict: false`, `any` em estados críticos
- **Critério de Aceite**: `tsc --noEmit` passa sem erros, `any` removido de auth/session
- **Status**: ✅ Done
- **Teste**: `npm run lint` (ou `npx tsc --noEmit`) passando
- **Commit**: 902ccb9
- **Data**: 2026-06-10

#### P0.4 [ ] Refatorar Componentes Monolíticos (Parte 1: App.tsx)
- **Arquivo**: `src/App.tsx`
- **Problema**: 1.859+ linhas, múltiplas responsabilidades
- **Critério de Aceite**: Extrair: ThemeProvider, AuthProvider, SessionManager, IdleTimeoutManager
- **Status**: 🔄 Em progresso
- **Teste**: App renderiza, login/logout e idle timeout funcionam

##### P0.4.1 [x] Extrair ThemeProvider
- **Arquivo**: `src/providers/ThemeProvider.tsx` (novo)
- **Status**: ✅ Done
- **Commit**: 6d9d819
- **Data**: 2026-06-10
- **Teste**: `npm run lint` + `npm run build` passando

##### P0.4.2 [x] Extrair AuthProvider
- **Arquivo**: `src/providers/AuthProvider.tsx` (novo, 873 linhas)
- **Status**: ✅ Done
- **Data**: 2026-06-10
- **Resultado**: App.tsx: 1780→1061 linhas (-40%). Toda lógica de auth, sessão, idle timeout, reconexão e handlers migrada para AuthProvider
- **Migrado**: Auth lifecycle useEffect, session resilience, idle timeout + warning, proactive refresh, handleLogin, handleLogout, handleForgotPassword, handleUpdatePassword, handleRequestAccess, handleUserSession, enrichUserWithTeamIds, ref-bridge pattern, activeTab/hash sync, sidebar contrast derived values
- **Teste**: `npm run lint` + `npm run build` passando (0 erros)

##### P0.4.3 [x] Extrair useSessionManager hook
- **Arquivo**: `src/hooks/useSessionManager.ts` (novo, ~297 linhas)
- **Status**: ✅ Done
- **Data**: 2026-06-11
- **Resultado**: AuthProvider.tsx: 873→629 linhas (-28%). Lógica de sessão extraída
- **Migrado**: Session resilience/reconnection useEffect, idle timeout + warning + absolute timeout useEffect, extendSession ref-bridge pattern, `lastDbThemeRef`, all timeout constants (`IDLE_TIMEOUT_MS`, `IDLE_WARNING_MS`, `ABSOLUTE_TIMEOUT_MS`, `SESSION_REFRESH_MS`, `MOCK_SESSION_KEY`, `LAST_ACTIVITY_KEY`)
- **Deduplicado**: Constantes agora só em useSessionManager.ts; `lastDbThemeRef` exportado e importado por AuthProvider e App.tsx
- **Teste**: `npm run lint` + `npm run build` passando (0 erros)

##### P0.4.4 [x] Extrair useSidebarManager hook
- **Arquivo**: `src/hooks/useSidebarManager.ts` (novo, ~264 linhas)
- **Status**: ✅ Done
- **Data**: 2026-06-11
- **Resultado**: App.tsx: 1061→840 linhas (-21%). Lógica de sidebar/theme extraída
- **Migrado**: sidebarColor state, theme sync effects (prevThemeUserIdRef, prevThemeForDbRef), sidebar color sync effect, handleSidebarColorChange, handleThemeChange, sidebarColors presets (light/dark), contrast derivation (sidebarIsDark, sidebarContrastClass, sidebarContrastSubtle, sidebarBorderClass), sidebarStyle, color mirroring maps (lightToDarkColorMap, darkToLightColorMap), `isDarkColor` utility
- **Deduplicado**: `isDarkColor` removido de App.tsx e AuthProvider.tsx — agora única fonte em useSidebarManager.ts. Color maps removidos de App.tsx. Fixed duplicate keys em darkToLightColorMap (`#7A431D`, `#3C4E2D`)
- **Teste**: `npm run lint` + `npm run build` passando (0 erros)

#### P0.4 [x] Refatorar Componentes Monolíticos (Parte 1: App.tsx) — COMPLETO
- **Status**: ✅ Done
- **Resultado final**: App.tsx: 1.780→840 linhas (-53%). 4 novos arquivos criados
- **Arquivos criados**: `ThemeProvider.tsx` (87), `AuthProvider.tsx` (629), `useSessionManager.ts` (297), `useSidebarManager.ts` (264)
- **Teste**: `npm run lint` + `npm run build` passando

#### P0.5 [x] Refatorar MonitoriaList.tsx
- **Arquivo**: `src/components/MonitoriaList.tsx`
- **Problema**: 1.003 linhas, estado extenso misturado com UI
- **Critério de Aceite**: Extrair hooks de data, filters, actions
- **Status**: ✅ Done
- **Commit**: 8c52164
- **Data**: 2026-06-11
- **Resultado**: MonitoriaList.tsx: 1003→672 linhas (-33%). 3 novos hooks criados
- **Arquivos criados**: `useMonitoriaData.ts` (~214 linhas), `useMonitoriaFilters.ts` (~50 linhas), `useMonitoriaActions.ts` (~110 linhas)
- **Migrado**: Data fetch + RBAC query + retry w/ backoff + auto-finalize + realtime subscription + reconnection + failsafe timer → useMonitoriaData; 8 filter states + hasActiveFilters + clearFilters → useMonitoriaFilters; action modal + handleAction + status transitions + deadline calc → useMonitoriaActions
- **Teste**: `npm run lint` + `npm run build` passando (0 erros)

#### P0.6 [x] Refatorar MonitoriaForm.tsx
- **Arquivo**: `src/components/MonitoriaForm.tsx`
- **Problema**: 854 linhas, validação, cálculo e UI misturados
- **Critério de Aceite**: Extrair hooks de form state, validation e save
- **Status**: ✅ Done
- **Commit**: 1ef190b
- **Data**: 2026-06-11
- **Resultado**: MonitoriaForm.tsx: 854→667 linhas (-22%). 2 novos hooks criados
- **Arquivos criados**: `useMonitoriaFormState.ts` (87 linhas), `useMonitoriaSave.ts` (190 linhas)
- **Migrado**: 7 useState (step, header, scores, observations, criticalErrors, criticalErrorObservations, dissatisfactionAnswers) + selectedForm/score memos + clientFieldsToShow/qualityFieldsToShow memos + handleCheckboxChange → useMonitoriaFormState; validateStep (3-step validation) + isAllAnswered + handleSave (payload build, deadline calc, Supabase/mockDb CRUD, history entry) → useMonitoriaSave
- **Teste**: `npm run lint` + `npm run build` passando (0 erros)

---

### **FASE P1 — ESSENCIAIS (Qualidade e Entrega)**

#### P1.1 [x] Setup Vitest + React Testing Library
- **Arquivos**: `vitest.config.ts`, `src/test/setup.tsx`, `src/test/smoke.test.ts`
- **Critério de Aceite**: `npm test` executa e passa (com testes básicos)
- **Status**: ✅ Done
- **Data**: 2026-06-11
- **Resultado**: Vitest 4.1.8 + jsdom + @testing-library/react + @testing-library/jest-dom configurado. `npm test` passa (2 testes smoke). `npm run lint` + `npm run build` passando (0 erros).
- **Teste**: `npm test` (vitest run) passando

#### P1.2 [x] Testes Críticos — qualityMath.ts
- **Arquivos**: `src/utils/qualityMath.test.ts`
- **Critério de Aceite**: Cobrir cálculo de score, erros críticos, N/A
- **Status**: ✅ Done
- **Data**: 2026-06-11
- **Resultado**: 18 testes cobrindo: score ponderado (100%, 0%, pesos variados), exclusão N/A (redenistribuição de peso seção), erros críticos (is_critical + NAO, legacy criticalErrors), casos de borda (undefined/null/empty form, all NA, bounds 0-100, arredondamento), cenário complexo multi-seção
- **Teste**: `npm test` passa (20 testes total: 2 smoke + 18 qualityMath)

#### P1.3 [x] Testes Críticos — businessHours.ts
- **Arquivos**: `src/lib/businessHours.test.ts`
- **Critério de Aceite**: Cobrir addBusinessHours, getRemainingBusinessSeconds, feriados
- **Status**: ✅ Done
- **Data**: 2026-06-11
- **Resultado**: 25 testes cobrindo: addBusinessHours (mesmo dia, próximo dia, fim de semana, feriados, config customizada, snap antes/depois do expediente, horas grandes), getRemainingBusinessSeconds (mesmo dia, múltiplos dias, fim de semana, feriado, deadline passado, config customizada), edge cases (virada de ano, ano bissexto, milliseconds). 45 testes totais passando.
- **Teste**: `npm test` passa (45 testes total: 2 smoke + 18 qualityMath + 25 businessHours)

#### P1.4 [ ] Testes Críticos — contestation.ts
- **Arquivos**: `src/lib/contestation.test.ts`
- **Critério de Aceite**: Cobrir isApprovalAction, isRejectionAction, countContestationOutcomes
- **Status**: ⬜ Pending

#### P1.5 [ ] Implementar CI/CD (GitHub Actions)
- **Arquivos**: `.github/workflows/qualitrack.yml`
- **Critério de Aceite**: Pipeline de lint → typecheck → test → build → deploy
- **Status**: ⬜ Pending

#### P1.6 [ ] Migrar flowType para 'pkce'
- **Arquivo**: `src/lib/supabase.ts`
- **Critério de Aceite**: `flowType: 'pkce'` em dev/prod, login funciona
- **Status**: ⬜ Pending

#### P1.7 [ ] Rate Limiting nas Edge Functions
- **Arquivos**: `supabase/functions/admin-invite-user/index.ts`
- **Critério de Aceite**: Bloquear após X requisições por minuto
- **Status**: ⬜ Pending

#### P1.8 [ ] Implementar Cache de Dados (React Query)
- **Arquivos**: `src/lib/queryClient.ts`, `src/components/**`
- **Critério de Aceite**: StaticDataContext e DashboardContext usam React Query
- **Status**: ⬜ Pending

#### P1.9 [ ] Virtualização em Listas
- **Arquivo**: `src/components/MonitoriaList.tsx`
- **Critério de Aceite**: `react-window` ou `react-virtualized` para listas > 50 itens
- **Status**: ⬜ Pending

---

### **FASE P2 — MELHORIAS**

#### P2.1 [ ] Remover useMemo Triviais
- **Arquivos**: `src/components/dashboard/roles/*.tsx`
- **Critério de Aceite**: useMemo apenas em cálculos pesados (>1ms)
- **Status**: ⬜ Pending

#### P2.2 [ ] Observabilidade (Sentry)
- **Arquivo**: `src/main.tsx`, `src/components/ErrorBoundary.tsx`
- **Critério de Aceite**: Erros capturados e enviados para Sentry
- **Status**: ⬜ Pending

#### P2.3 [ ] Acessibilidade (WCAG)
- **Arquivos**: `src/components/ui/CustomSelect.tsx`, `src/**/*.tsx`
- **Critério de Aceite**: Keyboard navigation, ARIA labels, contraste WCAG 2.1 AA
- **Status**: ⬜ Pending

---

### **FASE P3 — OTIMIZAÇÕES**

#### P3.1 [ ] Dockerfile e Docker Compose
- **Arquivos**: `Dockerfile`, `docker-compose.yml`, `.dockerignore`
- **Critério de Aceite**: `docker build` e `docker run` funcionam
- **Status**: ⬜ Pending

#### P3.2 [ ] SEO Meta Tags
- **Arquivo**: `index.html`
- **Critério de Aceite**: description, OG tags, sitemap
- **Status**: ⬜ Pending

#### P3.3 [ ] Bundle Optimization
- **Arquivo**: `vite.config.ts`
- **Critério de Aceite**: Tree-shaking Recharts, analisar com bundle-analyzer
- **Status**: ⬜ Pending