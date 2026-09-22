import { expect, test } from '@playwright/test';
import { assertSafeLiveE2E, cleanupStaleLiveE2E } from './live-safety';

test('testes live recusam produção mesmo com opt-in', () => {
  const previous = process.env.E2E_ALLOW_MUTATIONS;
  try {
    process.env.E2E_ALLOW_MUTATIONS = '1';
    expect(() => assertSafeLiveE2E('https://vpytvgpsqdapgouyjowc.supabase.co', 'vpytvgpsqdapgouyjowc')).toThrow(/Produção é proibida/);
    expect(() => assertSafeLiveE2E('https://stagingproject.supabase.co', 'outraref')).toThrow();
    expect(() => assertSafeLiveE2E('https://stagingproject.supabase.co', 'stagingproject')).not.toThrow();
  } finally {
    if (previous === undefined) delete process.env.E2E_ALLOW_MUTATIONS;
    else process.env.E2E_ALLOW_MUTATIONS = previous;
  }
});

test('fixture marcada é limpa mesmo após falha proposital do teste', async () => {
  const previous = process.env.E2E_ALLOW_MUTATIONS;
  const previousRef = process.env.E2E_EXPECTED_PROJECT_REF;
  const originalFetch = globalThis.fetch;
  const deleted: string[] = [];
  try {
    process.env.E2E_ALLOW_MUTATIONS = '1';
    process.env.E2E_EXPECTED_PROJECT_REF = 'stagingproject';
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.includes('/auth/v1/admin/users?')) return Response.json({ users: [{
        id: '00000000-0000-4000-8000-000000000001',
        email: 'ai-job-123456@example.invalid',
        created_at: new Date(Date.now() - 10 * 60_000).toISOString(),
        user_metadata: { e2e_run_id: 'run-1', e2e_ticket_id: '123456', e2e_source: 'qualitrack-e2e' },
      }, {
        id: '00000000-0000-4000-8000-000000000002',
        email: 'real@example.invalid',
        created_at: new Date(Date.now() - 10 * 60_000).toISOString(),
        user_metadata: {},
      }] });
      if (init?.method === 'DELETE') { deleted.push(url); return new Response(null, { status: 204 }); }
      throw new Error('Request inesperado');
    };
    try { throw new Error('falha proposital'); }
    catch (error) { expect(String(error)).toContain('falha proposital'); }
    finally { expect(await cleanupStaleLiveE2E('https://stagingproject.supabase.co', 'service-test')).toBe(1); }
    expect(deleted).toHaveLength(6);
    expect(deleted.every(url => !url.includes('000000000002'))).toBe(true);
  } finally {
    globalThis.fetch = originalFetch;
    if (previous === undefined) delete process.env.E2E_ALLOW_MUTATIONS;
    else process.env.E2E_ALLOW_MUTATIONS = previous;
    if (previousRef === undefined) delete process.env.E2E_EXPECTED_PROJECT_REF;
    else process.env.E2E_EXPECTED_PROJECT_REF = previousRef;
  }
});
