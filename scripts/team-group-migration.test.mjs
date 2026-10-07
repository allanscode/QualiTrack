import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { buildFreshSql, discoverFreshMigrations } from './prepare-supabase.mjs';

const id = n => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const migrationName = '20261002000003_split_imported_zendesk_groups.sql';

test('imported Zendesk groups become children of management teams', async () => {
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
    const split = migrations.find(migration => migration.name === migrationName);
    assert.ok(split, 'the data migration is in the deployment chain');
    for (const migration of migrations.filter(item => item.name < migrationName)) {
      await db.exec(migration.sql.replace(/^CREATE EXTENSION IF NOT EXISTS pg_(?:cron|net).*;\s*$/gm, ''));
    }

    const importedNames = [
      'Grupo Bruno', 'Grupo Duarte', 'Grupo SumWise', 'Grupo Trindade',
      'Grupo WebPosto', 'Cliente Final', 'Revenda', 'Fiscal', 'Contábil',
      'Mais Pagamentos - Geral', 'Qualidade',
      ...Array.from({ length: 53 }, (_, index) => `Zendesk adicional ${index + 1}`),
    ];
    assert.equal(importedNames.length, 64);
    for (const [index, name] of importedNames.entries()) {
      await db.query('INSERT INTO public.teams (id,name,kind,active) VALUES ($1,$2,$3,$4)',
        [id(100 + index), name, 'team', true]);
    }
    await db.query('INSERT INTO public.teams (id,name,kind,active) VALUES ($1,$2,$3,$4)',
      [id(200), 'Equipe Alpha', 'team', false]);
    await db.query('INSERT INTO public.teams (id,name,kind,active) VALUES ($1,$2,$3,$4)',
      [id(201), 'Equipe Beta', 'team', false]);

    const oldGroupId = name => id(100 + importedNames.indexOf(name));
    const people = [
      [1, 'Ana Karolina', 'gestor_suporte', 'Cliente Final'],
      [2, 'Agente WebPosto', 'suporte', 'Cliente Final'],
      [3, 'Bruno Araujo', 'gestor_suporte', 'Grupo Bruno'],
      [4, 'Agente PJ', 'suporte', 'Grupo Bruno'],
      [5, 'Margareth', 'gestor_suporte', 'Fiscal'],
      [6, 'Agente Fiscal', 'suporte', 'Fiscal'],
      [7, 'Maria Cicera', 'gestor_suporte', 'Contábil'],
      [8, 'Agente Pagamentos', 'suporte', 'Mais Pagamentos - Geral'],
      [9, 'Monitor Qualidade', 'qualidade', 'Qualidade'],
    ];
    for (const [number, name, role, group] of people) {
      await db.query('INSERT INTO public.users (id,email,name,role,active,primary_team_id) VALUES ($1,$2,$3,$4,true,$5)',
        [id(number), `person${number}@example.invalid`, name, role, oldGroupId(group)]);
      await db.query('INSERT INTO public.user_teams (user_id,team_id) VALUES ($1,$2)',
        [id(number), oldGroupId(group)]);
    }
    await db.query('INSERT INTO public.forms (id,title,team_id) VALUES ($1,$2,$3)',
      [id(300), 'Ficha Cliente Final', oldGroupId('Cliente Final')]);
    await db.query('INSERT INTO public.form_teams (form_id,team_id) VALUES ($1,$2)',
      [id(300), oldGroupId('Cliente Final')]);
    await db.query(`INSERT INTO public.monitorias
      (id,form_id,evaluated_id,team_id,score,question_observations,form_snapshot,applied_config)
      VALUES ($1,$2,$3,$4,80,'{}','{}','{}')`,
      [id(400), id(300), id(2), oldGroupId('Cliente Final')]);
    await db.query('INSERT INTO public.ai_evaluation_drafts (ticket_id,agent_id,team_id,result) VALUES ($1,$2,$3,$4)',
      ['ticket-401', id(2), oldGroupId('Cliente Final'), { summary: 'Draft' }]);

    await db.exec(split.sql);

    const management = (await db.query("SELECT id,name FROM public.teams WHERE kind='team' AND active")).rows;
    assert.deepEqual(management.map(team => team.name).sort(),
      ['PJ Bruno', 'PJ Duarte', 'PJ SumWise', 'PJ Trindade', 'WebPosto', 'Fiscal', 'Contábil', 'Mais Pagamentos'].sort());
    assert.equal((await db.query("SELECT count(*)::int AS n FROM public.teams WHERE kind='group'")).rows[0].n, 63);
    const webId = management.find(team => team.name === 'WebPosto').id;
    assert.equal(webId, oldGroupId('Grupo WebPosto'), 'WebPosto retains its existing team ID');
    const pjId = management.find(team => team.name === 'PJ Bruno').id;
    const fiscalId = management.find(team => team.name === 'Fiscal').id;
    const pagamentosId = management.find(team => team.name === 'Mais Pagamentos').id;
    const children = (await db.query('SELECT name,parent_team_id FROM public.teams WHERE parent_team_id IS NOT NULL ORDER BY name')).rows;
    assert.deepEqual(children.map(team => team.name), ['Contábil', 'Fiscal', 'Mais Pagamentos']);
    assert.ok(children.every(team => team.parent_team_id === webId));
    assert.equal((await db.query('SELECT parent_team_id FROM public.teams WHERE id=$1', [pjId])).rows[0].parent_team_id, null);
    assert.equal((await db.query('SELECT primary_team_id FROM public.users WHERE id=$1', [id(1)])).rows[0].primary_team_id, webId);
    assert.equal((await db.query('SELECT primary_team_id FROM public.users WHERE id=$1', [id(4)])).rows[0].primary_team_id, pjId);
    assert.equal((await db.query('SELECT primary_team_id FROM public.users WHERE id=$1', [id(6)])).rows[0].primary_team_id, fiscalId);
    assert.equal((await db.query('SELECT primary_team_id FROM public.users WHERE id=$1', [id(8)])).rows[0].primary_team_id, pagamentosId);
    assert.equal((await db.query('SELECT primary_team_id FROM public.users WHERE id=$1', [id(9)])).rows[0].primary_team_id, null);
    const evaluation = (await db.query('SELECT team_id,ticket_group_team_id FROM public.monitorias WHERE id=$1', [id(400)])).rows[0];
    assert.equal(evaluation.team_id, webId);
    assert.equal(evaluation.ticket_group_team_id, oldGroupId('Cliente Final'));
    assert.equal((await db.query('SELECT team_id FROM public.ai_evaluation_drafts WHERE ticket_id=$1', ['ticket-401'])).rows[0].team_id, webId);
    const clientFinalLinks = (await db.query('SELECT team_id FROM public.team_groups WHERE group_id=$1', [oldGroupId('Cliente Final')])).rows;
    assert.equal(clientFinalLinks.length, 5);
    const genericLinks = (await db.query('SELECT team_id FROM public.team_groups WHERE group_id=$1', [oldGroupId('Zendesk adicional 1')])).rows;
    assert.deepEqual(genericLinks.map(link => link.team_id), [webId]);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM public.teams g WHERE g.kind='group' AND NOT EXISTS (SELECT 1 FROM public.team_groups tg WHERE tg.group_id=g.id)")).rows[0].n, 0);
    const formLinks = (await db.query('SELECT team_id FROM public.form_teams WHERE form_id=$1', [id(300)])).rows;
    assert.equal(formLinks.length, 5);
    assert.equal((await db.query('SELECT team_id FROM public.forms WHERE id=$1', [id(300)])).rows[0].team_id, webId);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.user_teams ut JOIN public.teams t ON t.id=ut.team_id WHERE t.kind=$1', ['group'])).rows[0].n, 0);
    await assert.rejects(db.query('UPDATE public.teams SET parent_team_id=$1 WHERE id=$2',
      [oldGroupId('Cliente Final'), pjId]), /equipe superior/);
    const visibleEvaluations = async number => {
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id(number)]);
      await db.exec('SET ROLE authenticated');
      try {
        return (await db.query('SELECT id FROM public.monitorias WHERE id=$1', [id(400)])).rows.length;
      } finally {
        await db.exec('RESET ROLE');
      }
    };
    assert.equal(await visibleEvaluations(1), 1, 'WebPosto manager sees own agent');
    assert.equal(await visibleEvaluations(3), 0, 'PJ manager does not see CLT agent through shared group');
  } finally {
    await db.close();
  }
});
