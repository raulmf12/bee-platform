// Edge function: mine-content
// Recebe um texto (transcricao de corte, doc, post) e usa o Gemini pra
// DESTILAR candidatos a material da metodologia Bee:
//   - arsenal (casos, historias, frameworks, dados)
//   - example_post (frase de imagem + caption no estilo Bee)
//   - analogy (analogia da natureza)
// Cada candidato e taggeado ao editorial mais adequado e inserido em
// bee_suggestions como 'pending'. NADA entra no arsenal real aqui — a
// curadoria humana aprova depois. Portao de qualidade pra voz nao derivar.

import {
  errorResponse,
  getUserGeminiKey,
  jsonResponse,
  preflight,
  userIdFromAuth,
  checkRateLimit,
} from '../_shared/security.ts';

const MODEL_CHAIN = [
  Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
];
const MAX_RETRIES = 3;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface Input {
  text: string;
  source_type?: string;   // podcast_clip | document | post | manual
  source_id?: string;
  editorial_hint?: string;
  context?: string;
}

interface Editorial {
  slug: string;
  name: string;
  description: string | null;
  structure_template: string | null;
}

async function fetchEditorials(): Promise<Editorial[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/bee_editorials?select=slug,name,description,structure_template&is_active=eq.true&order=position.asc`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  if (!res.ok) return [];
  return await res.json();
}

function buildSystemPrompt(editorials: Editorial[]): string {
  const eds = editorials
    .map((e) => `- ${e.slug}: ${e.name} — ${e.description ?? ''}`)
    .join('\n');
  return [
    'Voce e um EDITOR da Bee Consulting (consultoria de lideranca do Marcos Piccini).',
    'Sua tarefa: ler um material bruto (transcricao/texto) e DESTILAR dele pepitas reutilizaveis',
    'pra metodologia editorial da Bee. Nao invente — extraia apenas o que esta no material.',
    '',
    'Tipos de pepita (kind):',
    '- "arsenal": um caso real, historia, framework, dado, ou observacao reutilizavel. Campos do payload: type (case|historia|framework|dado|insight), title, summary, details.',
    '- "example_post": uma frase de imagem forte (curta, com peso) que daria um post Bee, com uma caption curta. Payload: image_quote, caption, why_good.',
    '- "analogy": uma analogia (de preferencia da natureza/sistemas) presente ou inspirada no material. Payload: name, description, best_for.',
    '',
    'Editoriais disponiveis (escolha o slug que melhor encaixa cada pepita):',
    eds,
    '',
    'Regras:',
    '- So extraia o que tem qualidade de verdade. Prefira POUCAS pepitas excelentes a muitas medianas.',
    '- Maximo 6 pepitas no total.',
    '- Frases de imagem (example_post.image_quote): curtas, densas, sem cliche. Voz de quem lidera com profundidade.',
    '- Para cada pepita, inclua "source_excerpt": o trecho curto do material que a originou.',
    '- "confidence": 0..1, o quao forte/fiel a pepita e.',
    '- Saida em JSON PURO: { "suggestions": [ { "kind", "editorial_slug", "payload", "source_excerpt", "confidence" } ] }',
  ].join('\n');
}

async function callGeminiOnce(apiKey: string, sys: string, usr: string, model: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  return await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: 'user', parts: [{ text: usr }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 8000, responseMimeType: 'application/json' },
    }),
  });
}

async function callGemini(apiKey: string, sys: string, usr: string): Promise<string> {
  let lastErr = '';
  for (const model of MODEL_CHAIN) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await callGeminiOnce(apiKey, sys, usr, model);
        if (!res.ok) {
          lastErr = `[${model}] HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`;
          if (res.status === 503 || res.status === 429) {
            await new Promise((r) => setTimeout(r, (attempt + 1) * 2000));
            continue;
          }
          break;
        }
        const json = await res.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        if (text && text.trim().length > 10) return text;
        lastErr = `[${model}] resposta vazia`;
      } catch (e) {
        lastErr = `[${model}] ${(e as Error).message}`;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
  throw new Error(`Gemini falhou. Ultimo: ${lastErr}`);
}

interface Candidate {
  kind: string;
  editorial_slug?: string;
  payload?: Record<string, unknown>;
  source_excerpt?: string;
  confidence?: number;
}

// Insere 1 sugestao; trata 409 (dedup) como "skipped".
async function insertSuggestion(s: Candidate, input: Input, userId: string): Promise<'created' | 'skipped'> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/bee_suggestions`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      kind: s.kind,
      status: 'pending',
      editorial_slug: s.editorial_slug ?? null,
      payload: s.payload ?? {},
      source_type: input.source_type ?? 'manual',
      source_id: input.source_id ?? null,
      source_excerpt: s.source_excerpt ?? null,
      confidence: s.confidence ?? 0,
      created_by: userId,
    }),
  });
  if (res.status === 409) return 'skipped';
  if (!res.ok) {
    console.warn('[mine-content] insert falhou', res.status, (await res.text()).slice(0, 200));
    return 'skipped';
  }
  return 'created';
}

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);

  const userId = userIdFromAuth(req);
  if (!userId) return errorResponse('Nao autenticado', 401);

  const rl = checkRateLimit(userId, 60_000, 20);
  if (!rl.ok) return errorResponse('Muitas requisicoes, aguarde', 429);

  let input: Input;
  try {
    input = await req.json();
  } catch {
    return errorResponse('JSON invalido', 400);
  }
  if (!input.text || input.text.trim().length < 40) {
    return errorResponse('Texto muito curto pra minerar', 400);
  }

  const apiKey = await getUserGeminiKey(userId);
  if (!apiKey) return errorResponse('Gemini API key nao configurada', 400);

  try {
    const editorials = await fetchEditorials();
    const sys = buildSystemPrompt(editorials);
    const validSlugs = new Set(editorials.map((e) => e.slug));

    const usr = [
      input.editorial_hint ? `Dica de editorial (opcional): ${input.editorial_hint}` : '',
      input.context ? `Contexto: ${input.context}` : '',
      'Material bruto:',
      input.text.slice(0, 24000),
    ].filter(Boolean).join('\n\n');

    const raw = await callGemini(apiKey, sys, usr);

    let parsed: { suggestions?: Candidate[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return errorResponse('IA devolveu JSON invalido', 502, raw.slice(0, 300));
    }

    const candidates = (parsed.suggestions ?? [])
      .filter((c) => ['arsenal', 'example_post', 'analogy'].includes(c.kind))
      .map((c) => ({
        ...c,
        editorial_slug: c.editorial_slug && validSlugs.has(c.editorial_slug) ? c.editorial_slug : null,
      }));

    let created = 0;
    let skipped = 0;
    for (const c of candidates) {
      const r = await insertSuggestion(c as Candidate, input, userId);
      if (r === 'created') created += 1;
      else skipped += 1;
    }

    return jsonResponse({ success: true, created, skipped, total: candidates.length });
  } catch (e) {
    return errorResponse(`Falha ao minerar: ${(e as Error).message}`, 500);
  }
});
