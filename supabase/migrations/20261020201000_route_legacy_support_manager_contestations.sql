BEGIN;

-- The manager-quality routing function was released after several support
-- managers had already contested monitorias. Move only still-open rows whose
-- latest history event is a contestation by an active support manager. Rows
-- with later auditor/manager actions and resolved contests are left untouched.
WITH last_events AS (
  SELECT m.id, event.value AS last_event, actor.role AS actor_role
  FROM public.monitorias m
  CROSS JOIN LATERAL (
    SELECT value
    FROM jsonb_array_elements(COALESCE(m.history, '[]'::jsonb)) WITH ORDINALITY AS h(value, ord)
    ORDER BY ord DESC
    LIMIT 1
  ) event
  JOIN public.users actor ON actor.id::text = event.value->>'by_id'
  WHERE m.active IS TRUE
    AND m.status = 'em_contestacao'
    AND actor.role = 'gestor_suporte'
    AND event.value->>'action' ILIKE 'Contestação realizada pelo Gestor de Suporte%'
)
UPDATE public.monitorias m
SET status = 'aguardando_gestor_qualidade',
    contestation_result = COALESCE(m.contestation_result, 'pending'),
    history = COALESCE(m.history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'action', 'Contestação anterior encaminhada à Gestão da Qualidade',
      'by_id', NULL,
      'by_name', 'Sistema',
      'at', now(),
      'note', 'Correção de rota: a contestação do Gestor de Suporte foi registrada antes da atualização do fluxo de decisão da Gestão da Qualidade.'
    )),
    updated_at = now()
FROM last_events e
WHERE m.id = e.id
  AND e.actor_role = 'gestor_suporte';

COMMIT;
