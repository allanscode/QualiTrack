-- Match the active, ordered list and the principal dashboard scope filters.
-- The existing idx_monitorias_created_at already serves the unfiltered list.
-- Keep it until real EXPLAIN ANALYZE plans justify replacing or dropping it.
CREATE INDEX IF NOT EXISTS idx_monitorias_team_created_id_active
  ON public.monitorias (team_id, created_at DESC, id DESC)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_monitorias_evaluated_created_id_active
  ON public.monitorias (evaluated_id, created_at DESC, id DESC)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_monitorias_group_created_id_active
  ON public.monitorias (ticket_group_team_id, created_at DESC, id DESC)
  WHERE active = true AND ticket_group_team_id IS NOT NULL;

-- The PJ reviewer view is restricted by pj_reviewer_id. Its existing index
-- (pj_reviewer_id, status) is useful for status predicates, but cannot deliver
-- the list directly in created_at order.
CREATE INDEX IF NOT EXISTS idx_monitorias_pj_reviewer_created_id_active
  ON public.monitorias (pj_reviewer_id, created_at DESC, id DESC)
  WHERE active = true AND pj_reviewer_id IS NOT NULL;
