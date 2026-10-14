-- Read-only EXPLAIN template for a staging database with representative data.
-- Replace the two UUID placeholders with IDs from that database. Run once per
-- active profile (admin, qualidade, gestor_qualidade, gestor_suporte, suporte).
-- Execute only the SELECT blocks relevant to the chosen profile. Keep the
-- transaction and ROLE/JWT setup: without them, RLS plans are misleading.
BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL ROLE authenticated;
SET LOCAL statement_timeout = '30s';
SELECT set_config('request.jwt.claim.sub', '<USER_UUID>', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

-- Verify the selected profile before interpreting any plan. The user must be
-- active and their role must match the profile being measured.
SELECT id, role, active FROM public.users WHERE id = auth.uid();

-- Unfiltered list. admin/qualidade/gestor_qualidade only; uses the existing
-- partial created_at index when the table is large enough for it to win.
EXPLAIN (ANALYZE, BUFFERS, SETTINGS)
SELECT id, created_at, team_id, evaluated_id, score, status
FROM public.monitorias
WHERE active = true
ORDER BY created_at DESC, id DESC
LIMIT 50;

-- Team-scoped list. Use a real team available to gestor_suporte.
EXPLAIN (ANALYZE, BUFFERS, SETTINGS)
SELECT id, created_at, team_id, evaluated_id, score, status
FROM public.monitorias
WHERE active = true AND team_id = '<TEAM_UUID>'::uuid
ORDER BY created_at DESC, id DESC
LIMIT 50;

-- Representative filtered/deeper page. Adjust the filters and offset to
-- match actual traffic, including status, dates, form and ticket group.
EXPLAIN (ANALYZE, BUFFERS, SETTINGS)
SELECT id, created_at, team_id, evaluated_id, score, status
FROM public.monitorias
WHERE active = true AND team_id = '<TEAM_UUID>'::uuid
  AND created_at >= (current_date - interval '90 days')
  AND status = 'concluida'
ORDER BY created_at DESC, id DESC
LIMIT 50 OFFSET 250;

-- Support's self-only anonymized view. Never substitute the base table.
EXPLAIN (ANALYZE, BUFFERS, SETTINGS)
SELECT id, created_at, team_id, evaluated_id, score, status
FROM public.vw_monitorias_suporte
WHERE active = true
ORDER BY created_at DESC, id DESC
LIMIT 50;

-- The separate anonymous PJ reviewer queue uses pj_reviewer_id internally.
EXPLAIN (ANALYZE, BUFFERS, SETTINGS)
SELECT id, created_at, team_id, evaluated_id, score, status
FROM public.vw_monitorias_pj_reviewer
WHERE active = true
ORDER BY created_at DESC, id DESC
LIMIT 50;

-- Filtered dashboard aggregate request. The Function Scan reports RPC wall
-- time, not the plans of SQL statements executed inside the PL/pgSQL function.
-- Use a representative date range and filters; NULL means no filter.
EXPLAIN (ANALYZE, BUFFERS, SETTINGS)
SELECT public.dashboard_aggregates(
  (current_date - interval '30 days')::date, current_date,
  '<TEAM_UUID>'::uuid, NULL, NULL, NULL, NULL, NULL, NULL
);

ROLLBACK;
