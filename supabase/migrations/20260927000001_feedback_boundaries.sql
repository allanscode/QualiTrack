-- Server-owned PDI identity, acknowledgement and completion. No data is deleted.
BEGIN;
ALTER TABLE public.agent_feedbacks ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE OR REPLACE FUNCTION _private.can_read_feedback(p_agent uuid, p_team uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.active
    AND (u.role IN ('admin','gestor_qualidade')
      OR (u.role = 'suporte' AND u.id = p_agent)
      OR (u.role = 'gestor_suporte' AND p_team IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.user_teams ut WHERE ut.user_id = u.id AND ut.team_id = p_team))));
$$;
REVOKE ALL ON FUNCTION _private.can_read_feedback(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION _private.can_read_feedback(uuid,uuid) TO authenticated;

DROP POLICY IF EXISTS agent_feedbacks_select_policy ON public.agent_feedbacks;
CREATE POLICY agent_feedbacks_select_policy ON public.agent_feedbacks FOR SELECT TO authenticated
  USING (_private.can_read_feedback(agent_id,team_id));
DROP POLICY IF EXISTS agent_feedbacks_active_boundary ON public.agent_feedbacks;
CREATE POLICY agent_feedbacks_active_boundary ON public.agent_feedbacks AS RESTRICTIVE FOR ALL TO authenticated
  USING (_private.can_read_feedback(agent_id,team_id))
  WITH CHECK (_private.can_read_feedback(agent_id,team_id));
DROP POLICY IF EXISTS agent_feedbacks_update_policy ON public.agent_feedbacks;
-- RPCs own mutations. Explicit grants also exclude TRUNCATE/REFERENCES/TRIGGER.
REVOKE ALL ON public.agent_feedbacks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.agent_feedbacks TO authenticated;
GRANT ALL ON public.agent_feedbacks TO service_role;

CREATE OR REPLACE FUNCTION public.check_agent_feedback_mutations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user public.users%ROWTYPE;
BEGIN
  -- Only trusted maintenance/service roles can write without an end-user JWT.
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_user FROM public.users WHERE id = auth.uid() AND active;
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Usuário inativo ou não autenticado.'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF v_user.role NOT IN ('admin','gestor_qualidade','gestor_suporte')
       OR NEW.manager_id IS DISTINCT FROM v_user.id THEN
      RAISE EXCEPTION 'Autoria do feedback inválida.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW.agent_id AND active AND role = 'suporte') THEN
      RAISE EXCEPTION 'Selecione um atendente ativo.';
    END IF;
    IF NEW.team_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.user_teams
        WHERE user_id = NEW.agent_id AND team_id = NEW.team_id) THEN
      RAISE EXCEPTION 'O atendente não pertence à equipe selecionada.';
    END IF;
    IF NOT _private.can_read_feedback(NEW.agent_id, NEW.team_id) THEN
      RAISE EXCEPTION 'Equipe fora do seu escopo.';
    END IF;
    IF NEW.monitoria_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.monitorias m
        WHERE m.id = NEW.monitoria_id AND m.evaluated_id = NEW.agent_id
          AND m.team_id IS NOT DISTINCT FROM NEW.team_id AND m.active) THEN
      RAISE EXCEPTION 'Monitoria incompatível com atendente ou equipe.';
    END IF;
    IF NEW.status <> 'pendente_ciencia' OR NEW.agent_acknowledged_at IS NOT NULL
      OR NEW.agent_notes IS NOT NULL OR NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'O feedback deve iniciar aguardando ciência do atendente.';
    END IF;
    IF length(btrim(NEW.title)) NOT BETWEEN 1 AND 200
      OR length(btrim(NEW.improvements)) NOT BETWEEN 1 AND 10000
      OR length(btrim(NEW.action_plan)) NOT BETWEEN 1 AND 10000
      OR length(COALESCE(NEW.strengths,'')) > 10000 THEN
      RAISE EXCEPTION 'Preencha título, oportunidades e plano dentro dos limites permitidos.';
    END IF;
    NEW.created_at := now();
  ELSE
    IF NOT _private.can_read_feedback(OLD.agent_id, OLD.team_id) THEN
      RAISE EXCEPTION 'Feedback fora do seu escopo.';
    END IF;
    IF v_user.role = 'suporte' AND v_user.id = OLD.agent_id THEN
      IF OLD.status <> 'pendente_ciencia' OR NEW.status <> 'ciente'
        OR (to_jsonb(NEW) - ARRAY['status','agent_acknowledged_at','agent_notes','updated_at'])
          IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','agent_acknowledged_at','agent_notes','updated_at']) THEN
        RAISE EXCEPTION 'Somente a confirmação inicial de ciência é permitida.';
      END IF;
      IF length(COALESCE(NEW.agent_notes,'')) > 10000 THEN RAISE EXCEPTION 'Observações muito longas.'; END IF;
      NEW.agent_acknowledged_at := now();
    ELSIF v_user.role IN ('admin','gestor_qualidade','gestor_suporte') THEN
      IF OLD.status <> 'ciente' OR OLD.agent_acknowledged_at IS NULL OR NEW.status <> 'concluido'
        OR (to_jsonb(NEW) - ARRAY['status','completed_at','updated_at'])
          IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','completed_at','updated_at']) THEN
        RAISE EXCEPTION 'Apenas concluir um plano com ciência registrada é permitido.';
      END IF;
      NEW.completed_at := now();
    ELSE RAISE EXCEPTION 'Operação não autorizada.';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.check_agent_feedback_mutations() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_check_agent_feedback_mutations ON public.agent_feedbacks;
CREATE TRIGGER trg_check_agent_feedback_mutations BEFORE INSERT OR UPDATE ON public.agent_feedbacks
  FOR EACH ROW EXECUTE FUNCTION public.check_agent_feedback_mutations();

CREATE OR REPLACE FUNCTION public.acknowledge_agent_feedback(p_id uuid, p_notes text DEFAULT NULL)
RETURNS public.agent_feedbacks LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.agent_feedbacks;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND active AND role = 'suporte') THEN
    RAISE EXCEPTION 'Apenas o atendente titular pode confirmar ciência.';
  END IF;
  SELECT * INTO v_row FROM public.agent_feedbacks WHERE id = p_id AND agent_id = auth.uid() FOR UPDATE;
  IF v_row.id IS NULL OR v_row.status <> 'pendente_ciencia' THEN RAISE EXCEPTION 'Feedback indisponível ou já confirmado.'; END IF;
  UPDATE public.agent_feedbacks SET status = 'ciente', agent_notes = nullif(btrim(p_notes),'')
    WHERE id = p_id RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
CREATE OR REPLACE FUNCTION public.complete_agent_feedback(p_id uuid)
RETURNS public.agent_feedbacks LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.agent_feedbacks;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND active
      AND role IN ('admin','gestor_qualidade','gestor_suporte')) THEN RAISE EXCEPTION 'Operação não autorizada.'; END IF;
  SELECT * INTO v_row FROM public.agent_feedbacks WHERE id = p_id FOR UPDATE;
  IF v_row.id IS NULL OR NOT _private.can_read_feedback(v_row.agent_id,v_row.team_id)
     OR v_row.status <> 'ciente' THEN RAISE EXCEPTION 'Feedback indisponível ou sem ciência.'; END IF;
  UPDATE public.agent_feedbacks SET status = 'concluido' WHERE id = p_id RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.acknowledge_agent_feedback(uuid,text), public.complete_agent_feedback(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_agent_feedback(uuid,text), public.complete_agent_feedback(uuid) TO authenticated;
CREATE INDEX IF NOT EXISTS idx_feedbacks_created_id ON public.agent_feedbacks(created_at DESC,id);
NOTIFY pgrst, 'reload schema';
COMMIT;
