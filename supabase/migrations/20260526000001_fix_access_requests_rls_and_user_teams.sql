-- =====================================================================
-- FIX: access_requests RLS — permitir INSERT anônimo
-- FIX: user_teams — adicionar política de UPDATE e DELETE para admins
--
-- Problema: access_requests INSERT exigia "authenticated", mas
-- solicitantes de acesso NÃO têm conta ainda (são anônimos).
-- Resultado: erro 401 ao solicitar acesso.
--
-- Solução: adicionar política "anon" para INSERT em access_requests.
-- =====================================================================

-- -----------------------------------------------------------------
-- 1. access_requests: permitir INSERT de usuários anônimos
-- -----------------------------------------------------------------
DROP POLICY IF EXISTS "access_requests_insert" ON public.access_requests;
CREATE POLICY "access_requests_insert" ON public.access_requests
  FOR INSERT TO anon WITH CHECK (true);

-- Manter INSERT autenticado também (para fluxos internos)
DROP POLICY IF EXISTS "access_requests_authenticated_insert" ON public.access_requests;
CREATE POLICY "access_requests_authenticated_insert" ON public.access_requests
  FOR INSERT TO authenticated WITH CHECK (true);

-- -----------------------------------------------------------------
-- 2. user_teams: adicionar UPDATE para admins (necessário para sync)
-- -----------------------------------------------------------------
DROP POLICY IF EXISTS "user_teams_update" ON public.user_teams;
CREATE POLICY "user_teams_update" ON public.user_teams
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','gestor_qualidade','gestor_suporte'))
  );

-- Garantir que DELETE policy cobre admins + gestores
DROP POLICY IF EXISTS "user_teams_delete" ON public.user_teams;
CREATE POLICY "user_teams_delete" ON public.user_teams
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','gestor_qualidade','gestor_suporte'))
  );

-- -----------------------------------------------------------------
-- 3. Garantir que users RLS permite UPDATE (Edge Function usa admin client,
--    mas o front-end usa authenticated client para update direto)
-- -----------------------------------------------------------------
-- A política users_admin_write já cobre ALL (INSERT, UPDATE, DELETE)
-- para admin/gestor_qualidade/gestor_suporte. Sem mudança necessária.
