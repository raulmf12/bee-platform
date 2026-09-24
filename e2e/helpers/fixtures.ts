import { seed, sql } from './admin';
import { e2eUser } from './env';

// Contas do usuário de teste (sem tokens — nunca publica de verdade).
export async function seedAccounts(): Promise<{ linkedin: string; instagram: string }> {
  const linkedin = await seed('social_accounts', { platform: 'linkedin', label: 'E2E', is_default: true, status: 'connected' });
  const instagram = await seed('social_accounts', { platform: 'instagram', label: 'E2E', is_default: true, status: 'connected' });
  return { linkedin, instagram };
}

// Campanha ativa com N ciclos semanais a partir da segunda-feira desta semana.
export async function seedCampaign(opts: { weeks?: number; name?: string; accountIds?: string[]; cadence?: number[] } = {}): Promise<{ id: string; cycleIds: string[] }> {
  const weeks = opts.weeks ?? 8;
  const { id: userId } = e2eUser();
  const accounts = opts.accountIds ?? [];
  const [c] = await sql<{ id: string }>(`
    insert into campaigns (user_id, name, type, status, duration_weeks, start_date, end_date, color, account_ids, cadence,
      moment, strategy, activated_at)
    values ('${userId}', '${opts.name ?? 'Campanha E2E'}', 'organica', 'active', ${weeks},
      date_trunc('week', now())::date, (date_trunc('week', now()) + interval '${weeks * 7 - 1} days')::date, '#10B981',
      array[${accounts.map((a) => `'${a}'`).join(',')}]::uuid[],
      '${JSON.stringify(Object.fromEntries(accounts.map((a, i) => [a, opts.cadence?.[i] ?? 2])))}'::jsonb,
      '{"label":"Expansão de presença","summary":"Resumo E2E"}'::jsonb,
      '{"mix":{"presenca":35,"posicionamento":30,"autoridade":20,"relacionamento":10,"produtos":5},"rationale":"R","matrix":[]}'::jsonb,
      now())
    returning id`);
  const cycles = await sql<{ id: string }>(`
    insert into campaign_cycles (campaign_id, user_id, idx, start_date, end_date, status)
    select '${c.id}', '${userId}', g, (date_trunc('week', now()) + ((g-1)*7) * interval '1 day')::date,
           (date_trunc('week', now()) + ((g-1)*7 + 6) * interval '1 day')::date, 'not_started'
    from generate_series(1, ${weeks}) g
    returning id`);
  const ordered = await sql<{ id: string }>(`select id from campaign_cycles where campaign_id='${c.id}' order by idx`);
  return { id: c.id, cycleIds: ordered.map((r) => r.id).length ? ordered.map((r) => r.id) : cycles.map((r) => r.id) };
}

// Ciclo 1 com pauta APROVADA (ideias approved) — ponto de partida da F4.
export async function seedApprovedPauta(
  campaignId: string, cycleId: string,
  ideas: Array<{ title: string; fn: string; channels: Array<{ account_id: string; platform: string }> }>,
): Promise<string[]> {
  const { id: userId } = e2eUser();
  await sql(`update campaign_cycles set status='pauta_approved', plan='{"needs":[],"channels":[],"calendar":[],"totals":{"contents":${ideas.length},"pieces":${ideas.reduce((a, i) => a + i.channels.length, 0)}}}'::jsonb where id='${cycleId}'`);
  const ids: string[] = [];
  for (const [n, i] of ideas.entries()) {
    const [r] = await sql<{ id: string }>(`insert into ideas (user_id, campaign_id, cycle_id, title, summary, strategic_function, editorial_slug, channels, suggested_pieces, origin, status, position)
      values ('${userId}', '${campaignId}', '${cycleId}', '${i.title.replace(/'/g, "''")}', 'Direção ${n + 1}', '${i.fn}', 'diagnostico-sistemico', '${JSON.stringify(i.channels)}'::jsonb, ${i.channels.length}, 'hive', 'approved', ${n}) returning id`);
    ids.push(r.id);
  }
  return ids;
}
