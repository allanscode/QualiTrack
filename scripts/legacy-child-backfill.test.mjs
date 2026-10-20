import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { buildFreshSql, discoverFreshMigrations } from './prepare-supabase.mjs';

const fixture = JSON.parse(await readFile(new URL('./fixtures/legacy-child-october-2026.json', import.meta.url), 'utf8'));
const backfillName = '20261016000001_legacy_child_note_monitorias.sql';
const formId = '6c7d1e88-841b-4da9-9a66-9f1464ce896f';

test('October Zendesk child-note clone becomes 132 concluded historical monitorias', async () => {
  const db = new PGlite(process.env.LEGACY_TEST_DB_DIR);
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA realtime; CREATE SCHEMA cron; CREATE SCHEMA extensions;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
      CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('realtime.topic', true) $$;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb,created_at timestamptz,email_confirmed_at timestamptz);
      CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
      GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated,service_role;
      CREATE PUBLICATION supabase_realtime;
      CREATE TABLE realtime.messages(id bigint GENERATED ALWAYS AS IDENTITY,topic text,extension text,payload jsonb,private boolean,inserted_at timestamptz DEFAULT now());
      CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
      CREATE FUNCTION cron.unschedule(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;`);
    await db.exec((await buildFreshSql()).sql);
    const migrations = await discoverFreshMigrations();
    const backfill = migrations.find(migration => migration.name === backfillName);
    assert.ok(backfill, 'the backfill migration is discoverable');
    for (const migration of migrations) {
      if (migration.name === backfillName) break;
      await db.exec(migration.sql.replace(/^CREATE EXTENSION IF NOT EXISTS pg_(?:cron|net).*;\s*$/gm, ''));
    }

    assert.equal(fixture.length, 132);
    const teams = new Map();
    const users = new Map();
    for (const row of fixture) {
      if (row.primary_team_id) teams.set(row.primary_team_id, row.requires_pj_review);
      if (row.agent_role && row.agent_id) users.set(row.agent_id, {
        role: row.agent_role, active: row.agent_active, teamId: row.primary_team_id,
      });
    }
    for (const [teamId, requiresPj] of teams) {
      await db.query('INSERT INTO public.teams(id,name,requires_pj_review) VALUES ($1,$2,$3)',
        [teamId, `Equipe de teste ${teams.size}`, requiresPj]);
    }
    for (const [userId, user] of users) {
      await db.query('INSERT INTO public.users(id,email,name,role,active,primary_team_id) VALUES ($1,$2,$3,$4,$5,$6)',
        [userId, `${userId}@example.invalid`, `Agente de teste ${userId.slice(0, 8)}`, user.role, user.active, user.teamId]);
    }
    const auditorId = fixture[0].auditor_id;
    assert.ok(fixture.every(row => row.auditor_id === auditorId));
    await db.query('INSERT INTO public.users(id,email,name,role,active) VALUES ($1,$2,$3,$4,true)',
      [auditorId, 'auditor@example.invalid', 'Auditor de teste', 'qualidade']);

    for (const row of fixture) {
      const snapshot = {
        ticket_id: row.ticket_id, agent_id: row.agent_id,
        agent_name: `Agente de teste ${row.agent_id?.slice(0, 8) ?? 'desconhecido'}`,
        channel: row.channel, ticket_date: row.ticket_date, status: row.ticket_status,
      };
      const originalJob = {
        job_id: row.original_job_id, ticket_id: row.ticket_id, status: 'completed',
        finished_at: row.finished_at,
        result: { score: Number(row.score), checks: row.checks,
          summary: 'Parecer histórico copiado sem conteúdo pessoal.' },
      };
      await db.query('INSERT INTO public.child_ai_legacy_jobs(ticket_id,original_job_id,original_job) VALUES ($1,$2,$3::jsonb)',
        [row.ticket_id, row.original_job_id, JSON.stringify(originalJob)]);
      await db.query('INSERT INTO public.child_ai_queue(ticket_id,ticket_snapshot,status,auditor_id,legacy_job_id) VALUES ($1,$2::jsonb,$3,$4,$5)',
        [row.ticket_id, JSON.stringify(snapshot), row.queue_status, row.auditor_id, row.original_job_id]);
      if (row.has_draft) {
        await db.query(`INSERT INTO public.ai_evaluation_drafts(ticket_id,form_id,agent_id,team_id,channel,result,created_by,source_queue,ticket_snapshot)
          VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,'filhos',$8::jsonb)`,
        [row.ticket_id, formId, row.agent_role ? row.agent_id : null,
          row.primary_team_id, row.channel, JSON.stringify({ summary: 'Rascunho posterior de seis critérios' }),
          auditorId, JSON.stringify(snapshot)]);
      }
    }

    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.monitorias')).rows[0].n, 0);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.ai_evaluation_drafts')).rows[0].n, 117);
    await db.exec(backfill.sql);

    const counts = (await db.query(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE status='concluida')::int AS concluded,
      count(*) FILTER (WHERE form_snapshot->>'legacy_verdict'='valido')::int AS valid,
      count(*) FILTER (WHERE form_snapshot->>'legacy_verdict'='invalido')::int AS invalid,
      count(*) FILTER (WHERE form_snapshot->>'legacy_agent_identity_unresolved'='true')::int AS unresolved,
      count(*) FILTER (WHERE form_snapshot->'legacy_six_criteria_draft' <> 'null'::jsonb)::int AS preserved_drafts,
      count(*) FILTER (WHERE pj_review_required)::int AS pj_waiting
      FROM public.monitorias WHERE form_snapshot->>'legacy_source'='zendesk_child_note'`)).rows[0];
    assert.deepEqual(counts, { total: 132, concluded: 132, valid: 74, invalid: 58,
      unresolved: 5, preserved_drafts: 117, pj_waiting: 0 });
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.ai_evaluation_drafts')).rows[0].n, 0);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM public.child_ai_queue WHERE status='completed' AND monitoria_id IS NOT NULL")).rows[0].n, 132);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.legacy_child_note_receipts WHERE monitoria_id IS NOT NULL')).rows[0].n, 132);
    const checked = (await db.query(`SELECT
      count(*) FILTER (WHERE t.requires_pj_review)::int AS pj_total,
      count(*) FILTER (WHERE (m.form_snapshot->>'legacy_verdict'='valido') <> (m.score >= 75))::int AS verdict_score_disagreements
      FROM public.monitorias m LEFT JOIN public.teams t ON t.id=m.team_id
      WHERE m.form_snapshot->>'legacy_source'='zendesk_child_note'`)).rows[0];
    assert.equal(fixture.filter(row => row.requires_pj_review).length, 50);
    assert.deepEqual(checked, { pj_total: 50, verdict_score_disagreements: 27 });
    await db.exec("SET request.jwt.claim.role='authenticated'");
    await assert.rejects(db.query(`UPDATE public.monitorias
      SET form_snapshot=form_snapshot-'legacy_source' WHERE ticket_id='176473'`),
    /Proveniência histórica não pode ser removida/);
    await assert.rejects(db.query(`UPDATE public.monitorias
      SET form_snapshot=jsonb_set(form_snapshot,'{legacy_verdict}','"invalido"'::jsonb)
      WHERE ticket_id='176473'`), /Proveniência histórica não pode ser alterada/);
    await db.exec("SET request.jwt.claim.role=''");
    const samples = (await db.query(`SELECT m.ticket_id,m.status,m.score,
        m.form_snapshot->>'legacy_verdict' AS verdict,
        m.form_snapshot->>'legacy_comment_id' AS comment_id,
        m.form_snapshot->>'legacy_agent_identity_unresolved' AS unresolved
      FROM public.monitorias m WHERE m.ticket_id IN ('176473','176598','178869') ORDER BY m.ticket_id`)).rows;
    assert.equal(samples.length, 3);
    assert.ok(samples.every(row => row.status === 'concluida' && row.comment_id));
    console.log('Amostra de monitorias históricas no banco de teste:', JSON.stringify(samples));
  } finally {
    await db.close();
  }
});
