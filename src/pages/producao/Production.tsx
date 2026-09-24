// PRODUÇÃO DE CONTEÚDOS — stepper Campanha → Ciclo → Planejamento → Ideias →
// Desenvolvimento → Revisão (maquete). A etapa vem do status do ciclo; as já
// alcançadas podem ser revisitadas pelo trilho.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProductionStepper } from '@/components/production/ProductionStepper';
import { CampaignCyclePicker } from '@/components/production/CampaignCyclePicker';
import { PlanStep } from '@/components/production/PlanStep';
import { PautaStep } from '@/components/production/PautaStep';
import { accountApi, campaignApi, cycleApi, ideaApi } from '@/lib/campaignApi';
import { beeApi } from '@/lib/api';
import type { BeeEditorial, Campaign, CampaignCycle, CycleStatus, Idea, SocialAccount } from '@/types';

const STEP_BY_STATUS: Record<CycleStatus, number> = {
  not_started: 2, planned: 3, pauta_ready: 3, pauta_approved: 4, developing: 4, producing: 5, ready: 5, done: 5,
};
const ADVANCED: CycleStatus[] = ['pauta_approved', 'developing', 'producing', 'ready', 'done'];

export function recommendedCycle(cycles: CampaignCycle[], today = new Date().toISOString().slice(0, 10)): CampaignCycle | undefined {
  const current = cycles.find((c) => c.start_date <= today && today <= c.end_date);
  if (current && !ADVANCED.includes(current.status)) return current;
  return cycles.find((c) => c.start_date > today && !ADVANCED.includes(c.status)) ?? current;
}

export function Production() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [cycles, setCycles] = useState<CampaignCycle[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [editorials, setEditorials] = useState<BeeEditorial[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [viewStep, setViewStep] = useState<number | null>(null);

  const campaignId = params.get('campaign') ?? undefined;
  const cycleId = params.get('cycle') ?? undefined;
  const campaign = campaigns?.find((c) => c.id === campaignId);
  const cycle = cycles.find((c) => c.id === cycleId);
  const rec = useMemo(() => recommendedCycle(cycles), [cycles]);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    Promise.all([campaignApi.list(), accountApi.list(), beeApi.editorials()])
      .then(([c, a, e]) => { setCampaigns(c.filter((x) => x.status === 'active')); setAccounts(a); setEditorials(e.filter((x) => x.is_active !== false)); })
      .catch(() => setCampaigns([]));
  }, []);

  // Sem campanha na URL: pré-seleciona a primeira ativa (não pergunta o que já sabe).
  useEffect(() => {
    if (campaigns && !campaignId && campaigns[0]) setParams({ campaign: campaigns[0].id }, { replace: true });
  }, [campaigns, campaignId, setParams]);

  useEffect(() => {
    if (!campaignId) { setCycles([]); return; }
    cycleApi.listByCampaign(campaignId).then(setCycles).catch(() => setCycles([]));
  }, [campaignId]);

  // Sem ciclo na URL: o recomendado.
  useEffect(() => {
    if (campaignId && !cycleId && rec) setParams({ campaign: campaignId, cycle: rec.id }, { replace: true });
  }, [campaignId, cycleId, rec, setParams]);

  const loadIdeas = useCallback(async () => {
    if (!cycleId) { setIdeas([]); return; }
    setIdeas(await ideaApi.listByCycle(cycleId));
  }, [cycleId]);
  useEffect(() => { void loadIdeas(); setViewStep(null); }, [loadIdeas]);

  function replaceCycle(c: CampaignCycle) { setCycles((cs) => cs.map((x) => (x.id === c.id ? c : x))); }

  if (!campaigns) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>;

  if (campaigns.length === 0) {
    return (
      <div className="mx-auto max-w-xl p-10 text-center">
        <p className="font-display text-xl font-semibold">Nenhuma campanha ativa</p>
        <p className="mt-1 text-sm text-muted-foreground">A produção acontece dentro de uma campanha. Crie uma — ou faça um conteúdo avulso.</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="accent" onClick={() => navigate('/campanhas/nova')}>Criar campanha</Button>
          <Button variant="outline" onClick={() => navigate('/posts/novo')}>Conteúdo avulso</Button>
        </div>
      </div>
    );
  }

  const statusStep = cycle ? STEP_BY_STATUS[cycle.status] : campaign ? 1 : 0;
  const step = viewStep ?? statusStep;

  return (
    <div className="flex min-h-full flex-col">
      <ProductionStepper current={step} reached={statusStep} onSelect={(i) => setViewStep(i === statusStep ? null : i)} />
      <div className="mx-auto grid w-full max-w-7xl flex-1 gap-6 p-4 lg:grid-cols-[340px_1fr] lg:p-6">
        <aside>
          <CampaignCyclePicker
            campaigns={campaigns} campaignId={campaignId} cycles={cycles} cycleId={cycleId} recommendedCycleId={rec?.id}
            onCampaign={(id) => setParams({ campaign: id })}
            onCycle={(id) => setParams({ campaign: campaignId!, cycle: id })}
            onAvulso={() => navigate('/posts/novo')}
          />
        </aside>
        <main className="min-w-0">
          {!campaign || !cycle ? (
            <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">Escolha a campanha e o ciclo para continuar.</div>
          ) : step === 2 ? (
            <PlanStep key={cycle.id} campaign={campaign} cycle={cycle} accounts={accounts}
              isCurrent={cycle.start_date <= today && today <= cycle.end_date}
              onBack={() => navigate(`/campanhas/${campaign.id}`)}
              onDone={(c, i) => { replaceCycle(c); setIdeas(i); setViewStep(null); }} />
          ) : step === 3 ? (
            <PautaStep campaign={campaign} cycle={cycle} ideas={ideas} editorials={editorials} accounts={accounts}
              onChange={(i, c) => { setIdeas(i); if (c) replaceCycle(c); }}
              onApproved={(c) => { replaceCycle(c); setViewStep(null); }} />
          ) : (
            <div className="space-y-4 rounded-2xl border bg-card p-8" data-testid="develop-step">
              <p className="flex items-center gap-2 font-display text-xl font-semibold"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Pauta aprovada</p>
              <p className="text-sm text-muted-foreground">Agora a Hive vai transformar as ideias aprovadas em conteúdos-mãe.</p>
              <ol className="space-y-1 text-sm">
                {ideas.filter((i) => i.status === 'approved' || i.status === 'developed').map((i, n) => (
                  <li key={i.id}><span className="mr-2 text-muted-foreground">{String(n + 1).padStart(2, '0')}</span>{i.title}</li>
                ))}
              </ol>
              <Link to={`/campanhas/${campaign.id}`} className="text-sm underline">Ver campanha</Link>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
