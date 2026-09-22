import { expect, test } from '@playwright/test';

for (const role of ['admin', 'gestor_qualidade']) {
  test(`${role} filtra monitor online/offline e combina com busca`, async ({ page }) => {
    await page.goto(`/tests/e2e/fixtures/monitor-filter.html?role=${role}`);
    const filter = page.getByLabel('Monitor de Qualidade');
    await expect(filter).toBeVisible();
    await expect(page.getByTestId('ticket')).toHaveCount(2);
    await filter.selectOption('b');
    await expect(page.getByTestId('ticket')).toHaveCount(1);
    await expect(page.getByTestId('ticket').first()).toContainText('#102');
    await expect(page.getByRole('status')).toHaveText('1 encontrado nesta página');
    await page.getByLabel('Buscar').fill('Gabriel');
    await expect(page.getByTestId('ticket')).toHaveCount(0);
    await expect(page.getByText('Nenhum ticket deste monitor nesta página da fila.')).toBeVisible();
    await filter.selectOption('c');
    await expect(page.getByRole('status')).toHaveText('0 encontrados nesta página');
    await filter.selectOption('');
    await page.getByLabel('Buscar').fill('');
    await expect(page.getByTestId('ticket')).toHaveCount(2);
  });
}

test('monitor comum não tem filtro administrativo', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/monitor-filter.html?role=qualidade');
  await expect(page.getByLabel('Monitor de Qualidade')).toHaveCount(0);
});

test('card de monitores é compacto, sem power e não sobrepõe no desktop e tela menor', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/monitor-filter.html?role=admin');
  const panel = page.getByRole('button', { name: /monitores na triagem/i });
  await expect(panel).toBeVisible();
  await expect(page.locator('#queue-monitors-list button')).toHaveCount(3);
  await expect(page.locator('#queue-monitors-list svg')).toHaveCount(0);
  for (const width of [1440, 760, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.locator('#queue-monitors-list').evaluate(element => element.scrollWidth > element.clientWidth + 1);
    expect(overflow, `overflow em ${width}px`).toBe(false);
    await expect(panel).toContainText('1/3 aptos online');
    if (width === 1440 || width === 390) {
      await page.screenshot({ path: `test-results/queue-monitors-${width}.png`, fullPage: false });
    }
  }
  await panel.click();
  await expect(page.locator('#queue-monitors-list')).toBeHidden();
  await panel.click();
  await expect(page.locator('#queue-monitors-list')).toBeVisible();
});
