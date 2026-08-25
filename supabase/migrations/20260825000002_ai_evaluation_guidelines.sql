-- =================================================================
-- ai_evaluation_guidelines — manual de padrões de atendimento usado
-- como contexto adicional pela IA ao avaliar tickets (Fila de Positivas)
--
-- Sintoma: a IA avaliava só com base nos critérios da ficha + a
-- transcrição do ticket, sem nenhuma referência ao manual/guia de
-- padrões de atendimento que a qualidade mantém internamente
-- (tom de voz, protocolo de abertura/fechamento, o que conta como
-- erro crítico na prática etc.).
--
-- Decisão: tabela dedicada, com `content` em texto puro (o que
-- realmente vai pro prompt da IA) e opcionalmente um PDF anexado só
-- para referência humana/auditoria — o texto do PDF é extraído no
-- navegador (pdfjs) no momento do upload e salvo em `content`, porque
-- a Edge Function (Deno, sandboxed) não tem como abrir o PDF binário
-- de forma confiável. Múltiplos registros podem ficar `active`; a
-- Edge Function concatena o conteúdo de todos os ativos no prompt,
-- com um limite de tamanho para não estourar o contexto do modelo.
--
-- Storage: bucket privado `ai-guidelines` guarda o PDF original só
-- para download/consulta; a IA nunca lê o binário diretamente.
-- =================================================================

CREATE TABLE IF NOT EXISTS public.ai_evaluation_guidelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  file_name TEXT,
  file_path TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_evaluation_guidelines_active_idx
  ON public.ai_evaluation_guidelines (active);

ALTER TABLE public.ai_evaluation_guidelines ENABLE ROW LEVEL SECURITY;

-- Leitura: admin e gestor_qualidade (quem também gerencia fichas/critérios).
DROP POLICY IF EXISTS "ai_guidelines_select_policy" ON public.ai_evaluation_guidelines;
CREATE POLICY "ai_guidelines_select_policy" ON public.ai_evaluation_guidelines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
        AND users.active = true
        AND users.role IN ('admin', 'gestor_qualidade')
    )
  );

-- Escrita: mesmo grupo, direto (sem Edge Function) — é conteúdo de
-- configuração, não dado sensível de terceiro.
DROP POLICY IF EXISTS "ai_guidelines_write_policy" ON public.ai_evaluation_guidelines;
CREATE POLICY "ai_guidelines_write_policy" ON public.ai_evaluation_guidelines
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
        AND users.active = true
        AND users.role IN ('admin', 'gestor_qualidade')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
        AND users.active = true
        AND users.role IN ('admin', 'gestor_qualidade')
    )
  );

CREATE OR REPLACE FUNCTION public.set_ai_guidelines_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ai_guidelines_updated_at ON public.ai_evaluation_guidelines;
CREATE TRIGGER ai_guidelines_updated_at
  BEFORE UPDATE ON public.ai_evaluation_guidelines
  FOR EACH ROW EXECUTE FUNCTION public.set_ai_guidelines_updated_at();

-- Bucket de storage privado para os PDFs anexados (referência humana).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ai-guidelines', 'ai-guidelines', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "ai_guidelines_storage_select" ON storage.objects;
CREATE POLICY "ai_guidelines_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'ai-guidelines'
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
        AND users.active = true
        AND users.role IN ('admin', 'gestor_qualidade')
    )
  );

DROP POLICY IF EXISTS "ai_guidelines_storage_write" ON storage.objects;
CREATE POLICY "ai_guidelines_storage_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ai-guidelines'
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
        AND users.active = true
        AND users.role IN ('admin', 'gestor_qualidade')
    )
  );

DROP POLICY IF EXISTS "ai_guidelines_storage_delete" ON storage.objects;
CREATE POLICY "ai_guidelines_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'ai-guidelines'
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
        AND users.active = true
        AND users.role IN ('admin', 'gestor_qualidade')
    )
  );

NOTIFY pgrst, 'reload schema';
