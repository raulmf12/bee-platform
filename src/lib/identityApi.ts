// Identidade e contextos: perfis de comunicação, emissores, frentes, públicos e snapshots.
// Fase 3: sessões do percurso "Minha identidade" (propostas em rascunho → ativação explícita).
import { db } from '@/lib/db';
import { edge } from '@/lib/edge';
import type {
  Audience, BeeEditorial, Brand, BusinessFront, CommunicationProfile, ContextSnapshot, Emitter, ProfileVersion,
  SetupBlock, SetupMode, SetupQuestion, SetupSession, SetupTarget, BlockProposal,
} from '@/types';

export interface ProfileView extends CommunicationProfile { emitter?: Emitter; front?: BusinessFront; audience?: Audience | null }
export interface Product { id: string; slug: string; name: string }
export interface Genesis { pergunta_fundadora: string | null; produto_real: string | null; frase_organizadora: string | null; missao: string | null; persona_nome: string | null; voz_como_escreve: string | null }
export interface IdentityState {
  brand: Brand; genesis: Genesis | null; emitters: Emitter[]; fronts: BusinessFront[]; audiences: Audience[]; profiles: ProfileView[];
  products: Product[]; editorials: BeeEditorial[]; directives: number; knowledge: number; sessions: SetupSession[];
}

let _brands: Brand[] | null = null;

export const identityApi = {
  async brands(): Promise<Brand[]> {
    if (!_brands) _brands = await db.select<Brand>('brands', { status: 'neq.archived', order: 'is_default.desc,created_at.asc' });
    return _brands;
  },
  async defaultBrandId(): Promise<string | null> { return (await identityApi.brands())[0]?.id ?? null; },
  resetCache() { _brands = null; },

  async profiles(brandId?: string | null): Promise<ProfileView[]> {
    const B = brandId ?? (await identityApi.defaultBrandId());
    const f: Record<string, string> = B ? { brand_id: `eq.${B}` } : {};
    const [profiles, emitters, fronts, audiences] = await Promise.all([
      db.select<CommunicationProfile>('communication_profiles', { ...f, status: 'neq.archived', order: 'is_default.desc,name.asc' }),
      db.select<Emitter>('emitters', f), db.select<BusinessFront>('business_fronts', f), db.select<Audience>('audiences', f),
    ]);
    return profiles.map((p) => ({
      ...p, emitter: emitters.find((e) => e.id === p.emitter_id), front: fronts.find((x) => x.id === p.front_id),
      audience: audiences.find((a) => a.id === p.primary_audience_id) ?? null,
    }));
  },
  async snapshot(id: string): Promise<ContextSnapshot | null> {
    return db.selectOne<ContextSnapshot>('context_snapshots', { id: `eq.${id}`, select: 'id,profile_id,profile_version,summary,fallback,interlocutor_state,created_at' });
  },

  // Visão atual (tela 1): o legado carregado, sem perguntar o que já se sabe.
  async state(brandId: string): Promise<IdentityState> {
    const B = { brand_id: `eq.${brandId}` };
    const [brand, genesis, emitters, fronts, audiences, profiles, products, editorials, directives, knowledge, sessions] = await Promise.all([
      db.selectOne<Brand>('brands', { id: `eq.${brandId}` }),
      db.selectOne<Genesis>('genesis_core', { ...B, select: 'pergunta_fundadora,produto_real,frase_organizadora,missao,persona_nome,voz_como_escreve' }).catch(() => null),
      db.select<Emitter>('emitters', { ...B, status: 'neq.archived', order: 'created_at.asc' }),
      db.select<BusinessFront>('business_fronts', { ...B, status: 'neq.archived', order: 'created_at.asc' }),
      db.select<Audience>('audiences', { ...B, status: 'neq.archived', order: 'created_at.asc' }),
      db.select<CommunicationProfile>('communication_profiles', { ...B, status: 'neq.archived', order: 'is_default.desc,created_at.asc' }),
      db.select<Product>('bee_products', { ...B, select: 'id,slug,name', order: 'name.asc' }).catch(() => []),
      db.select<BeeEditorial>('bee_editorials', { ...B, is_active: 'eq.true', order: 'position.asc' }),
      db.select<{ id: string }>('bee_directives', { ...B, ativo: 'eq.true', select: 'id' }).catch(() => []),
      db.select<{ id: string }>('knowledge_documents', { ...B, select: 'id' }).catch(() => []),
      db.select<SetupSession>('setup_sessions', { ...B, status: 'neq.archived', order: 'updated_at.desc', limit: '20' }),
    ]);
    if (!brand) throw new Error('Marca não encontrada.');
    return {
      brand, genesis, emitters, fronts, audiences, products, editorials, directives: directives.length, knowledge: knowledge.length, sessions,
      profiles: profiles.map((p) => ({ ...p, emitter: emitters.find((e) => e.id === p.emitter_id), front: fronts.find((x) => x.id === p.front_id), audience: audiences.find((a) => a.id === p.primary_audience_id) ?? null })),
    };
  },

  async versions(profileId: string): Promise<ProfileVersion[]> {
    return db.select<ProfileVersion>('communication_profile_versions', { profile_id: `eq.${profileId}`, order: 'version.desc' });
  },

  // ---------------- sessões ----------------
  async createSession(userId: string, input: { brandId: string; mode: SetupMode; targetProfileIds?: string[]; targets?: SetupTarget[]; title?: string }): Promise<SetupSession> {
    const ids = input.targetProfileIds ?? [];
    const base: Record<string, number> = {};
    if (ids.length) {
      const ps = await db.select<CommunicationProfile>('communication_profiles', { id: `in.(${ids.join(',')})`, select: 'id,version' });
      for (const p of ps) base[p.id] = p.version;
    }
    const [s] = await db.insert<SetupSession>('setup_sessions', {
      user_id: userId, brand_id: input.brandId, mode: input.mode, target_profile_ids: ids, targets: input.targets ?? [], base_versions: base,
      title: input.title ?? null, step: input.mode === 'setup' || input.mode === 'add_front' ? 'conversation' : 'targets',
    });
    if (!s) throw new Error('Não foi possível iniciar a sessão.');
    return s;
  },
  async session(id: string): Promise<SetupSession | null> { return db.selectOne<SetupSession>('setup_sessions', { id: `eq.${id}` }); },
  async saveSession(id: string, patch: Partial<SetupSession>): Promise<SetupSession> {
    const [s] = await db.update<SetupSession>('setup_sessions', { id: `eq.${id}` }, patch);
    if (!s) throw new Error('Sessão não salva.');
    return s;
  },
  async nextQuestion(sessionId: string): Promise<{ question: SetupQuestion | null; done: boolean }> {
    return edge.identitySetup<{ question: SetupQuestion | null; done: boolean }>({ action: 'next_question', session_id: sessionId });
  },
  async propose(sessionId: string, block: SetupBlock): Promise<BlockProposal> {
    const r = await edge.identitySetup<{ proposal: BlockProposal }>({ action: 'propose', session_id: sessionId, block });
    return r.proposal;
  },
  async activate(sessionId: string, adoption: 'future' | 'all'): Promise<SetupSession['result']> {
    const r = await db.rpc<SetupSession['result']>('activate_setup_session', { sid: sessionId, adoption });
    _brands = null;
    return r;
  },
};

// "Quem fala · Frente · Público" de um perfil.
export const profileSummary = (p?: ProfileView | null) =>
  p ? [p.emitter?.name, p.front?.name, p.audience?.name ?? 'público a definir'].filter(Boolean).join(' · ') : '';

// Blocos que a sessão revisa, conforme o modo e os alvos (o que não foi escolhido fica preservado).
export function blocksFor(mode: SetupMode, targets: SetupTarget[]): SetupBlock[] {
  if (mode === 'add_front') return ['fronts', 'audiences', 'profiles'];
  if (mode === 'recalibrate') return [...(targets.includes('publico') ? ['audiences' as const] : []), 'profiles'];
  const t = mode === 'setup' && !targets.length ? (['identidade', 'frente', 'publico', 'posicionamento'] as SetupTarget[]) : targets;
  const out: SetupBlock[] = [];
  if (t.includes('identidade') || t.includes('posicionamento')) out.push('brand');
  if (t.includes('identidade') || t.includes('voz_visual')) out.push('emitters');
  if (t.includes('frente') || t.includes('oferta')) out.push('fronts');
  if (t.includes('publico') || t.includes('frente')) out.push('audiences');
  out.push('profiles');
  return out;
}
