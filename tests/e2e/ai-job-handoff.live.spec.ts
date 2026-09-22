import { expect, test } from '@playwright/test';
import { assertSafeLiveE2E, cleanupLiveE2EFixture, cleanupStaleLiveE2E } from './live-safety';

const supabaseUrl = process.env.E2E_SUPABASE_URL || '';
const anonKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY || '';
const serviceKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || '';

async function api<T>(path: string, token: string, body?: unknown): Promise<T> {
  const response = await fetch(`${supabaseUrl}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { apikey: serviceKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  expect(response.status, `${path}: ${await response.clone().text()}`).toBeLessThan(300);
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

test('Edge worker persiste uma única avaliação após o navegador iniciar o job', async () => {
  test.skip(process.env.RUN_LIVE_AI_JOB_TEST !== '1', 'Exige credenciais E2E do projeto Supabase.');
  assertSafeLiveE2E(supabaseUrl);
  await cleanupStaleLiveE2E(supabaseUrl, serviceKey);
  const ticketId = String(Date.now());
  const email = `ai-job-${ticketId}@example.invalid`;
  let userId: string | undefined;
  try {
    const user = await api<{ id: string }>('/auth/v1/admin/users', serviceKey, {
      email, email_confirm: true, user_metadata: { name: 'Admin AI Job E2E', e2e_run_id: ticketId, e2e_ticket_id: ticketId, e2e_source: 'qualitrack-e2e' },
    });
    userId = user.id;
    const patch = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${userId}`, {
      method: 'PATCH',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin', active: true, must_change_password: false }),
    });
    expect(patch.status).toBe(204);
    const link = await api<{ hashed_token: string }>('/auth/v1/admin/generate_link', serviceKey, { type: 'magiclink', email });
    const session = await api<{ access_token: string }>('/auth/v1/verify', anonKey, { type: 'magiclink', token_hash: link.hashed_token });
    const claimed = await api<Array<{ job_id: string; claimed: boolean }>>('/rest/v1/rpc/claim_ai_evaluation_job', session.access_token,
      { p_ticket_id: ticketId, p_evaluation_type: 'atendimento' });
    expect(claimed[0].claimed).toBe(true);
    const jobId = claimed[0].job_id;
    const duplicateClaim = await api<Array<{ claimed: boolean }>>('/rest/v1/rpc/claim_ai_evaluation_job', session.access_token,
      { p_ticket_id: ticketId, p_evaluation_type: 'atendimento' });
    expect(duplicateClaim[0].claimed).toBe(false);
    const started = await api<boolean>('/rest/v1/rpc/begin_ai_evaluation_execution', serviceKey,
      { p_job_id: jobId, p_caller_id: userId });
    expect(started).toBe(true);
    const duplicateStart = await api<boolean>('/rest/v1/rpc/begin_ai_evaluation_execution', serviceKey,
      { p_job_id: jobId, p_caller_id: userId });
    expect(duplicateStart).toBe(false);
    await api<unknown>('/rest/v1/rpc/fail_ai_evaluation_job', session.access_token,
      { p_job_id: jobId, p_error: 'Navegador desconectou' });
    const running = await api<Array<{ status: string }>>(`/rest/v1/ai_evaluation_jobs?ticket_id=eq.${ticketId}&select=status`, serviceKey);
    expect(running[0].status).toBe('running');
    await api<unknown>('/rest/v1/rpc/complete_ai_evaluation_execution', serviceKey, {
      p_job_id: jobId, p_caller_id: userId,
      p_result: { summary: 'Resultado persistido pelo servidor', score: 100 },
      p_draft: { form_id: null, agent_name: 'Atendente E2E', guideline_ids: [] },
    });
    const jobs = await api<Array<{ status: string; result: { summary: string } }>>(
      `/rest/v1/ai_evaluation_jobs?ticket_id=eq.${ticketId}&select=status,result`, serviceKey);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ status: 'completed', result: { summary: 'Resultado persistido pelo servidor' } });
    const drafts = await api<Array<{ ticket_id: string }>>(
      `/rest/v1/ai_evaluation_drafts?ticket_id=eq.${ticketId}&select=ticket_id`, serviceKey);
    expect(drafts).toHaveLength(1);
  } finally {
    await cleanupLiveE2EFixture(supabaseUrl, serviceKey, userId, ticketId);
  }
});
