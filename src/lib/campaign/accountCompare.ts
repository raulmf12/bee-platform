// Comparativo entre contas do Instagram (ex.: Marcos Bee × Marcos e Marília):
// números de cada conta sobre o histórico importado + retrato da conta, critério
// a critério, e a recomendação da Hive de qual usar daqui pra frente.
// Determinístico — a mesma base dá sempre o mesmo veredito.
import { differenceInCalendarDays, format, startOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { interactionsOf, metricsByPost } from '@/lib/campaign/performance';
import type { PostMetrics, SocialAccount, UserPost } from '@/types';

export interface IgSnapshot {
  captured_at?: string; imported_at?: string; insights_ok?: boolean;
  profile?: { username?: string; name?: string; followers_count?: number; follows_count?: number; media_count?: number; profile_picture_url?: string; biography?: string };
  last_30d?: { reach?: number | null; views?: number | null; accounts_engaged?: number | null; total_interactions?: number | null; profile_views?: number | null };
  follower_gain_30d?: number;
  followers_demographics?: Partial<Record<'age' | 'gender' | 'city', Array<{ key: string; value: number }>>>;
}

export const snapshotOf = (a: SocialAccount): IgSnapshot => ((a.metadata as { ig?: IgSnapshot })?.ig ?? {});

export interface AccountStats {
  account: SocialAccount; snap: IgSnapshot; username: string; followers: number | null;
  posts: number; posts90: number; perWeek90: number; activeWeeks12: number; since: string | null;
  avgLikes: number | null; avgComments: number | null; avgSaves: number | null; avgShares: number | null;
  avgReach: number | null; avgViews: number | null; avgInteractions: number | null; savesShares: number | null;
  engReach: number | null;       // interações / alcance (média por post)
  engFollowers: number | null;   // interações por post / seguidores
  reachPctFollowers: number | null;
  withReach: number;
  formats: Array<{ format: string; label: string; posts: number; avgInteractions: number }>;
  bestFormat: string | null; bestWeekday: string | null; bestHour: string | null;
  monthly: Array<{ month: string; label: string; posts: number; avgInteractions: number | null }>;
  top: Array<{ post: UserPost; interactions: number; reach: number | null }>;
}

const FORMAT_LABEL: Record<string, string> = { image: 'Imagem', carousel: 'Carrossel', reel: 'Vídeo' };
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const avgOf = (rows: PostMetrics[], k: keyof PostMetrics) => avg(rows.map((m) => m[k]).filter((v): v is number => typeof v === 'number'));

function bestBucket<T>(items: T[], key: (t: T) => string, score: (t: T) => number, min = 2): string | null {
  const m = new Map<string, number[]>();
  for (const it of items) m.set(key(it), [...(m.get(key(it)) ?? []), score(it)]);
  let best: { k: string; a: number } | null = null;
  for (const [k, xs] of m) { if (xs.length < min) continue; const a = avg(xs)!; if (!best || a > best.a) best = { k, a }; }
  return best?.k ?? null;
}

export function accountStats(account: SocialAccount, allPosts: UserPost[], allMetrics: PostMetrics[], today = new Date()): AccountStats {
  const snap = snapshotOf(account);
  const byPost = metricsByPost(allMetrics);
  const posts = allPosts
    .filter((p) => p.platform === 'instagram' && p.status === 'published' && p.published_at && p.account_id === account.id)
    .sort((a, b) => b.published_at!.localeCompare(a.published_at!));
  const rows = posts.map((p) => ({ p, m: byPost.get(p.id) })).filter((x): x is { p: UserPost; m: PostMetrics } => !!x.m);
  const ms = rows.map((r) => r.m);
  const followers = snap.profile?.followers_count ?? null;
  const posts90 = posts.filter((p) => differenceInCalendarDays(today, new Date(p.published_at!)) <= 90).length;
  const weeks = new Set(posts.filter((p) => differenceInCalendarDays(today, new Date(p.published_at!)) < 84)
    .map((p) => Math.floor(differenceInCalendarDays(today, new Date(p.published_at!)) / 7)));
  const avgInteractions = avg(ms.map(interactionsOf));
  const withReach = ms.filter((m) => m.reach);
  const avgReach = avgOf(withReach, 'reach');
  const engReach = avg(withReach.map((m) => interactionsOf(m) / m.reach!));
  const savesSharesRows = ms.filter((m) => m.saves != null || m.shares != null);

  const formats = Object.keys(FORMAT_LABEL).map((f) => {
    const r = rows.filter((x) => x.p.format === f);
    return { format: f, label: FORMAT_LABEL[f], posts: r.length, avgInteractions: avg(r.map((x) => interactionsOf(x.m))) ?? 0 };
  }).filter((f) => f.posts > 0);

  const monthly = Array.from({ length: 6 }, (_, i) => startOfMonth(subMonths(today, 5 - i))).map((d) => {
    const key = format(d, 'yyyy-MM');
    const r = rows.filter((x) => x.p.published_at!.slice(0, 7) === key);
    return { month: key, label: format(d, 'MMM', { locale: ptBR }), posts: posts.filter((p) => p.published_at!.slice(0, 7) === key).length, avgInteractions: avg(r.map((x) => interactionsOf(x.m))) };
  });

  return {
    account, snap, username: snap.profile?.username ?? account.handle?.replace(/^@/, '') ?? account.label, followers,
    posts: posts.length, posts90, perWeek90: Math.round((posts90 / (90 / 7)) * 10) / 10, activeWeeks12: weeks.size,
    since: posts.length ? posts[posts.length - 1].published_at! : null,
    avgLikes: avgOf(ms, 'likes'), avgComments: avgOf(ms, 'comments'), avgSaves: avgOf(ms, 'saves'), avgShares: avgOf(ms, 'shares'),
    avgReach, avgViews: avgOf(ms, 'impressions'), avgInteractions,
    savesShares: savesSharesRows.length ? avg(savesSharesRows.map((m) => (m.saves ?? 0) + (m.shares ?? 0))) : null,
    engReach, engFollowers: avgInteractions != null && followers ? avgInteractions / followers : null,
    reachPctFollowers: avgReach != null && followers ? avgReach / followers : null,
    withReach: withReach.length, formats,
    bestFormat: formats.length ? [...formats].sort((a, b) => b.avgInteractions - a.avgInteractions)[0].label : null,
    bestWeekday: bestBucket(rows, (x) => WEEKDAYS[new Date(x.p.published_at!).getDay()], (x) => interactionsOf(x.m)),
    bestHour: bestBucket(rows, (x) => `${new Date(x.p.published_at!).getHours()}h`, (x) => interactionsOf(x.m)),
    monthly,
    top: rows.map((x) => ({ post: x.p, interactions: interactionsOf(x.m), reach: x.m.reach ?? null }))
      .sort((a, b) => b.interactions - a.interactions).slice(0, 3),
  };
}

export interface Criterion { id: string; label: string; hint: string; weight: number; values: Array<number | null>; fmt: (v: number) => string; winner: number | null }
export interface Verdict { winner: number | null; scores: number[]; criteria: Criterion[]; reasons: string[]; caveats: string[]; confidence: 'alta' | 'média' | 'baixa' }

const pct = (v: number) => `${(v * 100).toFixed(1).replace('.', ',')}%`;
const num = (v: number) => (v >= 100 ? Math.round(v).toLocaleString('pt-BR') : v.toFixed(1).replace('.', ','));

// Critérios (peso). Só entram os que TODAS as contas têm dado.
export function compareAccounts(stats: AccountStats[]): Verdict {
  const defs: Array<Omit<Criterion, 'values' | 'winner'> & { get: (s: AccountStats) => number | null }> = [
    { id: 'eng_reach', label: 'Engajamento por alcance', hint: 'De quem viu o post, quantos interagiram — qualidade da conexão.', weight: 25, get: (s) => s.engReach, fmt: pct },
    { id: 'reach', label: 'Alcance médio por post', hint: 'Quantas pessoas cada post atinge.', weight: 20, get: (s) => s.avgReach, fmt: num },
    { id: 'eng_followers', label: 'Engajamento por seguidor', hint: 'Interações por post em relação ao tamanho da base.', weight: 15, get: (s) => s.engFollowers, fmt: pct },
    { id: 'interactions', label: 'Interações médias por post', hint: 'Curtidas, comentários, salvos e compartilhamentos.', weight: 10, get: (s) => s.avgInteractions, fmt: num },
    { id: 'saves_shares', label: 'Salvos + compartilhamentos', hint: 'Sinal de conteúdo que tem valor (as pessoas guardam e espalham).', weight: 10, get: (s) => s.savesShares, fmt: num },
    { id: 'reach_pct', label: 'Alcance sobre seguidores', hint: 'Quanto da base cada post realmente atinge.', weight: 10, get: (s) => s.reachPctFollowers, fmt: pct },
    { id: 'followers', label: 'Tamanho da audiência', hint: 'Seguidores hoje.', weight: 5, get: (s) => s.followers, fmt: num },
    { id: 'growth', label: 'Novos seguidores (30 dias)', hint: 'Ritmo de crescimento da conta.', weight: 5, get: (s) => s.snap.follower_gain_30d ?? null, fmt: num },
  ];
  const criteria: Criterion[] = [];
  const scores = stats.map(() => 0);
  for (const d of defs) {
    const values = stats.map(d.get);
    if (values.some((v) => v == null)) continue;
    const max = Math.max(...(values as number[]));
    const tops = values.map((v, i) => (v === max ? i : -1)).filter((i) => i >= 0);
    const winner = tops.length === 1 && max > 0 ? tops[0] : null;
    if (winner != null) scores[winner] += d.weight; else tops.forEach((i) => { scores[i] += d.weight / tops.length; });
    criteria.push({ id: d.id, label: d.label, hint: d.hint, weight: d.weight, values, fmt: d.fmt, winner });
  }
  const total = criteria.reduce((s, c) => s + c.weight, 0);
  const order = scores.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s);
  const winner = stats.length >= 2 && total > 0 && order[0].s > order[1].s ? order[0].i : null;

  const caveats: string[] = [];
  if (stats.some((s) => s.withReach === 0)) caveats.push('Sem alcance em pelo menos uma conta (falta a permissão de métricas): reconecte as contas e aceite Insights para um comparativo completo.');
  for (const s of stats) if (s.posts < 10) caveats.push(`@${s.username} tem só ${s.posts} posts com dados — amostra pequena.`);
  const margin = total ? (order[0].s - (order[1]?.s ?? 0)) / total : 0;
  const confidence: Verdict['confidence'] = winner == null ? 'baixa' : caveats.length || margin < 0.2 ? (margin >= 0.35 ? 'média' : 'baixa') : margin >= 0.35 ? 'alta' : 'média';

  const reasons: string[] = [];
  if (winner != null) {
    const w = stats[winner];
    const won = criteria.filter((c) => c.winner === winner);
    const mostWins = Math.max(...stats.map((_, i) => criteria.filter((c) => c.winner === i).length));
    reasons.push(`@${w.username} soma ${Math.round(order[0].s)} de ${total} pontos: vence ${won.length} de ${criteria.length} critérios${won.length < mostWins ? ', justamente os de maior peso' : ''}.`);
    for (const c of won.sort((a, b) => b.weight - a.weight).slice(0, 3)) {
      const others = c.values.filter((_, i) => i !== winner) as number[];
      reasons.push(`${c.label}: ${c.fmt(c.values[winner]!)} contra ${others.map(c.fmt).join(' / ')}.`);
    }
    const lost = criteria.filter((c) => c.winner != null && c.winner !== winner).sort((a, b) => b.weight - a.weight)[0];
    if (lost) reasons.push(`Ponto de atenção: em ${lost.label.toLowerCase()} a outra conta vai melhor (${lost.fmt(lost.values[lost.winner!]!)}).`);
  } else {
    reasons.push('Empate técnico: as contas se equivalem nos critérios disponíveis.');
  }
  return { winner, scores, criteria, reasons, caveats, confidence };
}

