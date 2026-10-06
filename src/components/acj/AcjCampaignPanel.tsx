// "Jornada relacional (ACJ)" no detalhe da campanha: gerar, ajustar e APROVAR o
// plano ACJ (clique separado da estratégia). Versões anteriores nunca são apagadas.
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Loader2, RotateCcw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AcjPlanCard } from './AcjPlanCard';
import { edge } from '@/lib/edge';
import { acjPlanApi } from '@/lib/acj/api';
import { PLAN_STATUS_LABELS } from '@/lib/acj/library';
import type { AcjCampaignPlan, Campaign } from '@/types';

// Campanha que já começou (ciclos passados ou em curso) adota a ACJ tardiamente.
export const isLateAdoption = (c: Campaign) => !!c.start_date && c.start_date < new Date().toISOString().slice(0, 10) && c.status !== 'draft';

export function AcjCampaignPanel({ campaign }: { campaign: Campaign }) {
  const [plans, setPlans] = useState<AcjCampaignPlan[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  const load = useCallback(async () => setPlans(await acjPlanApi.listByCampaign(campaign.id)), [campaign.id]);
  useEffect(() => { void load().catch(() => setPlans([])); }, [load]);

  const approved = plans?.find((p) => p.status === 'approved' || p.status === 'active') ?? null;
  const pending = plans?.find((p) => p.status === 'recommended' || p.status === 'draft' || p.status === 'recalibration_needed') ?? null;
  const shown = pending ?? approved;

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try { await fn(); } catch (e) { toast.error((e as Error).message.slice(0, 180)); } finally { setBusy(null); }
  }

  const generate = (text?: string) => run(text ? 'adjust' : 'generate', async () => {
    const base = shown ?? undefined;
    const r = await edge.acjCampaignPlan({
      campaign_id: campaign.id, adoption: isLateAdoption(campaign) ? 'late' : 'native',
      instruction: text, current: base ? { target_mix: base.target_mix } : undefined,
    });
    await acjPlanApi.create(campaign.id, r.plan, { instruction: text });
    setInstruction(''); setAdjusting(false);
    await load();
    toast.success(text ? 'A Hive trouxe uma nova versão do plano ACJ.' : 'Plano ACJ recomendado. Revise e aprove quando fizer sentido.');
  });

  const approve = (p: AcjCampaignPlan) => run('approve', async () => {
    await acjPlanApi.approve(p);
    await load();
    toast.success('Plano ACJ aprovado.');
  });

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5" data-testid="acj-campaign-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold">Jornada relacional (ACJ)</h2>
          <p className="text-xs text-muted-foreground">Eixo separado da estratégia: que movimentos a jornada precisa — Reconhecimento, Identificação, Conexão, Experimentação e Aprofundamento.</p>
        </div>
      </div>

      {plans === null && <Loader2 className="h-5 w-5 animate-spin text-accent" />}

      {plans !== null && !shown && (
        <div className="space-y-3 rounded-xl border border-dashed p-4 text-sm" data-testid="acj-plan-empty">
          <p>Esta campanha ainda não tem plano ACJ.{isLateAdoption(campaign) ? ' Como ela já está em andamento, o plano será marcado como adoção tardia (o que já foi publicado fica como legado, sem reclassificação).' : ''}</p>
          <Button variant="accent" onClick={() => generate()} disabled={!!busy}>
            {busy === 'generate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Gerar plano ACJ com a Hive
          </Button>
        </div>
      )}

      {shown && (
        <>
          {pending && approved && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300" data-testid="acj-plan-pending-note">
              Nova versão v{pending.version} aguardando aprovação. A v{approved.version} ({PLAN_STATUS_LABELS[approved.status].toLowerCase()}) continua valendo até você aprovar.
            </p>
          )}
          <AcjPlanCard plan={shown} status={shown.status} version={shown.version}
            actions={(
              <>
                {pending && (
                  <Button variant="accent" onClick={() => approve(pending)} disabled={!!busy} data-testid="acj-approve">
                    {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Aprovar plano ACJ
                  </Button>
                )}
                {!adjusting && <Button variant="ghost" onClick={() => setAdjusting(true)} disabled={!!busy}><RotateCcw className="h-4 w-4" /> Pedir ajuste</Button>}
              </>
            )} />
          {adjusting && (
            <div className="flex gap-2" data-testid="acj-adjust">
              <Input aria-label="Ajuste do plano ACJ" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Ex.: quero mais Conexão antes da abertura das inscrições" />
              <Button variant="accent" onClick={() => generate(instruction)} disabled={!instruction.trim() || !!busy}>
                {busy === 'adjust' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Reorganizar
              </Button>
              <Button variant="ghost" onClick={() => setAdjusting(false)}>Cancelar</Button>
            </div>
          )}
          {plans && plans.length > 1 && (
            <p className="text-xs text-muted-foreground" data-testid="acj-plan-versions">
              Versões: {plans.map((p) => `v${p.version} (${PLAN_STATUS_LABELS[p.status].toLowerCase()})`).join(' · ')}
            </p>
          )}
        </>
      )}
    </section>
  );
}
