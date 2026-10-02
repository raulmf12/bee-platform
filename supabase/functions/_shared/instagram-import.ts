// Importa o HISTÓRICO de uma conta do Instagram para a base de posts: cada mídia
// vira uma peça publicada (user_posts) + um conteúdo "Sem campanha", com as
// imagens copiadas pro Storage (os links da Meta expiram) e as métricas em
// post_metrics. Também tira o retrato da conta (seguidores, alcance da conta,
// público) pro comparativo entre contas.
//
// Idempotente: mídia que já está na base (publicada pela plataforma ou já
// importada) só ganha conta, id e métricas — nunca duplica nem troca imagem.
// Paginado: cada chamada processa UMA página (PAGE mídias) e devolve o cursor.
import { svcHeaders } from './gemini.ts';
import { igMetricRow, type IgInsight } from './metrics.ts';
import { igFormat, imageSources, importedCode, insightMetricsFor, mediaIdFromUrl, quoteFromCaption, type IgMedia } from './instagram-map.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const GRAPH = 'https://graph.facebook.com/v21.0';
const PAGE = 10;
const MEDIA_FIELDS = 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,children{media_type,media_url,thumbnail_url}';

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

export interface ImportResult {
  account_id: string; username: string | null; processed: number; inserted: number; updated: number;
  metrics: number; insights: boolean; next: string | null; done: boolean; total: number | null; errors: string[];
}

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { ...init, headers: { ...svcHeaders(), ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path.split('?')[0]} ${res.status}: ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : null) as T;
}

async function graph<T>(path: string, token: string): Promise<{ ok: true; data: T } | { ok: false; error: string; code?: number }> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${GRAPH}/${path}${sep}access_token=${encodeURIComponent(token)}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) return { ok: false, error: (json.error?.message as string | undefined)?.slice(0, 300) ?? `HTTP ${res.status}`, code: json.error?.code };
  return { ok: true, data: json as T };
}

// Conta "via Integrações" usa o token de user_settings; as demais, o próprio.
export async function igCredentials(userId: string, account: Row): Promise<{ token: string; igId: string } | null> {
  if (account.metadata?.source === 'integrations') {
    const [s] = await rest<Row[]>(`/user_settings?user_id=eq.${userId}&select=instagram_access_token,instagram_business_account_id&limit=1`);
    const igId = account.instagram_business_account_id ?? s?.instagram_business_account_id;
    return s?.instagram_access_token && igId ? { token: s.instagram_access_token, igId } : null;
  }
  return account.instagram_access_token && account.instagram_business_account_id
    ? { token: account.instagram_access_token, igId: account.instagram_business_account_id } : null;
}

// Retrato da conta: perfil + alcance/engajamento dos últimos 30 dias + público.
// Tudo além do perfil depende da permissão de insights (best-effort).
async function snapshot(token: string, igId: string): Promise<Row> {
  const out: Row = { captured_at: new Date().toISOString() };
  const p = await graph<Row>(`${igId}?fields=username,name,followers_count,follows_count,media_count,profile_picture_url,biography`, token);
  if (p.ok) out.profile = p.data;
  else out.profile_error = p.error;
  const until = Math.floor(Date.now() / 1000), since = until - 29 * 86400;
  const t = await graph<{ data: IgInsight[] }>(`${igId}/insights?metric=reach,views,accounts_engaged,total_interactions,profile_views&period=day&metric_type=total_value&since=${since}&until=${until}`, token);
  if (t.ok) out.last_30d = Object.fromEntries(t.data.data.map((i) => [i.name, i.total_value?.value ?? null]));
  else out.insights_error = t.error;
  if (t.ok) {
    const f = await graph<{ data: Array<{ values: Array<{ value: number; end_time: string }> }> }>(`${igId}/insights?metric=follower_count&period=day&since=${since}&until=${until}`, token);
    if (f.ok) out.follower_gain_30d = (f.data.data[0]?.values ?? []).reduce((s, v) => s + (v.value ?? 0), 0);
    const demo: Row = {};
    for (const b of ['age', 'gender', 'city']) {
      const d = await graph<{ data: Array<{ total_value?: { breakdowns?: Array<{ results?: Array<{ dimension_values: string[]; value: number }> }> } }> }>(
        `${igId}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=${b}`, token);
      if (d.ok) demo[b] = (d.data.data[0]?.total_value?.breakdowns?.[0]?.results ?? []).map((r) => ({ key: r.dimension_values.join(' · '), value: r.value }));
    }
    if (Object.keys(demo).length) out.followers_demographics = demo;
  }
  return out;
}

async function copyImage(userId: string, mediaId: string, idx: number, src: string): Promise<string | null> {
  try {
    const img = await fetch(src);
    if (!img.ok) return null;
    const type = img.headers.get('content-type') ?? 'image/jpeg';
    const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
    const path = `${userId}/instagram/${mediaId}-${idx + 1}.${ext}`;
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const up = await fetch(`${SUPABASE_URL}/storage/v1/object/media/${path}`, {
      method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': type, 'x-upsert': 'true' }, body: await img.arrayBuffer(),
    });
    return up.ok ? `${SUPABASE_URL}/storage/v1/object/public/media/${path}` : null;
  } catch { return null; }
}

async function mediaInsights(m: IgMedia, token: string): Promise<{ list?: IgInsight[]; denied: boolean; error?: string }> {
  const metrics = insightMetricsFor(m);
  const r = await graph<{ data: IgInsight[] }>(`${m.id}/insights?metric=${metrics.join(',')}`, token);
  if (r.ok) return { list: r.data.data, denied: false };
  if (r.code === 10 || /permission/i.test(r.error)) return { denied: true, error: r.error };
  // Alguma métrica não vale pra este tipo/época: tenta uma a uma.
  const list: IgInsight[] = [];
  for (const x of metrics) {
    const one = await graph<{ data: IgInsight[] }>(`${m.id}/insights?metric=${x}`, token);
    if (one.ok) list.push(...one.data.data);
  }
  return { list: list.length ? list : undefined, denied: false, error: list.length ? undefined : r.error };
}

export async function importAccount(userId: string, accountId: string, opts: { cursor?: string | null; mode?: 'full' | 'recent' } = {}): Promise<ImportResult> {
  const [account] = await rest<Row[]>(`/social_accounts?id=eq.${accountId}&user_id=eq.${userId}&platform=eq.instagram&select=*&limit=1`);
  if (!account) throw new Error('Conta do Instagram não encontrada.');
  const creds = await igCredentials(userId, account);
  if (!creds) throw new Error(`A conta "${account.label}" está sem token do Instagram. Conecte-a de novo.`);
  const out: ImportResult = { account_id: accountId, username: null, processed: 0, inserted: 0, updated: 0, metrics: 0, insights: true, next: null, done: false, total: null, errors: [] };

  // 1ª página: retrato da conta (vai pro comparativo).
  const meta: Row = { ...(account.metadata ?? {}) };
  if (!opts.cursor) {
    const snap = await snapshot(creds.token, creds.igId);
    meta.ig = snap;
    if (snap.profile?.username && !account.handle) account.handle = `@${snap.profile.username}`;
  }
  out.username = meta.ig?.profile?.username ?? account.handle?.replace(/^@/, '') ?? null;
  out.total = meta.ig?.profile?.media_count ?? null;

  const page = await graph<{ data: IgMedia[]; paging?: { cursors?: { after?: string }; next?: string } }>(
    `${creds.igId}/media?fields=${MEDIA_FIELDS}&limit=${opts.mode === 'recent' ? 25 : PAGE}${opts.cursor ? `&after=${encodeURIComponent(opts.cursor)}` : ''}`, creds.token);
  if (!page.ok) throw new Error(`Instagram recusou a listagem: ${page.error}`);

  const known = await rest<Row[]>(`/user_posts?user_id=eq.${userId}&platform=eq.instagram&status=neq.archived&select=id,account_id,metadata,published_url`);
  const byMedia = new Map<string, Row>();
  for (const k of known) {
    const id = k.metadata?.ig_media_id ?? mediaIdFromUrl(k.published_url);
    if (id) byMedia.set(String(id), k);
    if (k.published_url) byMedia.set(k.published_url, k);
  }

  let insightsDenied = false;
  for (const m of page.data.data) {
    out.processed++;
    try {
      const hit = byMedia.get(m.id) ?? (m.permalink ? byMedia.get(m.permalink) : undefined);
      let postId: string;
      if (hit) {
        postId = hit.id;
        const patch: Row = {};
        if (!hit.account_id) patch.account_id = accountId;
        if (hit.metadata?.ig_media_id !== m.id) patch.metadata = { ...(hit.metadata ?? {}), ig_media_id: m.id };
        if (Object.keys(patch).length) {
          await rest(`/user_posts?id=eq.${hit.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
          out.updated++;
        }
      } else {
        const urls: string[] = [];
        for (const [i, src] of imageSources(m).entries()) { const u = await copyImage(userId, m.id, i, src); if (u) urls.push(u); }
        const quote = quoteFromCaption(m.caption) || 'Post do Instagram';
        const [content] = await rest<Row[]>(`/contents`, {
          method: 'POST', headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ user_id: userId, title: quote, body: { frase: quote, texto: m.caption ?? '' }, status: 'validated', metadata: { imported_from: 'instagram', ig_media_id: m.id, account_id: accountId }, created_at: m.timestamp }),
        });
        const [post] = await rest<Row[]>(`/user_posts`, {
          method: 'POST', headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            user_id: userId, platform: 'instagram', format: igFormat(m), status: 'published', title: quote, caption: m.caption ?? '',
            carousel_text: { quote }, codigo: importedCode(m), published_at: m.timestamp, published_date: m.timestamp, published_url: m.permalink ?? null,
            account_id: accountId, content_id: content.id, text_approved: true, image_approved: true, image_status: 'approved',
            rendered_slides: Object.fromEntries(urls.map((u, i) => [`slide${i + 1}`, u])),
            metadata: { ig_media_id: m.id, imported_from: 'instagram', media_type: m.media_type, media_product_type: m.media_product_type ?? null, slides_total: m.children?.data?.length ?? 1 },
            created_at: m.timestamp,
          }),
        });
        postId = post.id;
        out.inserted++;
      }

      let insights: IgInsight[] | undefined;
      if (!insightsDenied) {
        const ins = await mediaInsights(m, creds.token);
        if (ins.denied) { insightsDenied = true; out.insights = false; }
        insights = ins.list;
      }
      const values = igMetricRow({ like_count: m.like_count, comments_count: m.comments_count }, insights);
      await rest(`/post_metrics?on_conflict=post_id,source`, {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ user_id: userId, post_id: postId, account_id: accountId, source: 'instagram_api', captured_at: new Date().toISOString(), ...values,
          raw: { fields: { like_count: m.like_count, comments_count: m.comments_count, permalink: m.permalink }, insights: insights ?? null, insights_error: insightsDenied ? 'sem permissão de insights' : null } }),
      });
      out.metrics++;
    } catch (e) {
      out.errors.push(`${m.id}: ${(e as Error).message.slice(0, 200)}`);
    }
  }

  out.next = opts.mode === 'recent' ? null : (page.data.paging?.next ? page.data.paging.cursors?.after ?? null : null);
  out.done = !out.next;
  if (!opts.cursor || out.done) {
    meta.ig = { ...(meta.ig ?? {}), ...(out.done ? { imported_at: new Date().toISOString() } : {}), insights_ok: out.insights };
    await rest(`/social_accounts?id=eq.${accountId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ metadata: meta, ...(account.handle ? { handle: account.handle } : {}) }) });
  }
  return out;
}
