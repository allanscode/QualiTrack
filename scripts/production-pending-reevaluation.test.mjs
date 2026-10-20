import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { score, withoutLegacyCritical } from './production-pending-scoring.mjs';

test('old child critical markers cannot zero a develop rubric score', () => {
  const old = [{ weight: 100, questions: [{ id: 'a', is_critical: true }, { id: 'b' }] }];
  const current = withoutLegacyCritical(old);
  assert.equal(current[0].questions[0].is_critical, undefined);
  assert.equal(score({ sections: current }, { a: 'NAO', b: 'SIM' }), 50);
  assert.equal(score({ sections: old }, { a: 'NAO', b: 'SIM' }), 50);
});

test('production candidates are standalone, private, and idempotent by source hash', async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE SCHEMA public');
  } catch { /* public already exists */ }
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role');
    const migration = readFileSync(new URL('../supabase/migrations/20261019000005_production_pending_reevaluation_staging.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    const { rows: refs } = await db.query(`SELECT count(*)::int AS n FROM pg_constraint
      WHERE conrelid='public.production_pending_reevaluation_candidates'::regclass AND contype='f'`);
    assert.equal(refs[0].n, 0);
    const { rows: config } = await db.query(`SELECT relrowsecurity FROM pg_class
      WHERE oid='public.production_pending_reevaluation_candidates'::regclass`);
    assert.equal(config[0].relrowsecurity, true);
    const source = '11111111-1111-4111-8111-111111111111';
    const hash = 'a'.repeat(64);
    const insert = `INSERT INTO public.production_pending_reevaluation_candidates
      (production_project,production_monitoria_id,ticket_id,ticket_kind,input_sha256,dialogue_sha256,
       dialogue_source,source_comment_count,source_status,source_updated_at,source_score,
       source_form_id,develop_form_id,develop_form_sha256,guideline_sha256,already_sent,model,
       suggested_score,suggested_answers,suggested_observations,summary,auditor_note)
      VALUES ('vpytvgpsqdapgouyjowc','${source}','123','ticket_filho','${hash}','${hash}',
       'zendesk_comments',2,'pendente_revisao',now(),42,'${source}','${source}','${hash}','${hash}',
       true,'test',50,'{"a":"NAO"}'::jsonb,'{"a":"evidência resumida"}'::jsonb,'resumo','nota')`;
    await db.exec(insert);
    await assert.rejects(db.exec(insert), /duplicate key/);
    const { rows: stored } = await db.query(`SELECT already_sent,suggested_score FROM
      public.production_pending_reevaluation_candidates`);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].already_sent, true);
    assert.equal(Number(stored[0].suggested_score), 50);
  } finally { await db.close(); }
});
