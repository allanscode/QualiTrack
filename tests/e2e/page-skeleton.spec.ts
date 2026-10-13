import { expect, test } from '@playwright/test';

for (const dark of [false, true]) {
  for (const width of [390, 1320]) {
    test(`skeleton visível sem overflow: ${width}px, ${dark ? 'escuro' : 'claro'}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: dark ? 'dark' : 'light' });
      await page.goto(`/tests/e2e/fixtures/page-skeleton.html${dark ? '?dark' : ''}`);
      await expect(page.getByRole('status', { name: 'Carregando dashboard' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      expect(await page.locator('[aria-hidden] .rounded-lg').first().evaluate(node => getComputedStyle(node).animationName)).toBe('none');
      await page.screenshot({ path: testInfo.outputPath('skeleton.png'), fullPage: true });
    });
  }
}
