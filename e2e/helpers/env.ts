import fs from 'node:fs';
import path from 'node:path';

// Carrega .env.local (URL/anon do Supabase) e .env.e2e.local (credenciais do
// usuário de teste) pro process.env, sem depender de dotenv.
export function loadEnv(): void {
  for (const f of ['.env.local', '.env.e2e.local']) {
    const p = path.resolve(process.cwd(), f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

export function e2eUser() {
  loadEnv();
  const email = process.env.E2E_EMAIL, password = process.env.E2E_PASSWORD, id = process.env.E2E_USER_ID;
  if (!email || !password || !id) throw new Error('Faltam E2E_EMAIL/E2E_PASSWORD/E2E_USER_ID em .env.e2e.local');
  return { email, password, id };
}
