-- =================================================================
-- Hardening: handle_new_user() não confia mais em
-- raw_user_meta_data->>'role' vindo de auth.users para conceder o
-- papel inicial da conta.
--
-- Sintoma (achado de revisão de segurança): se o self-signup público
-- do Supabase Auth estiver habilitado (padrão de fábrica de um novo
-- projeto), qualquer visitante pode chamar POST /auth/v1/signup com
-- a anon key (pública, embutida no frontend) passando
-- {"data":{"role":"admin"}} — a trigger, disparada no INSERT em
-- auth.users, gravava esse valor direto em public.users.role, que
-- aceita 'admin' pelo CHECK da coluna. Escalonamento de privilégio
-- completo sem qualquer aprovação humana.
--
-- Nenhum fluxo legítimo do app depende dessa leitura: a Edge Function
-- admin-invite-user só envia {"data":{"name": ...}} no convite (nunca
-- 'role') e concede o papel real via UPDATE/upsert explícito, feito
-- DEPOIS com a service role — a trigger sempre grava 'suporte' (ou
-- 'admin' só para o e-mail hardcoded) e é sobrescrita em seguida por
-- esse upsert. Remover a leitura do metadata não quebra nenhum
-- convite/aprovação existente.
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
    -- 'role' do metadata do Auth NUNCA é usado aqui de propósito — ver
    -- comentário no topo do arquivo. Toda conta nova nasce 'suporte'
    -- (exceto o e-mail admin hardcoded); qualquer papel diferente disso
    -- é concedido depois, explicitamente, por quem já é admin/gestor.
    CASE
      WHEN NEW.email = 'allan.amorim@webposto.com.br' THEN 'admin'
      ELSE 'suporte'
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
