-- Service-only transition when Zendesk itself reports a legacy child ticket closed.
-- The estimated deadline never drives this transition.
CREATE FUNCTION public.reconcile_legacy_child_closed(p_ticket_id text, p_checked_at timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  IF p_ticket_id !~ '^[0-9]{1,15}$' OR p_checked_at IS NULL
    OR p_checked_at > now() + interval '5 minutes'
    OR p_checked_at < now() - interval '1 hour' THEN
    RAISE EXCEPTION 'Confirmação Zendesk inválida.';
  END IF;
  UPDATE public.monitorias m SET
    status = 'concluida',
    concluded_at = p_checked_at,
    action_deadline_at = NULL,
    updated_at = p_checked_at,
    form_snapshot = jsonb_set(m.form_snapshot, '{legacy_zendesk_status}', '"closed"'::jsonb, true),
    history = coalesce(m.history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'action', 'Fechamento confirmado no Zendesk',
      'by_id', NULL, 'by_name', 'Sistema', 'at', p_checked_at,
      'note', 'Ticket fechado no Zendesk; monitoria histórica concluída após confirmação do status.'))
  WHERE btrim(m.ticket_id) = p_ticket_id
    AND m.active AND m.status = 'pendente_revisao' AND m.score < 75
    AND NOT m.pj_review_required
    AND m.form_snapshot->>'legacy_source' = 'zendesk_child_note'
    AND m.form_snapshot->>'legacy_zendesk_status' = 'solved'
  RETURNING m.id INTO v_id;
  RETURN v_id IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public.reconcile_legacy_child_closed(text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_legacy_child_closed(text,timestamptz) TO service_role;

CREATE FUNCTION _private.invoke_legacy_zendesk_closure_worker() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_url text; v_key text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.monitorias m WHERE m.active
    AND m.status = 'pendente_revisao' AND m.score < 75
    AND m.form_snapshot->>'legacy_source' = 'zendesk_child_note'
    AND m.form_snapshot->>'legacy_zendesk_status' = 'solved') THEN RETURN; END IF;
  IF to_regclass('vault.decrypted_secrets') IS NULL OR to_regnamespace('net') IS NULL THEN RETURN; END IF;
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name='positive_ai_project_url' LIMIT 1;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='positive_ai_service_key' LIMIT 1;
  IF nullif(v_url,'') IS NULL OR nullif(v_key,'') IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(url:=v_url||'/functions/v1/legacy-zendesk-closure-sync',
    headers:=jsonb_build_object('Content-Type','application/json','apikey',v_key),
    body:='{}'::jsonb,timeout_milliseconds:=30000);
END $$;
REVOKE ALL ON FUNCTION _private.invoke_legacy_zendesk_closure_worker() FROM PUBLIC,anon,authenticated,service_role;

-- Schedule only in production after deploying and verifying the Edge Function.
-- Staging intentionally keeps its cron jobs disabled.
