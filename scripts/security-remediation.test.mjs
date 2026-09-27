import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('../', import.meta.url);
const migration = name => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const uid = n => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('security remediation migrations enforce feedback boundaries and publication claims', async t => {
  const db = new PGlite();
  try {
    // Minimal Supabase Auth roles and application rows required by the real SQL.
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE SCHEMA _private;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      CREATE TABLE public.users(id uuid PRIMARY KEY, role text NOT NULL, active boolean NOT NULL DEFAULT true);
      CREATE TABLE public.teams(id uuid PRIMARY KEY);
      CREATE TABLE public.user_teams(user_id uuid NOT NULL REFERENCES public.users(id), team_id uuid NOT NULL REFERENCES public.teams(id), PRIMARY KEY(user_id,team_id));
      CREATE TABLE public.monitorias(
        id uuid PRIMARY KEY, active boolean NOT NULL DEFAULT true, evaluator_id uuid,
        evaluated_id uuid, team_id uuid
      );
      CREATE TABLE public.helpdesk_submissions(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), monitoria_id uuid NOT NULL REFERENCES public.monitorias(id),
        provider text NOT NULL, external_ticket_id text, outcome text, status text NOT NULL,
        external_comment_id text, error_message text, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
      );
      GRANT USAGE ON SCHEMA public, auth, _private TO anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
      GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
    `);

    // Seed synthetic identities and relationships, then apply the actual helpers
    // and feedback/helpdesk migrations under test (policies are never re-created here).
    const seedUsers = [
      [1, 'admin', true], [2, 'suporte', true], [3, 'gestor_suporte', true],
      [4, 'gestor_qualidade', true], [5, 'suporte', true], [6, 'gestor_suporte', true],
      [7, 'suporte', false], [8, 'qualidade', true], [9, 'qualidade', false],
    ];
    for (const [n, role, active] of seedUsers) {
      await db.query('INSERT INTO public.users(id,role,active) VALUES ($1,$2,$3)', [uid(n), role, active]);
    }
    await db.query('INSERT INTO public.teams(id) VALUES ($1),($2)', [uid(20), uid(21)]);
    await db.query('INSERT INTO public.user_teams(user_id,team_id) VALUES ($1,$2),($3,$2),($4,$5),($6,$5)',
      [uid(2), uid(20), uid(3), uid(5), uid(21), uid(6)]);
    await db.query('INSERT INTO public.monitorias(id,active,evaluator_id,evaluated_id,team_id) VALUES ($1,true,$2,$3,$4),($5,true,$10,$6,$7),($8,true,$2,$3,$7),($9,false,$2,$3,$4)',
      [uid(30), uid(8), uid(2), uid(20), uid(31), uid(5), uid(21), uid(32), uid(33), uid(4)]);

    const helperSql = await migration('20260922000017_active_private_role_helpers.sql');
    const feedbackCreate = await migration('20260926000001_create_agent_feedbacks.sql');
    const feedbackHardening = await migration('20260926000002_harden_feedbacks_security.sql');
    const feedbackBoundaries = await migration('20260927000001_feedback_boundaries.sql');
    const helpdeskClaims = await migration('20260927000002_helpdesk_publish_claims.sql');
    for (const sql of [helperSql, feedbackCreate, feedbackHardening, feedbackBoundaries, helpdeskClaims]) await db.exec(sql);

    const as = async (role, n, run) => {
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [n == null ? '' : uid(n)]);
      await db.exec(`SET ROLE ${role}`);
      try { return await run(); } finally { await db.exec('RESET ROLE'); }
    };
    const authenticated = (n, run) => as('authenticated', n, run);
    const service = run => as('service_role', null, run);
    const createFeedback = async ({ caller, agent, manager, team, monitoria, status = 'pendente_ciencia', acknowledged = null }) => {
      const result = await authenticated(caller, () => db.query(
        `INSERT INTO public.agent_feedbacks(agent_id,manager_id,team_id,monitoria_id,title,improvements,action_plan,status,agent_acknowledged_at)
         VALUES ($1,$2,$3,$4,'Alinhamento','Melhorar qualidade','Praticar roteiro',$5,$6) RETURNING id`,
        [uid(agent), uid(manager), team == null ? null : uid(team), monitoria == null ? null : uid(monitoria), status, acknowledged],
      ));
      return result.rows[0].id;
    };

    await t.test('S01-S03: INSERT authority, active users, team scope, null-team reads, and no direct mutations', async () => {
      const feedbackId = await createFeedback({ caller: 3, agent: 2, manager: 3, team: 20, monitoria: 30 });
      const nullTeamId = await createFeedback({ caller: 1, agent: 2, manager: 1, team: null, monitoria: null });
      const otherTeamId = await createFeedback({ caller: 6, agent: 5, manager: 6, team: 21, monitoria: 31 });

      assert.equal((await authenticated(2, () => db.query('SELECT id FROM public.agent_feedbacks WHERE id=$1', [feedbackId]))).rows.length, 1);
      assert.equal((await authenticated(5, () => db.query('SELECT id FROM public.agent_feedbacks WHERE id=$1', [feedbackId]))).rows.length, 0);
      assert.equal((await authenticated(3, () => db.query('SELECT id FROM public.agent_feedbacks WHERE id=$1', [feedbackId]))).rows.length, 1);
      assert.equal((await authenticated(6, () => db.query('SELECT id FROM public.agent_feedbacks WHERE id=$1', [feedbackId]))).rows.length, 0);
      assert.equal((await authenticated(3, () => db.query('SELECT id FROM public.agent_feedbacks WHERE id=$1', [nullTeamId]))).rows.length, 0);
      assert.equal((await authenticated(6, () => db.query('SELECT id FROM public.agent_feedbacks WHERE id=$1', [nullTeamId]))).rows.length, 0);
      assert.equal((await authenticated(4, () => db.query('SELECT id FROM public.agent_feedbacks WHERE id=$1', [nullTeamId]))).rows.length, 1);

      await assert.rejects(createFeedback({ caller: 3, agent: 2, manager: 6, team: 20, monitoria: 30 }), /autoria|manager|feedback/i);
      await assert.rejects(createFeedback({ caller: 3, agent: 5, manager: 3, team: 20, monitoria: 31 }), /equipe|pertence|escopo/i);
      await assert.rejects(createFeedback({ caller: 3, agent: 2, manager: 3, team: 20, monitoria: 31 }), /monitoria|incompatível/i);
      await assert.rejects(createFeedback({ caller: 3, agent: 2, manager: 3, team: 20, monitoria: 30, status: 'ciente', acknowledged: new Date().toISOString() }), /iniciar|ciência/i);
      await assert.rejects(createFeedback({ caller: 7, agent: 2, manager: 7, team: 20, monitoria: 30 }), /permission denied|autoria|inativa|ativo|row-level security/i);
      await assert.rejects(createFeedback({ caller: 6, agent: 2, manager: 6, team: 20, monitoria: 30 }), /equipe|escopo|row-level security/i);

      await assert.rejects(authenticated(2, () => db.exec(`UPDATE public.agent_feedbacks SET status='concluido' WHERE id='${feedbackId}'`)), /permission denied/i);
      await assert.rejects(authenticated(3, () => db.exec(`DELETE FROM public.agent_feedbacks WHERE id='${feedbackId}'`)), /permission denied/i);
      await assert.rejects(authenticated(1, () => db.exec('TRUNCATE public.agent_feedbacks')), /permission denied/i);
      assert.equal((await authenticated(7, () => db.query('SELECT id FROM public.agent_feedbacks'))).rows.length, 0);
      assert.equal((await authenticated(3, () => db.query('SELECT id FROM public.agent_feedbacks WHERE id=$1', [otherTeamId]))).rows.length, 0);
    });

    await t.test('digital acknowledgement is titular-only, server-timestamped, and immutable; completion is scoped', async () => {
      const feedbackId = await createFeedback({ caller: 3, agent: 2, manager: 3, team: 20, monitoria: 30 });
      await assert.rejects(authenticated(3, () => db.query('SELECT * FROM public.acknowledge_agent_feedback($1,$2)', [feedbackId, 'manager forged'])), /atendente|titular/i);
      await assert.rejects(authenticated(5, () => db.query('SELECT * FROM public.acknowledge_agent_feedback($1,$2)', [feedbackId, 'wrong person'])), /indisponível|titular/i);
      await assert.rejects(authenticated(3, () => db.query('SELECT * FROM public.complete_agent_feedback($1)', [feedbackId])), /ciência|indisponível/i);

      const ack = await authenticated(2, () => db.query('SELECT * FROM public.acknowledge_agent_feedback($1,$2)', [feedbackId, 'Li e entendi.']));
      assert.equal(ack.rows[0].status, 'ciente');
      assert.ok(ack.rows[0].agent_acknowledged_at);
      assert.equal(ack.rows[0].agent_notes, 'Li e entendi.');
      await assert.rejects(authenticated(2, () => db.query('SELECT * FROM public.acknowledge_agent_feedback($1,$2)', [feedbackId, 'segunda ciência'])), /indisponível|confirmado/i);
      await assert.rejects(authenticated(6, () => db.query('SELECT * FROM public.complete_agent_feedback($1)', [feedbackId])), /indisponível|escopo/i);

      const completed = await authenticated(3, () => db.query('SELECT * FROM public.complete_agent_feedback($1)', [feedbackId]));
      assert.equal(completed.rows[0].status, 'concluido');
      assert.ok(completed.rows[0].completed_at);

      const adminFeedback = await createFeedback({ caller: 1, agent: 2, manager: 1, team: 20, monitoria: 30 });
      await authenticated(2, () => db.query('SELECT * FROM public.acknowledge_agent_feedback($1,NULL)', [adminFeedback]));
      assert.equal((await authenticated(1, () => db.query('SELECT status FROM public.complete_agent_feedback($1)', [adminFeedback]))).rows[0].status, 'concluido');

      const qualityFeedback = await createFeedback({ caller: 4, agent: 2, manager: 4, team: 20, monitoria: 30 });
      await authenticated(2, () => db.query('SELECT * FROM public.acknowledge_agent_feedback($1,NULL)', [qualityFeedback]));
      assert.equal((await authenticated(4, () => db.query('SELECT status FROM public.complete_agent_feedback($1)', [qualityFeedback]))).rows[0].status, 'concluido');

      const inactiveFeedback = await createFeedback({ caller: 3, agent: 2, manager: 3, team: 20, monitoria: 30 });
      await authenticated(2, () => db.query('SELECT * FROM public.acknowledge_agent_feedback($1,NULL)', [inactiveFeedback]));
      await db.query('UPDATE public.users SET active=false WHERE id=$1', [uid(3)]);
      await assert.rejects(authenticated(3, () => db.query('SELECT * FROM public.complete_agent_feedback($1)', [inactiveFeedback])), /permission denied|autorizada|inativa|indisponível/i);
    });

    await t.test('publication claim RPC is service-only and locks one attempt at a time', async () => {
      assert.equal((await db.query("SELECT has_function_privilege('authenticated','public.claim_helpdesk_publication(uuid,uuid,boolean)','EXECUTE') AS allowed")).rows[0].allowed, false);
      assert.equal((await db.query("SELECT has_function_privilege('anon','public.finish_helpdesk_publication(uuid,uuid,text,text,text,text,boolean)','EXECUTE') AS allowed")).rows[0].allowed, false);
      assert.equal((await db.query("SELECT has_function_privilege('service_role','public.claim_helpdesk_publication(uuid,uuid,boolean)','EXECUTE') AS allowed")).rows[0].allowed, true);
      await assert.rejects(authenticated(1, () => db.query('SELECT public.claim_helpdesk_publication($1,$2,false)', [uid(30), uid(1)])), /permission denied/i);
      await assert.rejects(authenticated(1, () => db.query('SELECT count(*) FROM public.helpdesk_publish_claims')), /permission denied/i);
      await assert.rejects(authenticated(1, () => db.exec('TRUNCATE public.helpdesk_publish_claims')), /permission denied/i);

      await assert.rejects(service(() => db.query('SELECT public.claim_helpdesk_publication($1,$2,false)', [uid(30), uid(2)])), /não autorizada/i);
      await assert.rejects(service(() => db.query('SELECT public.claim_helpdesk_publication($1,$2,false)', [uid(30), uid(9)])), /não autorizada/i);
      await assert.rejects(service(() => db.query('SELECT public.claim_helpdesk_publication($1,$2,false)', [uid(31), uid(8)])), /não autorizada/i);

      const claim = (await service(() => db.query('SELECT public.claim_helpdesk_publication($1,$2,false) AS claim', [uid(30), uid(8)]))).rows[0].claim;
      assert.ok(claim);
      await assert.rejects(service(() => db.query('SELECT public.claim_helpdesk_publication($1,$2,true)', [uid(30), uid(8)])), /em andamento|não reenvie/i);
      await assert.rejects(service(() => db.query('SELECT public.finish_helpdesk_publication($1,$2,$3,$4,$5,$6,true)', [uid(30), uid(32), 'T-1', 'zendesk', 'published', 'comment-1'])), /inválida/i);

      await service(() => db.query('SELECT public.finish_helpdesk_publication($1,$2,$3,$4,$5,$6,true)', [uid(30), claim, 'T-1', 'zendesk', 'published', 'comment-1']));
      const sent = await db.query('SELECT state,claim_id FROM public.helpdesk_publish_claims WHERE monitoria_id=$1', [uid(30)]);
      assert.equal(sent.rows[0].state, 'sent');
      assert.equal(sent.rows[0].claim_id, claim);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM public.helpdesk_submissions WHERE monitoria_id=$1 AND status='sent' AND created_by=$2", [uid(30), uid(8)])).rows[0].n, 1);
      assert.equal((await service(() => db.query('SELECT public.claim_helpdesk_publication($1,$2,false) AS claim', [uid(30), uid(8)]))).rows[0].claim, null);

      const forcedClaim = (await service(() => db.query('SELECT public.claim_helpdesk_publication($1,$2,true) AS claim', [uid(30), uid(1)]))).rows[0].claim;
      assert.notEqual(forcedClaim, claim);
      await service(() => db.query('SELECT public.finish_helpdesk_publication($1,$2,$3,$4,$5,$6,false)', [uid(30), forcedClaim, 'T-1', 'zendesk', 'uncertain', null]));
      assert.equal((await db.query('SELECT state FROM public.helpdesk_publish_claims WHERE monitoria_id=$1', [uid(30)])).rows[0].state, 'uncertain');
      assert.equal((await db.query("SELECT count(*)::int AS n FROM public.helpdesk_submissions WHERE monitoria_id=$1 AND status='failed'", [uid(30)])).rows[0].n, 1);
      await assert.rejects(service(() => db.query('SELECT public.claim_helpdesk_publication($1,$2,true)', [uid(30), uid(1)])), /aguardando conferência|não reenvie/i);
      await assert.rejects(service(() => db.query('SELECT public.finish_helpdesk_publication($1,$2,$3,$4,$5,$6,true)', [uid(30), forcedClaim, 'T-1', 'zendesk', 'published', 'comment-2'])), /inválida/i);
    });
  } finally {
    await db.close();
  }
});
