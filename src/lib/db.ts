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

export async function refreshAuthCache(): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    cachedJwt = data.session?.access_token ?? null;
    cachedUserId = data.session?.user.id ?? null;
  } catch {
    cachedJwt = null;
    cachedUserId = null;
  }
}

export function setAuthCache(jwt: string | null, userId: string | null) {
  cachedJwt = jwt;
  cachedUserId = userId;
}

export function getCurrentUserId(): string | null {
  return cachedUserId;
}

function authHeaders(extra: Record<string, string> = {}): HeadersInit {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${cachedJwt ?? SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
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
    const res = await fetch(`${REST}/${table}?${qs.toString()}`, {
      headers: authHeaders(),
      signal: opts.signal,
    });
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
    const headers = authHeaders({
      Prefer: opts.returning === false ? 'return=minimal' : 'return=representation',
    });
    const res = await fetch(`${REST}/${table}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(row),
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
    const res = await fetch(`${REST}/${table}?${qs.toString()}`, {
      method: 'PATCH',
      headers: authHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify(patch),
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
    const res = await fetch(`${REST}/${table}?on_conflict=${onConflict}`, {
      method: 'POST',
      headers: authHeaders({
        Prefer: 'resolution=merge-duplicates,return=representation',
      }),
      body: JSON.stringify(row),
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
    const res = await fetch(`${REST}/${table}?${qs.toString()}`, {
      method: 'DELETE',
      headers: authHeaders({ Prefer: 'return=minimal' }),
      signal: opts.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  },

  // Chama uma funcao do Postgres. Usado pelo portao da IA (ai_gate_status),
  // que mora no banco pra o frontend e o cron enxergarem a MESMA regra.
  async rpc<T>(fn: string, args: object = {}, opts: QueryOpts = {}): Promise<T> {
    const res = await fetch(`${REST}/rpc/${fn}`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(args),
      signal: opts.signal,
    });
    return handle<T>(res);
  },
};
