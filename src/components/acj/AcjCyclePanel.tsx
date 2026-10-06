// "Jornada relacional deste ciclo (ACJ)" — Planejamento do ciclo (etapa 3).
// Mostra a composição recomendada (contagens absolutas, sem falsa precisão %),
// a razão, lacunas e saturações. Sem plano aprovado: só avisa, não bloqueia.
import { Link } from 'react-router-dom';
import { AlertTriangle, Minus, Plus } from 'lucide-react';
import { ACJ_META, acjColor } from '@/lib/acj/library';
import { sumCounts, type AcjCounts, type AcjCycleDraft } from '@/lib/acj/cyclePlan';
import { ACJ_IDS, type AcjCampaignPlan, type AcjCyclePlan, type AcjId } from '@/types';

export function AcjCyclePanel({ campaignId, campaignPlan, draft, saved, adjusting, contents, onChange }: {
  campaignId: string; campaignPlan: AcjCampaignPlan | null; draft: AcjCycleDraft | null; saved: AcjCyclePlan | null;
  adjusting: boolean; contents: number; onChange: (c: AcjCounts) => void;
}) {
  const counts: AcjCounts = saved?.counts ?? draft?.counts ?? {};
  const rationale = saved?.rationale ?? draft?.rationale;
  const gaps = saved?.gaps ?? draft?.gaps ?? [];
  const saturation = saved?.saturation_flags ?? draft?.saturation_flags ?? [];
  const total = sumCounts(counts);
  const set = (id: AcjId, v: number) => onChange({ ...counts, [id]: Math.max(0, v) });
  const approved = campaignPlan && (campaignPlan.status === 'approved' || campaignPlan.status === 'active');

  return (
    <section className="rounded-2xl border bg-card p-4" data-testid="acj-cycle-panel">
      <h3 className="mb-1 text-sm font-semibold">Jornada relacional deste ciclo (ACJ)</h3>
      {!campaignPlan && !saved ? (
        <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400" data-testid="acj-cycle-noplan">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Esta campanha ainda não tem plano ACJ: as ideias serão geradas sem composição relacional. <Link to={`/campanhas/${campaignId}`} className="underline">Gerar plano ACJ na campanha</Link>.</span>
        </p>
      ) : (
        <>
          {!saved && !approved && (
            <p className="mb-2 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400" data-testid="acj-cycle-unapproved">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Plano ACJ da campanha aguardando aprovação — usando a recomendação da Hive. <Link to={`/campanhas/${campaignId}`} className="underline">Revisar e aprovar</Link>.</span>
            </p>
          )}
          {rationale && <p className="mb-3 text-xs text-muted-foreground" data-testid="acj-cycle-rationale">{rationale}</p>}
          <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {ACJ_IDS.filter((id) => adjusting || (counts[id] ?? 0) > 0).map((id) => (
              <li key={id} className="flex items-center justify-between gap-2 text-sm" data-testid={`acj-cycle-${id}`}>
                <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: acjColor(id) }} />{id} {ACJ_META[id].name}</span>
                {adjusting && !saved ? (
                  <span className="inline-flex items-center gap-1">
                    <button type="button" aria-label={`Menos ${ACJ_META[id].name}`} onClick={() => set(id, (counts[id] ?? 0) - 1)} className="rounded border p-0.5 hover:bg-accent/10"><Minus className="h-3 w-3" /></button>
                    <span className="w-5 text-center tabular-nums">{counts[id] ?? 0}</span>
                    <button type="button" aria-label={`Mais ${ACJ_META[id].name}`} onClick={() => set(id, (counts[id] ?? 0) + 1)} className="rounded border p-0.5 hover:bg-accent/10"><Plus className="h-3 w-3" /></button>
                  </span>
                ) : <span className="text-muted-foreground">{counts[id] ?? 0} conteúdo{(counts[id] ?? 0) === 1 ? '' : 's'}</span>}
              </li>
            ))}
          </ul>
          {!saved && total !== contents && (
            <p className="mt-2 text-xs font-medium text-amber-600" data-testid="acj-cycle-mismatch">A jornada relacional soma {total} de {contents} conteúdos.</p>
          )}
          {(gaps.length > 0 || saturation.length > 0) && (
            <ul className="mt-3 space-y-0.5 border-t pt-2 text-xs text-muted-foreground">
              {gaps.map((g) => <li key={g}>Lacuna: {g}</li>)}
              {saturation.map((g) => <li key={g}>Saturação: {g}</li>)}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
