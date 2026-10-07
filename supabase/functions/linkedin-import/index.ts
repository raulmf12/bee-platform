// Edge function: linkedin-import — histórico do LinkedIn via Apify (sem login no
// LinkedIn; a API oficial não deixa ler posts passados). Sem métricas por enquanto:
// o objetivo é a Hive saber o que JÁ foi dito e não repetir.
//   start  { account_id, profile }  → dispara o scraper (assíncrono) e guarda o run
//   status { account_id }           → quando terminar, importa e indexa na memória
// Idempotente: posts já na base (mesmo URN/link) não duplicam.
import { checkRateLimit, errorResponse, getUserGeminiKey, internalUserId, jsonResponse, preflight, userIdFromAuth } from '../_shared/security.ts';
import { svcHeaders } from '../_shared/gemini.ts';
import { liMapPost, liUsername, type LiScraped } from '../_shared/linkedin-map.ts';
import { syncMemory } from '../_shared/content-memory.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const APIFY = 'https://api.apify.com/v2';
const ACTOR = Deno.env.get('APIFY_LINKEDIN_ACTOR') ?? 'apimaestro~linkedin-profile-posts';
const MAX_POSTS = Number(Deno.env.get('LINKEDIN_IMPORT_MAX') ?? '1000');
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { ...init, headers: { ...svcHeaders(), ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path.split('?')[0]} ${res.status}: ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : null) as T;
}
async function apify<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${APIFY}${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Apify ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
}
const saveMeta = (accountId: string, metadata: Row) => rest(`/social_accounts?id=eq.${accountId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ metadata }) });

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);
  try {
    const userId = userIdFromAuth(req) ?? internalUserId(req);
    if (!userId) return errorResponse('Nao autenticado', 401);
    const rl = checkRateLimit(userId, 60_000, 30);
    if (!rl.ok) return errorResponse(`Rate limit. Tente em ${Math.ceil(rl.resetIn / 1000)}s`, 429);
    const input = (await req.json().catch(() => ({}))) as { action?: string; account_id?: string; profile?: string };
    const token = Deno.env.get('APIFY_TOKEN');
    if (!token) return errorResponse('A chave do Apify ainda não foi configurada no servidor (APIFY_TOKEN).', 400);
    if (!input.account_id) return errorResponse('account_id obrigatório', 400);
    const [account] = await rest<Row[]>(`/social_accounts?id=eq.${input.account_id}&user_id=eq.${userId}&platform=eq.linkedin&select=id,label,metadata&limit=1`);
    if (!account) return errorResponse('Conta do LinkedIn não encontrada', 404);
    const meta: Row = { ...(account.metadata ?? {}) };

    if (input.action === 'start') {
      const username = liUsername(input.profile ?? meta.li_import?.profile ?? '');
      if (!username) return errorResponse('Informe a URL do perfil (linkedin.com/in/…)', 400);
      const run = await apify<{ data: { id: string; defaultDatasetId: string; status: string } }>(`/acts/${ACTOR}/runs`, token, {
        method: 'POST', body: JSON.stringify({ username, total_posts: MAX_POSTS, limit: 100 }),
      });
      meta.li_import = { ...(meta.li_import ?? {}), profile: username, run_id: run.data.id, dataset_id: run.data.defaultDatasetId, status: run.data.status, started_at: new Date().toISOString() };
      await saveMeta(account.id, meta);
      return jsonResponse({ success: true, status: run.data.status, run_id: run.data.id });
    }

    // status: acompanha o run; ao terminar, importa.
    const li = meta.li_import;
    if (!li?.run_id) return errorResponse('Nenhuma importação em andamento', 400);
    const run = await apify<{ data: { status: string; defaultDatasetId: string } }>(`/actor-runs/${li.run_id}`, token);
    const st = run.data.status;
    if (st === 'RUNNING' || st === 'READY') return jsonResponse({ success: true, status: st, done: false });
    if (st !== 'SUCCEEDED') {
      meta.li_import = { ...li, status: st };
      await saveMeta(account.id, meta);
      return errorResponse(`O scraper terminou com status ${st}.`, 502);
    }
    const items = await apify<LiScraped[]>(`/datasets/${run.data.defaultDatasetId}/items?clean=true&format=json`, token);
    const known = await rest<Row[]>(`/user_posts?user_id=eq.${userId}&platform=eq.linkedin&select=id,metadata,published_url&limit=5000`);
    const keys = new Set<string>();
    for (const k of known) { if (k.metadata?.li_urn) keys.add(k.metadata.li_urn); if (k.published_url) keys.add(String(k.published_url).split('?')[0]); }

    let inserted = 0, skipped = 0;
    for (const raw of items) {
      const p = liMapPost(raw);
      if (!p) { skipped++; continue; }
      if (keys.has(p.key) || (p.url && keys.has(p.url))) { skipped++; continue; }
      const [content] = await rest<Row[]>(`/contents`, {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ user_id: userId, title: p.quote, body: { frase: p.quote, texto: p.text }, status: 'validated', metadata: { imported_from: 'linkedin', li_urn: p.key, account_id: account.id }, ...(p.posted_at ? { created_at: p.posted_at } : {}) }),
      });
      await rest(`/user_posts`, {
        method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          user_id: userId, platform: 'linkedin', format: 'text', status: 'published', title: p.quote, caption: p.text, carousel_text: { quote: p.quote },
          published_at: p.posted_at, published_date: p.posted_at, published_url: p.url, account_id: account.id, content_id: content.id,
          text_approved: true, image_approved: true, image_status: 'approved', acj_status: 'legacy_unassigned',
          metadata: { li_urn: p.key, imported_from: 'linkedin', post_type: p.post_type },
          ...(p.posted_at ? { created_at: p.posted_at } : {}),
        }),
      });
      keys.add(p.key);
      inserted++;
    }
    meta.li_import = { ...li, status: 'SUCCEEDED', imported_at: new Date().toISOString(), found: items.length, inserted: (li.inserted ?? 0) + inserted };
    await saveMeta(account.id, meta);
    // Indexa o histórico na memória anti-repetição (o resto entra nas próximas pautas).
    const apiKey = await getUserGeminiKey(userId);
    const mem = apiKey ? await syncMemory(apiKey, userId, 40).catch(() => null) : null;
    return jsonResponse({ success: true, status: st, done: true, found: items.length, inserted, skipped, memory: mem });
  } catch (e) {
    console.error('[linkedin-import]', e);
    return errorResponse('Erro na importação do LinkedIn', 500, String(e));
  }
});

export {};
