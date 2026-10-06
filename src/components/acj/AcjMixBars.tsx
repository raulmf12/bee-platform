import { ACJ_META, acjColor } from '@/lib/acj/library';
import { ACJ_IDS, type AcjId, type AcjMix } from '@/types';

// Mix relacional (eixo SEPARADO do mix estratégico): % por ACJ + frase do movimento.
export function AcjMixBars({ mix, roles, compact = false, counts }: {
  mix: Partial<AcjMix>; roles?: Partial<Record<AcjId, string>>; compact?: boolean; counts?: Partial<Record<AcjId, number>>;
}) {
  return (
    <div className="space-y-2.5" data-testid="acj-mix-bars">
      {ACJ_IDS.map((id) => {
        const v = mix[id] ?? 0;
        return (
          <div key={id} className="space-y-1" data-testid={`acj-mix-${id}`}>
            <p className="flex items-baseline justify-between gap-3 text-sm">
              <span><span className="font-semibold tabular-nums">{v}%</span> <span className="font-medium">— {id} {ACJ_META[id].name}</span>
                {!compact && <span className="ml-1.5 text-xs text-muted-foreground">“{ACJ_META[id].short}”</span>}</span>
              {counts && <span className="text-xs text-muted-foreground">{counts[id] ?? 0} conteúdo{(counts[id] ?? 0) === 1 ? '' : 's'}</span>}
            </p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, v)}%`, backgroundColor: acjColor(id) }} />
            </div>
            {!compact && roles?.[id] && <p className="text-xs text-muted-foreground">{roles[id]}</p>}
          </div>
        );
      })}
    </div>
  );
}

export function AcjMixStrip({ mix }: { mix: Partial<AcjMix> }) {
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-secondary" title="Mix relacional (ACJ)">
      {ACJ_IDS.map((id) => <div key={id} style={{ width: `${mix[id] ?? 0}%`, backgroundColor: acjColor(id) }} />)}
    </div>
  );
}
