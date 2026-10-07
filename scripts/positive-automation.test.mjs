import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { buildFreshSql, discoverFreshMigrations } from './prepare-supabase.mjs';

const id = number => `50000000-0000-4000-8000-${String(number).padStart(12, '0')}`;

async function createDatabase() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA realtime;
    CREATE SCHEMA cron; CREATE SCHEMA extensions;
    CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('realtime.topic', true) $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
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
  for (const migration of await discoverFreshMigrations()) {
    await db.exec(migration.sql.replace(/^CREATE EXTENSION IF NOT EXISTS pg_(?:cron|net).*;\s*$/gm, ''));
  }
  return db;
}

test('automação positiva preserva revisão e conclui somente fichas válidas', async t => {
  const db = await createDatabase();
  const form = { id: id(20), title: 'Atendimento positivo', sections: [{
    id: 'section', title: 'Atendimento', weight: 100,
    questions: [1, 2, 3, 4].map(number => ({ id: `q${number}`, text: `Critério ${number}` })),
  }], critical_errors: [] };
  const payload = {
    action: 'evaluate_ai', dialogue: [{ id: 'comment', body: 'Conversa preservada' }],
    draft_meta: { form_id: id(20), agent_id: id(2), team_id: id(10), source_queue: 'positivas',
      agent_name: 'Agente', agent_email: 'agent@example.invalid', channel: 'email', guideline_ids: [] },
  };
  const begin = async (ticketId, customPayload = payload, customForm = form) => {
    await db.query(`INSERT INTO queue_ticket_catalog(ticket_id,queue_type,ticket_snapshot) VALUES ($1,'positivas',$2)`,
      [ticketId, { ticket_id: ticketId, subject: 'Atendimento encerrado', status: 'closed', csat_status: 'good', ticket_date: '2026-10-07T12:00:00Z' }]);
    const claim = (await db.query('SELECT * FROM claim_positive_ai_work()')).rows[0];
    assert.equal(claim.ticket_id, ticketId);
    const job = (await db.query('SELECT start_positive_ai_job($1,$2,$3,$4) AS id',
      [ticketId, claim.lease_id, customPayload, customForm])).rows[0].id;
    return job;
  };
  const complete = async (jobId, answers, extras = {}) => {
    const result = { score: 100, summary: 'Parecer da IA', strengths: [], improvements: [],
      suggested_answers: answers, suggested_observations: Object.fromEntries(Object.keys(answers).map(key => [key, 'Evidência do diálogo'])), suggested_critical_errors: {}, ...extras };
    await db.query('SELECT complete_ai_evaluation_execution($1,$2,$3,$4)', [jobId, id(1), result, payload.draft_meta]);
  };
  const state = async ticketId => (await db.query('SELECT * FROM positive_ai_queue WHERE ticket_id=$1', [ticketId])).rows[0];
  const reset = async () => db.exec(`DELETE FROM positive_ai_queue; DELETE FROM ai_evaluation_retry_queue;
    DELETE FROM ai_evaluation_jobs; DELETE FROM ai_evaluation_drafts; DELETE FROM monitorias; DELETE FROM queue_ticket_catalog;`);
  try {
    await db.query('INSERT INTO auth.users(id,email) VALUES ($1,$2)', [id(1), 'gabriel@example.invalid']);
    await db.query(`INSERT INTO users(id,email,name,role,active) VALUES ($1,'gabriel@example.invalid','Gabriel Di Napoli','qualidade',true),
      ($2,'agent@example.invalid','Agente','suporte',true) ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,active=true,name=EXCLUDED.name`, [id(1), id(2)]);
    await db.query("INSERT INTO teams(id,name,kind) VALUES ($1,'Equipe de teste','team')", [id(10)]);
    await db.query('UPDATE users SET primary_team_id=$1 WHERE id=$2', [id(10), id(2)]);
    await db.query('INSERT INTO forms(id,title,sections,critical_errors,active) VALUES ($1,$2,$3,$4,true)',
      [form.id, form.title, form.sections, form.critical_errors]);
    await db.query('INSERT INTO positive_ai_config(id,enabled,auditor_id) VALUES (true,true,$1) ON CONFLICT(id) DO UPDATE SET enabled=true,auditor_id=EXCLUDED.auditor_id', [id(1)]);
    await db.exec("SET request.jwt.claim.role='service_role'");

    await t.test('somente o serviço inicia ou conclui automação', async () => {
      for (const signature of ['claim_positive_ai_scan()', 'claim_positive_ai_work()', 'start_positive_ai_job(text,uuid,jsonb,jsonb)', 'finish_positive_ai_job(uuid)']) {
        const row = (await db.query('SELECT has_function_privilege($1,$3,\'EXECUTE\') AS anon, has_function_privilege($2,$3,\'EXECUTE\') AS authenticated',
          ['anon', 'authenticated', signature])).rows[0];
        assert.deepEqual(row, { anon: false, authenticated: false });
      }
      await db.exec("SET request.jwt.claim.role='authenticated'");
      await assert.rejects(db.query('SELECT * FROM claim_positive_ai_work()'), /não autorizado/);
      await db.exec("SET request.jwt.claim.role='service_role'");
    });

    await t.test('nota abaixo de 75 permanece mesmo após sair do catálogo', async () => {
      await reset();
      const job = await begin('101');
      await db.query('DELETE FROM queue_ticket_catalog WHERE ticket_id=$1', ['101']);
      await complete(job, { q1: 'SIM', q2: 'SIM', q3: 'NAO', q4: 'NAO' });
      const retained = await state('101');
      assert.equal(retained.status, 'review_required');
      assert.equal(Number(retained.score), 50);
      assert.equal(retained.ticket_snapshot.status, 'closed');
      const draft = (await db.query("SELECT * FROM ai_evaluation_drafts WHERE ticket_id='101'")).rows[0];
      assert.equal(draft.source_queue, 'positivas');
      assert.equal(draft.created_by, id(1));
      assert.deepEqual(draft.result.dialogue, payload.dialogue);
      assert.match(draft.result.automation_review_reason, /abaixo de 75/);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM monitorias')).rows[0].n, 0);
    });

    await t.test('75 conclui ficha preenchida em nome de Gabriel uma única vez', async () => {
      await reset();
      const job = await begin('102');
      const answers = { q1: 'SIM', q2: 'SIM', q3: 'SIM', q4: 'NAO' };
      await complete(job, answers);
      await db.query('SELECT finish_positive_ai_job($1)', [job]);
      const row = (await db.query("SELECT * FROM monitorias WHERE ticket_id='102'")).rows[0];
      assert.equal(row.status, 'concluida');
      assert.equal(Number(row.score), 75);
      assert.equal(row.evaluator_id, id(1));
      assert.equal(row.evaluator_name, 'Gabriel Di Napoli');
      assert.equal(row.resolution_type, 'automatic');
      assert.deepEqual(row.answers, answers);
      assert.deepEqual(row.question_observations, Object.fromEntries(['q1','q2','q3','q4'].map(key => [key, 'Evidência do diálogo'])));
      assert.equal(row.form_snapshot.automation, 'positive_csat');
      assert.match(row.history[0].action, /automaticamente/);
      assert.equal((await state('102')).monitoria_id, row.id);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM monitorias')).rows[0].n, 1);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM ai_evaluation_drafts')).rows[0].n, 0);
    });

    await t.test('respostas incompletas não podem usar a nota anunciada pela IA', async () => {
      await reset();
      await complete(await begin('103'), { q1: 'SIM' });
      assert.equal((await state('103')).status, 'review_required');
      assert.match((await state('103')).last_error, /todos os critérios/);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM monitorias')).rows[0].n, 0);
    });

    await t.test('erro crítico impede conclusão mesmo com todas as respostas positivas', async () => {
      await reset();
      await complete(await begin('104'), { q1: 'SIM', q2: 'SIM', q3: 'SIM', q4: 'SIM' }, { suggested_critical_errors: { critical: true } });
      assert.equal((await state('104')).status, 'review_required');
      assert.equal(Number((await state('104')).score), 0);
    });

    await t.test('erros críticos separados exigem verificação explícita e evidência', async () => {
      const withCritical = { ...form, critical_errors: [{ id: 'lgpd', text: 'Ética e LGPD', is_critical: true }] };
      const answers = { q1: 'SIM', q2: 'SIM', q3: 'SIM', q4: 'SIM' };
      for (const [ticket, extras, status] of [
        ['301', {}, 'review_required'],
        ['302', { suggested_critical_errors: { lgpd: true }, suggested_observations: { ...Object.fromEntries(Object.keys(answers).map(key => [key, 'Evidência'])), lgpd: 'Violação identificada' } }, 'review_required'],
        ['303', { suggested_critical_errors: { lgpd: false }, suggested_observations: { ...Object.fromEntries(Object.keys(answers).map(key => [key, 'Evidência'])), lgpd: 'Critério conferido' } }, 'completed'],
      ]) {
        await reset();
        const job = await begin(ticket, payload, withCritical);
        await complete(job, answers, extras);
        assert.equal((await state(ticket)).status, status);
      }
    });

    await t.test('todas NA, pesos zero e justificativas ausentes exigem revisão', async () => {
      for (const [ticket, answers, customForm, extras] of [
        ['401', { q1: 'NA', q2: 'NA', q3: 'NA', q4: 'NA' }, form, {}],
        ['402', { q1: 'SIM', q2: 'SIM', q3: 'SIM', q4: 'SIM' }, { ...form, sections: [{ ...form.sections[0], weight: 0 }] }, {}],
        ['403', { q1: 'SIM', q2: 'SIM', q3: 'SIM', q4: 'SIM' }, form, { suggested_observations: {} }],
      ]) {
        await reset();
        const job = await begin(ticket, payload, customForm);
        await complete(job, answers, extras);
        assert.equal((await state(ticket)).status, 'review_required');
        assert.equal((await db.query('SELECT count(*)::int AS n FROM monitorias')).rows[0].n, 0);
      }
    });

    await t.test('evidência externa ausente mantém nota dos critérios e exige revisão', async () => {
      await reset();
      const job = await begin('450');
      await complete(job, { q1: 'SIM', q2: 'SIM', q3: 'SIM', q4: 'NAO' }, {
        requires_human_review: true, review_reasons: ['Conferir vínculo do ticket filho antes de concluir.'],
      });
      const row = await state('450');
      assert.equal(row.status, 'review_required');
      assert.equal(Number(row.score), 75);
      assert.match(row.last_error, /Evidência externa pendente/);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM monitorias')).rows[0].n, 0);
    });

    await t.test('reconfere o limite mensal na conclusão de três jobs já iniciados', async () => {
      await reset();
      const jobs = [await begin('201'), await begin('202'), await begin('203')];
      for (const job of jobs) await complete(job, { q1: 'SIM', q2: 'SIM', q3: 'SIM', q4: 'SIM' });
      assert.equal((await db.query('SELECT count(*)::int AS n FROM monitorias')).rows[0].n, 2);
      assert.equal((await state('203')).status, 'review_required');
      assert.match((await state('203')).last_error, /Limite de duas/);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM ai_evaluation_drafts WHERE ticket_id='203'")).rows[0].n, 1);
    });

    await t.test('teto do ambiente pausa novos jobs e permite terminar o último reservado', async () => {
      await reset();
      await db.exec('UPDATE positive_ai_config SET max_evaluations=1,executions_started=0,enabled=true');
      const job = await begin('501');
      const config = (await db.query('SELECT * FROM positive_ai_config')).rows[0];
      assert.equal(config.enabled, false);
      assert.equal(config.executions_started, 1);
      assert.deepEqual((await db.query('SELECT * FROM claim_positive_ai_work()')).rows, []);
      await complete(job, { q1: 'SIM', q2: 'SIM', q3: 'SIM', q4: 'SIM' });
      assert.equal((await state('501')).status, 'completed');
    });
  } finally { await db.close(); }
});
