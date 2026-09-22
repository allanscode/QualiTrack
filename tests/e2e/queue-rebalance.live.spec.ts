import { expect, test } from '@playwright/test';

const runLive = process.env.RUN_LIVE_QUEUE_REBALANCE_TEST === '1';
const supabaseUrl = process.env.E2E_SUPABASE_URL || '';
const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY || '';
const serviceRoleKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || '';

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

async function createUser(email: string, name: string, role: 'admin' | 'qualidade'): Promise<AuthUser> {
  const user = await request<AuthUser>('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, email_confirm: true, user_metadata: { name } }),
  });
  await request<unknown>(`/rest/v1/users?id=eq.${user.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ name, role, active: true, must_change_password: false }),
  });
  return user;
}

async function createSession(email: string): Promise<AuthSession> {
  const link = await request<{ hashed_token: string }>('/auth/v1/admin/generate_link', {
    method: 'POST',
    body: JSON.stringify({ type: 'magiclink', email }),
  });
  return request<AuthSession>('/auth/v1/verify', {
    method: 'POST',
    body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }),
  }, publishableKey);
}

async function rpc<T>(name: string, body: unknown, accessToken: string): Promise<T> {
  return request<T>(`/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  }, publishableKey);
}

test.describe('redistribuição real da fila', () => {
  test.skip(!runLive, 'Defina RUN_LIVE_QUEUE_REBALANCE_TEST=1 e as credenciais E2E do Supabase.');

  test('redistribui pendentes quando o segundo monitor entra sem mover trabalho iniciado', async () => {
    const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const ticketPrefix = `e2e-rebalance-${unique}`;
    const ticketIds = Array.from({ length: 6 }, (_, index) => `${ticketPrefix}-${index + 1}`);
    const users: AuthUser[] = [];

    try {
      const admin = await createUser(`admin-rebalance-${unique}@example.invalid`, `Admin Rebalance E2E ${unique}`, 'admin');
      const first = await createUser(`monitor-a-${unique}@example.invalid`, `Monitor A Rebalance E2E ${unique}`, 'qualidade');
      const second = await createUser(`monitor-b-${unique}@example.invalid`, `Monitor B Rebalance E2E ${unique}`, 'qualidade');
      users.push(admin, first, second);

      const [adminSession, firstSession, secondSession] = await Promise.all([
        createSession(admin.email),
        createSession(first.email),
        createSession(second.email),
      ]);

      await rpc('heartbeat_user_presence', {}, firstSession.access_token);
      await rpc('set_monitor_eligibility', { p_user_id: first.id, p_enabled: true }, adminSession.access_token);
      await rpc('set_monitor_eligibility', { p_user_id: second.id, p_enabled: true }, adminSession.access_token);

      const queuePayload = ticketIds.map(ticket_id => ({ ticket_id, queue_type: 'filhos' }));
      await rpc('assign_queue_tickets', { p_tickets: queuePayload }, adminSession.access_token);

      let rows = await request<Array<{ ticket_id: string; assigned_to: string }>>(
        `/rest/v1/queue_ticket_assignments?select=ticket_id,assigned_to&ticket_id=like.${ticketPrefix}*`,
        { method: 'GET' },
      );
      expect(rows).toHaveLength(6);
      const beforeCounts = rows.reduce<Record<string, number>>((result, row) => {
        result[row.assigned_to] = (result[row.assigned_to] || 0) + 1;
        return result;
      }, {});
      expect(beforeCounts[second.id] || 0).toBe(0);

      await rpc('heartbeat_user_presence', {}, secondSession.access_token);
      await rpc('assign_queue_tickets', { p_tickets: queuePayload }, adminSession.access_token);

      rows = await request<Array<{ ticket_id: string; assigned_to: string }>>(
        `/rest/v1/queue_ticket_assignments?select=ticket_id,assigned_to&ticket_id=like.${ticketPrefix}*`,
        { method: 'GET' },
      );
      const counts = rows.reduce<Record<string, number>>((result, row) => {
        result[row.assigned_to] = (result[row.assigned_to] || 0) + 1;
        return result;
      }, {});
      expect(rows).toHaveLength(6);
      expect(counts[second.id]).toBeGreaterThan(0);
      expect(new Set(rows.map(row => row.ticket_id)).size).toBe(6);
      console.log(JSON.stringify({ ticketPrefix, before: beforeCounts, after: counts, joinedMonitor: second.id }));
    } finally {
      await request<unknown>(`/rest/v1/queue_ticket_assignments?ticket_id=like.${ticketPrefix}*`, { method: 'DELETE' });
      for (const user of users.reverse()) {
        await request<unknown>(`/rest/v1/users?id=eq.${user.id}`, { method: 'DELETE' });
        await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}`, {
          method: 'DELETE',
          headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
        });
      }
    }
  });
});
