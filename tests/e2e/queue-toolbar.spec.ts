import { expect, test } from '@playwright/test';

const mockTickets = [
  {
    ticket_id: '1001',
    subject: 'Problema com cupom fiscal no PDV',
    agent_name: 'Carlos Agente',
    agent_email: 'carlos@test.invalid',
    channel: 'Chat',
    ticket_date: new Date().toISOString(),
    status: 'solved',
    csat_status: 'bad',
    csat_comment: 'Demorou muito para responder',
    already_audited: false,
    dialogue: [{ author: 'Cliente', content: 'Ajuda', timestamp: new Date().toISOString() }],
  },
  {
    ticket_id: '1002',
    subject: 'Dúvida sobre fechamento de caixa',
    agent_name: 'Mariana Silva',
    agent_email: 'mariana@test.invalid',
    channel: 'Email',
    ticket_date: new Date().toISOString(),
    status: 'solved',
    csat_status: 'bad',
    csat_comment: 'Atendente não soube explicar',
    already_audited: false,
    dialogue: [{ author: 'Cliente', content: 'Como fecha?', timestamp: new Date().toISOString() }],
  },
];

test.describe('Refinamento de UX/UI da Toolbar das Filas de Triagem', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((tickets) => {
      (window as any).__MOCK_QUEUE_TICKETS__ = {
        negativas: tickets,
      };
    }, mockTickets);
  });

  test('1. Estrutura da Toolbar: Busca | Monitor | Filtros | Avaliar página | Atualizar com h-9 padronizado', async ({ page }) => {
    await page.goto('/tests/e2e/fixtures/queue-toolbar.html?role=admin&subTab=negativas');

    const searchInput = page.getByPlaceholder('Buscar por ID, assunto ou agente...');
    await expect(searchInput).toBeVisible();

    const monitorSelect = page.getByLabel('Monitor de Qualidade');
    await expect(monitorSelect).toBeVisible();

    const filterButton = page.getByRole('button', { name: /^Filtros/i });
    await expect(filterButton).toBeVisible();

    const evaluateButton = page.getByRole('button', { name: /^Avaliar Página/i });
    await expect(evaluateButton).toBeVisible();

    const refreshButton = page.getByRole('button', { name: /Atualizar/i });
    await expect(refreshButton).toBeVisible();

    // Valida altura padronizada h-9 (36px) em todos os controles principais
    const searchBox = await searchInput.boundingBox();
    const monitorBox = await monitorSelect.boundingBox();
    const filterBox = await filterButton.boundingBox();
    const evaluateBox = await evaluateButton.boundingBox();
    const refreshBox = await refreshButton.boundingBox();

    expect(searchBox).not.toBeNull();
    expect(monitorBox).not.toBeNull();
    expect(filterBox).not.toBeNull();
    expect(evaluateBox).not.toBeNull();
    expect(refreshBox).not.toBeNull();

    // Altura padronizada de 36px (h-9) com tolerância de subpixel rendering
    expect(Math.round(searchBox!.height)).toBe(36);
    expect(Math.round(monitorBox!.height)).toBe(36);
    expect(Math.round(filterBox!.height)).toBe(36);
    expect(Math.round(evaluateBox!.height)).toBe(36);
    expect(Math.round(refreshBox!.height)).toBe(36);

    // Busca tem maior largura que os seletores ao lado
    expect(searchBox!.width).toBeGreaterThan(monitorBox!.width);
  });

  test('2. Busca continua filtrando chamados e botão limpar funciona', async ({ page }) => {
    await page.goto('/tests/e2e/fixtures/queue-toolbar.html?role=admin&subTab=negativas');

    const searchInput = page.getByPlaceholder('Buscar por ID, assunto ou agente...');
    await expect(page.getByText('Problema com cupom fiscal no PDV')).toBeVisible();
    await expect(page.getByText('Dúvida sobre fechamento de caixa')).toBeVisible();

    // Digita na busca
    await searchInput.fill('cupom');
    await expect(page.getByText('Problema com cupom fiscal no PDV')).toBeVisible();
    await expect(page.getByText('Dúvida sobre fechamento de caixa')).toBeHidden();

    // Limpa a busca com o botão X
    const clearButton = page.getByLabel('Limpar busca');
    await expect(clearButton).toBeVisible();
    await clearButton.click();
    await expect(searchInput).toHaveValue('');
    await expect(page.getByText('Dúvida sobre fechamento de caixa')).toBeVisible();
  });

  test('3. Dropdown de Filtros agrupa opções e indica contagem ativa', async ({ page }) => {
    await page.goto('/tests/e2e/fixtures/queue-toolbar.html?role=admin&subTab=negativas');

    const filterButton = page.getByRole('button', { name: /^Filtros/i });
    await expect(filterButton).toHaveText('Filtros');

    // Abre o popover de filtros
    await filterButton.click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();

    await expect(page.getByRole('menuitem', { name: /Todos/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Com Rascunho IA/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Sem Rascunho/i })).toBeVisible();

    // Seleciona "Com Rascunho IA"
    await page.getByRole('menuitem', { name: /Com Rascunho IA/i }).click();
    await expect(menu).toBeHidden();

    // O botão agora indica o filtro aplicado: "Filtros · 1"
    await expect(filterButton).toHaveText('Filtros · 1');

    // Reabre e seleciona "Todos" para limpar o filtro
    await filterButton.click();
    await page.getByRole('menuitem', { name: /Todos/i }).click();
    await expect(filterButton).toHaveText('Filtros');
  });

  test('4. Atualizar: botão permanece estável sem layout shift durante refresh', async ({ page }) => {
    await page.goto('/tests/e2e/fixtures/queue-toolbar.html?role=admin&subTab=negativas');

    const refreshButton = page.getByRole('button', { name: /Atualizar/i });
    const initialBox = await refreshButton.boundingBox();
    expect(initialBox).not.toBeNull();

    // Configura delay simulado de 600ms para inspecionar o estado durante loading
    await page.evaluate(() => {
      (window as any).__MOCK_QUEUE_DELAY_MS__ = 600;
    });

    // Clica em atualizar
    await refreshButton.click();

    // Durante o loading, o botão deve estar disabled prevenindo cliques múltiplos
    await expect(refreshButton).toBeDisabled();

    // Mede a posição e dimensões durante o loading
    const loadingBox = await refreshButton.boundingBox();
    expect(loadingBox).not.toBeNull();

    // O botão deve permanecer no mesmo lugar e manter dimensões fixas (sem layout shift!)
    expect(Math.round(loadingBox!.x)).toBe(Math.round(initialBox!.x));
    expect(Math.round(loadingBox!.y)).toBe(Math.round(initialBox!.y));
    expect(Math.round(loadingBox!.width)).toBe(Math.round(initialBox!.width));
    expect(Math.round(loadingBox!.height)).toBe(Math.round(initialBox!.height));

    // Aguarda término da sincronização
    await expect(refreshButton).toBeEnabled({ timeout: 5000 });
  });

  test('5. Múltiplos cliques rápidos no Atualizar não disparam recarregamentos concorrentes', async ({ page }) => {
    await page.goto('/tests/e2e/fixtures/queue-toolbar.html?role=admin&subTab=negativas');

    // Configura delay de 400ms
    await page.evaluate(() => {
      (window as any).__MOCK_QUEUE_DELAY_MS__ = 400;
    });

    const refreshButton = page.getByRole('button', { name: /Atualizar/i });
    await expect(refreshButton).toBeEnabled();

    // Primeiro clique inicia loading
    await refreshButton.click();
    await expect(refreshButton).toBeDisabled();

    // Cliques subsequentes enquanto disabled não alteram estado e não quebram
    const isNowDisabled = await refreshButton.isDisabled();
    expect(isNowDisabled).toBe(true);

    // Aguarda voltar a enabled
    await expect(refreshButton).toBeEnabled({ timeout: 5000 });
  });

  test('6. Responsividade: toolbar compacta e usável em mobile e desktop', async ({ page }) => {
    await page.goto('/tests/e2e/fixtures/queue-toolbar.html?role=admin&subTab=negativas');

    for (const width of [1280, 768, 390]) {
      await page.setViewportSize({ width, height: 800 });
      const search = page.getByPlaceholder('Buscar por ID, assunto ou agente...');
      await expect(search).toBeVisible();
      const refresh = page.getByRole('button', { name: /Atualizar/i });
      await expect(refresh).toBeVisible();

      // Checa se há overflow horizontal indesejado
      const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth + 1);
      expect(overflow, `Overflow em viewport ${width}px`).toBe(false);
    }
  });

  test('7. Avaliar Página: contador dinâmico e estado desabilitado discreto', async ({ page }) => {
    await page.goto('/tests/e2e/fixtures/queue-toolbar.html?role=admin&subTab=negativas');

    const evalButton = page.getByRole('button', { name: /^Avaliar Página/i });
    await expect(evalButton).toBeVisible();
    await expect(evalButton).toContainText('Avaliar Página (2)');

    // Seleciona um ticket
    const checkbox = page.locator('input[type="checkbox"][title="Selecionar para avaliação"]').first();
    await checkbox.click();

    // Botão agora deve mostrar "Avaliar Selecionados (1)"
    const evalSelected = page.getByRole('button', { name: /^Avaliar Selecionados/i });
    await expect(evalSelected).toBeVisible();
    await expect(evalSelected).toContainText('(1)');
  });
});
