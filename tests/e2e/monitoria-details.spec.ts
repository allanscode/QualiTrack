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
