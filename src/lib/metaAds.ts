// Tráfego pago (Meta Ads): guarda a conexão do Facebook e sincroniza (BMs,
// contas de anúncio, campanhas, conjuntos, anúncios e histórico diário). Os
// dados ficam no banco pra uso futuro; aqui só o status.
import { db, getCurrentUserId } from '@/lib/db';
import { edge } from '@/lib/edge';

export interface MetaAdsSummary { businesses?: number; ad_accounts?: number; campaigns?: number; adsets?: number; ads?: number; insight_rows?: number; date_min?: string | null; date_max?: string | null; spend?: Record<string, number> }
export interface MetaConnectionStatus {
  status: 'connected' | 'no_ads_permission' | 'expired' | 'error'; fb_user_name: string | null; last_synced_at: string | null; history_complete_at: string | null;
  sync_state: { summary?: MetaAdsSummary; queue?: unknown[]; last_error?: string | null };
}

// O token NÃO volta pro navegador: só o status.
export async function getMetaConnection(): Promise<MetaConnectionStatus | null> {
  const rows = await db.select<MetaConnectionStatus>('meta_connections', { select: 'status,fb_user_name,last_synced_at,history_complete_at,sync_state', limit: '1' });
  return rows[0] ?? null;
}

// Mesmo token longo do login do Instagram (o login pede ads_read + business_management).
export async function saveMetaConnection(accessToken: string, expiresAt: string, scopes: string[]): Promise<void> {
  if (!getCurrentUserId()) throw new Error('Sessão expirada. Entre de novo.');
  await db.upsert('meta_connections', {
    user_id: getCurrentUserId(), access_token: accessToken, token_expires_at: expiresAt, scopes,
    status: 'connected', sync_state: {}, history_complete_at: null, updated_at: new Date().toISOString(),
  }, 'user_id');
}

// Roda a sincronização até terminar (ou até `maxRounds`); o cron continua o resto.
export async function syncMetaAds(onProgress?: (r: { queue_left: number; summary?: MetaAdsSummary; status: string }) => void, maxRounds = 30) {
  let last: Awaited<ReturnType<typeof edge.metaAdsSync>> | null = null;
  for (let i = 0; i < maxRounds; i++) {
    last = await edge.metaAdsSync(i === 0 ? { force_structure: true } : {});
    onProgress?.({ queue_left: last.queue_left, summary: last.summary as MetaAdsSummary | undefined, status: last.status });
    if (last.done) break;
  }
  return last;
}
