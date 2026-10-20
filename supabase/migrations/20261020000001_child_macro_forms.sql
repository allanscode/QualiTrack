-- Separate editable rubrics. The original form remains for historical snapshots.
INSERT INTO public.forms (id, title, description, team_id, sections, critical_errors, created_by, active)
SELECT macro.id::uuid, macro.title,
       'Critérios binários da abertura de chamado filho. Todos devem ser atendidos para o chamado ser válido.',
       NULL,
       (
         SELECT jsonb_agg(
           jsonb_set(section, '{questions}', (
             SELECT jsonb_agg((question - 'is_critical' - 'weight') ||
               CASE WHEN question->>'id' = 'child-routing-correct'
                 THEN jsonb_build_object('description', macro.routing)
                 ELSE '{}'::jsonb END ORDER BY question_order)
             FROM jsonb_array_elements(section->'questions') WITH ORDINALITY AS q(question, question_order)
           )) ORDER BY section_order)
         FROM jsonb_array_elements(source.sections) WITH ORDINALITY AS s(section, section_order)
       ),
       '[]'::jsonb, NULL, true
FROM public.forms AS source
CROSS JOIN (VALUES
  ('6c7d1e88-841b-4da9-9a66-9f1464ce8970', 'Chamado filho · Nova Demanda', 'Confira se o filho foi atribuído ao próprio analista que o abriu.'),
  ('6c7d1e88-841b-4da9-9a66-9f1464ce8971', 'Chamado filho · Análise Técnica', 'Confira o destinatário previsto pela macro de Análise Técnica e a atribuição inicial no Zendesk.'),
  ('6c7d1e88-841b-4da9-9a66-9f1464ce8972', 'Chamado filho · Apoio Técnico', 'Confira o destinatário N2 específico previsto pela macro e a atribuição inicial no Zendesk.'),
  ('6c7d1e88-841b-4da9-9a66-9f1464ce8973', 'Chamado filho · Produtividade', 'Confira o destinatário previsto pela macro de Produtividade e a atribuição inicial no Zendesk.')
) AS macro(id, title, routing)
WHERE source.id = '6c7d1e88-841b-4da9-9a66-9f1464ce896f'
ON CONFLICT (id) DO NOTHING;
