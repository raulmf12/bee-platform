// Identidade em RASCUNHO (Fase 3 · Minha identidade): a configuração atual da marca com as
// propostas de uma sessão sobrepostas — sem gravar nada. Usado para propor blocos com o que
// já foi entendido e para CALIBRAR (gerar amostras com o perfil ainda não ativado).
import { fetchRest } from './gemini.ts';
import { brandOfUser, compose, type ResolvedContext } from './context.ts';

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
export const ZERO = '00000000-0000-0000-0000-000000000000';
const isUuid = (x: unknown) => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);

export interface Identity {
  brand: Row; genesis: Row | null; emitters: Row[]; fronts: Row[]; audiences: Row[]; profiles: Row[];
  products: Row[]; editorials: Row[]; directives: number; knowledge: number;
}

export async function loadIdentity(brandId: string): Promise<Identity | null> {
  const [brand] = await fetchRest<Row[]>(`/brands?id=eq.${brandId}&select=id,workspace_id,name,essence,is_default`);
  if (!brand) return null;
  const B = `brand_id=eq.${brandId}`;
  const [genesis, emitters, fronts, audiences, profiles, products, editorials, directives, knowledge] = await Promise.all([
    fetchRest<Row[]>(`/genesis_core?${B}&select=pergunta_fundadora,pergunta_silenciosa,produto_real,frase_organizadora,missao,persona_nome,persona_postura,voz_como_escreve,voz_verbos,voz_nunca&limit=1`),
    fetchRest<Row[]>(`/emitters?${B}&status=neq.archived&select=*&order=created_at`),
    fetchRest<Row[]>(`/business_fronts?${B}&status=neq.archived&select=*&order=created_at`),
    fetchRest<Row[]>(`/audiences?${B}&status=neq.archived&select=*&order=created_at`),
    fetchRest<Row[]>(`/communication_profiles?${B}&status=neq.archived&select=*&order=is_default.desc,created_at`),
    fetchRest<Row[]>(`/bee_products?${B}&select=id,slug,name,promessa&order=name`),
    fetchRest<Row[]>(`/bee_editorials?${B}&is_active=eq.true&select=id,slug,name,objetivo,description,territorio,perguntas,front_id,curation_status&order=position`),
    fetchRest<Row[]>(`/bee_directives?${B}&ativo=eq.true&select=id`),
    fetchRest<Row[]>(`/knowledge_documents?${B}&select=id&limit=500`),
  ]);
  return { brand, genesis: genesis[0] ?? null, emitters, fronts, audiences, profiles, products, editorials, directives: directives.length, knowledge: (knowledge ?? []).length };
}

type Proposals = Record<string, { status?: string; items?: Row[]; essence?: string } | undefined>;
const LIVE = new Set(['proposed', 'accepted']);
const FIELDS: Record<string, string[]> = {
  emitters: ['kind', 'name', 'voice', 'authority', 'first_person', 'speaking_rules', 'facts_status'],
  fronts: ['name', 'slug', 'description', 'territories'],
  audiences: ['name', 'definition', 'situations', 'needs', 'language_notes', 'status', 'notes'],
  profiles: ['name', 'positioning', 'expression', 'cta_policy', 'status', 'needs_recalibration'],
};

// Sobrepõe as propostas (vivas) à identidade atual. Chaves = ref (uuid existente ou "new:<chave>").
export function overlay(id: Identity, proposals: Proposals): Identity {
  const out: Identity = { ...id, brand: { ...id.brand }, emitters: [...id.emitters], fronts: [...id.fronts], audiences: [...id.audiences], profiles: [...id.profiles] };
  const bp = proposals.brand;
  if (bp && LIVE.has(bp.status ?? '') && bp.essence) out.brand.essence = bp.essence;
  for (const block of ['emitters', 'fronts', 'audiences', 'profiles'] as const) {
    const blk = proposals[block];
    if (!blk || !LIVE.has(blk.status ?? '')) continue;
    for (const it of blk.items ?? []) {
      const pick: Row = {};
      for (const f of FIELDS[block]) if (it[f] !== undefined && it[f] !== null) pick[f] = it[f];
      if (block === 'audiences' && it.front_ref) pick.front_id = it.front_ref;
      if (block === 'profiles') {
        if (it.emitter_ref) pick.emitter_id = it.emitter_ref;
        if (it.front_ref) pick.front_id = it.front_ref;
        if ('primary_audience_ref' in it) pick.primary_audience_id = it.primary_audience_ref;
        if (Array.isArray(it.secondary_audience_refs)) pick.secondary_audience_ids = it.secondary_audience_refs;
        if (Array.isArray(it.offers)) pick.offer_ids = id.products.filter((p) => it.offers.includes(p.slug)).map((p) => p.id);
      }
      if (it.action === 'create') out[block].push({ id: it.ref, version: 0, ...pick, _draft: true });
      else if (it.action === 'update') out[block] = out[block].map((r) => (r.id === it.ref ? { ...r, ...pick, _changed: true } : r));
      else if (it.action === 'archive') out[block] = out[block].filter((r) => r.id !== it.ref);
    }
  }
  return out;
}

// Contexto do perfil em rascunho (para calibrar). Ids ainda não criados viram ZERO (sem lições/diretrizes por escopo).
export async function draftContext(userId: string, sessionId: string, profileRef: string): Promise<ResolvedContext | null> {
  const [s] = await fetchRest<Row[]>(`/setup_sessions?id=eq.${sessionId}&user_id=eq.${userId}&select=brand_id,proposals`);
  if (!s?.brand_id) return null;
  const brand = await brandOfUser(userId, s.brand_id);
  if (!brand) return null;                                   // sem acesso à marca da sessão
  const base = await loadIdentity(s.brand_id);
  if (!base) return null;
  const d = overlay(base, s.proposals ?? {});
  const p = d.profiles.find((x) => x.id === profileRef);
  if (!p) return null;
  const e = d.emitters.find((x) => x.id === p.emitter_id), f = d.fronts.find((x) => x.id === p.front_id);
  if (!e || !f) return null;
  const auds = d.audiences.filter((a) => a.id === p.primary_audience_id || (p.secondary_audience_ids ?? []).includes(a.id));
  const offers = d.products.filter((o) => (p.offer_ids ?? []).includes(o.id));
  const fix = (r: Row) => ({ ...r, id: isUuid(r.id) ? r.id : ZERO });
  const prof = { ...fix(p), primary_audience_id: isUuid(p.primary_audience_id) ? p.primary_audience_id : (p.primary_audience_id ? ZERO : null), name: `${p.name} (rascunho)` };
  const ctx = compose({ ...brand, essence: d.brand.essence }, prof, fix({ first_person: e.kind !== 'institutional', facts_status: 'to_confirm', ...e }), fix({ territories: [], ...f }),
    auds.map((a) => ({ situations: [], needs: [], ...a, id: a.id === p.primary_audience_id ? prof.primary_audience_id : (isUuid(a.id) ? a.id : ZERO) })), offers, {}, false);
  ctx.summary = `Calibração · ${ctx.summary}`;
  return ctx;
}
