// Plano ACJ da campanha — síntese executiva + visão expandida (fases, hipóteses,
// sinais, limites). Marcos vê a síntese e a decisão, não todos os campos internos.
import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AcjMixBars } from './AcjMixBars';
import { AcjChip } from './AcjChip';
import { CONFIDENCE_LABELS, PLAN_STATUS_LABELS } from '@/lib/acj/library';
import type { AcjPlanDraft, AcjPlanStatus } from '@/types';

export function AcjPlanCard({ plan, status, version, actions, defaultOpen = false }: {
  plan: AcjPlanDraft; status?: AcjPlanStatus; version?: number; actions?: ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-4" data-testid="acj-plan-card">
      <div className="flex flex-wrap items-center gap-2">
        {status && <Badge variant={status === 'approved' || status === 'active' ? 'accent' : 'secondary'} data-testid="acj-plan-status">{PLAN_STATUS_LABELS[status]}</Badge>}
        {version !== undefined && <span className="text-xs text-muted-foreground">v{version}</span>}
        {plan.adoption === 'late' && <Badge variant="outline" data-testid="acj-plan-late">Adoção tardia</Badge>}
        <span className="text-xs text-muted-foreground">Confiança: {CONFIDENCE_LABELS[plan.confidence] ?? plan.confidence}</span>
      </div>
      {plan.summary?.journey && <p className="text-sm leading-relaxed" data-testid="acj-plan-journey">{plan.summary.journey}</p>}
      {plan.adoption_note && <p className="text-xs text-muted-foreground">{plan.adoption_note}</p>}
      <AcjMixBars mix={plan.target_mix} roles={plan.summary?.mix_roles} compact={!open} />
      {plan.human_decisions_required?.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm" data-testid="acj-plan-decisions">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">Precisa da sua decisão</p>
          <ul className="list-disc space-y-0.5 pl-4">{plan.human_decisions_required.map((d) => <li key={d}>{d}</li>)}</ul>
        </div>
      )}
      <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline" data-testid="acj-plan-toggle">
        {open ? <><ChevronUp className="h-4 w-4" /> Ocultar detalhes</> : <><ChevronDown className="h-4 w-4" /> Ver fases, hipóteses e limites</>}
      </button>
      {open && (
        <div className="space-y-4 text-sm" data-testid="acj-plan-details">
          <div className="grid gap-3 sm:grid-cols-2">
            {plan.audience_state && <div><p className="text-xs font-semibold uppercase text-muted-foreground">Estado atual da audiência</p><p>{plan.audience_state}</p></div>}
            {plan.desired_state && <div><p className="text-xs font-semibold uppercase text-muted-foreground">Estado desejado ao final</p><p>{plan.desired_state}</p></div>}
          </div>
          {plan.phases?.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Composição por fase</p>
              <ol className="grid gap-2 lg:grid-cols-2">
                {plan.phases.map((p) => (
                  <li key={p.phase} className="rounded-lg border p-3" data-testid="acj-phase">
                    <p className="font-medium">Fase {p.phase} · {p.label}</p>
                    {p.priority_movement && <p className="text-muted-foreground">{p.priority_movement}</p>}
                    <div className="mt-1.5 flex flex-wrap gap-1">{p.acj_primary.map((a) => <AcjChip key={a} id={a} size="xs" />)}</div>
                    {p.bridges && <p className="mt-1 text-xs text-muted-foreground">Pontes: {p.bridges}</p>}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {plan.sequence_hypotheses?.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Hipóteses de sequência (não é funil)</p>
              <ul className="space-y-1">{plan.sequence_hypotheses.map((h) => (
                <li key={h.id}><b>{h.id}</b> {h.sequence && <span className="text-muted-foreground">[{h.sequence}]</span>} {h.hypothesis} <span className="text-xs text-muted-foreground">· confiança {CONFIDENCE_LABELS[h.confidence] ?? h.confidence}{h.observe ? ` · observar: ${h.observe}` : ''}</span></li>
              ))}</ul>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            {(['audience', 'journey', 'business'] as const).map((k) => (plan.success_signals?.[k]?.length ?? 0) > 0 && (
              <div key={k}><p className="text-xs font-semibold uppercase text-muted-foreground">Sinais · {k === 'audience' ? 'audiência' : k === 'journey' ? 'jornada' : 'negócio'}</p>
                <ul className="list-disc pl-4">{plan.success_signals[k].map((s) => <li key={s}>{s}</li>)}</ul></div>
            ))}
          </div>
          {plan.exclusions?.length > 0 && <div><p className="text-xs font-semibold uppercase text-muted-foreground">Exclusões e limites</p><ul className="list-disc pl-4">{plan.exclusions.map((e) => <li key={e}>{e}</li>)}</ul></div>}
          {plan.recalibration_rules?.length > 0 && <div><p className="text-xs font-semibold uppercase text-muted-foreground">Quando recalibrar</p><ul className="list-disc pl-4">{plan.recalibration_rules.map((e) => <li key={e}>{e}</li>)}</ul></div>}
          <div className="grid gap-3 sm:grid-cols-3">
            {plan.summary?.why && <div><p className="text-xs font-semibold uppercase text-muted-foreground">Por que serve à estratégia</p><p>{plan.summary.why}</p></div>}
            {plan.summary?.risk && <div><p className="text-xs font-semibold uppercase text-muted-foreground">Principal risco</p><p>{plan.summary.risk}</p></div>}
            {plan.summary?.learn && <div><p className="text-xs font-semibold uppercase text-muted-foreground">O que a Hive vai aprender</p><p>{plan.summary.learn}</p></div>}
          </div>
        </div>
      )}
      {actions && <div className="flex flex-wrap items-center gap-2 pt-1">{actions}</div>}
    </div>
  );
}
