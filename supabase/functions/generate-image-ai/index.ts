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

// Endpoint Imagen (:predict). O modelo Gemini de imagem NÃO roda aqui (dá 404
// "not supported for predict"), então usamos modelos Imagen, com fallback caso
// um não esteja liberado pra a chave do usuário.
const MODEL_CHAIN = [
  Deno.env.get('GEMINI_IMAGE_MODEL') ?? 'imagen-3.0-generate-002',
  'imagen-4.0-generate-001',
  'imagen-3.0-generate-001',
];

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

    const body = {
      instances: [{ prompt: finalPrompt }],
      parameters: { aspectRatio: normalizedAspect, sampleCount: 1 },
    };

    let b64 = '';
    let usedModel = '';
    let lastErr = '';
    for (const model of MODEL_CHAIN) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) {
        lastErr = `[${model}] HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`;
        // 404/400 = modelo indisponível pra esta chave -> tenta o próximo.
        if (res.status === 404 || res.status === 400) continue;
        break;
      }
      const json = await res.json();
      b64 = json.predictions?.[0]?.bytesBase64Encoded ?? json.predictions?.[0]?.imageBase64 ?? '';
      if (b64) { usedModel = model; break; }
      lastErr = `[${model}] sem imagem no retorno`;
    }

    if (!b64) return errorResponse('Nenhum modelo Imagen disponível gerou a imagem', 502, lastErr);

    const output: ImageOutput = { image_base64: b64, mime_type: 'image/png' };

    logUsage({
      userId,
      provider: 'gemini',
      product: 'image',
      model: usedModel,
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
