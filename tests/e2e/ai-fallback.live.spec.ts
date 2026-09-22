import { expect, test } from '@playwright/test';

const runLive = process.env.RUN_LIVE_AI_FALLBACK_TEST === '1';
const supabaseUrl = process.env.E2E_SUPABASE_URL || '';
const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY || '';
const serviceRoleKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || '';
const expectFallback = process.env.EXPECT_AI_FALLBACK !== '0';

interface AuthUser { id: string; email: string }
interface AuthSession { access_token: string }

async function request<T>(path: string, init: RequestInit, key = serviceRoleKey): Promise<T> {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error(`${init.method || 'GET'} ${path}: ${response.status} ${await response.text()}`);
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

test.describe('fallback real da avaliação com IA', () => {
  test.skip(!runLive, 'Defina RUN_LIVE_AI_FALLBACK_TEST=1 e force um GEMINI_MODEL inválido antes da execução.');

  test('uma falha do Gemini chama o próximo modelo e salva um único resultado válido', async () => {
    const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const email = `ai-fallback-${unique}@example.invalid`;
    const ticketId = String(Date.now());
    let user: AuthUser | undefined;

    try {
      user = await request<AuthUser>('/auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email, email_confirm: true, user_metadata: { name: 'Admin AI Fallback E2E' } }),
      });
      await request<unknown>(`/rest/v1/users?id=eq.${user.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ role: 'admin', active: true, must_change_password: false }),
      });
      const link = await request<{ hashed_token: string }>('/auth/v1/admin/generate_link', {
        method: 'POST',
        body: JSON.stringify({ type: 'magiclink', email }),
      });
      const session = await request<AuthSession>('/auth/v1/verify', {
        method: 'POST',
        body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }),
      }, publishableKey);
      const claimed = await request<Array<{ job_id: string; claimed: boolean }>>('/rest/v1/rpc/claim_ai_evaluation_job', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ p_ticket_id: ticketId, p_evaluation_type: 'atendimento' }),
      }, publishableKey);
      expect(claimed[0].claimed).toBe(true);

      const response = await fetch(`${supabaseUrl}/functions/v1/helpdesk-queue`, {
        method: 'POST',
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'evaluate_ai',
          ticket_id: ticketId,
          job_id: claimed[0].job_id,
          form_criteria: {
            sections: [{
              title: 'Atendimento',
              questions: [{ id: 'saudacao', text: 'O atendente realizou uma saudação?', is_critical: false }],
            }],
          },
          dialogue: [
            { author_name: 'Cliente', body: 'Olá, preciso de ajuda.' },
            { author_name: 'Atendente', body: 'Olá! Como posso ajudar?' },
          ],
          agent_info: { name: 'Atendente E2E', channel: 'Chat' },
          guideline_ids: [],
          ticket_fields: [],
          draft_meta: { form_id: null, agent_name: 'Atendente E2E', guideline_ids: [] },
        }),
      });
      const body = await response.json() as { success?: boolean; result?: { summary?: string }; error?: string };
      if (!response.ok) {
        const failedLogs = await request<Array<{ attempts: unknown }>>(
          `/rest/v1/ai_evaluation_logs?ticket_id=eq.${ticketId}&select=attempts`, { method: 'GET' });
        console.log(JSON.stringify({ httpStatus: response.status, attempts: failedLogs[0]?.attempts }));
      }
      expect(response.status, JSON.stringify(body)).toBe(200);
      expect(body.success).toBe(true);
      expect(body.result?.summary).toBeTruthy();
      const jobs = await request<Array<{ status: string; result: { summary: string } }>>(
        `/rest/v1/ai_evaluation_jobs?ticket_id=eq.${ticketId}&select=status,result`, { method: 'GET' });
      expect(jobs).toHaveLength(1);
      expect(jobs[0].status).toBe('completed');
      expect(jobs[0].result.summary).toBe(body.result?.summary);
      const drafts = await request<Array<{ ticket_id: string }>>(
        `/rest/v1/ai_evaluation_drafts?ticket_id=eq.${ticketId}&select=ticket_id`, { method: 'GET' });
      expect(drafts).toHaveLength(1);

      const duplicateResponse = await fetch(`${supabaseUrl}/functions/v1/helpdesk-queue`, {
        method: 'POST',
        headers: { apikey: publishableKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'evaluate_ai', ticket_id: ticketId, job_id: claimed[0].job_id }),
      });
      expect(duplicateResponse.status).toBe(409);

      const logsResponse = await fetch(`${supabaseUrl}/rest/v1/ai_evaluation_logs?ticket_id=eq.${encodeURIComponent(ticketId)}&select=provider,model,status,fallback_used,attempts`, {
        headers: { apikey: publishableKey, Authorization: `Bearer ${session.access_token}` },
      });
      expect(logsResponse.status).toBe(200);
      const logs = await logsResponse.json() as Array<{
        provider: string;
        model: string;
        status: string;
        fallback_used: boolean;
        attempts: Array<{ provider: string; model: string; status: string; reason?: string }>;
      }>;

      expect(logs).toHaveLength(1);
      console.log(JSON.stringify({ ticketId, finalProvider: logs[0].provider, finalModel: logs[0].model, attempts: logs[0].attempts }));
      if (expectFallback) {
        expect(logs[0]).toMatchObject({ provider: 'openrouter', status: 'success', fallback_used: true });
        expect(logs[0].attempts[0]).toMatchObject({ provider: 'gemini', status: 'failed' });
        expect(logs[0].attempts.at(-1)).toMatchObject({ provider: 'openrouter', status: 'success' });
      } else {
        expect(logs[0]).toMatchObject({ provider: 'gemini', status: 'success', fallback_used: false });
        expect(logs[0].attempts).toHaveLength(1);
        expect(logs[0].attempts[0]).toMatchObject({ provider: 'gemini', status: 'success', attempt: 1 });
      }
    } finally {
      await fetch(`${supabaseUrl}/rest/v1/ai_evaluation_drafts?ticket_id=eq.${encodeURIComponent(ticketId)}`, {
        method: 'DELETE',
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      });
      await fetch(`${supabaseUrl}/rest/v1/ai_evaluation_jobs?ticket_id=eq.${encodeURIComponent(ticketId)}`, {
        method: 'DELETE',
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      });
      await fetch(`${supabaseUrl}/rest/v1/ai_evaluation_logs?ticket_id=eq.${encodeURIComponent(ticketId)}`, {
        method: 'DELETE',
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      });
      if (user) {
        await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}`, {
          method: 'DELETE',
          headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
        });
      }
    }
  });
});
