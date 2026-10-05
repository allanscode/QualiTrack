-- The PJ migration added monitorias_status_check but left the older
-- chk_monitoria_status in place on databases upgraded from the legacy schema.
-- Both checks apply, so the older one rejects aguardando_revisao_pj.
BEGIN;

ALTER TABLE public.monitorias
  DROP CONSTRAINT IF EXISTS chk_monitoria_status;
ALTER TABLE public.monitorias
  DROP CONSTRAINT IF EXISTS monitorias_status_check;
ALTER TABLE public.monitorias
  ADD CONSTRAINT chk_monitoria_status CHECK (status IN (
    'pendente_revisao', 'em_contestacao', 'aguardando_gestor_suporte',
    'aguardando_revisao_pj', 'aguardando_gestor_qualidade', 'concluida',
    'contestacao_aceita', 'contestacao_negada', 'finalizada_alterada',
    'reavaliacao_solicitada'
  ));

NOTIFY pgrst, 'reload schema';
COMMIT;
