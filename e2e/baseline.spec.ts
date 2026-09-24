import { test, expect } from '@playwright/test';

// Linha de base do sistema ATUAL (antes da migração). Prova que o harness
// funciona e que as telas principais carregam. Ao longo das fases estes testes
// são substituídos pelos da nova estrutura.
test.describe('baseline — sistema atual', () => {
  test('dashboard carrega com o pipeline editorial', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Pipeline editorial')).toBeVisible();
  });

  test('agenda carrega', async ({ page }) => {
    await page.goto('/agenda');
    await expect(page.getByRole('button', { name: /hoje/i }).first()).toBeVisible();
  });

  test('configurações mostram as chaves de API', async ({ page }) => {
    await page.goto('/configuracoes');
    await page.getByRole('tab', { name: /integra/i }).click();
    await expect(page.getByText('Chaves de API')).toBeVisible();
  });
});
