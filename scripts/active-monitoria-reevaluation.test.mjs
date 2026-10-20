import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';

test('candidate score recalculates rubric and zeroes critical errors', async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE SCHEMA _private');
    const migration = readFileSync(new URL('../supabase/migrations/20261019000004_select_active_monitoria_ai_candidate.sql', import.meta.url), 'utf8');
    await db.exec(migration.slice(0, migration.indexOf('-- Called only')));
    const form = { sections: [{ weight: 100, questions: [{ id: 'a' }, { id: 'b', is_critical: true }] }],
      critical_errors: [{ id: 'c' }] };
    async function score(answers, critical) {
      const { rows } = await db.query('SELECT _private.active_candidate_score($1::jsonb,$2::jsonb) AS score',
        [JSON.stringify(form), JSON.stringify({ suggested_answers: answers, suggested_critical_errors: critical })]);
      return Number(rows[0].score);
    }
    assert.equal(await score({ a: 'SIM', b: 'SIM', c: 'SIM' }, { c: false }), 100);
    assert.equal(await score({ a: 'NAO', b: 'SIM', c: 'SIM' }, { c: false }), 50);
    assert.equal(await score({ a: 'SIM', b: 'NAO', c: 'SIM' }, { c: false }), 0);
    assert.equal(await score({ a: 'SIM', b: 'SIM', c: 'NAO' }, { c: false }), 0);
    assert.equal(await score({ a: 'SIM', b: 'SIM', c: 'SIM' }, { c: true }), 0);
    assert.equal(await score({ a: 'SIM', b: 'SIM', c: 'SIM' }, { b: true, c: false }), 0);
    await assert.rejects(score({ a: 'SIM', b: 'SIM' }, { c: false }), /Erro crítico sem resposta/);
  } finally { await db.close(); }
});
