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

  test('login do Facebook com 2 contas: conecta e importa as duas de uma vez', async ({ page }) => {
    const { id: userId } = e2eUser();
    await mockEdge(page, 'instagram-connect', () => ({
      success: true, access_token: 'tok-e2e', expires_at: '2026-12-01T00:00:00Z',
      accounts: [
        { instagram_business_account_id: 'ig-bee-e2e', username: 'marcospiccinibee', page_name: 'Marcos Bee' },
        { instagram_business_account_id: 'ig-mm-e2e', username: 'marcosemarilia', page_name: 'Marcos e Marília' },
      ],
    }));
    const imported: string[] = [];
    await mockEdge(page, 'instagram-import', async (b) => {
      imported.push(String(b.account_id));
      await sql(`update social_accounts set metadata = metadata || '{"ig":{"imported_at":"2026-10-02T10:00:00Z","profile":{"followers_count":100,"media_count":5}}}'::jsonb where id='${b.account_id}'`);
      return { success: true, username: null, processed: 5, inserted: 5, updated: 0, metrics: 5, insights: true, next: null, done: true, total: 5, errors: [] };
    });
    const syncCalls: Array<Record<string, unknown>> = [];
    await mockEdge(page, 'meta-ads-sync', (b) => {
      syncCalls.push(b);
      return { success: true, status: 'connected', done: true, queue_left: 0, chunks: 3, rows: 42,
        summary: { businesses: 2, ad_accounts: 3, campaigns: 7, adsets: 9, ads: 15, insight_rows: 42, date_min: '2024-01-05', date_max: '2026-10-01', spend: { BRL: 1234.5 } } };
    });
    // O botão manda pro Facebook pedindo também ads_read e reabrindo a escolha de contas.
    let fbUrl = '';
    await page.route('https://www.facebook.com/**', (route) => { fbUrl = route.request().url(); return route.fulfill({ status: 200, body: 'ok' }); });
    await page.goto('/configuracoes');
    await page.getByRole('tab', { name: 'Contas' }).click();
    await page.getByRole('button', { name: /Conectar conta do Instagram/ }).click();
    await page.getByRole('button', { name: /Continuar com o Facebook/ }).click();
    await expect.poll(() => fbUrl).toContain('dialog/oauth');
    const scope = new URL(fbUrl).searchParams.get('scope')!;
    expect(scope.split(',')).toEqual(expect.arrayContaining(['instagram_manage_insights', 'business_management', 'ads_read']));
    expect(new URL(fbUrl).searchParams.get('auth_type')).toBe('rerequest');
    await page.goto('/configuracoes');
    await page.evaluate(() => { sessionStorage.setItem('ig_account_oauth_state', 'st-e2e'); sessionStorage.setItem('ig_account_label', ''); });
    await page.goto('/configuracoes?code=code-e2e&state=st-e2e');
    await expect(page.getByText('2 contas conectadas: @marcospiccinibee, @marcosemarilia — trazendo o histórico…')).toBeVisible();
    await expect(page.getByText('"@marcosemarilia": 5 posts lidos · 5 novos na base.')).toBeVisible({ timeout: 30_000 });
    const rows = await sql<{ label: string; handle: string; status: string; tok: boolean }>(`select label, handle, status, instagram_access_token is not null tok from social_accounts where user_id='${userId}' order by label`);
    expect(rows).toEqual([
      { label: '@marcosemarilia', handle: '@marcosemarilia', status: 'connected', tok: true },
      { label: '@marcospiccinibee', handle: '@marcospiccinibee', status: 'connected', tok: true },
    ]);
    expect(imported).toHaveLength(2);
    // Tráfego pago: conexão guardada (mesmo token do login) + sincronização disparada.
    const [mc] = await sql<{ status: string; tok: boolean; scopes: string[] }>(`select status, access_token = 'tok-e2e' tok, scopes from meta_connections where user_id='${userId}'`);
    expect(mc).toMatchObject({ status: 'connected', tok: true });
    expect(mc.scopes).toContain('ads_read');
    await expect.poll(() => syncCalls.length).toBeGreaterThan(0);
    expect(syncCalls[0]).toEqual({ force_structure: true });
    await page.getByRole('tab', { name: 'Contas' }).click();
    await expect(page.getByTestId('open-compare')).toBeVisible();
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

  test('tráfego pago: linha de status em Contas (sem o token no navegador)', async ({ page }) => {
    const { id: userId } = e2eUser();
    await sql(`insert into meta_connections (user_id, access_token, status, last_synced_at, sync_state) values ('${userId}', 'tok-secreto-e2e', 'no_ads_permission', now(),
      '{"summary":{"businesses":2,"ad_accounts":0,"campaigns":0,"ads":0},"last_error":"Sem permissão de anúncios (ads_read)."}'::jsonb)`);
    const bodies: string[] = [];
    page.on('response', async (r) => { if (r.url().includes('/rest/v1/meta_connections')) bodies.push(await r.text()); });
    await page.goto('/configuracoes?tab=contas');
    await page.getByRole('tab', { name: 'Contas' }).click();
    await expect(page.getByTestId('meta-ads-summary')).toContainText('2 BMs · 0 contas de anúncio');
    await expect(page.getByTestId('meta-ads-line')).toContainText('cadastre ads_read no app da Meta');
    expect(bodies.join('')).not.toContain('tok-secreto-e2e');
  });
});
