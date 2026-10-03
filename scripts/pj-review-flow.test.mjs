import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { buildFreshSql, discoverFreshMigrations } from './prepare-supabase.mjs';

const id = n => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('PJ approval and contestation pass through the assigned reviewer before Quality', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA realtime;
      CREATE SCHEMA cron; CREATE SCHEMA extensions;
      CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('realtime.topic', true) $$;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
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
    const { sql } = await buildFreshSql();
    await db.exec(sql);
    for (const migration of await discoverFreshMigrations()) {
      await db.exec(migration.sql.replace(/^CREATE EXTENSION IF NOT EXISTS pg_(?:cron|net).*;\s*$/gm, ''));
    }
    await db.exec('INSERT INTO public.business_hours(day_of_week) SELECT generate_series(1,5)');
    const asUser = async (number, run) => {
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id(number)]);
      await db.exec('SET ROLE authenticated');
      try { return await run(); } finally { await db.exec('RESET ROLE'); }
    };
    await db.query(`INSERT INTO public.users(id,email,name,role,active) VALUES
      ($1,'pj.manager@example.invalid','Gestor PJ','gestor_suporte',true),
      ($2,'victor.aguiar@webposto.com.br','Victor Ellyan Aguiar','suporte',true),
      ($3,'pj.agent@example.invalid','Agente PJ','suporte',true),
      ($4,'quality@example.invalid','Gestora Qualidade','gestor_qualidade',true),
      ($5,'other@example.invalid','Outro Atendente','suporte',true),
      ($6,'auditor@example.invalid','Auditora','qualidade',true)`,
      [id(1), id(2), id(3), id(4), id(5), id(6)]);
    await db.query('INSERT INTO public.teams(id,name,kind,requires_pj_review) VALUES ($1,$2,$3,true)',
      [id(10), 'PJ Bruno', 'team']);
    await db.query('INSERT INTO public.user_teams(user_id,team_id) VALUES ($1,$3),($2,$3)',
      [id(1), id(3), id(10)]);
    await db.query('UPDATE public.users SET primary_team_id=$1 WHERE id=$2', [id(10), id(3)]);
    await db.query('INSERT INTO public.pj_review_settings(id,reviewer_id) VALUES (true,$1)', [id(2)]);
    await db.query('INSERT INTO public.forms(id,title,created_by) VALUES ($1,$2,$3)',
      [id(20), 'Ficha PJ', id(6)]);
    await db.query('INSERT INTO public.form_teams(form_id,team_id) VALUES ($1,$2)', [id(20), id(10)]);
    for (const n of [30, 31]) {
      await db.query(`INSERT INTO public.monitorias
        (id,form_id,evaluated_id,evaluator_id,team_id,score,question_observations,form_snapshot,applied_config)
        VALUES ($1,$2,$3,$4,$5,60,'{}','{}','{}')`,
        [id(n), id(20), id(3), id(6), id(10)]);
    }
    await db.query(`INSERT INTO public.monitorias
      (id,form_id,evaluated_id,evaluator_id,team_id,score,question_observations,form_snapshot,applied_config)
      VALUES ($1,$2,$3,$4,$5,92,'{}','{}','{}')`,
      [id(33), id(20), id(3), id(6), id(10)]);

    assert.equal((await asUser(2, () => db.query('SELECT id FROM public.vw_monitorias_pj_reviewer'))).rows.length, 0);
    assert.equal((await asUser(5, () => db.query('SELECT id FROM public.vw_monitorias_pj_reviewer'))).rows.length, 0);
    assert.equal((await asUser(2, () => db.query('SELECT reviewer_id FROM public.pj_review_settings'))).rows.length, 0);
    assert.equal((await asUser(4, () => db.query('SELECT reviewer_id FROM public.pj_review_settings'))).rows.length, 1);
    await assert.rejects(asUser(4, () => db.query("UPDATE public.monitorias SET status='concluida',pj_review_decision='approved' WHERE id=$1", [id(30)])), /parecer|revisão/i);
    const directManagerUpdate = await asUser(1, () => db.query("UPDATE public.monitorias SET status='aguardando_revisao_pj',pj_reviewer_id=$1,pj_review_kind='approval' WHERE id=$2", [id(2), id(30)]));
    assert.equal(directManagerUpdate.affectedRows, 0, 'RLS blocks a direct manager update');

    await asUser(1, () => db.query('SELECT public.act_on_monitoria_as_support_manager($1,$2,$3,$4)',
      [id(30), 'aceitar', 'Ação corretiva aplicada', []]));
    await asUser(1, () => db.query('SELECT public.act_on_monitoria_as_support_manager($1,$2,$3,$4)',
      [id(31), 'contestar', 'Nota da contestação', []]));
    await asUser(1, () => db.query('SELECT public.act_on_monitoria_as_support_manager($1,$2,$3,$4)',
      [id(33), 'aceitar', 'Aprovação de nota alta', []]));
    const pending = (await db.query('SELECT id,status,pj_reviewer_id,pj_review_kind FROM public.monitorias WHERE id IN ($1,$2,$3) ORDER BY id', [id(30), id(31), id(33)])).rows;
    assert.deepEqual(pending.map(row => row.status), ['aguardando_revisao_pj', 'aguardando_revisao_pj', 'aguardando_revisao_pj']);
    assert.deepEqual(pending.map(row => row.pj_review_kind), ['approval', 'contestation', 'approval']);
    assert.ok(pending.every(row => row.pj_reviewer_id === id(2)));
    const reviewerRows = await asUser(2, () => db.query('SELECT id,evaluator_id,evaluator_name FROM public.vw_monitorias_pj_reviewer'));
    assert.equal(reviewerRows.rows.length, 3);
    assert.ok(reviewerRows.rows.every(row => row.evaluator_id === null && row.evaluator_name === null));
    assert.equal((await asUser(5, () => db.query('SELECT id FROM public.vw_monitorias_pj_reviewer'))).rows.length, 0);
    await assert.rejects(asUser(5, () => db.query('SELECT public.review_pj_monitoria($1,$2,$3)', [id(30), 'approved', 'Tentei aprovar'])), /fila deste revisor/i);
    await assert.rejects(asUser(4, () => db.query("UPDATE public.monitorias SET pj_review_decision='approved' WHERE id=$1", [id(30)])), /parecer de Victor/i);

    await asUser(2, () => db.query('SELECT public.review_pj_monitoria($1,$2,$3)', [id(30), 'approved', 'Concordo com o gestor']));
    await asUser(2, () => db.query('SELECT public.review_pj_monitoria($1,$2,$3)', [id(31), 'rejected', 'Discordo do gestor']));
    await asUser(2, () => db.query('SELECT public.review_pj_monitoria($1,$2,$3)', [id(33), 'approved', 'Concordo com a nota alta']));
    const reviewed = (await db.query('SELECT id,status,pj_review_decision,pj_review_note FROM public.monitorias WHERE id IN ($1,$2,$3) ORDER BY id', [id(30), id(31), id(33)])).rows;
    assert.deepEqual(reviewed.map(row => row.status), ['aguardando_gestor_qualidade', 'aguardando_gestor_qualidade', 'aguardando_gestor_qualidade']);
    assert.deepEqual(reviewed.map(row => row.pj_review_decision), ['approved', 'rejected', 'approved']);
    await assert.rejects(asUser(4, () => db.query("UPDATE public.monitorias SET pj_review_note='Adulterado' WHERE id=$1", [id(31)])), /parecer de Victor/i);
    await asUser(4, () => db.query("UPDATE public.monitorias SET status='concluida' WHERE id=$1", [id(30)]));
    assert.equal((await db.query('SELECT status FROM public.monitorias WHERE id=$1', [id(30)])).rows[0].status, 'concluida');
    await assert.rejects(asUser(4, () => db.query("UPDATE public.monitorias SET status='concluida' WHERE id=$1", [id(31)])), /resolver a contestação/i);
    await asUser(4, () => db.query("UPDATE public.monitorias SET status='concluida',contestation_result='approved' WHERE id=$1", [id(31)]));
    assert.equal((await db.query('SELECT contestation_result FROM public.monitorias WHERE id=$1', [id(31)])).rows[0].contestation_result, 'approved');
    await assert.rejects(asUser(2, () => db.query('SELECT public.review_pj_monitoria($1,$2,$3)', [id(30), 'rejected', 'Segunda tentativa'])), /fila deste revisor/i);

    await db.query("SELECT set_config('request.jwt.claim.sub','',false)");
    await db.query(`INSERT INTO public.monitorias
      (id,form_id,evaluated_id,evaluator_id,team_id,score,question_observations,form_snapshot,applied_config)
      VALUES ($1,$2,$3,$4,$5,55,'{}','{}','{}')`,
      [id(32), id(20), id(3), id(6), id(10)]);
    await db.query('INSERT INTO public.teams(id,name,kind) VALUES ($1,$2,$3)', [id(11), 'WebPosto', 'team']);
    await db.query('UPDATE public.users SET primary_team_id=$1 WHERE id=$2', [id(11), id(3)]);
    const transferred = (await db.query('SELECT team_id,pj_review_required FROM public.monitorias WHERE id=$1', [id(32)])).rows[0];
    assert.equal(transferred.team_id, id(11));
    assert.equal(transferred.pj_review_required, true, 'PJ workflow remains required after an agent changes team');
    await assert.rejects(asUser(4, () => db.query("UPDATE public.monitorias SET status='concluida' WHERE id=$1", [id(32)])), /parecer/i);
  } finally {
    await db.close();
  }
});
