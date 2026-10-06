import { useState } from 'react';
import { CalendarDays, ChevronRight, Plus } from 'lucide-react';
import { HiveNote } from '@/components/campaign/HiveNote';
import { formatDay, formatRange } from '@/lib/campaign/dates';
import { CYCLE_STATUS_LABELS } from '@/lib/campaign/labels';
import { CAMPAIGN_TYPE_LABELS, type Campaign, type CampaignCycle } from '@/types';

function Radio({ on }: { on: boolean }) {
  return <span className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on ? 'border-accent' : 'border-border'}`}>
    {on && <span className="h-2 w-2 rounded-full bg-accent" />}</span>;
}

// Coluna esquerda da produção: "1. Para qual campanha?" + "2. Para qual ciclo?".
export function CampaignCyclePicker({ campaigns, campaignId, cycles, cycleId, recommendedCycleId, onCampaign, onCycle, onAvulso }: {
  campaigns: Campaign[]; campaignId?: string; cycles: CampaignCycle[]; cycleId?: string; recommendedCycleId?: string;
  onCampaign: (id: string) => void; onCycle: (id: string) => void; onAvulso: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  // Ciclos que passaram sem terminar continuam acessíveis (marcados "Atrasado");
  // os concluídos aparecem em "Ver ciclos anteriores" (pra editar/reprogramar).
  const late = cycles.filter((c) => c.end_date < today && c.status !== 'done');
  const done = cycles.filter((c) => c.end_date < today && c.status === 'done');
  const upcoming = cycles.filter((c) => c.end_date >= today);
  const base = [...late, ...(showAll ? upcoming : upcoming.slice(0, 3))];
  const selected = cycles.find((c) => c.id === cycleId);
  const visible = [...(showAll ? done : selected && !base.includes(selected) ? [selected] : []), ...base];
  return (
    <div className="space-y-5">
      <section className="space-y-2 rounded-2xl border bg-card p-4">
        <h2 className="font-display text-base font-semibold">1. Para qual campanha?</h2>
        {campaigns.map((c) => (
          <button key={c.id} type="button" onClick={() => onCampaign(c.id)} data-testid="pick-campaign"
            className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${c.id === campaignId ? 'border-accent bg-accent/10' : 'hover:bg-accent/5'}`}>
            <Radio on={c.id === campaignId} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{c.name}</span>
              <span className="block text-xs text-muted-foreground">{CAMPAIGN_TYPE_LABELS[c.type]}</span>
              {c.start_date && c.end_date && <span className="mt-1 block text-xs"><span className="mr-1.5 rounded bg-emerald-500/15 px-1.5 py-0.5 font-medium text-emerald-700 dark:text-emerald-400">Ativa</span>{formatDay(c.start_date)} – {formatDay(c.end_date)}</span>}
            </span>
            <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: c.color ?? '#94A3B8' }} />
          </button>
        ))}
        <button type="button" onClick={onAvulso} className="flex w-full items-center gap-3 rounded-xl border border-dashed p-3 text-left hover:bg-accent/5">
          <Plus className="h-4 w-4 text-muted-foreground" />
          <span><span className="block text-sm font-semibold">Sem campanha</span><span className="block text-xs text-muted-foreground">Criar um conteúdo avulso.</span></span>
        </button>
      </section>

      {campaignId && (
        <section className="space-y-2 rounded-2xl border bg-card p-4">
          <h2 className="font-display text-base font-semibold">2. Para qual ciclo?</h2>
          {visible.map((cy) => {
            const current = cy.start_date <= today && today <= cy.end_date;
            return (
              <button key={cy.id} type="button" onClick={() => onCycle(cy.id)} data-testid="pick-cycle"
                className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${cy.id === cycleId ? 'border-accent bg-accent/10' : 'hover:bg-accent/5'}`}>
                <Radio on={cy.id === cycleId} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{current ? 'Ciclo atual' : `Ciclo ${String(cy.idx).padStart(2, '0')}`} · {formatRange(cy.start_date, cy.end_date)}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {CYCLE_STATUS_LABELS[cy.status]}
                    {cy.end_date < today && cy.status !== 'done' && <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600" data-testid="cycle-late">Atrasado</span>}
                    {cy.id === recommendedCycleId && <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">Recomendado</span>}
                  </span>
                </span>
                <CalendarDays className="mt-0.5 h-4 w-4 text-muted-foreground" />
              </button>
            );
          })}
          {(upcoming.length > 3 || done.length > 0) && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="flex w-full items-center justify-between rounded-xl border p-3 text-sm hover:bg-accent/5">
              {showAll ? 'Mostrar menos' : done.length ? 'Ver ciclos anteriores e futuros' : 'Ver ciclos futuros'} <ChevronRight className={`h-4 w-4 transition-transform ${showAll ? 'rotate-90' : ''}`} />
            </button>
          )}
          {/* Só sugere voltar ao ciclo atual quando ELE é o recomendado (ainda sem pauta aprovada). */}
          {recommendedCycleId && recommendedCycleId !== cycleId
            && cycles.some((c) => c.id === recommendedCycleId && c.start_date <= today && today <= c.end_date) && (
            <HiveNote className="p-3">Começar pelo ciclo atual.</HiveNote>
          )}
        </section>
      )}
    </div>
  );
}
