import { test, expect } from '@playwright/test';
import { callEdgeAsService, cleanupE2EData, cleanupE2EStorage, sql } from './helpers/admin';
import { e2eUser } from './helpers/env';
import { mockEdge } from './helpers/mocks';

// Importação do histórico do Instagram (contra a Graph API REAL, só leitura): o
// usuário de teste ganha uma conta apontando pro Instagram do Marcos Bee (token
// copiado SÓ durante o teste; tudo é apagado no fim).
test.describe('F10 · importação do Instagram', () => {
  test.beforeEach(async () => { await cleanupE2EData(); });
  test.afterAll(async () => { await cleanupE2EData(); await cleanupE2EStorage(); });

  test('@live importa o histórico inteiro, idempotente, com imagens e métricas', async () => {
    test.setTimeout(400_000);
    const { id: userId } = e2eUser();
    const [acc] = await sql<{ id: string }>(`insert into social_accounts (user_id, platform, label, status, is_default, instagram_access_token, instagram_business_account_id)
      select '${userId}', 'instagram', 'Marcos Bee (E2E)', 'connected', true, instagram_access_token, instagram_business_account_id
      from user_settings where user_id='dfa11979-83c5-4737-9601-56e4df05746a' returning id`);

    type R = { success: boolean; inserted: number; updated: number; processed: number; next: string | null; done: boolean; total: number | null; errors: string[]; insights: boolean };
    async function runAll() {
      let cursor: string | null = null; const acc2 = { inserted: 0, updated: 0, processed: 0, errors: [] as string[], pages: 0, total: null as number | null, insights: true };
      for (;;) {
        const r = await callEdgeAsService<R>('instagram-import', { account_id: acc.id, cursor });
        expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
        acc2.inserted += r.json.inserted; acc2.updated += r.json.updated; acc2.processed += r.json.processed; acc2.errors.push(...r.json.errors); acc2.pages++;
        acc2.total = r.json.total ?? acc2.total; acc2.insights = acc2.insights && r.json.insights;
        if (r.json.done) break; cursor = r.json.next;
      }
      return acc2;
    }

    const first = await runAll();
    console.log('1ª importação', JSON.stringify(first));
    expect(first.errors).toEqual([]);
    expect(first.total).toBeGreaterThan(0);
    expect(first.processed).toBe(first.total);
    expect(first.inserted).toBe(first.total);

    const posts = await sql<{ format: string; n: number; with_img: number; with_content: number; with_metrics: number; with_quote: number }>(`
      select p.format, count(*)::int n, count(*) filter (where p.rendered_slides->>'slide1' like '%/storage/v1/object/public/media/${userId}/instagram/%')::int with_img,
        count(p.content_id)::int with_content, count(m.id)::int with_metrics, count(*) filter (where length(p.carousel_text->>'quote') > 3)::int with_quote
      from user_posts p left join post_metrics m on m.post_id = p.id where p.user_id='${userId}' group by 1 order by 1`);
    console.log('peças', JSON.stringify(posts));
    for (const r of posts) expect(r).toMatchObject({ with_img: r.n, with_content: r.n, with_metrics: r.n, with_quote: r.n });
    const [one] = await sql<{ status: string; account_id: string; codigo: string; published_url: string }>(`select status, account_id, codigo, published_url from user_posts where user_id='${userId}' limit 1`);
    expect(one).toMatchObject({ status: 'published', account_id: acc.id });
    expect(one.codigo).toMatch(/^IG-\d{6}-\d{5}$/);
    expect(one.published_url).toContain('instagram.com/');
    const [carousel] = await sql<{ slides: number }>(`select count(*)::int slides from user_posts p, jsonb_object_keys(p.rendered_slides) k where p.user_id='${userId}' and p.format='carousel' group by p.id limit 1`);
    if (carousel) expect(carousel.slides).toBeGreaterThan(1);
    const [snap] = await sql<{ username: string; followers: number; imported_at: string }>(`select metadata->'ig'->'profile'->>'username' username, (metadata->'ig'->'profile'->>'followers_count')::int followers, metadata->'ig'->>'imported_at' imported_at from social_accounts where id='${acc.id}'`);
    expect(snap.username).toBeTruthy();
    expect(snap.followers).toBeGreaterThan(0);
    expect(snap.imported_at).toBeTruthy();

    // rodar de novo: nada duplica
    const again = await runAll();
    expect(again.inserted).toBe(0);
    const [count] = await sql<{ n: number }>(`select count(*)::int n from user_posts where user_id='${userId}'`);
    expect(count.n).toBe(first.total);
  });

  async function seedAccount(label: string, username: string, followers: number, created: string) {
    const { id: userId } = e2eUser();
    const meta = JSON.stringify({ ig: { imported_at: new Date().toISOString(), insights_ok: true, profile: { username, followers_count: followers, media_count: 12 }, last_30d: { reach: followers * 3, profile_views: 50 } } });
    const [r] = await sql<{ id: string }>(`insert into social_accounts (user_id, platform, label, status, is_default, instagram_business_account_id, metadata, created_at)
      values ('${userId}','instagram','${label}','connected', false, '${username}-id', '${meta}'::jsonb, '${created}') returning id`);
    return r.id;
  }
  async function seedPosts(accountId: string, n: number, likes: number, reach: number) {
    const { id: userId } = e2eUser();
    await sql(`with p as (
        insert into user_posts (user_id, platform, format, status, title, caption, carousel_text, published_at, account_id, rendered_slides, metadata)
        select '${userId}','instagram', case when g % 2 = 0 then 'image' else 'carousel' end, 'published', 'Post '||g, 'Legenda '||g, jsonb_build_object('quote','Post ${likes}-'||g),
          now() - (g * 5 || ' days')::interval, '${accountId}', '{"slide1":"https://example.com/x.jpg"}'::jsonb, jsonb_build_object('imported_from','instagram','ig_media_id','${accountId}'||g)
        from generate_series(1, ${n}) g returning id)
      insert into post_metrics (user_id, post_id, account_id, source, likes, comments, reach, saves, shares)
      select '${userId}', id, '${accountId}', 'instagram_api', ${likes}, 2, ${reach}, 3, 1 from p`);
  }

  test('contas: importar histórico mostra progresso e libera o comparativo', async ({ page }) => {
    const bee = await seedAccount('Marcos Bee', 'marcospiccinibee', 2000, '2026-01-01');
    await sql(`update social_accounts set metadata='{}'::jsonb where id='${bee}'`);
    await seedAccount('Marcos e Marília', 'marcosemarilia', 800, '2026-02-01');
    let calls = 0;
    await mockEdge(page, 'instagram-import', async (b) => {
      calls++;
      await new Promise((r) => setTimeout(r, 400));
      const first = !b.cursor;
      if (!first) await sql(`update social_accounts set metadata='{"ig":{"imported_at":"2026-10-02T10:00:00Z","insights_ok":true,"profile":{"username":"marcospiccinibee","followers_count":2000,"media_count":20}}}'::jsonb where id='${bee}'`);
      return { success: true, username: 'marcospiccinibee', processed: 10, inserted: first ? 10 : 8, updated: first ? 0 : 2, metrics: 10, insights: true, next: first ? 'c2' : null, done: !first, total: 20, errors: [] };
    });
    await page.goto('/configuracoes?tab=contas');
    await page.getByRole('tab', { name: 'Contas' }).click();
    const row = page.getByTestId('account-row').filter({ hasText: 'Marcos Bee' });
    await expect(row).toContainText('Histórico ainda não importado.');
    await row.getByTestId('import-history').click();
    await expect(row.getByTestId('import-progress')).toContainText('de 20 posts');
    await expect(page.getByText('"Marcos Bee": 20 posts lidos · 18 novos na base · 2 já existentes atualizados.')).toBeVisible();
    await expect(row.getByTestId('import-status')).toContainText('2.000 seguidores · 20 posts');
    expect(calls).toBe(2);
    await page.getByTestId('open-compare').click();
    await expect(page).toHaveURL(/\/desempenho\/contas$/);
  });

  test('comparativo: duas contas lado a lado, critérios, evolução e recomendação', async ({ page }) => {
    const bee = await seedAccount('Marcos Bee', 'marcospiccinibee', 2000, '2026-01-01');
    const mm = await seedAccount('Marcos e Marília', 'marcosemarilia', 800, '2026-02-01');
    await seedPosts(bee, 12, 40, 1000);
    await seedPosts(mm, 12, 20, 400);
    await page.goto('/desempenho/contas');
    await expect(page.getByTestId('account-card')).toHaveCount(2);
    await expect(page.getByTestId('account-card').first()).toContainText('@marcospiccinibee');
    await expect(page.getByTestId('account-card').first()).toContainText('2.000');
    await expect(page.getByTestId('criterion')).toHaveCount(7);
    await expect(page.getByTestId('criterion').filter({ hasText: 'Alcance médio por post' })).toContainText('1.000');
    await expect(page.getByTestId('verdict-title')).toContainText('@marcosemarilia');
    await expect(page.getByTestId('compare-verdict')).toContainText('@marcosemarilia soma 50 de 95 pontos: vence 2 de 7 critérios, justamente os de maior peso.');
    await expect(page.getByTestId('score')).toHaveText(['45', '50']);
    await expect(page.getByTestId('monthly-chart')).toBeVisible();
    await expect(page.getByTestId('top-post')).toHaveCount(6);
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/f10-compare.png`, fullPage: true });
  });
});
