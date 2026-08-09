// REST helpers para o Supabase via fetch direto.
// Escapa do bug do supabase-js v2.46 onde queries pos-signIn penduram
// (locks internos + auto-refresh em background).
//
// Convencao do PostgREST:
//   select  -> GET    /rest/v1/<table>?select=...&col=eq.X
//   insert  -> POST   /rest/v1/<table>   (Prefer: return=representation)
//   update  -> PATCH  /rest/v1/<table>?col=eq.X
//   delete  -> DELETE /rest/v1/<table>?col=eq.X
//   upsert  -> POST   /rest/v1/<table>   (Prefer: resolution=merge-duplicates,return=representation)

import { SUPABASE_KEY, SUPABASE_URL, supabase } from './supabase';

const REST = `${SUPABASE_URL}/rest/v1`;

// Pega o JWT da session atual (se houver) pra mandar no Authorization.
// Cacheia em memoria pra evitar acessar storage em cada call (que pode pendurar).
let cachedJwt: string | null = null;
let cachedUserId: string | null = null;
// Epoch (segundos) em que o access_token expira. 0 = desconhecido/sem sessao.
// O token do Supabase dura ~1h; sem renovar, as ESCRITAS passam a tomar 401
// (as leituras nem sempre, porque muita coisa ja esta no store). Por isso
// renovamos sob demanda antes de cada request e damos retry em 401.
let cachedExp = 0;

function decodeExp(jwt: string | null): number {
  if (!jwt) return 0;
  try {
    const [, payload] = jwt.split('.');
    if (!payload) return 0;
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof decoded.exp === 'number' ? decoded.exp : 0;
  } catch {
    return 0;
  }
}

export async function refreshAuthCache(): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    setAuthCache(data.session?.access_token ?? null, data.session?.user.id ?? null);
  } catch {
    setAuthCache(null, null);
  }
}

export function setAuthCache(jwt: string | null, userId: string | null) {
  cachedJwt = jwt;
  cachedUserId = userId;
  cachedExp = decodeExp(jwt);
}

export function getCurrentUserId(): string | null {
  return cachedUserId;
}

// Renova o access_token via refresh_token quando ele expirou (ou esta perto).
// autoRefreshToken fica DESLIGADO no cliente (evita o bug de lock em background);
// aqui a renovacao e pontual e awaited, entao nao pendura. Coalesce chamadas
// concorrentes numa unica promessa pra nao disparar N refreshes ao mesmo tempo.
let refreshing: Promise<void> | null = null;
async function ensureFreshToken(force = false): Promise<void> {
  if (!cachedJwt) return; // sem sessao -> usa a anon key, nada a renovar
  const now = Math.floor(Date.now() / 1000);
  if (!force && cachedExp && now < cachedExp - 60) return; // ainda valido (folga de 60s)
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const { data } = await supabase.auth.refreshSession();
        if (data.session?.access_token) {
          setAuthCache(data.session.access_token, data.session.user?.id ?? null);
        }
      } catch (e) {
        console.warn('[db.ensureFreshToken] refresh falhou', e);
      } finally {
        refreshing = null;
      }
    })();
  }
  await refreshing;
}

function baseHeaders(prefer?: string): Record<string, string> {
  const h: Record<string, string> = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${cachedJwt ?? SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };
  if (prefer) h.Prefer = prefer;
  return h;
}

// Envia o request garantindo token fresco; em 401 (token que virou stale entre
// o check e o envio), renova a forca e tenta UMA vez mais.
async function send(
  method: string,
  url: string,
  opts: { prefer?: string; body?: object | object[]; signal?: AbortSignal } = {},
): Promise<Response> {
  await ensureFreshToken();
  const fire = () =>
    fetch(url, {
      method,
      headers: baseHeaders(opts.prefer),
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  let res = await fire();
  if (res.status === 401 && cachedJwt) {
    await ensureFreshToken(true);
    res = await fire();
  }
  return res;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  }
  // PATCH/DELETE com return=minimal nao retornam JSON
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export interface QueryOpts {
  signal?: AbortSignal;
}

export const db = {
  async select<T>(
    table: string,
    params: Record<string, string> = {},
    opts: QueryOpts = {},
  ): Promise<T[]> {
    const qs = new URLSearchParams({ select: params.select ?? '*' });
    for (const [k, v] of Object.entries(params)) {
      if (k !== 'select') qs.set(k, v);
    }
    const res = await send('GET', `${REST}/${table}?${qs.toString()}`, { signal: opts.signal });
    return handle<T[]>(res);
  },

  async selectOne<T>(
    table: string,
    params: Record<string, string> = {},
    opts: QueryOpts = {},
  ): Promise<T | null> {
    const rows = await db.select<T>(table, { ...params, limit: '1' }, opts);
    return rows[0] ?? null;
  },

  async insert<T>(
    table: string,
    row: object | object[],
    opts: QueryOpts & { returning?: boolean } = {},
  ): Promise<T[]> {
    const res = await send('POST', `${REST}/${table}`, {
      prefer: opts.returning === false ? 'return=minimal' : 'return=representation',
      body: row,
      signal: opts.signal,
    });
    return handle<T[]>(res);
  },

  async update<T>(
    table: string,
    where: Record<string, string>,
    patch: object,
    opts: QueryOpts = {},
  ): Promise<T[]> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(where)) qs.set(k, v);
    const res = await send('PATCH', `${REST}/${table}?${qs.toString()}`, {
      prefer: 'return=representation',
      body: patch,
      signal: opts.signal,
    });
    return handle<T[]>(res);
  },

  async upsert<T>(
    table: string,
    row: object,
    onConflict: string,
    opts: QueryOpts = {},
  ): Promise<T[]> {
    const res = await send('POST', `${REST}/${table}?on_conflict=${onConflict}`, {
      prefer: 'resolution=merge-duplicates,return=representation',
      body: row,
      signal: opts.signal,
    });
    return handle<T[]>(res);
  },

  async delete(
    table: string,
    where: Record<string, string>,
    opts: QueryOpts = {},
  ): Promise<void> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(where)) qs.set(k, v);
    const res = await send('DELETE', `${REST}/${table}?${qs.toString()}`, {
      prefer: 'return=minimal',
      signal: opts.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  },

  // Chama uma funcao do Postgres. Usado pelo portao da IA (ai_gate_status),
  // que mora no banco pra o frontend e o cron enxergarem a MESMA regra.
  async rpc<T>(fn: string, args: object = {}, opts: QueryOpts = {}): Promise<T> {
    const res = await send('POST', `${REST}/rpc/${fn}`, { body: args, signal: opts.signal });
    return handle<T>(res);
  },
};
