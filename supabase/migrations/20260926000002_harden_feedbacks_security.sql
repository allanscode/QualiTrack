-- Migration: Endurecimento de Segurança e Integridade em agent_feedbacks
-- Impede BOLA/IDOR e adulteração de status e assinaturas digitais

CREATE OR REPLACE FUNCTION public.check_agent_feedback_mutations()
RETURNS trigger AS $$
DECLARE
  v_role text;
BEGIN
  -- Obter o papel do usuário autenticado
  SELECT role INTO v_role FROM public.users WHERE id = auth.uid();

  -- Se for atendente (role 'suporte')
  IF v_role = 'suporte' THEN
    -- Não pode alterar quem criou ou quem foi avaliado
    IF NEW.agent_id <> OLD.agent_id OR NEW.manager_id <> OLD.manager_id THEN
      RAISE EXCEPTION 'Atendentes não têm permissão para transferir feedbacks.';
    END IF;

    -- Não pode alterar os textos definidos pelo gestor
    IF NEW.title <> OLD.title OR NEW.improvements <> OLD.improvements OR NEW.action_plan <> OLD.action_plan THEN
      RAISE EXCEPTION 'Atendentes não podem alterar o conteúdo do alinhamento pactuado.';
    END IF;

    -- Não pode marcar o plano como concluído (apenas gestor pode aprovar a conclusão)
    IF NEW.status = 'concluido' AND OLD.status <> 'concluido' THEN
      RAISE EXCEPTION 'Apenas gestores ou administradores podem homologar a conclusão do plano de ação.';
    END IF;
  END IF;

  -- Se for gestor (não admin), não pode forjar a assinatura do atendente se ela já existir
  IF v_role IN ('gestor_suporte', 'gestor_qualidade') AND OLD.agent_acknowledged_at IS NOT NULL THEN
    IF NEW.agent_acknowledged_at <> OLD.agent_acknowledged_at THEN
      RAISE EXCEPTION 'A assinatura digital de ciência do atendente é imutável.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

DROP TRIGGER IF EXISTS trg_check_agent_feedback_mutations ON public.agent_feedbacks;

CREATE TRIGGER trg_check_agent_feedback_mutations
BEFORE UPDATE ON public.agent_feedbacks
FOR EACH ROW
EXECUTE FUNCTION public.check_agent_feedback_mutations();
