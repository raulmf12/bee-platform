// Edge function: generate-content (versao Bee Editorial v2)
// Recebe { editorial_slug, arsenal_item_id?, target_avatar?, briefing? }.
// Constroi prompt em camadas:
//   1. Persona Bee
//   2. Avatar alvo (Identificado / Incomodado / Ambos)
//   3. Editorial + estrutura
//   4. Arsenal selecionado
//   5. Few-shot: 1-2 example_posts do mesmo editorial
//   6. Style rules (DO/DONT/GENERAL)
//   7. Glossario proprietario
//   8. Hashtags obrigatorias
//   9. RAG: top-K chunks relevantes
// Devolve { quote, caption, headline_type_used, analogy_used }

import {
  errorResponse,
  getUserGeminiKey,
  jsonResponse,
  logUsage,
  preflight,
  userIdFromAuth,
  checkRateLimit,
} from '../_shared/security.ts';
import { embedText } from '../_shared/embed.ts';

// Cadeia: Flash primeiro (sem thinking tokens que cortam saida), Pro como fallback.
// Mesmo padrao da generate-caption-from-video — comprovadamente mais estavel pra JSON.
const MODEL_CHAIN = [
  Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.1-pro-preview',
  'gemini-2.5-pro',
];
const MAX_RETRIES = 2;
const RAG_TOP_K = Number(Deno.env.get('RAG_TOP_K') ?? '8');
const RAG_THRESHOLD = Number(Deno.env.get('RAG_THRESHOLD') ?? '0.25');

interface GenerateInput {
  editorial_slug: string;
  arsenal_item_id?: string;
  target_avatar?: 'identificado' | 'incomodado' | 'ambos';
  briefing?: string;
  quote_max_chars?: number;
  // Adaptar de post existente — IA usa quote+caption do referenciado como base
  reference_post_id?: string;
  target_platform?: 'linkedin' | 'instagram';
}

interface GenerateOutput {
  quote: string;
  caption: string;
  headline_type_used?: string;
  analogy_used?: string;
}

function svcHeaders(): HeadersInit {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
}

async function fetchRest<T>(path: string): Promise<T> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const res = await fetch(`${supabaseUrl}/rest/v1${path}`, { headers: svcHeaders() });
  if (!res.ok) {
    console.warn('[fetchRest fail]', path, res.status);
    return [] as unknown as T;
  }
  return await res.json();
}

interface BeeEditorial { slug: string; name: string; description: string; frequency_hint: string; structure_template: string; emotional_sequence: string[] }
interface BeeArsenal { id?: string; title: string; summary: string; details: string | null; type: string }
interface BeeAvatar { slug: string; name: string; state: string; dor: string; gatilhos: string[]; example_phrases: string[] }
interface BeeExamplePost { id?: string; editorial_slug: string; image_quote: string; caption: string; why_good: string; headline_type: string; analogy: string }
interface BeeGlossaryTerm { term: string; meaning: string; usage_note: string; must_appear: boolean }
interface BeeStyleRule { rule: string; rationale: string }
interface BeeHeadlineType { name: string; description: string; examples: string[] }
interface BeeAnalogy { name: string; description: string; best_for: string }
interface BeeHashtag { tag: string; required: boolean; topic: string | null }

interface ReferencePost {
  id: string;
  platform: string;
  format: string;
  title: string | null;
  caption: string | null;
  carousel_text: { quote?: string; caption?: string; headline_type?: string; analogy?: string } | null;
}

async function fetchReferencePost(id: string): Promise<ReferencePost | null> {
  const rows = await fetchRest<ReferencePost[]>(
    `/user_posts?id=eq.${id}&select=id,platform,format,title,caption,carousel_text&limit=1`,
  );
  return rows[0] ?? null;
}

async function loadBeeContext(input: GenerateInput) {
  const avatarFilter = input.target_avatar && input.target_avatar !== 'ambos'
    ? `&slug=eq.${input.target_avatar}`
    : '';

  const [
    editorial,
    arsenalItem,
    avatars,
    examples,
    glossary,
    doRules,
    dontRules,
    generalRules,
    headlineTypes,
    analogiesNew,
    analogiesUsed,
    hashtags,
    almaObjetivo,
    almaDimensoes,
    almaPulsoes,
    almaCrencas,
  ] = await Promise.all([
    fetchRest<BeeEditorial[]>(`/bee_editorials?slug=eq.${input.editorial_slug}&limit=1`),
    input.arsenal_item_id
      ? fetchRest<BeeArsenal[]>(`/bee_arsenal?id=eq.${input.arsenal_item_id}&limit=1`)
      // Sem item escolhido: ROTACIONA — pega o item ativo menos usado / mais antigo
      // (metodologia viva: a cada geracao varia o material e evita repetir).
      : fetchRest<BeeArsenal[]>(`/bee_arsenal?editorial_slug=eq.${input.editorial_slug}&is_active=eq.true&order=last_used_at.asc.nullsfirst,usage_count.asc&limit=1`),
    fetchRest<BeeAvatar[]>(`/bee_avatars?order=position.asc${avatarFilter}`),
    // Few-shot tambem rotaciona por frescor (exemplos ativos menos usados primeiro).
    fetchRest<BeeExamplePost[]>(`/bee_example_posts?editorial_slug=eq.${input.editorial_slug}&is_active=eq.true&order=last_used_at.asc.nullsfirst,position.asc&limit=2`),
    fetchRest<BeeGlossaryTerm[]>(`/bee_glossary?select=term,meaning,usage_note,must_appear`),
    fetchRest<BeeStyleRule[]>(`/bee_style_rules?category=eq.do&order=position.asc`),
    fetchRest<BeeStyleRule[]>(`/bee_style_rules?category=eq.dont&order=position.asc`),
    fetchRest<BeeStyleRule[]>(`/bee_style_rules?category=eq.general&order=position.asc`),
    fetchRest<BeeHeadlineType[]>(`/bee_headline_types?order=position.asc`),
    fetchRest<BeeAnalogy[]>(`/bee_analogies?used=eq.false`),
    fetchRest<BeeAnalogy[]>(`/bee_analogies?used=eq.true`),
    fetchRest<BeeHashtag[]>(`/bee_hashtags?order=position.asc`),
    // ALMA — camada 0 (o principio vivo que guia tudo)
    fetchRest<{ texto: string }[]>(`/alma_objetivo?is_current=eq.true&select=texto&limit=1`),
    fetchRest<{ nome: string; oitava: number; frase_sistemica: string; natureza: string }[]>(`/alma_dimensoes?select=nome,oitava,frase_sistemica,natureza&order=ordem.asc`),
    fetchRest<{ nome: string; intensidade: number }[]>(`/alma_pulsoes?select=nome,intensidade&order=intensidade.desc&limit=3`),
    fetchRest<{ texto: string }[]>(`/alma_crencas?direcao=eq.sistemico&select=texto&order=forca.desc&limit=4`),
  ]);

  return {
    editorial: editorial[0],
    arsenalItem: arsenalItem[0],
    avatars,
    examples,
    glossary,
    doRules, dontRules, generalRules,
    headlineTypes,
    analogiesNew, analogiesUsed,
    hashtags,
    alma: {
      objetivo: almaObjetivo[0]?.texto ?? '',
      dimensoes: almaDimensoes,
      pulsoes: almaPulsoes,
      crencas: almaCrencas,
    },
  };
}

// Emite um evento pro barramento da Alma (fire-and-forget, service role).
async function emitAlmaEvent(evt: {
  tipo: string; descricao: string; source?: string;
  dimensao_slug?: string | null; delta?: number | null; payload?: object;
}): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  try {
    await fetch(`${supabaseUrl}/rest/v1/alma_eventos`, {
      method: 'POST',
      headers: { ...svcHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        tipo: evt.tipo,
        descricao: evt.descricao,
        source: evt.source ?? 'generate-content',
        dimensao_slug: evt.dimensao_slug ?? null,
        delta: evt.delta ?? null,
        payload: evt.payload ?? {},
      }),
    });
  } catch { /* noop */ }
}

// Incrementa uso do material consumido na geracao (via RPC SQL).
async function bumpUsage(arsenalId: string | undefined, exampleIds: (string | undefined)[]): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const calls: Promise<unknown>[] = [];
  const rpc = (fn: string, body: object) =>
    fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: svcHeaders(),
      body: JSON.stringify(body),
    }).catch(() => undefined);
  if (arsenalId) calls.push(rpc('bump_arsenal_usage', { p_id: arsenalId }));
  for (const id of exampleIds) if (id) calls.push(rpc('bump_example_usage', { p_id: id }));
  try { await Promise.all(calls); } catch { /* noop */ }
}

async function retrieveContext(apiKey: string, query: string, userId: string): Promise<string> {
  if (!query || query.length < 5) return '';
  try {
    const queryEmbedding = await embedText(apiKey, query, 'RETRIEVAL_QUERY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/match_knowledge`, {
      method: 'POST',
      headers: svcHeaders(),
      body: JSON.stringify({
        query_embedding: queryEmbedding,
        match_count: RAG_TOP_K,
        match_threshold: RAG_THRESHOLD,
        filter_user_id: userId,
      }),
    });
    if (!res.ok) {
      console.warn('[rag] match failed', await res.text());
      return '';
    }
    const results = (await res.json()) as Array<{ content: string; similarity: number; document_title: string }>;
    if (!results.length) return '';
    return results
      .map((r, i) => `[Trecho ${i + 1} | fonte: ${r.document_title} | sim: ${r.similarity.toFixed(2)}]\n${r.content}`)
      .join('\n\n---\n\n');
  } catch (e) {
    console.warn('[rag] error', e);
    return '';
  }
}

function buildSystemPrompt(
  ctx: Awaited<ReturnType<typeof loadBeeContext>>,
  ragContext: string,
  input: GenerateInput,
  referencePost: ReferencePost | null,
): string {
  const ed = ctx.editorial;
  const ai = ctx.arsenalItem;
  const lines: string[] = [];

  // CAMADA 0 — A ALMA (o principio vivo que guia TUDO abaixo)
  const alma = ctx.alma;
  if (alma) {
    lines.push('=== CAMADA 0 — A ALMA (o principio vivo que guia tudo) ===');
    if (alma.objetivo) lines.push(`Objetivo vivo da Bee: ${alma.objetivo}`);
    lines.push('A Alma e AMORAL: nao escreve por "certo x errado" — mostra a consequencia de cada olhar. Considera possibilidades, nao pensa em binario.');
    if (alma.dimensoes?.length) {
      lines.push('As 6 Dimensoes agora (0=mecanico, 100=sistemico) — escreva SEMPRE do olhar sistemico, com atencao redobrada onde a oitava esta mais baixa:');
      for (const d of alma.dimensoes) {
        lines.push(`  • ${d.nome} (${d.oitava}): "${d.frase_sistemica}"`);
      }
    }
    if (alma.crencas?.length) {
      lines.push('Crencas vivas a sustentar: ' + alma.crencas.map((c) => `"${c.texto}"`).join(' · '));
    }
    if (alma.pulsoes?.length) {
      lines.push('Pulsoes ativas (a energia do conteudo): ' + alma.pulsoes.map((p) => p.nome).join(' · '));
    }
    lines.push('');
  }

  // PERSONA
  lines.push('Voce e Marcos Piccini, escrevendo para a Bee Academy.');
  lines.push('Persona: alguem que viu de dentro. Viveu o colapso antes de nomea-lo.');
  lines.push('Passou pela propria travessia antes de convidar outros. Nao tem respostas prontas.');
  lines.push('Tem perguntas que ninguem esta fazendo. Voz com autoridade que vem de 20 anos');
  lines.push('de cases reais e dois livros escritos. Fala de dentro do sistema, nao de cima dele.');
  lines.push('');

  // AVATAR ALVO
  if (ctx.avatars.length) {
    if (ctx.avatars.length === 1) {
      const av = ctx.avatars[0];
      lines.push(`=== AVATAR ALVO: ${av.name} ===`);
      lines.push(`Estado: ${av.state}`);
      lines.push(`Dor: ${av.dor}`);
      lines.push(`Gatilhos a usar: ${av.gatilhos?.join(', ')}`);
      if (av.example_phrases?.length) {
        lines.push(`Tom esperado (exemplos):`);
        av.example_phrases.slice(0, 2).forEach((p) => lines.push(`  • "${p}"`));
      }
      lines.push('');
    } else {
      lines.push('=== AVATARES BEE (gere para ambos, mas o post deve ressoar nos dois) ===');
      ctx.avatars.forEach((av) => {
        lines.push(`- ${av.name}: ${av.state}`);
      });
      lines.push('');
    }
  }

  // EDITORIAL
  if (ed) {
    lines.push(`=== EDITORIAL ESCOLHIDO: ${ed.name} ===`);
    lines.push(ed.description);
    lines.push(`Estrutura obrigatoria: ${ed.structure_template}`);
    if (ed.emotional_sequence?.length) lines.push(`Sequencia emocional: ${ed.emotional_sequence.join(' → ')}`);
    lines.push('');
  }

  // POST DE REFERENCIA (adaptacao cross-platform)
  if (referencePost) {
    const origPlatform = referencePost.platform === 'instagram' ? 'Instagram' : 'LinkedIn';
    const destPlatform = input.target_platform === 'instagram' ? 'Instagram' : 'LinkedIn';
    lines.push(`=== POST DE REFERENCIA — ADAPTAR ===`);
    lines.push(`Este e um post ja publicado em ${origPlatform}. Voce esta adaptando pra ${destPlatform}.`);
    lines.push(`Mantenha a ESSENCIA (a mesma virada sistemica, a mesma analogia se couber), mas:`);
    lines.push(`- Adapte o tom e ritmo pra o feed do ${destPlatform}`);
    lines.push(`- NAO copie literalmente. Reescreva.`);
    lines.push(`- Considere o avatar e editorial que o user escolheu pra esta nova versao.`);
    lines.push('');
    lines.push(`Quote original: "${referencePost.carousel_text?.quote ?? '(sem quote)'}"`);
    if (referencePost.carousel_text?.headline_type) {
      lines.push(`Tipo de titulo original: ${referencePost.carousel_text.headline_type}`);
    }
    if (referencePost.carousel_text?.analogy) {
      lines.push(`Analogia usada: ${referencePost.carousel_text.analogy}`);
    }
    lines.push('');
    lines.push(`Caption original:\n${referencePost.caption ?? '(sem caption)'}`);
    lines.push('=== FIM REFERENCIA ===');
    lines.push('');
  }

  // ARSENAL
  if (ai) {
    lines.push(`=== MATERIAL DO ARSENAL (use como ponto de partida) ===`);
    lines.push(`Tipo: ${ai.type}`);
    lines.push(`Titulo: ${ai.title}`);
    if (ai.summary) lines.push(`Resumo: ${ai.summary}`);
    if (ai.details) lines.push(`Detalhes:\n${ai.details}`);
    lines.push('');
  }

  // FEW-SHOT EXAMPLES (poderosissimo)
  if (ctx.examples.length) {
    lines.push(`=== EXEMPLOS DE POSTS REAIS BEE NESTE EDITORIAL (siga o estilo, NAO copie) ===`);
    ctx.examples.forEach((ex, i) => {
      lines.push(`\n--- Exemplo ${i + 1} ---`);
      lines.push(`Frase da imagem: "${ex.image_quote}"`);
      lines.push(`Caption:`);
      lines.push(ex.caption);
      if (ex.why_good) lines.push(`Por que funciona: ${ex.why_good}`);
    });
    lines.push('');
  }

  // ESTILO DO / DONT / GENERAL
  if (ctx.doRules.length) {
    lines.push('=== O QUE A VOZ FAZ ===');
    ctx.doRules.forEach((r) => lines.push(`• ${r.rule}`));
    lines.push('');
  }
  if (ctx.dontRules.length) {
    lines.push('=== O QUE A VOZ NAO FAZ (REGRAS DURAS) ===');
    ctx.dontRules.forEach((r) => lines.push(`• ${r.rule}`));
    lines.push('');
  }
  if (ctx.generalRules.length) {
    lines.push('=== REGRAS GERAIS ===');
    ctx.generalRules.forEach((r) => lines.push(`• ${r.rule}`));
    lines.push('');
  }

  // HEADLINE TYPES
  if (ctx.headlineTypes.length) {
    lines.push('=== 4 TIPOS DE TITULO (escolha 1 para a frase da imagem) ===');
    ctx.headlineTypes.forEach((h) => {
      lines.push(`• ${h.name}: ${h.description}`);
      if (h.examples?.[0]) lines.push(`  Ex: "${h.examples[0]}"`);
    });
    lines.push('');
  }

  // GLOSSARIO
  const mustTerms = ctx.glossary.filter((g) => g.must_appear);
  if (mustTerms.length) {
    lines.push('=== TERMOS QUE DEVEM APARECER NO POST ===');
    mustTerms.forEach((t) => lines.push(`• ${t.term} — ${t.usage_note ?? t.meaning}`));
    lines.push('');
  }
  if (ctx.glossary.length) {
    lines.push('=== VOCABULARIO PROPRIETARIO (use quando fizer sentido) ===');
    ctx.glossary.forEach((g) => lines.push(`• ${g.term}: ${g.meaning}`));
    lines.push('');
  }

  // ANALOGIAS
  if (ctx.analogiesNew.length || ctx.analogiesUsed.length) {
    lines.push('=== BANCO DE ANALOGIAS (SO NATUREZA/BIOLOGIA — NUNCA TECNOLOGIA/FINANCAS) ===');
    if (ctx.analogiesNew.length) {
      lines.push('Ainda nao usadas (prefira estas se couber):');
      ctx.analogiesNew.forEach((a) => lines.push(`• ${a.name} — ${a.description}${a.best_for ? ` [bom pra: ${a.best_for}]` : ''}`));
    }
    if (ctx.analogiesUsed.length) {
      lines.push('Ja usadas (so se for muito apropriado):');
      ctx.analogiesUsed.forEach((a) => lines.push(`• ${a.name} — ${a.description}`));
    }
    lines.push('');
  }

  // HASHTAGS OBRIGATORIAS
  const requiredHashtags = ctx.hashtags.filter((h) => h.required).map((h) => h.tag);
  if (requiredHashtags.length) {
    lines.push('=== HASHTAGS OBRIGATORIAS (incluir no FIM da caption, separadas por espaco) ===');
    lines.push(requiredHashtags.join(' '));
    lines.push('');
  }
  const optionalHashtags = ctx.hashtags.filter((h) => !h.required).slice(0, 8);
  if (optionalHashtags.length) {
    lines.push('=== HASHTAGS ADICIONAIS (escolha 1-3 mais relevantes ao tema) ===');
    optionalHashtags.forEach((h) => lines.push(`• ${h.tag}${h.topic ? ` [${h.topic}]` : ''}`));
    lines.push('');
  }

  // RAG
  if (ragContext) {
    lines.push('=== BASE DE CONHECIMENTO BEE (trechos relevantes ao tema) ===');
    lines.push(ragContext);
    lines.push('=== FIM DA BASE ===');
    lines.push('');
  }

  // REGRAS DE SAIDA
  lines.push('=== REGRAS DE SAIDA ===');
  lines.push(`- "quote": frase da imagem. MAXIMO ${input.quote_max_chars ?? 200} chars. Use 1 dos 4 tipos de titulo. Sem emojis, sem hashtags.`);
  lines.push('- "caption": MAXIMO 4 PARAGRAFOS CURTOS (2-4 frases cada). Densidade > extensao.');
  lines.push('  Estrutura: P1 gancho (primeiros 49 chars cabem na "ver mais") · P2 aprofundamento · P3 virada sistemica com analogia · P4 fechamento "Ve?" ou pergunta de implicacao.');
  lines.push('  Hashtags obrigatorias DEPOIS dos 4 paragrafos, em linha unica separada por espaco.');
  lines.push('- Frases curtas. Cada uma com peso. Sem rodeios.');
  lines.push('- "headline_type_used": slug (contradicao-direta, diagnostico-imperativo, pergunta-que-implica, metafora-que-nomeia).');
  lines.push('- "analogy_used": nome da analogia (ou null).');
  lines.push('- Saida em JSON puro, SEM markdown.');

  return lines.join('\n');
}

function buildUserPrompt(input: GenerateInput, arsenalItem?: { title: string; summary: string }): string {
  const parts: string[] = [];
  if (arsenalItem) {
    parts.push(`Gere um post a partir do material do arsenal: "${arsenalItem.title}" — ${arsenalItem.summary}`);
  }
  if (input.briefing) {
    parts.push(`Contexto adicional / briefing:\n${input.briefing}`);
  }
  if (parts.length === 0) {
    parts.push('Gere um post seguindo a estrutura do editorial escolhido, usando o material do RAG e os exemplos few-shot como fonte primaria.');
  }
  parts.push('\nDevolva o JSON conforme as regras de saida.');
  return parts.join('\n\n');
}

async function callGeminiOnce(apiKey: string, sys: string, usr: string, model: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  return await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: 'user', parts: [{ text: usr }] }],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 4000,
        responseMimeType: 'application/json',
      },
    }),
  });
}

async function callGemini(
  apiKey: string,
  sys: string,
  usr: string,
): Promise<{ text: string; usage: { input?: number; output?: number }; model_used: string }> {
  let lastErr = '';
  for (const model of MODEL_CHAIN) {
    console.log(`[generate-content] tentando modelo: ${model}`);
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await callGeminiOnce(apiKey, sys, usr, model);
        if (!res.ok) {
          const errText = (await res.text()).slice(0, 400);
          lastErr = `[${model}] HTTP ${res.status}: ${errText}`;
          console.warn(`[generate-content] ${lastErr}`);
          if (res.status === 503 || res.status === 429) {
            await new Promise((r) => setTimeout(r, (attempt + 1) * 2000));
            continue;
          }
          break;
        }
        const json = await res.json();
        const candidate = json.candidates?.[0];
        const finishReason = candidate?.finishReason;
        const text = candidate?.content?.parts?.[0]?.text ?? '';
        console.log(
          `[generate-content] ${model} attempt ${attempt + 1} → finishReason=${finishReason} text_len=${text.length}`,
        );
        if (!text || text.trim().length < 20) {
          lastErr = `[${model}] resposta vazia/curta. finishReason=${finishReason}`;
          if (finishReason === 'MAX_TOKENS') break;
          await new Promise((r) => setTimeout(r, (attempt + 1) * 1500));
          continue;
        }
        return {
          text,
          usage: {
            input: json.usageMetadata?.promptTokenCount,
            output: json.usageMetadata?.candidatesTokenCount,
          },
          model_used: model,
        };
      } catch (e) {
        lastErr = `[${model}] ${(e as Error).message}`;
        console.warn(`[generate-content] excecao: ${lastErr}`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
  throw new Error(`Gemini falhou em toda cadeia. Ultimo: ${lastErr}`);
}

// Recupera JSON cortado no meio (geralmente caption longa que estourou tokens).
// Estrategia: fecha string aberta + objeto aberto.
function tryRecoverTruncatedJson(raw: string): string {
  if (raw.trimEnd().endsWith('}')) return raw;
  let escaped = false;
  let inString = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\') { escaped = true; continue; }
    if (c === '"') inString = !inString;
  }
  if (inString) return raw + '"}';
  return raw + '}';
}

function parseGeminiJson(raw: string): GenerateOutput {
  const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  let parsed: { quote?: string; caption?: string; headline_type_used?: string; analogy_used?: string };
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.warn('[generate-content] JSON.parse falhou, tentando recovery:', (e as Error).message);
    const recovered = tryRecoverTruncatedJson(cleaned);
    parsed = JSON.parse(recovered);
    console.log('[generate-content] JSON recuperado (caption pode estar parcial)');
  }
  if (typeof parsed.quote !== 'string' || typeof parsed.caption !== 'string') {
    throw new Error('JSON invalido (faltam quote/caption)');
  }
  return {
    quote: parsed.quote.trim(),
    caption: parsed.caption.trim(),
    headline_type_used: parsed.headline_type_used,
    analogy_used: parsed.analogy_used,
  };
}

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);

  try {
    const userId = userIdFromAuth(req);
    if (!userId) return errorResponse('Nao autenticado', 401);

    const rl = checkRateLimit(userId, 60_000, 20);
    if (!rl.ok) return errorResponse(`Rate limit. Tente em ${Math.ceil(rl.resetIn / 1000)}s`, 429);

    const input = (await req.json()) as GenerateInput;
    if (!input.editorial_slug) return errorResponse('editorial_slug obrigatorio', 400);

    const apiKey = await getUserGeminiKey(userId);
    if (!apiKey) return errorResponse('Chave Gemini nao configurada', 400);

    const ctx = await loadBeeContext(input);
    if (!ctx.editorial) return errorResponse(`Editorial '${input.editorial_slug}' nao encontrado`, 400);

    // Carrega post de referencia se vier (adaptacao cross-platform)
    const referencePost = input.reference_post_id ? await fetchReferencePost(input.reference_post_id) : null;

    const ragQuery = [
      ctx.editorial.name,
      ctx.arsenalItem?.title,
      ctx.arsenalItem?.summary,
      ctx.avatars[0]?.dor,
      input.briefing,
      referencePost?.carousel_text?.quote,
    ].filter(Boolean).join(' . ');
    const ragContext = await retrieveContext(apiKey, ragQuery, userId);

    const sys = buildSystemPrompt(ctx, ragContext, input, referencePost);
    const usr = buildUserPrompt(input, ctx.arsenalItem);

    const { text, usage, model_used } = await callGemini(apiKey, sys, usr);
    const parsed = parseGeminiJson(text);

    // Metodologia viva: marca o material usado (incrementa uso + last_used_at)
    // pra rotacionar nas proximas geracoes. Fire-and-forget — nao trava a resposta.
    void bumpUsage(ctx.arsenalItem?.id, (ctx.examples as BeeExamplePost[]).map((e) => e.id));

    // Barramento da Alma: a geracao alimenta a psique (fire-and-forget).
    void emitAlmaEvent({
      tipo: 'post_gerado',
      descricao: `A Alma gerou um "${ctx.editorial.name}"`,
      source: 'generate-content',
    });

    logUsage({
      userId,
      provider: 'gemini',
      product: 'text',
      model: model_used,
      tokens_input: usage?.input,
      tokens_output: usage?.output,
      metadata: {
        editorial: input.editorial_slug,
        arsenal_item_id: input.arsenal_item_id,
        target_avatar: input.target_avatar,
        target_platform: input.target_platform,
        reference_post_id: input.reference_post_id,
        rag_chars: ragContext.length,
        examples_used: ctx.examples.length,
        prompt_chars: sys.length,
      },
    });

    return jsonResponse({ success: true, ...parsed });
  } catch (e) {
    console.error('[generate-content]', e);
    return errorResponse('Erro ao gerar conteudo', 500, String(e));
  }
});

export {};
