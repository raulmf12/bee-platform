// Edge function: learn-from-feedback
//
// Recebe um feedback EXPLÍCITO do usuário sobre uma geração (ex: "está muito longo")
// e destila a LIÇÃO por trás dela. Diferente do learn-from-correction (que infere 
// a lição de um diff de texto), aqui o usuário está dizendo o que quer.
// A função transforma esse pedido em uma regra acionável e generalizável,
// e a insere/reforça na tabela ai_learnings.

import {
  errorResponse,
  getUserGeminiKey,
  jsonResponse,
  logUsage,
  preflight,
  userIdFromAuth,
  checkRateLimit,
} from '../_shared/security.ts';

const MODEL_CHAIN = [
  Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
];
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const DEDUP_THRESHOLD = 0.45;
const MAX_LEARNINGS_PER_USER = 40;

interface FeedbackRequest {
  post_id?: string;
  feedback_text: string;
  quote_original: string;
  caption_original: string;
  editorial_slug?: string;
  platform?: string;
  target_avatar?: string;
  facet_focus?: 'texto' | 'legenda' | 'ambos';
}

interface Learning {
  id: string;
  texto: string;
  categoria: string;
  facet: string;
  evidencias: number;
  editorial_slug?: string | null;
  platform?: string | null;
  target_avatar?: string | null;
}

interface Scope {
  editorial_slug: string | null;
  platform: string | null;
  target_avatar: string | null;
}

// Duas lições no mesmo alcance? (a faceta já é filtrada antes) — mesma
// semântica do commit-learning, pra o dedup ser consistente entre os writers.
function sameScope(a: Partial<Scope>, b: Scope): boolean {
  return (a.editorial_slug ?? null) === b.editorial_slug
    && (a.platform ?? null) === b.platform
    && (a.target_avatar ?? null) === b.target_avatar;
}

interface DistilledLearning {
  texto: string;
  categoria: string;
  facet: 'texto' | 'legenda';
}

function sbHeaders(extra: Record<string, string> = {}) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

function bigrams(s: string): Set<string> {
  const norm = s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const out = new Set<string>();
  for (let i = 0; i < norm.length - 1; i++) out.add(norm.slice(i, i + 2));
  return out;
}

function similarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

function buildSystemPrompt(): string {
  return [
    'Voce analisa FEEDBACKS DIRETOS de um humano sobre um post gerado por IA e destila a regra por tras.',
    '',
    'Contexto: a IA escreveu um post. O humano rejeitou ou pediu para corrigir, fornecendo um motivo escrito.',
    'Sua tarefa e entender o que esse feedback ensina sobre a voz dele e transformar em uma regra.',
    '',
    '=== O QUE FAZ UMA LICAO BOA ===',
    '- Ela e GENERALIZAVEL: vale pro proximo post, nao so pra este.',
    '  RUIM: "trocou a palavra planilha por relatorio"',
    '  BOA:  "prefere o termo concreto do dia a dia do cliente"',
    '- Ela e ACIONAVEL: diz o que fazer/evitar, em vez de descrever o erro.',
    '  RUIM: "o texto esta longo"',
    '  BOA:  "corta a segunda oracao quando a primeira ja fecha o sentido"',
    '- Ela e ESPECIFICA o bastante pra mudar um texto futuro.',
    '  RUIM: "escrever melhor"',
    '',
    '=== SAIDA ===',
    'JSON puro, sem markdown: { "learnings": [ { "texto": "...", "categoria": "...", "facet": "..." } ] }',
    '- No maximo 2 licoes. Prefira 1 boa a 2 fracas.',
    '- "texto": a regra, em 1 frase imperativa, em portugues. Max 120 chars.',
    '- "categoria": uma de voz | estrutura | lexico | tom | tamanho.',
    '- "facet": "texto" se a licao se aplica a FRASE DA IMAGEM, "legenda" se se aplica a CAPTION.',
  ].join('\n');
}

function buildUserPrompt(r: FeedbackRequest): string {
  const parts: string[] = [];
  parts.push('=== TEXTO ORIGINAL GERADO PELA IA ===');
  if (r.quote_original) parts.push(`Frase da imagem: "${r.quote_original}"`);
  if (r.caption_original) parts.push(`Legenda: "${r.caption_original}"`);
  parts.push('');
  parts.push('=== FEEDBACK DO HUMANO ===');
  parts.push(`"${r.feedback_text}"`);
  if (r.facet_focus && r.facet_focus !== 'ambos') {
    parts.push(`(O humano informou que este problema esta focado na: ${r.facet_focus})`);
  }
  parts.push('');
  parts.push('Transforme esse feedback em regra(s) acionável(is) para o prompt da IA. Devolva o JSON.');
  return parts.join('\n');
}

async function callGemini(
  apiKey: string,
  sys: string,
  usr: string,
): Promise<{ text: string; usage: { input?: number; output?: number }; model_used: string }> {
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
                temperature: 0.3,
                maxOutputTokens: 3000,
                responseMimeType: 'application/json',
              },
            }),
          },
        );
        if (!res.ok) {
          lastErr = `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`;
          continue;
        }
        const json = await res.json();
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        if (!text) { lastErr = 'resposta vazia'; continue; }
        return {
          text,
          usage: {
            input: json?.usageMetadata?.promptTokenCount,
            output: json?.usageMetadata?.candidatesTokenCount,
          },
          model_used: model,
        };
      } catch (e) {
        lastErr = (e as Error).message;
      }
    }
  }
  throw new Error(`Gemini falhou: ${lastErr}`);
}

function parseLearnings(raw: string): DistilledLearning[] {
  const cleaned = (raw ?? '').trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  if (!cleaned) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.error('[learn-from-feedback] JSON invalido do modelo (%s): %s', (e as Error).message, cleaned.slice(0, 200));
    return [];
  }
  const list = Array.isArray(parsed)
    ? parsed
    : (parsed as { learnings?: unknown })?.learnings;
  if (!Array.isArray(list)) return [];
  return list
    .filter((l) => typeof l?.texto === 'string' && l.texto.trim())
    .map((l) => ({
      texto: String(l.texto).trim().slice(0, 200),
      categoria: ['voz', 'estrutura', 'lexico', 'tom', 'tamanho'].includes(l?.categoria)
        ? l.categoria
        : 'voz',
      facet: (l?.facet === 'legenda' ? 'legenda' : 'texto') as 'texto' | 'legenda',
    }))
    .slice(0, 2);
}

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);

  try {
    const userId = userIdFromAuth(req);
    if (!userId) return errorResponse('Nao autenticado', 401);

    const rl = checkRateLimit(userId, 60_000, 30);
    if (!rl.ok) return errorResponse(`Rate limit. Tente em ${Math.ceil(rl.resetIn / 1000)}s`, 429);

    const body = (await req.json()) as FeedbackRequest;
    if (!body.feedback_text) return errorResponse('feedback_text obrigatorio', 400);

    const apiKey = await getUserGeminiKey(userId);
    if (!apiKey) return errorResponse('Chave Gemini nao configurada', 400);

    const { text, usage, model_used } = await callGemini(
      apiKey,
      buildSystemPrompt(),
      buildUserPrompt(body),
    );
    const distilled = parseLearnings(text);

    void logUsage({
      userId,
      provider: 'gemini',
      product: 'text',
      model: model_used,
      tokens_input: usage.input,
      tokens_output: usage.output,
      metadata: { fn: 'learn-from-feedback', post_id: body.post_id },
    });

    if (distilled.length === 0) {
      return jsonResponse({ success: true, learnings: [], skipped: 'nada generalizavel' });
    }

    const scope: Scope = {
      editorial_slug: body.editorial_slug || null,
      platform: body.platform || null,
      target_avatar: body.target_avatar || null,
    };

    const exRes = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_learnings?user_id=eq.${userId}` +
        `&select=id,texto,categoria,facet,evidencias,editorial_slug,platform,target_avatar`,
      { headers: sbHeaders() },
    );
    const existing = exRes.ok ? ((await exRes.json()) as Learning[]) : [];

    const out: Array<{ texto: string; categoria: string; facet: string; reforcou: boolean }> = [];

    for (const d of distilled) {
      // Dedup só dentro da MESMA faceta E do MESMO alcance — senão um feedback
      // com escopo reforçaria uma lição global (ou de outro escopo) por engano.
      const match = existing
        .filter((e) => e.facet === d.facet && sameScope(e, scope))
        .map((e) => ({ e, sim: similarity(e.texto, d.texto) }))
        .sort((a, b) => b.sim - a.sim)[0];

      if (match && match.sim >= DEDUP_THRESHOLD) {
        await fetch(`${SUPABASE_URL}/rest/v1/ai_learnings?id=eq.${match.e.id}`, {
          method: 'PATCH',
          headers: sbHeaders({ Prefer: 'return=minimal' }),
          body: JSON.stringify({
            evidencias: match.e.evidencias + 1,
            last_reforcada_em: new Date().toISOString(),
            ativo: true,
          }),
        });
        out.push({ texto: match.e.texto, categoria: match.e.categoria, facet: match.e.facet, reforcou: true });
        continue;
      }

      if (existing.length >= MAX_LEARNINGS_PER_USER) {
        console.warn(`[learn-from-feedback] teto de ${MAX_LEARNINGS_PER_USER} licoes atingido, ignorando nova`);
        continue;
      }

      const ins = await fetch(`${SUPABASE_URL}/rest/v1/ai_learnings`, {
        method: 'POST',
        headers: sbHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify({
          user_id: userId,
          texto: d.texto,
          categoria: d.categoria,
          facet: d.facet,
          evidencias: 1,
          ativo: true,
          exemplo_antes: (d.facet === 'legenda' ? body.caption_original : body.quote_original)?.slice(0, 400),
          exemplo_depois: `Feedback: ${body.feedback_text.slice(0, 300)}`,
          origem: 'conversa',
          editorial_slug: body.editorial_slug || null,
          platform: body.platform || null,
          target_avatar: body.target_avatar || null,
        }),
      });
      if (ins.ok) {
        const [row] = await ins.json();
        if (row) existing.push(row as Learning);
        out.push({ texto: d.texto, categoria: d.categoria, facet: d.facet, reforcou: false });
      } else {
        console.error('[learn-from-feedback] insert falhou:', (await ins.text()).slice(0, 200));
      }
    }

    return jsonResponse({ success: true, learnings: out });
  } catch (e) {
    console.error('[learn-from-feedback]', e);
    return errorResponse('Erro ao extrair licao do feedback', 500, (e as Error).message);
  }
});

