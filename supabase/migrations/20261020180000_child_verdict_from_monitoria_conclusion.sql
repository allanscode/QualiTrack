create or replace function public.set_child_monitoria_binary_verdict()
returns trigger
language plpgsql
as $$
declare
  is_child boolean;
  question_count integer;
  all_yes boolean;
  snapshot_verdict text;
  has_legacy_answers boolean;
begin
  is_child := new.form_id in (
    '6c7d1e88-841b-4da9-9a66-9f1464ce896f',
    '6c7d1e88-841b-4da9-9a66-9f1464ce8970',
    '6c7d1e88-841b-4da9-9a66-9f1464ce8971',
    '6c7d1e88-841b-4da9-9a66-9f1464ce8972',
    '6c7d1e88-841b-4da9-9a66-9f1464ce8973'
  ) or new.form_snapshot ->> 'ticket_kind' = 'chamado_filho'
    or new.form_snapshot ->> 'automation' = 'child_ticket';

  if not is_child then
    return new;
  end if;

  new.score := null;
  snapshot_verdict := new.form_snapshot ->> 'child_verdict';
  has_legacy_answers := new.answers ? 'legacy-check-1'
    and new.answers ? 'legacy-check-2'
    and new.answers ? 'legacy-check-3';

  select count(*)::integer,
    coalesce(bool_and(coalesce(new.answers ->> (question ->> 'id'), '') = 'SIM'), false)
    into question_count, all_yes
  from jsonb_array_elements(coalesce(new.form_snapshot -> 'sections', '[]'::jsonb)) section
  cross join lateral jsonb_array_elements(coalesce(section -> 'questions', '[]'::jsonb)) question;

  if question_count > 0 then
    new.child_verdict := case when all_yes then 'valido' else 'invalido' end;
  elsif has_legacy_answers then
    new.child_verdict := case
      when new.answers ->> 'legacy-check-1' = 'SIM'
        and new.answers ->> 'legacy-check-2' = 'SIM'
        and new.answers ->> 'legacy-check-3' = 'SIM' then 'valido'
      else 'invalido'
    end;
  elsif snapshot_verdict in ('valido', 'invalido') then
    new.child_verdict := snapshot_verdict;
  elsif new.form_snapshot ->> 'legacy_source' = 'zendesk_child_note'
    and new.form_snapshot ->> 'legacy_verdict' in ('valido', 'invalido') then
    -- Fallback for imported history without stored criterion answers.
    new.child_verdict := new.form_snapshot ->> 'legacy_verdict';
  elsif new.status in ('concluida', 'finalizada_alterada') then
    new.child_verdict := 'invalido';
  else
    new.child_verdict := null;
  end if;

  if new.child_verdict is null then
    new.form_snapshot := coalesce(new.form_snapshot, '{}'::jsonb) - 'child_verdict';
  else
    new.form_snapshot := jsonb_set(
      coalesce(new.form_snapshot, '{}'::jsonb),
      '{child_verdict}',
      to_jsonb(new.child_verdict),
      true
    );
  end if;

  return new;
end;
$$;

-- Normalize existing child records using their saved answers/conclusion.
alter table public.monitorias disable trigger trg_enforce_pj_review_route;

update public.monitorias
set child_verdict = child_verdict
where form_id in (
  '6c7d1e88-841b-4da9-9a66-9f1464ce896f',
  '6c7d1e88-841b-4da9-9a66-9f1464ce8970',
  '6c7d1e88-841b-4da9-9a66-9f1464ce8971',
  '6c7d1e88-841b-4da9-9a66-9f1464ce8972',
  '6c7d1e88-841b-4da9-9a66-9f1464ce8973'
) or form_snapshot ->> 'ticket_kind' = 'chamado_filho'
  or form_snapshot ->> 'automation' = 'child_ticket';

alter table public.monitorias enable trigger trg_enforce_pj_review_route;
