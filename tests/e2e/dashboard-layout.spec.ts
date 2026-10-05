import { expect, test } from '@playwright/test';

for (const preview of [false, true]) {
  test(`cards e gráficos preenchem a largura no desktop (${preview ? 'prévia' : 'dashboard'})`, async ({ page }) => {
    await page.setViewportSize({ width: 1320, height: 900 });
    await page.goto(`/tests/e2e/fixtures/dashboard-layout.html${preview ? '?preview' : ''}`);
    const cards = page.locator('.dashboard-tile-grid > [data-dashboard-kind="card"]:visible');
    const charts = page.locator('.dashboard-tile-grid > [data-dashboard-kind="chart"]:visible');
    await expect(cards).toHaveCount(10);
    await expect(charts).toHaveCount(2);

    const lastCard = await cards.nth(9).boundingBox();
    const previousCard = await cards.nth(8).boundingBox();
    const firstChart = await charts.first().boundingBox();
    const secondChart = await charts.nth(1).boundingBox();
    expect(lastCard && previousCard && firstChart && secondChart).toBeTruthy();
    expect(Math.abs(lastCard!.y - previousCard!.y)).toBeLessThan(2);
    expect(previousCard!.width).toBeGreaterThan(240);
    expect(Math.abs(firstChart!.y - lastCard!.y)).toBeLessThan(2);
    expect(firstChart!.x).toBeGreaterThan(lastCard!.x + lastCard!.width);
    expect(firstChart!.width).toBeGreaterThan(500);
    expect(secondChart!.y).toBeGreaterThan(lastCard!.y + lastCard!.height);
    expect(Math.abs(secondChart!.x - previousCard!.x)).toBeLessThan(2);
    const chartContent = await charts.first().locator('[data-dashboard-tile-content] > div').boundingBox();
    expect(chartContent!.y + chartContent!.height).toBeLessThanOrEqual(firstChart!.y + firstChart!.height + 2);
  });
}

test('painel intermediário reorganiza os itens em duas colunas', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto('/tests/e2e/fixtures/dashboard-layout.html?preview');
  const cards = page.locator('.dashboard-tile-grid > [data-dashboard-kind="card"]:visible');
  const charts = page.locator('.dashboard-tile-grid > [data-dashboard-kind="chart"]:visible');
  await expect(cards).toHaveCount(10);
  await expect(charts).toHaveCount(2);
  const lastCard = await cards.last().boundingBox();
  const firstChart = await charts.first().boundingBox();
  expect(lastCard!.width).toBeGreaterThan(400);
  expect(firstChart!.y).toBeGreaterThan(lastCard!.y + lastCard!.height);
  expect(firstChart!.width).toBeGreaterThan(800);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(900);
});

test('no celular a grade usa uma coluna sem rolagem horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tests/e2e/fixtures/dashboard-layout.html?preview');
  const cards = page.locator('.dashboard-tile-grid > [data-dashboard-kind="card"]:visible');
  const charts = page.locator('.dashboard-tile-grid > [data-dashboard-kind="chart"]:visible');
  await expect(cards).toHaveCount(10);
  await expect(charts).toHaveCount(2);
  const firstCard = await cards.first().boundingBox();
  const secondCard = await cards.nth(1).boundingBox();
  const firstChart = await charts.first().boundingBox();
  expect(firstCard!.width).toBeGreaterThan(340);
  expect(secondCard!.y).toBeGreaterThan(firstCard!.y);
  expect(firstChart!.width).toBeGreaterThan(340);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
