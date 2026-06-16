-- =================================================================
-- M1: FOUNDATION — Conversões de tipo, FKs, índices, constraints,
--     triggers, colunas snapshot, resolution_type, contestation_result
-- =================================================================

-- -----------------------------------------------------------------
-- P1: Converter forms.created_by e forms.team_id de TEXT para UUID
-- -----------------------------------------------------------------
ALTER TABLE public.forms ALTER COLUMN created_by TYPE UUID USING created_by::uuid;
ALTER TABLE public.forms ALTER COLUMN team_id TYPE UUID USING team_id::uuid;

-- -----------------------------------------------------------------
-- P1: Converter users.team_ids de _text para _uuid (temporário —
--     será removido na M5 quando user_teams for criado)
-- -----------------------------------------------------------------
ALTER TABLE public.users ALTER COLUMN team_ids TYPE UUID[] USING team_ids::uuid[];

-- -----------------------------------------------------------------
-- P2: Adicionar Foreign Keys
-- -----------------------------------------------------------------
ALTER TABLE public.monitorias
  ADD CONSTRAINT fk_monitorias_evaluator
    FOREIGN KEY (evaluator_id) REFERENCES public.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_monitorias_evaluated
    FOREIGN KEY (evaluated_id) REFERENCES public.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_monitorias_team
    FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_monitorias_form
    FOREIGN KEY (form_id) REFERENCES public.forms(id) ON DELETE SET NULL;

ALTER TABLE public.users
  ADD CONSTRAINT fk_users_team
    FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE public.forms
  ADD CONSTRAINT fk_forms_created_by
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_forms_team
    FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------
-- P3: Índices (partial indexes para performance)
-- -----------------------------------------------------------------
CREATE INDEX idx_monitorias_evaluator ON public.monitorias(evaluator_id) WHERE active = true;
CREATE INDEX idx_monitorias_evaluated ON public.monitorias(evaluated_id) WHERE active = true;
CREATE INDEX idx_monitorias_team ON public.monitorias(team_id) WHERE active = true;
CREATE INDEX idx_monitorias_status ON public.monitorias(status) WHERE active = true;
CREATE INDEX idx_monitorias_created_at ON public.monitorias(created_at DESC) WHERE active = true;
CREATE INDEX idx_monitorias_deadline ON public.monitorias(deadline_at)
  WHERE status NOT IN ('concluida','finalizada_alterada') AND active = true;
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_role ON public.users(role) WHERE active = true;
CREATE INDEX idx_users_id_active_role ON public.users(id, active, role);
CREATE INDEX idx_access_requests_status ON public.access_requests(status) WHERE status = 'pending';

-- -----------------------------------------------------------------
-- P8: CHECK constraints + resolution_type
-- -----------------------------------------------------------------
ALTER TABLE public.monitorias
  ADD CONSTRAINT chk_monitoria_status
  CHECK (status IN (
    'pendente_revisao','em_contestacao','aguardando_gestor_suporte',
    'aguardando_gestor_qualidade','concluida','contestacao_aceita',
    'contestacao_negada','finalizada_alterada','reavaliacao_solicitada'
  ));

ALTER TABLE public.monitorias ADD COLUMN resolution_type TEXT;
ALTER TABLE public.monitorias
  ADD CONSTRAINT chk_resolution_type
  CHECK (resolution_type IS NULL OR resolution_type IN ('human','automatic'));

ALTER TABLE public.access_requests
  ADD CONSTRAINT chk_access_status
  CHECK (status IN ('pending','approved','rejected'));

-- -----------------------------------------------------------------
-- P11: Score constraint
-- -----------------------------------------------------------------
ALTER TABLE public.monitorias ALTER COLUMN score TYPE NUMERIC(5,2);
ALTER TABLE public.monitorias
  ADD CONSTRAINT chk_score CHECK (score >= 0 AND score <= 100);

-- -----------------------------------------------------------------
-- P13: Trigger updated_at
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
SET search_path = 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_monitorias_updated_at
  BEFORE UPDATE ON public.monitorias
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_quality_configs_updated_at
  BEFORE UPDATE ON public.quality_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -----------------------------------------------------------------
-- P9: Config version
-- -----------------------------------------------------------------
ALTER TABLE public.quality_configs ADD COLUMN IF NOT EXISTS config_version INTEGER DEFAULT 1;

-- -----------------------------------------------------------------
-- P5: Colunas snapshot de nomes (preservam registro histórico)
-- -----------------------------------------------------------------
ALTER TABLE public.monitorias ADD COLUMN evaluator_name TEXT;
ALTER TABLE public.monitorias ADD COLUMN evaluated_name TEXT;
ALTER TABLE public.monitorias ADD COLUMN form_name TEXT;
ALTER TABLE public.monitorias ADD COLUMN team_name TEXT;

-- Popular colunas snapshot a partir dos dados existentes via JOIN
UPDATE public.monitorias m SET evaluator_name = u.name
  FROM public.users u WHERE u.id = m.evaluator_id;

UPDATE public.monitorias m SET evaluated_name = u.name
  FROM public.users u WHERE u.id = m.evaluated_id;

UPDATE public.monitorias m SET form_name = f.title
  FROM public.forms f WHERE f.id = m.form_id;

UPDATE public.monitorias m SET team_name = t.name
  FROM public.teams t WHERE t.id = m.team_id;

-- -----------------------------------------------------------------
-- P15: contestation_result (campo determinístico)
-- -----------------------------------------------------------------
ALTER TABLE public.monitorias ADD COLUMN contestation_result TEXT;
ALTER TABLE public.monitorias
  ADD CONSTRAINT chk_contestation_result
  CHECK (contestation_result IS NULL OR contestation_result IN ('approved','rejected','pending'));
