BEGIN;

-- The manager generated a new Auditor Record for this corrected child ticket,
-- but the old save guard rejected the final save. Restore only that proven
-- generation; never infer or fabricate the manager's unsaved decision note.
DO $$
DECLARE
  v_monitoria public.monitorias%ROWTYPE;
  v_log public.ai_evaluation_logs%ROWTYPE;
  v_source jsonb;
  v_question_count integer;
  v_matched_count integer;
  v_answers_match boolean;
  v_observations_match boolean;
BEGIN
  SELECT * INTO v_monitoria
  FROM public.monitorias
  WHERE ticket_id = '189065' AND active IS TRUE
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF v_monitoria.id IS NULL OR v_monitoria.status = 'concluida' THEN
    RAISE NOTICE 'Ticket 189065 absent or already concluded; no recovery needed.';
    RETURN;
  END IF;
  IF v_monitoria.status <> 'aguardando_gestor_qualidade'
    OR v_monitoria.contestation_result <> 'pending'
    OR v_monitoria.form_id NOT IN (
      '6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid,
      '6c7d1e88-841b-4da9-9a66-9f1464ce8970'::uuid,
      '6c7d1e88-841b-4da9-9a66-9f1464ce8971'::uuid,
      '6c7d1e88-841b-4da9-9a66-9f1464ce8972'::uuid,
      '6c7d1e88-841b-4da9-9a66-9f1464ce8973'::uuid
    )
    OR jsonb_typeof(v_monitoria.history) <> 'array'
    OR v_monitoria.history->-1->>'action' NOT IN ('Edição pelo Administrador', 'Edição pela Gestão da Qualidade') THEN
    RAISE EXCEPTION 'Ticket 189065 changed state; recovery stopped.';
  END IF;

  SELECT * INTO v_log
  FROM public.ai_evaluation_logs
  WHERE ticket_id = '189065' AND evaluation_type = 'registro_auditor'
    AND status = 'success'
    AND created_by::text = v_monitoria.history->-1->>'by_id'
    AND created_at > (v_monitoria.history->-1->>'at')::timestamptz
  ORDER BY created_at DESC LIMIT 1;
  IF v_log.id IS NULL OR nullif(btrim(v_log.response_json->>'auditor_record'), '') IS NULL THEN
    RAISE EXCEPTION 'No matching regenerated Auditor Record for ticket 189065.';
  END IF;
  v_source := btrim(split_part(v_log.prompt_text, 'DADOS DA AVALIAÇÃO:', 2))::jsonb;

  SELECT count(*)::integer INTO v_question_count
  FROM jsonb_array_elements(coalesce(v_monitoria.form_snapshot->'sections', '[]'::jsonb)) section
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(section->'questions', '[]'::jsonb)) question;
  SELECT count(*)::integer,
    coalesce(bool_and(criterion->>'answer' = v_monitoria.answers->>(question->>'id')), false),
    coalesce(bool_and(btrim(criterion->>'observation') = btrim(regexp_replace(
      v_monitoria.question_observations->>(question->>'id'), '[0-9]{14}', '[CNPJ]', 'g'))), false)
  INTO v_matched_count, v_answers_match, v_observations_match
  FROM jsonb_array_elements(coalesce(v_source->'criteria', '[]'::jsonb)) criterion
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(v_monitoria.form_snapshot->'sections', '[]'::jsonb)) section
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(section->'questions', '[]'::jsonb)) question
  WHERE question->>'text' = criterion->>'criterion';

  IF v_question_count <> 6 OR v_matched_count <> v_question_count
    OR jsonb_array_length(v_source->'criteria') <> v_question_count
    OR NOT v_answers_match OR NOT v_observations_match
    OR EXISTS (SELECT 1 FROM jsonb_each_text(v_monitoria.answers) answer WHERE answer.value <> 'SIM') THEN
    RAISE EXCEPTION 'Saved answers differ from the regenerated Auditor Record input; recovery stopped.';
  END IF;

  UPDATE public.monitorias
  SET evaluator_note = v_log.response_json->>'auditor_record',
      status = 'concluida',
      contestation_result = 'approved',
      resolution_type = 'human',
      action_deadline_at = NULL,
      history = history || jsonb_build_array(jsonb_build_object(
        'action', 'Monitoria concluída após recuperação do Registro do Auditor',
        'by_id', NULL, 'by_name', 'Sistema', 'at', now(),
        'note', 'O Registro do Auditor gerado pela Gestão da Qualidade após a revisão da ficha foi recuperado e conferido com as respostas salvas.'
      )),
      updated_at = now()
  WHERE id = v_monitoria.id;
  RAISE NOTICE 'Ticket 189065 concluded using generated Auditor Record %.', v_log.id;
END;
$$;

COMMIT;
