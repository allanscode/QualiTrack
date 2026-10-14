-- Filter and aggregate dashboard metrics on the server. The function enforces
-- the caller's role itself because support cannot SELECT public.monitorias.
CREATE OR REPLACE FUNCTION public.dashboard_aggregates(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_team_id uuid DEFAULT NULL,
  p_group_id text DEFAULT NULL,
  p_agent_id uuid DEFAULT NULL,
  p_auditor_id uuid DEFAULT NULL,
  p_form_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_channel text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_role text;
  v_result jsonb;
BEGIN
  SELECT u.role INTO v_role FROM public.users u
  WHERE u.id = (SELECT auth.uid()) AND u.active;
  IF v_role IS NULL OR v_role NOT IN ('suporte','qualidade','gestor_suporte','gestor_qualidade','admin') THEN
    RAISE EXCEPTION 'Acesso negado ao dashboard' USING ERRCODE = '42501';
  END IF;
  IF p_group_id IS NOT NULL AND p_group_id <> '' AND p_group_id <> '__missing_ticket_group__'
    AND p_group_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Grupo inválido' USING ERRCODE = '22023';
  END IF;

  WITH visible AS (
    -- The security-barrier view removes auditor identity and limits support to
    -- the caller's own evaluations. Never expose evaluator data in this branch.
    SELECT s.id, s.created_at, s.score, s.team_id, s.ticket_group_team_id,
      s.evaluated_id, s.evaluator_id, s.form_id, s.status, s.channel
    FROM public.vw_monitorias_suporte s
    WHERE v_role = 'suporte' AND s.active = true
      AND s.evaluated_id = (SELECT auth.uid())
    UNION ALL
    SELECT m.id, m.created_at, m.score, m.team_id, m.ticket_group_team_id,
      m.evaluated_id, m.evaluator_id, m.form_id, m.status, m.channel
    FROM public.monitorias m
    WHERE v_role <> 'suporte' AND m.active = true
      AND (v_role <> 'gestor_suporte' OR EXISTS (
        SELECT 1 FROM public.user_teams ut
        WHERE ut.user_id = (SELECT auth.uid()) AND ut.team_id = m.team_id))
  ), baseline AS (
    SELECT * FROM visible v
    WHERE (p_start_date IS NULL OR v.created_at >= p_start_date::timestamptz)
      AND (p_end_date IS NULL OR v.created_at < (p_end_date + 1)::timestamptz)
      AND (p_team_id IS NULL OR v.team_id = p_team_id)
      AND (CASE
        WHEN p_group_id IS NULL OR p_group_id = '' THEN true
        WHEN p_group_id = '__missing_ticket_group__' THEN v.ticket_group_team_id IS NULL
        ELSE v.ticket_group_team_id = p_group_id::uuid
      END)
      AND (p_auditor_id IS NULL OR v.evaluator_id = p_auditor_id)
      AND (p_form_id IS NULL OR v.form_id = p_form_id)
      AND (p_status IS NULL OR v.status = p_status)
      AND (p_channel IS NULL OR v.channel = p_channel)
  ), selected AS (
    SELECT * FROM baseline b
    WHERE p_agent_id IS NULL OR v_role = 'suporte' OR b.evaluated_id = p_agent_id
  ), agent_scores AS (
    SELECT evaluated_id AS id, count(*)::integer AS count, avg(score)::numeric AS average,
      sum(score)::numeric AS total
    FROM selected WHERE score IS NOT NULL AND evaluated_id IS NOT NULL
    GROUP BY evaluated_id
  ), auditor_scores AS (
    SELECT evaluator_id AS id, count(*)::integer AS count, avg(score)::numeric AS average
    FROM selected WHERE evaluator_id IS NOT NULL
    GROUP BY evaluator_id
  ), team_counts AS (
    SELECT team_id AS id, count(*)::integer AS count FROM selected GROUP BY team_id
  ), group_counts AS (
    SELECT ticket_group_team_id AS id, count(*)::integer AS count
    FROM selected GROUP BY ticket_group_team_id
  ), status_counts AS (
    SELECT status AS id, count(*)::integer AS count FROM selected GROUP BY status
  ), trend_days AS (
    SELECT date_trunc('day', created_at)::date AS period,
      count(*)::integer AS count, avg(score)::numeric AS average
    FROM selected GROUP BY 1
  ), trend_months AS (
    SELECT date_trunc('month', created_at)::date AS period,
      count(*)::integer AS count, avg(score)::numeric AS average
    FROM selected GROUP BY 1
  ), trend_years AS (
    SELECT date_trunc('year', created_at)::date AS period,
      count(*)::integer AS count, avg(score)::numeric AS average
    FROM selected GROUP BY 1
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM selected),
    'scored', (SELECT count(score) FROM selected),
    'average', coalesce((SELECT avg(score) FROM selected), 0),
    'ranking_baseline', (SELECT count(score) FROM baseline),
    'agents', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'count', count, 'average', average,
      'score', total / nullif((SELECT count(score) FROM baseline), 0),
      'badness', (100 * count - total) / nullif((SELECT count(score) FROM baseline), 0)
    ) ORDER BY total DESC, id) FROM agent_scores), '[]'::jsonb),
    'auditors', CASE WHEN v_role = 'suporte' THEN '[]'::jsonb ELSE
      coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'count', count, 'average', average)
        ORDER BY count DESC, id) FROM auditor_scores), '[]'::jsonb) END,
    'teams', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'count', count)
      ORDER BY count DESC, id) FROM team_counts), '[]'::jsonb),
    'groups', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'count', count)
      ORDER BY count DESC, id) FROM group_counts), '[]'::jsonb),
    'statuses', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'count', count)
      ORDER BY count DESC, id) FROM status_counts), '[]'::jsonb),
    'days', coalesce((SELECT jsonb_agg(jsonb_build_object('period', period, 'count', count, 'average', average)
      ORDER BY period) FROM trend_days), '[]'::jsonb),
    'months', coalesce((SELECT jsonb_agg(jsonb_build_object('period', period, 'count', count, 'average', average)
      ORDER BY period) FROM trend_months), '[]'::jsonb),
    'years', coalesce((SELECT jsonb_agg(jsonb_build_object('period', period, 'count', count, 'average', average)
      ORDER BY period) FROM trend_years), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.dashboard_aggregates(date,date,uuid,text,uuid,uuid,uuid,text,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_aggregates(date,date,uuid,text,uuid,uuid,uuid,text,text)
  TO authenticated;
