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


test('child automation persists reviews, computes the fixed form and shares the budget', async t => {
  const db = await createDatabase();
  const formId = '6c7d1e88-841b-4da9-9a66-9f1464ce896f';
  const payload = { action:'evaluate_child_ticket', dialogue:[{id:'comment',body:'Opening macro evidence'}],
    draft_meta:{form_id:formId,agent_id:id(2),team_id:id(10),source_queue:'filhos',
      agent_name:'Agent',agent_email:'agent@example.invalid',channel:'Chat',guideline_ids:[]} };
  const questions = ['child-subject-preserved','child-parent-linked','child-macro-preserved','child-macro-enriched','child-routing-correct'];
  const begin = async ticketId => {
    await db.query("INSERT INTO queue_ticket_catalog(ticket_id,queue_type,ticket_snapshot) VALUES ($1,'filhos',$2)",
      [ticketId,{ticket_id:ticketId,subject:'Child ticket',status:'closed',ticket_date:'2026-10-07T12:00:00Z'}]);
    const claim = (await db.query('SELECT * FROM claim_child_ai_work()')).rows[0];
    assert.equal(claim.ticket_id,ticketId);
    const form = (await db.query('SELECT to_jsonb(f) AS value FROM forms f WHERE id=$1',[formId])).rows[0].value;
    return (await db.query('SELECT start_child_ai_job($1,$2,$3,$4) AS id',[ticketId,claim.lease_id,payload,form])).rows[0].id;
  };
  const complete = async (jobId, overrides={}, extra={}) => {
    const result={detected_type:'analise_tecnica',status:'conforme',score:100,summary:'Child AI evidence',recommendations:[],
      checks:questions.map(question_id=>({question_id,answer:overrides[question_id]||'SIM',passed:(overrides[question_id]||'SIM')==='SIM',rule:question_id,details:'Verified opening evidence'})),...extra};
    await db.query('SELECT complete_ai_evaluation_execution($1,$2,$3,$4)',[jobId,id(1),result,payload.draft_meta]);
  };
  const state = async ticketId=>(await db.query('SELECT * FROM child_ai_queue WHERE ticket_id=$1',[ticketId])).rows[0];
  const reset = async()=>db.exec(`DELETE FROM queue_ticket_assignments; DELETE FROM child_ai_queue; DELETE FROM ai_evaluation_retry_queue; DELETE FROM ai_evaluation_jobs;
    DELETE FROM ai_evaluation_drafts; DELETE FROM monitorias; DELETE FROM queue_ticket_catalog;
    UPDATE positive_ai_config SET executions_started=0,max_evaluations=5,enabled=false;
    UPDATE child_ai_config SET enabled=true;`);
  try {
    assert.equal((await db.query('SELECT count(*)::int AS n FROM child_ai_config WHERE enabled')).rows[0].n,0);
    await db.query('INSERT INTO auth.users(id,email) VALUES ($1,$2)',[id(1),'gabriel@example.invalid']);
    await db.query(`INSERT INTO users(id,email,name,role,active) VALUES ($1,'gabriel@example.invalid','Gabriel Di Napoli','qualidade',true),
      ($2,'agent@example.invalid','Agent','suporte',true) ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,active=true,name=EXCLUDED.name`,[id(1),id(2)]);
    await db.query("INSERT INTO teams(id,name,kind) VALUES ($1,'Child team','team')",[id(10)]);
    await db.query('UPDATE users SET primary_team_id=$1 WHERE id=$2',[id(10),id(2)]);
    await db.query('INSERT INTO positive_ai_config(id,enabled,auditor_id,max_evaluations,executions_started) VALUES(true,false,$1,5,0) ON CONFLICT(id) DO UPDATE SET auditor_id=EXCLUDED.auditor_id,max_evaluations=5,executions_started=0',[id(1)]);
    await db.query('INSERT INTO child_ai_config(id,auditor_id,enabled) VALUES(true,$1,true) ON CONFLICT(id) DO UPDATE SET auditor_id=EXCLUDED.auditor_id,enabled=true',[id(1)]);
    await db.exec("SET request.jwt.claim.role='service_role'");

    await t.test('service-only claims and disabled intake',async()=>{
      for(const signature of ['claim_child_ai_scan()','claim_child_ai_work()','start_child_ai_job(text,uuid,jsonb,jsonb)','finish_child_ai_job(uuid)']) {
        const access=(await db.query("SELECT has_function_privilege('authenticated',$1,'EXECUTE') AS allowed",[signature])).rows[0];
        assert.equal(access.allowed,false);
      }
      await db.exec('UPDATE child_ai_config SET enabled=false');
      await db.query("INSERT INTO queue_ticket_catalog(ticket_id,queue_type,ticket_snapshot) VALUES ('90','filhos','{}')");
      assert.equal((await db.query('SELECT count(*)::int AS n FROM child_ai_queue')).rows[0].n,0);
      assert.deepEqual((await db.query('SELECT * FROM claim_child_ai_work()')).rows,[]);
    });
    await t.test('below 75 preserves a complete draft after leaving the live view',async()=>{
      await reset(); const job=await begin('101');
      await db.query("DELETE FROM queue_ticket_catalog WHERE ticket_id='101'");
      await complete(job,{'child-parent-linked':'NAO','child-routing-correct':'NAO'});
      assert.equal((await state('101')).status,'review_required');
      assert.equal(Number((await state('101')).score),57.5);
      const draft=(await db.query("SELECT * FROM ai_evaluation_drafts WHERE ticket_id='101'")).rows[0];
      assert.equal(draft.source_queue,'filhos');
      assert.equal(draft.result.suggested_answers['child-routing-correct'],'NAO');
      assert.equal(draft.result.automatic_child,true);
      assert.equal(draft.result.child_evaluation.checks.length,5);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM monitorias')).rows[0].n,0);
    });
    await t.test('retained reviews use authenticated quality distribution and preserve active ownership',async()=>{
      await reset();const job=await begin('111');await complete(job,{'child-routing-correct':'NAO','child-parent-linked':'NAO'});
      await db.exec("DELETE FROM queue_ticket_catalog WHERE ticket_id='111'");
      await db.query("INSERT INTO quality_monitor_presence(user_id,is_enabled) VALUES($1,true) ON CONFLICT(user_id) DO UPDATE SET is_enabled=true",[id(1)]);
      await db.query("INSERT INTO user_presence_sessions(session_id,user_id,last_seen_at) VALUES($1,$2,now())",[id(90),id(1)]);
      await db.exec("SET request.jwt.claim.role='authenticated'");
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id(2)]);
      await assert.rejects(db.query('SELECT assign_retained_child_ai_tickets()'),/Qualidade/);
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id(1)]);
      await db.query('SELECT assign_retained_child_ai_tickets()');
      const assigned=(await db.query("SELECT assigned_to,status FROM queue_ticket_assignments WHERE ticket_id='111'")).rows[0];
      assert.deepEqual(assigned,{assigned_to:id(1),status:'pending'});
      assert.equal((await db.query("SELECT count(*)::int AS n FROM queue_ticket_catalog WHERE ticket_id='111'")).rows[0].n,1);
      await db.exec("UPDATE queue_ticket_assignments SET status='in_progress' WHERE ticket_id='111'");
      await db.query('SELECT assign_retained_child_ai_tickets()');
      assert.equal((await db.query("SELECT status FROM queue_ticket_assignments WHERE ticket_id='111'")).rows[0].status,'in_progress');
      await db.exec("SET request.jwt.claim.role='service_role'");
    });
    await t.test('exactly 75 concludes, preserves the author and does not count as CSAT positive',async()=>{
      await reset();const job=await begin('102');
      await complete(job,{'child-routing-correct':'NAO'});
      const row=await state('102');assert.equal(row.status,'completed');assert.equal(Number(row.score),75);
      const saved=(await db.query('SELECT * FROM monitorias WHERE id=$1',[row.monitoria_id])).rows[0];
      assert.equal(saved.status,'concluida');assert.equal(saved.satisfaction_result,'Sem pesquisa');
      assert.equal(saved.evaluator_id,id(1));assert.equal(saved.form_id,formId);assert.ok(saved.concluded_at);
      assert.equal(saved.form_snapshot.automation,'child_ticket');assert.equal(saved.form_snapshot.child_ai_evaluation.checks.length,5);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM ai_evaluation_drafts')).rows[0].n,0);
      await db.query('SELECT finish_child_ai_job($1)',[job]);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM monitorias')).rows[0].n,1);
    });
    await t.test('critical failures, NA, attention and malformed checks require human review',async()=>{
      let n=200;
      for(const [answers,extra] of [[{'child-subject-preserved':'NAO'},{}],[{'child-parent-linked':'NA'},{}],[{},{status:'atencao'}],[{},{checks:[]}],[{},{checks:null}]]) {
        await reset();const ticket=String(n++);const job=await begin(ticket);await complete(job,answers,extra);
        assert.equal((await state(ticket)).status,'review_required');
        assert.equal((await db.query('SELECT count(*)::int AS n FROM monitorias')).rows[0].n,0);
      }
    });
    await t.test('shares the existing exhausted five-evaluation cap without extra reservations',async()=>{
      await reset();await db.exec('UPDATE positive_ai_config SET executions_started=5');
      await db.query("INSERT INTO queue_ticket_catalog(ticket_id,queue_type,ticket_snapshot) VALUES ('501','filhos','{}')");
      assert.deepEqual((await db.query('SELECT * FROM claim_child_ai_work()')).rows,[]);
      assert.equal((await db.query('SELECT executions_started FROM positive_ai_config')).rows[0].executions_started,5);
      await db.exec('UPDATE positive_ai_config SET executions_started=4');
      await db.exec("DELETE FROM child_ai_queue;DELETE FROM queue_ticket_catalog");
      const job=await begin('502');
      assert.equal((await db.query('SELECT executions_started FROM positive_ai_config')).rows[0].executions_started,5);
      assert.equal((await db.query('SELECT enabled FROM child_ai_config')).rows[0].enabled,false);
      await complete(job);
      assert.equal((await state('502')).status,'completed');
    });
  } finally { await db.close(); }
});
