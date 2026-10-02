import { test, expect } from '@playwright/test';
import { igFormat, imageSources, importedCode, mediaIdFromUrl, quoteFromCaption } from '../supabase/functions/_shared/instagram-map';
import { accountStats, compareAccounts } from '../src/lib/campaign/accountCompare';
import type { PostMetrics, SocialAccount, UserPost } from '../src/types';

test.describe('unit · importação e comparativo do Instagram', () => {
  test('mapeamento da mídia', () => {
    expect(igFormat({ media_type: 'CAROUSEL_ALBUM' })).toBe('carousel');
    expect(igFormat({ media_type: 'VIDEO' })).toBe('reel');
    expect(igFormat({ media_type: 'IMAGE' })).toBe('image');
    expect(quoteFromCaption('\n#lideranca\nNunca se investiu tanto em liderança.\nSegunda linha')).toBe('Nunca se investiu tanto em liderança.');
    expect(quoteFromCaption('a'.repeat(30) + ' ' + 'b'.repeat(200)).endsWith('…')).toBe(true);
    expect(quoteFromCaption(undefined)).toBe('');
    expect(imageSources({ id: '1', timestamp: '', media_type: 'VIDEO', media_url: 'v.mp4', thumbnail_url: 't.jpg' })).toEqual(['t.jpg']);
    expect(imageSources({ id: '1', timestamp: '', media_type: 'CAROUSEL_ALBUM', children: { data: [{ media_type: 'IMAGE', media_url: 'a' }, { media_type: 'VIDEO', media_url: 'v', thumbnail_url: 'b' }] } })).toEqual(['a', 'b']);
    expect(importedCode({ id: '17900000000012345', timestamp: '2025-02-10T01:12:02+0000' })).toBe('IG-100225-12345');
    expect(mediaIdFromUrl('https://www.instagram.com/p/17912345678901234/')).toBe('17912345678901234');
    expect(mediaIdFromUrl('https://www.instagram.com/p/DAbC123/')).toBeNull();
  });

  const acc = (id: string, followers: number, extra: Record<string, unknown> = {}) => ({
    id, platform: 'instagram', label: id, created_at: id, metadata: { ig: { imported_at: '2026-10-01', profile: { username: id, followers_count: followers }, ...extra } },
  } as unknown as SocialAccount);
  const today = new Date(2026, 9, 2);
  function data(accountId: string, n: number, likes: number, reach: number | null) {
    const posts: UserPost[] = []; const metrics: PostMetrics[] = [];
    for (let i = 0; i < n; i++) {
      const id = `${accountId}-${i}`;
      posts.push({ id, platform: 'instagram', status: 'published', account_id: accountId, format: i % 2 ? 'carousel' : 'image', published_at: new Date(2026, 9, 1 - i * 5, 18).toISOString() } as UserPost);
      metrics.push({ id: `m${id}`, post_id: id, source: 'instagram_api', likes, comments: 2, reach, saves: reach ? 3 : null, shares: reach ? 1 : null } as PostMetrics);
    }
    return { posts, metrics };
  }

  test('estatísticas e vencedor por critério', () => {
    const a = data('bee', 12, 40, 1000), b = data('marilia', 12, 20, 400);
    const sa = accountStats(acc('bee', 2000), [...a.posts, ...b.posts], [...a.metrics, ...b.metrics], today);
    const sb = accountStats(acc('marilia', 800), [...a.posts, ...b.posts], [...a.metrics, ...b.metrics], today);
    expect(sa).toMatchObject({ posts: 12, avgReach: 1000, avgInteractions: 46, bestFormat: expect.any(String) });
    expect(sa.engReach).toBeCloseTo(0.046);
    expect(sb.engReach).toBeCloseTo(26 / 400);
    const v = compareAccounts([sa, sb]);
    expect(v.criteria.map((c) => c.id)).toEqual(['eng_reach', 'reach', 'eng_followers', 'interactions', 'saves_shares', 'reach_pct', 'followers']);
    expect(v.criteria.find((c) => c.id === 'eng_reach')!.winner).toBe(1);  // a menor converte melhor quem vê
    expect(v.criteria.find((c) => c.id === 'reach')!.winner).toBe(0);
    // bee: alcance 20 + interações 10 + seguidores 5 + metade dos 2 empates (10) = 45
    // marilia: eng. por alcance 25 + eng. por seguidor 15 + metade dos empates (10) = 50
    expect(v.scores).toEqual([45, 50]);
    expect(v.winner).toBe(1);
    expect(v.reasons[0]).toBe('@marilia soma 50 de 95 pontos: vence 2 de 7 critérios, justamente os de maior peso.');
    expect(v.caveats).toEqual([]);
  });

  test('sem alcance: critérios de alcance saem e o aviso aparece', () => {
    const a = data('bee', 12, 40, null), b = data('marilia', 12, 20, null);
    const all = [...a.posts, ...b.posts], ms = [...a.metrics, ...b.metrics];
    const v = compareAccounts([accountStats(acc('bee', 2000), all, ms, today), accountStats(acc('marilia', 800), all, ms, today)]);
    expect(v.criteria.map((c) => c.id)).toEqual(['eng_followers', 'interactions', 'followers']);
    expect(v.caveats[0]).toContain('reconecte as contas');
  });
});
