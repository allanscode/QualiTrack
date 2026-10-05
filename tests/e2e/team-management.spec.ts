import { expect, test } from '@playwright/test';

for (const width of [390, 1280]) {
  test(`team drawer exposes approver and Zendesk groups at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/tests/e2e/fixtures/team-management.html');
    await expect(page.getByText('1 agente CLT ainda na WebPosto principal.', { exact: false })).toBeVisible();
    await page.getByRole('heading', { name: 'Cliente Final', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Gestor das aprovações' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Gestor das aprovações' })).toContainText('Ana Karolina');
    await expect(page.getByRole('heading', { name: 'Grupos do Zendesk (2)' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remover grupo Cliente Final desta equipe' })).toBeVisible();
    const groupPicker = page.getByRole('combobox', { name: 'Adicionar grupo do Zendesk' });
    await groupPicker.scrollIntoViewIfNeeded();
    await groupPicker.click();
    await expect(page.getByRole('option', { name: 'Escala' })).toBeVisible();
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: `scratch/team-management-${width}.png`, fullPage: true });
  });
}
