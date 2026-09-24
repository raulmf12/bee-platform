import { test, expect, type Page } from '@playwright/test';
import { cleanupE2EData, sql } from './helpers/admin';
import { e2eUser } from './helpers/env';
import { mockCampaignAI } from './helpers/mocks';
import { seedAccounts, seedCampaign } from './helpers/fixtures';

// F2 — Criação de campanha (Telas 02–08), lista e detalhe. IA mockada.
test.describe('F2 · criação de campanha', () => {
  test.beforeEach(async () => { await cleanupE2EData(); });
  test.afterAll(async () => { await cleanupE2EData(); });

  async function goToStrategy(page: Page) {
    await page.goto('/criar');
    await page.getByTestId('create-campaign').click();
    await expect(page).toHaveURL(/\/campanhas\/nova/);
    await expect(page.getByTestId('type-organica')).toHaveAttribute('aria-pressed', 'true');
    await page.getByLabel('Conte para a Hive o que você pretende fazer.').fill('Quero ser referência em liderança sistêmica.');
    await page.getByRole('button', { name: 'Continuar →' }).click();
    await expect(page.getByTestId('moment-label')).toHaveText('Expansão de presença');
    await page.getByRole('button', { name: 'Sim, continuar →' }).click();
    await expect(page.getByTestId('mix-bars')).toBeVisible();
  }

  test('wizard completo: tipo → momento → estratégia → duração → ativa', async ({ page }) => {
    const calls = await mockCampaignAI(page);
    await seedAccounts();
    await goToStrategy(page);
    await expect(page.getByTestId('mix-presenca')).toContainText('35%');
    await expect(page.getByTestId('strategy-rationale')).toContainText('base');
    await page.getByRole('button', { name: 'Usar estratégia recomendada →' }).click();

    await expect(page.getByText('Por quanto tempo vamos trabalhar esta estratégia?')).toBeVisible();
    await expect(page.getByTestId('weeks-8')).toContainText('Recomendado');
    await expect(page.getByTestId('weeks-8')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Continuar →' }).click();

    await expect(page.getByText('Estratégia definida. Agora vamos transformar isso em conteúdo.')).toBeVisible();
    await expect(page.getByTestId('campaign-range')).toContainText('8 semanas');
    await page.getByRole('button', { name: 'Ver estratégia' }).click();
    await expect(page.getByTestId('strategy-matrix')).toContainText('Sem. 1–2');
    await page.getByRole('button', { name: 'Ativar campanha →' }).click();

    await expect(page.getByText('Sua campanha começou.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Revisar primeiro ciclo →' })).toBeVisible();

    // O que foi pedido à IA carrega a intenção e o tipo.
    expect(calls.moment[0]).toMatchObject({ type: 'organica', intent: 'Quero ser referência em liderança sistêmica.' });

    const { id: uid } = e2eUser();
    const [c] = await sql<{ id: string; status: string; duration_weeks: number; strategy: { mix: Record<string, number>; matrix: unknown[] }; account_ids: string[]; cadence: Record<string, number>; start_date: string; moment: { label: string } }>(
      `select id, status, duration_weeks, strategy, account_ids, cadence, start_date::text, moment from campaigns where user_id='${uid}'`);
    expect(c.status).toBe('active');
    expect(c.duration_weeks).toBe(8);
    expect(Object.values(c.strategy.mix).reduce((a, b) => a + b, 0)).toBe(100);
    expect(c.strategy.matrix).toHaveLength(4);
    expect(c.account_ids).toHaveLength(2);
    expect(Object.keys(c.cadence)).toHaveLength(2);
    expect(c.moment.label).toBe('Expansão de presença');
    const cycles = await sql<{ idx: number; start_date: string; end_date: string; status: string }>(
      `select idx, start_date::text, end_date::text, status from campaign_cycles where campaign_id='${c.id}' order by idx`);
    expect(cycles.map((x) => x.idx)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(cycles[0].start_date).toBe(c.start_date);
    expect(new Date(`${cycles[0].start_date}T12:00:00`).getDay()).toBe(1); // segunda-feira
    for (let i = 1; i < cycles.length; i++) {
      const gap = (new Date(cycles[i].start_date).getTime() - new Date(cycles[i - 1].start_date).getTime()) / 86_400_000;
      expect(gap).toBe(7);
    }

    await page.getByRole('button', { name: 'Fazer depois' }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('ajuste por texto + edição manual + duração personalizada', async ({ page }) => {
    const calls = await mockCampaignAI(page);
    await seedAccounts();
    await goToStrategy(page);
    await page.getByRole('button', { name: 'Ajustar' }).click();
    await page.getByRole('button', { name: '“Quero aumentar autoridade.”' }).click();
    await page.getByRole('button', { name: 'Reorganizar' }).click();
    await expect(page.getByTestId('strategy-rationale')).toContainText('Aumentei autoridade');
    expect(calls.strategy.at(-1)).toMatchObject({ mode: 'adjust', instruction: 'Quero aumentar autoridade.' });

    // edição manual deixa a soma ≠ 100 → aviso → ao usar, normaliza
    await page.getByLabel('Percentual Aproximar produtos').fill('20');
    await expect(page.getByTestId('mix-total')).toContainText('Soma: 120%');
    await page.getByRole('button', { name: 'Usar esta estratégia →' }).click();

    await page.getByTestId('weeks-custom').click();
    await page.getByLabel('Semanas').fill('6');
    await page.getByRole('button', { name: 'Continuar →' }).click();
    await page.getByRole('button', { name: 'Ativar campanha →' }).click();
    await expect(page.getByText('Sua campanha começou.')).toBeVisible();

    const { id: uid } = e2eUser();
    const [c] = await sql<{ id: string; duration_weeks: number; strategy: { mix: Record<string, number>; matrix: Array<{ weeks: string }> } }>(
      `select id, duration_weeks, strategy from campaigns where user_id='${uid}'`);
    expect(c.duration_weeks).toBe(6);
    expect(Object.values(c.strategy.mix).reduce((a, b) => a + b, 0)).toBe(100);
    expect(c.strategy.mix.produtos).toBeGreaterThan(0);
    expect(c.strategy.matrix.map((b) => b.weeks)).toEqual(['1–2', '3–4', '5', '6']);
    expect(await sql(`select 1 from campaign_cycles where campaign_id='${c.id}'`)).toHaveLength(6);
  });

  test('ajustar a leitura do momento reenvia a observação da pessoa', async ({ page }) => {
    const calls = await mockCampaignAI(page);
    await page.goto('/campanhas/nova');
    await page.getByRole('button', { name: 'Continuar →' }).click();
    await page.getByRole('button', { name: 'Ajustar minha situação' }).click();
    await page.getByLabel('Como você descreveria seu momento?').fill('Tenho base sólida no LinkedIn; no Instagram estou começando.');
    await page.getByRole('button', { name: 'Atualizar leitura' }).click();
    await expect(page.getByTestId('moment-label')).toHaveText('Consolidação de autoridade');
    expect(calls.moment.at(-1)).toMatchObject({ user_note: 'Tenho base sólida no LinkedIn; no Instagram estou começando.' });
  });

  test('sem contas conectadas não deixa ativar', async ({ page }) => {
    await mockCampaignAI(page);
    await goToStrategy(page);
    await page.getByRole('button', { name: 'Usar estratégia recomendada →' }).click();
    await page.getByRole('button', { name: 'Continuar →' }).click();
    await expect(page.getByText('Nenhuma conta conectada.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ativar campanha →' })).toBeDisabled();
  });

  test('lista e detalhe: semana, ciclos, renomear, pausar/retomar, encerrar', async ({ page }) => {
    const acc = await seedAccounts();
    const { id } = await seedCampaign({ weeks: 8, name: 'Presença Teste', accountIds: [acc.linkedin, acc.instagram] });
    await page.goto('/campanhas');
    const card = page.getByTestId('campaign-card').filter({ hasText: 'Presença Teste' });
    await expect(card.getByTestId('campaign-week')).toHaveText('Semana 1 de 8');
    await expect(card).toContainText('Nenhum conteúdo produzido ainda');
    await card.getByRole('link', { name: 'Presença Teste' }).click();

    await expect(page).toHaveURL(new RegExp(`/campanhas/${id}`));
    await expect(page.getByTestId('cycle-row')).toHaveCount(8);
    await expect(page.getByTestId('cycle-row').first()).toContainText('atual');

    await page.getByRole('button', { name: 'Renomear' }).click();
    await page.getByLabel('Nome da campanha').fill('Presença Marcos');
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(page.getByTestId('campaign-name')).toHaveText('Presença Marcos');

    await page.getByRole('button', { name: 'Pausar' }).click();
    await expect(page.getByTestId('campaign-status')).toHaveText('Pausada');
    await page.getByRole('button', { name: 'Retomar' }).click();
    await expect(page.getByTestId('campaign-status')).toHaveText('Ativa');
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Encerrar' }).click();
    await expect(page.getByTestId('campaign-status')).toHaveText('Encerrada');

    const [row] = await sql<{ name: string; status: string }>(`select name, status from campaigns where id='${id}'`);
    expect(row).toEqual({ name: 'Presença Marcos', status: 'ended' });
  });

  test('"Hive, recomende" sugere o próximo movimento real', async ({ page }) => {
    await page.goto('/criar');
    await page.getByTestId('create-recommend').click();
    await expect(page.getByTestId('next-move-title')).toHaveText('Comece por uma Campanha Orgânica');

    await seedCampaign({ weeks: 4, name: 'Orgânica Viva' });
    await page.reload();
    await page.getByTestId('create-recommend').click();
    await expect(page.getByTestId('next-move-title')).toHaveText('Orgânica Viva · Ciclo 01');
  });

  test('@live wizard com a IA de verdade', async ({ page }) => {
    test.setTimeout(180_000);
    await seedAccounts();
    await page.goto('/campanhas/nova');
    await page.getByLabel('Conte para a Hive o que você pretende fazer.').fill('Ampliar minha presença como referência em liderança sistêmica.');
    await page.getByRole('button', { name: 'Continuar →' }).click();
    await expect(page.getByTestId('moment-label')).not.toBeEmpty({ timeout: 90_000 });
    await page.getByRole('button', { name: 'Sim, continuar →' }).click();
    await expect(page.getByTestId('mix-bars')).toBeVisible({ timeout: 90_000 });
    await page.getByRole('button', { name: 'Usar estratégia recomendada →' }).click();
    await page.getByRole('button', { name: 'Continuar →' }).click();
    await page.getByRole('button', { name: 'Ativar campanha →' }).click();
    await expect(page.getByText('Sua campanha começou.')).toBeVisible();
    const { id: uid } = e2eUser();
    const [c] = await sql<{ strategy: { mix: Record<string, number>; rationale: string }; moment: { label: string; summary: string } }>(
      `select strategy, moment from campaigns where user_id='${uid}'`);
    expect(Object.values(c.strategy.mix).reduce((a, b) => a + b, 0)).toBe(100);
    expect(c.strategy.rationale.length).toBeGreaterThan(40);
    expect(c.moment.summary.length).toBeGreaterThan(40);
  });
});
