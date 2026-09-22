-- =================================================================
-- Autorização de Realtime para o canal de presença "online-presence"
--
-- O card "Usuários Online" sempre mostrava 1 (só a própria sessão),
-- porque realtime.messages tem RLS habilitado mas nenhuma política
-- concedendo acesso — a autorização do canal falhava silenciosamente
-- para todo mundo, então channel.track() nunca sincronizava presença
-- entre usuários diferentes, e cada tela caía no fallback local
-- (localStorage, que só enxerga sessões do próprio navegador).
--
-- A política abaixo libera qualquer usuário autenticado a ler/enviar
-- presença nesse tópico específico — não expõe dados sensíveis, é só
-- "quem está com a tela aberta agora".
-- =================================================================

DROP POLICY IF EXISTS "authenticated_can_use_online_presence" ON "realtime"."messages";

CREATE POLICY "authenticated_can_use_online_presence"
ON "realtime"."messages"
FOR ALL
TO authenticated
USING (realtime.topic() = 'online-presence')
WITH CHECK (realtime.topic() = 'online-presence');

NOTIFY pgrst, 'reload schema';
