import { FUNCTION_COLORS, FUNCTION_HINTS, FUNCTION_LABELS, STRATEGIC_FUNCTIONS, type StrategicFunction, type StrategyMix } from '@/types';
import { mixTotal } from '@/lib/campaign/strategy';

// Equilíbrio estratégico: % por função + descrição (Tela 05). Em modo edição,
// cada % vira um campo numérico (a soma é mostrada e normalizada por quem usa).
export function MixBars({ mix, editable = false, onChange, compact = false }: {
  mix: Partial<StrategyMix>;
  editable?: boolean;
  onChange?: (f: StrategicFunction, v: number) => void;
  compact?: boolean;
}) {
  const ordered = [...STRATEGIC_FUNCTIONS].sort((a, b) => (mix[b] ?? 0) - (mix[a] ?? 0));
  const total = mixTotal(mix);
  return (
    <div className="space-y-3" data-testid="mix-bars">
      {(editable ? STRATEGIC_FUNCTIONS : ordered).map((f) => {
        const v = mix[f] ?? 0;
        return (
          <div key={f} className="space-y-1" data-testid={`mix-${f}`}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold">
                {editable ? (
                  <span className="inline-flex items-center gap-1">
                    <input
                      type="number" min={0} max={100} value={v} aria-label={`Percentual ${FUNCTION_LABELS[f]}`}
                      onChange={(e) => onChange?.(f, Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                      className="w-14 rounded-md border border-input bg-background px-1.5 py-0.5 text-right text-sm"
                    />%
                  </span>
                ) : <span className="tabular-nums">{v}%</span>}
                <span className="ml-2 font-medium">— {FUNCTION_LABELS[f]}</span>
              </p>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, v)}%`, backgroundColor: FUNCTION_COLORS[f] }} />
            </div>
            {!compact && <p className="text-xs text-muted-foreground">{FUNCTION_HINTS[f]}</p>}
          </div>
        );
      })}
      {editable && (
        <p className={`text-xs ${total === 100 ? 'text-muted-foreground' : 'font-medium text-amber-600'}`} data-testid="mix-total">
          Soma: {total}%{total !== 100 ? ' — ao continuar, a Hive reequilibra pra 100%.' : ''}
        </p>
      )}
    </div>
  );
}

// Barra empilhada fininha (cards de campanha).
export function MixStrip({ mix }: { mix: Partial<StrategyMix> }) {
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-secondary" title="Equilíbrio estratégico">
      {STRATEGIC_FUNCTIONS.map((f) => (
        <div key={f} style={{ width: `${mix[f] ?? 0}%`, backgroundColor: FUNCTION_COLORS[f] }} />
      ))}
    </div>
  );
}
