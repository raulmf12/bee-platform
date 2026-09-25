import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { buildSync } from 'esbuild';
import { engagementRate, igMediaId, igMetricRow } from '../supabase/functions/_shared/metrics';
import { baselines, bestTimes, metricsByPost, performanceRecs, resultFor } from '../src/lib/campaign/performance';
import type { Content, PostMetrics, UserPost } from '../src/types';

const post = (id: string, o: Partial<UserPost>): UserPost => ({ id, platform: 'linkedin', status: 'published', created_at: '', updated_at: '', metadata: {}, is_favorite: false, format: 'image', user_id: 'u', ...o } as UserPost);
const met = (post_id: string, o: Partial<PostMetrics>): PostMetrics => ({ id: `m-${post_id}`, user_id: 'u', post_id, source: 'manual', captured_at: '', created_at: '', updated_at: '', ...o } as PostMetrics);
const TODAY = new Date(2026, 8, 24, 12);
const day = (d: number, h = 9) => new Date(2026, 8, d, h).toISOString();

test.describe('unit · métricas e desempenho', () => {
  test('Instagram: id da mídia e linha de métricas (com e sem insights)', () => {
    expect(igMediaId({ published_url: 'https://www.instagram.com/p/17912345678901234/' })).toBe('17912345678901234');
    expect(igMediaId({ published_url: 'https://www.instagram.com/p/Cx1AbC/', metadata: { ig_media_id: '1790000000001' } })).toBe('1790000000001');
    expect(igMediaId({ published_url: 'https://www.instagram.com/p/Cx1AbC/' })).toBeNull();
    expect(igMetricRow({ like_count: 40, comments_count: 5 })).toEqual({ reach: null, impressions: null, likes: 40, comments: 5, saves: null, shares: null, engagement_rate: null });
    const full = igMetricRow({ like_count: 40, comments_count: 5 }, [
      { name: 'reach', values: [{ value: 1000 }] }, { name: 'saved', values: [{ value: 10 }] }, { name: 'shares', total_value: { value: 5 } }, { name: 'views', values: [{ value: 1500 }] },
    ]);
    expect(full).toEqual({ reach: 1000, impressions: 1500, likes: 40, comments: 5, saves: 10, shares: 5, engagement_rate: 0.06 });
    expect(engagementRate({ reach: null, impressions: 200, likes: 10, comments: 0, saves: null, shares: null })).toBe(0.05);
  });

  test('comparação com a própria média, reuso e recomendação', () => {
    const posts = [1, 2, 3, 4].map((i) => post(`li${i}`, { published_at: day(10 + i), content_id: i === 4 ? 'k4' : null }));
    const metrics = [
      met('li1', { impressions: 1000, likes: 20 }), met('li2', { impressions: 1000, likes: 35 }),
      met('li3', { impressions: 1000, likes: 35 }), met('li4', { impressions: 1000, likes: 60 }),
    ];
    const by = metricsByPost(metrics);
    const base = baselines(posts, by, TODAY);
    expect(base.linkedin.n).toBe(4);
    expect(base.linkedin.avgRate).toBeCloseTo(0.0375);
    expect(resultFor(posts[3], by, base)).toMatchObject({ deltaPct: 60, label: '60% acima da média', reuse: true });
    expect(resultFor(posts[0], by, base)).toMatchObject({ deltaPct: -47, label: '47% abaixo da média', reuse: false });
    expect(resultFor(posts[1], by, base).label).toBe('Na média');
    const contents = [{ id: 'k4', title: 'Liderança', editorial_slug: 'lideranca-sistemica', strategic_function: 'autoridade' } as Content];
    const recs = performanceRecs({ posts, metrics, contents, today: TODAY, editorialName: (s) => (s === 'lideranca-sistemica' ? 'Liderança Sistêmica' : undefined) });
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ postId: 'li4', title: 'Seu conteúdo sobre Liderança Sistêmica teve desempenho acima da sua média recente.', to: '/desempenho?post=li4' });
  });

  test('API > manual; amostra pequena não compara', () => {
    const by = metricsByPost([met('a', { likes: 1 }), met('a', { id: 'x', source: 'instagram_api', likes: 9 })]);
    expect(by.get('a')?.likes).toBe(9);
    const posts = [post('a', { published_at: day(20) })];
    expect(resultFor(posts[0], by, baselines(posts, by, TODAY))).toMatchObject({ deltaPct: null, label: null });
  });

  test('melhor horário aprendido', () => {
    const posts = [
      ...[1, 2, 3].map((i) => post(`e${i}`, { platform: 'instagram', published_at: day(i, 18) })),
      ...[4, 5, 6].map((i) => post(`m${i}`, { platform: 'instagram', published_at: day(i, 9) })),
    ];
    const metrics = [
      ...['e1', 'e2', 'e3'].map((id) => met(id, { reach: 100, likes: 10, source: 'instagram_api' })),
      ...['m4', 'm5', 'm6'].map((id) => met(id, { reach: 100, likes: 4, source: 'instagram_api' })),
    ];
    const t = bestTimes(posts, metricsByPost(metrics));
    expect(t.instagram?.time).toBe('18:00');
    expect(t.instagram?.reason).toBe('Seus posts às 18h tiveram 43% mais engajamento que a sua média.');
    expect(bestTimes(posts.slice(0, 4), metricsByPost(metrics)).instagram).toBeUndefined();
  });

  test('planejador das edges = bundle gerado do mesmo código do app', () => {
    const r = buildSync({ entryPoints: ['src/lib/campaign/plan.ts'], bundle: true, format: 'esm', platform: 'neutral', write: false, logLevel: 'silent',
      banner: { js: "// GERADO por 'npm run build:edge-shared' a partir de src/lib/campaign/plan.ts — NÃO edite à mão." } });
    const committed = readFileSync('supabase/functions/_shared/campaign-plan.js', 'utf8');
    expect(r.outputFiles[0].text === committed, 'rode npm run build:edge-shared').toBe(true);
  });
});
