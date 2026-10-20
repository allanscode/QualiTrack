import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('only a service-confirmed legacy ticket closure concludes its monitoria once', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA _private;
      CREATE TABLE public.monitorias (
        id uuid PRIMARY KEY, ticket_id text NOT NULL, active boolean NOT NULL DEFAULT true,
        status text NOT NULL, score numeric NOT NULL, pj_review_required boolean NOT NULL DEFAULT false,
        form_snapshot jsonb NOT NULL, history jsonb NOT NULL DEFAULT '[]',
        concluded_at timestamptz, action_deadline_at timestamptz, updated_at timestamptz
      );
    `);
    const migration = await readFile(new URL('../supabase/migrations/20261016132741_reconcile_legacy_zendesk_closure.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await db.query(`INSERT INTO public.monitorias
      (id,ticket_id,status,score,form_snapshot,action_deadline_at)
      VALUES ('00000000-0000-0000-0000-000000000001','179639','pendente_revisao',66.67,
      '{"legacy_source":"zendesk_child_note","legacy_zendesk_status":"solved"}',now()-interval '1 minute')`);
    const at = new Date().toISOString();
    assert.equal((await db.query('SELECT public.reconcile_legacy_child_closed($1,$2) AS changed', ['179639', at])).rows[0].changed, true);
    assert.equal((await db.query('SELECT public.reconcile_legacy_child_closed($1,$2) AS changed', ['179639', at])).rows[0].changed, false);
    const row = (await db.query("SELECT status,concluded_at,action_deadline_at,form_snapshot,history FROM public.monitorias WHERE ticket_id='179639'")).rows[0];
    assert.equal(row.status, 'concluida');
    assert.equal(row.action_deadline_at, null);
    assert.equal(row.form_snapshot.legacy_zendesk_status, 'closed');
    assert.equal(row.history.length, 1);
    assert.equal(new Date(row.concluded_at).toISOString(), at);
    assert.equal((await db.query('SELECT public.reconcile_legacy_child_closed($1,$2) AS changed', ['999999', at])).rows[0].changed, false);
  } finally {
    await db.close();
  }
});
