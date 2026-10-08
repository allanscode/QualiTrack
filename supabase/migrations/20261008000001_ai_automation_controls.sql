BEGIN;

ALTER TABLE public.positive_ai_config
  ADD COLUMN IF NOT EXISTS changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS changed_by uuid REFERENCES public.users(id);
ALTER TABLE public.child_ai_config
  ADD COLUMN IF NOT EXISTS changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS changed_by uuid REFERENCES public.users(id);

CREATE FUNCTION public.get_ai_automation_controls()
RETURNS TABLE (
  automation text,
  enabled boolean,
  max_evaluations integer,
  executions_started integer,
  auditor_ready boolean,
  last_error text,
  changed_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.active
      AND u.role IN ('admin', 'gestor_qualidade', 'qualidade')
  ) THEN
    RAISE EXCEPTION 'Acesso às automações não autorizado.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT 'positivas'::text, c.enabled, c.max_evaluations, c.executions_started,
      EXISTS (
        SELECT 1 FROM public.users u JOIN auth.users a ON a.id = u.id
        WHERE u.id = c.auditor_id AND u.active
          AND u.role IN ('admin', 'gestor_qualidade', 'qualidade')
      ), c.last_error, c.changed_at
    FROM public.positive_ai_config c WHERE c.id = true
    UNION ALL
    SELECT 'filhos'::text, c.enabled, NULL::integer, 0,
      EXISTS (
        SELECT 1 FROM public.users u JOIN auth.users a ON a.id = u.id
        WHERE u.id = c.auditor_id AND u.active
          AND u.role IN ('admin', 'gestor_qualidade', 'qualidade')
      ), c.last_error, c.changed_at
    FROM public.child_ai_config c WHERE c.id = true;
END $$;

CREATE FUNCTION public.set_ai_automation_enabled(
  p_automation text,
  p_enabled boolean,
  p_expected_enabled boolean
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_current boolean;
  v_auditor uuid;
  v_limit integer;
  v_started integer;
BEGIN
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = v_actor AND u.active
      AND u.role IN ('admin', 'gestor_qualidade')
  ) THEN
    RAISE EXCEPTION 'Apenas administradores e gestores de qualidade podem alterar automações.' USING ERRCODE = '42501';
  END IF;
  IF p_automation IS NULL OR p_automation NOT IN ('positivas', 'filhos')
    OR p_enabled IS NULL OR p_expected_enabled IS NULL THEN
    RAISE EXCEPTION 'Parâmetros inválidos para a automação.' USING ERRCODE = '22023';
  END IF;

  IF p_automation = 'positivas' THEN
    SELECT c.enabled, c.auditor_id, c.max_evaluations, c.executions_started
      INTO v_current, v_auditor, v_limit, v_started
      FROM public.positive_ai_config c WHERE c.id = true FOR UPDATE;
  ELSE
    SELECT c.enabled, c.auditor_id
      INTO v_current, v_auditor
      FROM public.child_ai_config c WHERE c.id = true FOR UPDATE;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configuração da automação indisponível.';
  END IF;
  IF v_current IS DISTINCT FROM p_expected_enabled THEN
    RAISE EXCEPTION 'O estado mudou. Atualize a tela e tente novamente.' USING ERRCODE = '40001';
  END IF;
  IF p_enabled THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.users u JOIN auth.users a ON a.id = u.id
      WHERE u.id = v_auditor AND u.active
        AND u.role IN ('admin', 'gestor_qualidade', 'qualidade')
    ) THEN
      RAISE EXCEPTION 'Configure um auditor de qualidade ativo antes de ligar a automação.';
    END IF;
    IF p_automation = 'positivas' AND v_limit IS NOT NULL AND v_started >= v_limit THEN
      RAISE EXCEPTION 'O limite de avaliações deste ambiente foi atingido.';
    END IF;
  END IF;

  IF p_automation = 'positivas' THEN
    UPDATE public.positive_ai_config
      SET enabled = p_enabled, changed_at = now(), changed_by = v_actor
      WHERE id = true;
  ELSE
    UPDATE public.child_ai_config
      SET enabled = p_enabled, changed_at = now(), changed_by = v_actor
      WHERE id = true;
  END IF;
  RETURN p_enabled;
END $$;

REVOKE ALL ON FUNCTION public.get_ai_automation_controls() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_ai_automation_enabled(text, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_automation_controls() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_ai_automation_enabled(text, boolean, boolean) TO authenticated;

COMMIT;
