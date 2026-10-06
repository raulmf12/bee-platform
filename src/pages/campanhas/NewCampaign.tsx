// Nova campanha — Telas 03 a 08 do "Passo a Passo Campanha e Conteúdo".
// Tipo+intenção → Leitura do momento → Estratégia → Duração → Definida → Ativa.
// A Hive usa o que já sabe (histórico, contas, resultados) e não repete perguntas.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, Megaphone, Rocket, Sparkles, Linkedin, Instagram, Check, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WizardShell, ChoiceCard } from '@/components/campaign/WizardShell';
import { HiveNote } from '@/components/campaign/HiveNote';
import { MixBars } from '@/components/campaign/MixBars';
import { StrategyMatrix } from '@/components/campaign/StrategyMatrix';
import { AcjPlanCard } from '@/components/acj/AcjPlanCard';
import { acjPlanApi } from '@/lib/acj/api';
import { edge } from '@/lib/edge';
import { accountApi, campaignApi } from '@/lib/campaignApi';
import { productApi } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { normalizeMix, phasesToMatrix } from '@/lib/campaign/strategy';
import { activateCampaign, defaultCadence, defaultCampaignName, type DraftStrategy } from '@/lib/campaign/activate';
import { buildCycleRanges, formatDay, mondayOf } from '@/lib/campaign/dates';
import type { AcjPlanDraft, BeeProduct, Campaign, CampaignCycle, CampaignMoment, CampaignType, SocialAccount, StrategicFunction } from '@/types';

type Step = 'tipo' | 'momento' | 'estrategia' | 'duracao' | 'definida' | 'ativa';
const STEPS: Step[] = ['tipo', 'momento', 'estrategia', 'duracao', 'definida', 'ativa'];
const ADJUST_EXAMPLES = ['Quero aumentar autoridade.', 'Quero falar menos de produtos.', 'Quero aumentar minha presença pessoal.'];

export function NewCampaign() {
  const navigate = useNavigate();
  const { currentUser, settings } = useAuthStore();
  const [step, setStep] = useState<Step>('tipo');
  const [busy, setBusy] = useState<string | null>(null);

  const [type, setType] = useState<CampaignType>('organica');
  const [intent, setIntent] = useState('');
  const [products, setProducts] = useState<BeeProduct[]>([]);
  const [productId, setProductId] = useState<string>('');
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [existingCount, setExistingCount] = useState(0);

  const [moment, setMoment] = useState<CampaignMoment | null>(null);
  const [adjustingMoment, setAdjustingMoment] = useState(false);
  const [userNote, setUserNote] = useState('');

  const [strategy, setStrategy] = useState<DraftStrategy | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [instruction, setInstruction] = useState('');

  const [weeks, setWeeks] = useState<number>(8);
  const [customWeeks, setCustomWeeks] = useState('');
  const [name, setName] = useState('');
  const [showMatrix, setShowMatrix] = useState(false);
  const [result, setResult] = useState<{ campaign: Campaign; cycles: CampaignCycle[] } | null>(null);
  // Plano ACJ: preparado em segundo plano na estratégia definida; aprovação é um clique SEPARADO.
  const [acjPlan, setAcjPlan] = useState<AcjPlanDraft | null>(null);
  const [acjState, setAcjState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [acjApproved, setAcjApproved] = useState(false);

  useEffect(() => {
    accountApi.list().then((a) => setAccounts(a.filter((x) => x.status === 'connected'))).catch(() => setAccounts([]));
    campaignApi.list().then((c) => setExistingCount(c.length)).catch(() => {});
    productApi.list().then(setProducts).catch(() => setProducts([]));
  }, []);

  const product = products.find((p) => p.id === productId);
  const stepNo = STEPS.indexOf(step) + 1;
  const back = () => setStep(STEPS[Math.max(0, STEPS.indexOf(step) - 1)]);

  async function readMoment(note?: string) {
    setBusy('momento');
    try {
      const r = await edge.campaignMoment({ type, intent: intent.trim() || undefined, user_note: note || undefined });
      setMoment({ ...r.moment, confirmed: false, adjust_note: note || null });
      setAdjustingMoment(false);
      setStep('momento');
    } catch (e) {
      toast.error(`A Hive não conseguiu ler seu momento: ${(e as Error).message.slice(0, 140)}`);
    } finally { setBusy(null); }
  }

  async function recommendStrategy() {
    if (!moment) return;
    setBusy('estrategia');
    try {
      const r = await edge.campaignStrategy({
        mode: 'recommend', type, intent: intent.trim() || undefined,
        moment: { label: moment.label, summary: moment.summary }, user_note: moment.adjust_note ?? undefined,
        product_id: productId || undefined,
      });
      setStrategy(r.strategy as DraftStrategy);
      setWeeks(r.strategy.recommended_weeks);
      setMoment({ ...moment, confirmed: true });
      setAdjusting(false);
      setStep('estrategia');
    } catch (e) {
      toast.error(`Falha ao montar a estratégia: ${(e as Error).message.slice(0, 140)}`);
    } finally { setBusy(null); }
  }

  async function adjustStrategy(text: string) {
    if (!strategy || !text.trim()) return;
    setBusy('ajuste');
    try {
      const r = await edge.campaignStrategy({
        mode: 'adjust', type, intent: intent.trim() || undefined,
        moment: moment ? { label: moment.label, summary: moment.summary } : undefined,
        current_mix: normalizeMix(strategy.mix), instruction: text.trim(), product_id: productId || undefined,
      });
      setStrategy(r.strategy as DraftStrategy);
      setInstruction('');
      toast.success('A Hive reorganizou a proposta.');
    } catch (e) {
      toast.error(`Falha ao ajustar: ${(e as Error).message.slice(0, 140)}`);
    } finally { setBusy(null); }
  }

  function editPct(f: StrategicFunction, v: number) {
    if (!strategy) return;
    setStrategy({ ...strategy, mix: { ...strategy.mix, [f]: v } });
  }

  function useStrategy() {
    if (!strategy) return;
    setStrategy({ ...strategy, mix: normalizeMix(strategy.mix) });
    setStep('duracao');
  }

  function goDefined() {
    const w = weeks === -1 ? Number(customWeeks) : weeks;
    if (!Number.isFinite(w) || w < 1 || w > 52) { toast.error('Informe um período entre 1 e 52 semanas.'); return; }
    setWeeks(w);
    if (!name) setName(defaultCampaignName(type, currentUser?.name, product?.name));
    setStep('definida');
    void prepareAcj(w);
  }

  async function prepareAcj(w: number) {
    if (!strategy) return;
    setAcjState('loading'); setAcjApproved(false);
    try {
      const r = await edge.acjCampaignPlan({
        adoption: 'native',
        draft: { name: name || undefined, type, intent: intent.trim() || undefined, moment: moment ? { label: moment.label, summary: moment.summary } : null,
          strategy: { mix: normalizeMix(strategy.mix), rationale: strategy.rationale, phases: strategy.phases }, weeks: w, product_id: productId || null },
      });
      setAcjPlan(r.plan); setAcjState('idle');
    } catch {
      setAcjState('error');
    }
  }

  async function activate() {
    if (!strategy || !moment) return;
    if (accounts.length === 0) { toast.error('Conecte ao menos uma conta antes de ativar (Configurações › Contas).'); return; }
    setBusy('ativar');
    try {
      const r = await activateCampaign({
        type, name: name || defaultCampaignName(type, currentUser?.name, product?.name), intent, moment, strategy, weeks,
        productId: productId || null, accounts, cadence: defaultCadence(accounts, settings?.distribution_prefs), existingCount,
      });
      if (acjPlan) {
        // Sem travar a ativação: se falhar, o plano pode ser gerado no detalhe da campanha.
        await acjPlanApi.create(r.campaign.id, acjPlan, { approve: acjApproved }).catch((e) => toast.error(`Plano ACJ não foi salvo: ${(e as Error).message.slice(0, 120)}`));
      }
      setResult(r);
      setStep('ativa');
    } catch (e) {
      toast.error(`Falha ao ativar: ${(e as Error).message.slice(0, 160)}`);
    } finally { setBusy(null); }
  }

  const range = useMemo(() => {
    const r = buildCycleRanges(mondayOf(new Date()), Math.max(1, weeks));
    return r.length ? `${formatDay(r[0].start_date)} a ${formatDay(r[r.length - 1].end_date)}` : '';
  }, [weeks]);

  // ============================== TELAS ==============================
  if (step === 'tipo') {
    return (
      <WizardShell step={stepNo} total={STEPS.length} eyebrow="Nova campanha" title="Que tipo de campanha você quer criar?"
        onBack={() => navigate(-1)}
        footer={(
          <Button variant="accent" size="lg" onClick={() => readMoment()} disabled={busy === 'momento' || (type === 'vendas' && !productId && products.length > 0)}>
            {busy === 'momento' ? <><Loader2 className="h-4 w-4 animate-spin" /> A Hive está lendo seu momento…</> : 'Continuar →'}
          </Button>
        )}>
        <div className="grid gap-3 sm:grid-cols-2">
          <ChoiceCard testId="type-organica" selected={type === 'organica'} onClick={() => setType('organica')} icon={<Megaphone className="h-5 w-5" />}
            title="Campanha Orgânica" description="Construir presença, posicionamento e autoridade ao longo do tempo." />
          <ChoiceCard testId="type-vendas" selected={type === 'vendas'} onClick={() => setType('vendas')} icon={<Rocket className="h-5 w-5" />}
            title="Campanha de Vendas / Lançamento" description="Preparar e converter a chegada de um produto ou oferta." />
        </div>
        {type === 'vendas' && (
          <div className="space-y-2">
            <Label htmlFor="product">Qual produto?</Label>
            <select id="product" value={productId} onChange={(e) => setProductId(e.target.value)}
              className="w-full rounded-md border border-input bg-background p-2 text-sm">
              <option value="">{products.length ? 'Escolha o produto…' : 'Nenhum produto cadastrado'}</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="intent">Conte para a Hive o que você pretende fazer.</Label>
          <Textarea id="intent" rows={4} value={intent} onChange={(e) => setIntent(e.target.value)}
            placeholder="Ex.: quero ser mais reconhecido como referência em liderança sistêmica e chegar a novos líderes." />
        </div>
      </WizardShell>
    );
  }

  if (step === 'momento' && moment) {
    return (
      <WizardShell step={stepNo} total={STEPS.length} eyebrow="Antes de começarmos…" onBack={back}
        title="Este é o momento que identifico na sua presença digital."
        footer={!adjustingMoment ? (
          <>
            <Button variant="accent" size="lg" onClick={recommendStrategy} disabled={busy === 'estrategia'}>
              {busy === 'estrategia' ? <><Loader2 className="h-4 w-4 animate-spin" /> Montando a estratégia…</> : 'Sim, continuar →'}
            </Button>
            <Button variant="ghost" onClick={() => setAdjustingMoment(true)}>Ajustar minha situação</Button>
          </>
        ) : undefined}>
        <div className="rounded-2xl border bg-card p-6">
          <p className="font-display text-2xl font-bold uppercase tracking-wide text-accent" data-testid="moment-label">{moment.label}</p>
          <p className="mt-3 leading-relaxed">{moment.summary}</p>
          {moment.signals && moment.signals.length > 0 && (
            <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
              {moment.signals.map((s) => <li key={s} className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />{s}</li>)}
            </ul>
          )}
        </div>
        {!adjustingMoment ? (
          <p className="text-base font-medium">Essa leitura representa seu momento atual?</p>
        ) : (
          <div className="space-y-3 rounded-xl border p-4">
            <Label htmlFor="note">Como você descreveria seu momento?</Label>
            <Textarea id="note" rows={3} value={userNote} onChange={(e) => setUserNote(e.target.value)}
              placeholder="Ex.: já tenho uma base sólida no LinkedIn, mas no Instagram estou começando agora." />
            <div className="flex gap-2">
              <Button variant="accent" onClick={() => readMoment(userNote)} disabled={!userNote.trim() || busy === 'momento'}>
                {busy === 'momento' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Atualizar leitura
              </Button>
              <Button variant="ghost" onClick={() => setAdjustingMoment(false)}>Cancelar</Button>
            </div>
          </div>
        )}
      </WizardShell>
    );
  }

  if (step === 'estrategia' && strategy) {
    return (
      <WizardShell step={stepNo} total={STEPS.length} eyebrow="Estratégia recomendada" onBack={back}
        title="Para seu momento atual, recomendo este equilíbrio:"
        footer={(
          <>
            <Button variant="accent" size="lg" onClick={useStrategy}>{adjusting ? 'Usar esta estratégia →' : 'Usar estratégia recomendada →'}</Button>
            {!adjusting && <Button variant="ghost" onClick={() => setAdjusting(true)}>Ajustar</Button>}
          </>
        )}>
        <div className="rounded-2xl border bg-card p-6">
          <MixBars mix={strategy.mix} editable={adjusting} onChange={editPct} />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold">Por que esta estratégia?</p>
          <p className="text-sm leading-relaxed text-muted-foreground" data-testid="strategy-rationale">{strategy.rationale}</p>
        </div>
        {adjusting && (
          <div className="space-y-3 rounded-xl border p-4" data-testid="adjust-panel">
            <p className="text-sm text-muted-foreground">Altere os percentuais acima ou simplesmente diga o que quer:</p>
            <div className="flex flex-wrap gap-2">
              {ADJUST_EXAMPLES.map((ex) => (
                <button key={ex} type="button" onClick={() => setInstruction(ex)}
                  className="rounded-full border px-3 py-1 text-xs hover:border-accent hover:bg-accent/5">“{ex}”</button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input aria-label="Pedido de ajuste" value={instruction} onChange={(e) => setInstruction(e.target.value)}
                placeholder="Diga à Hive o que mudar…" onKeyDown={(e) => { if (e.key === 'Enter') void adjustStrategy(instruction); }} />
              <Button variant="accent" onClick={() => adjustStrategy(instruction)} disabled={!instruction.trim() || busy === 'ajuste'}>
                {busy === 'ajuste' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Reorganizar
              </Button>
            </div>
          </div>
        )}
      </WizardShell>
    );
  }

  if (step === 'duracao' && strategy) {
    const options = [4, 8, 12];
    const rec = strategy.recommended_weeks;
    return (
      <WizardShell step={stepNo} total={STEPS.length} eyebrow="Duração" onBack={back}
        title="Por quanto tempo vamos trabalhar esta estratégia?"
        footer={<Button variant="accent" size="lg" onClick={goDefined}>Continuar →</Button>}>
        <HiveNote>
          <p className="font-semibold">{rec} semanas</p>
          <p className="text-muted-foreground">{strategy.duration_rationale}</p>
        </HiveNote>
        <div className="grid gap-3 sm:grid-cols-3">
          {options.map((w) => (
            <ChoiceCard key={w} testId={`weeks-${w}`} selected={weeks === w} onClick={() => setWeeks(w)}
              title={`${w} semanas`} badge={w === rec ? 'Recomendado' : undefined} />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <ChoiceCard testId="weeks-custom" selected={weeks === -1} onClick={() => setWeeks(-1)} title="Outro período" />
          {weeks === -1 && (
            <div className="flex items-center gap-2">
              <Input aria-label="Semanas" type="number" min={1} max={52} className="w-24" value={customWeeks} onChange={(e) => setCustomWeeks(e.target.value)} />
              <span className="text-sm text-muted-foreground">semanas</span>
            </div>
          )}
        </div>
      </WizardShell>
    );
  }

  if (step === 'definida' && strategy) {
    return (
      <WizardShell step={stepNo} total={STEPS.length} eyebrow="Estratégia definida" onBack={back}
        title="Estratégia definida. Agora vamos transformar isso em conteúdo."
        subtitle={`A Hive vai distribuir sua estratégia ao longo das próximas ${weeks} semanas e ajustar o plano conforme aprender com os resultados.`}
        footer={(
          <>
            <Button variant="accent" size="lg" onClick={activate} disabled={busy === 'ativar' || accounts.length === 0}>
              {busy === 'ativar' ? <><Loader2 className="h-4 w-4 animate-spin" /> Ativando…</> : 'Ativar campanha →'}
            </Button>
            <Button variant="ghost" onClick={() => setShowMatrix((v) => !v)}>{showMatrix ? 'Ocultar estratégia' : 'Ver estratégia'}</Button>
          </>
        )}>
        <div className="grid gap-4 rounded-2xl border bg-card p-5 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="cname">Nome da campanha</Label>
            <Input id="cname" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">Período</p>
            <p className="text-sm text-muted-foreground" data-testid="campaign-range">{range} · {weeks} semanas</p>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <p className="text-sm font-medium">Contas</p>
            {accounts.length === 0 ? (
              <p className="text-sm text-amber-600">Nenhuma conta conectada. <Link to="/configuracoes" className="underline">Conecte em Configurações › Contas</Link> para ativar.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {accounts.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs">
                    {a.platform === 'linkedin' ? <Linkedin className="h-3.5 w-3.5 text-[#0A66C2]" /> : <Instagram className="h-3.5 w-3.5 text-[#E1306C]" />}
                    {a.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <section className="space-y-3 rounded-2xl border bg-card p-5" data-testid="wizard-acj">
          <div>
            <p className="font-display text-base font-semibold">Esta campanha também possui uma arquitetura relacional</p>
            <p className="text-xs text-muted-foreground">A estratégia diz o que a campanha precisa produzir; a ACJ diz que movimentos a jornada precisa. A Hive recalibra conforme aprende.</p>
          </div>
          {acjState === 'loading' && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> A Hive está desenhando a jornada relacional…</p>}
          {acjState === 'error' && (
            <p className="text-sm text-amber-600">Não consegui preparar o plano ACJ agora. <button type="button" className="underline" onClick={() => prepareAcj(weeks)}>Tentar de novo</button> — ou gere depois no detalhe da campanha.</p>
          )}
          {acjPlan && acjState !== 'loading' && (
            <AcjPlanCard plan={acjPlan} status={acjApproved ? 'approved' : 'recommended'}
              actions={(
                <Button variant={acjApproved ? 'outline' : 'accent'} size="sm" onClick={() => setAcjApproved((v) => !v)} data-testid="wizard-acj-approve">
                  {acjApproved ? <><Check className="h-4 w-4" /> Plano ACJ aprovado — desfazer</> : 'Aprovar plano ACJ'}
                </Button>
              )} />
          )}
        </section>
        {showMatrix && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">A Hive distribuirá os movimentos estratégicos ao longo do período:</p>
            <StrategyMatrix matrix={phasesToMatrix(strategy.phases, weeks)} />
          </div>
        )}
      </WizardShell>
    );
  }

  if (step === 'ativa' && result) {
    const first = result.cycles[0];
    return (
      <WizardShell eyebrow={result.campaign.name} title="Sua campanha começou."
        subtitle="A Hive vai planejar e desenvolver seus conteúdos em ciclos, ajustando as próximas recomendações conforme aprendemos com os resultados."
        footer={(
          <>
            <Button variant="accent" size="lg" onClick={() => navigate(`/producao?campaign=${result.campaign.id}&cycle=${first?.id ?? ''}`)}>
              Revisar primeiro ciclo →
            </Button>
            <Button variant="ghost" onClick={() => navigate('/')}>Fazer depois</Button>
          </>
        )}>
        <HiveNote title="Próximo passo">
          O primeiro ciclo de conteúdos já pode ser planejado. Leva cerca de 3 minutos.
        </HiveNote>
      </WizardShell>
    );
  }

  return null;
}
