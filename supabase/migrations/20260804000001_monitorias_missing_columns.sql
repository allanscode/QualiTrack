-- =================================================================
-- monitorias — 9 colunas ausentes no schema, exigidas pelo frontend
--
-- Sintoma: criar uma monitoria nova sempre falhava. A interface exibia
-- apenas "Não foi possível salvar a monitoria. Tente novamente." e o
-- registro nunca chegava ao banco — nenhuma monitoria criada pela
-- aplicação existia, só as inseridas por seed.
--
-- Causa: useMonitoriaSave.ts monta o payload com 8 campos e
-- useMonitoriaActions.ts grava mais 1 (contestation_reason) que o
-- initial_schema nunca criou. O PostgREST recusa a operação inteira
-- com PGRST204 ao encontrar a primeira coluna desconhecida.
--
-- Todos os campos são declarados no tipo Monitoria (src/types.ts) e
-- consumidos pela interface — não são resíduo. Os tipos abaixo seguem
-- as declarações do TypeScript:
--   question_observations       Record<string,string>  -> JSONB
--   critical_error_observations Record<string,string>  -> JSONB
--   selected_critical_errors    string[]               -> TEXT[]
--   evaluator_note              string                 -> TEXT
--   client_contact_log          string                 -> TEXT
--   client_contact_success      boolean                -> BOOLEAN
--   form_snapshot               EvaluationForm         -> JSONB
--   applied_config              Record<string,unknown> -> JSONB
--   contestation_reason         string                 -> TEXT
--
-- form_snapshot e applied_config guardam a ficha e a configuração de
-- qualidade vigentes no momento da avaliação, para que alterar a ficha
-- depois não distorça monitorias antigas.
-- =================================================================

ALTER TABLE public.monitorias
  ADD COLUMN IF NOT EXISTS question_observations       JSONB   DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS critical_error_observations JSONB   DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS selected_critical_errors    TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS evaluator_note              TEXT,
  ADD COLUMN IF NOT EXISTS client_contact_log          TEXT,
  ADD COLUMN IF NOT EXISTS client_contact_success      BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS form_snapshot               JSONB,
  ADD COLUMN IF NOT EXISTS applied_config              JSONB,
  ADD COLUMN IF NOT EXISTS contestation_reason         TEXT;

NOTIFY pgrst, 'reload schema';
