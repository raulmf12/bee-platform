import { test, expect } from '@playwright/test';
import { cleanupE2EData, sql } from './helpers/admin';
import { mockDevelop } from './helpers/mocks';
import { seedAccounts, seedApprovedPauta, seedCampaign } from './helpers/fixtures';

// F4 — Telas 10–11: desenvolver os conteúdos-mãe e validá-los um a um.
test.describe('F4 · desenvolvimento e validação', () => {
  test.beforeEach(async () => { await cleanupE2EData(); });
  test.afterAll(async () => { await cleanupE2EData(); });

  async function setup(ideasSpec: (acc: { linkedin: string; instagram: string }) => Array<{ title: string; fn: string; channels: Array<{ account_id: string; platform: string }> }>) {
    const acc = await seedAccounts();
    const camp = await seedCampaign({ weeks: 8, name: 'Presença Marcos', accountIds: [acc.linkedin, acc.instagram], cadence: [2, 3] });
    const ideaIds = await seedApprovedPauta(camp.id, camp.cycleIds[0], ideasSpec(acc));
    return { acc, camp, ideaIds };
  }

  test('desenvolver → aprovar / editar / ajustar → resumo → desdobramentos (com ciclo de aprendizado)', async ({ page }) => {
    const calls: Array<Record<string, unknown>> = [];
    await mockDevelop(page, calls);
    const { acc, camp } = await setup((a) => [
      { title: 'Por que bons líderes repetem velhos padrões?', fn: 'autoridade', channels: [{ account_id: a.linkedin, platform: 'linkedin' }, { account_id: a.instagram, platform: 'instagram' }] },
      { title: 'O problema pode não estar onde procuramos', fn: 'posicionamento', channels: [{ account_id: a.linkedin, platform: 'linkedin' }] },
      { title: 'Resistência ou coerência?', fn: 'presenca', channels: [{ account_id: a.instagram, platform: 'instagram' }] },
    ]);
    const cycleId = camp.cycleIds[0];
    await page.goto(`/producao?campaign=${camp.id}&cycle=${cycleId}`);
    await expect(page.getByTestId('develop-intro')).toContainText('3 ideias aprovadas');
    await page.getByRole('button', { name: /Desenvolver conteúdos/ }).click();
    await expect(page.getByTestId('validate-counter')).toHaveText('Conteúdo 01 de 03');
    expect(calls.filter((c) => c.mode === 'develop')).toHaveLength(3);
    const [cy] = await sql<{ status: string }>(`select status from campaign_cycles where id='${cycleId}'`);
    expect(cy.status).toBe('developing');
    expect(await sql(`select 1 from contents where cycle_id='${cycleId}' and status='pending_validation'`)).toHaveLength(3);

    // 1) aprovar direto → peça LinkedIn de validação + IG a desenvolver
    await expect(page.getByTestId('content-frase')).toHaveText('Frase de Por que bons líderes repetem velhos padrões?');
    await page.getByRole('button', { name: 'Aprovar conteúdo' }).click();
    await expect(page.getByTestId('content-approved')).toContainText('Primeira peça aprovada');
    await expect(page.getByTestId('content-approved')).toContainText('A desenvolver');
    await page.getByRole('button', { name: /Próximo conteúdo/ }).click();

    // 2) editar diretamente (LinkedIn) → validação mede a edição humana
    await expect(page.getByTestId('validate-counter')).toHaveText('Conteúdo 02 de 03');
    await page.getByRole('button', { name: 'Editar diretamente' }).click();
    await page.getByLabel('Frase').fill('Frase reescrita à mão pelo Marcos');
    await page.getByRole('button', { name: 'Salvar edição' }).click();
    await expect(page.getByTestId('content-frase')).toHaveText('Frase reescrita à mão pelo Marcos');
    await page.getByRole('button', { name: 'Aprovar conteúdo' }).click();
    await page.getByRole('button', { name: /Próximo conteúdo/ }).click();

    // 3) ajustar com a Hive (só Instagram) → sem peça de validação
    await expect(page.getByTestId('validate-counter')).toHaveText('Conteúdo 03 de 03');
    await page.getByRole('button', { name: 'Ajustar com a Hive' }).click();
    await page.getByRole('button', { name: '“Quero uma abertura mais provocativa.”' }).click();
    await page.getByRole('button', { name: 'Ajustar', exact: true }).click();
    await expect(page.getByTestId('content-frase')).toContainText('(ajustado)');
    await page.getByRole('button', { name: 'Aprovar conteúdo' }).click();
    await expect(page.getByTestId('content-approved')).not.toContainText('Primeira peça aprovada');
    await page.getByRole('button', { name: /Ver resumo do ciclo/ }).click();

    // resumo: 3 conteúdos · 4 peças potenciais · 2 já aprovadas · 2 a desenvolver
    await expect(page.getByTestId('develop-stats')).toContainText('3conteúdos');
    await expect(page.getByTestId('develop-stats')).toContainText('4peças potenciais');
    await expect(page.getByTestId('develop-stats')).toContainText('2já aprovadas no formato de validação');
    await expect(page.getByTestId('develop-stats')).toContainText('2desdobramentos a desenvolver');
    await page.getByRole('button', { name: /Desenvolver desdobramentos/ }).click();
    await expect(page.getByTestId('review-step')).toBeVisible();
    const [cy2] = await sql<{ status: string }>(`select status from campaign_cycles where id='${cycleId}'`);
    expect(cy2.status).toBe('producing');

    // ---- banco: peças de validação + ciclo de aprendizado ----
    const pieces = await sql<{ id: string; platform: string; piece_role: string; status: string; text_approved: boolean; account_id: string; caption: string; quote: string; ai_edit_rounds: number; manual_edits: number; codigo: string }>(
      `select id, platform, piece_role, status, text_approved, account_id, caption, carousel_text->>'quote' as quote, ai_edit_rounds, manual_edits, codigo from user_posts where cycle_id='${cycleId}' order by created_at`);
    expect(pieces).toHaveLength(2);
    for (const p of pieces) {
      expect(p).toMatchObject({ platform: 'linkedin', piece_role: 'validation', status: 'pending_approval', text_approved: true, account_id: acc.linkedin });
      expect(p.codigo).toMatch(/^BEE-\d{6}-G\d+-D\d+$/);
    }
    expect(pieces[1].quote).toBe('Frase reescrita à mão pelo Marcos');
    expect(pieces[1].manual_edits).toBe(1);
    const reviews = await sql<{ post_id: string; quote_changed: boolean }>(`select post_id, quote_changed from ai_reviews where post_id in ('${pieces[0].id}','${pieces[1].id}')`);
    expect(reviews.find((r) => r.post_id === pieces[0].id)?.quote_changed).toBe(false);
    expect(reviews.find((r) => r.post_id === pieces[1].id)?.quote_changed).toBe(true);
    const linked = await sql<{ post_id: string }>(`select post_id from ai_variations where post_id in ('${pieces[0].id}','${pieces[1].id}')`);
    expect(linked).toHaveLength(2);
    const [adj] = await sql<{ versions: unknown[]; meta: { ai_rounds: number } }>(`select versions, metadata as meta from contents where title='Resistência ou coerência?'`);
    expect(adj.versions).toHaveLength(2);
    expect(adj.meta.ai_rounds).toBe(1);
  });

  test('nova versão e descartar conteúdo', async ({ page }) => {
    await mockDevelop(page);
    const { camp, ideaIds } = await setup((a) => [
      { title: 'Ideia A', fn: 'autoridade', channels: [{ account_id: a.linkedin, platform: 'linkedin' }] },
      { title: 'Ideia B', fn: 'presenca', channels: [{ account_id: a.instagram, platform: 'instagram' }] },
    ]);
    await page.goto(`/producao?campaign=${camp.id}&cycle=${camp.cycleIds[0]}`);
    await page.getByRole('button', { name: /Desenvolver conteúdos/ }).click();
    await expect(page.getByTestId('validate-counter')).toHaveText('Conteúdo 01 de 02');
    await page.getByRole('button', { name: 'Nova versão' }).click();
    await expect(page.getByTestId('content-frase')).toContainText('(nova versão)');
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Descartar' }).click();
    await expect(page.getByTestId('validate-counter')).toHaveText('Conteúdo 01 de 01');
    await expect(page.getByTestId('content-frase')).toHaveText('Frase de Ideia B');
    const [idea] = await sql<{ status: string }>(`select status from ideas where id='${ideaIds[0]}'`);
    expect(idea.status).toBe('discarded');
  });

  test('@live conteúdo-mãe real a partir de uma ideia aprovada', async ({ page }) => {
    test.setTimeout(240_000);
    const { camp } = await setup((a) => [
      { title: 'Por que bons líderes repetem velhos padrões?', fn: 'autoridade', channels: [{ account_id: a.linkedin, platform: 'linkedin' }, { account_id: a.instagram, platform: 'instagram' }] },
    ]);
    await page.goto(`/producao?campaign=${camp.id}&cycle=${camp.cycleIds[0]}`);
    await page.getByRole('button', { name: /Desenvolver conteúdos/ }).click();
    await expect(page.getByTestId('validate-step')).toBeVisible({ timeout: 200_000 });
    await expect(page.getByTestId('content-frase')).not.toBeEmpty();
    await page.getByRole('button', { name: 'Aprovar conteúdo' }).click();
    await expect(page.getByTestId('content-approved')).toBeVisible();
    const [p] = await sql<{ caption: string; quote: string }>(`select caption, carousel_text->>'quote' as quote from user_posts where cycle_id='${camp.cycleIds[0]}'`);
    expect(p.caption.length).toBeGreaterThan(200);
    expect(p.quote.length).toBeGreaterThan(15);
  });
});
