// Tipos da Biblioteca ACJ (Arquiteturas de Conexão e Jornada) — docs/acj.
// ACJ-00 é governança: não existe como valor atribuível.
export type AcjId = 'ACJ-01' | 'ACJ-02' | 'ACJ-03' | 'ACJ-04' | 'ACJ-05';
export const ACJ_IDS: AcjId[] = ['ACJ-01', 'ACJ-02', 'ACJ-03', 'ACJ-04', 'ACJ-05'];
export type AcjMix = Record<AcjId, number>;
export type AcjConfidence = 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
export type AcjPlanStatus = 'draft' | 'recommended' | 'approved' | 'active' | 'recalibration_needed' | 'completed' | 'archived';

export interface AcjPhase {
  phase: number; label: string; entry_state: string; priority_movement: string;
  acj_primary: AcjId[]; bridges: string; exit_state: string; mix: AcjMix;
}
export interface AcjSequenceHypothesis { id: string; hypothesis: string; condition: string; sequence: string; confidence: AcjConfidence; observe: string }

// Saída do acj-orchestrator (campaign_plan) — ainda não persistida.
export interface AcjPlanDraft {
  audience_state: string; desired_state: string; journey_needs: string[]; target_mix: AcjMix; phases: AcjPhase[];
  sequence_hypotheses: AcjSequenceHypothesis[];
  success_signals: { audience: string[]; journey: string[]; business: string[] };
  recalibration_rules: string[]; exclusions: string[];
  summary: { journey: string; why: string; risk: string; learn: string; mix_roles?: Partial<Record<AcjId, string>> };
  confidence: AcjConfidence; human_decisions_required: string[];
  adoption: 'native' | 'late'; adoption_note: string | null; source_acj_version: string;
}

export interface AcjCampaignPlan extends AcjPlanDraft {
  id: string; user_id: string; campaign_id: string; version: number; status: AcjPlanStatus;
  instruction?: string | null; approved_by?: string | null; approved_at?: string | null; created_at: string; updated_at: string;
}

export interface AcjCyclePlan {
  id: string; user_id: string; cycle_id: string; campaign_plan_id: string; campaign_plan_version: number; version: number;
  cycle_mix: AcjMix; counts: Partial<Record<AcjId, number>>; realized: Partial<Record<AcjId, number>>;
  gaps: string[]; saturation_flags: string[];
  priorities: Array<{ acj: AcjId; count: number; need: string }>;
  circulation_rules: Record<string, unknown>; rationale: string | null; plan_status_at_creation: string | null;
  status: AcjPlanStatus; created_at: string;
}

export interface AcjValidation {
  realized: 'yes' | 'partial' | 'no'; score: number; issues: string[]; main_risk: string;
  boundary_conflict: AcjId | null; suggestion: string; checked_at: string;
}

export interface AcjContractFields {
  acj_primary: AcjId; acj_secondary: AcjId | null; attribution_confidence: AcjConfidence; rationale: string;
  alternative_considered: string | null; alternative_reason: string | null;
  audience_state_from: string; journey_need: string; movement_to: string; connection_mechanism: string;
  authorial_gesture: string; expected_experience: string; expected_response: string[]; failure_modes: string[];
  expression_context: { tone?: string; formats?: string; visual?: string; cta?: string };
  not_to_do: string; source_acj_version: string; assigned_late: boolean; human_decision_required?: boolean;
}

export interface AcjContentContract extends AcjContractFields {
  id: string; user_id: string; content_id: string; version: number; status: 'draft' | 'validated' | 'active' | 'superseded';
  campaign_plan_id: string | null; cycle_plan_id: string | null;
  validation: AcjValidation | null; marcos_feedback: { realized: 'yes' | 'partial' | 'no'; note?: string; at: string } | null;
  created_at: string; updated_at: string;
}

export interface AcjSnapshot {
  contract_id: string; contract_version: number; acj_primary: AcjId; acj_secondary: AcjId | null;
  audience_state_from: string; movement_to: string; connection_mechanism: string; expected_response: string[];
  source_acj_version: string; taken_at: string;
}

export interface PostComment {
  id: string; user_id: string; post_id: string; account_id: string | null; platform: 'instagram' | 'linkedin';
  external_id: string; parent_external_id: string | null; text: string | null; author_username: string | null;
  is_own: boolean; like_count: number | null; commented_at: string | null; created_at: string;
}

export interface AcjSignalReading {
  id: string; user_id: string; post_id: string; acj_primary: AcjId | null; comment_count: number;
  movement_evidence: 'strong' | 'partial' | 'absent' | 'insufficient' | null; probable_causes: string[];
  signals: Array<{ type: string; excerpt: string; reads_as: string }>; summary: string | null; limitations: string | null;
  model: string | null; created_at: string;
}

export interface AcjPieceResult {
  post_id: string; user_id: string; campaign_id: string | null; cycle_id: string | null; content_id: string | null;
  platform: string; account_id: string | null; status: string; published_at: string | null;
  acj_primary: AcjId | null; acj_secondary: AcjId | null; acj_status: string | null; acj_frozen_at: string | null; acj_snapshot: AcjSnapshot | null;
  reach: number | null; likes: number | null; comments: number | null; saves: number | null; shares: number | null;
  engagement_rate: number | null; captured_at: string | null; audience_comments: number;
}

export type AcjLearningStatus = 'open' | 'hypothesis' | 'testing' | 'provisional' | 'validated' | 'consolidated' | 'rejected' | 'inconclusive' | 'suspended';
export type AcjChangeClass = 'no_change' | 'execution_adjustment' | 'architecture_adjustment' | 'new_variant' | 'possible_new_architecture';
export type AcjCause = 'attribution' | 'content' | 'execution' | 'distribution' | 'context';

export interface AcjLearningEntry {
  id: string; user_id: string; code: string; title: string; acj_ids: AcjId[];
  object_type: 'campaign' | 'cycle' | 'content' | 'piece' | 'agenda' | 'audience' | 'result' | null;
  campaign_id: string | null; cycle_id: string | null; content_id: string | null; post_id: string | null;
  observed_fact: string; context: string | null; sources: string[]; candidate_pattern: string | null; hypothesis: string | null;
  alternatives: string | null; test_design: { variable?: string; control?: string; signals?: string; window?: string };
  probable_causes: AcjCause[]; status: AcjLearningStatus; confidence: AcjConfidence; change_class: AcjChangeClass | null;
  next_action: string | null; affected_document: string | null; promotion_status: 'not_promoted' | 'proposed' | 'promoted';
  reopen_reason: string | null; origin: 'manual' | 'hive_suggestion'; approved_by: string | null; approved_at: string | null;
  created_at: string; updated_at: string;
}

export interface AcjLearningEvidence {
  id: string; user_id: string; entry_id: string; source: 'marcos' | 'audience' | 'journey' | 'system';
  post_id: string | null; content_id: string | null; description: string; data: Record<string, unknown>; limitations: string | null; created_at: string;
}

export interface AcjLearningDecision {
  id: string; entry_id: string; from_status: string | null; to_status: string; change_class: string | null;
  confidence: string | null; note: string | null; decided_by: string | null; created_at: string;
}
