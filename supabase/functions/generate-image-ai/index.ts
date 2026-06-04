// Edge function: generate-image-ai
// Gera imagem com Gemini (imagen-3.0). Recebe { prompt, aspect_ratio? }.
// Devolve { image_base64, mime_type } — o frontend faz upload pro Storage.
//
// Aspect ratios suportados: '1:1', '3:4', '4:3', '9:16', '16:9'

import {
  errorResponse,
  getUserGeminiKey,
  jsonResponse,
  logUsage,
  preflight,
  userIdFromAuth,
  checkRateLimit,
} from '../_shared/security.ts';

// Nano Banana Pro (Gemini 3 imagem). Mais recente da familia em 2026.
const MODEL = Deno.env.get('GEMINI_IMAGE_MODEL') ?? 'gemini-3-pro-image-preview';

interface ImageInput {
  prompt: string;
  aspect_ratio?: '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
  style_hint?: string;
}

interface ImageOutput {
  image_base64: string;
  mime_type: string;
}

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return errorResponse('Use POST', 405);
  }

  try {
    const userId = userIdFromAuth(req);
    if (!userId) return errorResponse('Nao autenticado', 401);

    // Imagem eh cara — limite mais apertado
    const rl = checkRateLimit(userId, 60_000, 10);
    if (!rl.ok) return errorResponse(`Rate limit. Tente em ${Math.ceil(rl.resetIn / 1000)}s`, 429);

    const input = (await req.json()) as ImageInput;
    if (!input.prompt || input.prompt.length < 3) {
      return errorResponse('prompt eh obrigatorio', 400);
    }

    const apiKey = await getUserGeminiKey(userId);
    if (!apiKey) return errorResponse('Chave Gemini nao configurada', 400);

    const aspect = input.aspect_ratio ?? '4:5';
    // Imagen API atual aceita 1:1, 3:4, 4:3, 9:16, 16:9. Normalizamos.
    const normalizedAspect = mapAspect(aspect);

    const finalPrompt = input.style_hint
      ? `${input.prompt}. Style: ${input.style_hint}`
      : input.prompt;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:predict?key=${apiKey}`;
    const body = {
      instances: [{ prompt: finalPrompt }],
      parameters: { aspectRatio: normalizedAspect, sampleCount: 1 },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      return errorResponse(`Imagen API HTTP ${res.status}`, 500, errText.slice(0, 500));
    }

    const json = await res.json();
    const b64 =
      json.predictions?.[0]?.bytesBase64Encoded ??
      json.predictions?.[0]?.imageBase64 ??
      '';

    if (!b64) return errorResponse('Imagen API nao devolveu imagem', 500, json);

    const output: ImageOutput = { image_base64: b64, mime_type: 'image/png' };

    logUsage({
      userId,
      provider: 'gemini',
      product: 'image',
      model: MODEL,
      metadata: { prompt: finalPrompt.slice(0, 200), aspect: normalizedAspect },
    });

    return jsonResponse({ success: true, ...output });
  } catch (e) {
    return errorResponse('Erro ao gerar imagem', 500, String(e));
  }
});

function mapAspect(aspect: string): '1:1' | '3:4' | '4:3' | '9:16' | '16:9' {
  switch (aspect) {
    case '4:5':
    case '3:4':
      return '3:4';
    case '5:4':
    case '4:3':
      return '4:3';
    case '9:16':
      return '9:16';
    case '16:9':
    case '1.91:1':
      return '16:9';
    default:
      return '1:1';
  }
}

export {};
