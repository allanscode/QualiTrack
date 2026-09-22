import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = readFile(
  new URL('../supabase/migrations/20260922000005_authoritative_presence_and_queue_fix.sql', import.meta.url),
  'utf8',
);
const manualAssignmentMigration = readFile(
  new URL('../supabase/migrations/20260922000006_manual_queue_assignment.sql', import.meta.url),
  'utf8',
);
const rebalanceMigration = readFile(
  new URL('../supabase/migrations/20260922000009_rebalance_pending_queue.sql', import.meta.url),
  'utf8',
);
const stableMigration = readFile(
  new URL('../supabase/migrations/20260922000010_stable_queue_and_ai_jobs.sql', import.meta.url),
  'utf8',
);
const serverOwnedMigration = readFile(
  new URL('../supabase/migrations/20260922000011_server_owned_ai_completion.sql', import.meta.url),
  'utf8',
);
const workerOwnedMigration = readFile(
  new URL('../supabase/migrations/20260922000012_ai_worker_owns_running_jobs.sql', import.meta.url),
  'utf8',
);
const aiRetryMigration = readFile(
  new URL('../supabase/migrations/20260922000013_ai_retry_queue.sql', import.meta.url),
  'utf8',
);
const verifiedCatalogMigration = readFile(
  new URL('../supabase/migrations/20260922000018_verified_queue_catalog.sql', import.meta.url), 'utf8');
const aiOwnerMigration = readFile(
  new URL('../supabase/migrations/20260922000020_ai_owner_rls.sql', import.meta.url), 'utf8');
const verifiedClaimMigration = readFile(
  new URL('../supabase/migrations/20260922000021_verified_ai_claim.sql', import.meta.url), 'utf8');
const aiCancellationMigration = readFile(
  new URL('../supabase/migrations/20260922000023_ai_cancellation_and_phase.sql', import.meta.url), 'utf8');
const aiCancellationAckMigration = readFile(
  new URL('../supabase/migrations/20260922000024_ai_cancellation_ack.sql', import.meta.url), 'utf8');
const id = n => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const session = n => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('presença compartilhada e distribuição usam usuários elegíveis realmente online', async t => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role BYPASSRLS;
      CREATE PUBLICATION supabase_realtime;
      CREATE SCHEMA auth;
      CREATE SCHEMA _private;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('role', true) $$;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$
        SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
      $$;
      CREATE TABLE public.users(
        id uuid PRIMARY KEY,
        email text NOT NULL,
        name text NOT NULL,
        role text NOT NULL,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.quality_monitor_presence(
        user_id uuid PRIMARY KEY REFERENCES public.users(id),
        is_online boolean NOT NULL DEFAULT false,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid REFERENCES public.users(id)
      );
      CREATE TABLE public.queue_ticket_assignments(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id text NOT NULL,
        queue_type text NOT NULL,
        assigned_to uuid NOT NULL REFERENCES public.users(id),
        assigned_at timestamptz NOT NULL DEFAULT now(),
        status text NOT NULL DEFAULT 'pending',
        completed_at timestamptz,
        UNIQUE(ticket_id, queue_type)
      );
      CREATE TABLE public.monitorias(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id text NOT NULL,
        evaluator_id uuid NOT NULL REFERENCES public.users(id)
      );
      CREATE TABLE public.ai_evaluation_drafts(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id text NOT NULL UNIQUE,
        form_id uuid,
        agent_name text,
        agent_email text,
        agent_id uuid,
        team_id uuid,
        channel text,
        satisfaction_comment text,
        result jsonb NOT NULL,
        guideline_ids uuid[] DEFAULT '{}',
        created_by uuid REFERENCES public.users(id)
      );
      CREATE FUNCTION _private.is_admin_user() RETURNS boolean
      LANGUAGE sql SECURITY DEFINER SET search_path='public' AS $$
        SELECT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND active AND role IN ('admin','gestor_qualidade'))
      $$;
      CREATE FUNCTION _private.is_quality_team_user() RETURNS boolean
      LANGUAGE sql SECURITY DEFINER SET search_path='public' AS $$
        SELECT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND active AND role IN ('admin','gestor_qualidade','qualidade'))
      $$;
      GRANT USAGE ON SCHEMA public, auth, _private TO authenticated;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
      INSERT INTO public.users(id,email,name,role) VALUES
        ('${id(1)}','admin@example.invalid','Administrador','admin'),
        ('${id(2)}','vinicius@example.invalid','Vinicius','qualidade'),
        ('${id(3)}','gabriel@example.invalid','Gabriel','qualidade'),
        ('${id(4)}','supervisor@example.invalid','Supervisora','gestor_qualidade');
    `);
    await db.exec(await migration);
    await db.exec(await manualAssignmentMigration);
    await db.exec(await rebalanceMigration);
    await db.exec(await stableMigration);
    await db.exec(await serverOwnedMigration);
    await db.exec(await workerOwnedMigration);
    await db.exec(await aiRetryMigration);

    const asSession = async (userId, sessionId, run) => {
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [userId]);
      await db.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: userId, role: 'authenticated', session_id: sessionId })]);
      await db.exec('SET ROLE authenticated');
      try {
        return await run();
      } finally {
        await db.exec('RESET ROLE');
      }
    };
    const heartbeat = (userId, sessionId) => asSession(userId, sessionId, () => db.query('SELECT * FROM heartbeat_user_presence()'));
    const endSession = (userId, sessionId) => asSession(userId, sessionId, () => db.query('SELECT end_current_presence_session()'));

    await t.test('A/B/I: consolida pessoas no backend e deduplica abas/sessões', async () => {
      assert.equal((await heartbeat(id(1), session(1))).rows.length, 1);
      assert.equal((await heartbeat(id(2), session(2))).rows.length, 2);
      assert.equal((await heartbeat(id(2), session(3))).rows.length, 2);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM user_presence_sessions WHERE user_id=$1', [id(2)])).rows[0].n, 2);
      await endSession(id(2), session(2));
      assert.equal((await heartbeat(id(1), session(1))).rows.length, 2, 'outra sessão do mesmo usuário mantém presença');
      await heartbeat(id(2), session(3));
      assert.equal((await db.query('SELECT count(*)::int AS n FROM user_presence_sessions WHERE user_id=$1 AND offline_at IS NULL', [id(2)])).rows[0].n, 1, 'refresh não duplica a sessão');
    });

    await t.test('C: monitor ativo, habilitado e online recebe os 5 tickets', async () => {
      await asSession(id(1), session(1), async () => {
        await db.query('SELECT set_monitor_eligibility($1,true)', [id(2)]);
        const payload = Array.from({ length: 5 }, (_, index) => ({ ticket_id: `child-${index + 1}`, queue_type: 'filhos' }));
        await db.query('SELECT * FROM assign_queue_tickets($1::jsonb)', [JSON.stringify(payload)]);
      });
      const rows = (await db.query("SELECT assigned_to FROM queue_ticket_assignments WHERE ticket_id LIKE 'child-%'")).rows;
      assert.equal(rows.length, 5);
      assert.ok(rows.every(row => row.assigned_to === id(2)));
    });

    await t.test('D/E/H: logout do monitor não afeta admin e impede novos tickets', async () => {
      await endSession(id(2), session(3));
      const online = await heartbeat(id(1), session(1));
      assert.deepEqual(online.rows.map(row => row.id), [id(1)]);
      await asSession(id(1), session(1), () => db.query(
        'SELECT * FROM assign_queue_tickets($1::jsonb)',
        [JSON.stringify([{ ticket_id: 'offline-ticket', queue_type: 'filhos' }])],
      ));
      assert.equal((await db.query("SELECT count(*)::int AS n FROM queue_ticket_assignments WHERE ticket_id='offline-ticket'")).rows[0].n, 0);
    });

    await t.test('F/G: relogin volta a habilitar e dois monitores recebem de forma equilibrada', async () => {
      await heartbeat(id(2), session(4));
      await heartbeat(id(3), session(5));
      await asSession(id(1), session(1), () => db.query('SELECT set_monitor_eligibility($1,true)', [id(3)]));
      await db.exec('DELETE FROM queue_ticket_assignments');
      const payload = Array.from({ length: 5 }, (_, index) => ({ ticket_id: `balanced-${index + 1}`, queue_type: 'filhos' }));
      await asSession(id(1), session(1), () => db.query('SELECT * FROM assign_queue_tickets($1::jsonb)', [JSON.stringify(payload)]));
      const counts = (await db.query('SELECT assigned_to, count(*)::int AS n FROM queue_ticket_assignments GROUP BY assigned_to ORDER BY assigned_to')).rows;
      assert.deepEqual(counts.map(row => row.n).sort(), [2, 3]);
    });

    await t.test('admin e supervisor transferem; monitor comum não tem permissão', async () => {
      await heartbeat(id(4), session(6));
      await asSession(id(1), session(1), () => db.query(
        'SELECT * FROM reassign_queue_ticket($1,$2,$3,false)',
        ['balanced-1', 'filhos', id(3)],
      ));
      let row = (await db.query("SELECT assigned_to, assignment_source FROM queue_ticket_assignments WHERE ticket_id='balanced-1'")).rows[0];
      assert.deepEqual(row, { assigned_to: id(3), assignment_source: 'manual' });

      await asSession(id(4), session(6), () => db.query(
        'SELECT * FROM reassign_queue_ticket($1,$2,$3,false)',
        ['balanced-1', 'filhos', id(2)],
      ));
      row = (await db.query("SELECT assigned_to, assignment_source FROM queue_ticket_assignments WHERE ticket_id='balanced-1'")).rows[0];
      assert.deepEqual(row, { assigned_to: id(2), assignment_source: 'manual' });

      await assert.rejects(
        () => asSession(id(2), session(4), () => db.query(
          'SELECT * FROM reassign_queue_ticket($1,$2,$3,false)',
          ['balanced-1', 'filhos', id(3)],
        )),
        /Apenas o Supervisor de Qualidade ou o Administrador/
      );
    });

    await t.test('balanceamento preserva atribuição manual enquanto o responsável está online', async () => {
      await asSession(id(1), session(1), () => db.query(
        'SELECT * FROM assign_queue_tickets($1::jsonb)',
        [JSON.stringify([{ ticket_id: 'balanced-1', queue_type: 'filhos' }])],
      ));
      const row = (await db.query("SELECT assigned_to, assignment_source FROM queue_ticket_assignments WHERE ticket_id='balanced-1'")).rows[0];
      assert.deepEqual(row, { assigned_to: id(2), assignment_source: 'manual' });
    });

    await t.test('atribuição manual pendente volta ao balanceamento quando o responsável fica offline', async () => {
      await endSession(id(2), session(4));
      await asSession(id(1), session(1), () => db.query(
        'SELECT * FROM assign_queue_tickets($1::jsonb)',
        [JSON.stringify([{ ticket_id: 'balanced-1', queue_type: 'filhos' }])],
      ));
      const row = (await db.query("SELECT assigned_to, assignment_source FROM queue_ticket_assignments WHERE ticket_id='balanced-1'")).rows[0];
      assert.deepEqual(row, { assigned_to: id(3), assignment_source: 'automatic' });
    });

    await t.test('ticket em avaliação exige confirmação e mantém um único responsável', async () => {
      await asSession(id(3), session(5), () => db.query(
        'SELECT * FROM start_queue_ticket_assignment($1,$2)',
        ['balanced-1', 'filhos'],
      ));

      await endSession(id(3), session(5));
      await asSession(id(1), session(1), () => db.query(
        'SELECT * FROM assign_queue_tickets($1::jsonb)',
        [JSON.stringify([{ ticket_id: 'balanced-1', queue_type: 'filhos' }])],
      ));
      assert.equal(
        (await db.query("SELECT assigned_to FROM queue_ticket_assignments WHERE ticket_id='balanced-1'")).rows[0].assigned_to,
        id(3),
        'trabalho já iniciado não é redistribuído automaticamente quando o monitor fica offline',
      );
      await heartbeat(id(3), session(8));

      await assert.rejects(
        () => asSession(id(1), session(1), () => db.query(
          'SELECT * FROM reassign_queue_ticket($1,$2,$3,false)',
          ['balanced-1', 'filhos', id(3)],
        )),
        /CONFIRM_IN_PROGRESS/
      );

      await heartbeat(id(2), session(7));
      await asSession(id(1), session(1), () => db.query(
        'SELECT * FROM reassign_queue_ticket($1,$2,$3,true)',
        ['balanced-1', 'filhos', id(2)],
      ));
      const row = (await db.query("SELECT assigned_to, status, started_by FROM queue_ticket_assignments WHERE ticket_id='balanced-1'")).rows[0];
      assert.deepEqual(row, { assigned_to: id(2), status: 'pending', started_by: null });

      await assert.rejects(
        () => asSession(id(3), session(5), () => db.query(
          'INSERT INTO monitorias(ticket_id,evaluator_id) VALUES ($1,$2)',
          ['balanced-1', id(3)],
        )),
        /transferido para outro monitor/
      );
      await assert.rejects(
        () => asSession(id(3), session(5), () => db.query(
          'INSERT INTO ai_evaluation_drafts(ticket_id,created_by) VALUES ($1,$2)',
          ['balanced-1', id(3)],
        )),
        /transferido para outro monitor/
      );
    });

    await t.test('redistribui pendentes automáticos quando um segundo monitor entra online', async () => {
      await db.exec('DELETE FROM queue_ticket_assignments');
      await endSession(id(3), session(8));
      const payload = Array.from({ length: 6 }, (_, index) => ({ ticket_id: `late-${index + 1}`, queue_type: 'filhos' }));
      await asSession(id(1), session(1), () => db.query('SELECT * FROM assign_queue_tickets($1::jsonb)', [JSON.stringify(payload)]));
      let counts = (await db.query('SELECT assigned_to, count(*)::int AS n FROM queue_ticket_assignments GROUP BY assigned_to')).rows;
      assert.deepEqual(counts, [{ assigned_to: id(2), n: 6 }]);

      await heartbeat(id(3), session(9));
      await asSession(id(1), session(1), () => db.query('SELECT * FROM assign_queue_tickets($1::jsonb)', [JSON.stringify(payload)]));
      counts = (await db.query('SELECT assigned_to, count(*)::int AS n FROM queue_ticket_assignments GROUP BY assigned_to')).rows;
      assert.deepEqual(counts.map(row => row.n).sort(), [3, 3]);
    });

    await t.test('refresh não altera donos nem timestamps de tickets pendentes', async () => {
      const payload = Array.from({ length: 6 }, (_, index) => ({ ticket_id: `late-${index + 1}`, queue_type: 'filhos' }));
      const before = (await db.query("SELECT ticket_id, assigned_to, assigned_at FROM queue_ticket_assignments WHERE ticket_id LIKE 'late-%' ORDER BY ticket_id")).rows;
      await asSession(id(1), session(1), () => db.query('SELECT * FROM assign_queue_tickets($1::jsonb)', [JSON.stringify(payload)]));
      const after = (await db.query("SELECT ticket_id, assigned_to, assigned_at FROM queue_ticket_assignments WHERE ticket_id LIKE 'late-%' ORDER BY ticket_id")).rows;
      assert.deepEqual(after, before);
    });

    await t.test('job de IA continua após transferência e só produz um resultado', async () => {
      const assigned = (await db.query("SELECT ticket_id, assigned_to FROM queue_ticket_assignments WHERE ticket_id='late-1'")).rows[0];
      const other = assigned.assigned_to === id(2) ? id(3) : id(2);
      const assignedSession = assigned.assigned_to === id(2) ? session(7) : session(9);
      const firstClaim = await asSession(assigned.assigned_to, assignedSession, () => db.query(
        "SELECT * FROM claim_ai_evaluation_job('late-1','atendimento')"));
      assert.equal(firstClaim.rows[0].claimed, true);
      const duplicate = await asSession(assigned.assigned_to, assignedSession, () => db.query(
        "SELECT * FROM claim_ai_evaluation_job('late-1','atendimento')"));
      assert.equal(duplicate.rows[0].claimed, false);
      assert.equal(duplicate.rows[0].job_id, firstClaim.rows[0].job_id);
      await db.exec('SET ROLE service_role');
      try {
        const firstExecution = await db.query('SELECT begin_ai_evaluation_execution($1,$2) AS started', [
          firstClaim.rows[0].job_id, assigned.assigned_to,
        ]);
        const secondExecution = await db.query('SELECT begin_ai_evaluation_execution($1,$2) AS started', [
          firstClaim.rows[0].job_id, assigned.assigned_to,
        ]);
        assert.equal(firstExecution.rows[0].started, true);
        assert.equal(secondExecution.rows[0].started, false);
      } finally {
        await db.exec('RESET ROLE');
      }
      await db.query("UPDATE ai_evaluation_jobs SET started_at=now()-interval '30 minutes' WHERE ticket_id='late-1'");
      const stillRunning = await asSession(assigned.assigned_to, assignedSession, () => db.query(
        "SELECT * FROM claim_ai_evaluation_job('late-1','atendimento')"));
      assert.equal(stillRunning.rows[0].claimed, false);

      await asSession(assigned.assigned_to, assignedSession, () => db.query(
        "SELECT fail_ai_evaluation_job($1,'Navegador desconectou')", [firstClaim.rows[0].job_id]));
      assert.equal((await db.query("SELECT status FROM ai_evaluation_jobs WHERE ticket_id='late-1'")).rows[0].status, 'running');

      await asSession(id(1), session(1), () => db.query(
        'SELECT * FROM reassign_queue_ticket($1,$2,$3,false)', ['late-1', 'filhos', other]));
      const running = (await db.query("SELECT status FROM ai_evaluation_jobs WHERE ticket_id='late-1'")).rows[0];
      assert.equal(running.status, 'running');
      await db.exec('SET ROLE service_role');
      try {
        await db.query(
        'SELECT complete_ai_evaluation_execution($1,$2,$3::jsonb,$4::jsonb)', [
          firstClaim.rows[0].job_id,
          assigned.assigned_to,
          JSON.stringify({ score: 100, summary: 'Avaliação concluída', dialogue: [] }),
          JSON.stringify({ agent_name: 'Atendente', guideline_ids: [] }),
        ]);
      } finally {
        await db.exec('RESET ROLE');
      }
      const final = (await db.query("SELECT status, result->>'summary' AS summary FROM ai_evaluation_jobs WHERE ticket_id='late-1'")).rows[0];
      assert.deepEqual(final, { status: 'completed', summary: 'Avaliação concluída' });
      assert.equal((await db.query("SELECT count(*)::int AS n FROM ai_evaluation_drafts WHERE ticket_id='late-1'")).rows[0].n, 1);
      await db.exec('SET ROLE service_role');
      try {
        await assert.rejects(() => db.query(
          'SELECT complete_ai_evaluation_execution($1,$2,$3::jsonb,$4::jsonb)', [
            firstClaim.rows[0].job_id, assigned.assigned_to,
            JSON.stringify({ score: 0, summary: 'duplicado' }), '{}',
          ]), /já concluído/);
      } finally {
        await db.exec('RESET ROLE');
      }
    });

    await t.test('fila de retry é privada, usa lease e não reprocessa job concluído', async () => {
      const claim = await asSession(id(2), session(7), () => db.query(
        "SELECT * FROM claim_ai_evaluation_job('retry-1','atendimento')"));
      const jobId = claim.rows[0].job_id;
      await db.exec('SET ROLE service_role');
      try {
        await db.query(`INSERT INTO ai_evaluation_retry_queue(ticket_id,job_id,payload,next_retry_at)
          VALUES ('retry-1',$1,'{"action":"evaluate_ai"}'::jsonb,now()-interval '1 minute')`, [jobId]);
      } finally { await db.exec('RESET ROLE'); }
      await assert.rejects(asSession(id(2), session(7), () => db.query(
        'SELECT * FROM ai_evaluation_retry_queue')), /permission denied/);
      await db.exec('SET ROLE service_role');
      try {
        const first = await db.query('SELECT * FROM claim_due_ai_evaluation_retries(1)');
        assert.equal(first.rows.length, 1);
        assert.equal(first.rows[0].job_id, jobId);
        assert.equal((await db.query('SELECT * FROM claim_due_ai_evaluation_retries(1)')).rows.length, 0);
        await db.query("UPDATE ai_evaluation_retry_queue SET lease_until=now()-interval '1 second' WHERE job_id=$1", [jobId]);
        assert.equal((await db.query('SELECT * FROM claim_due_ai_evaluation_retries(1)')).rows.length, 1);
        await db.exec('RESET ROLE');
        await db.query("UPDATE ai_evaluation_jobs SET status='completed' WHERE job_id=$1", [jobId]);
        await db.exec('SET ROLE service_role');
        await db.query("UPDATE ai_evaluation_retry_queue SET lease_until=NULL WHERE job_id=$1", [jobId]);
        assert.equal((await db.query('SELECT * FROM claim_due_ai_evaluation_retries(1)')).rows.length, 0);
      } finally { await db.exec('RESET ROLE'); }
    });

    await t.test('dois tickets dão 1/1 e cinco tickets dão 3/2', async () => {
      await db.exec('DELETE FROM queue_ticket_assignments');
      for (const total of [2, 5]) {
        const payload = Array.from({ length: total }, (_, index) => ({ ticket_id: `exact-${total}-${index}`, queue_type: 'filhos' }));
        await asSession(id(1), session(1), () => db.query('SELECT * FROM assign_queue_tickets($1::jsonb)', [JSON.stringify(payload)]));
        const counts = (await db.query('SELECT count(*)::int AS n FROM queue_ticket_assignments GROUP BY assigned_to')).rows.map(row => row.n).sort();
        assert.deepEqual(counts, total === 2 ? [1, 1] : [2, 3]);
        await db.exec('DELETE FROM queue_ticket_assignments');
      }
    });

    await t.test('somente serviço distribui IDs verificados; monitor não lê job alheio', async () => {
      await db.exec(await verifiedCatalogMigration);
      await db.exec('ALTER TABLE public.ai_evaluation_drafts ENABLE ROW LEVEL SECURITY');
      await db.exec(await aiOwnerMigration);
      await db.exec(await verifiedClaimMigration);
      await assert.rejects(asSession(id(2), session(7), () => db.query(
        `SELECT * FROM assign_queue_tickets('[{"ticket_id":"987654","queue_type":"filhos"}]'::jsonb)`
      )), /permission denied|distribuição é exclusiva/);
      await db.exec('SET ROLE service_role');
      try {
        await db.query(`INSERT INTO queue_ticket_catalog(ticket_id,queue_type) VALUES ('987654','filhos')`);
        await db.query(`SELECT * FROM assign_queue_tickets('[{"ticket_id":"987654","queue_type":"filhos"}]'::jsonb)`);
      } finally { await db.exec('RESET ROLE'); }
      const owner = (await db.query("SELECT assigned_to FROM queue_ticket_assignments WHERE ticket_id='987654'")).rows[0].assigned_to;
      const stranger = owner === id(2) ? id(3) : id(2);
      await assert.rejects(asSession(stranger, session(8), () => db.query(
        "SELECT * FROM claim_ai_evaluation_job('987654','chamado_filho')")), /outro monitor/);
      const oldJob = (await asSession(owner, session(7), () => db.query(
        "SELECT * FROM claim_ai_evaluation_job('987654','chamado_filho')"))).rows[0].job_id;
      const foreignJobs = await asSession(stranger, session(8), () => db.query(
        "SELECT ticket_id FROM ai_evaluation_jobs WHERE ticket_id='987654'"));
      assert.equal(foreignJobs.rows.length, 0);
      await db.exec('CREATE TABLE public.ai_evaluation_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid())');
      await db.exec(await aiCancellationMigration);
      await db.exec(await aiCancellationAckMigration);
      await assert.rejects(asSession(stranger, session(8), () => db.query(
        'SELECT cancel_ai_evaluation_job($1)', [oldJob])), /não autorizado/);
      await db.exec('SET ROLE service_role');
      try {
        const started = await db.query('SELECT begin_ai_evaluation_execution($1,$2) AS started', [oldJob, owner]);
        assert.equal(started.rows[0].started, true);
      } finally { await db.exec('RESET ROLE'); }
      const cancelled = await asSession(owner, session(7), () => db.query(
        'SELECT cancel_ai_evaluation_job($1) AS cancelled', [oldJob]));
      assert.equal(cancelled.rows[0].cancelled, true);
      const blocked = (await asSession(owner, session(7), () => db.query(
        "SELECT * FROM claim_ai_evaluation_job('987654','chamado_filho')"))).rows[0];
      assert.equal(blocked.claimed, false);
      assert.equal(blocked.job_id, oldJob);
      await assert.rejects(asSession(owner, session(7), () => db.query(
        'SELECT acknowledge_ai_evaluation_cancellation($1)', [oldJob])), /permission denied|não autorizada/);
      await db.exec('SET ROLE service_role');
      try {
        const stopped = await db.query('SELECT acknowledge_ai_evaluation_cancellation($1) AS acknowledged', [oldJob]);
        assert.equal(stopped.rows[0].acknowledged, true);
      } finally { await db.exec('RESET ROLE'); }
      const replacement = (await asSession(owner, session(7), () => db.query(
        "SELECT * FROM claim_ai_evaluation_job('987654','chamado_filho')"))).rows[0];
      assert.equal(replacement.claimed, true);
      assert.notEqual(replacement.job_id, oldJob);
      await db.exec('SET ROLE service_role');
      try {
        const late = await db.query('SELECT set_ai_evaluation_phase($1,$2) AS changed', [oldJob, 'fallback_gemini']);
        assert.equal(late.rows[0].changed, false);
      } finally { await db.exec('RESET ROLE'); }
    });
  } finally {
    await db.close();
  }
});
