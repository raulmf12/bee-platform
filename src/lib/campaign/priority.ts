// Fila estratégica de publicação (Tela 13 — "Conteúdos para agendar").
// Não diz só "estes conteúdos não têm data": diz EM QUE ORDEM deveriam entrar em
// circulação e EM QUE JANELA ("Hive sugere: 08–10 set"). Determinístico.
import { addDays, format, parseISO } from 'date-fns';
import { PLATFORM_GUIDE } from '@/lib/schedule';
import type { Campaign, CampaignCycle, UserPost } from '@/types';

export type PriorityLabel = 'Alta' | 'Média' | 'Menor';
export interface QueueInfo { rank: number; label: PriorityLabel; windowStart: string; windowEnd: string }

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

function candidateDays(p: UserPost, cycle: CampaignCycle | undefined, today: string): string[] {
  const matches = (s: { account_id: string; platform: string }) => (p.account_id ? s.account_id === p.account_id : s.platform === p.platform);
  const fromPlan = (cycle?.plan?.calendar ?? []).filter((d) => d.date >= today && d.slots.some(matches)).map((d) => d.date);
  if (fromPlan.length) return fromPlan;
  if (cycle) {
    const out: string[] = [];
    for (let d = parseISO(cycle.start_date); iso(d) <= cycle.end_date; d = addDays(d, 1)) if (iso(d) >= today) out.push(iso(d));
    if (out.length) return out;
  }
  // Sem ciclo (ou ciclo já passou): próximos 7 dias a partir de amanhã.
  return Array.from({ length: 7 }, (_, i) => iso(addDays(parseISO(today), i + 1)));
}

// Como na Tela 13: a primeira é Alta, a última é Menor (a partir de 3), o meio é Média.
export function labelFor(pos: number, total: number): PriorityLabel {
  if (pos <= 1) return 'Alta';
  if (total >= 3 && pos === total) return 'Menor';
  return 'Média';
}

// Ordena e dá janela a cada peça da fila. `scheduled` = peças já com data (ocupação).
export function scheduleQueue(
  queue: UserPost[],
  ctx: { campaigns: Campaign[]; cycles: CampaignCycle[]; scheduled: UserPost[]; today?: Date },
): Map<string, QueueInfo> {
  const today = iso(ctx.today ?? new Date());
  const cycleOf = (p: UserPost) => ctx.cycles.find((c) => c.id === p.cycle_id);
  const campaignOf = (p: UserPost) => ctx.campaigns.find((c) => c.id === p.campaign_id);

  const ordered = [...queue].sort((a, b) => {
    const ca = cycleOf(a), cb = cycleOf(b);
    const sa = ca?.start_date ?? '9999', sb = cb?.start_date ?? '9999';
    if (sa !== sb) return sa < sb ? -1 : 1;                                   // ciclo mais cedo primeiro
    const va = campaignOf(a)?.type === 'vendas' ? 0 : 1, vb = campaignOf(b)?.type === 'vendas' ? 0 : 1;
    if (va !== vb) return va - vb;                                            // lançamento é mais urgente
    const ra = a.piece_role === 'validation' ? 0 : 1, rb = b.piece_role === 'validation' ? 0 : 1;
    if (ra !== rb) return ra - rb;                                            // a peça que valida o pensamento abre
    const xa = a.virality_score ?? 0, xb = b.virality_score ?? 0;
    if (xa !== xb) return xb - xa;
    return a.created_at < b.created_at ? -1 : 1;
  });

  // Ocupação por conta/plataforma e dia (o que já está agendado + o que a fila vai ocupando).
  const key = (p: UserPost, day: string) => `${p.account_id ?? p.platform}|${day}`;
  const taken = new Set(ctx.scheduled.filter((p) => p.scheduled_date).map((p) => key(p, p.scheduled_date!.slice(0, 10))));

  const infos = new Map<string, QueueInfo>();
  const byGroup = new Map<string, UserPost[]>();
  for (const p of ordered) {
    const days = candidateDays(p, cycleOf(p), today);
    const i = Math.max(0, days.findIndex((d) => !taken.has(key(p, d))));
    const start = days[i] ?? days[0];
    const nextSlot = days[i + 1];
    const end = nextSlot && nextSlot <= iso(addDays(parseISO(start), 3)) ? nextSlot : iso(addDays(parseISO(start), 2));
    const cycleEnd = cycleOf(p)?.end_date;
    taken.add(key(p, start));
    infos.set(p.id, { rank: 0, label: 'Alta', windowStart: start, windowEnd: cycleEnd && end > cycleEnd && start <= cycleEnd ? cycleEnd : end });
    const g = campaignOf(p)?.id ?? '__none__'; // avulso/sem campanha = um grupo só
    byGroup.set(g, [...(byGroup.get(g) ?? []), p]);
  }
  // Ranking e rótulo DENTRO de cada campanha (é assim que a fila é lida).
  for (const items of byGroup.values()) {
    items.forEach((p, i) => { const inf = infos.get(p.id)!; inf.rank = i + 1; inf.label = labelFor(i + 1, items.length); });
  }
  return infos;
}

// ---------------- Sugestões da Hive no painel da peça ----------------
export interface HiveSuggestion { id: string; title: string; detail: string; action: { kind: 'move_day'; day: string } | { kind: 'move_time'; time: string } }

// Regras só quando há motivo real pra interferir na programação.
export function suggestionsFor(p: UserPost, cycle: CampaignCycle | undefined, bestTime?: { time: string; reason: string }): HiveSuggestion[] {
  if (!p.scheduled_date) return [];
  const out: HiveSuggestion[] = [];
  const when = new Date(p.scheduled_date);
  const day = iso(when);
  const time = format(when, 'HH:mm');
  if (cycle && (day < cycle.start_date || day > cycle.end_date) && cycle.end_date >= iso(new Date())) {
    const target = cycle.start_date >= iso(new Date()) ? cycle.start_date : iso(new Date());
    out.push({
      id: 'window', title: 'Publicar dentro do ciclo', detail: `Esta peça pertence ao ciclo de ${cycle.start_date.slice(8)}/${cycle.start_date.slice(5, 7)}; fora dele a campanha perde o ritmo planejado.`,
      action: { kind: 'move_day', day: target },
    });
  }
  const recommended = bestTime ?? (() => {
    const t = PLATFORM_GUIDE[p.platform]?.times.find((x) => x.recommended);
    return t ? { time: t.time, reason: `${t.reason}.` } : undefined;
  })();
  if (recommended && recommended.time !== time) {
    const [h1, m1] = time.split(':').map(Number), [h2, m2] = recommended.time.split(':').map(Number);
    const diffMin = Math.abs(h1 * 60 + m1 - (h2 * 60 + m2));
    if (diffMin >= 60) {
      out.push({ id: 'time', title: `Publicar às ${recommended.time}`, detail: recommended.reason, action: { kind: 'move_time', time: recommended.time } });
    }
  }
  return out;
}
