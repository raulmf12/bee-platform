// Helpers para as edge functions da estrutura de Campanhas (docs/PLANO-CAMPANHAS.md).
// Mesmo padrão das funções existentes (cadeia de modelos, retry em 503/429,
// JSON), centralizado aqui pra não copiar o boilerplate em cada função nova.

export const MODEL_CHAIN = [
  Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-pro',
];

export function svcHeaders(): HeadersInit {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
}

// GET no REST com service role. Devolve [] em erro (mesma semântica do projeto).
export async function fetchRest<T>(path: string): Promise<T> {
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1${path}`, { headers: svcHeaders() });
  if (!res.ok) { console.warn('[fetchRest]', path, res.status); return [] as unknown as T; }
  return await res.json();
}

export interface GeminiResult<T> { data: T; model_used: string; usage: { input?: number; output?: number } }

export function parseJsonLoose<T>(text: string): T {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  return JSON.parse(clean) as T;
}

export async function callGeminiJson<T>(
  apiKey: string, sys: string, usr: string,
  opts: { temperature?: number; maxOutputTokens?: number } = {},
): Promise<GeminiResult<T>> {
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
              generationConfig: {
                temperature: opts.temperature ?? 0.4,
                maxOutputTokens: opts.maxOutputTokens ?? 4000,
                responseMimeType: 'application/json',
              },
            }),
          },
        );
        if (!res.ok) {
          lastErr = `[${model}] HTTP ${res.status}`;
          if (res.status === 503 || res.status === 429) { await new Promise((r) => setTimeout(r, (attempt + 1) * 1500)); continue; }
          break;
        }
        const json = await res.json();
        const text = json.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
        if (!text || text.trim().length < 2) { lastErr = `[${model}] vazio`; continue; }
        try {
          return {
            data: parseJsonLoose<T>(text),
            model_used: model,
            usage: { input: json.usageMetadata?.promptTokenCount, output: json.usageMetadata?.candidatesTokenCount },
          };
        } catch {
          lastErr = `[${model}] JSON inválido`;
          continue;
        }
      } catch (e) {
        lastErr = `[${model}] ${(e as Error).message}`;
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }
  throw new Error(`Gemini falhou. Último: ${lastErr}`);
}
