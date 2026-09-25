// Tela 13 · CONTEXTO — timeline das campanhas ativas acima da Agenda: duração,
// início/fim, sobreposição e onde está o "hoje". Clicar numa campanha vira a LENTE
// da Agenda inteira; "Todas as campanhas" volta.
import { useState } from 'react';
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Campaign } from '@/types';

const RANGES = [30, 60, 90];

export function CampaignTimeline({ campaigns, lens, onLens }: {
  campaigns: Campaign[]; lens: string | null; onLens: (id: string | null) => void;
}) {
  const [range, setRange] = useState(30);
  const today = new Date();
  const start = addDays(today, -Math.round(range * 0.3));
  const pct = (d: Date) => Math.max(0, Math.min(100, (differenceInCalendarDays(d, start) / range) * 100));
  const todayPct = pct(today);
  const live = campaigns.filter((c) => c.start_date && c.end_date && c.status !== 'ended');
  if (live.length === 0) return null;
  return (
    <section className="rounded-2xl border bg-card p-4" data-testid="campaign-timeline">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Campanhas ativas</p>
        <div className="flex items-center gap-2">
          {lens && <button type="button" onClick={() => onLens(null)} className="rounded-full border px-3 py-1 text-xs hover:bg-accent/10" data-testid="lens-all">Todas as campanhas</button>}
          <select aria-label="Período da linha do tempo" value={range} onChange={(e) => setRange(Number(e.target.value))} className="rounded-md border border-input bg-background px-2 py-1 text-xs">
            {RANGES.map((r) => <option key={r} value={r}>Próximos {r} dias</option>)}
          </select>
        </div>
      </div>
      <div className="relative">
        <div className="absolute bottom-0 top-0 z-10 w-px bg-foreground/40" style={{ left: `calc(220px + (100% - 220px) * ${todayPct / 100})` }}>
          <span className="absolute -top-4 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold">Hoje · {format(today, 'd MMM', { locale: ptBR })}</span>
        </div>
        <ul className="space-y-2 pt-3">
          {live.map((c) => {
            const s = parseISO(c.start_date!), e = parseISO(c.end_date!);
            const left = pct(s), right = pct(addDays(e, 1));
            const dimmed = lens && lens !== c.id;
            return (
              <li key={c.id}>
                <button type="button" onClick={() => onLens(lens === c.id ? null : c.id)} data-testid="timeline-campaign" aria-pressed={lens === c.id}
                  className={`grid w-full grid-cols-[220px_1fr] items-center gap-2 rounded-md px-1 py-0.5 text-left transition-opacity hover:bg-accent/5 ${dimmed ? 'opacity-35' : ''}`}>
                  <span className="flex min-w-0 items-center gap-2 text-xs">
                    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: c.color ?? '#94A3B8' }} />
                    <span className="truncate font-medium">{c.name}</span>
                    <span className="shrink-0 text-muted-foreground">{format(s, 'dd MMM', { locale: ptBR })} – {format(e, 'dd MMM', { locale: ptBR })}</span>
                  </span>
                  <span className="relative h-2.5 rounded-full bg-secondary/60">
                    {right > left && <span className="absolute h-full rounded-full" style={{ left: `${left}%`, width: `${right - left}%`, backgroundColor: c.color ?? '#94A3B8' }} />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
