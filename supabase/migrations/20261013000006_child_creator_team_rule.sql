-- POP: Análise Técnica e Análise de Correções não podem abrir chamados filhos.
-- A pergunta é crítica e independente da autoatribuição. Respostas antigas
-- continuam ligadas ao snapshot da ficha salvo em cada avaliação.
BEGIN;

UPDATE public.forms AS f
SET sections = (
  SELECT jsonb_agg(
    CASE WHEN section->>'id' = 'child-routing' AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(section->'questions') AS question
      WHERE question->>'id' = 'child-creator-authorized'
    ) THEN jsonb_set(section, '{questions}', section->'questions' || jsonb_build_array(
      jsonb_build_object(
        'id', 'child-creator-authorized',
        'text', 'O chamado filho foi criado por uma equipe autorizada pelo POP?',
        'description', 'Análise Técnica e Análise de Correções não podem criar tickets filhos. Confira a equipe do criador no histórico de abertura. Sem prova, marque N/A e encaminhe para conferência.',
        'type', 'yes_no_na', 'is_critical', true
      )))
    ELSE section END ORDER BY position
  )
  FROM jsonb_array_elements(f.sections) WITH ORDINALITY AS item(section, position)
),
description = 'Avaliação da abertura e do encaminhamento de tickets filhos, incluindo a equipe criadora autorizada. Base: Manual de Avaliação de Tickets Filhos, versão 1.4.'
WHERE id = '6c7d1e88-841b-4da9-9a66-9f1464ce896f';

COMMIT;
