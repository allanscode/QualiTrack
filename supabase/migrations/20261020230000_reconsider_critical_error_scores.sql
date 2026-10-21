BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SELECT set_config('request.jwt.claim.role', 'service_role', true);

-- Keep the historical flags and answers intact. Store only enough metadata to
-- audit and reverse the score change; the schema is not exposed to PostgREST.
CREATE SCHEMA IF NOT EXISTS qwp_private_audit;
REVOKE ALL ON SCHEMA qwp_private_audit FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE IF NOT EXISTS qwp_private_audit.critical_score_reconciliation (
  monitoria_id uuid PRIMARY KEY REFERENCES public.monitorias(id),
  ticket_id text NOT NULL,
  source text NOT NULL,
  previous_score numeric NOT NULL,
  recalculated_score numeric NOT NULL,
  previous_history_length integer NOT NULL,
  previous_updated_at timestamptz NOT NULL,
  reconciled_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE qwp_private_audit.critical_score_reconciliation
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE IF NOT EXISTS qwp_private_audit.stale_child_marker_reconciliation (
  monitoria_id uuid PRIMARY KEY REFERENCES public.monitorias(id),
  ticket_id text NOT NULL,
  previous_verdict text NOT NULL,
  previous_score numeric,
  recalculated_score numeric NOT NULL,
  previous_updated_at timestamptz NOT NULL,
  reconciled_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE qwp_private_audit.stale_child_marker_reconciliation
  FROM PUBLIC, anon, authenticated, service_role;

-- Clear a stale child verdict when a monitoria is now using a regular form.
-- The trigger continues to derive the child verdict for actual child forms.
CREATE OR REPLACE FUNCTION public.set_child_monitoria_binary_verdict() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE is_child boolean;
BEGIN
  is_child := NEW.form_id IN (
    '6c7d1e88-841b-4da9-9a66-9f1464ce896f',
    '6c7d1e88-841b-4da9-9a66-9f1464ce8970',
    '6c7d1e88-841b-4da9-9a66-9f1464ce8971',
    '6c7d1e88-841b-4da9-9a66-9f1464ce8972',
    '6c7d1e88-841b-4da9-9a66-9f1464ce8973'
  ) OR coalesce(NEW.form_snapshot->>'ticket_kind' = 'chamado_filho', false)
    OR coalesce(NEW.form_snapshot->>'automation' = 'child_ticket', false);
  IF NOT is_child THEN
    NEW.child_verdict := NULL;
    NEW.form_snapshot := coalesce(NEW.form_snapshot, '{}'::jsonb) - 'child_verdict';
    RETURN NEW;
  END IF;

  NEW.score := NULL;
  DECLARE snapshot_verdict text := NEW.form_snapshot->>'child_verdict';
          question_count integer;
          all_yes boolean;
          has_legacy_answers boolean;
  BEGIN
    has_legacy_answers := NEW.answers ? 'legacy-check-1'
      AND NEW.answers ? 'legacy-check-2' AND NEW.answers ? 'legacy-check-3';
    SELECT count(*)::integer,
      coalesce(bool_and(coalesce(NEW.answers->>(question->>'id'), '') = 'SIM'), false)
      INTO question_count, all_yes
    FROM jsonb_array_elements(coalesce(NEW.form_snapshot->'sections', '[]'::jsonb)) section
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(section->'questions', '[]'::jsonb)) question;
    IF question_count > 0 THEN
      NEW.child_verdict := CASE WHEN all_yes THEN 'valido' ELSE 'invalido' END;
    ELSIF has_legacy_answers THEN
      NEW.child_verdict := CASE WHEN NEW.answers->>'legacy-check-1' = 'SIM'
        AND NEW.answers->>'legacy-check-2' = 'SIM' AND NEW.answers->>'legacy-check-3' = 'SIM'
        THEN 'valido' ELSE 'invalido' END;
    ELSIF snapshot_verdict IN ('valido','invalido') THEN
      NEW.child_verdict := snapshot_verdict;
    ELSIF NEW.form_snapshot->>'legacy_source' = 'zendesk_child_note'
      AND NEW.form_snapshot->>'legacy_verdict' IN ('valido','invalido') THEN
      NEW.child_verdict := NEW.form_snapshot->>'legacy_verdict';
    ELSIF NEW.status IN ('concluida','finalizada_alterada') THEN
      NEW.child_verdict := 'invalido';
    ELSE
      NEW.child_verdict := NULL;
    END IF;
    IF NEW.child_verdict IS NULL THEN
      NEW.form_snapshot := coalesce(NEW.form_snapshot, '{}'::jsonb) - 'child_verdict';
    ELSE
      NEW.form_snapshot := jsonb_set(coalesce(NEW.form_snapshot, '{}'::jsonb), '{child_verdict}', to_jsonb(NEW.child_verdict), true);
    END IF;
  END;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.set_child_monitoria_binary_verdict() FROM PUBLIC, anon, authenticated;

-- Expired review periods conclude the monitoria but retain the score reached
-- from its criteria; deadline automation must not manufacture a new verdict.
CREATE OR REPLACE FUNCTION public.process_action_deadline_timeouts()
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE item record;
BEGIN
  FOR item IN
    SELECT m.id,m.status,m.score,m.pj_review_required
    FROM public.monitorias m
    WHERE m.active AND m.action_deadline_at < now()
      AND m.form_snapshot->>'legacy_source' IS DISTINCT FROM 'zendesk_child_note'
      AND m.status IN ('em_contestacao','aguardando_gestor_qualidade','reavaliacao_solicitada',
        'pendente_revisao','aguardando_gestor_suporte','contestacao_negada')
      AND (NOT m.pj_review_required
        OR m.status IN ('em_contestacao','aguardando_gestor_qualidade','reavaliacao_solicitada')
        OR (m.status='pendente_revisao' AND m.form_snapshot->>'automation'='positive_csat'))
    FOR UPDATE OF m SKIP LOCKED
  LOOP
    IF item.pj_review_required THEN
      PERFORM set_config('app.positive_ai_timeout',item.id::text,true);
    END IF;
    UPDATE public.monitorias SET status='concluida',score=item.score,
      resolution_type='automatic',concluded_at=now(),updated_at=now(),
      history=coalesce(history,'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
        'action','Finalização Automática (Prazo)','by_id','system','by_name','Sistema Automático','at',now(),
        'note','Monitoria concluída automaticamente após expiração do prazo; respostas, pontuação normal e decisão registrada foram preservadas.'))
      WHERE id=item.id;
    IF item.pj_review_required THEN
      PERFORM set_config('app.positive_ai_timeout','',true);
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.process_action_deadline_timeouts() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_action_deadline_timeouts() TO service_role;

-- These two normal-form rows carry a stale binary child marker and have only
-- their initial creation in history. Keep the status and all answers intact.
LOCK TABLE public.monitorias IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE stale_child_marker_candidates ON COMMIT DROP AS
WITH eligible AS (
  SELECT m.id, m.ticket_id, m.status, m.score, m.form_snapshot, m.answers,
         m.history, m.updated_at, m.child_verdict
  FROM public.monitorias m
  WHERE m.active IS TRUE
    AND m.ticket_id IN ('187680','188220')
    AND m.form_id = 'f1fc47e9-6d51-40a5-938e-8108e225195e'
    AND m.child_verdict IN ('valido','invalido')
    AND m.score IS NULL
    AND coalesce(m.form_snapshot->>'ticket_kind','') <> 'chamado_filho'
    AND coalesce(m.form_snapshot->>'automation','') <> 'child_ticket'
    AND jsonb_typeof(m.history) = 'array'
    AND jsonb_array_length(m.history) = 1
    AND m.history->0->>'action' IN (
      'Monitoria Criada e encaminhada ao Gestor de Suporte',
      'Monitoria Criada e Concluída'
    )
), per_section AS (
  SELECT e.id, coalesce((section->>'weight')::numeric,0) section_weight,
    count(*) FILTER (WHERE e.answers->>(question->>'id') IS DISTINCT FROM 'NA') active_questions,
    count(*) FILTER (WHERE e.answers->>(question->>'id') = 'SIM') yes_answers
  FROM eligible e
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(e.form_snapshot->'sections','[]'::jsonb)) section
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(section->'questions','[]'::jsonb)) question
  GROUP BY e.id, section
), scores AS (
  SELECT id, round(100 * sum(section_weight * yes_answers / nullif(active_questions,0))
    FILTER (WHERE active_questions>0) / nullif(sum(section_weight) FILTER (WHERE active_questions>0),0),2) recalculated_score
  FROM per_section GROUP BY id
)
SELECT e.*, s.recalculated_score FROM eligible e JOIN scores s USING(id);

DO $$
DECLARE item record; candidate_count integer; updated_count integer := 0;
BEGIN
  SELECT count(*) INTO candidate_count FROM stale_child_marker_candidates;
  IF candidate_count NOT IN (0,2) THEN
    RAISE EXCEPTION 'Expected zero or two audited stale child markers, found %; reconciliation aborted.', candidate_count;
  END IF;
  FOR item IN SELECT * FROM stale_child_marker_candidates ORDER BY ticket_id LOOP
    INSERT INTO qwp_private_audit.stale_child_marker_reconciliation(
      monitoria_id,ticket_id,previous_verdict,previous_score,recalculated_score,previous_updated_at
    ) VALUES(item.id,item.ticket_id,item.child_verdict,item.score,item.recalculated_score,item.updated_at);
    UPDATE public.monitorias
    SET score=item.recalculated_score, child_verdict=NULL,
        form_snapshot=coalesce(item.form_snapshot,'{}'::jsonb)-'child_verdict',
        history=coalesce(item.history,'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
          'action','Veredito binário de chamado filho removido de ficha padrão',
          'by_id',NULL,'by_name','Sistema','at',now(),
          'note',format('Marcador binário indevido removido. Nota normal recalculada pelas respostas e pesos da ficha: %s%%. Status, respostas e demais dados preservados.',item.recalculated_score)
        )), updated_at=now()
    WHERE id=item.id AND score IS NULL AND child_verdict=item.child_verdict AND updated_at=item.updated_at;
    IF NOT FOUND THEN RAISE EXCEPTION 'Stale child marker row % changed; transaction aborted.',item.ticket_id; END IF;
    updated_count:=updated_count+1;
  END LOOP;
  IF updated_count<>candidate_count THEN RAISE EXCEPTION 'Stale marker update count mismatch.'; END IF;
END $$;

-- Only untouched initial AI reviews and automatic deadline completions are
-- eligible. Manager decisions and administrator-edited records are preserved.
LOCK TABLE public.monitorias IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE critical_score_candidates ON COMMIT DROP AS
WITH eligible AS (
  SELECT m.id, m.ticket_id, m.status, m.score, m.form_snapshot,
         m.answers, m.history, m.updated_at,
         CASE WHEN m.form_snapshot->>'automation' = 'positive_csat'
           THEN 'positive_csat_initial_review' ELSE 'automatic_deadline_completion' END AS source
  FROM public.monitorias m
  WHERE m.active IS TRUE
    AND m.score = 0
    AND coalesce(cardinality(m.selected_critical_errors), 0) > 0
    AND m.form_id NOT IN (
      '6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid,'6c7d1e88-841b-4da9-9a66-9f1464ce8970'::uuid,
      '6c7d1e88-841b-4da9-9a66-9f1464ce8971'::uuid,'6c7d1e88-841b-4da9-9a66-9f1464ce8972'::uuid,
      '6c7d1e88-841b-4da9-9a66-9f1464ce8973'::uuid
    )
    AND coalesce(m.form_snapshot->>'ticket_kind','') <> 'chamado_filho'
    AND (
      (m.status = 'pendente_revisao'
        AND m.form_snapshot->>'automation' = 'positive_csat'
        AND jsonb_typeof(m.history) = 'array'
        AND jsonb_array_length(m.history) = 1
        AND m.history->0->>'action' = 'Monitoria criada pela IA para revisão do gestor')
      OR
      (m.status = 'concluida'
        AND m.resolution_type = 'automatic'
        AND coalesce(m.form_snapshot->>'automation', '') <> 'positive_csat'
        AND jsonb_typeof(m.history) = 'array'
        AND m.history @> '[{"action":"Finalização Automática (Prazo)"}]'::jsonb
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(coalesce(m.history, '[]'::jsonb)) h(value)
          WHERE h.value->>'action' NOT IN ('Monitoria Criada', 'Finalização Automática (Prazo)')
        ))
    )
), per_section AS (
  SELECT e.id,
         coalesce((section.value->>'weight')::numeric, 0) AS section_weight,
         count(*) FILTER (WHERE e.answers->>(question.value->>'id') IS DISTINCT FROM 'NA') AS active_questions,
         count(*) FILTER (WHERE e.answers->>(question.value->>'id') = 'SIM') AS yes_answers
  FROM eligible e
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(e.form_snapshot->'sections') = 'array'
      THEN e.form_snapshot->'sections' ELSE '[]'::jsonb END
  ) section(value)
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(section.value->'questions') = 'array'
      THEN section.value->'questions' ELSE '[]'::jsonb END
  ) question(value)
  GROUP BY e.id, section.value
), normal_scores AS (
  SELECT id,
    CASE WHEN coalesce(sum(section_weight) FILTER (WHERE active_questions > 0), 0) = 0 THEN 100::numeric
      ELSE round(
        100 * sum(section_weight * yes_answers / nullif(active_questions, 0)) FILTER (WHERE active_questions > 0)
          / nullif(sum(section_weight) FILTER (WHERE active_questions > 0), 0),
        2
      )
    END AS recalculated_score
  FROM per_section
  GROUP BY id
)
SELECT e.id, e.ticket_id, e.status, e.score AS previous_score,
       s.recalculated_score, e.history AS previous_history,
       e.updated_at AS previous_updated_at, e.source
FROM eligible e
JOIN normal_scores s USING (id);

DO $$
DECLARE
  item record;
  updated_count integer := 0;
  candidate_count integer;
BEGIN
  SELECT count(*) INTO candidate_count FROM critical_score_candidates;
  FOR item IN SELECT * FROM critical_score_candidates ORDER BY ticket_id, id LOOP
    IF item.recalculated_score IS NULL OR item.recalculated_score < 0 OR item.recalculated_score > 100 THEN
      RAISE EXCEPTION 'Invalid normal score for monitoria %; reconciliation aborted.', item.id;
    END IF;

    INSERT INTO qwp_private_audit.critical_score_reconciliation (
      monitoria_id, ticket_id, source, previous_score, recalculated_score,
      previous_history_length, previous_updated_at
    ) VALUES (
      item.id, item.ticket_id, item.source, item.previous_score, item.recalculated_score,
      jsonb_array_length(coalesce(item.previous_history, '[]'::jsonb)), item.previous_updated_at
    );

    UPDATE public.monitorias
    SET score = item.recalculated_score,
        history = coalesce(item.previous_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'action', 'Pontuação recalculada sem penalidade automática por erro crítico',
          'by_id', NULL, 'by_name', 'Sistema', 'at', now(),
          'note', format('Nota anterior: %s%%. Nota normal recalculada pelas respostas e pesos da ficha: %s%%. Respostas, observações, decisão humana e veredito binário foram preservados.', item.previous_score, item.recalculated_score)
        )),
        updated_at = now()
    WHERE id = item.id AND active IS TRUE AND score = item.previous_score
      AND status = item.status;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Monitoria % mudou durante a reconciliação; transaction aborted.', item.id;
    END IF;
    updated_count := updated_count + 1;
  END LOOP;

  IF updated_count <> candidate_count THEN
    RAISE EXCEPTION 'Expected % score updates but applied %; transaction aborted.', candidate_count, updated_count;
  END IF;
END $$;

-- Future AI evaluations still retain critical evidence for human review, but
-- scores and thresholds use only the normal weighted answers.
CREATE OR REPLACE FUNCTION public.finish_positive_ai_job(p_job_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  q positive_ai_queue%ROWTYPE; j ai_evaluation_jobs%ROWTYPE; d ai_evaluation_drafts%ROWTYPE;
  v_section jsonb; v_question jsonb; v_answer text; v_weight numeric; v_active integer;
  v_yes integer; v_total numeric:=0; v_weights numeric:=0; v_score numeric:=0;
  v_critical boolean:=false; v_requires_manager_review boolean:=false;
  v_reason text; v_id uuid; v_auditor users%ROWTYPE; v_agent users%ROWTYPE; v_team text; v_config jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Worker nao autorizado.'; END IF;
  SELECT * INTO q FROM positive_ai_queue WHERE job_id=p_job_id FOR UPDATE;
  IF NOT FOUND OR q.status <> 'evaluating' THEN RETURN; END IF;
  SELECT * INTO j FROM ai_evaluation_jobs WHERE job_id=p_job_id;
  IF j.status IS DISTINCT FROM 'completed' THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('positive_ticket_'||q.ticket_id));
  SELECT id INTO v_id FROM monitorias WHERE ticket_id=q.ticket_id AND active LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE positive_ai_queue SET status='completed',monitoria_id=v_id,updated_at=now() WHERE ticket_id=q.ticket_id; RETURN;
  END IF;
  SELECT * INTO d FROM ai_evaluation_drafts WHERE ticket_id=q.ticket_id;
  SELECT * INTO v_auditor FROM users WHERE id=q.auditor_id AND active AND role IN ('admin','qualidade','gestor_qualidade');
  SELECT * INTO v_agent FROM users WHERE id=d.agent_id AND active AND role IN ('suporte','gestor_suporte');
  IF d.id IS NULL OR d.form_id::text IS DISTINCT FROM q.form_snapshot->>'id'
    OR v_auditor.id IS NULL OR v_agent.id IS NULL OR v_agent.primary_team_id IS NULL THEN
    v_reason:='Ficha, agente, equipe ou auditor indisponivel; revisao manual necessaria.';
  ELSIF jsonb_typeof(q.form_snapshot->'sections') IS DISTINCT FROM 'array'
    OR jsonb_array_length(q.form_snapshot->'sections')=0 THEN v_reason:='Ficha sem criterios validos.';
  ELSE
    FOR v_section IN SELECT value FROM jsonb_array_elements(q.form_snapshot->'sections') LOOP
      v_active:=0; v_yes:=0; v_weight:=coalesce((v_section->>'weight')::numeric,0);
      IF v_weight<=0 OR jsonb_typeof(v_section->'questions') IS DISTINCT FROM 'array'
        OR jsonb_array_length(v_section->'questions')=0 THEN v_reason:='Ficha com pesos ou criterios invalidos.'; EXIT; END IF;
      FOR v_question IN SELECT value FROM jsonb_array_elements(v_section->'questions') LOOP
        v_answer:=d.result#>>ARRAY['suggested_answers',v_question->>'id'];
        IF v_answer IS NULL OR v_answer NOT IN ('SIM','NAO','NA') THEN v_reason:='A IA nao preencheu todos os criterios da ficha.'; EXIT; END IF;
        IF nullif(btrim(d.result#>>ARRAY['suggested_observations',v_question->>'id']),'') IS NULL THEN
          v_reason:='A IA nao justificou todos os criterios da ficha.'; EXIT;
        END IF;
        IF coalesce((v_question->>'is_critical')::boolean,false)
          AND jsonb_typeof(d.result#>ARRAY['suggested_critical_errors',v_question->>'id']) IS DISTINCT FROM 'boolean' THEN
          v_reason:='A IA nao verificou todos os pontos de revisao critica.'; EXIT;
        END IF;
        IF coalesce((v_question->>'is_critical')::boolean,false) AND v_answer='NAO' THEN v_critical:=true; END IF;
        IF v_answer <> 'NA' THEN v_active:=v_active+1; END IF;
        IF v_answer='SIM' THEN v_yes:=v_yes+1; END IF;
      END LOOP;
      EXIT WHEN v_reason IS NOT NULL;
      IF v_active>0 THEN v_total:=v_total+v_weight*v_yes/v_active; v_weights:=v_weights+v_weight; END IF;
    END LOOP;
    IF v_reason IS NULL THEN
      FOR v_question IN SELECT value FROM jsonb_array_elements(coalesce(q.form_snapshot->'critical_errors','[]'::jsonb)) LOOP
        IF jsonb_typeof(d.result#>ARRAY['suggested_critical_errors',v_question->>'id']) IS DISTINCT FROM 'boolean'
          OR nullif(btrim(d.result#>>ARRAY['suggested_observations',v_question->>'id']),'') IS NULL THEN
          v_reason:='A IA nao verificou todos os pontos de revisao critica.'; EXIT;
        END IF;
      END LOOP;
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_each(coalesce(d.result->'suggested_critical_errors','{}')) WHERE value='true'::jsonb) THEN v_critical:=true; END IF;
    IF v_weights=0 AND v_reason IS NULL THEN v_reason:='Nenhum criterio aplicavel; revisao manual necessaria.'; END IF;
    v_score:=CASE WHEN v_weights=0 THEN 100 ELSE round(v_total/v_weights*100,2) END;
    v_requires_manager_review:=v_critical OR v_score<75;
    IF v_reason IS NULL AND d.result->>'requires_human_review'='true' THEN
      v_reason:='Evidencia externa pendente: ' || coalesce((SELECT string_agg(value, '; ') FROM jsonb_array_elements_text(coalesce(d.result->'review_reasons','[]'::jsonb))), 'conferencia manual necessaria.');
    END IF;
  END IF;
  UPDATE ai_evaluation_drafts SET result=result || jsonb_build_object('score',v_score,'automatic_positive',true,
    'automation_review_reason',v_reason,'dialogue',coalesce(q.evaluation_payload->'dialogue','[]'::jsonb)),
    ticket_snapshot=q.ticket_snapshot,source_queue='positivas' WHERE ticket_id=q.ticket_id;
  UPDATE ai_evaluation_jobs SET result=result || jsonb_build_object('score',v_score,'automatic_positive',true,
    'automation_review_reason',v_reason) WHERE job_id=p_job_id;
  IF v_reason IS NOT NULL THEN
    UPDATE positive_ai_queue SET status='review_required',score=v_score,last_error=v_reason,updated_at=now(),evaluation_payload=NULL
      WHERE ticket_id=q.ticket_id; RETURN;
  END IF;
  SELECT name INTO v_team FROM teams WHERE id=v_agent.primary_team_id;
  SELECT config INTO v_config FROM quality_configs WHERE active ORDER BY updated_at DESC LIMIT 1;
  INSERT INTO monitorias(form_id,evaluator_id,evaluated_id,team_id,ticket_group_team_id,ticket_id,channel,ticket_date,analysis_date,
    satisfaction_result,satisfaction_has_record,satisfaction_record_text,answers,question_observations,selected_critical_errors,
    critical_error_observations,score,status,resolution_type,active,evaluator_note,form_snapshot,history,
    evaluator_name,evaluated_name,form_name,team_name,applied_config,action_deadline_at,concluded_at)
  VALUES(d.form_id,v_auditor.id,v_agent.id,v_agent.primary_team_id,nullif(q.ticket_snapshot->>'ticket_group_team_id','')::uuid,
    q.ticket_id,d.channel,nullif(q.ticket_snapshot->>'ticket_date','')::timestamptz::date,
    (now() AT TIME ZONE 'America/Sao_Paulo')::date,'Positiva',coalesce(d.satisfaction_comment,'')<>'',d.satisfaction_comment,
    d.result->'suggested_answers',coalesce(d.result->'suggested_observations','{}'),
    ARRAY(SELECT key FROM jsonb_each(coalesce(d.result->'suggested_critical_errors','{}')) WHERE value='true'::jsonb),
    coalesce((SELECT jsonb_object_agg(c->>'id',d.result#>ARRAY['suggested_observations',c->>'id'])
      FROM jsonb_array_elements(coalesce(q.form_snapshot->'critical_errors','[]'::jsonb)) c),'{}'::jsonb),
    v_score,CASE WHEN v_requires_manager_review THEN 'pendente_revisao' ELSE 'concluida' END,
    CASE WHEN v_requires_manager_review THEN NULL ELSE 'automatic' END,true,d.result->>'summary',
    q.form_snapshot || jsonb_build_object('ai_evaluation',d.result || jsonb_build_object('score',v_score,'automatic_positive',true,
      'dialogue',coalesce(q.evaluation_payload->'dialogue','[]'::jsonb)),
      'ticket_fields',coalesce(d.result->'ticket_fields','[]'::jsonb),'automation','positive_csat'),
    jsonb_build_array(jsonb_build_object('action',CASE WHEN v_requires_manager_review
      THEN 'Monitoria criada pela IA para revisão do gestor'
      ELSE 'Monitoria avaliada e concluída automaticamente pela IA' END,
      'by_id',v_auditor.id,'by_name',v_auditor.name,'at',now(),
      'note','Automaçao de CSAT positivo. Nota calculada pelos criterios e pesos normais: '||v_score||'%. Indicadores criticos sao encaminhados para revisao humana e nao zeram a nota.')),
    v_auditor.name,v_agent.name,q.form_snapshot->>'title',v_team,v_config,
    CASE WHEN v_requires_manager_review THEN public.calculate_action_deadline(now(),
      coalesce((v_config->'action_deadline'->>'agent_review')::numeric,50)) ELSE NULL END,
    CASE WHEN v_requires_manager_review THEN NULL ELSE now() END) RETURNING id INTO v_id;
  UPDATE positive_ai_queue SET status='completed',score=v_score,monitoria_id=v_id,last_error=NULL,evaluation_payload=NULL,updated_at=now()
    WHERE ticket_id=q.ticket_id;
END $$;

REVOKE ALL ON FUNCTION public.finish_positive_ai_job(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_positive_ai_job(uuid) TO service_role;

COMMIT;
