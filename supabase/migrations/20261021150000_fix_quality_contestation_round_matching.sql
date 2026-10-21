-- Keep the quality decision RPC tolerant of Portuguese accents and legacy
-- double-encoded history while validating manager-uploaded attachments.
CREATE OR REPLACE FUNCTION public.act_on_monitoria_as_quality_manager(
  p_monitoria_id uuid, p_action text, p_note text DEFAULT NULL,
  p_attachments jsonb DEFAULT '[]'::jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user public.users%ROWTYPE;
  v_row public.monitorias%ROWTYPE;
  v_round integer;
  v_action text;
  v_note text := btrim(coalesce(p_note, ''));
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = (SELECT auth.uid()) AND active FOR SHARE;
  IF v_user.id IS NULL OR v_user.role NOT IN ('admin', 'gestor_qualidade') THEN
    RAISE EXCEPTION 'Apenas a Gestão da Qualidade pode decidir esta contestação.';
  END IF;

  SELECT * INTO v_row FROM public.monitorias WHERE id = p_monitoria_id FOR UPDATE;
  IF v_row.id IS NULL OR NOT v_row.active OR v_row.status <> 'aguardando_gestor_qualidade' THEN
    RAISE EXCEPTION 'Esta avaliação não aguarda decisão da Qualidade.';
  END IF;
  IF length(v_note) > 2000 OR jsonb_typeof(p_attachments) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_attachments) > 20 OR p_attachments <> '[]'::jsonb THEN
    RAISE EXCEPTION 'Nota ou anexos inválidos para esta decisão.';
  END IF;

  SELECT count(*) INTO v_round FROM jsonb_array_elements(coalesce(v_row.history, '[]'::jsonb)) h
  WHERE lower(h->>'action') LIKE 'contesta%o realizada pelo gestor de suporte%'
    OR lower(h->>'action') LIKE 'gestor pj encaminhou contesta%';
  IF p_action NOT IN ('aprovar', 'manter', 'invalidar')
    OR (p_action = 'manter' AND v_round <> 1)
    OR (p_action = 'invalidar' AND v_round < 2) THEN
    RAISE EXCEPTION 'Decisão incompatível com a rodada da contestação.';
  END IF;

  v_action := CASE p_action
    WHEN 'manter' THEN 'Primeira contestação negada pela Gestão da Qualidade; retorno ao Gestor de Suporte'
    WHEN 'invalidar' THEN 'Decisão definitiva da Qualidade: avaliação invalidada'
    ELSE 'Contestação validada pela Gestão da Qualidade; decisão final' END;
  UPDATE public.monitorias SET
    status = CASE WHEN p_action = 'manter' THEN 'aguardando_gestor_suporte' ELSE 'concluida' END,
    action_deadline_at = CASE WHEN p_action = 'manter' THEN action_deadline_at ELSE NULL END,
    resolution_type = CASE WHEN p_action = 'manter' THEN resolution_type ELSE 'human' END,
    contestation_result = CASE WHEN p_action = 'aprovar' THEN 'approved' ELSE 'rejected' END,
    history = coalesce(v_row.history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'action', v_action, 'by_id', v_user.id, 'by_name', v_user.name,
      'at', now(), 'note', v_note)),
    updated_at = now()
  WHERE id = v_row.id;
END;
$$;

REVOKE ALL ON FUNCTION public.act_on_monitoria_as_quality_manager(uuid, text, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.act_on_monitoria_as_quality_manager(uuid, text, text, jsonb)
  TO authenticated;
