// Token de gestão do Supabase para os scripts (regressão, SQL) — igual ao e2e/helpers/management.ts:
// SUPABASE_ACCESS_TOKEN (ambiente ou .env.e2e.local) em qualquer sistema; no macOS, cai no keychain da CLI.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? 'djlorvdehedcupeykyes';

// Lê VAR=valor dos arquivos de ambiente locais (sem sobrescrever o que já está no ambiente).
export function loadLocalEnv(root) {
  for (const f of ['.env.local', '.env.e2e.local']) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

export function managementToken() {
  let raw = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!raw && process.platform === 'darwin') {
    try { raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
    catch { raw = ''; }
  }
  if (!raw) return null;
  return raw.startsWith('go-keyring-base64:') ? Buffer.from(raw.slice(18), 'base64').toString() : raw;
}

// Confere se o token enxerga o projeto. 403/404 = sem acesso → parar e pedir ao Raul (não contornar).
export async function checkProjectAccess(token) {
  try {
    const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) return { ok: true };
    if (r.status === 401) return { ok: false, why: 'token inválido ou vencido (gere outro em supabase.com/dashboard/account/tokens)' };
    if (r.status === 403 || r.status === 404) return { ok: false, why: `a conta do token não tem acesso ao projeto (HTTP ${r.status}) — peça ao Raul para convidá-la` };
    return { ok: false, why: `Supabase respondeu HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, why: `sem conexão com o Supabase (${e.message})` };
  }
}
