import { test, expect } from '@playwright/test';
import { addDays, format } from 'date-fns';
import { callEdgeAsService, cleanupE2EData, sql } from './helpers/admin';
import { seedAccounts, seedCampaign } from './helpers/fixtures';
import { e2eUser } from './helpers/env';

// F8 — Métricas (IG automático + LinkedIn manual), resultados nos cards,
// "Hive recomenda" por desempenho e o cron campaign-tick.
test.describe('F8 · desempenho e campaign-tick', () => {
  test.beforeEach(async () => { await cleanupE2EData(); });
  test.afterAll(async () => { await cleanupE2EData(); });

  const daysAgo = (n: number, h = 9) => { const d = addDays(new Date(), -n); d.setHours(h, 0, 0, 0); return d.toISOString(); };

  async function published(o: { platform: string; quote: string; at: string; accountId: string; contentId?: string; campaignId?: string; cycleId?: string; url?: string }) {
    const { id: userId } = e2eUser();
    const [r] = await sql<{ id: string }>(`insert into user_posts (user_id, platform, format, status, title, caption, carousel_text, published_at, published_url, account_id, content_id, campaign_id, cycle_id, metadata)
      values ('${userId}','${o.platform}','image','published','Peça','Legenda','{"quote":"${o.quote}"}'::jsonb,'${o.at}',${o.url ? `'${o.url}'` : 'null'},'${o.accountId}',
        ${o.contentId ? `'${o.contentId}'` : 'null'}, ${o.campaignId ? `'${o.campaignId}'` : 'null'}, ${o.cycleId ? `'${o.cycleId}'` : 'null'}, '{"editorial_slug":"diagnostico-sistemico"}'::jsonb) returning id`);
    return r.id;
  }
  async function metrics(postId: string, source: 'manual' | 'instagram_api', v: { impressions?: number; reach?: number; likes: number; comments?: number }) {
    const { id: userId } = e2eUser();
    await sql(`insert into post_metrics (user_id, post_id, source, impressions, reach, likes, comments)
      values ('${userId}','${postId}','${source}',${v.impressions ?? 'null'},${v.reach ?? 'null'},${v.likes},${v.comments ?? 0})`);
  }

  test('desempenho: média própria, registro manual do LinkedIn, recomendação vira ideia; cards e home', async ({ page }) => {
    const acc = await seedAccounts();
    const camp = await seedCampaign({ weeks: 8, name: 'Presença Marcos', accountIds: [acc.linkedin, acc.instagram] });
    const { id: userId } = e2eUser();
    const [k] = await sql<{ id: string }>(`insert into contents (user_id, campaign_id, cycle_id, title, strategic_function, editorial_slug, body, status, position)
      values ('${userId}','${camp.id}','${camp.cycleIds[0]}','Liderança que controla não lidera','autoridade','diagnostico-sistemico','{"frase":"F","texto":"T"}'::jsonb,'validated',0) returning id`);
    const p1 = await published({ platform: 'linkedin', quote: 'Peça LI 1', at: daysAgo(20), accountId: acc.linkedin });
    const p2 = await published({ platform: 'linkedin', quote: 'Peça LI 2', at: daysAgo(15), accountId: acc.linkedin });
    const p3 = await published({ platform: 'linkedin', quote: 'Peça LI 3', at: daysAgo(10), accountId: acc.linkedin });
    const p4 = await published({ platform: 'linkedin', quote: 'Peça campeã', at: daysAgo(5), accountId: acc.linkedin, contentId: k.id, campaignId: camp.id, cycleId: camp.cycleIds[0] });
    const p5 = await published({ platform: 'linkedin', quote: 'Peça sem resultado', at: daysAgo(2), accountId: acc.linkedin });
    const p6 = await published({ platform: 'instagram', quote: 'Peça IG', at: daysAgo(3), accountId: acc.instagram, url: 'https://www.instagram.com/p/17900000000000001/' });
    await metrics(p1, 'manual', { impressions: 1000, likes: 20 });
    await metrics(p2, 'manual', { impressions: 1000, likes: 35 });
    await metrics(p3, 'manual', { impressions: 1000, likes: 35 });
    await metrics(p4, 'manual', { impressions: 1000, likes: 60 });
    await metrics(p6, 'instagram_api', { reach: 500, likes: 20, comments: 5 });

    await page.goto('/desempenho');
    await expect(page.getByTestId('summary-linkedin')).toContainText('Publicações5');
    await expect(page.getByTestId('summary-linkedin')).toContainText('1 publicação sem resultados registrados');
    await expect(page.getByTestId('perf-row')).toHaveCount(6);
    const champ = page.getByTestId('perf-row').filter({ hasText: 'Peça campeã' });
    await expect(champ.getByTestId('perf-delta')).toHaveText('60% acima da média');
    await expect(page.getByTestId('perf-row').filter({ hasText: 'Peça LI 1' }).getByTestId('perf-delta')).toHaveText('47% abaixo da média');
    await expect(page.getByTestId('perf-row').filter({ hasText: 'Peça IG' })).toContainText('Alcance500');

    // Recomendação de desempenho → ideia no backlog (origin 'result').
    const rec = page.getByTestId('perf-recommendation');
    await expect(rec).toContainText('Seu conteúdo sobre Diagnóstico Sistêmico teve desempenho acima da sua média recente.');
    await rec.getByTestId('idea-from-result').click();
    await expect(rec.getByRole('link', { name: 'Ver no Pipeline' })).toBeVisible();
    const [idea] = await sql<{ origin: string; status: string; campaign_id: string; title: string }>(`select origin, status, campaign_id, title from ideas where origin='result'`);
    expect(idea).toMatchObject({ origin: 'result', status: 'backlog', campaign_id: camp.id, title: 'Voltar a: Liderança que controla não lidera' });

    // LinkedIn: registro manual.
    const row5 = page.getByTestId('perf-row').filter({ hasText: 'Peça sem resultado' });
    await row5.getByTestId('register-results').click();
    await row5.getByLabel('Impressões').fill('1000');
    await row5.getByLabel('Reações').fill('25');
    await row5.getByLabel('Comentários').fill('3');
    await row5.getByRole('button', { name: 'Salvar resultados' }).click();
    await expect(row5.getByTestId('perf-numbers')).toContainText('Impressões1000Reações25');
    await expect(page.getByTestId('summary-linkedin')).not.toContainText('sem resultados registrados');
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/f8-desempenho.png`, fullPage: true });
    const [m5] = await sql<{ source: string; impressions: number; likes: number; comments: number; account_id: string }>(`select source, impressions, likes, comments, account_id from post_metrics where post_id='${p5}'`);
    expect(m5).toEqual({ source: 'manual', impressions: 1000, likes: 25, comments: 3, account_id: acc.linkedin });

    // Atualizar do Instagram chama a edge de verdade (sem token → nada a gravar, sem quebrar).
    await page.getByTestId('refresh-metrics').click();
    await expect(page.getByText('Nenhuma peça do Instagram para atualizar.')).toBeVisible({ timeout: 30_000 });
    const [m6] = await sql<{ likes: number }>(`select likes from post_metrics where post_id='${p6}'`);
    expect(m6.likes).toBe(20);

    // Resultados no Pipeline e recomendação na Home.
    await page.goto('/pipeline');
    await expect(page.getByTestId('col-ideias')).toContainText('Ideia do resultado');
    const card = page.getByTestId('col-publicado').getByTestId('pipeline-card').filter({ hasText: 'Liderança que controla não lidera' });
    await expect(card.getByTestId('card-result')).toContainText('acima da média');
    await expect(card).toContainText('Bom potencial de reuso');
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/f8-pipeline.png` });
    await card.getByRole('link', { name: /Ver resultados/ }).click();
    await expect(page).toHaveURL(new RegExp(`/desempenho\\?post=${p4}`));
    await expect(page.getByTestId('perf-row').filter({ hasText: 'Peça campeã' })).toHaveClass(/ring-2/);
    await page.goto('/');
    await expect(page.getByTestId('recommendation').first()).toContainText('teve desempenho acima da sua média recente');
  });

  test('campaign-tick (como o cron): encerra campanha vencida, fecha ciclo pronto, não toca campanha não iniciada', async () => {
    const acc = await seedAccounts();
    const { id: userId } = e2eUser();
    const short = await seedCampaign({ weeks: 1, name: 'Campanha curta', accountIds: [acc.linkedin] });
    const running = await seedCampaign({ weeks: 8, name: 'Em andamento', accountIds: [acc.linkedin] });
    const idle = await seedCampaign({ weeks: 8, name: 'Não iniciada', accountIds: [acc.linkedin] });
    await sql(`update campaign_cycles set status='ready' where id='${running.cycleIds[0]}'`);
    await sql(`insert into ideas (user_id, campaign_id, cycle_id, title, channels, status, position) values ('${userId}','${running.id}','${running.cycleIds[0]}','Ideia já feita','[]'::jsonb,'developed',0)`);
    const [c1] = await sql<{ end_date: string }>(`select end_date::text from campaign_cycles where id='${running.cycleIds[0]}'`);
    const today = format(addDays(new Date(`${c1.end_date}T12:00:00`), 1), 'yyyy-MM-dd');

    const r = await callEdgeAsService<{ success: boolean; today: string; results: Array<{ ended: number; done: number; pautas: unknown[]; errors: string[] }> }>('campaign-tick', { today });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ success: true, today });
    expect(r.json.results[0]).toMatchObject({ ended: 1, done: 1, pautas: [], errors: [] });
    const camps = await sql<{ name: string; status: string }>(`select name, status from campaigns where id in ('${short.id}','${running.id}','${idle.id}') order by name`);
    expect(camps).toEqual([{ name: 'Campanha curta', status: 'ended' }, { name: 'Em andamento', status: 'active' }, { name: 'Não iniciada', status: 'active' }]);
    const cyc = await sql<{ status: string }>(`select status from campaign_cycles where id in ('${running.cycleIds[0]}','${idle.cycleIds[0]}','${idle.cycleIds[1]}') order by status`);
    expect(cyc.map((c) => c.status)).toEqual(['done', 'not_started', 'not_started']);
  });

  test('@live campaign-tick pré-gera a pauta do próximo ciclo (planejador + cycle-pauta reais)', async ({ page }) => {
    test.setTimeout(180_000);
    const acc = await seedAccounts();
    const { id: userId } = e2eUser();
    const camp = await seedCampaign({ weeks: 8, name: 'Presença Marcos', accountIds: [acc.linkedin, acc.instagram], cadence: [2, 3] });
    await sql(`update campaign_cycles set status='ready' where id='${camp.cycleIds[0]}'`);
    await sql(`insert into ideas (user_id, campaign_id, cycle_id, title, channels, status, position) values ('${userId}','${camp.id}','${camp.cycleIds[0]}','Ideia já feita','[]'::jsonb,'developed',0)`);
    const [c2] = await sql<{ start_date: string }>(`select start_date::text from campaign_cycles where id='${camp.cycleIds[1]}'`);
    const today = format(addDays(new Date(`${c2.start_date}T12:00:00`), -2), 'yyyy-MM-dd');

    const r = await callEdgeAsService<{ results: Array<{ pautas: Array<{ cycle_id: string; ideas: number }>; errors: string[] }> }>('campaign-tick', { today });
    expect(r.status).toBe(200);
    expect(r.json.results[0].errors).toEqual([]);
    expect(r.json.results[0].pautas).toEqual([{ cycle_id: camp.cycleIds[1], ideas: expect.any(Number) }]);
    const [cy] = await sql<{ status: string; review_due: string; contents: number }>(`select status, review_due::text, (plan->'totals'->>'contents')::int as contents from campaign_cycles where id='${camp.cycleIds[1]}'`);
    expect(cy.status).toBe('pauta_ready');
    expect(cy.review_due).toBe(format(addDays(new Date(`${c2.start_date}T12:00:00`), -1), 'yyyy-MM-dd'));
    const ideas = await sql<{ origin: string; status: string }>(`select origin, status from ideas where cycle_id='${camp.cycleIds[1]}'`);
    expect(ideas).toHaveLength(cy.contents);
    expect(ideas.every((i) => i.origin === 'hive' && i.status === 'proposed')).toBe(true);
    // idempotente: rodar de novo não duplica
    const again = await callEdgeAsService<{ results: Array<{ pautas: unknown[] }> }>('campaign-tick', { today });
    expect(again.json.results[0].pautas).toEqual([]);

    // aparece na Home como pendência com prazo
    await page.goto('/');
    await expect(page.locator('[data-kind="pauta"]')).toContainText('A Hive preparou as ideias recomendadas para a próxima semana.');
  });
});
