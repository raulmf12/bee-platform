// HOME regente (Tela 01): separa continuamente
//   O que está acontecendo · Precisa de você (com prazo) · Hive recomenda ·
//   Próximas publicações. Tudo derivado do estado real — determinístico.
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { isTextPending } from '@/lib/postReview';
import { buildPipeline } from '@/lib/campaign/pipeline';
import { performanceRecs } from '@/lib/campaign/performance';
import { CAMPAIGN_TYPE_LABELS, type BeeEditorial, type Campaign, type CampaignCycle, type Content, type Idea, type PostMetrics, type SocialAccount, type UserPost } from '@/types';

export interface HomeData {
  campaigns: Campaign[]; cycles: CampaignCycle[]; ideas: Idea[]; contents: Content[]; posts: UserPost[];
  accounts: SocialAccount[]; avulsoId?: string | null; today?: Date;
  metrics?: PostMetrics[]; editorials?: BeeEditorial[];
}

export interface PendingItem {
  id: string;
  kind: 'start' | 'plan' | 'pauta' | 'develop' | 'validate' | 'review' | 'schedule' | 'legacy_text' | 'legacy_review';
  eyebrow: string;         // "Campanha Orgânica · Próximo ciclo"
  title: string;
  body: string;
  due: string | null;      // yyyy-MM-dd
  dueLabel: string | null; // "Revisar até quinta-feira" / "Recomendado até 04/09"
  urgent: boolean;
  cta: string;
  to: string;
  color?: string | null;
  campaignId?: string | null;
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd');
const LIVE_CAMPAIGN = (c: Campaign) => c.status === 'active' && !!c.start_date && !!c.end_date;

export function dueLabel(due: string | null, today: Date, verb = 'Revisar'): string | null {
  if (!due) return null;
  const diff = differenceInCalendarDays(parseISO(due), today);
  if (diff < 0) return `${verb} — atrasado desde ${format(parseISO(due), 'dd/MM')}`;
  if (diff === 0) return `${verb} hoje`;
  if (diff === 1) return `${verb} até amanhã`;
  if (diff <= 6) return `${verb} até ${format(parseISO(due), 'EEEE', { locale: ptBR })}`;
  return `Recomendado até ${format(parseISO(due), 'dd/MM')}`;
}

// Prazo de revisão de um ciclo: o que o ciclo guardou, senão a véspera do início
// (ciclo futuro) ou hoje (ciclo em curso ainda sem trabalho).
function cycleDue(c: CampaignCycle, today: string): string {
  if (c.review_due) return c.review_due;
  if (c.start_date > today) return iso(addDays(parseISO(c.start_date), -1));
  return today;
}

export function pendingItems(d: HomeData): PendingItem[] {
  const today = d.today ?? new Date();
  const t = iso(today);
  const horizon = iso(addDays(today, 7));
  const out: PendingItem[] = [];
  const push = (p: Omit<PendingItem, 'dueLabel' | 'urgent'> & { verb?: string }) => {
    const { verb, ...rest } = p;
    out.push({ ...rest, dueLabel: dueLabel(p.due, today, verb), urgent: !!p.due && differenceInCalendarDays(parseISO(p.due), today) <= 1 });
  };
  const livePieces = d.posts.filter((p) => p.status !== 'archived');
  const groupsPending = (ps: UserPost[]) => new Set(ps.filter((p) => p.status === 'pending_approval').map((p) => p.alternative_group ?? p.id)).size;

  for (const camp of d.campaigns.filter(LIVE_CAMPAIGN)) {
    const cycles = d.cycles.filter((c) => c.campaign_id === camp.id).sort((a, b) => a.idx - b.idx);
    const campIdeas = d.ideas.filter((i) => i.campaign_id === camp.id);
    const typeLabel = CAMPAIGN_TYPE_LABELS[camp.type].replace(' / Lançamento', '');
    const base = { color: camp.color, campaignId: camp.id };
    // Ciclo em curso + o próximo (se começa em até 7 dias). Campanha que ainda não
    // começou tem UMA pendência só: iniciar o primeiro ciclo.
    const notStarted = campIdeas.length === 0 && cycles[0] && (cycles[0].status === 'not_started' || cycles[0].status === 'planned');
    for (const c of cycles.filter((c) => c.end_date >= t && c.start_date <= horizon && (!notStarted || c.idx === cycles[0].idx))) {
      const current = c.start_date <= t;
      const when = c.idx === 1 ? 'Primeiro ciclo' : current ? 'Ciclo atual' : 'Próximo ciclo';
      const eyebrow = `${typeLabel} · ${when}`;
      const to = `/producao?campaign=${camp.id}&cycle=${c.id}`;
      const due = cycleDue(c, t);
      const ideas = campIdeas.filter((i) => i.cycle_id === c.id);
      const pieces = livePieces.filter((p) => p.cycle_id === c.id);
      if (c.status === 'not_started' || c.status === 'planned') {
        if (c.idx === 1 && campIdeas.length === 0) {
          push({ id: `start:${c.id}`, kind: 'start', eyebrow, title: camp.name, body: 'Sua campanha está pronta para começar. Ainda não há conteúdos produzidos para o primeiro ciclo.', due, cta: 'Iniciar produção', to, verb: 'Iniciar', ...base });
        } else if (current || differenceInCalendarDays(parseISO(c.start_date), today) <= 4) {
          push({ id: `plan:${c.id}`, kind: 'plan', eyebrow, title: camp.name, body: `Hora de definir as ideias da semana de ${format(parseISO(c.start_date), 'dd/MM')}.`, due, cta: 'Planejar', to, verb: 'Planejar', ...base });
        }
      } else if (c.status === 'pauta_ready') {
        push({ id: `pauta:${c.id}`, kind: 'pauta', eyebrow, title: camp.name, body: `A Hive preparou as ideias recomendadas para ${current ? 'esta semana' : 'a próxima semana'}.`, due, cta: 'Revisar', to, ...base });
      } else if (c.status === 'pauta_approved') {
        const n = ideas.filter((i) => i.status === 'approved').length;
        push({ id: `develop:${c.id}`, kind: 'develop', eyebrow, title: camp.name, body: `${n} ${n === 1 ? 'ideia aprovada espera' : 'ideias aprovadas esperam'} desenvolvimento.`, due, cta: 'Desenvolver', to, verb: 'Desenvolver', ...base });
      } else if (c.status === 'developing') {
        const waiting = d.contents.filter((x) => x.cycle_id === c.id && x.status === 'pending_validation');
        for (const x of waiting.slice(0, 2)) {
          push({ id: `validate:${x.id}`, kind: 'validate', eyebrow: `${typeLabel} · Conteúdo`, title: `“${x.title}”`, body: 'O conteúdo está pronto. Falta sua aprovação.', due, cta: 'Revisar', to, ...base });
        }
        if (waiting.length > 2) push({ id: `validate-more:${c.id}`, kind: 'validate', eyebrow, title: camp.name, body: `Mais ${waiting.length - 2} conteúdos esperam sua aprovação.`, due, cta: 'Revisar', to, ...base });
      } else if (c.status === 'producing') {
        const n = groupsPending(pieces);
        if (n > 0) push({ id: `review:${c.id}`, kind: 'review', eyebrow, title: camp.name, body: `${n} ${n === 1 ? 'peça pronta espera' : 'peças prontas esperam'} sua revisão.`, due, cta: 'Revisar', to, ...base });
      }
      if (c.status === 'ready' || c.status === 'done' || c.status === 'producing') {
        const n = pieces.filter((p) => p.status === 'approved' && !p.scheduled_date).length;
        if (n > 0) push({ id: `schedule:${c.id}`, kind: 'schedule', eyebrow, title: camp.name, body: `${n} ${n === 1 ? 'peça aprovada está' : 'peças aprovadas estão'} prontas para agendar.`, due: c.start_date > t ? c.start_date : null, cta: 'Programar', to: `/agenda?campaign=${camp.id}`, verb: 'Programar', ...base });
      }
    }
  }

  // Conteúdos avulsos ("Um conteúdo") esperando você.
  if (d.avulsoId) {
    for (const x of d.contents.filter((c) => c.campaign_id === d.avulsoId && c.status === 'pending_validation')) {
      push({ id: `validate:${x.id}`, kind: 'validate', eyebrow: 'Sem campanha · Conteúdo', title: `“${x.title}”`, body: 'O conteúdo está pronto. Falta sua aprovação.', due: null, cta: 'Revisar', to: `/producao?campaign=${d.avulsoId}&cycle=${x.cycle_id}` });
    }
    const avulsoPieces = livePieces.filter((p) => p.campaign_id === d.avulsoId);
    const cyclesWithPending = [...new Set(avulsoPieces.filter((p) => p.status === 'pending_approval').map((p) => p.cycle_id))];
    for (const cy of cyclesWithPending) {
      const n = groupsPending(avulsoPieces.filter((p) => p.cycle_id === cy));
      const content = d.contents.find((c) => c.cycle_id === cy);
      push({ id: `review:${cy}`, kind: 'review', eyebrow: 'Sem campanha · Conteúdo', title: content ? `“${content.title}”` : 'Conteúdo avulso', body: `${n} ${n === 1 ? 'peça espera' : 'peças esperam'} sua revisão.`, due: null, cta: 'Revisar', to: `/producao?campaign=${d.avulsoId}&cycle=${cy}` });
    }
  }

  // Histórico (antes da campanha): posts parados na aprovação.
  const legacy = livePieces.filter((p) => !p.content_id && !p.cycle_id);
  const text = legacy.filter(isTextPending);
  if (text.length) push({ id: 'legacy_text', kind: 'legacy_text', eyebrow: 'Posts anteriores', title: `${text.length} ${text.length === 1 ? 'post aguardando' : 'posts aguardando'} aprovação de texto`, body: 'Título e legenda ainda não aprovados — retome de onde parou.', due: null, cta: 'Revisar', to: '/posts/novo?retomar=1' });
  const design = legacy.filter((p) => p.status === 'pending_approval' && !isTextPending(p));
  if (design.length) push({ id: 'legacy_review', kind: 'legacy_review', eyebrow: 'Posts anteriores', title: `${design.length} ${design.length === 1 ? 'post aguardando' : 'posts aguardando'} aprovação`, body: 'Revise no Pipeline.', due: null, cta: 'Abrir pipeline', to: '/pipeline' });

  // Mais urgente primeiro; sem prazo por último.
  return out.sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'));
}

export interface Happening { activeCampaigns: number; scheduled: number; inProduction: number }

export function happening(d: HomeData): Happening {
  const t = new Date((d.today ?? new Date()).getTime());
  const cards = buildPipeline({ campaigns: d.campaigns, ideas: d.ideas, contents: d.contents, posts: d.posts });
  return {
    activeCampaigns: d.campaigns.filter((c) => LIVE_CAMPAIGN(c) && c.end_date! >= iso(t)).length,
    scheduled: d.posts.filter((p) => p.status === 'scheduled' && p.scheduled_date && new Date(p.scheduled_date) >= t).length,
    inProduction: cards.filter((c) => c.kind !== 'idea' && (c.column === 'rascunho' || c.column === 'pendente')).length,
  };
}

export interface UpcomingItem { post: UserPost; when: Date; dayLabel: string; account: string }

export function upcoming(d: HomeData, limit = 5): UpcomingItem[] {
  const today = d.today ?? new Date();
  return d.posts
    .filter((p) => p.status === 'scheduled' && p.scheduled_date && new Date(p.scheduled_date) >= today)
    .sort((a, b) => a.scheduled_date!.localeCompare(b.scheduled_date!))
    .slice(0, limit)
    .map((post) => {
      const when = new Date(post.scheduled_date!);
      const diff = differenceInCalendarDays(when, today);
      const dayLabel = diff === 0 ? 'Hoje' : diff === 1 ? 'Amanhã' : diff <= 6 ? format(when, 'EEEE', { locale: ptBR }) : format(when, 'dd/MM');
      const acc = d.accounts.find((a) => a.id === post.account_id) ?? d.accounts.find((a) => a.platform === post.platform && a.is_default);
      const net = post.platform === 'linkedin' ? 'LinkedIn' : post.platform === 'instagram' ? 'Instagram' : post.platform;
      return { post, when, dayLabel: dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1), account: acc ? `${net} ${acc.label}` : net };
    });
}

export interface Recommendation { id: string; title: string; body: string; cta: string; to: string }

// Movimentos que a Hive identifica no estado atual (F8 soma os de desempenho).
export function recommendations(d: HomeData): Recommendation[] {
  const today = d.today ?? new Date();
  const t = iso(today);
  // Desempenho primeiro: é o movimento que só a Hive enxerga nos dados.
  const out: Recommendation[] = d.metrics?.length
    ? performanceRecs({ posts: d.posts, metrics: d.metrics, contents: d.contents, today, editorialName: (s) => d.editorials?.find((e) => e.slug === s)?.name })
    : [];
  const live = d.campaigns.filter((c) => LIVE_CAMPAIGN(c) && c.end_date! >= t);
  if (live.length === 0) {
    out.push({ id: 'first-campaign', title: 'Organize sua presença numa campanha', body: 'Com uma campanha, a Hive planeja os ciclos, sugere as ideias e mantém sua agenda coberta semana a semana.', cta: 'Criar campanha', to: '/campanhas/nova' });
  }
  for (const c of live) {
    const left = differenceInCalendarDays(parseISO(c.end_date!), today);
    if (left >= 0 && left <= 7) out.push({ id: `ending:${c.id}`, title: `${c.name} termina em ${left === 0 ? 'hoje' : `${left} dia${left > 1 ? 's' : ''}`}`, body: 'Vale planejar o próximo movimento para não deixar sua presença sem ritmo.', cta: 'Planejar próximo movimento', to: '/criar' });
  }
  const ready = d.posts.filter((p) => p.status === 'approved' && !p.scheduled_date);
  const soon = d.posts.filter((p) => p.status === 'scheduled' && p.scheduled_date && differenceInCalendarDays(new Date(p.scheduled_date), today) <= 3 && new Date(p.scheduled_date) >= today);
  if (ready.length && soon.length === 0) {
    out.push({ id: 'empty-agenda', title: 'Sua agenda dos próximos 3 dias está vazia', body: `Há ${ready.length} ${ready.length === 1 ? 'peça aprovada' : 'peças aprovadas'} esperando data. A Hive pode distribuir respeitando as prioridades de cada campanha.`, cta: 'Abrir agenda', to: '/agenda' });
  }
  return out;
}
