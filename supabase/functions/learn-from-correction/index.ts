// Edge function: learn-from-correction
//
// Recebe uma correcao (ai_reviews) e destila a LICAO por tras dela: nao "o que
// mudou", mas a regra que a mudanca revela. "Cortou 'basicamente'" nao serve;
// "corta adverbios de enchimento" serve, porque vale pro proximo post.
//
// As licoes entram sozinhas no prompt da proxima geracao (ai_learnings.ativo).
// Isso NAO fere o principio de curadoria humana da metodologia: aqui a IA
// aprende de um ato humano deliberado — voce corrigindo. Diferente do
// mine-content, que destila de texto externo e por isso precisa da fila.
//
// DEDUP e o coracao disto. Sem ele, 30 correcoes viram 30 licoes quase-iguais
// e o prompt vira ruido — o oposto de aprender. Licao parecida com uma que ja
// existe REFORCA a existente (evidencias+1) em vez de criar outra.

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

// Calibrado medindo pares reais de licoes, nao no chute:
//   mesma licao com palavras diferentes .... ~0.60
//     ("Elimine adverbios de preenchimento como 'basicamente'..." vs
//      "Elimine adverbios redundantes como 'basicamente'...")
//   licoes de fato diferentes ............... <=0.29
//     ("Elimine adverbios..." vs "Comece a caption com o gancho...")
// A janela util e (0.29 .. 0.60]; 0.45 fica no meio. O primeiro valor que
// tentei, 0.72, ficava ACIMA do teto dos verdadeiros positivos: nada nunca
// deduplicava e cada correcao criava uma licao quase-igual.
const DEDUP_THRESHOLD = 0.45;
// O prompt de geracao so carrega as licoes mais fortes; guardar 500 e inutil.
const MAX_LEARNINGS_PER_USER = 40;

interface Review {
  id: string;
  user_id: string;
  quote_original: string;
  quote_final: string;
  caption_original: string;
  caption_final: string;
  quote_changed: boolean;
  caption_changed: boolean;
  changed: boolean;
}

interface Learning {
  id: string;
  texto: string;
  categoria: string;
  evidencias: number;
}

interface DistilledLearning {
  texto: string;
  categoria: string;
}

function sbHeaders(extra: Record<string, string> = {}) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// SIMILARIDADE — dedup sem depender de embeddings.
// Jaccard sobre bigramas de caracteres: pega parafrase ("corta adverbios" vs
// "cortar os adverbios") sem precisar de outra chamada de modelo.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// GEMINI
// ---------------------------------------------------------------------------
function buildSystemPrompt(): string {
  return [
    'Voce analisa CORRECOES editoriais e destila a regra por tras delas.',
    '',
    'Contexto: uma IA escreveu um post no estilo da Bee Consulting e um humano',
    'corrigiu. Sua tarefa e entender O QUE A CORRECAO ENSINA sobre a voz dele.',
    '',
    '=== O QUE FAZ UMA LICAO BOA ===',
    '- Ela e GENERALIZAVEL: vale pro proximo post, nao so pra este.',
    '  RUIM: "trocou a palavra planilha por relatorio"',
    '  BOA:  "prefere o termo concreto do dia a dia do cliente"',
    '- Ela e ACIONAVEL: diz o que fazer/evitar, nao descreve o diff.',
    '  RUIM: "o humano encurtou a frase"',
    '  BOA:  "corta a segunda oracao quando a primeira ja fecha o sentido"',
    '- Ela e ESPECIFICA o bastante pra mudar um texto futuro.',
    '  RUIM: "escrever melhor"',
    '',
    '=== QUANDO NAO HA LICAO ===',
    'Se a correcao foi so pontuacao, digitacao, ou preferencia irrepetivel,',
    'devolva um array VAZIO. Inventar regra de um ajuste cosmetico envenena',
    'as proximas geracoes — e pior que nao aprender nada.',
    '',
    '=== SAIDA ===',
    'JSON puro, sem markdown: { "learnings": [ { "texto": "...", "categoria": "..." } ] }',
    '- No maximo 2 licoes. Prefira 1 boa a 2 fracas. Zero e resposta valida.',
    '- "texto": a regra, em 1 frase imperativa, em portugues. Max 120 chars.',
    '- "categoria": uma de voz | estrutura | lexico | tom | tamanho.',
  ].join('\n');
}

function buildUserPrompt(r: Review): string {
  const parts: string[] = [];
  if (r.quote_changed) {
    parts.push('=== FRASE DA IMAGEM ===');
    parts.push(`A IA escreveu:\n${r.quote_original}`);
    parts.push(`O humano deixou:\n${r.quote_final}`);
    parts.push('');
  }
  if (r.caption_changed) {
    parts.push('=== CAPTION ===');
    parts.push(`A IA escreveu:\n${r.caption_original}`);
    parts.push(`O humano deixou:\n${r.caption_final}`);
    parts.push('');
  }
  parts.push('O que esta correcao ensina sobre a voz dele? Devolva o JSON.');
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
                // Baixa de proposito: aqui queremos analise consistente, nao
                // criatividade. A criatividade e do generate-content.
                temperature: 0.3,
                // Generoso apesar da saida ser curta: os modelos gemini 3.x
                // sao thinking models e os tokens de raciocinio saem DESTE
                // mesmo orcamento. Com 700 o modelo pensava e nao sobrava nada
                // pra resposta — o JSON chegava vazio/truncado.
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
  // "Nao consegui destilar" e um desfecho legitimo: aprender e o efeito
  // colateral de aprovar um post, e nunca deve derrubar a aprovacao. Zero
  // licoes > um 500.
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.error('[learn] JSON invalido do modelo (%s): %s', (e as Error).message, cleaned.slice(0, 200));
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
    }))
    .slice(0, 2);
}

// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);

  try {
    const userId = userIdFromAuth(req);
    if (!userId) return errorResponse('Nao autenticado', 401);

    const rl = checkRateLimit(userId, 60_000, 30);
    if (!rl.ok) return errorResponse(`Rate limit. Tente em ${Math.ceil(rl.resetIn / 1000)}s`, 429);

    const { review_id } = (await req.json()) as { review_id?: string };
    if (!review_id) return errorResponse('review_id obrigatorio', 400);

    const rRes = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_reviews?id=eq.${review_id}&select=*`,
      { headers: sbHeaders() },
    );
    const reviews = (await rRes.json()) as Review[];
    const review = reviews?.[0];
    if (!review) return errorResponse('Revisao nao encontrada', 404);
    // O JWT diz quem e; a linha diz de quem e. Sem esta checagem daria pra
    // aprender (e gastar a chave) em cima da correcao de outro usuario.
    if (review.user_id !== userId) return errorResponse('Revisao de outro usuario', 403);

    if (!review.changed) {
      return jsonResponse({ success: true, learnings: [], skipped: 'sem alteracao' });
    }

    const apiKey = await getUserGeminiKey(userId);
    if (!apiKey) return errorResponse('Chave Gemini nao configurada', 400);

    const { text, usage, model_used } = await callGemini(
      apiKey,
      buildSystemPrompt(),
      buildUserPrompt(review),
    );
    const distilled = parseLearnings(text);

    void logUsage({
      userId,
      provider: 'gemini',
      product: 'text',
      model: model_used,
      tokens_input: usage.input,
      tokens_output: usage.output,
      metadata: { fn: 'learn-from-correction', review_id },
    });

    if (distilled.length === 0) {
      return jsonResponse({ success: true, learnings: [], skipped: 'nada generalizavel' });
    }

    // Licoes que ja existem
    const exRes = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_learnings?user_id=eq.${userId}&select=id,texto,categoria,evidencias`,
      { headers: sbHeaders() },
    );
    const existing = (await exRes.json()) as Learning[];

    const out: Array<{ texto: string; categoria: string; reforcou: boolean }> = [];

    for (const d of distilled) {
      const match = existing
        .map((e) => ({ e, sim: similarity(e.texto, d.texto) }))
        .sort((a, b) => b.sim - a.sim)[0];

      if (match && match.sim >= DEDUP_THRESHOLD) {
        // Ja sabiamos disso: a correcao vira mais uma evidencia da mesma regra.
        // E o que faz uma licao repetida pesar mais em vez de poluir.
        await fetch(`${SUPABASE_URL}/rest/v1/ai_learnings?id=eq.${match.e.id}`, {
          method: 'PATCH',
          headers: sbHeaders({ Prefer: 'return=minimal' }),
          body: JSON.stringify({
            evidencias: match.e.evidencias + 1,
            last_reforcada_em: new Date().toISOString(),
            // Reforcar reativa: o padrao voltou a aparecer.
            ativo: true,
          }),
        });
        out.push({ texto: match.e.texto, categoria: match.e.categoria, reforcou: true });
        continue;
      }

      if (existing.length >= MAX_LEARNINGS_PER_USER) {
        console.warn(`[learn] teto de ${MAX_LEARNINGS_PER_USER} licoes atingido, ignorando nova`);
        continue;
      }

      const ins = await fetch(`${SUPABASE_URL}/rest/v1/ai_learnings`, {
        method: 'POST',
        headers: sbHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify({
          user_id: userId,
          texto: d.texto,
          categoria: d.categoria,
          evidencias: 1,
          ativo: true,
          exemplo_antes: (review.quote_changed ? review.quote_original : review.caption_original)?.slice(0, 400),
          exemplo_depois: (review.quote_changed ? review.quote_final : review.caption_final)?.slice(0, 400),
          origem_review_id: review.id,
        }),
      });
      if (ins.ok) {
        const [row] = await ins.json();
        if (row) existing.push(row as Learning);
        out.push({ texto: d.texto, categoria: d.categoria, reforcou: false });
      } else {
        console.error('[learn] insert falhou:', (await ins.text()).slice(0, 200));
      }
    }

    return jsonResponse({ success: true, learnings: out });
  } catch (e) {
    console.error('[learn-from-correction]', e);
    return errorResponse('Erro ao aprender com a correcao', 500, (e as Error).message);
  }
});
