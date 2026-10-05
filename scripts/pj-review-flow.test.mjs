import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { buildFreshSql, discoverFreshMigrations } from './prepare-supabase.mjs';

const id = n => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const positiveRouteMigrationName = '20261005000002_pj_positive_auto_conclusion.sql';
const staleClientMigrationName = '20261005000003_pj_positive_stale_client_compat.sql';
const statusConstraintMigrationName = '20261005000004_pj_review_status_constraint.sql';

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
    const migrations = await discoverFreshMigrations();
    const positiveRouteMigration = migrations.find(migration => migration.name === positiveRouteMigrationName);
    const staleClientMigration = migrations.find(migration => migration.name === staleClientMigrationName);
    const statusConstraintMigration = migrations.find(migration => migration.name === statusConstraintMigrationName);
    assert.ok(positiveRouteMigration);
    assert.ok(staleClientMigration);
    assert.ok(statusConstraintMigration);
    for (const migration of migrations.filter(item => item.name < positiveRouteMigrationName)) {
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
    await db.exec(positiveRouteMigration.sql);
    await db.exec(staleClientMigration.sql);
    const backfilledPositive = (await db.query('SELECT status,pj_review_required,resolution_type,action_deadline_at,history FROM public.monitorias WHERE id=$1', [id(33)])).rows[0];
    assert.equal(backfilledPositive.status, 'concluida');
    assert.equal(backfilledPositive.pj_review_required, false);
    assert.equal(backfilledPositive.resolution_type, 'human');
    assert.equal(backfilledPositive.action_deadline_at, null);
    assert.match(backfilledPositive.history.at(-1).action, /correção da regra PJ/);
    await db.query(`INSERT INTO public.monitorias
      (id,form_id,evaluated_id,evaluator_id,team_id,score,status,question_observations,form_snapshot,applied_config)
      VALUES ($1,$2,$3,$4,$5,75,'concluida','{}','{}','{}')`,
      [id(34), id(20), id(3), id(6), id(10)]);
    assert.deepEqual((await db.query('SELECT status,pj_review_required FROM public.monitorias WHERE id=$1', [id(34)])).rows[0],
      { status: 'concluida', pj_review_required: false });
    await asUser(6, () => db.query(`INSERT INTO public.monitorias
      (id,form_id,evaluated_id,evaluator_id,team_id,score,status,action_deadline_at,history,
       question_observations,form_snapshot,applied_config)
      VALUES ($1,$2,$3,$4,$5,75,'pendente_revisao',now() + interval '2 days',
        '[{"action":"Monitoria Criada"}]'::jsonb,'{}','{}','{}')`,
      [id(35), id(20), id(3), id(6), id(10)]));
    const staleClientPositive = (await db.query(`SELECT status,pj_review_required,resolution_type,
      action_deadline_at,history FROM public.monitorias WHERE id=$1`, [id(35)])).rows[0];
    assert.equal(staleClientPositive.status, 'concluida');
    assert.equal(staleClientPositive.pj_review_required, false);
    assert.equal(staleClientPositive.resolution_type, 'human');
    assert.equal(staleClientPositive.action_deadline_at, null);
    assert.equal(staleClientPositive.history[0].action, 'Monitoria Criada');
    assert.match(staleClientPositive.history.at(-1).action, /concluída automaticamente/);
    await assert.rejects(db.query(`INSERT INTO public.monitorias
      (id,form_id,evaluated_id,evaluator_id,team_id,score,status,question_observations,form_snapshot,applied_config)
      VALUES ($1,$2,$3,$4,$5,60,'concluida','{}','{}','{}')`,
      [id(35), id(20), id(3), id(6), id(10)]), /nota inferior a 75/i);

    assert.equal((await asUser(2, () => db.query('SELECT id FROM public.vw_monitorias_pj_reviewer'))).rows.length, 0);
    assert.equal((await asUser(5, () => db.query('SELECT id FROM public.vw_monitorias_pj_reviewer'))).rows.length, 0);
    assert.equal((await asUser(2, () => db.query('SELECT reviewer_id FROM public.pj_review_settings'))).rows.length, 0);
    assert.equal((await asUser(4, () => db.query('SELECT reviewer_id FROM public.pj_review_settings'))).rows.length, 1);
    await db.exec(`ALTER TABLE public.monitorias ADD CONSTRAINT chk_monitoria_status CHECK (status IN (
      'pendente_revisao','em_contestacao','aguardando_gestor_suporte',
      'aguardando_gestor_qualidade','concluida','contestacao_aceita',
      'contestacao_negada','finalizada_alterada','reavaliacao_solicitada'
    ))`);
    await assert.rejects(asUser(1, () => db.query('SELECT public.act_on_monitoria_as_support_manager($1,$2,$3,$4)',
      [id(31), 'contestar', 'Parecer de teste', []])), /chk_monitoria_status/);
    assert.equal((await db.query('SELECT status,pj_reviewer_id FROM public.monitorias WHERE id=$1', [id(31)])).rows[0].status,
      'pendente_revisao');
    await db.exec(statusConstraintMigration.sql);
    const statusChecks = (await db.query(`SELECT conname FROM pg_constraint WHERE conrelid='public.monitorias'::regclass
      AND contype='c' AND conname IN ('chk_monitoria_status','monitorias_status_check')`)).rows;
    assert.deepEqual(statusChecks, [{ conname: 'chk_monitoria_status' }]);
    await assert.rejects(asUser(4, () => db.query("UPDATE public.monitorias SET status='concluida',pj_review_decision='approved' WHERE id=$1", [id(30)])), /parecer|revisão/i);
    const directManagerUpdate = await asUser(1, () => db.query("UPDATE public.monitorias SET status='aguardando_revisao_pj',pj_reviewer_id=$1,pj_review_kind='approval' WHERE id=$2", [id(2), id(30)]));
    assert.equal(directManagerUpdate.affectedRows, 0, 'RLS blocks a direct manager update');

    await asUser(1, () => db.query('SELECT public.act_on_monitoria_as_support_manager($1,$2,$3,$4)',
      [id(30), 'aceitar', 'Ação corretiva aplicada', []]));
    await asUser(1, () => db.query('SELECT public.act_on_monitoria_as_support_manager($1,$2,$3,$4)',
      [id(31), 'contestar', 'Nota da contestação', []]));
    const pending = (await db.query('SELECT id,status,pj_reviewer_id,pj_review_kind FROM public.monitorias WHERE id IN ($1,$2) ORDER BY id', [id(30), id(31)])).rows;
    assert.deepEqual(pending.map(row => row.status), ['aguardando_revisao_pj', 'aguardando_revisao_pj']);
    assert.deepEqual(pending.map(row => row.pj_review_kind), ['approval', 'contestation']);
    assert.ok(pending.every(row => row.pj_reviewer_id === id(2)));
    const reviewerRows = await asUser(2, () => db.query('SELECT id,evaluator_id,evaluator_name FROM public.vw_monitorias_pj_reviewer'));
    assert.equal(reviewerRows.rows.length, 2);
    assert.ok(reviewerRows.rows.every(row => row.evaluator_id === null && row.evaluator_name === null));
    assert.equal((await asUser(5, () => db.query('SELECT id FROM public.vw_monitorias_pj_reviewer'))).rows.length, 0);
    await assert.rejects(asUser(5, () => db.query('SELECT public.review_pj_monitoria($1,$2,$3)', [id(30), 'approved', 'Tentei aprovar'])), /fila deste revisor/i);
    await assert.rejects(asUser(4, () => db.query("UPDATE public.monitorias SET pj_review_decision='approved' WHERE id=$1", [id(30)])), /parecer de Victor/i);

    await asUser(2, () => db.query('SELECT public.review_pj_monitoria($1,$2,$3)', [id(30), 'approved', 'Concordo com o gestor']));
    await asUser(2, () => db.query('SELECT public.review_pj_monitoria($1,$2,$3)', [id(31), 'rejected', 'Discordo do gestor']));
    const reviewed = (await db.query('SELECT id,status,pj_review_decision,pj_review_note FROM public.monitorias WHERE id IN ($1,$2) ORDER BY id', [id(30), id(31)])).rows;
    assert.deepEqual(reviewed.map(row => row.status), ['aguardando_gestor_qualidade', 'aguardando_gestor_qualidade']);
    assert.deepEqual(reviewed.map(row => row.pj_review_decision), ['approved', 'rejected']);
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
    await db.query('INSERT INTO public.teams(id,name,kind) VALUES ($1,$2,$3)', [id(11), 'Cliente final', 'team']);
    await db.query("INSERT INTO public.teams(id,name,kind,parent_team_id) VALUES ($1,'Mais Pagamentos','team',$3),($2,'PJ Trindade','team',NULL)",
      [id(14), id(15), id(11)]);
    await db.query('UPDATE public.users SET primary_team_id=$1 WHERE id=$2', [id(11), id(3)]);
    const transferred = (await db.query('SELECT team_id,pj_review_required FROM public.monitorias WHERE id=$1', [id(32)])).rows[0];
    assert.equal(transferred.team_id, id(11));
    assert.equal(transferred.pj_review_required, true, 'PJ workflow remains required after an agent changes team');
    await assert.rejects(asUser(4, () => db.query("UPDATE public.monitorias SET status='concluida' WHERE id=$1", [id(32)])), /parecer/i);

    // The operational WebPosto split promotes Victor without removing his
    // assigned PJ review queue or granting him the PJ manager's team access.
    await db.query(`INSERT INTO public.users(id,email,name,role,active,primary_team_id) VALUES
      ($1,'ana@example.invalid','Ana Karolina','gestor_suporte',true,$4),
      ($2,'ricardo@example.invalid','Ricardo Fadini','gestor_suporte',true,$4),
      ($3,'other-manager@example.invalid','Outro Gestor PJ','gestor_suporte',true,$5)`,
      [id(7), id(8), id(9), id(11), id(10)]);
    await db.query('INSERT INTO public.user_teams(user_id,team_id) VALUES ($1,$4),($2,$4),($3,$4),($5,$6)',
      [id(7), id(8), id(2), id(11), id(9), id(10)]);
    await db.query("INSERT INTO public.teams(id,name,kind) VALUES ($1,'Cliente Final','group'),($2,'Revenda','group')",
      [id(12), id(13)]);
    await db.query('INSERT INTO public.team_groups(team_id,group_id) VALUES ($1,$2)', [id(10), id(12)]);
    const finalRosterUser = 'b8aaa9c7-4675-465d-b4af-a2bbaa4d3a61';
    const revendaRosterUser = '7aeca8dc-66af-4e46-92db-8dcc064cd990';
    const escalaRosterUser = '045dad4a-90e2-4ba3-912f-def26c5b2c93';
    const pjFieldRosterUser = 'cf09bf40-30e3-48e3-ba1c-50298b7b754a';
    await db.query(`INSERT INTO public.users(id,email,name,role,active,primary_team_id) VALUES
      ($1,'final-roster@example.invalid','Atendente Final','suporte',true,$3),
      ($2,'revenda-roster@example.invalid','Atendente Revenda','suporte',true,$3),
      ($4,'escala-roster@example.invalid','Atendente Escala','suporte',true,$3),
      ($5,'pj-field-roster@example.invalid','Atendente PJ Campo','suporte',true,$3)`,
      [finalRosterUser, revendaRosterUser, id(11), escalaRosterUser, pjFieldRosterUser]);
    await db.query('INSERT INTO public.user_teams(user_id,team_id) VALUES ($1,$3),($2,$3),($4,$3),($5,$3)',
      [finalRosterUser, revendaRosterUser, id(11), escalaRosterUser, pjFieldRosterUser]);
    const divisionMigration = (await discoverFreshMigrations())
      .find(migration => migration.name === '20261005000001_webposto_management_divisions.sql');
    assert.ok(divisionMigration);
    await db.exec(divisionMigration.sql);
    assert.equal((await db.query('SELECT name FROM public.teams WHERE id=$1', [id(11)])).rows[0].name, 'WebPosto');

    const divisions = (await db.query("SELECT name,parent_team_id FROM public.teams WHERE kind='team' AND name IN ('Cliente Final','Revenda','Escala') ORDER BY name")).rows;
    assert.deepEqual(divisions.map(team => team.name), ['Cliente Final', 'Escala', 'Revenda']);
    assert.ok(divisions.every(team => team.parent_team_id === id(11)));
    const finalId = (await db.query("SELECT id FROM public.teams WHERE name='Cliente Final' AND kind='team'")).rows[0].id;
    const revendaId = (await db.query("SELECT id FROM public.teams WHERE name='Revenda' AND kind='team'")).rows[0].id;
    const escalaId = (await db.query("SELECT id FROM public.teams WHERE name='Escala' AND kind='team'")).rows[0].id;
    assert.equal((await db.query('SELECT approval_manager_id FROM public.teams WHERE id=$1', [revendaId])).rows[0].approval_manager_id, id(2));
    assert.equal((await db.query('SELECT approval_manager_id FROM public.teams WHERE id=$1', [escalaId])).rows[0].approval_manager_id, id(2));
    assert.equal((await db.query('SELECT role,primary_team_id FROM public.users WHERE id=$1', [id(2)])).rows[0].role, 'gestor_suporte');
    const managerLinks = (await db.query('SELECT team_id FROM public.user_teams WHERE user_id=$1', [id(2)])).rows.map(row => row.team_id);
    assert.deepEqual(new Set(managerLinks), new Set([revendaId, escalaId]));
    assert.deepEqual((await db.query('SELECT user_id,team_id FROM public.user_teams WHERE user_id IN ($1,$2) ORDER BY user_id',
      [id(7), id(8)])).rows.map(row => row.team_id), [finalId, finalId]);
    assert.equal((await db.query('SELECT count(*)::int AS total FROM public.team_groups WHERE team_id IN ($1,$2,$3)',
      [finalId, revendaId, escalaId])).rows[0].total, 6);
    assert.equal((await db.query('SELECT count(*)::int AS total FROM public.team_groups WHERE team_id=$1 AND group_id=$2',
      [id(10), id(12)])).rows[0].total, 1, 'PJ ticket-group coverage remains linked');
    assert.equal((await asUser(7, () => db.query('SELECT id FROM public.monitorias WHERE id=$1', [id(32)]))).rows.length, 0,
      'Cliente Final management does not inherit the WebPosto root backlog');
    assert.equal((await db.query('SELECT primary_team_id FROM public.users WHERE id=$1', [id(3)])).rows[0].primary_team_id, id(11),
      'an existing CLT agent stays in WebPosto until an explicit management choice');
    assert.deepEqual((await db.query('SELECT id,primary_team_id FROM public.users WHERE id IN ($1,$2) ORDER BY id',
      [finalRosterUser, revendaRosterUser])).rows.map(row => row.primary_team_id), [revendaId, finalId],
      'Zendesk evidence moves CLT agents to the management division');
    assert.deepEqual((await db.query('SELECT user_id,team_id FROM public.user_teams WHERE user_id IN ($1,$2) ORDER BY user_id',
      [finalRosterUser, revendaRosterUser])).rows.map(row => row.team_id), [revendaId, finalId],
      'moved agents no longer retain broad WebPosto membership');
    assert.equal((await db.query('SELECT primary_team_id FROM public.users WHERE id=$1', [escalaRosterUser])).rows[0].primary_team_id, escalaId);
    assert.equal((await db.query('SELECT primary_team_id FROM public.users WHERE id=$1', [pjFieldRosterUser])).rows[0].primary_team_id, id(10),
      'the Zendesk PJ field takes precedence over ticket-group membership');

    await db.query('UPDATE public.teams SET approval_manager_id=$1 WHERE id=$2', [id(1), id(10)]);
    await db.query('UPDATE public.users SET primary_team_id=$1 WHERE id=$2', [id(10), id(5)]);
    await db.query(`INSERT INTO public.monitorias
      (id,form_id,evaluated_id,evaluator_id,team_id,score,question_observations,form_snapshot,applied_config)
      VALUES ($1,$2,$3,$4,$5,60,'{}','{}','{}')`,
      [id(36), id(20), id(5), id(6), id(10)]);
    await assert.rejects(asUser(9, () => db.query('SELECT public.act_on_monitoria_as_support_manager($1,$2,$3,$4)',
      [id(36), 'aceitar', 'Tentativa de outro gestor', []])), /outro gestor designado/i);
    await asUser(1, () => db.query('SELECT public.act_on_monitoria_as_support_manager($1,$2,$3,$4)',
      [id(36), 'aceitar', 'Parecer do gestor designado', []]));
    assert.equal((await asUser(2, () => db.query('SELECT id FROM public.vw_monitorias_pj_reviewer WHERE id=$1', [id(36)]))).rows.length, 1);
    assert.equal((await asUser(2, () => db.query('SELECT id FROM public.monitorias WHERE id=$1', [id(36)]))).rows.length, 0,
      'reviewer view does not grant direct base-table access to PJ monitorias');
    await asUser(2, () => db.query('SELECT public.review_pj_monitoria($1,$2,$3)',
      [id(36), 'rejected', 'Discordo do parecer PJ']));
    assert.equal((await db.query('SELECT status FROM public.monitorias WHERE id=$1', [id(36)])).rows[0].status,
      'aguardando_gestor_qualidade');
  } finally {
    await db.close();
  }
});
