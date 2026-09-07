// ⚠️ EDGE FUNCTION TEMPORÁRIA — protótipo do "meio-termo" do M02. APAGAR depois.
// Gera a CENA (sem texto) com Nano Banana (gemini-2.5-flash-image) usando fotos
// REAIS do Marcos como referência de likeness. Deixa espaço negativo pro texto —
// o compositor deposita o pensamento por cima (fonte/laranja/espiral reais).
// Recebe { prompt, references?: string[] (base64 puro), ref_mime? }.
// Devolve { success, image_base64, mime_type }.

import {
  errorResponse,
  getUserGeminiKey,
  jsonResponse,
  logUsage,
  preflight,
  userIdFromAuth,
  checkRateLimit,
} from '../_shared/security.ts';

const MODEL_CHAIN = ['gemini-2.5-flash-image', 'gemini-2.5-flash-image-preview'];

interface SceneInput {
  prompt: string;
  references?: string[];   // base64 puro (sem "data:")
  ref_mime?: string;       // default image/jpeg
}

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);

  try {
    const userId = userIdFromAuth(req);
    if (!userId) return errorResponse('Nao autenticado', 401);

    const rl = checkRateLimit(userId, 60_000, 10);
    if (!rl.ok) return errorResponse(`Rate limit. Tente em ${Math.ceil(rl.resetIn / 1000)}s`, 429);

    const input = (await req.json()) as SceneInput;
    if (!input.prompt || input.prompt.length < 3) return errorResponse('prompt eh obrigatorio', 400);

    const apiKey = await getUserGeminiKey(userId);
    if (!apiKey) return errorResponse('Chave Gemini nao configurada', 400);

    const refMime = input.ref_mime ?? 'image/jpeg';
    const parts: unknown[] = [{ text: input.prompt }];
    for (const b64 of (input.references ?? []).slice(0, 4)) {
      if (b64) parts.push({ inline_data: { mime_type: refMime, data: b64 } });
    }

    const body = {
      contents: [{ parts }],
      generationConfig: { responseModalities: ['IMAGE'], temperature: 0.7 },
    };

    let outB64 = '';
    let outMime = 'image/png';
    let usedModel = '';
    let lastErr = '';
    for (const model of MODEL_CHAIN) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) {
        lastErr = `[${model}] HTTP ${res.status}: ${(await res.text()).slice(0, 220)}`;
        if (res.status === 404 || res.status === 400) continue;
        break;
      }
      const json = await res.json();
      const outParts = json.candidates?.[0]?.content?.parts ?? [];
      for (const p of outParts) {
        const inl = p.inlineData ?? p.inline_data;
        if (inl?.data) { outB64 = inl.data; outMime = inl.mimeType ?? inl.mime_type ?? outMime; break; }
      }
      if (outB64) { usedModel = model; break; }
      lastErr = `[${model}] sem imagem no retorno (${JSON.stringify(json).slice(0, 200)})`;
    }

    if (!outB64) return errorResponse('Nano Banana não gerou a cena', 502, lastErr);

    logUsage({
      userId, provider: 'gemini', product: 'image', model: usedModel,
      metadata: { prompt: input.prompt.slice(0, 200), refs: (input.references ?? []).length },
    });

    return jsonResponse({ success: true, image_base64: outB64, mime_type: outMime });
  } catch (e) {
    return errorResponse('Erro ao gerar cena', 500, String(e));
  }
});

export {};
