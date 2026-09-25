import { expect, test } from '@playwright/test';

test.describe('Navegação e Estrutura das Filas de Triagem', () => {
  test('1 & 2. Filas de Triagem expande/recolhe e cada sub-aba abre a fila correta', async ({ page }) => {
    await page.goto('/tests/e2e/fixtures/queue-navigation.html?role=admin');

    const menuButton = page.getByTestId('filas-menu-button');
    const subitemsContainer = page.getByTestId('queue-subitems-container');
    await expect(subitemsContainer).toBeVisible();

    // Recolhe o menu
    await menuButton.click();
    await expect(subitemsContainer).toBeHidden();

    // Expande novamente
    await menuButton.click();
    await expect(subitemsContainer).toBeVisible();

    // Navega para Fila Proativa
    await page.getByTestId('subitem-proativas').click();
    await expect(page.getByTestId('page-title')).toHaveText('Fila Proativa');
    await expect(page.getByTestId('ticket-201')).toBeVisible();

    // Navega para CSAT Positivas
    await page.getByTestId('subitem-positivas').click();
    await expect(page.getByTestId('page-title')).toHaveText('CSAT Positivas');
    await expect(page.getByTestId('ticket-301')).toBeVisible();

    // Navega para Chamados Filhos
    await page.getByTestId('subitem-filhos').click();
    await expect(page.getByTestId('page-title')).toHaveText('Chamados Filhos');
    await expect(page.getByTestId('ticket-401')).toBeVisible();

    // Navega para Filhos Inválidos
    await page.getByTestId('subitem-filhos_invalidos').click();
    await expect(page.getByTestId('page-title')).toHaveText('Filhos Inválidos');
    await expect(page.getByTestId('ticket-501')).toBeVisible();

    // Navega para CSAT Negativas
    await page.getByTestId('subitem-negativas').click();
    await expect(page.getByTestId('page-title')).toHaveText('CSAT Negativas');
    await expect(page.getByTestId('ticket-101')).toBeVisible();
  });

  test('3, 4 & 5. Títulos dinâmicos, indicadores de cores visíveis e barra antiga de botões ausente', async ({ page }) => {
    await page.goto('/tests/e2e/fixtures/queue-navigation.html?role=admin');

    // Título inicial
    await expect(page.getByTestId('page-title')).toHaveText('CSAT Negativas');
    await expect(page.getByTestId('page-subtitle')).toContainText('CSAT Ruim ou Insatisfeito');

    // Confirma que a barra de botões antigos não está presente no conteúdo principal
    await expect(page.getByRole('button', { name: /CSAT Negativas/i })).toHaveCount(1); // apenas na sidebar
    await expect(page.getByTestId('legacy-queue-buttons-absent')).toBeAttached();

    // Indicador visual de cores (bullets)
    const bulletNegativas = page.locator('[data-testid="subitem-negativas"] span').first();
    await expect(bulletNegativas).toBeVisible();
    await expect(bulletNegativas).toHaveClass(/bg-rose-500/);

    const bulletProativas = page.locator('[data-testid="subitem-proativas"] span').first();
    await expect(bulletProativas).toBeVisible();
    await expect(bulletProativas).toHaveClass(/bg-indigo-500/);

    const bulletPositivas = page.locator('[data-testid="subitem-positivas"] span').first();
    await expect(bulletPositivas).toBeVisible();
    await expect(bulletPositivas).toHaveClass(/bg-emerald-500/);

    const bulletFilhos = page.locator('[data-testid="subitem-filhos"] span').first();
    await expect(bulletFilhos).toBeVisible();
    await expect(bulletFilhos).toHaveClass(/bg-sky-500/);

    const bulletInvalidos = page.locator('[data-testid="subitem-filhos_invalidos"] span').first();
    await expect(bulletInvalidos).toBeVisible();
    await expect(bulletInvalidos).toHaveClass(/bg-amber-500/);
  });

  test('6 & 7. Admin e Gestor de Qualidade visualizam e acessam Monitores na Triagem', async ({ page }) => {
    for (const role of ['admin', 'gestor_qualidade']) {
      await page.goto(`/tests/e2e/fixtures/queue-navigation.html?role=${role}`);

      const subitemMonitores = page.getByTestId('subitem-monitores');
      await expect(subitemMonitores).toBeVisible();

      await subitemMonitores.click();
      await expect(page.getByTestId('page-title')).toHaveText('Monitores na Triagem');
      await expect(page.getByTestId('monitores-panel')).toBeVisible();
      await expect(page.getByTestId('monitor-row-m1')).toBeVisible();
      await expect(page.getByTestId('monitor-row-m2')).toBeVisible();
    }
  });

  test('8 & 9. Monitor comum NÃO visualiza Monitores na Triagem e tentativa direta é bloqueada', async ({ page }) => {
    // Monitor comum carregando página normalmente
    await page.goto('/tests/e2e/fixtures/queue-navigation.html?role=qualidade');
    await expect(page.getByTestId('subitem-monitores')).toHaveCount(0);

    // Tentativa de acessar diretamente a rota/subTab monitores sem permissão
    await page.goto('/tests/e2e/fixtures/queue-navigation.html?role=qualidade&subTab=monitores');
    // Deve ser bloqueado / redirecionado de volta para CSAT Negativas
    await expect(page.getByTestId('subitem-monitores')).toHaveCount(0);
    await expect(page.getByTestId('page-title')).toHaveText('CSAT Negativas');
    await expect(page.getByTestId('ticket-101')).toBeVisible();
  });

  test('10 & 11. Busca continua funcionando e o layout é limpo', async ({ page }) => {
    await page.goto('/tests/e2e/fixtures/queue-navigation.html?role=admin');

    await expect(page.getByTestId('ticket-101')).toBeVisible();
    const searchInput = page.getByTestId('search-input');
    await searchInput.fill('Inexistente');
    await expect(page.getByTestId('ticket-101')).toHaveCount(0);

    await searchInput.fill('101');
    await expect(page.getByTestId('ticket-101')).toHaveCount(1);
  });
});
