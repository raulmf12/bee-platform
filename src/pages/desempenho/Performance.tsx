// DESEMPENHO — resultados das peças publicadas (Instagram automático, LinkedIn
// registrado à mão), comparados com a SUA média recente, melhor horário aprendido
// e o que a Hive recomenda a partir disso. Resultado vira ideia (origin 'result').
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { differenceInCalendarDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { ArrowDownRight, ArrowUpRight, BarChart3, ImageIcon, Instagram, Lightbulb, Linkedin, Loader2, Minus, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MetricsForm } from '@/components/performance/MetricsForm';
import { edge } from '@/lib/edge';
import { ideaApi } from '@/lib/campaignApi';
import { useOps } from '@/lib/campaign/useOps';
import { baselines, bestTimes, metricsByPost, performanceRecs, resultFor, type PieceResult } from '@/lib/campaign/performance';
import { PLATFORM_GUIDE } from '@/lib/schedule';
import type { PostMetrics, UserPost } from '@/types';
import { cn } from '@/lib/utils';

const DAYS = 90;
const NET = (p: string) => (p === 'linkedin' ? 'LinkedIn' : 'Instagram');

export function Performance() {
  const { ops, posts, reload } = useOps();
  const [params] = useSearchParams();
  const focus = params.get('post');
  const [platform, setPlatform] = useState<'all' | 'linkedin' | 'instagram'>('all');
  const [campaign, setCampaign] = useState('all');
  const [editing, setEditing] = useState<string | null>(null);
  const [extra, setExtra] = useState<PostMetrics[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [created, setCreated] = useState<Record<string, boolean>>({});
  const focusRef = useRef<HTMLLIElement | null>(null);

  const metrics = useMemo(() => [...(ops?.metrics ?? []).filter((m) => !extra.some((x) => x.id === m.id)), ...extra], [ops, extra]);
  const byPost = useMemo(() => metricsByPost(metrics), [metrics]);
  const base = useMemo(() => baselines(posts, byPost), [posts, byPost]);
  const times = useMemo(() => bestTimes(posts, byPost), [posts, byPost]);
  const edName = (slug?: string | null) => ops?.editorials.find((e) => e.slug === slug)?.name;
  const recs = useMemo(() => (ops ? performanceRecs({ posts, metrics, contents: ops.contents, editorialName: edName }) : []), [ops, posts, metrics]); // eslint-disable-line react-hooks/exhaustive-deps
  const known = new Set(ops?.campaigns.map((c) => c.id));

  const published = useMemo(() => posts
    .filter((p) => p.status === 'published' && p.published_at && differenceInCalendarDays(new Date(), new Date(p.published_at)) <= DAYS)
    .filter((p) => platform === 'all' || p.platform === platform)
    .filter((p) => campaign === 'all' || (campaign === 'none' ? !(p.campaign_id && known.has(p.campaign_id)) : p.campaign_id === campaign))
    .sort((a, b) => b.published_at!.localeCompare(a.published_at!)), [posts, platform, campaign, ops]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (focus && focusRef.current) focusRef.current.scrollIntoView({ block: 'center' }); }, [focus, published.length]);

  async function refresh() {
    setRefreshing(true);
    try {
      const r = await edge.metricsIngest();
      const saved = r.results.reduce((s, x) => s + x.saved, 0);
      const noInsights = r.results.some((x) => x.saved > 0 && !x.insights);
      toast.success(saved ? `${saved} ${saved === 1 ? 'peça atualizada' : 'peças atualizadas'} do Instagram.` : 'Nenhuma peça do Instagram para atualizar.');
      if (noInsights) toast.info('Alcance e salvamentos exigem a permissão de insights: reconecte o Instagram em Configurações › Contas.');
      await reload();
      setExtra([]);
    } catch (e) {
      toast.error((e as Error).message.slice(0, 160));
    } finally { setRefreshing(false); }
  }

  async function ideaFrom(postId: string) {
    const p = posts.find((x) => x.id === postId);
    if (!p || !ops) return;
    const content = ops.contents.find((c) => c.id === p.content_id);
    const r = resultFor(p, byPost, base);
    try {
      await ideaApi.create({
        campaign_id: p.campaign_id && known.has(p.campaign_id) ? p.campaign_id : null, cycle_id: null,
        title: `Voltar a: ${content?.title ?? (p.carousel_text?.quote as string | undefined) ?? p.title ?? 'território que performou'}`,
        summary: `Explorar de novo esse território por outro ângulo — a peça ficou ${r.deltaPct}% acima da sua média no ${NET(p.platform)}.`,
        strategic_function: content?.strategic_function ?? null, editorial_slug: content?.editorial_slug ?? (p.metadata?.editorial_slug as string | undefined) ?? null,
        channels: [{ account_id: p.account_id ?? undefined, platform: p.platform as 'linkedin' | 'instagram' }], suggested_pieces: 1,
        origin: 'result', status: 'backlog', position: 0,
      });
      setCreated({ ...created, [postId]: true });
      toast.success('Ideia criada no backlog — a Hive considera na próxima pauta.');
    } catch (e) { toast.error((e as Error).message.slice(0, 160)); }
  }

  const summary = (plat: 'linkedin' | 'instagram') => {
    const ps = posts.filter((p) => p.platform === plat && p.status === 'published' && p.published_at && differenceInCalendarDays(new Date(), new Date(p.published_at)) <= 30);
    const b = base[plat];
    const guide = PLATFORM_GUIDE[plat]?.times.find((t) => t.recommended)?.time;
    return { count: ps.length, withMetrics: ps.filter((p) => byPost.has(p.id)).length, avgRate: b?.avgRate, avgInter: b?.avgInteractions, best: times[plat], guide };
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold"><BarChart3 className="h-6 w-6 text-accent" /> Desempenho</h1>
          <p className="text-sm text-muted-foreground">Como suas peças foram recebidas — comparadas com a sua própria média recente.</p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing} data-testid="refresh-metrics">
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Atualizar métricas do Instagram
        </Button>
      </header>

      {!ops ? <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div> : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {(['linkedin', 'instagram'] as const).map((plat) => {
              const s = summary(plat);
              return (
                <section key={plat} className="rounded-xl border bg-card p-4" data-testid={`summary-${plat}`}>
                  <p className="flex items-center gap-2 text-sm font-semibold">{plat === 'linkedin' ? <Linkedin className="h-4 w-4 text-[#0A66C2]" /> : <Instagram className="h-4 w-4 text-[#E1306C]" />}{NET(plat)} · últimos 30 dias</p>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div><dt className="text-[11px] text-muted-foreground">Publicações</dt><dd className="text-xl font-bold">{s.count}</dd></div>
                    <div><dt className="text-[11px] text-muted-foreground">Interações médias</dt><dd className="text-xl font-bold">{s.avgInter != null ? Math.round(s.avgInter) : '—'}</dd></div>
                    <div><dt className="text-[11px] text-muted-foreground">Engajamento médio</dt><dd className="text-xl font-bold">{s.avgRate != null ? `${(s.avgRate * 100).toFixed(1)}%` : '—'}</dd></div>
                  </dl>
                  <p className="mt-3 text-xs text-muted-foreground" data-testid={`best-time-${plat}`}>
                    {s.best ? <><b className="text-foreground">Melhor horário: {s.best.time}</b> — {s.best.reason}</> : <>Melhor horário ainda sem dados suficientes — a Agenda usa o guia ({s.guide ?? '—'}).</>}
                  </p>
                  {plat === 'linkedin' && s.count > s.withMetrics && <p className="mt-1 text-xs text-amber-600">{s.count - s.withMetrics} {s.count - s.withMetrics === 1 ? 'publicação sem resultados registrados' : 'publicações sem resultados registrados'}.</p>}
                </section>
              );
            })}
          </div>

          {recs.map((r) => (
            <div key={r.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-accent/30 bg-accent/5 p-4" data-testid="perf-recommendation">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Hive recomenda</p><p className="text-sm">{r.title}</p><p className="text-sm text-muted-foreground">{r.body}</p></div>
              {created[r.postId]
                ? <Button asChild size="sm" variant="outline"><Link to="/pipeline">Ver no Pipeline</Link></Button>
                : <Button size="sm" variant="accent" onClick={() => void ideaFrom(r.postId)} data-testid="idea-from-result"><Lightbulb className="h-3.5 w-3.5" /> Criar ideia a partir deste resultado</Button>}
            </div>
          ))}

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold">Publicações · últimos {DAYS} dias</h2>
              <div className="flex gap-2 text-sm">
                <select aria-label="Canal" value={platform} onChange={(e) => setPlatform(e.target.value as typeof platform)} className="rounded-md border border-input bg-background px-2 py-1.5">
                  <option value="all">Todos os canais</option><option value="linkedin">LinkedIn</option><option value="instagram">Instagram</option>
                </select>
                <select aria-label="Campanha" value={campaign} onChange={(e) => setCampaign(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1.5">
                  <option value="all">Todas as campanhas</option>
                  {ops.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  <option value="none">Sem campanha</option>
                </select>
              </div>
            </div>
            {published.length === 0 ? (
              <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma publicação no período.</p>
            ) : (
              <ul className="space-y-2">
                {published.map((p) => {
                  const r = resultFor(p, byPost, base);
                  const acc = ops.accounts.find((a) => a.id === p.account_id)?.label;
                  return (
                    <li key={p.id} ref={p.id === focus ? focusRef : undefined} data-testid="perf-row"
                      className={cn('rounded-xl border bg-card p-3', p.id === focus && 'ring-2 ring-accent')}>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="h-14 w-11 shrink-0 overflow-hidden rounded border bg-secondary/40">
                          {p.rendered_slides?.slide1 ? <img src={p.rendered_slides.slide1} alt="" className="h-full w-full object-cover" loading="lazy" /> : <ImageIcon className="m-auto mt-4 h-4 w-4 text-muted-foreground" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{(p.carousel_text?.quote as string | undefined) || p.title || p.caption?.slice(0, 80) || 'Peça'}</p>
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            {p.platform === 'linkedin' ? <Linkedin className="h-3 w-3 text-[#0A66C2]" /> : <Instagram className="h-3 w-3 text-[#E1306C]" />}
                            {NET(p.platform)}{acc ? ` · ${acc}` : ''} · {format(new Date(p.published_at!), "d 'de' MMM", { locale: ptBR })}
                            {p.published_url && <a href={p.published_url} target="_blank" rel="noreferrer" className="ml-1 text-accent hover:underline">ver post</a>}
                          </p>
                        </div>
                        <Numbers r={r} platform={p.platform} />
                        <Delta r={r} />
                        {p.platform === 'linkedin' && editing !== p.id && (
                          <Button size="sm" variant="outline" onClick={() => setEditing(p.id)} data-testid="register-results">{r.metrics ? 'Editar resultados' : 'Registrar resultados'}</Button>
                        )}
                        {p.platform === 'instagram' && !r.metrics && <span className="text-xs text-muted-foreground">Aguardando coleta</span>}
                      </div>
                      {editing === p.id && (
                        <div className="mt-3">
                          <MetricsForm post={p} current={r.metrics?.source === 'manual' ? r.metrics : null}
                            onSaved={(m) => { setExtra((xs) => [...xs.filter((x) => x.id !== m.id), m]); setEditing(null); }} onCancel={() => setEditing(null)} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Numbers({ r, platform }: { r: PieceResult; platform: UserPost['platform'] }) {
  if (!r.metrics) return null;
  const m = r.metrics;
  const items: Array<[string, number | null | undefined]> = [
    [platform === 'instagram' ? 'Alcance' : 'Impressões', platform === 'instagram' ? m.reach : m.impressions],
    [platform === 'linkedin' ? 'Reações' : 'Curtidas', m.likes], ['Comentários', m.comments], ['Compart.', m.shares],
    ...(platform === 'instagram' ? [['Salvos', m.saves] as [string, number | null | undefined]] : []),
  ];
  return (
    <dl className="flex gap-3 text-center text-xs" data-testid="perf-numbers">
      {items.map(([k, v]) => <div key={k}><dt className="text-[10px] text-muted-foreground">{k}</dt><dd className="font-semibold">{v ?? '—'}</dd></div>)}
    </dl>
  );
}

function Delta({ r }: { r: PieceResult }) {
  if (!r.label) return null;
  const up = (r.deltaPct ?? 0) >= 10, down = (r.deltaPct ?? 0) <= -10;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', up ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : down ? 'bg-rose-500/10 text-rose-600' : 'bg-secondary text-muted-foreground')} data-testid="perf-delta">
      {up ? <ArrowUpRight className="h-3 w-3" /> : down ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}{r.label}
    </span>
  );
}
