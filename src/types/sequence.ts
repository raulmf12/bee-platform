// Conteúdos sequenciais (Fase 4 · etapa A): plano de peças, páginas com ID estável e capacidades.
export type PieceFormat = 'image' | 'carousel' | 'story' | 'reel';
export interface PiecePlan {
  id: string; user_id: string; content_id: string; campaign_id: string | null; cycle_id: string | null; account_id: string | null;
  platform: 'linkedin' | 'instagram'; format: PieceFormat; approach: string | null; purpose: string | null; architecture: string | null;
  origin: 'default' | 'hive' | 'user'; status: 'planned' | 'produced' | 'removed'; post_id: string | null; position: number; created_at: string;
}
export type UnitLayout = 'cover' | 'text' | 'closing';
export interface PostUnit {
  id: string; user_id: string; post_id: string; position: number; function: string | null; title: string | null; body: string | null;
  visual_direction: string | null; layout: UnitLayout; media_type: 'static_image' | 'photo' | 'video';
  assets: { image_ref?: string | null; variant?: string | null; decision?: Record<string, unknown> | null; asset?: Record<string, unknown> | null };
  fabric_json: unknown | null; rendered_url: string | null; text_version: number; rendered_text_version: number | null;
  visual_status: 'pending' | 'rendering' | 'ready' | 'failed' | 'stale'; review_status: 'pending' | 'approved' | 'needs_review'; error: string | null;
  duration_ms?: number | null; narration?: string | null; alt_text?: string | null;
}
export interface FormatCapability {
  platform: string; format: PieceFormat; min_units: number; max_units: number; recommended_units: string | null; width: number; height: number;
  export_kind: 'image' | 'images' | 'pdf' | 'video'; auto_publish: boolean; notes: string | null; version: number; verified_at: string;
}
export interface SequenceExport { version: number; kind: 'images' | 'pdf'; files: string[]; zip_url?: string; pdf_url?: string; exported_at: string }
