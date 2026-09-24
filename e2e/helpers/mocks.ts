import type { Page, Route } from '@playwright/test';

// Intercepta edge functions de IA com respostas realistas (determinístico, sem custo).
// Responde também o preflight CORS, já que o app chama o Supabase cross-origin.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export type EdgeHandler = (body: Record<string, unknown>) => unknown | Promise<unknown>;

export async function mockEdge(page: Page, fn: string, handler: EdgeHandler, calls?: Array<Record<string, unknown>>): Promise<void> {
  await page.route(`**/functions/v1/${fn}`, async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: CORS });
    const body = (req.postDataJSON?.() ?? {}) as Record<string, unknown>;
    calls?.push(body);
    const json = await handler(body);
    return route.fulfill({ status: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(json) });
  });
}

export const MOMENT = {
  success: true,
  moment: {
    label: 'Expansão de presença',
    summary: 'Você já construiu uma presença digital relevante, mas ainda existe espaço importante para ampliar alcance, consistência e reconhecimento.',
    signals: ['63 publicações nos últimos 180 dias', 'LinkedIn mais consistente que o Instagram'],
  },
  facts: {},
};

const PHASES = [
  { presenca: 'alto', posicionamento: 'alto', autoridade: 'baixo', relacionamento: 'medio', produtos: 'muito_baixo' },
  { presenca: 'alto', posicionamento: 'alto', autoridade: 'medio', relacionamento: 'medio', produtos: 'baixo' },
  { presenca: 'medio', posicionamento: 'alto', autoridade: 'alto', relacionamento: 'medio', produtos: 'baixo' },
  { presenca: 'medio', posicionamento: 'medio', autoridade: 'alto', relacionamento: 'medio', produtos: 'medio' },
];

export function strategyResponse(body: Record<string, unknown>) {
  const adjust = body.mode === 'adjust';
  return {
    success: true,
    strategy: {
      mix: adjust
        ? { presenca: 30, posicionamento: 25, autoridade: 35, relacionamento: 10, produtos: 0 }
        : { presenca: 35, posicionamento: 30, autoridade: 20, relacionamento: 10, produtos: 5 },
      rationale: adjust
        ? 'Aumentei autoridade para 35% e zerei produtos, como você pediu.'
        : 'Sua presença já possui uma base, mas ainda existe oportunidade relevante de expansão.',
      phases: PHASES,
      recommended_weeks: 8,
      duration_rationale: 'É um período suficiente para construir recorrência e aprender com os resultados.',
    },
  };
}

export async function mockCampaignAI(page: Page, calls: { moment: Array<Record<string, unknown>>; strategy: Array<Record<string, unknown>> } = { moment: [], strategy: [] }) {
  await mockEdge(page, 'campaign-moment', (b) => (b.user_note
    ? { ...MOMENT, moment: { ...MOMENT.moment, label: 'Consolidação de autoridade', summary: 'Leitura ajustada a partir do que você contou.' } }
    : MOMENT), calls.moment);
  await mockEdge(page, 'campaign-strategy', strategyResponse, calls.strategy);
  return calls;
}
