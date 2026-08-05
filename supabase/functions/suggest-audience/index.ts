// Edge function: suggest-audience
//
// A IA propõe o PÚBLICO-ALVO de um editorial a partir da descrição dele.
// Só PROPÕE — devolve o perfil pra o usuário revisar e salvar (a curadoria
// humana protege a voz). Não grava nada.

import {
  errorResponse, getUserGeminiKey, jsonResponse, preflight, userIdFromAuth, checkRateLimit,
} from '../_shared/security.ts';

const MODEL_CHAIN = [
  Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
];

interface EditorialInput {
  name?: string;
  description?: string;
  objetivo?: string;
  tom?: string;
}

function systemPrompt(): string {
  return [
    'Voce e estrategista de audiencia da Bee Consulting (consultoria sistemica de',
    'lideranca, do Marcos Piccini). A partir de um EDITORIAL (um pilar de conteudo),',
    'monte o PUBLICO-ALVO especifico daquele pilar: com quem ele fala.',
    '',
    'A Bee fala com lideres/gestores. O publico NAO e generico — e o recorte que',
    'ESTE editorial ataca. Seja concreto e especifico, na linguagem da Bee (olhar',
    'sistemico, nao mecanico; sem jargao de coach raso).',
    '',
    '=== SAIDA (JSON puro, sem markdown) ===',
    '{',
    '  "quem": "1-2 frases: quem e essa pessoa (cargo, momento, contexto)",',
    '  "dor": "a dor central que ESTE editorial toca",',
    '  "desejo": "o que ela quer de verdade (o resultado, nao a tarefa)",',
    '  "objecoes": ["2-4 resistencias/objecoes que ela tem"],',
    '  "gatilhos": ["3-5 gatilhos/temas que fazem ela parar o scroll"],',
    '  "linguagem": "como ela fala e o que valoriza ouvir (1-2 frases)"',
    '}',
    '- Tudo em portugues. Frases curtas e concretas. Nada de lugar-comum.',
  ].join('\n');
}

function userPrompt(e: EditorialInput): string {
  const parts = [`EDITORIAL: ${e.name ?? '(sem nome)'}`];
  if (e.description) parts.push(`Descricao/essencia: ${e.description}`);
  if (e.objetivo) parts.push(`Objetivo: ${e.objetivo}`);
  if (e.tom) parts.push(`Tom: ${e.tom}`);
  parts.push('\nMonte o publico-alvo deste editorial. Devolva o JSON.');
  return parts.join('\n');
}

async function callGemini(apiKey: string, sys: string, usr: string): Promise<string> {
  let lastErr = '';
  for (const model of MODEL_CHAIN) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: sys }] },
              contents: [{ role: 'user', parts: [{ text: usr }] }],
              generationConfig: { temperature: 0.6, maxOutputTokens: 4000, responseMimeType: 'application/json' },
            }),
          },
        );
        if (!res.ok) { lastErr = `HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`; continue; }
        const json = await res.json();
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        if (text) return text;
        lastErr = 'resposta vazia';
      } catch (e) { lastErr = (e as Error).message; }
    }
  }
  throw new Error(`Gemini falhou: ${lastErr}`);
}

function toArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean).slice(0, 6);
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  return [];
}

function closeTruncated(raw: string): string {
  const stack: string[] = [];
  let inStr = false, esc = false;
  for (const c of raw) {
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{' || c === '[') stack.push(c);
    else if (c === '}' || c === ']') stack.pop();
  }
  let out = raw;
  if (inStr) out += '"';
  out = out.replace(/[,:]\s*$/, '');
  while (stack.length) out += stack.pop() === '{' ? '}' : ']';
  return out;
}

function parse(raw: string) {
  const cleaned = (raw ?? '').trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  let p: Record<string, unknown>;
  try { p = JSON.parse(cleaned) as Record<string, unknown>; }
  catch { p = JSON.parse(closeTruncated(cleaned)) as Record<string, unknown>; }
  return {
    quem: String(p.quem ?? '').trim(),
    dor: String(p.dor ?? '').trim(),
    desejo: String(p.desejo ?? '').trim(),
    objecoes: toArr(p.objecoes),
    gatilhos: toArr(p.gatilhos),
    linguagem: String(p.linguagem ?? '').trim(),
  };
}

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);

  try {
    const userId = userIdFromAuth(req);
    if (!userId) return errorResponse('Nao autenticado', 401);

    const rl = checkRateLimit(userId, 60_000, 15);
    if (!rl.ok) return errorResponse(`Rate limit. Tente em ${Math.ceil(rl.resetIn / 1000)}s`, 429);

    const editorial = await req.json() as EditorialInput;
    if (!editorial?.name && !editorial?.description) {
      return errorResponse('Descreva o editorial primeiro (nome ou descricao)', 400);
    }

    const apiKey = await getUserGeminiKey(userId);
    if (!apiKey) return errorResponse('Chave Gemini nao configurada', 400);

    const raw = await callGemini(apiKey, systemPrompt(), userPrompt(editorial));
    let audience;
    try { audience = parse(raw); } catch { return errorResponse('A IA devolveu um formato invalido, tente de novo', 502); }

    return jsonResponse({ success: true, audience });
  } catch (e) {
    console.error('[suggest-audience]', e);
    return errorResponse('Erro ao sugerir o publico', 500, (e as Error).message);
  }
});
