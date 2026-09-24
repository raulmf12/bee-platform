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
  // Todo post gerado pela IA nasce aqui e so sai por decisao humana (Aprovar).
  // Aprovar e o instrumento de medicao da eficacia — vide ai_reviews.
  | 'pending_approval'
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
  openai_api_key?: string;
  serpapi_key?: string;
  linkedin_token?: string;
  linkedin_user_id?: string;
  linkedin_publish_enabled?: boolean;
  linkedin_author_urn?: string;
  instagram_access_token?: string;
  instagram_business_account_id?: string;
  instagram_token_expires_at?: string;
  use_ai_images?: boolean;
  default_template_id?: string;
  content_analysis?: Record<string, unknown>;
  // Preferências da distribuição automática da Agenda (editáveis pelo usuário).
  distribution_prefs?: DistributionPrefs;
  created_at: string;
  updated_at: string;
}

// Regras que a Agenda usa no "IA distribui". Tudo opcional — o lib/schedule
// aplica os defaults por cima. NADA é fixo no código de negócio: o usuário edita.
export interface DistributionPrefs {
  // horário 'HH:mm' por plataforma; cai no default_time quando ausente.
  platform_times?: Partial<Record<Platform, string>>;
  default_time?: string;
  skip_weekends?: boolean;
  per_day_limit?: number;
  // começa a agendar a partir de hoje + N dias.
  start_offset_days?: number;
  // Cadência por plataforma: quantos posts por semana e horários alternados.
  // É o "padrão" (ex: LinkedIn 2x/semana, horários 09:00 e 15:00) que a
  // distribuição automática respeita.
  platform_cadence?: Partial<Record<Platform, PlatformCadence>>;
}

export interface PlatformCadence {
  // Máximo de posts por semana nessa plataforma. 0 = sem limite semanal.
  per_week?: number;
  // Horários 'HH:mm' que a distribuição alterna (rotaciona) entre os posts.
  times?: string[];
}

// ---------------------------------------------------------------------------
// TEMPLATES
// ---------------------------------------------------------------------------
// Um template = palco fixo (slides_json) + slots dinamicos (slides[].fields).
//
// O palco e Fabric.js literal: fundo, logo, formas, textos fixos.
// Os slots sao os objetos que a IA preenche. Cada slot casa com o objeto do
// palco cujo `name` == content_key, e carrega as REGRAS de como aquele objeto
// se adapta ao conteudo (o texto da IA tem tamanho imprevisivel).
//
// Sem as regras o template seria estatico: uma frase mais longa que a do design
// vazaria do canvas. hydrateTemplate() aplica as regras na hora da geracao.

// Regras de um slot de TEXTO. Espelham o que o Bee Quote tinha hardcoded.
export interface TemplateTextRules {
  // ancora vertical do CENTRO do bloco de texto, em % da altura
  anchor_y_ratio: number;
  // largura da textbox em % da largura
  width_ratio: number;
  // o motor busca o MAIOR corpo entre max e min que caiba em max_lines
  max_font_size: number;
  min_font_size: number;
  font_size_step?: number;
  max_lines: number;
  // quebra balanceada (linhas de larguras parecidas) vs ganancioso simples
  balance: boolean;
  line_height: number;
  font_family: string;
  font_weight: string;
  fill: string;
  text_align: string;
  // texto exibido no editor e quando o slot vem vazio
  placeholder?: string;
}

export interface TemplateField {
  content_key: string;
  type: 'text' | 'image';
  display_name: string;
  // O QUE este campo deve conter — escrito pra IA, nao pra tela.
  // "A frase de impacto, no tom sistemico" / "Foto do avatar olhando pra camera".
  // E o briefing do slot: sem isso a IA sabe onde por, mas nao o que por.
  description?: string;
  max_chars?: number;
  // obrigatorio pra type: 'text' — sem isso o slot nao sabe se adaptar
  text_rules?: TemplateTextRules;
  // so pra type: 'image' — a imagem de exemplo que o slot mostra no desenho
  // (data URL). A IA troca por uma de verdade; aqui serve de referencia visual.
  sample_src?: string;
}

export interface TemplateSlide {
  name: string;
  fields: TemplateField[];
}

// Estrutura do template_config jsonb. Compatível com o esquema da doc §7-8.
export interface TemplateConfig {
  // dimensoes do canvas (cada slide do array slides_json deve respeitar)
  width: number;
  height: number;
  background?: string;
  // array de slides Fabric.js (pra imagem unica, 1 elemento)
  slides_json: object[];
  // metadata derivado: campos editaveis por slide
  slides?: Record<string, TemplateSlide>;
}

export interface PostTemplate {
  id: string;
  user_id?: string | null;
  // Chave estavel dos templates de sistema (ex: 'bee-quote-portrait').
  // Null nos templates criados pelo usuario.
  slug?: string | null;
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
  // Hive — sistema visual (máquina de estados + explicabilidade)
  editorial_locked?: boolean;
  text_approved?: boolean;
  image_status?: 'pending' | 'approved' | 'revision' | 'rejected';
  image_approved?: boolean;
  visual_decision?: Record<string, unknown>;   // decisão do motor (modo/variante/scores/reasons)
  caption?: string;
  status: PostStatus;
  // Nomenclatura unica: BEE-DDMMAA-G{global}-D{dia}-V{lote}
  codigo?: string | null;
  // Nota de viralizacao (0-100) estimada pela IA na geracao + razao curta
  virality_score?: number | null;
  virality_reason?: string | null;
  // Metricas de inteligencia da IA
  ai_edit_rounds?: number;   // correcoes que a IA precisou ate ser aprovado
  manual_edits?: number;     // edicoes manuais do humano depois (no editor)
  scheduled_date?: string | null;  // null limpa a data (volta pro stand-by)
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
  // Campanhas — a Peça (user_posts) ligada ao conteúdo-mãe/campanha/ciclo/conta.
  content_id?: string | null;
  campaign_id?: string | null;
  cycle_id?: string | null;
  account_id?: string | null;
  piece_role?: 'validation' | 'unfold' | null;
  alternative_group?: string | null;
  alternative_rank?: number | null;
  is_recommended?: boolean | null;
  schedule_priority?: number | null;
  suggested_start?: string | null;
  suggested_end?: string | null;
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
// Uma PESSOA da biblioteca de personas — ficha completa pra simular o público.
export interface BeePersona {
  id: string;
  user_id: string;
  nome: string;
  idade?: number | null;
  cargo?: string;
  empresa?: string;
  historia?: string;
  rotina?: string;
  personalidade?: string;
  memorias?: string[];
  valores?: string[];
  dor?: string;
  desejo?: string;
  objecoes?: string[];
  gatilhos?: string[];
  linguagem?: string;
  base_tipo?: string | null;
  base_ref?: string | null;
  is_active: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

// Público-alvo próprio de um editorial (perfil rico, aditivo ao avatar global).
export interface BeeAudience {
  quem?: string;
  dor?: string;
  desejo?: string;
  objecoes?: string[];
  gatilhos?: string[];
  linguagem?: string;
}

export interface BeeEditorial {
  id: string;
  slug: string;
  name: string;
  description?: string;
  objetivo?: string;
  tom?: string;
  fazer?: string[];
  evitar?: string[];
  temas?: string[];
  audience?: BeeAudience;
  frequency_hint?: string;
  structure_template?: string;
  emotional_sequence?: string[];
  // Cor (hex) usada nos cards da Agenda. Customizável na tela de Editoriais.
  color?: string | null;
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
  pending_approval: 'Pendente de aprovação',
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

// ----------------------------------------------------------------------------
// ALMA — a psique viva do sistema
// ----------------------------------------------------------------------------
export type AlmaLado = 'sistemico' | 'mecanico';
export type AlmaEstagio =
  | 'nascente' | 'em_formacao' | 'consolidada' | 'vacilante' | 'reprimida';

export interface AlmaEstado {
  id: boolean;
  humor: string | null;
  atualizado_em: string;
}
export interface AlmaObjetivo {
  id: string;
  texto: string;
  is_current: boolean;
  edited_by: string | null;
  created_at: string;
}
export interface AlmaDimensao {
  id: string;
  slug: string;
  nome: string;
  ordem: number;
  natureza: string | null;
  consciencia: string | null;
  formula_mecanica: string | null;
  frase_mecanica: string | null;
  sintomas: string | null;
  frase_sistemica: string | null;
  impactos: string | null;
  oitava: number;
  updated_at: string;
}
export interface AlmaCrenca {
  id: string;
  texto: string;
  dimensao_slug: string | null;
  direcao: AlmaLado;
  forca: number;
  estagio: AlmaEstagio;
  evidencias: number;
  origem: string | null;
  source_ref: string | null;
  last_reforcada_em: string;
  created_at: string;
}
export interface AlmaSombra {
  id: string;
  mecanismo: string;
  fala: string | null;
  nao_acolhe: string | null;
  dimensao_slug: string | null;
  ativa: boolean;
  created_at: string;
}
export interface AlmaPulsao {
  id: string;
  nome: string;
  nota: string | null;
  intensidade: number;
  vigiada: boolean;
  ordem: number;
  created_at: string;
}
export interface AlmaEvento {
  id: string;
  tipo: string;
  descricao: string | null;
  source: string | null;
  dimensao_slug: string | null;
  delta: number | null;
  payload: Record<string, unknown>;
  user_id: string | null;
  created_at: string;
}
export interface AlmaLexico {
  term: string;
  is_mantra: boolean;
}
export interface AlmaSnapshot {
  estado: AlmaEstado | null;
  objetivo: AlmaObjetivo | null;
  dimensoes: AlmaDimensao[];
  crencas: AlmaCrenca[];
  sombra: AlmaSombra[];
  pulsoes: AlmaPulsao[];
  eventos: AlmaEvento[];
  lexico: AlmaLexico[];
}

// ---------------------------------------------------------------------------
// GENESIS — a Constituicao Cognitiva (substitui o modelo da Alma)
// ---------------------------------------------------------------------------
export interface GenesisCore {
  id?: boolean;
  version: string;
  pergunta_fundadora: string | null;
  pergunta_silenciosa: string | null;
  produto_real: string | null;
  frase_organizadora: string | null;
  missao: string | null;
  persona_nome: string | null;
  persona_postura: string | null;
  voz_como_escreve: string | null;
  voz_verbos: string[] | null;
  voz_nunca: string[] | null;
  updated_at?: string;
}
export type GenesisCamada =
  | 'epistemologia' | 'constituicao_agente' | 'diagnostico' | 'linguagem' | 'paradigma';
export interface GenesisPrincipio {
  id: string;
  camada: GenesisCamada | string;
  codigo: string;
  titulo: string | null;
  principio: string;
  aplicacao: string | null;
  ordem: number;
  inviolavel: boolean;
  ativo: boolean;
}
export interface GenesisAvatar {
  id: string;
  slug: string;
  nome: string;
  ordem: number;
  eixo_percepcao: number;
  eixo_identificacao: number;
  pergunta_central: string | null;
  sofrimento: string | null;
  relacao_autoridade: string | null;
  linguagem: string | null;
  frase_silenciosa: string | null;
  o_que_teme: string | null;
  o_que_busca: string | null;
  frases_tipicas: string[] | null;
  como_conversar: string | null;
  erros_comuns: string | null;
  movimento_seguinte: string | null;
}
// Tensão: uma polaridade que o conteúdo navega (Bee: Ordem × Liberdade).
export interface GenesisTensao {
  id: string;
  slug: string;
  nome: string;
  arquetipo: string | null;
  logica: string | null;
  potencia: string | null;
  limite: string | null;
  sofrimento_tipico: string | null;
  ordem: number;
}
export interface GenesisFluxoPergunta {
  id: string;
  ordem: number;
  pergunta: string;
  nota: string | null;
}
// Lente: uma forma de enxergar o tema (Bee: as 6 Dimensões Sistêmicas).
export interface GenesisLente {
  id: string;
  slug: string;
  nome: string;
  ordem: number;
  natureza: string | null;
  consciencia: string | null;
  formula_mecanica: string | null;
  frase_mecanica: string | null;
  sintomas: string | null;
  frase_sistemica: string | null;
  impactos: string | null;
  oitava: number;
}
export interface GenesisSnapshot {
  core: GenesisCore | null;
  principios: GenesisPrincipio[];
  avatares: GenesisAvatar[];
  tensoes: GenesisTensao[];
  fluxo: GenesisFluxoPergunta[];
  lentes: GenesisLente[];
}

// ---------------------------------------------------------------------------
// DIRETRIZES DE CRIAÇÃO (bee_directives) — a camada de OFÍCIO/execução.
// Trabalha junto com o Genesis (filosofia). Diz "como escrever de fato",
// em 3 escopos: universal, por plataforma, por linha editorial.
// ---------------------------------------------------------------------------
export type DirectiveScope = 'universal' | 'platform' | 'editorial';
// O tipo governa como a diretriz age no prompt e como é renderizada na tela.
// 'criterio' também alimenta a autochecagem (QA) das variações geradas.
export type DirectiveTipo = 'regra' | 'evitar' | 'fortalecer' | 'fluxo' | 'criterio' | 'parametro';
export interface BeeDirective {
  id: string;
  scope: DirectiveScope;
  // null (universal) | 'linkedin'/'instagram' (platform) | editorial_slug (editorial)
  scope_ref: string | null;
  tipo: DirectiveTipo;
  inviolavel: boolean;
  titulo: string | null;
  instrucao: string;
  ordem: number;
  ativo: boolean;
  created_at?: string;
  updated_at?: string;
}

// Resultado da autochecagem (QA) de uma variação contra os critérios.
export interface QaCheckItem {
  titulo: string;
  criterio: string;
  passed: boolean;
  nota: string;
}
export interface QaResult {
  score: number;            // 0-100
  checks: QaCheckItem[];
  resumo: string;
}

// ---------------------------------------------------------------------------
// EFICACIA DA IA
// ---------------------------------------------------------------------------
// O ciclo: gerar (ai_generations + 5 ai_variations) -> voce corrige -> Aprovar
// (ai_reviews mede) -> a IA destila a licao (ai_learnings) -> entra no proximo
// prompt. Quando a eficacia se sustenta em 90%, a campanha destrava sozinha.

export interface AiGeneration {
  id: string;
  user_id: string;
  editorial_slug?: string | null;
  target_avatar?: string | null;
  platform?: string | null;
  briefing?: string | null;
  arsenal_item_id?: string | null;
  model?: string | null;
  variations_count: number;
  created_at: string;
}

// O texto ORIGINAL da IA. Imutavel: e o lado esquerdo de todo diff.
export interface AiVariation {
  id: string;
  generation_id: string;
  user_id: string;
  idx: number;
  quote: string;
  caption: string;
  headline_type?: string | null;
  analogy?: string | null;
  // Nota de viralizacao gravada junto do texto pristino.
  virality_score?: number | null;
  virality_reason?: string | null;
  post_id?: string | null;
  created_at: string;
}

// A medicao, gravada no Aprovar. 1 por post.
export interface AiReview {
  id: string;
  user_id: string;
  variation_id?: string | null;
  generation_id?: string | null;
  post_id: string;
  quote_original: string;
  quote_final: string;
  caption_original: string;
  caption_final: string;
  quote_changed: boolean;
  caption_changed: boolean;
  // a regua: mudou o quote OU a caption OU a imagem
  changed: boolean;
  // drift POR FACETA (a régua graduada roda em cada uma separada)
  quote_drift_pct?: number | null;   // faceta texto
  caption_drift_pct?: number | null; // faceta legenda
  // faceta imagem — binária. has_image = havia imagem de IA pra medir.
  has_image: boolean;
  image_changed: boolean;
  // drift combinado (max) — informativo, compat
  drift_pct?: number | null;
  created_at: string;
}

export interface AiLearning {
  id: string;
  user_id: string;
  texto: string;
  categoria: string;
  // faceta que esta lição afeta: texto / legenda / imagem
  facet: AiFacet;
  // quantas correcoes distintas reforcaram esta mesma licao
  evidencias: number;
  ativo: boolean;
  exemplo_antes?: string | null;
  exemplo_depois?: string | null;
  origem_review_id?: string | null;
  last_reforcada_em: string;
  created_at: string;
}

// Retorno de ai_gate_status() — a MESMA regra que o cron enxerga.
// Severidade de uma correção — a régua graduada (item 2).
//   intacto:  a IA acertou (peso 1.0)
//   ajuste:   cosmético, drift <= ajuste_max_drift (peso 0.6)
//   reescrita: a IA errou o conteúdo (peso 0.0)
export type AiSeveridade = 'intacto' | 'ajuste' | 'reescrita';

// A eficácia de UMA faceta num segmento. acuracia/passa = null quando a faceta
// não tem dados (imagem antes de os templates gerarem imagem).
export interface AiFacetStat {
  amostra: number;
  acuracia: number | null;
  passa: boolean | null;
}

export type AiFacet = 'texto' | 'legenda' | 'imagem';

// Um SEGMENTO = (editoria × plataforma × alvo). O portão libera por segmento.
export interface AiSegment {
  editorial_slug: string;
  platform: string;
  target_avatar: string;
  amostra: number;
  texto: AiFacetStat;
  legenda: AiFacetStat;
  imagem: AiFacetStat;
  destravada: boolean;
  em_risco: boolean;
}

// Resumo global — a campanha deixou de ser toda-ou-nada. `destravada` = existe
// pelo menos 1 segmento liberado. `segmentos` traz o detalhe por conjunto.
// Mensagem do chat com o agente de voz. `proposals` guarda o que o agente
// propôs (pra UI renderizar Salvar/Descartar mesmo após recarregar).
export interface AiChatProposal {
  texto: string;
  categoria: string;
  facet: AiFacet;
  scope: { editorial_slug: string | null; platform: string | null; target_avatar: string | null };
  saved?: boolean;
}

export interface AiChatMessage {
  id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  proposals: AiChatProposal[];
  created_at: string;
}

export interface AiGate {
  meta: number;
  min_amostra: number;
  relock_band: number;
  ajuste_max_drift: number;
  total_segmentos: number;
  destravados: number;
  em_risco: boolean;
  destravada: boolean;
  amostra_total: number;
  segmentos: AiSegment[];
}

export * from './campaign';
