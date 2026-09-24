import { FUNCTION_SHORT, INTENSITY_LABELS, STRATEGIC_FUNCTIONS, type StrategyBlock, type IntensityLevel } from '@/types';

const LEVEL_STYLE: Record<IntensityLevel, string> = {
  muito_baixo: 'bg-secondary/60 text-muted-foreground',
  baixo: 'bg-accent/10 text-foreground/70',
  medio: 'bg-accent/25 text-foreground',
  alto: 'bg-accent/60 text-foreground font-semibold',
};

// "Ver estratégia": a matriz semanas × funções que a Hive usa por trás (a superfície
// não precisa dela — D Tela 07). Rolagem horizontal própria em telas estreitas.
export function StrategyMatrix({ matrix }: { matrix: StrategyBlock[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border" data-testid="strategy-matrix">
      <table className="w-full min-w-[480px] text-sm">
        <thead className="bg-secondary/40 text-xs text-muted-foreground">
          <tr>
            <th className="p-2.5 text-left font-medium">Função</th>
            {matrix.map((b) => <th key={b.weeks} className="p-2.5 text-center font-medium">Sem. {b.weeks}</th>)}
          </tr>
        </thead>
        <tbody>
          {STRATEGIC_FUNCTIONS.map((f) => (
            <tr key={f} className="border-t">
              <td className="p-2.5 font-medium">{FUNCTION_SHORT[f]}</td>
              {matrix.map((b) => {
                const lvl = b.levels[f] ?? 'medio';
                return (
                  <td key={b.weeks} className="p-1.5 text-center">
                    <span className={`inline-block w-full rounded-md px-2 py-1 text-xs ${LEVEL_STYLE[lvl]}`}>{INTENSITY_LABELS[lvl]}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
