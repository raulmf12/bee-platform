// Circulação ACJ na agenda (Adendo §14 / Template Operacional §6.5): a agenda
// RECOMENDA — nunca impõe — ordem, espaçamento, equilíbrio e reforços.
// Conta conteúdo-mãe (não peça): LinkedIn + Instagram do mesmo conteúdo = 1 movimento.
import { format, parseISO } from 'date-fns';
import { ACJ_IDS, type AcjId, type CampaignCycle, type UserPost } from '@/types';
import { ACJ_META } from './library';

export interface AcjAlert { id: string; campaign_id: string | null; kind: 'saturation' | 'spacing' | 'gap'; title: string; detail: string }

const dayOf = (p: UserPost) => (p.scheduled_date ?? p.published_at ?? '').slice(0, 10);
const br = (d: string) => (d ? format(parseISO(d), 'dd/MM') : '');

export function acjCirculationAlerts(
  posts: UserPost[],
  ctx: { cycles: CampaignCycle[]; cyclePlans: Array<{ cycle_id: string; counts: Partial<Record<AcjId, number>> }>; today?: string },
): AcjAlert[] {
  const today = ctx.today ?? format(new Date(), 'yyyy-MM-dd');
  const alerts: AcjAlert[] = [];
  const live = posts.filter((p) => p.acj_primary && p.status !== 'archived' && (p.status === 'scheduled' || p.status === 'published') && dayOf(p));
  const byCampaign = new Map<string, UserPost[]>();
  for (const p of live) byCampaign.set(p.campaign_id ?? '__none__', [...(byCampaign.get(p.campaign_id ?? '__none__') ?? []), p]);

  for (const [cid, list] of byCampaign) {
    // Um movimento por conteúdo-mãe, na data da primeira peça.
    const seen = new Map<string, { acj: AcjId; day: string }>();
    for (const p of [...list].sort((a, b) => (dayOf(a) < dayOf(b) ? -1 : 1))) {
      const k = p.content_id ?? p.id;
      if (!seen.has(k)) seen.set(k, { acj: p.acj_primary!, day: dayOf(p) });
    }
    const seq = [...seen.values()].filter((x) => x.day >= today);
    // Saturação: 3+ conteúdos seguidos com o mesmo movimento.
    for (let i = 0; i < seq.length;) {
      let j = i;
      while (j + 1 < seq.length && seq[j + 1].acj === seq[i].acj) j++;
      const run = j - i + 1;
      if (run >= 3) {
        alerts.push({
          id: `sat-${cid}-${seq[i].day}`, campaign_id: cid === '__none__' ? null : cid, kind: 'saturation',
          title: `${run} conteúdos seguidos de ${seq[i].acj} ${ACJ_META[seq[i].acj].name}`,
          detail: `De ${br(seq[i].day)} a ${br(seq[j].day)}. Intercale outro movimento ou uma ponte para a jornada não estagnar.`,
        });
      }
      i = j + 1;
    }
    // Espaçamento: Experimentação e Aprofundamento pedem tempo para serem vividos.
    for (let i = 1; i < seq.length; i++) {
      const a = seq[i - 1], b = seq[i];
      if ((a.acj === 'ACJ-04' || a.acj === 'ACJ-05') && (b.acj === 'ACJ-04' || b.acj === 'ACJ-05') && a.day === b.day) {
        alerts.push({
          id: `sp-${cid}-${b.day}`, campaign_id: cid === '__none__' ? null : cid, kind: 'spacing',
          title: `${ACJ_META[a.acj].name} e ${ACJ_META[b.acj].name} no mesmo dia (${br(b.day)})`,
          detail: 'Movimentos que pedem experiência ou integração precisam de espaço entre si. Considere afastar um deles.',
        });
      }
    }
  }
  // Lacuna: movimento previsto no plano do ciclo atual sem nenhuma peça agendada/publicada.
  for (const plan of ctx.cyclePlans) {
    const cy = ctx.cycles.find((c) => c.id === plan.cycle_id);
    if (!cy || cy.end_date < today || cy.start_date > today) continue;
    const inCycle = posts.filter((p) => p.cycle_id === cy.id && p.status !== 'archived' && (p.status === 'scheduled' || p.status === 'published' || p.status === 'approved'));
    for (const id of ACJ_IDS) {
      if ((plan.counts[id] ?? 0) > 0 && !inCycle.some((p) => p.acj_primary === id)) {
        alerts.push({
          id: `gap-${cy.id}-${id}`, campaign_id: cy.campaign_id, kind: 'gap',
          title: `${id} ${ACJ_META[id].name} previsto no ciclo e ainda sem peça`,
          detail: `O plano do ciclo ${String(cy.idx).padStart(2, '0')} pede ${plan.counts[id]} conteúdo(s) deste movimento.`,
        });
      }
    }
  }
  return alerts;
}
