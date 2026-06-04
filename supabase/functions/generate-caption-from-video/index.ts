// Edge function: generate-caption-from-video
// Recebe { transcript, visual_summary, editorial_slug?, target_avatar?, briefing? }
// Devolve { caption } no estilo Bee.
// Reusa o mesmo prompt-engine do generate-content, so muda a entrada.

import {
  errorResponse,
  getUserGeminiKey,
  jsonResponse,
  logUsage,
  preflight,
  userIdFromAuth,
  checkRateLimit,
} from '../_shared/security.ts';

// Cadeia: Flash primeiro (mais previsivel, sem "thinking tokens" que cortam saida),
// Pro como fallback se Flash falhar.
const MODEL_CHAIN = [
  Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-pro',
];
const MAX_RETRIES = 2;

interface Input {
  transcript: string;
  visual_summary?: string;
  content_type?: string;
  editorial_slug?: string;
  target_avatar?: 'identificado' | 'incomodado' | 'ambos';
  briefing?: string;
}

const CONTENT_TYPE_INSTRUCTIONS: Record<string, string> = {
  podcast: 'O VIDEO E UM PODCAST. A caption deve referenciar a CONVERSA, nao a aparencia visual. Pode citar trechos da fala. Foque na ideia central discutida.',
  talking_head: 'TALKING HEAD: pessoa falando direto pra camera. A caption complementa o discurso, traz a virada sistemica que o video preparou.',
  vlog: 'VLOG: caption pode evocar o momento/cena do video como ponto de partida.',
  tutorial: 'TUTORIAL: caption nao repete o passo a passo — eleva pra reflexao sobre POR QUE isso importa sistemicamente.',
  behind_scenes: 'BASTIDOR: caption usa o bastidor como gancho pra revelar um padrao maior.',
  palestra: 'TRECHO DE PALESTRA: caption contextualiza a fala e provoca reflexao.',
  reel_curto: 'REEL: caption curta e direta complementa o impacto visual.',
};

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

interface Editorial { slug: string; name: string; description: string; structure_template: string; emotional_sequence: string[] }
interface Avatar { name: string; state: string; dor: string; gatilhos: string[]; example_phrases: string[] }
interface StyleRule { rule: string }
interface Hashtag { tag: string; required: boolean }

async function loadBeeCtx(editorialSlug?: string, targetAvatar?: string) {
  const avatarFilter = targetAvatar && targetAvatar !== 'ambos' ? `&slug=eq.${targetAvatar}` : '';
  const editorialFilter = editorialSlug ? `slug=eq.${editorialSlug}&` : '';
  const [editorial, avatars, doRules, dontRules, generalRules, hashtags] = await Promise.all([
    editorialSlug ? fetchRest<Editorial[]>(`/bee_editorials?${editorialFilter}limit=1`) : Promise.resolve([]),
    fetchRest<Avatar[]>(`/bee_avatars?order=position.asc${avatarFilter}`),
    fetchRest<StyleRule[]>(`/bee_style_rules?category=eq.do&order=position.asc`),
    fetchRest<StyleRule[]>(`/bee_style_rules?category=eq.dont&order=position.asc`),
    fetchRest<StyleRule[]>(`/bee_style_rules?category=eq.general&order=position.asc`),
    fetchRest<Hashtag[]>(`/bee_hashtags?order=position.asc`),
  ]);
  return { editorial: editorial[0], avatars, doRules, dontRules, generalRules, hashtags };
}

function buildPrompt(input: Input, ctx: Awaited<ReturnType<typeof loadBeeCtx>>): string {
  const lines: string[] = [];

  lines.push('Voce e Marcos Piccini / Bee Academy. Vai escrever a CAPTION pra acompanhar um VIDEO ja gravado.');
  lines.push('A caption deve dialogar com a fala do video, criar gancho no scroll e levar a uma reflexao sistemica.');
  lines.push('');

  if (input.content_type && CONTENT_TYPE_INSTRUCTIONS[input.content_type]) {
    lines.push(`=== TIPO DE VIDEO ===`);
    lines.push(CONTENT_TYPE_INSTRUCTIONS[input.content_type]);
    lines.push('');
  }

  if (input.visual_summary && input.content_type !== 'podcast' && input.content_type !== 'talking_head') {
    lines.push(`=== RESUMO VISUAL DO VIDEO ===\n${input.visual_summary}\n`);
  }

  lines.push(`=== TRANSCRICAO DO VIDEO ===\n${input.transcript}\n=== FIM ===\n`);

  if (ctx.editorial) {
    lines.push(`=== EDITORIAL: ${ctx.editorial.name} ===`);
    lines.push(ctx.editorial.description);
    lines.push(`Estrutura: ${ctx.editorial.structure_template}`);
    lines.push('');
  }

  if (ctx.avatars.length === 1) {
    const av = ctx.avatars[0];
    lines.push(`=== AVATAR ALVO: ${av.name} ===`);
    lines.push(`Estado: ${av.state}`);
    lines.push(`Dor: ${av.dor}`);
    if (av.gatilhos?.length) lines.push(`Gatilhos: ${av.gatilhos.join(', ')}`);
    lines.push('');
  }

  if (input.briefing) lines.push(`Briefing adicional: ${input.briefing}\n`);

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

  const required = ctx.hashtags.filter((h) => h.required).map((h) => h.tag);
  if (required.length) {
    lines.push(`Hashtags obrigatorias no fim da caption: ${required.join(' ')}`);
    lines.push('');
  }

  lines.push('=== REGRAS DE SAIDA ===');
  lines.push('- "caption": MAXIMO 4 PARAGRAFOS CURTOS (2-4 frases cada). Densidade > extensao.');
  lines.push('  Estrutura: P1 gancho (primeiros 49 chars cabem na "ver mais") · P2 aprofundamento · P3 virada sistemica com analogia · P4 fechamento "Ve?" ou pergunta de implicacao.');
  lines.push('  Hashtags obrigatorias DEPOIS dos 4 paragrafos, em linha unica separada por espaco.');
  lines.push('- "hook_preview": os primeiros 49 chars da caption.');
  lines.push('- NAO copie literalmente a fala do video — complementa, contextualiza, traz a virada sistemica.');
  lines.push('- Frases curtas. Cada uma com peso. Sem rodeios. Cada palavra conta.');
  lines.push('- Saida em JSON puro.');

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
        temperature: 0.85,
        maxOutputTokens: 8000,
        responseMimeType: 'application/json',
      },
    }),
  });
}

async function callGemini(apiKey: string, sys: string, usr: string): Promise<{ text: string; usage: unknown; model_used: string }> {
  let lastErr = '';
  for (const model of MODEL_CHAIN) {
    console.log(`[caption-video] tentando modelo: ${model}`);
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await callGeminiOnce(apiKey, sys, usr, model);
        if (!res.ok) {
          const errText = (await res.text()).slice(0, 400);
          lastErr = `[${model}] HTTP ${res.status}: ${errText}`;
          console.warn(`[caption-video] ${lastErr}`);
          if (res.status === 503 || res.status === 429) {
            await new Promise((r) => setTimeout(r, (attempt + 1) * 2000));
            continue;
          }
          break; // erro definitivo, tenta proximo modelo
        }
        const json = await res.json();
        const candidate = json.candidates?.[0];
        const finishReason = candidate?.finishReason;
        const text = candidate?.content?.parts?.[0]?.text ?? '';
        console.log(`[caption-video] ${model} attempt ${attempt + 1} → finishReason=${finishReason} text_len=${text.length}`);

        if (!text || text.trim().length < 20) {
          lastErr = `[${model}] resposta vazia/curta. finishReason=${finishReason}`;
          console.warn(`[caption-video] ${lastErr}`);
          if (finishReason === 'MAX_TOKENS') {
            // ja batemos o teto — proximo modelo
            break;
          }
          await new Promise((r) => setTimeout(r, (attempt + 1) * 1500));
          continue;
        }

        return { text, usage: json.usageMetadata, model_used: model };
      } catch (e) {
        lastErr = `[${model}] ${(e as Error).message}`;
        console.warn(`[caption-video] excecao: ${lastErr}`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
  throw new Error(`Gemini falhou em toda cadeia. Ultimo: ${lastErr}`);
}

// Tenta recuperar JSON cortado no meio (geralmente caption longa que estourou tokens).
// Estrategia: encontra a ultima aspas nao escapada, fecha a string e o objeto.
function tryRecoverTruncatedJson(raw: string): string {
  // Se ja termina com } valido, nao precisa
  if (raw.trimEnd().endsWith('}')) return raw;
  // Acha posicao da ultima " nao escapada
  let lastQuote = -1;
  let escaped = false;
  let inString = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\') { escaped = true; continue; }
    if (c === '"') {
      if (!inString) { inString = true; }
      else { inString = false; lastQuote = i; }
    }
  }
  if (inString) {
    // string aberta — fecha
    return raw + '"' + '}';
  }
  // string fechada mas objeto aberto
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
    if (!input.transcript || input.transcript.length < 20) {
      return errorResponse('transcript curto demais', 400);
    }

    const apiKey = await getUserGeminiKey(userId);
    if (!apiKey) return errorResponse('Chave Gemini nao configurada', 400);

    const ctx = await loadBeeCtx(input.editorial_slug, input.target_avatar);
    const sys = buildPrompt(input, ctx);
    const usr = 'Gere o JSON conforme as regras.';
    const { text, usage, model_used } = await callGemini(apiKey, sys, usr);

    const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    let parsed: { caption?: string; hook_preview?: string };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Tenta recuperar JSON truncado (caso comum: caption cortada no meio da string)
      console.warn('[caption-video] parse falhou, tentando recuperar JSON truncado');
      try {
        const recovered = tryRecoverTruncatedJson(cleaned);
        parsed = JSON.parse(recovered);
        console.log('[caption-video] JSON recuperado com sucesso (caption pode estar parcial)');
      } catch (e2) {
        console.error('[caption-video] parse + recovery falharam. Raw:', cleaned.slice(0, 500));
        return errorResponse('Resposta da IA veio malformada', 500, {
          parse_error: (e2 as Error).message,
          raw_preview: cleaned.slice(0, 1500),
          raw_chars: cleaned.length,
          model_used,
        });
      }
    }

    const u = usage as { promptTokenCount?: number; candidatesTokenCount?: number } | undefined;
    logUsage({
      userId, provider: 'gemini', product: 'text', model: model_used,
      tokens_input: u?.promptTokenCount, tokens_output: u?.candidatesTokenCount,
      metadata: { source: 'video-caption', editorial: input.editorial_slug, content_type: input.content_type, model_chain: MODEL_CHAIN },
    });

    return jsonResponse({
      success: true,
      caption: parsed.caption ?? '',
      hook_preview: parsed.hook_preview ?? '',
      model_used,
    });
  } catch (e) {
    console.error('[generate-caption-from-video]', e);
    return errorResponse('Erro', 500, String(e));
  }
});

export {};
