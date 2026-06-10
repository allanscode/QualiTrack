# Plano de Correções — QualiTrack Audit

## 🎯 Abordagem
Bloquear e Corrigir (do crítico para o menos crítico).
Testar após cada alteração para evitar quebra.

## 🗓️ Progresso
- [ ] Fase P0 — Bloqueantes (Segurança, Qualidade, Tipagem)
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
- **Problema**: 1.100+ linhas, múltiplas responsabilidades
- **Critério de Aceite**: Extrair: ThemeProvider, AuthProvider, SessionManager, IdleTimeoutManager
- **Status**: ⬜ Pending
- **Teste**: App renderiza, login/logout e idle timeout funcionam

#### P0.5 [ ] Refatorar MonitoriaList.tsx
- **Arquivo**: `src/components/MonitoriaList.tsx`
- **Problema**: 1.002 linhas, estado extenso misturado com UI
- **Critério de Aceite**: Extrair MonitoriaFilters, MonitoriaTable, ActionModal, useMonitoriaActions
- **Status**: ⬜ Pending
- **Teste**: Listagem, filtros, ações funcionam igual

#### P0.6 [ ] Refatorar MonitoriaForm.tsx
- **Arquivo**: `src/components/MonitoriaForm.tsx`
- **Problema**: 854 linhas, validação, cálculo e UI misturados
- **Critério de Aceite**: Extrair HeaderForm, ScoringForm, useMonitoriaValidation
- **Status**: ⬜ Pending
- **Teste**: Formulário 4 etapas, cálculo de score, reavaliação funcionam

---

### **FASE P1 — ESSENCIAIS (Qualidade e Entrega)**

#### P1.1 [ ] Setup Vitest + React Testing Library
- **Arquivos**: `vitest.config.ts`, `src/**/*.test.ts`
- **Critério de Aceite**: `npm test` executa e passa (com testes básicos)
- **Status**: ⬜ Pending

#### P1.2 [ ] Testes Críticos — qualityMath.ts
- **Arquivos**: `src/utils/qualityMath.test.ts`
- **Critério de Aceite**: Cobrir cálculo de score, erros críticos, N/A
- **Status**: ⬜ Pending

#### P1.3 [ ] Testes Críticos — businessHours.ts
- **Arquivos**: `src/lib/businessHours.test.ts`
- **Critério de Aceite**: Cobrir addBusinessHours, getRemainingBusinessSeconds, feriados
- **Status**: ⬜ Pending

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