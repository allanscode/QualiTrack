import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('browser roles cannot forge AI logs or bypass RLS with TRUNCATE', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role;
      CREATE TABLE public.ai_evaluation_logs (id uuid PRIMARY KEY, ticket_id text NOT NULL);
      CREATE TABLE public.users (id uuid PRIMARY KEY, role text);
      GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
      ALTER TABLE public.ai_evaluation_logs ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "Authenticated can insert ai_evaluation_logs" ON public.ai_evaluation_logs
        FOR INSERT TO authenticated WITH CHECK (true);
    `);
    const sql = await readFile(new URL('../supabase/migrations/20260922000015_harden_ai_log_permissions.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    const { rows } = await db.query(`
      SELECT
        has_table_privilege('authenticated', 'public.ai_evaluation_logs', 'INSERT') AS auth_insert,
        has_table_privilege('anon', 'public.ai_evaluation_logs', 'INSERT') AS anon_insert,
        has_table_privilege('authenticated', 'public.users', 'TRUNCATE') AS auth_truncate,
        has_table_privilege('service_role', 'public.ai_evaluation_logs', 'INSERT') AS service_insert,
        EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_evaluation_logs' AND cmd='INSERT') AS insert_policy;
    `);
    assert.deepEqual(rows, [{ auth_insert: false, anon_insert: false, auth_truncate: false, service_insert: true, insert_policy: false }]);
  } finally {
    await db.close();
  }
});

test('deactivated accounts cannot pass SECURITY DEFINER role helpers', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE SCHEMA auth;
      CREATE SCHEMA _private;
      CREATE TABLE public.users (id uuid PRIMARY KEY, role text NOT NULL, active boolean NOT NULL);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
    `);
    const sql = await readFile(new URL('../supabase/migrations/20260922000017_active_private_role_helpers.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    const userId = '00000000-0000-4000-8000-000000000001';
    await db.query('INSERT INTO public.users(id,role,active) VALUES($1,$2,$3)', [userId, 'gestor_qualidade', false]);
    await db.exec(`SET request.jwt.claim.sub = '${userId}'`);
    const inactive = await db.query('SELECT _private.is_admin_user() admin, _private.is_quality_team_user() quality');
    assert.deepEqual(inactive.rows, [{ admin: false, quality: false }]);
    await db.query('UPDATE public.users SET active=true WHERE id=$1', [userId]);
    const active = await db.query('SELECT _private.is_admin_user() admin, _private.is_quality_team_user() quality');
    assert.deepEqual(active.rows, [{ admin: true, quality: true }]);
  } finally {
    await db.close();
  }
});
