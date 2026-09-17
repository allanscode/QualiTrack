import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const migration = name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('PostgreSQL: restrictive RLS, rate limits and safe Auth identity migration', async t => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE SCHEMA _private;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb, created_at timestamptz);
    `);
    await db.exec((await migration('20260520000000_initial_schema')).replace('CREATE EXTENSION IF NOT EXISTS "pgcrypto";', ''));
    await db.exec(`ALTER TABLE public.users ADD COLUMN is_provisional boolean DEFAULT false, ADD COLUMN external_id text, ADD COLUMN source_system text;
      CREATE TABLE public.form_teams (form_id uuid, team_id uuid);
      CREATE TABLE public.helpdesk_submissions (id uuid PRIMARY KEY, monitoria_id uuid REFERENCES public.monitorias(id), created_by uuid, created_at timestamptz);
      CREATE TABLE public.ai_evaluation_guidelines (id uuid PRIMARY KEY, created_by uuid REFERENCES public.users(id));
      CREATE TABLE public.ai_evaluation_drafts (id uuid PRIMARY KEY, created_by uuid REFERENCES public.users(id), agent_id uuid);
      CREATE FUNCTION _private.is_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT EXISTS(SELECT FROM public.users WHERE id = auth.uid() AND active AND role = 'admin') $$;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
      DO $$ DECLARE tbl text; BEGIN FOREACH tbl IN ARRAY ARRAY['users','user_teams','teams','forms','form_teams','dissatisfaction_fields','quality_configs','access_requests'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tbl);
        EXECUTE format('CREATE POLICY legacy_all ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',tbl);
      END LOOP; END $$;
    `);
    const hardening = await migration('20260915000001_security_report_hardening');
    await db.exec(hardening);
    await db.exec(hardening); // Repeatability against already-hardened policies.
    const auditSql = await migration('20260609000001_security_audit_rls');
    for (const policy of auditSql.matchAll(/CREATE POLICY "monitorias_[\s\S]*?\n  \);/g)) await db.exec(policy[0]);
    await db.exec(await migration('20260821000001_helpdesk_submissions'));
    await db.exec(await migration('20260915000002_safe_auth_onboarding'));
    await db.exec(`CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();`);
    for (const [n, role, active] of [[1,'suporte',true],[2,'suporte',true],[3,'gestor_suporte',true],[4,'admin',true],[5,'qualidade',true],[6,'admin',false]]) {
      await db.query('INSERT INTO users(id,email,name,role,active) VALUES ($1,$2,$3,$4,$5)', [id(n),`u${n}@example.invalid`,`User ${n}`,role,active]);
    }
    await db.exec(`INSERT INTO teams(id,name) VALUES ('${id(101)}','A'),('${id(102)}','B');
      INSERT INTO user_teams(user_id,team_id) VALUES ('${id(1)}','${id(101)}'),('${id(2)}','${id(102)}'),('${id(3)}','${id(101)}');`);
    const asUser = async (n, fn) => {
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id(n)]);
      await db.exec('SET ROLE authenticated');
      try { return await fn(); } finally { await db.exec('RESET ROLE'); }
    };
    await t.test('support sees only own links, manager own team, quality/admin all; inactive sees none', async () => {
      for (const [n,count] of [[1,1],[3,2],[4,3],[5,3],[6,0]]) {
        const rows = await asUser(n, () => db.query('SELECT * FROM user_teams'));
        assert.equal(rows.rows.length,count,`user ${n}`);
      }
    });
    await t.test('support manager cannot grant membership despite permissive legacy policy', async () => {
      await assert.rejects(asUser(3, () => db.exec(`INSERT INTO user_teams(user_id,team_id) VALUES ('${id(3)}','${id(102)}')`)), /row-level security/);
      await asUser(4, () => db.exec(`INSERT INTO user_teams(user_id,team_id) VALUES ('${id(4)}','${id(102)}')`));
    });
    await t.test('users, evaluations and helpdesk receipts are isolated by identity/team', async () => {
      await db.exec(`INSERT INTO monitorias(id,evaluated_id,evaluator_id,team_id) VALUES ('${id(301)}','${id(1)}','${id(5)}','${id(101)}'),('${id(302)}','${id(2)}','${id(5)}','${id(102)}');
        INSERT INTO helpdesk_submissions(id,monitoria_id) VALUES ('${id(401)}','${id(301)}'),('${id(402)}','${id(302)}');`);
      for (const [n,count] of [[1,1],[3,1],[4,2],[5,2],[6,0]]) {
        assert.equal((await asUser(n, () => db.query('SELECT * FROM monitorias'))).rows.length,count);
        assert.equal((await asUser(n, () => db.query('SELECT * FROM helpdesk_submissions'))).rows.length,count);
      }
      assert.equal((await asUser(1, () => db.query('SELECT * FROM users'))).rows.length,1);
      assert.equal((await asUser(6, () => db.query('SELECT * FROM users'))).rows.length,1);
      const changed = await asUser(3, () => db.query(`UPDATE monitorias SET score=0 WHERE id='${id(302)}' RETURNING id`));
      assert.equal(changed.rows.length,0);

      // Aplica a migration de integridade de UPDATE em monitorias
      await db.exec(await migration('20260917000001_monitorias_update_integrity_and_anonymity'));

      // Suporte tentando alterar a própria nota diretamente via UPDATE deve ser rejeitado pela trigger
      await assert.rejects(
        asUser(1, () => db.query(`UPDATE monitorias SET score=100 WHERE id='${id(301)}'`)),
        /Atendentes não têm permissão para alterar nota/
      );
    });
    await t.test('direct anonymous/authenticated access requests and rate-limit RPC are denied', async () => {
      await db.exec('SET ROLE anon');
      try {
        await assert.rejects(db.exec("INSERT INTO access_requests(name,email) VALUES ('Test','x@example.invalid')"), /permission denied/);
        await assert.rejects(db.exec("SELECT consume_security_rate_limit('x',1,60)"), /permission denied/);
      } finally { await db.exec('RESET ROLE'); }
      await assert.rejects(asUser(4, () => db.exec("INSERT INTO access_requests(name,email) VALUES ('Test','x@example.invalid')")), /permission denied/);
    });
    await t.test('persistent service-only rate limit expires correctly', async () => {
      await db.exec('SET ROLE service_role');
      try {
        for (const expected of [true,true,false]) {
          const result = await db.query("SELECT consume_security_rate_limit('test',2,60) AS allowed");
          assert.equal(result.rows[0].allowed, expected);
        }
      } finally { await db.exec('RESET ROLE'); }
      await db.exec("UPDATE _private.security_rate_limits SET window_start = now() - interval '2 minutes'");
      assert.equal((await db.query("SELECT consume_security_rate_limit('test',2,60) AS allowed")).rows[0].allowed,true);
    });
    await t.test('admin-looking email and metadata cannot activate or elevate a signup', async () => {
      await db.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES ($1,$2,$3)', [id(10),'allan.amorim@webposto.com.br',{role:'admin',name:'Test'}]);
      const { rows } = await db.query('SELECT role,active FROM users WHERE id=$1',[id(10)]);
      assert.deepEqual(rows,[{role:'suporte',active:false}]);
    });
    await t.test('provisional identity preserves evaluation IDs, team membership and external mapping', async () => {
      await db.exec(`INSERT INTO users(id,email,name,role,is_provisional,external_id,source_system) VALUES ('${id(20)}','provisional@example.invalid','Provisional','suporte',true,'external-1','helpdesk');
        INSERT INTO monitorias(id,evaluated_id,evaluator_id) VALUES ('${id(201)}','${id(20)}','${id(5)}');
        INSERT INTO user_teams(user_id,team_id) VALUES ('${id(20)}','${id(101)}');
        INSERT INTO auth.users(id,email) VALUES ('${id(21)}','provisional@example.invalid');`);
      assert.equal((await db.query(`SELECT evaluated_id FROM monitorias WHERE id='${id(201)}'`)).rows[0].evaluated_id,id(21));
      assert.equal((await db.query(`SELECT * FROM users WHERE id='${id(20)}'`)).rows.length,0);
      assert.equal((await db.query(`SELECT external_id FROM users WHERE id='${id(21)}'`)).rows[0].external_id,'external-1');
      assert.equal((await db.query(`SELECT * FROM user_teams WHERE user_id='${id(21)}'`)).rows.length,1);
    });
  } finally { await db.close(); }
});
