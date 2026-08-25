-- =================================================================
-- Mapeamento universal e desacoplado de agentes (multi-helpdesk)
--
-- Sintoma: as filas Proativa e de Positivas vinculavam atendentes por
-- nome/e-mail vindos de uma lista local fixa (Zendesk hardcoded), sem
-- persistir a origem do vínculo nem sobreviver à troca de helpdesk.
--
-- Causa: `public.users` não tinha como registrar que um atendente foi
-- criado a partir de uma plataforma externa (Zendesk hoje, outra
-- amanhã) antes de existir uma conta formal no QualiTrack.
--
-- Decisão: `external_id` + `source_system` guardam a chave de
-- correlação com a plataforma de origem (agnóstica de provider,
-- assim como `helpdesk_submissions.provider`). `is_provisional`
-- marca contas criadas automaticamente pela triagem, sem convite
-- nem senha, até o atendente concluir o onboarding com o mesmo
-- e-mail — nesse momento o trigger de auto-sync (ver
-- 20260824000001_auto_sync_auth_users_trigger.sql) migra todo o
-- histórico (monitorias, vínculos de equipe) da conta provisória
-- para a conta formal e remove a provisória.
-- =================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS source_system TEXT,
  ADD COLUMN IF NOT EXISTS is_provisional BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS users_external_identity_idx
  ON public.users (source_system, external_id);

COMMENT ON COLUMN public.users.external_id IS
  'Identificador do atendente na plataforma de origem (ex.: id do agente no Zendesk). Agnóstico de provider.';
COMMENT ON COLUMN public.users.source_system IS
  'Nome do sistema de origem do vínculo (ex.: "zendesk"). Preparado para troca futura de helpdesk.';
COMMENT ON COLUMN public.users.is_provisional IS
  'true = conta criada automaticamente pela triagem a partir do e-mail do atendente, sem onboarding formal ainda concluído.';

-- Atualiza o trigger de auto-sync: ao criar a conta formal (auth.users),
-- se já existir uma conta provisória com o mesmo e-mail, herda o
-- histórico (monitorias como avaliado/avaliador, vínculos de equipe)
-- para o novo id e remove a provisória, em vez de duplicar o atendente.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  provisional_id UUID;
  provisional_team_ids UUID[];
  provisional_primary_team UUID;
BEGIN
  SELECT id, team_ids, primary_team_id
    INTO provisional_id, provisional_team_ids, provisional_primary_team
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

  INSERT INTO public.users (id, email, name, role, team_ids, primary_team_id, active, must_change_password, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    CASE
      WHEN NEW.email = 'allan.amorim@webposto.com.br' THEN 'admin'
      ELSE COALESCE(NEW.raw_user_meta_data->>'role', 'suporte')
    END,
    COALESCE(provisional_team_ids, '{}'),
    provisional_primary_team,
    true,
    false,
    COALESCE(NEW.created_at, now())
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = COALESCE(public.users.name, EXCLUDED.name),
    team_ids = CASE WHEN public.users.team_ids = '{}' THEN EXCLUDED.team_ids ELSE public.users.team_ids END,
    primary_team_id = COALESCE(public.users.primary_team_id, EXCLUDED.primary_team_id),
    is_provisional = false;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

NOTIFY pgrst, 'reload schema';
