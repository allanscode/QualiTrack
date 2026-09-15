-- Read-only inventory. Execute on source and restored staging target.
-- Contains counts/configuration, no email addresses, tokens or message content.
SELECT version();
SELECT extname, extversion FROM pg_extension ORDER BY extname;
SELECT schemaname, tablename, rowsecurity FROM pg_tables
 WHERE schemaname IN ('public','_private') ORDER BY schemaname, tablename;
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
 FROM pg_policies WHERE schemaname IN ('public','storage') ORDER BY schemaname, tablename, policyname;
SELECT event_object_schema, event_object_table, trigger_name, action_statement
 FROM information_schema.triggers WHERE event_object_schema IN ('public','auth')
 ORDER BY event_object_schema,event_object_table,trigger_name;
SELECT 'auth.users' AS relation, count(*) AS rows FROM auth.users
 UNION ALL SELECT 'public.users', count(*) FROM public.users
 UNION ALL SELECT 'user_teams', count(*) FROM public.user_teams
 UNION ALL SELECT 'monitorias', count(*) FROM public.monitorias
 UNION ALL SELECT 'helpdesk_submissions', count(*) FROM public.helpdesk_submissions
 UNION ALL SELECT 'ai_evaluation_guidelines', count(*) FROM public.ai_evaluation_guidelines
 UNION ALL SELECT 'ai_evaluation_drafts', count(*) FROM public.ai_evaluation_drafts;
SELECT count(*) AS nonprovisional_users_without_auth FROM public.users u
 LEFT JOIN auth.users a ON a.id = u.id WHERE a.id IS NULL AND NOT u.is_provisional;
SELECT count(*) AS orphan_team_links FROM public.user_teams ut
 LEFT JOIN public.users u ON u.id=ut.user_id LEFT JOIN public.teams t ON t.id=ut.team_id
 WHERE u.id IS NULL OR t.id IS NULL;
SELECT pubname, schemaname, tablename FROM pg_publication_tables ORDER BY pubname, tablename;
-- If the CLI history table exists, also inspect:
-- SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
-- If pg_cron is enabled, inspect cron.job in the Dashboard (commands may contain secrets).
