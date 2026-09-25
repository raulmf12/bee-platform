// Acesso a dados da estrutura de Campanhas (docs/PLANO-CAMPANHAS.md §3).
// Mesmo padrão do lib/api.ts: REST do Supabase via `db`, RLS garante o dono.
import { db, getCurrentUserId } from './db';
import type {
  Campaign, CampaignCycle, Content, Idea, PostMetrics, SocialAccount, UserPost,
} from '@/types';

function requireUserId(): string {
  const id = getCurrentUserId();
  if (!id) throw new Error('Nao autenticado');
  return id;
}

const inList = (ids: string[]) => `in.(${ids.join(',')})`;

// ---------------------------------------------------------------------------
// CONTAS
// ---------------------------------------------------------------------------
export const accountApi = {
  async list(): Promise<SocialAccount[]> {
    return db.select<SocialAccount>('social_accounts', { order: 'platform.asc,created_at.asc' });
  },
  async create(input: Partial<SocialAccount> & Pick<SocialAccount, 'platform' | 'label'>): Promise<SocialAccount> {
    const userId = requireUserId();
    const existing = await db.select<SocialAccount>('social_accounts', { platform: `eq.${input.platform}` });
    // A primeira conta de cada plataforma vira a padrão.
    const rows = await db.insert<SocialAccount>('social_accounts', {
      ...input, user_id: userId, is_default: input.is_default ?? existing.length === 0,
    });
    if (!rows[0]) throw new Error('Falha ao criar conta');
    return rows[0];
  },
  async update(id: string, patch: Partial<SocialAccount>): Promise<SocialAccount> {
    const rows = await db.update<SocialAccount>('social_accounts', { id: `eq.${id}` }, patch);
    if (!rows[0]) throw new Error('Conta não encontrada');
    return rows[0];
  },
  async setDefault(account: SocialAccount): Promise<void> {
    await db.update('social_accounts', { platform: `eq.${account.platform}`, id: `neq.${account.id}` }, { is_default: false });
    await db.update('social_accounts', { id: `eq.${account.id}` }, { is_default: true });
  },
  async remove(id: string): Promise<void> {
    return db.delete('social_accounts', { id: `eq.${id}` });
  },
};

// ---------------------------------------------------------------------------
// CAMPANHAS
// ---------------------------------------------------------------------------
const isAvulsoRow = (c: Campaign) => (c.metadata as { kind?: string } | undefined)?.kind === 'avulso';

export const campaignApi = {
  // Campanhas de verdade. O contêiner dos conteúdos avulsos ("Sem campanha") fica de fora.
  async list(): Promise<Campaign[]> {
    return (await db.select<Campaign>('campaigns', { order: 'created_at.desc' })).filter((c) => !isAvulsoRow(c));
  },
  async getAvulso(): Promise<Campaign | null> {
    return (await db.select<Campaign>('campaigns', { 'metadata->>kind': 'eq.avulso', limit: '1' }))[0] ?? null;
  },
  async get(id: string): Promise<Campaign | null> {
    return db.selectOne<Campaign>('campaigns', { id: `eq.${id}` });
  },
  async create(input: Partial<Campaign> & Pick<Campaign, 'name'>): Promise<Campaign> {
    const userId = requireUserId();
    const rows = await db.insert<Campaign>('campaigns', { ...input, user_id: userId });
    if (!rows[0]) throw new Error('Falha ao criar campanha');
    return rows[0];
  },
  async update(id: string, patch: Partial<Campaign>): Promise<Campaign> {
    const rows = await db.update<Campaign>('campaigns', { id: `eq.${id}` }, patch);
    if (!rows[0]) throw new Error('Campanha não encontrada');
    return rows[0];
  },
  async remove(id: string): Promise<void> {
    return db.delete('campaigns', { id: `eq.${id}` });
  },
};

// ---------------------------------------------------------------------------
// CICLOS
// ---------------------------------------------------------------------------
export const cycleApi = {
  async listByCampaign(campaignId: string): Promise<CampaignCycle[]> {
    return db.select<CampaignCycle>('campaign_cycles', { campaign_id: `eq.${campaignId}`, order: 'idx.asc' });
  },
  async listAll(): Promise<CampaignCycle[]> {
    return db.select<CampaignCycle>('campaign_cycles', { order: 'start_date.asc' });
  },
  async get(id: string): Promise<CampaignCycle | null> {
    return db.selectOne<CampaignCycle>('campaign_cycles', { id: `eq.${id}` });
  },
  async createMany(rows: Array<Omit<CampaignCycle, 'id' | 'user_id' | 'created_at' | 'updated_at'>>): Promise<CampaignCycle[]> {
    const userId = requireUserId();
    if (rows.length === 0) return [];
    return db.insert<CampaignCycle>('campaign_cycles', rows.map((r) => ({ ...r, user_id: userId })));
  },
  async update(id: string, patch: Partial<CampaignCycle>): Promise<CampaignCycle> {
    const rows = await db.update<CampaignCycle>('campaign_cycles', { id: `eq.${id}` }, patch);
    if (!rows[0]) throw new Error('Ciclo não encontrado');
    return rows[0];
  },
};

// ---------------------------------------------------------------------------
// IDEIAS (pauta + backlog)
// ---------------------------------------------------------------------------
export const ideaApi = {
  async listByCycle(cycleId: string): Promise<Idea[]> {
    return db.select<Idea>('ideas', { cycle_id: `eq.${cycleId}`, status: 'neq.discarded', order: 'position.asc,created_at.asc' });
  },
  async listByCampaign(campaignId: string): Promise<Idea[]> {
    return db.select<Idea>('ideas', { campaign_id: `eq.${campaignId}`, order: 'created_at.desc' });
  },
  async listAll(): Promise<Idea[]> {
    return db.select<Idea>('ideas', { order: 'position.asc' });
  },
  async listOpen(): Promise<Idea[]> {
    return db.select<Idea>('ideas', { status: 'in.(backlog,proposed,approved)', order: 'created_at.desc' });
  },
  async create(input: Partial<Idea> & Pick<Idea, 'title'>): Promise<Idea> {
    const userId = requireUserId();
    const rows = await db.insert<Idea>('ideas', { ...input, user_id: userId });
    if (!rows[0]) throw new Error('Falha ao criar ideia');
    return rows[0];
  },
  async createMany(rows: Array<Partial<Idea> & Pick<Idea, 'title'>>): Promise<Idea[]> {
    const userId = requireUserId();
    if (rows.length === 0) return [];
    return db.insert<Idea>('ideas', rows.map((r) => ({ ...r, user_id: userId })));
  },
  async update(id: string, patch: Partial<Idea>): Promise<Idea> {
    const rows = await db.update<Idea>('ideas', { id: `eq.${id}` }, patch);
    if (!rows[0]) throw new Error('Ideia não encontrada');
    return rows[0];
  },
  async updateMany(ids: string[], patch: Partial<Idea>): Promise<void> {
    if (ids.length === 0) return;
    await db.update('ideas', { id: inList(ids) }, patch);
  },
  async remove(id: string): Promise<void> {
    return db.delete('ideas', { id: `eq.${id}` });
  },
};

// ---------------------------------------------------------------------------
// CONTEÚDOS-MÃE
// ---------------------------------------------------------------------------
export const contentApi = {
  async listByCycle(cycleId: string): Promise<Content[]> {
    return db.select<Content>('contents', { cycle_id: `eq.${cycleId}`, status: 'neq.discarded', order: 'position.asc,created_at.asc' });
  },
  async listAll(): Promise<Content[]> {
    return db.select<Content>('contents', { order: 'created_at.desc' });
  },
  async listByIds(ids: string[]): Promise<Content[]> {
    if (ids.length === 0) return [];
    return db.select<Content>('contents', { id: inList(ids) });
  },
  async get(id: string): Promise<Content | null> {
    return db.selectOne<Content>('contents', { id: `eq.${id}` });
  },
  async create(input: Partial<Content> & Pick<Content, 'title'>): Promise<Content> {
    const userId = requireUserId();
    const rows = await db.insert<Content>('contents', { ...input, user_id: userId });
    if (!rows[0]) throw new Error('Falha ao criar conteúdo');
    return rows[0];
  },
  async update(id: string, patch: Partial<Content>): Promise<Content> {
    const rows = await db.update<Content>('contents', { id: `eq.${id}` }, patch);
    if (!rows[0]) throw new Error('Conteúdo não encontrado');
    return rows[0];
  },
  async remove(id: string): Promise<void> {
    return db.delete('contents', { id: `eq.${id}` });
  },
};

// ---------------------------------------------------------------------------
// PEÇAS (user_posts) — consultas pela estrutura nova
// ---------------------------------------------------------------------------
export const pieceApi = {
  async listByCycle(cycleId: string): Promise<UserPost[]> {
    return db.select<UserPost>('user_posts', { cycle_id: `eq.${cycleId}`, order: 'created_at.asc' });
  },
  async listByContent(contentIds: string[]): Promise<UserPost[]> {
    if (contentIds.length === 0) return [];
    return db.select<UserPost>('user_posts', { content_id: inList(contentIds), order: 'created_at.asc' });
  },
};

// ---------------------------------------------------------------------------
// MÉTRICAS
// ---------------------------------------------------------------------------
export const metricsApi = {
  async listForPosts(postIds: string[]): Promise<PostMetrics[]> {
    if (postIds.length === 0) return [];
    return db.select<PostMetrics>('post_metrics', { post_id: inList(postIds) });
  },
  async listAll(): Promise<PostMetrics[]> {
    return db.select<PostMetrics>('post_metrics', { order: 'captured_at.desc' });
  },
  // LinkedIn não tem API de leitura: o usuário registra na mão.
  async upsertManual(postId: string, accountId: string | null, values: Partial<Pick<PostMetrics,
    'reach' | 'impressions' | 'likes' | 'comments' | 'saves' | 'shares'>>): Promise<PostMetrics> {
    const userId = requireUserId();
    const rows = await db.upsert<PostMetrics>('post_metrics', {
      user_id: userId, post_id: postId, account_id: accountId, source: 'manual',
      captured_at: new Date().toISOString(), ...values,
    }, 'post_id,source');
    if (!rows[0]) throw new Error('Falha ao salvar métricas');
    return rows[0];
  },
};
