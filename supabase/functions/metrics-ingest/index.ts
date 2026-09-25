// Edge function: metrics-ingest — puxa do Instagram (Graph API) as métricas das
// peças publicadas nos últimos 60 dias e grava em post_metrics (source
// 'instagram_api'). LinkedIn não tem API de leitura: métricas manuais no app.
//
// Quem chama:
//   - cron diário (Bearer = service_role, sem x-bee-user-id) → todos os usuários;
//   - o app ("Atualizar métricas", JWT do usuário) → só as peças dele;
//   - serviço → serviço (service_role + x-bee-user-id) → um usuário.
// Curtidas/comentários vêm dos campos básicos; alcance/salvos/compartilhamentos
// exigem a permissão de insights (conta reconectada) — sem ela, grava o básico.
import { corsHeaders, errorResponse, isServiceCall, jsonResponse, preflight, userIdFromAuth } from '../_shared/security.ts';
import { fetchRest, svcHeaders } from '../_shared/gemini.ts';
import { igMediaId, igMetricRow, type IgFields, type IgInsight } from '../_shared/metrics.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GRAPH = 'https://graph.facebook.com/v21.0';
const INSIGHTS = 'reach,saved,shares,likes,comments,views';

interface Post { id: string; user_id: string; account_id: string | null; published_url: string | null; published_at: string; format: string; metadata: Record<string, unknown> | null }
interface Account { id: string; user_id: string; platform: string; status: string; is_default: boolean; instagram_access_token: string | null }

async function graph<T>(path: string, token: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${GRAPH}/${path}${sep}access_token=${encodeURIComponent(token)}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) return { ok: false, error: (json.error?.message as string | undefined)?.slice(0, 300) ?? `HTTP ${res.status}` };
  return { ok: true, data: json as T };
}

async function ingestUser(userId: string): Promise<{ user_id: string; posts: number; saved: number; insights: boolean; errors: string[] }> {
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const [posts, accounts, settings] = await Promise.all([
    fetchRest<Post[]>(`/user_posts?user_id=eq.${userId}&platform=eq.instagram&status=eq.published&published_at=gte.${since}&select=id,user_id,account_id,published_url,published_at,format,metadata&order=published_at.desc&limit=100`),
    fetchRest<Account[]>(`/social_accounts?user_id=eq.${userId}&platform=eq.instagram&select=id,user_id,platform,status,is_default,instagram_access_token`),
    fetchRest<Array<{ instagram_access_token: string | null }>>(`/user_settings?user_id=eq.${userId}&select=instagram_access_token&limit=1`),
  ]);
  const out = { user_id: userId, posts: posts.length, saved: 0, insights: false, errors: [] as string[] };
  const fallback = accounts.find((a) => a.is_default && a.status === 'connected' && a.instagram_access_token)?.instagram_access_token ?? settings[0]?.instagram_access_token ?? null;

  for (const p of posts) {
    const mediaId = igMediaId(p);
    const acc = accounts.find((a) => a.id === p.account_id);
    const token = (acc?.status === 'connected' ? acc.instagram_access_token : null) ?? fallback;
    if (!mediaId || !token) { out.errors.push(`${p.id}: ${!mediaId ? 'sem id da mídia' : 'sem token do Instagram'}`); continue; }

    const basic = await graph<IgFields>(`${mediaId}?fields=like_count,comments_count,permalink,timestamp`, token);
    if (!basic.ok) { out.errors.push(`${p.id}: ${basic.error}`); continue; }
    const ins = await graph<{ data: IgInsight[] }>(`${mediaId}/insights?metric=${INSIGHTS}`, token);
    if (ins.ok) out.insights = true;
    const values = igMetricRow(basic.data, ins.ok ? ins.data.data : undefined);

    const res = await fetch(`${SUPABASE_URL}/rest/v1/post_metrics?on_conflict=post_id,source`, {
      method: 'POST',
      headers: { ...svcHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        user_id: userId, post_id: p.id, account_id: p.account_id, source: 'instagram_api', captured_at: new Date().toISOString(),
        ...values, raw: { fields: basic.data, insights: ins.ok ? ins.data.data : null, insights_error: ins.ok ? null : ins.error },
      }),
    });
    if (!res.ok) { out.errors.push(`${p.id}: gravar ${res.status}`); continue; }
    out.saved++;
    // Guarda o id da mídia e o link real do post (o publish grava o id na URL).
    if (p.metadata?.ig_media_id !== mediaId || (basic.data.permalink && basic.data.permalink !== p.published_url)) {
      await fetch(`${SUPABASE_URL}/rest/v1/user_posts?id=eq.${p.id}`, {
        method: 'PATCH', headers: { ...svcHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({ metadata: { ...(p.metadata ?? {}), ig_media_id: mediaId }, ...(basic.data.permalink ? { published_url: basic.data.permalink } : {}) }),
      });
    }
  }
  return out;
}

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);
  try {
    const isService = isServiceCall(req);
    const userId = isService ? req.headers.get('x-bee-user-id') : userIdFromAuth(req);
    if (!isService && !userId) return errorResponse('Nao autenticado', 401);

    let users: string[];
    if (userId) users = [userId];
    else {
      // Cron: todo usuário com peça publicada no Instagram nos últimos 60 dias.
      const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
      const rows = await fetchRest<Array<{ user_id: string }>>(`/user_posts?platform=eq.instagram&status=eq.published&published_at=gte.${since}&select=user_id&limit=1000`);
      users = [...new Set(rows.map((r) => r.user_id))];
    }
    const results = [];
    for (const u of users) results.push(await ingestUser(u));
    return jsonResponse({ success: true, users: results.length, results });
  } catch (e) {
    console.error('[metrics-ingest]', e);
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
