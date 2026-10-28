#!/usr/bin/env node
// SQL no banco de produção pela Management API — versão MULTIPLATAFORMA do scripts/sql.sh (Windows incluso).
//   node scripts/sql.mjs "select count(*) from user_posts"
//   node scripts/sql.mjs -f supabase/migrations/<arquivo>.sql
// Token: SUPABASE_ACCESS_TOKEN (ambiente ou .env.e2e.local); no macOS também o keychain da Supabase CLI.
// 403 = a conta perdeu acesso → PARE e peça ao Raul (não contorne).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_REF, loadLocalEnv, managementToken } from './supabase-token.mjs';

loadLocalEnv(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const [a, b] = process.argv.slice(2);
const query = a === '-f' ? fs.readFileSync(b, 'utf8') : a;
if (!query) { console.error('uso: node scripts/sql.mjs "<sql>" | node scripts/sql.mjs -f arquivo.sql'); process.exit(2); }
const token = managementToken();
if (!token) { console.error('sem token: defina SUPABASE_ACCESS_TOKEN (ambiente ou .env.e2e.local)'); process.exit(2); }

const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }),
});
console.log(await r.text());
if (r.status === 403) { console.error('403: sem acesso ao projeto — pare e peça acesso (não contorne).'); process.exit(3); }
process.exit(r.ok ? 0 : 1);
