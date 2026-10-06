// Pauta do ciclo (Tela 09): gerar, nova seleção, trocar uma ideia, aprovar.
// A edge `cycle-pauta` pensa; o cliente persiste (mesmo padrão do app).
import { edge } from '@/lib/edge';
import { cycleApi, ideaApi } from '@/lib/campaignApi';
import { acjCycleApi } from '@/lib/acj/api';
import { countsToMix, type AcjCycleDraft } from '@/lib/acj/cyclePlan';
import type { AcjCampaignPlan, CampaignCycle, CyclePlan, Idea } from '@/types';

// Confirma o planejamento. Com plano ACJ na campanha, grava também o Plano ACJ do
// ciclo (versão nova; a anterior é arquivada pelo banco) — a pauta lê dele.
export async function confirmPlan(cycle: CampaignCycle, plan: CyclePlan, acj?: { campaignPlan: AcjCampaignPlan; draft: AcjCycleDraft } | null): Promise<CampaignCycle> {
  if (acj) {
    const { campaignPlan, draft } = acj;
    await acjCycleApi.create({
      cycle_id: cycle.id, campaign_plan_id: campaignPlan.id, campaign_plan_version: campaignPlan.version,
      cycle_mix: countsToMix(draft.counts, campaignPlan.target_mix), counts: draft.counts, realized: draft.realized,
      gaps: draft.gaps, saturation_flags: draft.saturation_flags, priorities: draft.priorities,
      circulation_rules: { phase: draft.phase?.phase ?? null, bridges: draft.phase?.bridges ?? null },
      rationale: draft.rationale, plan_status_at_creation: campaignPlan.status,
    });
  }
  return cycleApi.update(cycle.id, { plan, status: 'planned' });
}

// Gera a pauta inteira (full) ou uma nova seleção (refresh — descarta as propostas atuais).
export async function generatePauta(cycle: CampaignCycle, mode: 'full' | 'refresh', current: Idea[] = []): Promise<{ cycle: CampaignCycle; ideas: Idea[] }> {
  const r = await edge.cyclePauta({ cycle_id: cycle.id, mode });
  // Nova seleção substitui só as propostas DA HIVE; as ideias da pessoa ficam.
  const replaced = mode === 'refresh' ? current.filter((i) => i.status === 'proposed' && i.origin === 'hive') : [];
  if (replaced.length) await ideaApi.updateMany(replaced.map((i) => i.id), { status: 'discarded' });
  const kept = current.filter((i) => i.status !== 'discarded' && !replaced.includes(i));
  const ideas = await ideaApi.createMany(r.ideas.map((i, idx) => ({
    campaign_id: cycle.campaign_id,
    cycle_id: cycle.id,
    title: i.title,
    summary: i.summary,
    strategic_function: i.strategic_function,
    editorial_slug: i.editorial_slug,
    channels: i.channels,
    suggested_pieces: i.suggested_pieces,
    rationale: i.rationale,
    acj_primary: i.acj_primary ?? null,
    acj_secondary: i.acj_secondary ?? null,
    acj_role: i.acj_role || null,
    acj_rationale: i.acj_rationale || null,
    origin: 'hive' as const,
    status: 'proposed' as const,
    position: kept.length + idx,
  })));
  const updated = await cycleApi.update(cycle.id, { status: 'pauta_ready' });
  return { cycle: updated, ideas: [...kept, ...ideas] };
}

// Troca UMA ideia mantendo função, canais e posição.
export async function swapIdea(cycle: CampaignCycle, idea: Idea): Promise<Idea> {
  const r = await edge.cyclePauta({ cycle_id: cycle.id, mode: 'swap', idea_id: idea.id });
  const n = r.ideas[0];
  if (!n) throw new Error('A Hive não trouxe uma alternativa.');
  return ideaApi.update(idea.id, {
    title: n.title, summary: n.summary, editorial_slug: n.editorial_slug, rationale: n.rationale, origin: 'hive',
    // Troca mantém o movimento (ACJ) da ideia original, como mantém a função.
    acj_primary: idea.acj_primary ?? n.acj_primary ?? null, acj_role: n.acj_role || idea.acj_role || null, acj_rationale: n.acj_rationale || null,
  });
}

export async function approvePauta(cycle: CampaignCycle, ideas: Idea[]): Promise<CampaignCycle> {
  const live = ideas.filter((i) => i.status !== 'discarded');
  if (live.length === 0) throw new Error('A pauta está vazia.');
  await ideaApi.updateMany(live.map((i) => i.id), { status: 'approved' });
  return cycleApi.update(cycle.id, { status: 'pauta_approved' });
}
