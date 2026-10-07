import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('nova ficha de filho preserva monitoria, exige IA pronta e mantém autorização', async () => {
  const db = new PGlite();
  const owner = '00000000-0000-4000-8000-000000000001';
  const other = '00000000-0000-4000-8000-000000000002';
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE SCHEMA _private;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('test.uid')::uuid $$;
      CREATE FUNCTION _private.is_quality_team_user() RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.role') IN ('qualidade','admin') $$;
      CREATE FUNCTION _private.is_admin_user() RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.role') = 'admin' $$;
      CREATE TABLE queue_ticket_assignments(id uuid primary key, ticket_id text, queue_type text, assigned_to uuid, status text,
        assignment_source text, started_at timestamptz, started_by uuid, completed_at timestamptz);
      CREATE TABLE monitorias(id uuid primary key, ticket_id text, active boolean);
      CREATE TABLE ai_evaluation_jobs(ticket_id text, evaluation_type text, status text, result jsonb);
      INSERT INTO queue_ticket_assignments VALUES ('${owner}', '179525', 'filhos', '${owner}', 'completed','automatic',NULL,NULL,now());
      INSERT INTO monitorias VALUES ('${owner}', '179525', true);
      INSERT INTO ai_evaluation_jobs VALUES ('179525', 'chamado_filho','completed','{"checks":[]}');
      SET test.uid = '${owner}'; SET test.role = 'qualidade';
    `);
    for (const file of ['20260924000001_privileged_queue_evaluation', '20261007000001_child_ticket_new_evaluation']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${file}.sql`, import.meta.url), 'utf8'));
    }
    await db.exec(`SET test.uid = '${other}'`);
    await assert.rejects(db.query("SELECT * FROM start_child_ticket_new_evaluation('179525')"), /outro monitor/);
    await db.exec(`SET test.uid = '${owner}'; SET test.role = 'suporte'`);
    await assert.rejects(db.query("SELECT * FROM start_child_ticket_new_evaluation('179525')"), /Qualidade/);
    await db.exec("SET test.role = 'qualidade'; UPDATE ai_evaluation_jobs SET status='running'");
    await assert.rejects(db.query("SELECT * FROM start_child_ticket_new_evaluation('179525')"), /Aguarde/);
    assert.equal((await db.query('SELECT status FROM queue_ticket_assignments')).rows[0].status, 'completed');
    await db.exec("UPDATE ai_evaluation_jobs SET status='completed'");
    const opened = await db.query("SELECT * FROM start_child_ticket_new_evaluation('179525')");
    assert.equal(opened.rows[0].status, 'in_progress');
    assert.equal(opened.rows[0].started_by, owner);
    assert.equal((await db.query('SELECT count(*)::int AS total FROM monitorias WHERE active')).rows[0].total, 1);
    await db.exec(`UPDATE queue_ticket_assignments SET started_by='${other}'`);
    await assert.rejects(db.query("SELECT * FROM start_child_ticket_new_evaluation('179525')"), /outro monitor/);
    await db.exec('UPDATE monitorias SET active=false');
    await assert.rejects(db.query("SELECT * FROM start_child_ticket_new_evaluation('179525')"), /monitoria anterior/);
  } finally { await db.close(); }
});
