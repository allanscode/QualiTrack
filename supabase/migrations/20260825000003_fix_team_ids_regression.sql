-- =================================================================
-- Corrige regressão: handle_new_user() referenciava a coluna
-- public.users.team_ids, que já tinha sido removida pela migração
-- 20260522000005_drop_team_ids.sql (substituída por public.user_teams
-- + primary_team_id). A migração 20260825000001_agent_identity_mapping
-- foi escrita sem essa informação e quebrou a trigger de criação de
-- usuário para TODO mundo (qualquer novo signup em auth.users falhava
-- com "column team_ids does not exist").
--
-- Mesmo bug estava na Edge Function helpdesk-queue (resolveOrCreateAgent),
-- corrigido em código à parte — aqui só a função de banco.
-- =================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  provisional_id UUID;
  provisional_primary_team UUID;
BEGIN
  SELECT id, primary_team_id
    INTO provisional_id, provisional_primary_team
  FROM public.users
  WHERE email = NEW.email
    AND is_provisional = true
    AND id <> NEW.id
  LIMIT 1;

  IF provisional_id IS NOT NULL THEN
    UPDATE public.monitorias SET evaluated_id = NEW.id WHERE evaluated_id = provisional_id;
    UPDATE public.monitorias SET evaluator_id = NEW.id WHERE evaluator_id = provisional_id;
    UPDATE public.helpdesk_submissions SET created_by = NEW.id WHERE created_by = provisional_id;
    -- Vínculos de equipe: evita duplicidade (user_id, team_id) antes de mover
    UPDATE public.user_teams ut SET user_id = NEW.id
      WHERE ut.user_id = provisional_id
        AND NOT EXISTS (
          SELECT 1 FROM public.user_teams ut2
          WHERE ut2.user_id = NEW.id AND ut2.team_id = ut.team_id
        );
    DELETE FROM public.user_teams WHERE user_id = provisional_id;
    DELETE FROM public.users WHERE id = provisional_id;
  END IF;

  INSERT INTO public.users (id, email, name, role, primary_team_id, active, must_change_password, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    CASE
      WHEN NEW.email = 'allan.amorim@webposto.com.br' THEN 'admin'
      ELSE COALESCE(NEW.raw_user_meta_data->>'role', 'suporte')
    END,
    provisional_primary_team,
    true,
    false,
    COALESCE(NEW.created_at, now())
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = COALESCE(public.users.name, EXCLUDED.name),
    primary_team_id = COALESCE(public.users.primary_team_id, EXCLUDED.primary_team_id),
    is_provisional = false;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

NOTIFY pgrst, 'reload schema';
