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

    const apiKey = await getUserGeminiKey(userId);
    if (!apiKey) return errorResponse('Chave Gemini nao configurada', 400);

    const aspect = input.aspect_ratio ?? '4:5';
    // Aspect no PROMPT (Nano Banana) + regra dura de "sem texto na imagem".
    const finalPrompt = [
      input.prompt,
      input.style_hint ? `Estilo: ${input.style_hint}.` : '',
      aspectPhrase(aspect),
      'NÃO escreva nenhum texto, letra, número, marca ou logo na imagem.',
    ].filter(Boolean).join(' ');

    // 1) Nano Banana (principal). 2) Imagen (fallback).
    const nano = await tryNano(apiKey, finalPrompt);
    let b64 = nano.b64, mime = nano.mime, usedModel = nano.model, lastErr = nano.err;
    if (!b64) {
      const im = await tryImagen(apiKey, finalPrompt, aspect);
      if (im.b64) { b64 = im.b64; mime = 'image/png'; usedModel = im.model; }
      else lastErr = `nano: ${nano.err} | imagen: ${im.err}`;
    }

    if (!b64) return errorResponse('Nenhum modelo de imagem disponível gerou a imagem', 502, lastErr);

    logUsage({
      userId, provider: 'gemini', product: 'image', model: usedModel,
      metadata: { prompt: finalPrompt.slice(0, 200), aspect },
    });

    return jsonResponse({ success: true, image_base64: b64, mime_type: mime });
  } catch (e) {
    return errorResponse('Erro ao gerar imagem', 500, String(e));
  }
});

export {};
