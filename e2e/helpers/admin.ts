import { managementFetch } from './management';
import { e2eUser } from './env';

// Acesso administrativo ao banco SÓ pra preparar/limpar dados do usuário de
// teste. Usa o token da Supabase CLI do keychain (nada de segredo em arquivo).
const REF = 'djlorvdehedcupeykyes';
const MARCOS = 'dfa11979-83c5-4737-9601-56e4df05746a';
export async function sql<T = Record<string, unknown>>(query: string): Promise<T[]> {
  const r = await managementFetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`sql falhou: ${JSON.stringify(j).slice(0, 400)}`);
  return j as T[];
}

// Tabelas com user_id que os testes podem sujar. Ordem = filhos antes dos pais.
// (Cresce conforme as fases adicionam tabelas.)
export const E2E_OWNED_TABLES = [
  'piece_candidates', 'piece_versions', 'post_units', 'content_piece_plans',
  'ai_learnings', 'setup_sessions', 'context_snapshots',
  'acj_learning_decisions', 'acj_learning_evidence', 'acj_learning_entries', 'acj_signal_readings', 'post_comments',
  'acj_content_contracts', 'acj_cycle_plans', 'acj_campaign_plans', 'content_memory',
  'photo_style_approvals', 'photo_generations',
  'meta_ad_insights_daily', 'meta_ads', 'meta_adsets', 'meta_campaigns', 'meta_ad_accounts', 'meta_businesses', 'meta_connections',
  'ai_reviews',
  'ai_variations',
  'ai_generations',
  'post_metrics',
  'post_unit_publications', 'post_publications', 'schedule_commands', 'schedule_plans', 'ai_measurement_events',   // antes da peça (pacotes saem em cascata com ela)
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
  // Marcas de teste (Minha identidade): workspace próprio 'e2e-*', nunca a Bee.
  await sql(`delete from public.bee_editorials where brand_id in (select b.id from public.brands b join public.workspaces w on w.id = b.workspace_id where w.slug like 'e2e-%');
    delete from public.workspaces where slug like 'e2e-%';`);
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

// Apaga do Storage os arquivos que os testes subiram na pasta do usuário de teste
// (bucket media, prefixo <uid>/). Nunca toca em outra pasta.
export async function cleanupE2EStorage(): Promise<number> {
  const { id } = e2eUser();
  if (!id || id === MARCOS) throw new Error('cleanup recusado: id inválido');
  const rows = await sql<{ name: string }>(`select name from storage.objects where bucket_id='media' and name like '${id}/%'`);
  if (!rows.length) return 0;
  const keys = await managementFetch(`https://api.supabase.com/v1/projects/${REF}/api-keys`, {}).then((r) => r.json()) as Array<{ name: string; api_key: string }>;
  const svc = keys.find((k) => k.name === 'service_role')?.api_key;
  if (!svc) return 0;
  const names = rows.map((r) => r.name).filter((n) => n.startsWith(`${id}/`));
  for (let i = 0; i < names.length; i += 100) {
    await fetch(`https://${REF}.supabase.co/storage/v1/object/media`, {
      method: 'DELETE', headers: { apikey: svc, Authorization: `Bearer ${svc}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: names.slice(i, i + 100) }),
    });
  }
  // arquivos de pacotes de publicação do usuário de teste (bucket próprio, escrito só pelo servidor)
  const pk = await sql<{ name: string }>(`select name from storage.objects where bucket_id='packages' and name like '${id}/%'`);
  const pnames = pk.map((r) => r.name).filter((n) => n.startsWith(`${id}/`));
  for (let i = 0; i < pnames.length; i += 100) {
    await fetch(`https://${REF}.supabase.co/storage/v1/object/packages`, {
      method: 'DELETE', headers: { apikey: svc, Authorization: `Bearer ${svc}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: pnames.slice(i, i + 100) }),
    });
  }
  return names.length + pnames.length;
}

// Sobrescreve um arquivo de PACOTE do usuário de teste (simula adulteração para os testes de integridade).
export async function overwritePackageFile(path: string, bytes: Buffer, mime = 'image/jpeg'): Promise<void> {
  const { id } = e2eUser();
  if (!id || id === MARCOS || !path.startsWith(`${id}/`)) throw new Error('recusado: só pacotes do usuário de teste');
  const keys = await managementFetch(`https://api.supabase.com/v1/projects/${REF}/api-keys`, {}).then((r) => r.json()) as Array<{ name: string; api_key: string }>;
  const svc = keys.find((k) => k.name === 'service_role')?.api_key;
  const r = await fetch(`https://${REF}.supabase.co/storage/v1/object/packages/${path}`, { method: 'PUT', headers: { apikey: svc!, Authorization: `Bearer ${svc}`, 'Content-Type': mime, 'x-upsert': 'true' }, body: bytes });
  if (!r.ok) throw new Error(`overwrite: ${r.status} ${await r.text()}`);
}

// Sobe uma imagem de teste em media/<uid>/e2e/ e devolve a URL pública.
export async function uploadE2EImage(name: string, bytes: Buffer, mime = 'image/jpeg'): Promise<string> {
  const { id } = e2eUser();
  if (!id || id === MARCOS) throw new Error('upload recusado: id inválido');
  const keys = await managementFetch(`https://api.supabase.com/v1/projects/${REF}/api-keys`, {}).then((r) => r.json()) as Array<{ name: string; api_key: string }>;
  const svc = keys.find((k) => k.name === 'service_role')?.api_key;
  if (!svc) throw new Error('service_role indisponível');
  const path = `${id}/e2e/${name}`;
  const r = await fetch(`https://${REF}.supabase.co/storage/v1/object/media/${path}`, {
    method: 'POST', headers: { apikey: svc, Authorization: `Bearer ${svc}`, 'Content-Type': mime, 'x-upsert': 'true' }, body: bytes,
  });
  if (!r.ok) throw new Error(`upload: ${r.status} ${await r.text()}`);
  return `https://${REF}.supabase.co/storage/v1/object/public/media/${path}`;
}

// Chama uma edge function COMO SERVIÇO (service_role + x-bee-user-id do usuário
// de teste) — o mesmo caminho do cron, mas escopado ao usuário E2E. A chave nunca
// sai deste processo (não vai pra log nem pra página).
let _svc: string | null = null;
export async function callEdgeAsService<T = Record<string, unknown>>(fn: string, body: unknown): Promise<{ status: number; json: T }> {
  const { id } = e2eUser();
  if (!id || id === MARCOS) throw new Error('chamada recusada: id inválido');
  if (!_svc) {
    const keys = await managementFetch(`https://api.supabase.com/v1/projects/${REF}/api-keys`, {}).then((r) => r.json()) as Array<{ name: string; api_key: string }>;
    _svc = keys.find((k) => k.name === 'service_role')?.api_key ?? null;
    if (!_svc) throw new Error('service_role indisponível');
  }
  const res = await fetch(`https://${REF}.supabase.co/functions/v1/${fn}`, {
    method: 'POST',
    headers: { apikey: _svc, Authorization: `Bearer ${_svc}`, 'x-bee-user-id': id, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = text;
  try { json = JSON.parse(text); } catch { /* texto cru */ }
  return { status: res.status, json: json as T };
}

// Remove do bucket `design` as imagens geradas pelo usuário de teste (motor fotográfico).
export async function cleanupE2EPhotoFiles(): Promise<number> {
  const { id } = e2eUser();
  if (!id || id === MARCOS) throw new Error('cleanup recusado: id inválido');
  const rows = await sql<{ storage_path: string }>(`select storage_path from photo_generations where user_id='${id}' and storage_path is not null`);
  if (!rows.length) return 0;
  const keys = await managementFetch(`https://api.supabase.com/v1/projects/${REF}/api-keys`, {}).then((r) => r.json()) as Array<{ name: string; api_key: string }>;
  const svc = keys.find((k) => k.name === 'service_role')?.api_key;
  if (!svc) return 0;
  const paths = rows.map((r) => r.storage_path).filter((p) => p.startsWith('hive/marcos-photo/'));
  await fetch(`https://${REF}.supabase.co/storage/v1/object/design`, { method: 'DELETE', headers: { apikey: svc, Authorization: `Bearer ${svc}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: paths }) });
  return paths.length;
}
