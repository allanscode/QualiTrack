import { expect, test } from '@playwright/test';
import { assertSafeLiveE2E, cleanupLiveE2EFixture, cleanupStaleLiveE2E } from './live-safety';

const runLive = process.env.RUN_LIVE_QUEUE_UI_TEST === '1';
const supabaseUrl = process.env.E2E_SUPABASE_URL || '';
const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY || '';
const serviceRoleKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || '';
const storageKey = `sb-${new URL(supabaseUrl || 'https://invalid.supabase.co').hostname.split('.')[0]}-auth-token`;

async function adminRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json', ...init.headers },
  });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  const body = await response.text();
  return (body ? JSON.parse(body) : undefined) as T;
}

test('cabeçalho dos cards não sobrepõe controles em desktop e viewport menor', async ({ browser, baseURL }) => {
  test.skip(!runLive, 'Exige credenciais E2E e frontend local para validar o card real.');
  assertSafeLiveE2E(supabaseUrl);
  await cleanupStaleLiveE2E(supabaseUrl, serviceRoleKey);
  test.setTimeout(120_000);
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `queue-layout-${unique}@example.invalid`;
  const ticketId = String(Date.now());
  const admin = await adminRequest<{ id: string }>('/auth/v1/admin/users', {
    method: 'POST', body: JSON.stringify({ email, email_confirm: true, user_metadata: { name: 'Admin Layout E2E', e2e_run_id: unique, e2e_ticket_id: ticketId, e2e_source: 'qualitrack-e2e' } }),
  });
  const context = await browser.newContext();

  try {
    await adminRequest(`/rest/v1/users?id=eq.${admin.id}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ role: 'admin', active: true, must_change_password: false }),
    });
    const monitors = await adminRequest<Array<{ id: string; name: string }>>(
      '/rest/v1/users?select=id,name&role=eq.qualidade&active=eq.true&limit=1', { method: 'GET' });
    expect(monitors.length).toBeGreaterThan(0);
    const link = await adminRequest<{ hashed_token: string }>('/auth/v1/admin/generate_link', {
      method: 'POST', body: JSON.stringify({ type: 'magiclink', email }),
    });
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/verify`, {
      method: 'POST',
      headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }),
    });
    expect(authResponse.status).toBe(200);
    const session = await authResponse.json();
    await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: storageKey, value: session,
    });
    const page = await context.newPage();
    await page.route('**/functions/v1/helpdesk-queue', async route => {
      const body = route.request().postDataJSON() as { action?: string; queue_type?: string };
      if (body.action === 'fetch_dialogue') {
        // A origem local não está na allowlist de produção. O teste usa a
        // sessão do browser contra a função real e devolve a resposta sem
        // enfraquecer o CORS do ambiente publicado.
        const upstream = await fetch(`${supabaseUrl}/functions/v1/helpdesk-queue`, {
          method: 'POST',
          headers: {
            apikey: publishableKey,
            Authorization: route.request().headers()['authorization'],
            'Content-Type': 'application/json',
          },
          body: route.request().postData(),
        });
        return route.fulfill({ status: upstream.status, contentType: 'application/json', body: await upstream.text() });
      }
      if (body.action !== 'fetch_queue') return route.continue();
      const isNegative = body.queue_type === 'negativas';
      const isChild = body.queue_type === 'filhos';
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          tickets: isNegative ? [{
            ticket_id: ticketId,
            subject: 'Atendimento de qualidade com assunto extenso para testar a largura do cabeçalho',
            agent_name: 'Atendente de Suporte', csat_status: 'bad', status: 'solved',
            ticket_date: '2026-09-22T12:00:00Z', tags: ['tef'],
          }] : isChild ? [{
            ticket_id: '170790', parent_ticket_id: '170718',
            subject: 'Ticket Nova Demanda do #170718',
            agent_name: 'Raphaela Serpa', status: 'solved',
            ticket_date: '2026-09-15T10:25:00Z', tags: ['nova_demanda'],
            child_evaluation: {
              status: 'conforme', detected_type: 'nova_demanda',
              summary: 'Parecer disponível para inspeção do diálogo.', checks: [], recommendations: [],
            },
          }] : [],
          next_cursor: null, has_more: false,
        }),
      });
    });
    await page.route('**/rest/v1/rpc/assign_queue_tickets', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/queue_ticket_assignments?*', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{
        ticket_id: ticketId, queue_type: 'negativas', assigned_to: monitors[0].id,
        status: 'pending', assignment_source: 'automatic', started_at: null, started_by: null,
      }]),
    }));
    await page.goto(baseURL || '/');
    await page.getByText('Filas de Triagem', { exact: true }).first().click();
    const ticket = page.getByText(`#${ticketId}`, { exact: true });
    await expect(ticket).toBeVisible({ timeout: 30_000 });
    const card = ticket.locator('xpath=ancestor::div[contains(@class,"rounded-card")][1]');
    await expect(card.getByRole('button', { name: /alterar monitor/i })).toBeVisible();
    await expect(card.getByText(monitors[0].name, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /redistribuir pendentes/i })).toHaveCount(0);

    for (const width of [1920, 1280, 820, 640]) {
      await page.setViewportSize({ width, height: 900 });
      const geometry = await card.evaluate((element, monitorName) => {
        const bounds = (node: Element) => {
          const r = node.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        };
        const header = element.firstElementChild!;
        const nodes = [
          element.querySelector('input[type="checkbox"]'),
          [...element.querySelectorAll('span')].find(node => node.textContent === '#999999001'),
          [...element.querySelectorAll('span')].find(node => node.textContent === monitorName),
          [...element.querySelectorAll('button')].find(node => node.textContent?.includes('Alterar monitor')),
          [...element.querySelectorAll('span')].find(node => node.textContent === 'CSAT Ruim'),
        ].filter((node): node is Element => Boolean(node));
        return {
          cardWidth: element.clientWidth, cardScrollWidth: element.scrollWidth,
          headerWidth: header.clientWidth, headerScrollWidth: header.scrollWidth, boxes: nodes.map(bounds),
        };
      }, monitors[0].name);
      expect(geometry.cardScrollWidth, `overflow no card em ${width}px`).toBeLessThanOrEqual(geometry.cardWidth + 1);
      expect(geometry.headerScrollWidth, `overflow no cabeçalho em ${width}px`).toBeLessThanOrEqual(geometry.headerWidth + 1);
      for (let index = 0; index < geometry.boxes.length; index++) {
        for (let next = index + 1; next < geometry.boxes.length; next++) {
          const a = geometry.boxes[index]; const b = geometry.boxes[next];
          const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
            && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
          expect(overlap, `elementos ${index}/${next} sobrepostos em ${width}px`).toBe(false);
        }
      }
      if (width === 1280 || width === 640) await page.screenshot({ path: `test-results/queue-card-${width}.png`, fullPage: false });
    }

    // O estado do job e o rascunho chegam ao responsável atual sem refresh.
    const claimed = await adminRequest<Array<{ job_id: string; claimed: boolean }>>('/rest/v1/rpc/claim_ai_evaluation_job', {
      method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ p_ticket_id: ticketId, p_evaluation_type: 'atendimento' }),
    });
    expect(claimed[0].claimed).toBe(true);
    const started = await adminRequest<boolean>('/rest/v1/rpc/begin_ai_evaluation_execution', {
      method: 'POST', body: JSON.stringify({ p_job_id: claimed[0].job_id, p_caller_id: admin.id }),
    });
    expect(started).toBe(true);
    await expect(card.getByText('Analisando com IA...')).toBeVisible({ timeout: 15_000 });
    await adminRequest<unknown>('/rest/v1/rpc/complete_ai_evaluation_execution', {
      method: 'POST', body: JSON.stringify({
        p_job_id: claimed[0].job_id, p_caller_id: admin.id,
        p_result: { summary: 'Resultado E2E', score: 100 },
        p_draft: { form_id: null, agent_name: 'Atendente E2E', guideline_ids: [] },
      }),
    });
    await expect(card.getByRole('button', { name: /verificar avaliação/i })).toBeVisible({ timeout: 15_000 });

    // O card mostra o instante em São Paulo; a conversa usa o Zendesk real.
    await page.getByRole('button', { name: /chamados filhos/i }).click();
    await expect(page.getByText('#170790', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('15/09/2026, 07:25', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Ver Parecer IA' }).click();
    const isParentDialogueRequest = (request: { url(): string; postDataJSON(): unknown }) => {
      if (!request.url().includes('/functions/v1/helpdesk-queue')) return false;
      const body = request.postDataJSON() as { action?: string; ticket_id?: string };
      return body.action === 'fetch_dialogue' && String(body.ticket_id) === '170718';
    };
    const dialogueResponse = page.waitForResponse(response => {
      if (!response.url().includes('/functions/v1/helpdesk-queue')) return false;
      const body = response.request().postDataJSON() as { action?: string; ticket_id?: string };
      return body.action === 'fetch_dialogue' && String(body.ticket_id) === '170718';
    }, { timeout: 45_000 });
    const dialogueFailure = page.waitForEvent('requestfailed', {
      predicate: request => isParentDialogueRequest(request), timeout: 45_000,
    }).then(request => { throw new Error(`fetch_dialogue failed: ${request.failure()?.errorText}`); });
    await page.getByRole('button', { name: /conversa do pai/i }).click();
    const zendeskResponse = await Promise.race([dialogueResponse, dialogueFailure]);
    expect(zendeskResponse.status()).toBe(200);
    const data = await zendeskResponse.json() as {
      comments: Array<{ author_name: string; author_role: string; is_public: boolean; created_at: string }>;
    };
    const agentCount = data.comments.filter(comment => comment.is_public && comment.author_role === 'agent').length;
    const clientCount = data.comments.filter(comment => comment.is_public && comment.author_role === 'end_user').length;
    const internalCount = data.comments.filter(comment => !comment.is_public).length;
    expect(data.comments.filter(comment => comment.author_name === 'Raphaela Serpa')).not.toHaveLength(0);
    expect(data.comments.filter(comment => comment.author_name === 'Raphaela Serpa')
      .every(comment => comment.author_role === 'agent')).toBe(true);
    expect(clientCount).toBeGreaterThan(0);
    expect(internalCount).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: `Todas (${data.comments.length})` })).toBeVisible();
    await expect(page.getByRole('button', { name: `Cliente (${clientCount})` })).toBeVisible();
    await expect(page.getByRole('button', { name: `Atendente (${agentCount})` })).toBeVisible();
    await expect(page.getByRole('button', { name: `Internas (${internalCount})` })).toBeVisible();
    const drawer = page.getByTestId('ticket-dialogue-drawer');
    await page.getByRole('button', { name: `Atendente (${agentCount})` }).click();
    await expect(drawer.getByText('Raphaela Serpa', { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: 'test-results/queue-conversation-parent.png', fullPage: false });
    await page.getByRole('button', { name: `Cliente (${clientCount})` }).click();
    await expect(drawer.getByText('Raphaela Serpa', { exact: true })).toHaveCount(0);
  } finally {
    await context.close();
    await cleanupLiveE2EFixture(supabaseUrl, serviceRoleKey, admin.id, ticketId);
  }
});
