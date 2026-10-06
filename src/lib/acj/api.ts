// Dados da ACJ (REST do Supabase via `db`; RLS garante o dono; invariantes no banco).
import { db, getCurrentUserId } from '@/lib/db';
import type {
  AcjCampaignPlan, AcjContentContract, AcjContractFields, AcjCyclePlan, AcjLearningDecision, AcjLearningEntry,
  AcjLearningEvidence, AcjPieceResult, AcjPlanDraft, AcjSignalReading, AcjValidation, PostComment,
} from '@/types';

function uid(): string {
  const id = getCurrentUserId();
  if (!id) throw new Error('Nao autenticado');
  return id;
}
const inList = (ids: string[]) => `in.(${ids.join(',')})`;

export const acjPlanApi = {
  async listByCampaign(campaignId: string): Promise<AcjCampaignPlan[]> {
    return db.select<AcjCampaignPlan>('acj_campaign_plans', { campaign_id: `eq.${campaignId}`, order: 'version.desc' });
  },
  // Plano vigente: o aprovado/ativo; senão a recomendação mais recente.
  async current(campaignId: string): Promise<AcjCampaignPlan | null> {
    const all = await this.listByCampaign(campaignId);
    return all.find((p) => p.status === 'approved' || p.status === 'active') ?? all.find((p) => p.status !== 'archived') ?? null;
  },
  async listAll(): Promise<AcjCampaignPlan[]> {
    return db.select<AcjCampaignPlan>('acj_campaign_plans', { order: 'version.desc' });
  },
  async create(campaignId: string, draft: AcjPlanDraft, opts: { approve?: boolean; instruction?: string } = {}): Promise<AcjCampaignPlan> {
    const userId = uid();
    const now = new Date().toISOString();
    const rows = await db.insert<AcjCampaignPlan>('acj_campaign_plans', {
      user_id: userId, campaign_id: campaignId, ...draft, instruction: opts.instruction ?? null,
      status: opts.approve ? 'approved' : 'recommended', ...(opts.approve ? { approved_by: userId, approved_at: now } : {}),
    });
    if (!rows[0]) throw new Error('Falha ao salvar o plano ACJ');
    return rows[0];
  },
  // Aprovação humana SEPARADA da estratégia (decisão do produtor).
  async approve(plan: AcjCampaignPlan): Promise<AcjCampaignPlan> {
    const rows = await db.update<AcjCampaignPlan>('acj_campaign_plans', { id: `eq.${plan.id}` }, {
      status: 'approved', approved_by: uid(), approved_at: new Date().toISOString(),
    });
    if (!rows[0]) throw new Error('Plano ACJ não encontrado');
    return rows[0];
  },
};

export const acjCycleApi = {
  async current(cycleId: string): Promise<AcjCyclePlan | null> {
    return (await db.select<AcjCyclePlan>('acj_cycle_plans', { cycle_id: `eq.${cycleId}`, status: 'neq.archived', order: 'version.desc', limit: '1' }))[0] ?? null;
  },
  async listActive(): Promise<AcjCyclePlan[]> {
    return db.select<AcjCyclePlan>('acj_cycle_plans', { status: 'eq.active' });
  },
  async create(row: Omit<AcjCyclePlan, 'id' | 'user_id' | 'version' | 'created_at' | 'status'>): Promise<AcjCyclePlan> {
    const rows = await db.insert<AcjCyclePlan>('acj_cycle_plans', { ...row, user_id: uid(), status: 'active' });
    if (!rows[0]) throw new Error('Falha ao salvar o plano ACJ do ciclo');
    return rows[0];
  },
};

export const acjContractApi = {
  async listByContents(contentIds: string[]): Promise<AcjContentContract[]> {
    if (contentIds.length === 0) return [];
    return db.select<AcjContentContract>('acj_content_contracts', { content_id: inList(contentIds), status: 'neq.superseded' });
  },
  async create(contentId: string, fields: AcjContractFields, extra: { campaign_plan_id?: string | null; cycle_plan_id?: string | null; validation?: AcjValidation | null }): Promise<AcjContentContract> {
    const { human_decision_required: _h, ...rest } = fields;
    const rows = await db.insert<AcjContentContract>('acj_content_contracts', {
      user_id: uid(), content_id: contentId, ...rest, status: 'active',
      campaign_plan_id: extra.campaign_plan_id ?? null, cycle_plan_id: extra.cycle_plan_id ?? null, validation: extra.validation ?? null,
    });
    if (!rows[0]) throw new Error('Falha ao salvar o contrato ACJ');
    return rows[0];
  },
  async update(id: string, patch: Partial<Pick<AcjContentContract, 'validation' | 'marcos_feedback' | 'status'>>): Promise<AcjContentContract> {
    const rows = await db.update<AcjContentContract>('acj_content_contracts', { id: `eq.${id}` }, patch);
    if (!rows[0]) throw new Error('Contrato ACJ não encontrado');
    return rows[0];
  },
};

export const acjResultsApi = {
  async byCampaign(campaignId: string): Promise<AcjPieceResult[]> {
    return db.select<AcjPieceResult>('acj_piece_results', { campaign_id: `eq.${campaignId}`, order: 'published_at.desc.nullslast' });
  },
  async comments(postId: string): Promise<PostComment[]> {
    return db.select<PostComment>('post_comments', { post_id: `eq.${postId}`, order: 'commented_at.asc' });
  },
  async readings(postIds: string[]): Promise<AcjSignalReading[]> {
    if (postIds.length === 0) return [];
    return db.select<AcjSignalReading>('acj_signal_readings', { post_id: inList(postIds), order: 'created_at.desc' });
  },
  async saveReading(r: Omit<AcjSignalReading, 'id' | 'user_id' | 'created_at'>): Promise<AcjSignalReading> {
    const rows = await db.insert<AcjSignalReading>('acj_signal_readings', { ...r, user_id: uid() });
    if (!rows[0]) throw new Error('Falha ao salvar a leitura');
    return rows[0];
  },
};

export const acjLearningApi = {
  async list(): Promise<AcjLearningEntry[]> {
    return db.select<AcjLearningEntry>('acj_learning_entries', { order: 'created_at.desc' });
  },
  async create(e: Partial<AcjLearningEntry> & Pick<AcjLearningEntry, 'title' | 'observed_fact'>): Promise<AcjLearningEntry> {
    const rows = await db.insert<AcjLearningEntry>('acj_learning_entries', { ...e, user_id: uid(), code: '' });
    if (!rows[0]) throw new Error('Falha ao abrir o registro');
    return rows[0];
  },
  async update(id: string, patch: Partial<AcjLearningEntry>): Promise<AcjLearningEntry> {
    const rows = await db.update<AcjLearningEntry>('acj_learning_entries', { id: `eq.${id}` }, patch);
    if (!rows[0]) throw new Error('Registro não encontrado');
    return rows[0];
  },
  async evidence(entryId: string): Promise<AcjLearningEvidence[]> {
    return db.select<AcjLearningEvidence>('acj_learning_evidence', { entry_id: `eq.${entryId}`, order: 'created_at.asc' });
  },
  async addEvidence(e: Omit<AcjLearningEvidence, 'id' | 'user_id' | 'created_at'>): Promise<AcjLearningEvidence> {
    const rows = await db.insert<AcjLearningEvidence>('acj_learning_evidence', { ...e, user_id: uid() });
    if (!rows[0]) throw new Error('Falha ao registrar a evidência');
    return rows[0];
  },
  async decisions(entryId: string): Promise<AcjLearningDecision[]> {
    return db.select<AcjLearningDecision>('acj_learning_decisions', { entry_id: `eq.${entryId}`, order: 'created_at.asc' });
  },
};
