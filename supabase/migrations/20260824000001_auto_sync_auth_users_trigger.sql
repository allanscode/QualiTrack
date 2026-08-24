-- =====================================================================
-- AUTO SYNC AUTH.USERS -> PUBLIC.USERS (Evita contas órfãs permanentemente)
--
-- Sintoma: Usuários criados diretamente pelo dashboard do Supabase,
-- convites ou limpezas anteriores ficavam em auth.users sem linha
-- correspondente em public.users, travando o login (erro PGRST116).
--
-- Solução: Trigger automática no PostgreSQL que sempre insere/sincroniza
-- o perfil em public.users no momento exato em que um usuário é criado
-- no Auth do Supabase.
-- =====================================================================

-- 1. Sincronizar retroativamente todos os usuários existentes em auth.users
INSERT INTO public.users (id, email, name, role, active, must_change_password, created_at)
SELECT 
    au.id, 
    au.email, 
    COALESCE(au.raw_user_meta_data->>'name', split_part(au.email, '@', 1)), 
    CASE 
      WHEN au.email = 'allan.amorim@webposto.com.br' THEN 'admin'
      WHEN au.email = 'qualidade@webposto.com.br' THEN 'gestor_qualidade'
      ELSE COALESCE(au.raw_user_meta_data->>'role', 'suporte')
    END, 
    true, 
    false, 
    COALESCE(au.created_at, now())
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
WHERE pu.id IS NULL
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    active = true;

-- 2. Função de disparo automático para novos usuários
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role, active, must_change_password, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    CASE 
      WHEN NEW.email = 'allan.amorim@webposto.com.br' THEN 'admin'
      ELSE COALESCE(NEW.raw_user_meta_data->>'role', 'suporte')
    END,
    true,
    false,
    COALESCE(NEW.created_at, now())
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = COALESCE(public.users.name, EXCLUDED.name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

-- 3. Trigger ativada sempre após qualquer INSERT em auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

NOTIFY pgrst, 'reload schema';
