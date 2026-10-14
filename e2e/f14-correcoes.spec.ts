import { test, expect } from '@playwright/test';
import { cleanupE2EData, cleanupE2EStorage, seed, sql } from './helpers/admin';
import { e2eUser } from './helpers/env';
import { mockDevelop, mockEdge, mockProduction } from './helpers/mocks';
import { seedAccounts, seedApprovedPauta, seedCampaign, seedValidatedContents } from './helpers/fixtures';

// F14 — correções de 14/10: conta apagada que quebrava a produção (23503), conteúdo que
// "voltava sempre o mesmo" na validação, e avisos de repetição em itens antigos.
test.describe('F14 · correções', () => {
  test.beforeEach(async () => { await cleanupE2EData(); });
  test.afterAll(async () => { await cleanupE2EData(); await cleanupE2EStorage(); });

  test('remap_social_account transfere campanha, cadência, planos, ideias e peças', async () => {
    const { id: uid } = e2eUser();
    const acc = await seedAccounts();
    const other = await seed('social_accounts', { platform: 'instagram', label: 'Nova', status: 'connected' });
    const camp = await seedCampaign({ weeks: 2, accountIds: [acc.linkedin, acc.instagram], cadence: [2, 3] });
    const [ideaId] = await seedApprovedPauta(camp.id, camp.cycleIds[0], [{ title: 'Ideia', fn: 'presenca', channels: [{ account_id: acc.instagram, platform: 'instagram' }] }]);
    await sql(`update campaign_cycles set plan = jsonb_build_object('channels', jsonb_build_array(jsonb_build_object('account_id','${acc.instagram}','platform','instagram'))) where id='${camp.cycleIds[0]}'`);
    const postId = await seed('user_posts', { platform: 'instagram', format: 'image', status: 'scheduled', title: 'P', account_id: acc.instagram, campaign_id: camp.id });
    const [r] = await sql<{ r: Record<string, number> }>(`select public.remap_social_account('${acc.instagram}','${other}') r`);
    expect(r.r).toMatchObject({ campaigns: 1, cycles: 1, ideas: 1, posts: 1 });
    const [c] = await sql<{ account_ids: string[]; cadence: Record<string, number> }>(`select account_ids, cadence from campaigns where id='${camp.id}'`);
    expect(c.account_ids).toContain(other);
    expect(c.account_ids).not.toContain(acc.instagram);
    expect(c.cadence[other]).toBe(3);
    expect(c.cadence[acc.instagram]).toBeUndefined();
    const [i] = await sql<{ channels: Array<{ account_id: string }> }>(`select channels from ideas where id='${ideaId}'`);
    expect(i.channels[0].account_id).toBe(other);
    const [p] = await sql<{ account_id: string }>(`select account_id from user_posts where id='${postId}'`);
    expect(p.account_id).toBe(other);
    expect(uid).toBeTruthy();
  });

  test('remover conta usada em campanha: transfere para a outra conta da rede antes de apagar', async ({ page }) => {
    const acc = await seedAccounts();
    const other = await seed('social_accounts', { platform: 'instagram', label: 'Instagram novo', status: 'connected' });
    const camp = await seedCampaign({ weeks: 2, name: 'Campanha que usa a conta', accountIds: [acc.linkedin, acc.instagram], cadence: [2, 3] });
    await page.goto('/configuracoes');
    await page.getByRole('tab', { name: 'Contas' }).click();
    const msgs: string[] = [];
    page.on('dialog', (d) => { msgs.push(d.message()); void d.accept(); });
    await page.getByRole('button', { name: 'Remover E2E' }).first().click(); // a de Instagram (lista ordena por rede)
    await expect(page.getByText(/Transferido para "Instagram novo"/)).toBeVisible();
    expect(msgs[0]).toContain('Campanha que usa a conta');
    expect(await sql(`select 1 from social_accounts where id='${acc.instagram}'`)).toHaveLength(0);
    const [c] = await sql<{ account_ids: string[] }>(`select account_ids from campaigns where id='${camp.id}'`);
    expect(c.account_ids).toEqual(expect.arrayContaining([acc.linkedin, other]));
  });

  test('produção com canal apontando para conta apagada usa a conta padrão (sem 23503)', async ({ page }) => {
    test.setTimeout(180_000);
    await mockProduction(page);
    const acc = await seedAccounts();
    const camp = await seedCampaign({ weeks: 2, accountIds: [acc.linkedin, acc.instagram], cadence: [2, 3] });
    const ghost = '845749ed-57fe-45df-a09f-ab72ab0f0f42';
    await seedValidatedContents(camp.id, camp.cycleIds[0], [{ title: 'Conteúdo com conta antiga', channels: [{ account_id: ghost, platform: 'instagram' }] }]);
    await page.goto(`/producao?campaign=${camp.id}&cycle=${camp.cycleIds[0]}`);
    await expect(page.getByTestId('production-summary')).toBeVisible({ timeout: 120_000 });
    const [p] = await sql<{ account_id: string }>(`select account_id from user_posts where cycle_id='${camp.cycleIds[0]}' and piece_role='unfold'`);
    expect(p.account_id).toBe(acc.instagram);
  });

  test('validação: link direto abre o conteúdo certo; seletor troca; aprovado abre só leitura', async ({ page }) => {
    await mockDevelop(page);
    const { id: uid } = e2eUser();
    const acc = await seedAccounts();
    const camp = await seedCampaign({ weeks: 2, accountIds: [acc.linkedin], cadence: [2] });
    const cyc = camp.cycleIds[0];
    const ideaIds = await seedApprovedPauta(camp.id, cyc, ['Primeiro', 'Segundo', 'Terceiro'].map((t) => ({ title: t, fn: 'presenca', channels: [{ account_id: acc.linkedin, platform: 'linkedin' }] })));
    await sql(`update campaign_cycles set status='developing' where id='${cyc}'`);
    const ids: string[] = [];
    for (const [n, t] of ['Primeiro', 'Segundo', 'Terceiro'].entries()) {
      const [c] = await sql<{ id: string }>(`insert into contents (user_id, idea_id, campaign_id, cycle_id, title, body, status, position)
        values ('${uid}','${ideaIds[n]}','${camp.id}','${cyc}','${t}','{"frase":"Frase ${t}","texto":"Texto ${t}"}'::jsonb,'${n === 0 ? 'validated' : 'pending_validation'}', ${n}) returning id`);
      ids.push(c.id);
      await sql(`update ideas set status='developed' where id='${ideaIds[n]}'`);
    }
    // Link direto (Pipeline) para o TERCEIRO: antes sempre caía no primeiro pendente.
    await page.goto(`/producao?campaign=${camp.id}&cycle=${cyc}&content=${ids[2]}`);
    await expect(page.getByTestId('content-frase')).toHaveText('Frase Terceiro');
    await expect(page.getByTestId('validate-counter')).toHaveText('Conteúdo 03 de 03');
    // seletor → segundo
    await page.getByTestId('content-nav-item').nth(1).click();
    await expect(page.getByTestId('content-frase')).toHaveText('Frase Segundo');
    // primeiro (já aprovado) → só leitura, sem botões de ação
    await page.getByTestId('content-nav-item').nth(0).click();
    await expect(page.getByTestId('content-frase')).toHaveText('Frase Primeiro');
    await expect(page.getByTestId('content-readonly')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aprovar conteúdo' })).toHaveCount(0);
    // aprovar o segundo segue para o próximo pendente (não volta ao mesmo)
    await page.getByTestId('content-nav-item').nth(1).click();
    await page.getByRole('button', { name: 'Aprovar conteúdo' }).click();
    await expect(page.getByTestId('content-approved')).toBeVisible();
    await page.getByRole('button', { name: /Próximo conteúdo/ }).click();
    await expect(page.getByTestId('content-frase')).toHaveText('Frase Terceiro');
  });

  test('agenda: peça programada marcada como repetição aparece e a auditoria pode ser rodada', async ({ page }) => {
    const calls: Array<Record<string, unknown>> = [];
    await mockEdge(page, 'content-memory', () => ({ success: true, checked: 7, flagged: [] }), calls);
    await seedAccounts();
    await seed('user_posts', {
      platform: 'linkedin', format: 'image', status: 'scheduled', title: 'T', scheduled_date: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      carousel_text: { quote: 'O conflito na sua equipe não é um erro de percurso.' },
      metadata: { repeat: { verdict: 'repeat', reason: 'Mesma fórmula com outro sujeito.', of_text: 'O desconforto na sua equipe não é um erro de percurso. — legenda', of_date: '2026-10-11T12:00:00Z' } },
    });
    await page.goto('/agenda');
    await expect(page.getByTestId('agenda-repeat-item')).toHaveCount(1);
    await expect(page.getByTestId('agenda-repeat-item')).toContainText('O desconforto na sua equipe');
    await page.getByTestId('agenda-repeat-audit').click();
    await expect(page.getByText(/conferiu 7 itens/)).toBeVisible();
    expect(calls[0]).toMatchObject({ action: 'audit' });
  });

  test('pipeline: marca de repetição aparece em conteúdo criado aqui, nunca em post importado', async ({ page }) => {
    const acc = await seedAccounts();
    const camp = await seedCampaign({ weeks: 2, accountIds: [acc.linkedin], cadence: [2] });
    const [ideaId] = await seedApprovedPauta(camp.id, camp.cycleIds[0], [{ title: 'Ideia repetida aqui', fn: 'presenca', channels: [{ account_id: acc.linkedin, platform: 'linkedin' }] }]);
    await sql(`update ideas set status='proposed', repeat_of='{"text":"Post antigo — legenda","said_at":"2026-08-01T12:00:00Z","reason":"mesma tese"}'::jsonb where id='${ideaId}'`);
    // post importado com marca (não deveria existir, mas nunca exibe)
    await seed('user_posts', { platform: 'linkedin', format: 'text', status: 'published', title: 'Importado', published_at: new Date().toISOString(),
      metadata: { imported_from: 'linkedin', repeat: { verdict: 'repeat', of_text: 'x', of_date: null } } });
    await page.goto('/pipeline');
    await expect(page.getByTestId('pipeline-repeat')).toHaveCount(1);
    await expect(page.getByTestId('pipeline-repeat')).toContainText('01/08/2026');
  });
});

