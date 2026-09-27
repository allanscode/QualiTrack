// ISOLATED AUDIT CHARACTERIZATION — deliberately not wired into CI.
// PASS means the current SQL reproduced the named vulnerability/installation gap.
// This is not a security regression suite and passing does not certify safety.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { buildFreshSql } from './prepare-supabase.mjs';

const migration = name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('AUDIT: reproduce current agent_feedbacks authorization gaps (PASS confirms findings)', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE SCHEMA _private;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      CREATE TABLE public.users (
        id uuid PRIMARY KEY, role text NOT NULL, active boolean NOT NULL
      );
      CREATE TABLE public.teams (id uuid PRIMARY KEY);
      CREATE TABLE public.user_teams (user_id uuid NOT NULL, team_id uuid NOT NULL);
      CREATE TABLE public.monitorias (id uuid PRIMARY KEY);
      GRANT USAGE ON SCHEMA public, auth, _private TO authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
    `);
    await db.exec(await migration('20260922000017_active_private_role_helpers'));
    await db.exec(await migration('20260926000001_create_agent_feedbacks'));
    await db.exec(await migration('20260926000002_harden_feedbacks_security'));
    // Supabase API roles need table grants in addition to RLS; this fixture
    // supplies them explicitly so the test measures the migrations' policies.
    await db.exec('GRANT SELECT, INSERT, UPDATE ON public.agent_feedbacks TO authenticated; GRANT SELECT ON public.user_teams TO authenticated;');

    const users = [
      [1, 'suporte', true],       // active agent
      [2, 'suporte', true],       // cross-team target
      [3, 'gestor_suporte', true],// active manager, team A
      [4, 'gestor_suporte', false],// inactive manager
      [5, 'gestor_suporte', true],// active manager, no teams
      [6, 'suporte', false],      // inactive agent
    ];
    for (const [n, role, active] of users) {
      await db.query('INSERT INTO public.users(id, role, active) VALUES ($1, $2, $3)', [id(n), role, active]);
    }
    await db.query('INSERT INTO public.teams(id) VALUES ($1), ($2)', [id(101), id(102)]);
    await db.query('INSERT INTO public.monitorias(id) VALUES ($1), ($2)', [id(201), id(202)]);
    await db.query('INSERT INTO public.user_teams(user_id, team_id) VALUES ($1, $2)', [id(3), id(101)]);
    await db.query(`
      INSERT INTO public.agent_feedbacks
        (id, agent_id, manager_id, team_id, monitoria_id, title, improvements, action_plan, status)
      VALUES
        ($1, $2, $3, $4, $5, 'Initial', 'Improve', 'Plan', 'concluido'),
        ($6, $2, $3, NULL, NULL, 'Unassigned', 'Improve', 'Plan', 'pendente_ciencia'),
        ($7, $2, $8, $4, $5, 'Inactive manager row', 'Improve', 'Plan', 'pendente_ciencia'),
        ($9, $10, $3, $4, $5, 'Inactive agent row', 'Improve', 'Plan', 'pendente_ciencia')
    `, [id(301), id(1), id(3), id(101), id(201), id(302), id(303), id(4), id(304), id(6)]);

    const asUser = async (n, fn) => {
      await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id(n)]);
      await db.exec('SET ROLE authenticated');
      try { return await fn(); } finally { await db.exec('RESET ROLE'); }
    };

    const identity = await asUser(3, () => db.query(`SELECT auth.uid() AS uid, role, active,
      _private.is_admin_user() AS admin,
      EXISTS (SELECT 1 FROM public.users u WHERE u.id=auth.uid() AND u.active=true
        AND u.role IN ('admin','gestor_qualidade','gestor_suporte')) AS insert_role
      FROM public.users WHERE id=auth.uid()`));
    assert.deepEqual(identity.rows, [{ uid: id(3), role: 'gestor_suporte', active: true, admin: false, insert_role: true }]);

    // An active support manager can insert a feedback for another manager's
    // agent, team and monitoria, and attribute it to that other manager.
    await asUser(3, () => db.query(`
      INSERT INTO public.agent_feedbacks
        (id, agent_id, manager_id, team_id, monitoria_id, title, improvements, action_plan)
      VALUES ($1,$2,$3,$4,$5,'Forged attribution','Text','Plan')
    `, [id(306), id(2), id(4), id(102), id(202)]));
    const forged = await db.query('SELECT agent_id, manager_id, team_id FROM public.agent_feedbacks WHERE id=$1', [id(306)]);
    assert.deepEqual(forged.rows, [{ agent_id: id(2), manager_id: id(4), team_id: id(102) }]);

    // Manager can create and remove the acknowledgement timestamp while it is
    // initially NULL: SQL <> NULL evaluates NULL, which does not enter IF.
    await asUser(3, async () => {
      const set = await db.query('UPDATE public.agent_feedbacks SET agent_acknowledged_at=$1 WHERE id=$2 RETURNING agent_acknowledged_at', ['2040-01-02T03:04:05Z', id(301)]);
      assert.equal(set.rows[0].agent_acknowledged_at.toISOString(), '2040-01-02T03:04:05.000Z');
      const unset = await db.query('UPDATE public.agent_feedbacks SET agent_acknowledged_at=NULL WHERE id=$1 RETURNING agent_acknowledged_at', [id(301)]);
      assert.equal(unset.rows[0].agent_acknowledged_at, null);
    });

    // Agent can edit manager-owned fields omitted from the trigger guard and
    // reverse a completed plan back to a non-completed state.
    await asUser(1, async () => {
      const changed = await db.query(`
        UPDATE public.agent_feedbacks SET strengths='Changed', deadline_date='2041-01-01',
          team_id=$1, status='ciente' WHERE id=$2 RETURNING strengths, deadline_date, team_id, status
      `, [id(102), id(301)]);
      assert.equal(changed.rows[0].strengths, 'Changed');
      assert.equal(changed.rows[0].deadline_date.toISOString(), '2041-01-01T00:00:00.000Z');
      assert.equal(changed.rows[0].team_id, id(102));
      assert.equal(changed.rows[0].status, 'ciente');
    });

    // Ownership branches in SELECT/UPDATE policies bypass active-account
    // checks for both agents and managers.
    const inactiveAgent = await asUser(6, async () => {
      const visible = await db.query('SELECT id FROM public.agent_feedbacks WHERE id=$1', [id(304)]);
      const changed = await db.query("UPDATE public.agent_feedbacks SET strengths='Inactive agent wrote' WHERE id=$1 RETURNING id", [id(304)]);
      return { visible: visible.rows.length, changed: changed.rows.length };
    });
    assert.deepEqual(inactiveAgent, { visible: 1, changed: 1 });
    const inactiveManager = await asUser(4, async () => {
      const visible = await db.query('SELECT id FROM public.agent_feedbacks WHERE id=$1', [id(303)]);
      const changed = await db.query("UPDATE public.agent_feedbacks SET title='Inactive manager wrote' WHERE id=$1 RETURNING id", [id(303)]);
      return { visible: visible.rows.length, changed: changed.rows.length };
    });
    assert.deepEqual(inactiveManager, { visible: 1, changed: 1 });

    // Any active support manager can read unassigned (NULL-team) feedback.
    const unassigned = await asUser(5, () => db.query('SELECT id FROM public.agent_feedbacks WHERE id=$1', [id(302)]));
    assert.equal(unassigned.rows.length, 1);

    // The feature schema has no completed_at column; clients asking for it fail.
    await assert.rejects(db.query('SELECT completed_at FROM public.agent_feedbacks'), /column .*completed_at.* does not exist/i);
  } finally {
    await db.close();
  }
});

test('AUDIT: fresh queue incremental has an unresolved baseline table dependency (PASS confirms gap)', async () => {
  const { sql: baseline } = await buildFreshSql();
  const queue = await readFile(new URL('../supabase/fresh-migrations/20260924000001_privileged_queue_evaluation.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(baseline, /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+public\.queue_ticket_assignments\b/i);
  assert.match(queue, /public\.queue_ticket_assignments%ROWTYPE/i);
  assert.match(queue, /FROM\s+public\.queue_ticket_assignments/i);
});
