-- =================================================================
-- Fix: set explicit search_path on cron-related functions to
-- eliminate "role mutable search_path" security warning
-- =================================================================

ALTER FUNCTION public.process_action_deadline_timeouts()
  SET search_path TO 'public';

ALTER FUNCTION public.calculate_action_deadline(timestamp with time zone, numeric)
  SET search_path TO 'public';
