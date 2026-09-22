-- =================================================================
-- Distribuição 1-para-1 da Fila de Triagem entre Monitores de Qualidade
--
-- O Supervisor de Qualidade (gestor_qualidade) e o Administrador podem
-- colocar cada monitor de qualidade (role = 'qualidade') online/offline
-- para a triagem. Novos chamados nas filas de CSAT Negativas e Chamados
-- Filhos são distribuídos automaticamente entre os monitores online,
-- balanceando pela contagem acumulada do dia (quem tem menos recebe o
-- próximo). Se um monitor fica offline, os chamados pendentes dele são
-- redistribuídos entre os que continuam online.
-- =================================================================

-- -----------------------------------------------------------------
-- 1. Presença dos monitores de qualidade na triagem
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quality_monitor_presence (
  user_id     UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  is_online   BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES public.users(id)
);

ALTER TABLE public.quality_monitor_presence ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------
-- 2. Atribuição dos chamados da fila de triagem por monitor
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.queue_ticket_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id     TEXT NOT NULL,
  queue_type    TEXT NOT NULL CHECK (queue_type IN ('negativas', 'filhos')),
  assigned_to   UUID NOT NULL REFERENCES public.users(id),
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  completed_at  TIMESTAMPTZ,
  UNIQUE (ticket_id, queue_type)
);

CREATE INDEX IF NOT EXISTS idx_queue_ticket_assignments_assigned_to
  ON public.queue_ticket_assignments (assigned_to, assigned_at);

ALTER TABLE public.queue_ticket_assignments ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------
-- 3. Helper de RLS: usuário é qualidade, gestor_qualidade ou admin
-- (segue o padrão de _private.is_admin_user()/is_quality_or_support_user()
-- já usado em 20260617000005_fix_users_rls_recursion.sql — SECURITY
-- DEFINER para não recair em recursão de política sobre public.users)
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION _private.is_quality_team_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid())
    AND role IN ('admin', 'gestor_qualidade', 'qualidade')
  );
$$;

GRANT EXECUTE ON FUNCTION _private.is_quality_team_user() TO authenticated;
REVOKE EXECUTE ON FUNCTION _private.is_quality_team_user() FROM anon, public;

-- -----------------------------------------------------------------
-- 4. Políticas de leitura
-- Escrita não é liberada por política — só passa pelas funções
-- SECURITY DEFINER abaixo, que validam o papel de quem chama.
-- -----------------------------------------------------------------
DROP POLICY IF EXISTS "quality_monitor_presence_select" ON public.quality_monitor_presence;
CREATE POLICY "quality_monitor_presence_select" ON public.quality_monitor_presence
  FOR SELECT TO authenticated
  USING (_private.is_quality_team_user());

DROP POLICY IF EXISTS "queue_ticket_assignments_select" ON public.queue_ticket_assignments;
CREATE POLICY "queue_ticket_assignments_select" ON public.queue_ticket_assignments
  FOR SELECT TO authenticated
  USING (
    _private.is_admin_user() -- admin ou gestor_qualidade (ver 20260617000005)
    OR assigned_to = (SELECT auth.uid())
  );

-- -----------------------------------------------------------------
-- 5. set_monitor_presence: liga/desliga um monitor e redistribui os
-- chamados pendentes dele quando fica offline. Só Admin/Supervisor de
-- Qualidade podem chamar.
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_monitor_presence(p_user_id UUID, p_online BOOLEAN)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_candidate UUID;
BEGIN
  IF NOT _private.is_admin_user() THEN
    RAISE EXCEPTION 'Apenas o Supervisor de Qualidade ou o Administrador podem alterar a presença de monitores.';
  END IF;

  INSERT INTO public.quality_monitor_presence(user_id, is_online, updated_at, updated_by)
  VALUES (p_user_id, p_online, now(), (SELECT auth.uid()))
  ON CONFLICT (user_id) DO UPDATE
    SET is_online = EXCLUDED.is_online, updated_at = now(), updated_by = EXCLUDED.updated_by;

  IF NOT p_online THEN
    -- Serializa contra chamadas concorrentes de distribuição/redistribuição
    PERFORM pg_advisory_xact_lock(hashtext('qwp_queue_distribution'));

    FOR v_row IN
      SELECT id FROM public.queue_ticket_assignments
      WHERE assigned_to = p_user_id AND status = 'pending'
      ORDER BY assigned_at ASC
    LOOP
      SELECT p.user_id INTO v_candidate
      FROM public.quality_monitor_presence p
      LEFT JOIN public.queue_ticket_assignments a
        ON a.assigned_to = p.user_id AND a.assigned_at::date = current_date
      WHERE p.is_online = true AND p.user_id <> p_user_id
      GROUP BY p.user_id
      ORDER BY count(a.id) ASC, p.user_id ASC
      LIMIT 1;

      EXIT WHEN v_candidate IS NULL; -- ninguém mais online: fica pendente até alguém voltar

      UPDATE public.queue_ticket_assignments
      SET assigned_to = v_candidate, assigned_at = now()
      WHERE id = v_row.id;
    END LOOP;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_monitor_presence(UUID, BOOLEAN) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_monitor_presence(UUID, BOOLEAN) FROM anon, public;

-- -----------------------------------------------------------------
-- 6. assign_queue_tickets: distribui 1-para-1 os chamados ainda sem
-- atribuição entre os monitores online, olhando a contagem acumulada
-- do dia (quem tem menos recebe o próximo). Chamado pelo frontend
-- sempre que a fila de Negativas/Filhos carrega chamados novos.
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_queue_tickets(p_tickets JSONB)
RETURNS TABLE(ticket_id TEXT, queue_type TEXT, assigned_to UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_ticket_id TEXT;
  v_queue_type TEXT;
  v_candidate UUID;
BEGIN
  IF NOT _private.is_quality_team_user() THEN
    RAISE EXCEPTION 'Apenas a equipe de Qualidade pode distribuir chamados da fila de triagem.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('qwp_queue_distribution'));

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_tickets)
  LOOP
    v_ticket_id := v_item->>'ticket_id';
    v_queue_type := v_item->>'queue_type';

    IF v_ticket_id IS NULL OR v_queue_type NOT IN ('negativas', 'filhos') THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.queue_ticket_assignments a
      WHERE a.ticket_id = v_ticket_id AND a.queue_type = v_queue_type
    ) THEN
      CONTINUE;
    END IF;

    SELECT p.user_id INTO v_candidate
    FROM public.quality_monitor_presence p
    LEFT JOIN public.queue_ticket_assignments a
      ON a.assigned_to = p.user_id AND a.assigned_at::date = current_date
    WHERE p.is_online = true
    GROUP BY p.user_id
    ORDER BY count(a.id) ASC, p.user_id ASC
    LIMIT 1;

    IF v_candidate IS NULL THEN
      CONTINUE; -- ninguém online no momento: fica sem dono até a próxima sincronização
    END IF;

    INSERT INTO public.queue_ticket_assignments(ticket_id, queue_type, assigned_to, status)
    VALUES (v_ticket_id, v_queue_type, v_candidate, 'pending')
    ON CONFLICT (ticket_id, queue_type) DO NOTHING;

    ticket_id := v_ticket_id;
    queue_type := v_queue_type;
    assigned_to := v_candidate;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_queue_tickets(JSONB) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_queue_tickets(JSONB) FROM anon, public;

-- -----------------------------------------------------------------
-- 7. Ao salvar uma monitoria para um ticket, os itens de fila pendentes
-- daquele ticket contam como entregues (não entram mais na conta de
-- balanceamento do dia).
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_queue_assignment_on_monitoria()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.queue_ticket_assignments
  SET status = 'completed', completed_at = now()
  WHERE ticket_id = NEW.ticket_id AND status = 'pending';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_complete_queue_assignment ON public.monitorias;
CREATE TRIGGER trg_complete_queue_assignment
  AFTER INSERT ON public.monitorias
  FOR EACH ROW
  EXECUTE FUNCTION public.complete_queue_assignment_on_monitoria();

-- -----------------------------------------------------------------
-- 8. Realtime: presença e atribuições precisam refletir na tela na hora
-- -----------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'quality_monitor_presence'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.quality_monitor_presence;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'queue_ticket_assignments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_ticket_assignments;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
