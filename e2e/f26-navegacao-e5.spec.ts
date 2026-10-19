import { test, expect } from '@playwright/test';
import { cleanupE2EData, seed } from './helpers/admin';
import { seedAccounts, seedCampaign } from './helpers/fixtures';
import { e2eUser } from './helpers/env';

// F26 — Estabilização E5 (doc 04): retorno previsível, login que preserva a tarefa, Produção que não
// assume a primeira campanha, erro ≠ vazio, menu no celular, aviso ao sair com edição e "Continuar".
test.describe('F26 · Navegação, orientação e retomada (E5)', () => {
  test.beforeEach(async () => { await cleanupE2EData(); });
  test.afterAll(async () => { await cleanupE2EData(); });

  const piece = (title = 'Peça de navegação') => seed('user_posts', {
    platform: 'linkedin', format: 'image', status: 'pending_approval', title, caption: 'Legenda', carousel_text: { quote: title },
    rendered_slides: { slide1: 'https://example.com/x.jpg' }, metadata: { editorial_slug: 'diagnostico-sistemico' },
  });

  test('Voltar: editor aberto direto vai aos conteúdos com foco; Criar e Nova campanha têm destino próprio (04/T01, T02, T05)', async ({ page }) => {
    const pid = await piece();
    await page.goto(`/posts/${pid}`);
    await page.getByRole('button', { name: 'Voltar aos conteúdos' }).click();
    await expect(page).toHaveURL(/\/pipeline/);
    await page.goto('/criar');
    await page.getByRole('button', { name: /voltar/i }).first().click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/campanhas/nova');
    await page.getByRole('button', { name: /voltar/i }).first().click();
    await expect(page).toHaveURL(/\/campanhas$/);
  });

  test('editor aberto pela agenda volta para a agenda com a peça em foco (04/T03)', async ({ page }) => {
    const acc = await seedAccounts();
    const when = new Date(Date.now() + 2 * 864e5).toISOString();
    const pid = await seed('user_posts', { platform: 'linkedin', format: 'image', status: 'scheduled', scheduled_date: when, title: 'Da agenda', caption: 'L',
      carousel_text: { quote: 'Da agenda' }, rendered_slides: { slide1: 'https://example.com/x.jpg' }, account_id: acc.linkedin, metadata: { editorial_slug: 'diagnostico-sistemico' } });
    await page.goto(`/agenda?focus=${pid}`);
    await page.getByTestId('piece-panel').getByRole('button', { name: /Editar/ }).click();
    await expect(page).toHaveURL(new RegExp(`/posts/${pid}`));
    await page.getByRole('button', { name: 'Voltar à agenda' }).click();
    await expect(page.getByTestId('piece-panel')).toBeVisible();
    await expect(page.getByTestId('piece-panel')).toContainText('Da agenda');
  });

  test('Produção com várias campanhas e sem trabalho anterior: não abre a primeira por conta própria (04/T09)', async ({ page }) => {
    await page.addInitScript(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('hive.lastWork')) localStorage.removeItem(k); });
    await seedCampaign({ weeks: 2, name: 'Campanha A' });
    await seedCampaign({ weeks: 2, name: 'Campanha B' });
    await page.goto('/producao');
    await expect(page.getByTestId('choose-work')).toContainText('Escolha em qual campanha');
    await expect(page).not.toHaveURL(/campaign=/);
  });

  test('falha ao carregar não vira "nada aqui"; Tentar novamente só consulta (04/T18, T31)', async ({ page }) => {
    let fail = true;
    await page.route('**/rest/v1/campaigns*', (route) => (fail ? route.fulfill({ status: 500, body: '{"message":"falha simulada"}' }) : route.continue()));
    await page.goto('/');
    await expect(page.getByTestId('load-error')).toContainText('Não foi possível carregar');
    await expect(page.getByTestId('stat-campaigns')).toHaveCount(0);
    fail = false;
    await page.getByRole('button', { name: 'Tentar novamente' }).click();
    await expect(page.getByTestId('stat-campaigns')).toBeVisible();
  });

  test('celular: o mesmo menu em gaveta, com navegação por toque (04/T28)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByTestId('mobile-menu').click();
    await page.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: 'Agenda' }).click();
    await expect(page).toHaveURL(/\/agenda/);
    await expect(page.getByRole('navigation', { name: 'Menu principal' })).toHaveCount(0);   // gaveta fecha
  });

  test('sair com edição pendente pergunta; "Continuar editando" fica, "Sair sem salvar" sai (04/T20–T21)', async ({ page }) => {
    const pid = await piece();
    await page.goto(`/posts/${pid}`);
    await page.locator('#caption').fill('Edição não salva');
    await page.getByRole('link', { name: 'Agenda' }).first().click();
    await expect(page.getByTestId('leave-dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Continuar editando' }).click();
    await expect(page).toHaveURL(new RegExp(`/posts/${pid}`));
    await expect(page.locator('#caption')).toHaveValue('Edição não salva');
    await page.locator('#caption').fill('Edição não salva 2');
    await page.getByRole('link', { name: 'Agenda' }).first().click();
    await page.getByRole('button', { name: 'Sair sem salvar' }).click();
    await expect(page).toHaveURL(/\/agenda/);
  });

  test('Início mostra "Continuar" com o último trabalho aberto (04 §6.1)', async ({ page }) => {
    const pid = await piece('Peça que eu estava revisando');
    await page.goto(`/posts/${pid}`);
    await expect(page.locator('#caption')).toBeVisible();
    await page.goto('/');
    await expect(page.getByTestId('home-resume')).toContainText('Peça que eu estava revisando');
    await page.getByTestId('home-resume').getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`/posts/${pid}`));
  });
});

test.describe('F26 · login preserva a tarefa (04/T06, T07)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('link de peça sem sessão → login → volta para a peça; destino externo é ignorado', async ({ page }) => {
    const pid = await seed('user_posts', { platform: 'linkedin', format: 'image', status: 'pending_approval', title: 'Link direto', caption: 'L', carousel_text: { quote: 'Link direto' }, metadata: {} });
    const { email, password } = e2eUser();
    await page.goto(`/posts/${pid}`);
    await expect(page).toHaveURL(/\/login\?next=/);
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: /Entrar/i }).click();
    await expect(page).toHaveURL(new RegExp(`/posts/${pid}`));
    // destino manipulado (externo / protocolo) não é seguido
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await page.goto('/login?next=' + encodeURIComponent('//evil.example.com/x'));
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: /Entrar/i }).click();
    await expect(page).toHaveURL(/localhost:\d+\/$/);
  });
});
