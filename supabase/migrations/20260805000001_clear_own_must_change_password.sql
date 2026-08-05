-- =================================================================
-- Loop na tela de troca de senha obrigatória
--
-- Sintoma: usuário troca a senha, volta pro login, entra de novo, e é
-- mandado de volta pra tela de trocar senha — indefinidamente.
--
-- Causa: handleUpdatePassword faz
--   sb.from('users').update({ must_change_password: false })
--     .eq('email', user.email)
-- direto na tabela. Isso é escrita em public.users, governada por
-- users_admin_write, que NUNCA autorizou usuário comum a mexer na
-- própria linha — nem antes nem depois da correção de escalonamento
-- de privilégio (20260804000003). RLS bloqueia sem erro (0 linhas
-- afetadas), e o código não checava o resultado, então a senha do
-- Auth mudava mas a flag no banco continuava true.
--
-- Alargar users_admin_write para "dono da linha pode escrever" reabre
-- exatamente o auto-escalonamento que acabamos de fechar (usuário
-- comum trocando o próprio role). A correção é uma função estreita:
-- zera SÓ must_change_password, SÓ na própria linha, nada mais.
-- =================================================================

CREATE OR REPLACE FUNCTION public.clear_own_must_change_password()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  UPDATE public.users
  SET must_change_password = false
  WHERE id = (SELECT auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.clear_own_must_change_password() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.clear_own_must_change_password() FROM anon, public;

NOTIFY pgrst, 'reload schema';
