import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('only an admin can restore a removed monitoria with history and assignment reconciliation', async () => {
  const db = new PGlite();
  const adminId = '10000000-0000-4000-8000-000000000001';
  const monitorId = '20000000-0000-4000-8000-000000000001';
  const conflictId = '20000000-0000-4000-8000-000000000002';
  const userId = '10000000-0000-4000-8000-000000000002';
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      CREATE TABLE public.users (id uuid PRIMARY KEY, name text, role text, active boolean);
      CREATE TABLE public.monitorias (
        id uuid PRIMARY KEY, ticket_id text, active boolean, history jsonb,
        updated_at timestamptz, action_deadline_at timestamptz
      );
      CREATE TABLE public.queue_ticket_assignments (
        id uuid PRIMARY KEY, ticket_id text, status text, completed_at timestamptz
      );
      CREATE UNIQUE INDEX monitorias_one_active_per_ticket_idx
        ON public.monitorias (btrim(ticket_id)) WHERE active IS TRUE;
      GRANT USAGE ON SCHEMA public, auth TO authenticated;
      INSERT INTO public.users VALUES
        ('${adminId}', 'Admin', 'admin', true),
        ('${userId}', 'Monitor', 'qualidade', true);
      INSERT INTO public.monitorias VALUES
        ('${monitorId}', '182786', false, '[{"action":"Monitoria removida"}]',
          '2026-10-13T17:45:00Z', '2026-10-15T15:00:00Z');
      INSERT INTO public.queue_ticket_assignments VALUES
        ('30000000-0000-4000-8000-000000000001', '182786', 'pending', NULL);
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/20261013000005_restore_removed_monitoria.sql', import.meta.url), 'utf8'));
    await db.exec('SET ROLE anon');
    await assert.rejects(db.query('SELECT public.restore_removed_monitoria($1,$2)', [monitorId, 'Teste']), /permission denied/);
    await db.exec('RESET ROLE');
    await db.exec('SET ROLE authenticated');
    await db.exec(`SET "request.jwt.claim.sub" = '${userId}'`);
    await assert.rejects(db.query('SELECT public.restore_removed_monitoria($1,$2)', [monitorId, 'Erro de exclusão']), /Apenas administradores/);
    await db.exec(`SET "request.jwt.claim.sub" = '${adminId}'`);
    await assert.rejects(db.query('SELECT public.restore_removed_monitoria($1,$2)', [monitorId, '   ']), /Informe um motivo/);

    await db.exec('RESET ROLE');
    await db.query('UPDATE public.users SET active=false WHERE id=$1', [adminId]);
    await db.exec('SET ROLE authenticated');
    await assert.rejects(db.query('SELECT public.restore_removed_monitoria($1,$2)', [monitorId, 'Teste']), /Apenas administradores/);
    await db.exec('RESET ROLE');
    await db.query('UPDATE public.users SET active=true WHERE id=$1', [adminId]);

    await db.query('INSERT INTO public.monitorias (id,ticket_id,active) VALUES ($1,$2,true)', [conflictId, ' 182786 ']);
    await db.exec('SET ROLE authenticated');
    await assert.rejects(db.query('SELECT public.restore_removed_monitoria($1,$2)', [monitorId, 'Erro de exclusão']), /outra monitoria ativa/);
    await db.exec('RESET ROLE');
    await db.query('DELETE FROM public.monitorias WHERE id=$1', [conflictId]);
    await db.exec('SET ROLE authenticated');
    await db.query('SELECT public.restore_removed_monitoria($1,$2)', [monitorId, 'Erro de exclusão']);
    await assert.rejects(db.query('SELECT public.restore_removed_monitoria($1,$2)', [monitorId, 'Repetir']), /não encontrada/);
    await db.exec('RESET ROLE');

    const record = (await db.query('SELECT active, history, action_deadline_at FROM public.monitorias WHERE id=$1', [monitorId])).rows[0];
    assert.equal(record.active, true);
    assert.equal(record.history.length, 2);
    assert.equal(record.history[1].by_id, adminId);
    assert.equal(record.history[1].note, 'Erro de exclusão');
    assert.equal(new Date(record.action_deadline_at).toISOString(), '2026-10-15T15:00:00.000Z');
    const assignment = (await db.query("SELECT status, completed_at FROM public.queue_ticket_assignments WHERE ticket_id='182786'")).rows[0];
    assert.equal(assignment.status, 'completed');
    assert.ok(assignment.completed_at);
  } finally {
    await db.close();
  }
});
