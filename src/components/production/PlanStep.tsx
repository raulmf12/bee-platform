// Etapa 3 — Planejamento do ciclo (maquete "Produção de Conteúdos").
import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ArrowLeft, ArrowRight, CheckCircle2, Info, Instagram, Linkedin, Loader2, Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { HiveNote } from '@/components/campaign/HiveNote';
import { AcjCyclePanel } from '@/components/acj/AcjCyclePanel';
import { acjCycleApi, acjPlanApi } from '@/lib/acj/api';
import { buildAcjCyclePlan, countAcj, sumCounts, type AcjCounts } from '@/lib/acj/cyclePlan';
import { cycleApi, ideaApi } from '@/lib/campaignApi';
import { buildCyclePlan, publishingDays } from '@/lib/campaign/plan';
import { confirmPlan, generatePauta } from '@/lib/campaign/pauta';
import { formatRange } from '@/lib/campaign/dates';
import { FUNCTION_COLORS, FUNCTION_SHORT, STRATEGIC_FUNCTIONS, type AcjCampaignPlan, type AcjCyclePlan, type Campaign, type CampaignCycle, type CyclePlan, type Idea, type SocialAccount, type StrategicFunction } from '@/types';

function Stepper({ value, onChange, min = 0, label }: { value: number; onChange: (v: number) => void; min?: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" aria-label={`Menos ${label}`} onClick={() => onChange(Math.max(min, value - 1))} className="rounded border p-0.5 hover:bg-accent/10"><Minus className="h-3 w-3" /></button>
      <span className="w-5 text-center text-sm tabular-nums">{value}</span>
      <button type="button" aria-label={`Mais ${label}`} onClick={() => onChange(value + 1)} className="rounded border p-0.5 hover:bg-accent/10"><Plus className="h-3 w-3" /></button>
    </span>
  );
}

const DOW = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

const PlatformIcon = ({ p, className = 'h-4 w-4' }: { p: 'linkedin' | 'instagram'; className?: string }) =>
  p === 'linkedin' ? <Linkedin className={`${className} text-[#0A66C2]`} /> : <Instagram className={`${className} text-[#E1306C]`} />;

export function PlanStep({ campaign, cycle, accounts, isCurrent, onBack, onDone }: {
  campaign: Campaign; cycle: CampaignCycle; accounts: SocialAccount[]; isCurrent: boolean;
  onBack: () => void; onDone: (cycle: CampaignCycle, ideas: Idea[]) => void;
}) {
  const readOnly = cycle.status !== 'not_started';
  const base = useMemo(() => cycle.plan ?? buildCyclePlan(campaign, cycle, accounts), [campaign, cycle, accounts]);
  const [plan, setPlan] = useState<CyclePlan>(base);
  const [adjusting, setAdjusting] = useState(false);
  const [busy, setBusy] = useState(false);
  const labelOf = (id: string) => accounts.find((a) => a.id === id);

  // ACJ: plano da campanha + o que já foi planejado nos ciclos anteriores (lacuna/saturação).
  const [acjCtx, setAcjCtx] = useState<{ campaignPlan: AcjCampaignPlan | null; realized: AcjCounts; lastCycle: AcjCounts; saved: AcjCyclePlan | null } | null>(null);
  const [acjManual, setAcjManual] = useState<AcjCounts | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const [campaignPlan, ideas, cycles, saved] = await Promise.all([
        acjPlanApi.current(campaign.id), ideaApi.listByCampaign(campaign.id), cycleApi.listByCampaign(campaign.id), acjCycleApi.current(cycle.id),
      ]);
      const idxOf = new Map(cycles.map((c) => [c.id, c.idx]));
      const before = ideas.filter((i) => (idxOf.get(i.cycle_id ?? '') ?? Infinity) < cycle.idx);
      const last = ideas.filter((i) => idxOf.get(i.cycle_id ?? '') === cycle.idx - 1);
      if (alive) setAcjCtx({ campaignPlan, realized: countAcj(before), lastCycle: countAcj(last), saved });
    })().catch(() => alive && setAcjCtx({ campaignPlan: null, realized: {}, lastCycle: {}, saved: null }));
    return () => { alive = false; };
  }, [campaign.id, cycle.id, cycle.idx]);
  const acjBase = useMemo(() => (acjCtx?.campaignPlan ? buildAcjCyclePlan({
    plan: acjCtx.campaignPlan, weeks: campaign.duration_weeks ?? 8, cycleIdx: cycle.idx, contents: plan.totals.contents,
    realized: acjCtx.realized, lastCycle: acjCtx.lastCycle,
  }) : null), [acjCtx, campaign.duration_weeks, cycle.idx, plan.totals.contents]);
  const acjDraft = acjBase ? { ...acjBase, counts: acjManual ?? acjBase.counts } : null;

  function setNeed(f: StrategicFunction, count: number) {
    const others = plan.needs.filter((n) => n.function !== f);
    const needs = (count > 0 ? [...others, { function: f, count }] : others)
      .sort((a, b) => b.count - a.count || STRATEGIC_FUNCTIONS.indexOf(a.function) - STRATEGIC_FUNCTIONS.indexOf(b.function));
    setPlan({ ...plan, needs, totals: { ...plan.totals, contents: needs.reduce((a, n) => a + n.count, 0) } });
  }

  function setChannel(accountId: string, contents: number) {
    const channels = plan.channels.map((c) => (c.account_id === accountId ? { ...c, contents } : c));
    const calendar = plan.calendar.map((d) => ({ ...d, slots: [] as CyclePlan['calendar'][number]['slots'] }));
    for (const ch of channels) {
      for (const dow of publishingDays(ch.platform, ch.contents)) {
        calendar.find((d) => parseISO(d.date).getDay() === dow)?.slots.push({ account_id: ch.account_id, platform: ch.platform });
      }
    }
    setPlan({ ...plan, channels, calendar, totals: { ...plan.totals, pieces: channels.reduce((a, c) => a + c.contents, 0) } });
  }

  const invalid = plan.totals.contents === 0 ? 'O ciclo precisa de ao menos um conteúdo.'
    : plan.totals.pieces < plan.totals.contents ? 'Cada conteúdo precisa de ao menos uma peça: aumente as peças das contas ou reduza os conteúdos.'
      : acjDraft && !readOnly && sumCounts(acjDraft.counts) !== plan.totals.contents ? `A jornada relacional (ACJ) soma ${sumCounts(acjDraft.counts)} de ${plan.totals.contents} conteúdos: ajuste-a.`
        : null;

  async function confirm() {
    if (invalid) { toast.error(invalid); return; }
    setBusy(true);
    try {
      const planned = await confirmPlan(cycle, plan, acjCtx?.campaignPlan && acjDraft ? { campaignPlan: acjCtx.campaignPlan, draft: acjDraft } : null);
      const r = await generatePauta(planned, 'full');
      onDone(r.cycle, r.ideas);
    } catch (e) {
      toast.error(`Não consegui gerar a pauta: ${(e as Error).message.slice(0, 160)}`);
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5" data-testid="plan-step">
      <div>
        <h1 className="font-display text-2xl font-bold">3. Planejamento do {isCurrent ? 'ciclo atual' : `ciclo ${String(cycle.idx).padStart(2, '0')}`} · {formatRange(cycle.start_date, cycle.end_date)}</h1>
        <p className="text-sm text-muted-foreground">A Hive analisou sua campanha e o momento atual para sugerir o que este ciclo precisa.</p>
      </div>

      <HiveNote title="O que a Hive recomenda para este ciclo"><span data-testid="plan-summary">{plan.summary}</span></HiveNote>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[1fr_1fr_1.35fr]">
        <section className="flex flex-col rounded-2xl border bg-card p-4" data-testid="plan-needs">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">Necessidades deste ciclo <Info className="h-3.5 w-3.5 text-muted-foreground" /></h3>
          <ul className="flex-1 space-y-2.5">
            {(adjusting ? STRATEGIC_FUNCTIONS.map((f) => ({ function: f, count: plan.needs.find((n) => n.function === f)?.count ?? 0 })) : plan.needs).map((n) => (
              <li key={n.function} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: FUNCTION_COLORS[n.function] }} />{FUNCTION_SHORT[n.function]}</span>
                {adjusting ? <Stepper value={n.count} onChange={(v) => setNeed(n.function, v)} label={FUNCTION_SHORT[n.function]} />
                  : <span className="text-muted-foreground">{n.count} conteúdo{n.count > 1 ? 's' : ''}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-4 flex justify-between border-t pt-3 text-sm"><span className="text-muted-foreground">Total sugerido</span><span className="font-semibold" data-testid="plan-contents">{plan.totals.contents} conteúdos</span></p>
        </section>

        <section className="flex flex-col rounded-2xl border bg-card p-4" data-testid="plan-channels">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">Contas e canais <Info className="h-3.5 w-3.5 text-muted-foreground" /></h3>
          <ul className="flex-1 space-y-3">
            {plan.channels.map((c) => (
              <li key={c.account_id} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm">
                  <PlatformIcon p={c.platform} className="h-5 w-5" />
                  <span><span className="block font-medium">{c.platform === 'linkedin' ? 'LinkedIn' : 'Instagram'} · {c.label}</span>
                    {!adjusting && <span className="block text-xs text-muted-foreground">{c.contents} conteúdo{c.contents > 1 ? 's' : ''} sugerido{c.contents > 1 ? 's' : ''}</span>}</span>
                </span>
                {adjusting && <Stepper value={c.contents} onChange={(v) => setChannel(c.account_id, v)} label={`peças ${c.label}`} />}
              </li>
            ))}
          </ul>
          <p className="mt-4 flex justify-between border-t pt-3 text-sm"><span className="text-muted-foreground">Total sugerido</span><span className="font-semibold" data-testid="plan-pieces">{plan.totals.pieces} peças</span></p>
        </section>

        <section className="rounded-2xl border bg-card p-4 lg:col-span-2 xl:col-span-1" data-testid="plan-calendar">
          <h3 className="mb-3 text-sm font-semibold">Frequência sugerida</h3>
          <div className="grid grid-cols-7 gap-1">
            {plan.calendar.map((d) => (
              <div key={d.date} className="flex flex-col items-center gap-1">
                <span className="text-[10px] font-medium text-muted-foreground">{DOW[parseISO(d.date).getDay()]}</span>
                <span className="text-xs">{format(parseISO(d.date), 'dd')}</span>
                <div className="flex min-h-[56px] w-full flex-col items-center gap-1 rounded-md border bg-background/60 py-1">
                  {d.slots.map((s, i) => <span key={i} title={labelOf(s.account_id)?.label}><PlatformIcon p={s.platform} className="h-3.5 w-3.5" /></span>)}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><PlatformIcon p="linkedin" className="h-3 w-3" /> LinkedIn</span>
            <span className="flex items-center gap-1"><PlatformIcon p="instagram" className="h-3 w-3" /> Instagram</span>
          </div>
        </section>
      </div>

      {acjCtx && (
        <AcjCyclePanel campaignId={campaign.id} campaignPlan={acjCtx.campaignPlan} draft={readOnly ? null : acjDraft} saved={readOnly ? acjCtx.saved : null}
          adjusting={adjusting} contents={plan.totals.contents} onChange={setAcjManual} />
      )}

      {invalid && adjusting && <p className="text-sm font-medium text-amber-600" data-testid="plan-invalid">{invalid}</p>}

      {!readOnly && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="text-sm"><p className="font-semibold">O que acontecerá a seguir</p>
            <p className="text-muted-foreground">Ao confirmar, a Hive criará as ideias-mãe sugeridas para este ciclo. Você poderá ajustar, adicionar ou remover antes de desenvolver os conteúdos.</p></div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Voltar</Button>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setAdjusting((v) => !v)}>{adjusting ? 'Concluir ajustes' : 'Ajustar manualmente'}</Button>
            <Button variant="accent" onClick={confirm} disabled={busy || !!invalid}>
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> A Hive está montando a pauta…</> : <>Confirmar planejamento e gerar ideias <ArrowRight className="h-4 w-4" /></>}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
