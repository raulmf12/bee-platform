// PIPELINE editorial (Kanban) — "Seu fluxo de conteúdo, do planejamento à publicação."
// 1 card = 1 ideia do backlog ou 1 conteúdo com suas peças (D10). A campanha aparece
// discretamente; o protagonista é a ideia/conteúdo. Banner da Hive acima das colunas.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, ArrowRight, Check, ImageIcon, Instagram, Layers, Linkedin, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { ideaApi } from '@/lib/campaignApi';
import { usePostStore } from '@/store/postStore';
import { Button } from '@/components/ui/button';
import { beeApi } from '@/lib/api';
import { postClickRoute } from '@/lib/postReview';
import { useOps } from '@/lib/campaign/useOps';
import { dueLabel, pendingItems } from '@/lib/campaign/home';
import {
  NO_FILTER, PIPELINE_COLUMNS, buildPipeline, filterCards, sortColumn, stageOfPost,
  type PipelineCard, type PipelineColumn, type PipelineFilter,
} from '@/lib/campaign/pipeline';
import { FUNCTION_COLORS, FUNCTION_SHORT, type BeeEditorial, type CampaignCycle, type IdeaChannel, type UserPost } from '@/types';
import { cn } from '@/lib/utils';

const PAGE = 6;
const NET = (p: string) => (p === 'linkedin' ? 'LinkedIn' : p === 'instagram' ? 'Instagram' : p);
const STATUS_LABEL: Record<PipelineColumn, string> = {
  ideias: 'Ideia', rascunho: 'Rascunho', pendente: 'Para revisar', aprovado: 'Aprovada', agendado: 'Agendada', publicado: 'Publicada',
};

function NetIcon({ platform, className = 'h-3 w-3' }: { platform: string; className?: string }) {
  return platform === 'linkedin' ? <Linkedin className={cn(className, 'text-[#0A66C2]')} /> : <Instagram className={cn(className, 'text-[#E1306C]')} />;
}

export function Pipeline() {
  const navigate = useNavigate();
  const { ops, posts, reload } = useOps();
  const removePost = usePostStore((s) => s.delete);
  const [params, setParams] = useSearchParams();
  const [editorials, setEditorials] = useState<BeeEditorial[]>([]);
  const [more, setMore] = useState<Record<string, boolean>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [f, setF] = useState<PipelineFilter>({ ...NO_FILTER, campaign: params.get('campaign') ?? 'all', cycle: params.get('cycle') ?? 'all' });

  useEffect(() => { void beeApi.listEditorials().then(setEditorials).catch(() => {}); }, []);
  useEffect(() => {
    const n = new URLSearchParams();
    if (f.campaign !== 'all') n.set('campaign', f.campaign);
    if (f.cycle !== 'all') n.set('cycle', f.cycle);
    setParams(n, { replace: true });
  }, [f.campaign, f.cycle, setParams]);
  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId]);

  const cards = useMemo(() => (ops ? buildPipeline({ campaigns: ops.campaigns, ideas: ops.ideas, contents: ops.contents, posts }) : []), [ops, posts]);
  const visible = useMemo(() => filterCards(cards, f), [cards, f]);
  const cycles = ops?.cycles ?? [];
  const cycleOf = (id: string | null) => cycles.find((c) => c.id === id);
  const campaignOf = (id: string | null) => ops?.campaigns.find((c) => c.id === id);
  const edName = (slug: string | null) => editorials.find((e) => e.slug === slug)?.name ?? null;
  const today = new Date();
  const todayISO = format(today, 'yyyy-MM-dd');

  // Banner: a pendência de ciclo mais urgente (na campanha filtrada, se houver).
  const banner = useMemo(() => {
    if (!ops) return null;
    const items = pendingItems({ ...ops, posts }).filter((p) => ['start', 'plan', 'pauta', 'develop', 'validate', 'review'].includes(p.kind) && p.campaignId);
    return items.find((p) => f.campaign === 'all' || p.campaignId === f.campaign) ?? null;
  }, [ops, posts, f.campaign]);

  const campaignCycles = f.campaign !== 'all' && f.campaign !== 'none' ? cycles.filter((c) => c.campaign_id === f.campaign).sort((a, b) => a.idx - b.idx) : [];
  const cycleLabel = (c?: CampaignCycle) => {
    if (!c) return null;
    if (c.start_date <= todayISO && todayISO <= c.end_date) return 'Esta semana';
    const next = cycles.filter((x) => x.campaign_id === c.campaign_id && x.start_date > todayISO).sort((a, b) => a.idx - b.idx)[0];
    if (next?.id === c.id) return 'Próxima semana';
    return `Ciclo ${String(c.idx).padStart(2, '0')}`;
  };
  const linkFor = (c: PipelineCard): string => {
    const campId = c.content?.campaign_id ?? c.idea?.campaign_id;
    const cyc = c.content?.cycle_id ?? c.idea?.cycle_id;
    if (c.kind !== 'post' && campId && cyc) return `/producao?campaign=${campId}&cycle=${cyc}`;
    if (c.kind !== 'post' && campId) return `/campanhas/${campId}`;
    return c.pieces[0] ? postClickRoute(c.pieces[0]) : '/pipeline';
  };
  const open = cards.find((c) => c.id === openId) ?? null;
  const accounts = ops?.accounts ?? [];
  const accountLabel = (p: UserPost) => accounts.find((a) => a.id === p.account_id)?.label ?? accounts.find((a) => a.platform === p.platform && a.is_default)?.label ?? '';
  const presentEditorials = [...new Set(cards.map((c) => c.editorialSlug).filter(Boolean))] as string[];

  const sel = 'rounded-md border border-input bg-background px-2 py-1.5 text-sm';

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Pipeline editorial</h1>
          <p className="text-sm text-muted-foreground">Seu fluxo de conteúdo, do planejamento à publicação.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><Link to="/campanhas"><Layers className="h-4 w-4" /> Campanhas</Link></Button>
          <Button variant="accent" size="sm" onClick={() => navigate('/criar')}><Plus className="h-4 w-4" /> Criar conteúdo</Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card px-4 py-3 text-sm" data-testid="pipeline-filters">
        <label className="flex items-center gap-2">Campanha
          <select aria-label="Campanha" className={sel} value={f.campaign} onChange={(e) => setF({ ...f, campaign: e.target.value, cycle: 'all' })}>
            <option value="all">Todas</option>
            {ops?.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="none">Sem campanha</option>
          </select>
        </label>
        <label className="flex items-center gap-2">Ciclo
          <select aria-label="Ciclo" className={sel} value={f.cycle} onChange={(e) => setF({ ...f, cycle: e.target.value })} disabled={!campaignCycles.length}>
            <option value="all">Todos</option>
            {campaignCycles.map((c) => <option key={c.id} value={c.id}>{c.start_date <= todayISO && todayISO <= c.end_date ? 'Atual' : 'Ciclo'} ({String(c.idx).padStart(2, '0')})</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">Conta
          <select aria-label="Conta" className={sel} value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })}>
            <option value="all">Todas</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{NET(a.platform)} · {a.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">Canal
          <select aria-label="Canal" className={sel} value={f.platform} onChange={(e) => setF({ ...f, platform: e.target.value })}>
            <option value="all">Todos</option><option value="linkedin">LinkedIn</option><option value="instagram">Instagram</option>
          </select>
        </label>
        <label className="flex items-center gap-2">Editorial
          <select aria-label="Editorial" className={sel} value={f.editorial} onChange={(e) => setF({ ...f, editorial: e.target.value })}>
            <option value="all">Todos</option>
            {presentEditorials.map((s) => <option key={s} value={s}>{edName(s) ?? s}</option>)}
          </select>
        </label>
      </div>

      {banner && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3" data-testid="pipeline-banner">
          <Sparkles className="h-5 w-5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Hive — {banner.title} · {banner.eyebrow.split(' · ').pop()} precisa de atenção</p>
            <p className="text-sm text-muted-foreground">{banner.body}{banner.dueLabel ? ` ${banner.dueLabel}.` : ''}</p>
          </div>
          <Button asChild size="sm" variant="accent"><Link to={banner.to}>{banner.cta} <ArrowRight className="h-3.5 w-3.5" /></Link></Button>
        </div>
      )}

      {!ops ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[1080px] grid-cols-6 gap-2.5">
            {PIPELINE_COLUMNS.map((col) => {
              const list = sortColumn(col.key, visible.filter((c) => c.column === col.key), cycles);
              const shown = more[col.key] ? list : list.slice(0, PAGE);
              return (
                <section key={col.key} className="flex min-h-[50vh] flex-col rounded-xl border bg-card/40" data-testid={`col-${col.key}`}>
                  <header className="flex items-center justify-between border-b px-3 py-2">
                    <span className="text-xs font-semibold uppercase tracking-wider">{col.label}</span>
                    <span className="rounded-full bg-secondary px-2 text-xs" data-testid="col-count">{list.length}</span>
                  </header>
                  <div className="flex-1 space-y-2 p-2">
                    {shown.map((c) => (
                      <CardView key={c.id} card={c} onOpen={() => setOpenId(c.id)} link={linkFor(c)}
                        editorial={edName(c.editorialSlug)} cycle={cycleOf(c.cycleId)} cycleLabel={cycleLabel(cycleOf(c.cycleId))}
                        campaignName={f.campaign === 'all' ? (campaignOf(c.campaignId)?.name ?? 'Sem campanha') : null}
                        accountLabel={accountLabel} today={today} />
                    ))}
                    {list.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">Vazio</p>}
                  </div>
                  {list.length > PAGE && (
                    <button type="button" onClick={() => setMore({ ...more, [col.key]: !more[col.key] })} className="border-t py-2 text-xs text-muted-foreground hover:text-foreground">
                      {more[col.key] ? 'Mostrar menos' : `Ver mais ${list.length - PAGE}`}
                    </button>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setOpenId(null)} aria-hidden />
          <aside role="dialog" aria-label="Manifestações do conteúdo" data-testid="card-drawer"
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l bg-background shadow-2xl">
            <div className="flex items-start justify-between gap-2 border-b p-4">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{campaignOf(open.campaignId)?.name ?? 'Sem campanha'}{cycleOf(open.cycleId) && campaignOf(open.campaignId) ? ` · Ciclo ${String(cycleOf(open.cycleId)!.idx).padStart(2, '0')}` : ''}</p>
                <p className="mt-1 font-display text-lg font-semibold leading-snug">{open.title}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {open.fn && <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: FUNCTION_COLORS[open.fn] }} />{FUNCTION_SHORT[open.fn]}</span>}
                  {edName(open.editorialSlug) && <span>{edName(open.editorialSlug)}</span>}
                  <span className="rounded bg-secondary px-1.5">{PIPELINE_COLUMNS.find((c) => c.key === open.column)?.label}</span>
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setOpenId(null)} aria-label="Fechar"><X className="h-4 w-4" /></Button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {open.kind === 'idea' ? (
                <div className="space-y-2 text-sm">
                  {open.idea?.summary && <p>{open.idea.summary}</p>}
                  {open.idea?.rationale && <p className="text-muted-foreground">{open.idea.rationale}</p>}
                  <p className="flex flex-wrap gap-2">{open.channels.map((ch, i) => <span key={i} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"><NetIcon platform={ch.platform} />{NET(ch.platform)}</span>)}</p>
                </div>
              ) : (
                <>
                  {open.content?.body?.frase && <p className="font-display text-base">“{open.content.body.frase}”</p>}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Manifestações</p>
                    {open.pieces.map((p) => (
                      <Link key={p.id} to={postClickRoute(p)} data-testid="drawer-piece" className="flex items-center gap-3 rounded-lg border p-2 hover:bg-accent/5">
                        <span className="h-14 w-11 shrink-0 overflow-hidden rounded border bg-secondary/40">
                          {p.rendered_slides?.slide1 ? <img src={p.rendered_slides.slide1} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="m-auto mt-4 h-4 w-4 text-muted-foreground" />}
                        </span>
                        <span className="min-w-0 flex-1 text-xs">
                          <span className="flex items-center gap-1 font-semibold"><NetIcon platform={p.platform} />{NET(p.platform)} · {accountLabel(p)}{p.piece_role === 'validation' ? ' · validação' : ''}</span>
                          <span className="block text-muted-foreground">{STATUS_LABEL[stageOfPost(p)]}{p.scheduled_date && p.status === 'scheduled' ? ` · ${format(new Date(p.scheduled_date), "dd/MM 'às' HH:mm")}` : ''}{p.published_at && p.status === 'published' ? ` · ${format(new Date(p.published_at), 'dd/MM')}` : ''}</span>
                          {p.codigo && <span className="font-mono text-[10px] text-muted-foreground">{p.codigo}</span>}
                        </span>
                      </Link>
                    ))}
                    {open.missingChannels.map((ch, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-lg border border-dashed p-2 text-xs text-muted-foreground"><NetIcon platform={ch.platform} />{NET(ch.platform)} · a desenvolver</div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2 border-t p-3">
              <Button asChild variant="accent" size="sm"><Link to={linkFor(open)}>{open.column === 'pendente' ? 'Revisar' : open.kind === 'idea' ? 'Abrir na produção' : 'Abrir'} <ArrowRight className="h-3.5 w-3.5" /></Link></Button>
              {open.column === 'aprovado' && <Button asChild variant="outline" size="sm"><Link to={open.campaignId ? `/agenda?campaign=${open.campaignId}` : '/agenda'}>Agendar</Link></Button>}
              {(open.kind === 'idea' || (open.kind === 'post' && open.column !== 'publicado')) && (
                <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" data-testid="drawer-discard" onClick={async () => {
                  if (!confirm(open.kind === 'idea' ? 'Descartar esta ideia?' : 'Excluir este post?')) return;
                  try {
                    if (open.kind === 'idea') { await ideaApi.update(open.idea!.id, { status: 'discarded' }); await reload(); }
                    else await removePost(open.pieces[0].id);
                    setOpenId(null);
                    toast.success(open.kind === 'idea' ? 'Ideia descartada.' : 'Post excluído.');
                  } catch (e) { toast.error((e as Error).message.slice(0, 160)); }
                }}><Trash2 className="h-4 w-4" /> {open.kind === 'idea' ? 'Descartar ideia' : 'Excluir'}</Button>
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

// Alternativas de uma mesma peça aparecem como uma linha só ("3 opções").
function units(pieces: UserPost[]): Array<{ p: UserPost; options: number }> {
  const m = new Map<string, { p: UserPost; options: number }>();
  for (const p of pieces) {
    const k = p.alternative_group ?? p.id;
    const u = m.get(k);
    if (u) u.options += 1; else m.set(k, { p, options: 1 });
  }
  return [...m.values()];
}

function CardView({ card: c, onOpen, link, editorial, cycle, cycleLabel, campaignName, accountLabel, today }: {
  card: PipelineCard; onOpen: () => void; link: string; editorial: string | null; cycle?: CampaignCycle; cycleLabel: string | null;
  campaignName: string | null; accountLabel: (p: UserPost) => string; today: Date;
}) {
  const channels = (chs: IdeaChannel[]) => [...new Set(chs.map((ch) => NET(ch.platform)))].join(' + ');
  const due = c.column === 'pendente' && cycle ? dueLabel(cycle.review_due ?? (cycle.start_date > format(today, 'yyyy-MM-dd') ? cycle.start_date : null), today) : null;
  const scheduled = c.pieces.filter((p) => p.status === 'scheduled' && p.scheduled_date);
  return (
    <article className="rounded-lg border bg-card p-3 text-xs shadow-sm" data-testid="pipeline-card" data-kind={c.kind}>
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <p className="line-clamp-2 text-sm font-semibold leading-snug">{c.title}</p>
        {c.fn && <p className="mt-1.5 flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: FUNCTION_COLORS[c.fn] }} />{FUNCTION_SHORT[c.fn]}</p>}
        {editorial && <p className="text-muted-foreground">{editorial}</p>}
      </button>

      {c.kind === 'idea' ? (
        <div className="mt-2 space-y-1">
          <p className="font-medium text-accent">{c.origin === 'user' ? 'Ideia do usuário' : c.origin === 'result' ? 'Ideia do resultado' : 'Ideia-mãe'}</p>
          {c.channels.length > 0 && <p className="text-muted-foreground">{channels(c.channels)}</p>}
          {cycleLabel && <p className="text-muted-foreground">{cycleLabel}</p>}
          {c.origin === 'hive' && <p className="flex items-center gap-1 text-amber-600"><Sparkles className="h-3 w-3" /> Sugerida pela Hive</p>}
        </div>
      ) : (
        <div className="mt-2 space-y-1">
          {c.column === 'pendente' && c.pendingPieces > 0 && c.content?.status !== 'pending_validation' && (
            <p className="inline-block rounded bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-400">{c.pendingPieces} {c.pendingPieces === 1 ? 'peça para revisar' : 'peças para revisar'}</p>
          )}
          {c.content?.status === 'pending_validation' && <p className="inline-block rounded bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-400">Conteúdo para validar</p>}
          {c.column === 'agendado' ? scheduled.map((p) => (
            <p key={p.id} className="flex items-center gap-1"><NetIcon platform={p.platform} />{NET(p.platform)} · {accountLabel(p)} · {format(new Date(p.scheduled_date!), "dd MMM · HH:mm", { locale: ptBR })}</p>
          )) : units(c.pieces).map(({ p, options }) => (
            <p key={p.id} className="flex items-center gap-1 text-muted-foreground"><NetIcon platform={p.platform} />{p.piece_role === 'validation' || p.platform === 'linkedin' ? 'Imagem + texto' : 'Imagem'} · {NET(p.platform)}{options > 1 ? ` · ${options} opções` : ''}</p>
          ))}
          {c.missingChannels.map((ch, i) => <p key={i} className="text-muted-foreground">{NET(ch.platform)} · a desenvolver</p>)}
          {c.column === 'aprovado' && <p className="flex items-center gap-1 text-emerald-600"><Check className="h-3 w-3" /> Pronto para agendar</p>}
          {c.column === 'publicado' && c.publishedAt && <p className="text-muted-foreground">Publicado em {format(parseISO(c.publishedAt), 'dd MMM', { locale: ptBR })}</p>}
          {due && <p className="flex items-center gap-1 text-amber-600"><AlertTriangle className="h-3 w-3" /> {due}</p>}
        </div>
      )}

      {(campaignName || (cycle && c.kind !== 'idea')) && (
        <p className="mt-2 border-t pt-1.5 text-[10px] text-muted-foreground">{campaignName ?? ''}{campaignName && cycle && c.kind !== 'idea' && campaignName !== 'Sem campanha' ? ` · Ciclo ${String(cycle.idx).padStart(2, '0')}` : ''}</p>
      )}
      {c.column === 'pendente' && (
        <Button asChild size="sm" variant="accent" className="mt-2 h-7 w-full text-xs"><Link to={link}>Revisar <ArrowRight className="h-3 w-3" /></Link></Button>
      )}
    </article>
  );
}
