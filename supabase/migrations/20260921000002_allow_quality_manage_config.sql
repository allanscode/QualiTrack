-- Migration: 20260921000002_allow_quality_manage_config.sql
-- Permite que gestor_qualidade e qualidade (monitores) possam gerenciar
-- equipes, formulários/fichas, campos extras e vínculos de equipes.
-- Gestor de suporte continua apenas com permissão de visualização restrita.

-- 1. teams
DROP POLICY IF EXISTS "teams_admin_write" ON public.teams;
CREATE POLICY "teams_admin_write" ON public.teams
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
        AND users.role IN ('admin', 'gestor_qualidade', 'qualidade')
    )
  );

-- 2. forms
DROP POLICY IF EXISTS "forms_admin_write" ON public.forms;
CREATE POLICY "forms_admin_write" ON public.forms
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
        AND users.role IN ('admin', 'gestor_qualidade', 'qualidade')
    )
  );

-- 3. form_teams
DROP POLICY IF EXISTS "form_teams_admin_write" ON public.form_teams;
CREATE POLICY "form_teams_admin_write" ON public.form_teams
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
        AND users.role IN ('admin', 'gestor_qualidade', 'qualidade')
    )
  );

-- 4. dissatisfaction_fields
DROP POLICY IF EXISTS "dissatisfaction_fields_admin_write" ON public.dissatisfaction_fields;
CREATE POLICY "dissatisfaction_fields_admin_write" ON public.dissatisfaction_fields
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
        AND users.role IN ('admin', 'gestor_qualidade', 'qualidade')
    )
  );

-- 5. user_teams
DROP POLICY IF EXISTS "user_teams_insert" ON public.user_teams;
CREATE POLICY "user_teams_insert" ON public.user_teams
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
        AND users.role IN ('admin', 'gestor_qualidade', 'qualidade')
    )
  );

DROP POLICY IF EXISTS "user_teams_update" ON public.user_teams;
CREATE POLICY "user_teams_update" ON public.user_teams
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
        AND users.role IN ('admin', 'gestor_qualidade', 'qualidade')
    )
  );

DROP POLICY IF EXISTS "user_teams_delete" ON public.user_teams;
CREATE POLICY "user_teams_delete" ON public.user_teams
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
        AND users.role IN ('admin', 'gestor_qualidade', 'qualidade')
    )
  );

-- Atualiza as policies RESTRICTIVE em user_teams se existirem
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'user_teams' 
      AND policyname = 'security_user_teams_insert'
  ) THEN
    DROP POLICY IF EXISTS security_user_teams_insert ON public.user_teams;
    CREATE POLICY security_user_teams_insert ON public.user_teams AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK (_private.current_active_role() IN ('admin', 'gestor_qualidade', 'qualidade'));
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'user_teams' 
      AND policyname = 'security_user_teams_update'
  ) THEN
    DROP POLICY IF EXISTS security_user_teams_update ON public.user_teams;
    CREATE POLICY security_user_teams_update ON public.user_teams AS RESTRICTIVE FOR UPDATE TO authenticated
      USING (_private.current_active_role() IN ('admin', 'gestor_qualidade', 'qualidade'))
      WITH CHECK (_private.current_active_role() IN ('admin', 'gestor_qualidade', 'qualidade'));
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'user_teams' 
      AND policyname = 'security_user_teams_delete'
  ) THEN
    DROP POLICY IF EXISTS security_user_teams_delete ON public.user_teams;
    CREATE POLICY security_user_teams_delete ON public.user_teams AS RESTRICTIVE FOR DELETE TO authenticated
      USING (_private.current_active_role() IN ('admin', 'gestor_qualidade', 'qualidade'));
  END IF;
END $$;
