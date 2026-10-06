-- Ficha exclusiva de tickets filhos. Mantém as fichas anteriores no histórico;
-- reavaliações de filhos antigos passam a usar esta rubrica no frontend.
INSERT INTO public.forms (id, title, description, team_id, sections, critical_errors, created_by, active)
VALUES (
  '6c7d1e88-841b-4da9-9a66-9f1464ce896f',
  'Ficha de Monitoria de Ticket Filho',
  'Avaliação da abertura e do encaminhamento de tickets filhos: assunto, texto da macro e destinatário. Base: Manual de Avaliação de Tickets Filhos, versão 1.2.',
  NULL,
  '[
    {
      "id": "child-subject",
      "title": "Assunto da abertura",
      "weight": 35,
      "questions": [
        {
          "id": "child-subject-preserved",
          "text": "O assunto de abertura preservou o padrão da macro correspondente?",
          "description": "Aceite o prefixo Ticket e o ID do chamado pai. Mudança automática posterior pela macro de resolvido não é falha. Marque Não apenas se houver alteração manual indevida na abertura.",
          "type": "yes_no_na",
          "is_critical": true
        },
        {
          "id": "child-parent-linked",
          "text": "O chamado pai foi identificado e vinculado corretamente?",
          "description": "Confira o ID do ticket pai ou o vínculo problem_id/parent_ticket_id usado no encaminhamento.",
          "type": "yes_no_na"
        }
      ]
    },
    {
      "id": "child-macro",
      "title": "Texto da macro e evidências",
      "weight": 40,
      "questions": [
        {
          "id": "child-macro-preserved",
          "text": "O comentário manteve integralmente o texto-base da macro?",
          "description": "O conteúdo estrutural homologado deve permanecer. Detalhes adicionais são permitidos; texto apagado, incompleto ou substituído por mensagem genérica reprova este critério.",
          "type": "yes_no_na",
          "is_critical": true
        },
        {
          "id": "child-macro-enriched",
          "text": "Os detalhes técnicos complementares são suficientes para a equipe de destino?",
          "description": "Confira cenário, testes, versões, logs e evidências pertinentes. A ausência de complemento reduz a nota sem confundir isso com a exclusão do texto-base.",
          "type": "yes_no_na"
        }
      ]
    },
    {
      "id": "child-routing",
      "title": "Destinatário (Para)",
      "weight": 25,
      "questions": [
        {
          "id": "child-routing-correct",
          "text": "O campo Para aponta para o grupo ou analista previsto para esta macro?",
          "description": "Análise Técnica: grupo especialista correspondente; Nova Demanda: próprio analista; Apoio Técnico: N2 específico; Mais Pagamentos: grupo dedicado. Não penalize um destino individual quando a macro exige atribuição nominal.",
          "type": "yes_no_na"
        }
      ]
    }
  ]'::jsonb,
  '[]'::jsonb,
  NULL,
  TRUE
)
ON CONFLICT (id) DO NOTHING;

-- Identificação explícita das monitorias antigas de filho. Um bloco
-- child_ai_evaluation no snapshot não basta: versões anteriores podiam
-- carregar esse bloco de outra fila. A origem do job/log é a evidência.
UPDATE public.monitorias AS m
SET form_snapshot = COALESCE(m.form_snapshot, '{}'::jsonb)
  || '{"ticket_kind":"chamado_filho"}'::jsonb
WHERE m.form_id IS DISTINCT FROM '6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid
  AND (
    EXISTS (
      SELECT 1 FROM public.ai_evaluation_jobs AS j
      WHERE j.ticket_id = m.ticket_id AND j.evaluation_type = 'chamado_filho'
    )
    OR EXISTS (
      SELECT 1 FROM public.ai_evaluation_logs AS l
      WHERE l.ticket_id = m.ticket_id AND l.evaluation_type = 'chamado_filho'
    )
  );
