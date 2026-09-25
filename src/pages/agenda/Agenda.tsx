// Agenda de conteúdo (Tela 13) — calendário estilo Google Agenda, orquestrado por
// CAMPANHA: timeline das campanhas no topo (clicar = lente), barras da campanha no
// calendário, fila "Conteúdos para agendar" priorizada com janela sugerida pela Hive,
// painel lateral da peça com sugestões. Foco em QUANDO cada peça vai ao ar.
//
// - Grid do mês (date-fns/ptBR). Posts com data aparecem no dia.
// - Bandeja de stand-by (aprovados sem data) → arraste pro dia (ou "IA distribui").
// - Cor do card = cor da editoria (vinda do banco, customizável). Ícone = rede social.
// - Filtros de plataforma e editoria (derivados dos dados, não fixos).
// - Clique no card → popup com o conteúdo completo + editar.
// Regras da distribuição automática saem de user_settings.distribution_prefs.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  addDays, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth,
  isToday, parseISO, startOfMonth, startOfWeek,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { LucideIcon } from 'lucide-react';
import {
  CalendarClock, Check, ChevronLeft, ChevronRight, Edit3, Facebook, Filter, Instagram,
  Lightbulb, Linkedin, Loader2, Music2, PauseCircle, Settings2, Sparkles, Wand2, X, Youtube,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { CampaignTimeline } from '@/components/agenda/CampaignTimeline';
import { ScheduleQueue, type QueueGroup } from '@/components/agenda/ScheduleQueue';
import { campaignApi, cycleApi } from '@/lib/campaignApi';
import { formatRange } from '@/lib/campaign/dates';
import { scheduleQueue, suggestionsFor, type HiveSuggestion } from '@/lib/campaign/priority';
import { usePostStore } from '@/store/postStore';
import { useAuthStore } from '@/store/authStore';
import { beeApi } from '@/lib/api';
import { edge } from '@/lib/edge';
import {
  DEFAULT_DISTRIBUTION, atTime, cadenceFor, distributeGuided, distributeStandby,
  editorialGapDays, guideFor, isoToLocalInput, localInputToIso, mergePrefs, nowLocalInput, weekKey,
  type GuidedPlatformCfg, type MergedPrefs,
} from '@/lib/schedule';
import {
  PLATFORM_COLORS, PLATFORM_LABELS, type BeeEditorial, type Campaign, type CampaignCycle,
  type DistributionPrefs, type Platform, type UserPost,
} from '@/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const NEUTRAL = '#94A3B8';
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const PLATFORM_ORDER: Platform[] = ['linkedin', 'instagram', 'facebook', 'tiktok', 'youtube'];

// Grade de horários (visões semana/dia) — estilo Google Agenda.
const GRID_START = 6;   // 06h
const GRID_END = 22;    // 22h
const SLOT_MIN = 30;    // snap de 30 em 30 min
const SLOT_H = 28;      // altura em px de cada slot de 30min
const SLOTS = ((GRID_END - GRID_START) * 60) / SLOT_MIN;

const PLATFORM_ICON: Record<Platform, LucideIcon> = {
  linkedin: Linkedin,
  instagram: Instagram,
  facebook: Facebook,
  youtube: Youtube,
  tiktok: Music2, // lucide não tem ícone de TikTok; Music2 como aproximação.
};

function PlatformIcon({ platform, className }: { platform: Platform; className?: string }) {
  const Icon = PLATFORM_ICON[platform] ?? CalendarClock;
  return <Icon className={className} style={{ color: PLATFORM_COLORS[platform] }} />;
}

const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');

// Um arrasto de peça (chip, bloco ou item da fila) carrega o id em text/plain. Checar
// o dataTransfer (e não o estado React) deixa o 1º dragover aceitar o drop.
const isPostDrag = (e: React.DragEvent) => e.dataTransfer.types.includes('text/plain');

// Data em que o post "acontece" no calendário.
function eventDate(p: UserPost): Date | null {
  if (p.scheduled_date) return new Date(p.scheduled_date);
  if (p.status === 'published' && p.published_at) return new Date(p.published_at);
  return null;
}

export function Agenda() {
  const navigate = useNavigate();
  const { posts, load, update } = usePostStore();
  const settings = useAuthStore((s) => s.settings);
  const updateSettings = useAuthStore((s) => s.updateSettings);

  const [editorials, setEditorials] = useState<BeeEditorial[]>([]);
  const [cursor, setCursor] = useState<Date>(new Date());
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = posts.find((p) => p.id === selectedId) ?? null;
  const setSelected = (p: UserPost | null) => { setSelectedId(p?.id ?? null); setFullView(false); };
  const [fullView, setFullView] = useState(false);
  const [distributing, setDistributing] = useState(false);

  // Campanhas: timeline + LENTE (?campaign=). "Seguir para programação" chega aqui com a lente.
  const [searchParams, setSearchParams] = useSearchParams();
  const lens = searchParams.get('campaign');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [cycles, setCycles] = useState<CampaignCycle[]>([]);
  const setLens = (id: string | null) => {
    const n = new URLSearchParams(searchParams);
    if (id) n.set('campaign', id); else n.delete('campaign');
    setSearchParams(n, { replace: true });
  };

  // Filtros: guardamos o que está ESCONDIDO (vazio = tudo visível).
  const [hiddenPlatforms, setHiddenPlatforms] = useState<Set<string>>(new Set());
  const [hiddenEditorials, setHiddenEditorials] = useState<Set<string>>(new Set());

  // Config da distribuição (diálogo)
  const [configOpen, setConfigOpen] = useState(false);
  const [cfg, setCfg] = useState<MergedPrefs>(DEFAULT_DISTRIBUTION);

  // Plano proposto (revisão antes de aplicar). Cai aqui tanto o modo IA quanto o
  // semi-automático. Cada linha traz o porquê.
  const [plan, setPlan] = useState<{ summary?: string; rows: Array<{ post: UserPost; date: string; time: string; reason: string }> } | null>(null);
  const [applying, setApplying] = useState(false);

  // Assistente semi-automático (guiado): pergunta frequência/dias/horários por
  // plataforma e monta o plano. wizCfg guarda as escolhas por plataforma.
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizPlatforms, setWizPlatforms] = useState<Platform[]>([]);
  const [wizIdx, setWizIdx] = useState(0);
  const [wizCfg, setWizCfg] = useState<Partial<Record<Platform, GuidedPlatformCfg>>>({});

  useEffect(() => {
    void load();
    void beeApi.listEditorials().then(setEditorials).catch(console.error);
    void campaignApi.list().then(setCampaigns).catch(console.error);
    void cycleApi.listAll().then(setCycles).catch(console.error);
  }, [load]);

  // Esc fecha o painel lateral da peça.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  const campaignById = useMemo(() => new Map(campaigns.map((c) => [c.id, c])), [campaigns]);
  const cycleById = useMemo(() => new Map(cycles.map((c) => [c.id, c])), [cycles]);
  // Campanhas que aparecem no calendário (barras): em andamento/planejadas, respeitando a lente.
  const barCampaigns = useMemo(
    () => campaigns.filter((c) => c.start_date && c.end_date && c.status !== 'ended' && c.status !== 'draft' && (!lens || c.id === lens)),
    [campaigns, lens],
  );

  // Ao entrar com a lente, abre o calendário no começo da campanha (se ainda vai começar).
  useEffect(() => {
    const c = lens ? campaignById.get(lens) : undefined;
    if (c?.start_date && parseISO(c.start_date) > new Date()) setCursor(parseISO(c.start_date));
  }, [lens, campaignById]);

  const prefs = useMemo(() => mergePrefs(settings?.distribution_prefs), [settings?.distribution_prefs]);

  // slug -> { color, name, frequency_hint }
  const edMap = useMemo(() => {
    const m = new Map<string, { color: string; name: string; freq?: string }>();
    for (const e of editorials) m.set(e.slug, { color: e.color ?? NEUTRAL, name: e.name, freq: e.frequency_hint });
    return m;
  }, [editorials]);

  const editorialOf = (p: UserPost) => (p.metadata?.editorial_slug as string | undefined);
  const colorOf = (p: UserPost) => edMap.get(editorialOf(p) ?? '')?.color ?? NEUTRAL;

  const isVisible = (p: UserPost) =>
    !hiddenPlatforms.has(p.platform) && !hiddenEditorials.has(editorialOf(p) ?? '__none__') &&
    (!lens || p.campaign_id === lens);

  // Plataformas e editorias presentes nos posts (pra montar os filtros — derivado).
  const presentPlatforms = useMemo(() => {
    const s = new Set<Platform>();
    for (const p of posts) if (eventDate(p) || (p.status === 'approved' && !p.scheduled_date)) s.add(p.platform);
    return PLATFORM_ORDER.filter((pl) => s.has(pl));
  }, [posts]);

  const presentEditorials = useMemo(() => {
    const seen = new Map<string, string>(); // slug -> name
    for (const p of posts) {
      if (!(eventDate(p) || (p.status === 'approved' && !p.scheduled_date))) continue;
      const slug = editorialOf(p);
      if (slug) seen.set(slug, edMap.get(slug)?.name ?? slug);
    }
    return [...seen.entries()].map(([slug, name]) => ({ slug, name, color: edMap.get(slug)?.color ?? NEUTRAL }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, edMap]);

  // Stand-by = aprovado e sem data.
  const standby = useMemo(
    () => posts.filter((p) => p.status === 'approved' && !p.scheduled_date && isVisible(p)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [posts, hiddenPlatforms, hiddenEditorials, lens],
  );

  // Fila estratégica: ordem de entrada em circulação + janela sugerida pela Hive.
  const queueInfo = useMemo(
    () => scheduleQueue(standby, { campaigns, cycles, scheduled: posts.filter((p) => p.scheduled_date && p.status !== 'archived') }),
    [standby, campaigns, cycles, posts],
  );
  const byPriority = (a: UserPost, b: UserPost) => {
    const ia = queueInfo.get(a.id), ib = queueInfo.get(b.id);
    if (ia && ib && ia.windowStart !== ib.windowStart) return ia.windowStart < ib.windowStart ? -1 : 1;
    if (ia && ib && a.campaign_id === b.campaign_id && ia.rank !== ib.rank) return ia.rank - ib.rank;
    const sa = a.virality_score ?? -1, sb = b.virality_score ?? -1;
    if (sb !== sa) return sb - sa;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  };
  const queueGroups = useMemo<QueueGroup[]>(() => {
    const m = new Map<string, UserPost[]>();
    for (const p of standby) { const k = p.campaign_id ?? '__none__'; m.set(k, [...(m.get(k) ?? []), p]); }
    const groups = [...m.entries()].map(([k, items]): QueueGroup => {
      const c = k === '__none__' ? undefined : campaignById.get(k);
      const sorted = items.map((post) => ({ post, info: queueInfo.get(post.id) })).sort((a, b) => (a.info?.rank ?? 99) - (b.info?.rank ?? 99));
      return { id: c?.id ?? null, name: c?.name ?? 'Sem campanha', color: c?.color ?? NEUTRAL, items: sorted };
    });
    const first = (g: QueueGroup) => g.items.reduce((min, i) => (i.info && i.info.windowStart < min ? i.info.windowStart : min), '9999');
    return groups.sort((a, b) => (a.id === null ? 1 : b.id === null ? -1 : first(a).localeCompare(first(b))));
  }, [standby, queueInfo, campaignById]);

  // Dias exibidos: mês (semanas completas), semana (7 dias) ou dia (1).
  const days = useMemo(() => {
    if (view === 'day') return [cursor];
    if (view === 'week') {
      return eachDayOfInterval({
        start: startOfWeek(cursor, { weekStartsOn: 0 }),
        end: endOfWeek(cursor, { weekStartsOn: 0 }),
      });
    }
    const gridStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
    const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [cursor, view]);

  // Eventos visíveis agrupados por dia.
  const eventsByDay = useMemo(() => {
    const m = new Map<string, UserPost[]>();
    for (const p of posts) {
      const d = eventDate(p);
      if (!d || !isVisible(p)) continue;
      const k = dayKey(d);
      const arr = m.get(k) ?? [];
      arr.push(p);
      m.set(k, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => (eventDate(a)!.getTime() - eventDate(b)!.getTime()));
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, hiddenPlatforms, hiddenEditorials, lens]);

  // ---- Ações ----
  async function moveToDay(postId: string, day: Date) {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    const existing = eventDate(post);
    // Mantém o horário se já tinha; senão usa o 1º horário da cadência da plataforma.
    const time = existing ? format(existing, 'HH:mm') : cadenceFor(prefs, post.platform).times[0];
    let when = atTime(day, time);
    // Se o horário herdado já passou NESTE dia (ex.: mover um post pra hoje de
    // manhã, à tarde), não recusamos o arraste: empurramos pro próximo horário
    // válido do dia. Assim dá pra mover direto de um dia pro outro sem precisar
    // devolver pro stand-by primeiro. Só recusamos se o dia inteiro já passou.
    if (when.getTime() < Date.now()) {
      const slots = [...cadenceFor(prefs, post.platform).times, '12:00', '15:00', '18:00', '21:00'];
      const next = slots
        .map((t) => atTime(day, t))
        .filter((d) => d.getTime() > Date.now())
        .sort((a, b) => a.getTime() - b.getTime())[0];
      if (!next) {
        toast.error('Esse dia já passou. Escolha uma data futura.');
        return;
      }
      when = next;
    }
    try {
      await update(postId, { status: 'scheduled', scheduled_date: when.toISOString() });
      toast.success(`Agendado pra ${format(when, "d 'de' MMM 'às' HH:mm", { locale: ptBR })}`);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao agendar.');
    }
  }

  // Move um post pra um DIA + HORÁRIO específico (grade semana/dia). Mesmo guard
  // de passado do moveToDay. Reaproveita atTime (fuso-safe).
  async function moveToDayTime(postId: string, day: Date, hour: number, minute: number) {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const when = atTime(day, time);
    if (when.getTime() < Date.now()) {
      toast.error('Não dá pra agendar no passado.');
      return;
    }
    try {
      await update(postId, { status: 'scheduled', scheduled_date: when.toISOString() });
      toast.success(`Agendado pra ${format(when, "d 'de' MMM 'às' HH:mm", { locale: ptBR })}`);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao agendar.');
    }
  }

  async function backToStandby(post: UserPost) {
    try {
      await update(post.id, { status: 'approved', scheduled_date: null });
      toast.info('Removido da agenda — voltou pra fila.');
      setSelected(null);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao remover do calendário.');
    }
  }

  // Distribuição LOCAL (regra determinística) — usada como fallback se a IA falhar.
  function localDistribute(toPlace: UserPost[]): Array<{ postId: string; date: Date }> {
    // Ordem = prioridade da fila (janela + posição na campanha), não só viralidade.
    const ordered = [...toPlace].sort(byPriority);
    const lastByEditorial: Record<string, Date> = {};
    const countByDay: Record<string, number> = {};
    const countByWeekPlatform: Record<string, number> = {};
    for (const p of posts) {
      const d = eventDate(p);
      if (!d) continue;
      const slug = editorialOf(p) ?? '__none__';
      if (!lastByEditorial[slug] || d > lastByEditorial[slug]) lastByEditorial[slug] = d;
      const k = dayKey(d);
      countByDay[k] = (countByDay[k] ?? 0) + 1;
      const wpk = `${weekKey(d)}|${p.platform}`;
      countByWeekPlatform[wpk] = (countByWeekPlatform[wpk] ?? 0) + 1;
    }
    return distributeStandby({
      standby: ordered.map((p) => ({ id: p.id, platform: p.platform, editorialSlug: editorialOf(p) })),
      gapForEditorial: (slug) => editorialGapDays(slug ? edMap.get(slug)?.freq : undefined),
      lastByEditorial, countByDay, countByWeekPlatform, prefs, from: new Date(),
    });
  }

  type PlanRow = { post: UserPost; date: string; time: string; reason: string };

  // "IA distribui": a IA de verdade PROPÕE o calendário (dia + hora + porquê).
  // Não grava — abre o modal de revisão pra você aprovar/ajustar antes de aplicar.
  async function handleAutoDistribute() {
    const toPlace = posts.filter((p) => p.status === 'approved' && !p.scheduled_date && isVisible(p));
    if (toPlace.length === 0) {
      toast.info('Nada na fila pra distribuir.');
      return;
    }
    setDistributing(true);
    try {
      const occupied = posts
        .map((p) => ({ p, d: eventDate(p) }))
        .filter((x) => x.d)
        .map((x) => ({ date: dayKey(x.d!), platform: x.p.platform, editorial_slug: editorialOf(x.p) }));

      const res = await edge.distributeSchedule({
        today_date: format(new Date(), 'yyyy-MM-dd'),
        standby: toPlace.map((p) => ({
          id: p.id,
          platform: p.platform,
          editorial_slug: editorialOf(p),
          editorial_name: edMap.get(editorialOf(p) ?? '')?.name,
          title: (p.carousel_text?.quote as string | undefined) || p.title || p.caption || undefined,
          virality_score: p.virality_score ?? undefined,
          campaign_name: p.campaign_id ? campaignById.get(p.campaign_id)?.name : undefined,
          priority: queueInfo.get(p.id)?.rank,
          priority_label: queueInfo.get(p.id)?.label,
          window_start: queueInfo.get(p.id)?.windowStart,
          window_end: queueInfo.get(p.id)?.windowEnd,
        })),
        occupied,
        prefs: {
          skip_weekends: prefs.skip_weekends,
          per_day_limit: prefs.per_day_limit,
          start_offset_days: prefs.start_offset_days,
          platform_cadence: prefs.platform_cadence as Record<string, { per_week: number; times: string[] }>,
        },
      });

      const byId = new Map(toPlace.map((p) => [p.id, p]));
      const rows = res.plan
        .map((r): PlanRow | null => {
          const post = byId.get(r.post_id);
          return post ? { post, date: r.date, time: r.time, reason: r.reason } : null;
        })
        .filter((x): x is PlanRow => x !== null)
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

      if (!rows.length) throw new Error('plano vazio');
      setPlan({ summary: res.summary, rows });
    } catch (e) {
      console.error(e);
      // Fallback: se a IA falhar, monta o plano pela regra local pra você revisar.
      const local = localDistribute(toPlace);
      const byId = new Map(toPlace.map((p) => [p.id, p]));
      const rows = local
        .map(({ postId, date }): PlanRow | null => {
          const post = byId.get(postId);
          return post ? { post, date: format(date, 'yyyy-MM-dd'), time: format(date, 'HH:mm'), reason: 'Regra local (IA indisponível)' } : null;
        })
        .filter((x): x is PlanRow => x !== null)
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      if (rows.length) {
        setPlan({ summary: 'A IA não respondeu; usei a distribuição local. Revise e ajuste.', rows });
        toast.warning('IA indisponível — usei a regra local. Revise antes de aplicar.');
      } else {
        toast.error('Erro na distribuição.');
      }
    } finally {
      setDistributing(false);
    }
  }

  // Aplica o plano revisado: grava cada post no dia/horário propostos.
  async function applyPlan() {
    if (!plan) return;
    setApplying(true);
    try {
      let firstDate: Date | null = null;
      for (const row of plan.rows) {
        const [yy, mm, dd] = row.date.split('-').map(Number);
        const when = atTime(new Date(yy, mm - 1, dd), row.time);
        if (when.getTime() < Date.now()) continue; // segurança: nunca no passado
        await update(row.post.id, { status: 'scheduled', scheduled_date: when.toISOString() });
        if (!firstDate) firstDate = when;
      }
      toast.success(`${plan.rows.length} post(s) agendado(s).`);
      if (firstDate) setCursor(startOfMonth(firstDate));
      setPlan(null);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao aplicar o plano.');
    } finally {
      setApplying(false);
    }
  }

  // ---- Assistente semi-automático ----
  function openWizard() {
    const plats = Array.from(new Set(standby.map((p) => p.platform)));
    if (!plats.length) { toast.info('Nada em stand-by pra distribuir.'); return; }
    const cfg: Partial<Record<Platform, GuidedPlatformCfg>> = {};
    for (const pl of plats) {
      const g = guideFor(prefs, pl);
      cfg[pl] = {
        per_week: g.defaultPerWeek,
        weekdays: g.weekdays.filter((d) => d.recommended).map((d) => d.dow),
        times: g.times.filter((t) => t.recommended).map((t) => t.time),
      };
    }
    setWizPlatforms(plats);
    setWizCfg(cfg);
    setWizIdx(0);
    setWizardOpen(true);
  }

  function patchWiz(pl: Platform, patch: Partial<GuidedPlatformCfg>) {
    setWizCfg((c) => ({ ...c, [pl]: { ...(c[pl] ?? { per_week: 1, weekdays: [], times: [] }), ...patch } }));
  }
  function toggleWizDay(pl: Platform, dow: number) {
    const cur = wizCfg[pl] ?? { per_week: 1, weekdays: [], times: [] };
    patchWiz(pl, { weekdays: cur.weekdays.includes(dow) ? cur.weekdays.filter((d) => d !== dow) : [...cur.weekdays, dow] });
  }
  function toggleWizTime(pl: Platform, time: string) {
    const cur = wizCfg[pl] ?? { per_week: 1, weekdays: [], times: [] };
    patchWiz(pl, { times: cur.times.includes(time) ? cur.times.filter((t) => t !== time) : [...cur.times, time] });
  }

  function generateGuidedPlan() {
    const toPlace = standby;
    if (!toPlace.length) { setWizardOpen(false); return; }

    const ordered = [...toPlace].sort(byPriority);

    const lastByEditorial: Record<string, Date> = {};
    const countByDay: Record<string, number> = {};
    const countByWeekPlatform: Record<string, number> = {};
    for (const p of posts) {
      const d = eventDate(p);
      if (!d) continue;
      const slug = editorialOf(p) ?? '__none__';
      if (!lastByEditorial[slug] || d > lastByEditorial[slug]) lastByEditorial[slug] = d;
      countByDay[dayKey(d)] = (countByDay[dayKey(d)] ?? 0) + 1;
      countByWeekPlatform[`${weekKey(d)}|${p.platform}`] = (countByWeekPlatform[`${weekKey(d)}|${p.platform}`] ?? 0) + 1;
    }

    const result = distributeGuided({
      standby: ordered.map((p) => ({ id: p.id, platform: p.platform, editorialSlug: editorialOf(p) })),
      perPlatform: wizCfg,
      gapForEditorial: (slug) => editorialGapDays(slug ? edMap.get(slug)?.freq : undefined),
      lastByEditorial, countByDay, countByWeekPlatform,
      perDayLimit: prefs.per_day_limit,
      from: new Date(),
      startOffsetDays: prefs.start_offset_days,
    });

    const byId = new Map(toPlace.map((p) => [p.id, p]));
    const rows = result
      .map(({ postId, date }) => {
        const post = byId.get(postId);
        if (!post) return null;
        // "Porquê" qualitativo: junta o motivo do dia + do horário (do guia).
        const g = guideFor(prefs, post.platform);
        const dSug = g.weekdays.find((d) => d.dow === date.getDay());
        const tSug = g.times.find((t) => t.time === format(date, 'HH:mm'));
        const reason = [dSug?.reason, tSug?.reason].filter(Boolean).join(' · ') || 'Semi-automático';
        return { post, date: format(date, 'yyyy-MM-dd'), time: format(date, 'HH:mm'), reason };
      })
      .filter((x): x is { post: UserPost; date: string; time: string; reason: string } => x !== null)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

    setWizardOpen(false);
    if (!rows.length) {
      toast.error('Nenhum post coube nos dias/horários escolhidos. Selecione mais dias ou horários.');
      return;
    }
    const missing = toPlace.length - rows.length;
    setPlan({
      summary: `Semi-automático${missing > 0 ? ` · ${missing} post(s) não couberam nos dias escolhidos (revise ou rode de novo com mais dias)` : ''}`,
      rows,
    });
  }

  function openConfig() {
    setCfg(mergePrefs(settings?.distribution_prefs));
    setConfigOpen(true);
  }

  async function saveConfig() {
    const next: DistributionPrefs = {
      platform_times: cfg.platform_times,
      default_time: cfg.default_time,
      skip_weekends: cfg.skip_weekends,
      per_day_limit: cfg.per_day_limit,
      start_offset_days: cfg.start_offset_days,
      platform_cadence: cfg.platform_cadence,
    };
    try {
      await updateSettings({ distribution_prefs: next });
      toast.success('Preferências de distribuição salvas.');
      setConfigOpen(false);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao salvar as preferências.');
    }
  }

  // Atualiza a cadência (posts/semana + horários) de uma plataforma no cfg.
  function updateCadence(pl: Platform, patch: { per_week?: number; times?: string[] }) {
    setCfg((c) => {
      const cur = c.platform_cadence[pl] ?? { per_week: 0, times: [] };
      return { ...c, platform_cadence: { ...c.platform_cadence, [pl]: { per_week: cur.per_week, times: cur.times, ...patch } } };
    });
  }

  function togglePlatform(pl: Platform) {
    setHiddenPlatforms((prev) => {
      const n = new Set(prev);
      n.has(pl) ? n.delete(pl) : n.add(pl);
      return n;
    });
  }
  function toggleEditorial(slug: string) {
    setHiddenEditorials((prev) => {
      const n = new Set(prev);
      n.has(slug) ? n.delete(slug) : n.add(slug);
      return n;
    });
  }

  // ---- Chip de um post (arrastável) ----
  function PostChip({ post, compact, big }: { post: UserPost; compact?: boolean; big?: boolean }) {
    const color = colorOf(post);
    const label = (post.carousel_text?.quote as string | undefined) || post.title || post.caption || 'Post';
    const when = eventDate(post);
    return (
      <button
        type="button"
        draggable
        onDragStart={(e) => { e.dataTransfer.setData('text/plain', post.id); e.dataTransfer.effectAllowed = 'move'; setDraggingId(post.id); }}
        onDragEnd={() => { setDraggingId(null); setOverKey(null); }}
        onClick={() => setSelected(post)}
        className={cn(
          'group flex w-full gap-1.5 rounded-md border-l-[3px] px-1.5 py-1 text-left transition-opacity cursor-grab active:cursor-grabbing',
          big ? 'items-start py-1.5' : 'items-center',
          draggingId === post.id && 'opacity-40',
        )}
        style={{ borderLeftColor: color, backgroundColor: `${color}1F` }}
        title={label}
      >
        <PlatformIcon platform={post.platform} className={cn('shrink-0', big ? 'h-3.5 w-3.5 mt-0.5' : 'h-3 w-3')} />
        {big ? (
          <span className="min-w-0 flex-1">
            {when && <span className="mr-1 text-[11px] font-semibold text-muted-foreground">{format(when, 'HH:mm')}</span>}
            <span className="text-[12px] font-medium leading-snug line-clamp-2">{label}</span>
          </span>
        ) : (
          <span className={cn('truncate text-[11px] font-medium', compact ? 'max-w-[130px]' : '')}>
            {when && !compact ? `${format(when, 'HH:mm')} · ` : ''}{label}
          </span>
        )}
        {post.virality_score != null && (
          <span className={cn('shrink-0 text-muted-foreground', big ? 'text-[10px]' : 'ml-auto text-[9px]')}>{post.virality_score}</span>
        )}
      </button>
    );
  }

  // Sugestão da Hive aplicada direto do painel (mover dia / mover horário).
  async function applySuggestion(post: UserPost, sg: HiveSuggestion) {
    const when = eventDate(post);
    if (sg.action.kind === 'move_day') {
      const [h, m] = (when ? format(when, 'HH:mm') : cadenceFor(prefs, post.platform).times[0]).split(':').map(Number);
      await moveToDayTime(post.id, parseISO(sg.action.day), h, m);
    } else if (when) {
      const [h, m] = sg.action.time.split(':').map(Number);
      await moveToDayTime(post.id, when, h, m);
    }
  }

  // Campanhas ativas num dia (barras do calendário).
  const campaignsOn = (day: Date) => {
    const k = dayKey(day);
    return barCampaigns.filter((c) => c.start_date! <= k && k <= c.end_date!);
  };

  // Rótulo e navegação dependem da visão (mês / semana / dia).
  const headerLabel = view === 'month'
    ? format(cursor, "MMMM 'de' yyyy", { locale: ptBR })
    : view === 'week'
      ? `${format(startOfWeek(cursor, { weekStartsOn: 0 }), 'd MMM', { locale: ptBR })} – ${format(endOfWeek(cursor, { weekStartsOn: 0 }), "d MMM yyyy", { locale: ptBR })}`
      : format(cursor, "EEEE, d 'de' MMMM", { locale: ptBR });

  const goToday = () => setCursor(new Date());
  const goPrev = () => setCursor((c) =>
    view === 'month' ? new Date(c.getFullYear(), c.getMonth() - 1, 1)
      : view === 'week' ? addDays(c, -7) : addDays(c, -1));
  const goNext = () => setCursor((c) =>
    view === 'month' ? new Date(c.getFullYear(), c.getMonth() + 1, 1)
      : view === 'week' ? addDays(c, 7) : addDays(c, 1));

  // Reagendar (mudar data/hora) direto do popup do post. Fuso-safe + sem passado.
  async function rescheduleSelected(value: string) {
    if (!selected) return;
    const iso = localInputToIso(value);
    if (!iso) return;
    if (new Date(iso).getTime() < Date.now()) { toast.error('Não dá pra agendar no passado.'); return; }
    try {
      await update(selected.id, { status: 'scheduled', scheduled_date: iso });
      toast.success('Reagendado.');
    } catch (e) {
      console.error(e);
      toast.error('Erro ao reagendar.');
    }
  }

  // Bloco de um post posicionado pelo HORÁRIO na grade (arrastável verticalmente).
  function EventBlock({ post }: { post: UserPost }) {
    const when = eventDate(post);
    if (!when) return null;
    const color = colorOf(post);
    const label = (post.carousel_text?.quote as string | undefined) || post.title || post.caption || 'Post';
    const mins = (when.getHours() - GRID_START) * 60 + when.getMinutes();
    const top = Math.max(0, Math.min(SLOTS * SLOT_H - 38, (mins / SLOT_MIN) * SLOT_H));
    return (
      <button
        type="button"
        draggable
        onDragStart={(e) => { e.dataTransfer.setData('text/plain', post.id); e.dataTransfer.effectAllowed = 'move'; setDraggingId(post.id); }}
        onDragEnd={() => { setDraggingId(null); setOverKey(null); }}
        onClick={() => setSelected(post)}
        className={cn(
          'absolute left-0.5 right-0.5 z-10 overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-left cursor-grab active:cursor-grabbing',
          draggingId === post.id && 'opacity-40',
        )}
        style={{ top, height: 38, borderLeftColor: color, backgroundColor: `${color}22` }}
        title={label}
      >
        <span className="flex items-center gap-1">
          <PlatformIcon platform={post.platform} className="h-3 w-3 shrink-0" />
          <span className="text-[10px] font-semibold text-muted-foreground">{format(when, 'HH:mm')}</span>
        </span>
        <span className="block truncate text-[11px] font-medium leading-tight">{label}</span>
      </button>
    );
  }

  // Coluna de um dia na grade: 32 slots de 30min (drop zones) + os posts posicionados.
  function TimeColumn({ day }: { day: Date }) {
    const evs = eventsByDay.get(dayKey(day)) ?? [];
    return (
      <div className="relative border-l border-border first:border-l-0" style={{ height: SLOTS * SLOT_H }}>
        {Array.from({ length: SLOTS }).map((_, i) => {
          const hour = GRID_START + Math.floor(i / 2);
          const minute = (i % 2) * 30;
          const ck = `${dayKey(day)}|${i}`;
          return (
            <div
              key={i}
              className={cn('border-b', minute === 0 ? 'border-border/70' : 'border-border/25', overKey === ck && 'bg-accent/20')}
              style={{ height: SLOT_H }}
              onDragOver={(e) => { if (isPostDrag(e)) e.preventDefault(); }}
              onDragEnter={(e) => isPostDrag(e) && setOverKey(ck)}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverKey((x) => (x === ck ? null : x)); }}
              onDrop={(e) => {
                e.preventDefault(); setOverKey(null);
                const id = e.dataTransfer.getData('text/plain') || draggingId; setDraggingId(null);
                if (id) void moveToDayTime(id, day, hour, minute);
              }}
            />
          );
        })}
        {evs.map((p) => <EventBlock key={p.id} post={p} />)}
      </div>
    );
  }

  // Grade de horas (semana = 7 colunas, dia = 1). Gutter de horas à esquerda.
  function TimeGrid({ daysToShow }: { daysToShow: Date[] }) {
    const cols = daysToShow.length;
    const gridCols = { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` };
    return (
      <div>
        <div className="flex border-b border-border bg-card/20">
          <div className="w-12 shrink-0" />
          <div className="grid flex-1" style={gridCols}>
            {daysToShow.map((day) => (
              <button
                key={dayKey(day)}
                type="button"
                onClick={() => { setCursor(day); setView('day'); }}
                className={cn('border-l border-border py-1.5 text-center text-[11px] font-semibold capitalize first:border-l-0',
                  isToday(day) ? 'text-accent' : 'text-muted-foreground')}
              >
                {format(day, cols === 1 ? "EEEE, d 'de' MMMM" : 'EEE d', { locale: ptBR })}
              </button>
            ))}
          </div>
        </div>
        {barCampaigns.some((c) => daysToShow.some((d) => campaignsOn(d).includes(c))) && (
          <div className="flex border-b border-border bg-card/10 py-1">
            <div className="w-12 shrink-0" />
            <div className="grid flex-1 gap-y-0.5" style={gridCols}>
              {barCampaigns.map((c) => {
                const idx = daysToShow.map((d, i) => (campaignsOn(d).includes(c) ? i : -1)).filter((i) => i >= 0);
                if (!idx.length) return null;
                return (
                  <button key={c.id} type="button" onClick={() => setLens(lens === c.id ? null : c.id)} data-testid="campaign-bar"
                    className="mx-0.5 truncate rounded px-1.5 text-left text-[10px] font-semibold leading-4 text-white"
                    style={{ gridColumn: `${idx[0] + 1} / ${idx[idx.length - 1] + 2}`, backgroundColor: c.color ?? NEUTRAL }} title={c.name}>
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="flex max-h-[64vh] overflow-y-auto">
          <div className="w-12 shrink-0" style={{ height: SLOTS * SLOT_H }}>
            {Array.from({ length: GRID_END - GRID_START }).map((_, h) => (
              <div key={h} className="relative" style={{ height: SLOT_H * 2 }}>
                <span className="absolute right-1.5 -top-1.5 text-[10px] text-muted-foreground">
                  {String(GRID_START + h).padStart(2, '0')}h
                </span>
              </div>
            ))}
          </div>
          <div className="grid flex-1" style={gridCols}>
            {daysToShow.map((day) => <TimeColumn key={dayKey(day)} day={day} />)}
          </div>
        </div>
      </div>
    );
  }

  // Célula de um dia (drop zone + cabeçalho + chips). Tamanho por visão.
  function DayCell({ day }: { day: Date }) {
    const k = dayKey(day);
    const dayEvents = eventsByDay.get(k) ?? [];
    const inMonth = view !== 'month' || isSameMonth(day, cursor);
    const over = overKey === k;
    const tall = view === 'week' ? 'min-h-[58vh]' : view === 'day' ? 'min-h-[62vh]' : 'min-h-[104px]';
    return (
      <div
        data-testid={`day-${k}`}
        className={cn(
          'border-b border-r border-border p-1 flex flex-col gap-1 transition-colors', tall,
          !inMonth && 'bg-muted/30',
          over && 'bg-accent/10 ring-1 ring-inset ring-accent',
        )}
        onDragOver={(e) => { if (isPostDrag(e)) e.preventDefault(); }}
        onDragEnter={(e) => isPostDrag(e) && setOverKey(k)}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverKey((x) => (x === k ? null : x)); }}
        onDrop={(e) => {
          e.preventDefault(); setOverKey(null);
          const id = e.dataTransfer.getData('text/plain') || draggingId; setDraggingId(null);
          if (id) void moveToDay(id, day);
        }}
      >
        <div className={cn('flex items-center', view === 'month' ? 'justify-end' : 'justify-between')}>
          {view !== 'month' && (
            <span className="text-xs font-semibold capitalize text-muted-foreground">
              {format(day, view === 'day' ? "EEEE" : 'EEE d', { locale: ptBR })}
            </span>
          )}
          <span className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px]',
            isToday(day) ? 'bg-accent text-accent-foreground font-bold' : inMonth ? 'text-foreground' : 'text-muted-foreground')}>
            {format(day, 'd')}
          </span>
        </div>
        {campaignsOn(day).map((c) => {
          const k2 = dayKey(day);
          const showName = k2 === c.start_date || day.getDay() === 0;
          return (
            <button key={c.id} type="button" onClick={() => setLens(lens === c.id ? null : c.id)} data-testid="campaign-bar"
              className={cn('-mx-1 h-3.5 truncate px-1 text-left text-[9px] font-semibold leading-[14px] text-white',
                k2 === c.start_date && 'ml-0 rounded-l', k2 === c.end_date && 'mr-0 rounded-r')}
              style={{ backgroundColor: c.color ?? NEUTRAL }} title={c.name}>
              {showName ? c.name : '\u00a0'}
            </button>
          );
        })}
        <div className={cn('space-y-1 overflow-y-auto', view === 'month' && 'flex-1')}>
          {dayEvents.length === 0 && view !== 'month'
            ? <p className="py-4 text-center text-[11px] text-muted-foreground">Sem posts</p>
            : dayEvents.map((p) => <PostChip key={p.id} post={p} big={view !== 'month'} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6 lg:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <CalendarClock className="h-6 w-6 text-accent" /> Agenda
          </h1>
          <p className="text-sm text-muted-foreground">
            {lens && campaignById.get(lens)
              ? <>Programação da campanha <b className="text-foreground" data-testid="lens-name">{campaignById.get(lens)!.name}</b>.</>
              : 'Planeje, visualize e ajuste a publicação dos seus conteúdos.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={openConfig}>
            <Settings2 className="h-4 w-4 mr-1" /> Configurar
          </Button>
          <Button variant="outline" size="sm" onClick={openWizard}>
            <Wand2 className="h-4 w-4 mr-1" /> Semi-auto
          </Button>
          <Button variant="accent" size="sm" onClick={() => void handleAutoDistribute()} disabled={distributing}>
            {distributing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
            IA distribuir
          </Button>
        </div>
      </header>

      <CampaignTimeline campaigns={campaigns.filter((c) => c.status !== 'draft')} lens={lens} onLens={setLens} />

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="space-y-4">
        {/* Bandeja de stand-by (drop pra devolver ao stand-by) */}
        <aside
          className={cn('space-y-2 rounded-lg border border-dashed p-3 transition-colors',
            overKey === '__standby__' ? 'border-accent bg-accent/5' : 'border-border')}
          onDragOver={(e) => { if (isPostDrag(e)) e.preventDefault(); }}
          onDragEnter={(e) => isPostDrag(e) && setOverKey('__standby__')}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverKey((k) => (k === '__standby__' ? null : k)); }}
          onDrop={(e) => {
            e.preventDefault(); setOverKey(null);
            const id = e.dataTransfer.getData('text/plain') || draggingId; setDraggingId(null);
            const post = posts.find((p) => p.id === id);
            if (post && eventDate(post)) void backToStandby(post);
          }}
        >
          <div className="max-h-[70vh] overflow-y-auto pr-1">
            <ScheduleQueue
              groups={queueGroups} lens={lens} draggingId={draggingId}
              onDragStart={(p) => setDraggingId(p.id)}
              onDragEnd={() => { setDraggingId(null); setOverKey(null); }}
              onSelect={(p) => setSelected(p)}
            />
          </div>
        </aside>

        {/* Filtros / etiquetas — abaixo do stand-by (estilo "minhas agendas") */}
        {(presentPlatforms.length > 0 || presentEditorials.length > 0) && (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Filter className="h-4 w-4 text-muted-foreground" /> Filtros
            </p>

            {presentPlatforms.length > 0 && (
              <div className="space-y-0.5">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Plataforma</p>
                {presentPlatforms.map((pl) => {
                  const off = hiddenPlatforms.has(pl);
                  return (
                    <button
                      key={pl}
                      onClick={() => togglePlatform(pl)}
                      className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-secondary"
                    >
                      <span
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border"
                        style={{ backgroundColor: off ? 'transparent' : PLATFORM_COLORS[pl], borderColor: PLATFORM_COLORS[pl] }}
                      >
                        {!off && <Check className="h-3 w-3 text-white" />}
                      </span>
                      <PlatformIcon platform={pl} className="h-3.5 w-3.5 shrink-0" />
                      <span className={cn('text-xs', off && 'text-muted-foreground')}>{PLATFORM_LABELS[pl]}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {presentEditorials.length > 0 && (
              <div className="space-y-0.5">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Editorial</p>
                {presentEditorials.map((ed) => {
                  const off = hiddenEditorials.has(ed.slug);
                  return (
                    <button
                      key={ed.slug}
                      onClick={() => toggleEditorial(ed.slug)}
                      className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-secondary"
                    >
                      <span
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border"
                        style={{ backgroundColor: off ? 'transparent' : ed.color, borderColor: ed.color }}
                      >
                        {!off && <Check className="h-3 w-3 text-white" />}
                      </span>
                      <span className={cn('truncate text-xs', off && 'text-muted-foreground')}>{ed.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        </div>

        {/* Calendário */}
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card/40 px-3 py-2">
            <span className="font-display font-semibold capitalize">{headerLabel}</span>
            <div className="flex items-center gap-2">
              <div className="flex overflow-hidden rounded-md border border-border">
                {(['month', 'week', 'day'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={cn('px-2.5 py-1 text-xs font-medium transition-colors',
                      view === v ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary')}
                  >
                    {v === 'month' ? 'Mês' : v === 'week' ? 'Semana' : 'Dia'}
                  </button>
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={goToday}>Hoje</Button>
              <Button variant="ghost" size="icon" onClick={goPrev}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={goNext}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>

          {view === 'month' ? (
            <>
              <div className="grid grid-cols-7 border-b border-border bg-card/20 text-center text-[11px] font-semibold text-muted-foreground">
                {WEEKDAYS.map((w) => <div key={w} className="py-1.5">{w}</div>)}
              </div>
              <div className="grid grid-cols-7">
                {days.map((day) => <DayCell key={dayKey(day)} day={day} />)}
              </div>
            </>
          ) : (
            // Semana e dia: grade de horas com arrasto vertical (muda o horário)
            // e, na semana, arrasto entre colunas (muda o dia).
            <TimeGrid daysToShow={days} />
          )}
        </div>
      </div>

      {/* Painel lateral da peça (Tela 13): contexto da campanha, data/hora, sugestões da Hive e ações. */}
      {selected && (() => {
        const slug = editorialOf(selected);
        const ed = slug ? edMap.get(slug) : undefined;
        const when = eventDate(selected);
        const quote = selected.carousel_text?.quote as string | undefined;
        const camp = selected.campaign_id ? campaignById.get(selected.campaign_id) : undefined;
        const cyc = selected.cycle_id ? cycleById.get(selected.cycle_id) : undefined;
        const info = queueInfo.get(selected.id);
        const tips = suggestionsFor(selected, cyc);
        const imgs = Object.values(selected.rendered_slides ?? {}).filter(Boolean);
        const shown = imgs.length ? imgs : Object.values(selected.generated_images ?? {}).filter(Boolean);
        const isPublished = selected.status === 'published';
        return (
          <>
            <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setSelected(null)} aria-hidden />
            <aside role="dialog" aria-label="Detalhes da peça" data-testid="piece-panel"
              className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-background shadow-2xl">
              <div className="flex items-start justify-between gap-2 border-b p-4">
                <div className="min-w-0">
                  {camp ? (
                    <p className="flex items-center gap-2 text-xs font-semibold">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: camp.color ?? NEUTRAL }} />
                      <span className="truncate" data-testid="panel-campaign">{camp.name}</span>
                      {cyc && <span className="shrink-0 font-normal text-muted-foreground">· Ciclo {String(cyc.idx).padStart(2, '0')} · {formatRange(cyc.start_date, cyc.end_date)}</span>}
                    </p>
                  ) : <p className="text-xs text-muted-foreground">Sem campanha{ed ? ` · ${ed.name}` : ''}</p>}
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><PlatformIcon platform={selected.platform} className="h-3.5 w-3.5" />{PLATFORM_LABELS[selected.platform]}</span>
                    {selected.codigo && <Badge variant="outline" className="font-mono text-[10px]">{selected.codigo}</Badge>}
                    {selected.virality_score != null && <span>🚀 {selected.virality_score}/100</span>}
                    <Badge variant="secondary" className="text-[10px]">{isPublished ? 'Publicado' : when ? 'Agendado' : 'Para agendar'}</Badge>
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelected(null)} aria-label="Fechar"><X className="h-4 w-4" /></Button>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                {shown.length ? (
                  <div className={cn('flex gap-2', shown.length > 1 ? 'overflow-x-auto pb-1 snap-x' : '')}>
                    {shown.map((url, i) => (
                      <img key={i} src={url} alt={`Slide ${i + 1}`}
                        className={cn('rounded-md border border-border object-contain snap-center', fullView ? 'max-h-none' : 'max-h-[38vh]', shown.length > 1 ? 'w-auto shrink-0' : 'mx-auto w-full')} />
                    ))}
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                    Esta peça ainda não tem imagem final renderizada. Abra em “Editar” pra gerar.
                  </p>
                )}
                {quote && <p className="font-display text-base font-medium leading-relaxed">"{quote}"</p>}

                {!isPublished && (
                  <div className="space-y-1 rounded-md border border-border p-2.5" data-testid="panel-move">
                    <Label className="text-xs text-muted-foreground">{when ? 'Mover (data e hora)' : 'Agendar (data e hora)'}</Label>
                    <Input type="datetime-local" className="h-8 text-xs" min={nowLocalInput()}
                      value={isoToLocalInput(selected.scheduled_date)} onChange={(e) => void rescheduleSelected(e.target.value)} />
                  </div>
                )}

                {!when && info && (
                  <div className="flex items-start gap-2 rounded-md border bg-accent/5 p-2.5 text-xs">
                    <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                    <div className="flex-1">
                      <p><b>Hive sugere:</b> {formatRange(info.windowStart, info.windowEnd)} · {info.label} prioridade ({info.rank}ª da campanha)</p>
                      <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" data-testid="panel-schedule-window"
                        onClick={() => void moveToDay(selected.id, parseISO(info.windowStart))}>Agendar na janela sugerida</Button>
                    </div>
                  </div>
                )}

                {tips.length > 0 && (
                  <div className="space-y-2" data-testid="panel-suggestions">
                    <p className="flex items-center gap-1.5 text-xs font-semibold"><Sparkles className="h-3.5 w-3.5 text-accent" /> Hive sugere</p>
                    {tips.map((t) => (
                      <div key={t.id} className="flex items-start gap-2 rounded-md border p-2.5 text-xs" data-testid="panel-suggestion">
                        <div className="flex-1"><p className="font-semibold">{t.title}</p><p className="text-muted-foreground">{t.detail}</p></div>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void applySuggestion(selected, t)}>Aplicar</Button>
                      </div>
                    ))}
                  </div>
                )}

                {selected.caption && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Legenda / Texto</Label>
                    <p className={cn('whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground', !fullView && 'line-clamp-6')} data-testid="panel-caption">{selected.caption}</p>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t p-3">
                <Button variant="accent" size="sm" onClick={() => navigate(`/posts/${selected.id}`)}><Edit3 className="mr-1 h-4 w-4" /> Editar</Button>
                <Button variant="outline" size="sm" onClick={() => setFullView((v) => !v)} data-testid="panel-full">{fullView ? 'Ver resumo' : 'Ver versão completa'}</Button>
                {when && !isPublished && (
                  <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void backToStandby(selected)} data-testid="panel-unschedule">
                    <PauseCircle className="mr-1 h-4 w-4" /> Remover da agenda
                  </Button>
                )}
              </div>
            </aside>
          </>
        );
      })()}

      {/* Diálogo: configuração da distribuição automática */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configurar distribuição</DialogTitle>
            <DialogDescription>
              Regras que a "IA distribui" usa. Nada é fixo — você define aqui.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Cadência por rede</Label>
              <p className="text-[11px] text-muted-foreground -mt-1">
                Quantos posts por semana e em quais horários. A "IA distribui" respeita esse padrão (e alterna os horários).
              </p>
              {PLATFORM_ORDER.map((pl) => {
                const cad = cfg.platform_cadence[pl] ?? { per_week: 0, times: [] };
                return (
                  <div key={pl} className="rounded-md border p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        <PlatformIcon platform={pl} className="h-3.5 w-3.5" /> {PLATFORM_LABELS[pl]}
                      </span>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Input
                          type="number" min={0} max={14}
                          className="h-7 w-14 text-center"
                          value={cad.per_week}
                          onChange={(e) => updateCadence(pl, { per_week: Math.max(0, Number(e.target.value) || 0) })}
                        />
                        por semana <span className="text-[10px]">(0 = sem limite)</span>
                      </label>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Horários (alternados)</Label>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {cad.times.map((t, i) => (
                          <span key={i} className="inline-flex items-center gap-0.5 rounded-md border bg-secondary/40 pl-1">
                            <Input
                              type="time"
                              className="h-7 w-[92px] border-0 bg-transparent px-1"
                              value={t}
                              onChange={(e) => {
                                const times = [...cad.times]; times[i] = e.target.value;
                                updateCadence(pl, { times });
                              }}
                            />
                            <button
                              type="button"
                              className="px-1 text-muted-foreground hover:text-destructive"
                              title="Remover horário"
                              onClick={() => updateCadence(pl, { times: cad.times.filter((_, j) => j !== i) })}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                        <button
                          type="button"
                          className="rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground hover:border-accent hover:text-accent"
                          onClick={() => updateCadence(pl, { times: [...cad.times, cad.times[cad.times.length - 1] ?? '12:00'] })}
                        >
                          + horário
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="deftime" className="text-xs">Horário padrão</Label>
                <Input id="deftime" type="time" className="h-8" value={cfg.default_time}
                  onChange={(e) => setCfg((c) => ({ ...c, default_time: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="perday" className="text-xs">Posts por dia</Label>
                <Input id="perday" type="number" min={1} max={10} className="h-8" value={cfg.per_day_limit}
                  onChange={(e) => setCfg((c) => ({ ...c, per_day_limit: Math.max(1, Number(e.target.value) || 1) }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="offset" className="text-xs">Começar em (dias)</Label>
                <Input id="offset" type="number" min={0} max={60} className="h-8" value={cfg.start_offset_days}
                  onChange={(e) => setCfg((c) => ({ ...c, start_offset_days: Math.max(0, Number(e.target.value) || 0) }))} />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm cursor-pointer pb-1">
                  <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--accent))]" checked={cfg.skip_weekends}
                    onChange={(e) => setCfg((c) => ({ ...c, skip_weekends: e.target.checked }))} />
                  Pular fim de semana
                </label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfigOpen(false)}>Cancelar</Button>
            <Button variant="accent" onClick={() => void saveConfig()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Plano proposto pela IA — revisão antes de aplicar (curadoria humana). */}
      <Dialog open={!!plan} onOpenChange={(o) => !o && !applying && setPlan(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-accent" /> Plano de distribuição da IA
            </DialogTitle>
            <DialogDescription>
              {plan?.summary || 'Revise dia, horário e o porquê de cada post. Nada é agendado até você aplicar.'}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {plan?.rows.map((row) => {
              const slug = editorialOf(row.post);
              const ed = slug ? edMap.get(slug) : undefined;
              const label = (row.post.carousel_text?.quote as string | undefined) || row.post.title || row.post.caption || 'Post';
              const [yy, mm, dd] = row.date.split('-').map(Number);
              const dayLabel = format(new Date(yy, mm - 1, dd), "EEE, d 'de' MMM", { locale: ptBR });
              return (
                <div key={row.post.id} className="rounded-lg border border-border p-2.5">
                  <div className="flex items-center gap-2">
                    <PlatformIcon platform={row.post.platform} className="h-3.5 w-3.5 shrink-0" />
                    {ed && (
                      <Badge variant="secondary" className="shrink-0" style={{ backgroundColor: `${ed.color}22`, color: ed.color }}>
                        {ed.name}
                      </Badge>
                    )}
                    <span className="ml-auto shrink-0 text-xs font-semibold capitalize text-foreground">
                      {dayLabel} · {row.time}
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[13px] font-medium leading-snug">{label}</p>
                  {row.reason && (
                    <p className="mt-1 text-[11px] italic text-muted-foreground">↳ {row.reason}</p>
                  )}
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPlan(null)} disabled={applying}>Cancelar</Button>
            <Button variant="accent" onClick={() => void applyPlan()} disabled={applying}>
              {applying ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
              Aplicar {plan ? `(${plan.rows.length})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assistente semi-automático — frequência/dias/horários por plataforma */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="sm:max-w-lg">
          {(() => {
            const pl = wizPlatforms[wizIdx];
            if (!pl) return null;
            const cfg = wizCfg[pl] ?? { per_week: 1, weekdays: [], times: [] };
            const g = guideFor(prefs, pl);
            const daysSorted = [...g.weekdays].sort((a, b) => (a.dow === 0 ? 7 : a.dow) - (b.dow === 0 ? 7 : b.dow));
            const isLast = wizIdx >= wizPlatforms.length - 1;
            const canAdvance = cfg.weekdays.length > 0 && cfg.times.length > 0;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Wand2 className="h-5 w-5 text-accent" /> Distribuição semi-automática
                  </DialogTitle>
                  <DialogDescription>
                    Plataforma {wizIdx + 1} de {wizPlatforms.length}: <b className="capitalize">{PLATFORM_LABELS[pl] ?? pl}</b>. Escolha frequência, dias e horários. As dicas são de boa prática geral — ainda não são seus dados reais.
                  </DialogDescription>
                </DialogHeader>

                <div className="max-h-[58vh] space-y-4 overflow-y-auto pr-1">
                  <div>
                    <p className="mb-1.5 text-sm font-semibold">Quantos posts por semana?</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Button key={n} type="button" size="sm" variant={cfg.per_week === n ? 'accent' : 'outline'}
                          onClick={() => patchWiz(pl, { per_week: n })}>
                          {n}x
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-1.5 text-sm font-semibold">Dias da semana</p>
                    <div className="space-y-1">
                      {daysSorted.map((d) => {
                        const on = cfg.weekdays.includes(d.dow);
                        return (
                          <button key={d.dow} type="button" onClick={() => toggleWizDay(pl, d.dow)}
                            className={cn('flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors',
                              on ? 'border-accent bg-accent/10' : 'border-border hover:bg-muted/50')}>
                            <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', on ? 'border-accent bg-accent text-accent-foreground' : 'border-muted-foreground/40')}>
                              {on && <Check className="h-3 w-3" />}
                            </span>
                            <span className="w-9 shrink-0 text-sm font-medium">{d.label}</span>
                            <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">{d.reason}</span>
                            {d.recommended && <Badge variant="secondary" className="shrink-0 text-[10px]">sugerido</Badge>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="mb-1.5 text-sm font-semibold">Horários</p>
                    <div className="space-y-1">
                      {g.times.map((t) => {
                        const on = cfg.times.includes(t.time);
                        return (
                          <button key={t.time} type="button" onClick={() => toggleWizTime(pl, t.time)}
                            className={cn('flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors',
                              on ? 'border-accent bg-accent/10' : 'border-border hover:bg-muted/50')}>
                            <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', on ? 'border-accent bg-accent text-accent-foreground' : 'border-muted-foreground/40')}>
                              {on && <Check className="h-3 w-3" />}
                            </span>
                            <span className="w-12 shrink-0 text-sm font-medium">{t.label}</span>
                            <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">{t.reason}</span>
                            {t.recommended && <Badge variant="secondary" className="shrink-0 text-[10px]">sugerido</Badge>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <DialogFooter className="flex-row items-center justify-between sm:justify-between">
                  <Button variant="ghost" onClick={() => setWizIdx((i) => Math.max(0, i - 1))} disabled={wizIdx === 0}>
                    Voltar
                  </Button>
                  {isLast ? (
                    <Button variant="accent" onClick={generateGuidedPlan} disabled={!canAdvance}>
                      <Check className="h-4 w-4 mr-1" /> Gerar plano
                    </Button>
                  ) : (
                    <Button variant="accent" onClick={() => setWizIdx((i) => i + 1)} disabled={!canAdvance}>
                      Próxima
                    </Button>
                  )}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
