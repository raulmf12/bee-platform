// Segundo CLIENTE para testes de isolamento (Fase 6): usuário próprio, sem workspace da Bee.
// Cria via API administrativa (chave secreta lida pela Management API — nada em arquivo),
// entra com senha e devolve um cliente REST/RPC/funções com o JWT dele.
import { managementFetch } from './management';
import { loadEnv } from './env';

const REF = 'djlorvdehedcupeykyes';
let _svc: string | null = null;

async function serviceKey(): Promise<string> {
  if (_svc) return _svc;
  const r = await managementFetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, {});
  const keys = (await r.json()) as Array<{ type: string; api_key: string }>;
  _svc = keys.find((k) => k.type === 'secret')?.api_key ?? '';
  if (!_svc) throw new Error('chave secreta indisponível');
  return _svc;
}
const env = () => { loadEnv(); return { url: process.env.VITE_SUPABASE_URL!, anon: process.env.VITE_SUPABASE_PUBLISHABLE_KEY! }; };

export interface Tenant {
  id: string; email: string; jwt: string;
  rest: <T = Record<string, unknown>>(path: string, init?: RequestInit) => Promise<{ status: number; data: T }>;
  rpc: <T = unknown>(fn: string, args: object) => Promise<{ status: number; data: T }>;
  fn: <T = Record<string, unknown>>(name: string, body: object) => Promise<{ status: number; data: T }>;
}

export async function createTenant(tag: string): Promise<Tenant> {
  const svc = await serviceKey();
  const email = `e2e-cliente-${tag}@example.com`, password = `E2e!${tag}${Date.now()}`;
  const cr = await fetch(`${env().url}/auth/v1/admin/users`, { method: 'POST', headers: { apikey: svc, Authorization: `Bearer ${svc}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }) });
  const user = await cr.json();
  if (!cr.ok) throw new Error(`criar usuário: ${JSON.stringify(user).slice(0, 200)}`);
  return loginAs(email, password, user.id ?? user.user?.id);
}

// Sessão de um usuário existente (ex.: o usuário E2E) para chamar REST/RPC/funções com o JWT dele.
export async function loginAs(email: string, password: string, id?: string): Promise<Tenant> {
  const { url, anon } = env();
  const tr = await fetch(`${url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const tok = await tr.json();
  if (!tr.ok) throw new Error(`login: ${JSON.stringify(tok).slice(0, 200)}`);
  const jwt = tok.access_token as string;
  const h = { apikey: anon, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };
  const call = async <T>(u: string, init: RequestInit = {}) => {
    const r = await fetch(u, { ...init, headers: { ...h, ...(init.headers ?? {}) } });
    const t = await r.text();
    return { status: r.status, data: (t ? JSON.parse(t) : null) as T };
  };
  return {
    id: id ?? tok.user?.id, email, jwt,
    rest: (path, init) => call(`${url}/rest/v1${path}`, init),
    rpc: (fn, args) => call(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) }),
    fn: (name, body) => call(`${url}/functions/v1/${name}`, { method: 'POST', body: JSON.stringify(body) }),
  };
}

export async function deleteTenant(t: Tenant | null | undefined): Promise<void> {
  if (!t?.id) return;
  const { url } = env();
  const svc = await serviceKey();
  await fetch(`${url}/auth/v1/admin/users/${t.id}`, { method: 'DELETE', headers: { apikey: svc, Authorization: `Bearer ${svc}` } });
}
