import { test, expect } from '@playwright/test';
import { HISTORY_MONTHS, adIgMediaId, insightRow, isAdsPermissionError, monthChunks } from '../supabase/functions/_shared/meta-ads-map';

test.describe('unit · Meta Ads', () => {
  test('blocos mensais: do mais recente ao mais antigo, até a criação da conta', () => {
    expect(monthChunks('act_1', '2026-10-02', '2026-08-15T10:00:00-0300')).toEqual([
      { account: 'act_1', since: '2026-10-01', until: '2026-10-02' },
      { account: 'act_1', since: '2026-09-01', until: '2026-09-30' },
      { account: 'act_1', since: '2026-08-15', until: '2026-08-31' },
    ]);
  });

  test('sem data de criação: 37 meses, sem buracos', () => {
    const c = monthChunks('act_1', '2026-10-02', null);
    expect(c).toHaveLength(HISTORY_MONTHS);
    expect(c[c.length - 1]).toEqual({ account: 'act_1', since: '2023-10-01', until: '2023-10-31' });
    for (let i = 1; i < c.length; i++) {
      const prevSince = new Date(`${c[i - 1].since}T12:00:00Z`); prevSince.setUTCDate(prevSince.getUTCDate() - 1);
      expect(c[i].until).toBe(prevSince.toISOString().slice(0, 10));
    }
    // conta mais antiga que o limite: corta nos 37 meses
    expect(monthChunks('act_1', '2026-10-02', '2015-01-01')).toHaveLength(HISTORY_MONTHS);
  });

  test('linha de insights e vínculo com o post do Instagram', () => {
    const r = insightRow('u', 'act_1', { campaign_id: 'c', campaign_name: 'Camp', adset_id: 's', ad_id: 'a', ad_name: 'Ad', date_start: '2026-09-30',
      spend: '12.34', impressions: '1000', reach: '800', frequency: '1.25', clicks: '20', ctr: '2', cpc: '0.61', cpm: '12.34', actions: [{ action_type: 'link_click', value: '15' }] });
    expect(r).toMatchObject({ user_id: 'u', fb_account_id: 'act_1', fb_ad_id: 'a', date: '2026-09-30', spend: 12.34, impressions: 1000, reach: 800, frequency: 1.25, clicks: 20, inline_link_clicks: null, actions: [{ action_type: 'link_click', value: '15' }] });
    expect(adIgMediaId({ effective_instagram_media_id: '17900000000000001' })).toBe('17900000000000001');
    expect(adIgMediaId({ title: 'x' })).toBeNull();
    expect(isAdsPermissionError({ code: 200, message: 'Ad account owner has NOT grant ads_management or ads_read permission' })).toBe(true);
    expect(isAdsPermissionError({ code: 1, message: 'Unknown error' })).toBe(false);
  });
});
