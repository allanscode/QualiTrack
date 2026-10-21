import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
  const complete = async (jobId, answers, extras = {}, draftMeta = payload.draft_meta) => {
    const result = { score: 100, summary: 'Parecer da IA', strengths: [], improvements: [],
      suggested_answers: answers, suggested_observations: Object.fromEntries(Object.keys(answers).map(key => [key, 'Evidência do diálogo'])), suggested_critical_errors: {}, ...extras };
    await db.query('SELECT complete_ai_evaluation_execution($1,$2,$3,$4)', [jobId, id(1), result, draftMeta]);
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
    await db.exec("INSERT INTO business_hours(day_of_week) SELECT generate_series(1,5) ON CONFLICT(day_of_week) DO NOTHING");
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

    await t.test('nota abaixo de 75 cria monitoria pendente mesmo após sair do catálogo', async () => {
      await reset();
      const job = await begin('101');
      await db.query('DELETE FROM queue_ticket_catalog WHERE ticket_id=$1', ['101']);
      await complete(job, { q1: 'SIM', q2: 'SIM', q3: 'NAO', q4: 'NAO' });
      const retained = await state('101');
      assert.equal(retained.status, 'completed');
      assert.equal(Number(retained.score), 50);
      assert.equal(retained.ticket_snapshot.status, 'closed');
      const saved = (await db.query("SELECT * FROM monitorias WHERE ticket_id='101'")).rows[0];
      assert.equal(retained.monitoria_id, saved.id);
      assert.equal(saved.status, 'pendente_revisao');
      assert.equal(saved.resolution_type, null);
      assert.equal(saved.concluded_at, null);
      assert.ok(saved.action_deadline_at);
      assert.deepEqual(saved.form_snapshot.ai_evaluation.dialogue, payload.dialogue);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM positive_auto_publications')).rows[0].n, 0);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM final_positive_invalidation_outbox')).rows[0].n, 0);
      await db.query("UPDATE monitorias SET action_deadline_at=now()-interval '1 minute' WHERE id=$1", [saved.id]);
      await db.exec('SELECT process_action_deadline_timeouts()');
      const finalized = (await db.query('SELECT status,score FROM monitorias WHERE id=$1', [saved.id])).rows[0];
      assert.equal(finalized.status, 'concluida');
      assert.equal(Number(finalized.score), 50);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM final_positive_invalidation_outbox')).rows[0].n, 1);
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
      assert.equal(row.action_deadline_at, null);
      assert.deepEqual(row.answers, answers);
      assert.deepEqual(row.question_observations, Object.fromEntries(['q1','q2','q3','q4'].map(key => [key, 'Evidência do diálogo'])));
      assert.equal(row.form_snapshot.automation, 'positive_csat');
      assert.match(row.history[0].action, /automaticamente/);
      assert.equal((await state('102')).monitoria_id, row.id);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM monitorias')).rows[0].n, 1);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM ai_evaluation_drafts')).rows[0].n, 0);
    });

    await t.test('decisão final positiva após contestação só publica depois da conclusão', async () => {
      await reset();
      await complete(await begin('105'), { q1: 'SIM', q2: 'SIM', q3: 'NAO', q4: 'NAO' });
      const saved = (await db.query("SELECT id FROM monitorias WHERE ticket_id='105'")).rows[0];
      assert.equal((await db.query('SELECT count(*)::int AS n FROM positive_auto_publications')).rows[0].n, 0);
      await db.query("UPDATE monitorias SET status='em_contestacao' WHERE id=$1", [saved.id]);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM positive_auto_publications')).rows[0].n, 0);
      await db.query("UPDATE monitorias SET status='concluida',score=100 WHERE id=$1", [saved.id]);
      const publication = (await db.query('SELECT source,status FROM positive_auto_publications WHERE monitoria_id=$1', [saved.id])).rows[0];
      assert.deepEqual(publication, { source: 'positive_csat', status: 'pending' });
      assert.equal((await db.query('SELECT count(*)::int AS n FROM final_positive_invalidation_outbox')).rows[0].n, 0);
    });

    await t.test('PJ com IA vence no prazo sem liberar a conclusão dos demais casos PJ', async () => {
      await reset();
      await db.query("INSERT INTO teams(id,name,kind,requires_pj_review) VALUES ($1,'Equipe PJ','team',true)", [id(11)]);
      await db.query("INSERT INTO users(id,email,name,role,active,primary_team_id) VALUES ($1,'pj@example.invalid','Agente PJ','suporte',true,$2)", [id(3), id(11)]);
      const pjPayload = { ...payload, draft_meta: { ...payload.draft_meta, agent_id: id(3), team_id: id(11) } };
      await complete(await begin('106', pjPayload), { q1: 'SIM', q2: 'SIM', q3: 'NAO', q4: 'NAO' }, {}, pjPayload.draft_meta);
      const saved = (await db.query("SELECT * FROM monitorias WHERE ticket_id='106'")).rows[0];
      assert.equal(saved.status, 'pendente_revisao');
      assert.equal(saved.pj_review_required, true);
      await assert.rejects(db.query("UPDATE monitorias SET status='concluida' WHERE id=$1", [saved.id]), /parecer do gestor/);
      await db.query("UPDATE monitorias SET action_deadline_at=now()-interval '1 minute' WHERE id=$1", [saved.id]);
      await db.exec("SET request.jwt.claim.role='authenticated'");
      await db.query("SELECT set_config('app.positive_ai_timeout',$1,false)", [saved.id]);
      await assert.rejects(db.query("UPDATE monitorias SET status='concluida',resolution_type='automatic' WHERE id=$1", [saved.id]), /parecer do gestor/);
      await db.exec("SET request.jwt.claim.role='service_role'");
      await db.exec("SELECT set_config('app.positive_ai_timeout','',false)");
      await db.query("INSERT INTO monitorias(form_id,evaluator_id,evaluated_id,team_id,ticket_id,score,status,action_deadline_at,form_snapshot) VALUES " +
        "($1,$2,$3,$4,'107',50,'pendente_revisao',now()-interval '1 minute','{}')",
        [form.id, id(1), id(3), id(11)]);
      await db.exec('SELECT process_action_deadline_timeouts()');
      assert.equal((await db.query('SELECT status FROM monitorias WHERE id=$1', [saved.id])).rows[0].status, 'concluida');
      assert.equal((await db.query("SELECT status FROM monitorias WHERE ticket_id='107'")).rows[0].status, 'pendente_revisao');
      assert.equal((await db.query('SELECT count(*)::int AS n FROM final_positive_invalidation_outbox WHERE monitoria_id=$1', [saved.id])).rows[0].n, 1);
    });

    await t.test('respostas incompletas não podem usar a nota anunciada pela IA', async () => {
      await reset();
      await complete(await begin('103'), { q1: 'SIM' });
      assert.equal((await state('103')).status, 'review_required');
      assert.match((await state('103')).last_error, /todos os crit[ée]rios/);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM monitorias')).rows[0].n, 0);
    });

    await t.test('erro crítico cria monitoria pendente com nota zero', async () => {
      await reset();
      await complete(await begin('104'), { q1: 'SIM', q2: 'SIM', q3: 'SIM', q4: 'SIM' }, { suggested_critical_errors: { critical: true } });
      assert.equal((await state('104')).status, 'completed');
      assert.equal(Number((await state('104')).score), 100);
      assert.equal((await db.query("SELECT status FROM monitorias WHERE ticket_id='104'")).rows[0].status, 'pendente_revisao');
    });

    await t.test('gestor que atende ticket pode contestar sua monitoria crítica no fluxo comum', async () => {
      await reset();
      await db.query("INSERT INTO auth.users(id,email) VALUES ($1,'manager@example.invalid') ON CONFLICT(id) DO NOTHING", [id(5)]);
      await db.query("INSERT INTO users(id,email,name,role,active,primary_team_id) VALUES ($1,'manager@example.invalid','Gestor atendente','gestor_suporte',true,$2) ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,active=true,primary_team_id=EXCLUDED.primary_team_id", [id(5), id(10)]);
      await db.query('INSERT INTO user_teams(user_id,team_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id(5), id(10)]);
      const managerMeta = { ...payload.draft_meta, agent_id: id(5), agent_name: 'Gestor atendente', agent_email: 'manager@example.invalid' };
      const managerPayload = { ...payload, draft_meta: managerMeta };
      const job = await begin('109', managerPayload);
      await complete(job, { q1: 'SIM', q2: 'SIM', q3: 'SIM', q4: 'SIM' },
        { suggested_critical_errors: { critical: true } }, managerMeta);
      const saved = (await db.query("SELECT id,evaluated_id,status,score,form_snapshot FROM monitorias WHERE ticket_id='109'")).rows[0];
      assert.equal(saved.evaluated_id, id(5));
      assert.equal(saved.status, 'pendente_revisao');
      assert.equal(Number(saved.score), 100);
      assert.equal(saved.form_snapshot.review_route, 'standard_manager');
      await db.exec("SET request.jwt.claim.role='authenticated'");
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id(5)]);
      await db.query("SELECT act_on_monitoria_as_support_manager($1,'contestar','Solicito reavaliação', '[]'::jsonb)", [saved.id]);
      assert.equal((await db.query('SELECT status FROM monitorias WHERE id=$1', [saved.id])).rows[0].status, 'aguardando_gestor_qualidade');
      await db.exec("SET request.jwt.claim.role='service_role'");
      await db.query("SELECT set_config('request.jwt.claim.sub','',false)");
      await db.exec("SET request.jwt.claim.role='service_role'");
      await db.exec("SELECT set_config('request.jwt.claim.sub','',false)");
    });

    await t.test('erro crítico de equipe PJ segue a mesma revisão do gestor', async () => {
      await reset();
      await db.query("INSERT INTO teams(id,name,kind,requires_pj_review) VALUES ($1,'PJ crítico','team',true) ON CONFLICT (id) DO NOTHING", [id(12)]);
      await db.query("INSERT INTO users(id,email,name,role,active,primary_team_id) VALUES ($1,'critical-pj@example.invalid','Agente PJ','suporte',true,$2) ON CONFLICT (id) DO UPDATE SET primary_team_id=EXCLUDED.primary_team_id", [id(4), id(12)]);
      const pjPayload = { ...payload, draft_meta: { ...payload.draft_meta, agent_id: id(4), team_id: id(12) } };
      await complete(await begin('108', pjPayload), { q1: 'SIM', q2: 'SIM', q3: 'SIM', q4: 'SIM' },
        { suggested_critical_errors: { critical: true } }, pjPayload.draft_meta);
      const saved = (await db.query("SELECT id,status,score,pj_review_required,form_snapshot FROM monitorias WHERE ticket_id='108'")).rows[0];
      assert.equal(saved.status, 'pendente_revisao');
      assert.equal(Number(saved.score), 100);
      assert.equal(saved.pj_review_required, false);
      assert.equal(saved.form_snapshot.review_route, 'standard_manager');
      await db.query("UPDATE monitorias SET status='em_contestacao' WHERE id=$1", [saved.id]);
      assert.equal((await db.query('SELECT pj_review_required,status FROM monitorias WHERE id=$1', [saved.id])).rows[0].pj_review_required, false);
    });

    await t.test('erros críticos separados exigem verificação explícita e evidência', async () => {
      const withCritical = { ...form, critical_errors: [{ id: 'lgpd', text: 'Ética e LGPD', is_critical: true }] };
      const answers = { q1: 'SIM', q2: 'SIM', q3: 'SIM', q4: 'SIM' };
      for (const [ticket, extras, status] of [
        ['301', {}, 'review_required'],
        ['302', { suggested_critical_errors: { lgpd: true }, suggested_observations: { ...Object.fromEntries(Object.keys(answers).map(key => [key, 'Evidência'])), lgpd: 'Violação identificada' } }, 'completed'],
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
      assert.match(row.last_error, /Evidencia externa pendente/);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM monitorias')).rows[0].n, 0);
    });

    await t.test('conclui três jobs do mesmo agente e permite iniciar o próximo sem teto mensal', async () => {
      await reset();
      const jobs = [await begin('201'), await begin('202'), await begin('203')];
      for (const job of jobs) await complete(job, { q1: 'SIM', q2: 'SIM', q3: 'SIM', q4: 'SIM' });
      assert.equal((await db.query('SELECT count(*)::int AS n FROM monitorias')).rows[0].n, 3);
      assert.equal((await state('203')).status, 'completed');
      assert.equal((await state('203')).last_error, null);
      const fourth = await begin('204');
      assert.ok(fourth);
      await complete(fourth, { q1: 'SIM', q2: 'SIM', q3: 'SIM', q4: 'SIM' });
      assert.equal((await state('204')).status, 'completed');
      assert.equal((await db.query('SELECT count(*)::int AS n FROM monitorias')).rows[0].n, 4);
    });

    await t.test('salva o Registro do Auditor automático na mesma ficha da monitoria manual', async () => {
      await reset();
      const job = await begin('205');
      await complete(job, { q1: 'SIM', q2: 'SIM', q3: 'SIM', q4: 'SIM' }, {
        auditor_record: 'Os critérios foram atendidos, com registro claro da solução ao cliente.',
      });
      const row = (await db.query('SELECT evaluator_note, form_snapshot FROM monitorias WHERE ticket_id=$1', ['205'])).rows[0];
      assert.equal(row.evaluator_note, 'Os critérios foram atendidos, com registro claro da solução ao cliente.');
      assert.equal(row.form_snapshot.ai_evaluation.summary, 'Parecer da IA');
    });

    await t.test('converte parecer histórico com ponto crítico para o gestor sem zerar a nota nem publicar no Zendesk', async () => {
      await reset();
      const criticalForm = {
        ...form,
        critical_errors: [{ id: 'critical', text: 'Erro crítico confirmado', is_critical: true }],
      };
      const job = await begin('206', payload, criticalForm);
      await complete(job, { q1: 'SIM', q2: 'SIM', q3: 'SIM', q4: 'SIM' }, {
        summary: 'O atendimento apresentou erro crítico comprovado no registro da solução, apesar dos demais critérios conformes.',
        suggested_observations: {
          q1: 'Evidência do diálogo', q2: 'Evidência do diálogo',
          q3: 'Evidência do diálogo', q4: 'Evidência do diálogo',
          critical: 'Solução registrada de modo incorreto.',
        },
        suggested_critical_errors: { critical: true },
        requires_human_review: true, review_reasons: ['Evidência externa pendente.'],
      });
      assert.equal((await state('206')).status, 'review_required');
      await db.exec(`UPDATE positive_ai_queue SET last_error='Nota abaixo de 75% — revisão manual necessária.' WHERE ticket_id='206';
        UPDATE ai_evaluation_drafts SET result=jsonb_set(jsonb_set(result,'{requires_human_review}','false'),
          '{review_reasons}','[]') WHERE ticket_id='206';`);
      const sql = await readFile(new URL('../docs/operations/2026-10-16-positive-critical-backfill.sql', import.meta.url), 'utf8');
      await db.exec(sql);
      const row = (await db.query(`SELECT m.status,m.score,m.pj_review_required,m.evaluator_note,
        m.form_snapshot->>'review_route' AS route FROM monitorias m WHERE ticket_id='206'`)).rows[0];
      assert.equal(row.status, 'pendente_revisao');
      assert.equal(Number(row.score), 100);
      assert.equal(row.pj_review_required, false);
      assert.equal(row.route, 'standard_manager');
      assert.match(row.evaluator_note, /erro crítico comprovado/);
      assert.equal((await state('206')).status, 'completed');
    });

    await t.test('prioriza tickets novos e nunca reserva bloqueios sem nova tentativa agendada', async () => {
      await reset();
      await db.exec(`INSERT INTO positive_ai_queue(ticket_id,ticket_snapshot,status,created_at,next_attempt_at)
        VALUES ('601','{}','blocked',now()-interval '2 days',now()),
               ('602','{}','pending',now(),now()),
               ('603','{}','blocked',now()-interval '3 days','infinity');`);
      assert.equal((await db.query('SELECT ticket_id FROM claim_positive_ai_work()')).rows[0].ticket_id, '602');
      assert.equal((await db.query('SELECT ticket_id FROM claim_positive_ai_work()')).rows[0].ticket_id, '601');
      assert.deepEqual((await db.query('SELECT ticket_id FROM claim_positive_ai_work()')).rows, []);
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
