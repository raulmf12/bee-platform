// Resolvedor de contexto comum (docs: Hive_Identidade_Contextos_Setup_e_Evolucao_v1 §9).
// Estratégia, pauta, desenvolvimento, desdobramento, QA, edição, chat, personas e visual
// recebem o MESMO contexto: quem fala · frente · público · intenção — resolvido a partir
// do perfil de comunicação e gravado num snapshot (peças e QA reutilizam o snapshot).
//
// Ordem de resolução: snapshot explícito → snapshot do conteúdo/peça → perfil da campanha
// → perfil escolhido → perfil padrão da marca (fallback VISÍVEL, nunca silencioso).
// Sem workspace/marca: null (padrões neutros do produto — nunca a identidade da Bee).
import { svcHeaders } from './gemini.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { ...init, headers: { ...svcHeaders(), ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path.split('?')[0]} ${res.status}: ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : null) as T;
}

export interface CtxEmitter { id: string; kind: 'person' | 'institutional'; name: string; voice: string | null; authority: string | null; first_person: boolean; speaking_rules: string | null; photo_profile: string | null; facts_status: string }
export interface CtxAudience { id: string; name: string; definition: string | null; situations: string[]; needs: string[]; language_notes: string | null; status: string; notes: string | null }
export interface ResolvedContext {
  workspace_id: string; brand: { id: string; name: string; essence: string | null };
  profile: { id: string; name: string; version: number; status: string; positioning: string | null; expression: string | null; cta_policy: string; needs_recalibration: string | null };
  emitter: CtxEmitter; front: { id: string; name: string; slug: string; description: string | null; territories: string[] };
  audience: CtxAudience | null; secondary: CtxAudience[];
  offers: Array<{ id: string; name: string; promessa: string | null }>;
  interlocutor_state: string | null; campaign_id: string | null; intent: string | null;
  fallback: boolean; summary: string; snapshot_id: string | null;
}

export interface ResolveOpts {
  snapshot_id?: string | null; content_id?: string | null; post_id?: string | null; campaign_id?: string | null;
  profile_id?: string | null; interlocutor_state?: string | null; intent?: string | null;
}

const one = async <T>(path: string): Promise<T | null> => ((await rest<T[]>(path).catch(() => [])) ?? [])[0] ?? null;

async function brandOfUser(userId: string): Promise<Row | null> {
  const mem = await rest<Row[]>(`/workspace_members?user_id=eq.${userId}&select=workspace_id`).catch(() => []);
  if (!mem.length) return null;
  const ws = mem.map((m) => m.workspace_id).join(',');
  return one<Row>(`/brands?workspace_id=in.(${ws})&status=eq.active&select=id,workspace_id,name,essence,is_default&order=is_default.desc,created_at.asc&limit=1`);
}

async function build(userId: string, profileId: string | null, opts: ResolveOpts, fallback: boolean): Promise<ResolvedContext | null> {
  const brand0 = await brandOfUser(userId);
  if (!brand0) return null;
  let profile = profileId
    ? await one<Row>(`/communication_profiles?id=eq.${profileId}&brand_id=eq.${brand0.id}&select=*`)
    : null;
  if (!profile) {
    profile = await one<Row>(`/communication_profiles?brand_id=eq.${brand0.id}&status=eq.active&select=*&order=is_default.desc,created_at.asc&limit=1`);
    fallback = true;
  }
  if (!profile) return null;
  const audIds = [profile.primary_audience_id, ...(profile.secondary_audience_ids ?? [])].filter(Boolean);
  const [emitter, front, auds, offers] = await Promise.all([
    one<CtxEmitter>(`/emitters?id=eq.${profile.emitter_id}&select=*`),
    one<Row>(`/business_fronts?id=eq.${profile.front_id}&select=id,name,slug,description,territories,offer_ids`),
    audIds.length ? rest<CtxAudience[]>(`/audiences?id=in.(${audIds.join(',')})&select=*`) : Promise.resolve([] as CtxAudience[]),
    (profile.offer_ids ?? []).length ? rest<Row[]>(`/bee_products?id=in.(${profile.offer_ids.join(',')})&select=id,name,promessa`) : Promise.resolve([] as Row[]),
  ]);
  if (!emitter || !front) return null;
  const audience = auds.find((a) => a.id === profile!.primary_audience_id) ?? null;
  const ctx: ResolvedContext = {
    workspace_id: brand0.workspace_id, brand: { id: brand0.id, name: brand0.name, essence: brand0.essence },
    profile: { id: profile.id, name: profile.name, version: profile.version, status: profile.status, positioning: profile.positioning, expression: profile.expression, cta_policy: profile.cta_policy, needs_recalibration: profile.needs_recalibration },
    emitter, front: { id: front.id, name: front.name, slug: front.slug, description: front.description, territories: front.territories ?? [] },
    audience, secondary: auds.filter((a) => a.id !== profile!.primary_audience_id),
    offers: offers.map((o) => ({ id: o.id, name: o.name, promessa: o.promessa })),
    interlocutor_state: opts.interlocutor_state ?? null, campaign_id: opts.campaign_id ?? null, intent: opts.intent ?? null,
    fallback, summary: '', snapshot_id: null,
  };
  ctx.summary = contextSummary(ctx);
  return ctx;
}

export function contextSummary(c: Pick<ResolvedContext, 'emitter' | 'front' | 'audience' | 'intent'>): string {
  return [c.emitter.name, c.front.name, c.audience?.name ?? 'público a definir', c.intent].filter(Boolean).join(' · ');
}

export async function resolveContext(userId: string, opts: ResolveOpts = {}): Promise<ResolvedContext | null> {
  // 1) snapshot (explícito, do conteúdo ou da peça): reusa a composição congelada.
  let snapId = opts.snapshot_id ?? null;
  if (!snapId && opts.post_id) snapId = (await one<Row>(`/user_posts?id=eq.${opts.post_id}&user_id=eq.${userId}&select=context_snapshot_id`))?.context_snapshot_id ?? null;
  if (!snapId && opts.content_id) snapId = (await one<Row>(`/contents?id=eq.${opts.content_id}&user_id=eq.${userId}&select=context_snapshot_id`))?.context_snapshot_id ?? null;
  if (snapId) {
    const s = await one<Row>(`/context_snapshots?id=eq.${snapId}&user_id=eq.${userId}&select=id,data`);
    if (s?.data?.profile) return { ...(s.data as ResolvedContext), snapshot_id: s.id, interlocutor_state: opts.interlocutor_state ?? s.data.interlocutor_state ?? null };
  }
  // 2) perfil da campanha → 3) perfil escolhido → 4) padrão da marca (fallback visível)
  let profileId = opts.profile_id ?? null;
  if (!profileId && opts.campaign_id) {
    const camp = await one<Row>(`/campaigns?id=eq.${opts.campaign_id}&user_id=eq.${userId}&select=profile_id,intent`);
    profileId = camp?.profile_id ?? null;
    if (!opts.intent && camp?.intent) opts = { ...opts, intent: String(camp.intent).slice(0, 80) };
  }
  return build(userId, profileId, opts, false);
}

// Grava o snapshot (composição + versões) e devolve o id.
export async function saveSnapshot(userId: string, ctx: ResolvedContext): Promise<string | null> {
  try {
    const { snapshot_id: _s, ...data } = ctx;
    const [row] = await rest<Row[]>(`/context_snapshots`, {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: userId, brand_id: ctx.brand.id, profile_id: ctx.profile.id, profile_version: ctx.profile.version,
        emitter_id: ctx.emitter.id, front_id: ctx.front.id, audience_ids: [ctx.audience?.id, ...ctx.secondary.map((a) => a.id)].filter(Boolean),
        interlocutor_state: ctx.interlocutor_state, campaign_id: ctx.campaign_id, fallback: ctx.fallback, summary: ctx.summary, data,
      }),
    });
    return row?.id ?? null;
  } catch (e) {
    console.warn('[context] snapshot não salvo:', (e as Error).message);
    return null;
  }
}

export async function resolveAndSnapshot(userId: string, opts: ResolveOpts = {}): Promise<ResolvedContext | null> {
  const ctx = await resolveContext(userId, opts);
  if (!ctx) return null;
  if (!ctx.snapshot_id) ctx.snapshot_id = await saveSnapshot(userId, ctx);
  return ctx;
}

// Linha de identidade (substitui "Você é Marcos Piccini, escrevendo para a Bee Academy").
export function speakerLine(ctx: ResolvedContext | null): string {
  if (!ctx) return 'Voce escreve como o autor desta marca. Sem dados de identidade configurados: nao invente biografia, cases ou autoridade.';
  const e = ctx.emitter;
  return e.kind === 'person'
    ? `Voce e ${e.name}, escrevendo pela ${ctx.front.name} (${ctx.brand.name}).`
    : `Voce escreve como a voz institucional ${e.name} (${ctx.brand.name}) — "nos", nao uma pessoa.`;
}

// Bloco de contexto para os prompts (quem fala · frente · público · intenção).
export function contextBlock(ctx: ResolvedContext | null, opts: { short?: boolean } = {}): string {
  if (!ctx) return '';
  const e = ctx.emitter;
  const aud = (a: CtxAudience) => `${a.name}${a.definition ? ` — ${a.definition}` : ''}${a.status === 'hypothesis' ? ' (HIPÓTESE em validação: fale com a situação, não presuma cargo)' : ''}`;
  const offerLine = ctx.offers.length
    ? (ctx.profile.cta_policy === 'never'
      ? `Ofertas (${ctx.offers.map((o) => o.name).join(', ')}) NUNCA entram neste perfil.`
      : `Ofertas pertinentes: ${ctx.offers.map((o) => o.name).join(', ')} — entram SÓ quando a intenção da peça/campanha pedir. Conteúdo orgânico de autoridade, história ou leitura de caso tem valor próprio: sem CTA comercial imposto.`)
    : 'Sem oferta comercial neste perfil: não empurre produtos.';
  const lines = [
    `=== CONTEXTO DE ATUAÇÃO · perfil "${ctx.profile.name}" (v${ctx.profile.version}) ===`,
    `Quem fala: ${e.name} (${e.kind === 'person' ? 'pessoa, voz autoral' : 'voz institucional'}).`,
    !opts.short && e.voice ? `Voz: ${e.voice}` : '',
    e.authority ? `Autoridade: ${e.authority}${e.facts_status !== 'confirmed' ? ' Use só o que estiver confirmado nas fontes; não invente números, cases ou biografia.' : ''}` : '',
    e.speaking_rules ? `Lugar de fala: ${e.speaking_rules}` : '',
    !e.first_person ? 'NÃO use primeira pessoa do singular nem autobiografia de pessoas da marca.' : '',
    `Marca: ${ctx.brand.name}${ctx.brand.essence ? ` — ${ctx.brand.essence}` : ''}`,
    `Frente: ${ctx.front.name}${ctx.front.description ? ` — ${ctx.front.description}` : ''}`,
    !opts.short && ctx.front.territories.length ? `Territórios da frente: ${ctx.front.territories.join('; ')}.` : '',
    ctx.audience ? `Público prioritário: ${aud(ctx.audience)}` : 'Público: a definir — escreva para a situação descrita, sem presumir cargo.',
    ctx.secondary.length ? `Públicos secundários (só se a peça pedir): ${ctx.secondary.map(aud).join(' | ')}` : '',
    ctx.interlocutor_state ? `Estado do interlocutor (lente opcional, independente do público): ${ctx.interlocutor_state}.` : '',
    ctx.profile.positioning ? `Posicionamento: ${ctx.profile.positioning}` : '',
    !opts.short && ctx.profile.expression ? `Expressão: ${ctx.profile.expression}` : '',
    offerLine,
    ctx.intent ? `Intenção atual: ${ctx.intent}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

// O emissor tem perfil fotográfico? (fotos do Marcos só quando quem fala é o Marcos)
export const emitterHasPhotos = (ctx: ResolvedContext | null): boolean => !ctx || !!ctx.emitter.photo_profile;

// "Onde isso vale?": escopo padrão de uma lição tirada de uma peça = marca + frente do
// contexto em que ela foi criada (Academy não vira norma da Consulting).
export async function learningScopeForPost(userId: string, postId: string | null | undefined): Promise<{ brand_id: string | null; front_id: string | null }> {
  if (!postId) return { brand_id: null, front_id: null };
  const ctx = await resolveContext(userId, { post_id: postId }).catch(() => null);
  return { brand_id: ctx?.brand.id ?? null, front_id: ctx && !ctx.fallback ? ctx.front.id : null };
}
