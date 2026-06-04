// Edge function: process-video
// Recebe { storage_path } com vídeo no bucket 'media'.
// 1. Baixa o vídeo do Storage (signed URL interno)
// 2. Upload pro Gemini Files API
// 3. Espera processar
// 4. Pede transcrição multimodal (texto + descrição visual)
// 5. Devolve { transcript, visual_summary, file_uri }

import {
  errorResponse,
  getUserGeminiKey,
  jsonResponse,
  logUsage,
  preflight,
  userIdFromAuth,
  checkRateLimit,
} from '../_shared/security.ts';

// Cadeia de fallback (na ordem de prioridade):
//   1. gemini-3.5-flash       (mais novo)
//   2. gemini-3.1-flash-lite  (fallback intermediario)
//   3. gemini-2.5-flash       (mais estavel)
const MODEL_CHAIN = [
  Deno.env.get('GEMINI_VIDEO_MODEL') ?? 'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
];
const MAX_RETRIES = 3;

interface ProcessInput {
  storage_path: string;
  mime_type?: string;
  // tipo de conteudo informado pelo user (orienta o prompt)
  content_type?: 'podcast' | 'talking_head' | 'vlog' | 'tutorial' | 'behind_scenes' | 'palestra' | 'reel_curto' | 'outro';
}

const CONTENT_TYPE_HINTS: Record<string, string> = {
  podcast: 'PODCAST: estudio com microfones, 1-2 pessoas conversando. O visual e secundario — foque na transcricao da fala. Visual_summary deve ser MUITO curto (ex: "podcast em estudio, 2 hosts").',
  talking_head: 'TALKING HEAD: pessoa falando direto pra camera. Foco total no audio. Visual_summary curto (ex: "talking head, fundo neutro").',
  vlog: 'VLOG: conteudo informal, cenas variadas. Visual pode reforcar a narrativa. Descreva ambientes e cenas.',
  tutorial: 'TUTORIAL: alguem explicando algo, possivelmente com screen share ou demonstracao. Mencione o que esta sendo mostrado.',
  behind_scenes: 'BASTIDOR: cenas espontaneas, processo, equipe trabalhando. Capture o que esta acontecendo.',
  palestra: 'PALESTRA / EVENTO: pessoa no palco, plateia. Mencione contexto e energia.',
  reel_curto: 'REEL: video curto, ritmo rapido, possivelmente com texto na tela. Descreva visualmente.',
  outro: 'Tipo nao especificado. Descreva o que ve de forma factual.',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function downloadFromStorage(path: string): Promise<{ buf: ArrayBuffer; mime: string }> {
  const url = `${SUPABASE_URL}/storage/v1/object/media/${path}`;
  const res = await fetch(url, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`storage download HTTP ${res.status}: ${await res.text()}`);
  const buf = await res.arrayBuffer();
  const mime = res.headers.get('content-type') ?? 'video/mp4';
  return { buf, mime };
}

// Upload simples (arquivos pequenos <20MB) — pra arquivos maiores usar resumable
async function geminiUploadSmall(apiKey: string, buf: ArrayBuffer, mime: string, displayName: string): Promise<{ uri: string; name: string }> {
  // Gemini Files API: 2-step pra upload simples
  // Step 1: iniciar
  const initRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(buf.byteLength),
      'X-Goog-Upload-Header-Content-Type': mime,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  });
  if (!initRes.ok) throw new Error(`upload init HTTP ${initRes.status}: ${await initRes.text()}`);
  const uploadUrl = initRes.headers.get('X-Goog-Upload-URL');
  if (!uploadUrl) throw new Error('upload URL nao recebido');

  // Step 2: upload + finalize
  const finRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(buf.byteLength),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: buf,
  });
  if (!finRes.ok) throw new Error(`upload final HTTP ${finRes.status}: ${await finRes.text()}`);
  const json = await finRes.json();
  return { uri: json.file.uri, name: json.file.name };
}

async function waitForFileActive(apiKey: string, fileName: string, maxWaitMs = 120000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`);
    if (res.ok) {
      const json = await res.json();
      if (json.state === 'ACTIVE') return;
      if (json.state === 'FAILED') throw new Error('file processing FAILED');
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('timeout esperando file ACTIVE');
}

async function callGeminiOnce(apiKey: string, fileUri: string, mime: string, model: string, contentType?: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const typeHint = contentType && CONTENT_TYPE_HINTS[contentType] ? `\n\nTIPO DE CONTEUDO INFORMADO: ${CONTENT_TYPE_HINTS[contentType]}` : '';

  const prompt = `Analise este video e devolva JSON estrito com 3 campos:
{
  "transcript": "Transcricao COMPLETA da fala em portugues brasileiro, sem timestamps. Preserve hesitacoes naturais.",
  "visual_summary": "Descricao FACTUAL do visual. NAO interprete sentimentos ou intencoes. NAO use frases tipo 'reforcando a busca por paz interior'. Apenas o que se ve: ambiente, quantas pessoas, o que estao fazendo, elementos visuais notaveis. Maximo 200 chars. Se for podcast ou talking head, seja MUITO curto (ex: 'podcast em estudio, 2 hosts').",
  "detected_content_type": "Identifique o formato: podcast | talking_head | vlog | tutorial | behind_scenes | palestra | reel_curto | outro"
}
${typeHint}

REGRA: visual_summary deve ser objetivo. Nao escreva floreios literarios. Se nao houver muito visual relevante (caso de podcast), reconheca isso em vez de inventar.

Saida em JSON puro, sem markdown.`;

  const body = {
    contents: [{
      role: 'user',
      parts: [
        { text: prompt },
        { fileData: { mimeType: mime, fileUri: fileUri } },
      ],
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8000,
      responseMimeType: 'application/json',
    },
  };

  return await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function transcribeVideo(apiKey: string, fileUri: string, mime: string, contentType?: string): Promise<{ transcript: string; visual_summary: string; detected_content_type: string; model_used: string }> {
  let lastErr = '';

  for (const model of MODEL_CHAIN) {
    console.log(`[transcribe] tentando modelo: ${model}`);
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await callGeminiOnce(apiKey, fileUri, mime, model, contentType);
        if (res.ok) {
          const json = await res.json();
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
          const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
          const parsed = JSON.parse(cleaned);
          console.log(`[transcribe] sucesso com ${model} (attempt ${attempt + 1})`);
          return {
            transcript: parsed.transcript ?? '',
            visual_summary: parsed.visual_summary ?? '',
            detected_content_type: parsed.detected_content_type ?? contentType ?? 'outro',
            model_used: model,
          };
        }
        const errText = (await res.text()).slice(0, 400);
        lastErr = `[${model}] HTTP ${res.status}: ${errText}`;
        console.warn(`[transcribe] ${lastErr}`);
        // 503/UNAVAILABLE / 429 → retry com backoff
        if (res.status === 503 || res.status === 429) {
          const wait = (attempt + 1) * 2500;
          console.log(`[transcribe] aguardando ${wait}ms antes de retry`);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        // 404 (modelo nao existe) ou outros: para retry e proximo modelo
        break;
      } catch (e) {
        lastErr = `[${model}] ${(e as Error).message}`;
        console.warn(`[transcribe] excecao: ${lastErr}`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    console.log(`[transcribe] modelo ${model} esgotou — tentando proximo da cadeia`);
  }
  throw new Error(`transcribe falhou em toda cadeia [${MODEL_CHAIN.join(', ')}]. Ultimo erro: ${lastErr}`);
}

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);

  try {
    const userId = userIdFromAuth(req);
    if (!userId) return errorResponse('Nao autenticado', 401);

    const rl = checkRateLimit(userId, 5 * 60_000, 10);
    if (!rl.ok) return errorResponse(`Rate limit. Tente em ${Math.ceil(rl.resetIn / 1000)}s`, 429);

    const input = (await req.json()) as ProcessInput;
    if (!input.storage_path) return errorResponse('storage_path obrigatorio', 400);

    const apiKey = await getUserGeminiKey(userId);
    if (!apiKey) return errorResponse('Chave Gemini nao configurada', 400);

    // 1. Download do Storage
    console.log('[process-video] downloading', input.storage_path);
    const { buf, mime } = await downloadFromStorage(input.storage_path);
    const sizeMB = buf.byteLength / 1024 / 1024;
    console.log('[process-video] downloaded', sizeMB.toFixed(1), 'MB');
    if (sizeMB > 200) return errorResponse(`Video muito grande (${sizeMB.toFixed(0)}MB). Limite 200MB.`, 413);

    // 2. Upload Gemini Files
    console.log('[process-video] uploading to Gemini Files');
    const file = await geminiUploadSmall(apiKey, buf, input.mime_type ?? mime, input.storage_path.split('/').pop() ?? 'video.mp4');

    // 3. Espera ACTIVE
    await waitForFileActive(apiKey, file.name);

    // 4. Transcribe
    console.log('[process-video] transcribing, content_type:', input.content_type ?? 'nao informado');
    const { transcript, visual_summary, detected_content_type, model_used } = await transcribeVideo(apiKey, file.uri, mime, input.content_type);

    // Log de uso
    logUsage({
      userId,
      provider: 'gemini',
      product: 'text',
      model: model_used,
      metadata: {
        type: 'video-transcription',
        size_mb: sizeMB,
        transcript_chars: transcript.length,
        storage_path: input.storage_path,
        model_chain: MODEL_CHAIN,
      },
    });

    return jsonResponse({
      success: true,
      transcript,
      visual_summary,
      detected_content_type,
      content_type: input.content_type ?? detected_content_type,
      file_uri: file.uri,
      file_name: file.name,
      size_mb: sizeMB,
      model_used,
    });
  } catch (e) {
    console.error('[process-video]', e);
    return errorResponse('Erro ao processar video', 500, String(e));
  }
});

export {};
