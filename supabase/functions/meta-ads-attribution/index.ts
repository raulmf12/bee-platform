// Edge function: meta-ads-attribution — atribui cada anúncio (meta_ads) à conta
// do Instagram que o veiculou, pra análise de tráfego por conta.
//   1. criativo.instagram_user_id (ou object_story_spec.instagram_user_id/actor_id) — exato;
//   2. senão, a Página que veiculou (actor_id / effective_object_story_id) → conta IG da Página;
//   3. senão, 'unresolved' (ex.: post apagado de Página sem IG).
// Não altera a sincronização (meta-ads-sync); só completa colunas aditivas.
//
// Entrada: { force?: boolean }  (sem force: só anúncios ainda não atribuídos)
// Quem chama: o app (JWT do dono) ou serviço (service_role + x-bee-user-id).
import { errorResponse, isServiceCall, jsonResponse, preflight, userIdFromAuth } from '../_shared/security.ts';
import { fetchRest, svcHeaders } from '../_shared/gemini.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const GRAPH = 'https://graph.facebook.com/v21.0';
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

async function graph(path: string, token: string): Promise<Row> {
  const res = await fetch(`${GRAPH}/${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`);
  return await res.json().catch(() => ({}));
}

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);
  try {
    const userId = isServiceCall(req) ? req.headers.get('x-bee-user-id') : userIdFromAuth(req);
    if (!userId) return errorResponse('Nao autenticado', 401);
    const body = (await req.json().catch(() => ({}))) as { force?: boolean };
    const [conn] = await fetchRest<Row[]>(`/meta_connections?user_id=eq.${userId}&select=access_token&limit=1`);
    if (!conn?.access_token) return errorResponse('Sem conexão do Facebook (tráfego pago).', 400);
    const token = conn.access_token as string;

    const ads = await fetchRest<Row[]>(`/meta_ads?user_id=eq.${userId}${body.force ? '' : '&ig_account_id=is.null&attribution_source=is.null'}&select=id,fb_ad_id,creative&limit=5000`);
    // Contas IG conhecidas (id → @) e Páginas → IG.
    const accounts = await fetchRest<Row[]>(`/social_accounts?user_id=eq.${userId}&platform=eq.instagram&select=instagram_business_account_id,handle`);
    const igName = new Map<string, string>(accounts.filter((a) => a.instagram_business_account_id && a.handle).map((a) => [String(a.instagram_business_account_id), String(a.handle).replace(/^@/, '')]));
    const pages = await graph('me/accounts?fields=id,instagram_business_account{id,username}&limit=100', token);
    const pageIg = new Map<string, { id: string; username: string }>();
    for (const p of pages.data ?? []) if (p.instagram_business_account?.id) pageIg.set(String(p.id), { id: String(p.instagram_business_account.id), username: p.instagram_business_account.username });
    for (const v of pageIg.values()) if (!igName.has(v.id) && v.username) igName.set(v.id, v.username);

    const creativeCache = new Map<string, Row>();
    const out = { ads: ads.length, creative: 0, page: 0, unresolved: 0, errors: [] as string[] };
    for (const a of ads) {
      const cid = a.creative?.id ? String(a.creative.id) : null;
      let cr: Row = {};
      if (cid) {
        if (!creativeCache.has(cid)) creativeCache.set(cid, await graph(`${cid}?fields=instagram_user_id,actor_id,object_story_spec,effective_object_story_id`, token));
        cr = creativeCache.get(cid)!;
      }
      const igId = cr.instagram_user_id ?? cr.object_story_spec?.instagram_user_id ?? cr.object_story_spec?.instagram_actor_id ?? null;
      const story = String(cr.effective_object_story_id ?? a.creative?.effective_object_story_id ?? '');
      const pageId = cr.actor_id ? String(cr.actor_id) : cr.object_story_spec?.page_id ? String(cr.object_story_spec.page_id) : story.includes('_') ? story.split('_')[0] : null;
      let patch: Row;
      if (igId) {
        let username = igName.get(String(igId));
        if (!username) {
          const u = await graph(`${igId}?fields=username`, token);
          username = u.username;
          if (username) igName.set(String(igId), username);
        }
        patch = { ig_account_id: String(igId), ig_username: username ?? null, fb_page_id: pageId, attribution_source: 'creative_instagram_user' };
        out.creative++;
      } else if (pageId && pageIg.has(pageId)) {
        const p = pageIg.get(pageId)!;
        patch = { ig_account_id: p.id, ig_username: igName.get(p.id) ?? p.username ?? null, fb_page_id: pageId, attribution_source: 'page_instagram' };
        out.page++;
      } else {
        patch = { fb_page_id: pageId, attribution_source: 'unresolved' };
        out.unresolved++;
        if (cr.error) out.errors.push(`${a.fb_ad_id}: ${String(cr.error.message ?? '').slice(0, 120)}`);
      }
      const res = await fetch(`${SUPABASE_URL}/rest/v1/meta_ads?id=eq.${a.id}`, {
        method: 'PATCH', headers: { ...svcHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({ ...patch, attributed_at: new Date().toISOString() }),
      });
      if (!res.ok) out.errors.push(`${a.fb_ad_id}: gravar ${res.status}`);
    }
    return jsonResponse({ success: true, ...out, errors: out.errors.slice(0, 20) });
  } catch (e) {
    console.error('[meta-ads-attribution]', e);
    return errorResponse((e as Error).message.slice(0, 300), 500);
  }
});
