import { test, expect } from '@playwright/test';
import { cleanupE2EData, seed, sql } from './helpers/admin';
import { e2eUser } from './helpers/env';
import { callEdge } from './helpers/edge';

// F1 — modelo de dados + contas (multi-conta). docs/PLANO-CAMPANHAS.md §8.
test.describe('F1 · contas e modelo de dados', () => {
  test.beforeEach(async () => { await cleanupE2EData(); });
  test.afterAll(async () => { await cleanupE2EData(); });

  async function openAccounts(page: import('@playwright/test').Page) {
    await page.goto('/configuracoes');
    await page.getByRole('tab', { name: 'Contas' }).click();
    await expect(page.getByText('Contas conectadas')).toBeVisible();
  }

  async function addLinkedIn(page: import('@playwright/test').Page, label: string) {
    await page.getByRole('button', { name: 'Adicionar conta do LinkedIn' }).click();
    await page.getByLabel('Nome da conta').fill(label);
    await page.getByLabel('Token de acesso').fill('fake-token-e2e');
    await page.getByLabel('URN do autor').fill(`urn:li:person:${label.replace(/\s/g, '')}`);
    await page.getByRole('button', { name: 'Salvar conta' }).click();
    await expect(page.getByTestId('account-row').filter({ hasText: `LinkedIn · ${label}` })).toBeVisible();
  }

  test('adiciona conta do LinkedIn e ela vira a padrão', async ({ page }) => {
    await openAccounts(page);
    await expect(page.getByTestId('accounts-empty')).toBeVisible();
    await addLinkedIn(page, 'E2E LinkedIn');
    const row = page.getByTestId('account-row').filter({ hasText: 'E2E LinkedIn' });
    await expect(row.getByText('Padrão')).toBeVisible();

    const { id } = e2eUser();
    const rows = await sql<{ label: string; is_default: boolean; user_id: string }>(
      `select label, is_default, user_id from social_accounts where user_id='${id}'`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: 'E2E LinkedIn', is_default: true, user_id: id });
  });

  test('segunda conta e troca da padrão', async ({ page }) => {
    await openAccounts(page);
    await addLinkedIn(page, 'Conta A');
    await addLinkedIn(page, 'Conta B');
    const rowB = page.getByTestId('account-row').filter({ hasText: 'Conta B' });
    await rowB.getByRole('button', { name: 'Tornar padrão' }).click();
    await expect(rowB.getByText('Padrão')).toBeVisible();

    const { id } = e2eUser();
    const rows = await sql<{ label: string; is_default: boolean }>(
      `select label, is_default from social_accounts where user_id='${id}' order by label`);
    expect(rows).toEqual([{ label: 'Conta A', is_default: false }, { label: 'Conta B', is_default: true }]);
  });

  test('remove conta', async ({ page }) => {
    await openAccounts(page);
    await addLinkedIn(page, 'Para remover');
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Remover Para remover' }).click();
    await expect(page.getByTestId('accounts-empty')).toBeVisible();
    const { id } = e2eUser();
    expect(await sql(`select 1 from social_accounts where user_id='${id}'`)).toHaveLength(0);
  });

  test('publicação usa as credenciais da CONTA da peça (backend real)', async ({ page }) => {
    await page.goto('/');
    const accountId = await seed('social_accounts', { platform: 'linkedin', label: 'Sem Token', status: 'connected' });
    const postId = await seed('user_posts', {
      platform: 'linkedin', format: 'image', status: 'approved', caption: 'Peça de teste E2E', account_id: accountId,
    });
    const res = await callEdge<{ success: boolean; error: string }>(page, 'publish-post', { post_id: postId });
    expect(res.json.success).toBe(false);
    const [row] = await sql<{ publish_error: string }>(`select publish_error from user_posts where id='${postId}'`);
    expect(row.publish_error).toContain('A conta "Sem Token" está sem token do LinkedIn');
  });

  test('peça SEM conta mantém o comportamento antigo (user_settings)', async ({ page }) => {
    await page.goto('/');
    const postId = await seed('user_posts', {
      platform: 'linkedin', format: 'image', status: 'approved', caption: 'Peça legado E2E',
    });
    const res = await callEdge<{ success: boolean }>(page, 'publish-post', { post_id: postId });
    expect(res.json.success).toBe(false);
    const [row] = await sql<{ publish_error: string }>(`select publish_error from user_posts where id='${postId}'`);
    expect(row.publish_error).toContain('LinkedIn nao configurado');
  });

  test('conta "via Integrações" publica com as credenciais de user_settings (fonte única)', async ({ page }) => {
    await page.goto('/');
    const accountId = await seed('social_accounts', { platform: 'linkedin', label: 'Principal', status: 'connected', is_default: true, metadata: { source: 'integrations' } });
    const postId = await seed('user_posts', {
      platform: 'linkedin', format: 'image', status: 'approved', caption: 'Peça via integrações E2E', account_id: accountId,
    });
    const res = await callEdge<{ success: boolean }>(page, 'publish-post', { post_id: postId });
    expect(res.json.success).toBe(false);
    const [row] = await sql<{ publish_error: string }>(`select publish_error from user_posts where id='${postId}'`);
    // o usuário de teste não tem LinkedIn em Integrações → cai na mensagem de Integrações, não na da conta
    expect(row.publish_error).toContain('LinkedIn nao configurado');
  });

  test('tabelas novas têm RLS por dono', async () => {
    const rows = await sql<{ tablename: string; qual: string }>(
      `select tablename, qual from pg_policies where tablename in ('social_accounts','campaigns','campaign_cycles','ideas','contents','post_metrics') order by 1`);
    expect(rows.map((r) => r.tablename)).toEqual(['campaign_cycles', 'campaigns', 'contents', 'ideas', 'post_metrics', 'social_accounts']);
    for (const r of rows) expect(r.qual).toContain('auth.uid() = user_id');
  });
});
