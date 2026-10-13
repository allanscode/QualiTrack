-- Restore a soft-deleted monitoria without accepting client-controlled history.
BEGIN;

CREATE OR REPLACE FUNCTION public.restore_removed_monitoria(p_monitoria_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor public.users%ROWTYPE;
  v_monitoria public.monitorias%ROWTYPE;
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  SELECT * INTO v_actor FROM public.users
    WHERE id = (SELECT auth.uid()) AND active FOR SHARE;
  IF v_actor.id IS NULL OR v_actor.role <> 'admin' THEN
    RAISE EXCEPTION 'Apenas administradores podem restaurar monitorias.';
  END IF;
  IF v_reason = '' OR length(v_reason) > 2000 THEN
    RAISE EXCEPTION 'Informe um motivo de até 2000 caracteres para a restauração.';
  END IF;

  SELECT * INTO v_monitoria FROM public.monitorias
    WHERE id = p_monitoria_id FOR UPDATE;
  IF v_monitoria.id IS NULL OR v_monitoria.active IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Monitoria removida não encontrada.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.monitorias m
    WHERE m.active IS TRUE AND m.id <> v_monitoria.id
      AND btrim(m.ticket_id) = btrim(v_monitoria.ticket_id)
  ) THEN
    RAISE EXCEPTION 'Este ticket já possui outra monitoria ativa.';
  END IF;

  UPDATE public.monitorias SET
    active = true,
    history = coalesce(v_monitoria.history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'action', 'Monitoria restaurada pelo Administrador',
      'by_id', v_actor.id, 'by_name', v_actor.name,
      'at', now(), 'note', v_reason)),
    updated_at = now()
  WHERE id = v_monitoria.id;

  UPDATE public.queue_ticket_assignments SET status = 'completed', completed_at = now()
  WHERE ticket_id = btrim(v_monitoria.ticket_id) AND status IN ('pending', 'in_progress');
END;
$$;

REVOKE ALL ON FUNCTION public.restore_removed_monitoria(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_removed_monitoria(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
