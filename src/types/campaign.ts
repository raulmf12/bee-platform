// Tipos da estrutura de Campanhas (docs/PLANO-CAMPANHAS.md §3).
// Hierarquia: Campanha → Ciclo → Ideia → Conteúdo-mãe → Peças (user_posts).

// As 5 funções estratégicas do mix (o PORQUÊ de um conteúdo). O COMO
// (provocação, reflexão, case…) continua sendo o editorial (bee_editorials).
export type StrategicFunction = 'presenca' | 'posicionamento' | 'autoridade' | 'relacionamento' | 'produtos';

export const STRATEGIC_FUNCTIONS: StrategicFunction[] = [
  'presenca', 'posicionamento', 'autoridade', 'relacionamento', 'produtos',
];

export const FUNCTION_LABELS: Record<StrategicFunction, string> = {
  presenca: 'Ampliar presença',
  posicionamento: 'Fortalecer posicionamento',
  autoridade: 'Construir autoridade',
  relacionamento: 'Gerar relacionamento',
  produtos: 'Aproximar produtos',
};

// Rótulo curto (cards, chips).
export const FUNCTION_SHORT: Record<StrategicFunction, string> = {
  presenca: 'Presença',
  posicionamento: 'Posicionamento',
  autoridade: 'Autoridade',
  relacionamento: 'Relacionamento',
  produtos: 'Produtos',
};

export const FUNCTION_HINTS: Record<StrategicFunction, string> = {
  presenca: 'Chegar a novas pessoas e aumentar a descoberta.',
  posicionamento: 'Tornar mais claro pelo que você quer ser reconhecido.',
  autoridade: 'Demonstrar repertório, experiência e profundidade.',
  relacionamento: 'Estimular identificação, conversa e proximidade.',
  produtos: 'Conectar naturalmente sua presença ao que você oferece.',
};

// Cor por função (chips/pontos). Tons que funcionam em claro e escuro.
export const FUNCTION_COLORS: Record<StrategicFunction, string> = {
  presenca: '#F59E0B',
  posicionamento: '#8B5CF6',
  autoridade: '#10B981',
  relacionamento: '#3B82F6',
  produtos: '#EC4899',
};

export type StrategyMix = Record<StrategicFunction, number>;

export type IntensityLevel = 'muito_baixo' | 'baixo' | 'medio' | 'alto';

export const INTENSITY_LABELS: Record<IntensityLevel, string> = {
  muito_baixo: 'Muito baixo',
  baixo: 'Baixo',
  medio: 'Médio',
  alto: 'Alto',
};

export interface StrategyBlock {
  weeks: string;                                   // ex: '1-2'
  levels: Record<StrategicFunction, IntensityLevel>;
}

export interface CampaignStrategy {
  mix: StrategyMix;                                // soma 100
  rationale: string;
  matrix: StrategyBlock[];
  recommended_weeks?: number;
  duration_rationale?: string;
}

export interface CampaignMoment {
  label: string;                                   // ex: 'Expansão de presença'
  summary: string;
  signals?: string[];
  confirmed?: boolean;
  adjust_note?: string | null;
}

export type CampaignType = 'organica' | 'vendas';
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'ended';

export const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  organica: 'Campanha Orgânica',
  vendas: 'Campanha de Vendas / Lançamento',
};

export interface Campaign {
  id: string;
  user_id: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  intent?: string | null;
  moment?: CampaignMoment | null;
  strategy?: CampaignStrategy | null;
  duration_weeks?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  product_id?: string | null;
  color?: string | null;
  account_ids: string[];
  cadence: Record<string, number>;                 // account_id → peças por semana
  activated_at?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type CycleStatus =
  | 'not_started' | 'planned' | 'pauta_ready' | 'pauta_approved'
  | 'developing' | 'producing' | 'ready' | 'done';

export interface CyclePlanNeed { function: StrategicFunction; count: number }
export interface CyclePlanChannel { account_id: string; platform: 'linkedin' | 'instagram'; label: string; contents: number }
export interface CyclePlanSlot { account_id: string; platform: 'linkedin' | 'instagram' }
export interface CyclePlanDay { date: string; slots: CyclePlanSlot[] }

export interface CyclePlan {
  needs: CyclePlanNeed[];
  channels: CyclePlanChannel[];
  calendar: CyclePlanDay[];
  totals: { contents: number; pieces: number };
  summary?: string;
}

export interface CampaignCycle {
  id: string;
  campaign_id: string;
  user_id: string;
  idx: number;
  start_date: string;
  end_date: string;
  status: CycleStatus;
  plan?: CyclePlan | null;
  review_due?: string | null;
  created_at: string;
  updated_at: string;
}

export interface IdeaChannel { account_id?: string; platform: 'linkedin' | 'instagram' }

export type IdeaStatus = 'backlog' | 'proposed' | 'approved' | 'discarded' | 'developed';

export interface Idea {
  id: string;
  user_id: string;
  campaign_id?: string | null;
  cycle_id?: string | null;
  title: string;
  summary?: string | null;
  strategic_function?: StrategicFunction | null;
  editorial_slug?: string | null;
  channels: IdeaChannel[];
  suggested_pieces: number;
  origin: 'hive' | 'user' | 'result';
  status: IdeaStatus;
  position: number;
  rationale?: string | null;
  // ACJ: movimento relacional escolhido ANTES da ideia (pauta) — primária + secundária opcional.
  acj_primary?: import('./acj').AcjId | null;
  acj_secondary?: import('./acj').AcjId | null;
  acj_role?: string | null;
  acj_rationale?: string | null;
  acj_confidence?: string | null;
  created_at: string;
  updated_at: string;
}

export type ContentStatus = 'developing' | 'pending_validation' | 'validated' | 'discarded';

export interface ContentBody { frase?: string; texto?: string }

export interface ContentConsidered { base?: string; coerencia?: string; formato?: string }

export interface ContentVersion { at: string; body: ContentBody; note?: string }

// Ciclo de aprendizado: a variação PRISTINA da IA (última versão gerada) é o
// baseline; a validação mede quanto o humano editou (ai_reviews).
export interface ContentMetadata {
  generation_id?: string;
  variation_id?: string;
  ai_rounds?: number;        // quantas vezes a Hive refez (ajuste/nova versão)
  manual_edits?: number;     // edições diretas do humano
  qa_score?: number | null;
  virality_score?: number | null;
  virality_reason?: string | null;
  headline_type?: string | null;
  analogy?: string | null;
  validation_post_id?: string;
  [k: string]: unknown;
}

export interface Content {
  id: string;
  user_id: string;
  idea_id?: string | null;
  campaign_id?: string | null;
  cycle_id?: string | null;
  title: string;
  strategic_function?: StrategicFunction | null;
  editorial_slug?: string | null;
  validation_format: string;
  body: ContentBody;
  considered?: ContentConsidered | null;
  status: ContentStatus;
  versions: ContentVersion[];
  position: number;
  metadata: ContentMetadata;
  created_at: string;
  updated_at: string;
}

export type SocialPlatform = 'linkedin' | 'instagram';

export interface SocialAccount {
  id: string;
  user_id: string;
  platform: SocialPlatform;
  label: string;
  handle?: string | null;
  is_default: boolean;
  status: 'connected' | 'disconnected' | 'expired';
  linkedin_token?: string | null;
  linkedin_author_urn?: string | null;
  instagram_access_token?: string | null;
  instagram_business_account_id?: string | null;
  instagram_token_expires_at?: string | null;
  scopes?: string[] | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PostMetrics {
  id: string;
  user_id: string;
  post_id: string;
  account_id?: string | null;
  source: 'instagram_api' | 'manual';
  captured_at: string;
  reach?: number | null;
  impressions?: number | null;
  likes?: number | null;
  comments?: number | null;
  saves?: number | null;
  shares?: number | null;
  engagement_rate?: number | null;
  raw?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}
