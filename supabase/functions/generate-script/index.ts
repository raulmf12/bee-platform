// Edge function: generate-script
// Recebe { editorial_slug?, target_avatar?, platform?, briefing? }
// Devolve { titulo, roteiro } — um ROTEIRO de video no estilo Bee, pronto pra gravar.
// Mesmo prompt-engine da generate-caption-from-video, mas parte de um editorial
// (nao de um transcript) e produz um script, nao uma caption.

import {
  errorResponse,
  getUserGeminiKey,
  jsonResponse,
  logUsage,
  preflight,
  userIdFromAuth,
  checkRateLimit,
} from '../_shared/security.ts';

const MODEL_CHAIN = [
  Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-pro',
];
const MAX_RETRIES = 2;

interface Input {
  editorial_slug?: string;
  target_avatar?: 'identificado' | 'incomodado' | 'ambos';
  platform?: 'linkedin' | 'instagram';
  briefing?: string;
}

function svc(): HeadersInit {
  const k = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' };
}

async function fetchRest<T>(path: string): Promise<T> {
  const url = `${Deno.env.get('SUPABASE_URL')}/rest/v1${path}`;
  const res = await fetch(url, { headers: svc() });
  if (!res.ok) return [] as unknown as T;
  return await res.json();
}

// Le os aprendizados EXPLICITOS do usuario (mesma RPC do generate-content), pra o
// roteiro respeitar as licoes que o feedback ja ensinou.
async function fetchLearnings(userId: string, editorialSlug?: string, platform?: string, avatar?: string): Promise<string[]> {
  try {
    const url = `${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/ai_prompt_learnings`;
    const res = await fetch(url, {
      method: 'POST',
      headers: svc(),
      body: JSON.stringify({
        p_user: userId,
        p_editorial: editorialSlug ?? null,
        p_platform: platform ?? 'linkedin',
        p_avatar: avatar ?? 'ambos',
        p_facets: ['texto'],
        p_limit: 12,
      }),
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{ texto: string; evidencias?: number }>;
    return rows.map((r) => (r.evidencias && r.evidencias > 1 ? `${r.texto} [reforcado ${r.evidencias}x]` : r.texto));
  } catch {
    return [];
  }
}

interface Editorial { slug: string; name: string; description: string; structure_template: string; emotional_sequence: string[] }
interface Avatar { name: string; state: string; dor: string; gatilhos: string[]; example_phrases: string[] }
interface StyleRule { rule: string }

async function loadBeeCtx(editorialSlug?: string, targetAvatar?: string) {
  const avatarFilter = targetAvatar && targetAvatar !== 'ambos' ? `&slug=eq.${targetAvatar}` : '';
  const editorialFilter = editorialSlug ? `slug=eq.${editorialSlug}&` : '';
  const [editorial, avatars, doRules, dontRules, generalRules] = await Promise.all([
    editorialSlug ? fetchRest<Editorial[]>(`/bee_editorials?${editorialFilter}limit=1`) : Promise.resolve([]),
    fetchRest<Avatar[]>(`/bee_avatars?order=position.asc${avatarFilter}`),
    fetchRest<StyleRule[]>(`/bee_style_rules?category=eq.do&order=position.asc`),
    fetchRest<StyleRule[]>(`/bee_style_rules?category=eq.dont&order=position.asc`),
    fetchRest<StyleRule[]>(`/bee_style_rules?category=eq.general&order=position.asc`),
  ]);
  return { editorial: editorial[0], avatars, doRules, dontRules, generalRules };
}

function buildPrompt(input: Input, ctx: Awaited<ReturnType<typeof loadBeeCtx>>, learnings: string[]): string {
  const lines: string[] = [];

  lines.push('Voce e Marcos Piccini / Bee Academy. Vai escrever o ROTEIRO de um VIDEO curto pra redes sociais.');
  lines.push('O roteiro sera GRAVADO por uma pessoa falando pra camera. Escreva pra ser FALADO, nao lido — ritmo de fala, frases curtas, respiro.');
  lines.push('O video leva o espectador do Olhar Mecanico (a armadilha) pro Olhar Sistemico (a potencia).');
  lines.push('');

  const isReel = input.platform === 'instagram';
  lines.push(`=== FORMATO ===`);
  lines.push(isReel
    ? 'REEL (Instagram): 45-90 segundos. Gancho brutal nos 3 primeiros segundos ou perde o scroll. Ritmo rapido.'
    : 'VIDEO (LinkedIn): 60-120 segundos. Pode respirar um pouco mais, mas continua denso e direto.');
  lines.push('');

  if (ctx.editorial) {
    lines.push(`=== EDITORIAL: ${ctx.editorial.name} ===`);
    lines.push(ctx.editorial.description);
    if (ctx.editorial.structure_template) lines.push(`Estrutura de referencia: ${ctx.editorial.structure_template}`);
    lines.push('');
  }

  if (ctx.avatars.length === 1) {
    const av = ctx.avatars[0];
    lines.push(`=== AVATAR ALVO: ${av.name} ===`);
    lines.push(`Estado: ${av.state}`);
    lines.push(`Dor: ${av.dor}`);
    if (av.gatilhos?.length) lines.push(`Gatilhos: ${av.gatilhos.join(', ')}`);
    lines.push('');
  } else if (ctx.avatars.length > 1) {
    lines.push('=== PUBLICO ===');
    lines.push('Fala pros dois avatares (identificado e incomodado) — ressoa com quem ainda nao viu o problema E com quem ja sente.');
    lines.push('');
  }

  if (input.briefing) lines.push(`=== BRIEFING/AJUSTE DO USUARIO (prioridade alta) ===\n${input.briefing}\n`);

  if (ctx.doRules.length) {
    lines.push('=== O QUE A VOZ FAZ ===');
    ctx.doRules.forEach((r) => lines.push(`• ${r.rule}`));
    lines.push('');
  }
  if (ctx.dontRules.length) {
    lines.push('=== O QUE A VOZ NAO FAZ ===');
    ctx.dontRules.forEach((r) => lines.push(`• ${r.rule}`));
    lines.push('');
  }
  if (ctx.generalRules.length) {
    lines.push('=== REGRAS GERAIS ===');
    ctx.generalRules.forEach((r) => lines.push(`• ${r.rule}`));
    lines.push('');
  }

  if (learnings.length) {
    lines.push('=== APRENDIZADOS (licoes que voce ja ensinou — respeite) ===');
    learnings.forEach((l) => lines.push(`• ${l}`));
    lines.push('');
  }

  lines.push('=== ESTRUTURA DO ROTEIRO ===');
  lines.push('1. GANCHO — a primeira fala. Prende no scroll, nomeia a armadilha ou provoca.');
  lines.push('2. DESENVOLVIMENTO — 2-4 blocos curtos que constroem a tensao Mecanico x Sistemico.');
  lines.push('3. VIRADA SISTEMICA — o momento em que o olhar vira. Use uma analogia concreta.');
  lines.push('4. CTA — fechamento que convida a refletir ou agir. Sem "linkzinho na bio" generico.');
  lines.push('');

  lines.push('=== REGRAS DE SAIDA (JSON puro) ===');
  lines.push('- "titulo": titulo curto do video (o tema, nao clickbait).');
  lines.push('- "roteiro": o roteiro COMPLETO em texto corrido pronto pra gravar. Marque as secoes com [GANCHO], [DESENVOLVIMENTO], [VIRADA] e [CTA] em linhas proprias. Escreva a FALA em si, nao instrucoes de direcao. Frases curtas, ritmo de fala.');
  lines.push('- Saida em JSON puro, sem markdown fence.');

  return lines.join('\n');
}

async function callGeminiOnce(apiKey: string, sys: string, usr: string, model: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  return await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: 'user', parts: [{ text: usr }] }],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 8000,
        responseMimeType: 'application/json',
      },
    }),
  });
}

async function callGemini(apiKey: string, sys: string, usr: string): Promise<{ text: string; usage: unknown; model_used: string }> {
  let lastErr = '';
  for (const model of MODEL_CHAIN) {
    console.log(`[generate-script] tentando modelo: ${model}`);
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await callGeminiOnce(apiKey, sys, usr, model);
        if (!res.ok) {
          const errText = (await res.text()).slice(0, 400);
          lastErr = `[${model}] HTTP ${res.status}: ${errText}`;
          console.warn(`[generate-script] ${lastErr}`);
          if (res.status === 503 || res.status === 429) {
            await new Promise((r) => setTimeout(r, (attempt + 1) * 2000));
            continue;
          }
          break;
        }
        const json = await res.json();
        const candidate = json.candidates?.[0];
        const finishReason = candidate?.finishReason;
        const text = candidate?.content?.parts?.[0]?.text ?? '';
        console.log(`[generate-script] ${model} attempt ${attempt + 1} → finishReason=${finishReason} text_len=${text.length}`);

        if (!text || text.trim().length < 20) {
          lastErr = `[${model}] resposta vazia/curta. finishReason=${finishReason}`;
          if (finishReason === 'MAX_TOKENS') break;
          await new Promise((r) => setTimeout(r, (attempt + 1) * 1500));
          continue;
        }
        return { text, usage: json.usageMetadata, model_used: model };
      } catch (e) {
        lastErr = `[${model}] ${(e as Error).message}`;
        console.warn(`[generate-script] excecao: ${lastErr}`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
  throw new Error(`Gemini falhou em toda cadeia. Ultimo: ${lastErr}`);
}

// Recupera JSON cortado (roteiro longo que estourou tokens): fecha a string e o objeto.
function tryRecoverTruncatedJson(raw: string): string {
  if (raw.trimEnd().endsWith('}')) return raw;
  let escaped = false;
  let inString = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\') { escaped = true; continue; }
    if (c === '"') { inString = !inString; }
  }
  if (inString) return raw + '"' + '}';
  return raw + '}';
}

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);

  try {
    const userId = userIdFromAuth(req);
    if (!userId) return errorResponse('Nao autenticado', 401);

    const rl = checkRateLimit(userId, 60_000, 20);
    if (!rl.ok) return errorResponse('Rate limit', 429);

    const input = (await req.json()) as Input;

    const apiKey = await getUserGeminiKey(userId);
    if (!apiKey) return errorResponse('Chave Gemini nao configurada', 400);

    const [ctx, learnings] = await Promise.all([
      loadBeeCtx(input.editorial_slug, input.target_avatar),
      fetchLearnings(userId, input.editorial_slug, input.platform, input.target_avatar),
    ]);
    const sys = buildPrompt(input, ctx, learnings);
    const usr = 'Gere o JSON do roteiro conforme as regras.';
    const { text, usage, model_used } = await callGemini(apiKey, sys, usr);

    const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    let parsed: { titulo?: string; roteiro?: string };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.warn('[generate-script] parse falhou, tentando recuperar JSON truncado');
      try {
        parsed = JSON.parse(tryRecoverTruncatedJson(cleaned));
      } catch (e2) {
        console.error('[generate-script] parse + recovery falharam. Raw:', cleaned.slice(0, 500));
        return errorResponse('Resposta da IA veio malformada', 500, {
          parse_error: (e2 as Error).message,
          raw_preview: cleaned.slice(0, 1500),
          model_used,
        });
      }
    }

    const u = usage as { promptTokenCount?: number; candidatesTokenCount?: number } | undefined;
    logUsage({
      userId, provider: 'gemini', product: 'text', model: model_used,
      tokens_input: u?.promptTokenCount, tokens_output: u?.candidatesTokenCount,
      metadata: { source: 'video-script', editorial: input.editorial_slug, platform: input.platform, model_chain: MODEL_CHAIN },
    });

    return jsonResponse({
      success: true,
      titulo: parsed.titulo ?? '',
      roteiro: parsed.roteiro ?? '',
      model_used,
    });
  } catch (e) {
    console.error('[generate-script]', e);
    return errorResponse('Erro ao gerar roteiro', 500, String(e));
  }
});

export {};
