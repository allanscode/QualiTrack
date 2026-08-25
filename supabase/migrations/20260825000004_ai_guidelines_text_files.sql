-- =================================================================
-- Bucket ai-guidelines: aceita também arquivos de texto puro (.txt,
-- .md, .csv), não só PDF — o texto desses formatos é lido direto no
-- navegador (File.text()), sem precisar de extração como no PDF.
-- =================================================================

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/octet-stream'  -- alguns navegadores mandam .md/.csv assim
]
WHERE id = 'ai-guidelines';

NOTIFY pgrst, 'reload schema';
