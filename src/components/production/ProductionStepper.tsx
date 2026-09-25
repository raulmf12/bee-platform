import { Check } from 'lucide-react';

export const PRODUCTION_STEPS = ['Campanha', 'Ciclo', 'Planejamento', 'Ideias', 'Desenvolvimento', 'Revisão'] as const;

// Trilho de etapas da produção (maquete "Produção de Conteúdos").
// `steps`/`offset`: o conteúdo avulso mostra só Ideia → Desenvolvimento → Revisão
// (índices reais 3–5), sem campanha/ciclo/planejamento.
export function ProductionStepper({ current, reached, onSelect, steps = PRODUCTION_STEPS, offset = 0 }: {
  current: number; reached: number; onSelect?: (i: number) => void; steps?: readonly string[]; offset?: number;
}) {
  return (
    <nav className="overflow-x-auto border-b bg-card/60" aria-label="Etapas da produção">
      <ol className="mx-auto flex min-w-[720px] max-w-6xl items-center gap-2 px-4 py-3">
        {steps.map((label, n) => {
          const i = n + offset;
          const done = i < current;
          const active = i === current;
          const clickable = !!onSelect && i >= 2 && i <= reached && i !== current;
          return (
            <li key={label} className="flex flex-1 items-center gap-2 last:flex-none">
              <button type="button" disabled={!clickable} onClick={() => clickable && onSelect?.(i)} data-testid={`step-${i}`}
                aria-current={active ? 'step' : undefined}
                className={`flex items-center gap-2 rounded-full px-2.5 py-1 text-sm transition-colors ${
                  active ? 'bg-accent/15 font-semibold text-foreground' : done ? 'text-accent' : 'text-muted-foreground'
                } ${clickable ? 'hover:bg-accent/10' : 'cursor-default'}`}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs ${
                  active ? 'border-accent bg-accent text-accent-foreground' : done ? 'border-accent text-accent' : 'border-border'
                }`}>{done ? <Check className="h-3.5 w-3.5" /> : n + 1}</span>
                {label}
              </button>
              {n < steps.length - 1 && <span className={`h-px flex-1 ${done ? 'bg-accent/50' : 'bg-border'}`} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
