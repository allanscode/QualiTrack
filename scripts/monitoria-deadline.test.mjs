import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('status changes preserve the original action deadline in the database', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE TABLE public.monitorias (
        id integer PRIMARY KEY,
        active boolean NOT NULL DEFAULT true,
        status text NOT NULL,
        action_deadline_at timestamptz
      );
    `);
    const migration = await readFile(new URL('../supabase/migrations/20261013000003_preserve_monitoria_deadline.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    const original = '2026-10-15T15:00:00Z';
    const replacement = '2026-10-20T15:00:00Z';
    await db.query('INSERT INTO monitorias (id, status, action_deadline_at) VALUES ($1,$2,$3)', [1, 'pendente_revisao', original]);

    for (const status of ['em_contestacao', 'aguardando_gestor_suporte', 'aguardando_gestor_qualidade', 'reavaliacao_solicitada']) {
      await db.query('UPDATE monitorias SET status=$1, action_deadline_at=$2 WHERE id=1', [status, replacement]);
      const { rows } = await db.query('SELECT action_deadline_at FROM monitorias WHERE id=1');
      assert.equal(new Date(rows[0].action_deadline_at).toISOString(), '2026-10-15T15:00:00.000Z');
    }

    await db.query('UPDATE monitorias SET action_deadline_at=$1 WHERE id=1', [replacement]);
    assert.equal(new Date((await db.query('SELECT action_deadline_at FROM monitorias WHERE id=1')).rows[0].action_deadline_at).toISOString(), '2026-10-20T15:00:00.000Z');
    await db.query("UPDATE monitorias SET status='concluida', action_deadline_at=NULL WHERE id=1");
    assert.equal((await db.query('SELECT action_deadline_at FROM monitorias WHERE id=1')).rows[0].action_deadline_at, null);
    await db.query('UPDATE monitorias SET status=$1, action_deadline_at=$2 WHERE id=1', ['pendente_revisao', original]);
    assert.equal(new Date((await db.query('SELECT action_deadline_at FROM monitorias WHERE id=1')).rows[0].action_deadline_at).toISOString(), '2026-10-15T15:00:00.000Z');
  } finally {
    await db.close();
  }
});
