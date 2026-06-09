// Tipos centrais — espelham o schema do Supabase (carrossel-ia adaptado pra LinkedIn).
// Convencao: nomes em snake_case bate com colunas do DB.

// ---------------------------------------------------------------------------
// ENUMS
// ---------------------------------------------------------------------------
export type Platform = 'linkedin' | 'instagram' | 'facebook' | 'tiktok' | 'youtube';

export type Format = 'image' | 'carousel' | 'reel' | 'story';

export type PostStatus =
  | 'idea'
  | 'draft'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'archived';

export type Archetype = 'sage' | 'hero' | 'rebel' | 'friend';

export type Role = 'admin' | 'editor' | 'viewer';

// ---------------------------------------------------------------------------
// PROFILES
// ---------------------------------------------------------------------------
export interface Profile {
  id: string;
  name: string;
  email?: string;
  role: Role;
  avatar_color: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// USER SETTINGS
// ---------------------------------------------------------------------------
export interface UserSettings {
  user_id: string;
  archetype?: Archetype;
  persona?: string;
  tone_of_voice?: string;
  content_structure?: string;
  caption_prompt_template?: string;
  image_style_prompt?: string;
  brand_colors?: string[];
  brand_logo_url?: string;
  brand_font?: string;
  gemini_api_key?: string;
  serpapi_key?: string;
  linkedin_token?: string;
  linkedin_user_id?: string;
  linkedin_publish_enabled?: boolean;
  linkedin_author_urn?: string;
  instagram_access_token?: string;
  instagram_business_account_id?: string;
  use_ai_images?: boolean;
  default_template_id?: string;
  content_analysis?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// TEMPLATES
// ---------------------------------------------------------------------------
// Estrutura do template_config jsonb. Compatível com o esquema da doc §7-8.
export interface TemplateConfig {
  // dimensoes do canvas (cada slide do array slides_json deve respeitar)
  width: number;
  height: number;
  // array de slides Fabric.js (pra imagem unica, 1 elemento)
  slides_json: object[];
  // metadata derivado: campos editaveis por slide
  slides?: Record<
    string,
    {
      name: string;
      fields: Array<{
        content_key: string;
        type: 'text' | 'image';
        display_name: string;
        max_chars?: number;
      }>;
    }
  >;
}

export interface PostTemplate {
  id: string;
  user_id?: string | null;
  name: string;
  description?: string;
  category?: string;
  preview_image_url?: string;
  thumbnail_url?: string;
  slides_count: number;
  template_config: TemplateConfig;
  platform: Platform;
  format: Format;
  is_default: boolean;
  is_premium: boolean;
  is_archived: boolean;
  is_public: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// USER POSTS (equivalente a user_carousels)
// ---------------------------------------------------------------------------
// Conteudo gerado pela IA — texto puro + caption + keywords pra imagem
export interface PostContent {
  // pra LinkedIn imagem unica: { quote: "..." } (1 campo)
  // pra carrossel: { slide1: { 'slide1-titulo': '...' }, slide2: {...} }
  [key: string]: unknown;
  caption?: string;
  image_keywords?: Record<string, string>;
}

export interface UserPost {
  id: string;
  user_id: string;
  template_id?: string | null;
  title?: string;
  briefing?: string;
  platform: Platform;
  format: Format;
  carousel_text?: PostContent;        // conteudo gerado IA
  carousel_fabric_json?: object[];    // array de slides Fabric.js hidratados
  generated_images?: Record<string, string>;  // { slide1: 'url' }
  rendered_slides?: Record<string, string>;   // URLs finais do Storage
  caption?: string;
  status: PostStatus;
  scheduled_date?: string;
  published_date?: string;
  is_favorite: boolean;
  kanban_column_id?: string | null;
  editorial_line_id?: string | null;
  companion_post_id?: string | null;
  product_id?: string | null;
  metadata: Record<string, unknown>;
  // Publish tracking
  published_url?: string | null;
  published_at?: string | null;
  publish_error?: string | null;
  publish_attempts?: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// KANBAN
// ---------------------------------------------------------------------------
export interface KanbanColumn {
  id: string;
  user_id: string;
  name: string;
  color: string;
  position: number;
  is_default: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// DRAFTS
// ---------------------------------------------------------------------------
export interface PostDraft {
  id: string;
  user_id: string;
  post_id?: string;
  draft_data: Record<string, unknown>;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// CONTENT IDEAS (IA cache)
// ---------------------------------------------------------------------------
export interface ContentIdea {
  id?: string;
  title: string;
  hook?: string;
  briefing?: string;
  pillar?: string;
  tone?: string;
}

// ---------------------------------------------------------------------------
// PODCASTS + CORTES
// ---------------------------------------------------------------------------
// Um "podcast" = o video do YouTube do episodio completo (titulo/descricao
// puxados do YouTube). Cada corte (clip) e um trecho subido, transcrito e
// guardado, vinculado a um podcast.
export interface Podcast {
  id: string;
  user_id: string;
  youtube_url?: string | null;
  youtube_video_id?: string | null;
  title: string;
  description?: string | null;
  channel?: string | null;
  thumbnail_url?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // agregado opcional (preenchido em algumas queries)
  clip_count?: number;
}

export interface PodcastClip {
  id: string;
  user_id: string;
  podcast_id?: string | null;
  title?: string | null;
  video_path?: string | null;
  video_url?: string | null;
  transcript?: string | null;
  visual_summary?: string | null;
  duration_seconds?: number | null;
  content_type?: string;
  post_id?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// Metadados puxados do YouTube pela edge function youtube-meta.
export interface YoutubeMeta {
  video_id: string;
  url: string;
  title: string;
  description: string;
  channel?: string;
  thumbnail_url?: string;
}

// ---------------------------------------------------------------------------
// BEE EDITORIAL ARCHITECTURE
// ---------------------------------------------------------------------------
export interface BeeEditorial {
  id: string;
  slug: string;
  name: string;
  description?: string;
  frequency_hint?: string;
  structure_template?: string;
  emotional_sequence?: string[];
  position: number;
  is_active: boolean;
  is_system?: boolean;
}

export interface BeeArsenalItem {
  id: string;
  editorial_slug: string;
  type: string;
  title: string;
  summary?: string;
  details?: string;
  source?: string;
  metadata: Record<string, unknown>;
  position: number;
  // lifecycle (metodologia viva)
  is_active?: boolean;
  usage_count?: number;
  last_used_at?: string | null;
  performance_score?: number;
  source_type?: string | null;
  source_id?: string | null;
}

export interface BeeGlossaryTerm {
  id: string;
  term: string;
  meaning: string;
  usage_note?: string;
  must_appear: boolean;
}

export interface BeeAnalogy {
  id: string;
  name: string;
  description?: string;
  domain: string;
  used: boolean;
  best_for?: string;
}

export interface BeeHeadlineType {
  id: string;
  slug: string;
  name: string;
  description?: string;
  examples?: string[];
  position: number;
}

export interface BeeTheme {
  id: string;
  slug: string;
  name: string;
  senso_comum?: string;
  olhar_bee?: string;
  analogies_keys?: string[];
  key_phrases?: string[];
  avoid_phrases?: string[];
  position: number;
}

export interface BeeLogic {
  id: string;
  slug: string;
  name: string;
  common_belief?: string;
  deconstructive_logic?: string;
  position: number;
}

export interface BeeStyleRule {
  id: string;
  category: 'do' | 'dont' | 'general';
  rule: string;
  rationale?: string;
  position: number;
}

export interface BeeAvatar {
  id: string;
  slug: string;
  name: string;
  state?: string;
  dor?: string;
  desafio_comunicacao?: string;
  gatilhos?: string[];
  beneficios?: string[];
  example_phrases?: string[];
  position: number;
}

export interface BeeExamplePost {
  id: string;
  editorial_slug?: string;
  avatar_slug?: string;
  image_quote: string;
  caption: string;
  why_good?: string;
  headline_type?: string;
  analogy?: string;
  source?: string;
  position: number;
  // lifecycle (metodologia viva)
  is_active?: boolean;
  usage_count?: number;
  last_used_at?: string | null;
  performance_score?: number;
  source_type?: string | null;
  source_id?: string | null;
}

// Sugestao na fila de curadoria — material minerado pela IA que aguarda
// aprovacao humana antes de virar arsenal/exemplo/analogia de verdade.
export type SuggestionKind = 'arsenal' | 'example_post' | 'analogy';
export type SuggestionStatus = 'pending' | 'approved' | 'rejected';

export interface BeeSuggestion {
  id: string;
  kind: SuggestionKind;
  status: SuggestionStatus;
  editorial_slug?: string | null;
  // forma do payload depende do kind (campos do arsenal / example_post / analogy)
  payload: Record<string, unknown>;
  source_type?: string | null;
  source_id?: string | null;
  source_excerpt?: string | null;
  confidence?: number;
  created_by?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  approved_target_id?: string | null;
  created_at: string;
}

export interface BeeHashtag {
  id: string;
  tag: string;
  required: boolean;
  topic?: string;
  position: number;
}

export type TargetAvatar = 'identificado' | 'incomodado' | 'ambos';

// ---------------------------------------------------------------------------
// PRODUCTS + EDITORIAL LINES
// ---------------------------------------------------------------------------
export type ProductStatus = 'em_construcao' | 'pre_launch' | 'launching' | 'post_launch' | 'evergreen' | 'archived';

export interface BeeProduct {
  id: string;
  user_id?: string | null;
  slug: string;
  name: string;
  description?: string;
  type?: string;
  pre_launch_start?: string;
  launch_date?: string;
  post_launch_end?: string;
  status: ProductStatus;
  promessa?: string;
  pillars?: string[];
  cta_text?: string;
  cta_link?: string;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export type EditorialLineStatus = 'active' | 'paused' | 'ended' | 'draft';
export type FrequencyType = 'weekly' | 'daily' | 'custom_days' | 'manual';
export type CampaignPhase = 'free' | 'pre_launch' | 'launch' | 'post_launch';

export interface EditorialLine {
  id: string;
  user_id: string;
  product_id?: string | null;
  name: string;
  description?: string;
  editorial_slugs: string[];
  rotation_cursor: number;
  target_avatar?: TargetAvatar;
  platforms: Platform[];
  campaign_phase: CampaignPhase;
  frequency_type: FrequencyType;
  frequency_days?: number[];
  preferred_hour: number;
  start_date?: string;
  end_date?: string;
  briefing_base?: string;
  theme?: string;
  status: EditorialLineStatus;
  next_run_at?: string;
  last_run_at?: string;
  posts_generated_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface EditorialLineRun {
  id: string;
  line_id: string;
  post_id?: string;
  user_id: string;
  platform?: string;
  editorial_slug?: string;
  status: 'success' | 'failed' | 'skipped';
  error_message?: string;
  scheduled_for?: string;
  run_at: string;
  duration_ms?: number;
}

// ---------------------------------------------------------------------------
// RAG / KNOWLEDGE BASE
// ---------------------------------------------------------------------------
export interface KnowledgeDocument {
  id: string;
  user_id?: string;
  title: string;
  source_type?: string;
  source_size?: number;
  chunk_count: number;
  is_global: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeChunk {
  id: string;
  document_id: string;
  user_id: string;
  chunk_index: number;
  content: string;
  tokens?: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// USAGE EVENTS
// ---------------------------------------------------------------------------
export interface UsageEvent {
  id: number;
  user_id?: string;
  provider: 'gemini' | 'serpapi';
  product: 'text' | 'image' | 'image-search';
  model?: string;
  tokens_input?: number;
  tokens_output?: number;
  cost_usd?: number;
  metadata?: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// CONSTANTES
// ---------------------------------------------------------------------------
export const PLATFORM_LABELS: Record<Platform, string> = {
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
};

export const PLATFORM_COLORS: Record<Platform, string> = {
  linkedin: '#0A66C2',
  instagram: '#E4405F',
  facebook: '#1877F2',
  tiktok: '#000000',
  youtube: '#FF0000',
};

export const FORMAT_LABELS: Record<Format, string> = {
  image: 'Imagem unica',
  carousel: 'Carrossel',
  reel: 'Reel',
  story: 'Story',
};

export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  idea: 'Ideia',
  draft: 'Rascunho',
  approved: 'Aprovado',
  scheduled: 'Agendado',
  published: 'Publicado',
  archived: 'Arquivado',
};

export const ARCHETYPE_LABELS: Record<Archetype, string> = {
  sage: 'Sabio',
  hero: 'Heroi',
  rebel: 'Rebelde',
  friend: 'Amigo',
};

// Descricao curta de cada arquetipo (usado no onboarding)
export const ARCHETYPE_DESCRIPTIONS: Record<Archetype, string> = {
  sage:
    'Voz de autoridade. Ensina, contextualiza, traz dados. Tom calmo e confiante. Ex: "3 padroes que aprendi conduzindo 200 escutas..."',
  hero:
    'Voz de causa e coragem. Desafia, mobiliza, mostra o caminho. Tom energico. Ex: "Pare de fingir que aquela reuniao deu certo."',
  rebel:
    'Voz contraintuitiva. Quebra dogma, provoca, expoe contradicao. Tom afiado. Ex: "Liderancas fortes sao raramente as mais barulhentas."',
  friend:
    'Voz humana e vulneravel. Compartilha bastidor, duvida, processo. Tom proximo. Ex: "Demorou 4 anos pra eu entender o que esse cliente queria."',
};
