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

  new.score := null;
  snapshot_verdict := new.form_snapshot ->> 'child_verdict';

  if new.form_snapshot ->> 'legacy_source' = 'zendesk_child_note' then
    if new.form_snapshot ->> 'legacy_verdict' in ('valido', 'invalido') then
      new.child_verdict := new.form_snapshot ->> 'legacy_verdict';
    end if;
    return new;
  end if;

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
    new.child_verdict := null;
  end if;

  if new.child_verdict is null then
    new.form_snapshot := coalesce(new.form_snapshot, '{}'::jsonb) - 'child_verdict';
  else
    new.form_snapshot := jsonb_set(coalesce(new.form_snapshot, '{}'::jsonb), '{child_verdict}', to_jsonb(new.child_verdict), true);
  end if;

  return new;
end;
$$;

-- Normaliza scores legados sem disparar a rota PJ: o veredito binário substitui
-- a pontuação percentual dos filhos, não altera uma nota regular.
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

create or replace view public.vw_monitorias_suporte
with (security_invoker = false, security_barrier = true)
as
select id, form_id, evaluated_id, evaluated_name, team_id, team_name, form_name,
  ticket_id, channel, ticket_date, analysis_date, satisfaction_result,
  satisfaction_has_record, satisfaction_record_text, answers, score, status,
  resolution_type, contestation_result, action_deadline_at, active,
  _private.support_history(history, evaluated_id) as history,
  dissatisfaction_answers, created_at, updated_at, evaluator_note,
  question_observations, critical_error_observations, selected_critical_errors,
  client_contact_log, client_contact_success, client_contact_channel, form_snapshot,
  contestation_reason, corrective_action, action_attachments,
  null::uuid as evaluator_id, null::text as evaluator_name, ticket_group_team_id,
  pj_reviewer_id, pj_review_kind, pj_review_decision, pj_review_note,
  pj_reviewed_at, pj_review_required, child_verdict
from public.monitorias m
where evaluated_id = (select auth.uid())
  and exists (
    select 1 from public.users u
    where u.id = (select auth.uid()) and u.active and u.role = 'suporte'
  );
