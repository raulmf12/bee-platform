// Edge function: hive-decide — o MOTOR DE DECISAO VISUAL da Hive (Etapa 3).
//
// Recebe um TEXTO JA APROVADO (EDITORIAL_LOCKED — nunca reescreve) e decide como
// ele deve ganhar forma visual no M01 — Frase Essencial:
//   1. pontua dimensoes semanticas do texto;
//   2. pontua cada variacao M01 (A-E) segundo as REGRAS DA BASE;
//   3. escolhe a palavra de destaque (laranja = verbo/virada), se couber;
//   4. aplica a diversidade como DESEMPATE (significado decide);
//   5. devolve o objeto de decisao com `reason` (explicabilidade).
//
// NADA hard-coded: todo criterio (quando usar/nunca, selection_rule, limites,
// pesos, penalidade de diversidade) vem das tabelas design_*. O modelo LE essas
// regras e pontua; o desempate final e deterministico no codigo.
//
// Entrada: { text, platform?, editorial_slug?, target_avatar?, post_id?, history_variants? }
// Saida:   { success, decision, model_used }

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
  'gemini-3.1-pro-preview',
  'gemini-2.5-pro',
];
const MAX_RETRIES = 2;

interface DecideInput {
  text: string;
  platform?: 'linkedin' | 'instagram';
  editorial_slug?: string;
  target_avatar?: string;
  post_id?: string;
  history_variants?: string[];   // variantes recentes (p/ diversidade); se ausente, busca no banco
}

interface Variacao {
  id: string; nome: string; operacao: string;
  quando_usar: unknown; quando_nao: unknown;
  selection_rule: Record<string, unknown>; limites: Record<string, unknown>;
  ordem: number;
}
interface Manifestacao {
  id: string; nome: string; operacao: string;
  quando_usar: unknown; quando_nao: unknown; score_criteria: Record<string, unknown>;
}
interface SelConfig {
  weights: Record<string, number>; thresholds: Record<string, number>;
  diversity: { window?: number; penalty_per_recent_use?: number; tolerance?: number };
}

function svcHeaders(): HeadersInit {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
}
async function fetchRest<T>(path: string): Promise<T> {
  const url = `${Deno.env.get('SUPABASE_URL')}/rest/v1${path}`;
  const res = await fetch(url, { headers: svcHeaders() });
  if (!res.ok) { console.warn('[hive-decide fetchRest]', path, res.status); return [] as unknown as T; }
  return await res.json();
}
async function patchRest(path: string, body: object): Promise<void> {
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1${path}`, {
      method: 'PATCH', headers: { ...svcHeaders(), Prefer: 'return=minimal' }, body: JSON.stringify(body),
    });
  } catch (e) { console.warn('[hive-decide patch]', e); }
}

async function callGemini(apiKey: string, sys: string, usr: string) {
  let lastErr = '';
  for (const model of MODEL_CHAIN) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: sys }] },
              contents: [{ role: 'user', parts: [{ text: usr }] }],
              generationConfig: { temperature: 0.4, maxOutputTokens: 3000, responseMimeType: 'application/json' },
            }),
          },
        );
        if (!res.ok) {
          lastErr = `[${model}] HTTP ${res.status}`;
          if (res.status === 503 || res.status === 429) { await new Promise((r) => setTimeout(r, (attempt + 1) * 1500)); continue; }
          break;
        }
        const json = await res.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        if (!text || text.trim().length < 2) { lastErr = `[${model}] vazio`; continue; }
        return { text, usage: { input: json.usageMetadata?.promptTokenCount, output: json.usageMetadata?.candidatesTokenCount }, model_used: model };
      } catch (e) {
        lastErr = `[${model}] ${(e as Error).message}`;
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }
  throw new Error(`Gemini falhou. Ultimo: ${lastErr}`);
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

    const input = (await req.json()) as DecideInput;
    const text = input.text?.trim();
    if (!text) return errorResponse('text obrigatorio', 400);

    const apiKey = await getUserGeminiKey(userId);
    if (!apiKey) return errorResponse('Chave Gemini nao configurada', 400);

    // --- Carrega as REGRAS DA BASE (por ora so o M01 tem variacoes frozen) ---
    const [manis, vars, cfgs] = await Promise.all([
      fetchRest<Manifestacao[]>(`/design_manifestacoes?id=eq.M01&ativo=eq.true&select=id,nome,operacao,quando_usar,quando_nao,score_criteria`),
      fetchRest<Variacao[]>(`/design_variacoes?manifestacao_id=eq.M01&status=eq.frozen&ativo=eq.true&select=id,nome,operacao,quando_usar,quando_nao,selection_rule,limites,ordem&order=ordem.asc`),
      fetchRest<SelConfig[]>(`/design_selection_config?ativo=eq.true&select=weights,thresholds,diversity&limit=1`),
    ]);
    const mani = manis[0];
    if (!mani || vars.length === 0) return errorResponse('M01 sem variacoes congeladas na base', 409);
    const cfg = cfgs[0] ?? { weights: {}, thresholds: {}, diversity: {} };
    const diversity = { window: 3, penalty_per_recent_use: 0.05, tolerance: 0.05, ...(cfg.diversity ?? {}) };

    // --- Historico recente de variantes (diversidade) ---
    let history = input.history_variants ?? [];
    if (!input.history_variants) {
      const recent = await fetchRest<Array<{ visual_decision: { variant?: string } | null }>>(
        `/user_posts?user_id=eq.${userId}&visual_decision=not.is.null&select=visual_decision&order=created_at.desc&limit=${Math.max(1, diversity.window)}`,
      );
      history = recent.map((r) => r.visual_decision?.variant ?? '').filter(Boolean);
    }
    const recentCount: Record<string, number> = {};
    for (const v of history) recentCount[v] = (recentCount[v] ?? 0) + 1;

    const dims = Object.keys(cfg.weights ?? {});

    // --- Prompt: o modelo LE as regras da base e pontua (nao inventa criterio) ---
    const sys = [
      'Voce e o MOTOR DE DECISAO VISUAL da Hive (Marcos Piccini / Bee), para o modo M01 — Frase Essencial no Instagram.',
      'Voce recebe um TEXTO JA APROVADO. REGRA ABSOLUTA: NUNCA reescreva, resuma, corrija ou altere o texto — voce so decide a FORMA visual.',
      'M01 e a expressao visual MINIMA de uma ideia que ja tem forca propria. Comece pela hipotese M01-A (Essencial) e so escolha outra variacao quando houver razao semantica clara.',
      'Baseie-se SOMENTE nas regras fornecidas abaixo (vindas da base de dados). Nao invente criterios.',
      'O LARANJA e verbo, nao maquiagem: o destaque marca o PONTO DE VIRADA semantico da frase (1 a 5 palavras), e deve ser um trecho REAL do texto. Em variacoes cujo limite diz destaque_permitido=false, NAO ha destaque.',
      'Devolva SEMPRE JSON puro (sem markdown).',
    ].join('\n');

    const usr = [
      `TEXTO APROVADO (nao altere):\n"""${text}"""`,
      '',
      `DIMENSOES SEMANTICAS a pontuar de 0.0 a 1.0: ${dims.join(', ')}`,
      '',
      `MANIFESTACAO M01 — ${mani.nome}:`,
      `quando_usar: ${JSON.stringify(mani.quando_usar)}`,
      `quando_NAO: ${JSON.stringify(mani.quando_nao)}`,
      `criterios_de_score: ${JSON.stringify(mani.score_criteria)}`,
      '',
      'VARIACOES (pontue CADA uma de 0.0 a 1.0 conforme o quanto o texto pede aquela variacao):',
      ...vars.map((v) =>
        `- ${v.id} (${v.nome} · ${v.operacao}) | usar: ${JSON.stringify(v.quando_usar)} | evitar: ${JSON.stringify(v.quando_nao)} | regra: ${JSON.stringify(v.selection_rule)} | destaque_permitido: ${(v.limites?.destaque_permitido ?? false)}`,
      ),
      '',
      'Responda em JSON:',
      '{',
      '  "semantics": { <cada dimensao acima>: 0.0-1.0 },',
      '  "variants": { "M01-A": {"score":0.0-1.0,"reason":"<curto>"}, "M01-B": {...}, "M01-C": {...}, "M01-D": {...}, "M01-E": {...} },',
      '  "highlight": { "target": "<1-5 palavras reais do texto>", "reason": "<por que este e o ponto de virada>" } ,',
      '  "mode_reason": "<por que M01 e adequado (autonomia verbal)>",',
      '  "asset_reason": "<estrategia de materia visual: grafico / foto / textura e por que>"',
      '}',
      'Se nenhum destaque fizer sentido (ou a variacao vencedora nao permitir), use "highlight": null.',
    ].join('\n');

    const { text: raw, usage, model_used } = await callGemini(apiKey, sys, usr);
    let parsed: {
      semantics?: Record<string, number>;
      variants?: Record<string, { score?: number; reason?: string }>;
      highlight?: { target?: string; reason?: string } | null;
      mode_reason?: string; asset_reason?: string;
    };
    try {
      parsed = JSON.parse(raw.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim());
    } catch {
      return errorResponse('Motor retornou JSON invalido. Tente de novo.', 502);
    }

    // --- Desempate por DIVERSIDADE (significado decide, diversidade desempata) ---
    const scoreOf = (id: string) => Math.max(0, Math.min(1, Number(parsed.variants?.[id]?.score ?? 0)));
    const semanticMax = Math.max(...vars.map((v) => scoreOf(v.id)));
    const eligible = vars.filter((v) => scoreOf(v.id) >= semanticMax - (diversity.tolerance ?? 0.05));
    const variantScores: Record<string, { semantic: number; adjusted: number; reason: string }> = {};
    for (const v of vars) {
      const semantic = scoreOf(v.id);
      const adjusted = semantic - (diversity.penalty_per_recent_use ?? 0.05) * (recentCount[v.id] ?? 0);
      variantScores[v.id] = { semantic, adjusted, reason: String(parsed.variants?.[v.id]?.reason ?? '') };
    }
    // Vencedor: entre os elegiveis (dentro da tolerancia), o maior ajustado.
    const winner = eligible
      .map((v) => v.id)
      .sort((a, b) => variantScores[b].adjusted - variantScores[a].adjusted)[0] ?? vars[0].id;
    const winnerVar = vars.find((v) => v.id === winner)!;
    const lim = winnerVar.limites ?? {};

    // --- Destaque: respeita destaque_permitido da variacao vencedora ---
    const highlightAllowed = Boolean(lim.destaque_permitido);
    const highlight = highlightAllowed && parsed.highlight?.target
      ? { target: String(parsed.highlight.target), reason: String(parsed.highlight.reason ?? '') }
      : null;

    // --- Estrategia de asset + marca (das regras da variacao) ---
    const imageRequired = Boolean(lim.image_required);
    const assetType = winner === 'M01-D' ? 'photo' : winner === 'M01-E' ? 'texture' : 'graphic';

    // --- Checagem de texto (spec sec.33): estourou o limite? -> revisao editorial ---
    const charsLimit = Number(lim.chars_limit ?? 150);
    const needsReview = text.length > charsLimit;

    const decision = {
      content_id: input.post_id ?? null,
      editorial_locked: true,
      platform: input.platform ?? 'instagram',
      mode: 'M01',
      mode_confidence: Number((semanticMax).toFixed(2)),
      variant: winner,
      variant_confidence: Number(variantScores[winner].semantic.toFixed(2)),
      semantics: parsed.semantics ?? {},
      variant_scores: variantScores,
      diversity: { window: diversity.window, history, applied: eligible.length > 1 },
      highlight,
      asset_strategy: { type: assetType, photo_required: imageRequired },
      brand: {
        font: 'arbutus_slab',                  // slug do token (hoje Playfair)
        palette: 'bee_official',
        spiral_asset: 'espiral_oficial',
        spiral_usage: String(lim.spiral_default ?? 'optional'),
        signature: Boolean(lim.signature_default),
        bee_logo: false,
      },
      explanation: {
        mode_reason: String(parsed.mode_reason ?? ''),
        variant_reason: variantScores[winner].reason,
        highlight_reason: highlight?.reason ?? null,
        asset_reason: String(parsed.asset_reason ?? ''),
      },
      text_check: { chars: text.length, limit: charsLimit, needs_editorial_review: needsReview },
    };

    // --- Persiste no post, se veio post_id (image entra em 'pending' p/ aprovacao) ---
    if (input.post_id) {
      await patchRest(`/user_posts?id=eq.${input.post_id}&user_id=eq.${userId}`, {
        visual_decision: decision,
        image_status: 'pending',
      });
    }

    logUsage({
      userId, provider: 'gemini', product: 'text', model: model_used,
      tokens_input: usage?.input, tokens_output: usage?.output,
      metadata: { fn: 'hive-decide', mode: 'M01', variant: winner, needs_review: needsReview },
    });

    return jsonResponse({ success: true, decision, model_used });
  } catch (e) {
    console.error('[hive-decide]', e);
    return errorResponse('Erro no motor de decisao da Hive', 500, String(e));
  }
});

export {};
