-- =================================================================
-- SEGURANÇA — escalonamento de privilégio via users_admin_write
--
-- A policy vigente (20260617000005) era:
--   FOR ALL TO authenticated
--   USING (_private.is_admin_user() OR _private.is_support_manager())
--
-- is_support_manager() = gestor_suporte. Como é FOR ALL sem WITH CHECK,
-- e a condição depende apenas de QUEM chama (não da linha afetada),
-- qualquer gestor_suporte podia:
--   - alterar o proprio papel para 'admin' (auto-promoção)
--   - alterar ou apagar QUALQUER usuário, inclusive administradores
--
-- Comprovado neste projeto: PATCH /users?id=eq.<proprio> com
-- {"role":"admin"} respondeu 200, e a alteração do nome de um admin
-- por um gestor_suporte também respondeu 200. (Ambos revertidos.)
--
-- Não havia uso legítimo: App.tsx restringe o painel administrativo a
-- role === 'admin', então gestor_suporte nunca gerencia usuários pela
-- interface. A permissão era superfície de ataque sem contrapartida.
--
-- Correção: alinhar o banco ao que a interface já pratica.
--   - Escrita em users: somente admin, e apenas se ativo.
--   - WITH CHECK explícito, para que a regra valha também à linha
--     resultante de INSERT/UPDATE, e não só à linha lida.
-- =================================================================

-- A função precisa existir ANTES da policy que a referencia.
-- is_admin_user() (admin + gestor_qualidade) segue em uso nas policies
-- de LEITURA, onde é apropriado; esta é restrita a admin para escrita.
CREATE OR REPLACE FUNCTION _private.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid())
      AND role = 'admin'
      AND active = true
  );
$$;

GRANT EXECUTE ON FUNCTION _private.is_admin() TO authenticated;
REVOKE EXECUTE ON FUNCTION _private.is_admin() FROM anon, public;

DROP POLICY IF EXISTS "users_admin_write" ON public.users;

CREATE POLICY "users_admin_write" ON public.users
  FOR ALL TO authenticated
  USING (_private.is_admin())
  WITH CHECK (_private.is_admin());

NOTIFY pgrst, 'reload schema';
