import { execSync } from 'node:child_process';
import { e2eUser } from './env';

// Acesso administrativo ao banco SÓ pra preparar/limpar dados do usuário de
// teste. Usa o token da Supabase CLI do keychain (nada de segredo em arquivo).
const REF = 'djlorvdehedcupeykyes';
const MARCOS = 'dfa11979-83c5-4737-9601-56e4df05746a';
let _mgmt: string | null = null;

function mgmtToken(): string {
  if (!_mgmt) {
    const raw = execSync('security find-generic-password -s "Supabase CLI" -w').toString().trim();
    _mgmt = Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString();
  }
  return _mgmt;
}

export async function sql<T = Record<string, unknown>>(query: string): Promise<T[]> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${mgmtToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`sql falhou: ${JSON.stringify(j).slice(0, 400)}`);
  return j as T[];
}

// Tabelas com user_id que os testes podem sujar. Ordem = filhos antes dos pais.
// (Cresce conforme as fases adicionam tabelas.)
export const E2E_OWNED_TABLES = [
  'ai_reviews',
  'ai_variations',
  'ai_generations',
  'post_metrics',
  'user_posts',
  'contents',
  'ideas',
  'campaign_cycles',
  'campaigns',
  'social_accounts',
  'image_model_trials',
];

// Apaga TUDO do usuário de teste nessas tabelas, numa única ida ao banco.
// Trava dupla contra apagar dado real.
let _existing: Set<string> | null = null;
export async function cleanupE2EData(): Promise<void> {
  const { id } = e2eUser();
  if (!id || id === MARCOS) throw new Error('cleanup recusado: id inválido');
  if (!_existing) {
    const rows = await sql<{ t: string }>(
      `select table_name as t from information_schema.columns where table_schema='public' and column_name='user_id' and table_name in (${E2E_OWNED_TABLES.map((t) => `'${t}'`).join(',')})`,
    );
    _existing = new Set(rows.map((r) => r.t));
  }
  const stmts = E2E_OWNED_TABLES.filter((t) => _existing!.has(t)).map((t) => `delete from public.${t} where user_id='${id}';`);
  if (stmts.length) await sql(stmts.join(' '));
}

// Escapa um literal SQL simples (só pra dados de teste controlados).
export const lit = (v: unknown): string =>
  v === null || v === undefined ? 'null' : typeof v === 'number' || typeof v === 'boolean'
    ? String(v) : `'${String(v).replace(/'/g, "''")}'`;

// Insere uma linha do usuário de teste e devolve o id.
export async function seed(table: string, row: Record<string, unknown>): Promise<string> {
  const { id: userId } = e2eUser();
  const full: Record<string, unknown> = { user_id: userId, ...row };
  const cols = Object.keys(full);
  const vals = cols.map((c) => {
    const v = full[c];
    return v !== null && typeof v === 'object' ? `${lit(JSON.stringify(v))}::jsonb` : lit(v);
  });
  const rows = await sql<{ id: string }>(`insert into public.${table} (${cols.join(',')}) values (${vals.join(',')}) returning id`);
  return rows[0].id;
}
