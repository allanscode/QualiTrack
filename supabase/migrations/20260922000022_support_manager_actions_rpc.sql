-- Support managers can read their team's evaluations, but may change them
-- only through an action-specific RPC. This removes client-controlled status,
-- history, deadlines and unrelated column updates from the REST surface.
DROP POLICY IF EXISTS "monitorias_update_policy" ON public.monitorias;
CREATE POLICY "monitorias_update_policy" ON public.monitorias FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.active
    AND (u.role IN ('admin', 'gestor_qualidade')
      OR (u.role = 'qualidade' AND monitorias.evaluator_id = (SELECT auth.uid()))))
);

CREATE OR REPLACE FUNCTION public.act_on_monitoria_as_support_manager(
  p_monitoria_id UUID, p_action TEXT, p_note TEXT DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_user public.users%ROWTYPE;
  v_row public.monitorias%ROWTYPE;
  v_status TEXT;
  v_description TEXT;
  v_hours NUMERIC;
  v_config JSONB;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = (SELECT auth.uid()) AND active FOR SHARE;
  IF v_user.id IS NULL OR v_user.role <> 'gestor_suporte' THEN
    RAISE EXCEPTION 'Apenas gestor de suporte pode executar esta ação.';
  END IF;
  IF length(coalesce(p_note,'')) > 2000 THEN RAISE EXCEPTION 'Nota muito longa.'; END IF;
  SELECT * INTO v_row FROM public.monitorias WHERE id = p_monitoria_id FOR UPDATE;
  IF v_row.id IS NULL OR NOT v_row.active OR NOT EXISTS (
    SELECT 1 FROM public.user_teams ut WHERE ut.user_id = v_user.id AND ut.team_id = v_row.team_id
  ) THEN RAISE EXCEPTION 'Monitoria indisponível para este gestor.'; END IF;

  IF v_row.status = 'pendente_revisao' AND p_action = 'aceitar' THEN
    v_status := 'concluida'; v_description := 'Monitoria aceita';
  ELSIF v_row.status = 'pendente_revisao' AND p_action = 'contestar' THEN
    v_status := 'em_contestacao'; v_description := 'Contestação realizada';
  ELSIF v_row.status = 'aguardando_gestor_suporte' AND p_action = 'aprovar' THEN
    v_status := 'concluida'; v_description := 'Monitoria aprovada pelo Gestor';
  ELSIF v_row.status = 'aguardando_gestor_suporte' AND p_action = 'escalar' THEN
    v_status := 'aguardando_gestor_qualidade'; v_description := 'Escalado para decisão da Qualidade';
  ELSE RAISE EXCEPTION 'Transição de status não permitida.';
  END IF;

  SELECT config INTO v_config FROM public.quality_configs WHERE active ORDER BY updated_at DESC LIMIT 1;
  v_hours := CASE v_status
    WHEN 'em_contestacao' THEN coalesce((v_config->'action_deadline'->>'auditor_reevaluation')::NUMERIC, 25)
    WHEN 'aguardando_gestor_qualidade' THEN coalesce((v_config->'action_deadline'->>'manager_quality')::NUMERIC, 25)
    ELSE NULL END;

  UPDATE public.monitorias SET
    status = v_status,
    action_deadline_at = CASE WHEN v_hours IS NULL THEN action_deadline_at
      ELSE public.calculate_action_deadline(now(), v_hours) END,
    resolution_type = CASE WHEN v_status = 'concluida' THEN 'human' ELSE resolution_type END,
    contestation_reason = CASE WHEN p_action = 'contestar' THEN p_note ELSE contestation_reason END,
    contestation_result = CASE WHEN p_action IN ('aceitar','aprovar') THEN 'approved' ELSE contestation_result END,
    history = coalesce(v_row.history,'[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'action',v_description,'by_id',v_user.id,'by_name',v_user.name,'at',now(),'note',p_note)),
    updated_at = now()
  WHERE id = v_row.id;
END;
$$;
REVOKE ALL ON FUNCTION public.act_on_monitoria_as_support_manager(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.act_on_monitoria_as_support_manager(UUID, TEXT, TEXT) TO authenticated;
NOTIFY pgrst, 'reload schema';
