// Tráfego pago (Meta Ads) por conta do Instagram — análise determinística sobre
// o que já está no banco (meta_ad_insights_daily + meta_ads atribuídos + meta_campaigns).
// Os anúncios vivem nas CONTAS DE ANÚNCIO; a conta do Instagram de cada anúncio vem
// da atribuição (meta_ads.ig_account_id, edge meta-ads-attribution).
//
// Honestidade com os dados:
//  - `reach` da Meta vem POR DIA: somar dias NÃO dá alcance único. Exibimos como
//    "alcance somado (diário)" e a frequência como média diária (impressões ÷ alcance diário).
//  - Compras/valores são os que o pixel/Meta atribuiu (janela padrão da conta).

export interface ActionItem { action_type: string; value: string | number }
export interface InsightRow {
  fb_account_id: string; fb_campaign_id: string | null; campaign_name: string | null;
  fb_adset_id?: string | null; fb_ad_id: string; ad_name: string | null; date: string;
  spend: number | string | null; impressions: number | string | null; reach: number | string | null;
  clicks: number | string | null; inline_link_clicks?: number | string | null;
  actions: ActionItem[] | null; action_values: ActionItem[] | null;
}
export interface AdRow {
  fb_ad_id: string; name: string | null; fb_campaign_id: string | null; effective_status?: string | null; attribution_source?: string | null;
  ig_account_id: string | null; ig_username: string | null;
  creative: { thumbnail_url?: string; image_url?: string; instagram_permalink_url?: string; title?: string; body?: string } | null;
}
export interface CampaignRow { fb_campaign_id: string; name: string | null; objective: string | null; effective_status?: string | null }
export interface IgRef { id: string; username: string }

export const OTHER_KEY = '__outras__';

const num = (v: unknown) => (v == null || v === '' ? 0 : Number(v) || 0);
const actionSum = (list: ActionItem[] | null | undefined, types: string[]) =>
  (list ?? []).reduce((s, a) => (types.includes(a.action_type) ? s + num(a.value) : s), 0);
const div = (a: number, b: number) => (b > 0 ? a / b : null);

export interface Totals {
  spend: number; impressions: number; reachDaily: number; clicks: number; linkClicks: number;
  landingPageViews: number; initiateCheckout: number; purchases: number; purchaseValue: number;
  engagement: number; videoViews: number; saves: number; reactions: number; comments: number; messaging: number; leads: number;
  activeDays: number; campaigns: number; ads: number; firstDate: string | null; lastDate: string | null;
}
export interface Derived {
  ctr: number | null; linkCtr: number | null; cpc: number | null; cpm: number | null; frequency: number | null;
  cpLpv: number | null; cpCheckout: number | null; cpa: number | null; roas: number | null; ticket: number | null;
  lpvRate: number | null; checkoutRate: number | null; purchaseRate: number | null; costPerEngagement: number | null;
}

const ACTIONS = {
  link: ['link_click'], lpv: ['landing_page_view'], ic: ['initiate_checkout'], purchase: ['purchase'],
  engagement: ['post_engagement'], video: ['video_view'], saves: ['onsite_conversion.post_save'], reactions: ['post_reaction'],
  comments: ['comment'], messaging: ['onsite_conversion.messaging_conversation_started_7d'], leads: ['lead', 'onsite_conversion.lead_grouped'],
};

function emptyTotals(): Totals {
  return { spend: 0, impressions: 0, reachDaily: 0, clicks: 0, linkClicks: 0, landingPageViews: 0, initiateCheckout: 0, purchases: 0, purchaseValue: 0, engagement: 0, videoViews: 0, saves: 0, reactions: 0, comments: 0, messaging: 0, leads: 0, activeDays: 0, campaigns: 0, ads: 0, firstDate: null, lastDate: null };
}

export function totalsOf(rows: InsightRow[]): Totals {
  const t = emptyTotals();
  const days = new Set<string>(); const camps = new Set<string>(); const ads = new Set<string>();
  for (const r of rows) {
    t.spend += num(r.spend); t.impressions += num(r.impressions); t.reachDaily += num(r.reach); t.clicks += num(r.clicks);
    t.linkClicks += actionSum(r.actions, ACTIONS.link);
    t.landingPageViews += actionSum(r.actions, ACTIONS.lpv); t.initiateCheckout += actionSum(r.actions, ACTIONS.ic);
    t.purchases += actionSum(r.actions, ACTIONS.purchase); t.purchaseValue += actionSum(r.action_values, ACTIONS.purchase);
    t.engagement += actionSum(r.actions, ACTIONS.engagement); t.videoViews += actionSum(r.actions, ACTIONS.video);
    t.saves += actionSum(r.actions, ACTIONS.saves); t.reactions += actionSum(r.actions, ACTIONS.reactions);
    t.comments += actionSum(r.actions, ACTIONS.comments); t.messaging += actionSum(r.actions, ACTIONS.messaging); t.leads += actionSum(r.actions, ACTIONS.leads);
    if (num(r.spend) > 0 || num(r.impressions) > 0) days.add(r.date);
    if (r.fb_campaign_id) camps.add(r.fb_campaign_id);
    ads.add(r.fb_ad_id);
    if (!t.firstDate || r.date < t.firstDate) t.firstDate = r.date;
    if (!t.lastDate || r.date > t.lastDate) t.lastDate = r.date;
  }
  t.spend = Math.round(t.spend * 100) / 100; t.purchaseValue = Math.round(t.purchaseValue * 100) / 100;
  t.activeDays = days.size; t.campaigns = camps.size; t.ads = ads.size;
  return t;
}

export function derive(t: Totals): Derived {
  return {
    ctr: div(t.clicks, t.impressions), linkCtr: div(t.linkClicks, t.impressions), cpc: div(t.spend, t.linkClicks),
    cpm: t.impressions ? (t.spend / t.impressions) * 1000 : null, frequency: div(t.impressions, t.reachDaily),
    cpLpv: div(t.spend, t.landingPageViews), cpCheckout: div(t.spend, t.initiateCheckout), cpa: div(t.spend, t.purchases),
    roas: div(t.purchaseValue, t.spend), ticket: div(t.purchaseValue, t.purchases),
    lpvRate: div(t.landingPageViews, t.linkClicks), checkoutRate: div(t.initiateCheckout, t.landingPageViews), purchaseRate: div(t.purchases, t.initiateCheckout),
    costPerEngagement: div(t.spend, t.engagement),
  };
}

export const OBJECTIVE_LABEL: Record<string, string> = {
  OUTCOME_SALES: 'Vendas', CONVERSIONS: 'Vendas', OUTCOME_TRAFFIC: 'Tráfego', LINK_CLICKS: 'Tráfego',
  OUTCOME_ENGAGEMENT: 'Engajamento', POST_ENGAGEMENT: 'Engajamento', OUTCOME_LEADS: 'Cadastros (leads)', LEAD_GENERATION: 'Cadastros (leads)',
  OUTCOME_AWARENESS: 'Reconhecimento', REACH: 'Reconhecimento', BRAND_AWARENESS: 'Reconhecimento', VIDEO_VIEWS: 'Visualizações de vídeo',
};
export const objectiveLabel = (o?: string | null) => (o ? OBJECTIVE_LABEL[o] ?? o : 'Sem objetivo');

export interface Slice { key: string; label: string; totals: Totals; derived: Derived }
export interface CampaignPerf extends Slice { objective: string }
export interface AdPerf extends Slice { campaign: string; thumbnail: string | null; permalink: string | null }
export interface MonthPerf { month: string; spend: number; purchases: number; linkClicks: number; impressions: number; cpa: number | null }
export interface WeekdayPerf { dow: number; label: string; spend: number; purchases: number; linkClicks: number; impressions: number; cpa: number | null; linkCtr: number | null }

export interface AccountPaid {
  key: string; username: string; totals: Totals; derived: Derived;
  monthly: MonthPerf[]; objectives: CampaignPerf[]; campaigns: CampaignPerf[]; ads: AdPerf[];
  bestAds: AdPerf[]; worstAds: AdPerf[]; weekdays: WeekdayPerf[];
}
export interface PaidAnalysis {
  accounts: AccountPaid[]; total: AccountPaid; other: AccountPaid | null;
  months: string[]; notes: string[]; coverage: { rows: number; attributedRows: number; unattributedSpend: number };
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const dowOf = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) { const k = key(r); m.set(k, [...(m.get(k) ?? []), r]); }
  return m;
}
const slice = (key: string, label: string, rows: InsightRow[]): Slice => { const totals = totalsOf(rows); return { key, label, totals, derived: derive(totals) }; };

function analyze(key: string, username: string, rows: InsightRow[], ads: Map<string, AdRow>, campaigns: Map<string, CampaignRow>, months: string[]): AccountPaid {
  const totals = totalsOf(rows);
  const byMonth = groupBy(rows, (r) => r.date.slice(0, 7));
  const monthly = months.map((m) => {
    const t = totalsOf(byMonth.get(m) ?? []);
    return { month: m, spend: t.spend, purchases: t.purchases, linkClicks: t.linkClicks, impressions: t.impressions, cpa: div(t.spend, t.purchases) };
  });
  const objOf = (r: InsightRow) => objectiveLabel(campaigns.get(r.fb_campaign_id ?? '')?.objective);
  const objectives = [...groupBy(rows, objOf)].map(([k, rs]) => ({ ...slice(k, k, rs), objective: k })).sort((a, b) => b.totals.spend - a.totals.spend);
  const camps = [...groupBy(rows, (r) => r.fb_campaign_id ?? r.campaign_name ?? '—')].map(([k, rs]) => ({
    ...slice(k, rs[0].campaign_name ?? campaigns.get(k)?.name ?? k, rs), objective: objOf(rs[0]),
  })).sort((a, b) => b.totals.spend - a.totals.spend);
  const adPerf = [...groupBy(rows, (r) => r.fb_ad_id)].map(([k, rs]) => {
    const ad = ads.get(k);
    return { ...slice(k, ad?.name ?? rs[0].ad_name ?? k, rs), campaign: rs[0].campaign_name ?? '—', thumbnail: ad?.creative?.thumbnail_url ?? ad?.creative?.image_url ?? null, permalink: ad?.creative?.instagram_permalink_url ?? null };
  }).sort((a, b) => b.totals.spend - a.totals.spend);
  // Melhores: com compra, menor custo por compra (desempate: mais compras). Piores: mais gasto sem nenhuma compra.
  // Quem teve 2+ compras vem antes (1 compra é amostra pequena demais pra chamar de "eficiente").
  const byCpa = (a: AdPerf, b: AdPerf) => (a.derived.cpa! - b.derived.cpa!) || (b.totals.purchases - a.totals.purchases);
  const bestAds = [...adPerf.filter((a) => a.totals.purchases >= 2).sort(byCpa), ...adPerf.filter((a) => a.totals.purchases === 1).sort(byCpa)].slice(0, 5);
  const worstAds = adPerf.filter((a) => a.totals.purchases === 0 && a.totals.spend >= 100).sort((a, b) => b.totals.spend - a.totals.spend).slice(0, 5);
  const byDow = groupBy(rows, (r) => String(dowOf(r.date)));
  const weekdays = [1, 2, 3, 4, 5, 6, 0].map((d) => {
    const t = totalsOf(byDow.get(String(d)) ?? []);
    return { dow: d, label: WEEKDAYS[d], spend: t.spend, purchases: t.purchases, linkClicks: t.linkClicks, impressions: t.impressions, cpa: div(t.spend, t.purchases), linkCtr: div(t.linkClicks, t.impressions) };
  });
  return { key, username, totals, derived: derive(totals), monthly, objectives, campaigns: camps, ads: adPerf, bestAds, worstAds, weekdays };
}

export function analyzePaidTraffic(input: { rows: InsightRow[]; ads: AdRow[]; campaigns: CampaignRow[]; accounts: IgRef[] }): PaidAnalysis {
  const ads = new Map(input.ads.map((a) => [a.fb_ad_id, a]));
  const campaigns = new Map(input.campaigns.map((c) => [c.fb_campaign_id, c]));
  const known = new Set(input.accounts.map((a) => a.id));
  const keyOf = (r: InsightRow) => { const id = ads.get(r.fb_ad_id)?.ig_account_id; return id && known.has(id) ? id : OTHER_KEY; };
  const months = [...new Set(input.rows.map((r) => r.date.slice(0, 7)))].sort();
  const grouped = groupBy(input.rows, keyOf);
  const accounts = input.accounts.map((a) => analyze(a.id, a.username, grouped.get(a.id) ?? [], ads, campaigns, months));
  const otherRows = grouped.get(OTHER_KEY) ?? [];
  const other = otherRows.length ? analyze(OTHER_KEY, 'outras / sem atribuição', otherRows, ads, campaigns, months) : null;
  const total = analyze('__total__', 'total', input.rows, ads, campaigns, months);
  const notes = [
    'Alcance da Meta é diário: a soma dos dias não é alcance único (pessoas podem ser contadas mais de uma vez). Frequência = impressões ÷ alcance diário.',
    'Compras e valores são os atribuídos pela Meta/pixel na janela de atribuição da conta de anúncio.',
  ];
  if (other) notes.push(`R$ ${other.totals.spend.toFixed(2).replace('.', ',')} em anúncios não atribuídos a nenhuma das contas comparadas (outra conta do Instagram ou post apagado).`);
  const gaps = monthGaps(months);
  if (gaps.length) notes.push(`Meses sem veiculação dentro do período: ${gaps.map(monthLabel).join(', ')}.`);
  return { accounts, total, other, months, notes, coverage: { rows: input.rows.length, attributedRows: input.rows.length - otherRows.length, unattributedSpend: other?.totals.spend ?? 0 } };
}

export function monthGaps(months: string[]): string[] {
  if (months.length < 2) return [];
  const out: string[] = [];
  const [y0, m0] = months[0].split('-').map(Number);
  const last = months[months.length - 1];
  for (let y = y0, m = m0; `${y}-${String(m).padStart(2, '0')}` <= last; m === 12 ? (y++, m = 1) : m++) {
    const k = `${y}-${String(m).padStart(2, '0')}`;
    if (!months.includes(k)) out.push(k);
  }
  return out;
}

// ---------------- Conclusões (determinísticas, a partir dos números) ----------------
export interface OrganicRef { username: string; followers: number | null; posts: number; avgInteractions: number | null }
export interface PaidInsight { kind: 'destaque' | 'atencao' | 'recomendacao'; text: string }

const brl = (v: number | null) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const br = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');
const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1).replace('.', ',')}%`);

export function paidInsights(a: PaidAnalysis, organic: OrganicRef[] = []): PaidInsight[] {
  const out: PaidInsight[] = [];
  const accs = a.accounts.filter((x) => x.totals.spend > 0);
  const T = a.total;
  if (!T.totals.spend) return [{ kind: 'atencao', text: 'Ainda não há dados de tráfego pago no período.' }];
  out.push({ kind: 'destaque', text: `No período (${br(T.totals.firstDate)} a ${br(T.totals.lastDate)}) foram investidos ${brl(T.totals.spend)} em ${T.totals.campaigns} campanhas e ${T.totals.ads} anúncios, gerando ${T.totals.purchases} compras (${brl(T.totals.purchaseValue)} em vendas atribuídas, ROAS ${T.derived.roas?.toFixed(2).replace('.', ',') ?? '—'}).` });
  for (const x of accs) {
    const share = x.totals.spend / T.totals.spend;
    out.push({ kind: 'destaque', text: `@${x.username}: ${pct(share)} do investimento (${brl(x.totals.spend)}), ${x.totals.purchases} compras · custo por compra ${brl(x.derived.cpa)} · ROAS ${x.derived.roas?.toFixed(2).replace('.', ',') ?? '—'} · CPC ${brl(x.derived.cpc)} · CPM ${brl(x.derived.cpm)} · CTR do link ${pct(x.derived.linkCtr)}.` });
  }
  if (T.totals.purchaseValue > 0 && T.derived.roas != null && T.derived.roas < 1) {
    out.push({ kind: 'atencao', text: `As vendas atribuídas (${brl(T.totals.purchaseValue)}, ticket médio ${brl(T.derived.ticket)}) cobriram ${pct(T.derived.roas)} do investimento. Se o produto vendido é porta de entrada, a conta precisa considerar o que esses compradores compram depois — esse valor não está nos dados da Meta.` });
  }
  if (accs.length >= 2) {
    // Clique barato × conversão: quem atrai clique mais barato mas vende pior tem problema depois do clique.
    const byCpc = [...accs].sort((m, n) => (m.derived.cpc ?? Infinity) - (n.derived.cpc ?? Infinity));
    const cheapClick = byCpc[0], other = byCpc[1];
    if (cheapClick.derived.cpa != null && other.derived.cpa != null && cheapClick.derived.cpa > other.derived.cpa) {
      out.push({ kind: 'atencao', text: `@${cheapClick.username} tem o clique mais barato (CPC ${brl(cheapClick.derived.cpc)}, CTR do link ${pct(cheapClick.derived.linkCtr)}) mas converte pior: ${pct(cheapClick.derived.checkoutRate)} das visitas iniciam checkout contra ${pct(other.derived.checkoutRate)} em @${other.username}. O anúncio atrai; o público ou a mensagem não se alinha com a oferta depois do clique.` });
    }
    const [p, q] = [...accs].sort((m, n) => (m.derived.cpa ?? Infinity) - (n.derived.cpa ?? Infinity));
    if (p.derived.cpa != null && q.derived.cpa != null) {
      out.push({ kind: 'destaque', text: `Em vendas, @${p.username} foi ${(q.derived.cpa / p.derived.cpa).toFixed(1).replace('.', ',')}× mais eficiente que @${q.username} (custo por compra ${brl(p.derived.cpa)} vs ${brl(q.derived.cpa)}).` });
    }
    const [c1, c2] = [...accs].sort((m, n) => (m.derived.cpm ?? Infinity) - (n.derived.cpm ?? Infinity));
    if (c1.derived.cpm && c2.derived.cpm && c2.derived.cpm / c1.derived.cpm > 1.3) {
      out.push({ kind: 'atencao', text: `Mil impressões custaram ${brl(c2.derived.cpm)} em @${c2.username} contra ${brl(c1.derived.cpm)} em @${c1.username} — o público/segmentação de @${c2.username} saiu bem mais caro para alcançar.` });
    }
    for (const x of accs) {
      const leak = funnelLeak(x);
      if (leak) out.push({ kind: 'atencao', text: `@${x.username}: maior perda no funil em ${leak.step} (${pct(leak.rate)} passam).` });
    }
  }
  for (const x of accs) {
    const wasted = x.worstAds.reduce((s, w) => s + w.totals.spend, 0);
    if (wasted > 0) out.push({ kind: 'atencao', text: `@${x.username}: ${brl(wasted)} foram para os ${x.worstAds.length} anúncios de maior gasto sem nenhuma compra (ex.: "${x.worstAds[0].label}").` });
    // Campanha com 2–4 compras pode ter CPA baixo por sorte: prefere as que têm volume (5+) e só cai pra amostra pequena se não houver.
    const byCpaC = (m: { derived: Derived }, n: { derived: Derived }) => (m.derived.cpa ?? Infinity) - (n.derived.cpa ?? Infinity);
    const solid = x.campaigns.filter((c) => c.totals.purchases >= 5).sort(byCpaC)[0];
    const best = solid ?? x.campaigns.filter((c) => c.totals.purchases >= 2).sort(byCpaC)[0];
    if (best) out.push({ kind: 'recomendacao', text: `@${x.username}: a campanha mais eficiente foi "${best.label}" (${best.totals.purchases} compras a ${brl(best.derived.cpa)})${solid ? '' : ' — amostra pequena'}. Use como base de criativo e público para os próximos testes.` });
  }
  const dows = T.weekdays.filter((d) => d.purchases >= 3).sort((m, n) => (m.cpa ?? Infinity) - (n.cpa ?? Infinity));
  if (dows.length >= 2) out.push({ kind: 'recomendacao', text: `Dia da semana com menor custo por compra: ${dows[0].label} (${brl(dows[0].cpa)}); maior: ${dows[dows.length - 1].label} (${brl(dows[dows.length - 1].cpa)}). Diferença indicativa — amostra pequena por dia.` });
  for (const o of organic) {
    const x = accs.find((y) => y.username === o.username);
    if (!x || !o.avgInteractions || !o.posts) continue;
    const organicTotal = o.avgInteractions * o.posts;
    out.push({ kind: 'destaque', text: `@${o.username}: o pago gerou ${x.totals.engagement.toLocaleString('pt-BR')} engajamentos (${brl(x.derived.costPerEngagement)} cada) contra ~${Math.round(organicTotal).toLocaleString('pt-BR')} interações orgânicas nos ${o.posts} posts importados${o.followers ? ` (${o.followers.toLocaleString('pt-BR')} seguidores)` : ''}.` });
  }
  return out;
}

export function funnelLeak(x: AccountPaid): { step: string; rate: number } | null {
  const steps: Array<[string, number | null]> = [
    ['clique → visita à página', x.derived.lpvRate], ['visita → início de checkout', x.derived.checkoutRate], ['checkout → compra', x.derived.purchaseRate],
  ];
  const valid = steps.filter(([, r]) => r != null) as Array<[string, number]>;
  if (!valid.length) return null;
  const [step, rate] = valid.sort((m, n) => m[1] - n[1])[0];
  return { step, rate };
}
