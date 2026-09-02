// Edge function: hive-decide — o MOTOR DE DECISAO VISUAL da Hive (Etapa 3).
//
// Recebe um TEXTO JA APROVADO (EDITORIAL_LOCKED — nunca reescreve) e decide como
// ele deve ganhar forma visual. Hoje decide entre DUAS manifestacoes congeladas:
//   M01 — Frase Essencial (a ideia tem forca propria; sem presenca humana)
//   M02 — Rosto + Pensamento (a presenca humana faz parte do significado)
// Passos:
//   1. pontua dimensoes semanticas do texto;
//   2. pontua CADA variacao (M01 A-E e M02 A-D) segundo as REGRAS DA BASE;
//   3. escolhe a palavra de destaque (laranja = virada), se couber;
//   4. p/ M02: escolhe a IMAGEM na HIERARQUIA — foto REAL do Marcos primeiro;
//      so quando nao houver real adequada E a variacao permitir, marca geracao.
//      Onde Marcos precisa estar reconhecivel (A/B) e nao ha foto real, a
//      variacao fica INELEGIVEL (nao se fabrica o rosto) e cai p/ C/D ou M01;
//   5. aplica diversidade (variante + foto-fonte) como DESEMPATE;
//   6. devolve o objeto de decisao com `reason` (explicabilidade).
//
// NADA hard-coded: quando usar/nunca, selection_rule, limites, pesos, diversidade,
// must_have/prefer/avoid e o template de geracao vem das tabelas design_*.
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
  history_variants?: string[];
}

interface Variacao {
  id: string; manifestacao_id: string; nome: string; operacao: string;
  quando_usar: unknown; quando_nao: unknown;
  selection_rule: Record<string, unknown>; limites: Record<string, unknown>;
  asset_requirements: Record<string, unknown>; ordem: number;
}
interface Manifestacao {
  id: string; nome: string; operacao: string; auto_select?: boolean;
  quando_usar: unknown; quando_nao: unknown; score_criteria: Record<string, unknown>;
}
interface SelConfig {
  weights: Record<string, number>; thresholds: Record<string, number>;
  diversity: { window?: number; penalty_per_recent_use?: number; tolerance?: number; source_penalty_per_use?: number };
}
interface Asset {
  id: string; kind: string; url: string; width: number | null; height: number | null;
  origin: string; semantic: Record<string, unknown>; source_image_id: string | null;
  person_slug: string | null; usage_count: number | null;
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
              generationConfig: { temperature: 0.4, maxOutputTokens: 3500, responseMimeType: 'application/json' },
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

// Um asset satisfaz must_have quando cada chave bate (valor pode ser "a|b").
function assetMatches(asset: Asset, must: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(must ?? {})) {
    const have = String((asset.semantic ?? {})[k] ?? '').toLowerCase();
    const opts = String(v).toLowerCase().split('|').map((s) => s.trim());
    if (!opts.includes(have)) return false;
  }
  return true;
}

// Monta a decisao TRAVADA do LinkedIn: M01-A (base), sem destaque, sem imagem.
// Le as limites reais do M01-A pra manter o text_check honesto com a base, mas
// nao chama o modelo — a forma e fixa. Persiste no post se veio post_id.
async function lockedLinkedinDecision(input: DecideInput, text: string, userId: string) {
  const rows = await fetchRest<Array<{ limites?: Record<string, unknown> }>>(
    `/design_variacoes?id=eq.M01-A&select=limites&limit=1`,
  );
  const lim = rows[0]?.limites ?? {};
  const charsLimit = Number(lim.chars_limit ?? 150);
  const needsReview = text.length > charsLimit;

  const decision = {
    content_id: input.post_id ?? null,
    editorial_locked: true,
    platform: 'linkedin',
    mode: 'M01',
    mode_confidence: 1,
    variant: 'M01-A',
    variant_confidence: 1,
    locked: true,
    lock_reason: 'LinkedIn usa sempre o M01 base (M01-A) — regra de plataforma.',
    semantics: {},
    manifestations: { M01: 1 },
    human_presence_adds_meaning: false,
    variant_scores: { 'M01-A': { semantic: 1, adjusted: 1, reason: 'trava de plataforma (LinkedIn)' } },
    diversity: { window: 0, history: [], applied: false },
    highlight: null,
    subtitle: null,
    diagram: null,
    asset_strategy: { type: 'graphic', photo_required: false },
    asset: null,
    image_generation: null,
    brand: {
      font: 'arbutus_slab',
      palette: 'bee_official',
      spiral_asset: 'espiral_oficial',
      spiral_usage: String(lim.spiral_default ?? 'optional'),
      signature: Boolean(lim.signature_default),
      bee_logo: false,
    },
    explanation: {
      mode_reason: 'LinkedIn: forma fixa no M01 base (M01-A).',
      variant_reason: 'Trava de plataforma — nao passa pelo motor.',
      highlight_reason: null,
      asset_reason: 'grafico (sem imagem)',
      image_source: 'grafico/textura',
    },
    text_check: { chars: text.length, limit: charsLimit, needs_editorial_review: needsReview },
  };

  if (input.post_id) {
    await patchRest(`/user_posts?id=eq.${input.post_id}&user_id=eq.${userId}`, {
      visual_decision: decision,
      image_status: 'pending',
    });
  }
  return decision;
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

    // --- TRAVA LINKEDIN: todo post do LinkedIn usa o M01 BASE (M01-A) exato. ---
    // Regra de negocio (nao editorial): no LinkedIn a forma e FIXA — sem motor,
    // sem variacao, sem destaque. So o Instagram varia. Curto-circuita ANTES do
    // Gemini (deterministico e sem custo). Se um dia quiser voltar a variar,
    // basta remover este bloco.
    if (input.platform === 'linkedin') {
      const locked = await lockedLinkedinDecision(input, text, userId);
      return jsonResponse({ success: true, decision: locked, model_used: 'locked:M01-A' });
    }

    const apiKey = await getUserGeminiKey(userId);
    if (!apiKey) return errorResponse('Chave Gemini nao configurada', 400);

    // --- Carrega as REGRAS DA BASE: manifestacoes + variacoes congeladas ---
    // eslint-disable-next-line prefer-const
    let [manis, vars, cfgs, photoAssets] = await Promise.all([
      fetchRest<Manifestacao[]>(`/design_manifestacoes?ativo=eq.true&select=id,nome,operacao,auto_select,quando_usar,quando_nao,score_criteria&order=ordem.asc`),
      fetchRest<Variacao[]>(`/design_variacoes?status=eq.frozen&ativo=eq.true&select=id,manifestacao_id,nome,operacao,quando_usar,quando_nao,selection_rule,limites,asset_requirements,ordem&order=manifestacao_id.asc,ordem.asc`),
      fetchRest<SelConfig[]>(`/design_selection_config?ativo=eq.true&select=weights,thresholds,diversity&limit=1`),
      fetchRest<Asset[]>(`/design_assets?is_active=eq.true&kind=eq.photo&select=id,kind,url,width,height,origin,semantic,source_image_id,person_slug,usage_count`),
    ]);
    if (vars.length === 0) return errorResponse('Nenhuma variacao congelada na base', 409);
    // So manifestacoes de AUTO-SELECAO entram no motor (M04 depende de dados de
    // evento do usuario -> e acionado pela tela /hive/convite, nunca aqui).
    const autoManis = new Set(manis.filter((m) => m.auto_select !== false).map((m) => m.id));
    vars = vars.filter((v) => autoManis.has(v.manifestacao_id));
    if (vars.length === 0) return errorResponse('Nenhuma variacao auto-selecionavel', 409);
    const maniById: Record<string, Manifestacao> = {};
    for (const m of manis) maniById[m.id] = m;
    // Só manifestacoes que tem variacao congelada.
    const activeManiIds = Array.from(new Set(vars.map((v) => v.manifestacao_id)));

    const cfg = cfgs[0] ?? { weights: {}, thresholds: {}, diversity: {} };
    const diversity = { window: 8, penalty_per_recent_use: 0.12, tolerance: 0.08, source_penalty_per_use: 0.12, ...(cfg.diversity ?? {}) };
    const dims = Object.keys(cfg.weights ?? {});

    // --- Historico recente (diversidade de variante E de foto-fonte) ---
    let history = input.history_variants ?? [];
    let recentSources: string[] = [];
    if (!input.history_variants) {
      const recent = await fetchRest<Array<{ visual_decision: { variant?: string; asset?: { source_image_id?: string | null } } | null }>>(
        `/user_posts?user_id=eq.${userId}&visual_decision=not.is.null&select=visual_decision&order=created_at.desc&limit=${Math.max(1, diversity.window)}`,
      );
      history = recent.map((r) => r.visual_decision?.variant ?? '').filter(Boolean);
      recentSources = recent.map((r) => r.visual_decision?.asset?.source_image_id ?? '').filter(Boolean);
    }
    const recentCount: Record<string, number> = {};
    for (const v of history) recentCount[v] = (recentCount[v] ?? 0) + 1;
    const recentSourceCount: Record<string, number> = {};
    for (const s of recentSources) recentSourceCount[s] = (recentSourceCount[s] ?? 0) + 1;

    // --- Plano de asset por variacao M02 (hierarquia REAL -> gerada) ---
    // Para cada variacao que exige imagem, acha a melhor foto REAL que casa com
    // must_have, priorizando origem (real > real_adapted) e diversidade de fonte.
    const rankReal = (list: Asset[]): Asset[] =>
      [...list].sort((a, b) => {
        const or = (o: string) => (o === 'real' ? 0 : o === 'real_adapted' ? 1 : 2);
        if (or(a.origin) !== or(b.origin)) return or(a.origin) - or(b.origin);
        const sa = recentSourceCount[a.source_image_id ?? a.id] ?? 0;
        const sb = recentSourceCount[b.source_image_id ?? b.id] ?? 0;
        if (sa !== sb) return sa - sb;
        return (a.usage_count ?? 0) - (b.usage_count ?? 0);
      });

    interface Plan { asset?: Asset; canGenerate: boolean; genPrompt?: string; genForbid?: string[]; mustHave: Record<string, unknown> }
    const assetPlan: Record<string, Plan> = {};
    for (const v of vars) {
      const isM02 = v.manifestacao_id === 'M02';
      const req = (v.asset_requirements?.photo ?? {}) as Record<string, unknown>;
      const imageRequired = Boolean((v.limites ?? {}).image_required);
      if (!isM02 || !imageRequired) continue; // M01 mantem o fluxo atual (client escolhe)
      const must = (req.must_have ?? {}) as Record<string, unknown>;
      // HIERARQUIA: foto real primeiro; se a variacao permite gerar, uma gerada
      // ja existente entra como 2o nivel (reuso) ANTES de gerar uma nova.
      const allowGen = Boolean(req.allow_generated);
      const origins = allowGen ? ['real', 'real_adapted', 'generated'] : ['real', 'real_adapted'];
      const cands = photoAssets.filter((a) => origins.includes(a.origin) && assetMatches(a, must));
      const best = rankReal(cands)[0];
      const gen = (req.generation ?? {}) as Record<string, unknown>;
      assetPlan[v.id] = {
        asset: best,
        canGenerate: allowGen,
        genPrompt: typeof gen.base_prompt === 'string' ? gen.base_prompt : undefined,
        genForbid: Array.isArray(gen.forbid) ? (gen.forbid as string[]) : undefined,
        mustHave: must,
      };
    }

    // Elegibilidade: variacao M02 que exige imagem, nao tem foto real e nao pode
    // gerar honestamente -> INELEGIVEL (nao se fabrica o rosto). Cai p/ C/D ou M01.
    const eligibleVars = vars.filter((v) => {
      const plan = assetPlan[v.id];
      if (!plan) return true;                 // M01 ou sem exigencia
      return Boolean(plan.asset) || plan.canGenerate;
    });
    if (eligibleVars.length === 0) return errorResponse('Nenhuma variacao elegivel', 409);

    // Quantas fotos REAIS do Marcos existem (informa o modelo p/ A/B honestas).
    const realMarcosCount = photoAssets.filter((a) => ['real', 'real_adapted'].includes(a.origin) && String((a.semantic ?? {}).marcos_presente ?? '').toLowerCase() === 'sim').length;

    // --- Prompt: o modelo LE as regras e pontua (nao inventa criterio) ---
    const sys = [
      'Voce e o MOTOR DE DECISAO VISUAL da Hive (Marcos Piccini / Bee).',
      'Recebe um TEXTO JA APROVADO. REGRA ABSOLUTA: NUNCA reescreva, resuma, corrija ou altere o texto — voce so decide a FORMA visual.',
      'Escolha entre as manifestacoes disponiveis e, dentro dela, a variacao. Comece pela hipotese M01 (a ideia se sustenta sozinha) e so va para M02 (Rosto + Pensamento) quando a PRESENCA HUMANA acrescentar significado que o texto sozinho nao tem — nunca so para variar o feed ou porque existe foto.',
      'REGRA-MAE da M02: a foto NAO ilustra o texto; foto e pensamento formam UMA mensagem. Teste: se retirarmos a foto, alguma dimensao importante da mensagem desaparece? Se nao, nao e M02.',
      'HONESTIDADE VISUAL: a realidade nao se fabrica. Marcos so aparece reconhecivel quando ha foto REAL dele; onde nao ha, prefira contexto (pessoa pequena/parcial/de costas) ou volte para M01.',
      'O LARANJA e verbo, nao maquiagem: o destaque marca o PONTO DE VIRADA semantico (1 a 5 palavras REAIS do texto). Em variacoes com destaque_permitido=false, NAO ha destaque.',
      'Devolva SEMPRE JSON puro (sem markdown).',
    ].join('\n');

    const maniLines = activeManiIds.map((id) => {
      const m = maniById[id];
      return m ? `- ${m.id} (${m.nome} · ${m.operacao}) | usar: ${JSON.stringify(m.quando_usar)} | NAO: ${JSON.stringify(m.quando_nao)}` : `- ${id}`;
    });

    const usr = [
      `TEXTO APROVADO (nao altere):\n"""${text}"""`,
      `plataforma: ${input.platform ?? 'instagram'}`,
      `Fotos REAIS do Marcos disponiveis na biblioteca: ${realMarcosCount}. (Se 0, as variacoes que exigem Marcos reconhecivel — M02-A/M02-B — NAO devem vencer.)`,
      '',
      `DIMENSOES SEMANTICAS a pontuar de 0.0 a 1.0: ${dims.join(', ')}`,
      '',
      'MANIFESTACOES disponiveis:',
      ...maniLines,
      '',
      'VARIACOES (pontue CADA uma de 0.0 a 1.0 conforme o quanto o texto pede aquela variacao; respeite os "evitar"):',
      ...eligibleVars.map((v) =>
        `- ${v.id} (${v.nome} · ${v.operacao}) | usar: ${JSON.stringify(v.quando_usar)} | evitar: ${JSON.stringify(v.quando_nao)} | regra: ${JSON.stringify(v.selection_rule)} | destaque_permitido: ${(v.limites?.destaque_permitido ?? false)}`,
      ),
      '',
      'Responda em JSON:',
      '{',
      '  "semantics": { <cada dimensao acima>: 0.0-1.0 },',
      '  "manifestations": { "M01": 0.0-1.0, "M02": 0.0-1.0 },',
      '  "variants": { "<id>": {"score":0.0-1.0,"reason":"<curto>"}, ... para CADA variacao listada },',
      '  "highlight": { "target": "<1-5 palavras reais do texto>", "reason": "<por que e a virada>" },',
      '  "subtitle": "<OPCIONAL e so p/ M02: frase secundaria curta (ate 60 chars), um eco aforistico do proprio pensamento — SEM fatos, nomes ou datas novos; senao \\"\\">",',
      '  "poles": {"a":"<so p/ M03-A: 1o polo, ate 14 chars, extraido do texto>","b":"<2o polo>"} ,',
      '  "human_presence_adds_meaning": true|false,',
      '  "image_scene_hint": "<so se a variacao vencedora for M02 e precisar gerar: descreva em 1 frase uma cena plausivel e honesta, coerente com a variacao; senao \"\">",',
      '  "mode_reason": "<por que esta manifestacao/variacao>",',
      '  "asset_reason": "<estrategia de materia visual e por que>"',
      '}',
      'Se nenhum destaque fizer sentido (ou a variacao vencedora nao permitir), use "highlight": null.',
    ].join('\n');

    const { text: raw, usage, model_used } = await callGemini(apiKey, sys, usr);
    let parsed: {
      semantics?: Record<string, number>;
      manifestations?: Record<string, number>;
      variants?: Record<string, { score?: number; reason?: string }>;
      highlight?: { target?: string; reason?: string } | null;
      subtitle?: string;
      poles?: { a?: string; b?: string } | null;
      human_presence_adds_meaning?: boolean;
      image_scene_hint?: string;
      mode_reason?: string; asset_reason?: string;
    };
    try {
      parsed = JSON.parse(raw.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim());
    } catch {
      return errorResponse('Motor retornou JSON invalido. Tente de novo.', 502);
    }

    // --- Desempate por DIVERSIDADE (significado decide, diversidade desempata) ---
    const scoreOf = (id: string) => Math.max(0, Math.min(1, Number(parsed.variants?.[id]?.score ?? 0)));
    const semanticMax = Math.max(...eligibleVars.map((v) => scoreOf(v.id)));
    const withinTol = eligibleVars.filter((v) => scoreOf(v.id) >= semanticMax - (diversity.tolerance ?? 0.08));
    const variantScores: Record<string, { semantic: number; adjusted: number; reason: string }> = {};
    for (const v of eligibleVars) {
      const semantic = scoreOf(v.id);
      const adjusted = semantic - (diversity.penalty_per_recent_use ?? 0.12) * (recentCount[v.id] ?? 0);
      variantScores[v.id] = { semantic, adjusted, reason: String(parsed.variants?.[v.id]?.reason ?? '') };
    }
    const winner = withinTol
      .map((v) => v.id)
      .sort((a, b) => variantScores[b].adjusted - variantScores[a].adjusted)[0] ?? eligibleVars[0].id;
    const winnerVar = eligibleVars.find((v) => v.id === winner)!;
    const lim = winnerVar.limites ?? {};
    const manifestacao = winnerVar.manifestacao_id;

    // --- Destaque: respeita destaque_permitido da variacao vencedora ---
    const highlightAllowed = Boolean(lim.destaque_permitido);
    const highlight = highlightAllowed && parsed.highlight?.target
      ? { target: String(parsed.highlight.target), reason: String(parsed.highlight.reason ?? '') }
      : null;

    // --- Imagem: hierarquia REAL -> gerada (so M02) ---
    const imageRequired = Boolean(lim.image_required);
    let chosenAsset: null | { id: string; url: string; width: number | null; height: number | null; origin: string; source_image_id: string; espaco_texto: string | null; texto_cor: string | null } = null;
    let imageGeneration: null | { needed: true; prompt: string; forbid: string[]; must_have: Record<string, unknown>; scene_hint: string } = null;
    let assetType = 'graphic';

    if (manifestacao === 'M02' && imageRequired) {
      assetType = 'photo_marcos';
      const plan = assetPlan[winner];
      if (plan?.asset) {
        const a = plan.asset;
        chosenAsset = {
          id: a.id, url: a.url, width: a.width, height: a.height, origin: a.origin,
          source_image_id: a.source_image_id ?? a.id,
          espaco_texto: (a.semantic?.espaco_texto as string) ?? null,
          texto_cor: (a.semantic?.texto_cor as string) ?? null,
        };
      } else if (plan?.canGenerate) {
        const hint = String(parsed.image_scene_hint ?? '').trim();
        imageGeneration = {
          needed: true,
          prompt: [plan.genPrompt ?? '', hint].filter(Boolean).join(' Cena: '),
          forbid: plan.genForbid ?? [],
          must_have: plan.mustHave ?? {},
          scene_hint: hint,
        };
      }
    } else if (manifestacao === 'M01') {
      assetType = winner === 'M01-D' ? 'photo' : winner === 'M01-E' ? 'texture' : 'graphic';
    } else if (manifestacao === 'M03') {
      assetType = 'diagram';
    }

    // --- Checagem de texto: estourou o limite? -> revisao editorial ---
    const charsLimit = Number(lim.chars_limit ?? 150);
    const needsReview = text.length > charsLimit;

    const decision = {
      content_id: input.post_id ?? null,
      editorial_locked: true,
      platform: input.platform ?? 'instagram',
      mode: manifestacao,
      mode_confidence: Number((parsed.manifestations?.[manifestacao] ?? semanticMax).toFixed(2)),
      variant: winner,
      variant_confidence: Number(variantScores[winner].semantic.toFixed(2)),
      semantics: parsed.semantics ?? {},
      manifestations: parsed.manifestations ?? {},
      human_presence_adds_meaning: Boolean(parsed.human_presence_adds_meaning),
      variant_scores: variantScores,
      diversity: { window: diversity.window, history, applied: withinTol.length > 1 },
      highlight,
      subtitle: manifestacao === 'M02' ? (String(parsed.subtitle ?? '').trim() || null) : null,
      diagram: winner === 'M03-A'
        ? { poleA: String(parsed.poles?.a ?? '').trim().slice(0, 14) || 'A', poleB: String(parsed.poles?.b ?? '').trim().slice(0, 14) || 'B' }
        : null,
      asset_strategy: { type: assetType, photo_required: imageRequired },
      asset: chosenAsset,               // foto REAL escolhida (M02) — null se vai gerar
      image_generation: imageGeneration, // instrucao de geracao (M02 C/D sem foto real)
      brand: {
        font: 'arbutus_slab',
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
        image_source: chosenAsset ? `foto real (${chosenAsset.origin})` : imageGeneration ? 'gerada (sem foto real adequada)' : 'grafico/textura',
      },
      text_check: { chars: text.length, limit: charsLimit, needs_editorial_review: needsReview },
    };

    // --- Persiste no post, se veio post_id (image entra em 'pending') ---
    if (input.post_id) {
      await patchRest(`/user_posts?id=eq.${input.post_id}&user_id=eq.${userId}`, {
        visual_decision: decision,
        image_status: 'pending',
      });
    }

    logUsage({
      userId, provider: 'gemini', product: 'text', model: model_used,
      tokens_input: usage?.input, tokens_output: usage?.output,
      metadata: { fn: 'hive-decide', mode: manifestacao, variant: winner, image: decision.explanation.image_source, needs_review: needsReview },
    });

    return jsonResponse({ success: true, decision, model_used });
  } catch (e) {
    console.error('[hive-decide]', e);
    return errorResponse('Erro no motor de decisao da Hive', 500, String(e));
  }
});

export {};
