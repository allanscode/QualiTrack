import { expect, test } from '@playwright/test';
import { spawnSync } from 'node:child_process';

test('Administrador consegue alterar o monitor e a troca aparece imediatamente', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/assignment.html?role=admin', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Alterar monitor' }).click();
  await expect(page.getByRole('dialog', { name: 'Alterar monitor' })).toBeVisible();
  await page.getByLabel('Novo responsável').selectOption('monitor-2');
  await page.getByRole('button', { name: 'Transferir ticket' }).click();
  await expect(page.getByTestId('current-owner')).toHaveText('Gabriel Dias Di Napoli');
  await expect(page.getByTestId('observer-owner')).toHaveText('Gabriel Dias Di Napoli');
});

test('Supervisor de Qualidade consegue alterar o monitor', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/assignment.html?role=gestor_qualidade', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Alterar monitor' })).toBeVisible();
  await page.getByRole('button', { name: 'Alterar monitor' }).click();
  await expect(page.getByRole('dialog', { name: 'Alterar monitor' })).toBeVisible();
});

test('Monitor comum não recebe a ação de alteração', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/assignment.html?role=qualidade', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Alterar monitor' })).toHaveCount(0);
});

test('Ticket em avaliação exige confirmação antes da transferência', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/assignment.html?role=admin&status=in_progress', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Alterar monitor' }).click();
  await page.getByRole('button', { name: 'Transferir ticket' }).click();
  await expect(page.getByText('Avaliação em andamento')).toBeVisible();
  await expect(page.getByTestId('current-owner')).toHaveText('Vinícius Gouvêa');
  await page.getByRole('button', { name: 'Confirmar transferência' }).click();
  await expect(page.getByTestId('current-owner')).toHaveText('Gabriel Dias Di Napoli');
});

test('backend preserva manual, redistribui offline e impede dois monitores', async () => {
  const result = spawnSync(process.execPath, ['--test', 'scripts/presence-distribution.test.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  expect(result.stdout).toContain('balanceamento preserva atribuição manual');
  expect(result.stdout).toContain('atribuição manual pendente volta ao balanceamento');
  expect(result.stdout).toContain('mantém um único responsável');
});
