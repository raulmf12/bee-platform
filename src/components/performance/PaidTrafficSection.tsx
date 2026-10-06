// TRÁFEGO PAGO no comparativo de contas: análise profunda dos anúncios (Meta Ads)
// por conta do Instagram que os veiculou — indicadores lado a lado, funil, evolução
// mensal, objetivos, campanhas, melhores/piores anúncios, dias da semana e as
// conclusões tiradas dos números. Cálculo em src/lib/campaign/paidTraffic.ts.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Check, ImageIcon, Lightbulb, Loader2, Megaphone, RefreshCw, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { edge } from '@/lib/edge';
import { loadPaidTraffic } from '@/lib/campaign/paidTrafficApi';
import { analyzePaidTraffic, funnelLeak, monthLabel, paidInsights, type AccountPaid, type AdPerf, type OrganicRef, type PaidAnalysis } from '@/lib/campaign/paidTraffic';
import { cn } from '@/lib/utils';

// Mesma paleta validada (CVD/contraste) do comparativo — cor segue a CONTA.
const SERIES = [
  { bg: 'bg-[#2a78d6] dark:bg-[#3987e5]', text: 'text-[#2a78d6] dark:text-[#3987e5]' },
  { bg: 'bg-[#eb6834] dark:bg-[#d95926]', text: 'text-[#eb6834] dark:text-[#d95926]' },
];
const brl = (v: number | null | undefined, d = 2) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: d, maximumFractionDigits: d }));
const int = (v: number | null | undefined) => (v == null ? '—' : Math.round(v).toLocaleString('pt-BR'));
const pct = (v: number | null | undefined, d = 1) => (v == null ? '—' : `${(v * 100).toFixed(d).replace('.', ',')}%`);
const dec = (v: number | null | undefined, d = 2) => (v == null ? '—' : v.toFixed(d).replace('.', ','));
const br = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');

export interface PaidAccountRef { id: string; username: string; series: number }

export function PaidTrafficSection({ accounts, organic }: { accounts: PaidAccountRef[]; organic: OrganicRef[] }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadPaidTraffic>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setData(await loadPaidTraffic()); setError(null); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const analysis = useMemo<PaidAnalysis | null>(() => (data ? analyzePaidTraffic({ ...data, accounts: accounts.map((a) => ({ id: a.id, username: a.username })) }) : null), [data, accounts]);
  const insights = useMemo(() => (analysis ? paidInsights(analysis, organic) : []), [analysis, organic]);
  const pending = (data?.ads ?? []).filter((a) => !a.attribution_source).length;   // nunca processados (os 'unresolved' não contam)

  async function reattribute() {
    setBusy(true);
    try {
      const r = await edge.metaAdsAttribution({ force: true });
      toast.success(`${r.ads} anúncios: ${r.creative} pelo criativo, ${r.page} pela Página${r.unresolved ? `, ${r.unresolved} sem conta identificável` : ''}.`);
      await load();
    } catch (e) { toast.error((e as Error).message.slice(0, 200)); } finally { setBusy(false); }
  }

  if (error) return <section className="rounded-2xl border p-5 text-sm text-muted-foreground">Tráfego pago indisponível: {error}</section>;
  if (!analysis) return <section className="flex h-32 items-center justify-center rounded-2xl border"><Loader2 className="h-5 w-5 animate-spin text-accent" /></section>;
  if (!analysis.total.totals.spend) {
    return <section className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground" data-testid="paid-section">Ainda não há dados de tráfego pago. Conecte o Facebook com a permissão de anúncios em Configurações › Contas.</section>;
  }
  const accs = analysis.accounts;
  const cols: Array<{ a: AccountPaid; cls: string; label: string }> = [
    ...accs.map((a, i) => ({ a, cls: SERIES[(accounts[i]?.series ?? i) % 2].text, label: `@${a.username}` })),
    ...(analysis.other ? [{ a: analysis.other, cls: 'text-muted-foreground', label: 'Outras' }] : []),
    { a: analysis.total, cls: 'text-foreground', label: 'Total' },
  ];

  return (
    <section className="space-y-5" data-testid="paid-section">
      <header className="flex flex-wrap items-end justify-between gap-3 border-t pt-6">
        <div>
          <h2 className="flex items-center gap-2 font-display text-xl font-bold"><Megaphone className="h-5 w-5 text-accent" /> Tráfego pago (Meta Ads)</h2>
          <p className="text-sm text-muted-foreground">
            {br(analysis.total.totals.firstDate)} a {br(analysis.total.totals.lastDate)} · {int(analysis.coverage.rows)} registros diários por anúncio · cada anúncio atribuído à conta do Instagram que o veiculou
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void reattribute()} data-testid="paid-reattribute">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Atualizar atribuição{pending ? ` (${pending} pendentes)` : ''}
        </Button>
      </header>

      {/* Resumo executivo */}
      <div className="rounded-2xl border border-accent/40 bg-accent/5 p-5" data-testid="paid-insights">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent">Resumo executivo</p>
        <ul className="space-y-1.5 text-sm">
          {insights.map((x, i) => (
            <li key={i} className="flex gap-2">
              {x.kind === 'destaque' ? <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-accent" /> : x.kind === 'atencao' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> : <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
              <span>{x.text}</span>
            </li>
          ))}
        </ul>
      </div>

      <KpiTable cols={cols} accs={accs} />

      <div className="grid gap-3 md:grid-cols-2">
        {accs.map((a, i) => <Funnel key={a.key} a={a} cls={SERIES[(accounts[i]?.series ?? i) % 2]} />)}
      </div>

      <MonthlySpend analysis={analysis} accounts={accounts} />

      <div className="grid gap-3 lg:grid-cols-2">
        {accs.map((a, i) => (
          <div key={a.key} className="space-y-3 rounded-2xl border bg-card p-4" data-testid={`paid-account-${i}`}>
            <p className={cn('text-sm font-semibold', SERIES[(accounts[i]?.series ?? i) % 2].text)}>@{a.username}</p>
            <Objectives a={a} />
            <Campaigns a={a} />
            <AdList title="Anúncios mais eficientes (menor custo por compra)" ads={a.bestAds} testId={`paid-best-ads-${i}`} kind="best" />
            <AdList title="Maior gasto sem nenhuma compra" ads={a.worstAds} testId={`paid-worst-ads-${i}`} kind="worst" />
          </div>
        ))}
      </div>

      <Weekdays analysis={analysis} accounts={accounts} />

      <ul className="space-y-1 rounded-xl bg-secondary/30 p-3 text-xs text-muted-foreground" data-testid="paid-notes">
        {analysis.notes.map((n, i) => <li key={i}>ℹ {n}</li>)}
      </ul>
    </section>
  );
}

// Indicadores lado a lado; "vence" só entre as contas comparadas, nas métricas de eficiência.
function KpiTable({ cols, accs }: { cols: Array<{ a: AccountPaid; cls: string; label: string }>; accs: AccountPaid[] }) {
  type Kpi = { label: string; get: (a: AccountPaid) => number | null; fmt: (v: number | null) => string; better?: 'low' | 'high'; hint?: string };
  const T = cols[cols.length - 1].a.totals.spend || 1;
  const rows: Array<Kpi | string> = [
    'Investimento e entrega',
    { label: 'Investimento', get: (a) => a.totals.spend, fmt: (v) => brl(v) },
    { label: 'Participação no investimento', get: (a) => a.totals.spend / T, fmt: (v) => pct(v) },
    { label: 'Campanhas · anúncios', get: (a) => a.totals.campaigns, fmt: (v) => int(v) },
    { label: 'Dias com veiculação', get: (a) => a.totals.activeDays, fmt: (v) => int(v) },
    { label: 'Impressões', get: (a) => a.totals.impressions, fmt: (v) => int(v) },
    { label: 'Alcance somado (diário)', get: (a) => a.totals.reachDaily, fmt: (v) => int(v), hint: 'soma do alcance de cada dia — não é alcance único' },
    { label: 'Frequência média diária', get: (a) => a.derived.frequency, fmt: (v) => dec(v) },
    { label: 'CPM (custo por mil impressões)', get: (a) => a.derived.cpm, fmt: (v) => brl(v), better: 'low' },
    'Clique e visita',
    { label: 'Cliques no link', get: (a) => a.totals.linkClicks, fmt: (v) => int(v) },
    { label: 'CTR do link', get: (a) => a.derived.linkCtr, fmt: (v) => pct(v, 2), better: 'high' },
    { label: 'CPC (por clique no link)', get: (a) => a.derived.cpc, fmt: (v) => brl(v), better: 'low' },
    { label: 'Visitas à página de destino', get: (a) => a.totals.landingPageViews, fmt: (v) => int(v) },
    { label: 'Custo por visita', get: (a) => a.derived.cpLpv, fmt: (v) => brl(v), better: 'low' },
    'Conversão',
    { label: 'Inícios de checkout', get: (a) => a.totals.initiateCheckout, fmt: (v) => int(v) },
    { label: 'Custo por checkout', get: (a) => a.derived.cpCheckout, fmt: (v) => brl(v), better: 'low' },
    { label: 'Compras', get: (a) => a.totals.purchases, fmt: (v) => int(v), better: 'high' },
    { label: 'Custo por compra', get: (a) => a.derived.cpa, fmt: (v) => brl(v), better: 'low' },
    { label: 'Valor em vendas atribuído', get: (a) => a.totals.purchaseValue, fmt: (v) => brl(v), better: 'high' },
    { label: 'ROAS (vendas ÷ investimento)', get: (a) => a.derived.roas, fmt: (v) => dec(v), better: 'high' },
    { label: 'Ticket médio', get: (a) => a.derived.ticket, fmt: (v) => brl(v) },
    'Engajamento',
    { label: 'Engajamentos com o post', get: (a) => a.totals.engagement, fmt: (v) => int(v) },
    { label: 'Custo por engajamento', get: (a) => a.derived.costPerEngagement, fmt: (v) => brl(v, 3), better: 'low' },
    { label: 'Visualizações de vídeo', get: (a) => a.totals.videoViews, fmt: (v) => int(v) },
    { label: 'Salvamentos', get: (a) => a.totals.saves, fmt: (v) => int(v) },
    { label: 'Conversas iniciadas', get: (a) => a.totals.messaging, fmt: (v) => int(v) },
  ];
  const winner = (k: Kpi) => {
    if (!k.better || accs.length < 2) return null;
    const vals = accs.map((a) => k.get(a));
    if (vals.some((v) => v == null)) return null;
    const best = k.better === 'low' ? Math.min(...(vals as number[])) : Math.max(...(vals as number[]));
    const idx = vals.indexOf(best);
    return vals.filter((v) => v === best).length === 1 ? accs[idx].key : null;
  };
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card" data-testid="paid-kpis">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-secondary/40 text-left text-xs text-muted-foreground">
          <tr><th className="p-3 font-medium">Indicador</th>{cols.map((c) => <th key={c.a.key} className={cn('p-3 text-right font-semibold', c.cls)}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => typeof r === 'string' ? (
            <tr key={i} className="border-t bg-secondary/15"><td colSpan={cols.length + 1} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{r}</td></tr>
          ) : (
            <tr key={i} className="border-t" data-testid="paid-kpi">
              <td className="p-2.5 pl-3">{r.label}{r.hint && <span className="block text-[10px] text-muted-foreground">{r.hint}</span>}</td>
              {cols.map((c) => {
                const v = r.label === 'Campanhas · anúncios' ? null : r.get(c.a);
                const win = winner(r) === c.a.key;
                return (
                  <td key={c.a.key} className={cn('p-2.5 text-right tabular-nums', win && 'font-semibold')}>
                    {r.label === 'Campanhas · anúncios' ? `${c.a.totals.campaigns} · ${c.a.totals.ads}` : r.fmt(v)}
                    {win && <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-emerald-500/15 px-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400"><Check className="h-3 w-3" />melhor</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Funil: impressões → cliques no link → visitas → checkout → compra, com a taxa de passagem de cada etapa.
function Funnel({ a, cls }: { a: AccountPaid; cls: { bg: string; text: string } }) {
  const steps: Array<{ label: string; value: number; rate: number | null }> = [
    { label: 'Impressões', value: a.totals.impressions, rate: null },
    { label: 'Cliques no link', value: a.totals.linkClicks, rate: a.derived.linkCtr },
    { label: 'Visitas à página', value: a.totals.landingPageViews, rate: a.derived.lpvRate },
    { label: 'Inícios de checkout', value: a.totals.initiateCheckout, rate: a.derived.checkoutRate },
    { label: 'Compras', value: a.totals.purchases, rate: a.derived.purchaseRate },
  ];
  const leak = funnelLeak(a);
  return (
    <div className="space-y-2 rounded-2xl border bg-card p-4" data-testid="paid-funnel">
      <p className="text-sm font-semibold">Funil · <span className={cls.text}>@{a.username}</span></p>
      <ol className="space-y-1.5">
        {steps.map((s, i) => (
          <li key={s.label} className="grid grid-cols-[130px_1fr_70px] items-center gap-2 text-xs">
            <span className="text-muted-foreground">{s.label}</span>
            <span className="relative h-4 rounded bg-secondary/50" title={i ? `${pct(s.rate)} da etapa anterior` : ''}>
              {i > 0 && s.rate != null && <span className={cn('absolute inset-y-0 left-0 rounded', cls.bg)} style={{ width: `${Math.max(2, Math.min(100, s.rate * 100 * (i === 1 ? 20 : 1)))}%` }} />}
              {i > 0 && <span className="absolute inset-y-0 right-1 flex items-center text-[10px] font-medium text-foreground">{pct(s.rate)}</span>}
            </span>
            <span className="text-right font-semibold tabular-nums">{int(s.value)}</span>
          </li>
        ))}
      </ol>
      <p className="text-[11px] text-muted-foreground">Barra = taxa de passagem da etapa anterior (CTR do link ampliado 20× para ficar visível).{leak ? ` Maior perda: ${leak.step}.` : ''}</p>
    </div>
  );
}

// Investimento mensal por conta (barras agrupadas) + compras e custo por compra na tabela equivalente.
function MonthlySpend({ analysis, accounts }: { analysis: PaidAnalysis; accounts: PaidAccountRef[] }) {
  const [hover, setHover] = useState<{ m: number; a: number } | null>(null);
  const months = analysis.months;
  const accs = analysis.accounts;
  const max = Math.max(1, ...accs.flatMap((a) => a.monthly.map((m) => m.spend)));
  return (
    <div className="rounded-2xl border bg-card p-4" data-testid="paid-monthly">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">Investimento por mês</p>
        <div className="flex gap-3 text-xs">{accs.map((a, i) => <span key={a.key} className="inline-flex items-center gap-1.5"><span className={cn('h-2.5 w-2.5 rounded-sm', SERIES[(accounts[i]?.series ?? i) % 2].bg)} />@{a.username}</span>)}</div>
      </div>
      <div className="mt-4 flex h-44 items-end gap-2 border-b border-border/70" style={{ minWidth: months.length * 36 }}>
        {months.map((m, mi) => (
          <div key={m} className="flex h-full flex-1 items-end justify-center gap-0.5">
            {accs.map((a, ai) => {
              const v = a.monthly[mi]?.spend ?? 0;
              const h = v ? Math.max(2, (v / max) * 100) : 0;
              return (
                <div key={a.key} className="relative flex h-full w-4 items-end" onMouseEnter={() => setHover({ m: mi, a: ai })} onMouseLeave={() => setHover(null)}>
                  {v > 0 && <div className={cn('w-full rounded-t-[4px]', SERIES[(accounts[ai]?.series ?? ai) % 2].bg, hover && !(hover.m === mi && hover.a === ai) && 'opacity-50')} style={{ height: `${h}%` }} />}
                  {hover?.m === mi && hover.a === ai && (
                    <div className="absolute bottom-full left-1/2 z-10 mb-1 w-44 -translate-x-1/2 rounded-md border bg-popover p-2 text-xs shadow-md" role="tooltip">
                      <p className="font-semibold">@{a.username} · {monthLabel(m)}</p>
                      <p className="tabular-nums">{brl(v)} investidos</p>
                      <p className="text-muted-foreground">{a.monthly[mi].purchases} compras · {brl(a.monthly[mi].cpa)} por compra</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-2 text-center text-[10px] text-muted-foreground">{months.map((m) => <span key={m} className="flex-1">{monthLabel(m)}</span>)}</div>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-muted-foreground">Ver em tabela</summary>
        <table className="mt-2 w-full tabular-nums">
          <thead><tr className="text-left text-muted-foreground"><th className="py-1">Mês</th>{accs.map((a) => <th key={a.key}>@{a.username} (investido · compras · custo/compra)</th>)}</tr></thead>
          <tbody>{months.map((m, mi) => <tr key={m} className="border-t"><td className="py-1 capitalize">{monthLabel(m)}</td>{accs.map((a) => <td key={a.key}>{brl(a.monthly[mi].spend)} · {a.monthly[mi].purchases} · {brl(a.monthly[mi].cpa)}</td>)}</tr>)}</tbody>
        </table>
      </details>
    </div>
  );
}

function Objectives({ a }: { a: AccountPaid }) {
  return (
    <div data-testid="paid-objectives">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Por objetivo de campanha</p>
      <table className="w-full text-xs tabular-nums">
        <thead className="text-left text-muted-foreground"><tr><th className="py-1">Objetivo</th><th className="text-right">Investido</th><th className="text-right">Compras</th><th className="text-right">Custo/compra</th><th className="text-right">CPC</th></tr></thead>
        <tbody>{a.objectives.map((o) => <tr key={o.key} className="border-t"><td className="py-1">{o.label}</td><td className="text-right">{brl(o.totals.spend, 0)}</td><td className="text-right">{o.totals.purchases}</td><td className="text-right">{brl(o.derived.cpa, 0)}</td><td className="text-right">{brl(o.derived.cpc)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function Campaigns({ a }: { a: AccountPaid }) {
  return (
    <div data-testid="paid-campaigns">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Campanhas (maior investimento)</p>
      <table className="w-full text-xs tabular-nums">
        <thead className="text-left text-muted-foreground"><tr><th className="py-1">Campanha</th><th className="text-right">Investido</th><th className="text-right">Compras</th><th className="text-right">Custo/compra</th><th className="text-right">ROAS</th></tr></thead>
        <tbody>
          {a.campaigns.slice(0, 8).map((c) => (
            <tr key={c.key} className="border-t align-top">
              <td className="max-w-[220px] py-1"><span className="block truncate" title={c.label}>{c.label}</span><span className="text-[10px] text-muted-foreground">{c.objective} · {br(c.totals.firstDate)}–{br(c.totals.lastDate)}</span></td>
              <td className="text-right">{brl(c.totals.spend, 0)}</td><td className="text-right">{c.totals.purchases}</td><td className="text-right">{brl(c.derived.cpa, 0)}</td><td className="text-right">{dec(c.derived.roas)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {a.campaigns.length > 8 && <p className="mt-1 text-[10px] text-muted-foreground">+ {a.campaigns.length - 8} campanhas menores.</p>}
    </div>
  );
}

function AdList({ title, ads, testId, kind }: { title: string; ads: AdPerf[]; testId: string; kind: 'best' | 'worst' }) {
  return (
    <div data-testid={testId}>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      {ads.length === 0 ? <p className="text-xs text-muted-foreground">{kind === 'best' ? 'Nenhum anúncio com compra.' : 'Nenhum anúncio relevante sem compra.'}</p> : (
        <ul className="space-y-1.5">
          {ads.map((ad) => (
            <li key={ad.key}>
              <a href={ad.permalink ?? undefined} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg p-1 hover:bg-accent/5" data-testid="paid-ad">
                <span className="h-11 w-11 shrink-0 overflow-hidden rounded border bg-secondary/40">
                  {ad.thumbnail ? <img src={ad.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : <ImageIcon className="m-auto mt-3.5 h-4 w-4 text-muted-foreground" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium" title={ad.label}>{ad.label}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">{ad.campaign}</span>
                  <span className="text-[11px] tabular-nums">{brl(ad.totals.spend, 0)} · {ad.totals.purchases} {ad.totals.purchases === 1 ? 'compra' : 'compras'}{kind === 'best' && ad.totals.purchases < 3 ? ' (amostra pequena)' : ''}{kind === 'best' ? ` · ${brl(ad.derived.cpa, 0)}/compra · ROAS ${dec(ad.derived.roas)}` : ` · ${int(ad.totals.linkClicks)} cliques · CPC ${brl(ad.derived.cpc)}`}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Weekdays({ analysis, accounts }: { analysis: PaidAnalysis; accounts: PaidAccountRef[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card p-4" data-testid="paid-weekdays">
      <p className="mb-2 text-sm font-semibold">Dia da semana</p>
      <table className="w-full min-w-[560px] text-xs tabular-nums">
        <thead className="text-left text-muted-foreground">
          <tr><th className="py-1">Dia</th><th className="text-right">Investido (total)</th><th className="text-right">Compras</th><th className="text-right">Custo/compra</th><th className="text-right">CTR do link</th>
            {analysis.accounts.map((a, i) => <th key={a.key} className={cn('text-right', SERIES[(accounts[i]?.series ?? i) % 2].text)}>@{a.username} custo/compra</th>)}</tr>
        </thead>
        <tbody>
          {analysis.total.weekdays.map((d, di) => (
            <tr key={d.dow} className="border-t">
              <td className="py-1 capitalize">{d.label}</td><td className="text-right">{brl(d.spend, 0)}</td><td className="text-right">{d.purchases}</td><td className="text-right">{brl(d.cpa, 0)}</td><td className="text-right">{pct(d.linkCtr, 2)}</td>
              {analysis.accounts.map((a) => <td key={a.key} className="text-right">{brl(a.weekdays[di].cpa, 0)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[10px] text-muted-foreground">Com poucas compras por dia, diferenças entre dias são indicativas, não conclusivas.</p>
    </div>
  );
}
