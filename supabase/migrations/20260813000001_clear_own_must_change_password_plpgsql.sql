-- =================================================================
-- clear_own_must_change_password — checagem de linhas afetadas
--
-- Code review de 2026-08-13 sobre o commit 11c6dc7 (docs/code-review/
-- 2026-08-13-loop-troca-senha-review.md, Achado 2, severidade Média).
--
-- A versão anterior (20260805000001) é LANGUAGE sql, RETURNS void, e
-- não checa quantas linhas o UPDATE afetou:
--
--   UPDATE public.users SET must_change_password = false
--   WHERE id = (SELECT auth.uid());
--
-- Se auth.uid() não corresponder a nenhuma linha de public.users
-- (linha órfã, migração futura que dessincronize os ids, edição
-- manual de dados) a função "sucede" sem erro nenhum, com 0 linhas
-- afetadas. O cliente segue o caminho de sucesso, desloga e mostra
-- toast de sucesso, mas a flag continua true — o usuário volta a cair
-- no loop de troca de senha, e desta vez de forma totalmente muda,
-- sem nem chegar a um console.error. É a mesma classe de falha que
-- motivou o commit original (0 linhas afetadas, sem erro), só que
-- deslocada de "bloqueio por RLS" para "função sem checagem de
-- rowcount".
--
-- A invariante public.users.id = auth.users.id se sustenta hoje em
-- todo o código de criação de usuário (seed de admin, Edge Function
-- de convite) — o problema não é ela estar quebrada, é a função não
-- se defender caso quebre no futuro.
-- =================================================================

CREATE OR REPLACE FUNCTION public.clear_own_must_change_password()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_rows_affected INT;
BEGIN
  UPDATE public.users
  SET must_change_password = false
  WHERE id = (SELECT auth.uid());

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  IF v_rows_affected = 0 THEN
    RAISE EXCEPTION 'Nenhuma linha em public.users corresponde ao usuário autenticado (id %). must_change_password não foi alterado.', auth.uid()
      USING ERRCODE = 'P0002'; -- no_data_found
  END IF;
END;
$$;

-- GRANT/REVOKE já estavam corretos na versão anterior; reafirmados aqui
-- por clareza e para o caso de CREATE OR REPLACE precisar deles de novo
-- em algum ambiente.
GRANT EXECUTE ON FUNCTION public.clear_own_must_change_password() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.clear_own_must_change_password() FROM anon, public;

NOTIFY pgrst, 'reload schema';
