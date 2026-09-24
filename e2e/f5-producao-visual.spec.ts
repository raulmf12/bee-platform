import { test, expect } from '@playwright/test';
import { cleanupE2EData, cleanupE2EStorage, seed, sql } from './helpers/admin';
import { mockProduction } from './helpers/mocks';
import { seedAccounts, seedCampaign, seedValidatedContents } from './helpers/fixtures';

// F5 — Telas 12–12C: produção visual, galeria, escolha, edição, aprovação, conclusão.
test.describe('F5 · produção visual do ciclo', () => {
  test.beforeEach(async () => { await cleanupE2EData(); });
  test.afterAll(async () => { await cleanupE2EData(); await cleanupE2EStorage(); });

  async function setup() {
    const acc = await seedAccounts();
    const camp = await seedCampaign({ weeks: 8, name: 'Presença Marcos', accountIds: [acc.linkedin, acc.instagram], cadence: [2, 3] });
    const seeded = await seedValidatedContents(camp.id, camp.cycleIds[0], [
      { title: 'Por que bons líderes repetem velhos padrões?', channels: [{ account_id: acc.linkedin, platform: 'linkedin' }, { account_id: acc.instagram, platform: 'instagram' }], validationPiece: true },
      { title: 'Resistência ou coerência?', channels: [{ account_id: acc.instagram, platform: 'instagram' }] },
    ]);
    return { acc, camp, seeded };
  }

  test('produz → galeria → escolher → editar → ajustar → aprovar → concluir → agenda', async ({ page }) => {
    test.setTimeout(180_000);
    const calls = await mockProduction(page);
    const { camp, seeded } = await setup();
    const cycleId = camp.cycleIds[0];
    await page.goto(`/producao?campaign=${camp.id}&cycle=${cycleId}`);
    await expect(page.getByTestId('production-summary')).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId('production-summary')).toContainText('3peças previstas');
    await expect(page.getByTestId('production-summary')).toContainText('1já aprovadas');
    await expect(page.getByTestId('production-summary')).toContainText('2novas peças para revisar');
    expect(calls.gen).toHaveLength(2);
    expect(calls.gen[0]).toMatchObject({ target_platform: 'instagram', variations: 3 });

    // banco: validação aprovada com M01-A; 2 grupos × 3 alternativas renderizadas
    const [v] = await sql<{ status: string; slide1: string; variant: string }>(`select status, rendered_slides->>'slide1' as slide1, visual_decision->>'variant' as variant from user_posts where id='${seeded[0].pieceId}'`);
    expect(v).toMatchObject({ status: 'approved', variant: 'M01-A' });
    expect(v.slide1).toContain('/storage/v1/object/public/');
    const unf = await sql<{ alternative_group: string; alternative_rank: number; is_recommended: boolean; slide1: string | null }>(
      `select alternative_group, alternative_rank, is_recommended, rendered_slides->>'slide1' as slide1 from user_posts where cycle_id='${cycleId}' and piece_role='unfold' order by alternative_group, alternative_rank`);
    expect(unf).toHaveLength(6);
    expect(new Set(unf.map((u) => u.alternative_group)).size).toBe(2);
    expect(unf.filter((u) => u.is_recommended)).toHaveLength(2);
    for (const u of unf) expect(u.slide1).toBeTruthy();

    await page.getByRole('button', { name: /Revisar produção/ }).click();
    await expect(page.getByTestId('gallery-counts')).toHaveText('3 peças · 1 aprovadas · 2 para revisar');

    // 12B: escolher a alternativa 02 do primeiro desdobramento
    await page.getByRole('button', { name: /Revisar propostas/ }).first().click();
    await expect(page.getByTestId('proposal')).toHaveCount(3);
    await expect(page.getByTestId('proposal').first()).toContainText('Recomendação da Hive');
    await page.getByRole('button', { name: 'Escolher opção 2' }).click();
    await expect(page.getByTestId('edit-view')).toBeVisible();
    const archived = await sql(`select 1 from user_posts where cycle_id='${cycleId}' and piece_role='unfold' and status='archived'`);
    expect(archived).toHaveLength(2);

    // 12C: editar texto (re-render) + pedir ajuste da legenda à Hive
    // a peça escolhida = a não arquivada do grupo que teve alternativas arquivadas
    const [before] = await sql<{ id: string; slide1: string }>(`select id, rendered_slides->>'slide1' as slide1 from user_posts
      where cycle_id='${cycleId}' and piece_role='unfold' and status<>'archived'
        and alternative_group in (select alternative_group from user_posts where cycle_id='${cycleId}' and status='archived')`);
    await page.getByRole('button', { name: 'Editar texto' }).click();
    await page.getByLabel('Frase da imagem').fill('Frase editada na peça');
    await page.getByRole('button', { name: 'Salvar texto' }).click();
    await expect(page.getByTestId('piece-quote')).toHaveText('Frase editada na peça');
    const [afterEdit] = await sql<{ slide1: string; manual_edits: number }>(`select rendered_slides->>'slide1' as slide1, manual_edits from user_posts where id='${before.id}'`);
    expect(afterEdit.manual_edits).toBe(1);
    expect(afterEdit.slide1).not.toBe(before.slide1); // re-render com cache-buster
    await page.getByRole('button', { name: 'Legenda', exact: true }).click();
    await page.getByLabel('Pedido de ajuste da peça').fill('mais curta');
    await page.getByRole('button', { name: 'Ajustar', exact: true }).click();
    await expect(page.getByTestId('piece-caption')).toHaveText('Legenda ajustada pela Hive');
    expect(calls.edit.at(-1)).toMatchObject({ field: 'legenda', instruction: 'mais curta' });

    // aprovar → próxima → escolher recomendada → aprovar → concluir
    await page.getByRole('button', { name: 'Aprovar peça' }).click();
    await expect(page.getByTestId('cycle-progress')).toHaveText('2 de 3 peças aprovadas');
    await page.getByRole('button', { name: /Próxima peça para revisar/ }).click();
    await page.getByRole('button', { name: 'Escolher opção 1' }).click();
    await page.getByRole('button', { name: 'Aprovar peça' }).click();
    await expect(page.getByTestId('cycle-progress')).toHaveText('3 de 3 peças aprovadas');
    await page.getByRole('button', { name: 'Ver produção do ciclo' }).click();
    await expect(page.getByTestId('production-done')).toBeVisible();
    await page.getByRole('button', { name: /Seguir para programação/ }).click();
    await expect(page).toHaveURL(new RegExp(`/agenda\\?campaign=${camp.id}`));

    const [cy] = await sql<{ status: string }>(`select status from campaign_cycles where id='${cycleId}'`);
    expect(cy.status).toBe('ready');
    const approved = await sql<{ id: string; image_approved: boolean }>(`select id, image_approved from user_posts where cycle_id='${cycleId}' and status='approved'`);
    expect(approved).toHaveLength(3);
    for (const a of approved) expect(a.image_approved).toBe(true);
    const reviews = await sql(`select 1 from ai_reviews r join user_posts p on p.id=r.post_id where p.cycle_id='${cycleId}' and p.piece_role='unfold'`);
    expect(reviews).toHaveLength(2);
    // códigos únicos mesmo com produção em paralelo (gerados no banco)
    const dup = await sql(`select codigo from user_posts where cycle_id='${cycleId}' group by codigo having count(*) > 1`);
    expect(dup).toHaveLength(0);
  });

  test('trigger do código: gera quando vazio e preserva o informado (fluxo antigo)', async () => {
    const auto = await seed('user_posts', { platform: 'linkedin', format: 'image', status: 'draft', caption: 'x' });
    const manual = await seed('user_posts', { platform: 'linkedin', format: 'image', status: 'draft', caption: 'y', codigo: 'BEE-MANUAL-1' });
    const rows = await sql<{ id: string; codigo: string }>(`select id, codigo from user_posts where id in ('${auto}','${manual}')`);
    expect(rows.find((r) => r.id === auto)?.codigo).toMatch(/^BEE-\d{6}-G\d+-D\d+$/);
    expect(rows.find((r) => r.id === manual)?.codigo).toBe('BEE-MANUAL-1');
  });

  test('retoma produção interrompida sem duplicar', async ({ page }) => {
    test.setTimeout(150_000);
    const calls = await mockProduction(page);
    const { camp } = await setup();
    const cycleId = camp.cycleIds[0];
    await page.goto(`/producao?campaign=${camp.id}&cycle=${cycleId}`);
    await expect(page.getByTestId('production-summary')).toBeVisible({ timeout: 120_000 });
    expect(calls.gen).toHaveLength(2);
    // "volta" à tela: nada mais pra produzir
    await page.reload();
    await expect(page.getByTestId('production-summary')).toBeVisible({ timeout: 60_000 });
    expect(calls.gen).toHaveLength(2);
    const unf = await sql(`select 1 from user_posts where cycle_id='${cycleId}' and piece_role='unfold'`);
    expect(unf).toHaveLength(6);
  });

  test('@live produção visual real (validação M01-A + alternativas do Instagram)', async ({ page }) => {
    test.setTimeout(300_000);
    const { camp, seeded } = await setup();
    const cycleId = camp.cycleIds[0];
    await page.goto(`/producao?campaign=${camp.id}&cycle=${cycleId}`);
    await expect(page.getByTestId('production-summary')).toBeVisible({ timeout: 280_000 });
    const [v] = await sql<{ status: string; variant: string }>(`select status, visual_decision->>'variant' as variant from user_posts where id='${seeded[0].pieceId}'`);
    expect(v).toMatchObject({ status: 'approved', variant: 'M01-A' });
    const unf = await sql<{ variant: string; slide1: string | null; caption: string }>(`select visual_decision->>'variant' as variant, rendered_slides->>'slide1' as slide1, caption from user_posts where cycle_id='${cycleId}' and piece_role='unfold'`);
    expect(unf.length).toBeGreaterThanOrEqual(2);
    for (const u of unf) { expect(u.slide1).toBeTruthy(); expect(u.caption.length).toBeGreaterThan(100); }
  });
});
