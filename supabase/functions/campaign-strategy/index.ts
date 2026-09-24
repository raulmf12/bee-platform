// Edge function: campaign-strategy — TELAS 05/06 (estratégia recomendada + duração).
// modo 'recommend': mix % das 5 funções + justificativa + matriz de intensidade
//   por FASES (4 fases; o cliente mapeia pras semanas da duração escolhida) +
//   duração recomendada.
// modo 'adjust': recebe o mix atual + instrução em texto livre ("quero mais
//   autoridade", "falar menos de produtos") e reorganiza a proposta.
// O servidor SEMPRE normaliza o mix pra inteiros que somam 100 e tem fallback
// determinístico coerente com o momento — o wizard nunca trava por causa da IA.
import {
  checkRateLimit, errorResponse, getUserGeminiKey, internalUserId, jsonResponse, logUsage, preflight, userIdFromAuth,
} from '../_shared/security.ts';
import { callGeminiJson, fetchRest } from '../_shared/gemini.ts';

type Fn = 'presenca' | 'posicionamento' | 'autoridade' | 'relacionamento' | 'produtos';
type Level = 'muito_baixo' | 'baixo' | 'medio' | 'alto';
const FNS: Fn[] = ['presenca', 'posicionamento', 'autoridade', 'relacionamento', 'produtos'];
const LEVELS: Level[] = ['muito_baixo', 'baixo', 'medio', 'alto'];

interface Input {
  mode?: 'recommend' | 'adjust';
  type?: 'organica' | 'vendas';
  intent?: string;
  moment?: { label?: string; summary?: string };
  user_note?: string;
  current_mix?: Partial<Record<Fn, number>>;
  instruction?: string;
  product_id?: string;
}

const DEFAULT_MIX: Record<string, Record<Fn, number>> = {
  'Construção de base': { presenca: 30, posicionamento: 35, autoridade: 15, relacionamento: 15, produtos: 5 },
  'Expansão de presença': { presenca: 35, posicionamento: 30, autoridade: 20, relacionamento: 10, produtos: 5 },
  'Consolidação de autoridade': { presenca: 20, posicionamento: 25, autoridade: 35, relacionamento: 15, produtos: 5 },
  'Retomada': { presenca: 30, posicionamento: 30, autoridade: 20, relacionamento: 15, produtos: 5 },
  'Aquecimento para lançamento': { presenca: 15, posicionamento: 20, autoridade: 20, relacionamento: 20, produtos: 25 },
  'Lançamento': { presenca: 10, posicionamento: 15, autoridade: 20, relacionamento: 20, produtos: 35 },
};
const DEFAULT_PHASES: Array<Record<Fn, Level>> = [
  { presenca: 'alto', posicionamento: 'alto', autoridade: 'baixo', relacionamento: 'medio', produtos: 'muito_baixo' },
  { presenca: 'alto', posicionamento: 'alto', autoridade: 'medio', relacionamento: 'medio', produtos: 'baixo' },
  { presenca: 'medio', posicionamento: 'alto', autoridade: 'alto', relacionamento: 'medio', produtos: 'baixo' },
  { presenca: 'medio', posicionamento: 'medio', autoridade: 'alto', relacionamento: 'medio', produtos: 'medio' },
];

// Inteiros não negativos somando exatamente 100 (maior resto).
export function normalizeMix(raw: Partial<Record<Fn, unknown>>): Record<Fn, number> {
  const vals = FNS.map((f) => Math.max(0, Number(raw[f]) || 0));
  const total = vals.reduce((a, b) => a + b, 0);
  if (total <= 0) return { ...DEFAULT_MIX['Expansão de presença'] };
  const exact = vals.map((v) => (v / total) * 100);
  const floor = exact.map(Math.floor);
  let rest = 100 - floor.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => [e - Math.floor(e), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (rest <= 0) break; floor[i]++; rest--; }
  return Object.fromEntries(FNS.map((f, i) => [f, floor[i]])) as Record<Fn, number>;
}

function sanitizePhases(raw: unknown): Array<Record<Fn, Level>> {
  if (!Array.isArray(raw) || raw.length < 2) return DEFAULT_PHASES;
  const phases = raw.slice(0, 4).map((p, i) => Object.fromEntries(FNS.map((f) => {
    const v = (p as Record<string, unknown>)?.[f] ?? (p as { levels?: Record<string, unknown> })?.levels?.[f];
    return [f, LEVELS.includes(v as Level) ? v : DEFAULT_PHASES[i]?.[f] ?? 'medio'];
  })) as Record<Fn, Level>);
  while (phases.length < 4) phases.push(phases[phases.length - 1]);
  return phases;
}

const FN_DESC = [
  'presenca (Ampliar presença): chegar a novas pessoas e aumentar a descoberta.',
  'posicionamento (Fortalecer posicionamento): tornar mais claro pelo que a pessoa quer ser reconhecida.',
  'autoridade (Construir autoridade): demonstrar repertório, experiência e profundidade.',
  'relacionamento (Gerar relacionamento): estimular identificação, conversa e proximidade.',
  'produtos (Aproximar produtos): conectar naturalmente a presença ao que se oferece.',
].join('\n');

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);
  try {
    const userId = userIdFromAuth(req) ?? internalUserId(req);
    if (!userId) return errorResponse('Nao autenticado', 401);
    const rl = checkRateLimit(userId, 60_000, 20);
    if (!rl.ok) return errorResponse(`Rate limit. Tente em ${Math.ceil(rl.resetIn / 1000)}s`, 429);
    const input = (await req.json().catch(() => ({}))) as Input;
    const mode = input.mode === 'adjust' ? 'adjust' : 'recommend';
    if (mode === 'adjust' && !input.instruction?.trim()) return errorResponse('Diga o que quer ajustar.', 400);
    const apiKey = await getUserGeminiKey(userId);
    if (!apiKey) return errorResponse('Chave Gemini nao configurada', 400);

    const momentLabel = input.moment?.label ?? 'Expansão de presença';
    const fallbackMix = input.type === 'vendas'
      ? DEFAULT_MIX[momentLabel === 'Lançamento' ? 'Lançamento' : 'Aquecimento para lançamento']
      : (DEFAULT_MIX[momentLabel] ?? DEFAULT_MIX['Expansão de presença']);

    let product = '';
    if (input.product_id) {
      const rows = await fetchRest<Array<{ name: string; promessa: string | null }>>(`/bee_products?id=eq.${input.product_id}&select=name,promessa&limit=1`);
      if (rows[0]) product = `${rows[0].name}${rows[0].promessa ? ` — ${rows[0].promessa}` : ''}`;
    }

    const sys = [
      'Você é a Hive, estrategista de conteúdo da Bee Consulting. Define o EQUILÍBRIO estratégico de uma campanha de conteúdo entre 5 funções:',
      FN_DESC,
      'Regras: percentuais inteiros somando 100. Em campanha orgânica, "produtos" costuma ficar em 5–10% (presença antes de comércio), salvo pedido explícito. Em vendas/lançamento, "produtos" sobe (20–35%) sem abandonar relacionamento e autoridade.',
      'A "matriz" descreve como a intensidade de cada função evolui em 4 FASES da campanha (início → fim), com níveis: muito_baixo, baixo, medio, alto. Deve ser coerente com o mix e ter uma progressão natural (ex.: autoridade cresce, produtos aparece mais no fim).',
      'A justificativa fala com a pessoa ("Sua presença já possui..."), 2 a 3 frases, sóbria, sem jargão. Português do Brasil.',
    ].join('\n');

    const ctx = [
      `TIPO: ${input.type === 'vendas' ? 'Vendas / Lançamento' : 'Orgânica'}`,
      `MOMENTO: ${momentLabel}${input.moment?.summary ? ` — ${input.moment.summary}` : ''}`,
      input.user_note ? `OBSERVAÇÃO DA PESSOA SOBRE O MOMENTO: ${input.user_note}` : '',
      input.intent ? `O QUE A PESSOA PRETENDE: ${input.intent}` : '',
      product ? `PRODUTO DA CAMPANHA: ${product}` : '',
    ].filter(Boolean).join('\n');

    const usr = mode === 'recommend'
      ? [ctx, '', 'Recomende a estratégia. Devolva JSON puro:',
        '{ "mix": {"presenca":n,"posicionamento":n,"autoridade":n,"relacionamento":n,"produtos":n}, "rationale": "...", "phases": [ {"presenca":"alto",...}, {...}, {...}, {...} ], "recommended_weeks": 4|8|12, "duration_rationale": "<1 a 2 frases sobre por que essa duração>" }'].join('\n')
      : [ctx, '', `MIX ATUAL: ${JSON.stringify(input.current_mix ?? fallbackMix)}`,
        `A PESSOA PEDIU ESTE AJUSTE: "${input.instruction}"`,
        'Reorganize a proposta atendendo ao pedido e mantendo coerência com o momento. A justificativa deve mencionar o que mudou e por quê. Devolva o MESMO formato JSON:',
        '{ "mix": {...}, "rationale": "...", "phases": [4 fases], "recommended_weeks": 4|8|12, "duration_rationale": "..." }'].join('\n');

    let out: { mix?: Record<string, unknown>; rationale?: string; phases?: unknown; recommended_weeks?: number; duration_rationale?: string } = {};
    let modelUsed = 'fallback';
    try {
      const r = await callGeminiJson<typeof out>(apiKey, sys, usr, { temperature: 0.35, maxOutputTokens: 1800 });
      out = r.data; modelUsed = r.model_used;
      logUsage({ userId, provider: 'gemini', product: 'text', model: r.model_used, tokens_input: r.usage.input, tokens_output: r.usage.output, metadata: { fn: 'campaign-strategy', mode } });
    } catch (e) {
      console.warn('[campaign-strategy] IA falhou, usando fallback:', (e as Error).message);
    }

    const mix = normalizeMix(out.mix ?? (mode === 'adjust' ? input.current_mix ?? fallbackMix : fallbackMix));
    const weeks = [4, 8, 12].includes(Number(out.recommended_weeks)) ? Number(out.recommended_weeks) : 8;
    return jsonResponse({
      success: true,
      model_used: modelUsed,
      strategy: {
        mix,
        rationale: (out.rationale ?? '').trim() || 'Recomendo priorizar descoberta e posicionamento antes de aumentar a presença comercial, mantendo autoridade e relacionamento como sustentação.',
        phases: sanitizePhases(out.phases),
        recommended_weeks: weeks,
        duration_rationale: (out.duration_rationale ?? '').trim() || 'É um período suficiente para construir recorrência, experimentar abordagens e aprender com os resultados antes de recalibrar a estratégia.',
      },
    });
  } catch (e) {
    console.error('[campaign-strategy]', e);
    return errorResponse('Erro ao montar a estratégia', 500, String(e));
  }
});

export {};
