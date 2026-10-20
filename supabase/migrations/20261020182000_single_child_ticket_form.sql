do $$
declare
  definition text;
  updated_definition text;
begin
  definition := pg_get_functiondef('public.start_child_ai_job(text,uuid,jsonb,jsonb)'::regprocedure);
  updated_definition := regexp_replace(
    definition,
    $pattern$p_form_snapshot->>'id'\s+NOT\s+IN\s*\(\s*'6c7d1e88-841b-4da9-9a66-9f1464ce8970'\s*,\s*'6c7d1e88-841b-4da9-9a66-9f1464ce8971'\s*,\s*'6c7d1e88-841b-4da9-9a66-9f1464ce8972'\s*,\s*'6c7d1e88-841b-4da9-9a66-9f1464ce8973'\s*\)$pattern$,
    $replacement$p_form_snapshot->>'id' IS DISTINCT FROM '6c7d1e88-841b-4da9-9a66-9f1464ce896f'$replacement$,
    'g'
  );
  if updated_definition = definition then
    raise exception 'Não foi possível ajustar start_child_ai_job para a ficha única.';
  end if;
  execute updated_definition;

  definition := pg_get_functiondef('public.finish_child_ai_job(uuid)'::regprocedure);
  updated_definition := regexp_replace(
    definition,
    $pattern$\s*IF q\.form_snapshot->>'id' = '6c7d1e88-841b-4da9-9a66-9f1464ce896f' THEN\s+PERFORM public\.finish_legacy_child_ai_job\(p_job_id\);\s+RETURN;\s+END IF;$pattern$,
    '',
    'g'
  );
  if updated_definition = definition then
    raise exception 'Não foi possível remover o roteamento legado de finish_child_ai_job.';
  end if;
  execute updated_definition;
end;
$$;

-- The one generic manual rubric remains active. Macro-specific duplicates
-- stay stored for historical monitoria references but leave the selection UI.
update public.forms
set active = false
where id in (
  '6c7d1e88-841b-4da9-9a66-9f1464ce8970',
  '6c7d1e88-841b-4da9-9a66-9f1464ce8971',
  '6c7d1e88-841b-4da9-9a66-9f1464ce8972',
  '6c7d1e88-841b-4da9-9a66-9f1464ce8973'
);
