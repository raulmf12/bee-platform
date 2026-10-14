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
    expect(calls.gen[0]).toMatchObject({ target_platform: 'instagram', variations: 1 });

    // banco: validação aprovada com M01-A; 1 peça recomendada por desdobramento
    const [v] = await sql<{ status: string; slide1: string; variant: string }>(`select status, rendered_slides->>'slide1' as slide1, visual_decision->>'variant' as variant from user_posts where id='${seeded[0].pieceId}'`);
    expect(v).toMatchObject({ status: 'approved', variant: 'M01-A' });
    expect(v.slide1).toContain('/storage/v1/object/public/');
    const unf = await sql<{ alternative_group: string; alternative_rank: number; is_recommended: boolean; slide1: string | null }>(
      `select alternative_group, alternative_rank, is_recommended, rendered_slides->>'slide1' as slide1 from user_posts where cycle_id='${cycleId}' and piece_role='unfold' order by alternative_group, alternative_rank`);
    expect(unf).toHaveLength(2);
    expect(unf.filter((u) => u.is_recommended)).toHaveLength(2);
    for (const u of unf) expect(u.slide1).toBeTruthy();

    await page.getByRole('button', { name: /Revisar produção/ }).click();
    await expect(page.getByTestId('gallery-counts')).toHaveText('3 peças · 1 aprovadas · 2 para revisar');

    // 12C: ajustes viram PROPOSTAS (candidatos) — a peça ativa só muda ao aplicar
    await page.getByRole('button', { name: /Revisar propostas/ }).first().click();
    await expect(page.getByTestId('edit-view')).toBeVisible();
    const [before] = await sql<{ id: string; slide1: string; quote: string; caption: string; variant: string }>(`select id, rendered_slides->>'slide1' as slide1, carousel_text->>'quote' quote, caption, visual_decision->>'variant' variant
      from user_posts where cycle_id='${cycleId}' and piece_role='unfold' and status<>'archived' order by alternative_rank, created_at limit 1`);
    await expect(page.getByTestId('piece-quote')).toHaveText(before.quote);
    await expect(page.getByTestId('action-swap_image')).toHaveAttribute('title', /não usa imagem/); // M01 sem imagem

    // trocar template: frase e legenda idênticas, só o visual muda
    await page.getByTestId('action-swap_template').click();
    const opt = page.getByTestId('template-option').filter({ hasText: 'mantém a imagem' }).first();
    const target = await opt.getAttribute('data-template');
    await opt.click();
    await expect(page.getByTestId('candidate')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('candidate-preserved')).toContainText('Frase mantida');
    await expect(page.getByTestId('candidate-preserved')).toContainText('Legenda mantida');
    const [still] = await sql<{ variant: string; version: number }>(`select visual_decision->>'variant' variant, version from user_posts where id='${before.id}'`);
    expect(still).toMatchObject({ variant: before.variant, version: 1 });     // nada muda antes de aplicar
    await page.getByTestId('candidate-apply').click();
    await expect(page.getByTestId('candidate')).toHaveCount(0);
    const [tpl] = await sql<{ variant: string; version: number; quote: string; caption: string; slide1: string }>(`select visual_decision->>'variant' variant, version, carousel_text->>'quote' quote, caption, rendered_slides->>'slide1' slide1 from user_posts where id='${before.id}'`);
    expect(tpl).toMatchObject({ variant: target, version: 2, quote: before.quote, caption: before.caption });
    expect(tpl.slide1).not.toBe(before.slide1);

    // editar a frase eu mesmo: re-render no MESMO template
    await page.getByTestId('action-adjust_text').click();
    await page.getByRole('button', { name: 'Editar eu mesmo' }).click();
    await page.getByLabel('Novo texto').fill('Frase editada na peça');
    await page.getByTestId('generate-proposal').click();
    await expect(page.getByTestId('candidate-new-quote')).toHaveText('Frase editada na peça', { timeout: 60_000 });
    await page.getByTestId('candidate-apply').click();
    await expect(page.getByTestId('piece-quote')).toHaveText('Frase editada na peça');
    const [afterEdit] = await sql<{ slide1: string; variant: string; caption: string }>(`select rendered_slides->>'slide1' as slide1, visual_decision->>'variant' variant, caption from user_posts where id='${before.id}'`);
    expect(afterEdit).toMatchObject({ variant: target, caption: before.caption });
    expect(afterEdit.slide1).not.toBe(tpl.slide1);

    // pedir à Hive um ajuste só da legenda: a imagem NÃO é refeita
    await page.getByTestId('action-adjust_text').click();
    await page.getByRole('button', { name: 'Legenda', exact: true }).click();
    await page.getByRole('button', { name: 'Pedir à Hive' }).click();
    await page.getByLabel('Pedido de ajuste do texto').fill('mais curta');
    await page.getByTestId('generate-proposal').click();
    await expect(page.getByTestId('candidate-new-caption')).toHaveText('Legenda ajustada pela Hive', { timeout: 60_000 });
    await expect(page.getByTestId('candidate-preserved')).toContainText('Frase mantida');
    await expect(page.getByTestId('candidate-preserved')).toContainText('Template mantido');
    await page.getByTestId('candidate-apply').click();
    await expect(page.getByTestId('piece-caption')).toHaveText('Legenda ajustada pela Hive');
    expect(calls.edit.at(-1)).toMatchObject({ field: 'legenda', instruction: 'mais curta' });
    const [afterCap] = await sql<{ slide1: string; version: number; quote: string }>(`select rendered_slides->>'slide1' as slide1, version, carousel_text->>'quote' quote from user_posts where id='${before.id}'`);
    expect(afterCap).toMatchObject({ slide1: afterEdit.slide1, version: 4, quote: 'Frase editada na peça' });
    const vers = await sql<{ version: number; action: string }>(`select version, action from piece_versions where post_id='${before.id}' order by version`);
    expect(vers.map((v) => v.action)).toEqual(['base', 'swap_template', 'adjust_text', 'adjust_text']);

    // aprovar → próxima → escolher recomendada → aprovar → concluir
    await page.getByRole('button', { name: 'Aprovar peça' }).click();
    await expect(page.getByTestId('cycle-progress')).toHaveText('2 de 3 peças aprovadas');
    await page.getByRole('button', { name: /Próxima peça para revisar/ }).click();
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
    expect(unf).toHaveLength(2);
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
