// Agenda de conteúdo — calendário estilo Google Agenda. NÃO substitui o Kanban:
// é outra visão, focada em QUANDO cada post vai ao ar.
//
// - Grid do mês (date-fns/ptBR). Posts com data aparecem no dia.
// - Bandeja de stand-by (aprovados sem data) → arraste pro dia (ou "IA distribui").
// - Cor do card = cor da editoria (vinda do banco, customizável). Ícone = rede social.
// - Filtros de plataforma e editoria (derivados dos dados, não fixos).
// - Clique no card → popup com o conteúdo completo + editar.
// Regras da distribuição automática saem de user_settings.distribution_prefs.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  addDays, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth,
  isToday, startOfMonth, startOfWeek,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { LucideIcon } from 'lucide-react';
import {
  CalendarClock, Check, ChevronLeft, ChevronRight, Edit3, Facebook, Filter, Instagram,
  Linkedin, Loader2, Music2, PauseCircle, Settings2, Sparkles, Youtube,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { usePostStore } from '@/store/postStore';
import { useAuthStore } from '@/store/authStore';
import { beeApi } from '@/lib/api';
import {
  DEFAULT_DISTRIBUTION, atTime, cadenceFor, distributeStandby, editorialGapDays,
  isoToLocalInput, localInputToIso, mergePrefs, nowLocalInput, weekKey, type MergedPrefs,
} from '@/lib/schedule';
import {
  PLATFORM_COLORS, PLATFORM_LABELS, type BeeEditorial, type DistributionPrefs,
  type Platform, type UserPost,
} from '@/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const NEUTRAL = '#94A3B8';
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const PLATFORM_ORDER: Platform[] = ['linkedin', 'instagram', 'facebook', 'tiktok', 'youtube'];

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
  const [selected, setSelected] = useState<UserPost | null>(null);
  const [distributing, setDistributing] = useState(false);

  // Filtros: guardamos o que está ESCONDIDO (vazio = tudo visível).
  const [hiddenPlatforms, setHiddenPlatforms] = useState<Set<string>>(new Set());
  const [hiddenEditorials, setHiddenEditorials] = useState<Set<string>>(new Set());

  // Config da distribuição (diálogo)
  const [configOpen, setConfigOpen] = useState(false);
  const [cfg, setCfg] = useState<MergedPrefs>(DEFAULT_DISTRIBUTION);

  useEffect(() => {
    void load();
    void beeApi.listEditorials().then(setEditorials).catch(console.error);
  }, [load]);

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
    !hiddenPlatforms.has(p.platform) && !hiddenEditorials.has(editorialOf(p) ?? '__none__');

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
    [posts, hiddenPlatforms, hiddenEditorials],
  );

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
  }, [posts, hiddenPlatforms, hiddenEditorials]);

  // ---- Ações ----
  async function moveToDay(postId: string, day: Date) {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    const existing = eventDate(post);
    // Mantém o horário se já tinha; senão usa o 1º horário da cadência da plataforma.
    const time = existing ? format(existing, 'HH:mm') : cadenceFor(prefs, post.platform).times[0];
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
      toast.info('Voltou pro stand-by.');
      setSelected(null);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao remover do calendário.');
    }
  }

  async function handleAutoDistribute() {
    const toPlace = posts.filter((p) => p.status === 'approved' && !p.scheduled_date && isVisible(p));
    if (toPlace.length === 0) {
      toast.info('Nada em stand-by pra distribuir.');
      return;
    }
    setDistributing(true);
    try {
      // Prioridade: melhor nota primeiro; empate pelo mais antigo.
      const ordered = [...toPlace].sort((a, b) => {
        const sa = a.virality_score ?? -1;
        const sb = b.virality_score ?? -1;
        if (sb !== sa) return sb - sa;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

      // Estado do que já está no calendário (respeita ritmo, limite por dia e
      // a cadência semanal por plataforma).
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

      const plan = distributeStandby({
        standby: ordered.map((p) => ({ id: p.id, platform: p.platform, editorialSlug: editorialOf(p) })),
        gapForEditorial: (slug) => editorialGapDays(slug ? edMap.get(slug)?.freq : undefined),
        lastByEditorial,
        countByDay,
        countByWeekPlatform,
        prefs,
        from: new Date(),
      });

      for (const { postId, date } of plan) {
        await update(postId, { status: 'scheduled', scheduled_date: date.toISOString() });
      }
      toast.success(`A IA distribuiu ${plan.length} post(s) no calendário.`);
      if (plan.length && plan[0].date) setCursor(startOfMonth(plan[0].date));
    } catch (e) {
      console.error(e);
      toast.error('Erro na distribuição automática.');
    } finally {
      setDistributing(false);
    }
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
      setSelected((s) => (s ? { ...s, scheduled_date: iso, status: 'scheduled' } : s));
      toast.success('Reagendado.');
    } catch (e) {
      console.error(e);
      toast.error('Erro ao reagendar.');
    }
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
        className={cn(
          'border-b border-r border-border p-1 flex flex-col gap-1 transition-colors', tall,
          !inMonth && 'bg-muted/30',
          over && 'bg-accent/10 ring-1 ring-inset ring-accent',
        )}
        onDragOver={(e) => { if (draggingId) e.preventDefault(); }}
        onDragEnter={() => draggingId && setOverKey(k)}
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
            <CalendarClock className="h-6 w-6 text-accent" /> Agenda de Conteúdo
          </h1>
          <p className="text-sm text-muted-foreground">
            Arraste os posts em stand-by pro dia, ou deixe a IA distribuir.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={openConfig}>
            <Settings2 className="h-4 w-4 mr-1" /> Configurar
          </Button>
          <Button variant="accent" size="sm" onClick={() => void handleAutoDistribute()} disabled={distributing}>
            {distributing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
            IA distribui
          </Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <div className="space-y-4">
        {/* Bandeja de stand-by (drop pra devolver ao stand-by) */}
        <aside
          className={cn('space-y-2 rounded-lg border border-dashed p-3 transition-colors',
            overKey === '__standby__' ? 'border-accent bg-accent/5' : 'border-border')}
          onDragOver={(e) => { if (draggingId) e.preventDefault(); }}
          onDragEnter={() => draggingId && setOverKey('__standby__')}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverKey((k) => (k === '__standby__' ? null : k)); }}
          onDrop={(e) => {
            e.preventDefault(); setOverKey(null);
            const id = e.dataTransfer.getData('text/plain') || draggingId; setDraggingId(null);
            const post = posts.find((p) => p.id === id);
            if (post && eventDate(post)) void backToStandby(post);
          }}
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <PauseCircle className="h-4 w-4 text-muted-foreground" /> Stand-by
            <Badge variant="secondary" className="ml-auto">{standby.length}</Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">Aprovados sem data. Arraste pro dia.</p>
          <div className="space-y-1.5 max-h-[42vh] overflow-y-auto pr-1">
            {standby.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Nada em stand-by.</p>
            ) : (
              standby.map((p) => <PostChip key={p.id} post={p} compact />)
            )}
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

          {view === 'day' ? (
            <DayCell day={cursor} />
          ) : (
            <>
              <div className="grid grid-cols-7 border-b border-border bg-card/20 text-center text-[11px] font-semibold text-muted-foreground">
                {WEEKDAYS.map((w) => <div key={w} className="py-1.5">{w}</div>)}
              </div>
              <div className="grid grid-cols-7">
                {days.map((day) => <DayCell key={dayKey(day)} day={day} />)}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Popup: conteúdo completo do post */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-lg">
          {selected && (() => {
            const slug = editorialOf(selected);
            const ed = slug ? edMap.get(slug) : undefined;
            const when = eventDate(selected);
            const quote = selected.carousel_text?.quote as string | undefined;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: colorOf(selected) }} />
                    {ed?.name ?? selected.title ?? 'Post'}
                  </DialogTitle>
                  <DialogDescription className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="inline-flex items-center gap-1"><PlatformIcon platform={selected.platform} className="h-3.5 w-3.5" />{PLATFORM_LABELS[selected.platform]}</span>
                    {selected.codigo && <Badge variant="outline" className="font-mono text-[10px]">{selected.codigo}</Badge>}
                    {when && <span>📅 {format(when, "d 'de' MMM 'às' HH:mm", { locale: ptBR })}</span>}
                    {selected.virality_score != null && <span>🚀 {selected.virality_score}/100</span>}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-2 max-h-[50vh] overflow-y-auto">
                  {when && (
                    <div className="space-y-1 rounded-md border border-border p-2">
                      <Label className="text-xs text-muted-foreground">Reagendar (data e hora)</Label>
                      <Input
                        type="datetime-local"
                        className="h-8 text-xs"
                        min={nowLocalInput()}
                        value={isoToLocalInput(selected.scheduled_date)}
                        onChange={(e) => void rescheduleSelected(e.target.value)}
                      />
                    </div>
                  )}
                  {quote && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Título / Frase</Label>
                      <p className="font-display text-base font-medium leading-relaxed">"{quote}"</p>
                    </div>
                  )}
                  {selected.caption && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Legenda / Texto</Label>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{selected.caption}</p>
                    </div>
                  )}
                </div>

                <DialogFooter className="gap-2 sm:justify-between">
                  {when ? (
                    <Button variant="ghost" onClick={() => void backToStandby(selected)}>
                      <PauseCircle className="h-4 w-4 mr-1" /> Voltar pro stand-by
                    </Button>
                  ) : <span />}
                  <Button variant="accent" onClick={() => navigate(`/posts/${selected.id}`)}>
                    <Edit3 className="h-4 w-4 mr-1" /> Editar
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

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
    </div>
  );
}
