BEGIN;

-- The live AI prompt reads this manual from the database. Append an explicit
-- correction so older prose cannot override the revised routing rule.
UPDATE public.ai_evaluation_guidelines
SET title = CASE WHEN title = 'Manual de ticket filho — versão 1.4'
      THEN 'Manual de ticket filho — versão 1.5' ELSE title END,
    file_name = CASE WHEN file_name = 'Manual_de_ticket_filho_v1.4.md'
      THEN 'Manual_de_ticket_filho_v1.5.md' ELSE file_name END,
    content = replace(content, '# Manual de ticket filho — versão 1.4',
      '# Manual de ticket filho — versão 1.5') || E'\n\n## Regra atualizada: Apoio Análise Técnica (21/10/2026)\n'
  || 'Esta regra substitui qualquer instrução anterior de autoatribuição para a macro Apoio Análise Técnica. '
  || 'O atendente abre o chamado filho e o atribui inicialmente a OUTRO agente da equipe de Análise Técnica que prestou o apoio. '
  || 'IDs diferentes de criador e destinatário são esperados. Confira no histórico de abertura a identidade do destinatário e sua equipe. '
  || 'Se a equipe do destinatário não puder ser comprovada, marque direcionamento como NA e solicite conferência humana; não marque NAO apenas por falta de autoatribuição. '
  || 'A equipe criadora deve ser verificada separadamente, sem inferir sua origem pelo grupo do destinatário.',
    updated_at = now()
WHERE active IS TRUE
  AND title ILIKE '%filho%'
  AND content NOT LIKE '%Regra atualizada: Apoio Análise Técnica (21/10/2026)%';

COMMIT;
