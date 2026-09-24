// Estratégia da campanha: mix % das 5 funções + matriz de intensidade.
import type { CampaignStrategy, IntensityLevel, StrategicFunction, StrategyBlock, StrategyMix } from '@/types';
import { STRATEGIC_FUNCTIONS } from '@/types';

// Inteiros não negativos somando exatamente 100 (maior resto). Espelha o servidor.
export function normalizeMix(raw: Partial<Record<StrategicFunction, number>>): StrategyMix {
  const vals = STRATEGIC_FUNCTIONS.map((f) => Math.max(0, Number(raw[f]) || 0));
  const total = vals.reduce((a, b) => a + b, 0);
  if (total <= 0) return { presenca: 20, posicionamento: 20, autoridade: 20, relacionamento: 20, produtos: 20 };
  const exact = vals.map((v) => (v / total) * 100);
  const out = exact.map(Math.floor);
  let rest = 100 - out.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => [e - Math.floor(e), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (rest <= 0) break; out[i]++; rest--; }
  return Object.fromEntries(STRATEGIC_FUNCTIONS.map((f, i) => [f, out[i]])) as StrategyMix;
}

export const mixTotal = (m: Partial<StrategyMix>) => STRATEGIC_FUNCTIONS.reduce((a, f) => a + (Number(m[f]) || 0), 0);

// Divide `weeks` semanas em até 4 blocos contíguos (as 4 fases da estratégia).
// 8 → [1-2][3-4][5-6][7-8] · 4 → [1][2][3][4] · 12 → [1-3]… · 6 → [1-2][3-4][5][6]
export function blocksForWeeks(weeks: number): Array<[number, number]> {
  const n = Math.min(4, Math.max(1, weeks));
  const base = Math.floor(weeks / n), extra = weeks % n;
  const out: Array<[number, number]> = [];
  let w = 1;
  for (let i = 0; i < n; i++) {
    const len = base + (i < extra ? 1 : 0);
    out.push([w, w + len - 1]);
    w += len;
  }
  return out;
}

// Mapeia as 4 fases (vindas da IA) pros blocos de semanas da duração escolhida.
export function phasesToMatrix(phases: Array<Record<StrategicFunction, IntensityLevel>>, weeks: number): StrategyBlock[] {
  const blocks = blocksForWeeks(weeks);
  return blocks.map(([a, b], i) => {
    // Com menos de 4 blocos, pega as fases proporcionalmente (início…fim).
    const phaseIdx = blocks.length === 1 ? 0 : Math.round((i * (phases.length - 1)) / (blocks.length - 1));
    return { weeks: a === b ? `${a}` : `${a}–${b}`, levels: phases[phaseIdx] ?? phases[0] };
  });
}

// Estratégia persistida na campanha (matriz já expandida pra duração final).
export function finalizeStrategy(
  s: { mix: StrategyMix; rationale: string; phases: Array<Record<StrategicFunction, IntensityLevel>>; recommended_weeks: number; duration_rationale: string },
  weeks: number,
): CampaignStrategy & { phases: typeof s.phases } {
  return {
    mix: normalizeMix(s.mix),
    rationale: s.rationale,
    matrix: phasesToMatrix(s.phases, weeks),
    recommended_weeks: s.recommended_weeks,
    duration_rationale: s.duration_rationale,
    phases: s.phases,
  };
}

// Paleta das campanhas (barras/timeline da agenda). Legível em claro e escuro.
export const CAMPAIGN_PALETTE = ['#10B981', '#6366F1', '#F97316', '#EC4899', '#0EA5E9', '#EAB308'];
