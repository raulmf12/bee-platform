import { test, expect } from '@playwright/test';
import { cleanupE2EData, sql } from '../helpers/admin';
import { e2eUser } from '../helpers/env';

// Prévia da seção de tráfego pago com os DADOS REAIS do Marcos, copiados
// TEMPORARIAMENTE pro usuário de teste (somente leitura do Marcos; tudo apagado no fim).
// Rodar à mão: TOOLS=1 npx playwright test e2e/tools/paid-preview.spec.ts --project=e2e
const M = 'dfa11979-83c5-4737-9601-56e4df05746a';

test.afterAll(async () => { await cleanupE2EData(); });

test('@tool prévia do tráfego pago com dados reais (cópia temporária)', async ({ page }) => {
  test.setTimeout(300_000);
  await cleanupE2EData();
  const { id: u } = e2eUser();
  await sql(`insert into social_accounts (user_id, platform, label, status, instagram_business_account_id, handle, metadata, created_at)
    select '${u}', platform, label, 'connected', instagram_business_account_id, handle, metadata, created_at from social_accounts where user_id='${M}' and platform='instagram'`);
  await sql(`insert into meta_campaigns (user_id, fb_account_id, fb_campaign_id, name, objective, status, effective_status)
    select '${u}', fb_account_id, fb_campaign_id, name, objective, status, effective_status from meta_campaigns where user_id='${M}'`);
  await sql(`insert into meta_ads (user_id, fb_account_id, fb_campaign_id, fb_adset_id, fb_ad_id, name, status, effective_status, creative, ig_media_id, ig_account_id, ig_username, attribution_source)
    select '${u}', fb_account_id, fb_campaign_id, fb_adset_id, fb_ad_id, name, status, effective_status, creative, ig_media_id, ig_account_id, ig_username, attribution_source from meta_ads where user_id='${M}'`);
  await sql(`insert into meta_ad_insights_daily (user_id, fb_account_id, fb_campaign_id, campaign_name, fb_adset_id, adset_name, fb_ad_id, ad_name, date, spend, impressions, reach, frequency, clicks, inline_link_clicks, ctr, cpc, cpm, actions, action_values, cost_per_action_type)
    select '${u}', fb_account_id, fb_campaign_id, campaign_name, fb_adset_id, adset_name, fb_ad_id, ad_name, date, spend, impressions, reach, frequency, clicks, inline_link_clicks, ctr, cpc, cpm, actions, action_values, cost_per_action_type from meta_ad_insights_daily where user_id='${M}'`);
  // Orgânico (posts publicados do IG + métricas), remapeando a conta.
  await sql(`with map as (select m.id old_id, e.id new_id from social_accounts m join social_accounts e on e.instagram_business_account_id=m.instagram_business_account_id where m.user_id='${M}' and e.user_id='${u}'),
    src as (select p.*, map.new_id from user_posts p join map on map.old_id=p.account_id where p.user_id='${M}' and p.platform='instagram' and p.status='published'),
    ins as (insert into user_posts (user_id, platform, format, status, title, caption, published_at, account_id, metadata, codigo)
      select '${u}', platform, format, status, title, left(caption, 200), published_at, new_id, jsonb_build_object('copy_of', id), 'COPY-' || substr(id::text,1,8) from src returning id, metadata->>'copy_of' copy_of)
    insert into post_metrics (user_id, post_id, source, reach, impressions, likes, comments, saves, shares, engagement_rate)
    select '${u}', ins.id, m.source, m.reach, m.impressions, m.likes, m.comments, m.saves, m.shares, m.engagement_rate from ins join post_metrics m on m.post_id::text = ins.copy_of`);
  await page.setViewportSize({ width: 1440, height: 9000 });
  await page.goto('/desempenho/contas');
  const sec = page.getByTestId('paid-section');
  await expect(sec).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('paid-kpis')).toBeVisible();
  await page.waitForTimeout(1500);
  const box = (await sec.boundingBox())!;
  await page.screenshot({ path: '.scratch/real-paid.png', clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 8800 - box.y) } });
  console.log('INSIGHTS\n' + (await page.getByTestId('paid-insights').innerText()));
});
