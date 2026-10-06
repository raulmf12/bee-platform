// Carga dos dados de tráfego pago (Meta Ads) pra análise por conta do Instagram.
// A API do banco devolve no máximo 1000 linhas por chamada → pagina.
import { supabase } from '@/lib/supabase';
import type { AdRow, CampaignRow, InsightRow } from './paidTraffic';

async function all<T>(table: string, columns: string, order: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).order(order).range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function loadPaidTraffic(): Promise<{ rows: InsightRow[]; ads: AdRow[]; campaigns: CampaignRow[] }> {
  const [rows, ads, campaigns] = await Promise.all([
    all<InsightRow>('meta_ad_insights_daily', 'fb_account_id,fb_campaign_id,campaign_name,fb_adset_id,fb_ad_id,ad_name,date,spend,impressions,reach,clicks,inline_link_clicks,actions,action_values', 'date'),
    all<AdRow>('meta_ads', 'fb_ad_id,name,fb_campaign_id,effective_status,ig_account_id,ig_username,attribution_source,creative', 'fb_ad_id'),
    all<CampaignRow>('meta_campaigns', 'fb_campaign_id,name,objective,effective_status', 'fb_campaign_id'),
  ]);
  return { rows, ads, campaigns };
}
