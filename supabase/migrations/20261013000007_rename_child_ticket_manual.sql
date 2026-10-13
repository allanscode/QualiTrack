-- Atualiza apenas os rótulos em uso; respostas e avaliações antigas permanecem intactas.
BEGIN;

UPDATE public.forms AS f
SET sections = (
  SELECT jsonb_agg(
    CASE WHEN section->>'id' = 'child-routing' THEN
      jsonb_set(section, '{questions}', (
        SELECT jsonb_agg(
          CASE WHEN question->>'id' = 'child-creator-authorized' THEN
            jsonb_set(question, '{text}', to_jsonb('O chamado filho foi criado por uma equipe autorizada pelo Manual de ticket filho?'::text))
          ELSE question END ORDER BY question_position
        )
        FROM jsonb_array_elements(section->'questions') WITH ORDINALITY AS questions(question, question_position)
      ))
    ELSE section END ORDER BY section_position
  )
  FROM jsonb_array_elements(f.sections) WITH ORDINALITY AS sections(section, section_position)
)
WHERE id = '6c7d1e88-841b-4da9-9a66-9f1464ce896f';

UPDATE public.ai_evaluation_guidelines
SET title = CASE WHEN title ILIKE 'Manual de Chamados Filhos%POP%'
  THEN 'Manual de ticket filho — versão 1.4' ELSE title END,
    content = replace(content, '# Manual Operacional de Chamados Filhos — POP v1.4',
      '# Manual de ticket filho — versão 1.4'),
    file_name = CASE WHEN file_name ILIKE '%POP%'
      THEN 'Manual_de_ticket_filho_v1.4.md' ELSE file_name END
WHERE title ILIKE 'Manual de Chamados Filhos%POP%'
  OR content LIKE '# Manual Operacional de Chamados Filhos — POP v1.4%'
  OR file_name IN ('Manual_Chamados_Filhos_POP_v1.4.md', 'POP_v1.4_Qualidade_WP.md');

COMMIT;
