import { expect, test, type Browser, type BrowserContext } from '@playwright/test';

const runLive = process.env.RUN_LIVE_SESSION_TEST === '1';
const supabaseUrl = process.env.E2E_SUPABASE_URL || '';
const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY || '';
const serviceRoleKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || '';
const projectRef = new URL(supabaseUrl || 'https://invalid.supabase.co').hostname.split('.')[0];
const storageKey = `sb-${projectRef}-auth-token`;

interface AuthUser {
  id: string;
  email: string;
}

interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: string;
  user: AuthUser;
}

async function supabaseRequest<T>(path: string, init: RequestInit, key = serviceRoleKey): Promise<T> {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`${init.method || 'GET'} ${path} retornou ${response.status}: ${await response.text()}`);
  }
  return await response.json() as T;
}

async function createUser(email: string, password: string, name: string, role: string): Promise<AuthUser> {
  const created = await supabaseRequest<{ id: string; email: string }>('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name } }),
  });
  await supabaseRequest<unknown>(`/rest/v1/users?id=eq.${created.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ name, role, active: true, must_change_password: false }),
  });
  return created;
}

async function createSession(email: string): Promise<AuthSession> {
  const link = await supabaseRequest<{ hashed_token: string }>('/auth/v1/admin/generate_link', {
    method: 'POST',
    body: JSON.stringify({ type: 'magiclink', email }),
  });
  return await supabaseRequest<AuthSession>('/auth/v1/verify', {
    method: 'POST',
    body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }),
  }, publishableKey);
}

async function contextWithSession(browser: Browser, session: AuthSession): Promise<BrowserContext> {
  const context = await browser.newContext();
  await context.addInitScript(({ key, value }) => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, { key: storageKey, value: session });
  return context;
}

async function removeUser(user: AuthUser | undefined): Promise<void> {
  if (!user) return;
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}`, {
    method: 'DELETE',
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Falha ao remover usuário de teste ${user.id}: ${response.status} ${await response.text()}`);
  }
}

test.describe('encerramento remoto de sessão em produção', () => {
  test.skip(!runLive, 'Defina RUN_LIVE_SESSION_TEST=1 e as credenciais E2E para executar contra o Supabase real.');

  test('revoga o alvo no backend, preserva o admin e atualiza a presença', async ({ browser, baseURL }) => {
    expect(supabaseUrl).toMatch(/^https:\/\/[a-z0-9]+\.supabase\.co$/);
    expect(publishableKey).not.toBe('');
    expect(serviceRoleKey).not.toBe('');

    const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const password = `Live-${unique}-Aa9!`;
    const adminName = `Admin E2E ${unique}`;
    const targetName = `Monitor E2E ${unique}`;
    let adminUser: AuthUser | undefined;
    let targetUser: AuthUser | undefined;
    let adminContext: BrowserContext | undefined;
    let targetContext: BrowserContext | undefined;

    try {
      adminUser = await createUser(`admin-${unique}@example.invalid`, password, adminName, 'admin');
      targetUser = await createUser(`monitor-${unique}@example.invalid`, password, targetName, 'qualidade');
      const adminSession = await createSession(adminUser.email);
      const targetSession = await createSession(targetUser.email);

      targetContext = await contextWithSession(browser, targetSession);
      const targetPage = await targetContext.newPage();
      await targetPage.goto(baseURL || '/');
      await expect(targetPage.getByText(targetName, { exact: false }).first()).toBeVisible({ timeout: 30_000 });

      adminContext = await contextWithSession(browser, adminSession);
      const adminPage = await adminContext.newPage();
      const consoleErrors: string[] = [];
      adminPage.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      await adminPage.goto(baseURL || '/');
      await expect(adminPage.getByText(adminName, { exact: false }).first()).toBeVisible({ timeout: 30_000 });

      const onlineTitle = adminPage.getByText('Usuários Online', { exact: true }).first();
      await expect(onlineTitle).toBeVisible({ timeout: 30_000 });
      const onlineCard = onlineTitle.locator('xpath=ancestor::div[contains(@class,"rounded-card")][1]');
      await onlineCard.locator('p').click();
      await expect(adminPage.getByText(targetName, { exact: true })).toBeVisible({ timeout: 30_000 });

      const functionResponsePromise = adminPage.waitForResponse(response =>
        response.request().method() === 'POST'
        && response.url().endsWith('/functions/v1/admin-end-user-session'),
      );
      const targetRow = adminPage.getByText(targetName, { exact: true }).locator('xpath=ancestor::div[button][1]');
      await targetRow.getByRole('button', { name: /encerrar/i }).click();

      const functionResponse = await functionResponsePromise;
      const responseBody = await functionResponse.json() as {
        success?: boolean;
        revoked_sessions?: number;
        command_id?: string;
      };
      expect(functionResponse.status()).toBe(200);
      expect(responseBody.success).toBe(true);
      expect(responseBody.revoked_sessions).toBeGreaterThanOrEqual(1);
      expect(responseBody.command_id).toMatch(/^[0-9a-f-]{36}$/i);

      await expect(adminPage.getByText(targetName, { exact: true })).toHaveCount(0, { timeout: 5_000 });
      await expect(adminPage.getByText(adminName, { exact: false }).first()).toBeVisible();

      const refreshResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: targetSession.refresh_token }),
      });
      expect(refreshResponse.ok).toBe(false);

      const adminUserResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: publishableKey, Authorization: `Bearer ${adminSession.access_token}` },
      });
      expect(adminUserResponse.status).toBe(200);

      await expect(targetPage.getByText(/acesse sua conta|entrar/i).first()).toBeVisible({ timeout: 20_000 });
      expect(consoleErrors.filter(message => message.includes('admin-end-user-session'))).toEqual([]);

      const request = functionResponse.request();
      expect(request.postDataJSON()).toEqual({ user_id: targetUser.id });
      expect(request.headers().authorization).toBe(`Bearer ${adminSession.access_token}`);
      console.log(JSON.stringify({
        request: request.url(),
        method: request.method(),
        status: functionResponse.status(),
        response: responseBody,
        targetRefreshRevokedStatus: refreshResponse.status,
        adminSessionStatus: adminUserResponse.status,
      }));
    } finally {
      await targetContext?.close();
      await adminContext?.close();
      await removeUser(targetUser);
      await removeUser(adminUser);
    }
  });
});
