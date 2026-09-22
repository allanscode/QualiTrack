-- Encerra de forma autoritativa todas as sessões Auth do usuário alvo e
-- publica um comando Realtime para que navegadores abertos limpem o estado
-- local imediatamente. A operação inteira é atômica.
CREATE OR REPLACE FUNCTION public.admin_terminate_user_sessions(
  p_caller_id UUID,
  p_target_user_id UUID
)
RETURNS TABLE(revoked_sessions BIGINT, command_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_role TEXT;
  v_target_role TEXT;
  v_revoked_sessions BIGINT := 0;
  v_command_id UUID;
BEGIN
  IF p_caller_id IS NULL OR p_target_user_id IS NULL OR p_caller_id = p_target_user_id THEN
    RAISE EXCEPTION 'Usuário de destino inválido.' USING ERRCODE = '22023';
  END IF;

  SELECT u.role
  INTO v_caller_role
  FROM public.users u
  WHERE u.id = p_caller_id
    AND u.active;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'gestor_qualidade') THEN
    RAISE EXCEPTION 'Sem permissão para encerrar sessões.' USING ERRCODE = '42501';
  END IF;

  SELECT u.role
  INTO v_target_role
  FROM public.users u
  WHERE u.id = p_target_user_id
    AND u.active;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado ou inativo.' USING ERRCODE = 'P0002';
  END IF;

  IF v_target_role = 'admin' AND v_caller_role <> 'admin' THEN
    RAISE EXCEPTION 'Apenas administradores podem encerrar a sessão de outro administrador.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM auth.sessions s
  WHERE s.user_id = p_target_user_id;
  GET DIAGNOSTICS v_revoked_sessions = ROW_COUNT;

  UPDATE public.user_presence_sessions s
  SET offline_at = now(),
      last_seen_at = now()
  WHERE s.user_id = p_target_user_id
    AND s.offline_at IS NULL;

  INSERT INTO public.session_control_commands(target_user_id, requested_by, command)
  VALUES (p_target_user_id, p_caller_id, 'logout')
  RETURNING id INTO v_command_id;

  RETURN QUERY SELECT v_revoked_sessions, v_command_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_terminate_user_sessions(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_terminate_user_sessions(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.admin_terminate_user_sessions(UUID, UUID) IS
  'Revoga sessões Auth, encerra presença e publica logout Realtime para um usuário alvo autorizado.';

NOTIFY pgrst, 'reload schema';
