import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { buildFreshSql } from './prepare-supabase.mjs';

const id = n => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('clean Supabase install: exact generated SQL, no demo data, platform fixtures only', async t => {
  const db = new PGlite();
  try {
    // Emulate ONLY managed Supabase objects. Application tables come exclusively
    // from the actual deployment artifact, not a hand-written test schema.
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE SCHEMA storage;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb,created_at timestamptz,email_confirmed_at timestamptz);
      CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
      GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated,service_role;
      CREATE PUBLICATION supabase_realtime;
    `);
    const { sql, manifest } = await buildFreshSql();
    await db.exec(sql);
    const asUser = async (n, run) => {
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id(n)]);
      await db.exec('SET ROLE authenticated');
      try { return await run(); } finally { await db.exec('RESET ROLE'); }
    };
    await t.test('all 15 application tables empty and RLS enabled; no password/demo seed', async () => {
      const { rows } = await db.query("SELECT relname,relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND relkind='r'");
      assert.equal(rows.length,15);
      for (const row of rows) {
        assert.equal(row.relrowsecurity,true,row.relname);
        assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.${row.relname}`)).rows[0].n,0,row.relname);
      }
      assert.equal((await db.query('SELECT count(*)::int AS n FROM auth.users')).rows[0].n,0);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name IN ('password','reset_token','team_ids','team_id')")).rows[0].n,0);
      assert.ok(manifest.every(x => /^[a-f0-9]{64}$/.test(x.sha256)));
    });
    await t.test('second application refuses without erasing existing architecture', async () => {
      await assert.rejects(db.exec(sql),/Clean install refused/);
      await db.exec('ROLLBACK');
      assert.ok((await db.query("SELECT to_regclass('public.monitorias') AS name")).rows[0].name);
    });
    await t.test('Auth trigger cannot grant admin from email or metadata; one-time admin is guarded', async () => {
      await db.query('INSERT INTO auth.users(id,email,raw_user_meta_data,email_confirmed_at) VALUES ($1,$2,$3,now())',[id(1),'owner@example.invalid',{role:'admin',name:'Owner'}]);
      assert.deepEqual((await db.query('SELECT role,active FROM public.users WHERE id=$1',[id(1)])).rows,[{role:'suporte',active:false}]);
      const adminTemplate = await readFile(new URL('../supabase/bootstrap/first-admin.sql',import.meta.url),'utf8');
      await assert.rejects(db.exec(adminTemplate),/Replace both/);
      await db.exec('ROLLBACK');
      // Replace only declarations; guard constants intentionally remain unchanged.
      const corrected = adminTemplate.replace("expected_id uuid := '00000000-0000-0000-0000-000000000000'",`expected_id uuid := '${id(1)}'`).replace("expected_email text := 'REPLACE_WITH_CONFIRMED_EMAIL'","expected_email text := 'owner@example.invalid'");
      await db.exec(corrected);
      await assert.rejects(db.exec(corrected),/administrator already exists/);
      await db.exec('ROLLBACK');
    });
    await t.test('admin creates team/form/monitoria; support and managers cannot read another team', async () => {
      for (const [n,role] of [[2,'suporte'],[3,'gestor_suporte'],[4,'qualidade'],[5,'suporte']]) {
        await db.query('INSERT INTO public.users(id,email,name,role,active) VALUES ($1,$2,$3,$4,true)',[id(n),`u${n}@example.invalid`,`User ${n}`,role]);
      }
      await asUser(1, () => db.exec(`INSERT INTO teams(id,name) VALUES ('${id(10)}','Team A'),('${id(11)}','Team B');
        INSERT INTO user_teams(user_id,team_id) VALUES ('${id(2)}','${id(10)}'),('${id(3)}','${id(10)}'),('${id(5)}','${id(11)}');
        INSERT INTO forms(id,title,created_by) VALUES ('${id(20)}','Form','${id(1)}');
        INSERT INTO form_teams(form_id,team_id) VALUES ('${id(20)}','${id(10)}');
        INSERT INTO monitorias(id,form_id,evaluated_id,evaluator_id,team_id,score,question_observations,form_snapshot,applied_config)
          VALUES ('${id(30)}','${id(20)}','${id(2)}','${id(4)}','${id(10)}',80,'{}','{}','{}'),('${id(31)}','${id(20)}','${id(5)}','${id(4)}','${id(11)}',90,'{}','{}','{}');`));
      for (const [n,count] of [[1,2],[2,1],[3,1],[4,2],[5,1]]) {
        assert.equal((await asUser(n,() => db.query('SELECT * FROM monitorias'))).rows.length,count);
      }
      assert.equal((await asUser(2,() => db.query('SELECT * FROM user_teams'))).rows.length,1);
      assert.equal((await asUser(3,() => db.query('SELECT * FROM user_teams'))).rows.length,2);
      assert.equal((await asUser(2,() => db.query('SELECT evaluator_id FROM vw_monitorias_suporte'))).rows[0].evaluator_id,null);
      await assert.rejects(asUser(3,() => db.exec(`INSERT INTO user_teams(user_id,team_id) VALUES ('${id(3)}','${id(11)}')`)),/row-level security/);
      await assert.rejects(asUser(2,() => db.exec(`INSERT INTO monitorias(evaluated_id,score) VALUES ('${id(2)}',100)`)),/row-level security/);
    });
    await t.test('anonymous and logged-in browsers cannot submit direct access requests or run scheduler', async () => {
      for (const role of ['anon','authenticated']) {
        await db.exec(`SET ROLE ${role}`);
        try {
          await assert.rejects(db.exec("INSERT INTO access_requests(name,email) VALUES ('Test','test@example.invalid')"),/permission denied/);
          await assert.rejects(db.exec('SELECT process_action_deadline_timeouts()'),/permission denied/);
          await assert.rejects(db.exec("SELECT consume_security_rate_limit('x',1,60)"),/permission denied/);
        } finally { await db.exec('RESET ROLE'); }
      }
    });
    await t.test('private Storage configured, member cannot read files, admin can upload', async () => {
      const bucket = (await db.query("SELECT * FROM storage.buckets WHERE id='ai-guidelines'")).rows[0];
      assert.equal(bucket.public,false);
      assert.equal(Number(bucket.file_size_limit),10485760);
      await asUser(1,() => db.exec("INSERT INTO storage.objects(bucket_id,name) VALUES ('ai-guidelines','test.pdf')"));
      assert.equal((await asUser(2,() => db.query('SELECT * FROM storage.objects'))).rows.length,0);
      assert.equal((await asUser(1,() => db.query('SELECT * FROM storage.objects'))).rows.length,1);
    });
    await t.test('scheduler finalizes once and calendar handles São Paulo weekends', async () => {
      await db.exec(`UPDATE monitorias SET action_deadline_at=now()-interval '1 hour' WHERE id='${id(30)}';
        SELECT process_action_deadline_timeouts(); SELECT process_action_deadline_timeouts();`);
      const item = (await db.query(`SELECT status,score,jsonb_array_length(history) AS events FROM monitorias WHERE id='${id(30)}'`)).rows[0];
      assert.equal(item.status,'concluida'); assert.equal(Number(item.score),80); assert.equal(item.events,1);
      await assert.rejects(db.exec("SELECT calculate_action_deadline('2026-09-18T19:00:00Z',2)"),/calendar missing/);
      await db.exec("INSERT INTO business_hours(day_of_week) SELECT generate_series(1,5)");
      const deadline = (await db.query("SELECT calculate_action_deadline('2026-09-18T19:00:00Z',2) AS result")).rows[0].result;
      assert.equal(new Date(deadline).toISOString(),'2026-09-21T12:00:00.000Z');
      assert.ok((await db.query("SELECT * FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='monitorias'")).rows.length);
    });
  } finally { await db.close(); }
});
