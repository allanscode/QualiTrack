import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('one active monitoria per ticket archives older records without losing history', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE public.monitorias (
      id uuid PRIMARY KEY, ticket_id text, active boolean NOT NULL DEFAULT true,
      status text, created_at timestamptz, updated_at timestamptz, history jsonb
    );`);
    const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    await db.query(`INSERT INTO public.monitorias(id,ticket_id,status,created_at,updated_at,history)
      VALUES ($1,'180330','pendente_revisao','2026-10-07T16:00:00Z','2026-10-07T16:00:00Z','[{"action":"Criada"}]'),
        ($2,' 180330 ','concluida','2026-10-07T17:00:00Z','2026-10-07T17:00:00Z','[{"action":"Concluída"}]'),
        ($3,'180210','concluida','2026-10-08T16:00:00Z','2026-10-08T16:00:00Z','[]')`,
    [id(1), id(2), id(3)]);
    const migration = await readFile(new URL('../supabase/migrations/20261008000009_one_active_monitoria_per_ticket.sql', import.meta.url), 'utf8');
    await db.exec(migration);

    const rows = (await db.query(`SELECT id, active, history FROM public.monitorias
      WHERE btrim(ticket_id)='180330' ORDER BY created_at`)).rows;
    assert.equal(rows.length, 2);
    assert.equal(rows[0].active, false);
    assert.equal(rows[1].active, true);
    assert.equal(rows[0].history.length, 2);
    assert.match(rows[0].history[1].note, new RegExp(id(2)));

    await assert.rejects(db.query(`INSERT INTO public.monitorias(id,ticket_id,active)
      VALUES ($1,'180330',true)`, [id(4)]), /monitorias_one_active_per_ticket_idx/);
    await db.query(`INSERT INTO public.monitorias(id,ticket_id,active) VALUES ($1,'180330',false)`, [id(5)]);
    await assert.rejects(db.query(`UPDATE public.monitorias SET active=true WHERE id=$1`, [id(5)]),
      /monitorias_one_active_per_ticket_idx/);
    await db.query(`INSERT INTO public.monitorias(id,ticket_id,active) VALUES ($1,'180211',true)`, [id(6)]);
  } finally {
    await db.close();
  }
});
