// Sincronização do Meta Ads de UM usuário, com orçamento de tempo (retoma de
// onde parou na próxima chamada). Ordem:
//   1. estrutura (1x por dia ou na 1ª vez): usuário, BMs, contas de anúncio,
//      campanhas, conjuntos e anúncios — tudo com upsert;
//   2. fila do histórico diário por anúncio: blocos de 1 mês, do mais recente pro
//      mais antigo, até a criação da conta ou 37 meses; + os últimos 7 dias todo dia.
// Estado (fila, resumo, último erro) em meta_connections.sync_state.
import { svcHeaders } from './gemini.ts';
import {
  AD_STATUSES, ADSET_STATUSES, CAMPAIGN_STATUSES, INSIGHT_FIELDS, adIgMediaId, insightRow, isAdsPermissionError, monthChunks, type Chunk,
} from './meta-ads-map.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const GRAPH = 'https://graph.facebook.com/v21.0';
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
type GraphErr = { code?: number; message?: string };

const todayBR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const daysAgo = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { ...init, headers: { ...svcHeaders(), ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path.split('?')[0]} ${res.status}: ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : null) as T;
}

async function upsert(table: string, rows: Row[], conflict: string): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    await rest(`/${table}?on_conflict=${conflict}`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows.slice(i, i + 500)) });
  }
}

class GraphError extends Error { constructor(public err: GraphErr) { super(err.message ?? 'Graph error'); } }

async function graph<T>(path: string, token: string): Promise<T> {
  const url = path.startsWith('http') ? path : `${GRAPH}/${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new GraphError({ code: json.error?.code, message: (json.error?.message as string | undefined)?.slice(0, 300) ?? `HTTP ${res.status}` });
  return json as T;
}

// Todas as páginas de uma listagem.
async function all(path: string, token: string, cap = 5000): Promise<Row[]> {
  const out: Row[] = [];
  let next: string | null = path;
  while (next && out.length < cap) {
    const page: { data?: Row[]; paging?: { next?: string } } = await graph(next, token);
    out.push(...(page.data ?? []));
    next = page.paging?.next ?? null;
  }
  return out;
}

const statusFilter = (list: string[]) => `filtering=${encodeURIComponent(JSON.stringify([{ field: 'effective_status', operator: 'IN', value: list }]))}`;

export interface SyncResult { user_id: string; status: string; done: boolean; queue_left: number; chunks: number; rows: number; summary?: Row; error?: string }

async function syncStructure(userId: string, token: string, today: string, state: Row): Promise<{ accounts: Row[]; denied: boolean }> {
  const me = await graph<{ id: string; name: string }>('me?fields=id,name', token);
  await rest(`/meta_connections?user_id=eq.${userId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ fb_user_id: me.id, fb_user_name: me.name }) });

  const businesses = await all('me/businesses?fields=id,name,verification_status,created_time&limit=100', token);
  await upsert('meta_businesses', businesses.map((b) => ({ user_id: userId, fb_business_id: b.id, name: b.name, verification_status: b.verification_status ?? null, raw: b, synced_at: new Date().toISOString() })), 'user_id,fb_business_id');

  const ACC = 'id,name,currency,timezone_name,account_status,amount_spent,created_time,business{id}';
  const found = new Map<string, Row>();
  let denied = false;
  const tryList = async (path: string, ownership: string, biz: string | null) => {
    try {
      for (const a of await all(path, token)) if (!found.has(a.id)) found.set(a.id, { ...a, _ownership: ownership, _biz: biz ?? a.business?.id ?? null });
    } catch (e) {
      if (e instanceof GraphError && isAdsPermissionError(e.err)) denied = true; else throw e;
    }
  };
  for (const b of businesses) {
    await tryList(`${b.id}/owned_ad_accounts?fields=${ACC}&limit=100`, 'owned', b.id);
    await tryList(`${b.id}/client_ad_accounts?fields=${ACC}&limit=100`, 'client', b.id);
  }
  await tryList(`me/adaccounts?fields=${ACC}&limit=100`, 'personal', null);
  const accounts = [...found.values()];
  if (!accounts.length) return { accounts, denied };

  await upsert('meta_ad_accounts', accounts.map((a) => ({
    user_id: userId, fb_account_id: a.id, fb_business_id: a._biz, ownership: a._ownership, name: a.name, currency: a.currency,
    timezone_name: a.timezone_name, account_status: a.account_status, amount_spent: a.amount_spent != null ? Number(a.amount_spent) : null,
    created_time: a.created_time ?? null, raw: { ...a, _ownership: undefined, _biz: undefined }, synced_at: new Date().toISOString(),
  })), 'user_id,fb_account_id');

  for (const a of accounts) {
    try {
      const now = new Date().toISOString();
      const camps = await all(`${a.id}/campaigns?fields=id,name,objective,status,effective_status,buying_type,daily_budget,lifetime_budget,start_time,stop_time,created_time&${statusFilter(CAMPAIGN_STATUSES)}&limit=200`, token);
      await upsert('meta_campaigns', camps.map((c) => ({ user_id: userId, fb_account_id: a.id, fb_campaign_id: c.id, name: c.name, objective: c.objective, status: c.status, effective_status: c.effective_status, buying_type: c.buying_type ?? null,
        daily_budget: c.daily_budget != null ? Number(c.daily_budget) : null, lifetime_budget: c.lifetime_budget != null ? Number(c.lifetime_budget) : null,
        start_time: c.start_time ?? null, stop_time: c.stop_time ?? null, created_time: c.created_time ?? null, raw: c, synced_at: now })), 'user_id,fb_campaign_id');
      const sets = await all(`${a.id}/adsets?fields=id,name,campaign_id,status,effective_status,optimization_goal,billing_event,daily_budget,lifetime_budget,start_time,end_time,created_time,targeting&${statusFilter(ADSET_STATUSES)}&limit=200`, token);
      await upsert('meta_adsets', sets.map((s) => ({ user_id: userId, fb_account_id: a.id, fb_campaign_id: s.campaign_id, fb_adset_id: s.id, name: s.name, status: s.status, effective_status: s.effective_status,
        optimization_goal: s.optimization_goal ?? null, billing_event: s.billing_event ?? null,
        daily_budget: s.daily_budget != null ? Number(s.daily_budget) : null, lifetime_budget: s.lifetime_budget != null ? Number(s.lifetime_budget) : null,
        start_time: s.start_time ?? null, end_time: s.end_time ?? null, created_time: s.created_time ?? null, targeting: s.targeting ?? null, raw: s, synced_at: now })), 'user_id,fb_adset_id');
      const ads = await all(`${a.id}/ads?fields=id,name,campaign_id,adset_id,status,effective_status,created_time,creative{id,name,title,body,thumbnail_url,image_url,object_type,effective_instagram_media_id,instagram_permalink_url,effective_object_story_id}&${statusFilter(AD_STATUSES)}&limit=200`, token);
      await upsert('meta_ads', ads.map((d) => ({ user_id: userId, fb_account_id: a.id, fb_campaign_id: d.campaign_id, fb_adset_id: d.adset_id, fb_ad_id: d.id, name: d.name, status: d.status, effective_status: d.effective_status,
        created_time: d.created_time ?? null, creative: d.creative ?? null, ig_media_id: adIgMediaId(d.creative), raw: d, synced_at: now })), 'user_id,fb_ad_id');
      await rest(`/meta_ad_accounts?user_id=eq.${userId}&fb_account_id=eq.${a.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ insights_error: null }) });
    } catch (e) {
      await rest(`/meta_ad_accounts?user_id=eq.${userId}&fb_account_id=eq.${a.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ insights_error: (e as Error).message.slice(0, 300) }) });
    }
  }

  // Fila: últimos 7 dias de todas as contas (refresh diário, a Meta ajusta
  // números retroativamente) + o histórico que falta (1ª vez: tudo).
  const refresh: Chunk[] = accounts.map((a) => ({ account: a.id, since: daysAgo(today, 7), until: today }));
  const pending = ((state.queue as Chunk[] | undefined) ?? []).filter((c) => !(c.until === today && c.since === daysAgo(today, 7)));
  const queue: Chunk[] = [...refresh, ...pending];
  if (!state.history_queued) {
    for (const a of accounts) queue.push(...monthChunks(a.id, today, a.created_time));
    state.history_queued = true;
  }
  state.queue = queue;
  return { accounts, denied };
}

async function summary(userId: string): Promise<Row> {
  return await rest<Row>(`/rpc/meta_ads_summary`, { method: 'POST', body: JSON.stringify({ p_user: userId }) }).catch(() => ({}));
}

export async function syncUser(userId: string, budgetMs: number, opts: { forceStructure?: boolean } = {}): Promise<SyncResult> {
  const started = Date.now();
  const [conn] = await rest<Row[]>(`/meta_connections?user_id=eq.${userId}&select=*&limit=1`);
  if (!conn) return { user_id: userId, status: 'none', done: true, queue_left: 0, chunks: 0, rows: 0 };
  const token = conn.access_token as string;
  const state: Row = { ...(conn.sync_state ?? {}) };
  const today = todayBR();
  const out: SyncResult = { user_id: userId, status: conn.status, done: false, queue_left: 0, chunks: 0, rows: 0 };
  const save = async (patch: Row = {}) => {
    state.summary = await summary(userId);
    out.summary = state.summary;
    await rest(`/meta_connections?user_id=eq.${userId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ sync_state: state, last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...patch }) });
  };

  try {
    if (opts.forceStructure || state.refreshed_on !== today) {
      const r = await syncStructure(userId, token, today, state);
      state.refreshed_on = today;
      state.ad_accounts = r.accounts.length;
      if (r.denied && !r.accounts.length) {
        state.last_error = 'Sem permissão de anúncios (ads_read). Cadastre a permissão no app da Meta e reconecte.';
        out.status = 'no_ads_permission'; out.done = true;
        await save({ status: 'no_ads_permission' });
        return out;
      }
    }
    const queue = (state.queue as Chunk[] | undefined) ?? [];
    while (queue.length && Date.now() - started < budgetMs) {
      const c = queue[0];
      try {
        const tr = encodeURIComponent(JSON.stringify({ since: c.since, until: c.until }));
        const rows = await all(`${c.account}/insights?level=ad&time_increment=1&time_range=${tr}&fields=${INSIGHT_FIELDS}&limit=500`, token, 100_000);
        await upsert('meta_ad_insights_daily', rows.map((r) => insightRow(userId, c.account, r)), 'user_id,fb_ad_id,date');
        out.rows += rows.length;
        await rest(`/meta_ad_accounts?user_id=eq.${userId}&fb_account_id=eq.${c.account}&or=(history_since.is.null,history_since.gt.${c.since})`,
          { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ history_since: c.since }) });
      } catch (e) {
        if (e instanceof GraphError && e.err.code === 17) break; // limite de chamadas: continua na próxima rodada
        await rest(`/meta_ad_accounts?user_id=eq.${userId}&fb_account_id=eq.${c.account}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ insights_error: (e as Error).message.slice(0, 300) }) });
      }
      queue.shift();
      out.chunks++;
      state.queue = queue;
    }
    out.queue_left = queue.length;
    out.done = queue.length === 0;
    state.last_error = null;
    out.status = 'connected';
    await save({ status: 'connected', ...(out.done && !conn.history_complete_at ? { history_complete_at: new Date().toISOString() } : {}) });
  } catch (e) {
    const err = e instanceof GraphError ? e.err : { message: (e as Error).message };
    state.last_error = err.message;
    const expired = (err as GraphErr).code === 190;
    out.status = expired ? 'expired' : 'error'; out.error = err.message; out.done = true;
    await save({ status: out.status });
  }
  return out;
}
