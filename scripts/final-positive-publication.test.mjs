import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const id = n => `80000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('final positive decisions enter a durable, private Zendesk publication queue', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
      CREATE TABLE monitorias(id uuid PRIMARY KEY,ticket_id text,status text,active boolean DEFAULT true,
        score numeric,satisfaction_result text,form_id uuid,form_snapshot jsonb,history jsonb);
      CREATE TABLE helpdesk_submissions(monitoria_id uuid,status text,outcome text);
      CREATE TABLE helpdesk_publish_claims(monitoria_id uuid PRIMARY KEY);
      CREATE TABLE positive_auto_publications(monitoria_id uuid PRIMARY KEY REFERENCES monitorias(id),ticket_id text,
        status text DEFAULT 'pending',lease_id uuid,lease_until timestamptz,last_error text,
        attempts integer DEFAULT 0,next_attempt_at timestamptz DEFAULT now(),
        created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());`);
    await db.query(`INSERT INTO monitorias(id,ticket_id,status,score,satisfaction_result,form_snapshot,history)
      VALUES($1,'180210','concluida',93.75,'Positiva','{}','[{"action":"Monitoria Reavaliada (Concluída)"}]')`, [id(1)]);
    const sql = await readFile(new URL('../supabase/migrations/20261008000010_publish_final_positive_decision.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    let queued = (await db.query('SELECT monitoria_id,source,status FROM positive_auto_publications')).rows;
    assert.deepEqual(queued, [{ monitoria_id: id(1), source: 'final_decision', status: 'pending' }]);

    const insert = async (n, ticket, score, extra = {}) => {
      await db.query(`INSERT INTO monitorias(id,ticket_id,status,score,satisfaction_result,form_id,form_snapshot)
        VALUES($1,$2,'pendente_revisao',$3,$4,$5,$6)`, [id(n), ticket, score,
        extra.satisfaction ?? 'Positiva', extra.formId ?? null, extra.snapshot ?? {}]);
    };
    await insert(2, '180211', 90);
    await db.query("UPDATE monitorias SET status='concluida' WHERE id=$1", [id(2)]);
    await insert(3, '180212', 74);
    await db.query("UPDATE monitorias SET status='concluida' WHERE id=$1", [id(3)]);
    await insert(4, '180213', 90, { formId: '6c7d1e88-841b-4da9-9a66-9f1464ce896f' });
    await db.query("UPDATE monitorias SET status='concluida' WHERE id=$1", [id(4)]);
    await insert(5, '180214', 90, { snapshot: { automation: 'positive_csat' } });
    await db.query("UPDATE monitorias SET status='concluida' WHERE id=$1", [id(5)]);
    await insert(6, '180215', 90, { satisfaction: 'Negativa' });
    await db.query("UPDATE monitorias SET status='concluida' WHERE id=$1", [id(6)]);
    queued = (await db.query('SELECT monitoria_id,source FROM positive_auto_publications ORDER BY ticket_id')).rows;
    assert.deepEqual(queued, [
      { monitoria_id: id(1), source: 'final_decision' },
      { monitoria_id: id(2), source: 'final_decision' },
    ]);
    await db.exec("SET request.jwt.claim.role='authenticated'");
    await assert.rejects(db.query('SELECT * FROM claim_positive_auto_publication()'), /autorizado/i);
    await db.exec("SET request.jwt.claim.role='service_role'");
    assert.equal((await db.query('SELECT * FROM claim_positive_auto_publication()')).rows.length, 1);
  } finally {
    await db.close();
  }
});
