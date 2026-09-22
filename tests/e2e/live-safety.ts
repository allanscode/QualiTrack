// Live fixtures must never mutate the WP Qualidade production project.
// Use a dedicated, disposable Supabase project with an explicit opt-in.
export const PRODUCTION_PROJECT_REF = 'vpytvgpsqdapgouyjowc';

export function assertSafeLiveE2E(url: string, expectedRef = process.env.E2E_EXPECTED_PROJECT_REF): void {
  const parsed = new URL(url);
  const ref = parsed.hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1];
  if (parsed.protocol !== 'https:' || !ref || ref === PRODUCTION_PROJECT_REF
    || !expectedRef || ref !== expectedRef || process.env.E2E_ALLOW_MUTATIONS !== '1') {
    throw new Error('E2E live bloqueado: use projeto Supabase dedicado, E2E_EXPECTED_PROJECT_REF correspondente e E2E_ALLOW_MUTATIONS=1. Produção é proibida.');
  }
}

interface FixtureAuthUser {
  id: string;
  email: string;
  created_at: string;
  user_metadata?: { e2e_run_id?: string; e2e_ticket_id?: string; e2e_source?: string };
}

export async function cleanupStaleLiveE2E(url: string, serviceKey: string): Promise<number> {
  assertSafeLiveE2E(url);
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const stale: FixtureAuthUser[] = [];
  for (let page = 1; page <= 50; page++) {
    const response = await fetch(`${url}/auth/v1/admin/users?per_page=1000&page=${page}`, { headers });
    if (!response.ok) throw new Error(`Falha ao listar fixtures E2E: HTTP ${response.status}`);
    const { users } = await response.json() as { users: FixtureAuthUser[] };
    for (const user of users) {
      const marker = user.user_metadata?.e2e_run_id;
      if (!marker || user.user_metadata?.e2e_source !== 'qualitrack-e2e'
        || !/^(?:admin|monitor|queue-layout|ai-fallback|ai-job)-[a-z0-9-]+@example\.invalid$/i.test(user.email)
        || Date.now() - Date.parse(user.created_at) < 5 * 60_000) continue;
      stale.push(user);
    }
    if (users.length < 1000) break;
  }
  const failures: string[] = [];
  for (const user of stale) {
    try { await cleanupLiveE2EFixture(url, serviceKey, user.id, user.user_metadata?.e2e_ticket_id); }
    catch { failures.push(user.id); }
  }
  if (failures.length) throw new Error(`Cleanup E2E incompleto em ${failures.length} fixture(s).`);
  return stale.length;
}

export async function cleanupLiveE2EFixture(url: string, serviceKey: string, userId?: string, ticketId?: string): Promise<void> {
  assertSafeLiveE2E(url);
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const failures: string[] = [];
  if (ticketId && /^\d{1,18}$/.test(ticketId)) {
    for (const table of ['ai_evaluation_drafts', 'ai_evaluation_retry_queue', 'ai_evaluation_jobs', 'ai_evaluation_logs']) {
      try {
        const response = await fetch(`${url}/rest/v1/${table}?ticket_id=eq.${ticketId}`, { method: 'DELETE', headers });
        if (!response.ok) failures.push(`${table}: HTTP ${response.status}`);
      } catch { failures.push(`${table}: rede`); }
    }
  }
  if (userId) {
    let profileRemoved = false;
    try {
      const response = await fetch(`${url}/rest/v1/users?id=eq.${userId}`, { method: 'DELETE', headers });
      profileRemoved = response.ok;
      if (!response.ok) failures.push(`users: HTTP ${response.status}`);
    } catch { failures.push('users: rede'); }
    if (profileRemoved) {
      try {
        const response = await fetch(`${url}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers });
        if (!response.ok && response.status !== 404) failures.push(`auth.users: HTTP ${response.status}`);
      } catch { failures.push('auth.users: rede'); }
    }
  }
  if (failures.length) throw new Error(`Cleanup E2E incompleto: ${failures.join(', ')}`);
}
