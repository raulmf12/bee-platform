import { test, expect } from '@playwright/test';
import { callEdgeAsService, cleanupE2EData, sql } from './helpers/admin';
import { e2eUser } from './helpers/env';

// Tráfego pago (Meta Ads): sincronização contra a Graph API REAL (só leitura) com
// o token do Marcos copiado pro usuário de teste SÓ durante o teste.
test.describe('F11 · tráfego pago (Meta Ads)', () => {
  test.beforeEach(async () => { await cleanupE2EData(); });
  test.afterAll(async () => { await cleanupE2EData(); });

  test('@live sincroniza BMs (e anúncios, se houver ads_read) sem quebrar', async () => {
    test.setTimeout(400_000);
    const { id: userId } = e2eUser();
    await sql(`insert into meta_connections (user_id, access_token, scopes)
      select '${userId}', instagram_access_token, scopes from social_accounts
      where user_id='dfa11979-83c5-4737-9601-56e4df05746a' and platform='instagram' and instagram_access_token is not null order by updated_at desc limit 1`);
    type R = { success: boolean; status: string; done: boolean; queue_left: number; chunks: number; rows: number; summary: Record<string, unknown>; error?: string };
    let r: { status: number; json: R } | null = null;
    for (let i = 0; i < 20; i++) {
      r = await callEdgeAsService<R>('meta-ads-sync', {});
      expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
      console.log('rodada', i + 1, JSON.stringify({ status: r.json.status, done: r.json.done, left: r.json.queue_left, rows: r.json.rows, summary: r.json.summary }));
      if (r.json.done) break;
    }
    expect(r!.json.done).toBe(true);
    const [conn] = await sql<{ status: string; fb_user_id: string; refreshed: string; last_error: string | null }>(`select status, fb_user_id, sync_state->>'refreshed_on' refreshed, sync_state->>'last_error' last_error from meta_connections where user_id='${userId}'`);
    expect(conn.fb_user_id).toBeTruthy();
    expect(conn.refreshed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const bms = await sql<{ name: string }>(`select name from meta_businesses where user_id='${userId}' order by name`);
    expect(bms.length).toBeGreaterThan(0);
    if (conn.status === 'no_ads_permission') {
      expect(conn.last_error).toContain('ads_read');
    } else {
      expect(conn.status).toBe('connected');
      const [acc] = await sql<{ n: number }>(`select count(*)::int n from meta_ad_accounts where user_id='${userId}'`);
      expect(acc.n).toBeGreaterThan(0);
    }
    // de novo no mesmo dia: não refaz a estrutura nem duplica
    const again = await callEdgeAsService<R>('meta-ads-sync', {});
    expect(again.json.done).toBe(true);
    const [n2] = await sql<{ n: number }>(`select count(*)::int n from meta_businesses where user_id='${userId}'`);
    expect(n2.n).toBe(bms.length);
  });
});
