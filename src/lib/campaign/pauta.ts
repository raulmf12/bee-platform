// Pauta do ciclo (Tela 09): gerar, nova seleção, trocar uma ideia, aprovar.
// A edge `cycle-pauta` pensa; o cliente persiste (mesmo padrão do app).
import { edge } from '@/lib/edge';
import { cycleApi, ideaApi } from '@/lib/campaignApi';
import type { CampaignCycle, CyclePlan, Idea } from '@/types';

export async function confirmPlan(cycle: CampaignCycle, plan: CyclePlan): Promise<CampaignCycle> {
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
  });
}

export async function approvePauta(cycle: CampaignCycle, ideas: Idea[]): Promise<CampaignCycle> {
  const live = ideas.filter((i) => i.status !== 'discarded');
  if (live.length === 0) throw new Error('A pauta está vazia.');
  await ideaApi.updateMany(live.map((i) => i.id), { status: 'approved' });
  return cycleApi.update(cycle.id, { status: 'pauta_approved' });
}
