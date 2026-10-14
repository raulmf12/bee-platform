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
