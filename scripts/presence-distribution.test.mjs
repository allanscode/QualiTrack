import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = readFile(
  new URL('../supabase/migrations/20260922000005_authoritative_presence_and_queue_fix.sql', import.meta.url),
  'utf8',
);
const manualAssignmentMigration = readFile(
  new URL('../supabase/migrations/20260922000006_manual_queue_assignment.sql', import.meta.url),
  'utf8',
);
const rebalanceMigration = readFile(
  new URL('../supabase/migrations/20260922000009_rebalance_pending_queue.sql', import.meta.url),
  'utf8',
);
const id = n => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const session = n => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('presença compartilhada e distribuição usam usuários elegíveis realmente online', async t => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE SCHEMA _private;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$
        SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
      $$;
      CREATE TABLE public.users(
        id uuid PRIMARY KEY,
        email text NOT NULL,
        name text NOT NULL,
        role text NOT NULL,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.quality_monitor_presence(
        user_id uuid PRIMARY KEY REFERENCES public.users(id),
        is_online boolean NOT NULL DEFAULT false,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid REFERENCES public.users(id)
      );
      CREATE TABLE public.queue_ticket_assignments(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id text NOT NULL,
        queue_type text NOT NULL,
        assigned_to uuid NOT NULL REFERENCES public.users(id),
        assigned_at timestamptz NOT NULL DEFAULT now(),
        status text NOT NULL DEFAULT 'pending',
        completed_at timestamptz,
        UNIQUE(ticket_id, queue_type)
      );
      CREATE TABLE public.monitorias(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id text NOT NULL,
        evaluator_id uuid NOT NULL REFERENCES public.users(id)
      );
      CREATE TABLE public.ai_evaluation_drafts(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id text NOT NULL UNIQUE,
        created_by uuid REFERENCES public.users(id)
      );
      CREATE FUNCTION _private.is_admin_user() RETURNS boolean
      LANGUAGE sql SECURITY DEFINER SET search_path='public' AS $$
        SELECT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND active AND role IN ('admin','gestor_qualidade'))
      $$;
      CREATE FUNCTION _private.is_quality_team_user() RETURNS boolean
      LANGUAGE sql SECURITY DEFINER SET search_path='public' AS $$
        SELECT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND active AND role IN ('admin','gestor_qualidade','qualidade'))
      $$;
      GRANT USAGE ON SCHEMA public, auth, _private TO authenticated;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
      INSERT INTO public.users(id,email,name,role) VALUES
        ('${id(1)}','admin@example.invalid','Administrador','admin'),
        ('${id(2)}','vinicius@example.invalid','Vinicius','qualidade'),
        ('${id(3)}','gabriel@example.invalid','Gabriel','qualidade'),
        ('${id(4)}','supervisor@example.invalid','Supervisora','gestor_qualidade');
    `);
    await db.exec(await migration);
    await db.exec(await manualAssignmentMigration);
    await db.exec(await rebalanceMigration);

    const asSession = async (userId, sessionId, run) => {
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [userId]);
      await db.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: userId, role: 'authenticated', session_id: sessionId })]);
      await db.exec('SET ROLE authenticated');
      try {
        return await run();
      } finally {
        await db.exec('RESET ROLE');
      }
    };
    const heartbeat = (userId, sessionId) => asSession(userId, sessionId, () => db.query('SELECT * FROM heartbeat_user_presence()'));
    const endSession = (userId, sessionId) => asSession(userId, sessionId, () => db.query('SELECT end_current_presence_session()'));

    await t.test('A/B/I: consolida pessoas no backend e deduplica abas/sessões', async () => {
      assert.equal((await heartbeat(id(1), session(1))).rows.length, 1);
      assert.equal((await heartbeat(id(2), session(2))).rows.length, 2);
      assert.equal((await heartbeat(id(2), session(3))).rows.length, 2);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM user_presence_sessions WHERE user_id=$1', [id(2)])).rows[0].n, 2);
      await endSession(id(2), session(2));
      assert.equal((await heartbeat(id(1), session(1))).rows.length, 2, 'outra sessão do mesmo usuário mantém presença');
      await heartbeat(id(2), session(3));
      assert.equal((await db.query('SELECT count(*)::int AS n FROM user_presence_sessions WHERE user_id=$1 AND offline_at IS NULL', [id(2)])).rows[0].n, 1, 'refresh não duplica a sessão');
    });

    await t.test('C: monitor ativo, habilitado e online recebe os 5 tickets', async () => {
      await asSession(id(1), session(1), async () => {
        await db.query('SELECT set_monitor_eligibility($1,true)', [id(2)]);
        const payload = Array.from({ length: 5 }, (_, index) => ({ ticket_id: `child-${index + 1}`, queue_type: 'filhos' }));
        await db.query('SELECT * FROM assign_queue_tickets($1::jsonb)', [JSON.stringify(payload)]);
      });
      const rows = (await db.query("SELECT assigned_to FROM queue_ticket_assignments WHERE ticket_id LIKE 'child-%'")).rows;
      assert.equal(rows.length, 5);
      assert.ok(rows.every(row => row.assigned_to === id(2)));
    });

    await t.test('D/E/H: logout do monitor não afeta admin e impede novos tickets', async () => {
      await endSession(id(2), session(3));
      const online = await heartbeat(id(1), session(1));
      assert.deepEqual(online.rows.map(row => row.id), [id(1)]);
      await asSession(id(1), session(1), () => db.query(
        'SELECT * FROM assign_queue_tickets($1::jsonb)',
        [JSON.stringify([{ ticket_id: 'offline-ticket', queue_type: 'filhos' }])],
      ));
      assert.equal((await db.query("SELECT count(*)::int AS n FROM queue_ticket_assignments WHERE ticket_id='offline-ticket'")).rows[0].n, 0);
    });

    await t.test('F/G: relogin volta a habilitar e dois monitores recebem de forma equilibrada', async () => {
      await heartbeat(id(2), session(4));
      await heartbeat(id(3), session(5));
      await asSession(id(1), session(1), () => db.query('SELECT set_monitor_eligibility($1,true)', [id(3)]));
      await db.exec('DELETE FROM queue_ticket_assignments');
      const payload = Array.from({ length: 5 }, (_, index) => ({ ticket_id: `balanced-${index + 1}`, queue_type: 'filhos' }));
      await asSession(id(1), session(1), () => db.query('SELECT * FROM assign_queue_tickets($1::jsonb)', [JSON.stringify(payload)]));
      const counts = (await db.query('SELECT assigned_to, count(*)::int AS n FROM queue_ticket_assignments GROUP BY assigned_to ORDER BY assigned_to')).rows;
      assert.deepEqual(counts.map(row => row.n).sort(), [2, 3]);
    });

    await t.test('admin e supervisor transferem; monitor comum não tem permissão', async () => {
      await heartbeat(id(4), session(6));
      await asSession(id(1), session(1), () => db.query(
        'SELECT * FROM reassign_queue_ticket($1,$2,$3,false)',
        ['balanced-1', 'filhos', id(3)],
      ));
      let row = (await db.query("SELECT assigned_to, assignment_source FROM queue_ticket_assignments WHERE ticket_id='balanced-1'")).rows[0];
      assert.deepEqual(row, { assigned_to: id(3), assignment_source: 'manual' });

      await asSession(id(4), session(6), () => db.query(
        'SELECT * FROM reassign_queue_ticket($1,$2,$3,false)',
        ['balanced-1', 'filhos', id(2)],
      ));
      row = (await db.query("SELECT assigned_to, assignment_source FROM queue_ticket_assignments WHERE ticket_id='balanced-1'")).rows[0];
      assert.deepEqual(row, { assigned_to: id(2), assignment_source: 'manual' });

      await assert.rejects(
        () => asSession(id(2), session(4), () => db.query(
          'SELECT * FROM reassign_queue_ticket($1,$2,$3,false)',
          ['balanced-1', 'filhos', id(3)],
        )),
        /Apenas o Supervisor de Qualidade ou o Administrador/
      );
    });

    await t.test('balanceamento preserva atribuição manual enquanto o responsável está online', async () => {
      await asSession(id(1), session(1), () => db.query(
        'SELECT * FROM assign_queue_tickets($1::jsonb)',
        [JSON.stringify([{ ticket_id: 'balanced-1', queue_type: 'filhos' }])],
      ));
      const row = (await db.query("SELECT assigned_to, assignment_source FROM queue_ticket_assignments WHERE ticket_id='balanced-1'")).rows[0];
      assert.deepEqual(row, { assigned_to: id(2), assignment_source: 'manual' });
    });

    await t.test('atribuição manual pendente volta ao balanceamento quando o responsável fica offline', async () => {
      await endSession(id(2), session(4));
      await asSession(id(1), session(1), () => db.query(
        'SELECT * FROM assign_queue_tickets($1::jsonb)',
        [JSON.stringify([{ ticket_id: 'balanced-1', queue_type: 'filhos' }])],
      ));
      const row = (await db.query("SELECT assigned_to, assignment_source FROM queue_ticket_assignments WHERE ticket_id='balanced-1'")).rows[0];
      assert.deepEqual(row, { assigned_to: id(3), assignment_source: 'automatic' });
    });

    await t.test('ticket em avaliação exige confirmação e mantém um único responsável', async () => {
      await asSession(id(3), session(5), () => db.query(
        'SELECT * FROM start_queue_ticket_assignment($1,$2)',
        ['balanced-1', 'filhos'],
      ));

      await endSession(id(3), session(5));
      await asSession(id(1), session(1), () => db.query(
        'SELECT * FROM assign_queue_tickets($1::jsonb)',
        [JSON.stringify([{ ticket_id: 'balanced-1', queue_type: 'filhos' }])],
      ));
      assert.equal(
        (await db.query("SELECT assigned_to FROM queue_ticket_assignments WHERE ticket_id='balanced-1'")).rows[0].assigned_to,
        id(3),
        'trabalho já iniciado não é redistribuído automaticamente quando o monitor fica offline',
      );
      await heartbeat(id(3), session(8));

      await assert.rejects(
        () => asSession(id(1), session(1), () => db.query(
          'SELECT * FROM reassign_queue_ticket($1,$2,$3,false)',
          ['balanced-1', 'filhos', id(3)],
        )),
        /CONFIRM_IN_PROGRESS/
      );

      await heartbeat(id(2), session(7));
      await asSession(id(1), session(1), () => db.query(
        'SELECT * FROM reassign_queue_ticket($1,$2,$3,true)',
        ['balanced-1', 'filhos', id(2)],
      ));
      const row = (await db.query("SELECT assigned_to, status, started_by FROM queue_ticket_assignments WHERE ticket_id='balanced-1'")).rows[0];
      assert.deepEqual(row, { assigned_to: id(2), status: 'pending', started_by: null });

      await assert.rejects(
        () => asSession(id(3), session(5), () => db.query(
          'INSERT INTO monitorias(ticket_id,evaluator_id) VALUES ($1,$2)',
          ['balanced-1', id(3)],
        )),
        /transferido para outro monitor/
      );
      await assert.rejects(
        () => asSession(id(3), session(5), () => db.query(
          'INSERT INTO ai_evaluation_drafts(ticket_id,created_by) VALUES ($1,$2)',
          ['balanced-1', id(3)],
        )),
        /transferido para outro monitor/
      );
    });

    await t.test('redistribui pendentes automáticos quando um segundo monitor entra online', async () => {
      await db.exec('DELETE FROM queue_ticket_assignments');
      await endSession(id(3), session(8));
      const payload = Array.from({ length: 6 }, (_, index) => ({ ticket_id: `late-${index + 1}`, queue_type: 'filhos' }));
      await asSession(id(1), session(1), () => db.query('SELECT * FROM assign_queue_tickets($1::jsonb)', [JSON.stringify(payload)]));
      let counts = (await db.query('SELECT assigned_to, count(*)::int AS n FROM queue_ticket_assignments GROUP BY assigned_to')).rows;
      assert.deepEqual(counts, [{ assigned_to: id(2), n: 6 }]);

      await heartbeat(id(3), session(9));
      await asSession(id(1), session(1), () => db.query('SELECT * FROM assign_queue_tickets($1::jsonb)', [JSON.stringify(payload)]));
      counts = (await db.query('SELECT assigned_to, count(*)::int AS n FROM queue_ticket_assignments GROUP BY assigned_to')).rows;
      assert.deepEqual(counts.map(row => row.n).sort(), [3, 3]);
    });
  } finally {
    await db.close();
  }
});
