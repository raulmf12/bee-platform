import { test as setup, expect } from '@playwright/test';
import { e2eUser } from './helpers/env';

// Loga como o usuário de teste pela TELA de login (o próprio login é um E2E) e
// salva a sessão pros demais specs.
setup('login do usuário de teste', async ({ page }) => {
  const { email, password } = e2eUser();
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page).not.toHaveURL(/\/login|\/onboarding/, { timeout: 30_000 });
  await page.context().storageState({ path: 'e2e/.auth/user.json' });
});
