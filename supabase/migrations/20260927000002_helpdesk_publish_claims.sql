BEGIN;
CREATE TABLE IF NOT EXISTS public.helpdesk_publish_claims (
  monitoria_id uuid PRIMARY KEY REFERENCES public.monitorias(id) ON DELETE CASCADE,
  claim_id uuid NOT NULL DEFAULT gen_random_uuid(),
  state text NOT NULL CHECK (state IN ('sending','sent','uncertain')),
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.helpdesk_publish_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.helpdesk_publish_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.helpdesk_publish_claims TO service_role;

CREATE OR REPLACE FUNCTION public.claim_helpdesk_publication(p_monitoria uuid, p_caller uuid, p_force boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_claim public.helpdesk_publish_claims; v_monitoria public.monitorias; v_id uuid;
BEGIN
  SELECT * INTO v_monitoria FROM public.monitorias WHERE id = p_monitoria FOR UPDATE;
  IF v_monitoria.id IS NULL OR NOT v_monitoria.active OR NOT EXISTS (SELECT 1 FROM public.users
      WHERE id = p_caller AND active AND (role IN ('admin','gestor_qualidade')
        OR (role = 'qualidade' AND v_monitoria.evaluator_id = p_caller))) THEN
    RAISE EXCEPTION 'Publicação não autorizada.';
  END IF;
  SELECT * INTO v_claim FROM public.helpdesk_publish_claims WHERE monitoria_id = p_monitoria FOR UPDATE;
  IF v_claim.state IN ('sending','uncertain') THEN
    RAISE EXCEPTION 'Envio em andamento ou aguardando conferência no helpdesk. Não reenvie.';
  END IF;
  IF NOT COALESCE(p_force,false) AND (v_claim.state = 'sent' OR EXISTS (SELECT 1 FROM public.helpdesk_submissions
       WHERE monitoria_id = p_monitoria AND status = 'sent')) THEN RETURN NULL; END IF;
  v_id := gen_random_uuid();
  INSERT INTO public.helpdesk_publish_claims(monitoria_id,claim_id,state,created_by)
    VALUES(p_monitoria,v_id,'sending',p_caller)
    ON CONFLICT (monitoria_id) DO UPDATE SET claim_id=excluded.claim_id,state='sending',created_by=excluded.created_by,updated_at=now();
  RETURN v_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.finish_helpdesk_publication(p_monitoria uuid, p_claim uuid,
  p_ticket text, p_provider text, p_outcome text, p_comment text, p_success boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_claim public.helpdesk_publish_claims;
BEGIN
  SELECT * INTO v_claim FROM public.helpdesk_publish_claims WHERE monitoria_id=p_monitoria AND claim_id=p_claim FOR UPDATE;
  IF v_claim.claim_id IS NULL OR v_claim.state <> 'sending' THEN RAISE EXCEPTION 'Tentativa de envio inválida.'; END IF;
  UPDATE public.helpdesk_publish_claims SET state=CASE WHEN p_success THEN 'sent' ELSE 'uncertain' END,
    updated_at=now() WHERE monitoria_id=p_monitoria;
  INSERT INTO public.helpdesk_submissions(monitoria_id,provider,external_ticket_id,outcome,status,external_comment_id,error_message,created_by)
    VALUES(p_monitoria,p_provider,p_ticket,p_outcome,CASE WHEN p_success THEN 'sent' ELSE 'failed' END,
      p_comment,CASE WHEN p_success THEN NULL ELSE 'Resultado incerto. Confira o ticket antes de liberar uma nova tentativa.' END,v_claim.created_by);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_helpdesk_publication(uuid,uuid,boolean),
  public.finish_helpdesk_publication(uuid,uuid,text,text,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_helpdesk_publication(uuid,uuid,boolean),
  public.finish_helpdesk_publication(uuid,uuid,text,text,text,text,boolean) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
