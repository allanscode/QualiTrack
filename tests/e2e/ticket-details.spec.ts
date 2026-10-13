import { expect, test } from '@playwright/test';

for (const width of [390, 1320]) {
  test(`detalhes do ticket, grupo e tema automático em ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.goto('/tests/e2e/fixtures/ticket-details.html');
    await expect(page.getByText('Ticket filho').first()).toBeVisible();
    await expect(page.getByText(/Grupo do atendimento:/).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.screenshot({ path: testInfo.outputPath('details-dark.png'), fullPage: true, animations: 'disabled' });
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await page.screenshot({ path: testInfo.outputPath('details-light.png'), fullPage: true, animations: 'disabled' });
  });
}
