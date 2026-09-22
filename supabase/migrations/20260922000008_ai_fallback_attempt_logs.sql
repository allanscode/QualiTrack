-- Guarda a trilha completa da cadeia de modelos na mesma linha do resultado
-- final. Tentativas intermediárias não criam avaliações/logs finais duplicados.
ALTER TABLE public.ai_evaluation_logs
  ADD COLUMN IF NOT EXISTS attempts JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fallback_used BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ai_evaluation_logs.attempts IS
  'Tentativas ordenadas da cadeia de IA, incluindo modelo, número, motivo e duração.';
COMMENT ON COLUMN public.ai_evaluation_logs.fallback_used IS
  'Indica se o resultado final veio de um modelo posterior ao primário.';

NOTIFY pgrst, 'reload schema';
