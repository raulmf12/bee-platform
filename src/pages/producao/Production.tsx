// PRODUÇÃO DE CONTEÚDOS — stepper Campanha → Ciclo → Planejamento → Ideias →
// Desenvolvimento → Revisão (maquete). A etapa vem do status do ciclo; as já
// alcançadas podem ser revisitadas pelo trilho.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProductionStepper } from '@/components/production/ProductionStepper';
import { CampaignCyclePicker } from '@/components/production/CampaignCyclePicker';
import { PlanStep } from '@/components/production/PlanStep';
import { PautaStep } from '@/components/production/PautaStep';
import { DevelopStep } from '@/components/production/DevelopStep';
import { ReviewStep } from '@/components/production/ReviewStep';
import { accountApi, campaignApi, cycleApi, ideaApi } from '@/lib/campaignApi';
import { beeApi } from '@/lib/api';
import { isAvulso } from '@/lib/campaign/avulso';
import type { BeeEditorial, Campaign, CampaignCycle, CycleStatus, Idea, SocialAccount } from '@/types';
import { LoadError } from '@/components/shared/LoadState';
import { useAuthStore } from '@/store/authStore';

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
  const [avulso, setAvulso] = useState<Campaign | null>(null);
  const [loadError, setLoadError] = useState(false);
  const currentUser = useAuthStore((s) => s.currentUser);

  const campaignId = params.get('campaign') ?? undefined;
  const cycleId = params.get('cycle') ?? undefined;
  // Link direto para UM conteúdo (Pipeline/Início): a etapa de desenvolvimento abre nele.
  const contentId = params.get('content') ?? undefined;
  const campaign = campaigns?.find((c) => c.id === campaignId) ?? (avulso && avulso.id === campaignId ? avulso : undefined);
  const solo = isAvulso(campaign);
  const cycle = cycles.find((c) => c.id === cycleId);
  const rec = useMemo(() => recommendedCycle(cycles), [cycles]);
  const today = new Date().toISOString().slice(0, 10);

  const loadBase = useCallback(() => {
    setLoadError(false);
    Promise.all([campaignApi.list(), accountApi.list(), beeApi.editorials(), campaignApi.getAvulso()])
      .then(([c, a, e, av]) => { setCampaigns(c.filter((x) => x.status === 'active')); setAccounts(a); setEditorials(e.filter((x) => x.is_active !== false)); setAvulso(av); })
      .catch(() => setLoadError(true));                    // falha ≠ "nenhuma campanha ativa" (doc 04 §13)
  }, []);
  useEffect(() => { loadBase(); }, [loadBase]);

  // Sem campanha na URL (doc 04 §9.2): retoma o último trabalho escolhido (se ainda vale); com UMA só
  // campanha, abre ela; com várias, NÃO assume a primeira — mostra o seletor com a recomendação.
  const lastKey = currentUser ? `hive.lastWork.production.${currentUser.id}` : null;
  useEffect(() => {
    if (!campaigns || campaignId) return;
    let last: { campaign?: string; cycle?: string } = {};
    try { last = JSON.parse((lastKey && localStorage.getItem(lastKey)) || '{}'); } catch { /* ignora */ }
    const target = campaigns.find((c) => c.id === last.campaign) ?? (campaigns.length === 1 ? campaigns[0] : undefined);
    if (target) setParams({ campaign: target.id, ...(last.campaign === target.id && last.cycle ? { cycle: last.cycle } : {}) }, { replace: true });
  }, [campaigns, campaignId, setParams, lastKey]);

  // Ciclos da campanha: resposta de uma campanha anterior (troca rápida) é descartada.
  useEffect(() => {
    if (!campaignId) { setCycles([]); return; }
    let alive = true;
    cycleApi.listByCampaign(campaignId).then((c) => { if (alive) setCycles(c); }).catch(() => { if (alive) setCycles([]); });
    return () => { alive = false; };
  }, [campaignId]);

  // Sem ciclo na URL: o recomendado — preservando o foco independente (content) que veio no link.
  useEffect(() => {
    if (campaignId && !cycleId && rec) setParams({ campaign: campaignId, cycle: rec.id, ...(contentId ? { content: contentId } : {}) }, { replace: true });
  }, [campaignId, cycleId, rec, setParams, contentId]);
  // Ciclo da URL que não é desta campanha: limpa (nunca mistura contexto antigo com campanha nova).
  useEffect(() => {
    if (campaignId && cycleId && cycles.length && !cycles.some((c) => c.id === cycleId)) setParams({ campaign: campaignId }, { replace: true });
  }, [campaignId, cycleId, cycles, setParams]);
  // Lembra o trabalho escolhido para a próxima entrada em /producao.
  useEffect(() => {
    if (lastKey && campaignId && cycleId) try { localStorage.setItem(lastKey, JSON.stringify({ campaign: campaignId, cycle: cycleId, at: Date.now() })); } catch { /* sem storage */ }
  }, [lastKey, campaignId, cycleId]);

  const loadIdeas = useCallback(async () => {
    if (!cycleId) { setIdeas([]); return; }
    const forCycle = cycleId;
    const list = await ideaApi.listByCycle(forCycle);
    setIdeas((cur) => (params.get('cycle') === forCycle || !params.get('cycle') ? list : cur));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId]);
  useEffect(() => { void loadIdeas(); }, [loadIdeas]);

  // Etapa revisitada fica na URL (?step=): sobrevive a recarregar e ao voltar; o estado de negócio continua no servidor.
  const stepParam = params.get('step');
  const setViewStep = (i: number | null) => {
    const n = new URLSearchParams(params);
    if (i === null) n.delete('step'); else n.set('step', String(i));
    setParams(n, { replace: true });
  };

  function replaceCycle(c: CampaignCycle) { setCycles((cs) => cs.map((x) => (x.id === c.id ? c : x))); }

  if (loadError) return <div className="mx-auto max-w-xl p-10"><LoadError what="as campanhas" onRetry={loadBase} /></div>;
  if (!campaigns) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>;

  if (campaigns.length === 0 && !solo) {
    return (
      <div className="mx-auto max-w-xl p-10 text-center">
        <p className="font-display text-xl font-semibold">Nenhuma campanha ativa</p>
        <p className="mt-1 text-sm text-muted-foreground">A produção acontece dentro de uma campanha. Crie uma — ou faça um conteúdo avulso.</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="accent" onClick={() => navigate('/campanhas/nova')}>Criar campanha</Button>
          <Button variant="outline" onClick={() => navigate('/criar/conteudo')}>Conteúdo avulso</Button>
        </div>
      </div>
    );
  }

  const statusStep = cycle ? STEP_BY_STATUS[cycle.status] : campaign ? 1 : 0;
  // etapa escolhida só vale se ainda é permitida (≤ etapa alcançada); senão, a etapa real do ciclo
  const wanted = stepParam !== null ? Number(stepParam) : null;
  const step = wanted !== null && wanted <= statusStep && wanted >= 0 ? wanted : statusStep;

  return (
    <div className="flex min-h-full flex-col">
      <ProductionStepper current={step} reached={statusStep} onSelect={(i) => { if (!solo || i >= 4) setViewStep(i === statusStep ? null : i); }}
        {...(solo ? { steps: ['Ideia', 'Desenvolvimento', 'Revisão'], offset: 3 } : {})} />
      <div className="mx-auto grid w-full max-w-7xl flex-1 gap-6 p-4 lg:grid-cols-[340px_1fr] lg:p-6">
        <aside>
          {solo ? (
            <section className="space-y-3 rounded-2xl border bg-card p-4" data-testid="avulso-card">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sem campanha · conteúdo avulso</p>
              <p className="font-display text-base font-semibold">{ideas[0]?.title ?? '…'}</p>
              {ideas[0]?.summary && <p className="text-sm text-muted-foreground">{ideas[0].summary}</p>}
              <Button variant="outline" size="sm" onClick={() => navigate('/criar/conteudo')}><Plus className="h-3.5 w-3.5" /> Criar outro conteúdo</Button>
            </section>
          ) : (
            <CampaignCyclePicker
              campaigns={campaigns} campaignId={campaignId} cycles={cycles} cycleId={cycleId} recommendedCycleId={rec?.id}
              onCampaign={(id) => setParams({ campaign: id })}
              onCycle={(id) => setParams({ campaign: campaignId!, cycle: id })}
              onAvulso={() => navigate('/criar/conteudo')}
            />
          )}
        </aside>
        <main className="min-w-0">
          {!campaign || !cycle ? (
            <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground" data-testid="choose-work">
              {!campaign ? 'Escolha em qual campanha você quer trabalhar (ao lado). A Hive não abre uma campanha por conta própria quando há mais de uma.' : 'Escolha o ciclo para continuar.'}
            </div>
          ) : step === 2 ? (
            <PlanStep key={cycle.id} campaign={campaign} cycle={cycle} accounts={accounts}
              isCurrent={cycle.start_date <= today && today <= cycle.end_date}
              onBack={() => navigate(`/campanhas/${campaign.id}`)}
              onDone={(c, i) => { replaceCycle(c); setIdeas(i); setViewStep(null); }} />
          ) : step === 3 ? (
            <PautaStep campaign={campaign} cycle={cycle} ideas={ideas} editorials={editorials} accounts={accounts}
              onChange={(i, c) => { setIdeas(i); if (c) replaceCycle(c); }}
              onApproved={(c) => { replaceCycle(c); setViewStep(null); }} />
          ) : step === 4 ? (
            <DevelopStep key={`${cycle.id}:${contentId ?? ''}`} campaign={campaign} cycle={cycle} ideas={ideas} editorials={editorials} accounts={accounts} focusContentId={contentId}
              onIdeasChange={setIdeas} onCycleChange={replaceCycle} onDone={(c) => { replaceCycle(c); setViewStep(null); }} />
          ) : (
            <ReviewStep campaign={campaign} cycle={cycle} ideas={ideas} editorials={editorials} accounts={accounts} onCycleChange={replaceCycle} />
          )}
        </main>
      </div>
    </div>
  );
}
