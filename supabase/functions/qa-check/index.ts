// Edge function: qa-check — AUTOCHECAGEM (QA) de uma variação gerada.
// Recebe { quote, caption, target_platform?, editorial_slug? }.
// Carrega os CRITÉRIOS de excelência (bee_directives tipo='criterio') e as
// proibições (tipo='evitar') do escopo (universal + plataforma + editoria),
// pede ao modelo para avaliar o conteúdo item a item e devolve:
//   { success, score, resumo, checks: [{ titulo, criterio, passed, nota }] }
//
// NÃO regenera nem bloqueia — é "nota + sinaliza, você decide". A decisão
// (aprovar/corrigir/rejeitar) continua 100% humana no wizard.

import {
  errorResponse,
  getUserGeminiKey,
  jsonResponse,
  logUsage,
  preflight,
  userIdFromAuth,
  internalUserId,
  checkRateLimit,
} from '../_shared/security.ts';

const MODEL_CHAIN = [
  Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-pro',
];
const MAX_RETRIES = 2;

interface QaInput {
  quote: string;
  caption: string;
  target_platform?: 'linkedin' | 'instagram';
  editorial_slug?: string;
}

interface BeeDirective {
  scope: string; scope_ref: string | null; tipo: string;
  titulo: string | null; instrucao: string;
}

// Item avaliável: um critério OU uma proibição, com rótulo pro modelo mapear.
interface CheckItem { idx: number; titulo: string; criterio: string; kind: 'criterio' | 'evitar' }

function svcHeaders(): HeadersInit {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
}

async function fetchRest<T>(path: string): Promise<T> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const res = await fetch(`${supabaseUrl}/rest/v1${path}`, { headers: svcHeaders() });
  if (!res.ok) { console.warn('[qa fetchRest fail]', path, res.status); return [] as unknown as T; }
  return await res.json();
}

async function callGeminiOnce(apiKey: string, sys: string, usr: string, model: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  return await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: 'user', parts: [{ text: usr }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2000, responseMimeType: 'application/json' },
    }),
  });
}

async function callGemini(apiKey: string, sys: string, usr: string) {
  let lastErr = '';
  for (const model of MODEL_CHAIN) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await callGeminiOnce(apiKey, sys, usr, model);
        if (!res.ok) {
          lastErr = `[${model}] HTTP ${res.status}`;
          if (res.status === 503 || res.status === 429) { await new Promise((r) => setTimeout(r, (attempt + 1) * 1500)); continue; }
          break;
        }
        const json = await res.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        if (!text || text.trim().length < 5) { lastErr = `[${model}] vazio`; continue; }
        return {
          text,
          usage: { input: json.usageMetadata?.promptTokenCount, output: json.usageMetadata?.candidatesTokenCount },
          model_used: model,
        };
      } catch (e) {
        lastErr = `[${model}] ${(e as Error).message}`;
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }
  throw new Error(`Gemini falhou. Último: ${lastErr}`);
}

function clampScore(n: unknown): number {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, x));
}

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);

  try {
    const userId = userIdFromAuth(req) ?? internalUserId(req);
    if (!userId) return errorResponse('Nao autenticado', 401);

    const rl = checkRateLimit(userId, 60_000, 30);
    if (!rl.ok) return errorResponse(`Rate limit. Tente em ${Math.ceil(rl.resetIn / 1000)}s`, 429);

    const input = (await req.json()) as QaInput;
    if (!input.quote && !input.caption) return errorResponse('quote ou caption obrigatorio', 400);

    const apiKey = await getUserGeminiKey(userId);
    if (!apiKey) return errorResponse('Chave Gemini nao configurada', 400);

    const platform = input.target_platform ?? 'linkedin';
    // Critérios + proibições do escopo desta variação.
    const dirs = await fetchRest<BeeDirective[]>(
      `/bee_directives?ativo=eq.true&tipo=in.(criterio,evitar)&select=scope,scope_ref,tipo,titulo,instrucao` +
      `&or=(scope.eq.universal,and(scope.eq.platform,scope_ref.eq.${platform}),and(scope.eq.editorial,scope_ref.eq.${input.editorial_slug ?? ''}))` +
      `&order=scope.asc,ordem.asc`,
    );

    const scopeLabel = (d: BeeDirective) =>
      d.scope === 'universal' ? 'universal' : d.scope === 'platform' ? platform : (d.scope_ref ?? 'editoria');

    const items: CheckItem[] = dirs.map((d, i) => ({
      idx: i,
      titulo: `${d.titulo ?? (d.tipo === 'evitar' ? 'Não fazer' : 'Critério')} · ${scopeLabel(d)}`,
      criterio: d.tipo === 'evitar' ? `NÃO PODE: ${d.instrucao}` : d.instrucao,
      kind: d.tipo === 'evitar' ? 'evitar' : 'criterio',
    }));

    // Sem critérios cadastrados: não há o que checar. Devolve neutro.
    if (!items.length) {
      return jsonResponse({
        success: true, score: null, resumo: 'Nenhum critério cadastrado para este escopo.', checks: [],
      });
    }

    const sys = [
      'Você é um auditor editorial rigoroso e honesto da Bee. Avalia se um conteúdo cumpre cada item de uma lista de critérios de excelência e proibições.',
      'Seja específico e severo: se um item falha parcialmente, marque passed=false. Aponte o trecho problemático na nota.',
      'Itens que começam com "NÃO PODE:" são proibições — passed=true significa que o conteúdo NÃO cometeu a violação.',
      'A nota deve ser curta (máx 140 chars), concreta e acionável — nunca genérica.',
    ].join('\n');

    const listBlock = items.map((it) => `#${it.idx} [${it.titulo}] ${it.criterio}`).join('\n');
    const usr = [
      `PLATAFORMA: ${platform}${input.editorial_slug ? ` · EDITORIA: ${input.editorial_slug}` : ''}`,
      '',
      'CONTEÚDO A AVALIAR',
      `Título (frase da imagem): "${input.quote ?? '(vazio)'}"`,
      `Legenda:\n${input.caption ?? '(vazio)'}`,
      '',
      'ITENS A CHECAR (avalie CADA um pelo seu #idx):',
      listBlock,
      '',
      'Devolva JSON puro (sem markdown):',
      '{ "checks": [ { "idx": <número>, "passed": <bool>, "nota": "<curta>" } ], "score": <0-100>, "resumo": "<1 frase>" }',
      'Inclua TODOS os idx. O score reflete a qualidade geral ponderando os itens (proibições violadas pesam mais).',
    ].join('\n');

    const { text, usage, model_used } = await callGemini(apiKey, sys, usr);

    let parsed: { checks?: Array<{ idx: number; passed: boolean; nota: string }>; score?: number; resumo?: string };
    try {
      parsed = JSON.parse(text.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim());
    } catch {
      return errorResponse('Resposta da IA em formato inválido', 502);
    }

    const verdictByIdx = new Map<number, { passed: boolean; nota: string }>();
    (parsed.checks ?? []).forEach((c) => verdictByIdx.set(Number(c.idx), { passed: !!c.passed, nota: String(c.nota ?? '') }));

    // Reancorar cada verdict no título/critério REAL do banco (o modelo só devolve idx).
    const checks = items.map((it) => {
      const v = verdictByIdx.get(it.idx);
      return {
        titulo: it.titulo,
        criterio: it.criterio,
        passed: v?.passed ?? false,
        nota: v?.nota ?? 'Não avaliado.',
      };
    });

    // Score: usa o do modelo se veio; senão, deriva do % de itens que passaram.
    const passedCount = checks.filter((c) => c.passed).length;
    const score = parsed.score != null
      ? clampScore(parsed.score)
      : Math.round((passedCount / checks.length) * 100);

    logUsage({
      userId, provider: 'gemini', product: 'text', model: model_used,
      tokens_input: usage?.input, tokens_output: usage?.output,
      metadata: { fn: 'qa-check', platform, editorial: input.editorial_slug, items: items.length },
    });

    return jsonResponse({
      success: true,
      score,
      resumo: String(parsed.resumo ?? `${passedCount}/${checks.length} critérios cumpridos.`),
      checks,
    });
  } catch (e) {
    console.error('[qa-check]', e);
    return errorResponse('Erro ao checar qualidade', 500, String(e));
  }
});

export {};
