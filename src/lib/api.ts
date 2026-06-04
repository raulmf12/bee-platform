// Camada de queries usando fetch direto (lib/db.ts) — evita o bug do
// supabase-js que pendura queries pos-signIn.

import { db, getCurrentUserId } from './db';
import type {
  BeeArsenalItem,
  BeeAvatar,
  BeeEditorial,
  BeeProduct,
  BeeStyleRule,
  EditorialLine,
  EditorialLineRun,
  KanbanColumn,
  KnowledgeDocument,
  PostDraft,
  PostStatus,
  PostTemplate,
  Profile,
  TemplateConfig,
  UserPost,
  UserSettings,
} from '@/types';

function requireUserId(): string {
  const id = getCurrentUserId();
  if (!id) throw new Error('Nao autenticado');
  return id;
}

// ----------------------------------------------------------------------------
// PROFILES
// ----------------------------------------------------------------------------
export const profileApi = {
  async getMe(): Promise<Profile | null> {
    const id = getCurrentUserId();
    if (!id) return null;
    return db.selectOne<Profile>('profiles', { id: `eq.${id}` });
  },

  async updateMe(patch: Partial<Pick<Profile, 'name' | 'avatar_color'>>): Promise<Profile> {
    const id = requireUserId();
    const rows = await db.update<Profile>('profiles', { id: `eq.${id}` }, patch);
    if (!rows[0]) throw new Error('Profile nao encontrado');
    return rows[0];
  },

  async ensureExists(name: string, email: string): Promise<Profile | null> {
    const id = getCurrentUserId();
    if (!id) return null;
    const existing = await profileApi.getMe();
    if (existing) return existing;
    const rows = await db.insert<Profile>('profiles', { id, name, email });
    return rows[0] ?? null;
  },
};

// ----------------------------------------------------------------------------
// USER SETTINGS
// ----------------------------------------------------------------------------
export const settingsApi = {
  async getMe(): Promise<UserSettings | null> {
    const id = getCurrentUserId();
    if (!id) return null;
    return db.selectOne<UserSettings>('user_settings', { user_id: `eq.${id}` });
  },

  async upsert(patch: Partial<UserSettings>): Promise<UserSettings> {
    const id = requireUserId();
    const rows = await db.upsert<UserSettings>(
      'user_settings',
      { ...patch, user_id: id, updated_at: new Date().toISOString() },
      'user_id',
    );
    if (!rows[0]) throw new Error('Falha ao salvar settings');
    return rows[0];
  },

  async ensureExists(): Promise<UserSettings | null> {
    const id = getCurrentUserId();
    if (!id) return null;
    const existing = await settingsApi.getMe();
    if (existing) return existing;
    const rows = await db.insert<UserSettings>('user_settings', { user_id: id });
    return rows[0] ?? null;
  },
};

// ----------------------------------------------------------------------------
// POST TEMPLATES
// ----------------------------------------------------------------------------
export const templateApi = {
  async list(opts?: { platform?: string; format?: string }): Promise<PostTemplate[]> {
    const params: Record<string, string> = {
      is_archived: 'eq.false',
      order: 'is_system.desc,name.asc',
    };
    if (opts?.platform) params.platform = `eq.${opts.platform}`;
    if (opts?.format) params.format = `eq.${opts.format}`;
    return db.select<PostTemplate>('post_templates', params);
  },

  async get(id: string): Promise<PostTemplate | null> {
    return db.selectOne<PostTemplate>('post_templates', { id: `eq.${id}` });
  },

  async upsertSystem(input: {
    name: string;
    description?: string;
    category?: string;
    platform: string;
    format: string;
    slides_count: number;
    template_config: TemplateConfig;
    thumbnail_url?: string;
  }): Promise<PostTemplate> {
    // Identidade pelo nome + is_system=true
    const existing = await db.selectOne<PostTemplate>('post_templates', {
      is_system: 'eq.true',
      name: `eq.${input.name}`,
    });

    if (existing) {
      const rows = await db.update<PostTemplate>(
        'post_templates',
        { id: `eq.${existing.id}` },
        {
          description: input.description,
          category: input.category,
          platform: input.platform,
          format: input.format,
          slides_count: input.slides_count,
          template_config: input.template_config,
          thumbnail_url: input.thumbnail_url,
        },
      );
      if (!rows[0]) throw new Error('Erro ao atualizar template');
      return rows[0];
    }

    const rows = await db.insert<PostTemplate>('post_templates', {
      user_id: null,
      is_system: true,
      is_public: true,
      name: input.name,
      description: input.description,
      category: input.category,
      platform: input.platform,
      format: input.format,
      slides_count: input.slides_count,
      template_config: input.template_config,
      thumbnail_url: input.thumbnail_url,
    });
    if (!rows[0]) throw new Error('Erro ao criar template');
    return rows[0];
  },
};

// ----------------------------------------------------------------------------
// USER POSTS
// ----------------------------------------------------------------------------
export const postApi = {
  async list(): Promise<UserPost[]> {
    return db.select<UserPost>('user_posts', { order: 'updated_at.desc' });
  },

  async get(id: string): Promise<UserPost | null> {
    return db.selectOne<UserPost>('user_posts', { id: `eq.${id}` });
  },

  async create(input: {
    template_id?: string;
    title?: string;
    briefing?: string;
    platform?: string;
    format?: string;
    carousel_text?: object;
    carousel_fabric_json?: object[];
    caption?: string;
    metadata?: Record<string, unknown>;
  }): Promise<UserPost> {
    const userId = requireUserId();
    const rows = await db.insert<UserPost>('user_posts', {
      user_id: userId,
      template_id: input.template_id,
      title: input.title,
      briefing: input.briefing,
      platform: input.platform ?? 'linkedin',
      format: input.format ?? 'image',
      carousel_text: input.carousel_text ?? null,
      carousel_fabric_json: input.carousel_fabric_json ?? null,
      caption: input.caption,
      metadata: input.metadata ?? {},
      status: 'draft',
    });
    if (!rows[0]) throw new Error('Falha ao criar post');
    return rows[0];
  },

  async update(id: string, patch: Partial<UserPost>): Promise<UserPost> {
    const { id: _id, user_id: _u, created_at: _c, ...safe } = patch as UserPost;
    const rows = await db.update<UserPost>('user_posts', { id: `eq.${id}` }, safe);
    if (!rows[0]) throw new Error('Post nao encontrado');
    return rows[0];
  },

  async setStatus(id: string, status: PostStatus): Promise<UserPost> {
    return postApi.update(id, { status });
  },

  async delete(id: string): Promise<void> {
    return db.delete('user_posts', { id: `eq.${id}` });
  },
};

// ----------------------------------------------------------------------------
// KANBAN COLUMNS
// ----------------------------------------------------------------------------
export const kanbanApi = {
  async list(): Promise<KanbanColumn[]> {
    return db.select<KanbanColumn>('kanban_columns', { order: 'position.asc' });
  },

  async ensureDefaults(): Promise<void> {
    const userId = getCurrentUserId();
    if (!userId) return;
    const existing = await db.select<KanbanColumn>('kanban_columns', { user_id: `eq.${userId}` });
    if (existing.length > 0) return;
    await db.insert<KanbanColumn>('kanban_columns', [
      { user_id: userId, name: 'Ideia', color: '#94A3B8', position: 0, is_default: true },
      { user_id: userId, name: 'Rascunho', color: '#E8A04C', position: 1, is_default: true },
      { user_id: userId, name: 'Aprovado', color: '#10B981', position: 2, is_default: true },
      { user_id: userId, name: 'Agendado', color: '#3B82F6', position: 3, is_default: true },
      { user_id: userId, name: 'Publicado', color: '#2D4A5C', position: 4, is_default: true },
    ]);
  },

  async create(input: { name: string; color?: string; position: number }): Promise<KanbanColumn> {
    const userId = requireUserId();
    const rows = await db.insert<KanbanColumn>('kanban_columns', { ...input, user_id: userId });
    if (!rows[0]) throw new Error('Falha ao criar coluna');
    return rows[0];
  },

  async update(id: string, patch: Partial<KanbanColumn>): Promise<KanbanColumn> {
    const rows = await db.update<KanbanColumn>('kanban_columns', { id: `eq.${id}` }, patch);
    if (!rows[0]) throw new Error('Coluna nao encontrada');
    return rows[0];
  },

  async delete(id: string): Promise<void> {
    return db.delete('kanban_columns', { id: `eq.${id}` });
  },
};

// ----------------------------------------------------------------------------
// BEE EDITORIAL ARCHITECTURE
// ----------------------------------------------------------------------------
export const beeApi = {
  async editorials(): Promise<BeeEditorial[]> {
    return db.select<BeeEditorial>('bee_editorials', {
      is_active: 'eq.true',
      order: 'position.asc',
    });
  },

  async arsenalForEditorial(editorial_slug: string): Promise<BeeArsenalItem[]> {
    return db.select<BeeArsenalItem>('bee_arsenal', {
      editorial_slug: `eq.${editorial_slug}`,
      order: 'position.asc',
    });
  },

  async styleRules(category?: 'do' | 'dont' | 'general'): Promise<BeeStyleRule[]> {
    const params: Record<string, string> = { order: 'position.asc' };
    if (category) params.category = `eq.${category}`;
    return db.select<BeeStyleRule>('bee_style_rules', params);
  },

  async avatars(): Promise<BeeAvatar[]> {
    return db.select<BeeAvatar>('bee_avatars', { order: 'position.asc' });
  },
};

// ----------------------------------------------------------------------------
// PRODUCTS
// ----------------------------------------------------------------------------
export const productApi = {
  async list(): Promise<BeeProduct[]> {
    return db.select<BeeProduct>('bee_products', { order: 'is_system.desc,name.asc' });
  },
  async get(id: string): Promise<BeeProduct | null> {
    return db.selectOne<BeeProduct>('bee_products', { id: `eq.${id}` });
  },
  async create(input: Partial<BeeProduct>): Promise<BeeProduct> {
    const userId = requireUserId();
    const rows = await db.insert<BeeProduct>('bee_products', { ...input, user_id: userId });
    if (!rows[0]) throw new Error('Falha ao criar produto');
    return rows[0];
  },
  async update(id: string, patch: Partial<BeeProduct>): Promise<BeeProduct> {
    const rows = await db.update<BeeProduct>('bee_products', { id: `eq.${id}` }, patch);
    if (!rows[0]) throw new Error('Produto nao encontrado');
    return rows[0];
  },
  async delete(id: string): Promise<void> {
    return db.delete('bee_products', { id: `eq.${id}` });
  },
};

// ----------------------------------------------------------------------------
// EDITORIAL LINES
// ----------------------------------------------------------------------------
export const editorialLinesApi = {
  async list(): Promise<EditorialLine[]> {
    return db.select<EditorialLine>('editorial_lines', { order: 'created_at.desc' });
  },
  async get(id: string): Promise<EditorialLine | null> {
    return db.selectOne<EditorialLine>('editorial_lines', { id: `eq.${id}` });
  },
  async create(input: Partial<EditorialLine>): Promise<EditorialLine> {
    const userId = requireUserId();
    const rows = await db.insert<EditorialLine>('editorial_lines', { ...input, user_id: userId });
    if (!rows[0]) throw new Error('Falha ao criar linha');
    return rows[0];
  },
  async update(id: string, patch: Partial<EditorialLine>): Promise<EditorialLine> {
    const rows = await db.update<EditorialLine>('editorial_lines', { id: `eq.${id}` }, patch);
    if (!rows[0]) throw new Error('Linha nao encontrada');
    return rows[0];
  },
  async delete(id: string): Promise<void> {
    return db.delete('editorial_lines', { id: `eq.${id}` });
  },
  async runs(lineId: string, limit = 20): Promise<EditorialLineRun[]> {
    return db.select<EditorialLineRun>('editorial_line_runs', {
      line_id: `eq.${lineId}`,
      order: 'run_at.desc',
      limit: String(limit),
    });
  },
};

// ----------------------------------------------------------------------------
// KNOWLEDGE DOCUMENTS (RAG)
// ----------------------------------------------------------------------------
export const knowledgeApi = {
  async list(): Promise<KnowledgeDocument[]> {
    return db.select<KnowledgeDocument>('knowledge_documents', { order: 'created_at.desc' });
  },

  async delete(id: string): Promise<void> {
    return db.delete('knowledge_documents', { id: `eq.${id}` });
  },
};

// ----------------------------------------------------------------------------
// POST DRAFTS
// ----------------------------------------------------------------------------
export const draftApi = {
  async loadFor(postId: string): Promise<PostDraft | null> {
    return db.selectOne<PostDraft>('post_drafts', { post_id: `eq.${postId}` });
  },

  async save(input: { post_id?: string; draft_data: object }): Promise<PostDraft> {
    const userId = requireUserId();
    const rows = await db.upsert<PostDraft>(
      'post_drafts',
      {
        post_id: input.post_id,
        user_id: userId,
        draft_data: input.draft_data,
        updated_at: new Date().toISOString(),
      },
      'post_id',
    );
    if (!rows[0]) throw new Error('Falha ao salvar draft');
    return rows[0];
  },
};
