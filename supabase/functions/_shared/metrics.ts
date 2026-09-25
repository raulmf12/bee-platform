// Métricas do Instagram (Graph API) → linha de post_metrics. PURO (sem Deno):
// é importado pela edge `metrics-ingest` e pelos testes unitários.

// O id da mídia fica em metadata.ig_media_id (gravado na 1ª coleta) ou no
// published_url que o publish grava: https://www.instagram.com/p/<media_id>/
export function igMediaId(post: { published_url?: string | null; metadata?: Record<string, unknown> | null }): string | null {
  const fromMeta = post.metadata?.ig_media_id;
  if (typeof fromMeta === 'string' && /^\d+$/.test(fromMeta)) return fromMeta;
  const m = post.published_url?.match(/instagram\.com\/(?:p|reel)\/(\d{6,})\/?/);
  return m ? m[1] : null;
}

export interface IgFields { like_count?: number; comments_count?: number; permalink?: string; timestamp?: string }
export interface IgInsight { name: string; values?: Array<{ value: number }>; total_value?: { value: number } }

export interface MetricValues {
  reach: number | null; impressions: number | null; likes: number | null; comments: number | null;
  saves: number | null; shares: number | null; engagement_rate: number | null;
}

const insight = (list: IgInsight[] | undefined, name: string): number | null => {
  const i = list?.find((x) => x.name === name);
  const v = i?.total_value?.value ?? i?.values?.[0]?.value;
  return typeof v === 'number' ? v : null;
};

// Interações / alcance (ou impressões). Sem denominador → null.
export function engagementRate(v: Pick<MetricValues, 'reach' | 'impressions' | 'likes' | 'comments' | 'saves' | 'shares'>): number | null {
  const base = v.reach ?? v.impressions;
  if (!base) return null;
  const inter = (v.likes ?? 0) + (v.comments ?? 0) + (v.saves ?? 0) + (v.shares ?? 0);
  return Math.round((inter / base) * 10000) / 10000;
}

// `insights` ausente = conta sem permissão de insights (ainda não reconectou):
// fica só com curtidas/comentários, que vêm dos campos básicos.
export function igMetricRow(fields: IgFields, insights?: IgInsight[]): MetricValues {
  const v = {
    reach: insight(insights, 'reach'),
    impressions: insight(insights, 'views') ?? insight(insights, 'impressions'),
    likes: fields.like_count ?? insight(insights, 'likes'),
    comments: fields.comments_count ?? insight(insights, 'comments'),
    saves: insight(insights, 'saved'),
    shares: insight(insights, 'shares'),
  };
  return { ...v, engagement_rate: engagementRate(v) };
}
