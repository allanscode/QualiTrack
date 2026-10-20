-- Recalculate the rubric in the transaction that applies a candidate.
CREATE FUNCTION _private.active_candidate_score(p_form jsonb, p_result jsonb)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE s jsonb; q jsonb; c jsonb; v_answer text; v_weight numeric; v_total numeric := 0;
  v_active numeric := 0; v_count integer; v_seen text[] := '{}';
BEGIN
  IF jsonb_typeof(p_form->'sections') <> 'array' OR jsonb_array_length(p_form->'sections') = 0
    OR jsonb_typeof(p_result->'suggested_answers') <> 'object'
    OR jsonb_typeof(coalesce(p_form->'critical_errors','[]'::jsonb)) <> 'array'
    OR jsonb_typeof(coalesce(p_result->'suggested_critical_errors','{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Ficha ou respostas inválidas.';
  END IF;
  FOR s IN SELECT value FROM jsonb_array_elements(p_form->'sections') LOOP
    IF jsonb_typeof(s->'questions') <> 'array' OR jsonb_typeof(s->'weight') <> 'number' THEN
      RAISE EXCEPTION 'Seção da ficha inválida.';
    END IF;
    v_weight := (s->>'weight')::numeric;
    IF v_weight < 0 OR v_weight > 100 THEN RAISE EXCEPTION 'Peso inválido.'; END IF;
    v_count := 0;
    FOR q IN SELECT value FROM jsonb_array_elements(s->'questions') LOOP
      IF q->>'id' IS NULL OR q->>'id' = ANY(v_seen) THEN RAISE EXCEPTION 'IDs da ficha inválidos.'; END IF;
      v_seen := array_append(v_seen, q->>'id');
      v_answer := p_result->'suggested_answers'->>(q->>'id');
      IF v_answer NOT IN ('SIM','NAO','NA') OR v_answer IS NULL THEN RAISE EXCEPTION 'Resposta ausente ou inválida.'; END IF;
      IF v_answer <> 'NA' THEN v_count := v_count + 1; END IF;
      IF coalesce((q->>'is_critical')::boolean,false) AND v_answer = 'NAO' THEN RETURN 0; END IF;
    END LOOP;
    IF v_count > 0 THEN
      FOR q IN SELECT value FROM jsonb_array_elements(s->'questions') LOOP
        v_answer := p_result->'suggested_answers'->>(q->>'id');
        IF v_answer <> 'NA' THEN
          v_active := v_active + v_weight / v_count;
          IF v_answer = 'SIM' THEN v_total := v_total + v_weight / v_count; END IF;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  FOR c IN SELECT value FROM jsonb_array_elements(coalesce(p_form->'critical_errors','[]'::jsonb)) LOOP
    IF c->>'id' IS NULL OR c->>'id' = ANY(v_seen) THEN RAISE EXCEPTION 'IDs críticos inválidos.'; END IF;
    v_seen := array_append(v_seen, c->>'id');
    v_answer := p_result->'suggested_answers'->>(c->>'id');
    IF v_answer NOT IN ('SIM','NAO','NA') OR v_answer IS NULL
      OR jsonb_typeof(p_result->'suggested_critical_errors'->(c->>'id')) <> 'boolean' THEN
      RAISE EXCEPTION 'Erro crítico sem resposta válida.';
    END IF;
    IF v_answer = 'NAO' OR (p_result->'suggested_critical_errors'->>(c->>'id'))::boolean THEN RETURN 0; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM jsonb_each_text(p_result->'suggested_critical_errors') e
    WHERE e.key <> ALL(v_seen) OR e.value NOT IN ('true','false')) THEN RAISE EXCEPTION 'Erro crítico desconhecido.'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each_text(p_result->'suggested_critical_errors') e WHERE e.value='true') THEN RETURN 0; END IF;
  IF v_active = 0 THEN RETURN 100; END IF;
  RETURN round(least(100, greatest(0, v_total / v_active * 100)), 2);
END;
$$;

-- Called only with the service key by helpdesk-queue after validating an admin JWT.
CREATE FUNCTION public.select_active_monitoria_ai_candidate(p_candidate_id uuid, p_actor_id uuid, p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_candidate public.active_monitoria_ai_candidates%ROWTYPE; v_monitoria public.monitorias%ROWTYPE;
  v_form public.forms%ROWTYPE; v_score numeric; v_critical text[]; v_result jsonb;
BEGIN
  IF current_setting('request.jwt.claim.role',true) <> 'service_role' THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  IF length(btrim(coalesce(p_note,''))) < 15 OR length(p_note) > 2000 THEN RAISE EXCEPTION 'Justificativa inválida.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_actor_id AND active AND role='admin') THEN RAISE EXCEPTION 'Administrador ativo obrigatório.'; END IF;
  SELECT * INTO v_candidate FROM public.active_monitoria_ai_candidates WHERE id=p_candidate_id FOR UPDATE;
  IF v_candidate.id IS NULL OR v_candidate.state <> 'completed' THEN RAISE EXCEPTION 'Candidato indisponível.'; END IF;
  IF v_candidate.selected_at IS NOT NULL THEN
    IF v_candidate.selected_by=p_actor_id AND v_candidate.selection_note=btrim(p_note) THEN
      RETURN jsonb_build_object('monitoria_id',v_candidate.monitoria_id,'already_applied',true);
    END IF;
    RAISE EXCEPTION 'Candidato já escolhido.';
  END IF;
  SELECT * INTO v_monitoria FROM public.monitorias WHERE id=v_candidate.monitoria_id FOR UPDATE;
  IF v_monitoria.id IS NULL OR NOT v_monitoria.active
    OR v_monitoria.status NOT IN ('aguardando_gestor_suporte','aguardando_gestor_qualidade')
    OR v_monitoria.status <> v_candidate.source_status
    OR v_monitoria.updated_at IS DISTINCT FROM v_candidate.source_updated_at
    OR v_monitoria.form_id IS DISTINCT FROM v_candidate.form_id THEN
    RAISE EXCEPTION 'Monitoria mudou desde a prévia; gere novo candidato.';
  END IF;
  IF v_monitoria.form_id='6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid
    OR v_monitoria.form_snapshot->>'ticket_kind'='chamado_filho' THEN
    RAISE EXCEPTION 'Chamado filho exige fluxo próprio de publicação.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.helpdesk_submissions WHERE monitoria_id=v_monitoria.id AND status='sent') THEN
    RAISE EXCEPTION 'Monitoria já publicada; correção exige fluxo próprio.';
  END IF;
  SELECT * INTO v_form FROM public.forms WHERE id=v_candidate.form_id AND active FOR SHARE;
  IF v_form.id IS NULL OR v_form.sections IS DISTINCT FROM v_candidate.form_snapshot->'sections'
    OR coalesce(v_form.critical_errors,'[]'::jsonb) IS DISTINCT FROM coalesce(v_candidate.form_snapshot->'critical_errors','[]'::jsonb) THEN
    RAISE EXCEPTION 'Ficha vigente mudou desde a prévia.';
  END IF;
  v_result := v_candidate.result;
  v_score := _private.active_candidate_score(v_candidate.form_snapshot, v_result);
  IF v_score IS DISTINCT FROM (v_result->>'score')::numeric OR v_score < 75 THEN
    RAISE EXCEPTION 'Candidato não permite validação positiva.';
  END IF;
  IF nullif(btrim(v_result->>'auditor_record'),'') IS NULL THEN RAISE EXCEPTION 'Registro do auditor obrigatório.'; END IF;
  IF v_monitoria.pj_review_required AND v_monitoria.pj_review_kind IS NULL THEN
    RAISE EXCEPTION 'Monitoria PJ ainda aguarda parecer obrigatório do gestor.';
  END IF;
  IF v_monitoria.pj_review_required AND v_monitoria.status <> 'aguardando_gestor_qualidade' THEN
    RAISE EXCEPTION 'Monitoria PJ ainda aguarda decisão da Gestão da Qualidade.';
  END IF;
  SELECT coalesce(array_agg(key),'{}'::text[]) INTO v_critical
    FROM jsonb_each_text(coalesce(v_result->'suggested_critical_errors','{}'::jsonb)) WHERE value='true';
  UPDATE public.monitorias SET
    answers=v_result->'suggested_answers', question_observations=v_result->'suggested_observations',
    critical_error_observations=(SELECT coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb)
      FROM jsonb_each(coalesce(v_result->'suggested_observations','{}'::jsonb)) e
      WHERE e.key IN (SELECT c->>'id' FROM jsonb_array_elements(coalesce(v_form.critical_errors,'[]'::jsonb)) c)),
    selected_critical_errors=v_critical, score=v_score, evaluator_note=v_result->>'auditor_record',
    form_name=v_form.title,
    form_snapshot=(coalesce(v_monitoria.form_snapshot,'{}'::jsonb) - 'sections' - 'critical_errors')
      || jsonb_build_object('sections',v_form.sections,'critical_errors',v_form.critical_errors),
    status='concluida', resolution_type='human', action_deadline_at=NULL,
    contestation_result=CASE WHEN v_monitoria.pj_review_kind='contestation' THEN 'approved'
      ELSE v_monitoria.contestation_result END,
    history=coalesce(v_monitoria.history,'[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'action','Monitoria Reavaliada e validada por administrador', 'by_id',p_actor_id,
      'at',now(),'note',btrim(p_note),'candidate_id',v_candidate.id,
      'previous_score',v_monitoria.score,'previous_answers',v_monitoria.answers,
      'previous_critical_errors',v_monitoria.selected_critical_errors,
      'previous_evaluator_note',v_monitoria.evaluator_note,'new_score',v_score))
  WHERE id=v_monitoria.id;
  UPDATE public.active_monitoria_ai_candidates SET selected_by=p_actor_id,selected_at=now(),selection_note=btrim(p_note)
    WHERE id=v_candidate.id;
  RETURN jsonb_build_object('monitoria_id',v_monitoria.id,'score',v_score,'status','concluida','publish_ready',true);
END;
$$;
REVOKE ALL ON FUNCTION public.select_active_monitoria_ai_candidate(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.select_active_monitoria_ai_candidate(uuid,uuid,text) TO service_role;
