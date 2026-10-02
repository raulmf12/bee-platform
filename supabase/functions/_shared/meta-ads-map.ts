// Partes PURAS da sincronização do Meta Ads (sem Deno) — usadas pela edge
// `meta-ads-sync` e pelos testes unitários.

export const HISTORY_MONTHS = 37; // limite de histórico da API de insights da Meta

export const INSIGHT_FIELDS = [
  'account_id', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name', 'date_start',
  'spend', 'impressions', 'reach', 'frequency', 'clicks', 'inline_link_clicks', 'ctr', 'cpc', 'cpm',
  'actions', 'action_values', 'cost_per_action_type',
].join(',');

// Todos os status (a listagem padrão da Meta esconde arquivados/excluídos).
export const CAMPAIGN_STATUSES = ['ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED', 'IN_PROCESS', 'WITH_ISSUES'];
export const ADSET_STATUSES = [...CAMPAIGN_STATUSES, 'CAMPAIGN_PAUSED'];
export const AD_STATUSES = [...ADSET_STATUSES, 'ADSET_PAUSED', 'DISAPPROVED', 'PENDING_REVIEW', 'PREAPPROVED', 'PENDING_BILLING_INFO'];

export interface Chunk { account: string; since: string; until: string }

const iso = (d: Date) => d.toISOString().slice(0, 10);

// Meses do mais recente pro mais antigo, de `today` até `floor` (data mais
// antiga permitida: criação da conta ou o limite de 37 meses, o que vier depois).
export function monthChunks(account: string, today: string, createdTime?: string | null): Chunk[] {
  const t = new Date(`${today}T12:00:00Z`);
  const limit = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - HISTORY_MONTHS + 1, 1));
  const created = createdTime ? new Date(createdTime) : null;
  const floor = created && created > limit ? new Date(Date.UTC(created.getUTCFullYear(), created.getUTCMonth(), created.getUTCDate())) : limit;
  const out: Chunk[] = [];
  let end = t;
  while (end >= floor) {
    const first = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
    const since = first < floor ? floor : first;
    out.push({ account, since: iso(since), until: iso(end) });
    end = new Date(first.getTime() - 86_400_000);
  }
  return out;
}

const num = (v: unknown): number | null => (v == null || v === '' ? null : Number(v));

// Linha da API de insights (nível anúncio, diário) → linha de meta_ad_insights_daily.
// deno-lint-ignore no-explicit-any
export function insightRow(userId: string, accountId: string, r: Record<string, any>) {
  return {
    user_id: userId, fb_account_id: accountId,
    fb_campaign_id: r.campaign_id ?? null, campaign_name: r.campaign_name ?? null,
    fb_adset_id: r.adset_id ?? null, adset_name: r.adset_name ?? null,
    fb_ad_id: r.ad_id, ad_name: r.ad_name ?? null, date: r.date_start,
    spend: num(r.spend), impressions: num(r.impressions), reach: num(r.reach), frequency: num(r.frequency),
    clicks: num(r.clicks), inline_link_clicks: num(r.inline_link_clicks), ctr: num(r.ctr), cpc: num(r.cpc), cpm: num(r.cpm),
    actions: r.actions ?? null, action_values: r.action_values ?? null, cost_per_action_type: r.cost_per_action_type ?? null,
    synced_at: new Date().toISOString(),
  };
}

// Post do Instagram por trás do anúncio (post impulsionado ou criativo do IG).
// deno-lint-ignore no-explicit-any
export function adIgMediaId(creative: Record<string, any> | null | undefined): string | null {
  const id = creative?.effective_instagram_media_id ?? creative?.instagram_media_id ?? creative?.source_instagram_media_id;
  return id ? String(id) : null;
}

// Erro de permissão de anúncios (falta ads_read / ads_management).
export function isAdsPermissionError(e: { code?: number; message?: string } | null | undefined): boolean {
  if (!e) return false;
  return e.code === 200 || e.code === 10 || /ads_read|ads_management|permission/i.test(e.message ?? '');
}
