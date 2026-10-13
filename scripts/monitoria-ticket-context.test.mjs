import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const id = n => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
test('ticket details respect monitoria scope and expose no auditor or log payload', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE TABLE users(id uuid PRIMARY KEY,role text,active boolean);
      CREATE TABLE teams(id uuid PRIMARY KEY,name text);
      CREATE TABLE user_teams(user_id uuid,team_id uuid);
      CREATE TABLE monitorias(id uuid PRIMARY KEY,team_id uuid,evaluated_id uuid,ticket_id text,active boolean,form_snapshot jsonb,ticket_group_team_id uuid);
      CREATE TABLE queue_ticket_catalog(ticket_id text,ticket_snapshot jsonb,verified_at timestamptz);
      CREATE TABLE ai_evaluation_logs(ticket_id text,ticket_subject text,created_at timestamptz);
      INSERT INTO users VALUES ('${id(1)}','admin',true),('${id(2)}','gestor_suporte',true),
        ('${id(3)}','suporte',true),('${id(4)}','qualidade',true),('${id(5)}','admin',false);
      INSERT INTO teams VALUES ('${id(10)}','PJ Trindade'),('${id(11)}','Cliente Final');
      INSERT INTO user_teams VALUES ('${id(2)}','${id(10)}');
      INSERT INTO monitorias VALUES
        ('${id(20)}','${id(10)}','${id(3)}','123',true,'{}','${id(11)}'),
        ('${id(21)}','${id(11)}','${id(99)}','456',true,'{}','${id(11)}');
      INSERT INTO queue_ticket_catalog VALUES ('123','{"subject":"Problema no PDV","private":"must not leak"}',now());
      INSERT INTO ai_evaluation_logs VALUES ('456','Historico do ticket',now());`);
    await db.exec(await readFile(new URL('../supabase/migrations/20261013000002_monitoria_ticket_context.sql', import.meta.url), 'utf8'));
    const query = `SELECT * FROM get_monitoria_ticket_context(ARRAY['${id(20)}','${id(21)}']::uuid[]) ORDER BY monitoria_id`;
    for (const [user, count] of [[1, 2], [2, 1], [3, 1], [4, 2]]) {
      await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${id(user)}',false);`);
      const { rows } = await db.query(query);
      assert.equal(rows.length, count);
      assert.deepEqual(Object.keys(rows[0]).sort(), ['monitoria_id', 'ticket_group_name', 'ticket_subject']);
      assert.equal(rows[0].ticket_subject, 'Problema no PDV');
      assert.equal(rows[0].ticket_group_name, 'Cliente Final');
      await db.exec('RESET ROLE;');
    }
    await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${id(5)}',false);`);
    await assert.rejects(db.query(query), /não autorizado/);
    await db.exec('RESET ROLE; SET ROLE anon;');
    await assert.rejects(db.query(query), /permission denied/);
  } finally { await db.close(); }
});
