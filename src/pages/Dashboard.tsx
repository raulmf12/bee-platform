// HOME regente (Tela 01). A Hive rege a operação: o que está acontecendo, o que
// precisa de você (com prazo), o que ela recomenda e o que vai ao ar. "+ Criar"
// quando você quer começar algo por conta própria. O Kanban mora em /pipeline.
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarClock, ImageIcon, Instagram, Layers, Linkedin, Loader2, Plus, Sparkles, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/authStore';
import { useOps } from '@/lib/campaign/useOps';
import { happening, pendingItems, recommendations, upcoming, type HomeData } from '@/lib/campaign/home';
import { cn } from '@/lib/utils';

export function Dashboard() {
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();
  const { ops, posts } = useOps();

  const data: HomeData | null = useMemo(() => (ops ? { ...ops, posts } : null), [ops, posts]);
  const pend = useMemo(() => (data ? pendingItems(data) : []), [data]);
  const stats = useMemo(() => (data ? happening(data) : null), [data]);
  const recs = useMemo(() => (data ? recommendations(data) : []), [data]);
  const next = useMemo(() => (data ? upcoming(data) : []), [data]);
  const firstName = (currentUser?.name ?? '').split(' ')[0];

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Hive</p>
          <h1 className="mt-1 font-display text-3xl font-bold" data-testid="home-greeting">Olá{firstName ? `, ${firstName}` : ''}.</h1>
        </div>
        <Button variant="accent" size="lg" onClick={() => navigate('/criar')} data-testid="home-create"><Plus className="h-4 w-4" /> Criar</Button>
      </header>

      {!data || !stats ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
      ) : (
        <>
          <section className="space-y-3" aria-labelledby="h-happening">
            <h2 id="h-happening" className="font-display text-base font-semibold">O que está acontecendo</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat to="/campanhas" icon={<Layers className="h-4 w-4" />} value={stats.activeCampaigns} label={stats.activeCampaigns === 1 ? 'campanha ativa' : 'campanhas ativas'} testId="stat-campaigns" />
              <Stat to="/agenda" icon={<CalendarClock className="h-4 w-4" />} value={stats.scheduled} label={stats.scheduled === 1 ? 'conteúdo programado' : 'conteúdos programados'} testId="stat-scheduled" />
              <Stat to="/pipeline" icon={<Workflow className="h-4 w-4" />} value={stats.inProduction} label="em produção" testId="stat-production" />
            </div>
          </section>

          <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
            <div className="space-y-8">
              <section className="space-y-3" aria-labelledby="h-needs">
                <h2 id="h-needs" className="flex items-center gap-2 font-display text-base font-semibold">
                  Precisa de você
                  <span className="rounded-full bg-secondary px-2 text-xs font-medium" data-testid="pending-count">{pend.length} {pend.length === 1 ? 'pendência' : 'pendências'}</span>
                </h2>
                {pend.length === 0 ? (
                  <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nada esperando por você agora.</p>
                ) : (
                  <ul className="space-y-2">
                    {pend.map((p) => (
                      <li key={p.id} data-testid="pending-item" data-kind={p.kind}
                        className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4">
                        <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', p.urgent ? 'bg-rose-500' : 'bg-amber-400')} aria-label={p.urgent ? 'Urgente' : undefined} />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {p.color && <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: p.color }} />}{p.eyebrow}
                          </p>
                          <p className="mt-0.5 text-sm font-semibold">{p.title}</p>
                          <p className="text-sm text-muted-foreground">{p.body}</p>
                          {p.dueLabel && <p className={cn('mt-1 text-xs font-medium', p.urgent ? 'text-rose-600' : 'text-amber-600')} data-testid="pending-due">{p.dueLabel}</p>}
                        </div>
                        <Button asChild size="sm" variant={p.urgent ? 'accent' : 'outline'}>
                          <Link to={p.to}>{p.cta} <ArrowRight className="h-3.5 w-3.5" /></Link>
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {recs.length > 0 && (
                <section className="space-y-3" aria-labelledby="h-recs">
                  <h2 id="h-recs" className="font-display text-base font-semibold">Hive recomenda</h2>
                  {recs.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-accent/30 bg-accent/5 p-4" data-testid="recommendation">
                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{r.title}</p>
                        <p className="text-sm text-muted-foreground">{r.body}</p>
                      </div>
                      <Button asChild size="sm" variant="ghost"><Link to={r.to}>{r.cta} <ArrowRight className="h-3.5 w-3.5" /></Link></Button>
                    </div>
                  ))}
                </section>
              )}
            </div>

            <section className="space-y-3" aria-labelledby="h-next">
              <div className="flex items-baseline justify-between">
                <h2 id="h-next" className="font-display text-base font-semibold">Próximas publicações</h2>
                <Link to="/agenda" className="text-xs text-accent hover:underline">Ver agenda</Link>
              </div>
              {next.length === 0 ? (
                <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nada programado ainda.</p>
              ) : (
                <ul className="divide-y rounded-xl border bg-card">
                  {next.map((n) => {
                    const img = n.post.rendered_slides?.slide1;
                    const label = (n.post.carousel_text?.quote as string | undefined) || n.post.title || n.post.caption || 'Peça';
                    return (
                      <li key={n.post.id} data-testid="upcoming-item">
                        <Link to={`/posts/${n.post.id}`} className="flex items-center gap-3 p-3 hover:bg-accent/5">
                          <span className="h-12 w-10 shrink-0 overflow-hidden rounded border bg-secondary/40">
                            {img ? <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" /> : <ImageIcon className="m-auto mt-3.5 h-4 w-4 text-muted-foreground" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 text-xs font-semibold">
                              {n.dayLabel} · {n.post.platform === 'linkedin' ? <Linkedin className="h-3 w-3 text-[#0A66C2]" /> : <Instagram className="h-3 w-3 text-[#E1306C]" />}{n.account}
                            </span>
                            <span className="block truncate text-sm">{label}</span>
                            <span className="text-[11px] text-muted-foreground">{n.when.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ to, icon, value, label, testId }: { to: string; icon: React.ReactNode; value: number; label: string; testId: string }) {
  return (
    <Link to={to} data-testid={testId} className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-accent/50">
      <span className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-muted-foreground">{icon}</span>
      <span>
        <span className="block text-2xl font-bold leading-tight">{value}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </span>
    </Link>
  );
}
