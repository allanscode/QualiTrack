-- Comandos de logout entregues em tempo real ao usuário alvo. O comando não
-- guarda token, IP ou dados sensíveis; serve apenas para a sessão aberta
-- executar auth.signOut({ scope: 'global' }).
CREATE TABLE IF NOT EXISTS public.session_control_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES public.users(id),
  command TEXT NOT NULL CHECK (command = 'logout'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_control_commands_target_created
  ON public.session_control_commands(target_user_id, created_at DESC);

ALTER TABLE public.session_control_commands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "session_control_commands_target_read" ON public.session_control_commands;
CREATE POLICY "session_control_commands_target_read" ON public.session_control_commands
  FOR SELECT TO authenticated
  USING (target_user_id = (SELECT auth.uid()));

-- A Edge Function usa a chave de serviço para inserir após validar o papel;
-- nenhum cliente autenticado recebe permissão direta de escrita.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'session_control_commands'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.session_control_commands;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
