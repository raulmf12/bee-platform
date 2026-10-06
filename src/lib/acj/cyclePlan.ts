// Plano ACJ do ciclo (determinístico, como o planejamento por funções — D15).
// Template Operacional §6: parte da FASE do plano da campanha, corrige LACUNAS do
// que já foi planejado na campanha e alivia SATURAÇÃO do ciclo anterior.
// Proporções são hipóteses, não cotas: a pessoa ajusta e a Hive só recomenda.
import { apportion } from '@/lib/campaign/plan';
import { blocksForWeeks } from '@/lib/campaign/strategy';
import { ACJ_IDS, type AcjCampaignPlan, type AcjId, type AcjMix, type AcjPhase, type Idea } from '@/types';
import { ACJ_META, normalizeAcjMix } from './library';

export type AcjCounts = Partial<Record<AcjId, number>>;

// Fase (0..3) do plano que contém o ciclo — mesma distribuição da matriz da estratégia.
export function phaseIndexForCycle(weeks: number, cycleIdx: number, phases = 4): number {
  const blocks = blocksForWeeks(Math.max(1, weeks));
  const b = Math.max(0, blocks.findIndex(([a, z]) => cycleIdx >= a && cycleIdx <= z));
  return blocks.length === 1 ? 0 : Math.round((b * (phases - 1)) / (blocks.length - 1));
}

export function countAcj(ideas: Pick<Idea, 'acj_primary' | 'status'>[]): AcjCounts {
  const out: AcjCounts = {};
  for (const i of ideas) {
    if (!i.acj_primary || i.status === 'discarded' || i.status === 'backlog' || i.status === 'proposed') continue;
    out[i.acj_primary] = (out[i.acj_primary] ?? 0) + 1;
  }
  return out;
}

export const sumCounts = (c: AcjCounts) => ACJ_IDS.reduce((a, id) => a + (c[id] ?? 0), 0);

export function countsToMix(c: AcjCounts, fallback: AcjMix): AcjMix {
  return sumCounts(c) > 0 ? normalizeAcjMix(c) : normalizeAcjMix(fallback);
}

export interface AcjCycleDraft {
  phase: AcjPhase | null; counts: AcjCounts; cycle_mix: AcjMix; realized: AcjCounts;
  gaps: string[]; saturation_flags: string[]; priorities: Array<{ acj: AcjId; count: number; need: string }>; rationale: string;
}

export function buildAcjCyclePlan(input: {
  plan: Pick<AcjCampaignPlan, 'target_mix' | 'phases' | 'status'>; weeks: number; cycleIdx: number; contents: number;
  realized: AcjCounts;   // ACJ primária das ideias aprovadas/desenvolvidas nos ciclos ANTERIORES
  lastCycle: AcjCounts;  // só o ciclo imediatamente anterior
}): AcjCycleDraft {
  const { plan, contents, realized, lastCycle } = input;
  const phase = plan.phases?.[phaseIndexForCycle(input.weeks, input.cycleIdx, plan.phases?.length || 4)] ?? null;
  const base = normalizeAcjMix(phase?.mix ?? plan.target_mix);
  const target = normalizeAcjMix(plan.target_mix);
  const R = sumCounts(realized);
  const lastTotal = sumCounts(lastCycle);

  const gaps: string[] = [];
  const saturation: string[] = [];
  const weights = {} as Record<AcjId, number>;
  for (const id of ACJ_IDS) {
    // Lacuna: abaixo do esperado para o acumulado da campanha → reforço proporcional.
    const expected = (target[id] / 100) * (R + contents);
    const deficit = Math.max(0, expected - (realized[id] ?? 0));
    let w = base[id] / 100 + (R > 0 ? (0.5 * deficit) / Math.max(1, contents) : 0);
    if (R >= 3 && target[id] >= 15 && !(realized[id] ?? 0)) gaps.push(`${id} ${ACJ_META[id].name} ainda não apareceu na campanha (alvo ${target[id]}%).`);
    // Saturação: um movimento dominou o ciclo anterior (mesmo que tenha ido bem).
    const last = lastCycle[id] ?? 0;
    if (last >= 3 && lastTotal > 0 && last / lastTotal >= 0.6) {
      saturation.push(`${id} ${ACJ_META[id].name} concentrou ${last} de ${lastTotal} conteúdos no ciclo anterior.`);
      w *= 0.6;
    }
    weights[id] = w;
  }
  const counts = apportion(weights, Math.max(0, contents)) as AcjCounts;
  const priorities = ACJ_IDS.filter((id) => (counts[id] ?? 0) > 0)
    .map((id) => ({ acj: id, count: counts[id]!, need: ACJ_META[id].purpose }))
    .sort((a, b) => b.count - a.count || ACJ_IDS.indexOf(a.acj) - ACJ_IDS.indexOf(b.acj));

  const top = priorities.slice(0, 2).map((p) => `${ACJ_META[p.acj].name} (${p.count})`);
  const rationale = [
    phase ? `Fase ${phase.phase} · ${phase.label}${phase.priority_movement ? ` — ${phase.priority_movement}` : ''}.` : 'Sem fase definida: segue o mix-alvo da campanha.',
    top.length ? `Prioriza ${top.join(' e ')}.` : '',
    gaps.length ? `Reforça lacuna: ${gaps.map((g) => g.split(' ainda')[0]).join(', ')}.` : '',
    saturation.length ? `Alivia saturação: ${saturation.map((s) => s.split(' concentrou')[0]).join(', ')}.` : '',
    plan.status === 'approved' || plan.status === 'active' ? '' : 'Plano ACJ da campanha ainda não aprovado — esta é a recomendação da Hive.',
  ].filter(Boolean).join(' ');

  return { phase, counts, cycle_mix: countsToMix(counts, base), realized, gaps, saturation_flags: saturation, priorities, rationale };
}
