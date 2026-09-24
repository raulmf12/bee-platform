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
  'user_posts',
  'image_model_trials',
];

// Apaga TUDO do usuário de teste nessas tabelas. Trava dupla contra apagar dado real.
export async function cleanupE2EData(): Promise<void> {
  const { id } = e2eUser();
  if (!id || id === MARCOS) throw new Error('cleanup recusado: id inválido');
  const existing = await sql<{ t: string }>(
    `select table_name as t from information_schema.columns where table_schema='public' and column_name='user_id' and table_name in (${E2E_OWNED_TABLES.map((t) => `'${t}'`).join(',')})`,
  );
  const have = new Set(existing.map((r) => r.t));
  for (const t of E2E_OWNED_TABLES) {
    if (have.has(t)) await sql(`delete from public.${t} where user_id='${id}'`);
  }
}
