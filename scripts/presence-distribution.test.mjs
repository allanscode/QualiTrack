import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = readFile(
  new URL('../supabase/migrations/20260922000005_authoritative_presence_and_queue_fix.sql', import.meta.url),
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
        ('${id(3)}','gabriel@example.invalid','Gabriel','qualidade');
    `);
    await db.exec(await migration);

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
  } finally {
    await db.close();
  }
});
