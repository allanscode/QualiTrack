BEGIN;

-- A positive score already corrected by Quality must remain a final decision
-- when its status is closed in a later save. The score need not change again.
DO $$
DECLARE
  v_definition text;
  v_start integer;
  v_end integer;
  v_old text;
  v_new text := $replacement$
  IF (
    _private.current_active_role() IN ('admin','gestor_qualidade')
    OR (
      current_user = 'postgres'
      AND auth.uid() IS NULL
      AND current_setting('app.quality_final_backfill', true) = OLD.id::text
      AND jsonb_typeof(OLD.history) = 'array'
      AND jsonb_array_length(OLD.history) > 0
      AND EXISTS (
        SELECT 1
        FROM public.users actor
        WHERE actor.id = CASE
          WHEN OLD.history->(jsonb_array_length(OLD.history)-1)->>'by_id' ~* '^[0-9a-f-]{36}$'
          THEN (OLD.history->(jsonb_array_length(OLD.history)-1)->>'by_id')::uuid
          ELSE NULL
        END
          AND actor.active IS TRUE
          AND actor.role IN ('admin','gestor_qualidade')
      )
    )
  )
    AND OLD.active IS TRUE
    AND OLD.status IN ('pendente_revisao','aguardando_gestor_suporte')
    AND NEW.score >= 75
    AND NEW.status = 'concluida' THEN
    NEW.pj_review_required := false;
    NEW.resolution_type := 'human';
    NEW.action_deadline_at := NULL;
  ELSE
    NEW.pj_review_required := OLD.pj_review_required
      OR (coalesce(v_is_pj, false) AND NOT ((NEW.score >= 75) IS TRUE) AND NOT v_standard_positive_critical);
  END IF;
$replacement$;
BEGIN
  v_definition := pg_get_functiondef('public.enforce_pj_review_route()'::regprocedure);
  v_start := strpos(v_definition, '  IF _private.current_active_role() IN (''admin'',''gestor_qualidade'')');
  IF v_start = 0 THEN
    RAISE EXCEPTION 'Quality finalization branch not found; migration stopped without changes.';
  END IF;
  v_end := strpos(substr(v_definition, v_start), '  END IF;');
  IF v_end = 0 THEN
    RAISE EXCEPTION 'Quality finalization branch is incomplete; migration stopped without changes.';
  END IF;
  v_end := v_start + v_end + length('  END IF;') - 1;
  v_old := substr(v_definition, v_start, v_end - v_start + 1);
  IF position('OLD.score IS DISTINCT FROM NEW.score' IN v_old) = 0 THEN
    RAISE EXCEPTION 'Unexpected quality finalization branch; migration stopped without changes.';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);
END;
$$;

-- Apply the already recorded Quality decision to active, latest, positive
-- monitorias whose last editor is an active Quality Manager/Admin. This is
-- deliberately bounded to pending rows with a valid ticket and non-child form.
DO $$
DECLARE
  r record;
  v_last jsonb;
  v_actor public.users%ROWTYPE;
  v_decision jsonb;
  v_system jsonb;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT m.id, m.ticket_id, m.score, m.history, m.contestation_result
    FROM public.monitorias m
    WHERE m.active IS TRUE
      AND m.status = 'pendente_revisao'
      AND m.score >= 75
      AND btrim(m.ticket_id) ~ '^[0-9]+$'
      AND m.form_id NOT IN (
        '6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid,
        '6c7d1e88-841b-4da9-9a66-9f1464ce8970'::uuid,
        '6c7d1e88-841b-4da9-9a66-9f1464ce8971'::uuid,
        '6c7d1e88-841b-4da9-9a66-9f1464ce8972'::uuid,
        '6c7d1e88-841b-4da9-9a66-9f1464ce8973'::uuid
      )
      AND coalesce(m.form_snapshot->>'ticket_kind','') <> 'chamado_filho'
      AND coalesce(m.form_snapshot->>'automation','') <> 'child_ticket'
      AND NOT EXISTS (
        SELECT 1 FROM public.monitorias newer
        WHERE newer.ticket_id = m.ticket_id AND newer.active IS TRUE
          AND newer.created_at > m.created_at
      )
      AND jsonb_typeof(m.history) = 'array'
      AND jsonb_array_length(m.history) > 0
      AND EXISTS (
        SELECT 1 FROM public.users actor
        WHERE actor.id = CASE
          WHEN m.history->(jsonb_array_length(m.history)-1)->>'by_id' ~* '^[0-9a-f-]{36}$'
          THEN (m.history->(jsonb_array_length(m.history)-1)->>'by_id')::uuid
          ELSE NULL
        END
          AND actor.active IS TRUE
          AND actor.role IN ('admin','gestor_qualidade')
      )
    ORDER BY m.ticket_id
    FOR UPDATE OF m
  LOOP
    v_last := r.history->(jsonb_array_length(r.history)-1);
    SELECT * INTO v_actor FROM public.users
    WHERE id = (v_last->>'by_id')::uuid AND active IS TRUE
      AND role IN ('admin','gestor_qualidade');
    IF v_actor.id IS NULL THEN
      RAISE EXCEPTION 'Quality decision actor changed for monitoria %; reconciliation stopped.', r.id;
    END IF;

    PERFORM set_config('app.quality_final_backfill', r.id::text, true);
    v_decision := jsonb_build_object(
      'action', 'Veredito final ajustado pela Gestão da Qualidade (nota >=75%)',
      'by_id', v_actor.id,
      'by_name', v_actor.name,
      'at', now(),
      'note', left(coalesce(v_last->>'note', 'Ajuste final da Gestão da Qualidade')
        || format(' | Nota final %s%%; conclusão aplicada automaticamente sem retorno ao Gestor de Suporte.', r.score), 2000)
    );
    v_system := jsonb_build_object(
      'action', 'Monitoria concluída automaticamente após decisão final da Qualidade',
      'by_id', NULL,
      'by_name', 'Sistema',
      'at', now(),
      'note', format('Ticket #%s concluído com nota final %s%% conforme a decisão registrada pela Gestão da Qualidade.', r.ticket_id, r.score)
    );

    UPDATE public.monitorias
    SET status = 'concluida',
        pj_review_required = false,
        resolution_type = 'human',
        action_deadline_at = NULL,
        contestation_result = CASE WHEN contestation_result = 'pending' THEN 'approved' ELSE contestation_result END,
        history = coalesce(history, '[]'::jsonb) || jsonb_build_array(v_decision, v_system),
        updated_at = now()
    WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;

  -- Fresh installations have no production decisions to reconcile. The migration
  -- still applies every row matching the recorded final-decision predicates.
  RAISE NOTICE 'Final Quality decisions reconciled: %', v_count;
END;
$$;

COMMIT;
