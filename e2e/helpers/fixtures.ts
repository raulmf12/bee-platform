import { seed, sql } from './admin';
import { e2eUser } from './env';

// Contas do usuário de teste (sem tokens — nunca publica de verdade).
export async function seedAccounts(): Promise<{ linkedin: string; instagram: string }> {
  // Identidade e token FALSOS: agendar resolve o destino real da conta (pacote imutável); nada publica com eles.
  const linkedin = await seed('social_accounts', { platform: 'linkedin', label: 'E2E', is_default: true, status: 'connected', linkedin_token: 'tok-falso', linkedin_author_urn: 'urn:li:person:e2e-seed' });
  const instagram = await seed('social_accounts', { platform: 'instagram', label: 'E2E', is_default: true, status: 'connected', instagram_access_token: 'tok-falso', instagram_business_account_id: '17840000000000000' });
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

// Ciclo em PRODUÇÃO com conteúdos validados (ponto de partida da F5).
export async function seedValidatedContents(
  campaignId: string, cycleId: string,
  specs: Array<{ title: string; channels: Array<{ account_id: string; platform: string }>; validationPiece?: boolean; rendered?: boolean }>,
): Promise<Array<{ contentId: string; ideaId: string; pieceId?: string }>> {
  const { id: userId } = e2eUser();
  await sql(`update campaign_cycles set status='producing' where id='${cycleId}'`);
  const out: Array<{ contentId: string; ideaId: string; pieceId?: string }> = [];
  for (const [n, s] of specs.entries()) {
    const t = s.title.replace(/'/g, "''");
    const [idea] = await sql<{ id: string }>(`insert into ideas (user_id, campaign_id, cycle_id, title, summary, strategic_function, editorial_slug, channels, suggested_pieces, status, position)
      values ('${userId}','${campaignId}','${cycleId}','${t}','Direção','autoridade','diagnostico-sistemico','${JSON.stringify(s.channels)}'::jsonb, ${s.channels.length}, 'developed', ${n}) returning id`);
    const [content] = await sql<{ id: string }>(`insert into contents (user_id, idea_id, campaign_id, cycle_id, title, strategic_function, editorial_slug, body, status, position)
      values ('${userId}','${idea.id}','${campaignId}','${cycleId}','${t}','autoridade','diagnostico-sistemico','{"frase":"Frase validada ${n + 1}","texto":"Texto validado."}'::jsonb,'validated', ${n}) returning id`);
    let pieceId: string | undefined;
    if (s.validationPiece) {
      const li = s.channels.find((c) => c.platform === 'linkedin');
      const [p] = await sql<{ id: string }>(`insert into user_posts (user_id, platform, format, status, title, caption, carousel_text, text_approved, content_id, campaign_id, cycle_id, account_id, piece_role, metadata ${s.rendered ? ', rendered_slides' : ''})
        values ('${userId}','linkedin','image','pending_approval','Diagnóstico Sistêmico','Texto validado.','{"quote":"Frase validada ${n + 1}"}'::jsonb, true, '${content.id}','${campaignId}','${cycleId}','${li?.account_id}','validation','{"editorial_slug":"diagnostico-sistemico"}'::jsonb ${s.rendered ? `, '{"slide1":"https://example.com/x.jpg"}'::jsonb` : ''}) returning id`);
      pieceId = p.id;
    }
    out.push({ contentId: content.id, ideaId: idea.id, pieceId });
  }
  return out;
}

// Plano ACJ da campanha (4 fases do mock) — aprovado por padrão.
export async function seedAcjPlan(campaignId: string, opts: { status?: 'approved' | 'recommended'; adoption?: 'native' | 'late' } = {}): Promise<string> {
  const { id: userId } = e2eUser();
  const { acjPlanResponse } = await import('./mocks');
  const p = acjPlanResponse({ adoption: opts.adoption }).plan;
  const status = opts.status ?? 'approved';
  const j = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  const [r] = await sql<{ id: string }>(`insert into acj_campaign_plans (user_id, campaign_id, version, status, adoption, audience_state, desired_state, journey_needs, target_mix, phases,
      sequence_hypotheses, success_signals, recalibration_rules, exclusions, summary, confidence, human_decisions_required, source_acj_version ${status === 'approved' ? ', approved_by, approved_at' : ''})
    values ('${userId}', '${campaignId}', 1, '${status}', '${opts.adoption ?? 'native'}', 'a', 'b', ${j(p.journey_needs)}, ${j(p.target_mix)}, ${j(p.phases)},
      ${j(p.sequence_hypotheses)}, ${j(p.success_signals)}, ${j(p.recalibration_rules)}, ${j(p.exclusions)}, ${j(p.summary)}, 'medium', ${j(p.human_decisions_required)}, 'v' ${status === 'approved' ? `, '${userId}', now()` : ''}) returning id`);
  return r.id;
}

// Marca de TESTE isolada (workspace 'e2e-*') para o percurso Minha identidade — nunca toca na Bee.
// Emissor "Autora Teste"; frentes A e B; públicos A1 (frente A) e B1 (frente B); perfis PA (A·A1) e PB (B·B1).
// sharedAudience: PB também usa A1 como secundário (recalibrar PA deve COPIAR A1, não alterar).
export async function seedIdentityBrand(opts: { sharedAudience?: boolean; empty?: boolean } = {}) {
  const { id: userId } = e2eUser();
  const tag = Math.random().toString(36).slice(2, 8);
  const [ws] = await sql<{ id: string }>(`insert into workspaces (name, slug) values ('E2E ${tag}', 'e2e-${tag}') returning id`);
  await sql(`insert into workspace_members (workspace_id, user_id, role) values ('${ws.id}', '${userId}', 'owner')`);
  const [brand] = await sql<{ id: string }>(`insert into brands (workspace_id, name, slug, essence, is_default) values ('${ws.id}', 'Marca Teste ${tag}', 'marca-${tag}', 'Ajudar pessoas a decidir com clareza.', false) returning id`);
  if (opts.empty) return { tag, workspaceId: ws.id, brandId: brand.id } as const;
  const [em] = await sql<{ id: string }>(`insert into emitters (brand_id, kind, name, voice, first_person, facts_status) values ('${brand.id}', 'person', 'Autora Teste', 'Direta e curiosa.', true, 'to_confirm') returning id`);
  const [fa] = await sql<{ id: string }>(`insert into business_fronts (brand_id, name, slug, description) values ('${brand.id}', 'Frente A', 'frente-a', 'Formação') returning id`);
  const [fb] = await sql<{ id: string }>(`insert into business_fronts (brand_id, name, slug, description) values ('${brand.id}', 'Frente B', 'frente-b', 'Consultoria') returning id`);
  const [a1] = await sql<{ id: string }>(`insert into audiences (brand_id, front_id, name, definition, status) values ('${brand.id}', '${fa.id}', 'Público A1', 'Quem aprende', 'hypothesis') returning id`);
  const [b1] = await sql<{ id: string }>(`insert into audiences (brand_id, front_id, name, definition, status) values ('${brand.id}', '${fb.id}', 'Público B1', 'Quem decide', 'active') returning id`);
  const [pa] = await sql<{ id: string }>(`insert into communication_profiles (brand_id, emitter_id, front_id, primary_audience_id, name, positioning, expression, status, is_default, needs_recalibration)
    values ('${brand.id}', '${em.id}', '${fa.id}', '${a1.id}', 'Frente A · Autora · A1', 'Posicionamento A', 'Expressão A', 'active', true, 'Definir o núcleo do público A1') returning id`);
  const [pb] = await sql<{ id: string }>(`insert into communication_profiles (brand_id, emitter_id, front_id, primary_audience_id, secondary_audience_ids, name, positioning, expression, status)
    values ('${brand.id}', '${em.id}', '${fb.id}', '${b1.id}', ${opts.sharedAudience ? `array['${a1.id}']::uuid[]` : `'{}'`}, 'Frente B · Autora · B1', 'Posicionamento B', 'Expressão B', 'active') returning id`);
  await sql(`insert into communication_profile_versions (profile_id, version, status, data, activated_at)
    select id, 1, 'active', public.profile_composition(id), now() from communication_profiles where id in ('${pa.id}', '${pb.id}')`);
  const [ed] = await sql<{ slug: string }>(`insert into bee_editorials (slug, name, description, brand_id, is_active, is_system, position) values ('e2e-ed-${tag}', 'Editoria E2E ${tag}', 'teste', '${brand.id}', true, false, 999) returning slug`);
  return { tag, workspaceId: ws.id, brandId: brand.id, emitterId: em.id, frontA: fa.id, frontB: fb.id, audA1: a1.id, audB1: b1.id, profileA: pa.id, profileB: pb.id, editorialSlug: ed.slug } as const;
}
