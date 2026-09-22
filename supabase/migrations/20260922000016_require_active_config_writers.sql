-- Legacy permissive write policies on configuration tables checked the role
-- but not whether the account had been deactivated. Restrictive policies
-- preserve each table's existing role rules while requiring an active user.
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'access_requests', 'business_hours', 'holidays', 'form_teams',
    'forms', 'dissatisfaction_fields', 'teams', 'quality_configs',
    'ai_evaluation_logs'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS security_active_all ON public.%I', table_name);
    EXECUTE format(
      'CREATE POLICY security_active_all ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      || 'USING (_private.current_active_role() IS NOT NULL) '
      || 'WITH CHECK (_private.current_active_role() IS NOT NULL)', table_name
    );
  END LOOP;
END;
$$;
