import { test, expect } from '@playwright/test';
import { cleanupE2EData, sql } from './helpers/admin';
import { mockPauta } from './helpers/mocks';
import { seedAccounts, seedCampaign } from './helpers/fixtures';

// F3 — Produção: campanha/ciclo → planejamento → pauta (Tela 09) → aprovar.
test.describe('F3 · planejamento e pauta', () => {
  test.beforeEach(async () => { await cleanupE2EData(); });
  test.afterAll(async () => { await cleanupE2EData(); });

  async function setup() {
    const acc = await seedAccounts();
    const camp = await seedCampaign({ weeks: 8, name: 'Presença Marcos', accountIds: [acc.linkedin, acc.instagram], cadence: [2, 3] });
    return { acc, camp };
  }

  test('planejamento → gerar pauta → trocar/editar/remover/adicionar → aprovar', async ({ page }) => {
    const calls: Array<Record<string, unknown>> = [];
    await mockPauta(page, calls);
    const { camp } = await setup();
    await page.goto(`/producao?campaign=${camp.id}`);
    // não pergunta o que já sabe: ciclo atual pré-selecionado
    await expect(page).toHaveURL(new RegExp(`cycle=${camp.cycleIds[0]}`));
    await expect(page.getByTestId('plan-step')).toBeVisible();
    await expect(page.getByTestId('plan-contents')).toHaveText('4 conteúdos');
    await expect(page.getByTestId('plan-pieces')).toHaveText('5 peças');
    await page.getByRole('button', { name: /Confirmar planejamento e gerar ideias/ }).click();

    await expect(page.getByTestId('pauta-step')).toBeVisible();
    await expect(page.getByTestId('idea-card')).toHaveCount(4);
    await expect(page.getByTestId('pauta-pieces')).toHaveText('5 peças');
    expect(calls[0]).toMatchObject({ cycle_id: camp.cycleIds[0], mode: 'full' });
    const [cy] = await sql<{ status: string; plan: { totals: { contents: number; pieces: number } } }>(`select status, plan from campaign_cycles where id='${camp.cycleIds[0]}'`);
    expect(cy.status).toBe('pauta_ready');
    expect(cy.plan.totals).toEqual({ contents: 4, pieces: 5 });

    // trocar
    await page.getByRole('button', { name: 'Trocar ideia 1' }).click();
    await expect(page.getByTestId('idea-title').first()).toHaveText('Ideia trocada pela Hive');
    // editar
    await page.getByRole('button', { name: 'Editar ideia 2' }).click();
    await page.getByLabel('Título da ideia').fill('O problema pode não estar onde estamos procurando.');
    await page.getByRole('button', { name: 'Salvar ideia' }).click();
    await expect(page.getByTestId('idea-title').nth(1)).toHaveText('O problema pode não estar onde estamos procurando.');
    // remover
    await page.getByRole('button', { name: 'Remover ideia 3' }).click();
    await expect(page.getByTestId('idea-card')).toHaveCount(3);
    // adicionar
    await page.getByRole('button', { name: 'Adicionar ideia à pauta' }).click();
    await page.getByLabel('Título da ideia').fill('Uma coisa que 20 anos com transformação me ensinaram');
    await page.getByLabel('Função estratégica').selectOption('relacionamento');
    await page.getByRole('button', { name: 'Adicionar à pauta' }).click();
    await expect(page.getByTestId('idea-card')).toHaveCount(4);
    await expect(page.getByText('Sua ideia')).toBeVisible();

    await page.getByRole('button', { name: /Aprovar pauta e desenvolver conteúdos/ }).click();
    await expect(page.getByTestId('develop-intro')).toBeVisible();

    const ideas = await sql<{ title: string; status: string; origin: string }>(`select title, status, origin from ideas where cycle_id='${camp.cycleIds[0]}' order by position, created_at`);
    expect(ideas.filter((i) => i.status === 'approved')).toHaveLength(4);
    expect(ideas.filter((i) => i.status === 'discarded')).toHaveLength(1);
    expect(ideas.find((i) => i.origin === 'user')?.title).toContain('20 anos');
    const [cy2] = await sql<{ status: string }>(`select status from campaign_cycles where id='${camp.cycleIds[0]}'`);
    expect(cy2.status).toBe('pauta_approved');
  });

  test('ajuste manual do planejamento valida peças × conteúdos', async ({ page }) => {
    await mockPauta(page);
    const { camp } = await setup();
    await page.goto(`/producao?campaign=${camp.id}`);
    await page.getByRole('button', { name: 'Ajustar manualmente' }).click();
    await page.getByRole('button', { name: 'Mais Produtos' }).click();
    await expect(page.getByTestId('plan-contents')).toHaveText('5 conteúdos');
    await page.getByRole('button', { name: 'Menos peças E2E' }).first().click();
    await page.getByRole('button', { name: 'Menos peças E2E' }).first().click();
    await expect(page.getByTestId('plan-invalid')).toBeVisible();
    await expect(page.getByRole('button', { name: /Confirmar planejamento/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Mais peças E2E' }).first().click();
    await page.getByRole('button', { name: 'Mais peças E2E' }).first().click();
    await page.getByRole('button', { name: /Confirmar planejamento/ }).click();
    await expect(page.getByTestId('idea-card')).toHaveCount(5);
    const [cy] = await sql<{ plan: { needs: Array<{ function: string; count: number }> } }>(`select plan from campaign_cycles where id='${camp.cycleIds[0]}'`);
    expect(cy.plan.needs.find((n) => n.function === 'produtos')?.count).toBe(1);
  });

  test('nova seleção substitui as ideias da Hive e mantém as suas', async ({ page }) => {
    await mockPauta(page);
    const { camp } = await setup();
    await page.goto(`/producao?campaign=${camp.id}`);
    await page.getByRole('button', { name: /Confirmar planejamento/ }).click();
    await expect(page.getByTestId('idea-card')).toHaveCount(4);
    await page.getByRole('button', { name: 'Adicionar ideia à pauta' }).click();
    await page.getByLabel('Título da ideia').fill('Ideia minha que fica');
    await page.getByRole('button', { name: 'Adicionar à pauta' }).click();
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Pedir nova seleção à Hive' }).click();
    await expect(page.getByTestId('idea-title').filter({ hasText: 'Nova seleção' })).toHaveCount(4);
    await expect(page.getByTestId('idea-title').filter({ hasText: 'Ideia minha que fica' })).toHaveCount(1);
    const rows = await sql<{ status: string; n: number }>(`select status, count(*)::int n from ideas where cycle_id='${camp.cycleIds[0]}' group by 1 order by 1`);
    expect(rows).toEqual([{ status: 'discarded', n: 4 }, { status: 'proposed', n: 5 }]);
  });

  test('trilho revisita o planejamento em modo leitura', async ({ page }) => {
    await mockPauta(page);
    const { camp } = await setup();
    await page.goto(`/producao?campaign=${camp.id}`);
    await page.getByRole('button', { name: /Confirmar planejamento/ }).click();
    await expect(page.getByTestId('pauta-step')).toBeVisible();
    await page.getByTestId('step-2').click();
    await expect(page.getByTestId('plan-step')).toBeVisible();
    await expect(page.getByRole('button', { name: /Confirmar planejamento/ })).toHaveCount(0);
    await page.getByTestId('step-3').click();
    await expect(page.getByTestId('pauta-step')).toBeVisible();
  });

  test('@live pauta real respeita necessidades e cadência', async ({ page }) => {
    test.setTimeout(180_000);
    const { acc, camp } = await setup();
    await page.goto(`/producao?campaign=${camp.id}`);
    await page.getByRole('button', { name: /Confirmar planejamento/ }).click();
    await expect(page.getByTestId('pauta-step')).toBeVisible({ timeout: 120_000 });
    const [cy] = await sql<{ plan: { needs: Array<{ function: string; count: number }>; totals: { contents: number } } }>(`select plan from campaign_cycles where id='${camp.cycleIds[0]}'`);
    const ideas = await sql<{ title: string; strategic_function: string; channels: Array<{ account_id: string }> }>(`select title, strategic_function, channels from ideas where cycle_id='${camp.cycleIds[0]}' and status='proposed'`);
    expect(ideas).toHaveLength(cy.plan.totals.contents);
    for (const n of cy.plan.needs) expect(ideas.filter((i) => i.strategic_function === n.function)).toHaveLength(n.count);
    const perAccount = (id: string) => ideas.filter((i) => i.channels.some((c) => c.account_id === id)).length;
    expect(perAccount(acc.linkedin)).toBe(2);
    expect(perAccount(acc.instagram)).toBe(3);
    for (const i of ideas) expect(i.title.length).toBeGreaterThan(10);
  });
});
