alter table public.monitorias
  add column if not exists child_verdict text;

alter table public.monitorias
  drop constraint if exists monitorias_child_verdict_check;

alter table public.monitorias
  add constraint monitorias_child_verdict_check
  check (child_verdict is null or child_verdict in ('valido', 'invalido'));

create or replace function public.set_child_monitoria_binary_verdict()
returns trigger
language plpgsql
as $$
declare
  is_child boolean;
  question_count integer;
  all_yes boolean;
  snapshot_verdict text;
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

  -- A ficha do filho não usa pontuação percentual.
  new.score := null;
  snapshot_verdict := new.form_snapshot ->> 'child_verdict';

  if new.form_snapshot ->> 'legacy_source' = 'zendesk_child_note' then
    if new.form_snapshot ->> 'legacy_verdict' in ('valido', 'invalido') then
      new.child_verdict := new.form_snapshot ->> 'legacy_verdict';
    end if;
    return new;
  end if;

  if new.status in ('concluida', 'finalizada_alterada') then
    select count(*)::integer,
      coalesce(bool_and(coalesce(new.answers ->> (question ->> 'id'), '') = 'SIM'), false)
      into question_count, all_yes
    from jsonb_array_elements(coalesce(new.form_snapshot -> 'sections', '[]'::jsonb)) section
    cross join lateral jsonb_array_elements(coalesce(section -> 'questions', '[]'::jsonb)) question;

    if question_count > 0 then
      new.child_verdict := case when all_yes then 'valido' else 'invalido' end;
    elsif snapshot_verdict in ('valido', 'invalido') then
      new.child_verdict := snapshot_verdict;
    else
      -- Conclusão sem respostas identificáveis não pode ser registrada como válida.
      new.child_verdict := 'invalido';
    end if;
    new.form_snapshot := jsonb_set(coalesce(new.form_snapshot, '{}'::jsonb), '{child_verdict}', to_jsonb(new.child_verdict), true);
  else
    new.child_verdict := null;
    if new.form_snapshot ? 'child_verdict' then
      new.form_snapshot := new.form_snapshot - 'child_verdict';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_child_monitoria_binary_verdict on public.monitorias;
create trigger trg_set_child_monitoria_binary_verdict
before insert or update of form_id, form_snapshot, answers, status, score, child_verdict
on public.monitorias
for each row execute function public.set_child_monitoria_binary_verdict();

-- Normaliza a base existente com a mesma regra aplicada às próximas gravações.
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
