// Identidade e contextos (Fase 1): marca → emissor → frente → público → perfil de comunicação.
export interface Brand { id: string; workspace_id: string; name: string; slug: string; essence: string | null; status: string; is_default: boolean }
export interface Emitter { id: string; brand_id: string; kind: 'person' | 'institutional'; name: string; voice: string | null; authority: string | null; first_person: boolean; speaking_rules: string | null; photo_profile: string | null; facts_status: 'confirmed' | 'to_confirm'; status: string }
export interface BusinessFront { id: string; brand_id: string; name: string; slug: string; description: string | null; territories: string[]; offer_ids: string[]; status: string }
export interface Audience { id: string; brand_id: string; front_id: string | null; name: string; definition: string | null; situations: string[]; needs: string[]; language_notes: string | null; roles: Record<string, string>; status: 'hypothesis' | 'draft' | 'active' | 'archived'; notes: string | null }
export interface CommunicationProfile {
  id: string; brand_id: string; emitter_id: string; front_id: string; primary_audience_id: string | null; secondary_audience_ids: string[];
  name: string; positioning: string | null; expression: string | null; cta_policy: 'by_intent' | 'never' | 'soft'; offer_ids: string[];
  status: 'draft' | 'active' | 'archived'; version: number; is_default: boolean; needs_recalibration: string | null;
}
export interface ContextSnapshot { id: string; profile_id: string | null; profile_version: number | null; summary: string; fallback: boolean; interlocutor_state: string | null; created_at: string }
export type ReferenceStatus = 'not_reviewed' | 'current_voice' | 'historical' | 'excluded';

// ---------------- Fase 3 · Minha identidade (sessões de setup/revisão/recalibração) ----------------
export type SetupMode = 'setup' | 'review' | 'add_front' | 'recalibrate';
export type SetupTarget = 'publico' | 'frente' | 'posicionamento' | 'oferta' | 'voz_visual' | 'identidade';
export type SetupStep = 'overview' | 'targets' | 'conversation' | 'materials' | 'understanding' | 'profiles' | 'editorials' | 'calibration' | 'activate' | 'done';
export type SetupBlock = 'brand' | 'emitters' | 'fronts' | 'audiences' | 'profiles' | 'editorials';
export type Origin = 'declared' | 'evidence' | 'hypothesis' | 'legacy';
export interface SetupQuestion { id: string; text: string; why: string; blocks?: string[] }
export interface SetupAnswer { question_id: string; question: string; answer: string; at: string; classification: 'declared' }
export interface SetupSource { id: string; kind: 'link' | 'text'; title: string; url?: string; content?: string; role: 'current_reference' | 'historical'; at: string }
export interface ProposalItem { ref: string; action: 'keep' | 'update' | 'create' | 'archive'; origin: Origin; why?: string; changes?: string[]; [field: string]: unknown }
export interface BlockProposal {
  status: 'proposed' | 'accepted' | 'skipped'; items?: ProposalItem[]; essence?: string; origin?: Origin;
  genesis_notes?: Array<{ text: string; origin: Origin }>; summary?: string; hypotheses?: string[]; adjust_request?: string; generated_at?: string;
}
export interface Calibration {
  id: string; profile_ref: string; profile_name: string; editorial_slug: string; theme: string; sample: { quote: string; caption: string }; at: string;
  feedback?: { pensamento?: string; linguagem?: string; publico?: string; lugar_de_fala?: string; note?: string; lesson?: string; learn?: boolean };
}
export interface SetupSession {
  id: string; user_id: string; brand_id: string; mode: SetupMode; title: string | null; target_profile_ids: string[]; targets: SetupTarget[];
  base_versions: Record<string, number>; answers: SetupAnswer[]; sources: SetupSource[]; proposals: Partial<Record<SetupBlock, BlockProposal>>;
  reviews: Array<{ block: SetupBlock; action: string; at: string; note?: string }>; calibrations: Calibration[];
  step: SetupStep; status: 'in_progress' | 'ready_for_review' | 'calibrating' | 'done' | 'archived';
  result: { versions: Array<{ profile_id: string; name: string; from: number; to: number; created: boolean }>; forks: unknown[]; editorials: Array<{ action: string; name: string; slug?: string }>; learnings: number; adoption: string; pinned_campaigns: number } | null;
  activated_at: string | null; created_at: string; updated_at: string;
}
export interface ProfileVersion { id: string; profile_id: string; version: number; status: 'draft' | 'reviewed' | 'active' | 'superseded'; reason: string | null; activated_at: string | null; created_at: string; data: Record<string, unknown> }
