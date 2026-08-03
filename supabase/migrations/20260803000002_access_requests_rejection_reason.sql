-- =================================================================
-- access_requests.rejection_reason — coluna ausente no schema
--
-- RequestsManagement.tsx grava rejection_reason ao recusar uma
-- solicitação de acesso, e o motivo é enviado por e-mail ao usuário.
-- Mas o initial_schema criou access_requests sem essa coluna:
--   id, name, email, status, created_at
--
-- O PostgREST recusava com
--   400 PGRST204: Could not find the 'rejection_reason' column
--                 of 'access_requests' in the schema cache
-- e a interface exibia "Não foi possível processar a recusa da
-- solicitação", tornando impossível recusar qualquer solicitação.
--
-- O campo é de fato usado: o tipo AccessRequest o declara e o texto
-- alimenta o corpo do e-mail de recusa (send-email, type 'rejection').
-- =================================================================

ALTER TABLE public.access_requests
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

NOTIFY pgrst, 'reload schema';
