import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('user-team changes avoid the users/user_teams RLS cycle', async () => {
  const db = new PGlite();
  const admin = '00000000-0000-4000-8000-000000000001';
  const agent = '00000000-0000-4000-8000-000000000002';
  const team = '00000000-0000-4000-8000-000000000003';
  try {
    await db.exec(`
      CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE SCHEMA _private;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      CREATE TABLE public.users (id uuid PRIMARY KEY, role text NOT NULL, active boolean NOT NULL);
      CREATE TABLE public.user_teams (user_id uuid NOT NULL, team_id uuid NOT NULL,
        PRIMARY KEY (user_id, team_id));
      ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.user_teams ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA auth, _private TO authenticated;
      GRANT SELECT ON public.users TO authenticated;
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_teams TO authenticated;
      CREATE FUNCTION _private.current_active_role() RETURNS text
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
          SELECT role FROM public.users WHERE id = auth.uid() AND active
        $$;
      GRANT EXECUTE ON FUNCTION _private.current_active_role() TO authenticated;
      CREATE POLICY users_select ON public.users FOR SELECT TO authenticated USING (true);
      CREATE POLICY security_users_read ON public.users AS RESTRICTIVE FOR SELECT TO authenticated USING (
        id IN (SELECT user_id FROM public.user_teams) OR id = auth.uid()
      );
      CREATE POLICY user_teams_select ON public.user_teams FOR SELECT TO authenticated USING (true);
      CREATE POLICY security_user_teams_read ON public.user_teams AS RESTRICTIVE FOR SELECT TO authenticated
        USING (_private.current_active_role() IS NOT NULL);
      CREATE POLICY user_teams_delete ON public.user_teams FOR DELETE TO authenticated USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
      );
      CREATE POLICY security_user_teams_delete ON public.user_teams AS RESTRICTIVE FOR DELETE TO authenticated
        USING (_private.current_active_role() = 'admin');
    `);
    await db.query('INSERT INTO public.users VALUES ($1,$2,true),($3,$4,true)', [admin, 'admin', agent, 'suporte']);
    await db.query('INSERT INTO public.user_teams VALUES ($1,$2)', [agent, team]);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [admin]);
    await db.exec(await readFile(new URL('../supabase/migrations/20260928000001_fix_user_teams_write_rls_recursion.sql', import.meta.url), 'utf8'));
    const policies = await db.query(`SELECT policyname, coalesce(qual, '') || coalesce(with_check, '') AS expression
      FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_teams'
        AND policyname IN ('user_teams_insert', 'user_teams_update', 'user_teams_delete')`);
    assert.equal(policies.rows.length, 3);
    for (const policy of policies.rows) {
      assert.match(policy.expression, /_private\.current_active_role\(\)/);
      assert.doesNotMatch(policy.expression, /\busers\b/);
    }

    await db.exec('SET ROLE authenticated');
    await db.query('DELETE FROM public.user_teams WHERE user_id = $1', [agent]);
    await db.exec('RESET ROLE');
    assert.equal((await db.query('SELECT count(*)::int AS count FROM public.user_teams')).rows[0].count, 0);

    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [agent]);
    await db.exec('SET ROLE authenticated');
    await assert.rejects(
      db.query('INSERT INTO public.user_teams VALUES ($1,$2)', [agent, team]),
      /row-level security/
    );
  } finally {
    await db.close();
  }
});
