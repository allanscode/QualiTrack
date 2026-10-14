import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const id = n => `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('dashboard aggregates enforce role scope, filters, and anonymous support output', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE TABLE public.users(id uuid PRIMARY KEY, role text, active boolean);
      CREATE TABLE public.user_teams(user_id uuid, team_id uuid);
      CREATE TABLE public.monitorias(
        id uuid PRIMARY KEY, created_at timestamptz, score numeric, active boolean,
        team_id uuid, ticket_group_team_id uuid, evaluated_id uuid, evaluator_id uuid,
        form_id uuid, status text, channel text);
      -- This intentionally broad view proves the RPC's explicit support guard.
      CREATE VIEW public.vw_monitorias_suporte AS
        SELECT id, created_at, score, active, team_id, ticket_group_team_id,
          evaluated_id, NULL::uuid AS evaluator_id, form_id, status, channel
        FROM public.monitorias;
      INSERT INTO public.users VALUES
        ('${id(1)}','admin',true), ('${id(2)}','gestor_suporte',true),
        ('${id(3)}','suporte',true), ('${id(4)}','suporte',true),
        ('${id(5)}','admin',false);
      INSERT INTO public.user_teams VALUES ('${id(2)}','${id(10)}');
      INSERT INTO public.monitorias VALUES
        ('${id(20)}','2026-10-01T12:00:00Z',0,true,'${id(10)}','${id(30)}','${id(3)}','${id(40)}','${id(50)}','concluida','Chat'),
        ('${id(21)}','2026-10-02T12:00:00Z',100,true,'${id(10)}',NULL,'${id(4)}','${id(40)}','${id(50)}','concluida','Email'),
        ('${id(22)}','2026-10-03T12:00:00Z',50,true,'${id(11)}','${id(31)}','${id(4)}','${id(41)}','${id(50)}','pendente_revisao','Chat'),
        ('${id(23)}','2026-10-04T12:00:00Z',99,false,'${id(10)}','${id(30)}','${id(3)}','${id(40)}','${id(50)}','concluida','Chat');
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/20261014000002_dashboard_aggregates.sql', import.meta.url), 'utf8'));
    const call = `SELECT public.dashboard_aggregates('2026-10-01','2026-10-31',NULL,NULL,NULL,NULL,NULL,NULL,NULL) AS result`;
    async function forUser(user, sql = call) {
      await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${id(user)}',false);`);
      try { return (await db.query(sql)).rows[0].result; }
      finally { await db.exec('RESET ROLE;'); }
    }
    const admin = await forUser(1);
    assert.equal(admin.total, 3);
    assert.equal(Number(admin.average), 50);
    assert.equal(admin.ranking_baseline, 3);
    const manager = await forUser(2);
    assert.equal(manager.total, 2);
    const support = await forUser(3);
    assert.equal(support.total, 1);
    assert.equal(Number(support.average), 0);
    assert.deepEqual(support.auditors, []);
    assert.equal(support.agents.length, 1);
    assert.equal(support.agents[0].id, id(3));
    const filtered = await forUser(1,
      `SELECT public.dashboard_aggregates('2026-10-01','2026-10-31',NULL,'__missing_ticket_group__',NULL,NULL,NULL,NULL,NULL) AS result`);
    assert.equal(filtered.total, 1);
    const selectedAgent = await forUser(1,
      `SELECT public.dashboard_aggregates('2026-10-01','2026-10-31',NULL,NULL,'${id(3)}',NULL,NULL,NULL,NULL) AS result`);
    assert.equal(selectedAgent.total, 1);
    assert.equal(selectedAgent.ranking_baseline, 3);
    await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${id(5)}',false);`);
    await assert.rejects(db.query(call), /Acesso negado/);
    await db.exec('RESET ROLE; SET ROLE anon;');
    await assert.rejects(db.query(call), /permission denied/);
  } finally { await db.close(); }
});
