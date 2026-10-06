// COMPARATIVO DE CONTAS do Instagram — sobre o histórico importado de cada uma:
// retrato da conta, critérios lado a lado, evolução mensal, formatos, horários,
// melhores posts, público e qual conta a Hive recomenda — e o TRÁFEGO PAGO (Meta
// Ads) de cada conta, atribuído pelo anúncio (PaidTrafficSection).
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { ArrowLeft, Check, Crown, ImageIcon, Instagram, Loader2, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOps } from '@/lib/campaign/useOps';
import { accountStats, compareAccounts, type AccountStats } from '@/lib/campaign/accountCompare';
import { importInstagramHistory } from '@/lib/instagramImport';
import { PaidTrafficSection } from '@/components/performance/PaidTrafficSection';
import type { SocialAccount } from '@/types';
import { cn } from '@/lib/utils';

// Cor segue a CONTA (ordem de criação), nunca a posição no ranking. Validadas
// (CVD/contraste) nos dois temas.
const SERIES = [
  { bg: 'bg-[#2a78d6] dark:bg-[#3987e5]', text: 'text-[#2a78d6] dark:text-[#3987e5]', ring: 'ring-[#2a78d6] dark:ring-[#3987e5]' },
  { bg: 'bg-[#eb6834] dark:bg-[#d95926]', text: 'text-[#eb6834] dark:text-[#d95926]', ring: 'ring-[#eb6834] dark:ring-[#d95926]' },
];
const n0 = (v: number | null | undefined) => (v == null ? '—' : Math.round(v).toLocaleString('pt-BR'));
const n1 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(1).replace('.', ','));
const p1 = (v: number | null | undefined) => (v == null ? '—' : `${(v * 100).toFixed(1).replace('.', ',')}%`);

export function AccountsCompare() {
  const { ops, posts, reload } = useOps();
  const [importing, setImporting] = useState<string | null>(null);

  const igAccounts = useMemo(() => (ops?.accounts ?? []).filter((a) => a.platform === 'instagram').sort((a, b) => a.created_at.localeCompare(b.created_at)), [ops]);
  const stats = useMemo(() => igAccounts.map((a) => accountStats(a, posts, ops?.metrics ?? [])), [igAccounts, posts, ops]);
  const verdict = useMemo(() => (stats.length >= 2 ? compareAccounts(stats) : null), [stats]);
  const notImported = stats.filter((s) => !s.snap.imported_at);
  // Tráfego pago: contas pelo id do Instagram (a atribuição dos anúncios usa esse id) + orgânico pra cruzar.
  const paidAccounts = useMemo(() => igAccounts.map((a, i) => ({ id: a.instagram_business_account_id ?? '', username: stats[i]?.username ?? a.label, series: i })).filter((x) => x.id), [igAccounts, stats]);
  const organicRefs = useMemo(() => stats.map((s) => ({ username: s.username, followers: s.followers, posts: s.posts, avgInteractions: s.avgInteractions })), [stats]);

  async function importNow(a: SocialAccount) {
    setImporting(a.id);
    try { const r = await importInstagramHistory(a.id); toast.success(`"${a.label}": ${r.processed} posts lidos.`); await reload(); }
    catch (e) { toast.error((e as Error).message.slice(0, 200)); }
    finally { setImporting(null); }
  }

  if (!ops) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
      <header className="space-y-1">
        <Link to="/desempenho" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3 w-3" /> Desempenho</Link>
        <h1 className="font-display text-2xl font-bold">Comparativo de contas</h1>
        <p className="text-sm text-muted-foreground">O histórico completo de cada Instagram, lado a lado.</p>
      </header>

      {igAccounts.length < 2 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <p className="font-display text-lg font-semibold">Conecte a segunda conta</p>
          <p className="mt-1 text-sm text-muted-foreground">O comparativo precisa de pelo menos duas contas do Instagram. Ao conectar, o histórico vem junto.</p>
          <Button asChild variant="accent" className="mt-4"><Link to="/configuracoes">Ir para Contas</Link></Button>
        </div>
      ) : (
        <>
          {notImported.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
              <TriangleAlert className="h-4 w-4 text-amber-600" />
              <span className="flex-1">Falta importar o histórico de {notImported.map((s) => `"${s.account.label}"`).join(' e ')}.</span>
              {notImported.map((s) => (
                <Button key={s.account.id} size="sm" variant="outline" disabled={!!importing} onClick={() => void importNow(s.account)}>
                  {importing === s.account.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Importar {s.account.label}
                </Button>
              ))}
            </div>
          )}

          {verdict && (
            <section className="rounded-2xl border border-accent/40 bg-accent/5 p-5" data-testid="compare-verdict">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent"><Sparkles className="h-3.5 w-3.5" /> Hive recomenda</p>
              {verdict.winner != null ? (
                <h2 className="mt-1 font-display text-xl font-bold" data-testid="verdict-title">
                  Seguir com <span className={SERIES[verdict.winner % 2].text}>@{stats[verdict.winner].username}</span>
                  <span className="ml-2 align-middle text-xs font-medium text-muted-foreground">confiança {verdict.confidence}</span>
                </h2>
              ) : <h2 className="mt-1 font-display text-xl font-bold" data-testid="verdict-title">Empate técnico</h2>}
              <ul className="mt-3 space-y-1 text-sm">{verdict.reasons.map((r, i) => <li key={i}>• {r}</li>)}</ul>
              {verdict.caveats.length > 0 && <ul className="mt-3 space-y-1 text-xs text-amber-700 dark:text-amber-400">{verdict.caveats.map((c, i) => <li key={i}>⚠ {c}</li>)}</ul>}
            </section>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {stats.map((s, i) => <AccountCard key={s.account.id} s={s} i={i} crowned={verdict?.winner === i} />)}
          </div>

          {verdict && (
            <section className="overflow-hidden rounded-2xl border bg-card" data-testid="compare-criteria">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-left text-xs text-muted-foreground">
                  <tr><th className="p-3 font-medium">Critério (peso)</th>{stats.map((s, i) => <th key={s.account.id} className={cn('p-3 font-semibold', SERIES[i % 2].text)}>@{s.username}</th>)}</tr>
                </thead>
                <tbody>
                  {verdict.criteria.map((c) => (
                    <tr key={c.id} className="border-t" data-testid="criterion">
                      <td className="p-3"><p className="font-medium">{c.label} <span className="text-xs font-normal text-muted-foreground">({c.weight})</span></p><p className="text-xs text-muted-foreground">{c.hint}</p></td>
                      {c.values.map((v, i) => (
                        <td key={i} className={cn('p-3 tabular-nums', c.winner === i && 'font-semibold')}>
                          {v == null ? '—' : c.fmt(v)} {c.winner === i && <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-emerald-500/15 px-1.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400"><Check className="h-3 w-3" />vence</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t bg-secondary/20 font-semibold"><td className="p-3">Pontuação</td>{verdict.scores.map((sc, i) => <td key={i} className="p-3 tabular-nums" data-testid="score">{Math.round(sc)}</td>)}</tr>
                </tbody>
              </table>
            </section>
          )}

          <MonthlyChart stats={stats} />

          <div className="grid gap-3 md:grid-cols-2">
            {stats.map((s, i) => (
              <section key={s.account.id} className="space-y-3 rounded-2xl border bg-card p-4">
                <p className={cn('text-sm font-semibold', SERIES[i % 2].text)}>@{s.username}</p>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Por formato</p>
                  {s.formats.length === 0 ? <p className="text-xs text-muted-foreground">Sem dados.</p> : (
                    <ul className="space-y-1 text-sm">{s.formats.map((f) => <li key={f.format} className="flex justify-between"><span>{f.label} <span className="text-xs text-muted-foreground">· {f.posts} posts</span></span><span className="tabular-nums">{n1(f.avgInteractions)} interações/post</span></li>)}</ul>
                  )}
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Melhores posts</p>
                  <ul className="space-y-2">
                    {s.top.map((t) => (
                      <li key={t.post.id}>
                        <a href={t.post.published_url ?? undefined} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg p-1 hover:bg-accent/5" data-testid="top-post">
                          <span className="h-12 w-10 shrink-0 overflow-hidden rounded border bg-secondary/40">{t.post.rendered_slides?.slide1 ? <img src={t.post.rendered_slides.slide1} alt="" className="h-full w-full object-cover" loading="lazy" /> : <ImageIcon className="m-auto mt-3.5 h-4 w-4 text-muted-foreground" />}</span>
                          <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{(t.post.carousel_text?.quote as string | undefined) ?? t.post.title}</span>
                            <span className="text-[11px] text-muted-foreground">{t.interactions} interações{t.reach ? ` · alcance ${n0(t.reach)}` : ''} · {format(new Date(t.post.published_at!), 'dd MMM yy', { locale: ptBR })}</span></span>
                        </a>
                      </li>
                    ))}
                    {s.top.length === 0 && <li className="text-xs text-muted-foreground">Sem dados.</li>}
                  </ul>
                </div>
                <Demographics s={s} />
              </section>
            ))}
          </div>

          <PaidTrafficSection accounts={paidAccounts} organic={organicRefs} />
        </>
      )}

    </div>
  );
}

function AccountCard({ s, i, crowned }: { s: AccountStats; i: number; crowned: boolean }) {
  const pic = s.snap.profile?.profile_picture_url;
  const rows: Array<[string, string]> = [
    ['Seguidores', n0(s.followers)],
    ['Posts no histórico', `${s.posts}${s.snap.profile?.media_count && s.snap.profile.media_count !== s.posts ? ` de ${s.snap.profile.media_count}` : ''}`],
    ['Ativa desde', s.since ? format(new Date(s.since), 'MMM yyyy', { locale: ptBR }) : '—'],
    ['Frequência (90 dias)', `${n1(s.perWeek90)} posts/semana`],
    ['Semanas com post (últimas 12)', `${s.activeWeeks12} de 12`],
    ['Curtidas / comentários por post', `${n1(s.avgLikes)} / ${n1(s.avgComments)}`],
    ['Alcance médio por post', n0(s.avgReach)],
    ['Alcance da conta (30 dias)', n0(s.snap.last_30d?.reach)],
    ['Visitas ao perfil (30 dias)', n0(s.snap.last_30d?.profile_views)],
    ['Melhor formato', s.bestFormat ?? '—'],
    ['Melhor dia / horário', `${s.bestWeekday ?? '—'} / ${s.bestHour ?? '—'}`],
  ];
  return (
    <section className={cn('rounded-2xl border bg-card p-4', crowned && `ring-2 ${SERIES[i % 2].ring}`)} data-testid="account-card">
      <div className="flex items-center gap-3">
        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full text-white', SERIES[i % 2].bg)}>
          {pic ? <img src={pic} alt="" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : <Instagram className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate font-semibold">@{s.username} {crowned && <Crown className="h-4 w-4 text-amber-500" aria-label="Recomendada" />}</p>
          <p className="truncate text-xs text-muted-foreground">{s.account.label}{s.account.is_default ? ' · em uso' : ''}{s.snap.imported_at ? ` · histórico de ${format(new Date(s.snap.imported_at), 'dd/MM')}` : ''}</p>
        </div>
      </div>
      <dl className="mt-3 divide-y text-sm">
        {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3 py-1.5"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium tabular-nums">{v}</dd></div>)}
      </dl>
    </section>
  );
}

// Interações médias por post, mês a mês (6 meses). Barras agrupadas, uma cor por
// conta, legenda + rótulo do último mês + tooltip; tabela equivalente abaixo.
function MonthlyChart({ stats }: { stats: AccountStats[] }) {
  const [hover, setHover] = useState<{ m: number; a: number } | null>(null);
  const months = stats[0]?.monthly ?? [];
  const max = Math.max(1, ...stats.flatMap((s) => s.monthly.map((m) => m.avgInteractions ?? 0)));
  if (!months.length) return null;
  return (
    <section className="rounded-2xl border bg-card p-4" data-testid="monthly-chart">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">Interações médias por post · últimos 6 meses</p>
        <div className="flex gap-3 text-xs">{stats.map((s, i) => <span key={s.account.id} className="inline-flex items-center gap-1.5"><span className={cn('h-2.5 w-2.5 rounded-sm', SERIES[i % 2].bg)} />@{s.username}</span>)}</div>
      </div>
      <div className="relative mt-4 grid h-44 grid-cols-6 items-end gap-3 border-b border-border/70">
        {months.map((m, mi) => (
          <div key={m.month} className="flex h-full items-end justify-center gap-0.5">
            {stats.map((s, ai) => {
              const v = s.monthly[mi]?.avgInteractions;
              const h = v ? Math.max(2, (v / max) * 100) : 0;
              return (
                <div key={s.account.id} className="relative flex h-full w-5 items-end" onMouseEnter={() => setHover({ m: mi, a: ai })} onMouseLeave={() => setHover(null)}>
                  {v != null && <div className={cn('w-full rounded-t-[4px]', SERIES[ai % 2].bg, hover && !(hover.m === mi && hover.a === ai) && 'opacity-50')} style={{ height: `${h}%` }} />}
                  {mi === months.length - 1 && v != null && <span className="absolute left-1/2 -translate-x-1/2 text-[10px] tabular-nums text-muted-foreground" style={{ bottom: `calc(${h}% + 2px)` }}>{Math.round(v)}</span>}
                  {hover?.m === mi && hover.a === ai && (
                    <div className="absolute bottom-full left-1/2 z-10 mb-1 w-40 -translate-x-1/2 rounded-md border bg-popover p-2 text-xs shadow-md" role="tooltip">
                      <p className="font-semibold">@{s.username} · {m.label}</p>
                      <p className="tabular-nums">{v == null ? 'sem dados' : `${n1(v)} interações/post`}</p>
                      <p className="text-muted-foreground">{s.monthly[mi].posts} posts</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-6 gap-3 text-center text-[11px] capitalize text-muted-foreground">{months.map((m) => <span key={m.month}>{m.label}</span>)}</div>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-muted-foreground">Ver em tabela</summary>
        <table className="mt-2 w-full tabular-nums">
          <thead><tr className="text-left text-muted-foreground"><th className="py-1">Mês</th>{stats.map((s) => <th key={s.account.id}>@{s.username} (posts · interações/post)</th>)}</tr></thead>
          <tbody>{months.map((m, mi) => <tr key={m.month} className="border-t"><td className="py-1 capitalize">{m.label}</td>{stats.map((s) => <td key={s.account.id}>{s.monthly[mi].posts} · {n1(s.monthly[mi].avgInteractions)}</td>)}</tr>)}</tbody>
        </table>
      </details>
    </section>
  );
}

function Demographics({ s }: { s: AccountStats }) {
  const d = s.snap.followers_demographics;
  if (!d) return <p className="text-xs text-muted-foreground">Público (idade, gênero, cidades): disponível após reconectar com a permissão de métricas.</p>;
  const top = (xs?: Array<{ key: string; value: number }>) => {
    const total = (xs ?? []).reduce((a, x) => a + x.value, 0) || 1;
    return [...(xs ?? [])].sort((a, b) => b.value - a.value).slice(0, 3).map((x) => `${x.key} ${Math.round((x.value / total) * 100)}%`).join(' · ');
  };
  return (
    <div className="space-y-0.5 text-xs" data-testid="demographics">
      <p className="mb-1 font-semibold uppercase tracking-wider text-muted-foreground">Quem segue</p>
      {d.gender && <p><span className="text-muted-foreground">Gênero:</span> {top(d.gender).replace(/\bF\b/g, 'mulheres').replace(/\bM\b/g, 'homens').replace(/\bU\b/g, 'não informado')}</p>}
      {d.age && <p><span className="text-muted-foreground">Idade:</span> {top(d.age)}</p>}
      {d.city && <p><span className="text-muted-foreground">Cidades:</span> {top(d.city)}</p>}
    </div>
  );
}

