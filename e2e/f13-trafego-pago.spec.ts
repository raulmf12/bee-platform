import { test, expect } from '@playwright/test';
import { cleanupE2EData, sql } from './helpers/admin';
import { mockEdge } from './helpers/mocks';
import { e2eUser } from './helpers/env';

// Tráfego pago no comparativo de contas: anúncios atribuídos às contas do Instagram,
// indicadores lado a lado, funil, mês a mês, campanhas, anúncios e conclusões.
test.describe('F13 · tráfego pago no comparativo', () => {
  test.beforeEach(async () => { await cleanupE2EData(); });
  test.afterAll(async () => { await cleanupE2EData(); });

  async function seed() {
    const { id: u } = e2eUser();
    const meta = (username: string, followers: number) => JSON.stringify({ ig: { imported_at: '2026-10-02T10:00:00Z', insights_ok: true, profile: { username, followers_count: followers, media_count: 10 } } });
    await sql(`insert into social_accounts (user_id, platform, label, status, instagram_business_account_id, metadata, created_at) values
      ('${u}','instagram','@conta_bee','connected','ig-bee','${meta('conta_bee', 230)}'::jsonb,'2026-01-01'),
      ('${u}','instagram','@conta_ls','connected','ig-ls','${meta('conta_ls', 1500)}'::jsonb,'2026-01-02')`);
    // Orgânico de @conta_bee (2 posts com métricas) pra cruzar com o pago.
    await sql(`with acc as (select id from social_accounts where user_id='${u}' and instagram_business_account_id='ig-bee'),
      p as (insert into user_posts (user_id, platform, format, status, title, caption, published_at, account_id)
        select '${u}','instagram','image','published','Post '||g,'Legenda', now() - (g || ' days')::interval, (select id from acc) from generate_series(1,2) g returning id)
      insert into post_metrics (user_id, post_id, source, likes, comments) select '${u}', id, 'instagram_api', 40, 10 from p`);
    await sql(`insert into meta_campaigns (user_id, fb_account_id, fb_campaign_id, name, objective) values
      ('${u}','act_1','c-venda','MC - Venda','OUTCOME_SALES'), ('${u}','act_1','c-traf','MC - Tráfego','LINK_CLICKS')`);
    await sql(`insert into meta_ads (user_id, fb_account_id, fb_campaign_id, fb_ad_id, name, ig_account_id, ig_username, attribution_source, creative) values
      ('${u}','act_1','c-venda','ad-bee-1','Criativo campeão','ig-bee','conta_bee','creative_instagram_user','{"thumbnail_url":"https://example.com/t.jpg"}'::jsonb),
      ('${u}','act_1','c-traf','ad-bee-2','Criativo tráfego caro','ig-bee','conta_bee','creative_instagram_user',null),
      ('${u}','act_1','c-venda','ad-ls-1','Criativo LS','ig-ls','conta_ls','creative_instagram_user',null),
      ('${u}','act_1','c-venda','ad-x','Sem conta',null,null,'unresolved',null)`);
    const a = (o: Record<string, number>) => `'${JSON.stringify(Object.entries(o).map(([action_type, value]) => ({ action_type, value: String(value) })))}'::jsonb`;
    await sql(`insert into meta_ad_insights_daily (user_id, fb_account_id, fb_campaign_id, campaign_name, fb_ad_id, ad_name, date, spend, impressions, reach, clicks, actions, action_values) values
      ('${u}','act_1','c-venda','MC - Venda','ad-bee-1','Criativo campeão','2026-02-02', 300, 30000, 25000, 400, ${a({ link_click: 300, landing_page_view: 150, initiate_checkout: 20, purchase: 3, post_engagement: 900 })}, ${a({ purchase: 900 })}),
      ('${u}','act_1','c-traf','MC - Tráfego','ad-bee-2','Criativo tráfego caro','2026-03-03', 200, 10000, 9000, 80, ${a({ link_click: 60 })}, null),
      ('${u}','act_1','c-venda','MC - Venda','ad-ls-1','Criativo LS','2026-03-04', 600, 20000, 18000, 150, ${a({ link_click: 100, landing_page_view: 20, initiate_checkout: 5, purchase: 2 })}, ${a({ purchase: 300 })}),
      ('${u}','act_1','c-venda','MC - Venda','ad-x','Sem conta','2026-03-04', 50, 1000, 900, 5, null, null)`);
  }

  test('seção de tráfego pago: indicadores, funil, mensal, campanhas, anúncios, dias e conclusões', async ({ page }) => {
    await seed();
    const attr: Array<Record<string, unknown>> = [];
    await mockEdge(page, 'meta-ads-attribution', () => ({ success: true, ads: 4, creative: 3, page: 0, unresolved: 1, errors: [] }), attr);
    await page.goto('/desempenho/contas');
    const sec = page.getByTestId('paid-section');
    await expect(sec).toBeVisible({ timeout: 30_000 });
    await expect(sec).toContainText('02/02/2026 a 04/03/2026');
    const ins = page.getByTestId('paid-insights');
    await expect(ins).toContainText('foram investidos R$ 1.150,00 em 2 campanhas e 4 anúncios, gerando 5 compras');
    await expect(ins).toContainText('Em vendas, @conta_bee foi 1,8× mais eficiente que @conta_ls');
    await expect(ins).toContainText('@conta_bee: R$ 200,00 foram para os 1 anúncios de maior gasto sem nenhuma compra');
    await expect(ins).toContainText('a campanha mais eficiente foi "MC - Venda" (3 compras a R$ 100,00)');
    await expect(ins).toContainText('@conta_bee: o pago gerou 900 engajamentos');
    await expect(ins).toContainText('~100 interações orgânicas nos 2 posts importados (230 seguidores)');

    const kpis = page.getByTestId('paid-kpis');
    await expect(kpis.locator('thead')).toContainText('@conta_bee');
    await expect(kpis.locator('thead')).toContainText('Outras');
    const cpa = kpis.getByTestId('paid-kpi').filter({ hasText: 'Custo por compra' });
    await expect(cpa).toContainText('R$ 166,67');            // conta_bee: 500/3
    await expect(cpa).toContainText('R$ 300,00');            // conta_ls: 600/2
    await expect(cpa).toContainText('melhor');
    await expect(kpis.getByTestId('paid-kpi').filter({ hasText: 'Alcance somado (diário)' })).toContainText('não é alcance único');
    await expect(page.getByTestId('paid-funnel')).toHaveCount(2);
    await expect(page.getByTestId('paid-funnel').first()).toContainText('Maior perda: visita → início de checkout');
    await expect(page.getByTestId('paid-monthly')).toContainText('fev');
    await page.getByTestId('paid-monthly').getByText('Ver em tabela').click();
    await expect(page.getByTestId('paid-monthly').locator('table')).toContainText('R$ 300,00 · 3 · R$ 100,00');
    const bee = page.getByTestId('paid-account-0');
    await expect(bee.getByTestId('paid-objectives')).toContainText('Vendas');
    await expect(bee.getByTestId('paid-objectives')).toContainText('Tráfego');
    await expect(bee.getByTestId('paid-best-ads-0')).toContainText('Criativo campeão');
    await expect(bee.getByTestId('paid-worst-ads-0')).toContainText('Criativo tráfego caro');
    await expect(page.getByTestId('paid-weekdays')).toContainText('segunda');
    await expect(page.getByTestId('paid-notes')).toContainText('não é alcance único');
    await expect(page.getByTestId('paid-notes')).toContainText('R$ 50,00 em anúncios não atribuídos');
    await expect(page.getByTestId('paid-notes')).not.toContainText('Meses sem veiculação');   // fev→mar contíguos
    if (process.env.SHOTS) { await sec.scrollIntoViewIfNeeded(); await sec.screenshot({ path: `${process.env.SHOTS}/f13-paid.png` }); }

    await page.getByTestId('paid-reattribute').click();
    await expect(page.getByText('4 anúncios: 3 pelo criativo, 0 pela Página, 1 sem conta identificável.')).toBeVisible();
    expect(attr[0]).toEqual({ force: true });
  });

  test('sem dados de tráfego: mensagem de conexão', async ({ page }) => {
    const { id: u } = e2eUser();
    await sql(`insert into social_accounts (user_id, platform, label, status, instagram_business_account_id, metadata) values
      ('${u}','instagram','@a','connected','ig-a','{"ig":{"imported_at":"2026-10-02","profile":{"username":"a","followers_count":1}}}'::jsonb),
      ('${u}','instagram','@b','connected','ig-b','{"ig":{"imported_at":"2026-10-02","profile":{"username":"b","followers_count":1}}}'::jsonb)`);
    await page.goto('/desempenho/contas');
    await expect(page.getByTestId('paid-section')).toContainText('Ainda não há dados de tráfego pago');
  });
});
