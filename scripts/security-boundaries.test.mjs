import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const readMigration = name => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('support cannot read auditor identity or mutate evaluation fields through direct SQL', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
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
    `);
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
