// Edge function: post-chat — a IA COMPANHEIRA de brainstorm do post.
// Enxerga o título + legenda atuais e conversa com o usuário pra pensar juntos.
// Quando ela propõe um título ou legenda concretos, devolve também de forma
// estruturada (`suggestions`) pra UI oferecer um botão "Aplicar" no campo.
//
// Entrada: { messages: [{role, content}], post: { quote, caption,
//            editorial_slug?, platform?, target_avatar? } }
// Saída:   { success, reply, suggestions: [{ field, text, label }] }
//
// Mantém a voz da Bee via guardrails das Diretrizes (evitar/fortalecer/regra).

import {
  errorResponse,
  getUserGeminiKey,
  jsonResponse,
  logUsage,
  preflight,
  userIdFromAuth,
  internalUserId,
  checkRateLimit,
} from '../_shared/security.ts';

const MODEL_CHAIN = [
  Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-pro',
];

interface ChatMsg { role: 'user' | 'assistant'; content: string }
interface PostCtx {
  quote?: string; caption?: string;
  editorial_slug?: string; platform?: 'linkedin' | 'instagram'; target_avatar?: string;
}
interface BeeDirective { scope: string; tipo: string; titulo: string | null; instrucao: string }

// Recupera o texto de "reply" mesmo quando o JSON veio truncado/malformado
// (ex: a resposta estourou o limite de tokens no meio). Evita mostrar JSON cru.
function salvageReply(raw: string): string {
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  // "reply": "....." (com fechamento)
  const closed = cleaned.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (closed) { try { return JSON.parse(`"${closed[1]}"`); } catch { /* segue */ } }
  // "reply": "..... (SEM fechamento — truncado)
  const open = cleaned.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)$/);
  if (open) {
    let s = open[1].replace(/",?\s*"suggestions"[\s\S]*$/, '');
    try { return JSON.parse(`"${s}"`); } catch { return s.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\t/g, ' '); }
  }
  // Não parece JSON: devolve o texto limpo (mas nunca as chaves cruas).
  return cleaned.replace(/^\{[\s\S]*?"reply"\s*:\s*"?/, '').replace(/"[\s\S]*$/, '').trim() || cleaned;
}

function svcHeaders(): HeadersInit {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
}

async function fetchDirectives(platform: string, editorial: string): Promise<BeeDirective[]> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const url = `${supabaseUrl}/rest/v1/bee_directives?ativo=eq.true&tipo=in.(evitar,fortalecer,regra)` +
    `&select=scope,tipo,titulo,instrucao` +
    `&or=(scope.eq.universal,and(scope.eq.platform,scope_ref.eq.${platform}),and(scope.eq.editorial,scope_ref.eq.${editorial}))` +
    `&order=scope.asc,ordem.asc`;
  try {
    const res = await fetch(url, { headers: svcHeaders() });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

function voiceBlock(dirs: BeeDirective[]): string {
  if (!dirs.length) return '';
  const fmt = (d: BeeDirective) => `${d.titulo ? `${d.titulo}: ` : ''}${d.instrucao}`;
  const fort = dirs.filter((d) => d.tipo === 'fortalecer');
  const evi = dirs.filter((d) => d.tipo === 'evitar');
  const reg = dirs.filter((d) => d.tipo === 'regra');
  const out: string[] = ['GUARDRAILS DA VOZ DA BEE (respeite ao propor textos):'];
  reg.forEach((d) => out.push(`- ${fmt(d)}`));
  fort.forEach((d) => out.push(`- FORTALEÇA: ${fmt(d)}`));
  evi.forEach((d) => out.push(`- NÃO FAÇA: ${fmt(d)}`));
  return out.join('\n');
}

async function callGemini(apiKey: string, sys: string, messages: ChatMsg[]) {
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
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
              contents,
              generationConfig: { temperature: 0.8, maxOutputTokens: 4096, responseMimeType: 'application/json' },
            }),
          },
        );
        if (!res.ok) {
          lastErr = `[${model}] HTTP ${res.status}`;
          if (res.status === 503 || res.status === 429) { await new Promise((r) => setTimeout(r, (attempt + 1) * 1500)); continue; }
          break;
        }
        const json = await res.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        if (!text || text.trim().length < 2) { lastErr = `[${model}] vazio`; continue; }
        return { text, usage: { input: json.usageMetadata?.promptTokenCount, output: json.usageMetadata?.candidatesTokenCount }, model_used: model };
      } catch (e) {
        lastErr = `[${model}] ${(e as Error).message}`;
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }
  throw new Error(`Gemini falhou. Último: ${lastErr}`);
}

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);

  try {
    const userId = userIdFromAuth(req) ?? internalUserId(req);
    if (!userId) return errorResponse('Nao autenticado', 401);

    const rl = checkRateLimit(userId, 60_000, 40);
    if (!rl.ok) return errorResponse(`Rate limit. Tente em ${Math.ceil(rl.resetIn / 1000)}s`, 429);

    const { messages, post } = (await req.json()) as { messages?: ChatMsg[]; post?: PostCtx };
    if (!Array.isArray(messages) || messages.length === 0) return errorResponse('messages obrigatorio', 400);

    const apiKey = await getUserGeminiKey(userId);
    if (!apiKey) return errorResponse('Chave Gemini nao configurada', 400);

    const p = post ?? {};
    const platform = p.platform ?? 'linkedin';
    const dirs = await fetchDirectives(platform, p.editorial_slug ?? '');

    const sys = [
      'Você é a parceira criativa da Bee Consulting — pensa JUNTO com o usuário sobre UM post específico (título e legenda).',
      'Seu papel: trocar ideias, provocar ângulos, apontar o que pode ficar mais forte, sugerir analogias e ganchos. Colaborativa, direta e concisa — nada de textão.',
      'Fale com o olhar SISTÊMICO da Bee: tensione o óbvio, evite clichê corporativo. Nos textos que propuser: sem travessões (— ou -), sem emojis, sem ALL CAPS.',
      '',
      voiceBlock(dirs),
      '',
      'O POST ATUAL EM EDIÇÃO:',
      `- Plataforma: ${platform}${p.editorial_slug ? ` · Editoria: ${p.editorial_slug}` : ''}`,
      `- Título (frase da imagem): "${p.quote ?? '(vazio)'}"`,
      `- Legenda:\n${p.caption ?? '(vazia)'}`,
      '',
      'FORMATO DE RESPOSTA — devolva SEMPRE JSON puro (sem markdown):',
      '{',
      '  "reply": "<sua resposta de conversa, curta e útil>",',
      '  "suggestions": [ { "field": "titulo" | "legenda", "text": "<texto pronto pra aplicar>", "label": "<rótulo curto, ex: \'Gancho mais provocativo\'>" } ]',
      '}',
      'Mantenha o "reply" CURTO e direto (no máximo ~3 frases).',
      'REGRA CRÍTICA — quando o usuário pedir OPÇÕES / SUGESTÕES / VARIAÇÕES (ex: "me dá 3 opções", "sugira outra abertura", "muda só a primeira frase"): devolva CADA opção como um item de "suggestions". NUNCA descreva as opções apenas no texto do reply. Nesse caso o "reply" é só uma frase apresentando (ex: "Trouxe 3 versões, escolha:").',
      'Cada item de "suggestions" é o texto COMPLETO do campo (titulo OU legenda) já com a mudança aplicada e TODO O RESTO idêntico ao original. Ex: se pediram pra mudar só a 1ª frase da legenda, cada sugestão é a legenda inteira, mudando apenas a 1ª frase e mantendo o resto igual (inclusive as hashtags).',
      'Use "suggestions": [] apenas quando for conversa/ideia sem proposta concreta de texto. Nunca invente nomes reais de pessoas/empresas.',
    ].filter((l) => l !== undefined).join('\n');

    const recent = messages.slice(-12);
    const { text, usage, model_used } = await callGemini(apiKey, sys, recent);

    let parsed: { reply?: string; suggestions?: Array<{ field?: string; text?: string; label?: string }> };
    try {
      parsed = JSON.parse(text.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim());
    } catch {
      // JSON truncado/malformado: recupera só o reply, sem despejar as chaves.
      parsed = { reply: salvageReply(text), suggestions: [] };
    }

    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions
          .filter((s) => (s.field === 'titulo' || s.field === 'legenda') && String(s.text ?? '').trim())
          .map((s) => ({ field: s.field as 'titulo' | 'legenda', text: String(s.text).trim(), label: String(s.label ?? '').trim() || undefined }))
          .slice(0, 4)
      : [];

    logUsage({
      userId, provider: 'gemini', product: 'text', model: model_used,
      tokens_input: usage?.input, tokens_output: usage?.output,
      metadata: { fn: 'post-chat', platform, editorial: p.editorial_slug, suggestions: suggestions.length },
    });

    return jsonResponse({ success: true, reply: String(parsed.reply ?? '').trim() || '…', suggestions });
  } catch (e) {
    console.error('[post-chat]', e);
    return errorResponse('Erro no chat', 500, String(e));
  }
});

export {};
