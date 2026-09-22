import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`progresso da IA fica apenas no card correspondente em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/tests/e2e/fixtures/ai-progress.html');
    const first = page.getByTestId('ticket-170882');
    const second = page.getByTestId('ticket-170896');
    await first.getByRole('button', { name: 'Conferir com IA' }).click();
    await expect(first.getByRole('status')).toContainText('Etapa 1/3');
    await expect(second.getByRole('status')).toHaveCount(0);
    await page.getByTestId('stage-2').evaluate((button: HTMLButtonElement) => button.click());
    await expect(first.getByRole('status')).toHaveText(/Etapa 2\/3 · Analisando com IA/);
    await page.getByTestId('stage-3').evaluate((button: HTMLButtonElement) => button.click());
    await expect(first.getByRole('status')).toContainText('Etapa 3/3');
    await expect(page.getByText(/GLM|OpenRouter/)).toHaveCount(0);
    await expect(page.locator('[data-sonner-toaster]')).toHaveCount(0);
    const button = await first.locator('button').first().boundingBox();
    const card = await first.boundingBox();
    expect(button && card).toBeTruthy();
    expect(button!.x).toBeGreaterThanOrEqual(card!.x);
    expect(button!.x + button!.width).toBeLessThanOrEqual(card!.x + card!.width + 1);
    await page.screenshot({ path: `test-results/ai-progress-${width}.png`, fullPage: true });
  });
}

test('espera e cancelamento ficam no card e permitem reiniciar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/tests/e2e/fixtures/ai-progress.html');
  const first = page.getByTestId('ticket-170882');
  await first.getByRole('button', { name: 'Conferir com IA' }).click();
  await page.getByTestId('waiting').evaluate((button: HTMLButtonElement) => button.click());
  await expect(first.getByRole('status')).toContainText('Nova tentativa agendada');
  await first.getByRole('button', { name: 'Interromper análise' }).click();
  await expect(first.getByRole('status')).toHaveCount(0);
  await first.getByRole('button', { name: 'Conferir com IA' }).click();
  await expect(first.getByRole('status')).toContainText('Etapa 1/3');
});
