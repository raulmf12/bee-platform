// Resultados das peças: comparação com a SUA média recente (por canal), melhor
// horário aprendido dos seus dados e "Hive recomenda" por desempenho.
// Instagram vem da API (metrics-ingest); LinkedIn, do registro manual.
import { differenceInCalendarDays, format } from 'date-fns';
import { FUNCTION_SHORT, type Content, type PostMetrics, type UserPost } from '@/types';

export const interactionsOf = (m: PostMetrics): number => (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0);

export function rateOf(m: PostMetrics): number | null {
  if (m.engagement_rate != null) return Number(m.engagement_rate);
  const base = m.reach ?? m.impressions;
  return base ? interactionsOf(m) / base : null;
}

// API > manual quando as duas existem (a API é mais completa).
export function metricsByPost(metrics: PostMetrics[]): Map<string, PostMetrics> {
  const m = new Map<string, PostMetrics>();
  for (const x of metrics) {
    const cur = m.get(x.post_id);
    if (!cur || (cur.source === 'manual' && x.source === 'instagram_api')) m.set(x.post_id, x);
  }
  return m;
}

export interface Baseline { n: number; avgRate: number | null; avgInteractions: number | null }
const MIN_SAMPLE = 3;

// Média por canal das peças publicadas nos últimos `days` dias que têm métricas.
export function baselines(posts: UserPost[], byPost: Map<string, PostMetrics>, today = new Date(), days = 90): Record<string, Baseline> {
  const acc: Record<string, { rates: number[]; inter: number[] }> = {};
  for (const p of posts) {
    const m = byPost.get(p.id);
    if (p.status !== 'published' || !m || !p.published_at) continue;
    if (differenceInCalendarDays(today, new Date(p.published_at)) > days) continue;
    const a = (acc[p.platform] ??= { rates: [], inter: [] });
    const r = rateOf(m);
    if (r != null) a.rates.push(r);
    a.inter.push(interactionsOf(m));
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, { n: v.inter.length, avgRate: v.rates.length >= MIN_SAMPLE ? avg(v.rates) : null, avgInteractions: avg(v.inter) }]));
}

export interface PieceResult { metrics: PostMetrics | null; interactions: number | null; rate: number | null; deltaPct: number | null; label: string | null; reuse: boolean }

export function resultFor(p: UserPost, byPost: Map<string, PostMetrics>, base: Record<string, Baseline>): PieceResult {
  const m = byPost.get(p.id) ?? null;
  if (!m) return { metrics: null, interactions: null, rate: null, deltaPct: null, label: null, reuse: false };
  const b = base[p.platform];
  const rate = rateOf(m);
  const inter = interactionsOf(m);
  let delta: number | null = null;
  if (b && b.n >= MIN_SAMPLE) {
    if (rate != null && b.avgRate) delta = (rate / b.avgRate - 1) * 100;
    else if (b.avgInteractions) delta = (inter / b.avgInteractions - 1) * 100;
  }
  const d = delta == null ? null : Math.round(delta);
  const label = d == null ? null : d >= 10 ? `${d}% acima da média` : d <= -10 ? `${Math.abs(d)}% abaixo da média` : 'Na média';
  return { metrics: m, interactions: inter, rate, deltaPct: d, label, reuse: d != null && d >= 25 };
}

// Melhor horário aprendido: faixa de hora com engajamento ≥15% acima da média do
// canal (≥5 peças com métricas no canal e ≥2 na faixa). Senão, nada — a Agenda usa o guia.
export function bestTimes(posts: UserPost[], byPost: Map<string, PostMetrics>): Record<string, { time: string; reason: string }> {
  const out: Record<string, { time: string; reason: string }> = {};
  const byPlat: Record<string, Array<{ hour: number; score: number }>> = {};
  for (const p of posts) {
    const m = byPost.get(p.id);
    if (p.status !== 'published' || !m || !p.published_at) continue;
    (byPlat[p.platform] ??= []).push({ hour: new Date(p.published_at).getHours(), score: rateOf(m) ?? interactionsOf(m) });
  }
  for (const [plat, rows] of Object.entries(byPlat)) {
    if (rows.length < 5) continue;
    const mean = rows.reduce((s, r) => s + r.score, 0) / rows.length;
    if (!mean) continue;
    const buckets = new Map<number, number[]>();
    for (const r of rows) buckets.set(r.hour, [...(buckets.get(r.hour) ?? []), r.score]);
    let best: { hour: number; avg: number } | null = null;
    for (const [hour, xs] of buckets) {
      if (xs.length < 2) continue;
      const a = xs.reduce((s, x) => s + x, 0) / xs.length;
      if (!best || a > best.avg) best = { hour, avg: a };
    }
    if (best && best.avg >= mean * 1.15) {
      out[plat] = { time: `${String(best.hour).padStart(2, '0')}:00`, reason: `Seus posts às ${best.hour}h tiveram ${Math.round((best.avg / mean - 1) * 100)}% mais engajamento que a sua média.` };
    }
  }
  return out;
}

export interface PerfRecommendation { id: string; postId: string; title: string; body: string; cta: string; to: string; deltaPct: number }

// "Seu conteúdo sobre X teve desempenho acima da sua média recente." — a peça de
// melhor resultado dos últimos 30 dias, se ficou ≥25% acima da média.
export function performanceRecs(d: {
  posts: UserPost[]; metrics: PostMetrics[]; contents: Content[]; editorialName?: (slug?: string | null) => string | undefined; today?: Date;
}): PerfRecommendation[] {
  const today = d.today ?? new Date();
  const byPost = metricsByPost(d.metrics);
  const base = baselines(d.posts, byPost, today);
  const top = d.posts
    .filter((p) => p.status === 'published' && p.published_at && differenceInCalendarDays(today, new Date(p.published_at)) <= 30)
    .map((p) => ({ p, r: resultFor(p, byPost, base) }))
    .filter((x) => x.r.deltaPct != null && x.r.deltaPct >= 25)
    .sort((a, b) => b.r.deltaPct! - a.r.deltaPct!)[0];
  if (!top) return [];
  const content = d.contents.find((c) => c.id === top.p.content_id);
  const slug = content?.editorial_slug ?? (top.p.metadata?.editorial_slug as string | undefined);
  const territory = d.editorialName?.(slug) ?? (content?.strategic_function ? FUNCTION_SHORT[content.strategic_function] : null);
  const about = territory ? `sobre ${territory}` : `“${content?.title ?? top.p.title ?? 'publicado'}”`;
  return [{
    id: `perf:${top.p.id}`, postId: top.p.id, deltaPct: top.r.deltaPct!,
    title: `Seu conteúdo ${about} teve desempenho acima da sua média recente.`,
    body: `Ficou ${top.r.deltaPct}% acima da sua média no ${top.p.platform === 'linkedin' ? 'LinkedIn' : 'Instagram'}. Recomendo explorar novamente esse território no próximo ciclo.`,
    cta: 'Ver recomendação', to: `/desempenho?post=${top.p.id}`,
  }];
}

export const shortDate = (iso: string) => format(new Date(iso), 'dd/MM');
