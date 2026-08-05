// Camada de queries usando fetch direto (lib/db.ts) — evita o bug do
// supabase-js que pendura queries pos-signIn.

import { db, getCurrentUserId } from './db';
import type {
  AiGate,
  AiGeneration,
  AiLearning,
  AiReview,
  AiChatMessage,
  AiSegment,
  AiSeveridade,
  AiVariation,
  BeeAnalogy,
  BeeArsenalItem,
  BeeAvatar,
  BeeEditorial,
  BeeExamplePost,
  BeePersona,
  BeeProduct,
  BeeStyleRule,
  BeeSuggestion,
  EditorialLine,
  EditorialLineRun,
  KanbanColumn,
  KnowledgeDocument,
  Podcast,
  PodcastClip,
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

  // Templates de sistema tem slug estavel (ex: 'bee-quote-portrait').
  // A geracao busca por aqui em vez de adivinhar por nome/plataforma.
  async getBySlug(slug: string): Promise<PostTemplate | null> {
    return db.selectOne<PostTemplate>('post_templates', { slug: `eq.${slug}` });
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

  // ------ templates do usuario (editor de templates) ------

  async createUser(input: {
    name: string;
    description?: string;
    platform: string;
    format: string;
    template_config: TemplateConfig;
    thumbnail_url?: string;
  }): Promise<PostTemplate> {
    const rows = await db.insert<PostTemplate>('post_templates', {
      user_id: getCurrentUserId(),
      // slug e reservado aos templates de sistema (chave estavel do seed).
      slug: null,
      is_system: false,
      is_public: false,
      is_default: false,
      category: 'custom',
      name: input.name,
      description: input.description,
      platform: input.platform,
      format: input.format,
      slides_count: input.template_config.slides_json.length,
      template_config: input.template_config,
      thumbnail_url: input.thumbnail_url,
    });
    if (!rows[0]) throw new Error('Erro ao criar template');
    return rows[0];
  },

  async updateTemplate(
    id: string,
    patch: {
      name?: string;
      description?: string;
      platform?: string;
      format?: string;
      template_config?: TemplateConfig;
      thumbnail_url?: string;
    },
  ): Promise<PostTemplate> {
    const body: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
    if (patch.template_config) {
      body.slides_count = patch.template_config.slides_json.length;
    }
    const rows = await db.update<PostTemplate>('post_templates', { id: `eq.${id}` }, body);
    if (!rows[0]) throw new Error('Erro ao salvar template');
    return rows[0];
  },

  // Arquiva em vez de apagar: posts apontam pra ca via template_id, e essa
  // referencia e o registro de quem gerou cada post.
  async archive(id: string): Promise<void> {
    await db.update('post_templates', { id: `eq.${id}` }, { is_archived: true });
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
    // Post gerado pela IA nasce em 'pending_approval' — o Aprovar e o que mede
    // a eficacia. Post feito a mao segue nascendo como rascunho.
    status?: PostStatus;
    // Nomenclatura + nota de viralizacao (gravadas na criacao pelo wizard).
    codigo?: string | null;
    virality_score?: number | null;
    virality_reason?: string | null;
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
      status: input.status ?? 'draft',
      // Opcionais: so vao no insert quando presentes (undefined vira omitido
      // pelo db.insert, mantendo o default da coluna).
      ...(input.codigo !== undefined ? { codigo: input.codigo } : {}),
      ...(input.virality_score !== undefined ? { virality_score: input.virality_score } : {}),
      ...(input.virality_reason !== undefined ? { virality_reason: input.virality_reason } : {}),
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
  // So os ativos, ordenados — usado na geracao e na selecao de editorial.
  async editorials(): Promise<BeeEditorial[]> {
    return db.select<BeeEditorial>('bee_editorials', {
      is_active: 'eq.true',
      order: 'position.asc',
    });
  },

  // Todos (inclui inativos) — usado na tela de gerenciamento.
  async listEditorials(): Promise<BeeEditorial[]> {
    return db.select<BeeEditorial>('bee_editorials', {
      order: 'position.asc',
    });
  },

  async createEditorial(input: Partial<BeeEditorial>): Promise<BeeEditorial> {
    const rows = await db.insert<BeeEditorial>('bee_editorials', input);
    if (!rows[0]) throw new Error('Falha ao criar editorial');
    return rows[0];
  },

  // Nunca deixa o slug/is_system serem alterados via update (slug travado).
  async updateEditorial(id: string, patch: Partial<BeeEditorial>): Promise<BeeEditorial> {
    const { slug: _slug, is_system: _sys, id: _id, ...safe } = patch;
    const rows = await db.update<BeeEditorial>('bee_editorials', { id: `eq.${id}` }, safe);
    if (!rows[0]) throw new Error('Editorial nao encontrado');
    return rows[0];
  },

  async deleteEditorial(id: string): Promise<void> {
    return db.delete('bee_editorials', { id: `eq.${id}` });
  },

  // ----- exemplos de um editorial (few-shot da geração) -----
  async examplesForEditorial(editorial_slug: string): Promise<BeeExamplePost[]> {
    return db.select<BeeExamplePost>('bee_example_posts', {
      editorial_slug: `eq.${editorial_slug}`,
      order: 'position.asc',
    });
  },

  async createExample(input: {
    editorial_slug: string;
    image_quote: string;
    caption: string;
    why_good?: string;
    headline_type?: string;
    analogy?: string;
    position?: number;
  }): Promise<BeeExamplePost> {
    const rows = await db.insert<BeeExamplePost>('bee_example_posts', {
      ...input,
      source: 'manual',
      is_active: true,
    });
    if (!rows[0]) throw new Error('Falha ao criar exemplo');
    return rows[0];
  },

  async updateExample(id: string, patch: Partial<BeeExamplePost>): Promise<void> {
    const { id: _id, ...safe } = patch;
    await db.update('bee_example_posts', { id: `eq.${id}` }, safe);
  },

  async deleteExample(id: string): Promise<void> {
    return db.delete('bee_example_posts', { id: `eq.${id}` });
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

// ----------------------------------------------------------------------------
// PODCASTS (episodios do YouTube) + CORTES
// ----------------------------------------------------------------------------
export const podcastApi = {
  async list(): Promise<Podcast[]> {
    return db.select<Podcast>('podcasts', { order: 'created_at.desc' });
  },

  async get(id: string): Promise<Podcast | null> {
    return db.selectOne<Podcast>('podcasts', { id: `eq.${id}` });
  },

  async findByVideoId(videoId: string): Promise<Podcast | null> {
    const userId = requireUserId();
    return db.selectOne<Podcast>('podcasts', {
      user_id: `eq.${userId}`,
      youtube_video_id: `eq.${videoId}`,
    });
  },

  async create(input: Partial<Podcast>): Promise<Podcast> {
    const userId = requireUserId();
    const rows = await db.insert<Podcast>('podcasts', { ...input, user_id: userId });
    if (!rows[0]) throw new Error('Falha ao criar podcast');
    return rows[0];
  },

  async update(id: string, patch: Partial<Podcast>): Promise<Podcast> {
    const { id: _id, user_id: _u, ...safe } = patch;
    const rows = await db.update<Podcast>('podcasts', { id: `eq.${id}` }, safe);
    if (!rows[0]) throw new Error('Podcast nao encontrado');
    return rows[0];
  },

  async delete(id: string): Promise<void> {
    return db.delete('podcasts', { id: `eq.${id}` });
  },

  // Acha o episodio pelo videoId ou cria um novo a partir dos metadados.
  // Mantem titulo/descricao atualizados se ja existir.
  async upsertFromYoutube(meta: {
    video_id: string;
    url: string;
    title: string;
    description?: string;
    channel?: string;
    thumbnail_url?: string;
  }): Promise<Podcast> {
    const existing = await podcastApi.findByVideoId(meta.video_id);
    const fields: Partial<Podcast> = {
      youtube_url: meta.url,
      youtube_video_id: meta.video_id,
      title: meta.title,
      description: meta.description ?? null,
      channel: meta.channel ?? null,
      thumbnail_url: meta.thumbnail_url ?? null,
    };
    if (existing) return podcastApi.update(existing.id, fields);
    return podcastApi.create(fields);
  },
};

export const podcastClipApi = {
  async list(): Promise<PodcastClip[]> {
    return db.select<PodcastClip>('podcast_clips', { order: 'created_at.desc' });
  },

  async listByPodcast(podcastId: string): Promise<PodcastClip[]> {
    return db.select<PodcastClip>('podcast_clips', {
      podcast_id: `eq.${podcastId}`,
      order: 'created_at.desc',
    });
  },

  async get(id: string): Promise<PodcastClip | null> {
    return db.selectOne<PodcastClip>('podcast_clips', { id: `eq.${id}` });
  },

  async create(input: Partial<PodcastClip>): Promise<PodcastClip> {
    const userId = requireUserId();
    const rows = await db.insert<PodcastClip>('podcast_clips', { ...input, user_id: userId });
    if (!rows[0]) throw new Error('Falha ao salvar corte');
    return rows[0];
  },

  async update(id: string, patch: Partial<PodcastClip>): Promise<PodcastClip> {
    const { id: _id, user_id: _u, ...safe } = patch;
    const rows = await db.update<PodcastClip>('podcast_clips', { id: `eq.${id}` }, safe);
    if (!rows[0]) throw new Error('Corte nao encontrado');
    return rows[0];
  },

  async delete(id: string): Promise<void> {
    return db.delete('podcast_clips', { id: `eq.${id}` });
  },
};

// ----------------------------------------------------------------------------
// ARSENAL (CRUD + lifecycle) — metodologia viva
// ----------------------------------------------------------------------------
export const arsenalApi = {
  async list(editorialSlug?: string): Promise<BeeArsenalItem[]> {
    const params: Record<string, string> = { order: 'editorial_slug.asc,position.asc' };
    if (editorialSlug) params.editorial_slug = `eq.${editorialSlug}`;
    return db.select<BeeArsenalItem>('bee_arsenal', params);
  },
  async create(input: Partial<BeeArsenalItem>): Promise<BeeArsenalItem> {
    const rows = await db.insert<BeeArsenalItem>('bee_arsenal', input);
    if (!rows[0]) throw new Error('Falha ao criar item de arsenal');
    return rows[0];
  },
  async update(id: string, patch: Partial<BeeArsenalItem>): Promise<BeeArsenalItem> {
    const { id: _id, ...safe } = patch;
    const rows = await db.update<BeeArsenalItem>('bee_arsenal', { id: `eq.${id}` }, safe);
    if (!rows[0]) throw new Error('Item nao encontrado');
    return rows[0];
  },
  async delete(id: string): Promise<void> {
    return db.delete('bee_arsenal', { id: `eq.${id}` });
  },
};

// ----------------------------------------------------------------------------
// EXAMPLE POSTS (few-shot, CRUD + lifecycle)
// ----------------------------------------------------------------------------
export const exampleApi = {
  async list(editorialSlug?: string): Promise<BeeExamplePost[]> {
    const params: Record<string, string> = { order: 'editorial_slug.asc,position.asc' };
    if (editorialSlug) params.editorial_slug = `eq.${editorialSlug}`;
    return db.select<BeeExamplePost>('bee_example_posts', params);
  },
  async create(input: Partial<BeeExamplePost>): Promise<BeeExamplePost> {
    const rows = await db.insert<BeeExamplePost>('bee_example_posts', input);
    if (!rows[0]) throw new Error('Falha ao criar exemplo');
    return rows[0];
  },
  async update(id: string, patch: Partial<BeeExamplePost>): Promise<BeeExamplePost> {
    const { id: _id, ...safe } = patch;
    const rows = await db.update<BeeExamplePost>('bee_example_posts', { id: `eq.${id}` }, safe);
    if (!rows[0]) throw new Error('Exemplo nao encontrado');
    return rows[0];
  },
  async delete(id: string): Promise<void> {
    return db.delete('bee_example_posts', { id: `eq.${id}` });
  },
};

// ----------------------------------------------------------------------------
// SUGGESTIONS (fila de curadoria) — aprovar promove pro destino real
// ----------------------------------------------------------------------------
export const suggestionApi = {
  async listPending(): Promise<BeeSuggestion[]> {
    return db.select<BeeSuggestion>('bee_suggestions', {
      status: 'eq.pending',
      order: 'created_at.desc',
    });
  },

  async countPending(): Promise<number> {
    const rows = await db.select<{ id: string }>('bee_suggestions', {
      status: 'eq.pending',
      select: 'id',
    });
    return rows.length;
  },

  async create(input: Partial<BeeSuggestion>): Promise<BeeSuggestion> {
    const rows = await db.insert<BeeSuggestion>('bee_suggestions', {
      ...input,
      created_by: getCurrentUserId(),
    });
    if (!rows[0]) throw new Error('Falha ao criar sugestao');
    return rows[0];
  },

  async reject(id: string): Promise<void> {
    await db.update('bee_suggestions', { id: `eq.${id}` }, {
      status: 'rejected',
      reviewed_by: getCurrentUserId(),
      reviewed_at: new Date().toISOString(),
    });
  },

  // Feedback de performance: ao publicar, a frase vencedora vira candidata a
  // example_post (few-shot) — mas ainda passa pela curadoria. O indice de dedup
  // impede duplicar a mesma frase do mesmo post. Falha silenciosa (nao trava publish).
  async captureFromPublishedPost(post: UserPost): Promise<void> {
    try {
      const quote =
        (post.carousel_text?.quote as string | undefined) ??
        (post.carousel_text?.['bee-quote'] as string | undefined);
      const caption = post.caption ?? (post.carousel_text?.caption as string | undefined) ?? '';
      if (!quote || quote.trim().length < 8) return; // sem frase clara, nao captura
      const editorialSlug = (post.metadata?.editorial_slug as string | undefined) ?? null;
      await suggestionApi.create({
        kind: 'example_post',
        editorial_slug: editorialSlug,
        payload: {
          image_quote: quote.trim(),
          caption: caption.trim(),
          why_good: 'Publicado de verdade — validado na prática.',
          headline_type: (post.metadata?.headline_type_used as string) ?? '',
        },
        source_type: 'post',
        source_id: post.id,
        source_excerpt: quote.trim().slice(0, 200),
        confidence: 0.7,
      });
    } catch (e) {
      console.warn('[captureFromPublishedPost] ignorado', e);
    }
  },

  // Promove a sugestao (ja com edicoes do revisor) pro destino real e marca approved.
  async approve(s: BeeSuggestion): Promise<void> {
    const p = s.payload ?? {};
    let targetId: string | undefined;

    if (s.kind === 'arsenal') {
      const row = await arsenalApi.create({
        editorial_slug: s.editorial_slug ?? undefined,
        type: (p.type as string) ?? 'insight',
        title: (p.title as string) ?? 'Sem titulo',
        summary: (p.summary as string) ?? undefined,
        details: (p.details as string) ?? undefined,
        source: (p.source as string) ?? undefined,
        source_type: s.source_type ?? undefined,
        source_id: s.source_id ?? undefined,
      });
      targetId = row.id;
    } else if (s.kind === 'example_post') {
      const row = await exampleApi.create({
        editorial_slug: s.editorial_slug ?? undefined,
        avatar_slug: (p.avatar_slug as string) ?? undefined,
        image_quote: (p.image_quote as string) ?? '',
        caption: (p.caption as string) ?? '',
        why_good: (p.why_good as string) ?? undefined,
        headline_type: (p.headline_type as string) ?? undefined,
        analogy: (p.analogy as string) ?? undefined,
        source: (p.source as string) ?? undefined,
        source_type: s.source_type ?? undefined,
        source_id: s.source_id ?? undefined,
      });
      targetId = row.id;
    } else if (s.kind === 'analogy') {
      const rows = await db.insert<BeeAnalogy>('bee_analogies', {
        name: (p.name as string) ?? 'Analogia',
        description: (p.description as string) ?? undefined,
        domain: (p.domain as string) ?? 'natureza',
        best_for: (p.best_for as string) ?? undefined,
      });
      targetId = rows[0]?.id;
    }

    await db.update('bee_suggestions', { id: `eq.${s.id}` }, {
      status: 'approved',
      reviewed_by: getCurrentUserId(),
      reviewed_at: new Date().toISOString(),
      approved_target_id: targetId ?? null,
      // persiste eventuais edicoes do revisor
      payload: p,
      editorial_slug: s.editorial_slug ?? null,
    });
  },
};

// ----------------------------------------------------------------------------
// ALMA — a psique viva (Fase 1: leitura do estado + editar objetivo)
// ----------------------------------------------------------------------------
export const almaApi = {
  async snapshot(): Promise<import('@/types').AlmaSnapshot> {
    const [estado, objetivo, dimensoes, crencas, sombra, pulsoes, eventos, lexico] =
      await Promise.all([
        db.selectOne<import('@/types').AlmaEstado>('alma_estado', {}),
        db.selectOne<import('@/types').AlmaObjetivo>('alma_objetivo', {
          is_current: 'eq.true', order: 'created_at.desc',
        }),
        db.select<import('@/types').AlmaDimensao>('alma_dimensoes', { order: 'ordem.asc' }),
        db.select<import('@/types').AlmaCrenca>('alma_crencas', { order: 'forca.desc' }),
        db.select<import('@/types').AlmaSombra>('alma_sombra', { ativa: 'eq.true' }),
        db.select<import('@/types').AlmaPulsao>('alma_pulsoes', { order: 'ordem.asc' }),
        db.select<import('@/types').AlmaEvento>('alma_eventos', {
          order: 'created_at.desc', limit: '8',
        }),
        db.select<import('@/types').AlmaLexico>('bee_glossary', {
          select: 'term,is_mantra', order: 'is_mantra.desc,term.asc',
        }),
      ]);
    return { estado, objetivo, dimensoes, crencas, sombra, pulsoes, eventos, lexico };
  },

  // Objetivo é vivo: cada edição cria uma nova versão vigente (histórico preservado)
  async updateObjetivo(texto: string): Promise<import('@/types').AlmaObjetivo> {
    const userId = getCurrentUserId();
    await db.update('alma_objetivo', { is_current: 'eq.true' }, { is_current: false });
    const rows = await db.insert<import('@/types').AlmaObjetivo>('alma_objetivo', {
      texto, is_current: true, edited_by: userId,
    });
    await db.insert(
      'alma_eventos',
      {
        tipo: 'objetivo',
        descricao: 'O criador reorientou o objetivo da Alma',
        source: 'alma',
        user_id: userId,
        payload: { texto },
      },
      { returning: false },
    );
    return rows[0];
  },

  // Barramento: qualquer ação do sistema alimenta a Alma. Se vier dimensão+delta,
  // move a oitava (clamp 0..100). Fire-and-forget: nunca quebra o fluxo chamador.
  async emitEvento(evt: {
    tipo: string;
    descricao: string;
    source?: string;
    dimensao_slug?: string | null;
    delta?: number | null;
  }): Promise<void> {
    try {
      const userId = getCurrentUserId();
      await db.insert(
        'alma_eventos',
        {
          tipo: evt.tipo,
          descricao: evt.descricao,
          source: evt.source ?? 'app',
          dimensao_slug: evt.dimensao_slug ?? null,
          delta: evt.delta ?? null,
          user_id: userId,
        },
        { returning: false },
      );
      if (evt.dimensao_slug && evt.delta) {
        const dim = await db.selectOne<import('@/types').AlmaDimensao>('alma_dimensoes', {
          slug: `eq.${evt.dimensao_slug}`,
          select: 'slug,oitava',
        });
        if (dim) {
          const nova = Math.max(0, Math.min(100, dim.oitava + evt.delta));
          await db.update(
            'alma_dimensoes',
            { slug: `eq.${evt.dimensao_slug}` },
            { oitava: nova, updated_at: new Date().toISOString() },
          );
        }
      }
    } catch (e) {
      console.warn('[alma.emitEvento]', e);
    }
  },
};

// ----------------------------------------------------------------------------
// PERSONAS (biblioteca de pessoas pra simular o público)
// ----------------------------------------------------------------------------
export const personaApi = {
  async list(): Promise<BeePersona[]> {
    return db.select<BeePersona>('bee_personas', { is_active: 'eq.true', order: 'position.asc,created_at.desc' });
  },
  async create(input: Partial<BeePersona>): Promise<BeePersona> {
    const rows = await db.insert<BeePersona>('bee_personas', { ...input, user_id: requireUserId() });
    if (!rows[0]) throw new Error('Falha ao criar persona');
    return rows[0];
  },
  async update(id: string, patch: Partial<BeePersona>): Promise<BeePersona> {
    const { id: _id, user_id: _u, ...safe } = patch;
    const rows = await db.update<BeePersona>('bee_personas', { id: `eq.${id}` }, { ...safe, updated_at: new Date().toISOString() });
    if (!rows[0]) throw new Error('Persona nao encontrada');
    return rows[0];
  },
  async remove(id: string): Promise<void> {
    return db.delete('bee_personas', { id: `eq.${id}` });
  },
};

// ----------------------------------------------------------------------------
// EFICACIA DA IA
// ----------------------------------------------------------------------------
// Aprovar e o instrumento de medicao: aprovar intacto = a IA acertou; aprovar
// depois de editar = errou, e o diff vira licao.
//
// A regua (decidida com o usuario): QUALQUER edicao de texto conta como erro.
// Mexer no canvas nao conta — so quote e caption.

// Normaliza so o que NAO deve contar como diferenca: espaco repetido e sobras
// nas pontas. Acento, pontuacao e caixa contam — a regua e dura de proposito.
function normalizeForCompare(s: string | undefined | null): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

// Distancia de edicao em % do texto. INFORMATIVO — nao decide nada, so alimenta
// o dashboard. Quem decide e o !==.
function driftPct(a: string, b: string): number {
  const x = normalizeForCompare(a);
  const y = normalizeForCompare(b);
  if (!x && !y) return 0;
  if (!x || !y) return 100;
  // Levenshtein com 2 linhas (evita matriz completa pra textos longos).
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  let cur = new Array<number>(y.length + 1);
  for (let i = 1; i <= x.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1),
      );
    }
    [prev, cur] = [cur, prev];
  }
  return Math.round((prev[y.length] / Math.max(x.length, y.length)) * 1000) / 10;
}

// Limiar que separa ajuste (cosmético) de reescrita, em % de drift. TEM que
// bater com o `ajuste_max_drift` do ai_gate_status() no banco — a régua precisa
// classificar igual dos dois lados. Medido (ponto/acento ~4%, 1 palavra ~14%,
// reestruturar ~21%).
export const AJUSTE_MAX_DRIFT = 15;

// A severidade de uma review (overall), pela mesma régua do portão.
export function severidadeOf(review: { changed: boolean; drift_pct?: number | null }): AiSeveridade {
  if (!review.changed) return 'intacto';
  if ((review.drift_pct ?? 100) <= AJUSTE_MAX_DRIFT) return 'ajuste';
  return 'reescrita';
}

// Severidade de UMA faceta. Texto/legenda usam drift; imagem é binária.
export function severidadeFaceta(
  facet: 'texto' | 'legenda' | 'imagem',
  review: {
    quote_changed: boolean; quote_drift_pct?: number | null;
    caption_changed: boolean; caption_drift_pct?: number | null;
    has_image: boolean; image_changed: boolean;
  },
): AiSeveridade | null {
  if (facet === 'imagem') {
    if (!review.has_image) return null; // N/A
    return review.image_changed ? 'reescrita' : 'intacto';
  }
  const changed = facet === 'texto' ? review.quote_changed : review.caption_changed;
  const drift = facet === 'texto' ? review.quote_drift_pct : review.caption_drift_pct;
  if (!changed) return 'intacto';
  return (drift ?? 100) <= AJUSTE_MAX_DRIFT ? 'ajuste' : 'reescrita';
}

export const aiApi = {
  // O portao. Vem do banco (ai_gate_status) pra o frontend e o cron
  // enxergarem a MESMA regra — duas implementacoes divergiriam.
  async gate(): Promise<AiGate> {
    const r = await db.rpc<AiGate>('ai_gate_status', {});
    return r;
  },

  async createGeneration(input: {
    editorial_slug?: string;
    target_avatar?: string;
    platform?: string;
    briefing?: string;
    arsenal_item_id?: string;
    model?: string;
    variations_count: number;
  }): Promise<AiGeneration> {
    const rows = await db.insert<AiGeneration>('ai_generations', {
      user_id: requireUserId(),
      ...input,
    });
    if (!rows[0]) throw new Error('Erro ao registrar a geração');
    return rows[0];
  },

  // Grava o texto PRISTINO. Nunca atualize estas linhas depois.
  async createVariations(
    generationId: string,
    variations: Array<{ idx: number; quote: string; caption: string; headline_type?: string; analogy?: string; virality_score?: number | null; virality_reason?: string | null }>,
  ): Promise<AiVariation[]> {
    const uid = requireUserId();
    return db.insert<AiVariation>(
      'ai_variations',
      variations.map((v) => ({ ...v, generation_id: generationId, user_id: uid })),
    );
  },

  async linkVariationToPost(variationId: string, postId: string): Promise<void> {
    await db.update('ai_variations', { id: `eq.${variationId}` }, { post_id: postId });
  },

  async variationForPost(postId: string): Promise<AiVariation | null> {
    return db.selectOne<AiVariation>('ai_variations', { post_id: `eq.${postId}` });
  },

  // A MEDICAO. Compara o final com o original pristino, POR FACETA.
  // Idempotente por post (upsert): reaprovar corrige a medicao, nao duplica.
  //
  // image_original/final sao opcionais: so existem quando o template gera imagem
  // por IA. Ausentes -> has_image=false -> a faceta imagem fica N/A.
  async recordReview(input: {
    post_id: string;
    variation: AiVariation;
    quote_final: string;
    caption_final: string;
    image_original?: string | null;
    image_final?: string | null;
  }): Promise<AiReview> {
    const { post_id, variation, quote_final, caption_final } = input;
    const quote_changed =
      normalizeForCompare(variation.quote) !== normalizeForCompare(quote_final);
    const caption_changed =
      normalizeForCompare(variation.caption) !== normalizeForCompare(caption_final);
    const quote_drift = driftPct(variation.quote, quote_final);
    const caption_drift = driftPct(variation.caption, caption_final);

    // imagem: binária. Só conta se havia imagem de IA (image_original presente).
    const has_image = !!input.image_original;
    const image_changed = has_image && (input.image_original ?? '') !== (input.image_final ?? '');

    const rows = await db.upsert<AiReview>(
      'ai_reviews',
      {
        user_id: requireUserId(),
        post_id,
        variation_id: variation.id,
        generation_id: variation.generation_id,
        quote_original: variation.quote,
        quote_final,
        caption_original: variation.caption,
        caption_final,
        quote_changed,
        caption_changed,
        quote_drift_pct: quote_drift,
        caption_drift_pct: caption_drift,
        has_image,
        image_changed,
        changed: quote_changed || caption_changed || image_changed,
        drift_pct: Math.max(quote_drift, caption_drift),
      },
      'post_id',
    );
    if (!rows[0]) throw new Error('Erro ao registrar a revisão');
    return rows[0];
  },

  // Detalhe por segmento (editoria × plataforma × alvo) com facetas.
  async segments(): Promise<AiSegment[]> {
    return db.rpc<AiSegment[]>('ai_segment_status', {});
  },

  async listReviews(limit = 30): Promise<AiReview[]> {
    return db.select<AiReview>('ai_reviews', {
      order: 'created_at.desc',
      limit: String(limit),
    });
  },

  async listLearnings(opts?: { onlyActive?: boolean }): Promise<AiLearning[]> {
    const params: Record<string, string> = { order: 'evidencias.desc,last_reforcada_em.desc' };
    if (opts?.onlyActive) params.ativo = 'eq.true';
    return db.select<AiLearning>('ai_learnings', params);
  },

  async toggleLearning(id: string, ativo: boolean): Promise<void> {
    await db.update('ai_learnings', { id: `eq.${id}` }, { ativo });
  },

  // ----- chat com o agente de voz -----
  async chatHistory(limit = 40): Promise<AiChatMessage[]> {
    const rows = await db.select<AiChatMessage>('ai_chat_messages', {
      order: 'created_at.asc', limit: String(limit),
    });
    return rows;
  },

  async saveChatMessage(input: {
    role: 'user' | 'assistant'; content: string; proposals?: unknown[];
  }): Promise<AiChatMessage> {
    const rows = await db.insert<AiChatMessage>('ai_chat_messages', {
      user_id: requireUserId(),
      role: input.role,
      content: input.content,
      proposals: input.proposals ?? [],
    });
    if (!rows[0]) throw new Error('Erro ao salvar a mensagem');
    return rows[0];
  },

  // Marca uma proposta como salva na mensagem (pra UI não reoferecer).
  async markProposalSaved(messageId: string, proposals: unknown[]): Promise<void> {
    await db.update('ai_chat_messages', { id: `eq.${messageId}` }, { proposals });
  },
};

export const __aiInternals = { normalizeForCompare, driftPct };
