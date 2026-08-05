// Edge function: voice-coach
//
// O agente de voz. Você conversa pra corrigir os erros de geração, e ele destila
// regras — mas só PROPÕE; nada vira lição sem você confirmar (commit-learning).
//
// O que o torna útil e não um chatbot genérico: ele enxerga seus DADOS REAIS —
// as correções recentes (o que a IA escreveu × o que você deixou), a precisão
// por segmento e faceta, e as lições já ativas. Aí ele conversa em cima do
// padrão real, não de achismo.
//
// Devolve: uma resposta conversacional + uma lista de lições PROPOSTAS, cada uma
// com faceta e alcance (global ou um conjunto). A UI mostra Salvar/Descartar.

import {
  errorResponse, getUserGeminiKey, jsonResponse, preflight, userIdFromAuth, checkRateLimit,
} from '../_shared/security.ts';

const MODEL_CHAIN = [
  Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
];
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function sb(extra: Record<string, string> = {}) {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, ...extra };
}
async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { headers: sb() });
  if (!res.ok) return [] as unknown as T;
  return await res.json();
}
async function rpc<T>(fn: string, args: object): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { ...sb(), 'Content-Type': 'application/json' }, body: JSON.stringify(args),
  });
  if (!res.ok) return [] as unknown as T;
  return await res.json();
}

interface ChatMsg { role: 'user' | 'assistant'; content: string }

// Quando o usuario abre o coach DENTRO de um post especifico, manda o foco:
// o texto que a IA gerou pra aquele post e o segmento dele. O agente ancora o
// feedback nele em vez de falar no geral.
interface Focus {
  quote?: string;
  caption?: string;
  editorial_slug?: string | null;
  platform?: string | null;
  target_avatar?: string | null;
}

// ---------------------------------------------------------------------------
// CONTEXTO REAL do usuário — é o que ancora o agente nos dados.
// ---------------------------------------------------------------------------
async function loadContext(userId: string): Promise<string> {
  const [reviews, segs, learnings] = await Promise.all([
    // últimas correções reais (o que a IA escreveu × o que você deixou)
    get<Array<{ quote_original: string; quote_final: string; caption_original: string; caption_final: string; quote_changed: boolean; caption_changed: boolean }>>(
      `/ai_reviews?user_id=eq.${userId}&changed=eq.true&order=created_at.desc&limit=6&select=quote_original,quote_final,caption_original,caption_final,quote_changed,caption_changed`,
    ),
    rpc<Array<{ editorial_slug: string; platform: string; target_avatar: string; texto: { acuracia: number | null }; legenda: { acuracia: number | null }; imagem: { acuracia: number | null }; destravada: boolean }>>(
      'ai_segment_status', { p_user_id: userId },
    ),
    get<Array<{ texto: string; facet: string; editorial_slug: string | null; platform: string | null; target_avatar: string | null; evidencias: number }>>(
      `/ai_learnings?user_id=eq.${userId}&ativo=eq.true&order=evidencias.desc&limit=15&select=texto,facet,editorial_slug,platform,target_avatar,evidencias`,
    ),
  ]);

  const lines: string[] = [];

  if (reviews.length) {
    lines.push('=== SUAS CORRECOES RECENTES (o que a IA escreveu -> o que voce deixou) ===');
    for (const r of reviews) {
      if (r.quote_changed) lines.push(`FRASE: "${r.quote_original}" -> "${r.quote_final}"`);
      if (r.caption_changed) lines.push(`LEGENDA: "${(r.caption_original ?? '').slice(0, 120)}..." -> "${(r.caption_final ?? '').slice(0, 120)}..."`);
    }
    lines.push('');
  }

  if (segs.length) {
    lines.push('=== PRECISAO POR CONJUNTO (editoria · plataforma · alvo) ===');
    for (const s of segs) {
      const f = (v: number | null) => (v === null ? 'N/A' : `${v}%`);
      lines.push(`${s.editorial_slug} · ${s.platform} · ${s.target_avatar}: texto ${f(s.texto.acuracia)}, legenda ${f(s.legenda.acuracia)}, imagem ${f(s.imagem.acuracia)}${s.destravada ? ' [LIBERADO]' : ''}`);
    }
    lines.push('');
  }

  if (learnings.length) {
    lines.push('=== LICOES QUE JA ESTAO ATIVAS (nao proponha repetido) ===');
    for (const l of learnings) {
      const alcance = l.editorial_slug || l.platform || l.target_avatar
        ? ` [${[l.editorial_slug, l.platform, l.target_avatar].filter(Boolean).join('·')}]` : ' [global]';
      lines.push(`- (${l.facet})${alcance} ${l.texto}`);
    }
    lines.push('');
  }

  if (!lines.length) return 'O usuario ainda nao tem correcoes nem licoes. Ajude-o a articular o que quer da voz da IA.';
  return lines.join('\n');
}

function focusBlock(f?: Focus): string {
  if (!f || (!f.quote && !f.caption)) return '';
  const seg = [f.editorial_slug, f.platform, f.target_avatar].filter(Boolean).join(' · ');
  const lines = ['=== O POST QUE O USUARIO ESTA AVALIANDO AGORA ==='];
  if (seg) lines.push(`Conjunto: ${seg}`);
  if (f.quote) lines.push(`Frase gerada: "${f.quote}"`);
  if (f.caption) lines.push(`Legenda gerada: "${f.caption.slice(0, 400)}"`);
  lines.push('O feedback do usuario e SOBRE este post. Ancore nele: aponte o que');
  lines.push('nesta frase/legenda causou o problema, e proponha a licao pra corrigir.');
  lines.push('Se o problema e claramente daquele conjunto, use o scope dele.');
  lines.push('');
  return lines.join('\n') + '\n';
}

function systemPrompt(ctx: string, focus?: Focus): string {
  return [
    'Voce e o "coach de voz" da Bee Consulting: ajuda o usuario a corrigir os erros',
    'de geracao da IA CONVERSANDO, e destila regras dessa conversa.',
    '',
    'Voce enxerga os DADOS REAIS do usuario abaixo. Use-os: aponte padroes concretos',
    '("nas ultimas 4 frases voce cortou o adverbio inicial"), nao generalidades.',
    '',
    focusBlock(focus),
    ctx,
    '',
    '=== COMO AGIR ===',
    '- Converse em portugues, direto e curto. Uma pergunta boa vale mais que um sermao.',
    '- Quando VOCE identificar uma regra clara e GENERALIZAVEL, proponha como licao.',
    '- NUNCA invente regra de um comentario vago. Sem regra clara, so converse (proposals vazio).',
    '- Nao proponha o que ja esta ativo (lista acima).',
    '- Cada licao tem uma FACETA: "texto" (a frase da imagem), "legenda" (a caption),',
    '  "imagem" (a imagem gerada).',
    '- E um ALCANCE: se o usuario falou de um conjunto especifico ("pro incomodado no',
    '  instagram"), preencha o scope; se falou geral, deixe scope vazio (global).',
    '',
    '=== SAIDA (JSON puro, sem markdown) ===',
    '{',
    '  "reply": "sua resposta conversacional",',
    '  "proposals": [',
    '    { "texto": "a regra em 1 frase imperativa (max 120 chars)",',
    '      "categoria": "voz|estrutura|lexico|tom|tamanho",',
    '      "facet": "texto|legenda|imagem",',
    '      "scope": { "editorial_slug": null, "platform": null, "target_avatar": null } }',
    '  ]',
    '}',
    '- proposals pode ser []. Prefira 0-2 propostas por resposta: qualidade > volume.',
    '- scope: use os slugs que aparecem nos dados (platform "linkedin"/"instagram",',
    '  target_avatar "identificado"/"incomodado"/"ambos"). null = qualquer.',
  ].join('\n');
}

async function callGemini(apiKey: string, sys: string, messages: ChatMsg[]): Promise<string> {
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
              generationConfig: {
                temperature: 0.5,
                // thinking models gastam desse orcamento; folga p/ nao truncar o JSON
                maxOutputTokens: 4000,
                responseMimeType: 'application/json',
              },
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

interface Proposal {
  texto: string; categoria: string; facet: string;
  scope: { editorial_slug: string | null; platform: string | null; target_avatar: string | null };
}

// Fecha um JSON truncado (thinking models as vezes cortam a saida).
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

function parse(raw: string): { reply: string; proposals: Proposal[] } {
  const cleaned = (raw ?? '').trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  let p: { reply?: string; proposals?: unknown };
  try {
    p = JSON.parse(cleaned);
  } catch {
    // tenta fechar o JSON truncado; se ainda falhar, extrai so o "reply" com
    // regex — NUNCA joga o JSON cru na cara do usuario.
    try {
      p = JSON.parse(closeTruncated(cleaned));
    } catch {
      const m = cleaned.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const reply = m ? m[1].replace(/\\"/g, '"').replace(/\\n/g, ' ') : 'Não consegui formular agora — pode repetir de outro jeito?';
      return { reply, proposals: [] };
    }
  }
  const proposals: Proposal[] = Array.isArray(p.proposals)
    ? (p.proposals as Array<Record<string, unknown>>)
        .filter((x) => typeof x?.texto === 'string' && (x.texto as string).trim())
        .slice(0, 3)
        .map((x) => {
          const sc = (x.scope ?? {}) as Record<string, unknown>;
          return {
            texto: String(x.texto).trim().slice(0, 200),
            categoria: ['voz', 'estrutura', 'lexico', 'tom', 'tamanho'].includes(x.categoria as string) ? x.categoria as string : 'voz',
            facet: ['texto', 'legenda', 'imagem'].includes(x.facet as string) ? x.facet as string : 'texto',
            scope: {
              editorial_slug: (sc.editorial_slug as string) || null,
              platform: (sc.platform as string) || null,
              target_avatar: (sc.target_avatar as string) || null,
            },
          };
        })
    : [];
  return { reply: typeof p.reply === 'string' && p.reply.trim() ? p.reply.trim() : 'Certo.', proposals };
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

    const { messages, focus } = await req.json() as { messages?: ChatMsg[]; focus?: Focus };
    if (!Array.isArray(messages) || messages.length === 0) return errorResponse('messages obrigatorio', 400);
    // só o histórico recente vai pro modelo (custo + foco)
    const recent = messages.slice(-12);

    const apiKey = await getUserGeminiKey(userId);
    if (!apiKey) return errorResponse('Chave Gemini nao configurada', 400);

    const ctx = await loadContext(userId);
    const raw = await callGemini(apiKey, systemPrompt(ctx, focus), recent);
    const { reply, proposals } = parse(raw);

    return jsonResponse({ success: true, reply, proposals });
  } catch (e) {
    console.error('[voice-coach]', e);
    return errorResponse('Erro no coach de voz', 500, (e as Error).message);
  }
});
