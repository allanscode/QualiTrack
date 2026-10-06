import { expect, test } from '@playwright/test';

for (const theme of ['light', 'dark']) {
  for (const width of [390, 1280]) {
    test(`monitoria details stay readable in ${theme} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 });
      await page.goto(`/tests/e2e/fixtures/monitoria-details.html?theme=${theme}`);
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByText('Feedback individual aplicado e alinhamento de conduta realizado.')).toBeVisible();
      const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(horizontalOverflow).toBe(false);
      await page.screenshot({ path: `scratch/monitoria-${theme}-${width}.png`, fullPage: true });
    });
  }
}

for (const width of [390, 1280]) {
  test(`PJ review route remains readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await page.goto('/tests/e2e/fixtures/monitoria-details.html?pj=1');
    await expect(page.getByRole('region', { name: 'Fluxo de aprovação PJ' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aprovar parecer' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reprovar parecer' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await page.screenshot({ path: `scratch/pj-review-${width}.png`, fullPage: true });
    await page.goto('/tests/e2e/fixtures/monitoria-details.html?pj=1&stage=reviewed');
    await expect(page.getByText('Parecer reprovado')).toBeVisible();
    await expect(page.getByText('Decisão final pendente')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await page.goto('/tests/e2e/fixtures/monitoria-details.html?pj=1&stage=manager');
    await expect(page.getByRole('button', { name: 'Enviar aprovação a Victor' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enviar contestação a Victor' })).toHaveCount(0);
  });
}

for (const width of [390, 960]) {
  test(`timeline long notes fit and expand at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await page.goto('/tests/e2e/fixtures/monitoria-details.html?theme=dark&timeline=long');
    const expand = page.getByRole('button', { name: 'Ler observação completa' }).first();
    await expect(expand).toBeVisible();
    const noteId = await expand.getAttribute('aria-controls');
    const collapsedHeight = await page.evaluate(id => document.getElementById(id!)?.getBoundingClientRect().height ?? 0, noteId);
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await page.screenshot({ path: `scratch/monitoria-timeline-${width}.png`, fullPage: true });
    await expand.click();
    await expect(page.getByRole('button', { name: 'Recolher observação' }).first()).toHaveAttribute('aria-expanded', 'true');
    const expandedHeight = await page.evaluate(id => document.getElementById(id!)?.getBoundingClientRect().height ?? 0, noteId);
    expect(expandedHeight).toBeGreaterThan(collapsedHeight);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  });
}
