// Edge function: generate-image-ai
// Gera imagem a partir de texto. Recebe { prompt, aspect_ratio?, style_hint? }.
// Devolve { image_base64, mime_type } — o frontend faz upload pro Storage.
//
// PRINCIPAL: Nano Banana (gemini-2.5-flash-image) via :generateContent — o mesmo
// que o nano-scene usa e que funciona pra a chave do usuário. O aspect ratio vai
// no PROMPT (esse modelo não aceita parâmetro de proporção).
// FALLBACK: Imagen (:predict) — costuma dar 404 sem projeto liberado, então fica
// só de reserva caso a chave tenha acesso.

import {
  errorResponse,
  getUserGeminiKey,
  getUserOpenAIKey,
  jsonResponse,
  logUsage,
  preflight,
  userIdFromAuth,
  checkRateLimit,
} from '../_shared/security.ts';

// Nano Banana (generateContent) — caminho principal.
const NANO_CHAIN = ['gemini-2.5-flash-image', 'gemini-2.5-flash-image-preview'];
// Imagen (predict) — fallback só se a chave tiver acesso.
const IMAGEN_CHAIN = [
  Deno.env.get('GEMINI_IMAGE_MODEL') ?? 'imagen-4.0-generate-001',
  'imagen-3.0-generate-002',
];

interface ImageInput {
  prompt: string;
  aspect_ratio?: '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
  style_hint?: string;
  // Modelo escolhido. Ausente/'nano'/'gemini-*' = Nano Banana (Gemini). Os
  // 'gpt-image-2.5-*' vão pro ramo OpenAI. Serve o teste comparativo de modelos.
  model?: string;
  quality?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'auto';
}

// aspect_ratio -> size da OpenAI (Images API aceita parâmetro de tamanho).
function openaiSize(aspect: string): string {
  switch (aspect) {
    case '4:5': case '3:4': case '9:16': return '1024x1536';
    case '5:4': case '4:3': case '16:9': case '1.91:1': return '1536x1024';
    default: return '1024x1024';
  }
}

// OpenAI GPT Image 2.5 (flare/sunburst) via Images API. Devolve b64 + custo REAL
// calculado do usage (in $5/M, out $30/M). n=1.
async function tryOpenAI(
  apiKey: string, model: string, prompt: string, aspect: string, quality: string,
): Promise<{ b64: string; mime: string; costUsd: number; tokensIn: number; tokensOut: number; err: string }> {
  const body = {
    model,
    prompt,
    n: 1,
    size: openaiSize(aspect),
    quality,
  };
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  if (!res.ok) return { b64: '', mime: 'image/png', costUsd: 0, tokensIn: 0, tokensOut: 0, err: `[${model}] HTTP ${res.status}: ${txt.slice(0, 240)}` };
  const json = JSON.parse(txt);
  const b64 = json.data?.[0]?.b64_json ?? '';
  const u = json.usage ?? {};
  const tokensIn = u.input_tokens ?? 0;
  const tokensOut = u.output_tokens ?? 0;
  // in inclui texto ($5/M) e, no img2img, imagem ($8/M). Aqui o input é texto;
  // o custo dominante é o output de imagem ($30/M). Cálculo do usage real.
  const costUsd = (tokensIn / 1_000_000) * 5 + (tokensOut / 1_000_000) * 30;
  if (!b64) return { b64: '', mime: 'image/png', costUsd, tokensIn, tokensOut, err: `[${model}] sem imagem no retorno` };
  return { b64, mime: 'image/png', costUsd, tokensIn, tokensOut, err: '' };
}

// Descrição da proporção pro prompt (Nano Banana lê do texto, não de parâmetro).
function aspectPhrase(aspect: string): string {
  switch (aspect) {
    case '4:5': case '3:4': return 'Proporção VERTICAL retrato (3:4).';
    case '5:4': case '4:3': return 'Proporção HORIZONTAL paisagem (4:3).';
    case '9:16': return 'Proporção VERTICAL alta (9:16), tipo story.';
    case '16:9': case '1.91:1': return 'Proporção HORIZONTAL ampla (16:9).';
    default: return 'Proporção QUADRADA (1:1).';
  }
}

function mapAspect(aspect: string): '1:1' | '3:4' | '4:3' | '9:16' | '16:9' {
  switch (aspect) {
    case '4:5': case '3:4': return '3:4';
    case '5:4': case '4:3': return '4:3';
    case '9:16': return '9:16';
    case '16:9': case '1.91:1': return '16:9';
    default: return '1:1';
  }
}

// Nano Banana: texto -> imagem via generateContent. Retorna base64 ou ''.
async function tryNano(apiKey: string, prompt: string): Promise<{ b64: string; mime: string; model: string; err: string }> {
  const body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'], temperature: 0.7 } };
  let err = '';
  for (const model of NANO_CHAIN) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) { err = `[${model}] HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`; if (res.status === 404 || res.status === 400) continue; break; }
    const json = await res.json();
    for (const p of (json.candidates?.[0]?.content?.parts ?? [])) {
      const inl = p.inlineData ?? p.inline_data;
      if (inl?.data) return { b64: inl.data, mime: inl.mimeType ?? inl.mime_type ?? 'image/png', model, err };
    }
    err = `[${model}] sem imagem no retorno`;
  }
  return { b64: '', mime: 'image/png', model: '', err };
}

// Imagen: fallback via predict. Retorna base64 ou ''.
async function tryImagen(apiKey: string, prompt: string, aspect: string): Promise<{ b64: string; model: string; err: string }> {
  const body = { instances: [{ prompt }], parameters: { aspectRatio: mapAspect(aspect), sampleCount: 1 } };
  let err = '';
  for (const model of IMAGEN_CHAIN) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) { err = `[${model}] HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`; if (res.status === 404 || res.status === 400) continue; break; }
    const json = await res.json();
    const b64 = json.predictions?.[0]?.bytesBase64Encoded ?? json.predictions?.[0]?.imageBase64 ?? '';
    if (b64) return { b64, model, err };
    err = `[${model}] sem imagem no retorno`;
  }
  return { b64: '', model: '', err };
}

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);

  try {
    const userId = userIdFromAuth(req);
    if (!userId) return errorResponse('Nao autenticado', 401);

    // Imagem eh cara — limite mais apertado
    const rl = checkRateLimit(userId, 60_000, 10);
    if (!rl.ok) return errorResponse(`Rate limit. Tente em ${Math.ceil(rl.resetIn / 1000)}s`, 429);

    const input = (await req.json()) as ImageInput;
    if (!input.prompt || input.prompt.length < 3) return errorResponse('prompt eh obrigatorio', 400);

    const aspect = input.aspect_ratio ?? '4:5';
    // Aspect no PROMPT (Nano Banana lê do texto) + regra dura de "sem texto".
    const finalPrompt = [
      input.prompt,
      input.style_hint ? `Estilo: ${input.style_hint}.` : '',
      aspectPhrase(aspect),
      'NÃO escreva nenhum texto, letra, número, marca ou logo na imagem.',
    ].filter(Boolean).join(' ');

    const model = input.model ?? 'gemini-2.5-flash-image';
    const isOpenAI = model.startsWith('gpt-image');

    // ---- Ramo OpenAI (GPT Image 2.5 flare/sunburst) ----
    if (isOpenAI) {
      const oaKey = await getUserOpenAIKey(userId);
      if (!oaKey) return errorResponse('Chave OpenAI não configurada (Configurações > Chaves de API).', 400);
      const quality = input.quality ?? 'medium';
      const r = await tryOpenAI(oaKey, model, finalPrompt, aspect, quality);
      if (!r.b64) return errorResponse('OpenAI não gerou a imagem', 502, r.err);
      logUsage({
        userId, provider: 'openai', product: 'image', model,
        tokens_input: r.tokensIn, tokens_output: r.tokensOut, cost_usd: r.costUsd,
        metadata: { prompt: finalPrompt.slice(0, 200), aspect, quality },
      });
      return jsonResponse({
        success: true, image_base64: r.b64, mime_type: r.mime,
        model, cost_usd: r.costUsd, tokens_input: r.tokensIn, tokens_output: r.tokensOut,
      });
    }

    // ---- Ramo Gemini (Nano Banana principal, Imagen fallback) ----
    const apiKey = await getUserGeminiKey(userId);
    if (!apiKey) return errorResponse('Chave Gemini nao configurada', 400);
    const nano = await tryNano(apiKey, finalPrompt);
    let b64 = nano.b64, mime = nano.mime, usedModel = nano.model, lastErr = nano.err;
    if (!b64) {
      const im = await tryImagen(apiKey, finalPrompt, aspect);
      if (im.b64) { b64 = im.b64; mime = 'image/png'; usedModel = im.model; }
      else lastErr = `nano: ${nano.err} | imagen: ${im.err}`;
    }

    if (!b64) return errorResponse('Nenhum modelo de imagem disponível gerou a imagem', 502, lastErr);

    const geminiCost = usedModel === 'gemini-2.5-flash-image' ? 0.039 : 0.04;
    logUsage({
      userId, provider: 'gemini', product: 'image', model: usedModel, cost_usd: geminiCost,
      metadata: { prompt: finalPrompt.slice(0, 200), aspect },
    });

    return jsonResponse({ success: true, image_base64: b64, mime_type: mime, model: usedModel, cost_usd: geminiCost });
  } catch (e) {
    return errorResponse('Erro ao gerar imagem', 500, String(e));
  }
});

export {};
