import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const readMigration = name => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const boundarySchema = `
      CREATE ROLE authenticated;
      CREATE ROLE anon;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE TABLE public.users (id uuid PRIMARY KEY, name text, role text, active boolean, is_provisional boolean DEFAULT false);
      CREATE TABLE public.user_teams (user_id uuid, team_id uuid);
      CREATE TABLE public.quality_configs (config jsonb, active boolean, updated_at timestamptz);
      CREATE TABLE public.monitorias (
        id uuid PRIMARY KEY, form_id uuid, evaluated_id uuid, evaluated_name text,
        team_id uuid, team_name text, form_name text, ticket_id text,
        channel text, ticket_date date, analysis_date date,
        satisfaction_result text, satisfaction_has_record boolean, satisfaction_record_text text,
        answers jsonb, score numeric, status text, resolution_type text, contestation_result text,
        action_deadline_at timestamptz, active boolean DEFAULT true, history jsonb DEFAULT '[]'::jsonb,
        dissatisfaction_answers jsonb, created_at timestamptz, updated_at timestamptz,
        evaluator_note text, question_observations jsonb, critical_error_observations jsonb,
        selected_critical_errors text[], client_contact_log text, client_contact_success boolean,
        client_contact_channel text[], form_snapshot jsonb, contestation_reason text,
        evaluator_id uuid, evaluator_name text
      );
      CREATE FUNCTION public.calculate_action_deadline(timestamptz, numeric)
        RETURNS timestamptz LANGUAGE sql AS $$ SELECT $1 + interval '1 day' $$;
      ALTER TABLE public.monitorias ENABLE ROW LEVEL SECURITY;
      GRANT ALL ON public.users, public.user_teams, public.monitorias, public.quality_configs TO authenticated;
      GRANT USAGE ON SCHEMA auth TO authenticated;
`;

test('support cannot read auditor identity or mutate evaluation fields through direct SQL', async () => {
  const db = new PGlite();
  try {
    await db.exec(boundarySchema);
    await db.exec(await readMigration('20260922000019_anonymous_support_boundary.sql'));
    await db.exec(await readMigration('20260922000022_support_manager_actions_rpc.sql'));
    await db.query('INSERT INTO public.users(id,name,role,active) VALUES($1,$2,$3,$4)', [uid(1), 'Agent', 'suporte', true]);
    await db.query('INSERT INTO public.users(id,name,role,active) VALUES($1,$2,$3,$4)', [uid(2), 'Auditor', 'qualidade', true]);
    await db.query(`INSERT INTO public.monitorias(id,evaluated_id,evaluator_id,evaluator_name,status,active,score)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [uid(10), uid(1), uid(2), 'Auditor', 'contestacao_negada', true, 90]);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [uid(1)]);
    await db.exec('SET ROLE authenticated');
    const direct = await db.query('SELECT evaluator_name FROM public.monitorias');
    assert.equal(direct.rows.length, 0);
    const masked = await db.query('SELECT evaluator_name, evaluator_id FROM public.vw_monitorias_suporte');
    assert.deepEqual(masked.rows, [{ evaluator_name: null, evaluator_id: null }]);
    const forged = await db.query(`UPDATE public.monitorias SET score=0 WHERE id=$1 RETURNING id`, [uid(10)]);
    assert.equal(forged.rows.length, 0);
    await db.query('SELECT public.appeal_monitoria($1,$2)', [uid(10), 'Peço nova revisão.']);
    await db.exec('RESET ROLE');
    const updated = await db.query('SELECT status,score,history FROM public.monitorias WHERE id=$1', [uid(10)]);
    assert.equal(updated.rows[0].status, 'aguardando_gestor_suporte');
    assert.equal(updated.rows[0].score, '90');
    assert.equal(updated.rows[0].history.length, 1);

    await db.query('INSERT INTO public.users(id,name,role,active) VALUES($1,$2,$3,$4)', [uid(3), 'Manager', 'gestor_suporte', true]);
    await db.query('INSERT INTO public.user_teams(user_id,team_id) VALUES($1,$2)', [uid(3), uid(20)]);
    await db.query(`INSERT INTO public.monitorias(id,evaluated_id,evaluator_id,evaluator_name,team_id,status,active,score)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [uid(11), uid(1), uid(2), 'Auditor', uid(20), 'pendente_revisao', true, 95]);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [uid(3)]);
    await db.exec('SET ROLE authenticated');
    const managerForgery = await db.query('UPDATE public.monitorias SET score=0 WHERE id=$1 RETURNING id', [uid(11)]);
    assert.equal(managerForgery.rows.length, 0);
    await db.query('SELECT public.act_on_monitoria_as_support_manager($1,$2,$3)', [uid(11), 'contestar', 'Motivo real.']);
    await db.exec('RESET ROLE');
    const managerResult = await db.query('SELECT status,score,history FROM public.monitorias WHERE id=$1', [uid(11)]);
    assert.equal(managerResult.rows[0].status, 'em_contestacao');
    assert.equal(managerResult.rows[0].score, '95');
    assert.equal(managerResult.rows[0].history.length, 1);
  } finally { await db.close(); }
});

test('WQ-22: attachment authorization, anonymous support boundary and manager actions', async t => {
  const db = new PGlite();
  const path = (monitoria, file = '123-evidence.pdf') => `monitorias/${uid(monitoria)}/${file}`;
  const asUser = async (n, run) => {
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [n ? uid(n) : '']);
    await db.exec(`SET ROLE ${n ? 'authenticated' : 'anon'}`);
    try { return await run(); } finally {
      await db.exec('RESET ROLE');
      await db.query("SELECT set_config('request.jwt.claim.sub','',false)");
    }
  };
  const upload = (n, target, file) => asUser(n, () => db.query(
    "INSERT INTO storage.objects(bucket_id,name) VALUES ('monitoria-attachments',$1)", [path(target, file)]));
  const readObjects = n => asUser(n, () => db.query(
    "SELECT name FROM storage.objects WHERE bucket_id='monitoria-attachments' ORDER BY name"));
  const act = (n, target, action, note = 'Ação documentada', attachments = []) => asUser(n, () => db.query(
    'SELECT public.act_on_monitoria_as_support_manager($1,$2,$3,$4)', [uid(target), action, note, attachments]));
  try {
    await db.exec(boundarySchema);
    await db.exec(`CREATE SCHEMA storage;
      CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text, UNIQUE(bucket_id,name));
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA auth,storage TO anon,authenticated;
      GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated;
    `);
    for (const file of ['20260922000019_anonymous_support_boundary.sql', '20260922000022_support_manager_actions_rpc.sql',
      '20260925000001_wq22_support_manager_actions_attachments.sql']) await db.exec(await readMigration(file));
    await db.exec(`CREATE TRIGGER trg_monitoria_update_integrity BEFORE UPDATE ON public.monitorias
      FOR EACH ROW EXECUTE FUNCTION public.enforce_monitoria_update_integrity();`);
    for (const [n, role, active] of [[1,'suporte',true], [2,'qualidade',true], [3,'gestor_suporte',true],
      [4,'suporte',true], [5,'gestor_suporte',true], [6,'qualidade',true], [7,'admin',true],
      [8,'gestor_qualidade',true], [9,'gestor_suporte',false], [10,'suporte',true]]) {
      await db.query('INSERT INTO users(id,name,role,active) VALUES($1,$2,$3,$4)', [uid(n), `User ${n}`, role, active]);
    }
    await db.exec(`INSERT INTO user_teams VALUES ('${uid(3)}','${uid(100)}'),('${uid(1)}','${uid(100)}'),
      ('${uid(10)}','${uid(100)}'),('${uid(9)}','${uid(100)}'),('${uid(5)}','${uid(200)}');`);
    for (const [n, evaluated, team, score, status] of [[101,1,100,60,'pendente_revisao'], [102,4,200,60,'pendente_revisao'],
      [103,10,100,60,'pendente_revisao'], [104,1,100,75,'pendente_revisao'], [105,1,100,90,'pendente_revisao'],
      [106,1,100,null,'pendente_revisao'], [107,1,100,74.99,'pendente_revisao'],
      [108,1,100,50,'aguardando_gestor_suporte'], [109,1,100,50,'aguardando_gestor_suporte'],
      [110,1,100,50,'concluida'], [111,1,100,50,'pendente_revisao']]) {
      await db.query(`INSERT INTO monitorias(id,evaluated_id,evaluator_id,evaluator_name,team_id,score,status,history)
        VALUES($1,$2,$3,'Secret auditor',$4,$5,$6,$7)`,
      [uid(n),uid(evaluated),uid(2),uid(team),score,status,[{action:'Created',by_id:uid(2),by_name:'Secret auditor'}]]);
    }
    await db.exec(`UPDATE monitorias SET active=false WHERE id='${uid(111)}'`);
    await t.test('reproduces original cross-team upload/read and positive-score contestation', async () => {
      await upload(1,102,'legacy.pdf');
      assert.equal((await readObjects(3)).rows.length,1);
      await act(3,105,'contestar');
      assert.equal((await db.query('SELECT status FROM monitorias WHERE id=$1',[uid(105)])).rows[0].status,'em_contestacao');
      await db.query("UPDATE monitorias SET status='pendente_revisao',history='[]' WHERE id=$1",[uid(105)]);
    });
    await db.exec(await readMigration('20260925000002_wq22_attachment_authorization.sql'));
    await t.test('reapplying corrective migration is safe', async () => {
      await db.exec(await readMigration('20260925000002_wq22_attachment_authorization.sql'));
    });
    await t.test('valid uploads/download reads follow role, owner and team; other users cannot list or guess paths', async () => {
      await upload(3,101);
      await upload(3,103);
      for (const n of [1,3,2,7,8]) {
        const objects = (await readObjects(n)).rows.map(row => row.name);
        assert.ok(objects.includes(path(101)), `legitimate reader ${n}`);
      }
      for (const n of [4,5,6,9,10,0]) {
        assert.equal((await asUser(n, () => db.query('SELECT name FROM storage.objects WHERE name=$1',[path(101)]))).rows.length,0, `blocked reader ${n}`);
      }
      assert.deepEqual((await readObjects(1)).rows.map(row=>row.name),[path(101)]);
      assert.deepEqual((await readObjects(10)).rows.map(row=>row.name),[path(103)]);
      for (const n of [1,4,5,6,7,8,9,0]) await assert.rejects(upload(n,101,`denied-${n}.pdf`), /row-level security/);
      for (const target of [102,104,105,106,110,111,999]) await assert.rejects(upload(3,target), /row-level security/);
      for (const invalid of ['invalid',`monitorias/not-a-uuid/a.pdf`,`${path(101)}/nested`, `monitorias/${uid(101)}/..`]) {
        await assert.rejects(asUser(3,()=>db.query("INSERT INTO storage.objects(bucket_id,name) VALUES ('monitoria-attachments',$1)",[invalid])), /row-level security/);
      }
    });
    await t.test('guard policies resist broad permissive policies without changing other buckets', async () => {
      await db.exec(`CREATE POLICY unexpected_legacy_grant ON storage.objects FOR ALL TO authenticated,anon USING(true) WITH CHECK(true);
        INSERT INTO storage.buckets(id,name,public) VALUES ('unrelated','unrelated',false);`);
      assert.equal((await asUser(5,()=>db.query('SELECT name FROM storage.objects WHERE name=$1',[path(101)]))).rows.length,0);
      assert.equal((await readObjects(0)).rows.length,0);
      await assert.rejects(upload(5,101,'bypass.pdf'), /row-level security/);
      await assert.rejects(upload(0,101,'bypass-anon.pdf'), /row-level security/);
      assert.equal((await asUser(3,()=>db.query('DELETE FROM storage.objects WHERE name=$1 RETURNING id',[path(101)]))).rows.length,0);
      assert.equal((await asUser(3,()=>db.query("UPDATE storage.objects SET name='changed' WHERE name=$1 RETURNING id",[path(101)]))).rows.length,0);
      await asUser(3,()=>db.exec("INSERT INTO storage.objects(bucket_id,name) VALUES ('unrelated','ok.pdf')"));
      await assert.rejects(asUser(3,()=>db.query("UPDATE storage.objects SET bucket_id='monitoria-attachments',name=$1 WHERE bucket_id='unrelated'",[path(101,'moved.pdf')])), /row-level security/);
      await db.exec('DROP POLICY unexpected_legacy_grant ON storage.objects');
    });
    await t.test('masked definer view keeps direct table closed, masks history and denies cross-user/inactive reads', async () => {
      const options = (await db.query("SELECT reloptions FROM pg_class WHERE oid='public.vw_monitorias_suporte'::regclass")).rows[0].reloptions;
      assert.ok(options.includes('security_invoker=false')); // deliberate boundary from 20260922000019
      assert.ok(options.includes('security_barrier=true'));
      assert.equal((await asUser(1,()=>db.query('SELECT * FROM monitorias'))).rows.length,0);
      const rows = (await asUser(1,()=>db.query('SELECT * FROM vw_monitorias_suporte'))).rows;
      assert.ok(rows.length > 0);
      assert.ok(rows.every(row => row.evaluated_id === uid(1) && row.evaluator_id === null && row.evaluator_name === null));
      assert.ok(!JSON.stringify(rows).includes('Secret auditor'));
      assert.ok(!JSON.stringify(rows).includes(uid(2)));
      assert.equal((await asUser(10,()=>db.query('SELECT id FROM vw_monitorias_suporte WHERE id=$1',[uid(101)]))).rows.length,0);
      await db.query('UPDATE users SET active=false WHERE id=$1',[uid(1)]);
      assert.equal((await asUser(1,()=>db.query('SELECT * FROM vw_monitorias_suporte'))).rows.length,0);
      assert.equal((await readObjects(1)).rows.length,0);
      await db.query('UPDATE users SET active=true WHERE id=$1',[uid(1)]);
    });
    await t.test('RPC rejects positive/null scores, wrong team/role, forged attachments and empty notes atomically', async () => {
      for (const target of [104,105,106]) for (const action of ['aceitar','aprovar','contestar']) {
        await assert.rejects(act(3,target,action), /inferior a 75/);
      }
      for (const n of [1,2,7,8,9]) await assert.rejects(act(n,101,'aprovar'), /Apenas gestor/);
      await assert.rejects(act(5,101,'aprovar'), /indispon/);
      await assert.rejects(act(3,111,'aprovar'), /indispon/);
      await assert.rejects(act(3,110,'aprovar'), /Transi/);
      await assert.rejects(act(3,101,'aprovar',' '), /obrigat/);
      await assert.rejects(act(3,101,'contestar',' '), /obrigat/);
      for (const attachments of [[{path:path(102,'legacy.pdf')}],[{path:path(101,'missing.pdf')}],
        [{path:path(101),url:'https://example.invalid'}],[{}],{},null]) {
        await assert.rejects(act(3,101,'aprovar','Plano',attachments), /Anexo/);
      }
      const row = (await db.query('SELECT status,corrective_action,action_attachments FROM monitorias WHERE id=$1',[uid(101)])).rows[0];
      assert.deepEqual(row,{status:'pendente_revisao',corrective_action:null,action_attachments:[]});
    });
    await t.test('RPC succeeds with real attachments and trigger active; download survives conclusion', async () => {
      const attachment = {name:'evidence.pdf',path:path(101),size:123,mime_type:'application/pdf',uploaded_at:new Date().toISOString()};
      await act(3,101,'aprovar','Plano corretivo',[attachment]);
      const row = (await db.query('SELECT * FROM monitorias WHERE id=$1',[uid(101)])).rows[0];
      assert.equal(row.status,'concluida');
      assert.equal(row.corrective_action,'Plano corretivo');
      assert.equal(row.resolution_type,'human');
      assert.equal(row.action_deadline_at,null);
      assert.deepEqual(row.action_attachments,[attachment]);
      assert.deepEqual(row.history.at(-1).attachments,[attachment]);
      assert.ok((await readObjects(1)).rows.some(row=>row.name===path(101)));
      await assert.rejects(upload(3,101,'late.pdf'), /row-level security/);
      await act(3,107,'aceitar');
      await act(3,108,'contestar');
      await act(3,109,'escalar');
      assert.deepEqual((await db.query('SELECT status FROM monitorias WHERE id IN ($1,$2,$3) ORDER BY id',[uid(107),uid(108),uid(109)])).rows,
        [{status:'concluida'},{status:'em_contestacao'},{status:'aguardando_gestor_qualidade'}]);
      assert.equal((await asUser(3,()=>db.query('UPDATE monitorias SET score=0 WHERE id=$1 RETURNING id',[uid(101)]))).rows.length,0);
      await db.query('DELETE FROM user_teams WHERE user_id=$1',[uid(3)]);
      assert.equal((await readObjects(3)).rows.length,0);
    });
  } finally { await db.close(); }
});
