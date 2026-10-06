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
  await mockAcj(page);
  return calls;
}

// ACJ-00 (acj-orchestrator): plano determinístico, atribuição, portão e leitura de sinais.
export function acjPlanResponse(body: Record<string, unknown> = {}) {
  const adjust = !!body.instruction;
  const mix = adjust ? { 'ACJ-01': 20, 'ACJ-02': 20, 'ACJ-03': 35, 'ACJ-04': 15, 'ACJ-05': 10 } : { 'ACJ-01': 35, 'ACJ-02': 30, 'ACJ-03': 15, 'ACJ-04': 12, 'ACJ-05': 8 };
  const ph = (n: number, m: Record<string, number>, p: string[]) => ({ phase: n, label: `Fase E2E ${n}`, entry_state: 'e', priority_movement: `Movimento ${n}`, acj_primary: p, bridges: 'ponte', exit_state: 's', mix: m });
  return {
    success: true,
    plan: {
      audience_state: 'Líderes sentem o cansaço mas não nomeiam o padrão.', desired_state: 'Reconhecem e se localizam na leitura sistêmica.',
      journey_needs: ['tornar visível o padrão'], target_mix: mix,
      phases: [
        ph(1, { 'ACJ-01': 60, 'ACJ-02': 20, 'ACJ-03': 10, 'ACJ-04': 10, 'ACJ-05': 0 }, ['ACJ-01']),
        ph(2, { 'ACJ-01': 20, 'ACJ-02': 50, 'ACJ-03': 15, 'ACJ-04': 10, 'ACJ-05': 5 }, ['ACJ-02']),
        ph(3, { 'ACJ-01': 15, 'ACJ-02': 20, 'ACJ-03': 35, 'ACJ-04': 20, 'ACJ-05': 10 }, ['ACJ-03', 'ACJ-04']),
        ph(4, { 'ACJ-01': 20, 'ACJ-02': 25, 'ACJ-03': 15, 'ACJ-04': 15, 'ACJ-05': 25 }, ['ACJ-05']),
      ],
      sequence_hypotheses: [{ id: 'SEQ-01', hypothesis: 'Reconhecer antes de se localizar', condition: 'novos públicos', sequence: 'ACJ-01 → ACJ-02', confidence: 'medium', observe: 'linguagem dos comentários' }],
      success_signals: { audience: ['adoção da linguagem'], journey: ['retorno ao tema'], business: ['inscrições'] },
      recalibration_rules: ['reduzir ACJ-01 se saturar'], exclusions: ['sem CTA de venda na fase 1'],
      summary: { journey: adjust ? 'Jornada ajustada com mais Conexão.' : 'Jornada E2E: reconhecer, localizar-se, aproximar-se.', why: 'Serve à presença.', risk: 'Abstração.', learn: 'Maturidade da audiência.', mix_roles: { 'ACJ-01': 'Ponto de entrada' } },
      confidence: 'medium', human_decisions_required: ['Escolher histórias pessoais da fase 3'],
      adoption: body.adoption === 'late' ? 'late' : 'native',
      adoption_note: body.adoption === 'late' ? 'Adoção tardia: plano criado com a campanha em andamento.' : null,
      source_acj_version: 'ACJ-01@0.1,ACJ-02@0.1,ACJ-03@0.1,ACJ-04@0.1,ACJ-05@0.1',
    },
  };
}
export const ACJ_VALIDATION = { realized: 'partial', score: 64, issues: ['O espelho ainda é genérico.'], main_risk: 'Efeito Barnum', boundary_conflict: null, suggestion: 'Trazer uma cena concreta.', checked_at: '2026-10-06T12:00:00Z' };
export async function mockAcj(page: Page, calls: Array<Record<string, unknown>> = []) {
  await mockEdge(page, 'acj-orchestrator', (b) => {
    if (b.action === 'campaign_plan') return acjPlanResponse(b);
    if (b.action === 'validate') return { success: true, validation: ACJ_VALIDATION };
    if (b.action === 'read_signals') return { success: true, reading: { post_id: b.post_id, acj_primary: 'ACJ-02', comment_count: 2, movement_evidence: 'partial', probable_causes: ['content'], signals: [{ type: 'autolocalização', excerpt: 'isso acontece comigo', reads_as: 'ACJ-02' }], summary: 'Há autolocalização em parte dos comentários.', limitations: 'Amostra pequena.', model: 'mock' } };
    return { success: true, assignment: { acj_primary: 'ACJ-02', acj_secondary: null, acj_role: 'ponte', acj_rationale: 'r', acj_confidence: 'medium', human_decision_required: false } };
  }, calls);
  return calls;
}

// cycle-pauta "inteligente": lê o plano REAL do ciclo e devolve ideias que
// respeitam as necessidades e a cadência (como o servidor garante).
import { sql } from './admin';
let _pautaRound = 0;
export async function mockPauta(page: Page, calls: Array<Record<string, unknown>> = []) {
  await mockEdge(page, 'cycle-pauta', async (body) => {
    if (body.mode === 'swap') {
      return { success: true, ideas: [{ title: 'Ideia trocada pela Hive', summary: 'Nova direção.', strategic_function: 'presenca', editorial_slug: 'provocacao-de-crenca', channels: [], suggested_pieces: 0, rationale: 'troca' }] };
    }
    _pautaRound++;
    const [c] = await sql<{ plan: { needs: Array<{ function: string; count: number }>; channels: Array<{ account_id: string; platform: string; contents: number }> } }>(
      `select plan from campaign_cycles where id='${body.cycle_id}'`);
    const fns = c.plan.needs.flatMap((n) => Array(n.count).fill(n.function));
    const chans: Array<Array<{ account_id: string; platform: string }>> = fns.map(() => []);
    for (const ch of c.plan.channels) {
      const order = chans.map((a, i) => ({ i, load: a.length })).sort((a, b) => a.load - b.load || a.i - b.i);
      for (const o of order.slice(0, ch.contents)) chans[o.i].push({ account_id: ch.account_id, platform: ch.platform });
    }
    const [acjPlan] = await sql<{ counts: Record<string, number> }>(`select counts from acj_cycle_plans where cycle_id='${body.cycle_id}' and status='active' order by version desc limit 1`);
    const acjs = acjPlan ? Object.entries(acjPlan.counts).flatMap(([k, v]) => Array(v).fill(k)) : [];
    const prefix = body.mode === 'refresh' ? 'Nova seleção' : 'Ideia da Hive';
    return {
      success: true,
      ideas: fns.map((f, i) => ({
        title: `${prefix} ${i + 1} (r${_pautaRound})`, summary: `Direção de pensamento ${i + 1}.`, strategic_function: f,
        editorial_slug: 'provocacao-de-crenca', channels: chans[i], suggested_pieces: chans[i].length, rationale: 'porque sim',
        ...(acjs[i] ? { acj_primary: acjs[i], acj_secondary: null, acj_role: 'ponto de entrada', acj_rationale: 'realiza o movimento' } : {}),
      })),
    };
  }, calls);
}

// content-develop: frase + texto previsíveis por modo.
export async function mockDevelop(page: Page, calls: Array<Record<string, unknown>> = [], opts: { acj?: boolean } = {}) {
  await mockEdge(page, 'content-develop', async (body) => {
    const [idea] = await sql<{ title: string; acj_primary: string | null }>(`select title, acj_primary from ideas where id='${body.idea_id}'`);
    const acj = opts.acj ? {
      acj: {
        reused: !!body.content_id, campaign_plan_id: null, cycle_plan_id: null, validation: ACJ_VALIDATION,
        contract: {
          ...(body.content_id ? (await sql<{ id: string }>(`select id from acj_content_contracts where content_id='${body.content_id}' and status<>'superseded' limit 1`))[0] ?? {} : {}),
          acj_primary: idea?.acj_primary ?? 'ACJ-02', acj_secondary: null, attribution_confidence: 'medium', rationale: 'A ideia espelha uma cena do líder.',
          alternative_considered: null, alternative_reason: null, audience_state_from: 'realidade reconhecida mas externa', journey_need: 'localizar-se',
          movement_to: 'relevância pessoal percebida', connection_mechanism: 'espelhamento por cena concreta', authorial_gesture: 'espelha',
          expected_experience: 'reconhecer-se sem rótulo', expected_response: ['relatos em primeira pessoa'], failure_modes: ['efeito Barnum'],
          expression_context: { cta: 'onde isso aparece no seu time?' }, not_to_do: 'diagnosticar a pessoa', source_acj_version: 'ACJ-02@0.1', assigned_late: !idea?.acj_primary,
        },
      },
    } : {};
    const tag = body.mode === 'adjust' ? ' (ajustado)' : body.mode === 'new_version' ? ' (nova versão)' : '';
    return {
      success: true,
      frase: `Frase de ${idea?.title ?? 'ideia'}${tag}`,
      texto: `Primeiro parágrafo do texto${tag}.\n\nSegundo parágrafo que desdobra o pensamento.`,
      considered: { base: 'Diagnóstico Sistêmico · Genesis', coerencia: 'Fortalece autoridade sem aproximação comercial direta.', formato: 'LinkedIn · frase + texto' },
      meta: { headline_type: 'contradicao-direta', analogy: null, virality_score: 80, virality_reason: 'motivo', qa_score: 75 },
      ...acj,
    };
  }, calls);
}

// Produção visual: hive-decide (respeita a seed), generate-content (3 variações com
// variantes gráficas distintas), edit-text. Composição/render/upload são REAIS.
export async function mockProduction(page: Page, calls: { gen: Array<Record<string, unknown>>; decide: Array<Record<string, unknown>>; edit: Array<Record<string, unknown>> } = { gen: [], decide: [], edit: [] }) {
  await mockEdge(page, 'hive-decide', (b) => {
    const seed = b.seed as { variant?: string; highlight?: unknown } | undefined;
    const variant = seed?.variant ?? (b.platform === 'linkedin' ? 'M01-A' : 'M01-B');
    return { success: true, model_used: 'mock', decision: { mode: variant.split('-')[0], variant, highlight: seed?.highlight ?? null, subtitle: null, asset: null, diagram: null, explanation: { variant_reason: `Direção ${variant} (E2E)` } } };
  }, calls.decide);
  await mockEdge(page, 'generate-content', (b) => {
    const n = Number(b.variations ?? 1);
    const variants = ['M01-A', 'M01-B', 'M01-C'];
    const vars = Array.from({ length: n }, (_, i) => ({
      quote: `Frase do desdobramento ${i + 1}`, caption: `Legenda do desdobramento ${i + 1}.\n\nSegundo bloco.`,
      headline_type_used: 'contradicao-direta', virality_score: 70 + i,
      hive_seed: { variant: variants[i % 3], manifestation: 'M01', highlight: null, subtitle: null, poles: null, image_scene_hint: '', human_presence_adds_meaning: false, mode_reason: '', variant_reason: `Opção ${variants[i % 3]}` },
    }));
    return { success: true, variations: vars, ...vars[0] };
  }, calls.gen);
  await mockEdge(page, 'edit-text', (b) => ({ success: true, text: b.field === 'legenda' ? 'Legenda ajustada pela Hive' : 'Frase ajustada pela Hive' }), calls.edit);
  return calls;
}
