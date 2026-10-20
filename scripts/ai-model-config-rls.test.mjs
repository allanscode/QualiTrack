import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('only active administrators can read; direct client writes are denied', async () => {
  const db = new PGlite();
  const admin = '11111111-1111-4111-8111-111111111111';
  const user = '22222222-2222-4222-8222-222222222222';
  const inactive = '33333333-3333-4333-8333-333333333333';
  const manager = '44444444-4444-4444-8444-444444444444';
  try {
    await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth; CREATE SCHEMA _private;
      CREATE TABLE public.users (id uuid PRIMARY KEY, role text NOT NULL, active boolean NOT NULL);
      INSERT INTO public.users VALUES ('${admin}','admin',true),('${user}','qualidade',true),('${inactive}','admin',false),('${manager}','gestor_qualidade',true);
      GRANT SELECT ON public.users TO authenticated;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE FUNCTION _private.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
        SELECT EXISTS (SELECT 1 FROM public.users WHERE id=auth.uid() AND role='admin' AND active) $$;`);
    await db.exec(readFileSync(new URL('../supabase/migrations/20261019000006_ai_model_config.sql', import.meta.url), 'utf8'));
    await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub = '${user}';`);
    await assert.rejects(db.exec("INSERT INTO public.ai_model_config (model_id) VALUES ('provider/text')"), /permission denied/);
    await db.exec(`RESET ROLE; SET ROLE authenticated; SET request.jwt.claim.sub = '${inactive}';`);
    await assert.rejects(db.exec("INSERT INTO public.ai_model_config (model_id) VALUES ('provider/text')"), /permission denied/);
    await db.exec(`RESET ROLE; SET ROLE authenticated; SET request.jwt.claim.sub = '${admin}';`);
    await assert.rejects(db.exec("INSERT INTO public.ai_model_config (model_id) VALUES ('provider/text')"), /permission denied/);
    await db.exec("RESET ROLE; INSERT INTO public.ai_model_config (model_id) VALUES ('provider/text')");
    await db.exec(`RESET ROLE; SET ROLE authenticated; SET request.jwt.claim.sub = '${user}';`);
    assert.equal((await db.query('SELECT * FROM public.ai_model_config')).rows.length, 0);
    await db.exec(`RESET ROLE; SET ROLE authenticated; SET request.jwt.claim.sub = '${manager}';`);
    assert.equal((await db.query('SELECT * FROM public.ai_model_config')).rows.length, 0);
    await db.exec(`RESET ROLE; SET ROLE authenticated; SET request.jwt.claim.sub = '${admin}';`);
    assert.equal((await db.query('SELECT * FROM public.ai_model_config')).rows.length, 1);
  } finally { await db.close(); }
});
